const C="safestop-v1";
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(["./","index.html","manifest.json","icon.svg"])));self.skipWaiting()});
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);
  if(u.origin===location.origin){e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)))}
  else if(u.hostname.endsWith("tile.openstreetmap.org")){e.respondWith(caches.open(C+"-tiles").then(c=>c.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{c.put(e.request,r.clone());return r}))))}
});
