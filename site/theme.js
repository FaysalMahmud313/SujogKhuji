(function () {
  var root = document.documentElement;
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
  var ACCENTS = { indigo: '#5E5CE6', emerald: '#047857', rose: '#E11D48', amber: '#B45309', cyan: '#0E7490' };
  var s = {};
  try { s = JSON.parse(localStorage.getItem('obd:web:v1')) || {}; } catch (e) {}
  var mode = s.theme || 'system';
  if (mode === 'system') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', mode);
  root.style.setProperty('--accent', ACCENTS[s.accent] || ACCENTS.indigo);
  if (s.lang === 'bn') root.lang = 'bn';
})();
