import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryStore } from './engine/store.js';
import { formConfig, handleFeedback } from './feedback-handler.js';

const NOW = Date.UTC(2026, 10, 15, 6, 0, 0);
let store;
beforeEach(() => { store = memoryStore({ now: () => NOW }); store.reset(); });

const ENV = {
  SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'sb_publishable_testkey_0000000000',
  FEEDBACK_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSc_test-form-id_0123456789/formResponse',
  FEEDBACK_ENTRY_PROBLEM: 'entry.111111', FEEDBACK_ENTRY_FEATURES: 'entry.222222', FEEDBACK_ENTRY_EMAIL: 'entry.333333',
};
const TOKEN = 'good-token-0000000000000000';
const USER = { id: 'user-1', email: 'real.user@example.com', email_confirmed_at: '2026-11-01T00:00:00Z' };

function fakeNet({ user = USER, form = () => ({ status: 200, text: 'Your response has been recorded' }) } = {}) {
  const posts = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === 'db.test' && u.pathname === '/auth/v1/user') {
      const ok = (init.headers || {}).Authorization === `Bearer ${TOKEN}`;
      return new Response(JSON.stringify(ok ? user : { msg: 'bad jwt' }), { status: ok ? 200 : 401 });
    }
    if (u.hostname === 'docs.google.com') {
      posts.push({ url: String(url), init, fields: Object.fromEntries(new URLSearchParams(init.body)) });
      const r = await form();
      if (r.throws) throw new Error('network down');
      return new Response(r.text || '', { status: r.status, headers: r.headers || {} });
    }
    throw new Error(`unexpected host ${u.hostname}`);
  };
  return { fetchImpl, posts };
}

const send = (net, body, { env = ENV, headers = { authorization: `Bearer ${TOKEN}` }, method = 'POST' } = {}) => handleFeedback({
  method, headers, body: typeof body === 'string' ? body : JSON.stringify(body), env, deps: { fetch: net.fetchImpl, store },
});

function captureLogs(run) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => { lines.push(args.join(' ')); };
  return run().finally(() => { console.log = original; }).then((value) => ({ value, lines }));
}

test('feedback is posted to the form with the email taken from the sign-in, never from the request', async () => {
  const net = fakeNet();
  const res = await send(net, { problem: '  The search was slow.  ', features: 'Dark mode for cards', email: 'attacker@evil.example', user_email: 'other@evil.example' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(net.posts.length, 1);
  const post = net.posts[0];
  assert.equal(post.url, ENV.FEEDBACK_FORM_URL);
  assert.equal(post.init.method, 'POST');
  assert.equal(post.init.redirect, 'manual');
  assert.equal(post.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(post.fields, { 'entry.111111': 'The search was slow.', 'entry.222222': 'Dark mode for cards', 'entry.333333': 'real.user@example.com' });
  assert.ok(!post.init.body.includes('attacker'));
  assert.ok(!post.init.body.includes('other%40evil'));
});

test('only a signed-in user with a verified email can send feedback', async () => {
  const net = fakeNet();
  assert.equal((await send(net, { problem: 'x' }, { headers: {} })).status, 401);
  assert.equal((await send(net, { problem: 'x' }, { headers: { authorization: 'Bearer wrong-token-000000000000000' } })).status, 401);
  const unverified = fakeNet({ user: { id: 'user-2', email: 'new@example.com', email_confirmed_at: null } });
  assert.equal((await send(unverified, { problem: 'x' })).status, 401);
  const noEmail = fakeNet({ user: { id: 'user-3', email: '', email_confirmed_at: '2026-11-01T00:00:00Z' } });
  assert.equal((await send(noEmail, { problem: 'x' })).status, 401);
  assert.equal((await send(net, { problem: 'x' }, { method: 'GET' })).status, 405);
  assert.equal(net.posts.length + unverified.posts.length + noEmail.posts.length, 0);
});

test('empty feedback is rejected, long text is capped and one box alone is enough', async () => {
  const net = fakeNet();
  const empty = await send(net, { problem: '   ', features: '\n\n' });
  assert.equal(empty.status, 422);
  assert.equal(empty.body.error, 'empty');
  assert.equal((await send(net, { problem: 42, features: null })).status, 422);
  assert.equal((await send(net, 'not json')).status, 400);
  assert.equal((await send(net, '[]')).status, 400);
  assert.equal((await send(net, { problem: 'p'.repeat(13000) })).status, 413);
  assert.equal(net.posts.length, 0);
  const long = await send(net, { problem: 'a'.repeat(3000), features: '' });
  assert.equal(long.status, 200);
  assert.equal(net.posts[0].fields['entry.111111'].length, 1000);
  assert.equal(net.posts[0].fields['entry.222222'], '');
  const only = await send(net, { features: 'Only a feature idea' });
  assert.equal(only.status, 200);
  assert.equal(net.posts[1].fields['entry.111111'], '');
  assert.equal(net.posts[1].fields['entry.222222'], 'Only a feature idea');
});

test('a filled honeypot is dropped quietly: it looks like success and nothing is posted or counted', async () => {
  const net = fakeNet();
  const res = await send(net, { problem: 'Buy cheap pills', website: 'http://spam.example' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(net.posts.length, 0);
  for (let i = 0; i < 5; i += 1) assert.equal((await send(net, { problem: `real ${i}` })).status, 200);
  assert.equal(net.posts.length, 5);
});

test('each person can send five a day; the sixth gets 429 with Retry-After', async () => {
  const net = fakeNet();
  for (let i = 0; i < 5; i += 1) assert.equal((await send(net, { problem: `Problem ${i}` })).status, 200);
  const sixth = await send(net, { problem: 'One more' });
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.error, 'rate_limited');
  assert.equal(sixth.headers['Retry-After'], '3600');
  assert.equal(net.posts.length, 5);
  const other = fakeNet({ user: { ...USER, id: 'user-9', email: 'second@example.com' } });
  assert.equal((await send(other, { problem: 'A different person' })).status, 200);
  const tight = await send(other, { problem: 'Again' }, { env: { ...ENV, FEEDBACK_DAILY_CAP: '1' } });
  assert.equal(tight.status, 429);
  const down = await handleFeedback({
    method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ problem: 'x' }), env: ENV,
    deps: { fetch: net.fetchImpl, store: { take: async () => { throw new Error('database down'); } } },
  });
  assert.equal(down.status, 503);
});

test('when the form fails the reply is 503 with a link to the form, and nothing private is logged', async () => {
  const secret = 'My private complaint about salary 55000';
  for (const form of [
    () => ({ status: 400, text: 'bad request' }),
    () => ({ status: 500, text: 'error' }),
    () => ({ status: 302, headers: { location: 'https://accounts.google.com/ServiceLogin?continue=x' } }),
    () => ({ status: 302, headers: { location: 'https://docs.google.com/forms/d/e/abc/closedform' } }),
    () => ({ throws: true }),
  ]) {
    store.reset();
    const net = fakeNet({ form });
    const { value: res, lines } = await captureLogs(() => send(net, { problem: secret, features: 'x' }));
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'form_failed');
    assert.equal(res.body.form, 'https://docs.google.com/forms/d/e/1FAIpQLSc_test-form-id_0123456789/viewform');
    assert.ok(!JSON.stringify(res.body).includes('entry.'));
    const logged = lines.join('\n');
    assert.ok(!logged.includes('salary') && !logged.includes('real.user') && !logged.includes('example.com'));
    assert.match(logged, /"outcome":"form_failed"/);
  }
  store.reset();
  const moved = fakeNet({ form: () => ({ status: 302, headers: { location: 'https://docs.google.com/forms/d/e/1FAIpQLSc_test-form-id_0123456789/formResponse?pli=1' } }) });
  const { value: ok, lines } = await captureLogs(() => send(moved, { problem: secret }));
  assert.equal(ok.status, 200);
  assert.ok(!lines.join('\n').includes('salary') && !lines.join('\n').includes('real.user'));
});

test('missing or wrong settings give 503 and never post anywhere', async () => {
  const net = fakeNet();
  for (const broken of [
    { FEEDBACK_FORM_URL: '' },
    { FEEDBACK_FORM_URL: 'https://evil.example/forms/d/e/1FAIpQLSc_test-form-id_0123456789/formResponse' },
    { FEEDBACK_FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSc_test-form-id_0123456789/viewform' },
    { FEEDBACK_ENTRY_EMAIL: '' },
    { FEEDBACK_ENTRY_PROBLEM: 'problem' },
    { FEEDBACK_ENTRY_FEATURES: 'entry.111111' },
  ]) {
    const res = await send(net, { problem: 'x' }, { env: { ...ENV, ...broken } });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'not_configured');
    assert.equal(res.body.form, undefined);
  }
  assert.equal(net.posts.length, 0);
  assert.equal(formConfig(ENV).view, 'https://docs.google.com/forms/d/e/1FAIpQLSc_test-form-id_0123456789/viewform');
});
