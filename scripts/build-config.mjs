import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const local = process.argv.includes('--local');
const env = process.env;

const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = String(env.SUPABASE_ANON_KEY || '').trim();
const turnstile = String(env.TURNSTILE_SITE_KEY || '').trim();

function stop(message) {
  console.error(message);
  process.exit(1);
}

function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role || null;
  } catch {
    return null;
  }
}

function stampServiceWorker() {
  const file = join(site, 'sw.js');
  const version = String(env.VERCEL_GIT_COMMIT_SHA || env.COMMIT_REF || env.GITHUB_SHA || '').slice(0, 8) || Date.now().toString(36);
  const text = readFileSync(file, 'utf8');
  if (text.includes("'obd-dev'")) writeFileSync(file, text.replace("'obd-dev'", `'sk-${version}'`));
}

if (!url || !key) {
  console.log('Supabase variables are not set, so the site is built in guest mode (data stays in each browser).');
  if (!local) stampServiceWorker();
  process.exit(0);
}

const localUrl = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(url) && !(local && localUrl)) {
  stop('SUPABASE_URL must look like https://your-project.supabase.co');
}
if (key.length < 20 || key.startsWith('sb_secret_') || key.includes('service_role')) {
  stop('SUPABASE_ANON_KEY must be the public anon / publishable key, never the secret key.');
}
const role = jwtRole(key);
if (key.split('.').length === 3 && role !== 'anon') {
  stop('SUPABASE_ANON_KEY is not the anon key. Copy the anon / publishable key instead.');
}
if (turnstile && !/^[0-9A-Za-z_-]{10,80}$/.test(turnstile)) {
  stop('TURNSTILE_SITE_KEY does not look like a Turnstile site key.');
}
for (const name of ['SEND_EMAIL_HOOK_SECRET', 'SMTP_APP_PASSWORD', 'MAIL_RPC_SECRET', 'INGEST_SECRET', 'TAVILY_API_KEY']) {
  const secret = String(env[name] || '').trim();
  if (secret && (key === secret || turnstile === secret)) stop(`${name} was put in a public setting. Fix the environment variables.`);
}

const config = { supabaseUrl: url, supabaseAnonKey: key, turnstileSiteKey: turnstile };
writeFileSync(join(site, 'config.js'), `window.SUJOG_CONFIG = ${JSON.stringify(config)};\n`);

if (!local) {
  for (const name of ['index.html']) {
    const file = join(site, name);
    const page = readFileSync(file, 'utf8');
    writeFileSync(file, page.replace('connect-src \'self\' https://*.supabase.co', `connect-src 'self' ${url}`));
  }
  stampServiceWorker();
}

console.log(`Accounts are switched on for ${url}${turnstile ? ' with Turnstile' : ' (no CAPTCHA key set)'}.`);
