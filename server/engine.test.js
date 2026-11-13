import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { checkUrl, htmlToText, isPublicIp, safeFetchPage } from './engine/http.js';
import { searchWeb, classifySearch, dedupeResults } from './engine/search.js';
import { aiProviders, classifyAi, rejectedPaidModels } from './engine/ai.js';
import { datesIn, extractOpportunity, quoteIn, validateShape, verifyFacts } from './engine/extract.js';
import { cleanAnswer, cleanMemory, lookupOpportunity, parseStep } from './engine/lookup.js';
import { hashKey, memoryStore } from './engine/store.js';
import { handleExtract, detectMode } from './extract-handler.js';

const NOW = Date.UTC(2026, 10, 13, 6, 0, 0);
const now = () => NOW;
let store;
beforeEach(() => { store = memoryStore({ now }); store.reset(); });

function fakeNet(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host: u.hostname, path: u.pathname, body, headers: init.headers || {} });
    const handler = routes[u.hostname];
    if (!handler) throw new Error(`unexpected host ${u.hostname}`);
    const r = await handler({ url: u, body, headers: init.headers || {}, n: calls.filter((c) => c.host === u.hostname).length });
    const text = r.text !== undefined ? r.text : JSON.stringify(r.json ?? {});
    return new Response(text, { status: r.status || 200, headers: r.headers || {} });
  };
  return { fetchImpl, calls, hosts: () => [...new Set(calls.map((c) => c.host))] };
}

const tavilyOk = (urls) => () => ({ json: { results: urls.map((u, i) => ({ url: u, title: `Result ${i}`, content: 'snippet', raw_content: 'page text', published_date: '2026-11-01' })) } });
const serperOk = () => ({ json: { organic: [{ link: 'https://jobs.example.org/a', title: 'Serper A', snippet: 'snip' }, { link: 'https://jobs.example.org/b', title: 'Serper B', snippet: 'snip' }] } });
const exaOk = () => ({ json: { results: [{ url: 'https://exa.example.net/x', title: 'Exa X', text: 'full text', publishedDate: '2026-11-02' }] } });
const ENV3 = { TAVILY_API_KEY: 'tvly-test', SERPER_API_KEY: 'serper-test', EXA_API_KEY: 'exa-test' };
const page = async (url) => ({ url, title: 'page', text: `fetched ${url}` });

test('Tavily is used first and results are cleaned and de-duplicated', async () => {
  const net = fakeNet({ 'api.tavily.com': tavilyOk(['https://www.acme.com/jobs/1?utm_source=x', 'https://acme.com/jobs/1', 'https://facebook.com/post', 'https://acme.com/jobs/2']) });
  const res = await searchWeb('graduate trainee job', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(res.provider, 'tavily');
  assert.deepEqual(res.results.map((r) => r.url), ['https://www.acme.com/jobs/1?utm_source=x', 'https://acme.com/jobs/2']);
  assert.deepEqual(net.hosts(), ['api.tavily.com']);
  assert.equal(net.calls[0].headers.Authorization, 'Bearer tvly-test');
});

test('Tavily quota (432) switches to Serper and Tavily rests until next month', async () => {
  const net = fakeNet({ 'api.tavily.com': () => ({ status: 432, json: { detail: { error: 'This request exceeds your plan\'s set usage limit.' } } }), 'google.serper.dev': serperOk });
  const first = await searchWeb('query one', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(first.provider, 'serper');
  assert.equal(first.results[0].raw_content, 'fetched https://jobs.example.org/a');
  const second = await searchWeb('query two', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(second.provider, 'serper');
  assert.equal(net.calls.filter((c) => c.host === 'api.tavily.com').length, 1);
  const state = await store.stateGet();
  assert.equal(new Date(state.tavily.until).toISOString().slice(0, 10), '2026-12-01');
});

test('Serper out of credits switches to Exa; nothing is called twice', async () => {
  const net = fakeNet({
    'api.tavily.com': () => ({ status: 433, text: 'pay-as-you-go limit' }),
    'google.serper.dev': () => ({ status: 400, json: { message: 'Not enough credits', statusCode: 400 } }),
    'api.exa.ai': exaOk,
  });
  const res = await searchWeb('query', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(res.provider, 'exa');
  assert.deepEqual(res.attempts.map((a) => `${a.provider}:${a.outcome}`), ['tavily:quota', 'serper:quota', 'exa:ok']);
  assert.equal(net.calls.length, 3);
});

test('when every search provider is exhausted the result is a clean "unavailable"', async () => {
  const net = fakeNet({
    'api.tavily.com': () => ({ status: 432, text: 'limit' }),
    'google.serper.dev': () => ({ status: 403, text: 'Not enough credits' }),
    'api.exa.ai': () => ({ status: 402, text: 'credits exhausted' }),
  });
  const res = await searchWeb('query', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(res.unavailable, true);
  assert.equal(res.results.length, 0);
  const again = await searchWeb('another', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(again.unavailable, true);
  assert.equal(net.calls.length, 3);
});

test('temporary errors fall back for this request only; invalid requests do not fall back', async () => {
  const net = fakeNet({ 'api.tavily.com': () => ({ status: 429, text: 'Too many requests' }), 'google.serper.dev': serperOk });
  const res = await searchWeb('graduate jobs', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(res.provider, 'serper');
  const state = await store.stateGet();
  assert.equal(Math.round((state.tavily.until - NOW) / 1000), 60);
  store.reset();
  const bad = fakeNet({ 'api.tavily.com': () => ({ status: 400, text: 'invalid query' }), 'google.serper.dev': serperOk });
  const res2 = await searchWeb('graduate jobs', { env: ENV3, store, fetchImpl: bad.fetchImpl, now, fetchPage: page });
  assert.equal(res2.invalid, true);
  assert.deepEqual(bad.hosts(), ['api.tavily.com']);
});

test('our own monthly cap stops a provider before its free limit', async () => {
  const net = fakeNet({ 'api.tavily.com': tavilyOk(['https://a.org/1']), 'google.serper.dev': serperOk });
  const env = { ...ENV3, TAVILY_MONTHLY_CAP: '1' };
  assert.equal((await searchWeb('one', { env, store, fetchImpl: net.fetchImpl, now, useCache: false, fetchPage: page })).provider, 'tavily');
  assert.equal((await searchWeb('two', { env, store, fetchImpl: net.fetchImpl, now, useCache: false, fetchPage: page })).provider, 'serper');
  assert.equal(net.calls.filter((c) => c.host === 'api.tavily.com').length, 1);
});

test('repeated searches come from the cache', async () => {
  const net = fakeNet({ 'api.tavily.com': tavilyOk(['https://a.org/1']) });
  await searchWeb('Same Query', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  const again = await searchWeb('  same   query ', { env: ENV3, store, fetchImpl: net.fetchImpl, now, fetchPage: page });
  assert.equal(again.cached, true);
  assert.equal(net.calls.length, 1);
});

test('missing keys are skipped and an empty setup is "unavailable"', async () => {
  const net = fakeNet({ 'api.exa.ai': exaOk });
  const res = await searchWeb('graduate jobs', { env: { EXA_API_KEY: 'k' }, store, fetchImpl: net.fetchImpl, now });
  assert.equal(res.provider, 'exa');
  const none = await searchWeb('graduate jobs 2', { env: {}, store, fetchImpl: net.fetchImpl, now });
  assert.equal(none.unavailable, true);
});

test('search errors are classified', () => {
  assert.equal(classifySearch('tavily', 432), 'quota');
  assert.equal(classifySearch('tavily', 433), 'quota');
  assert.equal(classifySearch('tavily', 429), 'rate');
  assert.equal(classifySearch('tavily', 401), 'auth');
  assert.equal(classifySearch('serper', 400, 'Not enough credits'), 'quota');
  assert.equal(classifySearch('serper', 400, 'bad q'), 'invalid');
  assert.equal(classifySearch('exa', 402), 'quota');
  assert.equal(classifySearch('exa', 503), 'temporary');
  assert.equal(classifySearch('exa', 0, '', 'timeout'), 'temporary');
  assert.equal(dedupeResults([{ url: 'javascript:alert(1)' }, { url: 'https://t.me/x' }]).length, 0);
});

const DOC = [
  'Graduate Trainee Officer - Acme Bank PLC',
  'Acme Bank PLC invites fresh graduates to apply. Location: Dhaka, Bangladesh.',
  'Salary: BDT 45,000 per month. Application deadline: 30 December 2026.',
  'Requirements: Bachelor\'s degree in any discipline. No prior experience required.',
  'This is a full-time, on-site position. Written test on 10 January 2027.',
].join('\n');

const fact = (value, quote, source = 1) => ({ value, quote, source });
const GOOD = {
  is_opportunity: true,
  title: fact('Graduate Trainee Officer', 'Graduate Trainee Officer - Acme Bank PLC'),
  organization: fact('Acme Bank PLC', 'Acme Bank PLC invites fresh graduates'),
  category: fact('job', 'Graduate Trainee Officer'),
  country: fact('Bangladesh', 'Location: Dhaka, Bangladesh'),
  deadline: fact('2026-12-30', 'Application deadline: 30 December 2026'),
  funding: fact(null, null, null),
  pay: fact('BDT 45,000 per month', 'Salary: BDT 45,000 per month'),
  experience_min_years: fact(0, 'No prior experience required'),
  experience_max_years: fact(null, null, null),
  job_type: fact('full-time', 'This is a full-time, on-site position'),
  work_mode: fact('onsite', 'This is a full-time, on-site position'),
  education: fact('bachelor', 'Bachelor\'s degree in any discipline'),
  field: fact(null, null, null),
  org_type: fact(null, null, null),
  steps: [{ name: 'Written test', date: '2027-01-10', quote: 'Written test on 10 January 2027', source: 1 }],
  red_flags: [],
};
const aiReply = (obj) => () => ({ json: { choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] } });
const AI_ENV = { GROQ_API_KEY: 'gsk-test', OPENROUTER_API_KEY: 'or-test' };

test('AI extraction keeps only facts backed by an exact quote', async () => {
  const net = fakeNet({ 'api.groq.com': aiReply(GOOD) });
  const out = await extractOpportunity({ docs: [{ url: 'https://acme.com/job', title: 'Job', text: DOC }], env: AI_ENV, store, fetchImpl: net.fetchImpl, now });
  const r = out.result;
  assert.equal(r.title, 'Graduate Trainee Officer');
  assert.equal(r.deadline, '2026-12-30');
  assert.equal(r.pay, 'BDT 45,000 per month');
  assert.equal(r.exp_min, 0);
  assert.equal(r.level, 'entry');
  assert.equal(r.region, 'BD');
  assert.deepEqual(r.steps_json, [{ t: 'Written test', d: '2027-01-10' }]);
  assert.equal(r.evidence.deadline.status, 'verified');
  assert.equal(r.evidence.deadline.quote, 'Application deadline: 30 December 2026');
  assert.equal(r.evidence.funding.status, 'not_found');
  assert.equal(net.calls.length, 1);
  assert.equal(net.calls[0].body.model, 'openai/gpt-oss-120b');
});

test('hallucinated deadline, funding and pay are thrown away', async () => {
  const lies = { ...GOOD,
    deadline: fact('2027-03-15', 'Application deadline: 15 March 2027'),
    funding: fact('full', 'Salary: BDT 45,000 per month'),
    pay: fact('BDT 90,000 per month', 'Salary: BDT 45,000 per month'),
    country: fact('Germany', 'Location: Dhaka, Bangladesh'),
    experience_min_years: fact(3, 'No prior experience required'),
    steps: [{ name: 'Interview', date: '2027-02-01', quote: 'Interview on 1 February 2027', source: 1 }],
  };
  const net = fakeNet({ 'api.groq.com': aiReply(lies) });
  const { result: r } = await extractOpportunity({ docs: [{ url: 'https://acme.com/job', title: 'Job', text: DOC }], env: AI_ENV, store, fetchImpl: net.fetchImpl, now });
  assert.equal(r.deadline, null);
  assert.equal(r.funding, null);
  assert.equal(r.pay, null);
  assert.equal(r.country, null);
  assert.equal(r.exp_min, null);
  assert.deepEqual(r.steps_json, []);
  for (const f of ['deadline', 'funding', 'pay', 'country', 'experience_min_years']) assert.equal(r.evidence[f].status, 'rejected');
});

test('an invalid AI reply moves to the next free model, at most three calls', async () => {
  const net = fakeNet({
    'api.groq.com': ({ n }) => (n === 1 ? aiReply('Sure! Here is the data: deadline is soon')() : aiReply({ is_opportunity: 'yes' })()),
    'openrouter.ai': aiReply(GOOD),
  });
  const out = await extractOpportunity({ docs: [{ url: 'https://acme.com/job', text: DOC }], env: AI_ENV, store, fetchImpl: net.fetchImpl, now });
  assert.equal(out.result.provider, 'openrouter');
  assert.deepEqual(out.attempts.map((a) => `${a.provider}:${a.outcome}`), ['groq:invalid_output', 'groq-fast:invalid_output', 'openrouter:ok']);
  assert.equal(validateShape({ ...GOOD, is_opportunity: { value: true, quote: 'x', source: 1 } }).ok, true);
  const bare = validateShape({ ...GOOD, experience_min_years: 3, deadline: '2027-01-01', job_type: null });
  assert.equal(bare.ok, true);
  const checked = verifyFacts(bare.value, [{ url: null, text: DOC }]);
  assert.equal(checked.facts.experience_min_years, null);
  assert.equal(checked.evidence.deadline.status, 'rejected');
  assert.equal(net.calls.length, 3);
});

test('AI daily quota is detected and the provider rests until tomorrow', async () => {
  const net = fakeNet({
    'api.groq.com': () => ({ status: 429, json: { error: { message: 'Rate limit reached for model on tokens per day (TPD)' } } }),
    'openrouter.ai': aiReply(GOOD),
  });
  const out = await extractOpportunity({ docs: [{ text: DOC }], env: { ...AI_ENV, GROQ_FALLBACK_MODEL: 'openai/gpt-oss-120b' }, store, fetchImpl: net.fetchImpl, now });
  assert.equal(out.result.provider, 'openrouter');
  const state = await store.stateGet();
  assert.equal(new Date(state['ai:groq'].until).toISOString().slice(0, 10), '2026-11-14');
  await extractOpportunity({ docs: [{ text: DOC }], env: AI_ENV, store, fetchImpl: net.fetchImpl, now });
  assert.equal(net.calls.filter((c) => c.host === 'api.groq.com' && c.body.model === 'openai/gpt-oss-120b').length, 1);
});

test('when every free AI is unavailable nothing paid is tried', async () => {
  const net = fakeNet({
    'api.groq.com': () => ({ status: 429, text: 'requests per day limit' }),
    'openrouter.ai': () => ({ status: 402, json: { error: { message: 'Rate limit exceeded: free-models-per-day' } } }),
  });
  const out = await extractOpportunity({ docs: [{ text: DOC }], env: AI_ENV, store, fetchImpl: net.fetchImpl, now });
  assert.equal(out.unavailable, true);
  assert.deepEqual(net.hosts().sort(), ['api.groq.com', 'openrouter.ai']);
});

test('paid models and unconfirmed Gemini can never be called', async () => {
  const env = { GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', OPENROUTER_MODELS: 'openai/gpt-4o,openrouter/auto,anthropic/claude-3.5-sonnet,meta-llama/llama-3.3-70b-instruct:free' };
  assert.deepEqual(aiProviders(env).map((p) => p.model), ['meta-llama/llama-3.3-70b-instruct:free']);
  assert.deepEqual(rejectedPaidModels(env), ['openai/gpt-4o', 'openrouter/auto', 'anthropic/claude-3.5-sonnet']);
  assert.ok(!aiProviders({ GEMINI_API_KEY: 'g' }).length);
  assert.equal(aiProviders({ GEMINI_API_KEY: 'g', GEMINI_BILLING_DISABLED: 'yes' })[0].id, 'gemini');
  const net = fakeNet({ 'openrouter.ai': aiReply(GOOD) });
  await extractOpportunity({ docs: [{ text: DOC }], env, store, fetchImpl: net.fetchImpl, now });
  assert.deepEqual(net.hosts(), ['openrouter.ai']);
  assert.ok(net.calls.every((c) => c.body.model.endsWith(':free')));
  assert.equal(classifyAi(402, ''), 'quota');
  assert.equal(classifyAi(429, 'Please try again in 2s'), 'rate');
  assert.equal(classifyAi(400, 'The model `x` has been decommissioned'), 'model_missing');
});

test('schema validation rejects wrong types', () => {
  assert.equal(validateShape({ ...GOOD, deadline: { value: '30/12/2026', quote: 'x', source: 1 } }).ok, false);
  assert.equal(validateShape({ ...GOOD, category: { value: 'lottery', quote: 'x', source: 1 } }).ok, false);
  assert.equal(validateShape({ ...GOOD, experience_min_years: { value: '3', quote: 'x', source: 1 } }).ok, false);
  assert.equal(validateShape({ ...GOOD, is_opportunity: 'maybe' }).ok, false);
  assert.equal(validateShape([]).ok, false);
  assert.equal(validateShape(GOOD).ok, true);
  assert.ok(datesIn('Apply by 30th December, 2026 or 2026-12-31').has('2026-12-30'));
  assert.ok(quoteIn('Application   deadline: 30 December 2026', DOC));
  assert.ok(!quoteIn('deadline: 31 December 2026', DOC));
});

test('payment requests are flagged even when the AI misses them', async () => {
  const scam = `${DOC}\nSend money to bKash 01712345678 to confirm your seat.`;
  const net = fakeNet({ 'api.groq.com': aiReply(GOOD) });
  const { result } = await extractOpportunity({ docs: [{ text: scam }], env: AI_ENV, store, fetchImpl: net.fetchImpl, now });
  assert.ok(result.warnings.includes('asks_for_payment'));
});

test('unsafe links are refused before any request', () => {
  const bad = [
    'file:///etc/passwd', 'ftp://example.com/x', 'http://localhost/admin', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/',
    'http://0x7f000001/', 'http://user:pass@example.com/', 'http://example.com:8080/', 'http://intranet/', 'http://printer.local/',
  ];
  for (const url of bad) assert.throws(() => checkUrl(url), undefined, url);
  assert.equal(checkUrl('https://www.example.com/jobs#apply').href, 'https://www.example.com/jobs');
  assert.ok(isPublicIp('8.8.8.8'));
  assert.ok(!isPublicIp('100.64.1.1'));
  assert.ok(!isPublicIp('fe80::1'));
  assert.ok(isPublicIp('2606:4700:4700::1111'));
});

test('a public name that points to a private address is blocked at connection time', async () => {
  await assert.rejects(() => safeFetchPage('http://127.0.0.1.nip.io/'), (e) => ['private_ip', 'unreachable'].includes(e.code));
});

test('web pages become plain text without scripts', () => {
  const page = htmlToText('<html><head><title>Job &amp; more</title><script>alert(1)</script></head><body><nav>menu</nav><h1>Officer</h1><p>Deadline:&nbsp;30 Dec 2026</p><style>p{}</style></body></html>');
  assert.equal(page.title, 'Job & more');
  assert.match(page.text, /Officer\nDeadline: 30 Dec 2026/);
  assert.doesNotMatch(page.text, /alert|menu/);
});

const SUPA = { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'sb_publishable_testkey_0000000000' };
const authRoutes = (user = { id: 'user-1', email_confirmed_at: '2026-11-01T00:00:00Z' }, listings = []) => ({
  'db.test': ({ url, headers }) => {
    if (url.pathname === '/auth/v1/user') return headers.Authorization === 'Bearer good-token-0000000000000000' ? { json: user } : { status: 401, json: { msg: 'bad jwt' } };
    if (url.pathname === '/rest/v1/opportunities') return { json: listings };
    return { status: 404, json: {} };
  },
});
const call = (net, body, extra = {}) => handleExtract({
  method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify(body),
  env: { ...SUPA, ...AI_ENV, ...ENV3, ...extra }, deps: { fetch: net.fetchImpl, store, now, fetchPage: page },
});

test('the extract API needs a verified, signed-in user', async () => {
  const net = fakeNet({ ...authRoutes({ id: 'u', email_confirmed_at: null }), 'api.groq.com': aiReply(GOOD) });
  assert.equal((await handleExtract({ method: 'POST', headers: {}, body: '{"input":"hello world text"}', env: SUPA, deps: { fetch: net.fetchImpl, store } })).status, 401);
  assert.equal((await call(net, { input: DOC })).status, 401);
  assert.ok(!net.hosts().includes('api.groq.com'));
  assert.equal((await handleExtract({ method: 'GET', headers: {}, body: '', env: SUPA, deps: { fetch: net.fetchImpl, store } })).status, 405);
});

test('pasted text is extracted once, then served from the cache', async () => {
  const net = fakeNet({ ...authRoutes(), 'api.groq.com': aiReply(GOOD) });
  const first = await call(net, { mode: 'text', input: DOC });
  assert.equal(first.status, 200);
  assert.equal(first.body.result.deadline, '2026-12-30');
  const second = await call(net, { mode: 'text', input: `  ${DOC}  ` });
  assert.equal(second.body.cached, true);
  assert.equal(net.calls.filter((c) => c.host === 'api.groq.com').length, 1);
});

test('per-user limits stop spam', async () => {
  const net = fakeNet({ ...authRoutes(), 'api.groq.com': aiReply(GOOD) });
  assert.equal((await call(net, { mode: 'text', input: `${DOC}\nOne` }, { USER_EXTRACT_HOURLY_CAP: '1' })).status, 200);
  const blocked = await call(net, { mode: 'text', input: `${DOC}\nTwo` }, { USER_EXTRACT_HOURLY_CAP: '1' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '3600');
});

test('a malicious link is refused without fetching anything', async () => {
  const net = fakeNet({ ...authRoutes() });
  let fetched = false;
  const res = await handleExtract({
    method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify({ input: 'http://169.254.169.254/latest/meta-data' }),
    env: { ...SUPA, ...AI_ENV }, deps: { fetch: net.fetchImpl, store, now, fetchPage: async () => { fetched = true; return {}; } },
  });
  assert.equal(res.status, 422);
  assert.equal(fetched, false);
});

test('a link is read safely and extracted', async () => {
  const net = fakeNet({ ...authRoutes(), 'api.groq.com': aiReply(GOOD) });
  const res = await handleExtract({
    method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify({ input: 'https://acme.com/careers/trainee' }),
    env: { ...SUPA, ...AI_ENV }, deps: { fetch: net.fetchImpl, store, now, fetchPage: async (u) => ({ url: u, title: 'Trainee', text: DOC }) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, 'url');
  assert.equal(res.body.result.url, 'https://acme.com/careers/trainee');
});

test('a name already in Discover is answered from the database, with no search or AI', async () => {
  const listing = { id: 'abc', title: 'HENNGE Global Internship 2027', org: 'HENNGE', url: 'https://hennge.com/intern', source: 'hennge.com', category: 'internship', region: 'GLOBAL', deadline: '2026-12-31' };
  const net = fakeNet({ ...authRoutes(undefined, [listing]) });
  const res = await call(net, { input: 'HENNGE Global Internship' });
  assert.equal(res.status, 200);
  assert.equal(res.body.result.provider, 'listing');
  assert.equal(res.body.lookup.results.length, 1);
  assert.deepEqual(net.hosts(), ['db.test']);
  const web = fakeNet({ ...authRoutes(undefined, [listing]), 'api.groq.com': agent([toolReply(['finish', { answer: 'Nothing new on the web.', matches: [] }])], { opportunities: [] }) });
  const fresh = await call(web, { input: 'HENNGE Global Internship', skip_listing: true });
  assert.equal(fresh.body.lookup.found, false);
  assert.ok(web.hosts().includes('api.groq.com'));
});

const toolReply = (...calls) => ({ json: { choices: [{ message: { content: null, tool_calls: calls.map(([name, args], i) => ({ id: `call_${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }] } });
const agent = (steps, extraction) => {
  let i = 0;
  return ({ body }) => (body.tools ? steps[Math.min(i++, steps.length - 1)] : aiReply(extraction)());
};
const ACME = 'https://acme.com/job';
const acmeSearch = () => ({ json: { results: [{ url: ACME, title: 'Graduate Trainee Officer - Acme Bank', content: 'Acme Bank graduate trainee', raw_content: DOC }] } });
const acmeSteps = () => [
  toolReply(['web_search', { queries: ['Acme Bank graduate trainee', 'Acme Bank graduate trainee 2026'] }]),
  toolReply(['read_page', { urls: [ACME] }]),
  toolReply(['finish', { answer: 'Acme Bank is hiring graduate trainees in Dhaka. Apply by 30 December 2026. Results come on 15 March 2027.', matches: [ACME], from_memory: 'Acme Bank is a private bank. Its deadline is usually 5 January 2027.' }]),
];
const groqCalls = (net) => net.calls.filter((c) => c.host === 'api.groq.com');
const hostCalls = (net, host) => net.calls.filter((c) => c.host === host).length;

test('the AI drives a name lookup: it searches, reads, then answers with checked facts', async () => {
  const net = fakeNet({ ...authRoutes(), 'api.tavily.com': acmeSearch, 'api.groq.com': agent(acmeSteps(), { opportunities: [GOOD] }) });
  const res = await call(net, { input: 'Acme Bank graduate trainee' });
  assert.equal(res.status, 200);
  const l = res.body.lookup;
  assert.equal(l.found, true);
  assert.equal(l.results.length, 1);
  assert.equal(l.results[0].org, 'Acme Bank PLC');
  assert.equal(l.results[0].evidence.deadline.status, 'verified');
  assert.deepEqual(res.body.result, l.results[0]);
  assert.deepEqual(l.counts, { searches: 2, reads: 1, ai_calls: 4 });
  assert.equal(l.answer, 'Acme Bank is hiring graduate trainees in Dhaka. Apply by 30 December 2026.');
  assert.equal(l.memory, 'Acme Bank is a private bank.');
  assert.deepEqual(l.sources, [{ url: ACME, title: 'Graduate Trainee Officer - Acme Bank' }]);
  const first = groqCalls(net)[0].body;
  assert.equal(first.tool_choice, 'required');
  assert.deepEqual(first.tools.map((t) => t.function.name), ['web_search', 'finish']);
  assert.equal(first.response_format, undefined);
  assert.equal(net.calls.find((c) => c.host === 'api.tavily.com').body.time_range, undefined);
  assert.deepEqual(net.hosts().sort(), ['api.groq.com', 'api.tavily.com', 'db.test']);
});

test('the lookup never goes past its limits: 3 searches, 4 page reads, 6 AI calls', async () => {
  const urls = [1, 2, 3, 4, 5, 6].map((n) => `https://site${n}.example.org/post`);
  let fetched = 0;
  const net = fakeNet({
    ...authRoutes(),
    'api.tavily.com': () => ({ json: { results: urls.map((u, i) => ({ url: u, title: `Post ${i}`, content: 'snippet', raw_content: '' })) } }),
    'api.groq.com': agent([
      toolReply(['web_search', { queries: ['one two', 'three four', 'five six', 'seven eight'] }]),
      toolReply(['read_page', { urls }], ['web_search', { queries: ['nine ten'] }]),
      toolReply(['web_search', { queries: ['still searching'] }]),
    ], { opportunities: [GOOD] }),
  });
  const res = await handleExtract({
    method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify({ input: 'Some rare fellowship' }),
    env: { ...SUPA, ...AI_ENV, TAVILY_API_KEY: 'tvly-test' },
    deps: { fetch: net.fetchImpl, store, now, fetchPage: async (u) => { fetched += 1; return { url: u, title: 'Job', text: DOC }; } },
  });
  assert.equal(res.status, 200);
  assert.equal(hostCalls(net, 'api.tavily.com'), 3);
  assert.equal(fetched, 4);
  assert.deepEqual(res.body.lookup.counts, { searches: 3, reads: 4, ai_calls: 4 });
  const asked = groqCalls(net).filter((c) => c.body.tools).map((c) => c.body.tools.map((t) => t.function.name));
  assert.deepEqual(asked, [['web_search', 'finish'], ['read_page', 'finish'], ['finish']]);
  assert.ok(groqCalls(net).length <= 6);
  assert.equal(res.body.lookup.found, true);
});

test('the lookup stops when its 45 seconds are used up', async () => {
  let clock = NOW;
  const net = fakeNet({
    'api.tavily.com': acmeSearch,
    'api.groq.com': () => { clock += 50000; return toolReply(['web_search', { queries: ['Acme Bank graduate trainee'] }]); },
  });
  const out = await lookupOpportunity({ query: 'Acme Bank graduate trainee', env: { ...AI_ENV, ...ENV3 }, store, fetchImpl: net.fetchImpl, fetchPage: page, now: () => clock });
  assert.equal(out.lookup.found, false);
  assert.equal(out.lookup.counts.ai_calls, 1);
  assert.equal(groqCalls(net).length, 1);
});

test('only addresses from the search results can be read, whatever a page tells the AI', async () => {
  let fetched = 0;
  const net = fakeNet({
    ...authRoutes(), 'api.tavily.com': acmeSearch,
    'api.groq.com': agent([
      toolReply(['web_search', { queries: ['Acme Bank graduate trainee'] }]),
      toolReply(['read_page', { urls: ['http://169.254.169.254/latest/meta-data', 'https://evil.example/steal'] }]),
      toolReply(['finish', { answer: 'Found it.', matches: ['https://evil.example/steal'] }]),
    ], { opportunities: [GOOD] }),
  });
  const res = await handleExtract({
    method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify({ input: 'Acme Bank graduate trainee' }),
    env: { ...SUPA, ...AI_ENV, TAVILY_API_KEY: 'tvly-test' },
    deps: { fetch: net.fetchImpl, store, now, fetchPage: async () => { fetched += 1; return { text: DOC }; } },
  });
  assert.equal(res.status, 200);
  assert.equal(fetched, 0);
  assert.equal(res.body.lookup.found, false);
  assert.deepEqual(res.body.lookup.results, []);
  assert.match(groqCalls(net)[2].body.messages[1].content, /was refused/);
  assert.equal(groqCalls(net).filter((c) => !c.body.tools).length, 0);
});

test('tool calls are parsed from every shape a model may send', () => {
  const native = parseStep({ tool_calls: [{ id: 'a', type: 'function', function: { name: 'web_search', arguments: '{"queries":["cucc cse fest","CUCC CSE Fest 2026"]}' } }, { function: { name: 'read_page', arguments: { urls: ['https://fest.cucc.club'] } } }] });
  assert.deepEqual(native.value.calls, [{ tool: 'web_search', query: 'cucc cse fest' }, { tool: 'web_search', query: 'CUCC CSE Fest 2026' }, { tool: 'read_page', url: 'https://fest.cucc.club' }]);
  assert.equal(native.value.finish, null);
  const plain = parseStep({ actions: [{ do: 'search', query: 'chevening 2027' }, { do: 'read', url: 'https://www.chevening.org/apply' }, { do: 'read', url: 'javascript:alert(1)' }] });
  assert.deepEqual(plain.value.calls, [{ tool: 'web_search', query: 'chevening 2027' }, { tool: 'read_page', url: 'https://www.chevening.org/apply' }]);
  const done = parseStep({ do: 'finish', answer: 'Found  it.\nHere.', matches: ['https://a.org/1', { url: 'https://a.org/2' }, 'ftp://x', 'https://a.org/3', 'https://a.org/4'], from_memory: 'Background.' });
  assert.deepEqual(done.value.finish, { answer: 'Found it. Here.', matches: ['https://a.org/1', 'https://a.org/2', 'https://a.org/3'], memory: 'Background.' });
  const stray = parseStep({ name: 'json', arguments: { answer: 'Nothing found.', matches: [] } });
  assert.deepEqual(stray.value.finish, { answer: 'Nothing found.', matches: [], memory: '' });
  const mixed = parseStep({ name: 'web_search', arguments: { tool: 'read_page', url: 'https://a.org/1' } });
  assert.deepEqual(mixed.value.calls, [{ tool: 'read_page', url: 'https://a.org/1' }]);
  assert.equal(parseStep({ hello: 'world' }).ok, false);
  assert.equal(parseStep({ calls: [{ tool: 'delete_everything' }, { tool: 'web_search', query: 'x' }] }).ok, false);
  assert.equal(parseStep([]).ok, false);
  assert.equal(cleanAnswer('It is open. It closes on 15 March 2027. Apply by 30 December 2026.', DOC), 'It is open. Apply by 30 December 2026.');
  assert.equal(cleanMemory('It is a well known bank. The deadline is 5 January 2027. The fee is 500 taka. It started in 1999.'), 'It is a well known bank. It started in 1999.');
});

test('fields without a real quote stay empty, and an opportunity with no proof is dropped', async () => {
  const unproven = Object.fromEntries(Object.entries(GOOD).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) && v.value !== null ? { ...v, quote: 'this sentence is not on the page' } : v]));
  const lies = { ...GOOD, deadline: fact('2027-03-15', 'Application deadline: 15 March 2027'), pay: fact('BDT 90,000 per month', 'Salary: BDT 45,000 per month') };
  const net = fakeNet({ ...authRoutes(), 'api.tavily.com': acmeSearch, 'api.groq.com': agent(acmeSteps(), { opportunities: [lies, { ...unproven, steps: [] }] }) });
  const res = await call(net, { input: 'Acme Bank graduate trainee' });
  const { results } = res.body.lookup;
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Graduate Trainee Officer');
  assert.equal(results[0].deadline, null);
  assert.equal(results[0].pay, null);
  assert.equal(results[0].evidence.deadline.status, 'rejected');
  assert.equal(results[0].evidence.pay.status, 'rejected');
  assert.equal(results[0].evidence.title.status, 'verified');
});

test('when nothing is found the answer says so, and it is asked again after three hours', async () => {
  const net = fakeNet({
    ...authRoutes(), 'api.tavily.com': tavilyOk(['https://a.org/1']),
    'api.groq.com': agent([toolReply(['web_search', { queries: ['unknown thing fest'] }]), toolReply(['finish', { answer: 'I could not find any page about this.', matches: [] }])], { opportunities: [GOOD] }),
  });
  const res = await call(net, { input: 'unknown thing fest' });
  assert.equal(res.status, 200);
  assert.equal(res.body.lookup.found, false);
  assert.deepEqual(res.body.lookup.results, []);
  assert.equal(res.body.result, null);
  assert.equal(res.body.lookup.answer, 'I could not find any page about this.');
  assert.equal(groqCalls(net).filter((c) => !c.body.tools).length, 0);
  const again = await call(net, { input: 'Unknown  thing fest' });
  assert.equal(again.body.cached, true);
  assert.equal(groqCalls(net).length, 2);
  const later = await handleExtract({
    method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify({ input: 'unknown thing fest' }),
    env: { ...SUPA, ...AI_ENV, ...ENV3 }, deps: { fetch: net.fetchImpl, store, now: () => NOW + 4 * 3600 * 1000, fetchPage: page },
  });
  assert.equal(later.body.cached, false);
  assert.equal(groqCalls(net).length, 3);
});

test('live-search caps, the AI cap and an AI outage give friendly messages', async () => {
  const quiet = () => agent([toolReply(['web_search', { queries: ['Some new fellowship', 'Some new fellowship 2026'] }]), toolReply(['finish', { answer: 'Nothing found.', matches: [] }])], { opportunities: [] });
  const none = fakeNet({ ...authRoutes(), 'api.tavily.com': tavilyOk(['https://a.org/1']), 'api.groq.com': quiet() });
  const capped = await call(none, { input: 'Some new fellowship' }, { LIVE_SEARCH_DAILY_CAP: '0' });
  assert.equal(capped.status, 429);
  assert.match(capped.body.message, /free limit/);
  assert.equal(hostCalls(none, 'api.tavily.com'), 0);
  store.reset();
  const one = fakeNet({ ...authRoutes(), 'api.tavily.com': tavilyOk(['https://a.org/1']), 'api.groq.com': quiet() });
  assert.equal((await call(one, { input: 'Another new fellowship' }, { USER_SEARCH_DAILY_CAP: '1' })).status, 200);
  assert.equal(hostCalls(one, 'api.tavily.com'), 1);
  store.reset();
  const few = fakeNet({ ...authRoutes(), 'api.tavily.com': acmeSearch, 'api.groq.com': agent(acmeSteps(), { opportunities: [GOOD] }), 'openrouter.ai': aiReply({ opportunities: [GOOD] }) });
  const stopped = await call(few, { input: 'Acme Bank graduate trainee' }, { AI_DAILY_CAP: '2' });
  assert.equal(stopped.status, 503);
  assert.equal(groqCalls(few).length, 2);
  assert.equal(hostCalls(few, 'openrouter.ai'), 0);
  store.reset();
  const dead = fakeNet({ ...authRoutes(), 'api.groq.com': () => ({ status: 503, text: 'down' }), 'openrouter.ai': () => ({ status: 503, text: 'down' }) });
  const down = await call(dead, { mode: 'text', input: DOC });
  assert.equal(down.status, 503);
  assert.match(down.body.message, /temporarily unavailable/);
  const lost = await call(dead, { input: 'Some other fellowship' });
  assert.equal(lost.status, 503);
});

test('a repeated name lookup comes from the cache, and answers cached under the old key are ignored', async () => {
  await store.cachePut('extract', hashKey('extract', 'v2', 'name', 'acme bank graduate trainee'), { result: { title: 'OLD ANSWER' } });
  const net = fakeNet({ ...authRoutes(), 'api.tavily.com': acmeSearch, 'api.groq.com': agent(acmeSteps(), { opportunities: [GOOD] }) });
  const first = await call(net, { input: 'Acme Bank graduate trainee' });
  assert.equal(first.body.cached, false);
  assert.equal(first.body.result.title, 'Graduate Trainee Officer');
  const before = net.calls.length;
  const second = await call(net, { input: 'acme bank  graduate trainee' });
  assert.equal(second.body.cached, true);
  assert.equal(second.body.lookup.results.length, 1);
  assert.equal(net.calls.length, before + 1);
  const bangla = await call(net, { input: 'Acme Bank graduate trainee', lang: 'bn' });
  assert.equal(bangla.body.cached, false);
  assert.match(groqCalls(net).at(-1).body.messages[0].content, /sentences in Bangla/);
});

test('providers without tool calling get the same loop as plain JSON', async () => {
  const replies = [
    { actions: [{ do: 'search', queries: ['Acme Bank graduate trainee'] }] },
    { actions: [{ do: 'read', urls: [ACME] }] },
    { do: 'finish', answer: 'Acme Bank is hiring.', matches: [ACME], from_memory: '' },
    { opportunities: [GOOD] },
  ];
  const net = fakeNet({ ...authRoutes(), 'api.tavily.com': acmeSearch, 'openrouter.ai': ({ n }) => aiReply(replies[Math.min(n, replies.length) - 1])() });
  const res = await handleExtract({
    method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify({ input: 'Acme Bank graduate trainee' }),
    env: { ...SUPA, OPENROUTER_API_KEY: 'or-test', TAVILY_API_KEY: 'tvly-test' }, deps: { fetch: net.fetchImpl, store, now, fetchPage: page },
  });
  assert.equal(res.body.lookup.found, true);
  const first = net.calls.find((c) => c.host === 'openrouter.ai').body;
  assert.equal(first.tools, undefined);
  assert.deepEqual(first.response_format, { type: 'json_object' });
  assert.match(first.messages[0].content, /"actions"/);
});

test('a page built with JavaScript is read through the rendered-page reader, inside the Exa cap', async () => {
  const routes = () => ({
    ...authRoutes(),
    'api.tavily.com': () => ({ json: { results: [{ url: ACME, title: 'Acme', content: 'Acme Bank graduate trainee', raw_content: '' }] } }),
    'api.exa.ai': ({ url }) => (url.pathname === '/contents' ? { json: { results: [{ url: ACME, title: 'Acme', text: DOC }] } } : exaOk()),
    'api.groq.com': agent(acmeSteps(), { opportunities: [GOOD] }),
  });
  const empty = async (u) => ({ url: u, title: '', text: '' });
  const run = (net, extra = {}) => handleExtract({
    method: 'POST', headers: { authorization: 'Bearer good-token-0000000000000000' }, body: JSON.stringify({ input: 'Acme Bank graduate trainee' }),
    env: { ...SUPA, ...AI_ENV, ...ENV3, ...extra }, deps: { fetch: net.fetchImpl, store, now, fetchPage: empty },
  });
  const net = fakeNet(routes());
  const res = await run(net);
  assert.equal(res.body.lookup.found, true);
  assert.deepEqual(net.calls.filter((c) => c.host === 'api.exa.ai').map((c) => c.path), ['/contents']);
  store.reset();
  const capped = fakeNet(routes());
  const blocked = await run(capped, { EXA_MONTHLY_CAP: '0' });
  assert.equal(hostCalls(capped, 'api.exa.ai'), 0);
  assert.equal(blocked.body.lookup.found, false);
});

test('input type is detected', () => {
  assert.equal(detectMode('https://example.com/job'), 'url');
  assert.equal(detectMode('Chevening Scholarship 2027'), 'name');
  assert.equal(detectMode(DOC), 'text');
});
