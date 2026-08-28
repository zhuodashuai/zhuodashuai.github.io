const CACHE_NAME = "wordbook-shell-v12";
const CACHE_PREFIX = "wordbook-shell-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./?mode=public",
  "./?mode=personal",
  "./styles.css",
  "./manifest.webmanifest",
  "./data/owner-wordbook.json",
  "./data/ecdict-core.json",
  "./js/app.js",
  "./js/core-dictionary.js",
  "./js/data.js",
  "./js/github-sync.js",
  "./js/schema.js",
  "./js/services.js",
  "./js/settings.js",
  "./js/storage.js",
  "./js/workflow.js",
  "./quality/",
  "./quality/index.html",
  "./quality/styles.css",
  "./quality/report.js",
  "./quality/generated-report.json",
  "./quality/datasets/vocab-100.json",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-192.png",
  "./assets/icon-maskable-512.png",
  "./assets/word-cabinet-og.png"
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
    if (response.ok) {
      await cache.put(request, response.clone());
      return response;
    }
    return (await cache.match(request)) || (await cache.match(fallback)) || response;
  } catch {
    return (await cache.match(request)) || (await cache.match(fallback)) || Response.error();
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
  if (url.pathname.endsWith("/quality/generated-report.json")) {
    event.respondWith(networkFirst(request, "./quality/generated-report.json"));
    return;
  }
  event.respondWith(cacheFirst(request));
});
