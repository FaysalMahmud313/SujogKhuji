'use strict';

const FLOWS = {
  signup: ['email', 'code', 'password', 'about'],
  signin: ['email'],
  codein: ['email', 'code'],
  reset: ['email', 'code', 'password'],
  change: ['email', 'code'],
  setpass: ['password'],
  about: ['about'],
};
const STEP_NAMES = { email: 'Email', code: 'Code', password: 'Password', about: 'About you' };
const CODE_LIFE = 10 * 60 * 1000;
const MAX_WRONG = 5;
const F = { kind: 'signup', step: 'email', email: '', sentAt: 0, wrong: 0, resendAt: 0, busy: false, timer: 0 };

const Captcha = (() => {
  const key = Backend.captchaKey;
  let loading = null;
  let widget = null;
  let waiter = null;
  const settle = (fn, value) => { const w = waiter; waiter = null; if (w) w[fn](value); };
  function load() {
    if (window.turnstile) return Promise.resolve();
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { loading = null; reject(new Error(t('The security check could not load. Check your connection and try again.'))); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }
  async function token() {
    if (!key) return '';
    await load();
    const slot = $('#captchaSlot');
    slot.hidden = false;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => settle('reject', new Error(t('The security check took too long. Please try again.'))), 45000);
      waiter = {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      };
      const failed = () => settle('reject', new Error(t('The security check failed. Please try again.')));
      if (widget === null) {
        widget = window.turnstile.render(slot, {
          sitekey: key,
          appearance: 'interaction-only',
          theme: resolvedTheme(),
          callback: (value) => settle('resolve', value),
          'error-callback': failed,
          'timeout-callback': failed,
        });
      } else {
        window.turnstile.reset(widget);
      }
    });
  }
  return { enabled: !!key, token };
})();

const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;

function passwordScore(p) {
  let score = 0;
  if (p.length >= 8) score += 1;
  if (p.length >= 12) score += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) score += 1;
  else if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) score += 0.5;
  if (/^(.)\1+$/.test(p) || /^(password|12345678|qwertyui)/i.test(p)) score = Math.min(score, 1);
  return Math.min(4, Math.floor(score));
}

function paintMeter() {
  const p = $('#flowNewPass').value;
  const score = p ? Math.max(1, passwordScore(p)) : 0;
  const names = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  $('#passMeter').dataset.score = String(score);
  $('#passHint').textContent = p.length && p.length < 8 ? t('At least 8 characters.') : score ? t(names[score]) : t('At least 8 characters. A longer phrase is stronger.');
}

function flowMsg(text, ok = false) {
  const el = $('#flowMsg');
  el.textContent = text || '';
  el.className = `form-msg ${ok ? 'ok' : ''}`;
}

function setBusy(on) {
  F.busy = on;
  const btn = $('#flowSubmit');
  btn.disabled = on;
  btn.classList.toggle('is-busy', on);
  btn.setAttribute('aria-busy', String(on));
}

function codeInputs() { return $$('#codeBoxes input'); }
function codeValue() { return codeInputs().map((i) => i.value).join(''); }
function fillCode(digits, from = 0) {
  const boxes = codeInputs();
  const clean = String(digits).replace(/\D/g, '');
  for (let i = 0; i < clean.length && from + i < boxes.length; i += 1) boxes[from + i].value = clean[i];
  const next = Math.min(boxes.length - 1, from + clean.length);
  boxes[next].focus();
  if (codeValue().length === boxes.length && !F.busy) $('#flowForm').requestSubmit();
}
function clearCode() {
  codeInputs().forEach((i) => { i.value = ''; i.disabled = false; });
}

function tickResend() {
  clearInterval(F.timer);
  const btn = $('#codeResend');
  const paint = () => {
    const left = Math.ceil((F.resendAt - Date.now()) / 1000);
    btn.disabled = left > 0;
    btn.textContent = left > 0 ? t('Resend code in {n}s', { n: left }) : t('Resend code');
    if (left <= 0) clearInterval(F.timer);
  };
  paint();
  F.timer = setInterval(paint, 1000);
}

function setExpChoice(experienced) {
  $$('#obExp [data-v]').forEach((b) => {
    const on = experienced !== null && (b.dataset.v === 'experienced') === experienced;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
  });
  $('#obYearsWrap').hidden = experienced !== true;
}

function fillAbout() {
  const p = S.profile;
  $('#obName').value = p.name || '';
  $('#obField').value = p.field || 'any';
  $('#obInst').value = p.institution || '';
  loadInstitutions();
  $('#obStatus').value = p.studyStatus || '3rd Year';
  $('#obGrad').value = String(p.gradYear);
  $('#obYears').value = String(Math.max(1, userYears() || 2));
  setExpChoice(p.onboarded ? userYears() > 0 : null);
  $$('#obRegion button').forEach((b) => b.classList.toggle('on', b.dataset.v === p.regionScope));
  $$('#obMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === p.workMode));
}

function showFlow(kind, step, note = '') {
  F.kind = FLOWS[kind] ? kind : 'signup';
  F.step = step || FLOWS[F.kind][0];
  const signed = signedIn();
  const titles = {
    'signup:email': ['Create your account', 'Enter your email and we will send you a 6-digit code to verify it.', 'Send my code'],
    'signin:email': ['Welcome back', 'Sign in to see your applications on this device.', 'Sign in'],
    'codein:email': ['Sign in with a code', 'We will email you a 6-digit code. No password needed.', 'Send my code'],
    'reset:email': ['Reset your password', 'Enter your email. If it has an account, we will send a 6-digit code.', 'Send my code'],
    'change:email': ['Change your email', 'Enter the new address. We will send a code there to confirm it.', 'Send my code'],
    'signup:password': ['Choose a password', 'You will use it with your email to sign in next time.', 'Save and continue'],
    'reset:password': ['Choose a new password', 'Pick a password you have not used here before.', 'Save new password'],
    'setpass:password': ['Change your password', 'Pick a password you have not used here before.', 'Save new password'],
    'signup:about': ['Tell us about you', 'This decides which jobs, internships and scholarships you see first.', 'Finish'],
    'about:about': [S.profile.onboarded ? 'About you' : 'Welcome to SujogKhuji', 'This decides which jobs, internships and scholarships you see first.', S.profile.onboarded ? 'Save' : 'Continue'],
  };
  const codeTitle = ['Enter the code', t('We sent a 6-digit code to {email}. It works for 10 minutes.', { email: F.email }), 'Verify'];
  const [title, sub, action] = F.step === 'code' ? codeTitle : (titles[`${F.kind}:${F.step}`] || titles['signup:email']);
  $('#flowTitle').textContent = t(title);
  $('#flowSub').textContent = note || (F.step === 'code' ? sub : t(sub));
  $('#flowSubmit').textContent = t(action);
  $$('#flow [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== F.step; });

  const steps = FLOWS[F.kind];
  const stepper = $('#flowSteps');
  stepper.hidden = steps.length < 3;
  stepper.innerHTML = steps.map((s, i) => {
    const at = steps.indexOf(F.step);
    const state = i < at ? 'done' : i === at ? 'now' : '';
    return `<li class="${state}" ${i === at ? 'aria-current="step"' : ''}><span class="dot">${i < at ? icon('check', 11, 3) : i + 1}</span><span>${esc(t(STEP_NAMES[s]))}</span></li>`;
  }).join('');

  const first = F.step === 'email';
  $('#flowMode').hidden = !(first && (F.kind === 'signup' || F.kind === 'signin'));
  $$('#flowMode [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === F.kind));
  $('#flowPassWrap').hidden = F.kind !== 'signin';
  $('#flowKeepWrap').hidden = !(first && F.kind !== 'change');
  $('#flowKeep').checked = Backend.keep;
  $('#flowLegal').hidden = !(first && F.kind === 'signup');
  $('#captchaSlot').hidden = !Captcha.enabled || F.step !== 'email' && F.step !== 'code';
  const mustFinish = F.step === 'about' && !S.profile.onboarded;
  $('#flowClose').hidden = mustFinish || (F.kind === 'signup' && (F.step === 'password'));

  const alt1 = $('#flowAlt1');
  const alt2 = $('#flowAlt2');
  alt1.hidden = true;
  alt2.hidden = true;
  const offer = (el, label, action) => { el.hidden = false; el.textContent = t(label); el.dataset.go = action; };
  if (first && F.kind === 'signin') { offer(alt1, 'Email me a code instead', 'codein'); offer(alt2, 'Forgot password?', 'reset'); }
  else if (first && F.kind === 'signup' && !S.profile.onboarded) offer(alt1, 'Continue without an account', 'guest');
  else if (first && (F.kind === 'codein' || F.kind === 'reset')) offer(alt1, 'Back to sign in', 'signin');
  else if (F.step === 'about' && !signed && Backend.enabled && !S.profile.onboarded) offer(alt1, 'I already have an account', 'signin');

  flowMsg('');
  setBusy(false);
  if (F.step === 'code') { clearCode(); tickResend(); }
  if (F.step === 'password') { $('#flowNewPass').value = ''; paintMeter(); }
  if (F.step === 'about') fillAbout();
  const dlg = $('#flow');
  if (!dlg.open) dlg.showModal();
  const focus = { email: '#flowEmail', code: '#codeBoxes input', password: '#flowNewPass', about: '#obExp [data-v]' }[F.step];
  setTimeout(() => $(focus)?.focus(), 30);
}

function openAuth(kind = 'signup') {
  if (!Backend.enabled) { toast(t('Accounts are not switched on for this site yet.'), { tone: 'warn' }); return; }
  $('#flowEmail').value = kind === 'change' ? '' : $('#flowEmail').value;
  $('#flowPass').value = '';
  showFlow(kind);
}

function openOnboarding() {
  if ($('#flow').open) return;
  if (Backend.enabled && !signedIn() && !S.profile.onboarded) showFlow('signup');
  else showFlow('about');
}

function closeFlow() {
  clearInterval(F.timer);
  const dlg = $('#flow');
  if (dlg.open) dlg.close();
}

async function sendCode() {
  const email = F.email;
  const captcha = await Captcha.token();
  try {
    if (F.kind === 'reset') await Backend.requestReset(email, captcha);
    else if (F.kind === 'change') await Backend.requestEmailChange(email);
    else await Backend.requestCode(email, { create: F.kind === 'signup', captcha });
  } catch (e) {
    const hidden = /signups? not allowed|user not found|otp_disabled/i.test(e.detail || '');
    if (!hidden) {
      if (F.kind === 'change' && e.status === 422) throw new Error(t('That email cannot be used. Try another one.'));
      throw e;
    }
  }
  F.sentAt = Date.now();
  F.resendAt = Date.now() + 60000;
  F.wrong = 0;
}

async function afterSignIn(message) {
  await loadAccount();
  if (!signedIn()) { closeFlow(); return; }
  if (!S.profile.onboarded) { showFlow('about'); return; }
  closeFlow();
  toast(message || t('Signed in. Your data is up to date.'), { tone: 'ok' });
}

async function submitFlow(e) {
  e.preventDefault();
  if (F.busy) return;
  flowMsg('');
  const key = `${F.kind}:${F.step}`;
  try {
    if (F.step === 'email') {
      const email = $('#flowEmail').value.trim().toLowerCase();
      if (!validEmail(email)) { flowMsg(t('Please enter a valid email address.')); $('#flowEmail').focus(); return; }
      if (F.kind === 'change' && signedIn() && email === Backend.user.email) { flowMsg(t('That is already your email.')); return; }
      F.email = email;
      if (F.kind !== 'change') Backend.setKeep($('#flowKeep').checked);
      setBusy(true);
      if (F.kind === 'signin') {
        const password = $('#flowPass').value;
        if (!password) { setBusy(false); flowMsg(t('Enter your password.')); $('#flowPass').focus(); return; }
        await Backend.signIn(email, password, await Captcha.token());
        $('#flowPass').value = '';
        await afterSignIn();
        return;
      }
      await sendCode();
      showFlow(F.kind, 'code');
      return;
    }

    if (F.step === 'code') {
      const code = codeValue();
      if (code.length !== 6) { flowMsg(t('Enter all 6 digits of the code.')); return; }
      if (Date.now() - F.sentAt > CODE_LIFE) { flowMsg(t('This code has expired. Request a new one.')); clearCode(); return; }
      if (F.wrong >= MAX_WRONG) { flowMsg(t('Too many wrong tries. Request a new code.')); return; }
      setBusy(true);
      const type = F.kind === 'reset' ? 'recovery' : F.kind === 'change' ? 'email_change' : 'email';
      try {
        await Backend.verifyCode(F.email, code, type);
      } catch (err) {
        setBusy(false);
        if (err.message !== 'WRONG_CODE') { flowMsg(t(err.message)); return; }
        F.wrong += 1;
        clearCode();
        codeInputs()[0].focus();
        if (F.wrong >= MAX_WRONG) {
          codeInputs().forEach((i) => { i.disabled = true; });
          flowMsg(t('Too many wrong tries. Request a new code.'));
        } else {
          flowMsg(t('Wrong code. Check the email and try again ({n} tries left).', { n: MAX_WRONG - F.wrong }));
        }
        return;
      }
      clearInterval(F.timer);
      if (F.kind === 'change') {
        closeFlow();
        renderAll();
        toast(t('Your email is now {email}.', { email: Backend.user.email }), { tone: 'ok' });
        return;
      }
      if (F.kind === 'reset') { showFlow('reset', 'password'); return; }
      if (F.kind === 'codein') { await afterSignIn(); return; }
      await loadAccount();
      if (!signedIn()) { closeFlow(); return; }
      if (S.profile.onboarded) { closeFlow(); toast(t('Email verified. Welcome back!'), { tone: 'ok' }); return; }
      showFlow('signup', 'password');
      return;
    }

    if (F.step === 'password') {
      const password = $('#flowNewPass').value;
      if (password.length < 8) { flowMsg(t('Password must be at least 8 characters.')); return; }
      if (passwordScore(password) < 2) { flowMsg(t('That password is too easy to guess. Make it longer or mix letters and numbers.')); return; }
      setBusy(true);
      await Backend.updatePassword(password);
      $('#flowNewPass').value = '';
      if (F.kind === 'signup') { showFlow('signup', 'about'); return; }
      if (F.kind === 'reset') { await afterSignIn(t('Password updated. You are signed in.')); return; }
      closeFlow();
      toast(t('Password updated.'), { tone: 'ok' });
      return;
    }

    if (F.step === 'about') {
      const chosen = $('#obExp .choice.on');
      if (!chosen) { flowMsg(t('Choose Fresher or Experienced to continue.')); return; }
      let years = 0;
      if (chosen.dataset.v === 'experienced') {
        years = Math.round(Number($('#obYears').value));
        if (!Number.isFinite(years) || years < 1 || years > 50) { flowMsg(t('Years of experience must be a number from 1 to 50.')); $('#obYears').focus(); return; }
      }
      const first = !S.profile.onboarded;
      Object.assign(S.profile, cleanProfile({
        ...S.profile,
        name: $('#obName').value.trim() || S.profile.name,
        field: $('#obField').value,
        institution: $('#obInst').value.trim(),
        studyStatus: $('#obStatus').value,
        gradYear: parseInt($('#obGrad').value, 10),
        regionScope: $('#obRegion button.on')?.dataset.v || 'ALL',
        workMode: $('#obMode button.on')?.dataset.v || 'any',
        experienceYears: years,
        onboarded: true,
      }));
      S.filters = { ...DEFAULT_FILTERS, region: S.profile.regionScope };
      setBusy(true);
      await pushProfile();
      fillProfile();
      closeFlow();
      syncUrl();
      renderAll();
      if (first) toast(years === 0 ? t('All set. Showing fresher-friendly opportunities first.') : t('All set. Showing roles that fit {x}.', { x: experienceText().toLowerCase() }), { tone: 'ok' });
      else toast(t('Saved'), { tone: 'ok' });
      return;
    }
    throw new Error(`Unknown step ${key}`);
  } catch (err) {
    setBusy(false);
    flowMsg(err && err.message && err.message !== 'WRONG_CODE' ? t(err.message) : t('Something went wrong. Please try again.'));
  }
}

async function signOut() {
  const waiting = S.pending.upsert.length + S.pending.remove.length + pushTimers.size;
  if (waiting) {
    parkTimers();
    await Promise.race([flushPending(), wait(2500)]);
    const left = S.pending.upsert.length + S.pending.remove.length;
    if (left && !confirm(t('Some changes have not reached your account yet and will be lost. Sign out anyway?'))) return;
  }
  await Backend.signOut();
  clearAccountData();
  toast(t('Signed out. Your data stays safe in your account.'));
}

function renderAccount() {
  const box = $('#accountBox');
  const hint = $('#saveHint');
  if (!hint.dataset.saved) hint.textContent = signedIn() ? t('Changes are saved to your account.') : t('Saved in this browser.');
  $$('.signout-quick').forEach((b) => { b.hidden = !signedIn(); });
  if (!Backend.enabled) {
    box.innerHTML = `<div class="switch-row"><div><b>${esc(t('Accounts are not switched on yet'))}</b><small>${esc(t('Your profile and applications are saved in this browser. Use Export / Import below to move them.'))}</small></div></div>`;
    return;
  }
  if (signedIn()) {
    box.innerHTML = `
      <div class="switch-row">
        <div><b>${esc(Backend.user.email)}</b><small>${icon('shield', 12)} ${esc(S.syncing ? t('Syncing…') : t('Email verified. Profile and applications are synced.'))}</small></div>
        <button class="btn btn-sm btn-secondary" data-action="sign-out" type="button">${icon('logout', 14)}${esc(t('Sign out'))}</button>
      </div>
      <div class="divider"></div>
      <div class="actions">
        <button class="btn btn-sm btn-ghost" data-action="open-auth" data-mode="change" type="button">${icon('mail', 14)}${esc(t('Change email'))}</button>
        <button class="btn btn-sm btn-ghost" data-action="open-auth" data-mode="setpass" type="button">${icon('key', 14)}${esc(t('Change password'))}</button>
      </div>`;
    return;
  }
  box.innerHTML = `
    <div class="switch-row">
      <div><b>${esc(t('Not signed in'))}</b><small>${esc(t('Create a free account to use SujogKhuji on your phone and PC with the same data.'))}</small></div>
      <div class="actions">
        <button class="btn btn-sm btn-secondary" data-action="open-auth" data-mode="signin" type="button">${esc(t('Sign in'))}</button>
        <button class="btn btn-sm btn-primary" data-action="open-auth" data-mode="signup" type="button">${esc(t('Create account'))}</button>
      </div>
    </div>`;
}

function askMove(email) {
  const dlg = $('#moveDialog');
  $('#moveText').textContent = t('This browser has applications and a profile saved without an account. Move them into {email}?', { email });
  return new Promise((resolve) => {
    const done = (value) => {
      dlg.removeEventListener('close', onClose);
      resolve(value);
    };
    const onClose = () => done(dlg.returnValue === 'move');
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    if (!dlg.open) dlg.showModal();
  });
}

function askName(title, value) {
  const dlg = $('#nameDialog');
  $('#nameTitle').textContent = title;
  $('#nameInput').value = value || '';
  return new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      const name = $('#nameInput').value.trim().slice(0, 40);
      resolve(dlg.returnValue === 'ok' && name ? name : null);
    };
    dlg.addEventListener('close', onClose);
    dlg.returnValue = '';
    dlg.showModal();
    setTimeout(() => $('#nameInput').select(), 30);
  });
}

function bindAuth() {
  $('#flowForm').addEventListener('submit', submitFlow);
  let closedByUser = false;
  $('#flow').addEventListener('cancel', (e) => {
    if ($('#flowClose').hidden) e.preventDefault();
    else closedByUser = true;
  });
  $('#flow').addEventListener('close', () => {
    clearInterval(F.timer);
    const byUser = closedByUser;
    closedByUser = false;
    if (byUser && !S.profile.onboarded && F.step !== 'about') setTimeout(() => showFlow('about'), 0);
  });
  $('#moveDialog').addEventListener('cancel', (e) => e.preventDefault());
  $('#flowClose').addEventListener('click', () => { closedByUser = true; closeFlow(); });
  $('#flowMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b && b.dataset.v !== F.kind) showFlow(b.dataset.v);
  });
  const alt = (e) => {
    const target = e.currentTarget.dataset.go;
    if (target === 'guest') showFlow('about');
    else showFlow(target);
  };
  $('#flowAlt1').addEventListener('click', alt);
  $('#flowAlt2').addEventListener('click', alt);
  $('#flowNewPass').addEventListener('input', paintMeter);
  $('#codeBack').addEventListener('click', () => showFlow(F.kind, 'email'));
  $('#codeResend').addEventListener('click', async () => {
    if (F.busy || Date.now() < F.resendAt) return;
    setBusy(true);
    try {
      await sendCode();
      clearCode();
      flowMsg(t('A new code is on its way.'), true);
      tickResend();
      codeInputs()[0].focus();
    } catch (err) {
      flowMsg(t(err.message));
    } finally {
      setBusy(false);
    }
  });
  const boxes = $('#codeBoxes');
  boxes.addEventListener('input', (e) => {
    const input = e.target;
    const index = codeInputs().indexOf(input);
    const digits = input.value.replace(/\D/g, '');
    input.value = '';
    if (digits) fillCode(digits, index);
  });
  boxes.addEventListener('keydown', (e) => {
    const list = codeInputs();
    const index = list.indexOf(e.target);
    if (e.key === 'Backspace' && !e.target.value && index > 0) { list[index - 1].value = ''; list[index - 1].focus(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && index > 0) list[index - 1].focus();
    else if (e.key === 'ArrowRight' && index < list.length - 1) list[index + 1].focus();
  });
  boxes.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/\d/.test(text)) return;
    e.preventDefault();
    clearCode();
    fillCode(text.replace(/\D/g, '').slice(0, 6), 0);
  });
  boxes.addEventListener('focusin', (e) => { if (e.target.select) e.target.select(); });
  $('#obExp').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    setExpChoice(b.dataset.v === 'experienced');
    flowMsg('');
    if (b.dataset.v === 'experienced') $('#obYears').focus();
  });
  for (const sel of ['#obRegion', '#obMode']) {
    $(sel).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) $$(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b));
    });
  }
}
