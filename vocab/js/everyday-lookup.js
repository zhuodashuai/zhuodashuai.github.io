import * as packagedEveryday from "./everyday-lookup-data.js";
import { LITERAL_DICTIONARY_HEADS } from "./dictionary-literal-heads-data.js";
// An old offline data module can still supply its original entries during an
// interrupted shell update. Extra names appear once the data refresh arrives.
const { EVERYDAY_LOOKUP_ENTRIES, EVERYDAY_CHINESE_ALIASES = [] } = packagedEveryday;

const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const HAN = /\p{Script=Han}/u;
const UNSAFE = /[<>]|javascript\s*:/iu;
const SOURCE = "卓的日常词组";
const LICENSE = "Original composition";
const SOURCE_URL = "https://zhuodashuai.github.io/vocab/";
const EXAMPLE_SOURCE = "原创例句·作者自查（精选义项）";
const chinese = new Map(), canonicalEnglish = new Map(), englishForms = new Map();
const reviewedCanonicalHeads = new Set();
const supersededChineseHeads = new Set();
const literalDictionaryHeads = new Set(LITERAL_DICTIONARY_HEADS.map(term => englishKey(term)));

function spelling(value) {
  return value.normalize("NFKC").replace(/[‘’‛ʼ]/gu, "'").replace(/[“”„‟]/gu, '"')
    .replace(/\s+/gu, " ").trim();
}
function safeInput(value) {
  if (typeof value !== "string" || value.length > 200 || CONTROL.test(value)
    || typeof value.isWellFormed === "function" && !value.isWellFormed()) return null;
  const normal = spelling(value);
  return normal && !CONTROL.test(normal) && !UNSAFE.test(normal) ? normal : null;
}
function chineseKey(value) {
  // Mixed Chinese terms such as USB充电头 retain their full subject, while
  // Latin letter case does not create a different Chinese lookup intent.
  return value.toLocaleLowerCase("en-US").replace(/\s+/gu, "").replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu, "");
}
function englishKey(value) { return spelling(value).toLocaleLowerCase("en-US"); }
/** Remove pasted quote/sentence decoration without deleting a lexical period.
 * The generated collision index, rather than the length or case of a word,
 * decides which literal heads need the verified main dictionary first. */
export function literalDictionarySpelling(value) {
  let clean = spelling(value);
  for (let count = 0; count < 2; count++) {
    clean = clean.replace(/^["']+|["']+$/gu, "").trim()
      .replace(/[!?,;:。！？…，；：]+$/gu, "").trim();
  }
  return clean;
}
function decoratedEnglish(value) {
  let clean = value;
  // Two passes cover a closing quote followed by sentence punctuation, or the
  // inverse, without deleting punctuation within an explicitly listed phrase.
  for (let count = 0; count < 2; count++) {
    clean = clean.replace(/^["']+|["']+$/gu, "").trim()
      .replace(/[.!?,;:。！？…，；：]+$/gu, "").trim();
  }
  return clean;
}
function add(map, key, row) {
  if (!key) return;
  const rows = map.get(key) || [];
  if (!rows.includes(row)) rows.push(row);
  map.set(key, rows);
}
function stableKey(term) {
  // Identity only, not a security digest. It stays fixed when rows are added
  // or reordered and does not depend on a mutable main-dictionary ordinal.
  let hash = 0xcbf29ce484222325n;
  for (const character of englishKey(term)) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
for (const row of EVERYDAY_LOOKUP_ENTRIES) {
  const key = englishKey(row.term);
  if (canonicalEnglish.has(key)) throw new Error("Duplicate everyday dictionary headword.");
  canonicalEnglish.set(key, row);
  if (row.reviewedCanonicalSense === true) reviewedCanonicalHeads.add(row.term);
  if (row.reviewedCanonicalSense === true && row.retainLegacyChinese !== true) supersededChineseHeads.add(row.term);
  for (const term of row.chineseAliases) add(chinese, chineseKey(spelling(term)), row);
  for (const term of row.englishForms) add(englishForms, englishKey(term), row);
}
for (const { term, aliases } of EVERYDAY_CHINESE_ALIASES) {
  const row = canonicalEnglish.get(englishKey(term));
  if (!row || row.term !== term || !Array.isArray(aliases) || !aliases.length) {
    throw new Error("Invalid existing-head Chinese alias target.");
  }
  for (const alias of aliases) {
    if (safeInput(alias) !== alias || !HAN.test(alias)) throw new Error("Invalid exact Chinese alias.");
    add(chinese, chineseKey(alias), row);
  }
}

/** Only the literal, reviewed canonical head qualifies. Search decoration,
 * case folding and declared forms never authorize suppressing a core record. */
export function isReviewedCanonicalSenseHead(term) {
  return typeof term === "string" && reviewedCanonicalHeads.has(term);
}

export function isSupersededChineseSenseHead(term) {
  return typeof term === "string" && supersededChineseHeads.has(term);
}

function retainedRow(term) {
  if (typeof term !== 'string') return null;
  const row = canonicalEnglish.get(englishKey(term));
  return row?.term === term && row.reviewedCanonicalSense === true
    && Array.isArray(row.retainedCanonicalAlternatives) && row.retainedCanonicalAlternatives.length ? row : null;
}

export function isRetainedCanonicalSenseHead(term) { return Boolean(retainedRow(term)); }

function retainedProjection(old) {
  return { partOfSpeech: old.partOfSpeech,
    meaning: old.meaning + (old.usageNote ? '\n用法：' + old.usageNote : ''),
    source: old.source, license: old.license, url: old.url };
}

/** Only the exact approved base or its exact approved-note projection matches.
 * The second identity keeps the expanded/personal double guard idempotent. */
export function matchesRetainedCanonicalAlternative(term, item) {
  const row = retainedRow(term);
  return Boolean(item && row?.retainedCanonicalAlternatives.some(old =>
    ['partOfSpeech','source','license','url'].every(key => item[key] === old[key])
      && (item.meaning === old.meaning || item.meaning === retainedProjection(old).meaning)));
}

/** Drop unapproved old variants, without promoting an alternative to primary
 * or changing caller data. Policy evidence and internal IDs are never copied. */
export function sanitizeRetainedCanonicalResult(item) {
  const row = retainedRow(item?.term);
  if (!row) return item;
  if (!matchesRetainedCanonicalAlternative(item.term, item)) return null;
  const approved = row.retainedCanonicalAlternatives.find(old =>
    ['partOfSpeech','source','license','url'].every(key => item[key] === old[key])
      && (item.meaning === old.meaning || item.meaning === retainedProjection(old).meaning));
  const output = { ...item, ...retainedProjection(approved) };
  if (Array.isArray(item.alternatives)) {
    const kept = [], seen = new Set();
    for (const candidate of item.alternatives) {
      if (!matchesRetainedCanonicalAlternative(item.term, candidate)) continue;
      const old = row.retainedCanonicalAlternatives.find(value =>
        ['partOfSpeech','source','license','url'].every(key => candidate[key] === value[key])
          && (candidate.meaning === value.meaning || candidate.meaning === retainedProjection(value).meaning));
      const projected = retainedProjection(old), key = JSON.stringify(projected);
      if (!seen.has(key)) { seen.add(key); kept.push(projected); }
    }
    if (kept.length) output.alternatives = kept;
    else delete output.alternatives;
  } else delete output.alternatives;
  return output;
}

/** Call only after the explicit packaged head/form lookup missed. A legacy
 * form cannot borrow a newly selected meaning merely by resolving to its head. */
export function guardLegacySupplementaryResult(result) {
  if (!Array.isArray(result?.results)) return result;
  let changed = false;
  const results = result.results.map(item => {
    if (!isReviewedCanonicalSenseHead(item?.term)) return item;
    if (!matchesRetainedCanonicalAlternative(item.term, item)) {
      const error = new Error('请输入英文原形查询；该词形暂时没有可靠的对应释义。');
      error.code = 'unreviewed_dictionary_form'; throw error;
    }
    const clean = sanitizeRetainedCanonicalResult(item);
    changed ||= clean !== item; return clean;
  });
  return changed ? { ...result, results } : result;
}

function lookupChinese(query) {
  const exact = chinese.get(query);
  if (exact) return exact;
  // Only complete lookup questions are recognised. The extracted subject must
  // itself be a listed alias; no negation, qualifier or second question is lost.
  const question = query.match(/^(?:请问(?:一下)?[，,:：]?)?(.+?)(?:的英文是什么|的英语是什么|的英文怎么说|的英语怎么说|用英语怎么说|用英文怎么说|英文是什么|的英文|的英语|英文怎么说|英语怎么说)$/u);
  return question ? chinese.get(chineseKey(question[1])) : undefined;
}

/** Small, exact whole-query vocabulary lookup. No requests or word splitting. */
export function searchEverydayDictionary(input, { limit = 20, offset, allowDottedFallback = false } = {}) {
  const normal = safeInput(input);
  if (!normal) return null;
  let query, rows, form;
  if (HAN.test(normal)) {
    query = chineseKey(normal);
    if ([...query].length > 50) return null;
    rows = lookupChinese(query);
  } else {
    // A punctuation-bearing canonical head is not a decorated different word.
    // The caller may request the old candidate only as a fallback after a
    // verified literal read; this option never grants it a different meaning.
    if (!allowDottedFallback && literalDictionaryHeads.has(englishKey(literalDictionarySpelling(normal)))) return null;
    form = decoratedEnglish(normal);
    query = englishKey(form);
    const canonical = canonicalEnglish.get(query);
    rows = canonical ? [canonical] : englishForms.get(query);
  }
  if (!rows?.length) return null;
  const count = Math.max(1, Math.min(50, Number.isSafeInteger(limit) ? limit : 20));
  const start = Number.isSafeInteger(offset) && offset >= 0 ? Math.min(offset, 200_000) : 0;
  const page = rows.slice(start, start + count);
  return {
    query,
    results: page.map(row => ({
      term: row.term, partOfSpeech: row.partOfSpeech, meaning: row.meaning,
      source: row.dictionarySource || SOURCE, license: LICENSE, url: SOURCE_URL,
      ...(row.retainedCanonicalAlternatives?.length ? { alternatives: row.retainedCanonicalAlternatives.map(retainedProjection) } : {}),
      ...(!HAN.test(normal) && query !== englishKey(row.term) ? { matchedForm: form } : {}),
    })),
    hasMore: rows.length > start + page.length,
    ...(offset === undefined ? {} : { offset: start, nextOffset: start + page.length, total: rows.length }),
  };
}

function associatedOriginal(row) {
  if (!row || !Object.hasOwn(row, 'existingExampleDTOJSON')) return null;
  try {
    if (typeof row.existingExampleDTOJSON !== 'string' || row.existingExampleDTOJSON.length > 16000) return null;
    const entry = JSON.parse(row.existingExampleDTOJSON);
    if (Object.keys(entry).sort().join('|') !== 'senses|term' || entry.term !== row.term
      || !Array.isArray(entry.senses) || entry.senses.length !== 1) return null;
    const sense = entry.senses[0];
    if (Object.keys(sense).sort().join('|') !== 'examples|id|meaningZh|partOfSpeech|reviewer|source'
      || !['id','meaningZh','partOfSpeech','reviewer','source'].every(key => typeof sense[key] === 'string' && sense[key].trim())
      || !row.partOfSpeech.split(/\s*·\s*/u).includes(sense.partOfSpeech)
      || !Array.isArray(sense.examples) || sense.examples.length !== 1
      || Object.keys(sense.examples[0]).sort().join('|') !== 'en|zh'
      || sense.examples[0].en !== row.en || sense.examples[0].zh !== row.zh) return null;
    return entry;
  } catch { return null; }
}

function associatedLiteral(term) {
  if (typeof term !== 'string' || safeInput(term) !== term) return null;
  const row = canonicalEnglish.get(englishKey(term));
  return row?.term === term && Object.hasOwn(row, 'existingExampleDTOJSON') ? row : null;
}

// Dispatch recognizes declared forms and case variants so they cannot bypass
// the stricter branch. This predicate grants nothing: the loader below still
// requires the exact canonical head and an exact approved saved identity.
export function hasAssociatedEverydayExampleHead(term) {
  const normal = safeInput(term);
  if (!normal || HAN.test(normal)) return false;
  const canonical = canonicalEnglish.get(englishKey(normal));
  const rows = canonical ? [canonical] : englishForms.get(englishKey(normal));
  return rows?.length === 1 && Object.hasOwn(rows[0],'existingExampleDTOJSON');
}

function associatedDataFields(input, keys) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) return null;
  const own = Reflect.ownKeys(input);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return null;
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input,key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value') || typeof descriptor.value !== 'string' || !descriptor.value.trim()) return null;
    result[key] = descriptor.value;
  }
  return result;
}

/** The builder authenticated these complete old pairs against their original
 * assets. Local reuse keeps their specific POS/sense labels and exact finite
 * saved-card identities; an invalid optional binding only hides the example. */
export function loadAssociatedEverydayExamples(term, { context, sourcePins } = {}) {
  const row = associatedLiteral(term), pins = associatedDataFields(sourcePins,['version','manifestSha256']);
  if (!row || !pins || row.existingExampleSourceVersion !== pins.version
    || row.existingExampleManifestSha256 !== pins.manifestSha256) return null;
  const original = associatedOriginal(row);
  if (!original) return null;
  if (context === undefined) return original;
  try {
    if (typeof row.existingExampleContextsJSON !== 'string' || row.existingExampleContextsJSON.length > 64000) return null;
    const allowed = JSON.parse(row.existingExampleContextsJSON);
    if (!Array.isArray(allowed) || !allowed.length || allowed.length > 64
      || allowed.some(identity => !identity || Object.keys(identity).sort().join('|') !== 'meaning|partOfSpeech|term'
        || identity.term !== term || !['term','partOfSpeech','meaning'].every(key => typeof identity[key] === 'string' && identity[key].trim()))) return null;
    const identity = associatedDataFields(context,['term','partOfSpeech','meaning']);
    if (!identity) return null;
    return allowed.some(allowedIdentity => ['term','partOfSpeech','meaning'].every(key => allowedIdentity[key] === identity[key])) ? original : null;
  } catch { return null; }
}

/** Examples belong to a selected English head/form, never a Chinese question. */
export function loadEverydayExamples(term) {
  const normal = safeInput(term);
  if (!normal || HAN.test(normal)) return null;
  const key = englishKey(normal), canonical = canonicalEnglish.get(key);
  const forms = canonical ? [canonical] : englishForms.get(key);
  if (forms?.length !== 1) return null;
  const row = forms[0];
  if (Object.hasOwn(row, 'existingExampleDTOJSON')) return associatedOriginal(row);
  return {
    term: row.term,
    senses: [{
      id: `${row.reviewedCanonicalSense === true ? "reviewed-sense" : "everyday"}:${stableKey(row.term)}`,
      partOfSpeech: row.partOfSpeech, meaningZh: row.meaning,
      examples: [{ en: row.en, zh: row.zh }],
      reviewer: row.exampleReviewer || "AI/everyday-original", source: row.exampleSource || EXAMPLE_SOURCE,
    }],
  };
}
