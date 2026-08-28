import { EXACT_SPELLINGS, LOCAL_CORRECTIONS, LOCAL_ENTRIES } from "./data.js?v=13";
import { lookupCoreEntry, normalizeCoreKey } from "./core-dictionary.js?v=13";
import { classifyEntry, cleanEnglishInput, normalizeKey, validateEntryInput } from "./schema.js?v=13";

const TIMEOUT_MS = 7000;
const LEXICAL_TOKEN = /^[\p{Script=Latin}\p{Mark}\p{Number}.'’+\-/#&]+$/u;
const UNSAFE_SENSE = /\b(obsolete|archaic|dated|rare|nonstandard|misspelling|incorrect spelling|typographical error)\b/i;
const HAN = /\p{Script=Han}/u;
const MYMEMORY_WARNING = /mymemory\s+warning|available free translations|quota|query length limit|no query specified|translated\.net\/doc/i;

export function normalizeInput(value) {
  return normalizeKey(value);
}

export function validateLookupInput(value) {
  const cleaned = cleanEnglishInput(value);
  if (!cleaned) throw new Error("请输入一个英文单词、短语或名言。");
  if (cleaned.length > 500) throw new Error("一次请输入不超过 500 个字符。");
  // Technical lexical tokens such as C++, 24/7 and COVID-19 are valid even
  // though the general prose validator intentionally excludes some symbols.
  if (!cleaned.includes(" ") && LEXICAL_TOKEN.test(cleaned)
      && /[\p{Script=Latin}\p{Number}]/u.test(cleaned)) return cleaned;
  return validateEntryInput(cleaned);
}

export function validateEnglishInput(value) {
  return validateLookupInput(value);
}

export function classifyLookupInput(value, forceEntryType = "") {
  if (["word", "phrase", "quote", "proverb"].includes(forceEntryType)) return forceEntryType;
  const cleaned = validateLookupInput(value);
  if (!cleaned.includes(" ") && LEXICAL_TOKEN.test(cleaned)) return "word";
  return classifyEntry(cleaned);
}

async function fetchWithTimeout(url, options = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("当前环境无法联网查询。");
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response?.ok) throw new Error(`Request failed: ${response?.status || "network"}`);
    return await response.json();
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function decodeEntities(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return String(value || "").replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, body) => {
    if (body[0] !== "#") return named[body.toLowerCase()] ?? entity;
    const hexadecimal = body[1]?.toLowerCase() === "x";
    const number = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isFinite(number) || number < 0 || number > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(number);
    } catch {
      return entity;
    }
  });
}

function flattenSenses(senses, output = []) {
  for (const sense of Array.isArray(senses) ? senses : []) {
    if (!sense || typeof sense !== "object") continue;
    output.push(sense);
    flattenSenses(sense.subsenses, output);
  }
  return output;
}

function safeSense(sense) {
  const definition = String(sense?.definition || "").trim();
  const tags = Array.isArray(sense?.tags) ? sense.tags.join(" ") : "";
  return Boolean(definition) && !UNSAFE_SENSE.test(`${tags} ${definition}`);
}

function simplifiedTranslation(value) {
  const text = String(value || "").trim();
  if (!HAN.test(text)) return "";
  const pieces = text.split(/\s*\/\s*/).map((item) => item.trim()).filter((item) => HAN.test(item));
  return (pieces.at(-1) || text).slice(0, 120);
}

export function selectDictionaryData(data, requestedTerm = "") {
  const entries = Array.isArray(data?.entries) ? data.entries.filter((entry) => entry && typeof entry === "object") : [];
  if (!entries.length) {
    return {
      headword: String(data?.word || requestedTerm).trim() || requestedTerm,
      entries: [], selectedEntry: null, selectedSenses: [], partOfSpeech: "", phonetic: "",
      definitions: [], example: "", forms: [], translations: [], sourceUrl: data?.source?.url || "",
      hasUsableSenses: false
    };
  }

  // Wiktionary's first entry is the provider's general/default ordering.  The
  // old implementation overrode it with any verb entry, which turned hip into
  // a specialist sports verb.  Preserve entry order and only filter low-value
  // senses inside the chosen entry.
  const selectedEntry = entries[0];
  const allSenses = flattenSenses(selectedEntry.senses);
  const safeSenses = allSenses.filter(safeSense);
  // Preserve the provider's sense order.  An example sentence is not evidence
  // that a sense is more common, and unsafe-only entries (for example
  // "Misspelling of occurred") must remain unusable so spelling correction can
  // continue to LanguageTool.
  const selectedSenses = safeSenses.slice(0, 3);
  const definitions = selectedSenses.map((sense) => String(sense.definition || "").trim()).filter(Boolean);
  const example = selectedSenses.flatMap((sense) => Array.isArray(sense.examples) ? sense.examples : [])
    .find((item) => typeof item === "string" && item.trim())?.trim() || "";
  const phonetic = (Array.isArray(selectedEntry.pronunciations) ? selectedEntry.pronunciations : [])
    .find((item) => item?.type === "ipa" && item.text)?.text || "";
  const forms = [...new Set((Array.isArray(selectedEntry.forms) ? selectedEntry.forms : [])
    .map((item) => String(item?.word || "").trim()).filter(Boolean))].slice(0, 12);
  const translations = [];
  for (const sense of selectedSenses) {
    for (const translation of Array.isArray(sense.translations) ? sense.translations : []) {
      const code = String(translation?.language?.code || "").toLowerCase();
      const name = String(translation?.language?.name || "").toLowerCase();
      if (!(["zh", "cmn"].includes(code) || name === "chinese mandarin")) continue;
      const word = simplifiedTranslation(translation.word);
      if (word && !translations.includes(word)) translations.push(word);
    }
  }
  return {
    headword: String(data?.word || requestedTerm).trim() || requestedTerm,
    entries,
    selectedEntry,
    selectedSenses,
    partOfSpeech: String(selectedEntry.partOfSpeech || "").trim(),
    phonetic: String(phonetic).trim(),
    definitions,
    example,
    forms,
    translations: translations.slice(0, 8),
    sourceUrl: String(data?.source?.url || `https://en.wiktionary.org/wiki/${encodeURIComponent(requestedTerm)}`),
    hasUsableSenses: selectedSenses.length > 0
  };
}

export async function fetchDictionaryEntry(term, { fetchImpl = globalThis.fetch } = {}) {
  const endpoint = `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(term)}?translations=true`;
  const data = await fetchWithTimeout(endpoint, {}, fetchImpl);
  return selectDictionaryData(data, term);
}

async function safeCoreLookup(term, options, warnings) {
  try {
    if (typeof options.coreLookup === "function") return await options.coreLookup(term);
    return await lookupCoreEntry(term, {
      dictionary: options.coreDictionary,
      fetchImpl: options.fetchImpl || globalThis.fetch,
      url: options.coreUrl
    });
  } catch {
    warnings.push("本地英汉词典暂时无法读取；没有用机器翻译冒充可信释义。");
    return null;
  }
}

async function safeDictionaryLookup(term, options, warnings) {
  if (options.offline ?? isOffline()) return null;
  try {
    if (typeof options.dictionaryLookup === "function") return await options.dictionaryLookup(term);
    return await fetchDictionaryEntry(term, { fetchImpl: options.fetchImpl || globalThis.fetch });
  } catch {
    warnings.push("Wiktionary 英文补充暂时不可用，已保留本地可靠内容。");
    return null;
  }
}

function exactCorrection(original, chosen, source) {
  return { status: "exact", original, chosen, confidence: 1, candidates: [], source };
}

function corrected(original, chosen, candidates, source) {
  return { status: "autocorrected", original, chosen, confidence: source === "local" ? 1 : .8, candidates, source };
}

function editDistance(left, right) {
  const a = [...normalizeCoreKey(left)];
  const b = [...normalizeCoreKey(right)];
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function isSafeSpellingCandidate(original, candidate) {
  const source = cleanEnglishInput(original);
  const target = cleanEnglishInput(candidate);
  if (!source || !target || source === target || target.length > 100) return false;
  if (!target.split(/\s+/).every((token) => LEXICAL_TOKEN.test(token))) return false;
  if (source.split(/\s+/).length !== target.split(/\s+/).length) return false;
  const maximum = Math.max(2, Math.ceil([...source].length * .3));
  return editDistance(source, target) <= maximum;
}

function languageToolCandidate(term, data) {
  const matches = (Array.isArray(data?.matches) ? data.matches : [])
    .filter((match) => match?.rule?.issueType === "misspelling" && match.replacements?.[0]?.value)
    .sort((a, b) => Number(b.offset) - Number(a.offset));
  if (!matches.length) return null;
  let chosen = term;
  const candidates = [];
  for (const match of matches) {
    const offset = Number(match.offset);
    const length = Number(match.length);
    const replacement = String(match.replacements[0].value || "");
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 1
        || offset + length > chosen.length || !LEXICAL_TOKEN.test(replacement)) return null;
    chosen = `${chosen.slice(0, offset)}${replacement}${chosen.slice(offset + length)}`;
    candidates.push(...match.replacements.slice(0, 3).map((item) => String(item.value || "")).filter(Boolean));
  }
  chosen = cleanEnglishInput(chosen);
  if (!isSafeSpellingCandidate(term, chosen)) return null;
  return { chosen, candidates: [...new Set(candidates)].slice(0, 5) };
}

async function fetchLanguageTool(term, options) {
  if (typeof options.languageToolLookup === "function") return options.languageToolLookup(term);
  // The public API only activates English spell checking for a concrete
  // language variant.  en-GB accepts the British spellings this app preserves;
  // exact dictionary/core hits are resolved before this fallback runs.
  const form = new URLSearchParams({ language: "en-GB", text: term });
  return fetchWithTimeout("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  }, options.fetchImpl || globalThis.fetch);
}

async function verifyCandidate(candidate, options, warnings) {
  const key = normalizeCoreKey(candidate);
  if (LOCAL_ENTRIES[key]) return { chosen: key, core: null, dictionary: null, source: "curated" };
  const exactDisplay = EXACT_SPELLINGS.get(key);
  const core = await safeCoreLookup(candidate, options, warnings);
  if (core) return { chosen: core.word || candidate, core, dictionary: null, source: "ECDICT" };
  const dictionary = await safeDictionaryLookup(candidate, options, warnings);
  if (dictionary?.hasUsableSenses) return { chosen: exactDisplay || candidate, core: null, dictionary, source: "FreeDictionaryAPI" };
  return null;
}

export async function resolveSpelling(rawInput, options = {}) {
  const original = validateLookupInput(rawInput);
  const key = normalizeCoreKey(original);
  const warnings = [];
  const local = LOCAL_ENTRIES[key] || null;
  if (local) {
    return { original, chosen: key, correction: exactCorrection(original, key, "curated"), core: null, dictionary: null, warnings };
  }

  // ECDICT and Wiktionary both contain descriptive entries for some common
  // misspellings.  In a learning app those rows must not outrank an explicit,
  // human-reviewed correction.  The opt-out remains meaningful: only callers
  // that set skipCorrection preserve the original spelling.
  const localReplacement = options.skipCorrection ? null : LOCAL_CORRECTIONS[key];
  if (localReplacement) {
    const verified = await verifyCandidate(localReplacement, options, warnings);
    if (verified) {
      return {
        original,
        chosen: verified.chosen,
        correction: corrected(original, verified.chosen, [verified.chosen], "local"),
        core: verified.core,
        dictionary: verified.dictionary,
        warnings
      };
    }
  }

  const core = await safeCoreLookup(original, options, warnings);
  const exactDisplay = EXACT_SPELLINGS.get(key);
  if (core || exactDisplay) {
    const chosen = core?.word || exactDisplay || original;
    return { original, chosen, correction: exactCorrection(original, chosen, core ? "ECDICT" : "curated-spelling"), core, dictionary: null, warnings };
  }

  const dictionary = await safeDictionaryLookup(original, options, warnings);
  if (dictionary?.hasUsableSenses || options.skipCorrection) {
    return {
      original,
      chosen: original,
      correction: exactCorrection(original, original, dictionary?.hasUsableSenses ? "FreeDictionaryAPI" : "unchecked"),
      core: null,
      dictionary,
      warnings
    };
  }

  if (!(options.offline ?? isOffline())) {
    try {
      const suggestion = languageToolCandidate(original, await fetchLanguageTool(original, options));
      if (suggestion) {
        const verified = await verifyCandidate(suggestion.chosen, options, warnings);
        if (verified) {
          return {
            original,
            chosen: verified.chosen,
            correction: corrected(original, verified.chosen, suggestion.candidates, "LanguageTool + dictionary verification"),
            core: verified.core,
            dictionary: verified.dictionary,
            warnings
          };
        }
      }
    } catch {
      warnings.push("拼写建议服务暂时不可用；已保留你的原始输入。");
    }
  }

  return {
    original,
    chosen: original,
    correction: { status: "unchecked", original, chosen: original, confidence: 0, candidates: [], source: "unverified" },
    core: null,
    dictionary: null,
    warnings
  };
}

function coreDefinitions(core) {
  return String(core?.definition || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function combineDefinitions(dictionary, core) {
  const coreValues = coreDefinitions(core);
  const dictionaryValues = dictionary?.definitions || [];
  // Human-reviewed local phrase definitions are deliberately aligned with the
  // Chinese core meanings.  Do not append homonymous live senses to this
  // reviewed layer: a later line can be grammatically valid yet contradict the
  // Chinese meaning shown on the same card.
  const values = core?.tags?.includes("editorial")
    ? coreValues
    : [...dictionaryValues, ...coreValues];
  const result = [];
  for (const value of values) {
    const comparable = value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
    if (!comparable || result.some((item) => item.comparable === comparable)) continue;
    result.push({ text: value, comparable });
    if (result.length >= 3) break;
  }
  return result.map((item) => item.text).join("\n");
}

function localDraft(term, correction, warnings = []) {
  const source = LOCAL_ENTRIES[normalizeCoreKey(term)];
  if (!source) return null;
  return {
    rawInput: correction.original,
    term,
    normalized: normalizeKey(term),
    headword: source.headword || term,
    entryType: source.entryType || (term.includes(" ") ? "phrase" : "word"),
    correction,
    phonetic: source.phonetic || "",
    partOfSpeech: source.partOfSpeech || "",
    meaning: source.meaning || "",
    definition: source.definition || "",
    exampleEn: source.exampleEn || "",
    exampleZh: source.exampleZh || "",
    usage: source.usage || "",
    forms: source.forms || [],
    tags: source.tags || [term.includes(" ") ? "短语" : "单词"],
    sources: ["curated"],
    sourceTitle: "卓同学的秘密单词屋 · 人工校订",
    sourceUrl: "",
    warnings,
    needsAttention: false,
    quality: { status: "trusted", autoSave: true, source: "人工校订" }
  };
}

export async function enrichResolved(resolution, options = {}) {
  const original = validateLookupInput(resolution?.original || resolution?.chosen || resolution?.term);
  const term = validateLookupInput(resolution?.chosen || resolution?.term || original);
  const warnings = [...(Array.isArray(resolution?.warnings) ? resolution.warnings : [])];
  const correction = resolution?.correction || exactCorrection(original, term, "unchecked");
  const curated = localDraft(term, correction, warnings);
  if (curated) return curated;

  let core = resolution?.core || null;
  if (!core) core = await safeCoreLookup(term, options, warnings);
  let dictionary = resolution?.dictionary || null;
  if (!dictionary) dictionary = await safeDictionaryLookup(term, options, warnings);

  const dictionaryMeaning = dictionary?.translations?.join("；") || "";
  const meaning = core?.meaning || dictionaryMeaning;
  let quality;
  if (core?.meaning) {
    quality = { status: "trusted", autoSave: true, source: "ECDICT 本地英汉词典" };
  } else if (dictionaryMeaning) {
    quality = { status: "trusted", autoSave: true, source: "Wiktionary 分义项人工翻译" };
  } else {
    quality = {
      status: "incomplete",
      autoSave: false,
      source: dictionary?.entries?.length ? "Wiktionary 英文词条" : "无可靠释义来源",
      reason: "没有找到可核验的中文词典释义"
    };
  }
  if (!meaning) warnings.push("没有找到可靠中文释义，已留空并标记待完善；没有写入机器猜测。");

  const entryType = options.forceEntryType === "phrase" || term.includes(" ") ? "phrase" : "word";
  const partOfSpeech = dictionary?.partOfSpeech || core?.partOfSpeech || (entryType === "phrase" ? "phrase" : "word");
  const tags = [entryType === "phrase" ? "短语" : "单词"];
  if (partOfSpeech) tags.push(partOfSpeech);
  for (const tag of core?.tags || []) tags.push(tag.toUpperCase());
  const forms = [...new Set([...(dictionary?.forms || []), ...(core?.forms || [])])].slice(0, 15);
  const hasDictionaryContent = dictionary?.hasUsableSenses === true;
  const sourceUrl = hasDictionaryContent ? (dictionary?.sourceUrl || "") : "";

  return {
    rawInput: original,
    term,
    normalized: normalizeKey(term),
    headword: term,
    entryType,
    correction,
    phonetic: dictionary?.phonetic || core?.phonetic || "",
    partOfSpeech,
    meaning,
    definition: combineDefinitions(dictionary, core),
    // A live example can belong to a different homonymous phrasal sense
    // (for example "come across the street" rather than "find by chance").
    // Without a sentence-level alignment signal, omitting examples for every
    // multiword phrase is safer than displaying one beside a different sense.
    exampleEn: entryType === "phrase" ? "" : (dictionary?.example || ""),
    exampleZh: "",
    usage: "",
    forms,
    tags: [...new Set(tags)],
    sources: [core ? "ECDICT" : null, hasDictionaryContent ? "FreeDictionaryAPI / Wiktionary" : null].filter(Boolean),
    sourceTitle: sourceUrl ? `Wiktionary: ${term}` : (core ? "ECDICT" : ""),
    sourceUrl,
    warnings,
    needsAttention: quality.status !== "trusted" || !meaning,
    quality
  };
}

function truncateUtf8(value, maximumBytes) {
  const encoder = new TextEncoder();
  let result = "";
  let size = 0;
  for (const character of String(value || "")) {
    const length = encoder.encode(character).length;
    if (size + length > maximumBytes) break;
    result += character;
    size += length;
  }
  return result;
}

function latinWordCount(value) {
  return (String(value || "").match(/[\p{Script=Latin}\p{Mark}]+(?:['-][\p{Script=Latin}\p{Mark}]+)*/gu) || []).length;
}

export function validateMyMemoryPayload(data, sourceText) {
  const translated = decodeEntities(data?.responseData?.translatedText || "").trim();
  if (Number(data?.responseStatus) !== 200 || data?.quotaFinished === true || data?.exception_code) {
    return { ok: false, text: "", reason: "provider-status" };
  }
  if (MYMEMORY_WARNING.test(`${data?.responseDetails || ""} ${translated}`)) {
    return { ok: false, text: "", reason: "provider-warning" };
  }
  // A translation memory has no context for isolated vocabulary.  Live tests
  // returned hip -> "kamus在线bm ke bi" at match .99/quality 100, run -> 得分,
  // and light -> 光污染.  No score threshold can make those dictionary-safe.
  if (latinWordCount(sourceText) < 3) return { ok: false, text: "", reason: "bare-vocabulary" };
  if (!translated || normalizeCoreKey(translated) === normalizeCoreKey(sourceText) || !HAN.test(translated)) {
    return { ok: false, text: "", reason: "not-chinese" };
  }
  const letters = [...translated].filter((character) => /[\p{Letter}\p{Number}]/u.test(character));
  const hanCount = letters.filter((character) => HAN.test(character)).length;
  if (!letters.length || hanCount / letters.length < .35) return { ok: false, text: "", reason: "mixed-language-garbage" };
  const match = Number(data?.responseData?.match);
  if (!Number.isFinite(match) || match < .6) return { ok: false, text: "", reason: "weak-match" };
  return { ok: true, text: translated, match, reason: "machine-candidate" };
}

async function translateCandidate(text, options = {}) {
  if (!text) return null;
  const endpoint = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncateUtf8(text, 480))}&langpair=en%7Czh-CN&mt=1`;
  const data = typeof options.translationLookup === "function"
    ? await options.translationLookup(text)
    : await fetchWithTimeout(endpoint, {}, options.fetchImpl || globalThis.fetch);
  const validated = validateMyMemoryPayload(data, text);
  return validated.ok ? validated : null;
}

function stripSearchMarkup(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

async function searchWikiquote(text, options = {}) {
  if (typeof options.wikiquoteLookup === "function") return options.wikiquoteLookup(text);
  const exact = `"${text.slice(0, 260)}"`;
  const params = new URLSearchParams({
    action: "query", list: "search", srsearch: exact, srnamespace: "0", srlimit: "6", format: "json", origin: "*"
  });
  const data = await fetchWithTimeout(`https://en.wikiquote.org/w/api.php?${params}`, {
    headers: { "Api-User-Agent": "ZhuoSecretWordCabinet/3.0 (https://zhuodashuai.github.io/vocab/)" }
  }, options.fetchImpl || globalThis.fetch);
  return (data.query?.search || []).map((result) => ({
    title: result.title,
    url: `https://en.wikiquote.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
    snippet: stripSearchMarkup(result.snippet)
  }));
}

async function lookupQuotation(original, entryType, options = {}) {
  const warnings = [];
  let translation = null;
  let attributionCandidates = [];
  if (options.offline ?? isOffline()) {
    warnings.push("当前处于离线状态；中文翻译和出处候选可联网后重新整理。");
  } else {
    try {
      translation = await translateCandidate(original, options);
      if (!translation) warnings.push("机器翻译没有通过质量检查，中文暂时留空。");
    } catch {
      warnings.push("中文机器翻译暂时不可用，已保持为空。");
    }
    try {
      attributionCandidates = await searchWikiquote(original, options);
      if (attributionCandidates.length) {
        warnings.push("已找到 Wikiquote 候选页面；只有核对原始作品后才能标记为“已核验”。");
      } else {
        warnings.push("暂未找到可靠出处候选，请保留“来源未核验”标记。");
      }
    } catch {
      warnings.push("出处搜索暂时不可用，请稍后重试或手动填写。");
    }
  }
  return {
    rawInput: original,
    term: original,
    normalized: normalizeKey(original),
    headword: original,
    entryType,
    correction: { status: "unchecked", original, chosen: original, confidence: 0, candidates: [], source: "quote" },
    phonetic: "",
    partOfSpeech: entryType,
    meaning: translation?.text || "",
    definition: "",
    exampleEn: "",
    exampleZh: "",
    usage: entryType === "proverb"
      ? "谚语的作者通常未知；请记录语言、地区和最早可核实的文本来源。"
      : "出处搜索结果只是候选，请核对原始演讲、书籍、文章或可靠影像记录。",
    author: "",
    sourceTitle: "",
    sourceUrl: "",
    sourceLocator: "",
    attributionStatus: attributionCandidates.length ? "candidate" : "unverified",
    attributionNote: attributionCandidates.length
      ? "Wikiquote community search candidate; not yet verified against a primary source."
      : "No source candidate found; attribution remains unverified.",
    retrievedAt: new Date().toISOString(),
    attributionCandidates,
    forms: [],
    tags: [entryType === "proverb" ? "谚语" : "名言", "出处待核验"],
    sources: [attributionCandidates.length ? "Wikiquote candidate" : null, translation ? "MyMemory machine candidate" : null].filter(Boolean),
    warnings,
    needsAttention: true,
    quality: {
      status: translation ? "machine-candidate" : "incomplete",
      autoSave: false,
      source: translation ? "MyMemory 机器翻译候选" : "无可靠中文来源",
      reason: "名言翻译与出处必须人工核验"
    }
  };
}

export async function lookupTerm(rawInput, options = {}) {
  const cleaned = validateLookupInput(rawInput);
  const entryType = classifyLookupInput(cleaned, options.forceEntryType || "");
  if (["quote", "proverb"].includes(entryType)) return lookupQuotation(cleaned, entryType, options);
  const resolution = await resolveSpelling(cleaned, options);
  return enrichResolved(resolution, { ...options, forceEntryType: entryType });
}
