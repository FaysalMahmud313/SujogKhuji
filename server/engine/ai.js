import { capFrom, secondsUntil } from './store.js';
import { requestJson } from './http.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = /^[A-Za-z0-9._:/-]{2,80}$/;

export function aiProviders(env = process.env) {
  const list = [];
  const groqKey = String(env.GROQ_API_KEY || '').trim();
  if (groqKey) {
    const main = String(env.GROQ_MODEL || 'openai/gpt-oss-120b').trim();
    const fast = String(env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b').trim();
    if (MODEL_NAME.test(main)) list.push({ id: 'groq', url: GROQ_URL, key: groqKey, model: main, cap: capFrom(env, 'GROQ_DAILY_CAP', 800), jsonMode: true, extra: /gpt-oss/.test(main) ? { reasoning_effort: 'low' } : {} });
    if (MODEL_NAME.test(fast) && fast !== main) list.push({ id: 'groq-fast', url: GROQ_URL, key: groqKey, model: fast, cap: capFrom(env, 'GROQ_FAST_DAILY_CAP', 800), jsonMode: true, extra: /gpt-oss/.test(fast) ? { reasoning_effort: 'low' } : {} });
  }
  const geminiKey = String(env.GEMINI_API_KEY || '').trim();
  if (geminiKey && String(env.GEMINI_BILLING_DISABLED || '').trim().toLowerCase() === 'yes') {
    const model = String(env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    if (MODEL_NAME.test(model)) list.push({ id: 'gemini', url: GEMINI_URL, key: geminiKey, model, cap: capFrom(env, 'GEMINI_DAILY_CAP', 200), jsonMode: false, extra: {} });
  }
  const routerKey = String(env.OPENROUTER_API_KEY || '').trim();
  if (routerKey) {
    const models = String(env.OPENROUTER_MODELS || 'nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free').split(',').map((m) => m.trim()).filter(Boolean);
    models.filter((m) => MODEL_NAME.test(m) && m.endsWith(':free')).slice(0, 3).forEach((model, i) => {
      list.push({ id: i ? `openrouter-${i + 1}` : 'openrouter', group: 'openrouter', url: OPENROUTER_URL, key: routerKey, model, cap: capFrom(env, 'OPENROUTER_DAILY_CAP', 45), jsonMode: true, extra: { reasoning: { enabled: false } }, headers: { 'HTTP-Referer': 'https://sujogkhuji.vercel.app', 'X-Title': 'SujogKhuji' } });
    });
  }
  const order = String(env.AI_ORDER || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (order.length) list.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
  return list;
}

export function rejectedPaidModels(env = process.env) {
  return String(env.OPENROUTER_MODELS || '').split(',').map((m) => m.trim()).filter((m) => m && !m.endsWith(':free'));
}

export function classifyAi(status, text = '', network = '') {
  const body = String(text).toLowerCase();
  if (network === 'timeout' || network === 'network' || status === 0) return 'temporary';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 402) return 'quota';
  if (status === 401 || status === 403) return /quota|limit|billing|credit/.test(body) ? 'quota' : 'auth';
  if (status === 404) return 'model_missing';
  if (status === 413) return 'too_large';
  if (status === 429) return /per day|per-day|daily|rpd|tpd|tokens per day|requests per day|quota|exhausted|free-models-per-day/.test(body) ? 'quota' : 'rate';
  if (status === 400 || status === 422) {
    if (/model.{0,40}(decommission|not found|does not exist|not supported|unavailable|deprecated)|unknown model|invalid model/.test(body)) return 'model_missing';
    if (/context|too (large|long)|maximum.{0,20}tokens|token limit|reduce the length/.test(body)) return 'too_large';
    return 'bad_request';
  }
  if (status >= 500) return 'temporary';
  return 'bad_request';
}

export function aiCooldown(outcome, retryAfter, now = Date.now()) {
  if (outcome === 'quota') return secondsUntil('next_day', now);
  if (outcome === 'rate') return Math.min(600, Math.max(20, Number(retryAfter) || 60));
  if (outcome === 'auth') return 3600;
  if (outcome === 'model_missing') return 86400;
  if (outcome === 'temporary') return 30;
  return 0;
}

export function parseJsonReply(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(s.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function callModel(p, { system, user, fetchImpl, maxTokens }) {
  const body = {
    model: p.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0,
    max_tokens: maxTokens,
    ...(p.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...p.extra,
  };
  const res = await requestJson(fetchImpl, p.url, { headers: { Authorization: `Bearer ${p.key}`, ...(p.headers || {}) }, body, timeout: 25000 });
  const outcome = classifyAi(res.status, res.text, res.error);
  if (outcome !== 'ok') {
    const retry = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
    return { outcome, status: res.status, retryAfter: retry };
  }
  const choice = res.data && Array.isArray(res.data.choices) ? res.data.choices[0] : null;
  const content = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
  if (!content) return { outcome: 'invalid_output', status: res.status };
  return { outcome: 'ok', content };
}

export async function completeJson({ system, user, validate, env = process.env, store, fetchImpl = fetch, now = () => Date.now(), maxAttempts = 3, maxTokens = 1800 }) {
  const providers = aiProviders(env);
  const attempts = [];
  if (!providers.length) return { unavailable: true, attempts: [{ provider: 'none', outcome: 'not_configured' }] };
  const state = await store.stateGet().catch(() => ({}));
  let called = 0;
  for (const p of providers) {
    if (called >= maxAttempts) break;
    const group = p.group ? `ai:group:${p.group}` : `ai:${p.id}`;
    const cool = state[`ai:${p.id}`] && state[`ai:${p.id}`].until > now() ? state[`ai:${p.id}`] : state[group];
    if (cool && cool.until > now()) { attempts.push({ provider: p.id, outcome: 'cooldown', reason: cool.reason }); continue; }
    const taken = await store.take([
      { bucket: 'ai:all', window: 'day', limit: capFrom(env, 'AI_DAILY_CAP', 600) },
      { bucket: group, window: 'day', limit: p.cap },
    ]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
    if (!taken.ok) {
      attempts.push({ provider: p.id, outcome: taken.blocked === 'store_unavailable' ? 'store_unavailable' : 'cap_reached' });
      if (taken.blocked === 'ai:all' || taken.blocked === 'store_unavailable') break;
      continue;
    }
    called += 1;
    let res;
    try { res = await callModel(p, { system, user, fetchImpl, maxTokens }); } catch { res = { outcome: 'temporary' }; }
    if (res.outcome === 'ok') {
      const parsed = parseJsonReply(res.content);
      const checked = parsed ? validate(parsed) : { ok: false, reason: 'not_json' };
      if (checked.ok) {
        attempts.push({ provider: p.id, outcome: 'ok' });
        return { provider: p.id, model: p.model, value: checked.value, attempts };
      }
      attempts.push({ provider: p.id, outcome: 'invalid_output', reason: checked.reason });
      continue;
    }
    attempts.push({ provider: p.id, outcome: res.outcome, status: res.status });
    const seconds = aiCooldown(res.outcome, res.retryAfter, now());
    if (seconds) {
      const target = res.outcome === 'quota' ? group : `ai:${p.id}`;
      await store.stateSet(target, seconds, res.outcome).catch(() => {});
      state[target] = { until: now() + seconds * 1000, reason: res.outcome };
    }
  }
  return { unavailable: true, attempts };
}
