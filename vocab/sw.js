const CACHE_NAME = "zhuo-wordbook-v77";
// Source labels show book/author/chapter; edition-specific pages stay internal.
const CACHE_PREFIX = "zhuo-wordbook-";
const NETWORK_TIMEOUT_MS = 5_000;
const SHELL = [
  "./personal.html", "./personal.css?v=77",
  "./js/personal-app.js?v=77", "./js/personal-api.js?v=77", "./js/personal-storage.js?v=77",
  "./js/personal-app.js", "./js/personal-api.js", "./js/personal-storage.js", "./js/runtime-config.js?v=77",
  "./js/personal-selection.js?v=77", "./js/personal-study.js?v=77",
  "./js/personal-dictionary.js?v=77", "./js/personal-dictionary.js", "./js/core-dictionary.js?v=77",
  "./js/book-passages.js?v=77", "./js/book-passages-ui.js?v=77", "./js/book-passages.js", "./js/book-passages-ui.js",
  "./js/personal-selection.js", "./js/personal-study.js", "./js/study.js?v=77", "./js/review.js?v=77",
  "./quick-notes.html", "./quick-notes.css?v=77",
  "./js/quick-notes-app.js?v=77", "./js/quick-notes-storage.js?v=77",
  "./js/quick-notes-app.js", "./js/quick-notes-storage.js",
  "./", "./index.html", "./owner.html", "./guide.html", "./styles.css?v=77", "./manifest.webmanifest",
  "./js/public-app.js?v=77", "./js/owner-app.js?v=77", "./js/entry-detail.js", "./js/synonym-groups.js", "./js/synonym-view.js", "./js/collections.js", "./js/study.js", "./js/review.js", "./js/pwa.js", "./js/runtime-config.js",
  "./js/public-snapshot.js", "./js/learning-backup.js", "./js/learning-backup-ui.js",
  "./js/pronunciation.js", "./js/pronunciation-ui.js",
  "./js/chapter-quiz.js", "./js/quiz-storage.js", "./js/chapter-quiz-ui.js",
  "./js/owner-api.js", "./js/owner-storage.js", "./js/owner-backup.js", "./js/sync-logic.js", "./js/wordbook-schema.js", "./js/core-dictionary.js", "./js/synonym-evidence.js",
  "./js/owner-api.js?v=77", "./js/owner-storage.js?v=77", "./js/entry-detail.js?v=77", "./js/synonym-groups.js?v=77", "./js/synonym-evidence.js?v=77",
  "./js/chapter-quiz.js?v=77", "./js/quiz-storage.js?v=77", "./js/chapter-quiz-ui.js?v=77",
  "./js/public-snapshot.js?v=77", "./js/learning-backup.js?v=77", "./js/learning-backup-ui.js?v=77",
  "./js/pwa.js?v=77", "./js/synonym-view.js?v=77",
  "./js/wordbook-schema.js?v=77", "./js/collections.js?v=77", "./js/owner-backup.js?v=77", "./js/sync-logic.js?v=77",
  "./data/owner-wordbook.json", "./data/book-passages.json", "./assets/icon-192.png", "./assets/icon-512.png",
  "./assets/icon-maskable-192.png", "./assets/icon-maskable-512.png", "./assets/word-cabinet-og.png",
  "./quality/", "./quality/index.html", "./quality/styles.css", "./quality/report.js",
  "./quality/generated-report.json", "./quality/datasets/vocab-100.json"
];

self.addEventListener("install", (event) => {
  // Installing a new shell must bypass still-fresh HTTP copies of old bare
  // dependencies. Keep the versioned graph and legacy offline URLs together.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    SHELL.map((url) => new Request(new URL(url, self.location.href), { cache: "reload" }))
  )));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request, fallbackUrl = "") {
  const cache = await caches.open(CACHE_NAME);
  const controller = new AbortController();
  let timer;
  let failedResponse;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Network timeout"));
      }, NETWORK_TIMEOUT_MS);
    });
    const network = (async () => {
      const response = await fetch(request, { cache: "no-cache", signal: controller.signal });
      if (controller.signal.aborted) throw new Error("Network timeout");
      if (response.status >= 500) {
        failedResponse = response;
        throw new Error("Server temporarily unavailable");
      }
      if (response.ok) {
        try {
          // Cache.put consumes the response body. Keep that work inside the
          // deadline too: successful headers do not prove a usable document.
          await cache.put(request, response.clone());
        } catch {
          // Quota/storage errors must not discard a healthy response. Verify
          // its body before returning it; a broken stream uses the fallback.
          await response.clone().arrayBuffer();
        }
      }
      return response;
    })();
    return await Promise.race([network, timeout]);
  } catch {
    const cached = await cache.match(request, { ignoreSearch: false });
    if (cached?.ok) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback?.ok) return fallback;
    }
    if (failedResponse) return failedResponse;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } finally {
    clearTimeout(timer);
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
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === "navigate") {
    const fallback = url.pathname.endsWith("/owner.html") ? "./owner.html"
      : /\/personal(?:\.html)?\/?$/.test(url.pathname) ? "./personal.html"
      : url.pathname.endsWith("/quick-notes.html") ? "./quick-notes.html" : "./index.html";
    event.respondWith(networkFirst(request, fallback));
    return;
  }
  if (url.pathname.endsWith("/data/owner-wordbook.json") || url.pathname.endsWith("/data/book-passages.json") || url.pathname.endsWith("/quality/generated-report.json")) {
    event.respondWith(networkFirst(request));
    return;
  }
  // JavaScript, CSS and the manifest can change independently of the cache
  // namespace. Revalidate them online so a missed manual version bump cannot
  // strand a client on a stale module graph; the precache remains the offline
  // fallback.
  if (/\.(?:js|css|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
