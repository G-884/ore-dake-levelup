/* =========================================================================
 * 俺だけレベルアップ / sw.js
 *
 * オフライン用のキャッシュのみを扱う。
 * 保存データ（localStorage）には一切触れないので、
 * アプリのバージョンアップでキャッシュを全消ししても記録は消えない。
 * ========================================================================= */
var CACHE_VERSION = 'odl-v0.1.1';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/schema.js',
  './js/storage.js',
  './js/calculator.js',
  './js/gamestate.js',
  './js/repository.js',
  './js/ui/common.js',
  './js/ui/record.js',
  './js/ui/home.js',
  './js/ui/history.js',
  './js/ui/status.js',
  './js/ui/body.js',
  './js/ui/settings.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      /* 1つでも失敗すると install ごと失敗するので、個別に握りつぶす */
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* stale-while-revalidate:
     まずキャッシュを返してすぐ表示し、裏で新しいものを取ってきて次回に備える */
  event.respondWith(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone()).catch(function () {});
          }
          return res;
        }).catch(function () {
          return cached || cache.match('./index.html');
        });
        return cached || network;
      });
    })
  );
});
