import { searchWeb } from '../server/engine/search.js';
import { extractOpportunity } from '../server/engine/extract.js';
import { aiProviders, rejectedPaidModels } from '../server/engine/ai.js';
import { makeStore, capFrom } from '../server/engine/store.js';
import { mapLimit } from '../server/engine/http.js';

const say = (msg) => process.stderr.write(`${msg}\n`);

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function main() {
  const job = await readStdin();
  const env = process.env;
  const store = makeStore(env);
  if (job.command === 'status') {
    const paid = rejectedPaidModels(env);
    return { search: ['tavily', 'serper', 'exa'].filter((p) => env[`${p.toUpperCase()}_API_KEY`]), ai: aiProviders(env).map((p) => p.id), ignored_paid_models: paid, store: store.kind };
  }
  if (job.command === 'search') {
    const out = [];
    for (const q of Array.isArray(job.queries) ? job.queries : []) {
      const res = await searchWeb(q.q, { env, store, maxResults: q.max || 15, range: q.range || 'month', withContent: true, useCache: false });
      out.push({ q: q.q, provider: res.provider, results: res.results, attempts: res.attempts, unavailable: !!res.unavailable });
      say(`search ${res.provider || 'none'} (${res.results.length}): ${q.q}${res.provider ? '' : `  [${res.attempts.map((a) => `${a.provider}:${a.outcome}`).join(', ')}]`}`);
    }
    return { results: out };
  }
  if (job.command === 'extract') {
    const items = (Array.isArray(job.items) ? job.items : []).slice(0, capFrom(env, 'AI_MAX_PER_RUN', 25));
    if (!aiProviders(env).length) { say('ai: no free AI provider configured, skipped'); return { results: [] }; }
    let stopped = false;
    const results = await mapLimit(items, 2, async (it) => {
      if (stopped) return { id: it.id, skipped: true };
      const out = await extractOpportunity({ docs: [{ url: it.url, title: it.title, text: it.text }], env, store, budget: 9000 });
      if (out.unavailable) {
        stopped = true;
        say(`ai: free providers unavailable, stopping (${out.attempts.map((a) => `${a.provider}:${a.outcome}`).join(', ')})`);
        return { id: it.id, skipped: true };
      }
      return { id: it.id, result: out.result || null };
    });
    say(`ai: checked ${results.filter((r) => r.result).length} of ${items.length} new listings`);
    return { results };
  }
  throw new Error('unknown command');
}

main().then((out) => {
  process.stdout.write(JSON.stringify(out));
}).catch((e) => {
  say(`engine failed: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
