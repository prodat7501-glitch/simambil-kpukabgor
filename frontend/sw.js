/**
 * Service Worker untuk SIMAMBIL PWA (Vercel Edition)
 * Caching shell UI & offline resilience
 */
const CACHE_NAME = 'simambil-vercel-v38';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/config.js',
  '/app.js',
  '/manifest.json',
  '/SIMAMBIL-LOGO.png',
  '/logo-kpu.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Lewatkan request API dan query aksi dinamis dari cache agar data selalu real-time dari server
  if (
    event.request.url.includes('/api/') ||
    event.request.url.includes('action=') ||
    event.request.url.includes('script.google.com') ||
    event.request.url.includes('script.googleusercontent.com')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        return caches.match('/');
      });
    })
  );
});
