import { EVERYDAY_LOOKUP_ENTRIES } from "./everyday-lookup-data.js";

const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const HAN = /\p{Script=Han}/u;
const UNSAFE = /[<>]|javascript\s*:/iu;
const SOURCE = "卓的日常词组";
const LICENSE = "Original composition";
const SOURCE_URL = "https://zhuodashuai.github.io/vocab/";
const EXAMPLE_SOURCE = "原创例句·作者自查（精选义项）";
const chinese = new Map(), canonicalEnglish = new Map(), englishForms = new Map();

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
  return value.replace(/\s+/gu, "").replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu, "");
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
  for (const term of row.chineseAliases) add(chinese, chineseKey(spelling(term)), row);
  for (const term of row.englishForms) add(englishForms, englishKey(term), row);
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
export function searchEverydayDictionary(input, { limit = 20 } = {}) {
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
  return {
    query,
    results: rows.slice(0, count).map(row => ({
      term: row.term, partOfSpeech: row.partOfSpeech, meaning: row.meaning,
      source: SOURCE, license: LICENSE, url: SOURCE_URL,
      ...(!HAN.test(normal) && query !== englishKey(row.term) ? { matchedForm: form } : {}),
    })),
    hasMore: rows.length > count,
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
      id: `everyday:${stableKey(row.term)}`, partOfSpeech: row.partOfSpeech, meaningZh: row.meaning,
      examples: [{ en: row.en, zh: row.zh }], reviewer: "AI/everyday-original", source: EXAMPLE_SOURCE,
    }],
  };
}
