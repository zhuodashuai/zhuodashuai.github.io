import assert from "node:assert/strict";
import test from "node:test";
import { dictionaryOfflineWarmUrl, installDictionaryOfflineWarm } from "../js/dictionary-offline-warm.js";

const base = "https://wordbook.test/vocab/", hash = "a".repeat(64);
const manifest = `${base}data/expanded-dictionary/manifest.json`;
const examples = `${base}data/dictionary-examples/manifest-v2.json`;
const english = n => `${base}data/expanded-dictionary/${hash}/en-${String(n).padStart(3, "0")}.json`;
const chinese = n => `${base}data/expanded-dictionary/${hash}/zh-${String(n).padStart(3, "0")}.json`;
const example = n => `${base}data/dictionary-examples/${hash}/examples-${n}.json`;
const resource = (name, startTime = 10, extra = {}) => ({ name, entryType: "resource", initiatorType: "fetch", startTime, responseEnd: startTime + 10, ...extra });
const flush = () => new Promise(resolve => setImmediate(resolve));

class Events {
  listeners = new Map();
  addEventListener(type, listener) {
    const set = this.listeners.get(type) || new Set(); set.add(listener); this.listeners.set(type, set);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type) { for (const listener of [...this.listeners.get(type) || []]) listener(); }
  count(type) { return this.listeners.get(type)?.size || 0; }
}

function clock() {
  let time = 100, serial = 0;
  const timers = new Map();
  return {
    timers, now: () => time,
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async advance(milliseconds) {
      const end = time + milliseconds;
      while (true) {
        const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
      }
      time = end; await flush();
    }
  };
}

function harness({ entries = [], controlled = false, fetchImpl, observerMode = "normal", onAdd, AbortControllerImpl = AbortController } = {}) {
  const time = clock(), sw = new Events(), lifecycle = new Events(), observers = [], requests = [];
  sw.controller = controlled ? {} : null;
  if (onAdd) {
    const add = sw.addEventListener.bind(sw);
    sw.addEventListener = (type, listener) => { add(type, listener); onAdd(sw, type); };
  }
  class Observer {
    constructor(callback) {
      if (observerMode === "constructor-error") throw new Error("no observer");
      this.callback = callback; this.disconnected = false; this.options = []; observers.push(this);
    }
    observe(options) {
      this.options.push(options);
      if (observerMode === "observe-error" || observerMode === "fallback" && options.buffered) throw new Error("unsupported observer");
    }
    disconnect() { this.disconnected = true; }
    emit(items) { if (!this.disconnected) this.callback({ getEntries: () => items }); }
  }
  const stop = installDictionaryOfflineWarm({
    baseUrl: base, serviceWorker: sw, lifecycle,
    performance: { now: time.now, getEntriesByType(type) { assert.equal(type, "resource"); return entries; } },
    Observer: observerMode === "missing" ? null : Observer,
    AbortControllerImpl,
    fetchImpl: (url, options) => {
      requests.push({ url, options });
      return fetchImpl ? fetchImpl(url, options, requests.length) : Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
    },
    setTimeoutImpl: time.setTimeout, clearTimeoutImpl: time.clearTimeout
  });
  return {
    time, sw, lifecycle, observers, requests, stop,
    async claim() { await time.advance(900); sw.controller = {}; sw.emit("controllerchange"); await flush(); },
    emit(items) { for (const observer of observers) observer.emit(items); }
  };
}

test("the URL guard accepts only exact public manifests and existing shard shapes on the app origin", () => {
  for (const url of [manifest, examples, english(0), english(127), chinese(0), chinese(127), example(0), example(52), example(255)]) {
    assert.equal(dictionaryOfflineWarmUrl(url, base), url);
  }
  for (const root of ["http://127.0.0.1:4187/", "https://worker.test/"]) {
    const url = `${root}data/expanded-dictionary/manifest.json`;
    assert.equal(dictionaryOfflineWarmUrl(url, root), url);
  }
});

test("the URL guard rejects private/other public data, query/hash, credentials, aliases, and malformed paths", () => {
  const rejected = [null, undefined, 42, {}, "", "data/expanded-dictionary/manifest.json", `${manifest}?`, `${manifest}#`,
    `${manifest}?word=Tajik`, `${manifest}#q=Tajik`, ` ${manifest}`, `${manifest}\n`,
    manifest.replace("wordbook.test", "elsewhere.test"), manifest.replace("https://", "https://user:pass@"),
    manifest.replace("https:", "file:"), manifest.replace("/vocab/", "/another/"),
    `${base}api/v1/member/cards`, `${base}api/v1/auth/session`, `${base}data/owner-wordbook.json`,
    `${base}data/dictionary-suggestions/manifest.json`, `${base}data/dictionary-examples/manifest.json`,
    `${base}js/dictionary-app.js`, english(128), chinese(999), example(256), example(-1),
    example(1).replace("examples-1", "examples-01"), english(0).replace("en-000", "en-0"),
    english(0).replace(hash, hash.toUpperCase()), english(0).replace("/en-000", "/%65n-000"),
    `${base}private/../data/expanded-dictionary/manifest.json`, `${base}data%2fexpanded-dictionary/manifest.json`,
    manifest.replace("/vocab/", "/vocab\\"), "javascript:alert(1)"];
  for (const url of rejected) assert.equal(dictionaryOfflineWarmUrl(url, base), null, String(url));
  for (const badBase of ["file:///vocab/", `${base}?secret`, `${base}#q=x`, base.slice(0, -1), "not a URL"]) {
    assert.equal(dictionaryOfflineWarmUrl(manifest, badBase), null, badBase);
  }
});

test("already controlled pages do no observing, fetching, or event/timer setup", () => {
  const h = harness({ controlled: true, entries: [resource(manifest)] });
  assert.equal(h.observers.length, 0); assert.equal(h.requests.length, 0); assert.equal(h.time.timers.size, 0);
  assert.equal(h.sw.count("controllerchange"), 0); assert.equal(h.lifecycle.count("pagehide"), 0);
  h.stop(); h.stop();
});

test("buffered actual reads wait for claim, use credential-free reloads, and consume complete bodies", async () => {
  const consumed = [];
  const h = harness({ entries: [resource(manifest), resource(english(20)), resource(examples), resource(example(52))],
    fetchImpl: async url => ({ ok: true, arrayBuffer: async () => { consumed.push(url); return new ArrayBuffer(1); } }) });
  assert.deepEqual(h.observers[0].options, [{ type: "resource", buffered: true }]);
  assert.deepEqual(h.requests, []);
  await h.claim(); await flush();
  assert.deepEqual(h.requests.map(item => item.url), [manifest, english(20), examples, example(52)]);
  assert.deepEqual(consumed, h.requests.map(item => item.url));
  for (const { options } of h.requests) {
    assert.deepEqual({ ...options, signal: undefined }, { method: "GET", credentials: "omit", cache: "reload", redirect: "error", mode: "same-origin", signal: undefined });
    assert.ok(options.signal instanceof AbortSignal);
  }
  h.stop();
});

test("a pre-claim request finishing late is captured; genuinely post-claim requests are not replayed", async () => {
  const h = harness({ entries: [resource(manifest)] });
  await h.claim();
  h.emit([resource(english(20), 900, { responseEnd: 1200 }), resource(example(52), 999, { responseEnd: 1300 }),
    resource(chinese(1), 1000), resource(chinese(2), 1001)]);
  await flush();
  assert.deepEqual(h.requests.map(item => item.url), [manifest, english(20), example(52)]);
  h.stop();
});

test("buffer/snapshot duplicates, repeated claim events, and replay timing entries cannot loop", async () => {
  const h = harness({ entries: [resource(manifest), resource(manifest)] });
  h.emit([resource(manifest)]); await h.claim();
  h.emit([resource(manifest), resource(manifest, 1100)]); h.sw.emit("controllerchange"); await flush();
  assert.deepEqual(h.requests.map(item => item.url), [manifest]);
  assert.equal(h.sw.count("controllerchange"), 0); h.stop();
});

test("a claim between the initial guard and event registration is still handled once", async () => {
  const h = harness({ entries: [resource(manifest)], onAdd(sw, type) { if (type === "controllerchange") sw.controller = {}; } });
  await flush();
  assert.deepEqual(h.requests.map(item => item.url), [manifest]);
  h.sw.emit("controllerchange"); await flush(); assert.equal(h.requests.length, 1); h.stop();
});

test("non-fetch, invalid timing, query-bearing and private resource records never enter the queue", async () => {
  const h = harness({ entries: [resource(manifest, 10, { entryType: "navigation" }), resource(manifest, 10, { initiatorType: "script" }),
    resource(manifest, NaN), resource(manifest, -1), resource(manifest, 10, { responseEnd: 0 }),
    resource(manifest, 20, { responseEnd: 10 }), resource(manifest, 10, { responseEnd: Infinity }),
    resource(`${manifest}?q=secret`), resource(`${base}api/v1/member/cards`), resource(manifest)] });
  await h.claim(); assert.deepEqual(h.requests.map(item => item.url), [manifest]); h.stop();
});

test("at most 32 observed URLs are replayed, not every shard or a generated catalogue", async () => {
  const h = harness({ entries: Array.from({ length: 100 }, (_, n) => resource(english(n))) });
  assert.equal(h.observers[0].disconnected, true);
  await h.claim();
  for (let n = 0; n < 20; n++) await flush();
  assert.deepEqual(h.requests.map(item => item.url), Array.from({ length: 32 }, (_, n) => english(n)));
  assert.equal(h.time.timers.size, 0); assert.equal(h.lifecycle.count("pagehide"), 0);
});

test("no more than two requests run together, even with more queued resources", async () => {
  const resolvers = [], pending = new Set(); let peak = 0;
  const h = harness({ entries: [manifest, english(0), english(1), examples, example(52)].map(url => resource(url)),
    fetchImpl: () => new Promise(resolve => {
      const item = {}; pending.add(item); peak = Math.max(peak, pending.size);
      resolvers.push(() => { pending.delete(item); resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }); });
    }) });
  await h.claim(); assert.equal(h.requests.length, 2); assert.equal(pending.size, 2);
  resolvers[0](); await flush(); assert.equal(h.requests.length, 3); assert.equal(pending.size, 2);
  resolvers[1](); await flush(); assert.equal(h.requests.length, 4); assert.equal(pending.size, 2);
  resolvers[2](); await flush(); assert.equal(h.requests.length, 5); assert.equal(pending.size, 2);
  resolvers[3](); resolvers[4](); await flush(); assert.equal(pending.size, 0); assert.equal(peak, 2);
  h.stop();
});

test("an uncooperative hung fetch is aborted at eight seconds and releases its bounded queue slot", async () => {
  const h = harness({ entries: [manifest, english(0), examples].map(url => resource(url)), fetchImpl: () => new Promise(() => {}) });
  await h.claim(); assert.equal(h.requests.length, 2);
  await h.time.advance(7999); assert.equal(h.requests.length, 2);
  await h.time.advance(1); assert.equal(h.requests.length, 3);
  assert.equal(h.requests[0].options.signal.aborted, true); assert.equal(h.requests[1].options.signal.aborted, true);
  h.stop();
});

test("the item deadline covers a stuck response body, not just response headers", async () => {
  const h = harness({ entries: [resource(manifest)], fetchImpl: async () => ({ ok: true, arrayBuffer: () => new Promise(() => {}) }) });
  await h.claim(); await h.time.advance(8000);
  assert.equal(h.requests[0].options.signal.aborted, true); h.stop();
});

test("network rejection, synchronous throw, non-OK status, and body failure are all best-effort", async () => {
  let unusedBodyCancelled = 0;
  const h = harness({ entries: [manifest, examples, english(0), english(1)].map(url => resource(url)),
    fetchImpl: (_url, _options, count) => {
      if (count === 1) throw new Error("network throw");
      if (count === 2) return Promise.reject(new Error("offline"));
      if (count === 3) return Promise.resolve({ ok: false, body: { cancel: async () => { unusedBodyCancelled++; } } });
      return Promise.resolve({ ok: true, arrayBuffer: async () => { throw new Error("broken body"); } });
    } });
  await h.claim(); await flush(); assert.equal(h.requests.length, 4); assert.equal(unusedBodyCancelled, 1);
  h.stop();
});

test("claim wait expires after sixty seconds without leaving observers/listeners or replaying later", async () => {
  const h = harness({ entries: [resource(manifest)] });
  await h.time.advance(60_000);
  assert.equal(h.observers[0].disconnected, true); assert.equal(h.sw.count("controllerchange"), 0);
  assert.equal(h.lifecycle.count("pagehide"), 0); assert.equal(h.time.timers.size, 0);
  h.sw.controller = {}; h.sw.emit("controllerchange"); await flush(); assert.equal(h.requests.length, 0);
});

test("a slow pre-claim lookup finishing twelve seconds later remains inside the bounded observation window", async () => {
  const h = harness({ entries: [resource(manifest)] });
  await h.claim(); await h.time.advance(12_000);
  h.emit([resource(english(20), 900, { responseEnd: 13_000 })]); await flush();
  assert.deepEqual(h.requests.map(item => item.url), [manifest, english(20)]); h.stop();
});

test("late-resource observation stops twenty seconds after claim; later entries cannot expand the queue", async () => {
  const h = harness({ entries: [resource(manifest)] });
  await h.claim(); await h.time.advance(20_000);
  assert.equal(h.observers[0].disconnected, true); assert.equal(h.time.timers.size, 0);
  h.emit([resource(english(20), 900, { responseEnd: 22_000 })]); await flush();
  assert.deepEqual(h.requests.map(item => item.url), [manifest]);
});

test("the total post-claim budget stops thirty seconds in, aborting remaining work and dropping the queue", async () => {
  const h = harness({ entries: Array.from({ length: 20 }, (_, n) => resource(english(n))), fetchImpl: () => new Promise(() => {}) });
  await h.claim(); await h.time.advance(30_000);
  assert.equal(h.requests.length, 8); assert.ok(h.requests.every(item => item.options.signal.aborted));
  assert.equal(h.time.timers.size, 0); assert.equal(h.lifecycle.count("pagehide"), 0);
  await h.time.advance(60_000); assert.equal(h.requests.length, 8);
});

test("pagehide aborts active reads, drops queued reads, disconnects observation, and removes timers/listeners", async () => {
  const resolvers = [];
  const h = harness({ entries: [manifest, english(0), examples, example(52)].map(url => resource(url)),
    fetchImpl: () => new Promise(resolve => resolvers.push(resolve)) });
  await h.claim(); assert.equal(h.requests.length, 2);
  h.lifecycle.emit("pagehide"); await flush(); h.stop();
  assert.ok(h.requests.every(item => item.options.signal.aborted));
  assert.equal(h.observers[0].disconnected, true); assert.equal(h.time.timers.size, 0);
  assert.equal(h.sw.count("controllerchange"), 0); assert.equal(h.lifecycle.count("pagehide"), 0);
  for (const resolve of resolvers) resolve({ ok: true, body: { cancel: async () => {} } });
  await flush(); assert.equal(h.requests.length, 2);
});

for (const mode of ["missing", "constructor-error", "observe-error", "fallback"]) {
  test(`observer ${mode} is fail-soft and snapshots still retain already completed reads`, async () => {
    const h = harness({ entries: [resource(manifest)], observerMode: mode });
    await h.claim(); assert.deepEqual(h.requests.map(item => item.url), [manifest]); h.stop();
  });
}

test("missing browser dependencies or an invalid app base are safe no-ops", () => {
  const stop = installDictionaryOfflineWarm({ serviceWorker: null }); assert.equal(typeof stop, "function"); stop();
  const sw = new Events(), lifecycle = new Events(); sw.controller = null;
  const cleanup = installDictionaryOfflineWarm({ baseUrl: "bad", serviceWorker: sw, lifecycle }); cleanup();
  assert.equal(sw.count("controllerchange"), 0); assert.equal(lifecycle.count("pagehide"), 0);
});

test("AbortController construction failure cannot hold the queue or throw into the page", async () => {
  class BrokenController { constructor() { throw new Error("unavailable"); } }
  const h = harness({ entries: [resource(manifest), resource(examples)], AbortControllerImpl: BrokenController });
  await h.claim(); assert.equal(h.requests.length, 0); h.stop();
});
