import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
function worker(fetchImpl, cached = null, { put = async (_request, response) => response.clone().arrayBuffer() } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const writes = [];
  const precached = [];
  let serial = 0;
  vm.runInNewContext(source, {
    self: { location: { origin: "https://wordbook.test", href: "https://wordbook.test/vocab/sw.js" }, addEventListener: (type, listener) => listeners.set(type, listener) },
    caches: { open: async () => ({
      match: async () => cached?.clone(),
      addAll: async (requests) => { precached.push(...requests); },
      put: async (request, response) => { await put(request, response); writes.push({ request, response }); }
    }) },
    fetch: fetchImpl, URL, Request, Response, AbortController,
    setTimeout: (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id)
  }, { filename: "vocab/sw.js" });
  return {
    timers, writes, precached,
    async install() {
      let task;
      listeners.get("install")({ waitUntil: (promise) => { task = promise; } });
      await task;
    },
    fetch(path = "/vocab/index.html", mode = "navigate") {
      let response;
      listeners.get("fetch")({ request: { method: "GET", url: `https://wordbook.test${path}`, mode }, respondWith: (promise) => { response = promise; } });
      return response;
    }
  };
}

test("a temporary HTTP failure serves a verified cached page and never stores the failure", async () => {
  const sw = worker(async () => new Response("unavailable", { status: 503 }), new Response("cached page"));
  const response = await sw.fetch();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "cached page");
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});

test("an unresponsive fetch is aborted at the bounded deadline and uses the valid cache", async () => {
  let signal;
  const sw = worker((_request, options) => { signal = options.signal; return new Promise(() => {}); }, new Response("offline shell"));
  const task = sw.fetch();
  await new Promise(setImmediate);
  assert.equal(sw.timers.size, 1);
  const timer = [...sw.timers.values()][0];
  assert.equal(timer.delay, 5_000);
  timer.callback();
  const response = await task;
  assert.equal(signal.aborted, true);
  assert.equal(await response.text(), "offline shell");
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});

test("cached errors are rejected and a real HTTP failure is retained when no valid cache exists", async () => {
  const sw = worker(async () => new Response("upstream failure", { status: 502 }), new Response("bad old cache", { status: 503 }));
  const response = await sw.fetch();
  assert.equal(response.status, 502);
  assert.equal(await response.text(), "upstream failure");
  assert.equal(sw.writes.length, 0);
});

test("authorization errors are returned unchanged and API reads stay network-only", async () => {
  const sw = worker(async () => new Response("sign in", { status: 401 }), new Response("cached shell"));
  assert.equal((await sw.fetch()).status, 401);
  assert.equal((await sw.fetch("/api/v1/session", "cors")).status, 401);
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});

test("private member reads never enter caches even when successful, and offline never returns cached personal data", async () => {
  const secret = JSON.stringify({ entries: [{ term: "private sentinel" }] });
  const online = worker(async () => new Response(secret), new Response("old secret"));
  assert.equal(await (await online.fetch("/api/v1/member/entries", "cors")).text(), secret);
  assert.equal(online.writes.length, 0);
  assert.equal(online.timers.size, 0);
  const offline = worker(async () => { throw new Error("offline"); }, new Response(secret));
  await assert.rejects(offline.fetch("/api/v1/member/entries", "cors"), /offline/);
  assert.equal(offline.writes.length, 0);
});

test("a successful online response updates the cache", async () => {
  const sw = worker(async (_request, options) => {
    assert.equal(options.cache, "no-cache", "network-first must revalidate a still-fresh HTTP cache entry");
    return new Response("new shell");
  }, new Response("old shell"));
  assert.equal(await (await sw.fetch()).text(), "new shell");
  assert.equal(sw.writes.length, 1);
  assert.equal(await sw.writes[0].response.text(), "new shell");
});

test("a new shell installation bypasses old HTTP cache copies and includes coherent versioned and legacy URLs", async () => {
  const sw = worker(async () => { throw new Error("installation uses cache.addAll requests"); });
  await sw.install();
  assert.ok(sw.precached.length > 0);
  assert.ok(sw.precached.every((request) => request instanceof Request && request.cache === "reload"));
  const urls = sw.precached.map((request) => request.url);
  for (const file of ["owner-storage.js", "quiz-storage.js", "chapter-quiz.js", "synonym-evidence.js", "learning-backup.js"]) {
    assert.ok(urls.includes(`https://wordbook.test/vocab/js/${file}?v=73`));
    assert.ok(urls.includes(`https://wordbook.test/vocab/js/${file}`));
  }
});

test("successful headers followed by a stalled body use the cache when the whole pipeline times out", async () => {
  let signal;
  const sw = worker((_request, options) => {
    signal = options.signal;
    const body = new ReadableStream({ start(controller) {
      signal.addEventListener("abort", () => controller.error(new DOMException("Body aborted", "AbortError")));
    } });
    return Promise.resolve(new Response(body));
  }, new Response("verified cached shell"));
  const task = sw.fetch();
  await new Promise(setImmediate);
  [...sw.timers.values()][0].callback();
  const response = await task;
  assert.equal(signal.aborted, true);
  assert.equal(await response.text(), "verified cached shell");
  assert.equal(sw.writes.length, 0, "the aborted network body was never committed to the cache");
  assert.equal(sw.timers.size, 0);
});

test("a stuck cache write is bounded even after the complete network body is available", async () => {
  const sw = worker(async () => new Response("network shell"), new Response("cached shell"), {
    put: () => new Promise(() => {})
  });
  const task = sw.fetch();
  await new Promise(setImmediate);
  [...sw.timers.values()][0].callback();
  assert.equal(await (await task).text(), "cached shell");
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});

test("a rejected cache write still returns a complete healthy network response", async () => {
  const sw = worker(async () => new Response("healthy network shell"), new Response("older shell"), {
    put: async () => { throw new DOMException("Storage full", "QuotaExceededError"); }
  });
  assert.equal(await (await sw.fetch()).text(), "healthy network shell");
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});

test("a broken response body falls back instead of returning unreadable successful headers", async () => {
  const sw = worker(async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error("Connection failed during body transfer")); }
  })), new Response("verified shell"));
  assert.equal(await (await sw.fetch()).text(), "verified shell");
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});
