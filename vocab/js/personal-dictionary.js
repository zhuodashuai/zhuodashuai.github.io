import { MEMBER_DICTIONARY_MANIFEST } from "./member-dictionary-manifest.js?v=88";
import { canonicalizeLookupInput, normalizeEnglish, validateEnglishInput } from "./wordbook-schema.js?v=82";
import { CORE_POS_CORRECTIONS } from "./core-pos-corrections.js?v=88";
import { chineseSearchPlan, matchesChineseSearchEntry } from "./chinese-search.js?v=93";

const POS = Object.freeze({
  n: "noun", noun: "noun", v: "verb", vt: "verb", vi: "verb", verb: "verb",
  a: "adjective", adj: "adjective", adjective: "adjective", ad: "adverb", adv: "adverb", adverb: "adverb",
  pron: "pronoun", pronoun: "pronoun", prep: "preposition", preposition: "preposition",
  conj: "conjunction", conjunction: "conjunction", interj: "interjection", int: "interjection",
  num: "numeral", numeral: "numeral", art: "article", article: "article", det: "determiner",
  aux: "auxiliary verb", modal: "modal verb", abbr: "abbreviation", abbreviation: "abbreviation",
  "proper noun": "proper noun", "noun phrase": "noun phrase", "verb phrase": "verb phrase",
  "phrasal verb": "phrasal verb", "adjective phrase": "adjective phrase", "adverb phrase": "adverb phrase",
  "adverbial phrase": "adverbial phrase", "plural noun": "plural noun",
  "transitive verb": "transitive verb", "intransitive verb": "intransitive verb",
  "prepositional phrase": "prepositional phrase", "preposition phrase": "preposition phrase",
  "pronoun phrase": "pronoun phrase", "determiner phrase": "determiner phrase", "conjunction phrase": "conjunction phrase",
  "auxiliary verb": "auxiliary verb", "modal verb": "modal verb", "definite article": "definite article",
  "indefinite article": "indefinite article", "infinitive marker": "infinitive marker", "combining form": "combining form",
  determiner: "determiner", particle: "particle", prefix: "prefix", suffix: "suffix", idiom: "idiom",
  expression: "expression", phrase: "phrase", sentence: "sentence", contraction: "contraction",
  symbol: "symbol", nominative: "nominative", clause: "clause",
  "infinitival phrase": "infinitival phrase", "participial phrase": "participial phrase",
  "quantifier phrase": "quantifier phrase", postposition: "postposition", proverb: "proverb", affix: "affix"
});
const PREFIX = /^(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|numeral|article|abbreviation|interj|pron|prep|conj|modal|abbr|adj|adv|aux|det|num|art|int|vt|vi|ad|n|v|a)\.\s*/i;
const numeral = index => index < 20 ? String.fromCodePoint(0x2460 + index) : `${index + 1}.`;

/** Retain the dictionary's labels, including specialist notes; do not invent senses. */
export function personalDictionaryResult(row) {
  if (!row || typeof row.word !== "string" || typeof row.meaning !== "string" || !/\p{Script=Han}/u.test(row.meaning)) return null;
  const labels = [];
  const groups = [];
  for (const text of row.meaning.split(/\r?\n/).map(line => line.trim()).filter(Boolean)) {
    const prefix = text.match(PREFIX);
    if (prefix) {
      const label = prefix[1].toLowerCase();
      labels.push(POS[label]);
      const displayed = label === "a" ? "adj" : label === "ad" ? "adv" : label;
      groups.push(`${displayed}. ${text.slice(prefix[0].length)}`);
    } else if (groups.length) groups[groups.length - 1] += `\n   ${text}`;
    else groups.push(text);
  }
  // The compact metadata often stores only the first POS (e.g. hip, record).
  // The labelled Chinese lines are therefore the primary source of POS coverage.
  const rawLabel = String(row.partOfSpeech || "").toLowerCase().trim();
  const fallback = /^(?:n\/a|none|unknown|unverified|unclassified|pending)\.?$/u.test(rawLabel) ? [] : rawLabel.split(/[,;·/]+/).flatMap(value => {
    const label = value.trim().replace(/\.$/u, "");
    // Preserve multiword labels before supporting old compact spellings such as "n v".
    if (POS[label]) return [POS[label]];
    const legacy = label.split(/\s+/u);
    if (legacy.every(item => POS[item])) return legacy.map(item => POS[item]);
    // Unfamiliar source labels are still source data, not missing metadata.
    // Preserve legitimate grammar labels rather than turn count noun into noun
    // or make a future approved label look eligible for an old empty-POS patch.
    return label.length <= 200 && /^[a-z][a-z () .-]*$/u.test(label)
      && !/^(?:unknown|unverified|unclassified|pending|none|n\/a)(?:\b|$)/u.test(label) ? [label] : [];
  });
  return {
    term: row.word, partOfSpeech: [...new Set(labels.length ? labels : fallback)].join(" · "),
    meaning: groups.map((group, index) => `${numeral(index)} ${group}`).join("\n"), source: "ECDICT"
  };
}

const INDEX_URL = new URL(`../data/${MEMBER_DICTIONARY_MANIFEST.file}`, import.meta.url);
INDEX_URL.searchParams.set("v", MEMBER_DICTIONARY_MANIFEST.sha256);
if (typeof location !== "undefined" && ["localhost", "127.0.0.1"].includes(location.hostname)
  && new URLSearchParams(location.search).get("e2e") === "1") {
  INDEX_URL.searchParams.set("testRun", new URLSearchParams(location.search).get("testRun") || "e2e");
}
const indexes = new WeakMap();
const legacyIndexes = new WeakMap();
const correctionIndexes = new WeakMap();
const HAN = /\p{Script=Han}/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
let sharedLoad = null;
let cancelLoad = null;

function record(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) throw new Error("本站查词索引格式不正确。");
}
function field(value, maximum, { empty = false, chinese = false } = {}) {
  if (typeof value !== "string" || [...value].length > maximum || CONTROL.test(value)
    || (!empty && !value.trim()) || (chinese && !HAN.test(value))) throw new Error("本站查词索引包含无效词条。");
  return value.trim();
}
function list(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("本站查词索引超出安全范围。");
  return value;
}
function lexicalTerm(value) {
  const term = field(value, 200);
  if (!/[\p{Script=Latin}\d]/u.test(term) || HAN.test(term) || /<\/?[A-Za-z][^>]*>|javascript\s*:/iu.test(term)) throw new Error("本站查词索引包含无效英文形式。");
  return term;
}
function add(map, key, value) {
  const values = map.get(key) || [];
  if (!values.some(item => item.term === value.term && item.partOfSpeech === value.partOfSpeech && item.meaning === value.meaning)) values.push(value);
  map.set(key, values);
}
function makeIndexes() { return { core: new Map(), published: new Map(), forms: new Map(), originals: new Map() }; }
const literalKey = value => value.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US");
function canonical(map, value) {
  const key = literalKey(value.term);
  if (map.has(key)) throw new Error("本站查词索引存在重复原形。");
  map.set(key, value);
}

/** Apply independently credited labels only to an unchanged, still-unlabelled core row. */
export function applyCorePosCorrection(row, value, projection = CORE_POS_CORRECTIONS) {
  if (!value || String(row?.partOfSpeech || "").trim() || value.source !== "ECDICT"
    || typeof value.partOfSpeech !== "string" || value.partOfSpeech.trim()) return value;
  let corrections = correctionIndexes.get(projection);
  if (!corrections) {
    corrections = new Map(projection.entries.map(entry => [entry[0], entry]));
    correctionIndexes.set(projection, corrections);
  }
  const entry = corrections.get(row.word);
  if (!entry || value.term !== row.word || entry[0] !== row.word || entry[1] !== row.meaning) return value;
  return { ...value, partOfSpeech: entry[2], source: projection.source.name,
    license: projection.source.license, url: projection.source.url };
}

/** Prove an expanded result is the same reviewed core tuple, not just the same source label. */
export function isReviewedCoreDictionaryResult(value, projection = CORE_POS_CORRECTIONS) {
  if (!value || value.matchedForm || typeof value.term !== "string"
    || typeof value.partOfSpeech !== "string" || typeof value.meaning !== "string"
    || !projection?.source || !Array.isArray(projection.entries)
    || value.source !== projection.source.name || value.license !== projection.source.license
    || value.url !== projection.source.url) return false;
  // Identities stay case-sensitive: Polish must never approve polish. The
  // projection contains only raw-core approvals, never plain MIT headwords.
  const entry = projection.entries.find(item => item[0] === value.term);
  if (!entry) return false;
  const formatted = personalDictionaryResult({ word: entry[0], meaning: entry[1], partOfSpeech: entry[2] });
  return (value.meaning === entry[1] || value.meaning === formatted?.meaning)
    && (value.partOfSpeech === entry[2] || value.partOfSpeech === formatted?.partOfSpeech);
}
function coreValue(word, partOfSpeech, meaning) {
  const row = { word, partOfSpeech, meaning };
  const value = applyCorePosCorrection(row, personalDictionaryResult(row));
  if (!value || [...value.meaning].length > 2000) throw new Error("本站查词索引没有可用中文释义。");
  return Object.freeze(value);
}

/** A bounded projection of already-public glosses, never unpublished original drafts. */
export function parsePersonalDictionary(payload) {
  record(payload, ["schemaVersion", "source", "counts", "core", "published"]);
  if (payload.schemaVersion !== 1) throw new Error("本站查词索引版本不受支持，请刷新后重试。");
  record(payload.source, ["core", "published"]);
  record(payload.source.core, ["name", "license", "url", "fileSha256"]);
  record(payload.source.published, ["name", "fileSha256"]);
  if (payload.source.core.name !== "ECDICT" || payload.source.core.license !== "MIT"
    || payload.source.core.url !== "https://github.com/skywind3000/ECDICT"
    || payload.source.published.name !== "卓的公开词库"
    || !/^[a-f0-9]{64}$/u.test(payload.source.core.fileSha256)
    || !/^[a-f0-9]{64}$/u.test(payload.source.published.fileSha256)) throw new Error("本站查词索引来源标记不正确。");
  const names = ["coreInput", "core", "published", "omittedWithoutChinese", "publicAliases",
    "publishedInput", "publicAliasesInput", "omittedPublishedEntries", "omittedPublicAliases"];
  record(payload.counts, names);
  if (names.some(name => !Number.isSafeInteger(payload.counts[name]) || payload.counts[name] < 0)
    || payload.counts.coreInput > 20_000 || payload.counts.publishedInput > 10_000
    || payload.counts.publicAliasesInput > payload.counts.publishedInput * 50
    || payload.counts.coreInput !== payload.counts.core + payload.counts.omittedWithoutChinese
    || payload.counts.publishedInput !== payload.counts.published + payload.counts.omittedPublishedEntries
    || payload.counts.publicAliasesInput !== payload.counts.publicAliases + payload.counts.omittedPublicAliases) throw new Error("本站查词索引计数不正确。");
  const maps = makeIndexes();
  for (const row of list(payload.core, 20_000)) {
    if (!Array.isArray(row) || row.length !== 4) throw new Error("本站查词索引词条格式不正确。");
    const term = lexicalTerm(row[0]), pos = field(row[1], 200, { empty: true });
    const value = coreValue(term, pos, field(row[2], 2000, { chinese: true }));
    canonical(maps.core, value);
    for (const alias of list(row[3], 32)) {
      const original = lexicalTerm(alias);
      add(maps.forms, literalKey(original), value);
    }
  }
  let publicAliases = 0;
  for (const row of list(payload.published, 10_000)) {
    if (!Array.isArray(row) || row.length !== 4) throw new Error("本站公开释义格式不正确。");
    const term = lexicalTerm(row[0]);
    const value = Object.freeze({ term, partOfSpeech: field(row[1], 200, { empty: true }),
      meaning: field(row[2], 2000, { chinese: true }), source: "卓的公开词库" });
    canonical(maps.published, value);
    for (const alias of list(row[3], 50)) {
      if (!Array.isArray(alias) || alias.length !== 3) throw new Error("本站原文形式索引格式不正确。");
      const original = lexicalTerm(alias[0]);
      add(maps.originals, literalKey(original), Object.freeze({ term,
        partOfSpeech: field(alias[1], 200, { empty: true }), meaning: field(alias[2], 2000, { chinese: true }), source: "卓的公开词库" }));
      publicAliases++;
    }
  }
  if (maps.core.size !== payload.counts.core || maps.published.size !== payload.counts.published
    || publicAliases !== payload.counts.publicAliases) throw new Error("本站查词索引词条计数不一致。");
  const parsed = Object.freeze({ schemaVersion: 1, counts: Object.freeze({ ...payload.counts }) });
  indexes.set(parsed, maps);
  return parsed;
}

function parsedIndexes(dictionary) {
  const parsed = indexes.get(dictionary);
  if (parsed) return parsed;
  // Keep the legacy parsed-core injection available to existing deterministic
  // tests; production never fetches the large owner dictionary through here.
  if (!dictionary?.entries || !(dictionary.entries instanceof Map)) throw new Error("请先读取本站查词索引。");
  if (legacyIndexes.has(dictionary)) return legacyIndexes.get(dictionary);
  const maps = makeIndexes();
  for (const row of dictionary.entries.values()) {
    const value = applyCorePosCorrection(row, personalDictionaryResult(row));
    if (!value) continue;
    canonical(maps.core, value);
    for (const form of row.forms || []) add(maps.forms, literalKey(form), value);
  }
  legacyIndexes.set(dictionary, maps);
  return maps;
}

function find(dictionary, term) {
  const maps = parsedIndexes(dictionary);
  const literal = literalKey(term);
  const key = normalizeEnglish(term);
  // A literal headword always wins over punctuation-normalized keys and aliases.
  // General dictionary senses come first; chapter-specific public glosses only
  // fill missing headwords, never replace a common word's other parts of speech.
  const exact = maps.core.get(literal) || maps.published.get(literal) || maps.core.get(key) || maps.published.get(key);
  if (exact) return { ...exact };
  const originals = maps.originals.get(literal) || maps.originals.get(key) || [];
  const forms = maps.forms.get(literal) || maps.forms.get(key) || [];
  const terms = new Set([...originals, ...forms].map(value => normalizeEnglish(value.term)));
  if (terms.size > 1 || originals.length > 1) {
    const error = new Error("这个形式对应多个词或章节含义，请输入英文原形，或从公开词库选择章节；本次没有自动填入。");
    error.code = "ambiguous_dictionary_match";
    throw error;
  }
  const value = originals[0] || forms[0];
  return value ? { ...value, matchedForm: term } : null;
}

/** Shared, public-only warmup. A failed warmup never poisons the next user retry. */
export function preloadPersonalDictionary({ fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  if (sharedLoad) return sharedLoad;
  const controller = new AbortController();
  let rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const stop = message => { controller.abort(); rejectDeadline(new Error(message)); };
  const cancel = () => stop("本站词典读取已停止，请重试。");
  const timer = setTimeout(() => stop("本站词典读取超时，请重新查询。"), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20_000);
  const operation = (async () => {
    if (typeof fetchImpl !== "function") throw new Error("当前环境无法读取本站词典。");
    const response = await fetchImpl(INDEX_URL, { cache: "force-cache", credentials: "omit", signal: controller.signal });
    if (!response?.ok) throw new Error(`本站词典暂时读取失败（${response?.status || "network"}），请重试。`);
    return parsePersonalDictionary(await response.json());
  })();
  const loading = Promise.race([operation, deadline]).catch(error => {
    if (sharedLoad === loading) sharedLoad = null;
    throw error;
  }).finally(() => { clearTimeout(timer); if (cancelLoad === cancel) cancelLoad = null; });
  sharedLoad = loading;
  cancelLoad = cancel;
  return loading;
}

/** No query leaves the device. Only one versioned first-party public index is downloaded. */
export async function lookupPersonalDictionary(input, { signal, timeoutMs = 20_000, dictionary, fetchImpl = globalThis.fetch } = {}) {
  if (typeof input !== "string" || [...input].length > 200) throw new Error("请输入不超过 200 个字符的英文词或短语。");
  // 24/7 is an existing shipped lexical entry, not permission to relax the
  // global English-only editor/API validator or invent numeric headwords.
  const literal = canonicalizeLookupInput(input);
  const term = literal === "24/7" ? literal : validateEnglishInput(input);
  if (signal?.aborted) throw new Error("查词已停止。");
  let rejectStop;
  const stopped = new Promise((_, reject) => { rejectStop = reject; });
  const stop = () => rejectStop(new Error("本站词典读取已停止，请重新查询。"));
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const parsed = await Promise.race([dictionary || preloadPersonalDictionary({ timeoutMs, fetchImpl }), stopped]);
    if (signal?.aborted) throw new Error("查词已停止。");
    return find(parsed, term);
  } finally { signal?.removeEventListener("abort", stop); }
}

/** Fast reverse search of the already validated public hot index, not the full dictionary. */
export async function searchPersonalDictionaryChinese(input, { signal, timeoutMs = 20_000, dictionary, fetchImpl = globalThis.fetch, limit = 20 } = {}) {
  if (typeof input !== "string" || input.length > 200 || CONTROL.test(input)) throw new Error("请输入不超过 50 个字的中文释义。");
  const query = input.normalize("NFKC").replace(/^[\p{P}\p{Z}]+|[\p{P}\p{Z}]+$/gu, "").trim();
  if (!HAN.test(query) || !/^[\p{Script=Han}\s]+$/u.test(query) || [...query].length > 50) throw new Error("中文查询请只输入不超过 50 个字的中文释义。");
  if (signal?.aborted) throw new Error("查词已停止。");
  let stop;
  const stopped = new Promise((_, reject) => { stop = () => reject(new Error("查词已停止。")); });
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const parsed = await Promise.race([dictionary || preloadPersonalDictionary({ timeoutMs, fetchImpl }), stopped]);
    if (signal?.aborted) throw new Error("查词已停止。");
    const maps = parsedIndexes(parsed), results = [], seen = new Set();
    const plan = chineseSearchPlan(query);
    const count = Math.max(1, Math.min(50, Number.isSafeInteger(limit) ? limit : 20));
    // Keep each actual matching source: a chapter gloss must not be replaced by
    // a general gloss which did not contain the requested Chinese meaning.
    for (const value of [...maps.core.values(), ...maps.published.values()]) {
      const key = literalKey(value.term);
      if (seen.has(key) || !(plan ? matchesChineseSearchEntry(value.term, value.meaning, plan.term) : value.meaning.normalize("NFKC").includes(query))) continue;
      seen.add(key); results.push({ ...value });
      if (results.length > count) break;
    }
    return { query, results: results.slice(0, count), hasMore: results.length > count, coverage: "basic" };
  } finally { signal?.removeEventListener("abort", stop); }
}

export function resetPersonalDictionaryCacheForTests() {
  cancelLoad?.();
  cancelLoad = null;
  sharedLoad = null;
}
