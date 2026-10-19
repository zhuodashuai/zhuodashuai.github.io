import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
function worker(fetchImpl, cached = null, { put = async (_request, response) => response.clone().arrayBuffer(), cacheError = null, openGate = async () => {} } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const writes = [];
  const precached = [];
  const background = [];
  let serial = 0;
  vm.runInNewContext(source, {
    self: { location: { origin: "https://wordbook.test", href: "https://wordbook.test/vocab/sw.js" }, addEventListener: (type, listener) => listeners.set(type, listener) },
    caches: { open: async () => { await openGate(); if (cacheError) throw cacheError; return ({
      match: async (request) => typeof cached === "function" ? cached(request) : cached?.clone(),
      addAll: async (requests) => { precached.push(...requests); },
      put: async (request, response) => { await put(request, response); writes.push({ request, response }); }
    }); } },
    fetch: fetchImpl, URL, Request, Response, AbortController,
    setTimeout: (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id)
  }, { filename: "vocab/sw.js" });
  return {
    timers, writes, precached, background,
    async install() {
      let task;
      listeners.get("install")({ waitUntil: (promise) => { task = promise; } });
      await task;
    },
    fetch(path = "/vocab/index.html", mode = "navigate", options = {}) {
      let response;
      listeners.get("fetch")({ request: { method: "GET", url: `https://wordbook.test${path}`, mode, ...options }, respondWith: (promise) => { response = promise; }, waitUntil: promise => background.push(promise) });
      return response;
    }
  };
}

test("explicit shard repair bypasses bad cache and clones before a delayed CacheStorage open", async () => {
  let release, reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const sw = worker(async (_request, options) => {
    assert.equal(options.cache, "reload"); return new Response("healthy repaired shard");
  }, () => { reads++; return new Response("old corrupt shard"); }, {
    openGate: () => gate,
    put: async (_request, response) => assert.equal(await response.text(), "healthy repaired shard")
  });
  const response = await sw.fetch("/vocab/data/expanded-dictionary/version/en-000.json", "cors", { cache: "reload" });
  assert.equal(await response.text(), "healthy repaired shard");
  release(); await Promise.all(sw.background);
  assert.equal(reads, 0); assert.equal(sw.writes.length, 1);
});

test("an offline shard repair never falls back to the corrupt cached shard", async () => {
  const sw = worker(async () => { throw new Error("offline repair"); }, new Response("corrupt"));
  await assert.rejects(sw.fetch("/vocab/data/expanded-dictionary/version/en-000.json", "cors", { cache: "reload" }), /offline repair/u);
  assert.equal(sw.writes.length, 0);
});

test("example manifests refresh online and checksum repair bypasses corrupted example caches", async () => {
  const calls = [];
  const sw = worker(async (_request, options) => { calls.push(options); return new Response('{"healthy":true}'); }, new Response("old"));
  await sw.fetch("/vocab/data/dictionary-examples/manifest.json", "cors");
  assert.equal(calls[0].cache, "no-cache");
  await sw.fetch("/vocab/data/dictionary-examples/version/examples-0.json", "cors", { cache: "reload" });
  assert.equal(calls[1].cache, "reload");
  await Promise.all(sw.background);
});

test("extensionless dictionary navigation falls back to its own offline shell", async () => {
  const sw = worker(async () => { throw Error("offline"); }, request => request === "./dictionary.html" ? new Response("dictionary shell") : undefined);
  for (const route of ["/dictionary", "/dictionary/", "/vocab/dictionary.html"]) {
    assert.equal(await (await sw.fetch(route)).text(), "dictionary shell");
  }
});

test("a temporary HTTP failure serves a verified cached page and never stores the failure", async () => {
  const sw = worker(async () => new Response("unavailable", { status: 503 }), new Response("cached page"));
  const response = await sw.fetch();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "cached page");
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});

test("a quota error while caching static dictionary data never rejects a healthy lookup response", async () => {
  const sw = worker(async () => new Response('{"dictionary":"healthy"}'), null, {
    put: async () => { throw new DOMException("Storage full", "QuotaExceededError"); }
  });
  const response = await sw.fetch("/vocab/data/member-dictionary.json?v=content-hash", "cors");
  assert.deepEqual(await response.json(), { dictionary: "healthy" });
  await Promise.all(sw.background);
  assert.equal(sw.writes.length, 0);
});

test("a stalled dictionary cache write cannot delay returning the network body", async () => {
  const sw = worker(async () => new Response("fast dictionary"), null, { put: () => new Promise(() => {}) });
  assert.equal(await (await sw.fetch("/vocab/data/member-dictionary.json?v=new", "cors")).text(), "fast dictionary");
  assert.equal(sw.background.length, 1);
});

test("denied CacheStorage still allows an online static dictionary lookup", async () => {
  const sw = worker(async () => new Response("uncached dictionary"), null, { cacheError: new Error("Storage denied") });
  assert.equal(await (await sw.fetch("/vocab/data/member-dictionary.json?v=new", "cors")).text(), "uncached dictionary");
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

test("Cloudflare's canonical personal route and explicit HTML both fall back to the blank personal shell", async () => {
  for (const path of ["/personal", "/personal/", "/personal.html", "/personal?release=73"]) {
    const sw = worker(async () => { throw new Error("offline"); }, async (request) => (
      request === "./personal.html" ? new Response("blank personal shell with disabled login forms") : null
    ));
    const response = await sw.fetch(path);
    assert.equal(response.status, 200, path);
    assert.equal(await response.text(), "blank personal shell with disabled login forms", path);
    assert.equal(sw.writes.length, 0);
  }
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
    const version = file === "synonym-evidence.js" ? 77 : 82;
    assert.ok(urls.includes(`https://wordbook.test/vocab/js/${file}?v=${version}`));
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
