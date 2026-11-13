import { capFrom, hashKey, secondsUntil } from './store.js';
import { mapLimit, requestJson, safeFetchPage } from './http.js';

export const SEARCH_ORDER = ['tavily', 'serper', 'exa'];
const EXCLUDED = ['facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'youtube.com', 'pinterest.com', 'reddit.com', 'quora.com', 'threads.net', 't.me', 'medium.com'];
const TIME_RANGE = { day: ['day', 'qdr:d', 1], week: ['week', 'qdr:w', 7], month: ['month', 'qdr:m', 31], year: ['year', 'qdr:y', 366] };

export function classifySearch(provider, status, text = '', network = '') {
  const body = String(text).toLowerCase();
  if (network === 'timeout' || network === 'network' || status === 0) return 'temporary';
  if (status >= 200 && status < 300) return 'ok';
  const creditWords = /credit|not enough|balance|quota|usage limit|plan limit|exceed|payment|billing/.test(body);
  if (provider === 'tavily') {
    if (status === 432 || status === 433) return 'quota';
    if (status === 429) return 'rate';
    if (status === 401 || status === 403) return 'auth';
    if (status === 400 || status === 422) return 'invalid';
  }
  if (provider === 'serper') {
    if ((status === 400 || status === 402 || status === 403) && creditWords) return 'quota';
    if (status === 429) return 'rate';
    if (status === 401 || status === 403) return 'auth';
    if (status === 400) return 'invalid';
  }
  if (provider === 'exa') {
    if (status === 402 || ((status === 401 || status === 403) && creditWords)) return 'quota';
    if (status === 429) return 'rate';
    if (status === 401 || status === 403) return 'auth';
    if (status === 400 || status === 422) return 'invalid';
  }
  if (status === 429) return 'rate';
  if (status >= 500) return 'temporary';
  return 'invalid';
}

export function cooldownFor(provider, outcome, now = Date.now()) {
  if (outcome === 'quota') return provider === 'serper' ? 7 * 86400 : secondsUntil('next_month', now);
  if (outcome === 'rate') return 60;
  if (outcome === 'auth') return 3600;
  if (outcome === 'temporary') return 30;
  return 0;
}

export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|ref_src|igshid)/i.test(k)) u.searchParams.delete(k);
    return `${u.protocol}//${u.hostname}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return '';
  }
}

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const excluded = (url, extra) => {
  const host = hostOf(url);
  return !host || [...EXCLUDED, ...extra].some((d) => host === d || host.endsWith('.' + d));
};

export function dedupeResults(results, extraExcluded = []) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (!r || !/^https?:\/\//i.test(r.url || '') || excluded(r.url, extraExcluded)) continue;
    const key = normalizeUrl(r.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

const clip = (s, n) => String(s || '').replace(/\s+\n/g, '\n').slice(0, n);

async function tavily({ key, query, max, range, withContent, extraExcluded, fetchImpl }) {
  const res = await requestJson(fetchImpl, 'https://api.tavily.com/search', {
    headers: { Authorization: `Bearer ${key}` },
    body: {
      query, search_depth: 'basic', max_results: max, include_raw_content: withContent ? 'text' : false,
      include_published_date: true, exclude_domains: [...EXCLUDED, ...extraExcluded], ...(range ? { time_range: TIME_RANGE[range][0] } : {}),
    },
    timeout: 45000,
  });
  const outcome = classifySearch('tavily', res.status, res.text, res.error);
  if (outcome !== 'ok') return { outcome, status: res.status };
  const list = Array.isArray(res.data && res.data.results) ? res.data.results : [];
  return {
    outcome,
    results: list.map((r) => ({ url: String(r.url || ''), title: clip(r.title, 300), content: clip(r.content, 2000), raw_content: clip(r.raw_content, 60000), published_date: r.published_date || null })),
  };
}

async function serper({ key, query, max, range, withContent, extraExcluded, fetchImpl, fetchPage }) {
  const res = await requestJson(fetchImpl, 'https://google.serper.dev/search', {
    headers: { 'X-API-KEY': key },
    body: { q: query, num: Math.min(10, max), ...(range ? { tbs: TIME_RANGE[range][1] } : {}) },
    timeout: 20000,
  });
  const outcome = classifySearch('serper', res.status, res.text, res.error);
  if (outcome !== 'ok') return { outcome, status: res.status };
  const organic = Array.isArray(res.data && res.data.organic) ? res.data.organic : [];
  const results = dedupeResults(organic.map((r) => ({ url: String(r.link || ''), title: clip(r.title, 300), content: clip(r.snippet, 2000), raw_content: '', published_date: r.date || null })), extraExcluded);
  if (withContent && fetchPage) {
    await mapLimit(results.slice(0, Math.min(results.length, 8)), 4, async (r) => {
      try { r.raw_content = clip((await fetchPage(r.url)).text, 60000); } catch { r.raw_content = ''; }
    });
  }
  return { outcome, results };
}

async function exa({ key, query, max, range, withContent, extraExcluded, fetchImpl, now }) {
  const since = range ? new Date(now - TIME_RANGE[range][2] * 86400000).toISOString() : undefined;
  const res = await requestJson(fetchImpl, 'https://api.exa.ai/search', {
    headers: { 'x-api-key': key },
    body: {
      query, type: 'auto', numResults: Math.min(10, max), excludeDomains: [...EXCLUDED, ...extraExcluded],
      ...(since ? { startPublishedDate: since } : {}), ...(withContent ? { contents: { text: { maxCharacters: 8000 } } } : {}),
    },
    timeout: 30000,
  });
  const outcome = classifySearch('exa', res.status, res.text, res.error);
  if (outcome !== 'ok') return { outcome, status: res.status };
  const list = Array.isArray(res.data && res.data.results) ? res.data.results : [];
  return {
    outcome,
    results: list.map((r) => ({ url: String(r.url || ''), title: clip(r.title, 300), content: clip(r.text, 500), raw_content: clip(r.text, 60000), published_date: r.publishedDate || null })),
  };
}

function fitForCache(payload) {
  if (!payload.results.length || JSON.stringify(payload).length <= 180000) return payload;
  const each = Math.floor(150000 / payload.results.length);
  return { ...payload, results: payload.results.map((r) => ({ ...r, raw_content: String(r.raw_content || '').slice(0, each) })) };
}

const RUNNERS = { tavily, serper, exa };
const KEYS = { tavily: 'TAVILY_API_KEY', serper: 'SERPER_API_KEY', exa: 'EXA_API_KEY' };
const CAPS = { tavily: ['TAVILY_MONTHLY_CAP', 'month', 1000], serper: ['SERPER_TOTAL_CAP', 'total', 2500], exa: ['EXA_MONTHLY_CAP', 'month', 900] };

export async function searchWeb(query, {
  env = process.env, store, fetchImpl = fetch, now = () => Date.now(), maxResults = 10, range = 'month',
  withContent = true, useCache = true, cacheSeconds = 86400, excludeDomains = [], fetchPage = safeFetchPage, gate = null,
} = {}) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 380);
  if (q.length < 2) return { provider: null, results: [], attempts: [], invalid: true };
  const max = Math.max(1, Math.min(15, maxResults));
  const cacheKey = hashKey('search', q.toLowerCase(), max, range || '', withContent);
  if (useCache) {
    const hit = await store.cacheGet('search', cacheKey, cacheSeconds).catch(() => null);
    if (hit && Array.isArray(hit.results)) return { ...hit, cached: true, attempts: [] };
  }
  if (gate) {
    const pass = await gate();
    if (!pass || !pass.ok) return { provider: null, results: [], attempts: [], limited: (pass && pass.blocked) || 'limit' };
  }
  const state = await store.stateGet().catch(() => ({}));
  const attempts = [];
  for (const name of SEARCH_ORDER) {
    const key = String(env[KEYS[name]] || '').trim();
    if (!key) { attempts.push({ provider: name, outcome: 'not_configured' }); continue; }
    if (state[name] && state[name].until > now()) { attempts.push({ provider: name, outcome: 'cooldown', reason: state[name].reason }); continue; }
    const [capName, window, fallback] = CAPS[name];
    const taken = await store.take([{ bucket: `search:${name}`, window, limit: capFrom(env, capName, fallback) }]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
    if (!taken.ok) { attempts.push({ provider: name, outcome: taken.blocked === 'store_unavailable' ? 'store_unavailable' : 'cap_reached' }); continue; }
    let res;
    try {
      res = await RUNNERS[name]({ key, query: q, max, range: TIME_RANGE[range] ? range : null, withContent, extraExcluded: excludeDomains, fetchImpl, fetchPage, now: now() });
    } catch {
      res = { outcome: 'temporary' };
    }
    attempts.push({ provider: name, outcome: res.outcome, status: res.status });
    if (res.outcome === 'ok') {
      const results = dedupeResults(res.results, excludeDomains).slice(0, max).map((r) => ({ ...r, provider: name }));
      const payload = { provider: name, query: q, results };
      if (useCache) await store.cachePut('search', cacheKey, fitForCache(payload)).catch(() => {});
      return { ...payload, attempts, cached: false };
    }
    const seconds = cooldownFor(name, res.outcome, now());
    if (seconds) {
      await store.stateSet(name, seconds, res.outcome).catch(() => {});
      state[name] = { until: now() + seconds * 1000, reason: res.outcome };
    }
    if (res.outcome === 'invalid') return { provider: null, results: [], attempts, invalid: true };
  }
  return { provider: null, results: [], attempts, unavailable: true };
}

export async function readRendered(url, { env = process.env, store, fetchImpl = fetch, now = () => Date.now(), cacheSeconds = 86400 } = {}) {
  const key = String(env.EXA_API_KEY || '').trim();
  const address = normalizeUrl(url);
  if (!key || !address) return { outcome: 'not_configured' };
  const cacheKey = hashKey('page', address);
  const hit = await store.cacheGet('search', cacheKey, cacheSeconds).catch(() => null);
  if (hit && typeof hit.text === 'string') return { outcome: 'ok', cached: true, ...hit };
  const state = await store.stateGet().catch(() => ({}));
  if (state.exa && state.exa.until > now()) return { outcome: 'cooldown' };
  const [capName, window, fallback] = CAPS.exa;
  const taken = await store.take([{ bucket: 'search:exa', window, limit: capFrom(env, capName, fallback) }]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  if (!taken.ok) return { outcome: taken.blocked === 'store_unavailable' ? 'store_unavailable' : 'cap_reached' };
  const res = await requestJson(fetchImpl, 'https://api.exa.ai/contents', { headers: { 'x-api-key': key }, body: { urls: [url], text: { maxCharacters: 8000 } }, timeout: 15000 });
  const outcome = classifySearch('exa', res.status, res.text, res.error);
  if (outcome !== 'ok') {
    const seconds = cooldownFor('exa', outcome, now());
    if (seconds) await store.stateSet('exa', seconds, outcome).catch(() => {});
    return { outcome, status: res.status };
  }
  const first = Array.isArray(res.data && res.data.results) ? res.data.results[0] : null;
  const page = { url, title: first ? clip(first.title, 300) : '', text: first ? clip(first.text, 60000) : '' };
  if (page.text.trim().length >= 120) await store.cachePut('search', cacheKey, page).catch(() => {});
  return { outcome: page.text.trim().length >= 120 ? 'ok' : 'empty', ...page };
}
