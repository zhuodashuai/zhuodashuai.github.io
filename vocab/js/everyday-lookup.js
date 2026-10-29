import * as packagedEveryday from "./everyday-lookup-data.js";
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
export function searchEverydayDictionary(input, { limit = 20, offset } = {}) {
  const normal = safeInput(input);
  if (!normal) return null;
  let query, rows, form;
  if (HAN.test(normal)) {
    query = chineseKey(normal);
    if ([...query].length > 50) return null;
    rows = lookupChinese(query);
  } else {
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

/** Examples belong to a selected English head/form, never a Chinese question. */
export function loadEverydayExamples(term) {
  const normal = safeInput(term);
  if (!normal || HAN.test(normal)) return null;
  const key = englishKey(normal), canonical = canonicalEnglish.get(key);
  const forms = canonical ? [canonical] : englishForms.get(key);
  if (forms?.length !== 1) return null;
  const row = forms[0];
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
