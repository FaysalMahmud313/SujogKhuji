import { safeFetchPage, UrlError, requestJson, checkUrl } from './engine/http.js';
import { lookupOpportunity } from './engine/lookup.js';
import { readRendered } from './engine/search.js';
import { extractOpportunity, normalizeText } from './engine/extract.js';
import { capFrom, hashKey, makeStore } from './engine/store.js';

const MAX_BODY = 40000;
const MAX_TEXT = 20000;
const inflight = new Map();
let running = 0;
const waiting = [];

const reply = (status, body, headers = {}) => ({ status, body, headers });
const fail = (status, code, message, extra = {}) => reply(status, { error: code, message, ...extra }, extra.retry_after ? { 'Retry-After': String(extra.retry_after) } : {});
const log = (outcome, extra = {}) => console.log(JSON.stringify({ event: 'extract', outcome, ...extra }));

async function slot(limit) {
  if (running < limit) { running += 1; return; }
  await new Promise((resolve) => waiting.push(resolve));
  running += 1;
}
function release() {
  running -= 1;
  const next = waiting.shift();
  if (next) next();
}

export function detectMode(input) {
  const v = String(input || '').trim();
  if (/^https?:\/\/\S+$/i.test(v)) return 'url';
  if (!/\n/.test(v) && v.length <= 150 && v.split(/\s+/).length <= 16) return 'name';
  return 'text';
}

async function verifyUser(token, env, fetchImpl) {
  const base = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !key || !/^[A-Za-z0-9._-]{20,4096}$/.test(token)) return null;
  const res = await requestJson(fetchImpl, `${base}/auth/v1/user`, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${token}` }, timeout: 6000 });
  const u = res.status === 200 ? res.data : null;
  if (!u || typeof u.id !== 'string' || !(u.email_confirmed_at || u.confirmed_at)) return null;
  return { id: u.id };
}

const SAFE_WORD = /[^\p{L}\p{N} &.'-]/gu;
const MISS_SECONDS = 3 * 3600;

async function findListing(name, env, fetchImpl) {
  const base = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '').trim();
  const words = name.replace(SAFE_WORD, ' ').split(/\s+/).filter((w) => w.length >= 3).slice(0, 4);
  if (!base || !key || !words.length) return null;
  const filter = words.map((w) => `title.ilike.*${encodeURIComponent(w.replace(/[*,()]/g, ''))}*`).join(',');
  const headers = { apikey: key };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  const res = await requestJson(fetchImpl, `${base}/rest/v1/opportunities?select=*&and=(${filter})&limit=5`, { method: 'GET', headers, timeout: 6000 });
  if (res.status !== 200 || !Array.isArray(res.data) || !res.data.length) return null;
  const want = normalizeText(name);
  const best = res.data.find((o) => normalizeText(o.title).includes(want)) || (res.data.length === 1 ? res.data[0] : null);
  if (!best) return null;
  return {
    title: best.title, org: best.org, category: best.category, country: best.country, region: best.region, deadline: best.deadline,
    funding: best.funding, pay: best.pay, exp_min: best.exp_min, exp_max: best.exp_max, level: best.level, job_type: best.job_type,
    work_mode: best.work_mode, education: best.education, field: best.field, org_type: best.org_type,
    steps_json: best.deadline ? [{ t: 'Apply', d: best.deadline }] : [], url: best.url, source: best.source,
    sources: [{ url: best.url, title: best.title }], evidence: best.evidence || {}, warnings: [], is_opportunity: true,
    provider: 'listing', listing_id: best.id, checked_at: new Date().toISOString(),
  };
}

async function runExtraction({ mode, input, env, store, fetchImpl, fetchPage, now, uid, skipListing, lang }) {
  if (mode === 'text') {
    const out = await extractOpportunity({ docs: [{ url: null, title: null, text: input }], env, store, fetchImpl, now });
    return out;
  }
  if (mode === 'url') {
    let page = await fetchPage(input);
    if (!page.text || page.text.trim().length < 120) {
      const got = await readRendered(input, { env, store, fetchImpl, now }).catch(() => null);
      if (got && got.outcome === 'ok') page = { url: input, title: got.title || page.title || null, text: got.text };
    }
    if (!page.text || page.text.trim().length < 120) return { error: 'empty_page' };
    return extractOpportunity({ docs: [page], env, store, fetchImpl, now });
  }
  const listing = skipListing ? null : await findListing(input, env, fetchImpl).catch(() => null);
  if (listing) {
    const lookup = { query: input, found: true, answer: '', memory: '', results: [listing], sources: [], counts: { searches: 0, reads: 0, ai_calls: 0 }, model: null, checked_at: listing.checked_at };
    return { lookup, attempts: [{ provider: 'listing', outcome: 'ok' }] };
  }
  const allowed = await store.take([{ bucket: `user:${uid}:lookup`, window: 'day', limit: capFrom(env, 'USER_LOOKUP_DAILY_CAP', 5) }]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  if (!allowed.ok) return allowed.blocked === 'store_unavailable' ? { unavailable: true, stage: 'ai', attempts: [] } : { lookup_limited: true, attempts: [] };
  const gate = () => store.take([
    { bucket: 'live_search:all', window: 'day', limit: capFrom(env, 'LIVE_SEARCH_DAILY_CAP', 40) },
    { bucket: `user:${uid}:search`, window: 'day', limit: capFrom(env, 'USER_SEARCH_DAILY_CAP', 10) },
  ]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  return lookupOpportunity({ query: input, lang, env, store, fetchImpl, fetchPage, now, gate });
}

export async function handleExtract({ method, headers = {}, body = '', env = process.env, deps = {} }) {
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now || (() => Date.now());
  const fetchPage = deps.fetchPage || safeFetchPage;
  if (method !== 'POST') return fail(405, 'method', 'Use POST.');
  const head = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v ?? '')]));
  if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BODY) return fail(413, 'too_large', 'That text is too long. Paste at most 20,000 characters.');
  const token = (head.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const user = token ? await verifyUser(token, env, fetchImpl).catch(() => null) : null;
  if (!user) return fail(401, 'sign_in', 'Sign in with a verified email to use AI extraction.');
  let data;
  try { data = JSON.parse(body); } catch { return fail(400, 'bad_json', 'The request was not understood.'); }
  const limits = { lookups_per_day: capFrom(env, 'USER_LOOKUP_DAILY_CAP', 5) };
  if (data && data.mode === 'limits') return reply(200, { limits });
  const input =typeof data.input === 'string' ? data.input.replace(/\r/g, '').trim() : '';
  if (input.length < 3) return fail(422, 'empty', 'Paste some text, a link or an opportunity name first.');
  if (input.length > MAX_TEXT) return fail(413, 'too_large', 'That text is too long. Paste at most 20,000 characters.');
  const mode = ['text', 'url', 'name'].includes(data.mode) ? data.mode : detectMode(input);
  if (mode === 'url') {
    try { checkUrl(input); } catch (e) { return fail(422, e.code || 'bad_url', e.message); }
  }
  const store = deps.store || makeStore(env, fetchImpl);
  const burst = await store.take([{ bucket: `user:${user.id}:requests`, window: 'hour', limit: capFrom(env, 'USER_REQUESTS_HOURLY_CAP', 40) }]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  if (!burst.ok) return burst.blocked === 'store_unavailable' ? fail(503, 'unavailable', 'AI extraction is temporarily unavailable. Please try again later.') : fail(429, 'rate_limited', 'You have made many requests in the last hour. Please wait a little.', { retry_after: 600 });
  const skipListing = mode === 'name' && data.skip_listing === true;
  const lang = data.lang === 'bn' ? 'bn' : 'en';
  const key = hashKey('extract', 'v3', mode, skipListing ? 'web' : 'any', mode === 'name' ? lang : '', mode === 'text' ? normalizeText(input) : input.toLowerCase().replace(/\s+/g, ' '));
  const ttl = mode === 'name' ? 86400 : 7 * 86400;
  const cached = await store.cacheGet('extract', key, ttl).catch(() => null);
  if (cached && cached.lookup && (cached.lookup.found || now() - Date.parse(cached.lookup.checked_at) < MISS_SECONDS * 1000)) {
    log('cache', { mode });
    return reply(200, { result: cached.lookup.results[0] || null, lookup: cached.lookup, mode, cached: true, limits });
  }
  if (cached && cached.result) { log('cache', { mode }); return reply(200, { result: cached.result, mode, cached: true }); }
  const limited = await store.take([
    { bucket: `user:${user.id}:extract`, window: 'hour', limit: capFrom(env, 'USER_EXTRACT_HOURLY_CAP', 10) },
    { bucket: `user:${user.id}:extract`, window: 'day', limit: capFrom(env, 'USER_EXTRACT_DAILY_CAP', 30) },
  ]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  if (!limited.ok) {
    if (limited.blocked === 'store_unavailable') return fail(503, 'unavailable', 'AI extraction is temporarily unavailable. Please try again later.');
    return fail(429, 'rate_limited', 'You have reached your AI extraction limit for now. Please try again later.', { retry_after: 3600 });
  }
  const flightKey = `${user.id}:${key}`;
  if (!inflight.has(flightKey)) {
    inflight.set(flightKey, (async () => {
      await slot(capFrom(env, 'EXTRACT_CONCURRENCY', 3));
      try { return await runExtraction({ mode, input, env, store, fetchImpl, fetchPage, now, uid: user.id, skipListing, lang }); } finally { release(); }
    })().finally(() => inflight.delete(flightKey)));
  }
  let out;
  try {
    out = await inflight.get(flightKey);
  } catch (e) {
    if (e instanceof UrlError) return fail(422, e.code, e.message);
    log('error', { mode, kind: e && e.name });
    return fail(500, 'failed', 'Something went wrong while reading that. Please try again.');
  }
  const tried = (out.attempts || []).map((a) => `${a.provider}:${a.outcome}`).join(',');
  if (out.lookup) {
    await store.cachePut('extract', key, { lookup: out.lookup }).catch(() => {});
    log(out.lookup.found ? 'ok' : 'nothing_found', { mode, results: out.lookup.results.length, ...out.lookup.counts, tried });
    return reply(200, { result: out.lookup.results[0] || null, lookup: out.lookup, mode, cached: false, limits });
  }
  if (out.result) {
    await store.cachePut('extract', key, { result: out.result }).catch(() => {});
    log('ok', { mode, provider: out.result.provider, tried });
    return reply(200, { result: out.result, mode, cached: false });
  }
  log(out.error || (out.unavailable ? 'unavailable' : out.search_limited ? 'search_limited' : out.lookup_limited ? 'lookup_limited' : 'failed'), { mode, tried });
  if (out.lookup_limited) return fail(429, 'lookup_limited', `You have used all ${limits.lookups_per_day} of today's live AI searches. They start again at 6 AM Bangladesh time. Paste the text or a link instead.`, { retry_after: 3600, limits });
  if (out.search_limited) return fail(429, 'search_limited', 'Live web search has reached today\'s free limit. Paste the text or a link instead, or try again tomorrow.', { retry_after: 3600 });
  if (out.unavailable) return fail(503, 'unavailable', out.stage === 'search' ? 'Live web search is temporarily unavailable (the free limits are used up). Paste the text or a link instead.' : 'AI extraction is temporarily unavailable (the free limits are used up). Please try again later.');
  if (out.error === 'empty_page') return fail(422, 'empty_page', 'That page has almost no readable text. Paste the text instead.');
  return fail(422, 'no_text', 'There is not enough text to read. Paste more of the announcement.');
}
