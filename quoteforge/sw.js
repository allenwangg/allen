/**
 * sw.js — makes the app genuinely usable with no signal.
 *
 * The landing page promises the app "works with no internet on a job site".
 * Without this, that was only half true: state persisted locally, but a cold
 * load still needed the network, so the contractor standing in a basement with
 * no bars got nothing. A basement is exactly where the promise matters.
 *
 * Strategy is cache-first for the app shell with a background refresh: the app
 * opens instantly and offline, and a newer version is picked up on the next
 * load after one online visit. Bumping CACHE evicts everything older.
 */
const CACHE_PREFIX = 'quoteforge-';
const CACHE = `${CACHE_PREFIX}v2`;

const SHELL = [
  './',
  './index.html',
  './intake.html',
  './css/app.css',
  './js/app.js',
  './js/pricing.js',
  './js/pricebook.js',
  './js/store.js',
  './js/proposal.js',
  './js/intake-link.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // One missing file must not fail the whole install, or a rename silently
      // leaves the contractor with no offline app at all.
      .then((c) => Promise.allSettled(SHELL.map((url) => c.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Only ever delete OUR OWN older caches. A GitHub Pages user site shares
      // one origin with every other project on it, so deleting every cache
      // here would wipe the offline data of unrelated apps.
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // never cache third parties

  event.respondWith(
    caches.match(request).then((hit) => {
      // Refresh in the background so the next load gets any newer version.
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);   // offline: fall back to whatever we have

      return hit || network;
    }),
  );
});
