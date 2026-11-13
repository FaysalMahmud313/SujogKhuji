'use strict';

const KNOWN_ORGS = { bkash: 'bKash Limited', unilever: 'Unilever Bangladesh', grameenphone: 'Grameenphone', robi: 'Robi Axiata', chaldal: 'Chaldal', pathao: 'Pathao', google: 'Google', microsoft: 'Microsoft', erasmus: 'Erasmus Mundus', mext: 'MEXT Japan', fulbright: 'Fulbright', chevening: 'Chevening', daad: 'DAAD', nasa: 'NASA', hennge: 'HENNGE' };
const SAMPLES = {
  erasmus: () => `Erasmus Mundus Joint Master Degree Scholarship (Europe - Global).
Full tuition + travel + monthly stipend of €1,400/mo. Fully funded. Eligible: ALL departments.
Required Documents: Upload Transcript by ${isoIn(10)}, SOP & 2 LORs by ${isoIn(24)}.`,
};

function localParse(raw) {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const has = (...w) => w.some((x) => new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(lower));
  const BD = ['dhaka', 'bangladesh', 'chattogram', 'chittagong', 'sylhet', 'rajshahi', 'khulna', 'bkash', 'grameenphone', 'robi', 'pathao', 'bdt', '৳', 'taka'];
  const GL = ['worldwide', 'europe', 'global', 'usa', 'japan', 'remote'];
  const region = BD.some((h) => lower.includes(h)) && !GL.some((h) => lower.includes(h)) ? 'BD' : 'GLOBAL';
  let category = 'job';
  if (has('hackathon', 'contest', 'competition', 'olympiad', 'challenge')) category = 'competition';
  else if (has('scholar', 'mext', 'erasmus', 'fulbright', 'chevening', 'bursary')) category = 'scholarship';
  else if (has('fellowship', 'exchange program', 'summer school', 'conference', 'summit', 'bootcamp')) category = 'program';
  else if (has('intern')) category = 'internship';
  const funding = /fully[- ]funded|full scholarship|full tuition/i.test(text) ? 'full' : /partial(ly)?[- ]funded|tuition (fee )?waiver/i.test(text) ? 'partial' : null;
  const sal = text.match(/(৳\s?\d[\d,.]*\s?k?(?:\s?\/\s?mo(?:nth)?)?|BDT\s?\d[\d,.]*\s?k?|\$\s?\d[\d,.]*\s?k?(?:\s?\/\s?mo(?:nth)?)?|€\s?\d[\d,.]*\s?k?(?:\s?\/\s?mo(?:nth)?)?)/i);
  const firstLine = text.split('\n')[0] || '';
  let org = Object.entries(KNOWN_ORGS).find(([k]) => lower.includes(k))?.[1];
  if (!org) {
    const m = firstLine.match(/^\s*([A-Z][\w&.'\- ]{1,40}?)\s+(?:is hiring|is looking|invites|announces|presents|—|-)/);
    org = m ? m[1].trim() : firstLine.split(/\s+/).slice(0, 3).join(' ') || 'Unknown organisation';
  }
  let title = null;
  const hm = firstLine.match(/hiring\s+(?:an?\s+)?(.+?)(?:\s+in\s+|\s+[—–-]\s+|[.!]|$)/i);
  if (hm) title = hm[1].trim().replace(/Interns$/i, 'Intern');
  if (!title) {
    let cand = firstLine.split(/\s[—–-]\s|\(|[.!]/)[0].trim();
    const key = Object.keys(KNOWN_ORGS).find((k) => cand.toLowerCase().includes(k)) || org.toLowerCase();
    for (const needle of [org.toLowerCase(), key]) {
      const pos = cand.toLowerCase().indexOf(needle);
      if (pos >= 0 && pos <= 30) { cand = cand.slice(pos + needle.length).replace(/^[\s/,:-]+|[\s/,:-]+$/g, ''); break; }
    }
    if (cand.length >= 4 && cand.length <= 60) title = cand;
  }
  title = title || { internship: 'Internship', scholarship: 'Scholarship', competition: 'Competition', program: 'Program' }[category] || 'Job opening';
  const steps = [];
  const seen = new Set();
  for (const m of text.matchAll(/([A-Za-z][A-Za-z0-9 &/+\-]{2,40}?)\s+(?:by|on|before|until|due|deadline)?\s*:?\s*(\d{4}-\d{2}-\d{2})/gi)) {
    const label = m[1].trim().replace(/^(?:steps?|deadlines?|required documents?|and)\s*:?\s*/i, '').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
    const key = `${label.toLowerCase()}|${m[2]}`;
    if (!label || /deadline/i.test(m[0]) || seen.has(key)) continue;
    seen.add(key);
    steps.push({ t: (label[0].toUpperCase() + label.slice(1)).slice(0, 40), d: m[2] });
  }
  const dates = (text.match(/\d{4}-\d{2}-\d{2}/g) || []).sort();
  const dl = text.match(/deadline\s*:?\s*(\d{4}-\d{2}-\d{2})/i);
  const deadline = dl ? dl[1] : dates[dates.length - 1] || null;
  if (!steps.length && deadline) steps.push({ t: 'Apply', d: deadline });
  steps.sort((a, b) => a.d.localeCompare(b.d));
  return { title: title.slice(0, 80), org: org.slice(0, 50), region, category, funding, pay: sal ? sal[1].trim() : null, deadline, steps_json: steps };
}

const inputKind = (raw) => {
  const v = raw.trim();
  if (/^https?:\/\/\S+$/i.test(v)) return 'url';
  if (!/\n/.test(v) && v.length <= 150 && v.split(/\s+/).length <= 16) return 'name';
  return 'text';
};
const aiReady = () => Backend.enabled && signedIn();
const RED_FLAGS = ['asks_for_payment', 'whatsapp_only', 'guaranteed_result'];

function fromAi(r, raw, kind) {
  const rules = kind === 'text' ? localParse(raw) : null;
  return {
    title: r.title || (rules && rules.title) || t('Opportunity'),
    org: r.org || '',
    region: r.region || (rules && rules.region) || 'GLOBAL',
    category: CAT[r.category] ? r.category : (rules && rules.category) || 'job',
    funding: FUNDING[r.funding] ? r.funding : null,
    pay: r.pay || null,
    deadline: isIso(r.deadline) ? r.deadline : null,
    steps_json: (Array.isArray(r.steps_json) ? r.steps_json : []).filter((s) => s && isIso(s.d)).map((s) => ({ t: String(s.t || 'Step').slice(0, 60), d: s.d })),
    country: r.country || null,
    exp_min: Number.isInteger(r.exp_min) ? r.exp_min : null,
    exp_max: Number.isInteger(r.exp_max) ? r.exp_max : null,
    level: r.level || null,
    job_type: JOB_TYPE[r.job_type] ? r.job_type : null,
    work_mode: WORK_MODE[r.work_mode] ? r.work_mode : null,
    education: EDUCATION[r.education] ? r.education : null,
    field: FIELD[r.field] ? r.field : null,
    org_type: ORG_TYPE[r.org_type] ? r.org_type : null,
    url: safeUrl(r.url) ? r.url : '',
    summary: '',
    evidence: r.evidence && typeof r.evidence === 'object' ? r.evidence : {},
    warnings: Array.isArray(r.warnings) ? r.warnings.filter((w) => typeof w === 'string').slice(0, 6) : [],
    engine: r.provider === 'listing' ? 'listing' : 'ai',
  };
}

function setParsing(on) {
  S.parsing = on;
  const btn = $('#parseBtn');
  btn.disabled = on;
  btn.classList.toggle('is-busy', on);
  btn.setAttribute('aria-busy', String(on));
  $('#rawInput').readOnly = on;
}

async function runParse() {
  if (S.parsing) return;
  const raw = $('#rawInput').value.trim();
  if (!raw) { toast(t('Paste some text, a link or an opportunity name first.'), { tone: 'warn' }); $('#rawInput').focus(); return; }
  const kind = inputKind(raw);
  if (!aiReady()) {
    if (kind === 'text') { S.parsed = { ...localParse(raw), engine: 'rules' }; renderImport(); return; }
    toast(t(kind === 'url' ? 'Sign in to read a link with AI. You can also paste the text of the announcement.' : 'Sign in to look up an opportunity by name. You can also paste the text of the announcement.'), Backend.enabled ? { tone: 'warn', action: t('Sign in'), onAction: () => openAuth('signin'), timeout: 7000 } : { tone: 'warn', timeout: 7000 });
    return;
  }
  setParsing(true);
  try {
    const res = await Backend.callApi('/api/extract', { mode: kind, input: raw });
    S.parsed = fromAi(res.result || {}, raw, kind);
  } catch (e) {
    if (kind === 'text') {
      S.parsed = { ...localParse(raw), engine: 'rules' };
      toast(`${e.message} ${t('Showing a basic reading instead.')}`, { tone: 'warn', timeout: 8000 });
    } else {
      toast(e.message, { tone: 'warn', timeout: 8000 });
    }
  } finally {
    setParsing(false);
    renderImport();
  }
}

const evidenceTip = (p, field) => {
  const e = p.evidence && p.evidence[field];
  return e && e.status === 'verified' && e.quote ? ` title="${esc(`“${e.quote}”${e.url ? ` — ${e.url}` : ''}`)}"` : '';
};

function parsedNotice(p) {
  if (p.engine === 'rules') return t('Pulled out with simple rules. Check the fields against the original before tracking it.');
  if (p.engine === 'listing') return t('This opportunity is already in Discover. These details come from that listing.');
  const w = p.warnings || [];
  if (w.some((x) => RED_FLAGS.includes(x))) return t('Warning: this announcement asks for money, uses WhatsApp only or promises a guaranteed result. Real employers and scholarships never charge you to apply.');
  if (w.includes('expired')) return t('The deadline written in the source has already passed.');
  if (w.includes('not_an_opening')) return t('This does not look like one specific opening. Check the source before tracking it.');
  return t('Every value below was checked against the source text. Hover over a value to see the quote. Anything not written in the source is left empty.');
}

function renderImport() {
  $('#charCount').textContent = t('{n} characters', { n: $('#rawInput').value.length.toLocaleString() });
  $('#sourcePill').textContent = aiReady() ? t('Sent to a free AI service to read') : t('Stays on your device');
  const box = $('#parseResult');
  const p = S.parsed;
  if (!p) {
    box.innerHTML = `<div class="panel-head"><h2>${esc(t('Result'))}</h2></div><div class="panel-body">
      <div class="empty empty-plain">
        <div class="em-icon">${icon('file', 20)}</div>
        <h3>${esc(t('Nothing extracted yet'))}</h3>
        <p>${esc(t('The title, organisation, funding, pay and every dated step will appear here.'))}</p>
      </div></div>`;
    return;
  }
  box.innerHTML = `
    <div class="panel-head"><h2>${esc(t('Result'))}</h2><span class="engine-pill">${icon(p.engine === 'rules' ? 'check' : 'sparkles', 14)}${esc(p.engine === 'rules' ? t('Read in your browser') : p.engine === 'listing' ? t('From Discover') : t('Read by AI, checked against the source'))}</span></div>
    <div class="panel-body">
      <div class="notice">${icon((p.warnings || []).some((x) => RED_FLAGS.includes(x)) ? 'alert' : 'info', 15)}<span>${esc(parsedNotice(p))}</span></div>
      <div class="app-head parsed-head">
        ${logo(p.org)}
        <div class="app-ttl"><h3 class="wrap">${esc(p.title)}</h3><div class="sub">${esc(p.org)}</div></div>
        ${p.deadline ? `<span class="due t-${tone(p.deadline)}"><i></i>${esc(relDue(p.deadline))}</span>` : ''}
      </div>
      <dl class="kv">
        <dt>${esc(t('Region'))}</dt><dd${evidenceTip(p, 'country')}>${esc(p.country || t(REGION[p.region]))}</dd>
        <dt>${esc(t('Category'))}</dt><dd${evidenceTip(p, 'category')}>${esc(t(CAT[p.category]))}</dd>
        <dt>${esc(t('Funding'))}</dt><dd${evidenceTip(p, 'funding')}>${esc(FUNDING[p.funding] ? t(FUNDING[p.funding]) : t('Not stated'))}</dd>
        <dt>${esc(t('Pay'))}</dt><dd${evidenceTip(p, 'pay')}>${esc(p.pay || t('Not stated'))}</dd>
        <dt>${esc(t('Deadline'))}</dt><dd class="num"${evidenceTip(p, 'deadline')}>${esc(p.deadline ? fmtDate(p.deadline, true) : t('Not found'))}</dd>
      </dl>
      <div class="section-label">${esc(t('Steps'))}</div>
      ${p.steps_json.length ? `<ol class="timeline">${p.steps_json.map((s) => `<li><span>${esc(s.t)}</span><span class="mono muted">${esc(fmtDate(s.d))}</span></li>`).join('')}</ol>` : `<p class="muted small">${esc(t('No dated steps found. Add them after tracking.'))}</p>`}
    </div>
    <div class="panel-foot panel-foot-end">
      <button type="button" class="btn btn-secondary" data-action="publish">${icon('plus')}${esc(t('Add to Discover'))}</button>
      <button type="button" class="btn btn-primary" data-action="publish-track">${icon('layers')}${esc(t('Add & track'))}</button>
    </div>`;
}

function publishParsed(alsoTrack) {
  const p = S.parsed;
  if (!p) return;
  const opp = { ...clone(p), id: 'custom-' + Date.now().toString(36), source: 'you', custom: true, verified: false, added: new Date().toISOString() };
  if (!opp.deadline) opp.deadline = null;
  S.custom.unshift(opp);
  S.custom = S.custom.slice(0, 100);
  saveStore();
  S.parsed = null;
  $('#rawInput').value = '';
  if (alsoTrack) track(opp.id);
  else toast(t('{title} added to Discover', { title: opp.title }), { tone: 'ok', action: t('View'), onAction: () => go('discover') });
  renderAll();
}

function setExpMode(experienced) {
  $$('#pExpMode [data-v]').forEach((b) => b.classList.toggle('on', (b.dataset.v === 'experienced') === experienced));
  $('#pYearsWrap').hidden = !experienced;
}

function fillProfile() {
  const p = S.profile;
  $('#pName').value = p.name || '';
  $('#pDept').value = p.department;
  $('#pField').value = p.field || 'any';
  $('#instInput').value = p.institution || '';
  $('#pStatus').value = p.studyStatus;
  $('#pGrad').value = String(p.gradYear);
  $$('#pRegion button').forEach((b) => b.classList.toggle('on', b.dataset.v === p.regionScope));
  $$('#pMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === p.workMode));
  setExpMode(userYears() > 0);
  $('#pYears').value = String(Math.max(1, userYears()));
}

function profileParts() {
  const p = S.profile;
  return [
    ['Experience', p.onboarded],
    ['Name', !!p.name],
    ['Field of interest', p.field !== 'any'],
    ['Institution', !!p.institution],
    ['Preferred work mode', p.workMode !== 'any'],
    ['Account', !Backend.enabled || signedIn()],
  ];
}

function renderMeter() {
  const parts = profileParts();
  const done = parts.filter(([, ok]) => ok).length;
  const pct = Math.round((done / parts.length) * 100);
  const missing = parts.filter(([, ok]) => !ok).map(([name]) => t(name));
  $('#profileMeter').innerHTML = `
    <div class="meter-head"><b>${esc(t('Profile {pct}% complete', { pct }))}</b><span class="muted small">${esc(missing.length ? t('Still to add: {list}', { list: missing.join(', ') }) : t('Everything is filled in. Recommendations are at their best.'))}</span></div>
    <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(t('Profile completeness'))}"><span style="width:${pct}%"></span></div>`;
}

function saveProfile() {
  const experienced = $('#pExpMode [data-v="experienced"]').classList.contains('on');
  let years = 0;
  if (experienced) {
    years = Math.round(Number($('#pYears').value));
    if (!Number.isFinite(years) || years < 1 || years > 50) { toast(t('Years of experience must be a number from 1 to 50.'), { tone: 'warn' }); $('#pYears').focus(); return; }
  }
  Object.assign(S.profile, cleanProfile({
    ...S.profile,
    name: $('#pName').value.trim(),
    department: $('#pDept').value,
    field: $('#pField').value,
    institution: $('#instInput').value.trim(),
    studyStatus: $('#pStatus').value,
    gradYear: parseInt($('#pGrad').value, 10),
    regionScope: $('#pRegion button.on')?.dataset.v || 'ALL',
    workMode: $('#pMode button.on')?.dataset.v || 'any',
    experienceYears: years,
    onboarded: true,
  }));
  S.filters.region = S.profile.regionScope;
  pushProfile();
  syncUrl();
  renderAll();
  const hint = $('#saveHint');
  hint.dataset.saved = '1';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  hint.textContent = signedIn() ? t('Saved {time} to your account.', { time }) : t('Saved {time} in this browser.', { time });
  toast(t('Saved'), { tone: 'ok' });
}

function exportData() {
  const data = { app: 'sujogkhuji', version: 2, exported: new Date().toISOString(), theme: S.theme, accent: S.accent, lang: S.lang, profile: S.profile, registered: S.registered.map(({ rev, ...rest }) => rest), custom: S.custom, saved: S.saved };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `sujogkhuji-${isoIn(0)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importData(file) {
  try {
    if (file.size > 2_000_000) throw new Error(t('File is too large.'));
    const data = JSON.parse(await file.text());
    if (!data || !['sujogkhuji', 'opportunity.bd'].includes(data.app) || !Array.isArray(data.registered)) throw new Error(t("This isn't a SujogKhuji export."));
    const incoming = data.registered.filter((r) => r && r.opportunity_id && r.title).slice(0, LIMITS.apps).map((r) => ({ ...cleanApp(r), rev: null }));
    const have = new Map(S.registered.map((r) => [r.opportunity_id, r]));
    for (const it of incoming) have.set(it.opportunity_id, have.has(it.opportunity_id) ? { ...mergeApps(it, have.get(it.opportunity_id)), rev: have.get(it.opportunity_id).rev } : it);
    S.registered = [...have.values()].filter((r) => !(r.sample && have.size > 1)).slice(0, LIMITS.apps);
    if (data.profile && typeof data.profile === 'object') S.profile = cleanProfile({ ...data.profile, onboarded: data.profile.onboarded || S.profile.onboarded });
    if (Array.isArray(data.custom)) S.custom = data.custom.filter((o) => o && typeof o.id === 'string' && typeof o.title === 'string').slice(0, 100).map((o) => ({ ...o, custom: true, verified: false, url: safeUrl(o.url) ? o.url : '' }));
    if (Array.isArray(data.saved)) S.saved = cleanSaved([...S.saved, ...data.saved]);
    if (ACCENTS[data.accent]) S.accent = data.accent;
    if (['system', 'light', 'dark'].includes(data.theme)) S.theme = data.theme;
    saveStore();
    fillProfile();
    renderAll();
    if (signedIn()) {
      for (const it of incoming) queue('upsert', it.opportunity_id);
      S.pending.profile = true;
      await flushPending();
    }
    toast(t('Imported {n} applications', { n: incoming.length }), { tone: 'ok' });
  } catch (e) {
    toast(t("Couldn't import: {why}", { why: e instanceof SyntaxError ? t('the file is not valid.') : e.message }), { tone: 'danger' });
  }
}

async function clearAll() {
  const msg = signedIn()
    ? t('Sign out and remove your data from this browser? Your account keeps its copy.')
    : t('Remove all your applications, profile and settings from this browser? This cannot be undone.');
  if (!confirm(msg)) return;
  if (signedIn()) await Backend.signOut();
  try { localStorage.removeItem(STORE_KEY); } catch { }
  location.reload();
}

const shortInst = (name) => {
  const m = String(name).match(/\(([^)]+)\)\s*$/);
  return m ? m[1].split(' - ')[0] : String(name).split(',')[0].slice(0, 24);
};
let institutionsLoading = null;
function loadInstitutions() {
  if (S.institutions) return Promise.resolve();
  if (!institutionsLoading) {
    institutionsLoading = fetch('data/bd_institutions.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        S.institutions = Array.isArray(list) ? list : [];
        if (S.institutions.length) $('#instHint').textContent = t('{n} public and private universities. Pick National University or Other if yours is not listed.', { n: S.institutions.length.toLocaleString() });
      })
      .catch(() => { institutionsLoading = null; });
  }
  return institutionsLoading;
}
function searchInstitutions(raw) {
  const all = S.institutions || [];
  const q = raw.trim().toLowerCase();
  if (!q) return { items: all.slice(0, 30), total: all.length };
  const toks = q.split(/\s+/);
  const hits = [];
  for (const it of all) {
    const hay = it._hay || (it._hay = `${it.keys} ${it.name}`.toLowerCase());
    if (!toks.every((tok) => hay.includes(tok))) continue;
    const acr = shortInst(it.name).toLowerCase();
    const score = acr === q ? 0 : it.name.toLowerCase().startsWith(q) ? 1 : hay.startsWith(q) ? 2 : 3;
    hits.push([score, it]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  return { items: hits.slice(0, 30).map((h) => h[1]), total: hits.length };
}

const COMBOS = [];
function closeCombo() { COMBOS.forEach((c) => c.close()); }

function institutionCombo({ wrap, input, list, clear }) {
  const box = $(wrap), field = $(input), menu = $(list), clearBtn = clear ? $(clear) : null;
  const basePlaceholder = field.getAttribute('placeholder') || '';
  let results = [];
  let hl = 0;
  let untouched = '';
  let manual = false;
  const isOpen = () => menu.classList.contains('open');
  const close = () => {
    menu.classList.remove('open');
    field.setAttribute('aria-expanded', 'false');
    field.removeAttribute('aria-activedescendant');
  };
  const paint = () => {
    const opts = $$('.combo-opt', menu);
    opts.forEach((o, i) => { o.classList.toggle('hl', i === hl); o.setAttribute('aria-selected', String(i === hl)); });
    if (opts[hl]) { field.setAttribute('aria-activedescendant', opts[hl].id); opts[hl].scrollIntoView({ block: 'nearest' }); }
  };
  const option = (it, i) => {
    const m = it.other ? null : it.name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    return `<button type="button" tabindex="-1" class="combo-opt ${it.pinned ? 'pinned' : ''}" role="option" id="${menu.id}-${i}" data-i="${i}"><span>${esc(it.other ? t('Other (type your own)') : m ? m[1] : it.name)}</span>${m ? `<span class="acr">${esc(m[2])}</span>` : ''}</button>`;
  };
  const open = async () => {
    if (manual) return;
    await loadInstitutions();
    if (document.activeElement !== field || manual) return;
    const loaded = !!(S.institutions && S.institutions.length);
    const { items, total } = searchInstitutions(field.value === untouched ? '' : field.value);
    const pinned = [{ name: 'National University (NU)', pinned: true }, { name: '', other: true, pinned: true }];
    results = [...items, ...pinned];
    hl = 0;
    const note = !loaded
      ? `<div class="combo-empty">${esc(t('Suggestions could not be loaded. You can still type the name.'))}</div>`
      : items.length
        ? `<div class="combo-foot">${esc(total > items.length ? t('Showing {a} of {b}. Keep typing to narrow it down.', { a: items.length, b: total.toLocaleString() }) : plural(total, 'result'))}</div>`
        : `<div class="combo-empty">${esc(t('No university matches “{q}”. Pick one of these, or keep what you typed.', { q: field.value }))}</div>`;
    menu.innerHTML = items.map(option).join('') + note + `<div class="combo-pinned">${pinned.map((it, i) => option(it, items.length + i)).join('')}</div>`;
    menu.classList.add('open');
    field.setAttribute('aria-expanded', 'true');
    paint();
  };
  const setManual = (on) => {
    manual = on;
    field.setAttribute('placeholder', on ? t('Type your institution name') : t(basePlaceholder));
  };
  const pick = (i) => {
    const it = results[i];
    if (!it) return;
    if (it.other) {
      field.value = '';
      untouched = '';
      close();
      setManual(true);
      field.focus();
      return;
    }
    field.value = it.name;
    untouched = it.name;
    close();
  };
  field.addEventListener('focus', () => { untouched = field.value; if (!manual) field.select(); open(); });
  field.addEventListener('input', open);
  field.addEventListener('blur', () => setTimeout(() => { if (!box.contains(document.activeElement)) close(); }, 120));
  field.addEventListener('keydown', (e) => {
    const shown = isOpen() && results.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!isOpen()) open(); else if (shown) { hl = (hl + 1) % results.length; paint(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (shown) { hl = (hl - 1 + results.length) % results.length; paint(); } }
    else if (e.key === 'Enter' && shown) { e.preventDefault(); pick(hl); }
    else if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close();
  });
  menu.addEventListener('mousedown', (e) => { e.preventDefault(); const o = e.target.closest('.combo-opt'); if (o) pick(Number(o.dataset.i)); });
  if (clearBtn) clearBtn.addEventListener('click', () => { field.value = ''; untouched = ''; setManual(false); field.focus(); open(); });
  const api = { close, open };
  COMBOS.push(api);
  return api;
}

const EASE = {
  out: (p) => 1 - Math.pow(1 - p, 3),
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const MOTION = { lead: 360, trail: 550, intro: 520 };

class SlidingPill {
  constructor(container, { active, inset = 0, radius = null }) {
    this.c = container;
    this.active = active;
    this.inset = Array.isArray(inset) ? inset : [inset, inset];
    this.radius = radius;
    this.st = null;
    this.target = null;
    this.tweens = {};
    this.running = false;
    this.raf = 0;
    this.queued = 0;
    this.layoutChanged = false;
    this.cloneDirty = true;
    this.layer = document.createElement('div');
    this.layer.className = 'pill-layer';
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.inert = true;
    container.appendChild(this.layer);
    container.classList.add('has-pill');
    const inLayer = (n) => n === this.layer || this.layer.contains(n);
    new MutationObserver((records) => {
      let relevant = false;
      for (const r of records) {
        if (inLayer(r.target)) continue;
        if (r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(inLayer)) continue;
        if (r.type !== 'attributes') this.cloneDirty = true;
        relevant = true;
      }
      if (relevant) this.schedule();
    }).observe(container, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    new ResizeObserver(() => { this.cloneDirty = true; this.schedule(true); }).observe(container);
  }
  schedule(layoutChanged = false) {
    this.layoutChanged = this.layoutChanged || layoutChanged;
    if (this.queued) return;
    this.queued = requestAnimationFrame(() => {
      this.queued = 0;
      const lc = this.layoutChanged;
      this.layoutChanged = false;
      this.update(lc);
    });
  }
  reclone() {
    this.cloneDirty = false;
    const cs = getComputedStyle(this.c);
    const copies = [...this.c.children].filter((n) => n !== this.layer).map((n) => {
      const k = n.cloneNode(true);
      [k, ...k.querySelectorAll('[id]')].forEach((e) => e.removeAttribute('id'));
      ['data-tab', 'data-v', 'data-action', 'aria-current', 'aria-pressed'].forEach((a) => k.removeAttribute(a));
      return k;
    });
    this.layer.replaceChildren(...copies);
    Object.assign(this.layer.style, {
      display: 'flex', flexDirection: cs.flexDirection, flexWrap: cs.flexWrap, alignItems: cs.alignItems, justifyContent: cs.justifyContent,
      rowGap: cs.rowGap, columnGap: cs.columnGap, paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
    });
  }
  edgesFor(el) {
    const [ix, iy] = this.inset;
    const W = this.c.clientWidth, H = this.c.clientHeight;
    return { l: el.offsetLeft + ix, t: el.offsetTop + iy, r: W - (el.offsetLeft + el.offsetWidth) + ix, b: H - (el.offsetTop + el.offsetHeight) + iy };
  }
  update(layoutChanged) {
    if (!this.c.getClientRects().length) return;
    if (this.cloneDirty) this.reclone();
    const el = this.c.querySelector(`:scope > ${this.active}`);
    if (!el || !el.getClientRects().length) { this.layer.style.opacity = '0'; this.target = null; return; }
    this.r = this.radius || getComputedStyle(el).borderTopLeftRadius || '8px';
    const to = this.edgesFor(el);
    this.layer.style.opacity = '1';
    if (!this.st) {
      const cx = (to.l + (this.c.clientWidth - to.r)) / 2;
      this.st = { ...to, l: cx, r: this.c.clientWidth - cx };
      this.target = el;
      this.animate(to, true);
      return;
    }
    if (el !== this.target) {
      this.target = el;
      if (reducedMotion.matches || layoutChanged) this.snap(to); else this.animate(to, false);
      return;
    }
    if (this.running && !layoutChanged) return;
    if (['l', 't', 'r', 'b'].some((k) => Math.abs(this.st[k] - to[k]) > 0.5) || layoutChanged) this.snap(to);
  }
  snap(to) {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.st = { ...to };
    this.paint();
  }
  animate(to, intro) {
    const from = { ...this.st };
    const horizontal = Math.abs(to.l - from.l) >= Math.abs(to.t - from.t);
    const forward = horizontal ? to.l > from.l : to.t > from.t;
    const [lead, trail] = horizontal ? (forward ? ['r', 'l'] : ['l', 'r']) : (forward ? ['b', 't'] : ['t', 'b']);
    const cross = horizontal ? ['t', 'b'] : ['l', 'r'];
    const now = performance.now();
    const tween = (k, dur, ease) => { this.tweens[k] = { from: from[k], to: to[k], start: now, dur, ease }; };
    this.tweens = {};
    if (intro) ['l', 't', 'r', 'b'].forEach((k) => tween(k, MOTION.intro, EASE.out));
    else { tween(lead, MOTION.lead, EASE.out); tween(trail, MOTION.trail, EASE.inOut); cross.forEach((k) => tween(k, MOTION.lead, EASE.out)); }
    cancelAnimationFrame(this.raf);
    this.running = true;
    const tick = (t) => {
      let done = true;
      for (const [k, w] of Object.entries(this.tweens)) {
        const p = Math.min(1, Math.max(0, (t - w.start) / w.dur));
        this.st[k] = w.from + (w.to - w.from) * w.ease(p);
        if (p < 1) done = false;
      }
      this.paint();
      if (done) { this.running = false; this.raf = 0; } else this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  paint() {
    const { l, t, r, b } = this.st;
    this.layer.style.clipPath = `inset(${t.toFixed(2)}px ${r.toFixed(2)}px ${b.toFixed(2)}px ${l.toFixed(2)}px round ${this.r})`;
  }
}

function renderAll() {
  applyTheme();
  renderChrome();
  renderDiscover();
  renderTracker();
  renderImport();
  renderAccount();
  renderMeter();
  if ($('#filterPanel').open) renderFilterPanel();
  if ($('#detail').open) renderDetail();
}

function changeLanguage(lang) {
  S.lang = lang === 'bn' ? 'bn' : 'en';
  setLang(S.lang);
  applyI18n();
  pushProfile();
  go(S.tab, { push: false });
  renderAll();
}

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  $('#installBtn').hidden = false;
});
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; installEvent = null; toast(t('Installed. Find SujogKhuji on your home screen.'), { tone: 'ok' }); });

function bind() {
  $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 16); });
  const year = new Date().getFullYear();
  const years = Array.from({ length: 14 }, (_, i) => year - 7 + i).map((y) => `<option value="${y}">${y}</option>`).join('');
  $('#pGrad').innerHTML = years;
  $('#obGrad').innerHTML = years;
  $('#pAccent').innerHTML = Object.entries(ACCENTS).map(([k, v]) =>
    `<button type="button" class="swatch" style="--c:${v}" data-v="${k}" aria-label="${k} accent" title="${k[0].toUpperCase() + k.slice(1)}"></button>`).join('');
  $('#fSort').innerHTML = Object.entries(SORTS).map(([v, label]) => `<option value="${v}" data-i18n>${label}</option>`).join('');
  applyI18n();

  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { closeDetail(); go(tabBtn.dataset.tab); return; }
    const a = e.target.closest('[data-action]');
    if (a) {
      const { action, id, idx } = a.dataset;
      if (action === 'toggle-step') toggleStep(id, Number(idx));
      else if (action === 'remove') removeApp(id);
      else if (action === 'track') track(id);
      else if (action === 'open') openDetail(id);
      else if (action === 'publish') publishParsed(false);
      else if (action === 'publish-track') publishParsed(true);
      else if (action === 'reset-filters') clearFilters();
      else if (action === 'clear-filter') { const item = activeFilters()[Number(idx)]; if (item) { item.clear(); filtersChanged(); } }
      else if (action === 'show-all-exp') { S.filters.matchExp = false; S.filters.expMin = 0; S.filters.expMax = 15; filtersChanged(); }
      else if (action === 'save-search') saveSearch();
      else if (action === 'apply-saved') applySaved(id);
      else if (action === 'delete-saved') deleteSaved(id);
      else if (action === 'reload-data') { S.data.loaded = false; renderAll(); loadData(); }
      else if (action === 'open-auth') { closeDetail(); openAuth(a.dataset.mode || 'signup'); }
      else if (action === 'edit-about') showFlow('about');
      else if (action === 'sign-out') signOut();
      else if (action === 'show-add-step') {
        const form = $(`.add-step[data-id="${CSS.escape(id)}"]`);
        if (form) { form.hidden = !form.hidden; if (!form.hidden) form.querySelector('input').focus(); }
      } else if (action === 'show-notes') {
        const wrap = $(`[data-notes-wrap="${CSS.escape(id)}"]`);
        if (wrap) { wrap.hidden = !wrap.hidden; if (!wrap.hidden) wrap.querySelector('textarea').focus(); }
      }
      return;
    }
    if (!e.target.closest('.combo')) closeCombo();
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('.add-step');
    if (!form) return;
    e.preventDefault();
    addStep(form.dataset.id, form.elements.t.value, form.elements.d.value);
  });
  document.addEventListener('close', (e) => {
    if (e.target instanceof HTMLDialogElement && e.target.contains($('#toasts'))) document.body.appendChild($('#toasts'));
  }, true);

  $('#themeBtn').addEventListener('click', () => { S.theme = resolvedTheme() === 'dark' ? 'light' : 'dark'; saveStore(); applyTheme(); });
  $('#bellBtn').addEventListener('click', () => {
    const u = urgentSteps();
    if (!u.length) { toast(t('Nothing due in the next 3 days.')); return; }
    toast(u.length === 1 ? t('1 step is due within 3 days') : t('{n} steps are due within 3 days', { n: u.length }), { tone: 'warn', action: t('View'), onAction: () => go('tracker') });
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null;
    $('#installBtn').hidden = true;
  });
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (e.key === '/' && !typing && S.tab === 'discover' && !$('dialog[open]')) { e.preventDefault(); $('#fSearch').focus(); }
  });

  $$('[data-sample]').forEach((b) => b.addEventListener('click', () => { $('#rawInput').value = SAMPLES[b.dataset.sample](); runParse(); }));
  $('#rawInput').addEventListener('input', () => { $('#charCount').textContent = t('{n} characters', { n: $('#rawInput').value.length.toLocaleString() }); });
  $('#rawInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runParse(); });
  $('#parseBtn').addEventListener('click', runParse);

  for (const sel of ['#pRegion', '#pMode']) {
    $(sel).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) $$(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b)); });
  }
  $('#pExpMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    setExpMode(b.dataset.v === 'experienced');
    if (b.dataset.v === 'experienced') $('#pYears').focus();
  });
  $('#pTheme').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.theme = b.dataset.v; saveStore(); applyTheme(); } });
  $('#pLang').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.v !== S.lang) changeLanguage(b.dataset.v); });
  $('#pAccent').addEventListener('click', (e) => { const b = e.target.closest('.swatch'); if (b) { S.accent = b.dataset.v; saveStore(); applyTheme(); } });
  $('#saveProfile').addEventListener('click', saveProfile);
  $('#exportBtn').addEventListener('click', exportData);
  $('#importFile').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; });
  $('#clearBtn').addEventListener('click', clearAll);

  institutionCombo({ wrap: '#instCombo', input: '#instInput', list: '#instList', clear: '#instClear' });
  institutionCombo({ wrap: '#obInstCombo', input: '#obInst', list: '#obInstList', clear: '#obInstClear' });

  bindDiscover();
  bindTracker();
  bindDetail();
  bindAuth();

  window.addEventListener('hashchange', () => {
    const { tab, query } = parseHash();
    if (/(^|&)(access_token|error_description|error_code)=/.test(location.hash)) { oldLink(); return; }
    if ((tab || 'discover') === 'discover') { S.filters = queryToFilters(query); S.page = 1; }
    go(tab, { push: false });
    renderDiscover();
  });
  window.addEventListener('online', () => { S.online = true; renderChrome(); flushPending(); if (S.data.error) loadData(); });
  window.addEventListener('offline', () => { S.online = false; renderChrome(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { Backend.touch(); Backend.reload(); reloadStore(); flushPending(); }
    else parkTimers();
  });
  window.addEventListener('pagehide', parkTimers);
  if (channel) {
    channel.addEventListener('message', (e) => {
      if (!e.data || typeof e.data.type !== 'string') return;
      if (e.data.type === 'store') reloadStore();
    });
  }
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) reloadStore();
    else if (e.key === 'sujog:session') Backend.reload();
  });
  Backend.onChange((session, reason) => {
    if (reason === 'expired') {
      clearAccountData();
      closeFlow();
      toast(t('You were signed out. Sign in again to see your data.'), { tone: 'warn', action: t('Sign in'), onAction: () => openAuth('signin'), timeout: 9000 });
    } else if (reason === 'remote-signout') {
      reloadStore();
      if (S.owner) clearAccountData();
      closeFlow();
    } else if (reason === 'remote-signin') {
      reloadStore();
      closeFlow();
      loadAccount().then(() => { if (signedIn() && !S.profile.onboarded) showFlow('about'); });
    }
    renderAccount();
    renderChrome();
  });
}

function attachPills() {
  new SlidingPill($('.sidebar .nav'), { active: '.nav-item.active' });
  new SlidingPill($('.tabbar'), { active: 'button.active', inset: [4, 7], radius: '12px' });
  ['#fRegion', '#pRegion', '#pMode', '#pTheme', '#pLang', '#pExpMode', '#flowMode', '#obRegion', '#obMode', '#trackerView'].forEach((sel) => new SlidingPill($(sel), { active: 'button.on' }));
}

function oldLink() {
  history.replaceState(null, '', location.pathname + location.search + '#/discover');
  toast(t('That link is no longer used. Sign in with your email and a code instead.'), { tone: 'warn', timeout: 8000 });
}

async function boot() {
  const stale = /(^|[#&])(access_token|error_description|error_code)=/.test(location.hash);
  if (stale) history.replaceState(null, '', location.pathname + location.search + '#/discover');
  bind();
  attachPills();
  fillProfile();
  const { tab, query } = parseHash();
  if ((tab || 'discover') === 'discover') S.filters = queryToFilters(query);
  renderAll();
  go(tab || 'discover', { push: false });
  loadData();
  if (stale) toast(t('That link is no longer used. Sign in with your email and a code instead.'), { tone: 'warn', timeout: 8000 });
  await Backend.ready;
  if (signedIn()) {
    await loadAccount();
    if (signedIn() && !S.profile.onboarded) showFlow('about');
    flushPending();
  } else {
    if (S.owner) clearAccountData();
    if (!S.profile.onboarded) openOnboarding();
  }
}

boot();
setInterval(() => { renderDiscover(); renderTracker(); renderChrome(); }, 10 * 60 * 1000);
setInterval(() => Backend.touch(), 30 * 60 * 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
