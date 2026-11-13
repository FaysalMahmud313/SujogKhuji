'use strict';

const Backend = (() => {
  const cfg = window.SUJOG_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const key = String(cfg.supabaseAnonKey || '').trim();
  const captchaKey = String(cfg.turnstileSiteKey || '').trim();
  const enabled = /^(https:\/\/[^\s/]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/.test(url) && key.length >= 20;
  const SESSION_KEY = 'sujog:session';
  const KEEP_KEY = 'sujog:keep';
  const IDLE_LIMIT = 30 * 86400;
  const listeners = new Set();
  const nowSec = () => Math.floor(Date.now() / 1000);
  let session = null;
  let refreshing = null;

  function keepSignedIn() {
    try { return localStorage.getItem(KEEP_KEY) !== '0'; } catch { return true; }
  }

  function readStored() {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        const saved = JSON.parse(store.getItem(SESSION_KEY));
        if (saved && saved.access_token && saved.refresh_token && saved.user && saved.user.id) return saved;
      } catch { }
    }
    return null;
  }

  function write(next) {
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      if (next) (keepSignedIn() ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(next));
    } catch { }
  }

  function emit(reason) {
    listeners.forEach((fn) => { try { fn(session, reason); } catch { } });
  }

  const validSession = (v) => !!(v && typeof v.access_token === 'string' && typeof v.refresh_token === 'string' && v.user && typeof v.user.id === 'string');
  const stamp = (v) => (v ? v.user.id + v.refresh_token : '');
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('sujog-auth') : null;

  function save(next, reason) {
    session = next ? { ...next, last_seen: nowSec() } : null;
    write(session);
    if (bc) bc.postMessage({ type: 'session', session });
    emit(reason);
  }

  function adopt(next) {
    const before = session;
    if (stamp(before) === stamp(next)) return;
    if (next && before && next.user.id === before.user.id && Number(next.expires_at) < Number(before.expires_at)) return;
    session = next;
    write(session);
    emit(!next ? 'remote-signout' : (before && before.user.id === next.user.id ? 'refresh' : 'remote-signin'));
  }

  session = readStored();
  if (session && nowSec() - (Number(session.last_seen) || nowSec()) > IDLE_LIMIT) {
    session = null;
    write(null);
  } else if (session) {
    session.last_seen = nowSec();
  }

  let ready = Promise.resolve();
  if (bc) {
    let answered = null;
    bc.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.type === 'request') {
        if (session && !keepSignedIn()) bc.postMessage({ type: 'offer', session });
      } else if (d.type === 'offer') {
        if (!validSession(d.session) || session) return;
        if (answered) { session = d.session; write(session); answered(); answered = null; }
        else adopt(d.session);
      } else if (d.type === 'session') {
        if (d.session === null || validSession(d.session)) adopt(d.session);
      }
    });
    if (enabled && !session && !keepSignedIn()) {
      ready = new Promise((resolve) => {
        answered = resolve;
        setTimeout(() => { answered = null; resolve(); }, 300);
      });
      bc.postMessage({ type: 'request' });
    }
  }

  function sessionFrom(data) {
    if (!data || !data.access_token || !data.refresh_token || !data.user || !data.user.id) return null;
    const u = data.user;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Number(data.expires_at) || nowSec() + (Number(data.expires_in) || 3600),
      user: { id: u.id, email: u.email || '', verified: !!(u.email_confirmed_at || u.confirmed_at) },
    };
  }

  function friendly(message, status, code) {
    const m = `${code || ''} ${message || ''}`;
    if (/invalid login credentials|invalid_credentials/i.test(m)) return 'Wrong email or password.';
    if (/otp_expired|token has expired|invalid.*token|otp.*invalid/i.test(m)) return 'WRONG_CODE';
    if (/email not confirmed/i.test(m)) return 'Please verify your email first. Use “Email me a code instead”.';
    if (/captcha/i.test(m)) return 'The security check failed. Please try again.';
    if (/password should be|weak password|weak_password|password is too/i.test(m)) return 'Choose a stronger password (at least 8 characters, mixing letters and numbers).';
    if (/same_password|different from the old/i.test(m)) return 'Choose a password you have not used here before.';
    if (/valid email|invalid email|unable to validate email|email_address_invalid/i.test(m)) return 'Please enter a valid email address.';
    if (/signups? not allowed|otp_disabled/i.test(m)) return 'We could not sign you in with that email. Check it, or create an account.';
    if (status === 429 || /rate limit|too many|over_email_send_rate_limit/i.test(m)) return 'Too many codes requested, try again later.';
    if (status >= 500) return 'The server had a problem. Please try again shortly.';
    if (status === 401 || status === 403) return 'You are not allowed to do that. Sign in again.';
    return 'Something went wrong. Please try again.';
  }

  async function request(path, { method = 'GET', body, token, prefer, timeout = 15000 } = {}) {
    if (!enabled) throw new Error('Accounts are not set up on this site.');
    const headers = { apikey: key };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    if (token) headers.Authorization = `Bearer ${token}`;
    else if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(url + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal, cache: 'no-store' });
    } catch (e) {
      const err = new Error(e.name === 'AbortError' ? 'The server took too long to answer.' : "Can't reach the server. Check your internet connection.");
      err.offline = true;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const raw = data && (data.msg || data.message || data.error_description || data.error);
      const err = new Error(friendly(typeof raw === 'string' ? raw : '', res.status, data && (data.error_code || data.code)));
      err.status = res.status;
      err.detail = typeof raw === 'string' ? raw.slice(0, 200) : '';
      throw err;
    }
    return data;
  }

  async function refreshNow() {
    if (session && nowSec() < session.expires_at - 60) return session;
    const before = session;
    if (!before) return null;
    await new Promise((resolve) => {
      const pipe = new MessageChannel();
      pipe.port1.onmessage = () => { pipe.port1.close(); resolve(); };
      pipe.port2.postMessage(0);
    });
    if (!session) return null;
    if (session.refresh_token !== before.refresh_token && nowSec() < session.expires_at - 60) return session;
    const stored = readStored();
    if (stored && stored.user.id === before.user.id && stored.refresh_token !== before.refresh_token && nowSec() < stored.expires_at - 60) {
      session = stored;
      return session;
    }
    try {
      const data = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: before.refresh_token } });
      const next = sessionFrom(data);
      if (!next) throw Object.assign(new Error('Sign in again.'), { status: 401 });
      save(next, 'refresh');
      return session;
    } catch (e) {
      if (e.status && e.status < 500) save(null, 'expired');
      throw e;
    }
  }

  async function accessToken() {
    if (!session) return null;
    if (nowSec() < session.expires_at - 60) return session.access_token;
    if (!refreshing) {
      const run = () => refreshNow();
      const locked = () => navigator.locks.request('sujog-token-refresh', { signal: AbortSignal.timeout(8000) }, run)
        .catch((e) => { if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return run(); throw e; });
      refreshing = (navigator.locks && navigator.locks.request && typeof AbortSignal.timeout === 'function' ? locked() : run())
        .finally(() => { refreshing = null; });
    }
    const next = await refreshing;
    return next ? next.access_token : null;
  }

  async function rest(path, { method = 'GET', body, prefer, anon = false } = {}) {
    const token = anon ? null : await accessToken();
    if (!anon && !token) throw Object.assign(new Error('Sign in again.'), { status: 401 });
    try {
      return await request('/rest/v1' + path, { method, body, prefer, token });
    } catch (e) {
      if (e.status === 401 && token) save(null, 'expired');
      throw e;
    }
  }

  async function callApi(path, body, { timeout = 60000 } = {}) {
    const token = await accessToken();
    if (!token) throw Object.assign(new Error('Sign in again.'), { status: 401 });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
        cache: 'no-store',
      });
    } catch (e) {
      throw Object.assign(new Error(e.name === 'AbortError' ? 'The server took too long to answer.' : "Can't reach the server. Check your internet connection."), { offline: true });
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const message = data && typeof data.message === 'string' ? data.message.slice(0, 300) : res.status === 404 ? 'AI extraction is not set up on this site yet.' : 'Something went wrong. Please try again.';
      throw Object.assign(new Error(message), { status: res.status, code: data && data.error });
    }
    return data;
  }

  const security = (captcha) => (captcha ? { gotrue_meta_security: { captcha_token: captcha } } : {});
  const cleanEmail = (email) => String(email || '').trim().toLowerCase().slice(0, 254);

  return {
    enabled,
    captchaKey: enabled ? captchaKey : '',
    get user() { return session ? session.user : null; },
    get verified() { return !!(session && session.user.verified); },
    get keep() { return keepSignedIn(); },
    onChange(fn) { listeners.add(fn); },
    rest,
    callApi,

    setKeep(on) {
      try { localStorage.setItem(KEEP_KEY, on ? '1' : '0'); } catch { }
      if (session) write(session);
    },

    ready,

    reload() {
      if (!keepSignedIn()) return;
      adopt(readStored());
    },

    touch() {
      if (!session) return;
      const stored = readStored();
      if (stored && stamp(stored) !== stamp(session)) { adopt(stored); return; }
      session.last_seen = nowSec();
      write(session);
    },

    async requestCode(email, { create = true, captcha = '' } = {}) {
      await request('/auth/v1/otp', { method: 'POST', body: { email: cleanEmail(email), create_user: !!create, ...security(captcha) } });
    },

    async verifyCode(email, token, type = 'email') {
      const data = await request('/auth/v1/verify', { method: 'POST', body: { type, email: cleanEmail(email), token: String(token).replace(/\D/g, '').slice(0, 10) } });
      const next = sessionFrom(data);
      if (!next || !next.user.verified) throw new Error('We could not verify that code. Request a new one.');
      save(next, 'signin');
    },

    async signIn(email, password, captcha = '') {
      const data = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: cleanEmail(email), password, ...security(captcha) } });
      const next = sessionFrom(data);
      if (!next) throw new Error('Sign-in failed. Please try again.');
      if (!next.user.verified) throw new Error('Please verify your email first. Use “Email me a code instead”.');
      save(next, 'signin');
    },

    async requestReset(email, captcha = '') {
      await request('/auth/v1/recover', { method: 'POST', body: { email: cleanEmail(email), ...security(captcha) } });
    },

    async updatePassword(password) {
      const token = await accessToken();
      if (!token) throw new Error('Your session has ended. Start again.');
      await request('/auth/v1/user', { method: 'PUT', body: { password }, token });
    },

    async requestEmailChange(email) {
      const token = await accessToken();
      if (!token) throw new Error('Your session has ended. Sign in again.');
      await request('/auth/v1/user', { method: 'PUT', body: { email: cleanEmail(email) }, token });
    },

    async signOut() {
      const token = session ? session.access_token : null;
      save(null, 'signout');
      if (token) {
        try { await request('/auth/v1/logout?scope=local', { method: 'POST', token, timeout: 6000 }); } catch { }
      }
    },
  };
})();
