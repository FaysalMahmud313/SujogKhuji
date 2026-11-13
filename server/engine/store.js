import { createHash } from 'node:crypto';
import { requestJson } from './http.js';

export const hashKey = (...parts) => createHash('sha256').update(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\u0000')).digest('hex');

const windowStart = (window, now) => {
  const d = new Date(now);
  if (window === 'hour') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  if (window === 'day') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (window === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return 0;
};

const memory = { cache: new Map(), counters: new Map(), state: new Map() };

export function memoryStore({ now = () => Date.now() } = {}) {
  return {
    kind: 'memory',
    async cacheGet(kind, key, maxAgeSeconds) {
      const hit = memory.cache.get(`${kind}:${key}`);
      return hit && now() - hit.at <= maxAgeSeconds * 1000 ? hit.payload : null;
    },
    async cachePut(kind, key, payload) {
      memory.cache.set(`${kind}:${key}`, { at: now(), payload });
      if (memory.cache.size > 500) memory.cache.delete(memory.cache.keys().next().value);
    },
    async take(items) {
      const keys = items.map((it) => `${it.bucket}@${windowStart(it.window, now())}`);
      for (let i = 0; i < items.length; i += 1) {
        if ((memory.counters.get(keys[i]) || 0) >= items[i].limit) return { ok: false, blocked: items[i].bucket };
      }
      keys.forEach((k) => memory.counters.set(k, (memory.counters.get(k) || 0) + 1));
      return { ok: true };
    },
    async stateGet() {
      const out = {};
      for (const [provider, s] of memory.state) if (s.until > now()) out[provider] = s;
      return out;
    },
    async stateSet(provider, seconds, reason) {
      memory.state.set(provider, { until: now() + seconds * 1000, reason });
    },
    reset() {
      memory.cache.clear();
      memory.counters.clear();
      memory.state.clear();
    },
  };
}

export function rpcStore(env, fetchImpl = fetch) {
  const base = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '').trim();
  const secret = String(env.SERVER_RPC_SECRET || env.MAIL_RPC_SECRET || env.INGEST_SECRET || '').trim();
  const headers = { apikey: key };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  const call = (name, body, timeout = 6000) => requestJson(fetchImpl, `${base}/rest/v1/rpc/${name}`, { headers, body: { secret, ...body }, timeout });
  return {
    kind: 'database',
    async cacheGet(kind, cacheKey, maxAgeSeconds) {
      const res = await call('engine_cache_get', { kind, cache_key: cacheKey, max_age_seconds: maxAgeSeconds });
      return res.status === 200 && res.data && typeof res.data === 'object' ? res.data : null;
    },
    async cachePut(kind, cacheKey, payload) {
      await call('engine_cache_put', { kind, cache_key: cacheKey, payload });
    },
    async take(items) {
      const res = await call('engine_take', { items });
      if (res.status !== 200 || !res.data || typeof res.data.ok !== 'boolean') return { ok: false, blocked: 'store_unavailable' };
      return res.data;
    },
    async stateGet() {
      const res = await call('engine_state_get', {});
      if (res.status !== 200 || !res.data || typeof res.data !== 'object') return {};
      const out = {};
      for (const [provider, s] of Object.entries(res.data)) {
        const until = Date.parse(s && s.until);
        if (Number.isFinite(until)) out[provider] = { until, reason: String(s.reason || '') };
      }
      return out;
    },
    async stateSet(provider, seconds, reason) {
      await call('engine_state_set', { provider, seconds: Math.max(1, Math.round(seconds)), reason: String(reason).slice(0, 60) });
    },
  };
}

export function makeStore(env, fetchImpl = fetch) {
  const ready = env.SUPABASE_URL && env.SUPABASE_ANON_KEY && (env.SERVER_RPC_SECRET || env.MAIL_RPC_SECRET || env.INGEST_SECRET);
  return ready ? rpcStore(env, fetchImpl) : memoryStore();
}

export function capFrom(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function secondsUntil(kind, now = Date.now()) {
  const d = new Date(now);
  if (kind === 'next_day') return Math.max(60, (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000 + 60);
  if (kind === 'next_month') return Math.max(60, (Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - now) / 1000 + 60);
  return 60;
}
