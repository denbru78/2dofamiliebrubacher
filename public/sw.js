/* Service Worker – Unser Plan
   - App-Shell wird versioniert gecacht (neue Version = neuer Cache)
   - Seitenaufrufe: Netz zuerst, bei Ausfall gecachte Shell, sonst Offline-Seite
   - Gehashte Build-Dateien: Cache zuerst (ändern sich nie)
   - Supabase/API: NIE gecacht – Aufgaben und Nutzerdaten kommen immer live
*/
const VERSION = '__BUILD_VERSION__';
const CACHE = 'unser-plan-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE.concat(['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'])).catch(() => null))
  );
  // Nicht automatisch aktivieren – die App zeigt "Neue Version verfügbar"
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Fonts etc. nie cachen

  // Seitenaufrufe (SPA): Netz zuerst
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // Service Worker und Manifest immer frisch
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return;

  // Gehashte Assets + Icons: Cache zuerst, sonst Netz und nachcachen
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/avatars/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        })
    )
  );
});
