import { chineseDefinitionAtoms, chineseSearchPlan } from "./chinese-search.js?v=112";

const TECHNICAL = new Set(["计", "医", "经", "法", "电", "化", "化学", "生", "生物", "植", "植物", "动", "动物",
  "地", "地理", "物", "物理", "心", "心理", "军", "数", "数学", "商", "金融", "工程", "电工", "航", "航海", "航天", "天", "天文"]);
const NEGATIVE_PREFIX = /^(?:不|非|无|未|没|莫|勿|别|缺乏|并非|不是)/u;
const NEGATION_BEFORE = /(?:并不|并非|不是|没有|尚未|未曾|缺乏|缺少|欠缺|难以|无需|无须|毋须|不用|不必|不要|不得|不可|不能|切勿|勿|莫|不|非|无|未|没|欠)(?:太|很|甚|够|完全|怎么|那么|如此|再|能|曾经|曾|过于|过分|过度|十分|非常|特别|格外|更加|极其){0,3}$/u;
const EXCLUSION_BEFORE = /(?:不指|并非指|不是指|不表示|不意味着|不代表|不等于|不等同于|不同于|区别于|有别于|不包括|不包含|不属于|不含|不添加|不加)([^,，;；。.!?！？\n]{0,30})$/u;
// 别 is an imperative only at a clause/pronoun/adverb boundary. Merely ending
// another word in 别 does not negate it (e.g. an ordinary degree modifier).
const IMPERATIVE_BEFORE = /(?:^|请|切|千万|万万|务必|一定|就|也|可|再|人|你|我|他|她|它)别(?:太|很|过于|过分|过度|特别|格外|再){0,3}$/u;
const DEGREE = /^(?:很|极其|极|非常|十分|相当|太|颇|稍微|稍|略|格外|特别|有点|比较|较|更|最|过于|过分)+/u;
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const contextAtoms = new WeakMap();
const variantsOf = record => [record, ...(Array.isArray(record?.variants) ? record.variants : [])];
const valuesOf = records => records && typeof records.values === "function" ? records.values() : [];
const includes = (text, query) => text.normalize("NFKC").toLowerCase().includes(query.toLowerCase());

function hasAffirmedOccurrence(text, query) {
  const value = text.normalize("NFKC").toLowerCase(), needle = query.toLowerCase();
  for (let start = 0, at; (at = value.indexOf(needle, start)) >= 0; start = at + Math.max(1, needle.length)) {
    // Querying 不/没有 themselves is an ordinary literal query: there is no
    // preceding operator at offset zero. Never remove a query's own negation.
    const before = value.slice(0, at);
    const exclusion = before.match(EXCLUSION_BEFORE);
    const excluded = exclusion && !/(?:而是|但是|然而|不过|但|却|而指|应指|实指|实际上|实为)/u.test(exclusion[1]);
    if (at === 0 || !NEGATION_BEFORE.test(before) && !IMPERATIVE_BEFORE.test(before) && !excluded) return true;
  }
  return false;
}

function lexicalStem(atom) {
  if (!atom.lexical) return null;
  if (atom.partOfSpeech === "adjective" && atom.lexical.endsWith("的")) return atom.lexical.slice(0, -1);
  if (atom.partOfSpeech === "adverb" && atom.lexical.endsWith("地")) return atom.lexical.slice(0, -1);
  return atom.lexical;
}

/** Remove a grammatical suffix only with source role evidence. An independent
 * noun/verb atom keeps its spelling, even when its last character is 的/地. */
export function normalizeChineseRankingQuery(query, records) {
  if (typeof query !== "string") return { query, term: query };
  const term = query.normalize("NFKC").trim();
  if (!/^\p{Script=Han}{2,50}$/u.test(term) || !/[的地]$/u.test(term)) return { query, term };
  const base = term.slice(0, -1), target = term.endsWith("的") ? "adjective" : "adverb";
  // Only this already-reviewed whole-query family can supply grammatical
  // evidence. Do not follow another alias hop or remove a query's negation.
  const evidenceTerms = new Set([base, ...(chineseSearchPlan(base)?.aliases || [])]);
  const grammaticalHeads = new Set(), lexicalHeads = new Set(); let protectedLexeme = false;
  const reduplicatedBase = [...base].length === 2 && [...base][0] === [...base][1] ? [...base][0] : null;
  if (reduplicatedBase) evidenceTerms.add(reduplicatedBase);
  for (const record of valuesOf(records)) {
    const head = String(record?.term ?? record?.id ?? "").normalize("NFKC").toLowerCase();
    for (const item of variantsOf(record)) {
      if (typeof item?.meaning !== "string" || ![...evidenceTerms].some(word => includes(item.meaning, word))) continue;
      for (const atom of chineseDefinitionAtoms(item.meaning, item.partOfSpeech)) {
        if (atom.lexical === term && ["pronoun", "determiner"].includes(atom.partOfSpeech)) protectedLexeme = true;
        if (atom.lexical === term && ["noun", "verb"].includes(atom.partOfSpeech)) lexicalHeads.add(head);
        const stem = lexicalStem(atom);
        if (term.endsWith("地") && atom.partOfSpeech === "adjective" && atom.lexical === `${term}的`) protectedLexeme = true;
        // An adverb ending in 地 cannot itself prove that its final character
        // is detachable. Require an independent base form or adjective form.
        const circularAdverb = term.endsWith("地") && atom.partOfSpeech === "adverb" && atom.lexical === term;
        if (["adjective", "adverb"].includes(atom.partOfSpeech) && stem
          && !circularAdverb && (evidenceTerms.has(stem) || atom.lexical === term && atom.partOfSpeech === target)) grammaticalHeads.add(head);
      }
    }
  }
  // English POS labels describe English heads, and isolated legacy summaries
  // sometimes label a Chinese adjective as a noun/verb. Independent stronger
  // evidence may resolve 的; a complete noun ending in 地 stays conservative.
  if (protectedLexeme || lexicalHeads.size && (term.endsWith("地") || grammaticalHeads.size < 2 || grammaticalHeads.size <= lexicalHeads.size)) return { query, term };
  return grammaticalHeads.size ? { query, term: base, partOfSpeechHint: target } : { query, term };
}

// Compatibility for callers that previously requested a tokenisation needle.
// Without corpus evidence this deliberately preserves the complete input.
export const chineseRankingNeedle = (query, records) => normalizeChineseRankingQuery(query, records).term;

function atomsFor(meaning, partOfSpeech, context) {
  const cache = context && contextAtoms.get(context), key = `${partOfSpeech || ""}\u0000${meaning}`;
  if (cache?.has(key)) return cache.get(key);
  const atoms = chineseDefinitionAtoms(meaning, partOfSpeech);
  if (cache && cache.size < 10_000) cache.set(key, atoms);
  return atoms;
}

/** Ranking-only co-definition evidence, not translations or candidate terms.
 * An anchor needs two independently named source heads, the same source-role
 * scope as the exact query atom, and an unchanged complete Chinese atom. */
export function createChineseRankingContext(query, records, { partOfSpeechHint } = {}) {
  const term = typeof query === "string" ? query.normalize("NFKC").trim() : "";
  const context = { term, partOfSpeechHint, rankingOnly: true, anchors: [] }, support = new Map();
  contextAtoms.set(context, new Map());
  // A comma-separated legacy noun/verb summary often lists unrelated senses
  // (a destination and a brook, for example). It cannot establish synonyms.
  // This small aid is restricted to single-character descriptive roots.
  if (!/^\p{Script=Han}$/u.test(term)) return Object.freeze(context);
  for (const record of valuesOf(records)) {
    const head = String(record?.term || record?.id || "").normalize("NFKC").toLowerCase();
    if (!head) continue;
    for (const item of variantsOf(record)) {
      if (typeof item?.meaning !== "string" || !includes(item.meaning, term)) continue;
      const atoms = atomsFor(item.meaning, item.partOfSpeech, context);
      const roles = new Set(atoms.filter(atom => lexicalStem(atom) === term && ["adjective", "adverb"].includes(atom.partOfSpeech) && !TECHNICAL.has(atom.domain))
        .map(atom => atom.partOfSpeech));
      if (!roles.size) continue;
      const signature = [...new Set(atoms.filter(atom => roles.has(atom.partOfSpeech) && !TECHNICAL.has(atom.domain))
        .map(atom => `${atom.partOfSpeech}:${lexicalStem(atom) || atom.text}`))].sort().join("\u0001");
      for (const atom of atoms) {
        const stem = lexicalStem(atom);
        if (!stem || !/^\p{Script=Han}{2,8}$/u.test(stem) || stem === term || !roles.has(atom.partOfSpeech)
          || TECHNICAL.has(atom.domain) || NEGATIVE_PREFIX.test(stem) !== NEGATIVE_PREFIX.test(term)
          || stem.includes(term) && !stem.endsWith(term)) continue;
        const key = `${atom.partOfSpeech}\u0000${stem}`, proof = support.get(key) || { term: stem, partOfSpeech: atom.partOfSpeech, heads: new Set(), definitions: new Set() };
        proof.heads.add(head); proof.definitions.add(signature); support.set(key, proof);
      }
    }
  }
  context.anchors = Object.freeze([...support.values()].filter(item => item.heads.size >= 2 && item.definitions.size >= 2)
    .map(item => Object.freeze({ term: item.term, partOfSpeech: item.partOfSpeech, rankingOnly: true, supportingHeads: Object.freeze([...item.heads].sort()) }))
    .sort((a, b) => b.supportingHeads.length - a.supportingHeads.length || a.term.localeCompare(b.term, "zh")));
  return Object.freeze(context);
}

function rolePenalty(atom, hint) { return !hint || atom.partOfSpeech === hint ? 0 : atom.partOfSpeech ? 0.3 : 0.15; }

/** Explain ranking support inside an already literal/approved-alias candidate.
 * This must never introduce a new candidate or a new query expansion. */
export function chineseRankingAnchorMatch(meaning, context, partOfSpeech = "") {
  if (!context?.anchors?.length || typeof meaning !== "string") return null;
  const atoms = atomsFor(meaning, partOfSpeech, context);
  let best = null;
  for (const atom of atoms) for (const anchor of context.anchors) {
    if (atom.partOfSpeech !== anchor.partOfSpeech || lexicalStem(atom) !== anchor.term) continue;
    const rank = (TECHNICAL.has(atom.domain) ? 3 : 0) + rolePenalty(atom, context.partOfSpeechHint);
    if (!best || rank < best.rank) best = { matchedChinese: atom.lexical, anchor: anchor.term, rankingOnly: true, rank };
  }
  return best;
}

/** Generic source tiers: complete atom, degree predicate, lexical suffix,
 * compound, then explanatory mention. The source definition remains intact. */
export function chineseVariantRank(meaning, query, partOfSpeech = "", options = {}) {
  if (typeof meaning !== "string" || meaning.length > 20_000 || typeof query !== "string" || !query.trim() || CONTROL.test(query)) return null;
  const context = options?.context;
  // Grammar normalisation belongs to the corpus-backed query step. A single
  // candidate cannot decide that a complete noun such as a destination loses
  // its final character merely because this candidate has an adverbial sense.
  const needle = query.normalize("NFKC").trim();
  if (!includes(meaning, needle)) return null;
  const hint = options?.partOfSpeechHint || context?.partOfSpeechHint;
  const atoms = atomsFor(meaning, partOfSpeech, context); let best = Infinity;
  for (const atom of atoms) {
    if (!includes(atom.text, needle) || !hasAffirmedOccurrence(atom.text, needle)) continue;
    const stem = lexicalStem(atom), grammatical = ["adjective", "adverb"].includes(atom.partOfSpeech);
    let tier = 6;
    if (atom.lexical === needle || stem === needle) tier = 0;
    else if (stem && ((grammatical || !atom.partOfSpeech) && stem.startsWith(`${needle}得`)
      || grammatical && stem.replace(DEGREE, "") === needle)) tier = 1;
    else if (grammatical && stem && stem.endsWith(needle) && [...stem].length <= [...needle].length + 3
      && !NEGATIVE_PREFIX.test(stem.slice(0, -needle.length))) tier = 2;
    else if (stem && includes(stem, needle) && [...stem].length <= [...needle].length + 6) tier = 4;
    if (tier >= 1 && tier < 4 && context?.anchors?.some(anchor => atoms.some(other => other.partOfSpeech === anchor.partOfSpeech
      && lexicalStem(other) === anchor.term && !TECHNICAL.has(other.domain)))) tier -= 0.1;
    if (TECHNICAL.has(atom.domain)) tier += 3;
    if (/(?:拼音|音译|译音|姓氏|人名|地名|单位|符号|代号|缩写)/u.test(atom.annotation)) tier += 3;
    if (tier >= 4 && /(?:单位|拼音|音译|代码|缩写|符号)/u.test(atom.text)) tier += 1;
    const sensePenalty = Math.min(0.2, Math.max(0, (atom.senseOrdinal || 1) - 1) * 0.01);
    best = Math.min(best, tier + rolePenalty(atom, hint) + sensePenalty);
  }
  return Number.isFinite(best) ? best : null;
}

/** Decode only public source tuples. The outer hash and dictionary-version
 * binding are verified by the loader; these structural checks also bound
 * allocations and prevent malformed metadata from becoming a definition. */
export function parseChineseRanking(payload, manifest) {
  const fail = () => { const error = new Error("中文检索索引校验失败，请刷新后重试。"); error.code = "invalid_dictionary_data"; throw error; };
  const exactKeys = (item, wanted) => item && typeof item === "object" && !Array.isArray(item)
    && Object.keys(item).length === wanted.length && wanted.every(key => Object.hasOwn(item, key));
  if (!exactKeys(payload, ["schemaVersion", "dictionaryVersion", "records"]) || payload.schemaVersion !== 1
    || payload.dictionaryVersion !== manifest.version || !Array.isArray(payload.records)
    || payload.records.length !== manifest.counts.records) fail();
  const records = new Map(); let previous = -1;
  const safe = (value, maximum, empty = false) => typeof value === "string" && value.length <= maximum
    && (empty || value.trim()) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value);
  for (const row of payload.records) {
    if (!Array.isArray(row) || row.length !== 3) fail();
    const [id, term, tuples] = row;
    if (!Number.isSafeInteger(id) || id < 0 || id > 30_000_000 || id <= previous || !safe(term, 200)
      || !/[\p{Script=Latin}\d]/u.test(term) || /[<>\p{Script=Han}\u0000-\u001f\u007f]/u.test(term) || /javascript\s*:/iu.test(term)
      || !Array.isArray(tuples) || !tuples.length || tuples.length > 9) fail();
    let hash = 2166136261;
    for (const char of term.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-US")) {
      hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0;
    }
    if (id % 128 !== hash % 128) fail();
    const variants = tuples.map(tuple => {
      if (!Array.isArray(tuple) || tuple.length !== 3 || !safe(tuple[0], 200, true)
        || !manifest.sources.has(tuple[1]) || !safe(tuple[2], 2000) || !/\p{Script=Han}/u.test(tuple[2])) fail();
      return { partOfSpeech: tuple[0], source: tuple[1], meaning: tuple[2] };
    });
    const [primary, ...alternatives] = variants;
    records.set(id, { id, term, ...primary, variants: alternatives }); previous = id;
  }
  return records;
}
