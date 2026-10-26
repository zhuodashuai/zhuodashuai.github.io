import { DICTIONARY_EXAMPLE_CORRECTIONS } from './dictionary-example-corrections-data.js';

const SOURCE = '原创例句·AI复核（精选义项）';
const HASH = /^[a-f0-9]{64}$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const ROW_KEYS = ['term','expectedEntrySha256','canonicalId','canonicalSourceSha256','senseId','exampleIndex','partOfSpeech','meaningZh','en','zh','reviewer'];
const SENSE_KEYS = ['id','partOfSpeech','meaningZh','examples','source','reviewer'];

function aborted() { const error = new Error('已停止读取例句。'); error.name = 'AbortError'; return error; }
function alive(signal) { if (signal?.aborted) throw aborted(); }
function text(value, maximum, han = false) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= maximum
    && !CONTROL.test(value) && (!han || /\p{Script=Han}/u.test(value));
}
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const own = Reflect.ownKeys(value);
  // JSON hashes must describe the actual DTO, not an accessor/toJSON facade.
  return own.length === keys.length && own.every(key => typeof key === 'string' && keys.includes(key)
    && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
function array(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || !value.length) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === value.length + 1 && keys.every(key => {
    if (key === 'length') return true;
    if (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}
function validEntry(entry) {
  if (!object(entry, ['term','senses']) || !text(entry.term, 200) || !array(entry.senses)) return false;
  const ids = new Set();
  return entry.senses.every(sense => {
    if (!object(sense, SENSE_KEYS) || !text(sense.id, 120) || ids.has(sense.id)
      || !text(sense.partOfSpeech, 80) || !text(sense.meaningZh, 2000, true)
      || !text(sense.source, 200) || !text(sense.reviewer, 200)
      || !array(sense.examples)) return false;
    ids.add(sense.id);
    return sense.examples.every(pair => object(pair, ['en','zh']) && text(pair.en, 1200)
      && /[A-Za-z]/u.test(pair.en) && text(pair.zh, 1200, true));
  });
}
async function digest(serialized, signal) {
  alive(signal);
  const work = Promise.resolve().then(() => {
    alive(signal);
    return globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  });
  const result = !signal ? await work : await new Promise((resolve, reject) => {
    let done = false;
    const finish = (callback, value) => {
      if (done) return; done = true; signal.removeEventListener('abort', stop); callback(value);
    };
    const stop = () => finish(reject, aborted());
    signal.addEventListener('abort', stop, { once: true });
    if (signal.aborted) stop();
    work.then(value => finish(resolve, value), error => finish(reject, error));
  });
  alive(signal);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Build a closed correction table from shipped review data. This factory is
 * also used by isolated fixtures; callers cannot change the default table. */
export function createExampleCorrections(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid example correction table');
  const table = new Map();
  for (const row of rows) {
    if (!object(row, ROW_KEYS) || !text(row.term, 200) || /\p{Script=Han}|[<>]/u.test(row.term)
      || typeof row.expectedEntrySha256 !== 'string' || !HASH.test(row.expectedEntrySha256)
      || typeof row.canonicalSourceSha256 !== 'string' || !HASH.test(row.canonicalSourceSha256)
      || !Number.isSafeInteger(row.canonicalId) || row.canonicalId < 0
      || !Number.isSafeInteger(row.exampleIndex) || row.exampleIndex < 0
      || !text(row.senseId, 120) || !text(row.partOfSpeech, 80)
      || !text(row.meaningZh, 2000, true) || !text(row.en, 1200) || !/[A-Za-z]/u.test(row.en)
      || !text(row.zh, 1200, true) || typeof row.reviewer !== 'string' || !/^AI\/[a-z0-9_-]{1,100}$/u.test(row.reviewer)
      || table.has(row.term)) throw new Error('Invalid example correction row');
    table.set(row.term, Object.freeze({ ...row }));
  }
  return async function apply(term, entry, { signal } = {}) {
    alive(signal);
    const row = table.get(term);
    if (!row) return entry;
    try {
      if (!validEntry(entry) || entry.term !== term
        || entry.senses.filter(sense => sense.id === row.senseId).length !== 1) return entry;
      const selected = entry.senses.find(sense => sense.id === row.senseId);
      if (row.exampleIndex >= selected.examples.length) return entry;
      const serialized = JSON.stringify(entry);
      if (serialized.length > 2_000_000) return entry;
      const actualDigest = await digest(serialized, signal);
      alive(signal);
      if (actualDigest !== row.expectedEntrySha256) return entry;
      // Do not apply an authenticated snapshot to an object changed while the
      // asynchronous digest was pending. The original object stays untouched.
      if (!validEntry(entry) || JSON.stringify(entry) !== serialized) return entry;
      return { ...entry, senses: entry.senses.map(sense => sense.id !== row.senseId ? sense : {
        ...sense, partOfSpeech: row.partOfSpeech, meaningZh: row.meaningZh,
        examples: sense.examples.map((pair, index) => index === row.exampleIndex ? { en: row.en, zh: row.zh } : pair),
        ...(sense.examples.length === 1 ? { source: SOURCE, reviewer: row.reviewer } : {}),
      }) };
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw aborted();
      // This optional quality layer never replaces source identity checks or
      // prevents the unchanged authenticated examples being displayed.
      return entry;
    }
  };
}

export const applyExampleCorrections = createExampleCorrections(DICTIONARY_EXAMPLE_CORRECTIONS);
