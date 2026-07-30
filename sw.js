const CACHE_NAME = 'imagexpert-v1.2.0';
const OFFLINE_ASSETS = Object.freeze([
  './',
  './index.html',
  './app.css',
  './app.js',
  './app-core.js',
  './i18n.js',
  './modules/media-controller.js',
  './modules/provenance-controller.mjs',
  './modules/dispatch-controller.js',
  './modules/storage-case-controller.js',
  './modules/upload-policy-controller.js',
  './modules/engine-controller.js',
  './modules/service-worker-controller.js',
  './modules/ui-controller.js',
  './manifest.webmanifest',
  './icon.png'
]);
const CACHE_PATHS = new Set(OFFLINE_ASSETS.map((asset) => new URL(asset, self.location.href).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch((error) => {
        console.error('ImageXpert offline shell install failed', error);
        return caches.delete(CACHE_NAME).then(() => { throw error; });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('imagexpert-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode !== 'navigate' && !CACHE_PATHS.has(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok && CACHE_PATHS.has(url.pathname)) {
          event.waitUntil(cache.put(event.request, response.clone()));
        }
        return response;
      } catch {
        if (event.request.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        return new Response('ImageXpert is offline and this shell asset is unavailable.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })
  );
});
