import { chineseMeaningAtoms, matchesChineseSearchMeaning } from "./chinese-search.js?v=111";

// These are source-definition atoms for the physical temperature sense. They
// do not expand 热 into 热情, 热心, 亲热, 热闹, or a technical explanatory mention.
// English heads are never manufactured or whitelisted by this ranking rule.
const TEMPERATURE = /^(?:闷热(?:的)?|炎热(?:的)?|酷热(?:的)?|炽热(?:的)?|灼热(?:的)?|热得[^,，;；。]*|闷热得[^,，;；。]*)(?:$|[（(])/u;
const HEAT_QUERY = new Set(["热", "热的"]);
export const chineseRankingNeedle = query => HEAT_QUERY.has(query) ? "热" : query;

/** A deterministic relevance tier for one unchanged source definition.
 * Whole definition atoms outrank broader senses; mentions remain searchable
 * after actual meanings. Null means this source variant does not match. */
export function chineseVariantRank(meaning, query) {
  if (typeof meaning !== "string" || typeof query !== "string") return null;
  const normalized = meaning.normalize("NFKC");
  const heat = HEAT_QUERY.has(query), needle = heat ? "热" : query;
  if (!normalized.includes(needle)) return null;
  const atoms = chineseMeaningAtoms(meaning);
  if (heat) {
    // A technical label must not lend its incidental 热 atom the priority of an
    // ordinary temperature definition (e.g. hyperthermia or a heat unit).
    const ordinary = meaning.split(/\r?\n/u).filter(line => !/^\s*\[(?:医|化|计|物|物理)\]/u.test(line)).join("\n");
    if (matchesChineseSearchMeaning(ordinary, needle)) return 0;
    if (atoms.some(atom => /^闷热(?=$|的$|得|、|[（(])/u.test(atom) || /^热得/u.test(atom))) return 1;
    if (atoms.some(atom => TEMPERATURE.test(atom))) return 2;
    // Emotional/technical compounds stay available below physical meanings.
    return 5;
  }
  if (matchesChineseSearchMeaning(meaning, query)) return 0;
  // A short dictionary gloss beginning with the complete query is a closer
  // lexical match than an embedded compound or an explanatory sentence.
  if (atoms.some(atom => atom.startsWith(query) && [...atom].length <= [...query].length + 6)) return 2;
  if (atoms.some(atom => atom.includes(query) && [...atom].length <= [...query].length + 6)) return 3;
  return 4;
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
