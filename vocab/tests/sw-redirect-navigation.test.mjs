import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const origin = "https://wordbook.test";
const scriptUrl = `${origin}/vocab/sw.js`;
const currentCache = "zhuo-wordbook-v100";

// Node cannot construct a navigation Request or create a browser's internal
// redirect URL list without a network fetch. These metadata fixtures exercise
// the real SW branches, not Chromium's respondWith validation; the browser
// redirect regression separately covers that validation with real redirects.
function redirectedResponse(body, init = {}, metadata = {}) {
  const response = new Response(body, init);
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: metadata.url ?? `${origin}/vocab/dictionary` },
    type: { value: metadata.type ?? "basic" }
  });
  return response;
}

function worker({ fetchImpl = async () => { throw new Error("offline"); }, match = () => undefined,
  cacheNames = [currentCache], warmEntries = new Map() } = {}) {
  const listeners = new Map();
  const timers = new Map();
  const opens = [];
  const matches = [];
  const writes = [];
  const deleted = [];
  const precached = [];
  const fetches = [];
  const background = [];
  const names = new Set(cacheNames);
  let serial = 0;
  let claims = 0;
  vm.runInNewContext(source, {
    self: {
      location: { origin, href: scriptUrl },
      clients: { claim: async () => { claims++; } },
      addEventListener: (type, listener) => listeners.set(type, listener)
    },
    caches: {
      keys: async () => [...names],
      delete: async name => { deleted.push(name); return names.delete(name); },
      open: async name => {
        opens.push(name);
        names.add(name);
        return {
          async match(request, options) {
            matches.push({ request, options });
            const resolved = await match(request, options);
            if (resolved) return resolved;
            const url = new URL(typeof request === "string" ? request : request.url, scriptUrl).href;
            return warmEntries.get(url)?.();
          },
          async put(request, response) {
            const body = await response.arrayBuffer();
            writes.push({ request, body, status: response.status });
          },
          async addAll(requests) {
            // Model replacement of shell keys only. Existing runtime entries
            // must survive the actual activation cache-deletion policy.
            precached.push(...requests);
            for (const request of requests) {
              warmEntries.set(request.url, () => new Response("installed shell"));
            }
          }
        };
      }
    },
    fetch: async (request, options) => {
      fetches.push({ request, options });
      return fetchImpl(request, options);
    },
    URL, Request, Response, AbortController,
    setTimeout: (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  }, { filename: "vocab/sw.js" });
  const lifecycle = async type => {
    let task;
    listeners.get(type)({ waitUntil: promise => { task = promise; } });
    await task;
  };
  return {
    opens, matches, writes, deleted, precached, fetches, timers, background, names,
    get claims() { return claims; },
    install: () => lifecycle("install"),
    activate: () => lifecycle("activate"),
    fetch(path = "/vocab/dictionary.html", mode = "navigate", options = {}) {
      let result;
      listeners.get("fetch")({
        request: { method: "GET", url: new URL(path, origin).href, mode, ...options },
        respondWith: promise => { result = promise; },
        waitUntil: promise => background.push(promise)
      });
      return result;
    }
  };
}

test("offline navigation removes only redirected cache metadata and preserves bytes, status and security headers", async () => {
  const bytes = new TextEncoder().encode("<!doctype html><title>查词 — café</title>");
  const cached = redirectedResponse(bytes, {
    status: 203, statusText: "Non-Authoritative Information",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'self'; object-src 'none'",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=0",
      ETag: '"shell-original"', Vary: "Accept-Encoding"
    }
  });
  const headers = [...cached.headers];
  const sw = worker({ match: request => typeof request !== "string" ? cached : undefined });
  const response = await sw.fetch();
  assert.notEqual(response, cached);
  assert.equal(response.redirected, false);
  assert.equal(response.url, "");
  assert.equal(response.status, 203);
  assert.equal(response.statusText, "Non-Authoritative Information");
  assert.deepEqual([...response.headers], headers);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(sw.matches.length, 1);
  assert.equal(sw.matches[0].options.ignoreSearch, false);
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.timers.size, 0);
});

test("redirected offline shell fallback is normalized for HTML and clean navigation routes", async () => {
  const routes = [
    ["/vocab/dictionary.html?word=abacus", "./dictionary.html"],
    ["/dictionary", "./dictionary.html"],
    ["/dictionary/", "./dictionary.html"],
    ["/personal", "./personal.html"],
    ["/vocab/personal.html", "./personal.html"],
    ["/vocab/owner.html", "./owner.html"],
    ["/vocab/quick-notes.html", "./quick-notes.html"],
    ["/vocab/index.html", "./index.html"]
  ];
  for (const [route, fallback] of routes) {
    const cached = redirectedResponse(`<main>${fallback}</main>`, {
      headers: { "Content-Type": "text/html; charset=utf-8", "X-Shell": fallback }
    });
    const sw = worker({ match: request => request === fallback ? cached : undefined });
    const response = await sw.fetch(route);
    assert.equal(response.redirected, false, route);
    assert.equal(response.headers.get("X-Shell"), fallback, route);
    assert.equal(await response.text(), `<main>${fallback}</main>`, route);
    assert.equal(sw.matches.length, 2, route);
    assert.equal(sw.writes.length, 0, route);
  }
});

test("redirected navigation fallback stays streaming instead of waiting for its entire body", async () => {
  let controller;
  const stream = new ReadableStream({ start(value) { controller = value; } });
  const cached = redirectedResponse(stream, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  const sw = worker({ match: () => cached });
  const pending = sw.fetch();
  const response = await Promise.race([pending, new Promise(resolve => setImmediate(() => resolve(null)))]);
  // Always release the fixture stream, including when an accidental buffering
  // implementation causes this assertion to fail.
  controller.enqueue(new TextEncoder().encode("<p>first"));
  controller.enqueue(new TextEncoder().encode(" and last</p>"));
  controller.close();
  assert.ok(response instanceof Response, "navigation must resolve before the cache body closes");
  assert.equal(response.redirected, false);
  assert.equal(await response.text(), "<p>first and last</p>");
  await pending;
});

test("a redirected cached null-body response retains its null body and status", async () => {
  const cached = redirectedResponse(null, { status: 204, statusText: "No Content", headers: { "X-Shell": "empty" } });
  const sw = worker({ match: () => cached });
  const response = await sw.fetch();
  assert.equal(response.redirected, false);
  assert.equal(response.status, 204);
  assert.equal(response.statusText, "No Content");
  assert.equal(response.body, null);
  assert.equal(response.headers.get("X-Shell"), "empty");
});

test("a server failure uses the normalized cached navigation without caching the failed response", async () => {
  const cached = redirectedResponse("offline dictionary");
  const sw = worker({ fetchImpl: async () => new Response("unavailable", { status: 503 }), match: () => cached });
  const response = await sw.fetch();
  assert.equal(response.redirected, false);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "offline dictionary");
  assert.equal(sw.writes.length, 0);
});

test("a nonredirected cached navigation is returned unchanged", async () => {
  const cached = new Response("ordinary cached shell", { headers: { "X-Shell": "unchanged" } });
  const sw = worker({ match: () => cached });
  const response = await sw.fetch();
  assert.equal(response, cached);
  assert.equal(await response.text(), "ordinary cached shell");
});

test("navigation normalization does not rebrand CORS or foreign-final-URL responses as same-origin documents", async () => {
  for (const metadata of [
    { type: "cors" },
    { url: "https://external.test/dictionary" },
    { url: "not a valid absolute URL" },
    { url: "" }
  ]) {
    const cached = redirectedResponse("unmodified response", {}, metadata);
    const sw = worker({ match: () => cached });
    const response = await sw.fetch();
    assert.equal(response, cached, JSON.stringify(metadata));
    assert.equal(response.redirected, true);
    assert.equal(await response.text(), "unmodified response");
    assert.equal(sw.writes.length, 0);
  }
});

test("healthy network responses retain redirect metadata and normal online cache writes", async () => {
  const network = redirectedResponse("online redirected destination", { headers: { "X-Shell": "network" } });
  const sw = worker({ fetchImpl: async () => network });
  const response = await sw.fetch();
  assert.equal(response, network);
  assert.equal(response.redirected, true);
  assert.equal(response.url, `${origin}/vocab/dictionary`);
  assert.equal(await response.text(), "online redirected destination");
  assert.equal(sw.writes.length, 1);
  assert.equal(sw.matches.length, 0);
});

test("an actual network redirect status and Location are not rewritten into a synthetic document", async () => {
  const network = Response.redirect(`${origin}/dictionary`, 302);
  const sw = worker({ fetchImpl: async () => network });
  const response = await sw.fetch();
  assert.equal(response, network);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), `${origin}/dictionary`);
  assert.equal(sw.writes.length, 0);
  assert.equal(sw.matches.length, 0);
});

test("ordinary asset and manifest cache fallbacks retain their response metadata", async () => {
  for (const path of ["/vocab/js/dictionary-app.js?v=99", "/vocab/data/dictionary-examples/manifest-v2.json"]) {
    const cached = redirectedResponse("ordinary nonnavigation cached content");
    const sw = worker({ match: () => cached });
    const response = await sw.fetch(path, "cors");
    assert.equal(response, cached, path);
    assert.equal(response.redirected, true, path);
    assert.equal(response.url, `${origin}/vocab/dictionary`, path);
    assert.equal(await response.text(), "ordinary nonnavigation cached content", path);
  }
});

test("ordinary cache-first dictionary data also retains its response metadata", async () => {
  const cached = redirectedResponse('{"term":"abacus"}');
  const sw = worker({ match: () => cached });
  const response = await sw.fetch("/vocab/data/expanded-dictionary/version/en-000.json", "cors");
  assert.equal(response, cached);
  assert.equal(response.redirected, true);
  assert.deepEqual(await response.json(), { term: "abacus" });
  assert.equal(sw.fetches.length, 0);
});

test("opaque and error cache entries cannot become readable navigation documents", async () => {
  for (const type of ["opaque", "opaqueredirect", "error"]) {
    const unusable = Response.error();
    Object.defineProperties(unusable, { type: { value: type }, redirected: { value: true } });
    const sw = worker({ match: request => typeof request === "string" ? new Response("public shell") : unusable });
    const response = await sw.fetch();
    assert.equal(response.status, 200, type);
    assert.equal(await response.text(), "public shell", type);
    assert.equal(sw.matches.length, 2, type);
    assert.equal(sw.writes.length, 0, type);
  }
});

test("private and owner API GETs remain network-only even when navigated and cache entries exist", async () => {
  for (const path of ["/api/v1/member/entries", "/api/v1/member/folders", "/api/v1/owner/entries"]) {
    const network = redirectedResponse("network-only API response");
    const sw = worker({ fetchImpl: async () => network, match: () => redirectedResponse("must never be used") });
    const response = await sw.fetch(path);
    assert.equal(response, network, path);
    assert.equal(response.redirected, true, path);
    assert.equal(sw.opens.length, 0, path);
    assert.equal(sw.matches.length, 0, path);
    assert.equal(sw.writes.length, 0, path);
    assert.equal(sw.fetches.length, 1, path);
  }
  const offline = worker({ match: () => redirectedResponse("must never leak offline") });
  await assert.rejects(offline.fetch("/api/v1/member/entries"), /offline/u);
  assert.equal(offline.opens.length, 0);
});

test("POSTs and cross-origin requests are not intercepted or cached", () => {
  const sw = worker({ match: () => redirectedResponse("must never be used") });
  for (const path of ["/vocab/dictionary.html", "/api/v1/member/entries", "/api/v1/member/folders"]) {
    assert.equal(sw.fetch(path, "navigate", { method: "POST" }), undefined, path);
  }
  for (const mode of ["navigate", "cors", "no-cors"]) {
    assert.equal(sw.fetch("https://external.test/dictionary.html", mode), undefined, mode);
  }
  assert.equal(sw.opens.length, 0);
  assert.equal(sw.fetches.length, 0);
  assert.equal(sw.writes.length, 0);
});

test("additive shell updates keep existing v100 warmed dictionary and example entries through activation", async () => {
  const dictionaryUrl = `${origin}/vocab/data/expanded-dictionary/existing-version/en-042.json`;
  const examplesUrl = `${origin}/vocab/data/dictionary-examples/existing-version/examples-042.json`;
  const warmEntries = new Map([
    [dictionaryUrl, () => new Response('{"term":"abacus","meaning":"算盘"}')],
    [examplesUrl, () => new Response('{"en":"She moved the abacus closer to the lamp."}')]
  ]);
  const sw = worker({ cacheNames: [currentCache, "zhuo-wordbook-v99", "unrelated-cache"], warmEntries });
  await sw.install();
  await sw.activate();
  assert.ok(sw.opens.length > 0);
  assert.ok(sw.opens.every(name => name === currentCache));
  assert.deepEqual(sw.deleted, ["zhuo-wordbook-v99"]);
  assert.ok(sw.names.has(currentCache));
  assert.ok(sw.names.has("unrelated-cache"));
  assert.equal(sw.claims, 1);
  assert.ok(sw.precached.every(request => request.method === "GET" && new URL(request.url).origin === origin && !new URL(request.url).pathname.startsWith("/api/")));
  const dictionary = await sw.fetch(dictionaryUrl, "cors");
  const examples = await sw.fetch(examplesUrl, "cors");
  assert.equal((await dictionary.json()).term, "abacus");
  assert.equal((await examples.json()).en, "She moved the abacus closer to the lamp.");
  assert.equal(sw.fetches.length, 0, "already warmed shards must work without a new network fetch");
});
