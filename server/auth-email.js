import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';

const MAX_AGE_SECONDS = 300;
const MAX_BODY_BYTES = 20000;

const MESSAGES = {
  signup: {
    subject: 'Your SujogKhuji verification code',
    heading: 'Confirm your email',
    line: 'Enter this code in SujogKhuji to verify your email and finish creating your account.',
  },
  magiclink: {
    subject: 'Your SujogKhuji sign-in code',
    heading: 'Sign in to SujogKhuji',
    line: 'Enter this code in SujogKhuji to sign in.',
  },
  recovery: {
    subject: 'Reset your SujogKhuji password',
    heading: 'Reset your password',
    line: 'Enter this code in SujogKhuji to choose a new password.',
  },
  email_change: {
    subject: 'Confirm your new email for SujogKhuji',
    heading: 'Confirm your new email',
    line: 'Enter this code in SujogKhuji to start using this email address for your account.',
  },
  email_change_current: {
    subject: 'Confirm your SujogKhuji email change',
    heading: 'Confirm the email change',
    line: 'Someone asked to change the email on your SujogKhuji account. Enter this code to allow it.',
  },
  reauthentication: {
    subject: 'Your SujogKhuji security code',
    heading: 'Confirm it is you',
    line: 'Enter this code in SujogKhuji to continue.',
  },
};
MESSAGES.invite = MESSAGES.signup;
MESSAGES.email = MESSAGES.magiclink;

const LIMIT_TEXT = {
  wait: 'Too many codes requested, try again later.',
  hourly: 'Too many codes requested, try again later.',
  daily: 'Too many codes requested, try again later.',
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reply = (status, body = {}) => ({ status, body });
const fail = (status, message) => reply(status, { error: { http_code: status, message } });
const note = (outcome, extra = {}) => console.log(JSON.stringify({ event: 'auth_email', outcome, ...extra }));

function signingKey(secret) {
  const value = String(secret || '').trim().replace(/^v1,/, '').replace(/^whsec_/, '');
  if (!value) return null;
  const key = Buffer.from(value, 'base64');
  return key.length >= 16 ? key : null;
}

export function verifySignature({ id, timestamp, signature, body, secret, now = Date.now() }) {
  const key = signingKey(secret);
  if (!key || !id || !timestamp || !signature) return false;
  if (!/^\d{1,12}$/.test(String(timestamp))) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return String(signature).split(' ').some((part) => {
    const comma = part.indexOf(',');
    if (comma < 0 || part.slice(0, comma) !== 'v1') return false;
    const given = Buffer.from(part.slice(comma + 1), 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export function sign({ id, timestamp, body, secret }) {
  const key = signingKey(secret);
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

const validEmail = (value) => typeof value === 'string' && value.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(value);
const validCode = (value) => typeof value === 'string' && /^[0-9]{6,10}$/.test(value);

export function buildMessage(kind, code, fromName) {
  const m = MESSAGES[kind] || MESSAGES.magiclink;
  const spaced = esc(code).split('').join('&#8202;');
  const text = `${m.heading}\n\n${m.line}\n\nYour code: ${code}\n\nThe code works for 10 minutes and can be used once.\nIf you did not ask for this, you can ignore this email. Never share this code with anyone.\n\n${fromName}`;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0b0b0f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e6e6e9;border-radius:14px">
<tr><td style="padding:28px 28px 8px;font-size:15px;font-weight:600;color:#5e5ce6">${esc(fromName)}</td></tr>
<tr><td style="padding:0 28px;font-size:21px;font-weight:600;line-height:1.3">${esc(m.heading)}</td></tr>
<tr><td style="padding:10px 28px 0;font-size:15px;line-height:1.55;color:#52525b">${esc(m.line)}</td></tr>
<tr><td style="padding:22px 28px 6px">
<div style="font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:#f4f4f5;border-radius:10px;padding:16px 8px;color:#0b0b0f">${spaced}</div>
</td></tr>
<tr><td style="padding:12px 28px 26px;font-size:13px;line-height:1.55;color:#8a8a93">The code works for 10 minutes and can be used once. If you did not ask for this, you can ignore this email. Never share this code with anyone.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject: m.subject, text, html };
}

async function gate(env, email, fetcher) {
  const base = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || '').trim();
  const secret = String(env.MAIL_RPC_SECRET || '').trim();
  if (!base || !key || secret.length < 32) return 'unconfigured';
  const cap = Math.max(1, Math.min(480, Math.round(Number(env.MAIL_DAILY_CAP)) || 400));
  const hash = createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
  const headers = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  const res = await fetcher(`${base}/rest/v1/rpc/mail_gate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ secret, email_hash: hash, daily_cap: cap }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return 'error';
  const verdict = await res.json();
  return typeof verdict === 'string' ? verdict : 'error';
}

let cachedTransport = null;
let cachedFor = '';

function transportFor(env) {
  const user = String(env.SMTP_USER || '').trim();
  const pass = String(env.SMTP_APP_PASSWORD || '').replace(/\s+/g, '');
  const host = String(env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(env.SMTP_PORT) || 465;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
  if (!user || !pass) return null;
  const signature = `${host}:${port}:${secure}:${user}:${pass.length}`;
  if (!cachedTransport || cachedFor !== signature) {
    cachedTransport = nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass },
      connectionTimeout: 7000, greetingTimeout: 7000, socketTimeout: 9000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    cachedFor = signature;
  }
  return cachedTransport;
}

async function smtpSend(env, to, message) {
  const transport = transportFor(env);
  if (!transport) throw new Error('smtp not configured');
  const name = String(env.SMTP_FROM_NAME || 'SujogKhuji').replace(/[\r\n<>"]/g, '').slice(0, 60) || 'SujogKhuji';
  await transport.sendMail({
    from: { name, address: String(env.SMTP_USER).trim() },
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
  });
}

function deliveries(payload) {
  const user = payload && payload.user;
  const data = payload && payload.email_data;
  if (!user || !data || typeof data.email_action_type !== 'string') return null;
  const action = data.email_action_type;
  if (!MESSAGES[action]) return null;
  if (action === 'email_change') {
    const fresh = user.new_email || user.email_new;
    if (data.token_new) {
      return [
        { to: user.email, code: data.token, kind: 'email_change_current' },
        { to: fresh, code: data.token_new, kind: 'email_change' },
      ];
    }
    return [{ to: fresh, code: data.token, kind: 'email_change' }];
  }
  return [{ to: user.email, code: data.token, kind: action }];
}

export async function handleAuthEmail({ method, headers = {}, body = '', env = process.env, deps = {} }) {
  const fetcher = deps.fetch || fetch;
  const send = deps.send || smtpSend;
  const head = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(' ') : String(v ?? '')]));
  const signed = method === 'POST'
    && typeof body === 'string'
    && Buffer.byteLength(body) <= MAX_BODY_BYTES
    && verifySignature({
      id: head['webhook-id'],
      timestamp: head['webhook-timestamp'],
      signature: head['webhook-signature'],
      body,
      secret: env.SEND_EMAIL_HOOK_SECRET,
      now: deps.now ? deps.now() : Date.now(),
    });
  if (!signed) {
    note('rejected');
    return reply(401, {});
  }

  let payload;
  try { payload = JSON.parse(body); } catch { payload = null; }
  const list = deliveries(payload);
  if (!list || !list.every((d) => validEmail(d.to) && validCode(d.code))) {
    note('bad_payload');
    return fail(400, 'This email could not be sent.');
  }
  const fromName = String(env.SMTP_FROM_NAME || 'SujogKhuji').replace(/[\r\n<>"]/g, '').slice(0, 60) || 'SujogKhuji';

  for (const item of list) {
    let verdict;
    try { verdict = await gate(env, item.to, fetcher); } catch { verdict = 'error'; }
    if (verdict !== 'ok') {
      note(LIMIT_TEXT[verdict] ? `limited_${verdict}` : `gate_${verdict}`, { action: item.kind });
      if (LIMIT_TEXT[verdict]) return fail(429, LIMIT_TEXT[verdict]);
      return fail(500, 'Email is not available right now. Please try again later.');
    }
    try {
      await send(env, item.to, buildMessage(item.kind, item.code, fromName));
    } catch (e) {
      note('smtp_failed', { action: item.kind, code: String((e && (e.code || e.responseCode)) || 'unknown').slice(0, 20) });
      return fail(500, 'Could not send the email. Please try again in a minute.');
    }
    note('sent', { action: item.kind });
  }
  return reply(200, {});
}
