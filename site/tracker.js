'use strict';

const stat = (label, value, hint) =>
  `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div><div class="stat-hint">${esc(hint)}</div></div>`;

function weekStrip() {
  const days = Array.from({ length: 7 }, (_, i) => isoIn(i));
  const due = (iso) => S.registered.filter((it) => it.status !== 'rejected').flatMap((it) => openSteps(it).filter((s) => s.d === iso).map((s) => ({ s, it })));
  return `
    <div class="week" aria-label="${esc(t('Steps due in the next 7 days'))}">
      ${days.map((iso, i) => {
        const items = due(iso);
        const d = new Date(iso + 'T00:00:00Z');
        const name = i === 0 ? t('Today') : d.toLocaleDateString(LANG === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });
        const tip = items.map(({ s, it }) => `${s.t} — ${it.title}`).join('\n');
        return `<div class="week-day ${items.length ? 'has' : ''} ${i === 0 ? 'today' : ''}" title="${esc(tip)}">
          <span class="wd-name">${esc(name)}</span>
          <span class="wd-date">${esc(String(d.getUTCDate()))}</span>
          <span class="wd-count">${items.length ? esc(plural(items.length, 'step')) : '·'}</span>
        </div>`;
      }).join('')}
    </div>`;
}

function statusSelect(it) {
  const id = esc(it.opportunity_id);
  return `<label class="status-pick t-${STATUS_TONE[it.status] || 'neutral'}">
    <span class="sr-only">${esc(t('Status of {title}', { title: it.title }))}</span>
    <select data-status="${id}">
      ${Object.entries(STATUS).map(([v, label]) => `<option value="${v}" ${it.status === v ? 'selected' : ''}>${esc(t(label))}</option>`).join('')}
    </select>${icon('chevronDown', 12)}
  </label>`;
}

function appCard(it) {
  const steps = it.steps_json || [];
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const nx = nextStep(it);
  const due = nx
    ? `<span class="due t-${tone(nx.d)}"><i></i>${esc(relDue(nx.d))}</span>`
    : `<span class="due t-ok">${icon('check', 12, 2.5)}${esc(t('Complete'))}</span>`;
  const id = esc(it.opportunity_id);
  const sub = [it.org, t(REGION[it.region] || 'Global'), t(CAT_SHORT[it.category] || 'Job')].filter(Boolean).map(esc).join('<span class="sep"> · </span>');
  return `
    <article class="card app-card" data-app="${id}">
      <header class="app-head">
        ${logo(it.org || it.title)}
        <div class="app-ttl">
          <h3 title="${esc(it.title)}">${esc(it.title)}</h3>
          <div class="sub">${sub}${it.sample ? `<span class="sep"> · </span><span class="sample-tag">${esc(t('Sample'))}</span>` : ''}</div>
        </div>
        ${due}
        <button type="button" class="icon-btn danger" data-action="remove" data-id="${id}" title="${esc(t('Stop tracking'))}" aria-label="${esc(t('Stop tracking {title}', { title: it.title }))}">${icon('trash', 15)}</button>
      </header>
      <div class="progress-row">
        ${statusSelect(it)}
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(t('Steps completed'))}"><span style="width:${pct}%"></span></div>
        <span class="mono muted small">${done}/${steps.length}</span>
      </div>
      <ul class="steps">
        ${steps.map((s, i) => {
          const tn = !s.done ? tone(s.d) : '';
          const dateCls = tn === 'danger' ? 'tx-danger' : tn === 'warn' ? 'tx-warn' : '';
          return `<li><button type="button" class="step ${s.done ? 'done' : ''}" data-action="toggle-step" data-id="${id}" data-idx="${i}" aria-pressed="${!!s.done}">
            <span class="check">${icon('check', 11, 3)}</span>
            <span class="step-label">${esc(s.t)}</span>
            <span class="step-date ${dateCls}">${esc(fmtDate(s.d))}</span>
          </button></li>`;
        }).join('')}
      </ul>
      <form class="add-step" data-id="${id}" hidden>
        <input class="input" name="t" maxlength="${LIMITS.stepText}" placeholder="${esc(t('Step, e.g. Upload transcript'))}" aria-label="${esc(t('Step name'))}" required />
        <input class="input" name="d" type="date" aria-label="${esc(t('Step date'))}" required />
        <button class="btn btn-sm btn-primary" type="submit">${esc(t('Add'))}</button>
      </form>
      <div class="notes" data-notes-wrap="${id}" ${it.notes ? '' : 'hidden'}>
        <label class="sr-only" for="notes-${id}">${esc(t('Notes for {title}', { title: it.title }))}</label>
        <textarea class="input notes-input" id="notes-${id}" data-notes="${id}" maxlength="${LIMITS.notes}" rows="3" placeholder="${esc(t('Notes: contact person, referral, what to prepare…'))}">${esc(it.notes || '')}</textarea>
      </div>
      <footer class="app-foot">
        <button type="button" class="btn btn-sm btn-ghost" data-action="show-add-step" data-id="${id}">${icon('plus', 14)}${esc(t('Add step'))}</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="show-notes" data-id="${id}">${icon('note', 14)}${esc(t('Notes'))}</button>
        ${payLine(it)}
        ${safeUrl(it.url) ? `<a class="src" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 13)}${esc(t('View posting'))}</a>` : ''}
      </footer>
    </article>`;
}

function boardCard(it) {
  const nx = nextStep(it);
  const id = esc(it.opportunity_id);
  return `
    <article class="card board-card" data-app="${id}">
      <b title="${esc(it.title)}">${esc(it.title)}</b>
      <small>${esc(it.org || t(CAT_SHORT[it.category] || 'Job'))}</small>
      ${nx ? `<span class="due t-${tone(nx.d)}"><i></i>${esc(nx.t)} · ${esc(relDue(nx.d))}</span>` : `<span class="due t-ok">${icon('check', 12, 2.5)}${esc(t('Complete'))}</span>`}
      <div class="board-foot">
        ${statusSelect(it)}
        <button type="button" class="icon-btn danger" data-action="remove" data-id="${id}" aria-label="${esc(t('Stop tracking {title}', { title: it.title }))}">${icon('trash', 14)}</button>
      </div>
    </article>`;
}

function sortedApps() {
  return [...S.registered].sort((a, b) => {
    const na = nextStep(a), nb = nextStep(b);
    if (!na && !nb) return (a.deadline || '').localeCompare(b.deadline || '');
    if (!na) return 1;
    if (!nb) return -1;
    return na.d.localeCompare(nb.d);
  });
}

function renderTracker() {
  const regs = S.registered;
  const live = regs.filter((it) => it.status !== 'rejected');
  const open = live.flatMap((it) => openSteps(it).map((s) => ({ s, it })));
  const doneCount = regs.reduce((n, it) => n + (it.steps_json || []).filter((s) => s.done).length, 0);
  const thisWeek = open.filter(({ s }) => { const n = daysLeft(s.d); return n >= 0 && n <= 7; });
  const next = open.filter(({ s }) => daysLeft(s.d) >= 0).sort((a, b) => a.s.d.localeCompare(b.s.d))[0];
  $('#trackerStats').innerHTML = [
    stat(t('Tracking'), regs.length, t(regs.length === 1 ? 'application' : 'applications')),
    stat(t('Open steps'), open.length, t('{n} completed', { n: doneCount })),
    stat(t('Due this week'), thisWeek.length, thisWeek.length ? t('Needs your attention') : t('Nothing pressing')),
    next ? stat(t('Next deadline'), fmtDate(next.s.d), `${next.s.t} · ${relDue(next.s.d).toLowerCase()}`) : stat(t('Next deadline'), '—', t('All clear')),
  ].join('');
  $('#weekSlot').innerHTML = regs.length ? weekStrip() : '';
  $$('#trackerView button').forEach((b) => b.classList.toggle('on', b.dataset.v === S.trackerView));

  const urgent = urgentSteps();
  $('#urgentSlot').innerHTML = urgent.length ? `
    <div class="callout" role="alert">
      <div class="callout-icon">${icon('alert', 16)}</div>
      <div class="callout-body">
        <div class="callout-title">${esc(urgent.length === 1 ? t('1 step is due within 3 days') : t('{n} steps are due within 3 days', { n: urgent.length }))}</div>
        <div class="callout-rows">
          ${urgent.slice(0, 3).map(({ s, it, idx }) => `
            <div class="callout-row">
              <span><b>${esc(s.t)}</b> — ${esc(it.title)} · <span class="${tone(s.d) === 'danger' ? 'tx-danger' : 'tx-warn'}">${esc(relDue(s.d).toLowerCase())}</span></span>
              <button type="button" class="btn btn-sm btn-secondary" data-action="toggle-step" data-id="${esc(it.opportunity_id)}" data-idx="${idx}">${icon('check', 14)}${esc(t('Mark done'))}</button>
            </div>`).join('')}
        </div>
      </div>
    </div>` : '';

  const box = $('#trackerList');
  const typing = document.activeElement && box.contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName);
  if (typing) return;
  box.className = S.trackerView === 'board' && regs.length ? 'board' : 'app-grid';
  if (!regs.length) {
    box.innerHTML = `
      <div class="empty">
        <div class="em-icon">${icon('inbox', 20)}</div>
        <h3>${esc(t('Nothing tracked yet'))}</h3>
        <p>${esc(t('Tap Track on any opportunity in Discover and its deadline will show up here.'))}</p>
        <button type="button" class="btn btn-primary" data-tab="discover">${icon('compass', 16)}${esc(t('Browse opportunities'))}</button>
      </div>`;
    return;
  }
  const list = sortedApps();
  if (S.trackerView === 'board') {
    box.innerHTML = Object.entries(STATUS).map(([status, label]) => {
      const items = list.filter((it) => (it.status || 'saved') === status);
      return `<section class="board-col" aria-label="${esc(t(label))}">
        <h3><span class="due t-${STATUS_TONE[status]}"><i></i>${esc(t(label))}</span><span class="mono muted small">${items.length}</span></h3>
        ${items.length ? items.map(boardCard).join('') : `<p class="board-empty">${esc(t('Nothing here'))}</p>`}
      </section>`;
    }).join('');
    return;
  }
  box.innerHTML = list.map(appCard).join('');
}

function track(id) {
  const o = findOpp(id);
  if (!o || isTracked(id)) return;
  if (S.registered.filter((r) => !r.sample).length >= LIMITS.apps) { toast(t('You can track at most {n} applications.', { n: LIMITS.apps }), { tone: 'warn' }); return; }
  const deadline = o.deadline || isoIn(30);
  const steps = (o.steps_json && o.steps_json.length ? o.steps_json : [{ t: o.deadline ? t('Apply') : t('Apply (no deadline listed)'), d: deadline }])
    .map((s) => ({ t: s.t, d: s.d, done: 0 }));
  S.registered.push(cleanApp({
    opportunity_id: o.id, title: o.title, org: o.org || o.source || '', region: o.region, category: o.category,
    deadline, url: o.url, pay: o.pay, funding: o.funding, status: 'saved', notes: '', steps_json: steps,
  }));
  renderAll();
  toast(t('Tracking {title}', { title: o.title }), { tone: 'ok', action: t('View'), onAction: () => { closeDetail(); go('tracker'); } });
  pushApp(o.id, { now: true });
}

function removeApp(id) {
  const idx = S.registered.findIndex((r) => r.opportunity_id === id);
  if (idx < 0) return;
  const [item] = S.registered.splice(idx, 1);
  renderAll();
  dropApp(id);
  toast(t('Stopped tracking {title}', { title: item.title }), {
    action: t('Undo'),
    timeout: 6000,
    onAction: () => {
      if (isTracked(item.opportunity_id)) return;
      item.rev = null;
      S.registered.splice(Math.min(idx, S.registered.length), 0, item);
      renderAll();
      pushApp(item.opportunity_id, { now: true });
    },
  });
}

function toggleStep(id, idx) {
  const it = S.registered.find((r) => r.opportunity_id === id);
  const step = it?.steps_json?.[idx];
  if (!step) return;
  step.done = step.done ? 0 : 1;
  renderTracker();
  renderChrome();
  pushApp(id);
  if (step.done && openSteps(it).length === 0) toast(t('All steps done for {title}', { title: it.title }), { tone: 'ok' });
}

function addStep(id, text, d) {
  const it = S.registered.find((r) => r.opportunity_id === id);
  if (!it || !text.trim() || !isIso(d)) return;
  if (it.steps_json.length >= LIMITS.steps) { toast(t('An application can have at most {n} steps.', { n: LIMITS.steps }), { tone: 'warn' }); return; }
  it.steps_json.push({ t: text.trim().slice(0, LIMITS.stepText), d, done: 0 });
  it.steps_json.sort((a, b) => a.d.localeCompare(b.d));
  if (d > (it.deadline || '')) it.deadline = d;
  if (document.activeElement && $('#trackerList').contains(document.activeElement)) document.activeElement.blur();
  renderTracker();
  renderChrome();
  pushApp(id);
}

function setStatus(id, status) {
  const it = S.registered.find((r) => r.opportunity_id === id);
  if (!it || !STATUS[status]) return;
  it.status = status;
  renderTracker();
  renderChrome();
  pushApp(id);
}

function setNotes(id, value) {
  const it = S.registered.find((r) => r.opportunity_id === id);
  if (!it) return;
  it.notes = String(value).slice(0, LIMITS.notes);
  pushApp(id);
}

function bindTracker() {
  const page = $('#page-tracker');
  page.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-status]');
    if (sel) setStatus(sel.dataset.status, sel.value);
  });
  page.addEventListener('input', (e) => {
    const area = e.target.closest('[data-notes]');
    if (area) setNotes(area.dataset.notes, area.value);
  });
  page.addEventListener('focusout', (e) => {
    if (e.target.closest && e.target.closest('[data-notes]')) setTimeout(renderTracker, 0);
  });
  $('#trackerView').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.trackerView = b.dataset.v === 'board' ? 'board' : 'list';
    saveStore();
    renderTracker();
  });
}
