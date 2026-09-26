const SHELL_CACHE = "souqi-shell-v1";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(["/", "/pos", "/manifest.webmanifest"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(request).then(response => {
    const copy = response.clone();
    void caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match("/"))));
});
