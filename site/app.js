'use strict';

const ICONS = {
  logo: '<path d="M7 17 17 7M9 7h8v8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  sparkles: '<path d="M11 3.5 12.6 8.4 17.5 10l-4.9 1.6L11 16.5l-1.6-4.9L4.5 10l4.9-1.6L11 3.5Z"/><path d="M18.5 14.5v5M16 17h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"/>',
  monitor: '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 16.5V21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6M18.5 6l-.8 13.1a2 2 0 0 1-2 1.9H8.3a2 2 0 0 1-2-1.9L5.5 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  briefcase: '<rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2.5 13h19"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  wallet: '<rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M16 12.5h.01M2.5 10h19"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
  file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z"/><path d="M14 2.5V8h5.5M15.5 13h-7M15.5 17h-7M10.5 9h-2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  sliders: '<path d="M4 6h8M18 6h2M4 12h3M13 12h7M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="17" cy="18" r="2.2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  flag: '<path d="M5 21V4M5 4h11l-1.5 4L16 12H5"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.1 7.5 9.5 4.3-1.4 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15 10.5"/>',
  bookmark: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.2L5.5 21V4.5a1 1 0 0 1 1-1Z"/>',
  note: '<path d="M5 3.5h14A1.5 1.5 0 0 1 20.5 5v9.5L15 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z"/><path d="M14.5 20.5v-5a1 1 0 0 1 1-1h5M8 8.5h8M8 12.5h4"/>',
  columns: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="16" y="4" width="5" height="14" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 7 9 6.5L21 7"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.5 11.5 8-8M16 7l3 3"/>',
  logout: '<path d="M9 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H9M16 17l5-5-5-5M21 12H9"/>',
  offline: '<path d="M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 9 5.3M5.5 12.9a10 10 0 0 1 3.1-2M18.5 12.9a10 10 0 0 0-3.6-2.3M9 16.5a5 5 0 0 1 6 0M12 20h.01M3 3l18 18"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>',
};
const icon = (name, size = 16, sw = 1.75) =>
  `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const plural = (n, one, many = one + 's') => `${n}${LANG === 'bn' ? '' : ' '}${t(n === 1 ? one : many)}`;
const safeUrl = (u) => /^https?:\/\/[^\s"'<>]+$/i.test(String(u || ''));
const isIso = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ACCENTS = { indigo: '#5E5CE6', emerald: '#047857', rose: '#E11D48', amber: '#B45309', cyan: '#0E7490' };
const REGION = { BD: 'Bangladesh', GLOBAL: 'Global' };
const CAT = { job: 'Job', internship: 'Internship', scholarship: 'Scholarship', competition: 'Hackathon / competition', program: 'Program / fellowship' };
const CAT_SHORT = { job: 'Job', internship: 'Internship', scholarship: 'Scholarship', competition: 'Competition', program: 'Program' };
const CAT_PLURAL = { ALL: 'All', job: 'Jobs', internship: 'Internships', scholarship: 'Scholarships', competition: 'Hackathons', program: 'Programs & fellowships' };
const CAT_ICON = { job: 'briefcase', internship: 'rocket', scholarship: 'cap', competition: 'trophy', program: 'star' };
const FUNDING = { full: 'Fully funded', partial: 'Partially funded' };
const JOB_TYPE = { 'full-time': 'Full-time', 'part-time': 'Part-time', contract: 'Contract', freelance: 'Freelance' };
const WORK_MODE = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
const EDUCATION = { school: 'SSC / HSC', diploma: 'Diploma', bachelor: "Bachelor's", master: "Master's", phd: 'PhD' };
const FIELD = { cse: 'CSE / IT', engineering: 'Engineering', business: 'Business', health: 'Health', science: 'Science', arts: 'Arts & social' };
const ORG_TYPE = { government: 'Government', multinational: 'Multinational', ngo: 'NGO', startup: 'Startup', university: 'University' };
const STATUS = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Rejected' };
const STATUS_TONE = { saved: 'neutral', applied: 'info', interview: 'warn', offer: 'ok', rejected: 'danger' };
const REPORT_REASONS = { scam: 'Looks like a scam', fee: 'Asks for money', expired: 'Already closed', duplicate: 'Duplicate', wrong: 'Wrong details', other: 'Something else' };
const LIMITS = { apps: 200, steps: 20, stepText: 60, notes: 2000, saved: 20 };
const USD = { USD: 1, BDT: 0.0082, EUR: 1.08, GBP: 1.27, JPY: 0.0066, INR: 0.012 };

const DAY = 86400000;
const dueAt = (iso) => new Date(String(iso).slice(0, 10) + 'T23:59:59+06:00');
const daysLeft = (iso) => Math.floor((dueAt(iso) - Date.now()) / DAY);
const isoIn = (days) => new Date(Date.now() + days * DAY + 6 * 3600 * 1000).toISOString().slice(0, 10);
const daysSince = (iso) => (isIso(String(iso).slice(0, 10)) ? Math.floor((Date.now() + 6 * 3600 * 1000 - Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z')) / DAY) : Infinity);
function fmtDate(iso, withYear = false) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString(LANG === 'bn' ? 'bn-BD' : 'en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}
function relDue(iso) {
  const n = daysLeft(iso);
  if (n < 0) return n === -1 ? t('Overdue by a day') : t('Overdue by {n} days', { n: -n });
  if (n === 0) return t('Due today');
  if (n === 1) return t('Due tomorrow');
  return t('{n} days left', { n });
}
function tone(iso) {
  const n = daysLeft(iso);
  if (n <= 1) return 'danger';
  if (n <= 3) return 'warn';
  if (n <= 7) return 'info';
  return 'neutral';
}
function ago(ms) {
  const mins = ms / 60000;
  if (!Number.isFinite(mins)) return '—';
  if (mins < 1) return t('just now');
  if (mins < 60) return t('{n} min ago', { n: Math.round(mins) });
  if (mins < 1440) return t('{n} h ago', { n: Math.round(mins / 60) });
  return t('{n} days ago', { n: Math.round(mins / 1440) });
}

function initials(name) {
  const w = String(name).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}
function hue(str) {
  let h = 7;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}
const logo = (name) => `<div class="mlogo" style="--h:${hue(name)}" aria-hidden="true">${esc(initials(name))}</div>`;

const STORE_KEY = 'obd:web:v1';
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
let stored = loadStore();

const DEFAULT_PROFILE = {
  name: '', department: 'CSE', institution: '', studyStatus: '3rd Year', gradYear: new Date().getFullYear() + 1,
  regionScope: 'ALL', experienceYears: 0, field: 'any', workMode: 'any', onboarded: false,
};
const DEFAULT_FILTERS = {
  q: '', region: 'ALL', cat: 'ALL', funding: 'any', matchExp: true, expMin: 0, expMax: 15,
  deadline: 'any', posted: 'any', jobType: [], workMode: [], country: '', education: [], field: [], orgType: [],
  hasPay: false, verified: false, hideTracked: false, sort: 'closing',
};

const sampleApplication = () => ({
  opportunity_id: 'sample-bkash-intern', title: 'Product & SWE Intern', org: 'bKash', region: 'BD', category: 'internship',
  deadline: isoIn(16), url: '', pay: null, funding: null, sample: true, status: 'applied', notes: '',
  steps_json: [{ t: 'Online application', d: isoIn(2), done: 1 }, { t: 'Aptitude test', d: isoIn(6), done: 0 }, { t: 'Final interview', d: isoIn(16), done: 0 }],
});

const cleanSteps = (steps) => (Array.isArray(steps) ? steps : [])
  .filter((s) => s && isIso(s.d))
  .slice(0, LIMITS.steps)
  .map((s) => ({ t: String(s.t || 'Step').slice(0, LIMITS.stepText), d: s.d, done: s.done ? 1 : 0 }));

const cleanApp = (r) => ({
  opportunity_id: String(r.opportunity_id).slice(0, 80), title: String(r.title).slice(0, 160), org: String(r.org || '').slice(0, 100),
  region: r.region === 'BD' ? 'BD' : 'GLOBAL', category: CAT[r.category] ? r.category : 'job',
  deadline: isIso(r.deadline) ? r.deadline : null, url: safeUrl(r.url) ? String(r.url).slice(0, 1000) : '',
  pay: r.pay ? String(r.pay).slice(0, 60) : null, funding: FUNDING[r.funding] ? r.funding : null, sample: !!r.sample,
  status: STATUS[r.status] ? r.status : 'saved', notes: String(r.notes || '').slice(0, LIMITS.notes),
  steps_json: cleanSteps(r.steps_json || r.steps), rev: typeof r.rev === 'string' ? r.rev : (typeof r.updated_at === 'string' ? r.updated_at : null),
});

const cleanSaved = (list) => (Array.isArray(list) ? list : [])
  .filter((s) => s && typeof s.name === 'string' && typeof s.query === 'string')
  .slice(0, LIMITS.saved)
  .map((s) => ({ id: String(s.id || Date.now().toString(36)).slice(0, 24), name: s.name.slice(0, 40), query: s.query.slice(0, 240) }));

function cleanProfile(p) {
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  p = p && typeof p === 'object' ? p : {};
  return {
    ...DEFAULT_PROFILE,
    name: str(p.name, 60), department: str(p.department, 30) || 'CSE', institution: str(p.institution, 160),
    studyStatus: str(p.studyStatus, 30) || DEFAULT_PROFILE.studyStatus,
    gradYear: Number(p.gradYear) >= 1970 && Number(p.gradYear) <= 2045 ? Number(p.gradYear) : DEFAULT_PROFILE.gradYear,
    regionScope: ['ALL', 'BD', 'GLOBAL'].includes(p.regionScope) ? p.regionScope : 'ALL',
    experienceYears: clampYears(p.experienceYears),
    field: FIELD[p.field] ? p.field : 'any', workMode: WORK_MODE[p.workMode] ? p.workMode : 'any',
    onboarded: !!p.onboarded,
  };
}

const clampYears = (n) => Math.max(0, Math.min(50, Math.round(Number(n) || 0)));

function stateFrom(data) {
  return {
    theme: ['system', 'light', 'dark'].includes(data.theme) ? data.theme : 'system',
    accent: ACCENTS[data.accent] ? data.accent : 'indigo',
    lang: data.lang === 'bn' ? 'bn' : 'en',
    owner: typeof data.owner === 'string' ? data.owner : null,
    profile: cleanProfile(data.profile),
    registered: Array.isArray(data.registered) ? data.registered.filter((r) => r && r.opportunity_id && r.title).slice(0, LIMITS.apps).map(cleanApp) : null,
    custom: Array.isArray(data.custom) ? data.custom.slice(0, 100) : [],
    saved: cleanSaved(data.saved),
    seen: data.seen && typeof data.seen === 'object' ? data.seen : {},
    reported: Array.isArray(data.reported) ? data.reported.filter((x) => typeof x === 'string').slice(0, 300) : [],
    trackerView: data.trackerView === 'board' ? 'board' : 'list',
    pending: {
      upsert: Array.isArray(data.pendingUpsert) ? data.pendingUpsert.filter((x) => typeof x === 'string') : [],
      remove: Array.isArray(data.pendingRemove) ? data.pendingRemove.filter((x) => typeof x === 'string') : [],
      profile: !!data.pendingProfile,
    },
  };
}

const S = {
  tab: 'discover',
  ...stateFrom(stored),
  data: { items: [], generatedAt: null, loaded: false, error: '' },
  filters: { ...DEFAULT_FILTERS },
  page: 1,
  parsed: null,
  institutions: null,
  syncing: false,
  online: navigator.onLine !== false,
};
setLang(S.lang);
S.filters.region = S.profile.regionScope || 'ALL';

const channel = 'BroadcastChannel' in window ? new BroadcastChannel('sujog') : null;
let lastWritten = '';

function saveStore({ quiet = false } = {}) {
  const data = {
    theme: S.theme, accent: S.accent, lang: S.lang, owner: S.owner, profile: S.profile, registered: S.registered, custom: S.custom,
    saved: S.saved, seen: S.seen, reported: S.reported, trackerView: S.trackerView,
    pendingUpsert: S.pending.upsert, pendingRemove: S.pending.remove, pendingProfile: S.pending.profile,
  };
  try {
    lastWritten = JSON.stringify(data);
    localStorage.setItem(STORE_KEY, lastWritten);
    if (!quiet && channel) channel.postMessage({ type: 'store' });
  } catch {
    toast(t("Couldn't save: this browser blocks storage."), { tone: 'danger' });
  }
}

function reloadStore() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch { raw = null; }
  if (!raw || raw === lastWritten) return;
  lastWritten = raw;
  let data;
  try { data = JSON.parse(raw) || {}; } catch { return; }
  const next = stateFrom(data);
  const langChanged = next.lang !== S.lang;
  Object.assign(S, next);
  if (!S.registered) S.registered = [];
  if (langChanged) { setLang(S.lang); applyI18n(); }
  fillProfile();
  renderAll();
}

if (!S.registered) {
  S.registered = [sampleApplication()];
  saveStore({ quiet: true });
}

function resetLocal() {
  S.registered = [sampleApplication()];
  S.custom = [];
  S.saved = [];
  S.seen = {};
  S.reported = [];
  S.profile = { ...DEFAULT_PROFILE };
  S.pending = { upsert: [], remove: [], profile: false };
  S.owner = null;
  S.filters = { ...DEFAULT_FILTERS };
  pushTimers.forEach((timer) => clearTimeout(timer));
  pushTimers.clear();
}

const signedIn = () => Backend.enabled && !!Backend.user && Backend.verified;

const toRow = (it) => ({
  opportunity_id: String(it.opportunity_id).slice(0, 80),
  title: String(it.title).slice(0, 160),
  org: String(it.org || '').slice(0, 100),
  region: it.region === 'BD' ? 'BD' : 'GLOBAL',
  category: CAT[it.category] ? it.category : 'job',
  deadline: isIso(it.deadline) ? it.deadline : null,
  url: safeUrl(it.url) ? String(it.url).slice(0, 1000) : '',
  pay: it.pay ? String(it.pay).slice(0, 60) : null,
  funding: FUNDING[it.funding] ? it.funding : null,
  sample: !!it.sample,
  status: STATUS[it.status] ? it.status : 'saved',
  notes: String(it.notes || '').slice(0, LIMITS.notes),
  steps: cleanSteps(it.steps_json),
});
const fromRow = (r) => cleanApp({ ...r, steps_json: r.steps, rev: r.updated_at });
const profileToRow = (p) => ({
  full_name: String(p.name || '').slice(0, 80),
  experience_years: clampYears(p.experienceYears),
  department: String(p.department || 'Other').slice(0, 30),
  institution: String(p.institution || '').slice(0, 160),
  study_status: String(p.studyStatus || '').slice(0, 30),
  grad_year: Number(p.gradYear) >= 1970 && Number(p.gradYear) <= 2045 ? Number(p.gradYear) : null,
  region_scope: ['ALL', 'BD', 'GLOBAL'].includes(p.regionScope) ? p.regionScope : 'ALL',
  field: FIELD[p.field] ? p.field : 'any',
  work_mode: WORK_MODE[p.workMode] ? p.workMode : 'any',
  lang: S.lang,
  saved_searches: cleanSaved(S.saved),
  onboarded: !!p.onboarded,
});
const profileFromRow = (r) => cleanProfile({
  name: r.full_name, experienceYears: r.experience_years, department: r.department, institution: r.institution,
  studyStatus: r.study_status, gradYear: r.grad_year, regionScope: r.region_scope, field: r.field, workMode: r.work_mode,
  onboarded: r.onboarded,
});

function queue(kind, id) {
  const other = kind === 'upsert' ? 'remove' : 'upsert';
  S.pending[other] = S.pending[other].filter((x) => x !== id);
  if (!S.pending[kind].includes(id)) S.pending[kind].push(id);
  saveStore();
}
const unqueue = (kind, id) => { S.pending[kind] = S.pending[kind].filter((x) => x !== id); };

function mergeApps(local, remote) {
  const steps = new Map();
  for (const s of cleanSteps(remote.steps_json)) steps.set(`${s.t}|${s.d}`, { ...s });
  for (const s of cleanSteps(local.steps_json)) {
    const key = `${s.t}|${s.d}`;
    const other = steps.get(key);
    steps.set(key, { ...s, done: s.done || (other && other.done) ? 1 : 0 });
  }
  const merged = [...steps.values()].sort((a, b) => a.d.localeCompare(b.d)).slice(0, LIMITS.steps);
  return { ...remote, ...local, steps_json: merged, notes: local.notes || remote.notes, rev: remote.rev };
}

const pushTimers = new Map();
let syncNoticeAt = 0;

function syncNotice(e) {
  if (Date.now() - syncNoticeAt < 15000) return;
  syncNoticeAt = Date.now();
  if (/at most 200/.test(e.detail || '')) toast(t('You can track at most {n} applications.', { n: LIMITS.apps }), { tone: 'warn' });
  else toast(t('Saved on this device. It will sync when the connection is back.'), { tone: 'warn' });
}

async function flushApp(id) {
  if (!signedIn()) return;
  const it = S.registered.find((r) => r.opportunity_id === id);
  if (!it || it.sample) { unqueue('upsert', id); return; }
  const filter = `/applications?opportunity_id=eq.${encodeURIComponent(id)}`;
  const stamp = (rows) => {
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return false;
    const now = S.registered.find((r) => r.opportunity_id === id);
    if (now) now.rev = row.updated_at;
    return true;
  };
  try {
    let done = false;
    if (it.rev) {
      done = stamp(await Backend.rest(`${filter}&updated_at=eq.${encodeURIComponent(it.rev)}`, { method: 'PATCH', body: toRow(it), prefer: 'return=representation' }));
    } else {
      done = stamp(await Backend.rest('/applications?on_conflict=user_id,opportunity_id', { method: 'POST', body: toRow(it), prefer: 'resolution=ignore-duplicates,return=representation' }));
    }
    if (!done) {
      const rows = await Backend.rest(`${filter}&select=*`);
      const current = S.registered.find((r) => r.opportunity_id === id);
      if (!current) return;
      if (rows.length) {
        const merged = mergeApps(current, fromRow(rows[0]));
        Object.assign(current, merged);
        stamp(await Backend.rest(`${filter}&updated_at=eq.${encodeURIComponent(merged.rev)}`, { method: 'PATCH', body: toRow(current), prefer: 'return=representation' }));
        renderTracker();
      } else {
        current.rev = null;
        stamp(await Backend.rest('/applications?on_conflict=user_id,opportunity_id', { method: 'POST', body: toRow(current), prefer: 'resolution=merge-duplicates,return=representation' }));
      }
    }
    unqueue('upsert', id);
    saveStore();
  } catch (e) {
    if (!signedIn()) return;
    queue('upsert', id);
    syncNotice(e);
  }
}

function pushApp(id, { now = false } = {}) {
  saveStore();
  if (!signedIn()) return;
  clearTimeout(pushTimers.get(id));
  if (now) { pushTimers.delete(id); flushApp(id); return; }
  pushTimers.set(id, setTimeout(() => { pushTimers.delete(id); flushApp(id); }, 600));
}

async function dropApp(id) {
  clearTimeout(pushTimers.get(id));
  pushTimers.delete(id);
  saveStore();
  if (!signedIn()) return;
  try {
    await Backend.rest(`/applications?opportunity_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
    unqueue('remove', id);
    saveStore();
  } catch (e) {
    if (!signedIn()) return;
    queue('remove', id);
    syncNotice(e);
  }
}

async function pushProfile() {
  saveStore();
  if (!signedIn()) return;
  try {
    await Backend.rest(`/profiles?id=eq.${encodeURIComponent(Backend.user.id)}`, { method: 'PATCH', body: profileToRow(S.profile), prefer: 'return=minimal' });
    S.pending.profile = false;
    saveStore();
  } catch (e) {
    if (!signedIn()) return;
    S.pending.profile = true;
    saveStore();
    syncNotice(e);
  }
}

let flushing = false;
async function flushPending() {
  if (flushing || !signedIn() || S.syncing) return;
  if (!S.pending.upsert.length && !S.pending.remove.length && !S.pending.profile) return;
  flushing = true;
  try {
    for (const id of [...S.pending.remove]) await dropApp(id);
    for (const id of [...S.pending.upsert]) await flushApp(id);
    if (S.pending.profile) await pushProfile();
  } finally {
    flushing = false;
    renderChrome();
  }
}

function parkTimers() {
  if (!pushTimers.size) return;
  for (const [id, timer] of pushTimers) {
    clearTimeout(timer);
    if (!S.pending.upsert.includes(id)) S.pending.upsert.push(id);
  }
  pushTimers.clear();
  saveStore({ quiet: true });
}

const hasGuestData = () => S.registered.some((r) => !r.sample && !r.rev) || S.profile.onboarded || S.saved.length > 0;

async function loadAccount() {
  if (!signedIn()) return;
  const uid = Backend.user.id;
  if (S.owner && S.owner !== uid) resetLocal();
  let moved = false;
  if (!S.owner) {
    S.registered = S.registered.filter((r) => r.sample || !r.rev);
    if (hasGuestData()) {
      moved = await askMove(Backend.user.email);
      if (!signedIn() || Backend.user.id !== uid) return;
      if (!moved) resetLocal();
    }
    S.owner = uid;
    saveStore();
  }
  S.syncing = true;
  renderChrome();
  try {
    const [profiles, rows, reports] = await Promise.all([
      Backend.rest(`/profiles?id=eq.${encodeURIComponent(uid)}&select=*`),
      Backend.rest(`/applications?select=*&order=created_at.asc&limit=${LIMITS.apps}`),
      Backend.rest('/reports?select=opportunity_id&limit=300').catch(() => []),
    ]);
    const remote = new Map(rows.map((r) => [r.opportunity_id, fromRow(r)]));
    const removed = new Set(S.pending.remove);
    for (const id of removed) {
      if (remote.has(id)) {
        await Backend.rest(`/applications?opportunity_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
        remote.delete(id);
      }
    }
    S.pending.remove = [];
    const pending = new Set(S.pending.upsert);
    const next = [];
    const upload = [];
    for (const local of S.registered) {
      if (local.sample || removed.has(local.opportunity_id)) continue;
      const theirs = remote.get(local.opportunity_id);
      if (theirs) {
        if (pending.has(local.opportunity_id)) { next.push(mergeApps(local, theirs)); upload.push(local.opportunity_id); }
        else next.push(theirs);
        remote.delete(local.opportunity_id);
      } else if (!local.rev) {
        next.push(local);
        upload.push(local.opportunity_id);
      }
    }
    S.registered = [...next, ...remote.values()].slice(0, LIMITS.apps);
    S.pending.upsert = upload;
    S.reported = [...new Set([...(Array.isArray(reports) ? reports.map((r) => r.opportunity_id) : []), ...S.reported])].slice(0, 300);

    const row = profiles[0];
    if (!row) {
      await Backend.rest('/profiles', { method: 'POST', body: { id: uid, ...profileToRow(S.profile) }, prefer: 'return=minimal' });
    } else if ((moved && S.profile.onboarded && !row.onboarded) || S.pending.profile) {
      await Backend.rest(`/profiles?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', body: profileToRow(S.profile), prefer: 'return=minimal' });
    } else {
      S.profile = profileFromRow(row);
      const theirs = cleanSaved(row.saved_searches);
      const names = new Set(theirs.map((s) => s.name));
      S.saved = [...theirs, ...(moved ? S.saved.filter((s) => !names.has(s.name)) : [])].slice(0, LIMITS.saved);
      if (row.lang === 'bn' || row.lang === 'en') {
        if (row.lang !== S.lang) { S.lang = row.lang; setLang(S.lang); applyI18n(); }
      }
    }
    S.pending.profile = false;
    S.filters.region = S.profile.regionScope || 'ALL';
    saveStore();
    fillProfile();
    for (const id of upload) await flushApp(id);
  } catch (e) {
    if (signedIn()) toast(t("Couldn't load your account. Showing what is saved on this device."), { tone: 'danger' });
  } finally {
    S.syncing = false;
    renderAll();
  }
}

function clearAccountData() {
  resetLocal();
  saveStore();
  fillProfile();
  renderAll();
}

const allOpps = () => [...S.custom, ...S.data.items];
const isOpen = (o) => !o.deadline || daysLeft(o.deadline) >= 0;
const visibleOpps = () => allOpps().filter((o) => isOpen(o) && !S.reported.includes(o.id));
const isTracked = (id) => S.registered.some((r) => r.opportunity_id === id);
const openSteps = (it) => (it.steps_json || []).filter((s) => !s.done);
const nextStep = (it) => openSteps(it).sort((a, b) => a.d.localeCompare(b.d))[0] || null;

function toast(msg, { tone = 'default', action, onAction, timeout = 4000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  const ic = { warn: 'bell', danger: 'alert', ok: 'check' }[tone] || 'info';
  el.innerHTML = `<span class="ti">${icon(ic, 16)}</span><span class="msg">${esc(msg)}</span>`;
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action;
    b.addEventListener('click', () => { onAction?.(); close(); });
    el.appendChild(b);
  }
  const wrap = $('#toasts');
  const host = $('dialog[open]:modal') || document.body;
  if (wrap.parentElement !== host) host.appendChild(wrap);
  wrap.appendChild(el);
  while (wrap.children.length > 4) wrap.firstElementChild.remove();
  setTimeout(close, timeout);
}

const mq = window.matchMedia('(prefers-color-scheme: dark)');
const resolvedTheme = () => (S.theme === 'system' ? (mq.matches ? 'dark' : 'light') : S.theme);
function applyTheme() {
  const root = document.documentElement;
  const mode = resolvedTheme();
  root.setAttribute('data-theme', mode);
  root.style.setProperty('--accent', ACCENTS[S.accent]);
  $('meta[name="theme-color"]').setAttribute('content', mode === 'dark' ? '#09090B' : '#F7F7F8');
  $('#themeBtn').innerHTML = icon(mode === 'dark' ? 'sun' : 'moon', 17);
  $$('#pTheme button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.theme));
  $$('#pLang button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.lang));
  $$('#pAccent .swatch').forEach((b) => b.classList.toggle('on', b.dataset.v === S.accent));
}
mq.addEventListener?.('change', () => S.theme === 'system' && applyTheme());

const TAB_TITLES = { discover: 'Discover', tracker: 'My applications', import: 'Add from text', profile: 'Profile & settings' };
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const cut = raw.indexOf('?');
  return { tab: cut < 0 ? raw : raw.slice(0, cut), query: cut < 0 ? '' : raw.slice(cut + 1) };
}
function go(tab, { push = true } = {}) {
  if (!TAB_TITLES[tab]) tab = 'discover';
  S.tab = tab;
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${tab}`));
  $$('.nav-item, .tabbar button').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#crumbPage').textContent = t(TAB_TITLES[tab]);
  document.title = `${t(TAB_TITLES[tab])} · SujogKhuji`;
  if (push) syncUrl();
  window.scrollTo({ top: 0 });
  if (tab === 'profile') loadInstitutions();
}
function syncUrl() {
  const query = S.tab === 'discover' ? filtersToQuery(S.filters) : '';
  const hash = `#/${S.tab}${query ? `?${query}` : ''}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

const validItem = (o) => o && typeof o.id === 'string' && typeof o.title === 'string' && o.title && safeUrl(o.url);

async function loadData() {
  try {
    if (Backend.enabled) {
      try {
        const rows = await Backend.rest('/opportunities?select=*&order=deadline.asc.nullslast&limit=2000', { anon: true });
        if (Array.isArray(rows) && rows.length) {
          S.data.items = rows.filter(validItem);
          const newest = rows.map((r) => Date.parse(r.updated_at || r.checked || 0)).filter(Boolean).sort((a, b) => b - a)[0];
          S.data.generatedAt = newest ? new Date(newest).toISOString() : null;
          S.data.error = '';
          return;
        }
      } catch { }
    }
    const res = await fetch('data/opportunities.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status === 404 ? t('No listings have been collected yet.') : t('The listings could not be loaded.'));
    const json = await res.json();
    S.data.items = (Array.isArray(json.items) ? json.items : []).filter(validItem);
    S.data.generatedAt = json.generated_at || null;
    S.data.error = '';
  } catch (e) {
    S.data.error = navigator.onLine === false ? t('You are offline.') : (e.message || t('The listings could not be loaded.'));
  } finally {
    S.data.loaded = true;
    renderAll();
  }
}

function urgentSteps() {
  return S.registered
    .filter((it) => it.status !== 'rejected')
    .flatMap((it) => openSteps(it).map((s) => ({ s, it, idx: it.steps_json.indexOf(s) })))
    .filter(({ s }) => { const n = daysLeft(s.d); return n >= -1 && n <= 3; })
    .sort((a, b) => a.s.d.localeCompare(b.s.d));
}

const userYears = () => clampYears(S.profile.experienceYears);
const experienceText = (y = userYears()) => (y === 0 ? t('Fresher') : y === 1 ? t('1 yr experience') : t('{n} yrs experience', { n: y }));

function renderChrome() {
  $('#countTracker').textContent = S.registered.length || '';
  $('#countDiscover').textContent = visibleOpps().length || '';
  $('#bellBtn').classList.toggle('has-alert', urgentSteps().length > 0);
  $('#offlineBar').hidden = S.online;
  const p = S.profile;
  const inst = (String(p.institution).match(/\(([^)]+)\)\s*$/)?.[1] || p.institution || '').split(' - ')[0];
  const sub = [experienceText(), inst, p.department].filter(Boolean).join(' · ');
  const who = p.name || (signedIn() ? Backend.user.email : t('Set up your profile'));
  const waiting = S.pending.upsert.length + S.pending.remove.length + (S.pending.profile ? 1 : 0);
  const busy = S.syncing || waiting > 0;
  const sync = signedIn() ? `<i class="sync-dot ${busy ? 'busy' : ''}" title="${esc(busy ? t('Syncing…') : t('Synced to your account'))}"></i>` : '';
  $('#userCard').innerHTML = `<span class="avatar">${esc(initials(p.name || (signedIn() ? Backend.user.email : 'You')))}${sync}</span><span><b>${esc(who)}</b><small>${esc(sub)}</small></span>`;
  $('#profileIntro').textContent = signedIn()
    ? t('Signed in as {email}. Your profile and applications sync to your account.', { email: Backend.user.email })
    : t('Saved in this browser. Create an account to use it on your phone and PC.');
  $('#trackerIntro').textContent = signedIn()
    ? t("Every step you've committed to, ordered by what's due next. Synced to your account.")
    : t("Every step you've committed to, ordered by what's due next. Saved on this device.");
  const d = S.data;
  let status;
  if (!d.loaded) status = `<span class="status-dot"></span><span><b>${esc(t('Loading listings…'))}</b><small>&nbsp;</small></span>`;
  else if (d.error && !d.items.length) status = `<span class="status-dot off"></span><span><b>${esc(t('No listings yet'))}</b><small>${esc(d.error)}</small></span>`;
  else status = `<span class="status-dot on"></span><span><b>${esc(plural(d.items.filter(isOpen).length, 'open listing'))}</b><small>${esc(t('Updated {when} · from the web', { when: d.generatedAt ? ago(Date.now() - Date.parse(d.generatedAt)) : '—' }))}</small></span>`;
  $('#dataStatus').innerHTML = status;
}
