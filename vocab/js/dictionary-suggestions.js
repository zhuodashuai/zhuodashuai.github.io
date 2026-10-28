// Optional, first-party spelling candidates. Never definitions or automatic
// corrections. Edit operations follow the standard insertion/deletion/
// substitution/adjacent-transposition model; no probability is claimed.
// Background: https://norvig.com/spell-correct.html
const MANIFEST_URL = new URL("../data/dictionary-suggestions/manifest.json", import.meta.url);
const HASH = /^[a-f0-9]{64}$/u;
const WORD = /^[a-z]+(?:[ '-][a-z]+)*$/u;
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const MAX_BYTES = 1024 * 1024;
// Shared public downloads have their own finite lifetime. A caller's shorter
// wait budget must not cancel another caller using the same authenticated data.
const TRANSPORT_TIMEOUT_MS = 15_000;
const TTL = 60_000;
let clients = new WeakMap();
const controllers = new Set();
let generation = 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const fold = value => value.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().toLowerCase();
function invalid() { return Object.assign(new Error("拼写建议索引校验失败。"), { code: "invalid_dictionary_suggestions" }); }
function stopped() { return Object.assign(new Error("拼写建议已停止。"), { name: "AbortError" }); }
function timeout() { return Object.assign(new Error("拼写建议读取超时。"), { code: "dictionary_suggestions_timeout" }); }
function keys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== expected.length
    || expected.some(key => !Object.hasOwn(value, key))) throw invalid();
}
function integer(value, maximum) { if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw invalid(); }

export function normalizeSuggestionQuery(input) {
  if (typeof input !== "string" || input.length > 200 || CONTROL.test(input)) return "";
  const value = fold(input).replace(/^["']+|["',.!?;:，。！？；：]+$/gu, "").trim();
  return value.length >= 3 && value.length <= 64 && WORD.test(value)
    && value.replace(/[^a-z]/gu, "").length >= 3 && value.split(" ").length <= 8 ? value : "";
}

/** Banded optimal-string-alignment distance; a neighbouring swap is one edit. */
export function boundedSpellingDistance(a, b, maximum = 2) {
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > 2) throw new Error("Invalid edit budget.");
  const over = maximum + 1;
  if (Math.abs(a.length - b.length) > maximum) return over;
  if (a === b) return 0;
  let previousPrevious = null, previous = Array.from({ length: b.length + 1 }, (_, index) => Math.min(index, over));
  for (let i = 1; i <= a.length; i++) {
    const current = new Array(b.length + 1).fill(over); current[0] = Math.min(i, over);
    let minimum = current[0];
    for (let j = Math.max(1, i - maximum); j <= Math.min(b.length, i + maximum); j++) {
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, previousPrevious[j - 2] + 1);
      current[j] = Math.min(value, over); minimum = Math.min(minimum, value);
    }
    if (minimum > maximum) return over;
    previousPrevious = previous; previous = current;
  }
  return Math.min(previous[b.length], over);
}

function swapped(a, b) {
  if (a.length !== b.length) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return i < a.length - 1 && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}
function score(query, row, maximum) {
  const [term, tier] = row, key = fold(term), distance = boundedSpellingDistance(query, key, maximum);
  if (!distance || distance > maximum) return null;
  let prefix = 0; while (prefix < Math.min(query.length, key.length) && query[prefix] === key[prefix]) prefix++;
  return { term, distance, tier, swap: swapped(query, key) ? 0 : 1, prefix, key };
}
function ordered(rows, limit) {
  return rows.sort((a, b) => a.distance - b.distance || a.tier - b.tier || a.swap - b.swap
    || b.prefix - a.prefix || compare(a.key, b.key) || compare(a.term, b.term)).slice(0, limit)
    .map(({ term, distance }) => ({ term, distance }));
}

/** Pure ranking helper: source priority is editorial tier, NOT word frequency. */
export function rankSpellingSuggestions(input, rows, { limit = 5 } = {}) {
  const query = normalizeSuggestionQuery(input); if (!query) return [];
  if (rows.some(([term]) => fold(term) === query)) return [];
  const maximum = query.length >= 6 ? 2 : 1;
  return ordered(rows.map(row => score(query, row, maximum)).filter(Boolean), Math.max(1, Math.min(5, limit)));
}

export function parseSuggestionManifest(value, dictionaryVersion) {
  keys(value, ["schemaVersion", "dictionaryVersion", "version", "counts", "minLength", "maxLength", "shards"]);
  if (value.schemaVersion !== 1 || !HASH.test(value.version) || !HASH.test(dictionaryVersion)
    || value.dictionaryVersion !== dictionaryVersion || value.minLength !== 2 || value.maxLength !== 64) throw invalid();
  keys(value.counts, ["canonicalHeads", "eligibleHeads", "excludedHeads"]);
  Object.values(value.counts).forEach(count => integer(count, 200_000));
  if (value.counts.eligibleHeads + value.counts.excludedHeads !== value.counts.canonicalHeads
    || !Array.isArray(value.shards) || value.shards.length !== 63) throw invalid();
  let total = 0, bytes = 0;
  value.shards.forEach((shard, index) => {
    keys(shard, ["length", "file", "sha256", "bytes", "count"]);
    if (shard.length !== index + 2 || shard.file !== `${value.version}/length-${String(shard.length).padStart(2, "0")}.json`
      || !HASH.test(shard.sha256)) throw invalid();
    integer(shard.bytes, MAX_BYTES); integer(shard.count, 200_000); total += shard.count; bytes += shard.bytes;
  });
  if (total !== value.counts.eligibleHeads || bytes > 8 * MAX_BYTES) throw invalid();
  return value;
}
export function parseSuggestionShard(value, descriptor) {
  keys(value, ["schemaVersion", "length", "rows"]);
  if (value.schemaVersion !== 1 || value.length !== descriptor.length || !Array.isArray(value.rows)
    || value.rows.length !== descriptor.count) throw invalid();
  let previousKey = "", previousTerm = "";
  for (const row of value.rows) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string" || row[0].length > 200
      || CONTROL.test(row[0]) || ![0, 1, 2].includes(row[1])) throw invalid();
    const key = fold(row[0]);
    if (!WORD.test(key) || key.length !== descriptor.length || compare(key, previousKey) < 0
      || key === previousKey && compare(row[0], previousTerm) <= 0) throw invalid();
    previousKey = key; previousTerm = row[0];
  }
  return value.rows;
}

async function readJSON(url, fetchImpl, timeoutMs, descriptor, reload = false) {
  const controller = new AbortController(); controllers.add(controller); let timer, abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(stopped()); controller.signal.addEventListener("abort", abort, { once: true });
  });
  const task = (async () => {
    const response = await fetchImpl(url, { credentials: "omit", cache: descriptor ? (reload ? "reload" : "force-cache") : "no-cache", signal: controller.signal });
    if (!response?.ok) throw new Error("拼写建议暂时不可用。");
    const maximum = descriptor?.bytes ?? 64 * 1024;
    if (Number(response.headers?.get?.("content-length")) > maximum) throw invalid();
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          const item = await reader.read(); if (item.done) break;
          size += item.value.byteLength; if (size > maximum) { await reader.cancel(); throw invalid(); }
          chunks.push(item.value);
        }
      } finally { reader.releaseLock(); }
      bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    } else bytes = new TextEncoder().encode(await response.text());
    if (bytes.byteLength > maximum) throw invalid();
    if (descriptor) {
      if (bytes.byteLength !== descriptor.bytes || !globalThis.crypto?.subtle) throw invalid();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== descriptor.sha256) throw invalid();
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw invalid(); }
  })();
  try { return await Promise.race([task, cancelled, new Promise((_, reject) => {
    timer = setTimeout(() => { reject(timeout()); controller.abort(); }, timeoutMs);
  })]); }
  finally { clearTimeout(timer); controller.signal.removeEventListener("abort", abort); controllers.delete(controller); }
}
function clientFor(fetchImpl) {
  if (typeof fetchImpl !== "function") throw new Error("无法读取拼写建议。");
  let client = clients.get(fetchImpl);
  if (!client) { client = { manifest: null, at: 0, loading: null, shards: new Map(), pending: new Map(), failed: new Set() }; clients.set(fetchImpl, client); }
  return client;
}
async function manifestFor(client, dictionaryVersion, fetchImpl) {
  if (client.manifest?.dictionaryVersion === dictionaryVersion && Date.now() - client.at < TTL) return client.manifest;
  if (client.loading) {
    const value = await client.loading;
    return parseSuggestionManifest(value, dictionaryVersion);
  }
  const started = generation;
  const loading = readJSON(MANIFEST_URL, fetchImpl, TRANSPORT_TIMEOUT_MS).then(value => {
    const manifest = parseSuggestionManifest(value, dictionaryVersion);
    if (started === generation) {
      if (client.manifest?.version !== manifest.version) client.shards.clear();
      client.manifest = manifest; client.at = Date.now();
    }
    return manifest;
  }).finally(() => { if (client.loading === loading) client.loading = null; });
  client.loading = loading; return loading;
}
async function shardFor(client, descriptor, fetchImpl) {
  const key = descriptor.file;
  if (client.shards.has(key)) return client.shards.get(key);
  if (client.pending.has(key)) return client.pending.get(key);
  const started = generation;
  const loading = readJSON(new URL(descriptor.file, MANIFEST_URL), fetchImpl, TRANSPORT_TIMEOUT_MS, descriptor, client.failed.has(key)).then(value => {
    const rows = parseSuggestionShard(value, descriptor);
    if (started === generation) { client.shards.set(key, rows); client.failed.delete(key); }
    return rows;
  }).catch(error => {
    if (started === generation) {
      client.failed.add(key);
      if (client.failed.size > 128) client.failed.delete(client.failed.values().next().value);
    }
    throw error;
  })
    .finally(() => { if (client.pending.get(key) === loading) client.pending.delete(key); });
  client.pending.set(key, loading); return loading;
}

/** Lazy length shards, <=2 edits, <=5 explicit choices; no provider/query URL.
 * timeoutMs bounds each resource wait, including a shared download. It must
 * not discard healthy sequential reads just because library rendering used
 * the main thread between them. Ranking is finite and cooperatively yields. */
export async function suggestDictionaryTerms(input, { dictionaryVersion, signal, fetchImpl = globalThis.fetch, timeoutMs = 3000, limit = 5 } = {}) {
  const query = normalizeSuggestionQuery(input); if (!query) return [];
  if (signal?.aborted) throw stopped();
  if (!HASH.test(dictionaryVersion)) throw invalid();
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 3000;
  const count = Number.isSafeInteger(limit) ? Math.max(1, Math.min(5, limit)) : 5;
  const client = clientFor(fetchImpl), maximum = query.length >= 6 ? 2 : 1;
  let stop, abandoned = false;
  const cancelled = new Promise((_, reject) => {
    stop = () => { abandoned = true; reject(stopped()); };
    signal?.addEventListener("abort", stop, { once: true });
  });
  const resource = async operation => {
    let timer;
    try { return await Promise.race([operation, cancelled,
      new Promise((_, reject) => { timer = setTimeout(() => reject(timeout()), duration); })]); }
    finally { clearTimeout(timer); }
  };
  const task = (async () => {
    const manifest = await resource(manifestFor(client, dictionaryVersion, fetchImpl));
    if (signal?.aborted) throw stopped();
    const descriptors = manifest.shards.filter(shard => Math.abs(shard.length - query.length) <= maximum);
    const groups = await Promise.all(descriptors.map(shard => resource(shardFor(client, shard, fetchImpl))));
    if (signal?.aborted) throw stopped();
    if (groups.some(rows => rows.some(([term]) => fold(term) === query))) return [];
    const matches = []; let scanned = 0, lastYield = performance.now();
    for (const rows of groups) for (const row of rows) {
      // Yield by elapsed CPU work, not every fixed row batch. Unconditional
      // zero-delay timers cost ~15ms on some Windows hosts and otherwise make
      // a small warm lookup wait over a second for dozens of idle callbacks.
      if (++scanned % 512 === 0) {
        if (signal?.aborted || abandoned) throw stopped();
        if (performance.now() - lastYield >= 8) { await new Promise(resolve => setTimeout(resolve, 0)); lastYield = performance.now(); }
        if (signal?.aborted || abandoned) throw stopped();
      }
      const match = score(query, row, maximum); if (match) matches.push(match);
    }
    return ordered(matches, count);
  })();
  try {
    return await Promise.race([task, cancelled]);
  } finally { signal?.removeEventListener("abort", stop); }
}

export function resetDictionarySuggestionsForTests() {
  generation++; for (const controller of controllers) controller.abort(); controllers.clear(); clients = new WeakMap();
}
