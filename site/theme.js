(function () {
  var root = document.documentElement;
  var ACCENTS = { indigo: '#5E5CE6', blue: '#2563EB', teal: '#0F766E', green: '#15803D', orange: '#C2410C', red: '#DC2626', purple: '#9333EA', slate: '#475569', sky: '#38BDF8', lime: '#4ADE80' };
  var RENAMED = { emerald: 'green', rose: 'red', amber: 'orange', cyan: 'teal' };
  window.SUJOG_ACCENTS = { colours: ACCENTS, renamed: RENAMED };
  var framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (framed) {
    root.style.display = 'none';
    window.addEventListener('DOMContentLoaded', function () {
      var link = document.createElement('a');
      link.href = location.origin + location.pathname;
      link.target = '_top';
      link.rel = 'noopener';
      link.textContent = 'Open SujogKhuji directly';
      link.style.cssText = 'display:block;padding:24px;font:16px system-ui,sans-serif;color:#1d4ed8';
      document.body.textContent = '';
      document.body.appendChild(link);
      root.style.display = '';
    });
    return;
  }
  var s = {};
  try { s = JSON.parse(localStorage.getItem('obd:web:v1')) || {}; } catch (e) {}
  var mode = s.theme || 'system';
  if (mode === 'system') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', mode);
  var accent = RENAMED[s.accent] || s.accent;
  if (!ACCENTS[accent]) accent = 'indigo';
  root.setAttribute('data-accent', accent);
  root.style.setProperty('--accent', ACCENTS[accent]);
  if (s.lang === 'bn') root.lang = 'bn';
})();
