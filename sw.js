/* Upar Guessing Game — service worker (root scope).
 * Caches the app shell (index.html, manifest, icons) so the game
 * installs and reloads in airplane mode. Firebase / CDN requests
 * are never cached: online mode always goes to the network.
 */
const CACHE = 'upar-v35';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cross-origin (Firebase SDK / database / any CDN): never cache, network only.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }

  // Page navigations (including ?room=CODE links): cache first so
  // reloads and re-opens are instant — serve the cached app shell
  // (ignoreSearch, so ?room=CODE links open from the same cached
  // shell) and refresh it in the background from plain './index.html',
  // always cached under that one plain key, so ?room= links never
  // create duplicate entries. With no cached shell yet (first load),
  // fall through to the network.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((cached) => {
        const refresh = fetch('./index.html')
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              return caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).then(() => res);
            }
            return res;
          });
        if (cached) {
          event.waitUntil(refresh.catch(() => { /* offline: cached shell already served */ }));
          return cached;
        }
        return refresh.catch(() => caches.match('./index.html', { ignoreSearch: true }));
      })
    );
    return;
  }

  // Same-origin static assets: cache first, refresh in the background.
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
