import { safeFetchPage, UrlError, requestJson, checkUrl } from './engine/http.js';
import { searchWeb } from './engine/search.js';
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
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'about', 'into']);
const tokensOf = (s) => normalizeText(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export const queryWords = (s) => [...new Set(tokensOf(s).filter((w) => (w.length >= 3 || /\d/.test(w)) && !STOP_WORDS.has(w)))];

export function wordsFound(words, text) {
  const tokens = new Set(tokensOf(text));
  const list = [...tokens];
  return words.filter((w) => tokens.has(w) || tokens.has(`${w}s`) || tokens.has(`${w}es`) || (w.length >= 5 && list.some((t) => t.startsWith(w)))).length;
}

export const pageMatches = (words, text) => wordsFound(words, text) >= Math.min(words.length, Math.max(2, Math.round(words.length * 0.7)));
export const resultMatches = (words, r) => wordsFound(words, `${r.title || ''} ${r.org || ''} ${r.url || ''}`) >= Math.ceil(words.length / 2);

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

async function runExtraction({ mode, input, env, store, fetchImpl, fetchPage, now, uid }) {
  if (mode === 'text') {
    const out = await extractOpportunity({ docs: [{ url: null, title: null, text: input }], env, store, fetchImpl, now });
    return out;
  }
  if (mode === 'url') {
    const page = await fetchPage(input);
    if (!page.text || page.text.length < 120) return { error: 'empty_page' };
    return extractOpportunity({ docs: [page], env, store, fetchImpl, now });
  }
  const listing = await findListing(input, env, fetchImpl).catch(() => null);
  if (listing) return { result: listing, attempts: [{ provider: 'listing', outcome: 'ok' }] };
  const live = await store.take([
    { bucket: 'live_search:all', window: 'day', limit: capFrom(env, 'LIVE_SEARCH_DAILY_CAP', 40) },
    { bucket: `user:${uid}:search`, window: 'day', limit: capFrom(env, 'USER_SEARCH_DAILY_CAP', 10) },
  ]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  if (!live.ok) return { search_limited: live.blocked };
  const found = await searchWeb(`${input} apply deadline eligibility`, { env, store, fetchImpl, now, maxResults: 5, range: 'year', withContent: true, cacheSeconds: 86400, fetchPage });
  if (found.unavailable) return { unavailable: true, attempts: found.attempts, stage: 'search' };
  const words = queryWords(input);
  const ranked = found.results
    .map((r) => ({ r, text: `${r.title || ''} ${r.url || ''} ${r.content || ''} ${String(r.raw_content || '').slice(0, 4000)}` }))
    .filter((x) => pageMatches(words, x.text))
    .map((x) => ({ r: x.r, score: wordsFound(words, x.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ r }) => ({ url: r.url, title: r.title, text: r.raw_content || r.content }));
  if (!ranked.length) return { error: 'nothing_found' };
  const out = await extractOpportunity({ docs: ranked, hint: input, env, store, fetchImpl, now });
  if (out.attempts) out.attempts = [...found.attempts, ...out.attempts];
  if (out.result && !resultMatches(words, out.result)) return { error: 'nothing_found', attempts: out.attempts };
  return out;
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
  const input = typeof data.input === 'string' ? data.input.replace(/\r/g, '').trim() : '';
  if (input.length < 3) return fail(422, 'empty', 'Paste some text, a link or an opportunity name first.');
  if (input.length > MAX_TEXT) return fail(413, 'too_large', 'That text is too long. Paste at most 20,000 characters.');
  const mode = ['text', 'url', 'name'].includes(data.mode) ? data.mode : detectMode(input);
  if (mode === 'url') {
    try { checkUrl(input); } catch (e) { return fail(422, e.code || 'bad_url', e.message); }
  }
  const store = deps.store || makeStore(env, fetchImpl);
  const burst = await store.take([{ bucket: `user:${user.id}:requests`, window: 'hour', limit: capFrom(env, 'USER_REQUESTS_HOURLY_CAP', 40) }]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  if (!burst.ok) return burst.blocked === 'store_unavailable' ? fail(503, 'unavailable', 'AI extraction is temporarily unavailable. Please try again later.') : fail(429, 'rate_limited', 'You have made many requests in the last hour. Please wait a little.', { retry_after: 600 });
  const key = hashKey('extract', 'v2', mode, mode === 'text' ? normalizeText(input) : input.toLowerCase());
  const ttl = mode === 'name' ? 86400 : 7 * 86400;
  const cached = await store.cacheGet('extract', key, ttl).catch(() => null);
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
      try { return await runExtraction({ mode, input, env, store, fetchImpl, fetchPage, now, uid: user.id }); } finally { release(); }
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
  if (out.result) {
    await store.cachePut('extract', key, { result: out.result }).catch(() => {});
    log('ok', { mode, provider: out.result.provider, tried });
    return reply(200, { result: out.result, mode, cached: false });
  }
  log(out.error || (out.unavailable ? 'unavailable' : out.search_limited ? 'search_limited' : 'failed'), { mode, tried });
  if (out.search_limited) return fail(429, 'search_limited', 'Live web search has reached today\'s free limit. Paste the text or a link instead, or try again tomorrow.', { retry_after: 3600 });
  if (out.unavailable) return fail(503, 'unavailable', out.stage === 'search' ? 'Live web search is temporarily unavailable (the free limits are used up). Paste the text or a link instead.' : 'AI extraction is temporarily unavailable (the free limits are used up). Please try again later.');
  if (out.error === 'empty_page') return fail(422, 'empty_page', 'That page has almost no readable text. Paste the text instead.');
  if (out.error === 'nothing_found') return fail(404, 'nothing_found', 'No web page about that opportunity was found. Try a fuller name, or paste a link.');
  return fail(422, 'no_text', 'There is not enough text to read. Paste more of the announcement.');
}
