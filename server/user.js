import { requestJson } from './engine/http.js';

export async function verifyUser(token, env, fetchImpl) {
  const base = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !key || !/^[A-Za-z0-9._-]{20,4096}$/.test(token)) return null;
  const res = await requestJson(fetchImpl, `${base}/auth/v1/user`, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${token}` }, timeout: 6000 });
  const u = res.status === 200 ? res.data : null;
  if (!u || typeof u.id !== 'string' || !(u.email_confirmed_at || u.confirmed_at)) return null;
  return { id: u.id, email: typeof u.email === 'string' ? u.email.trim().slice(0, 254) : '' };
}
