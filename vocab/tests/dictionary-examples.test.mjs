import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DICTIONARY_EXAMPLE_SOURCE, dictionaryExampleBucket, parseDictionaryExamplesManifest, parseDictionaryExamplesShard,
  loadDictionaryExamples, createDictionaryExamplesController, resetDictionaryExamplesCacheForTests } from "../js/dictionary-examples.js";

const sha = value => createHash("sha256").update(value).digest("hex");
const entry = (term = "abacus") => ({ term, senses: [{ id: `zhuo:${term}:noun:1`, partOfSpeech: "noun", meaningZh: "用于计算的算盘",
  examples: [{ en: `The child moved a bead on the ${term}.`, zh: "孩子移动了算盘上的一颗珠子。" }],
  source: DICTIONARY_EXAMPLE_SOURCE, reviewer: "AI/independent-reviewer" }] });
function fixture(entries = [entry()]) {
  const version = sha(JSON.stringify(entries)), files = new Map(), keys = Object.create(null);
  entries.forEach(item => { keys[item.term] = 0; });
  const shards = Array.from({ length: 16 }, (_, bucket) => {
    const file = `${version}/examples-${String(bucket).padStart(2, "0")}.json`;
    const body = JSON.stringify({ schemaVersion: 1, bucket, entries: bucket === 0 ? entries : [] });
    files.set(file, body); return { bucket, file, bytes: Buffer.byteLength(body), sha256: sha(body) };
  });
  const manifest = { schemaVersion: 1, version, counts: { heads: entries.length,
    examples: entries.reduce((total, item) => total + item.senses.reduce((count, sense) => count + sense.examples.length, 0), 0) }, shards, keys };
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options }); const path = new URL(url).pathname.split("/dictionary-examples/")[1];
    return path === "manifest-v2.json" ? new Response(JSON.stringify(manifest))
      : files.has(path) ? new Response(files.get(path)) : new Response("missing", { status: 404 });
  };
  return { manifest, files, requests, fetchImpl };
}
function modernFixture(entries = [entry()]) {
  const version = sha(`v2:${JSON.stringify(entries)}`), files = new Map(), requests = [];
  const shards = Array.from({ length: 256 }, (_, bucket) => {
    const subset = entries.filter(row => dictionaryExampleBucket(row.term) === bucket);
    const file = `${version}/examples-${bucket}.json`;
    const body = JSON.stringify({ schemaVersion: 2, bucket, entries: subset });
    files.set(file, body);
    return { bucket, file, bytes: Buffer.byteLength(body), sha256: sha(body), heads: subset.length,
      examples: subset.reduce((n, row) => n + row.senses.reduce((sum, sense) => sum + sense.examples.length, 0), 0) };
  });
  const manifest = { schemaVersion: 2, version, counts: { heads: entries.length, examples: entries.length },
    bucketCount: 256, hash: "fnv1a-codepoints-v1", shards };
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const path = new URL(url).pathname.split("/dictionary-examples/")[1];
    return path === "manifest-v2.json" ? new Response(JSON.stringify(manifest))
      : files.has(path) ? new Response(files.get(path)) : new Response("missing", { status: 404 });
  };
  return { manifest, files, requests, fetchImpl };
}
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
afterEach(() => resetDictionaryExamplesCacheForTests());

test("v2 directory uses 256 strict counted shards without a full term index", () => {
  const { manifest } = modernFixture();
  assert.equal(parseDictionaryExamplesManifest(manifest).bucketCount, 256);
  assert.equal(Object.hasOwn(manifest, "keys"), false);
  for (const mutate of [value => value.bucketCount = 16, value => value.hash = "other",
    value => value.shards.pop(), value => value.counts.heads++, value => value.shards[0].heads++,
    value => value.shards[dictionaryExampleBucket("abacus")].examples++, value => value.keys = { abacus: 1 }]) {
    const broken = clone(manifest); mutate(broken); assert.throws(() => parseDictionaryExamplesManifest(broken));
  }
});

test("v2 lookup downloads only its deterministic bucket, caches it, and keeps unknown and prototype-like terms safe", async () => {
  const data = modernFixture([entry(), entry("constructor")]);
  assert.equal((await loadDictionaryExamples("abacus", { fetchImpl: data.fetchImpl })).term, "abacus");
  assert.equal(data.requests.length, 2);
  assert.equal((await loadDictionaryExamples("abacus", { fetchImpl: data.fetchImpl })).term, "abacus");
  assert.equal(data.requests.length, 2);
  assert.equal((await loadDictionaryExamples("constructor", { fetchImpl: data.fetchImpl })).term, "constructor");
  assert.equal(await loadDictionaryExamples("toString", { fetchImpl: data.fetchImpl }), null);
  assert.ok(data.requests.length <= 4);
  for (const request of data.requests) {
    assert.equal(request.options.credentials, "omit");
    assert.equal(new URL(request.url).search, "");
    assert.doesNotMatch(request.url, /abacus|constructor|toString|\/api\//u);
  }
});

test("v2 mutable directory refreshes after 60 seconds and switches to the new immutable example version", async context => {
  let now = 1000;
  context.mock.method(Date, "now", () => now);
  const old = modernFixture(), changed = entry();
  changed.senses[0].examples[0] = { en: "The child checked each sum on the abacus.", zh: "孩子用算盘核对了每道加法题。" };
  const updated = modernFixture([changed]);
  let active = old;
  const fetchImpl = (url, options) => active.fetchImpl(url, options);
  assert.deepEqual(await loadDictionaryExamples("abacus", { fetchImpl }), entry());
  active = updated; now = 61000;
  assert.deepEqual(await loadDictionaryExamples("abacus", { fetchImpl }), entry());
  assert.equal(updated.requests.length, 0);
  now = 61001;
  assert.deepEqual(await loadDictionaryExamples("abacus", { fetchImpl }), changed);
  assert.equal(updated.requests.length, 2);
});

test("v2 example memory cache evicts the least recently used bucket after four buckets", async () => {
  const entries = [], buckets = new Set();
  for (let i = 0; entries.length < 5; i++) {
    const row = entry(`fixture-${i}`), bucket = dictionaryExampleBucket(row.term);
    if (!buckets.has(bucket)) { entries.push(row); buckets.add(bucket); }
  }
  const data = modernFixture(entries);
  for (const row of entries) assert.deepEqual(await loadDictionaryExamples(row.term, { fetchImpl: data.fetchImpl }), row);
  assert.equal(data.requests.length, 6);
  await loadDictionaryExamples(entries[4].term, { fetchImpl: data.fetchImpl });
  assert.equal(data.requests.length, 6);
  await loadDictionaryExamples(entries[0].term, { fetchImpl: data.fetchImpl });
  assert.equal(data.requests.length, 7);
});

test("v2 shard rejects incorrect routing and exact per-bucket counts", () => {
  const data = modernFixture(), parsed = parseDictionaryExamplesManifest(data.manifest);
  const descriptor = parsed.shards[dictionaryExampleBucket("abacus")];
  const source = JSON.parse(data.files.get(descriptor.file));
  for (const mutate of [value => value.entries = [], value => value.entries.push(clone(value.entries[0])),
    value => value.entries[0].term = "misrouted-word", value => value.entries[0].senses[0].examples.push({ en: "A second fixture sentence tests exact counts.", zh: "第二句测试精确计数。" })]) {
    const broken = clone(source); mutate(broken); assert.throws(() => parseDictionaryExamplesShard(broken, parsed, descriptor));
  }
});

test("frozen legacy assets remain usable by the compatible strict parser", async () => {
  const base = new URL("../data/dictionary-examples/", import.meta.url);
  const manifest = parseDictionaryExamplesManifest(JSON.parse(await readFile(new URL("manifest.json", base), "utf8")));
  assert.equal(manifest.schemaVersion, 1);
  let heads = 0;
  for (const descriptor of manifest.shards) {
    const bytes = await readFile(new URL(descriptor.file, base));
    assert.equal(bytes.byteLength, descriptor.bytes); assert.equal(sha(bytes), descriptor.sha256);
    heads += parseDictionaryExamplesShard(JSON.parse(bytes), manifest, descriptor).size;
  }
  assert.equal(heads, manifest.counts.heads);
});

test("manifest validates exact counts, 16 bounded first-party descriptors and strict fields", () => {
  const { manifest } = fixture();
  assert.equal(parseDictionaryExamplesManifest(manifest).keys.abacus, 0);
  for (const mutate of [
    value => { value.counts.heads++; }, value => { value.counts.examples = 0; },
    value => { value.shards.pop(); }, value => { value.shards[0].bytes = 1024 * 1024 + 1; },
    value => { value.shards[0].file = "../private.json"; }, value => { value.shards[0].file += "?word=abacus"; },
    value => { value.shards[0].sha256 = "wrong"; }, value => { value.cookie = "not-permitted"; },
    value => { value.keys.abacus = 16; }, value => { value.keys["中文"] = 0; value.counts.heads++; value.counts.examples++; }
  ]) { const broken = clone(manifest); mutate(broken); assert.throws(() => parseDictionaryExamplesManifest(broken), /例句数据/); }
});

test("prototype-like English headwords are exact own keys, never inherited matches", async () => {
  const data = fixture([entry("constructor")]);
  const result = await loadDictionaryExamples("constructor", { fetchImpl: data.fetchImpl });
  assert.equal(result.term, "constructor");
  assert.equal(await loadDictionaryExamples("toString", { fetchImpl: data.fetchImpl }), null);
  assert.equal(data.requests.length, 2);
});

test("shards require sense-specific Chinese, bilingual examples, AI provenance and complete mapped entries", () => {
  const { manifest, files } = fixture(), parsed = parseDictionaryExamplesManifest(manifest);
  const original = JSON.parse(files.get(manifest.shards[0].file));
  assert.equal(parseDictionaryExamplesShard(original, parsed, parsed.shards[0]).get("abacus").senses[0].source, DICTIONARY_EXAMPLE_SOURCE);
  for (const mutate of [
    value => { value.entries[0].senses[0].reviewer = "human-approved"; },
    value => { value.entries[0].senses[0].source = "ECDICT"; },
    value => { value.entries[0].senses[0].meaningZh = "not Chinese"; },
    value => { value.entries[0].senses[0].examples[0].zh = "translation missing"; },
    value => { value.entries[0].senses[0].examples[0].en = "word".repeat(301); },
    value => { value.entries[0].senses[0].examples[0].token = "never shipped"; },
    value => { value.entries[0].senses.push(clone(value.entries[0].senses[0])); },
    value => { value.entries = []; }, value => { value.bucket = 1; }
  ]) { const broken = clone(original); mutate(broken); assert.throws(() => parseDictionaryExamplesShard(broken, parsed, parsed.shards[0])); }
});

test("cold example lookup fetches only a public manifest and one verified shard without cookies or query parameters", async () => {
  const data = fixture(); const result = await loadDictionaryExamples("abacus", { fetchImpl: data.fetchImpl });
  assert.deepEqual(result, entry()); assert.ok(Object.isFrozen(result.senses[0].examples[0]));
  assert.equal(data.requests.length, 2);
  for (const { url, options } of data.requests) {
    assert.match(new URL(url).pathname, /\/data\/dictionary-examples\//);
    assert.equal(new URL(url).search, ""); assert.equal(options.credentials, "omit");
    assert.equal(options.method, undefined); assert.equal(options.body, undefined);
    assert.doesNotMatch(url, /\/api\/|openai|anthropic|abacus/);
  }
  assert.equal((await loadDictionaryExamples("abacus", { fetchImpl: data.fetchImpl })).term, "abacus");
  assert.equal(data.requests.length, 2);
});

test("the fetch dependency is invoked as a function, not bound to an internal client object", async () => {
  const data = fixture();
  async function fetchImpl(url, options) { assert.equal(this, undefined); return data.fetchImpl(url, options); }
  assert.equal((await loadDictionaryExamples("abacus", { fetchImpl })).term, "abacus");
});

test("unknown or differently capitalized term returns no example rather than guessing another source/sense", async () => {
  const data = fixture();
  assert.equal(await loadDictionaryExamples("Abacus", { fetchImpl: data.fetchImpl }), null);
  assert.equal(data.requests.length, 1);
  assert.equal(await loadDictionaryExamples("24/7", { fetchImpl: data.fetchImpl }), null);
  await assert.rejects(loadDictionaryExamples("中文", { fetchImpl: data.fetchImpl }));
  await assert.rejects(loadDictionaryExamples("123", { fetchImpl: data.fetchImpl }));
  assert.equal(data.requests.length, 1);
});

test("manifest failure is not cached as a permanent absence and retry can recover", async () => {
  const data = fixture(); let failed = false;
  const fetchImpl = (url, options) => {
    if (!failed) { failed = true; return Promise.resolve(new Response("offline", { status: 503 })); }
    return data.fetchImpl(url, options);
  };
  await assert.rejects(loadDictionaryExamples("abacus", { fetchImpl }));
  assert.equal((await loadDictionaryExamples("abacus", { fetchImpl })).term, "abacus");
});

test("corrupt shard fails closed; a local retry bypasses its cached response without failing primary lookup", async () => {
  const data = fixture(); let corrupted = false; const attempts = [];
  const fetchImpl = async (url, options) => {
    if (!url.endsWith("manifest-v2.json")) {
      attempts.push(options.cache);
      if (!corrupted) { corrupted = true; return new Response("{} "); }
    }
    return data.fetchImpl(url, options);
  };
  await assert.rejects(loadDictionaryExamples("abacus", { fetchImpl }), /例句数据/);
  assert.equal((await loadDictionaryExamples("abacus", { fetchImpl })).term, "abacus");
  assert.deepEqual(attempts, ["no-cache", "reload"]);
});

test("body is bounded even without a Content-Length declaration", async () => {
  const fetchImpl = async () => new Response(" ".repeat(512 * 1024 + 1));
  await assert.rejects(loadDictionaryExamples("abacus", { fetchImpl }), /例句数据/);
});

test("concurrent callers share a public download and one abort does not abort the other's result", async () => {
  const data = fixture(), gate = deferred(), seen = deferred();
  const fetchImpl = async (url, options) => {
    if (!url.endsWith("manifest-v2.json")) { seen.resolve(); await gate.promise; }
    return data.fetchImpl(url, options);
  };
  const controller = new AbortController();
  const first = loadDictionaryExamples("abacus", { fetchImpl, signal: controller.signal });
  const rejected = assert.rejects(first, { name: "AbortError" });
  const second = loadDictionaryExamples("abacus", { fetchImpl });
  await seen.promise; controller.abort(); await rejected; gate.resolve();
  assert.equal((await second).term, "abacus"); assert.equal(data.requests.length, 2);
});

test("a per-caller deadline applies even while another caller's shared download is already pending", async () => {
  const data = fixture(), gate = deferred(), seen = deferred();
  const fetchImpl = async (url, options) => { if (url.endsWith("manifest-v2.json")) { seen.resolve(); await gate.promise; } return data.fetchImpl(url, options); };
  const first = loadDictionaryExamples("abacus", { fetchImpl });
  await seen.promise;
  await assert.rejects(loadDictionaryExamples("abacus", { fetchImpl, timeoutMs: 5 }), { code: "dictionary_examples_timeout" });
  gate.resolve(); assert.equal((await first).term, "abacus");
});

test("leaving or timing out before the manifest arrives does not start a new optional shard", async () => {
  for (const cancel of ["abort", "timeout"]) {
    const data = fixture(), gate = deferred(), seen = deferred(), controller = new AbortController();
    const fetchImpl = async (url, options) => { seen.resolve(); await gate.promise; return data.fetchImpl(url, options); };
    const task = loadDictionaryExamples("abacus", { fetchImpl, signal: controller.signal, timeoutMs: cancel === "timeout" ? 5 : 5000 });
    const rejected = assert.rejects(task, cancel === "abort" ? { name: "AbortError" } : { code: "dictionary_examples_timeout" });
    await seen.promise; if (cancel === "abort") controller.abort(); await rejected;
    gate.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(data.requests.length, 1); assert.ok(data.requests[0].url.endsWith("manifest-v2.json"));
  }
});

test("controller clears previous material immediately and ignores a late abort-ignoring response", async () => {
  const old = deferred(), current = deferred(), states = [];
  const controller = createDictionaryExamplesController({ load: term => term === "abacus" ? old.promise : current.promise, onChange: state => states.push(state) });
  const first = controller.show("abacus"), second = controller.show("override");
  current.resolve(entry("override")); await second; old.resolve(entry()); await first;
  assert.equal(controller.getState().term, "override"); assert.equal(controller.getState().entry.term, "override");
  controller.clear(); assert.equal(controller.getState().phase, "idle"); assert.equal(controller.getState().entry, null);
  assert.ok(states.filter(state => state.phase === "loading").every(state => state.entry === null));
});

test("controller errors are local, retryable, and missing examples hide rather than make a false claim", async () => {
  let calls = 0;
  const controller = createDictionaryExamplesController({ load: async () => { if (++calls === 1) throw new Error("offline"); return entry(); } });
  assert.equal(await controller.show("abacus"), false); assert.equal(controller.getState().phase, "error");
  assert.match(controller.getState().message, /词义查询不受影响/);
  assert.equal(await controller.retry(), true); assert.equal(controller.getState().phase, "ready");
  const empty = createDictionaryExamplesController({ load: async () => null });
  await empty.show("abacus"); assert.equal(empty.getState().phase, "missing"); assert.equal(empty.getState().message, "");
});

test("clear prevents a pending result from repopulating a changed input or logged-out view", async () => {
  const pending = deferred(), controller = createDictionaryExamplesController({ load: () => pending.promise });
  const task = controller.show("abacus"); controller.clear(); pending.resolve(entry()); await task;
  assert.deepEqual(controller.getState(), { phase: "idle", term: "", entry: null, message: "" });
});

test("all shipped example shards verify byte/hash limits, strict sense provenance, and catalogue counts", async () => {
  const base = new URL("../data/dictionary-examples/", import.meta.url);
  const raw = await readFile(new URL("manifest-v2.json", base));
  assert.ok(raw.byteLength <= 512 * 1024);
  const manifest = parseDictionaryExamplesManifest(JSON.parse(raw.toString("utf8")));
  let heads = 0, examples = 0;
  for (const descriptor of manifest.shards) {
    const bytes = await readFile(new URL(descriptor.file, base));
    assert.equal(bytes.byteLength, descriptor.bytes); assert.equal(sha(bytes), descriptor.sha256);
    const entries = parseDictionaryExamplesShard(JSON.parse(bytes.toString("utf8")), manifest, descriptor);
    heads += entries.size;
    for (const row of entries.values()) for (const sense of row.senses) examples += sense.examples.length;
  }
  assert.equal(heads, manifest.counts.heads); assert.equal(examples, manifest.counts.examples);
});
