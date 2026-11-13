/* Rota Pro offline worker. Bump CACHE whenever any app file changes. */
const CACHE = "rotapro-1.0.0";
const FILES = [
  "./", "./index.html", "./styles.css", "./app.js", "./pro.js", "./manifest.webmanifest",
  "./vendor/xlsx.bundle.js", "./vendor/jspdf.umd.min.js", "./vendor/jspdf.plugin.autotable.min.js",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
];
// Fetch every file FRESH when installing a version (skip the browser's and the host's saved copies),
// so a new version is never filled with the previous version's files.
self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(async u=>{
    const plain = new URL(u, self.location).href;
    const fresh = new URL(u, self.location); fresh.searchParams.set("v", CACHE);
    const r = await fetch(fresh.href, {cache:"reload"});
    if(!r.ok) throw new Error("Could not fetch " + u);
    await c.put(plain, r);
  }))));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("message", e=>{ if(e.data==="skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", e=>{
  const url = new URL(e.request.url);
  if(e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(hit=>hit || fetch(e.request).catch(()=>caches.match("./index.html"))));
});
