import { lookupCoreEntry } from "./core-dictionary.js?v=75";
import { canonicalizeLookupInput, normalizeEnglish, validateEnglishInput } from "./wordbook-schema.js?v=75";

const POS = Object.freeze({
  n: "noun", noun: "noun", v: "verb", vt: "verb", vi: "verb", verb: "verb",
  a: "adjective", adj: "adjective", adjective: "adjective", ad: "adverb", adv: "adverb", adverb: "adverb",
  pron: "pronoun", pronoun: "pronoun", prep: "preposition", preposition: "preposition",
  conj: "conjunction", conjunction: "conjunction", interj: "interjection", int: "interjection",
  num: "numeral", numeral: "numeral", art: "article", article: "article", det: "determiner",
  aux: "auxiliary verb", modal: "modal verb", abbr: "abbreviation", abbreviation: "abbreviation"
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
  const fallback = String(row.partOfSpeech || "").toLowerCase().split(/[\s,;·/]+/).map(value => POS[value]).filter(Boolean);
  return {
    term: row.word, partOfSpeech: [...new Set(labels.length ? labels : fallback)].join(" · "),
    meaning: groups.map((group, index) => `${numeral(index)} ${group}`).join("\n"), source: "ECDICT"
  };
}

/** Only downloads this site's static dictionary. No query, AI or remote fallback. */
export async function lookupPersonalDictionary(input, { signal, timeoutMs = 20_000, dictionary, fetchImpl = globalThis.fetch } = {}) {
  if (typeof input !== "string" || [...input].length > 200) throw new Error("请输入不超过 200 个字符的英文词或短语。");
  const term = validateEnglishInput(canonicalizeLookupInput(input));
  if (signal?.aborted) throw new Error("查词已停止。");
  let rejectStop;
  const stopped = new Promise((_, reject) => { rejectStop = reject; });
  const stop = () => rejectStop(new Error("本地词典读取已停止，请重新查询。"));
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const row = await Promise.race([
      lookupCoreEntry(normalizeEnglish(term), { dictionary, timeoutMs, fetchImpl: (url, options) => fetchImpl(url, { ...options, credentials: "omit" }) }),
      stopped
    ]);
    return personalDictionaryResult(row);
  } finally { signal?.removeEventListener("abort", stop); }
}
