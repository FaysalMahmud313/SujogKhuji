import { capFrom, makeStore } from './engine/store.js';
import { verifyUser } from './user.js';

const MAX_BODY = 12000;
const MAX_TEXT = 1000;
const FORM_URL = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]{20,120}\/formResponse$/;
const ENTRY = /^entry\.\d{3,12}$/;

const reply = (status, body, headers = {}) => ({ status, body, headers });
const fail = (status, code, message, extra = {}) => reply(status, { error: code, message, ...extra }, extra.retry_after ? { 'Retry-After': String(extra.retry_after) } : {});
const log = (outcome) => console.log(JSON.stringify({ event: 'feedback', outcome }));
const clean = (v) => (typeof v === 'string' ? v.replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, MAX_TEXT) : '');

export function formConfig(env) {
  const url = String(env.FEEDBACK_FORM_URL || '').trim();
  const entries = {
    problem: String(env.FEEDBACK_ENTRY_PROBLEM || '').trim(),
    features: String(env.FEEDBACK_ENTRY_FEATURES || '').trim(),
    email: String(env.FEEDBACK_ENTRY_EMAIL || '').trim(),
  };
  if (!FORM_URL.test(url) || !Object.values(entries).every((e) => ENTRY.test(e)) || new Set(Object.values(entries)).size !== 3) return null;
  return { url, entries, view: url.replace(/formResponse$/, 'viewform') };
}

async function postForm(config, fields, fetchImpl) {
  const body = new URLSearchParams({
    [config.entries.problem]: fields.problem,
    [config.entries.features]: fields.features,
    [config.entries.email]: fields.email,
  }).toString();
  let res;
  try {
    res = await fetchImpl(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return false;
  }
  if (res.status === 200) return true;
  if (res.status >= 300 && res.status < 400) {
    const to = String((res.headers && res.headers.get && res.headers.get('location')) || '');
    return /^https:\/\/docs\.google\.com\/forms\/[^?#]*\/formResponse(\?|$)/.test(to);
  }
  return false;
}

export async function handleFeedback({ method, headers = {}, body = '', env = process.env, deps = {} }) {
  const fetchImpl = deps.fetch || fetch;
  if (method !== 'POST') return fail(405, 'method', 'Use POST.');
  if (typeof body !== 'string' || Buffer.byteLength(body) > MAX_BODY) return fail(413, 'too_large', 'That feedback is too long. Each box takes up to 1,000 characters.');
  const head = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v ?? '')]));
  const token = (head.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const user = token ? await verifyUser(token, env, fetchImpl).catch(() => null) : null;
  if (!user || !user.email) return fail(401, 'sign_in', 'Sign in with a verified email to send feedback.');
  let data;
  try { data = JSON.parse(body); } catch { return fail(400, 'bad_json', 'The request was not understood.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'bad_json', 'The request was not understood.');
  if (typeof data.website === 'string' && data.website.trim()) { log('trap'); return reply(200, { ok: true }); }
  const problem = clean(data.problem);
  const features = clean(data.features);
  if (!problem && !features) return fail(422, 'empty', 'Write something in at least one box.');
  const config = formConfig(env);
  if (!config) { log('not_configured'); return fail(503, 'not_configured', 'Feedback is not set up on this site yet.'); }
  const store = deps.store || makeStore(env, fetchImpl);
  const taken = await store.take([
    { bucket: `user:${user.id}:feedback`, window: 'day', limit: capFrom(env, 'FEEDBACK_DAILY_CAP', 5) },
    { bucket: 'feedback:all', window: 'day', limit: capFrom(env, 'FEEDBACK_SITE_DAILY_CAP', 300) },
  ]).catch(() => ({ ok: false, blocked: 'store_unavailable' }));
  if (!taken.ok) {
    if (taken.blocked === 'store_unavailable') { log('store_unavailable'); return fail(503, 'unavailable', 'Feedback is temporarily unavailable. Please try again later.', { form: config.view }); }
    log('rate_limited');
    return fail(429, 'rate_limited', 'You have sent the most feedback allowed for today. Please try again tomorrow.', { retry_after: 3600 });
  }
  const sent = await postForm(config, { problem, features, email: user.email }, fetchImpl);
  if (!sent) { log('form_failed'); return fail(503, 'form_failed', 'Your feedback could not be sent right now. Please try again.', { form: config.view }); }
  log('ok');
  return reply(200, { ok: true });
}
