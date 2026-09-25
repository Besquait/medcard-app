// Offline app shell. Same-origin files: network first, cached copy when offline.
// Supabase and other origins go straight to the network.
const CACHE = "medcard-v41";
const SHELL = ["./", "index.html", "styles.css", "config.js", "catalog.js", "info.js", "info-hl.js", "panels.js", "guides.js", "treat.js", "ui.js", "signif.js", "extras.js", "studies.js", "seed.js", "cloud.js", "app.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // network first so a fresh deploy shows at once; the cache is the offline fallback
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
