import { CHINESE_QUERY_CACHE_RELEASE } from './chinese-query-cache-release.js?v=125';
import { normalizeChineseQueryCacheQuery, chineseQueryCacheBucket } from './chinese-query-cache-format.js?v=118';

// Build-authenticated complete public results, not another translation source.
// This module creates no private English-parser origin or collection authority.
const ROOT = new URL('../data/chinese-query-cache/', import.meta.url);
const HASH = /^[a-f0-9]{64}$/u;
const isHash = value => typeof value === 'string' && HASH.test(value);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const TRANSPORT_MS = 2500, MEMORY_BYTES = 32 * 1024 * 1024;
const MAX_COMPRESSED = 256 * 1024, MAX_UNCOMPRESSED = 4 * 1024 * 1024;
let clients = new WeakMap(), generation = 0;
const controllers = new Set();
const invalid = () => Object.assign(new Error('中文查询缓存校验失败。'), { code: 'invalid_dictionary_data' });
const stopped = () => Object.assign(new Error('查词已停止。'), { name: 'AbortError' });
const timedOut = () => Object.assign(new Error('中文查询缓存读取超时。'), { code: 'dictionary_timeout' });
const unavailable = () => Object.assign(new Error('中文查询缓存暂不可用。'), { code: 'dictionary_network' });
const clock = () => globalThis.performance?.now?.() ?? Date.now();

function shape(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw invalid();
}
function string(value, maximum, { empty = false, multiline = false } = {}) {
  if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim())
    || CONTROL.test(value) || (!multiline && /[\t\r\n]/u.test(value))) throw invalid();
}
function integer(value, maximum, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw invalid();
}
function list(value, maximum) { if (!Array.isArray(value) || value.length > maximum) throw invalid(); }
function safeURL(value) {
  string(value, 1000);
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw invalid(); }
  catch { throw invalid(); }
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Freeze nested public descriptors too: an imported consumer cannot change a
// trusted hash, membership list or engine binding after this module loads.
freeze(CHINESE_QUERY_CACHE_RELEASE);
let releaseState;
function selectionSources(value) {
  list(value, 1); if (value.length !== 1) throw invalid();
  const selection = value[0];
  shape(selection, ['file', 'sha256', 'bytes', 'entries', 'license']);
  if (selection.file !== 'vocab/data/ecdict-core.json' || !isHash(selection.sha256)
    || selection.entries !== 7502 || selection.license !== 'MIT') throw invalid();
  integer(selection.bytes, 8 * 1024 * 1024, 1);
}
function release() {
  if (releaseState) return releaseState;
  const value = CHINESE_QUERY_CACHE_RELEASE;
  const v2 = value.schemaVersion === 2;
  shape(value, ['schemaVersion', 'dictionaryVersion', 'sourceManifestSha256', 'engineBinding', 'buildVersion', 'members', 'buckets', 'selectionSources',
    ...(v2 ? ['legacyOrigins', 'authorization'] : [])]);
  if (![1, 2].includes(value.schemaVersion) || ![value.dictionaryVersion, value.sourceManifestSha256, value.engineBinding, value.buildVersion].every(isHash)) throw invalid();
  list(value.members, 50_000); list(value.buckets, 64);
  if (value.buckets.length !== 64) throw invalid();
  selectionSources(value.selectionSources);
  if (v2) {
    list(value.legacyOrigins, 4); if (!value.legacyOrigins.length) throw invalid();
    const origins = new Set([value.buildVersion]);
    for (const origin of value.legacyOrigins) {
      shape(origin, ['buildVersion', 'dictionaryVersion', 'sourceManifestSha256', 'engineBinding', 'releaseFileSha256', 'selectionSources']);
      if (![origin.buildVersion, origin.dictionaryVersion, origin.sourceManifestSha256, origin.engineBinding, origin.releaseFileSha256].every(isHash)
        || origins.has(origin.buildVersion)) throw invalid();
      origins.add(origin.buildVersion); selectionSources(origin.selectionSources);
    }
    const proof = value.authorization;
    shape(proof, ['kind', 'currentSourceCompileBuildVersion', 'currentSourceCompileEngineBinding', 'currentSourceCompileReleaseSha256', 'fullSourceAndRelatedCheckLogSha256']);
    if (proof.kind !== 'complete-source-and-related-replay' || proof.currentSourceCompileEngineBinding !== value.engineBinding
      || ![proof.currentSourceCompileBuildVersion, proof.currentSourceCompileEngineBinding, proof.currentSourceCompileReleaseSha256,
        proof.fullSourceAndRelatedCheckLogSha256].every(item => isHash(item) && item !== '0'.repeat(64))) throw invalid();
  }
  const members = new Set(); let previousMember;
  for (const query of value.members) {
    if (typeof query !== 'string' || normalizeChineseQueryCacheQuery(query) !== query || members.has(query)
      || v2 && previousMember !== undefined && previousMember >= query) throw invalid();
    members.add(query); previousMember = query;
  }
  value.buckets.forEach((entry, index) => {
    descriptor(entry, value.buildVersion, true);
    if (entry.bucket !== index) throw invalid();
  });
  releaseState = { value, members }; return releaseState;
}
function descriptor(value, buildVersion, bucket = false, trusted) {
  shape(value, bucket ? ['bucket', 'file', 'sha256', 'bytes', 'uncompressedBytes']
    : ['query', 'file', 'sha256', 'bytes', 'uncompressedBytes', 'total', ...(trusted?.schemaVersion === 2 ? ['packetSha256'] : [])]);
  const namespaces = bucket || trusted?.schemaVersion !== 2 ? [buildVersion] : [buildVersion, ...trusted.legacyOrigins.map(origin => origin.buildVersion)];
  if (!isHash(value.sha256) || !namespaces.some(namespace => value.file === `${namespace}/${value.sha256}.bin`)
    || !bucket && trusted?.schemaVersion === 2 && !isHash(value.packetSha256)) throw invalid();
  integer(value.bytes, bucket ? 1024 * 1024 : MAX_COMPRESSED, 1);
  integer(value.uncompressedBytes, bucket ? 8 * 1024 * 1024 : MAX_UNCOMPRESSED, 1);
  if (bucket) integer(value.bucket, 63); else integer(value.total, 200_000);
}
function binding(payload, trusted, schemaVersion = 1) {
  if (payload.schemaVersion !== schemaVersion || payload.dictionaryVersion !== trusted.dictionaryVersion
    || payload.engineBinding !== trusted.engineBinding) throw invalid();
}
function parseBucket(payload, trusted, bucket, members) {
  shape(payload, ['schemaVersion', 'dictionaryVersion', 'engineBinding', 'bucket', 'entries']);
  binding(payload, trusted, trusted.schemaVersion);
  if (payload.bucket !== bucket) throw invalid();
  list(payload.entries, 50_000);
  const entries = new Map(); let previous;
  for (const entry of payload.entries) {
    descriptor(entry, trusted.buildVersion, false, trusted);
    if (typeof entry.query !== 'string' || normalizeChineseQueryCacheQuery(entry.query) !== entry.query || !members.has(entry.query)
      || chineseQueryCacheBucket(entry.query) !== bucket || entries.has(entry.query)
      || trusted.schemaVersion === 2 && previous !== undefined && previous >= entry.query) throw invalid();
    entries.set(entry.query, entry); previous = entry.query;
  }
  // Membership is exact, not an optimistic hint that may conceal a missing row.
  for (const query of members) if (chineseQueryCacheBucket(query) === bucket && !entries.has(query)) throw invalid();
  return entries;
}
function lexical(value) {
  string(value, 200);
  if (!/[\p{Script=Latin}\d]/u.test(value) || /\p{Script=Han}|[<>]|javascript\s*:/iu.test(value)) throw invalid();
}
function lexicalFields(value, term = false) {
  if (term) lexical(value.term);
  string(value.partOfSpeech, 300, { empty: true }); string(value.meaning, 8000, { multiline: true });
  string(value.source, 200); string(value.license, 500); safeURL(value.url);
}
function exampleEvidence(value) {
  shape(value, ['id', 'partOfSpeech', 'meaningZh', 'examples']);
  string(value.id, 200); string(value.partOfSpeech, 300); string(value.meaningZh, 4000, { multiline: true });
  list(value.examples, 20);
  for (const pair of value.examples) {
    shape(pair, ['en', 'zh']); string(pair.en, 4000, { multiline: true }); string(pair.zh, 4000, { multiline: true });
  }
}
function result(value) {
  shape(value, ['term', 'partOfSpeech', 'meaning', 'source', 'license', 'url'],
    ['alternatives', 'matchedForm', 'matchType', 'matchedChinese', 'matchedPartOfSpeech', 'matchedSense',
      'matchedExampleSenseIds', 'matchedExampleSenseEvidence', 'matchedSourceEvidence']);
  lexicalFields(value, true);
  if (value.alternatives !== undefined) {
    list(value.alternatives, 32);
    for (const row of value.alternatives) { shape(row, ['partOfSpeech', 'meaning', 'source', 'license', 'url']); lexicalFields(row); }
  }
  if (value.matchedForm !== undefined) string(value.matchedForm, 200);
  if (value.matchType !== undefined && !['related', 'mention', 'compound'].includes(value.matchType)) throw invalid();
  if (value.matchedChinese !== undefined && (typeof value.matchedChinese !== 'string' || normalizeChineseQueryCacheQuery(value.matchedChinese) !== value.matchedChinese)) throw invalid();
  if (value.matchType !== undefined && value.matchedChinese === undefined) throw invalid();
  if (value.matchedPartOfSpeech !== undefined) string(value.matchedPartOfSpeech, 300);
  if (value.matchedSense !== undefined) string(value.matchedSense, 4000);
  const ids = value.matchedExampleSenseIds, evidence = value.matchedExampleSenseEvidence;
  if ((ids === undefined) !== (evidence === undefined)) throw invalid();
  if (ids !== undefined) {
    list(ids, 64); list(evidence, 64); ids.forEach(id => string(id, 200)); evidence.forEach(exampleEvidence);
    if (new Set(ids).size !== ids.length || ids.length !== evidence.length || ids.some((id, index) => id !== evidence[index].id)) throw invalid();
  }
  if (value.matchedSourceEvidence !== undefined) {
    const proof = value.matchedSourceEvidence;
    shape(proof, ['kind', 'groupId', 'sourceId', 'canonicalId', 'canonicalSourceSha256', 'selectedSourceSha256', 'selectedRowSha256']);
    if (proof.kind !== 'reviewed-canonical-primary') throw invalid();
    string(proof.groupId, 100); string(proof.sourceId, 200); integer(proof.canonicalId, 30_000_000, 1);
    if (![proof.canonicalSourceSha256, proof.selectedSourceSha256, proof.selectedRowSha256].every(isHash)
      || !ids?.length || value.matchedPartOfSpeech === undefined || value.matchedSense === undefined) throw invalid();
  }
}
function parsePacket(payload, query, expectedTotal) {
  shape(payload, ['query', 'metadata', 'results']);
  if (payload.query !== query) throw invalid();
  const metadata = payload.metadata;
  shape(metadata, ['query', 'total', 'ranking', 'relatedIntegrated'], ['normalizedQuery', 'coverage']);
  if (metadata.query !== query || metadata.ranking !== 'global' || metadata.relatedIntegrated !== true
    || metadata.total !== expectedTotal) throw invalid();
  integer(metadata.total, 200_000); list(payload.results, 200_000);
  if (metadata.total !== payload.results.length) throw invalid();
  if (metadata.normalizedQuery !== undefined && (typeof metadata.normalizedQuery !== 'string' || normalizeChineseQueryCacheQuery(metadata.normalizedQuery) !== metadata.normalizedQuery)) throw invalid();
  if (metadata.coverage !== undefined && metadata.coverage !== 'full') throw invalid();
  const terms = new Set();
  for (const row of payload.results) {
    result(row);
    const term = row.term.normalize('NFKC').replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, ' ').trim();
    if (terms.has(term)) throw invalid(); terms.add(term);
  }
  return freeze({ metadata, results: payload.results });
}
// Object keys are canonicalized, while every array position and optional field
// remains part of the current full-source authorization digest.
function stableJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJSON(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
async function digest(bytes) {
  if (!globalThis.crypto?.subtle) throw unavailable();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function packetOrigin(trusted, desc) {
  if (desc.file === `${trusted.buildVersion}/${desc.sha256}.bin`) return trusted;
  const found = trusted.schemaVersion === 2 && trusted.legacyOrigins.find(origin => desc.file === `${origin.buildVersion}/${desc.sha256}.bin`);
  if (!found) throw invalid(); return found;
}
async function parseBundle(payload, trusted, bucket, entries, desc) {
  shape(payload, ['schemaVersion', 'dictionaryVersion', 'engineBinding', 'packets']); binding(payload, packetOrigin(trusted, desc));
  list(payload.packets, 16); if (!payload.packets.length) throw invalid();
  const packets = new Map(); let previous;
  for (const packet of payload.packets) {
    const query = packet?.query, entry = entries.get(query);
    if (!entry || chineseQueryCacheBucket(query) !== bucket || packets.has(query)
      || previous !== undefined && previous >= query
      || entry.file !== desc.file || entry.sha256 !== desc.sha256 || entry.bytes !== desc.bytes
      || entry.uncompressedBytes !== desc.uncompressedBytes) throw invalid();
    const parsed = parsePacket(packet, query, entry.total);
    if (trusted.schemaVersion === 2 && await digest(new TextEncoder().encode(stableJSON(packet))) !== entry.packetSha256) throw invalid();
    packets.set(query, parsed); previous = query;
  }
  for (const [query, entry] of entries) if (entry.file === desc.file && !packets.has(query)) throw invalid();
  return packets;
}
async function readStream(stream, exactBytes, signal) {
  if (!stream?.getReader) throw invalid();
  const reader = stream.getReader(), chunks = []; let length = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw stopped();
      const { value, done } = await reader.read();
      if (signal.aborted) throw stopped();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw invalid();
      length += value.byteLength;
      if (length > exactBytes) throw invalid();
      chunks.push(value);
    }
    if (length !== exactBytes) throw invalid();
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { signal.removeEventListener('abort', cancel); reader.cancel().catch(() => {}); }
}
async function load(descriptor, fetchImpl, signal, reload) {
  const response = await fetchImpl(new URL(descriptor.file, ROOT), { cache: reload ? 'reload' : 'force-cache', credentials: 'omit', signal });
  if (!response?.ok) throw unavailable();
  const length = response.headers?.get?.('content-length');
  // Fetch exposes the HTTP-decoded body. An outer HTTP gzip/br length need
  // not equal this already-gzipped asset's size; the streamed bytes and SHA do.
  const encoding = response.headers?.get?.('content-encoding')?.trim().toLowerCase();
  if ((!encoding || encoding === 'identity') && length !== null && length !== undefined
    && (!/^\d+$/u.test(length) || Number(length) !== descriptor.bytes)) throw invalid();
  const bytes = await readStream(response.body, descriptor.bytes, signal);
  const hash = await digest(bytes);
  if (signal.aborted) throw stopped();
  if (hash !== descriptor.sha256) throw invalid();
  if (typeof DecompressionStream !== 'function') throw unavailable();
  let decoded;
  try { decoded = await readStream(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), descriptor.uncompressedBytes, signal); }
  catch (error) { if (signal.aborted || error?.name === 'AbortError') throw stopped(); throw invalid(); }
  if (signal.aborted) throw stopped();
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded)); } catch { throw invalid(); }
}
function clientFor(fetchImpl) {
  if (typeof fetchImpl !== 'function') throw unavailable();
  let client = clients.get(fetchImpl);
  if (!client) { client = { cache: new Map(), pending: new Map(), failed: new Set(), bytes: 0 }; clients.set(fetchImpl, client); }
  return client;
}
function shared(client, key, desc, fetchImpl, parse) {
  if (client.cache.has(key)) {
    const found = client.cache.get(key); client.cache.delete(key); client.cache.set(key, found); return Promise.resolve(found.value);
  }
  if (client.pending.has(key)) return client.pending.get(key);
  if (client.pending.size >= 64) return Promise.reject(unavailable());
  const controller = new AbortController(), startedGeneration = generation; controllers.add(controller);
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => { reject(timedOut()); controller.abort(); }, TRANSPORT_MS); });
  const reset = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(stopped()), { once: true }));
  const operation = load(desc, fetchImpl, controller.signal, client.failed.has(key)).then(parse).catch(error => {
    if (controller.signal.aborted) throw stopped();
    if (['invalid_dictionary_data', 'dictionary_network', 'dictionary_timeout'].includes(error?.code)) throw error;
    throw unavailable();
  });
  const pending = Promise.race([operation, expired, reset]).then(value => {
    if (generation !== startedGeneration || controller.signal.aborted) throw stopped();
    const weight = desc.uncompressedBytes * 2;
    if (weight <= MEMORY_BYTES) {
      while (client.cache.size && (client.bytes + weight > MEMORY_BYTES || client.cache.size >= 64)) {
        const oldest = client.cache.keys().next().value; client.bytes -= client.cache.get(oldest).bytes; client.cache.delete(oldest);
      }
      client.cache.set(key, { value, bytes: weight }); client.bytes += weight;
    }
    client.failed.delete(key); return value;
  }).catch(error => {
    if (generation === startedGeneration) { client.failed.add(key); if (client.failed.size > 128) client.failed.delete(client.failed.values().next().value); }
    throw error;
  }).finally(() => { clearTimeout(timer); controllers.delete(controller); if (client.pending.get(key) === pending) client.pending.delete(key); });
  client.pending.set(key, pending); return pending;
}
function wait(promise, signal, duration) {
  if (signal?.aborted) { promise.catch(() => {}); return Promise.reject(stopped()); }
  const deadline = clock() + duration; let timer, stop;
  const other = new Promise((_, reject) => {
    stop = () => reject(stopped()); signal?.addEventListener('abort', stop, { once: true });
    timer = setTimeout(() => reject(timedOut()), duration);
  });
  return Promise.race([promise, other]).then(value => {
    if (signal?.aborted) throw stopped(); if (clock() > deadline) throw timedOut(); return structuredClone(value);
  }).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', stop); });
}

/** Return a complete authenticated packet or null; the caller owns fallback. */
export async function readChineseQueryPacket(input, { manifest, engineBinding, fetchImpl = globalThis.fetch, signal, timeoutMs = TRANSPORT_MS } = {}) {
  if (signal?.aborted) throw stopped();
  const query = normalizeChineseQueryCacheQuery(input);
  if (!query) return null;
  const trusted = release();
  if (manifest?.version !== trusted.value.dictionaryVersion || manifest?.integritySha256 !== trusted.value.sourceManifestSha256
    || engineBinding !== trusted.value.engineBinding || !trusted.members.has(query)) return null;
  const client = clientFor(fetchImpl), current = generation;
  const prefix = `${manifest.integritySha256}:${engineBinding}:${trusted.value.buildVersion}:`;
  const bucket = chineseQueryCacheBucket(query), desc = trusted.value.buckets[bucket];
  const operation = (async () => {
    const entries = await shared(client, `${prefix}bucket:${desc.sha256}`, desc, fetchImpl,
      payload => parseBucket(payload, trusted.value, bucket, trusted.members));
    if (generation !== current) throw stopped();
    const packet = entries.get(query); if (!packet) throw invalid();
    const origin = packetOrigin(trusted.value, packet);
    const originKey = [origin.buildVersion, origin.dictionaryVersion, origin.sourceManifestSha256, origin.engineBinding, origin.releaseFileSha256 ?? 'current'].join(':');
    const bundle = await shared(client, `${prefix}bundle:${bucket}:${originKey}:${packet.sha256}`, packet, fetchImpl,
      payload => parseBundle(payload, trusted.value, bucket, entries, packet));
    if (generation !== current) throw stopped();
    const value = bundle.get(query); if (!value) throw invalid(); return value;
  })();
  const duration = Math.min(TRANSPORT_MS, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TRANSPORT_MS);
  return wait(operation, signal, duration);
}

export function resetChineseQueryPacketCacheForTests() {
  generation++; for (const controller of controllers) controller.abort(); controllers.clear(); clients = new WeakMap();
}
