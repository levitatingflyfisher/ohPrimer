// OpenHearth Primer — Service Worker
//
// Strategy:
//  - App shell (same-origin navigations): NETWORK-FIRST with cache fallback. Online
//    users always get the freshest index.html (no release lag); offline users get the
//    last good copy. This is what fixes the previous stale-while-revalidate bug where
//    new code only landed on the *next* navigation (H20).
//  - Runtime assets (fonts + pinned CDN libraries): STALE-WHILE-REVALIDATE, so after
//    the first online load they keep working offline (H22). Large HF model weights are
//    NOT handled here — transformers.js/kokoro-js cache those in the browser cache.
//  - Everything else (RSS, articles, AI APIs, podcast audio): pass through, no caching.
//
// Bump CACHE_VERSION on every release so returning users purge old assets. With
// network-first shell delivery, a missed bump no longer strands users on old code (H21).
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `ohprimer-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `ohprimer-runtime-${CACHE_VERSION}`;
const SHELL = ['./'];

// Hosts whose GET responses are safe to cache for offline use (CSS/JS/fonts only).
const RUNTIME_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'esm.sh',
  'cdn.jsdelivr.net',
]);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App shell — network-first, cache fallback.
  if (url.origin === location.origin && req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            e.waitUntil(caches.open(SHELL_CACHE).then(c => c.put(req, clone)));
          }
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./')))
    );
    return;
  }

  // Runtime assets — stale-while-revalidate for known CDN/font hosts.
  if (RUNTIME_HOSTS.has(url.hostname)) {
    e.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          // Cache both CORS-ok (status 200) and opaque (cross-origin no-CORS) responses;
          // opaque is fine here — these are static, immutable, versioned assets.
          if (res && (res.ok || res.type === 'opaque')) {
            const clone = res.clone();
            e.waitUntil(caches.open(RUNTIME_CACHE).then(c => c.put(req, clone)));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
  // Everything else: pass through to the network, no caching.
});
