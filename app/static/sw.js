// Wander service worker: makes the app and any map tiles she has seen work offline.
const V = 'wander-app-v5';
const TILES = 'wander-tiles';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V && k !== TILES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function tile(req) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    // CORS fetch so the cached copy is not "opaque" (opaque entries count as ~7 MB each against quota).
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) cache.put(req.url, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}

async function app(req) {
  const cache = await caches.open(V);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { net.catch(() => {}); return hit; }           // cache first, refresh in background
  const res = await net;
  if (res) return res;
  if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
  return Response.error();
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'tile.openstreetmap.org') { e.respondWith(tile(req)); return; }
  if (url.origin === self.location.origin) { e.respondWith(app(req)); }
});
