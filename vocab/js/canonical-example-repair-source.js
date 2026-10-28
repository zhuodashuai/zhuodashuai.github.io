import { personalDictionaryResult } from './personal-dictionary.js?v=97';

const ROOT = new URL('../data/expanded-dictionary/', import.meta.url);
const HASH = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const invalid = () => new Error('Invalid canonical example source');
export const stoppedCanonicalExample = () => Object.assign(new Error('已停止读取例句。'), { name: 'AbortError' });
export function canonicalAlive(signal) { if (signal?.aborted) throw stoppedCanonicalExample(); }

/** JSON data only: hashing must never evaluate a getter or a toJSON facade. */
export function canonicalSnapshot(value) {
  let nodes = 0;
  function copy(input, depth) {
    if (++nodes > 300000 || depth > 20) throw invalid();
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'number') { if (!Number.isFinite(input)) throw invalid(); return input; }
    if (typeof input === 'string') { if (input.length > 20000 || CONTROL.test(input)) throw invalid(); return input; }
    if (!input || typeof input !== 'object') throw invalid();
    const array = Array.isArray(input), proto = Object.getPrototypeOf(input);
    if (proto !== (array ? Array.prototype : Object.prototype) && !(proto === null && !array)) throw invalid();
    const keys = Reflect.ownKeys(input), descriptors = Object.getOwnPropertyDescriptors(input);
    if (keys.some(key => typeof key !== 'string' || key === '__proto__' || key === 'toJSON')) throw invalid();
    if (array) {
      if (input.length > 200000 || keys.length !== input.length + 1 || keys.at(-1) !== 'length') throw invalid();
      return Array.from({ length: input.length }, (_, index) => {
        const d = descriptors[index]; if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw invalid();
        return copy(d.value, depth + 1);
      });
    }
    const result = {};
    for (const key of keys) {
      const d = descriptors[key]; if (!d.enumerable || !Object.hasOwn(d, 'value')) throw invalid();
      result[key] = copy(d.value, depth + 1);
    }
    return result;
  }
  return copy(value, 0);
}
export function canonicalKeys(value, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== required.length || required.some(key => !Object.hasOwn(value, key))) throw invalid();
}
export function canonicalText(value, maximum = 2000) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > maximum || CONTROL.test(value)) throw invalid();
}
export function canonicalHash(value) { if (typeof value !== 'string' || !HASH.test(value)) throw invalid(); }
export function canonicalFreeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) canonicalFreeze(child); Object.freeze(value); }
  return value;
}
export const canonicalEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const canonicalFold = text => text.normalize('NFKC').replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
export function canonicalSourceBucket(term) {
  let hash = 2166136261;
  for (const ch of canonicalFold(term)) { hash ^= ch.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 128;
}
export async function canonicalDigest(bytes) {
  const result = await globalThis.crypto.subtle.digest('SHA-256', typeof bytes === 'string' ? encoder.encode(bytes) : bytes);
  return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export const canonicalJSONDigest = value => canonicalDigest(JSON.stringify(value));

/** Derive exact saved-display identities using the existing licensed formatter. */
export function canonicalDisplayContexts(record) {
  const raw = { term: record.term, partOfSpeech: record.partOfSpeech, meaning: record.meaning };
  let formatted = raw;
  if (['mit','core','pos-reviewed','grammar-reviewed','pos-notation-reviewed'].includes(record.source)
    && !/^\s*(?:[①-⑳]|\d+[.、])/u.test(record.meaning)) {
    const result = personalDictionaryResult({ word: record.term, partOfSpeech: record.partOfSpeech, meaning: record.meaning });
    if (result) formatted = { term: record.term, partOfSpeech: result.partOfSpeech || record.partOfSpeech,
      meaning: result.meaning.length <= 2000 ? result.meaning : record.meaning };
  }
  return canonicalEqual(raw, formatted) ? [raw] : [raw, formatted];
}

/** Project only own display fields; card metadata and accessors grant nothing. */
export function canonicalSavedContext(entry, term) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(entry))) throw invalid();
  const own = (object, key, optional = false) => {
    const d = Object.getOwnPropertyDescriptor(object, key);
    if (!d && optional) return undefined;
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw invalid(); return d.value;
  };
  const declared = own(entry, 'term', true), pos = own(entry, 'partOfSpeech');
  let meaning = own(entry, 'meaning');
  if (meaning && typeof meaning === 'object' && !Array.isArray(meaning)
    && [Object.prototype, null].includes(Object.getPrototypeOf(meaning))) meaning = own(meaning, 'zh');
  const result = { term: declared === undefined ? term : declared, partOfSpeech: pos, meaning };
  canonicalText(result.term, 200); canonicalText(pos, 80); canonicalText(meaning, 20000); return result;
}

export function validateCanonicalPins(input) {
  const pins = canonicalSnapshot(input); canonicalKeys(pins, ['version','manifestSha256']);
  canonicalHash(pins.version); canonicalHash(pins.manifestSha256); return canonicalFreeze(pins);
}

function wait(promise, signal) {
  canonicalAlive(signal);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => { if (done) return; done = true; signal.removeEventListener('abort', stop); fn(value); };
    const stop = () => finish(reject, stoppedCanonicalExample());
    signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}
async function readBounded(response, maximum, signal) {
  if (!response?.ok || response.redirected) throw invalid();
  const length = response.headers?.get('content-length'), encoding = response.headers?.get('content-encoding')?.trim().toLowerCase();
  // Fetch removes HTTP Content-Encoding. Authenticate and bound the decoded
  // body, rather than confuse the CDN wire length with source-file bytes.
  if (length != null && (!/^\d+$/u.test(length) || (!encoding || encoding === 'identity') && Number(length) > maximum)) throw invalid();
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer()); canonicalAlive(signal);
    if (bytes.length > maximum) throw invalid(); return bytes;
  }
  const reader = response.body.getReader(), chunks = []; let total = 0, complete = false;
  const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      canonicalAlive(signal); const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array) || (total += value.length) > maximum) throw invalid(); chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancel); if (!complete) cancel(); reader.releaseLock(); }
  canonicalAlive(signal); const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}

/** Authenticate only fixed first-party assets. Shared source requests survive
 * one card's cancellation, remain bounded, and are all stopped on close. */
export function createCanonicalSourceClient(inputPins, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const pins = validateCanonicalPins(inputPins);
  if (typeof fetchImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw invalid();
  const cache = new Map(), pending = new Map(), active = new Set(); let closed = false, cachedBytes = 0;
  const alive = signal => { if (closed) throw stoppedCanonicalExample(); canonicalAlive(signal); };
  async function cached(key, operation) {
    alive();
    if (cache.has(key)) { const value = cache.get(key); cache.delete(key); cache.set(key, value); return value.data; }
    if (pending.has(key)) return pending.get(key);
    const work = Promise.resolve().then(operation).then(value => {
      if (!closed) {
        cache.set(key, value); cachedBytes += value.bytes;
        while (cache.size > 8 || cachedBytes > 16 * 1024 * 1024) {
          const oldest = cache.keys().next().value; cachedBytes -= cache.get(oldest).bytes; cache.delete(oldest);
        }
      }
      return value.data;
    }).finally(() => { if (pending.get(key) === work) pending.delete(key); });
    pending.set(key, work); return work;
  }
  async function download(file, maximum, sha256, size) {
    alive(); const url = new URL(file, ROOT);
    if (!url.href.startsWith(ROOT.href)) throw invalid();
    const controller = new AbortController(); active.add(controller);
    let timer, rejectStopped;
    const cancelled = new Promise((_, reject) => { rejectStopped = () => reject(stoppedCanonicalExample()); });
    controller.signal.addEventListener('abort', rejectStopped, { once: true });
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { reject(invalid()); controller.abort(); }, timeoutMs); });
    const operation = (async () => {
      const response = await fetchImpl(url.href, { credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-cache', signal: controller.signal });
      if (response.url && response.url !== url.href) throw invalid();
      const bytes = await readBounded(response, maximum, controller.signal);
      if (size !== undefined && bytes.length !== size || await canonicalDigest(bytes) !== sha256) throw invalid();
      alive(controller.signal);
      return { bytes: bytes.length, data: canonicalFreeze(canonicalSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))) };
    })();
    try { return await Promise.race([operation, timeout, cancelled]); }
    finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', rejectStopped);
      active.delete(controller); controller.abort();
    }
  }
  async function manifest() {
    return cached('manifest', async () => {
      const value = await download('manifest.json', 524288, pins.manifestSha256);
      const m = value.data;
      if (m.schemaVersion !== 2 || m.version !== pins.version || m.english?.buckets !== 128
        || !Array.isArray(m.english.shards) || m.english.shards.length !== 128) throw invalid();
      m.english.shards.forEach((d, index) => {
        canonicalKeys(d, ['bucket','file','sha256','bytes','count']); canonicalHash(d.sha256);
        if (d.bucket !== index || d.file !== `${pins.version}/en-${String(index).padStart(3,'0')}.json`
          || !Number.isSafeInteger(d.bytes) || d.bytes < 1 || d.bytes > 8388608 || !Number.isSafeInteger(d.count) || d.count < 0) throw invalid();
      });
      return value;
    });
  }
  return {
    async authenticate(row, { signal } = {}) {
      alive(signal); const m = await wait(manifest(), signal); alive(signal);
      const bucket = canonicalSourceBucket(row.term), descriptor = m.english.shards[bucket];
      const shard = await wait(cached(descriptor.file, () => download(descriptor.file, 8388608, descriptor.sha256, descriptor.bytes)), signal); alive(signal);
      canonicalKeys(shard, ['schemaVersion','kind','bucket','records','keys']);
      if (shard.schemaVersion !== 2 || shard.kind !== 'en' || shard.bucket !== bucket || !Array.isArray(shard.records)
        || !Array.isArray(shard.keys) || shard.keys.length !== descriptor.count) throw invalid();
      const owners = shard.records.filter(record => typeof record?.term === 'string' && canonicalFold(record.term) === canonicalFold(row.term));
      const keys = shard.keys.filter(key => Array.isArray(key) && key[0] === canonicalFold(row.term));
      if (owners.length !== 1 || owners[0].term !== row.term || keys.length !== 1 || keys[0].length !== 2
        || !Array.isArray(keys[0][1]) || keys[0][1].length !== 1) throw invalid();
      const ref = keys[0][1][0]; canonicalKeys(ref, ['id','kind']);
      const record = owners[0];
      if (ref.kind !== 'canonical' || ref.id !== row.canonicalId || record.id !== row.canonicalId || record.id % 128 !== bucket
        || !canonicalEqual(record, row.exactCanonicalRecord) || await canonicalJSONDigest(record) !== row.canonicalSourceSha256
        || !canonicalEqual(m.sources?.[record.source], row.canonicalSourceDescriptor)) throw invalid();
      alive(signal); return record;
    },
    close() { closed = true; for (const c of active) c.abort(); active.clear(); cache.clear(); pending.clear(); cachedBytes = 0; }
  };
}
