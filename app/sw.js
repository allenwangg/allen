/**
 * sw.js — Offline support.
 *
 * TWO PROPERTIES THIS FILE EXISTS TO GUARANTEE, both learned the hard way:
 *
 * 1. A CACHED APP IS ALWAYS ONE CONSISTENT SET OF MODULES.
 *    An earlier version cached each shell file independently and refreshed
 *    each one in the background after serving it. For ES modules that import
 *    each other, that is corruption waiting to happen: a deploy could leave
 *    the cache holding a new app.js beside an old engine.js, and the app would
 *    fail to boot with a bare import error. Proven in Chromium by deploying a
 *    change where app.js imported a new export from engine.js and dropping the
 *    engine.js response mid-refresh.
 *
 *    Now: install fetches the entire shell with cache.addAll(), which is
 *    atomic — if any file fails, the install fails and the previous version
 *    keeps serving. Nothing is refreshed piecemeal afterwards. A new set of
 *    files arrives only via a new VERSION, in a new cache, all at once.
 *
 * 2. A CACHE MISS DEGRADES; IT DOES NOT DESTROY.
 *    The offline fallback used to answer EVERY failed request with
 *    index.html — including requests for module scripts, which then failed
 *    with "Expected a JavaScript-or-Wasm module script but the server
 *    responded with text/html". One missing file turned into a blank page.
 *    The fallback is now navigation-only.
 *
 * VERSION must change on every deploy or clients keep the old cache forever.
 * `npm run stamp-sw` writes a content hash of the shell into the line below,
 * and CI fails if it is stale — so this cannot be forgotten.
 */
const VERSION = 'vitalarc-2fd55cc465ed1e5e';   // stamped by scripts/stamp-sw.mjs
const SHELL = [
  './', './index.html', './css/app.css',
  './js/app.js', './js/ui.js', './js/engine.js', './js/insights.js',
  './js/model.js', './js/store.js', './js/charts.js', './js/sample.js', './js/experiments.js', './js/safety.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL))
    // Deliberately NO skipWaiting(). Activating immediately would swap the
    // module set under a page that has already imported the old one. The new
    // worker waits, the page is told an update is ready, and the user reloads
    // when they choose (see app.js).
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page asks for the update when the user accepts it.
self.addEventListener('message', (ev) => {
  if (ev.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // never cache third parties
  if (url.pathname.endsWith('billing-config.json')) return;    // must always be fresh
  if (url.pathname.endsWith('/entitlement')) return;           // live subscription state

  ev.respondWith(
    caches.open(VERSION).then(async (cache) => {
      // Cache-first for the pinned shell, with no background refresh: the
      // cached set is internally consistent and only a new VERSION replaces it.
      const hit = await cache.match(req, { ignoreSearch: false });
      if (hit) return hit;

      try {
        const res = await fetch(req);
        // Runtime assets (icons, fonts) may join this version's cache; shell
        // files never change within a version.
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      } catch (err) {
        // Offline. Only a NAVIGATION may fall back to the app shell —
        // answering a script request with HTML is strictly worse than
        // failing, because it breaks module loading with a confusing error.
        if (req.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw err;
      }
    })
  );
});
