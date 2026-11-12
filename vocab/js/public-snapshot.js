import { parsePublicSnapshot } from "./wordbook-schema.js?v=82";

export const PUBLIC_REQUEST_TIMEOUT_MS = 7_000;

export async function readPublicCacheWithDeadline(readCache, onCache, timeoutMs = 350) {
  let timer;
  const read = Promise.resolve().then(readCache).then((cache) => {
    if (!cache?.snapshot) return null;
    const validated = { ...cache, snapshot: parsePublicSnapshot(cache.snapshot) };
    // A slow local database may become ready after the network has started.
    // Its caller decides whether this cache is still needed at that point.
    onCache(validated);
    return validated;
  }).catch(() => null);
  try {
    return await Promise.race([read, new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

// Bound the whole response, including a body that never finishes. A failed
// provider must not prevent the static fallback or an already validated cache.
export async function fetchPublicSnapshot({
  candidates, snapshot = null, etag: legacyLiveEtag = "", validatedByUrl, minimumPublishedAt = 0,
  fetcher = globalThis.fetch, timeoutMs = PUBLIC_REQUEST_TIMEOUT_MS
} = {}) {
  let lastError = new Error("没有可用的公开词库来源");
  let staleLive = null;
  const checkPublishedRelease = minimumPublishedAt > (Date.parse(snapshot?.exportedAt) || 0);
  for (const candidate of candidates) {
    const controller = new AbortController();
    let timer;
    try {
      const headers = { Accept: "application/json" };
      const legacy = candidate.source === "live" && snapshot && legacyLiveEtag
        ? { snapshot, etag: legacyLiveEtag } : null;
      const validated = validatedByUrl?.get(candidate.url) ?? legacy;
      const etag = validated?.etag;
      if (etag) headers["If-None-Match"] = etag;
      const request = (async () => {
        const response = await fetcher(candidate.url, { cache: "no-cache", headers, signal: controller.signal });
        const unchanged = !response.redirected && (response.status === 304
          || (response.status === 200 && response.headers?.get("etag") === etag));
        if (etag && unchanged) {
          // An HTTP or service worker cache can supply the unchanged response as 200.
          if (response.body) void response.body.cancel().catch(() => {});
          return { snapshot: validated.snapshot, response, source: candidate.source };
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { snapshot: parsePublicSnapshot(await response.json()), response, source: candidate.source };
      })();
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("词库连接超时")); }, timeoutMs);
      });
      const result = await Promise.race([request, deadline]);
      // Remember each provider's validated revision even if it is older than
      // the one on screen. A 304 must reuse the data for the requested URL.
      const resultEtag = result.response.headers?.get("etag") || (result.response.status === 304 ? etag : "");
      if (resultEtag && !result.response.redirected) {
        validatedByUrl?.set(candidate.url, { snapshot: result.snapshot, etag: resultEtag });
      } else {
        validatedByUrl?.delete(candidate.url);
      }
      const publishedAt = Date.parse(result.snapshot.exportedAt);
      // A reachable Worker can still serve an older deployment. Try the
      // validated static release once, keeping the live response as fallback.
      if (candidate.source === "live" && checkPublishedRelease && publishedAt < minimumPublishedAt) {
        staleLive = result;
        continue;
      }
      if (staleLive && publishedAt < minimumPublishedAt) continue;
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }
  if (staleLive) return staleLive;
  throw lastError;
}
