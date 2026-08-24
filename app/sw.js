/**
 * sw.js — Offline support.
 *
 * Cache-first for the app shell (it changes only on deploy), network-first for
 * everything else. The version string is the cache key: bump it on deploy and
 * old caches are cleaned on activate.
 *
 * Note there is nothing to sync. All user data lives in IndexedDB on the
 * device, so "offline mode" is simply the app working normally.
 */
const VERSION = 'vitalarc-v1';
const SHELL = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/ui.js', './js/engine.js', './js/insights.js',
  './js/model.js', './js/store.js', './js/charts.js', './js/entitlements.js', './js/billing.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSION)
      // addAll rejects the whole batch if any single file 404s; add individually
      // so one missing optional asset can't break offline support entirely.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // never cache third parties
  if (url.pathname.endsWith('billing-config.json')) return;  // must stay fresh

  ev.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // Refresh in the background so the next load is current.
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
