const CACHE_NAME = 'pixel-run-v9';

// Install: precache the root page, font, and assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const urlsToCache = [
        './',
        'index.html',
        'preview.png',
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png',
        'manifest.webmanifest',
        'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
      ];
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
        } catch {}
      }
    }),
  );
});

// Activate: claim clients immediately and remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }).then(() => self.clients.claim()),
  );
});

// Listen for SKIP_WAITING from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch strategy:
// Navigation requests (bookmarks/page loads): Network-First, with instant Offline Cache Fallback
// Font/Media requests: Cache-First
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Google Fonts & static media (Cache-First)
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com' ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
      }),
    );
    return;
  }

  // 2. Navigation / HTML requests: Network with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(async () => {
        // When offline, match exact request or fallback to cached root / index.html
        const cached = await caches.match(request);
        if (cached) return cached;
        const rootCached = (await caches.match('./')) || (await caches.match('index.html'));
        if (rootCached) return rootCached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }),
  );
});
