const VERSION = 'obd-dev';
const SHELL = [
  './',
  './index.html',
  './privacy.html',
  './terms.html',
  './app.css',
  './theme.js',
  './config.js',
  './i18n.js',
  './backend.js',
  './app.js',
  './discover.js',
  './tracker.js',
  './detail.js',
  './auth.js',
  './main.js',
  './manifest.webmanifest',
  './fonts/geist-latin.woff2',
  './fonts/geist-mono-latin.woff2',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/(rest|auth|storage|functions|realtime)\/v1\//.test(url.pathname) || url.pathname.includes('/api/') || url.pathname.includes('/__')) return;

  if (url.pathname.includes('/data/') || url.pathname.endsWith('/config.js') || request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
