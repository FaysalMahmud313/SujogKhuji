import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMessage, handleAuthEmail, sign, verifySignature } from './auth-email.js';

const SECRET = 'v1,whsec_' + Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const ENV = {
  SEND_EMAIL_HOOK_SECRET: SECRET,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_test_key_000000000000',
  MAIL_RPC_SECRET: 'm'.repeat(40),
  SMTP_USER: 'owner@example.com',
  SMTP_APP_PASSWORD: 'abcd efgh ijkl mnop',
};

function request(payload, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000), method = 'POST', tamper = false } = {}) {
  const body = JSON.stringify(payload);
  const id = 'msg_test_1';
  const signature = sign({ id, timestamp, body, secret });
  return {
    method,
    headers: { 'Webhook-Id': id, 'Webhook-Timestamp': String(timestamp), 'Webhook-Signature': signature },
    body: tamper ? body.replace('123456', '654321') : body,
    env: ENV,
  };
}

function deps(verdict = 'ok') {
  const sent = [];
  const gated = [];
  return {
    sent,
    gated,
    deps: {
      fetch: async (url, init) => {
        gated.push({ url, body: JSON.parse(init.body) });
        return { ok: true, json: async () => verdict };
      },
      send: async (env, to, message) => { sent.push({ to, message }); },
    },
  };
}

const signup = { user: { email: 'new.user@example.com' }, email_data: { token: '123456', email_action_type: 'signup' } };

test('a signed request sends one email with the code', async () => {
  const d = deps();
  const res = await handleAuthEmail({ ...request(signup), deps: d.deps });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {});
  assert.equal(d.sent.length, 1);
  assert.equal(d.sent[0].to, 'new.user@example.com');
  assert.match(d.sent[0].message.text, /123456/);
  assert.match(d.sent[0].message.subject, /verification code/);
  assert.equal(d.gated[0].url, 'https://example.supabase.co/rest/v1/rpc/mail_gate');
  assert.equal(d.gated[0].body.daily_cap, 400);
  assert.match(d.gated[0].body.email_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(d.gated[0].body).includes('new.user'));
});

test('unsigned, tampered, old and non-POST requests get a bare 401', async () => {
  const cases = [
    request(signup, { secret: 'v1,whsec_' + Buffer.from('another-secret-another-secret-00').toString('base64') }),
    request(signup, { tamper: true }),
    request(signup, { timestamp: Math.floor(Date.now() / 1000) - 301 }),
    request(signup, { timestamp: Math.floor(Date.now() / 1000) + 400 }),
    request(signup, { method: 'GET' }),
    { method: 'POST', headers: {}, body: JSON.stringify(signup), env: ENV },
    { ...request(signup), env: { ...ENV, SEND_EMAIL_HOOK_SECRET: '' } },
  ];
  for (const c of cases) {
    const d = deps();
    const res = await handleAuthEmail({ ...c, deps: d.deps });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, {});
    assert.equal(d.sent.length, 0);
    assert.equal(d.gated.length, 0);
  }
});

test('over the limit returns the error shape Supabase expects and sends nothing', async () => {
  for (const verdict of ['wait', 'hourly', 'daily']) {
    const d = deps(verdict);
    const res = await handleAuthEmail({ ...request(signup), deps: d.deps });
    assert.equal(res.status, 429);
    assert.deepEqual(res.body, { error: { http_code: 429, message: 'Too many codes requested, try again later.' } });
    assert.equal(d.sent.length, 0);
  }
});

test('it fails closed when the limiter is unreachable or not set up', async () => {
  const d = deps();
  d.deps.fetch = async () => { throw new Error('network down'); };
  let res = await handleAuthEmail({ ...request(signup), deps: d.deps });
  assert.equal(res.status, 500);
  assert.equal(d.sent.length, 0);
  const e = deps();
  res = await handleAuthEmail({ ...request(signup), env: { ...ENV, MAIL_RPC_SECRET: '' }, deps: e.deps });
  assert.equal(res.status, 500);
  assert.equal(e.sent.length, 0);
});

test('an SMTP failure gives a clean error with no details', async () => {
  const d = deps();
  d.deps.send = async () => { const err = new Error('535 bad credentials for owner@example.com abcd efgh'); err.code = 'EAUTH'; throw err; };
  const res = await handleAuthEmail({ ...request(signup), deps: d.deps });
  assert.equal(res.status, 500);
  assert.ok(!JSON.stringify(res.body).includes('535'));
  assert.ok(!JSON.stringify(res.body).includes('abcd'));
});

test('each kind of email has its own subject', async () => {
  const subjects = new Set();
  for (const action of ['signup', 'magiclink', 'recovery']) {
    const d = deps();
    await handleAuthEmail({ ...request({ user: { email: 'a@example.com' }, email_data: { token: '123456', email_action_type: action } }), deps: d.deps });
    subjects.add(d.sent[0].message.subject);
  }
  assert.equal(subjects.size, 3);
});

test('an email change goes to the new address, or to both when two codes are sent', async () => {
  let d = deps();
  await handleAuthEmail({ ...request({ user: { email: 'old@example.com', new_email: 'new@example.com' }, email_data: { token: '123456', token_new: '', email_action_type: 'email_change' } }), deps: d.deps });
  assert.deepEqual(d.sent.map((s) => s.to), ['new@example.com']);
  d = deps();
  await handleAuthEmail({ ...request({ user: { email: 'old@example.com', new_email: 'new@example.com' }, email_data: { token: '123456', token_new: '777888', email_action_type: 'email_change' } }), deps: d.deps });
  assert.deepEqual(d.sent.map((s) => s.to), ['old@example.com', 'new@example.com']);
  assert.match(d.sent[0].message.text, /123456/);
  assert.match(d.sent[1].message.text, /777888/);
});

test('bad payloads are refused', async () => {
  const bad = [
    { user: { email: 'not-an-email' }, email_data: { token: '123456', email_action_type: 'signup' } },
    { user: { email: 'a@example.com' }, email_data: { token: '<b>1</b>', email_action_type: 'signup' } },
    { user: { email: 'a@example.com' }, email_data: { token: '123456', email_action_type: 'unknown_type' } },
    { user: { email: 'a@example.com\r\nBcc: x@evil.test' }, email_data: { token: '123456', email_action_type: 'signup' } },
  ];
  for (const payload of bad) {
    const d = deps();
    const res = await handleAuthEmail({ ...request(payload), deps: d.deps });
    assert.equal(res.status, 400);
    assert.equal(d.sent.length, 0);
  }
});

test('the message escapes what it is given', () => {
  const m = buildMessage('signup', '123456', '<script>x</script>');
  assert.ok(!m.html.includes('<script>'));
  assert.ok(verifySignature({ id: 'a', timestamp: '100', signature: sign({ id: 'a', timestamp: '100', body: '{}', secret: SECRET }), body: '{}', secret: SECRET, now: 100000 }));
});

test('nothing secret is logged', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const d = deps();
    await handleAuthEmail({ ...request(signup), deps: d.deps });
    const e = deps('wait');
    await handleAuthEmail({ ...request(signup), deps: e.deps });
  } finally {
    console.log = original;
  }
  const all = lines.join('\n');
  assert.ok(lines.length >= 2);
  assert.ok(!all.includes('123456'));
  assert.ok(!all.includes('new.user'));
  assert.ok(!all.includes('abcd'));
});
