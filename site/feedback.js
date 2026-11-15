'use strict';

const FB_MAX = 1000;
const FB_PIECES = 28;
let fbTimer = 0;
let fbBusy = false;

function fbCounts() {
  for (const id of ['fbProblem', 'fbFeatures']) {
    const n = $(`#${id}`).value.length;
    const out = $(`#${id}Count`);
    out.textContent = t('{n} / {max}', { n: n.toLocaleString(), max: FB_MAX.toLocaleString() });
    out.classList.toggle('is-full', n >= FB_MAX);
  }
}

function fbMessage(text, formUrl) {
  const box = $('#fbMsg');
  box.textContent = text || '';
  if (!text || !formUrl || !/^https:\/\/docs\.google\.com\/forms\/[A-Za-z0-9_\-/]+\/viewform$/.test(formUrl)) return;
  const link = document.createElement('a');
  link.href = formUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = t('Open the feedback form');
  box.append(' ', link);
}

function fbShowForm() {
  clearTimeout(fbTimer);
  fbTimer = 0;
  $('#fbThanks').hidden = true;
  $('#fbThanks').innerHTML = '';
  $('#fbForm').hidden = false;
  $('#fbNotice').textContent = t('Your feedback is saved together with your account email ({email}) in a Google Form. You don’t need to fill it in.', { email: Backend.user ? Backend.user.email : '' });
  fbMessage('');
  fbCounts();
}

function openFeedback() {
  if (!Backend.enabled) { toast(t('Feedback needs an account, and accounts are not switched on yet.'), { tone: 'warn' }); return; }
  if (!signedIn()) {
    toast(t('Sign in to send feedback.'), { tone: 'warn', action: t('Sign in'), onAction: () => openAuth('signin'), timeout: 7000 });
    return;
  }
  const dlg = $('#feedback');
  fbShowForm();
  if (!dlg.open) dlg.showModal();
  $('#fbProblem').focus({ preventScroll: true });
}

function closeFeedback() {
  const dlg = $('#feedback');
  if (dlg.open) dlg.close();
}

function fbPieces() {
  const out = [];
  for (let i = 0; i < FB_PIECES; i += 1) {
    const angle = ((i + Math.random() * 0.7) / FB_PIECES) * Math.PI * 2;
    const far = 78 + Math.random() * 86;
    const x = Math.round(Math.cos(angle) * far);
    const y = Math.round(Math.sin(angle) * far * 0.82 + 22 + Math.random() * 26);
    const size = (6 + Math.random() * 6).toFixed(1);
    const turn = Math.round((Math.random() < 0.5 ? -1 : 1) * (160 + Math.random() * 380));
    const delay = (0.32 + Math.random() * 0.26).toFixed(2);
    const time = (1.25 + Math.random() * 0.55).toFixed(2);
    out.push(`<i class="fb-bit fb-shape-${i % 4} fb-tint-${(i * 3 + 1) % 4}" style="--x:${x}px;--y:${y}px;--s:${size}px;--r:${turn}deg;--d:${delay}s;--t:${time}s"></i>`);
  }
  return out.join('');
}

function fbThanks() {
  clearTimeout(fbTimer);
  const box = $('#fbThanks');
  $('#fbForm').hidden = true;
  box.hidden = false;
  box.innerHTML = `
    <div class="fb-stage" aria-hidden="true">
      <span class="fb-glow"></span>
      ${fbPieces()}
      <svg class="fb-badge" viewBox="0 0 80 80" width="80" height="80" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <circle class="fb-ring" cx="40" cy="40" r="34" pathLength="1" />
        <path class="fb-tick" d="M26 41.5 36 51 55 30.5" pathLength="1" />
      </svg>
    </div>
    <h2 class="fb-title">${esc(t('Thank you for your feedback!'))}</h2>
    <p class="fb-line">${esc(t('It helps us make SujogKhuji better for everyone.'))}</p>
    <button type="button" class="btn btn-primary fb-done" data-action="close-feedback">${esc(t('Done'))}</button>`;
  $('.fb-done', box).focus({ preventScroll: true });
  fbTimer = setTimeout(closeFeedback, 4200);
}

async function sendFeedback(e) {
  e.preventDefault();
  if (fbBusy) return;
  const problem = $('#fbProblem').value.trim().slice(0, FB_MAX);
  const features = $('#fbFeatures').value.trim().slice(0, FB_MAX);
  if (!problem && !features) { fbMessage(t('Write something in at least one box.')); $('#fbProblem').focus(); return; }
  if (!S.online) { fbMessage(t('You are offline. Your text is still here, so you can send it when you are back online.')); return; }
  const btn = $('#fbSend');
  fbBusy = true;
  btn.disabled = true;
  btn.classList.add('is-busy');
  btn.setAttribute('aria-busy', 'true');
  fbMessage('');
  try {
    await Backend.callApi('/api/feedback', { problem, features, website: $('#fbWebsite').value }, { timeout: 25000 });
    $('#fbProblem').value = '';
    $('#fbFeatures').value = '';
    fbThanks();
  } catch (err) {
    const texts = {
      rate_limited: 'You have sent the most feedback allowed for today. Please try again tomorrow.',
      sign_in: 'Sign in again to send feedback.',
      empty: 'Write something in at least one box.',
      too_large: 'That feedback is too long. Each box takes up to 1,000 characters.',
    };
    const text = texts[err.code] || 'Your feedback could not be sent right now. Your text is still here, so you can try again.';
    fbMessage(t(text), err.data && typeof err.data.form === 'string' ? err.data.form : '');
  } finally {
    fbBusy = false;
    btn.disabled = false;
    btn.classList.remove('is-busy');
    btn.removeAttribute('aria-busy');
  }
}

function bindFeedback() {
  const dlg = $('#feedback');
  $('#fbForm').addEventListener('submit', sendFeedback);
  $('#fbForm').addEventListener('input', (e) => { if (e.target.matches('.fb-box')) { fbCounts(); fbMessage(''); } });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) { dlg.close(); return; }
    if (e.target.closest('[data-action="close-feedback"]')) dlg.close();
  });
  dlg.addEventListener('close', () => {
    clearTimeout(fbTimer);
    fbTimer = 0;
    $('#fbThanks').hidden = true;
    $('#fbThanks').innerHTML = '';
    $('#fbForm').hidden = false;
  });
}
