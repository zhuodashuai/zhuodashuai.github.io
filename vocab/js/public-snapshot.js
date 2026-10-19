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
export async function fetchPublicSnapshot({ candidates, snapshot = null, etag = "", fetcher = globalThis.fetch, timeoutMs = PUBLIC_REQUEST_TIMEOUT_MS } = {}) {
  let lastError = new Error("没有可用的公开词库来源");
  for (const candidate of candidates) {
    const controller = new AbortController();
    let timer;
    try {
      const headers = { Accept: "application/json" };
      if (candidate.source === "live" && snapshot && etag) headers["If-None-Match"] = etag;
      const request = (async () => {
        const response = await fetcher(candidate.url, { cache: "no-cache", headers, signal: controller.signal });
        if (response.status === 304 && candidate.source === "live" && snapshot) {
          return { snapshot, response, source: candidate.source };
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { snapshot: parsePublicSnapshot(await response.json()), response, source: candidate.source };
      })();
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("词库连接超时")); }, timeoutMs);
      });
      return await Promise.race([request, deadline]);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}
