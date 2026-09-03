/* Prism service worker — makes the app installable and fully usable offline.

   Strategy:
   - install  precaches the whole app shell as one atomic set, so a cached copy
              is never a mix of old and new files.
   - navigate network-first, falling back to the cached shell. A deploy is
              therefore picked up as soon as the device is online again.
   - assets   stale-while-revalidate: instant from cache, refreshed behind you.
   - fonts    cache-first in a separate store; the URLs are content-versioned.

   VERSION is stamped from a hash of the shell by ship.mjs, so shipping new
   content automatically invalidates every old cache. */

var VERSION = '4d74a3f13702';
var SHELL_CACHE = 'prism-shell-' + VERSION;
var FONT_CACHE = 'prism-fonts-v1';

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/art.js',
  './js/sfx.js',
  './js/achieve.js',
  './js/paths.js',
  './js/tts.js',
  './js/srs.js',
  './js/store.js',
  './js/data/index.js',
  './js/data/courses.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // drop superseded shells; the font store is versioned separately
        if (k !== SHELL_CACHE && k !== FONT_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isFont(url) {
  return url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isFont(url)) {
    e.respondWith(
      caches.open(FONT_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            // opaque responses are fine to store; they still render
            if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.open(SHELL_CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      });
    })
  );
});
