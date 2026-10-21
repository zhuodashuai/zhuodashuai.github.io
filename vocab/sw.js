const CACHE_NAME = "zhuo-wordbook-v99";
// Fast member lookup uses only public, compact first-party data.
const CACHE_PREFIX = "zhuo-wordbook-";
const NETWORK_TIMEOUT_MS = 5_000;
const SHELL = [
  "./library-lookup.css?v=99", "./library-lookup.css",
  "./js/library-lookup-ui.js?v=99", "./js/library-lookup-ui.js",
  "./js/library-lookup-controller.js?v=99", "./js/library-lookup-controller.js",
  "./guide-related.css?v=95", "./guide-related.css",
  "./js/chinese-search.js?v=95", "./js/chinese-search.js",
  "./js/chinese-related-common.js?v=95", "./js/chinese-related-common.js",
  "./data/WORDNET-3.0-LICENSE.txt", "./data/CHINESE-OPEN-WORDNET-LICENSE.txt",
  "./js/owner-public-library.js", "./js/owner-public-library.js?v=99",
  "./js/dictionary-collection.js", "./js/dictionary-collection.js?v=98",
  "./personal.html", "./personal.css?v=98",
  "./js/personal-app.js?v=99", "./js/personal-api.js?v=82", "./js/personal-storage.js?v=82",
  "./js/personal-app.js", "./js/personal-api.js", "./js/personal-storage.js", "./js/runtime-config.js?v=77",
  "./js/personal-selection.js?v=82", "./js/personal-study.js?v=77",
  "./js/personal-dictionary.js?v=97", "./js/personal-dictionary.js", "./js/core-dictionary.js?v=77",
  "./js/core-pos-corrections.js?v=88", "./js/core-pos-corrections.js",
  "./js/personal-lookup-flow.js?v=97", "./js/personal-lookup-flow.js",
  "./js/expanded-dictionary.js?v=97", "./js/expanded-dictionary.js",
  "./js/dictionary-suggestions.js?v=89", "./js/dictionary-suggestions.js",
  "./dictionary.html", "./dictionary-references.html", "./dictionary-pos.html", "./data/WORDNET-3.1-LICENSE.txt", "./dictionary.css?v=97", "./dictionary.css",
  "./js/dictionary-app.js?v=99", "./js/dictionary-app.js", "./js/dictionary-navigation.js?v=80", "./js/dictionary-navigation.js",
  "./js/dictionary-examples.js?v=96", "./js/dictionary-examples.js",
  "./js/dictionary-examples-ui.js?v=96", "./js/dictionary-examples-ui.js",
  "./js/member-dictionary-manifest.js?v=97", "./js/member-dictionary-manifest.js",
  "./js/book-passages.js?v=82", "./js/book-passages-ui.js?v=82", "./js/book-passages.js", "./js/book-passages-ui.js",
  "./js/personal-selection.js", "./js/personal-study.js", "./js/study.js?v=77", "./js/review.js?v=77",
  "./quick-notes.html", "./quick-notes.css?v=77",
  "./js/quick-notes-app.js?v=77", "./js/quick-notes-storage.js?v=77",
  "./js/quick-notes-app.js", "./js/quick-notes-storage.js",
  "./", "./index.html", "./owner.html", "./guide.html", "./styles.css?v=96", "./manifest.webmanifest",
  "./js/public-app.js?v=99", "./js/owner-app.js?v=97", "./js/public-app.js", "./js/owner-app.js", "./js/entry-detail.js", "./js/synonym-groups.js", "./js/synonym-view.js", "./js/collections.js", "./js/study.js", "./js/review.js", "./js/pwa.js", "./js/runtime-config.js",
  "./js/public-snapshot.js", "./js/learning-backup.js", "./js/learning-backup-ui.js",
  "./js/pronunciation.js", "./js/pronunciation-ui.js",
  "./js/chapter-quiz.js", "./js/quiz-storage.js", "./js/chapter-quiz-ui.js",
  "./js/owner-api.js", "./js/owner-storage.js", "./js/owner-backup.js", "./js/sync-logic.js", "./js/wordbook-schema.js", "./js/core-dictionary.js", "./js/synonym-evidence.js",
  "./js/owner-api.js?v=82", "./js/owner-storage.js?v=82", "./js/entry-detail.js?v=96", "./js/synonym-groups.js?v=82", "./js/synonym-evidence.js?v=77",
  "./js/chapter-quiz.js?v=82", "./js/quiz-storage.js?v=82", "./js/chapter-quiz-ui.js?v=82",
  "./js/public-snapshot.js?v=82", "./js/learning-backup.js?v=82", "./js/learning-backup-ui.js?v=82",
  "./js/pwa.js?v=77", "./js/synonym-view.js?v=82",
  "./js/wordbook-schema.js?v=82", "./js/collections.js?v=82", "./js/owner-backup.js?v=82", "./js/sync-logic.js?v=82",
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

async function cacheFirst(request, event) {
  let cache;
  try {
    cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached?.ok) return cached;
  } catch { /* Storage denied/full must not prevent a first online lookup. */ }
  const response = await fetch(request);
  if (response.ok && cache) {
    // Persist in the background: a slow/quota-failed cache write is not part
    // of the result's critical path and must not discard healthy dictionary data.
    const saving = cache.put(request, response.clone()).catch(() => {});
    event?.waitUntil(saving);
  }
  return response;
}

async function reloadPublicShard(request, event) {
  // A failed checksum must be recoverable: bypass both HTTP and SW cache on
  // explicit reload. Never answer this repair request with the same bad copy.
  const response = await fetch(request, { cache: "reload" });
  if (response.ok) {
    const copy = response.clone();
    const saving = caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    event.waitUntil(saving);
  }
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
      : /\/dictionary(?:\.html)?\/?$/.test(url.pathname) ? "./dictionary.html"
      : url.pathname.endsWith("/quick-notes.html") ? "./quick-notes.html" : "./index.html";
    event.respondWith(networkFirst(request, fallback));
    return;
  }
  if (url.pathname.endsWith("/data/owner-wordbook.json") || url.pathname.endsWith("/data/book-passages.json") || url.pathname.endsWith("/data/expanded-dictionary/manifest.json") || url.pathname.endsWith("/data/dictionary-suggestions/manifest.json") || url.pathname.endsWith("/data/dictionary-examples/manifest.json") || url.pathname.endsWith("/data/dictionary-examples/manifest-v2.json") || url.pathname.endsWith("/quality/generated-report.json")) {
    // Manifest revalidation is not a corrupt-shard repair. Readers use reload
    // for mutable directories too; a healthy cached directory must work offline.
    event.respondWith(networkFirst(request));
    return;
  }
  if ((url.pathname.includes("/data/expanded-dictionary/") || url.pathname.includes("/data/dictionary-suggestions/") || url.pathname.includes("/data/dictionary-examples/")) && request.cache === "reload") {
    event.respondWith(reloadPublicShard(request, event));
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
  event.respondWith(cacheFirst(request, event));
});
