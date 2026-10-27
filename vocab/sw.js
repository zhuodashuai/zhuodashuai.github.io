// Daily Chinese lookup update 2026-10-27: refresh the shell and retain warm shards.
// Keep the existing cache namespace: this additive shell update must not erase
// public dictionary/example shards already warmed for offline reading. The
// install fetches each shell asset with cache:reload; the revised lookup graph
// uses the additive v108 graph while legacy aliases and warmed shards remain.
const CACHE_NAME = "zhuo-wordbook-v100";
// Fast member lookup uses only public, compact first-party data.
const CACHE_PREFIX = "zhuo-wordbook-";
const NETWORK_TIMEOUT_MS = 5_000;
const SHELL = [
  "./js/app-navigation-ready-v110.js",
  "./js/app-navigation-ready-v109.js",
  "./js/dictionary-app-v109.js", "./js/dictionary-entry-v109.js",
  "./js/dictionary-app-v108.js", "./js/dictionary-entry-v108.js", "./js/dictionary-offline-warm-v108.js",
  "./js/dictionary-examples-ui-v108.js", "./js/entry-detail-v108.js",
  "./js/public-app-v108.js", "./js/owner-app-v108.js", "./js/personal-app-v108.js",
  "./js/dictionary-examples-current-v4.js", "./js/dictionary-examples-release-v4.js",
  "./js/everyday-lookup.js", "./js/everyday-lookup-data.js",
  "./js/dictionary-example-corrections.js", "./js/dictionary-example-corrections-data.js",
  "./js/reviewed-senses-data.js",
  "./js/dictionary-examples-additive.js", "./js/dictionary-examples-additive-codec.js",
  // Directory metadata only: preserve previously visited delta URLs across an
  // app update. Unvisited example/source shards are never installed in bulk.
  "./data/dictionary-examples/catalogue-v4/d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f.bin",
  "./data/dictionary-examples/catalogue-v4/966df4e6c8f525fe29d7672a262a1f0b3e0e8d878019b53a59f9e1a3965768d8.bin",
  "./data/dictionary-examples/catalogue-v4/b23d099a9751fff0b497cd003af4009fad8dc3066569c901e3063e31865c3e6c.bin",
  "./data/dictionary-examples/catalogue-v4/4191b9ceb5740892393f3a4c4124d1d403df4780fc4c932bf973736f55745e0b.bin",
  "./data/dictionary-examples/catalogue-v4/0174f066dfd51f3827b8530ab61abb19038e03eff8e0a71a483e0973b886269c.bin",
  "./data/dictionary-examples/catalogue-v4/377d80ccbe67306dd2067c26d12a3172fd601ade7603bec722e19405bd232098.bin",
  "./data/dictionary-examples/catalogue-v4/1f73e2a2fb3a188b72ab47ffd2dee745f1b29f2d117810c197c1114baad12935.bin",
  "./data/dictionary-examples/catalogue-v4/ac68127f2946c4803173e177718fad8082cc6f2a005b44da5b2f8fcbe4a24927.bin",
  "./js/app-navigation.js?v=107", "./js/app-navigation-entry.js?v=107", "./js/personal-app.js?v=107",
  "./js/app-navigation.js?v=105", "./js/app-navigation.js",
  "./js/app-navigation-entry.js?v=106", "./js/app-navigation-entry.js?v=105", "./js/app-navigation-entry.js",
  "./js/personal-app.js?v=105", "./app-navigation.css?v=105",
  "./js/expanded-dictionary.js?v=104", "./js/dictionary-app.js?v=104",
  "./js/library-lookup-controller.js?v=104", "./js/library-lookup-ui.js?v=104",
  "./js/public-app.js?v=104", "./js/personal-app.js?v=104", "./js/owner-app.js?v=104",
  "./js/dictionary-entry.js?v=104", "./dictionary-source-revisions.html", "./dictionary-pos-notation-revisions.html", "./dictionary-semantic-revisions.html",
  "./js/expanded-dictionary.js?v=103", "./js/dictionary-app.js?v=103",
  "./js/library-lookup-controller.js?v=103", "./js/library-lookup-ui.js?v=103",
  "./js/public-app.js?v=103", "./js/personal-app.js?v=103", "./js/owner-app.js?v=103",
  "./js/dictionary-entry.js?v=103",
  "./app-navigation.css?v=101", "./app-navigation.css",
  "./library-lookup.css?v=99", "./library-lookup.css",
  "./js/library-lookup-ui.js?v=100", "./js/library-lookup-ui.js",
  "./js/library-lookup-controller.js?v=99", "./js/library-lookup-controller.js",
  "./guide-related.css?v=95", "./guide-related.css",
  "./js/chinese-search.js?v=95", "./js/chinese-search.js",
  "./js/chinese-related-common.js?v=95", "./js/chinese-related-common.js",
  "./data/WORDNET-3.0-LICENSE.txt", "./data/CHINESE-OPEN-WORDNET-LICENSE.txt",
  "./js/owner-public-library.js", "./js/owner-public-library.js?v=99",
  "./js/dictionary-collection.js", "./js/dictionary-collection.js?v=98",
  "./personal.html", "./personal.css?v=100",
  "./js/personal-app.js?v=100", "./js/personal-api.js?v=100", "./js/personal-storage.js?v=82",
  "./js/personal-folders.js?v=100", "./js/personal-folders.js", "./js/entry-sort.js?v=100", "./js/entry-sort.js",
  "./js/personal-app.js", "./js/personal-api.js", "./js/personal-storage.js", "./js/runtime-config.js?v=77",
  "./js/personal-selection.js?v=82", "./js/personal-study.js?v=77",
  "./js/personal-dictionary.js?v=97", "./js/personal-dictionary.js", "./js/core-dictionary.js?v=77",
  "./js/core-pos-corrections.js?v=88", "./js/core-pos-corrections.js",
  "./js/personal-lookup-flow.js?v=97", "./js/personal-lookup-flow.js",
  "./js/expanded-dictionary.js?v=97", "./js/expanded-dictionary.js",
  "./js/dictionary-suggestions.js?v=89", "./js/dictionary-suggestions.js",
  "./dictionary.html", "./dictionary-references.html", "./dictionary-pos.html", "./data/WORDNET-3.1-LICENSE.txt", "./dictionary.css?v=101", "./dictionary.css?v=97", "./dictionary.css",
  "./js/dictionary-entry.js?v=102", "./js/dictionary-entry.js",
  "./js/dictionary-offline-warm.js?v=102", "./js/dictionary-offline-warm.js",
  "./js/dictionary-app.js?v=99", "./js/dictionary-app.js", "./js/dictionary-navigation.js?v=80", "./js/dictionary-navigation.js",
  "./js/dictionary-examples.js?v=96", "./js/dictionary-examples.js",
  "./js/dictionary-examples-ui.js?v=96", "./js/dictionary-examples-ui.js",
  "./js/member-dictionary-manifest.js?v=97", "./js/member-dictionary-manifest.js",
  "./js/book-passages.js?v=82", "./js/book-passages-ui.js?v=82", "./js/book-passages.js", "./js/book-passages-ui.js",
  "./js/personal-selection.js", "./js/personal-study.js", "./js/study.js?v=77", "./js/review.js?v=77",
  "./quick-notes.html", "./quick-notes.css?v=77",
  "./js/quick-notes-app.js?v=77", "./js/quick-notes-storage.js?v=77",
  "./js/quick-notes-app.js", "./js/quick-notes-storage.js",
  "./", "./index.html", "./owner.html", "./guide.html", "./styles.css?v=96", "./styles.css?v=100", "./manifest.webmanifest",
  "./js/public-app.js?v=101", "./js/owner-app.js?v=97", "./js/public-app.js", "./js/owner-app.js", "./js/entry-detail.js", "./js/synonym-groups.js", "./js/synonym-view.js", "./js/collections.js", "./js/study.js", "./js/review.js", "./js/pwa.js", "./js/runtime-config.js",
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

function navigationCacheResponse(request, response) {
  if (request.mode !== "navigate" || !response.redirected || response.type !== "basic") return response;
  try {
    if (new URL(response.url).origin !== self.location.origin) return response;
  } catch { return response; }
  // Clean-URL hosts precache *.html after following a same-origin redirect.
  // Navigation uses redirect:manual, so returning that internal redirect list
  // causes a network error offline. Keep the streamed body/status/headers, but
  // give this cached navigation a fresh Response without redirect metadata.
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers: response.headers
  });
}

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
    if (cached?.ok) return navigationCacheResponse(request, cached);
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback?.ok) return navigationCacheResponse(request, fallback);
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
