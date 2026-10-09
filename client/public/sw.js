const CACHE_NAME = "souqi-shell-v2";
const SHELL_URLS = [
  "/",
  "/pos",
  "/manifest.webmanifest",
  "/offline.html",
  "/icons/souqi.svg",
  "/icons/souqi-192.png",
  "/icons/souqi-512.png",
  "/icons/souqi-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("souqi-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isPrivateOrUncacheable(response) {
  if (!response || !response.ok || response.type === "opaque") return true;
  if (response.headers.has("set-cookie")) return true;
  const policy = (response.headers.get("cache-control") || "").toLowerCase();
  return /private|no-store|no-cache/.test(policy);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/firebase/")) return;
  if (request.headers.has("authorization")) return;
  if (url.searchParams.has("auth") || url.searchParams.has("token") || url.searchParams.has("key")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("text/html") && !isPrivateOrUncacheable(response)) {
          await cache.put(request, response.clone());
          if (url.pathname === "/" || url.pathname === "/pos") await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        return await cache.match(request)
          || await cache.match(url.pathname)
          || await cache.match("/pos")
          || await cache.match("/")
          || await cache.match("/offline.html");
      }
    })());
    return;
  }

  const cacheableDestination = ["script", "style", "image", "font", "manifest", "worker"].includes(request.destination);
  if (!cacheableDestination) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached && request.destination !== "manifest") return cached;
    try {
      const response = await fetch(request);
      if (!isPrivateOrUncacheable(response)) await cache.put(request, response.clone());
      return response;
    } catch {
      if (cached) return cached;
      return new Response("غير متاح دون اتصال", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
  })());
});
