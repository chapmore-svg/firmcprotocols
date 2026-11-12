/* OT List Pro service worker: keeps the app working offline.
   Bump CACHE whenever any app file changes, so installed copies pick up the new version. */
const CACHE = "otlp-1.2.0";
const FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
  "./vendor/pdf.min.js", "./vendor/pdf.worker.min.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("message", e=>{ if(e.data==="skipWaiting") self.skipWaiting(); });

// App files: cache first (fast, offline). Anything else: network as normal.
self.addEventListener("fetch", e=>{
  const url = new URL(e.request.url);
  if(e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch:true}).then(hit=>hit || fetch(e.request).catch(()=>caches.match("./index.html")))
  );
});
