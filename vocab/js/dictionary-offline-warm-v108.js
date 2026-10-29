// A first dictionary lookup can finish before the newly installed worker claims
// its page. Replay only those actual, public reads through that worker; never
// block lookup, inspect a query/input, or prime a catalogue of unvisited shards.
const MAX_URLS = 32;
const CONCURRENCY = 2;
const ITEM_TIMEOUT_MS = 8_000;
const WAIT_FOR_CLAIM_MS = 60_000;
// Expanded lookups allow 15 seconds; retain a small delivery margin for a
// request already in flight at claim, then disconnect rather than stay resident.
const LATE_RESOURCE_MS = 20_000;
const WARM_BUDGET_MS = 30_000;
const NOOP = () => {};

/** Return only a canonical, same-origin public dictionary resource URL. */
export function dictionaryOfflineWarmUrl(value, baseUrl) {
  if (typeof value !== "string" || !value || value.length > 1200 || /[?#\s\\]/u.test(value)) return null;
  try {
    const base = new URL(baseUrl), url = new URL(value);
    if (!/^https?:$/u.test(base.protocol) || base.username || base.password || base.search || base.hash
      || !base.pathname.endsWith("/") || !/^https?:$/u.test(url.protocol)
      || url.origin !== base.origin || url.username || url.password || url.search || url.hash
      || url.href !== value || !url.pathname.startsWith(base.pathname)) return null;
    const path = url.pathname.slice(base.pathname.length);
    if (/^data\/chinese-search-ranking\/[a-f0-9]{64}\/[a-f0-9]{64}\.bin$/u.test(path)) return url.href;
    if (path === "data/expanded-dictionary/manifest.json" || path === "data/dictionary-examples/manifest-v2.json") return url.href;
    if (/^data\/dictionary-examples\/(?:catalogue-v4|delta-v4)\/[a-f0-9]{64}\.bin$/u.test(path)) return url.href;
    const expanded = /^data\/expanded-dictionary\/[a-f0-9]{64}\/(?:en|zh)-(\d{3})\.json$/u.exec(path);
    if (expanded && Number(expanded[1]) < 128) return url.href;
    const example = /^data\/dictionary-examples\/[a-f0-9]{64}\/examples-(0|[1-9]\d{0,2})\.json$/u.exec(path);
    return example && Number(example[1]) < 256 ? url.href : null;
  } catch { return null; }
}

/**
 * Install only on an initially uncontrolled dictionary page. The returned
 * cleanup is idempotent. All optional browser/storage/network failures are
 * best-effort; this module neither registers a worker nor changes page state.
 */
export function installDictionaryOfflineWarm({
  baseUrl = new URL("../", import.meta.url).href,
  serviceWorker = globalThis.navigator?.serviceWorker,
  lifecycle = globalThis.window,
  performance = globalThis.performance,
  Observer = globalThis.PerformanceObserver,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  AbortControllerImpl = globalThis.AbortController,
  setTimeoutImpl = globalThis.setTimeout?.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout?.bind(globalThis)
} = {}) {
  // Already controlled pages have the normal SW data-cache path. Do not replay
  // their historical reads on every visit, focus, or worker update.
  try {
    if (!serviceWorker || serviceWorker.controller || typeof serviceWorker.addEventListener !== "function"
      || typeof serviceWorker.removeEventListener !== "function" || typeof lifecycle?.addEventListener !== "function"
      || typeof lifecycle?.removeEventListener !== "function" || typeof performance?.now !== "function"
      || typeof fetchImpl !== "function" || typeof AbortControllerImpl !== "function"
      || typeof setTimeoutImpl !== "function" || typeof clearTimeoutImpl !== "function"
      || !dictionaryOfflineWarmUrl(new URL("data/expanded-dictionary/manifest.json", baseUrl).href, baseUrl)) return NOOP;
  } catch { return NOOP; }

  let stopped = false, claimTime = null, observer = null, observationEnded = false;
  let claimTimer = null, observationTimer = null, budgetTimer = null;
  const seen = new Set(), queue = [], active = new Set();
  const clearTimer = timer => { if (timer !== null) { try { clearTimeoutImpl(timer); } catch { /* Optional cleanup. */ } } };
  const removeListeners = () => {
    try { serviceWorker.removeEventListener("controllerchange", onClaim); } catch { /* Optional cleanup. */ }
    try { lifecycle.removeEventListener("pagehide", stop); } catch { /* Optional cleanup. */ }
  };
  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimer(claimTimer); clearTimer(observationTimer); clearTimer(budgetTimer);
    claimTimer = observationTimer = budgetTimer = null;
    try { observer?.disconnect(); } catch { /* Optional cleanup. */ }
    observer = null; queue.length = 0;
    removeListeners();
    for (const task of active) task.cancel();
  }
  function endObservation() {
    if (stopped) return;
    observationEnded = true;
    clearTimer(observationTimer); observationTimer = null;
    try { observer?.disconnect(); } catch { /* Optional cleanup. */ }
    observer = null;
    pump();
  }
  function run(url) {
    let controller;
    try { controller = new AbortControllerImpl(); } catch { return; }
    let timer = null, release;
    const cancelled = new Promise(resolve => { release = resolve; });
    const task = { cancel() {
      try { controller.abort(); } catch { /* Abort is best-effort too. */ }
      release();
    } };
    active.add(task);
    try { timer = setTimeoutImpl(task.cancel, ITEM_TIMEOUT_MS); } catch { task.cancel(); }
    const reading = Promise.resolve().then(async () => {
      if (stopped || controller.signal.aborted) return;
      const response = await fetchImpl(url, {
        method: "GET", credentials: "omit", cache: "reload", redirect: "error", mode: "same-origin", signal: controller.signal
      });
      if (!response?.ok || stopped || controller.signal.aborted) {
        try { await response?.body?.cancel(); } catch { /* Do not retain an unused body. */ }
        return;
      }
      // Include the complete body in the per-item deadline, not just headers.
      await response.arrayBuffer();
    }).catch(NOOP);
    void Promise.race([reading, cancelled]).finally(() => {
      clearTimer(timer); active.delete(task);
      pump();
    });
  }
  function pump() {
    if (stopped || claimTime === null) return;
    while (active.size < CONCURRENCY && queue.length) run(queue.shift());
    if (observationEnded && !queue.length && !active.size) stop();
  }
  function record(entries) {
    if (stopped || observationEnded) return;
    for (const entry of entries) {
      // Observer entries are completed reads. startTime, not responseEnd, keeps
      // a pre-claim in-flight request eligible when it finishes after claim.
      if (entry?.entryType !== "resource" || entry.initiatorType !== "fetch"
        || !Number.isFinite(entry.startTime) || entry.startTime < 0
        || !Number.isFinite(entry.responseEnd) || entry.responseEnd <= 0 || entry.responseEnd < entry.startTime
        || claimTime !== null && entry.startTime >= claimTime) continue;
      const url = dictionaryOfflineWarmUrl(entry.name, baseUrl);
      if (!url || seen.has(url) || seen.size >= MAX_URLS) continue;
      seen.add(url); queue.push(url);
      if (seen.size === MAX_URLS) { endObservation(); break; }
    }
    pump();
  }
  function snapshot() {
    try { record(performance.getEntriesByType?.("resource") || []); } catch { /* Observer can still supply entries. */ }
  }
  function onClaim() {
    if (stopped || claimTime !== null || !serviceWorker.controller) return;
    try { claimTime = performance.now(); } catch { stop(); return; }
    if (!Number.isFinite(claimTime) || claimTime < 0) { stop(); return; }
    clearTimer(claimTimer); claimTimer = null;
    try { serviceWorker.removeEventListener("controllerchange", onClaim); } catch { /* No second claim is accepted. */ }
    try {
      budgetTimer = setTimeoutImpl(stop, WARM_BUDGET_MS);
      if (observer && !observationEnded) observationTimer = setTimeoutImpl(endObservation, LATE_RESOURCE_MS);
    } catch { stop(); return; }
    snapshot();
    if (!observer) observationEnded = true;
    pump();
  }

  try {
    serviceWorker.addEventListener("controllerchange", onClaim);
    lifecycle.addEventListener("pagehide", stop, { once: true });
    claimTimer = setTimeoutImpl(stop, WAIT_FOR_CLAIM_MS);
    if (typeof Observer === "function") {
      try {
        observer = new Observer(list => {
          try { record(list.getEntries()); } catch { /* An unavailable observer must not affect lookup. */ }
        });
        try { observer.observe({ type: "resource", buffered: true }); }
        catch { observer.observe({ entryTypes: ["resource"] }); }
      } catch {
        try { observer?.disconnect(); } catch { /* Snapshot-only fallback. */ }
        observer = null;
      }
    }
    snapshot();
    // A claim between the initial guard and listener installation must not be
    // missed. This is not the already-controlled-page path excluded above.
    if (serviceWorker.controller) onClaim();
  } catch { stop(); }
  return stop;
}
