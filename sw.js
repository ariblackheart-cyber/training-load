// Cache aplikasi supaya cepat dibuka dari home screen. Data dari Supabase selalu diambil langsung dari server.
const CACHE = "training-load-v8";
const CORE = ["./", "style.css?v=8", "config.js?v=8", "fit.js?v=8", "core.js?v=8", "app.js?v=8", "manifest.webmanifest", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.hostname.endsWith("supabase.co")) return; // data & login: selalu ke server
  if (req.mode === "navigate") {
    // halaman: coba server dulu (maks 3 detik) supaya pembaruan cepat masuk, kalau lambat pakai cache
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match("./").then(r => { if (!done && r) { done = true; resolve(r); } });
      const t = setTimeout(fallback, 3000);
      fetch(req).then(r => { clearTimeout(t); if (r.ok) caches.open(CACHE).then(c => c.put("./", r.clone())); if (!done) { done = true; resolve(r); } })
        .catch(() => { clearTimeout(t); caches.match("./").then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
    }));
    return;
  }
  const ok = url.origin === location.origin || url.hostname === "cdn.jsdelivr.net" || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com");
  if (!ok) return;
  // file aplikasi, library, font: langsung dari cache, diperbarui diam-diam di belakang
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});
