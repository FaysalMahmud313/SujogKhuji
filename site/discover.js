'use strict';

const PAGE_SIZE = 30;
const LIST_FILTERS = {
  jobType: { col: 'job_type', labels: JOB_TYPE, key: 'type', title: 'Job type' },
  workMode: { col: 'work_mode', labels: WORK_MODE, key: 'mode', title: 'Work mode' },
  education: { col: 'education', labels: EDUCATION, key: 'edu', title: 'Education level' },
  field: { col: 'field', labels: FIELD, key: 'field', title: 'Field' },
  orgType: { col: 'org_type', labels: ORG_TYPE, key: 'org', title: 'Organisation' },
};
const DEADLINE_OPTIONS = { any: 'Any time', 3: 'In 3 days', 7: 'In 7 days', 30: 'In 30 days' };
const POSTED_OPTIONS = { any: 'Any time', 1: 'Last 24 h', 7: 'Last 7 days', 30: 'Last 30 days' };
const FUNDING_OPTIONS = { any: 'Any', full: 'Fully funded', partial: 'Partially funded' };
const SORTS = { closing: 'Closing soonest', match: 'Best match for me', recent: 'Newest first', pay: 'Highest pay' };

function fitsExperience(o, y = userYears()) {
  if (o.exp_min !== null && o.exp_min !== undefined && o.exp_min !== '') return Number(o.exp_min) <= y;
  if (o.level === 'senior') return y >= 5;
  if (o.level === 'mid') return y >= 2;
  return true;
}

function expFloor(o) {
  if (o.exp_min !== null && o.exp_min !== undefined && o.exp_min !== '') return Number(o.exp_min);
  if (o.level === 'senior') return 5;
  if (o.level === 'mid') return 2;
  if (o.level === 'entry') return 0;
  return null;
}

function inExpRange(o, low, high) {
  const floor = expFloor(o);
  if (floor === null) return low === 0;
  return floor >= low && (high >= 15 || floor <= high);
}

function experienceLabel(o) {
  const min = o.exp_min === null || o.exp_min === undefined ? null : Number(o.exp_min);
  const max = o.exp_max === null || o.exp_max === undefined ? null : Number(o.exp_max);
  if (min === 0 && (max === null || max <= 1)) return { text: t('Fresher-friendly'), cls: 'tag-fresher' };
  if (min !== null && max !== null) return { text: t('{a}–{b} yrs exp', { a: min, b: max }), cls: '' };
  if (min !== null) return { text: t('{n}+ yrs exp', { n: min }), cls: '' };
  if (o.level === 'senior') return { text: t('Senior level'), cls: '' };
  if (o.level === 'mid') return { text: t('Mid level'), cls: '' };
  if (o.category === 'job') return { text: t('Experience not stated'), cls: 'tag-muted' };
  return null;
}

function monthlyUsd(o) {
  const amount = Number(o.pay_max ?? o.pay_min);
  const rate = USD[o.pay_currency];
  return Number.isFinite(amount) && amount > 0 && rate ? amount * rate : 0;
}

function matchScore(o) {
  const y = userYears();
  const p = S.profile;
  let score = 0;
  if (fitsExperience(o, y)) {
    score += 3;
    const floor = expFloor(o);
    if (floor !== null) score += Math.max(0, 2 - Math.abs(y - floor) * 0.5);
  }
  if (p.field !== 'any' && o.field === p.field) score += 3;
  if (p.workMode !== 'any' && o.work_mode === p.workMode) score += 1.5;
  if (p.regionScope !== 'ALL' && o.region === p.regionScope) score += 1;
  if (o.verified) score += 0.5;
  if (o.funding === 'full') score += 0.5;
  return score;
}

const sourceHost = (o) => String(o.source || '').toLowerCase();
const oddAddress = (o) => /(^|\.)xn--/.test(sourceHost(o)) || /[^\x21-\x7e]/.test(sourceHost(o));

function trustBadge(o, long = false) {
  if (o.custom) return '';
  if (oddAddress(o)) return `<span class="tag tag-risk" title="${esc(t('This web address uses unusual letters. Make sure it is the real site.'))}">${icon('alert', 13)}${esc(t('Unusual web address'))}</span>`;
  if (o.verified) return `<span class="tag tag-verified" title="${esc(t('From an official or well-known site'))}">${icon('shield', 13)}${esc(t('Verified source'))}</span>`;
  return `<span class="tag tag-muted" title="${esc(t('We do not know this site. Never pay to apply.'))}">${icon('info', 13)}${esc(long ? t('Check carefully: unknown source') : t('Check carefully'))}</span>`;
}

function passes(o, f, skip = '') {
  if (!isOpen(o) || S.reported.includes(o.id)) return false;
  if (f.region !== 'ALL' && o.region !== f.region) return false;
  if (skip !== 'cat' && f.cat !== 'ALL' && o.category !== f.cat) return false;
  if (f.funding !== 'any' && o.funding !== f.funding) return false;
  if (f.matchExp ? !fitsExperience(o) : !inExpRange(o, f.expMin, f.expMax)) return false;
  if (f.deadline !== 'any' && !(o.deadline && daysLeft(o.deadline) <= Number(f.deadline))) return false;
  if (f.posted !== 'any' && daysSince(o.published || o.found || o.added) > Number(f.posted)) return false;
  for (const [name, def] of Object.entries(LIST_FILTERS)) {
    if (f[name].length && !f[name].includes(o[def.col])) return false;
  }
  if (f.country && o.country !== f.country) return false;
  if (f.hasPay && !(o.pay && o.pay !== 'Unpaid')) return false;
  if (f.verified && !o.verified) return false;
  if (f.hideTracked && isTracked(o.id)) return false;
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const hay = `${o.title} ${o.org || ''} ${o.source || ''} ${o.summary || ''} ${o.country || ''} ${CAT[o.category] || ''} ${REGION[o.region] || ''} ${FUNDING[o.funding] || ''} ${FIELD[o.field] || ''} ${WORK_MODE[o.work_mode] || ''}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

function filteredOpps(f = S.filters) {
  const list = allOpps().filter((o) => passes(o, f));
  const due = (o) => o.deadline || '9999-12-31';
  if (f.sort === 'recent') list.sort((a, b) => String(b.found || b.added || '').localeCompare(String(a.found || a.added || '')) || due(a).localeCompare(due(b)));
  else if (f.sort === 'match') list.sort((a, b) => matchScore(b) - matchScore(a) || due(a).localeCompare(due(b)));
  else if (f.sort === 'pay') list.sort((a, b) => monthlyUsd(b) - monthlyUsd(a) || due(a).localeCompare(due(b)));
  else list.sort((a, b) => due(a).localeCompare(due(b)));
  return list;
}

function filtersToQuery(f) {
  const q = new URLSearchParams();
  if (f.q.trim()) q.set('q', f.q.trim().slice(0, 80));
  if (f.region !== (S.profile.regionScope || 'ALL')) q.set('r', f.region);
  if (f.cat !== 'ALL') q.set('cat', f.cat);
  if (f.funding !== 'any') q.set('fund', f.funding);
  if (!f.matchExp) q.set('exp', `${f.expMin}-${f.expMax}`);
  if (f.deadline !== 'any') q.set('due', f.deadline);
  if (f.posted !== 'any') q.set('new', f.posted);
  for (const [name, def] of Object.entries(LIST_FILTERS)) if (f[name].length) q.set(def.key, f[name].join(','));
  if (f.country) q.set('country', f.country);
  if (f.hasPay) q.set('pay', '1');
  if (f.verified) q.set('ok', '1');
  if (f.hideTracked) q.set('hide', '1');
  if (f.sort !== 'closing') q.set('sort', f.sort);
  return q.toString();
}

function queryToFilters(query) {
  const q = new URLSearchParams(query || '');
  const f = { ...DEFAULT_FILTERS, region: S.profile.regionScope || 'ALL' };
  const pick = (value, allowed, fallback) => (Object.prototype.hasOwnProperty.call(allowed, value) ? value : fallback);
  f.q = (q.get('q') || '').slice(0, 80);
  f.region = pick(q.get('r'), { ALL: 1, BD: 1, GLOBAL: 1 }, f.region);
  f.cat = pick(q.get('cat'), CAT, 'ALL');
  f.funding = pick(q.get('fund'), FUNDING, 'any');
  const exp = /^(\d{1,2})-(\d{1,2})$/.exec(q.get('exp') || '');
  if (exp) {
    f.matchExp = false;
    f.expMin = Math.min(15, Number(exp[1]));
    f.expMax = Math.max(f.expMin, Math.min(15, Number(exp[2])));
  }
  f.deadline = pick(q.get('due'), DEADLINE_OPTIONS, 'any');
  f.posted = pick(q.get('new'), POSTED_OPTIONS, 'any');
  for (const [name, def] of Object.entries(LIST_FILTERS)) {
    f[name] = (q.get(def.key) || '').split(',').filter((v) => Object.prototype.hasOwnProperty.call(def.labels, v));
  }
  f.country = (q.get('country') || '').replace(/[^\p{L} .'-]/gu, '').slice(0, 60);
  f.hasPay = q.get('pay') === '1';
  f.verified = q.get('ok') === '1';
  f.hideTracked = q.get('hide') === '1';
  f.sort = pick(q.get('sort'), SORTS, 'closing');
  return f;
}

function activeFilters(f = S.filters) {
  const out = [];
  const add = (label, clear) => out.push({ label, clear });
  if (f.funding !== 'any') add(t(FUNDING[f.funding]), () => { f.funding = 'any'; });
  if (!f.matchExp && (f.expMin > 0 || f.expMax < 15)) add(expRangeText(f), () => { f.expMin = 0; f.expMax = 15; });
  if (f.deadline !== 'any') add(t('Closing: {x}', { x: t(DEADLINE_OPTIONS[f.deadline]).toLowerCase() }), () => { f.deadline = 'any'; });
  if (f.posted !== 'any') add(t('Posted: {x}', { x: t(POSTED_OPTIONS[f.posted]).toLowerCase() }), () => { f.posted = 'any'; });
  for (const [name, def] of Object.entries(LIST_FILTERS)) {
    for (const v of f[name]) add(t(def.labels[v]), () => { f[name] = f[name].filter((x) => x !== v); });
  }
  if (f.country) add(f.country, () => { f.country = ''; });
  if (f.hasPay) add(t('Has pay listed'), () => { f.hasPay = false; });
  if (f.verified) add(t('Verified only'), () => { f.verified = false; });
  if (f.hideTracked) add(t('Hiding tracked'), () => { f.hideTracked = false; });
  return out;
}

const expRangeText = (f) => (f.expMax >= 15 ? t('{a}+ yrs experience', { a: f.expMin }) : t('{a}–{b} yrs experience', { a: f.expMin, b: f.expMax }));

function clearFilters() {
  S.filters = { ...DEFAULT_FILTERS, region: S.profile.regionScope || 'ALL', sort: S.filters.sort };
  filtersChanged();
}

function filtersChanged({ panel = true } = {}) {
  S.page = 1;
  syncUrl();
  renderDiscover();
  if (panel) renderFilterPanel();
}

function chipGroup(name, options, current, multi) {
  const entries = Object.entries(options).sort((x, y) => (y[0] === 'any') - (x[0] === 'any'));
  return `<div class="chips" role="group" data-group="${name}">${entries.map(([v, label]) => {
    const on = multi ? current.includes(v) : String(current) === v;
    return `<button type="button" class="chip ${on ? 'on' : ''}" data-f="${name}" data-v="${esc(v)}" aria-pressed="${on}">${esc(t(label))}</button>`;
  }).join('')}</div>`;
}

function renderFilterPanel() {
  const f = S.filters;
  const panel = $('#filterBody');
  if (!panel) return;
  const countries = [...new Set(visibleOpps().map((o) => o.country).filter(Boolean))].sort();
  if (f.country && !countries.includes(f.country)) countries.unshift(f.country);
  const toggle = (name, label, hint) => `
    <label class="switch-row filter-toggle">
      <span><b>${esc(t(label))}</b>${hint ? `<small>${esc(t(hint))}</small>` : ''}</span>
      <button type="button" class="switch" role="switch" data-toggle="${name}" aria-checked="${!!f[name]}" aria-label="${esc(t(label))}"></button>
    </label>`;
  const group = (title, body) => `<section class="filter-group"><h3>${esc(t(title))}</h3>${body}</section>`;
  panel.innerHTML = [
    group('Deadline', chipGroup('deadline', DEADLINE_OPTIONS, f.deadline, false)),
    group('Posted', chipGroup('posted', POSTED_OPTIONS, f.posted, false)),
    group('Experience needed', `
      <div class="range2 ${f.matchExp ? 'is-off' : ''}">
        <div class="range2-track"><span id="expFill"></span></div>
        <input type="range" id="expLow" min="0" max="15" step="1" value="${f.expMin}" aria-label="${esc(t('Minimum years of experience'))}" />
        <input type="range" id="expHigh" min="0" max="15" step="1" value="${f.expMax}" aria-label="${esc(t('Maximum years of experience'))}" />
      </div>
      <div class="range2-text"><span id="expText"></span><button type="button" class="link-btn" data-action="exp-mine">${esc(t('Use my experience'))}</button></div>`),
    ...Object.entries(LIST_FILTERS).map(([name, def]) => group(def.title, chipGroup(name, def.labels, f[name], true))),
    group('Country', `
      <span class="select-wrap">
        <select class="select" id="fCountry" aria-label="${esc(t('Country'))}">
          <option value="">${esc(t('Any country'))}</option>
          ${countries.map((c) => `<option value="${esc(c)}" ${c === f.country ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>${icon('chevronDown', 14)}
      </span>`),
    group('Funding', chipGroup('funding', FUNDING_OPTIONS, f.funding, false)),
    `<section class="filter-group filter-toggles">
      ${toggle('hasPay', 'Has pay listed')}
      ${toggle('verified', 'Verified sources only')}
      ${toggle('hideTracked', "Hide ones I'm tracking")}
    </section>`,
  ].join('');
  paintRange();
  $('#filterApply').textContent = t('Show {n} results', { n: filteredOpps().length });
}

function paintRange() {
  const f = S.filters;
  const fill = $('#expFill');
  if (!fill) return;
  fill.style.left = `${(f.expMin / 15) * 100}%`;
  fill.style.right = `${100 - (f.expMax / 15) * 100}%`;
  $('#expText').textContent = f.matchExp ? t('Matching your profile: {x}', { x: experienceText().toLowerCase() }) : expRangeText(f);
}

function openFilters() {
  const dlg = $('#filterPanel');
  renderFilterPanel();
  if (dlg.open) { dlg.close(); return; }
  if (window.matchMedia('(max-width: 900px)').matches) dlg.showModal();
  else dlg.show();
  $('#filterBtn').setAttribute('aria-expanded', 'true');
}

function oppCard(o) {
  const tracked = isTracked(o.id);
  const tn = o.deadline ? tone(o.deadline) : 'neutral';
  const via = o.custom ? esc(t('added by you')) : `${esc(t('via'))} ${esc(o.source)}`;
  const who = o.org ? `${esc(o.org)}<span class="sep"> · </span>${via}` : via;
  const exp = experienceLabel(o);
  const id = esc(o.id);
  return `
    <article class="card opp-card">
      <header class="opp-head">
        ${logo(o.org || o.source || o.title)}
        <div class="opp-ttl">
          <h3><button type="button" class="title-btn" data-action="open" data-id="${id}" title="${esc(o.title)}">${esc(o.title)}</button></h3>
          <div class="sub">${who}</div>
        </div>
      </header>
      <div class="tags">
        <span class="tag">${icon(o.region === 'BD' ? 'pin' : 'globe', 13)}${esc(o.country || t(REGION[o.region] || 'Global'))}</span>
        <span class="tag">${icon(CAT_ICON[o.category] || 'briefcase', 13)}${esc(t(CAT_SHORT[o.category] || 'Opportunity'))}</span>
        ${o.funding ? `<span class="tag ${o.funding === 'full' ? 'tag-funded' : 'tag-partial'}">${icon('star', 13)}${esc(t(FUNDING[o.funding]))}</span>` : ''}
        ${exp ? `<span class="tag ${exp.cls}">${icon('user', 13)}${esc(exp.text)}</span>` : ''}
        ${WORK_MODE[o.work_mode] ? `<span class="tag">${icon(o.work_mode === 'remote' ? 'laptop' : 'pin', 13)}${esc(t(WORK_MODE[o.work_mode]))}</span>` : ''}
        ${trustBadge(o)}
      </div>
      ${o.summary ? `<p class="opp-summary">${esc(o.summary)}</p>` : ''}
      <footer class="opp-foot">
        <div class="opp-meta">
          ${payLine(o)}
          <span class="closing ${tn === 'danger' ? 'tx-danger' : tn === 'warn' ? 'tx-warn' : ''}">${closingText(o)}</span>
        </div>
        <div class="opp-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-action="open" data-id="${id}">${esc(t('Details'))}</button>
          ${tracked
            ? `<button type="button" class="btn btn-sm btn-tracking" data-tab="tracker">${icon('check', 14, 2.25)}${esc(t('Tracking'))}</button>`
            : `<button type="button" class="btn btn-sm btn-secondary" data-action="track" data-id="${id}">${icon('plus', 14)}${esc(t('Track'))}</button>`}
        </div>
      </footer>
    </article>`;
}

function payLine(o) {
  return o.pay ? `<span class="pay">${icon('wallet', 14)}<b>${esc(o.pay)}</b></span>` : '';
}

function closingText(o) {
  if (!o.deadline) return `${icon('clock', 13)}${esc(t('No deadline listed · check the posting'))}`;
  const n = daysLeft(o.deadline);
  const when = n === 0 ? t('today') : n === 1 ? t('tomorrow') : t('{n} days', { n });
  return `${icon('clock', 13)}${esc(t('Closes {date} · {when}', { date: fmtDate(o.deadline), when }))}`;
}

const skeletonCards = (n) => Array.from({ length: n }, () => `
  <article class="card opp-card skel-card" aria-hidden="true">
    <div class="opp-head"><div class="mlogo skeleton"></div><div class="opp-ttl skel-lines"><div class="skeleton w70"></div><div class="skeleton w40"></div></div></div>
    <div class="tags"><div class="skeleton skel-tag"></div><div class="skeleton skel-tag"></div></div>
    <div class="opp-foot"><div class="skeleton w55"></div><div class="skeleton skel-btn"></div></div>
  </article>`).join('');

function renderLiveStatus() {
  const d = S.data;
  const box = $('#liveStatus');
  if (!d.loaded) { box.innerHTML = ''; return; }
  if (d.error && !d.items.length) {
    box.innerHTML = `<div class="live-bar off">${icon(S.online ? 'info' : 'offline', 15)}<span><b>${esc(t('No listings yet.'))}</b> ${esc(d.error)} <button type="button" class="link-btn" data-action="reload-data">${esc(t('Try again'))}</button></span></div>`;
    return;
  }
  const hours = d.generatedAt ? (Date.now() - Date.parse(d.generatedAt)) / 3600000 : Infinity;
  if (hours > 48) {
    box.innerHTML = `<div class="live-bar warn">${icon('alert', 15)}<span>${esc(t('Listings were last updated {when}. Expired ones are hidden automatically.', { when: ago(hours * 3600000) }))}</span></div>`;
    return;
  }
  box.innerHTML = `<div class="live-bar"><i class="live-dot"></i><span>${esc(t('Updated {when} · searched from the web twice a day · every listing links to its source', { when: ago(hours * 3600000) }))}</span></div>`;
}

function savedCount(s) {
  const seen = String(S.seen[s.id] || '').slice(0, 10);
  if (!seen) return 0;
  const f = queryToFilters(s.query);
  return allOpps().filter((o) => passes(o, f) && String(o.found || '') > seen).length;
}

function renderSaved() {
  const box = $('#savedRow');
  const current = filtersToQuery(S.filters);
  const canSave = !!current && !S.saved.some((s) => s.query === current);
  if (!S.saved.length && !canSave) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <span class="saved-label">${icon('bookmark', 14)}${esc(t('Saved searches'))}</span>
    ${S.saved.map((s) => {
      const n = savedCount(s);
      const on = s.query === current;
      return `<span class="chip saved-chip ${on ? 'on' : ''}">
        <button type="button" data-action="apply-saved" data-id="${esc(s.id)}" aria-pressed="${on}">${esc(s.name)}${n ? `<span class="new-pill" title="${esc(t('New since your last visit'))}">${n} ${esc(t('new'))}</span>` : ''}</button>
        <button type="button" class="chip-x" data-action="delete-saved" data-id="${esc(s.id)}" aria-label="${esc(t('Delete saved search {name}', { name: s.name }))}">${icon('x', 12)}</button>
      </span>`;
    }).join('')}
    ${canSave && S.saved.length < LIMITS.saved ? `<button type="button" class="chip chip-add" data-action="save-search">${icon('plus', 13)}${esc(t('Save this search'))}</button>` : ''}`;
}

async function saveSearch() {
  const query = filtersToQuery(S.filters);
  if (!query) return;
  const suggestion = [S.filters.q.trim(), S.filters.cat !== 'ALL' ? t(CAT_PLURAL[S.filters.cat]) : '', ...activeFilters().map((a) => a.label)].filter(Boolean).slice(0, 3).join(' · ').slice(0, 40);
  const name = await askName(t('Name this search'), suggestion || t('My search'));
  if (!name) return;
  const id = Date.now().toString(36);
  S.saved = [...S.saved.filter((s) => s.name !== name), { id, name: name.slice(0, 40), query }].slice(-LIMITS.saved);
  S.seen[id] = isoIn(0);
  pushProfile();
  renderSaved();
  toast(t('Search saved. New matches will be counted here.'), { tone: 'ok' });
}

function applySaved(id) {
  const s = S.saved.find((x) => x.id === id);
  if (!s) return;
  S.filters = queryToFilters(s.query);
  S.seen[id] = isoIn(0);
  saveStore();
  filtersChanged();
}

function deleteSaved(id) {
  S.saved = S.saved.filter((x) => x.id !== id);
  delete S.seen[id];
  pushProfile();
  renderSaved();
}

function recommended() {
  const f = S.filters;
  const plain = !f.q.trim() && f.cat === 'ALL' && !activeFilters().length && f.matchExp;
  if (!plain || !S.profile.onboarded || !S.data.loaded) return [];
  return allOpps()
    .filter((o) => passes(o, f) && !isTracked(o.id) && !o.custom)
    .map((o) => ({ o, score: matchScore(o) }))
    .filter((x) => x.score >= 5)
    .sort((a, b) => b.score - a.score || (a.o.deadline || '9999').localeCompare(b.o.deadline || '9999'))
    .slice(0, 6)
    .map((x) => x.o);
}

function renderRecommended() {
  const box = $('#recRow');
  const list = recommended();
  if (list.length < 3) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="rec-head"><h2>${icon('sparkles', 15)}${esc(t('Recommended for you'))}</h2><span class="muted small">${esc(t('Based on your experience, field and preferences'))}</span></div>
    <div class="rec-strip">
      ${list.map((o) => `
        <button type="button" class="card rec-card" data-action="open" data-id="${esc(o.id)}">
          <span class="rec-top">${logo(o.org || o.source || o.title)}<span class="rec-kind">${esc(t(CAT_SHORT[o.category]))}${o.verified ? icon('shield', 12) : ''}</span></span>
          <b>${esc(o.title)}</b>
          <small>${esc(o.org || o.source)}</small>
          <span class="rec-due">${closingText(o)}</span>
        </button>`).join('')}
    </div>`;
}

function renderDiscover() {
  const f = S.filters;
  $$('#fRegion button').forEach((b) => b.classList.toggle('on', b.dataset.v === f.region));
  $('#fSort').value = f.sort;
  $('#fExp').setAttribute('aria-checked', String(f.matchExp));
  $('#fExpLabel').textContent = t('For my experience ({x})', { x: experienceText().toLowerCase() });
  if ($('#fSearch').value !== f.q && document.activeElement !== $('#fSearch')) $('#fSearch').value = f.q;
  renderLiveStatus();

  const base = allOpps().filter((o) => passes(o, f, 'cat'));
  $('#fCat').innerHTML = ['ALL', 'job', 'internship', 'scholarship', 'competition', 'program'].map((c) => {
    const n = c === 'ALL' ? base.length : base.filter((o) => o.category === c).length;
    return `<button type="button" class="chip ${f.cat === c ? 'on' : ''}" data-v="${c}" aria-pressed="${f.cat === c}">${esc(t(CAT_PLURAL[c]))}<span class="n">${n}</span></button>`;
  }).join('');

  const active = activeFilters();
  $('#filterCount').textContent = active.length || '';
  $('#filterCount').hidden = !active.length;
  $('#activeRow').hidden = !active.length;
  $('#activeRow').innerHTML = active.length ? `
    ${active.map((a, i) => `<button type="button" class="chip active-chip" data-action="clear-filter" data-idx="${i}" aria-label="${esc(t('Remove filter {name}', { name: a.label }))}">${esc(a.label)}${icon('x', 12)}</button>`).join('')}
    <button type="button" class="link-btn" data-action="reset-filters">${esc(t('Clear all'))}</button>` : '';
  renderSaved();
  renderRecommended();

  const q = f.q.trim();
  const list = filteredOpps();
  $('#resultCount').textContent = `${plural(list.length, 'opportunity', 'opportunities')}${q ? ` ${t('matching “{q}”', { q })}` : ''}`;
  if ($('#filterApply')) $('#filterApply').textContent = t('Show {n} results', { n: list.length });
  const grid = $('#discoverGrid');
  const more = $('#moreRow');

  if (!S.data.loaded) { grid.innerHTML = skeletonCards(6); more.hidden = true; return; }
  if (list.length) {
    const shown = list.slice(0, S.page * PAGE_SIZE);
    grid.innerHTML = shown.map(oppCard).join('');
    more.hidden = shown.length >= list.length;
    $('#moreBtn').textContent = t('Show more ({n} left)', { n: list.length - shown.length });
    return;
  }
  more.hidden = true;
  const filtersOn = f.region !== 'ALL' || f.cat !== 'ALL' || active.length > 0;
  const hiddenByExp = f.matchExp && allOpps().some((o) => isOpen(o) && !fitsExperience(o));
  const web = q ? `https://www.google.com/search?q=${encodeURIComponent(`${q} ${userYears() === 0 ? 'fresher' : `${userYears()} years experience`} job OR internship OR scholarship apply ${new Date().getFullYear()}`)}` : '';
  grid.innerHTML = `
    <div class="empty">
      <div class="em-icon">${icon(S.data.error && !S.data.items.length ? (S.online ? 'alert' : 'offline') : 'search', 20)}</div>
      <h3>${esc(S.data.error && !S.data.items.length ? t('Listings could not be loaded') : q ? t("Nothing open for “{q}” in today's listings", { q }) : t('No open listings match these filters'))}</h3>
      <p>${esc(S.data.error && !S.data.items.length ? S.data.error : q ? t("Our daily web search hasn't found a verified open listing for this yet. You can search the whole web now, or widen the filters.") : t('Try another category, region or fewer filters.'))}${hiddenByExp ? ` ${esc(t('Some listings are hidden because they ask for more experience than yours.'))}` : ''}</p>
      <div class="actions actions-center">
        ${q ? `<a class="btn btn-primary" href="${esc(web)}" target="_blank" rel="noopener noreferrer">${icon('external', 16)}${esc(t('Search the web for “{q}”', { q }))}</a>` : ''}
        ${S.data.error && !S.data.items.length ? `<button type="button" class="btn btn-primary" data-action="reload-data">${icon('refresh', 16)}${esc(t('Try again'))}</button>` : ''}
        ${hiddenByExp ? `<button type="button" class="btn btn-secondary" data-action="show-all-exp">${esc(t('Show all experience levels'))}</button>` : ''}
        ${filtersOn ? `<button type="button" class="btn btn-secondary" data-action="reset-filters">${esc(t('Reset filters'))}</button>` : ''}
      </div>
    </div>`;
}

function bindDiscover() {
  let searchTimer = 0;
  $('#fSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => { S.filters.q = value; filtersChanged({ panel: false }); }, 150);
  });
  $('#fRegion').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.filters.region = b.dataset.v; filtersChanged(); } });
  $('#fCat').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { S.filters.cat = b.dataset.v; filtersChanged(); } });
  $('#fExp').addEventListener('click', () => { S.filters.matchExp = !S.filters.matchExp; filtersChanged(); });
  $('#fSort').addEventListener('change', (e) => { S.filters.sort = e.target.value; filtersChanged({ panel: false }); });
  $('#filterBtn').addEventListener('click', openFilters);
  $('#moreBtn').addEventListener('click', () => { S.page += 1; renderDiscover(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting) && !$('#moreRow').hidden && S.tab === 'discover') { S.page += 1; renderDiscover(); }
    }, { rootMargin: '400px' }).observe($('#moreRow'));
  }

  const panel = $('#filterPanel');
  panel.addEventListener('close', () => $('#filterBtn').setAttribute('aria-expanded', 'false'));
  panel.addEventListener('click', (e) => {
    if (e.target === panel) { panel.close(); return; }
    const f = S.filters;
    const chip = e.target.closest('[data-f]');
    if (chip) {
      const name = chip.dataset.f;
      const v = chip.dataset.v;
      if (LIST_FILTERS[name]) f[name] = f[name].includes(v) ? f[name].filter((x) => x !== v) : [...f[name], v];
      else f[name] = v;
      filtersChanged();
      return;
    }
    const sw = e.target.closest('[data-toggle]');
    if (sw) { f[sw.dataset.toggle] = !f[sw.dataset.toggle]; filtersChanged(); return; }
    const act = e.target.closest('[data-action]');
    if (!act) return;
    if (act.dataset.action === 'exp-mine') { f.matchExp = true; f.expMin = 0; f.expMax = 15; filtersChanged(); }
    else if (act.dataset.action === 'close-filters') panel.close();
    else if (act.dataset.action === 'reset-filters') clearFilters();
  });
  panel.addEventListener('input', (e) => {
    const f = S.filters;
    if (e.target.id !== 'expLow' && e.target.id !== 'expHigh') return;
    let low = Number($('#expLow').value);
    let high = Number($('#expHigh').value);
    if (low > high) { if (e.target.id === 'expLow') high = low; else low = high; }
    $('#expLow').value = String(low);
    $('#expHigh').value = String(high);
    f.matchExp = false;
    f.expMin = low;
    f.expMax = high;
    $('.range2', panel).classList.remove('is-off');
    paintRange();
    S.page = 1;
    syncUrl();
    renderDiscover();
  });
  panel.addEventListener('change', (e) => {
    if (e.target.id === 'fCountry') { S.filters.country = e.target.value; filtersChanged(); }
  });
}
