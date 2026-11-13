'use strict';

let detailId = null;

function closeDetail() {
  const dlg = $('#detail');
  if (dlg && dlg.open) dlg.close();
}

function detailRows(o) {
  const exp = experienceLabel(o);
  const rows = [
    ['Category', t(CAT[o.category] || 'Opportunity')],
    ['Location', [o.country, t(REGION[o.region] || 'Global')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')],
    ['Deadline', o.deadline ? `${fmtDate(o.deadline, true)} · ${relDue(o.deadline).toLowerCase()}` : t('Not listed. Check the posting.')],
    ['Experience', exp ? exp.text : ''],
    ['Job type', JOB_TYPE[o.job_type] ? t(JOB_TYPE[o.job_type]) : ''],
    ['Work mode', WORK_MODE[o.work_mode] ? t(WORK_MODE[o.work_mode]) : ''],
    ['Education', EDUCATION[o.education] ? t(EDUCATION[o.education]) : ''],
    ['Field', FIELD[o.field] ? t(FIELD[o.field]) : ''],
    ['Organisation', ORG_TYPE[o.org_type] ? t(ORG_TYPE[o.org_type]) : ''],
    ['Funding', FUNDING[o.funding] ? t(FUNDING[o.funding]) : ''],
    ['Pay', o.pay || ''],
    ['Found', o.found ? fmtDate(o.found, true) : ''],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
}

function renderDetail() {
  const o = findOpp(detailId);
  const body = $('#detailBody');
  if (!o) {
    body.innerHTML = `<div class="empty empty-plain"><div class="em-icon">${icon('search', 20)}</div><h3>${esc(t('This listing is no longer open'))}</h3><p>${esc(t('It may have closed or been removed.'))}</p></div>`;
    return;
  }
  const tracked = isTracked(o.id);
  const reported = S.reported.includes(o.id);
  const id = esc(o.id);
  const host = o.custom ? '' : sourceHost(o);
  body.innerHTML = `
    <header class="detail-head">
      ${logo(o.org || o.source || o.title)}
      <div>
        <h2 id="detailTitle">${esc(o.title)}</h2>
        <p class="sub">${esc(o.org || '')}${o.org && host ? '<span class="sep"> · </span>' : ''}${host ? `<span class="mono">${esc(host)}</span>` : esc(t('added by you'))}</p>
      </div>
    </header>
    <div class="tags">${trustBadge(o, true)}${o.funding ? `<span class="tag ${o.funding === 'full' ? 'tag-funded' : 'tag-partial'}">${icon('star', 13)}${esc(t(FUNDING[o.funding]))}</span>` : ''}</div>
    ${o.summary ? `<p class="detail-summary">${esc(o.summary)}</p>` : ''}
    <dl class="kv detail-kv">${detailRows(o)}</dl>
    ${!o.custom && !o.verified ? `<div class="notice">${icon('info', 15)}<span>${esc(t('We found this on a site we do not know. Real employers and scholarships never ask you to pay to apply.'))}</span></div>` : ''}
    <div class="detail-actions">
      ${safeUrl(o.url) ? `<a class="btn btn-primary" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">${icon('external', 16)}${esc(t('Open the posting'))}</a>` : ''}
      ${tracked
        ? `<button type="button" class="btn btn-tracking" data-action="goto-tracker">${icon('check', 16, 2.25)}${esc(t('Tracking'))}</button>`
        : `<button type="button" class="btn btn-secondary" data-action="track" data-id="${id}">${icon('plus', 16)}${esc(t('Track'))}</button>`}
      <button type="button" class="btn btn-secondary" data-action="share" data-id="${id}">${icon('share', 16)}${esc(t('Share'))}</button>
      ${o.deadline ? `<button type="button" class="btn btn-secondary" data-action="calendar" data-id="${id}">${icon('calendar', 16)}${esc(t('Add to calendar'))}</button>` : ''}
    </div>
    ${o.custom || o.live ? '' : `
    <div class="report-box">
      ${reported
        ? `<p class="muted small">${icon('flag', 13)} ${esc(t('You reported this listing. Thank you.'))}</p>`
        : `<button type="button" class="link-btn report-toggle" data-action="report-open" aria-expanded="false" aria-controls="reportForm">${icon('flag', 13)}${esc(t('Report this listing'))}</button>
        <form id="reportForm" class="report-form" hidden>
          <fieldset>
            <legend>${esc(t('What is wrong with it?'))}</legend>
            ${Object.entries(REPORT_REASONS).map(([v, label], i) => `<label class="radio"><input type="radio" name="reason" value="${v}" ${i === 0 ? 'checked' : ''} /> ${esc(t(label))}</label>`).join('')}
          </fieldset>
          <p class="form-msg" id="reportMsg" role="alert"></p>
          <button type="submit" class="btn btn-sm btn-secondary">${esc(t('Send report'))}</button>
        </form>`}
    </div>`}`;
}

function openDetail(id) {
  detailId = id;
  renderDetail();
  const dlg = $('#detail');
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

async function shareListing(id) {
  const o = findOpp(id);
  if (!o) return;
  const text = `${o.title}${o.org ? ` — ${o.org}` : ''}`;
  const url = safeUrl(o.url) ? o.url : location.origin + location.pathname;
  if (navigator.share) {
    try { await navigator.share({ title: o.title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast(t('Link copied'), { tone: 'ok' });
  } catch {
    toast(t('Could not copy the link.'), { tone: 'warn' });
  }
}

const icsText = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1').slice(0, 600);

function calendarFile(o) {
  const day = o.deadline.replace(/-/g, '');
  const end = new Date(Date.parse(o.deadline + 'T00:00:00Z') + DAY).toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SujogKhuji//Deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${String(o.id).replace(/[^A-Za-z0-9-]/g, '')}@sujogkhuji`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${icsText(`${t('Deadline')}: ${o.title}`)}`,
    `DESCRIPTION:${icsText(`${o.org || ''}\n${safeUrl(o.url) ? o.url : ''}`.trim())}`,
    ...(safeUrl(o.url) ? [`URL:${o.url.replace(/[\r\n]/g, '')}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(o.title)}`, 'TRIGGER:-P2D', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

function addToCalendar(id) {
  const o = findOpp(id);
  if (!o || !isIso(o.deadline)) return;
  const blob = new Blob([calendarFile(o)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${String(o.title).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'deadline'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(t('Calendar file downloaded. Open it to add the deadline.'), { tone: 'ok' });
}

async function sendReport(form) {
  const o = findOpp(detailId);
  if (!o) return;
  const msg = $('#reportMsg');
  if (!signedIn()) {
    msg.textContent = t('Sign in to report a listing. This keeps reports honest.');
    return;
  }
  const reason = new FormData(form).get('reason');
  if (!REPORT_REASONS[reason]) return;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await Backend.rest('/reports', { method: 'POST', body: { opportunity_id: String(o.id).slice(0, 40), reason }, prefer: 'return=minimal' });
  } catch (e) {
    if (e.status !== 409) {
      btn.disabled = false;
      msg.textContent = /at most 20/.test(e.detail || '') ? t('You have reported many listings today. Try again tomorrow.') : t('Could not send the report. Please try again.');
      return;
    }
  }
  if (!S.reported.includes(o.id)) S.reported.push(o.id);
  saveStore();
  closeDetail();
  renderAll();
  toast(t('Thanks. The listing is hidden for you and will be reviewed.'), { tone: 'ok' });
}

function bindDetail() {
  const dlg = $('#detail');
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { dlg.close(); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const { action, id } = a.dataset;
    if (action === 'close-detail') dlg.close();
    else if (action === 'share') shareListing(id);
    else if (action === 'calendar') addToCalendar(id);
    else if (action === 'goto-tracker') { dlg.close(); go('tracker'); }
    else if (action === 'report-open') {
      const form = $('#reportForm');
      form.hidden = !form.hidden;
      a.setAttribute('aria-expanded', String(!form.hidden));
    }
  });
  dlg.addEventListener('submit', (e) => {
    if (e.target.id !== 'reportForm') return;
    e.preventDefault();
    sendReport(e.target);
  });
}
