const CACHE_NAME = "wordbook-shell-v3";
const CACHE_PREFIX = "wordbook-shell-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./?mode=public",
  "./?mode=personal",
  "./styles.css",
  "./manifest.webmanifest",
  "./data/owner-wordbook.json",
  "./js/app.js",
  "./js/data.js",
  "./js/github-sync.js",
  "./js/schema.js",
  "./js/services.js",
  "./js/storage.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/wordbook-og.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallback = "./index.html") {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(fallback));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.endsWith("/data/owner-wordbook.json")) {
    event.respondWith(networkFirst(request, "./data/owner-wordbook.json"));
    return;
  }
  event.respondWith(cacheFirst(request));
});
