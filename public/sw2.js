// v2 - force kill all caches
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  // No caching at all - always go to network
  e.respondWith(fetch(e.request));
});
