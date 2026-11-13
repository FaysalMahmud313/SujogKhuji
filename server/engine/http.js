import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/i;
const TEXT_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;
export const USER_AGENT = 'SujogKhujiBot/1.0 (+https://sujogkhuji.vercel.app)';

const v4num = (ip) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);

function blockedV4(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return true;
  const n = v4num(ip);
  return V4_BLOCKS.some(([base, bits]) => {
    const start = v4num(base);
    return n >= start && n < start + 2 ** (32 - bits);
  });
}

function v6groups(ip) {
  let s = ip.toLowerCase().split('%')[0];
  let tail = [];
  const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = v4num(v4[1]);
    tail = [Math.floor(n / 65536), n % 65536];
    s = s.slice(0, -v4[1].length);
    if (s.endsWith(':') && !s.endsWith('::')) s = s.slice(0, -1);
  }
  const double = s.includes('::');
  const [head, rest] = double ? s.split('::') : [s, ''];
  const h = head ? head.split(':') : [];
  const r = double && rest ? rest.split(':') : [];
  const fill = 8 - tail.length - h.length - r.length;
  if ((!double && fill !== 0) || fill < 0) return null;
  const groups = [...h, ...Array(double ? fill : 0).fill('0'), ...r].map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN));
  if (groups.some((g) => Number.isNaN(g))) return null;
  return [...groups, ...tail];
}

const groupsToV4 = (a, b) => [a >> 8, a & 255, b >> 8, b & 255].join('.');

function blockedV6(ip) {
  const g = v6groups(ip);
  if (!g || g.length !== 8) return true;
  if (g.every((x) => x === 0)) return true;
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return blockedV4(groupsToV4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b) return blockedV4(groupsToV4(g[6], g[7]));
  if (g[0] === 0x2002) return blockedV4(groupsToV4(g[1], g[2]));
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xffc0) === 0xfe80) return true;
  if ((g[0] & 0xff00) === 0xff00) return true;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  if (g[0] === 0x2001 && g[1] < 0x0200) return true;
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;
  return false;
}

export function isPublicIp(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return !blockedV4(ip);
  if (kind === 6) return !blockedV6(ip);
  return false;
}

export class UrlError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function checkUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new UrlError('bad_url', 'That does not look like a web address.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new UrlError('bad_scheme', 'Only http and https links can be read.');
  if (url.username || url.password) throw new UrlError('credentials', 'Links with a username or password are not allowed.');
  if (url.port && !['80', '443'].includes(url.port)) throw new UrlError('bad_port', 'Links to unusual ports are not allowed.');
  if (url.href.length > 2048) throw new UrlError('too_long', 'That link is too long.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || BLOCKED_HOSTS.test(host) || !host.includes('.') && !net.isIP(host)) throw new UrlError('private_host', 'That address is not a public website.');
  if (net.isIP(host) && !isPublicIp(host)) throw new UrlError('private_ip', 'That address is not a public website.');
  url.hash = '';
  return url;
}

function guardedLookup(hostname, options, callback) {
  const opts = typeof options === 'function' ? {} : options || {};
  const cb = typeof options === 'function' ? options : callback;
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) { cb(err); return; }
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length || list.some((a) => !isPublicIp(a.address))) {
      cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
      return;
    }
    if (opts.all) cb(null, list);
    else cb(null, list[0].address, list[0].family);
  });
}

function decoderFor(type) {
  const m = /charset=["']?([\w-]+)/i.exec(type || '');
  try { return new TextDecoder(m ? m[1].toLowerCase() : 'utf-8'); } catch { return new TextDecoder('utf-8'); }
}

function requestOnce(url, { timeout, maxBytes, transport }) {
  return new Promise((resolve, reject) => {
    const lib = transport || (url.protocol === 'https:' ? https : http);
    const req = lib.request(url, {
      method: 'GET',
      lookup: guardedLookup,
      timeout,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        'Accept-Language': 'en,bn;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400) {
        res.resume();
        resolve({ status, location: res.headers.location || '' });
        return;
      }
      const type = String(res.headers['content-type'] || '');
      if (status >= 400) { res.resume(); resolve({ status, type, body: '' }); return; }
      if (type && !TEXT_TYPES.test(type)) { res.destroy(); reject(new UrlError('not_text', 'That link is not a web page (it may be a PDF or file).')); return; }
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = [];
      let size = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve({ status, type, body: decoderFor(type).decode(Buffer.concat(chunks)) });
      };
      stream.on('data', (chunk) => {
        size += chunk.length;
        chunks.push(chunk);
        if (size >= maxBytes) { finish(); res.destroy(); }
      });
      stream.on('end', finish);
      stream.on('error', (e) => { if (!done) { done = true; reject(new UrlError('read_failed', 'The page could not be read.')); } });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => {
      if (e && e.code === 'EBLOCKED') reject(new UrlError('private_ip', 'That address is not a public website.'));
      else if (e && e.code === 'ETIMEDOUT') reject(new UrlError('timeout', 'The website took too long to answer.'));
      else if (e instanceof UrlError) reject(e);
      else reject(new UrlError('unreachable', 'The website could not be reached.'));
    });
    req.end();
  });
}

export async function safeFetchPage(raw, { timeout = 8000, maxBytes = 1_500_000, maxRedirects = 3, transport } = {}) {
  let url = checkUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const res = await requestOnce(url, { timeout, maxBytes, transport });
    if (res.location !== undefined && res.status >= 300 && res.status < 400) {
      if (!res.location) throw new UrlError('bad_redirect', 'The website sent a broken redirect.');
      let next;
      try { next = checkUrl(new URL(res.location, url).href); } catch (e) { throw e instanceof UrlError ? new UrlError('unsafe_redirect', 'The link redirects somewhere that is not allowed.') : e; }
      if (url.protocol === 'https:' && next.protocol === 'http:') throw new UrlError('unsafe_redirect', 'The link redirects to an insecure address.');
      url = next;
      continue;
    }
    if (res.status >= 400) throw new UrlError('http_' + res.status, res.status === 404 ? 'That page was not found.' : 'The website refused to share that page.');
    const page = htmlToText(res.body, res.type);
    return { url: url.href, title: page.title, text: page.text };
  }
  throw new UrlError('too_many_redirects', 'The link redirects too many times.');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', taka: '৳', euro: '€', pound: '£' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, code.toLowerCase()) ? ENTITIES[code.toLowerCase()] : whole;
  });
}

export function htmlToText(body, type = 'text/html') {
  const raw = String(body || '');
  if (/^text\/plain/i.test(type)) return { title: '', text: raw.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, 60000) };
  const title = decodeEntities((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const description = decodeEntities((raw.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) || [])[1] || '').trim();
  let s = raw
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form|select|button)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|table|ul|ol|dd|dt|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<t[dh]\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s)
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean);
  const lines = [];
  for (const line of s) if (lines[lines.length - 1] !== line) lines.push(line);
  const text = [description, ...lines].filter(Boolean).join('\n').slice(0, 60000);
  return { title, text };
}

export async function requestJson(fetchImpl, url, { method = 'POST', headers = {}, body, timeout = 20000 } = {}) {
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    return { status: 0, error: e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'network', text: '', data: null, headers: new Map() };
  }
  let text = '';
  try { text = await res.text(); } catch { text = ''; }
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { status: res.status, text: text.slice(0, 200000), data, headers: res.headers };
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
