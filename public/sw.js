/* Ritmo Music — Service Worker
 *
 * Estrategia:
 *  - Navegación (index.html): network-first. Así una versión nueva de la app
 *    aparece al recargar, sin quedarse atrapada en el shell cacheado.
 *  - /assets/*: cache-first (los nombres llevan hash, son inmutables).
 *  - Resto del mismo origen: cache-first con relleno en segundo plano.
 */
const CACHE = 'ritmo-v3';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

const isHtml = (url, request) =>
  request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Nunca interceptar YouTube ni APIs externas
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;
  // El API siempre va a la red
  if (url.pathname.startsWith('/api/')) return;

  // Navegación: red primero, caché como respaldo offline.
  if (isHtml(url, e.request)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', clone));
          }
          return res;
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/')))
    );
    return;
  }

  // Recursos con hash: caché primero y se rellena al vuelo.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
