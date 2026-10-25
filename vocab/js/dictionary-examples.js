// Optional, independently versioned learning material. This module is loaded
// after the primary meaning; it never contacts a member API or an AI provider.
const MANIFEST_URL = new URL("../data/dictionary-examples/manifest-v2.json", import.meta.url);
const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_SHARD_BYTES = 1024 * 1024;
// Match the bounded expanded-dictionary catalogue, which already exceeds 100k.
const MAX_HEADS = 200_000;
const HASH = /^[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const BODY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const HAN = /\p{Script=Han}/u;
export const DICTIONARY_EXAMPLE_SOURCE = "原创例句·AI复核（精选义项）";
export const DICTIONARY_EXAMPLE_SELF_CHECK_SOURCE = "原创例句·作者自查（精选义项）";
let clients = new WeakMap();
const active = new Set();

function invalid() {
  const error = new Error("例句数据暂不可用。"); error.code = "invalid_dictionary_examples"; return error;
}
function aborted() { const error = new Error("已停止读取例句。"); error.name = "AbortError"; return error; }
function timeout() { const error = new Error("读取例句超时。"); error.code = "dictionary_examples_timeout"; return error; }
function object(value, required) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key))) throw invalid();
}
function text(value, max, { chinese = false, english = false, multiline = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > max
    || (multiline ? BODY_CONTROL : CONTROL).test(value)
    || (chinese && !HAN.test(value)) || (english && !/\p{Script=Latin}/u.test(value))) throw invalid();
  return value;
}
function lexical(value) {
  text(value, 200, { english: value !== "24/7" });
  if (HAN.test(value) || /[<>]|javascript\s*:/iu.test(value)) throw invalid();
  return value;
}
function integer(value, max) { if (!Number.isSafeInteger(value) || value < 0 || value > max) throw invalid(); }
function array(value, max, min = 0) { if (!Array.isArray(value) || value.length < min || value.length > max) throw invalid(); return value; }

export function parseDictionaryExamplesManifest(payload) {
  const modern = payload?.schemaVersion === 2;
  object(payload, modern ? ["schemaVersion", "version", "counts", "shards", "bucketCount", "hash"]
    : ["schemaVersion", "version", "counts", "shards", "keys"]);
  if (![1, 2].includes(payload.schemaVersion) || !HASH.test(payload.version)
    || modern && (payload.bucketCount !== 256 || payload.hash !== "fnv1a-codepoints-v1")) throw invalid();
  object(payload.counts, ["heads", "examples"]);
  integer(payload.counts.heads, MAX_HEADS); integer(payload.counts.examples, 400_000);
  if ((payload.counts.heads === 0) !== (payload.counts.examples === 0)
    || payload.counts.examples < payload.counts.heads) throw invalid();
  const bucketCount = modern ? 256 : 16;
  let totalHeads = 0, totalExamples = 0;
  const shards = array(payload.shards, bucketCount, bucketCount).map((item, index) => {
    object(item, modern ? ["bucket", "file", "bytes", "sha256", "heads", "examples"] : ["bucket", "file", "bytes", "sha256"]);
    if (item.bucket !== index || typeof item.file !== "string"
      || !new RegExp(`^${payload.version}/[a-z0-9-]+\\.json$`, "u").test(item.file)
      || !HASH.test(item.sha256)) throw invalid();
    integer(item.bytes, MAX_SHARD_BYTES);
    if (item.bytes === 0) throw invalid();
    if (modern) {
      integer(item.heads, MAX_HEADS); integer(item.examples, 400_000);
      if ((item.heads === 0) !== (item.examples === 0) || item.examples < item.heads) throw invalid();
      totalHeads += item.heads; totalExamples += item.examples;
    }
    return Object.freeze({ ...item });
  });
  if (modern) {
    if (totalHeads !== payload.counts.heads || totalExamples !== payload.counts.examples) throw invalid();
    return Object.freeze({ schemaVersion: 2, version: payload.version, counts: Object.freeze({ ...payload.counts }),
      bucketCount, hash: payload.hash, shards: Object.freeze(shards) });
  }
  if (!payload.keys || typeof payload.keys !== "object" || Array.isArray(payload.keys)
    || Object.keys(payload.keys).length !== payload.counts.heads) throw invalid();
  const keys = Object.create(null);
  for (const [term, bucket] of Object.entries(payload.keys)) { lexical(term); integer(bucket, 15); keys[term] = bucket; }
  return Object.freeze({ schemaVersion: 1, version: payload.version, counts: Object.freeze({ ...payload.counts }),
    shards: Object.freeze(shards), keys: Object.freeze(keys) });
}

export function dictionaryExampleBucket(term) {
  lexical(term);
  let hash = 2166136261;
  for (const ch of term) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 256;
}

export function parseDictionaryExamplesShard(payload, manifest, descriptor) {
  object(payload, ["schemaVersion", "bucket", "entries"]);
  if (payload.schemaVersion !== manifest.schemaVersion || payload.bucket !== descriptor.bucket) throw invalid();
  const entries = new Map();
  let total = 0;
  for (const row of array(payload.entries, manifest.schemaVersion === 2 ? descriptor.heads : manifest.counts.heads,
    manifest.schemaVersion === 2 ? descriptor.heads : 0)) {
    object(row, ["term", "senses"]); lexical(row.term);
    if (entries.has(row.term) || (manifest.schemaVersion === 2
      ? dictionaryExampleBucket(row.term) !== descriptor.bucket
      : !Object.hasOwn(manifest.keys, row.term) || manifest.keys[row.term] !== descriptor.bucket)) throw invalid();
    const senseIds = new Set();
    const senses = array(row.senses, 24, 1).map(sense => {
      object(sense, ["id", "partOfSpeech", "meaningZh", "examples", "source", "reviewer"]);
      text(sense.id, 120);
      if (!/^[a-zA-Z0-9:_-]+$/u.test(sense.id) || senseIds.has(sense.id)) throw invalid();
      senseIds.add(sense.id);
      text(sense.partOfSpeech, 80, { english: true }); text(sense.meaningZh, 2000, { chinese: true, multiline: true });
      if (![DICTIONARY_EXAMPLE_SOURCE, DICTIONARY_EXAMPLE_SELF_CHECK_SOURCE].includes(sense.source) || !/^AI\/[a-zA-Z0-9_-]{1,100}$/u.test(sense.reviewer)) throw invalid();
      const examples = array(sense.examples, 8, 1).map(example => {
        object(example, ["en", "zh"]);
        text(example.en, 1200, { english: true, multiline: true }); text(example.zh, 1200, { chinese: true, multiline: true });
        total++; return Object.freeze({ ...example });
      });
      return Object.freeze({ ...sense, examples: Object.freeze(examples) });
    });
    entries.set(row.term, Object.freeze({ term: row.term, senses: Object.freeze(senses) }));
  }
  const expected = manifest.schemaVersion === 2 ? descriptor.heads
    : Object.entries(manifest.keys).filter(([, bucket]) => bucket === descriptor.bucket).length;
  if (entries.size !== expected || total > manifest.counts.examples
    || manifest.schemaVersion === 2 && total !== descriptor.examples) throw invalid();
  return entries;
}

// Each caller has its own deadline/abort. Cancelling a UI request must not
// poison the same immutable public download shared by a second open view.
function bounded(promise, signal, milliseconds) {
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, timeout()), milliseconds);
    function stop() { finish(reject, aborted()); }
    function finish(callback, value) { clearTimeout(timer); signal?.removeEventListener("abort", stop); callback(value); }
    signal?.addEventListener("abort", stop, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}
async function readBytes(response, maximum, signal) {
  if (!response.ok) throw invalid();
  const declared = response.headers?.get("content-length");
  if (declared !== null && declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > maximum)) throw invalid();
  if (!response.body?.getReader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maximum) throw invalid(); return buffer;
  }
  const reader = response.body.getReader(), chunks = [];
  let length = 0, complete = false;
  const cancelReader = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw aborted();
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      length += value.byteLength;
      if (length > maximum) throw invalid(); chunks.push(value);
    }
  } finally { signal.removeEventListener("abort", cancelReader); if (!complete) cancelReader(); reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  chunks.forEach(chunk => { result.set(chunk, offset); offset += chunk.byteLength; }); return result;
}
function decode(bytes) { try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw invalid(); } }
async function download(client, url, maximum, reload) {
  const controller = new AbortController(); active.add(controller);
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await bounded((async () => {
      // A browser's native fetch must not receive our cache-client as `this`.
      const fetchImpl = client.fetch;
      const response = await fetchImpl(url.href, { credentials: "omit", cache: reload ? "reload" : "no-cache", signal: controller.signal });
      return readBytes(response, maximum, controller.signal);
    })(), controller.signal, 5000);
  } finally { clearTimeout(timer); active.delete(controller); }
}
function getClient(fetchImpl) {
  if (typeof fetchImpl !== "function") throw invalid();
  let client = clients.get(fetchImpl);
  if (!client) {
    client = { fetch: fetchImpl, manifest: null, manifestAt: 0, shards: new Map(), failed: new Set() };
    clients.set(fetchImpl, client);
  }
  return client;
}
function manifestFor(client) {
  if (client.manifest && Date.now() - client.manifestAt <= 60_000) return client.manifest;
  const pending = download(client, MANIFEST_URL, MAX_MANIFEST_BYTES, true).then(bytes => parseDictionaryExamplesManifest(decode(bytes)));
  client.manifest = pending; client.manifestAt = Date.now();
  pending.catch(() => { if (client.manifest === pending) client.manifest = null; }); return pending;
}
function shardFor(client, manifest, descriptor) {
  const key = `${manifest.version}:${descriptor.sha256}`;
  if (client.shards.has(key)) {
    const value = client.shards.get(key); client.shards.delete(key); client.shards.set(key, value); return value;
  }
  const pending = (async () => {
    const bytes = await download(client, new URL(descriptor.file, MANIFEST_URL), MAX_SHARD_BYTES, client.failed.has(key));
    const digest = [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== descriptor.bytes || digest !== descriptor.sha256) throw invalid();
    return parseDictionaryExamplesShard(decode(bytes), manifest, descriptor);
  })();
  client.shards.set(key, pending);
  while (client.shards.size > 4) client.shards.delete(client.shards.keys().next().value);
  pending.catch(() => { client.failed.add(key); if (client.shards.get(key) === pending) client.shards.delete(key); });
  return pending;
}

export async function loadDictionaryExamples(term, { signal, fetchImpl = globalThis.fetch, timeoutMs = 5500 } = {}) {
  lexical(term);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw invalid();
  if (signal?.aborted) throw aborted();
  const client = getClient(fetchImpl);
  let waiting = true;
  try {
    return await bounded((async () => {
      const manifest = await manifestFor(client);
      // A cancelled/expired caller may share the manifest, but must not start a
      // new optional shard once that caller has already left the view.
      if (!waiting || signal?.aborted) throw aborted();
      if (manifest.schemaVersion === 1 && !Object.hasOwn(manifest.keys, term)) return null;
      const descriptor = manifest.shards[manifest.schemaVersion === 2 ? dictionaryExampleBucket(term) : manifest.keys[term]];
      if (manifest.schemaVersion === 2 && descriptor.heads === 0) return null;
      const entries = await shardFor(client, manifest, descriptor);
      return entries.get(term) || null;
    })(), signal, timeoutMs);
  } finally { waiting = false; }
}

export function createDictionaryExamplesController({ load = loadDictionaryExamples, onChange = () => {} } = {}) {
  let sequence = 0, pending = null;
  let state = { phase: "idle", term: "", entry: null, message: "" };
  function publish(next) { state = { ...state, ...next }; onChange(state); }
  function clear() {
    sequence++; pending?.abort(); pending = null;
    publish({ phase: "idle", term: "", entry: null, message: "" });
  }
  async function show(term) {
    clear(); const current = sequence, controller = new AbortController(); pending = controller;
    publish({ phase: "loading", term, entry: null, message: "正在读取学习例句…" });
    try {
      const entry = await load(term, { signal: controller.signal });
      if (current !== sequence || controller.signal.aborted) return false;
      publish({ phase: entry ? "ready" : "missing", entry, message: "" }); return true;
    } catch (error) {
      if (current !== sequence || controller.signal.aborted) return false;
      publish({ phase: "error", entry: null, message: "例句暂不可用，词义查询不受影响。" }); return false;
    } finally { if (current === sequence) pending = null; }
  }
  return { show, clear, retry: () => state.term ? show(state.term) : Promise.resolve(false), getState: () => state };
}

export function resetDictionaryExamplesCacheForTests() {
  active.forEach(controller => controller.abort()); active.clear(); clients = new WeakMap();
}
