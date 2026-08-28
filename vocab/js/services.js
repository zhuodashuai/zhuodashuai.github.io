import { LOCAL_CORRECTIONS, LOCAL_ENTRIES, STOP_WORDS } from "./data.js";
import { classifyEntry, cleanEnglishInput, normalizeKey, validateEntryInput } from "./schema.js";

const TIMEOUT_MS = 7000;

export function normalizeInput(value) {
  return normalizeKey(value);
}

export function validateEnglishInput(value) {
  const cleaned = validateEntryInput(value);
  return classifyEntry(cleaned) === "quote" ? cleaned : normalizeKey(cleaned);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function applyLocalCorrections(term) {
  let changed = false;
  const candidates = [];
  const tokens = term.split(" ").map((token) => {
    const replacement = LOCAL_CORRECTIONS[token];
    if (!replacement) return token;
    changed = true;
    candidates.push(replacement);
    return replacement;
  });
  return { changed, chosen: tokens.join(" "), candidates };
}

async function checkSpelling(term) {
  const local = applyLocalCorrections(term);
  if (local.changed) {
    return {
      status: "autocorrected",
      original: term,
      chosen: local.chosen,
      confidence: .98,
      candidates: local.candidates,
      source: "local"
    };
  }

  const form = new URLSearchParams({ language: "en-US", text: term });
  const data = await fetchWithTimeout("https://api.languagetool.org/v2/check", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  });
  const misspellings = (data.matches || []).filter(
    (match) => match.rule?.issueType === "misspelling" && match.replacements?.[0]?.value
  );
  if (!misspellings.length) {
    return { status: "exact", original: term, chosen: term, confidence: 1, candidates: [], source: "LanguageTool" };
  }

  let chosen = term;
  const candidates = [];
  for (const match of [...misspellings].sort((a, b) => b.offset - a.offset)) {
    const replacement = match.replacements[0].value.toLowerCase();
    chosen = `${chosen.slice(0, match.offset)}${replacement}${chosen.slice(match.offset + match.length)}`;
    candidates.push(...match.replacements.slice(0, 3).map((item) => item.value.toLowerCase()));
  }
  chosen = normalizeInput(chosen);
  return {
    status: "autocorrected",
    original: term,
    chosen,
    confidence: .88,
    candidates: [...new Set(candidates)].slice(0, 3),
    source: "LanguageTool"
  };
}

function dictionaryHeadword(term) {
  if (!term.includes(" ")) return term;
  return term.split(" ").find((token) => !STOP_WORDS.has(token)) || term.split(" ")[0];
}

async function getDictionaryEntry(term) {
  const headword = dictionaryHeadword(term);
  const endpoint = `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(headword)}?translations=true`;
  const data = await fetchWithTimeout(endpoint);
  const entries = data.entries || [];
  if (!entries.length) return { headword, sourceUrl: data.source?.url || "", entries: [] };

  const preferred = entries.find((entry) => entry.partOfSpeech === "verb") || entries[0];
  const sense = preferred.senses?.find((item) => item.definition) || preferred.senses?.[0] || {};
  const pronunciation = preferred.pronunciations?.find((item) => item.type === "ipa")?.text || "";
  const forms = [...new Set((preferred.forms || []).map((item) => item.word).filter(Boolean))];
  const example = sense.examples?.find(Boolean) || "";
  return {
    headword,
    partOfSpeech: preferred.partOfSpeech || "",
    phonetic: pronunciation,
    definition: sense.definition || "",
    example,
    forms,
    sourceUrl: data.source?.url || `https://en.wiktionary.org/wiki/${encodeURIComponent(headword)}`,
    entries
  };
}

function decodeEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value || "";
  return textarea.value;
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

async function translateToChinese(text) {
  if (!text) return "";
  const endpoint = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncateUtf8(text, 480))}&langpair=en%7Czh-CN`;
  const data = await fetchWithTimeout(endpoint);
  const translated = decodeEntities(data.responseData?.translatedText || "").trim();
  if (!translated || normalizeInput(translated) === normalizeInput(text)) return "";
  return translated;
}

function stripSearchMarkup(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

async function searchWikiquote(text) {
  const exact = `"${text.slice(0, 260)}"`;
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: exact,
    srnamespace: "0",
    srlimit: "6",
    format: "json",
    origin: "*"
  });
  const data = await fetchWithTimeout(`https://en.wikiquote.org/w/api.php?${params}`, {
    headers: { "Api-User-Agent": "Wordbook/2.0 (https://zhuodashuai.github.io/vocab/)" }
  });
  return (data.query?.search || []).map((result) => ({
    title: result.title,
    url: `https://en.wikiquote.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
    snippet: stripSearchMarkup(result.snippet)
  }));
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function lookupQuotation(original, entryType) {
  const warnings = [];
  let meaning = "";
  let attributionCandidates = [];
  if (isOffline()) {
    warnings.push("当前处于离线状态；中文翻译和出处候选可联网后重新整理。");
  } else {
    try {
      meaning = await translateToChinese(original);
    } catch {
      warnings.push("中文翻译暂时不可用，请手动补充。");
    }
    try {
      attributionCandidates = await searchWikiquote(original);
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
    meaning: meaning || "（请补充中文翻译）",
    definition: "",
    exampleEn: "",
    exampleZh: "",
    usage: entryType === "proverb" ? "谚语的作者通常未知；请记录语言、地区和最早可核实的文本来源。" : "出处搜索结果只是候选，请核对原始演讲、书籍、文章或可靠影像记录。",
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
    sources: attributionCandidates.length ? ["Wikiquote candidate", meaning ? "MyMemory" : null].filter(Boolean) : [meaning ? "MyMemory" : null].filter(Boolean),
    warnings
  };
}

function localDraft(term, correction) {
  const source = LOCAL_ENTRIES[term];
  if (!source) return null;
  return {
    rawInput: correction.original,
    term,
    normalized: term,
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
    warnings: []
  };
}

export async function lookupTerm(rawInput, { skipCorrection = false, forceEntryType = "" } = {}) {
  const cleaned = validateEntryInput(rawInput);
  const detectedType = ["quote", "proverb"].includes(forceEntryType) ? forceEntryType : classifyEntry(cleaned);
  if (detectedType === "quote" || detectedType === "proverb") {
    return lookupQuotation(cleaned, detectedType);
  }

  const original = normalizeKey(cleaned);
  let correction = { status: "exact", original, chosen: original, confidence: 1, candidates: [], source: "local" };
  const warnings = [];

  if (isOffline()) {
    warnings.push("当前处于离线状态；已使用本地纠错，可手动填写其余内容。");
    const local = applyLocalCorrections(original);
    if (!skipCorrection && local.changed) {
      correction = { status: "autocorrected", original, chosen: local.chosen, confidence: .98, candidates: local.candidates, source: "local" };
    }
  } else if (!skipCorrection && !LOCAL_ENTRIES[original]) {
    try {
      correction = await checkSpelling(original);
    } catch {
      warnings.push("拼写服务暂时不可用，已保留原输入。");
    }
  }

  const term = correction.chosen;
  const curated = localDraft(term, correction);
  if (curated) return { ...curated, warnings: [...curated.warnings, ...warnings] };

  let dictionary = null;
  if (!isOffline()) {
    try {
      dictionary = await getDictionaryEntry(term);
    } catch {
      warnings.push("英文字典暂时不可用，可先手动补充内容后保存。");
    }
  }

  let meaning = LOCAL_ENTRIES[term]?.meaning || "";
  if (!isOffline()) {
    try {
      meaning ||= await translateToChinese(term);
    } catch {
      warnings.push("中文翻译暂时不可用，释义仍可手动填写。");
    }
  }

  let exampleZh = "";
  if (!isOffline() && dictionary?.example) {
    try {
      exampleZh = await translateToChinese(dictionary.example);
    } catch {
      warnings.push("例句翻译暂时不可用。");
    }
  }

  const phrase = term.includes(" ");
  const partOfSpeech = dictionary?.partOfSpeech || LOCAL_ENTRIES[term]?.partOfSpeech || (phrase ? "phrase" : "word");
  const tags = [phrase ? "短语" : "单词"];
  if (partOfSpeech) tags.push(partOfSpeech);

  return {
    rawInput: original,
    term,
    normalized: term,
    headword: dictionary?.headword || dictionaryHeadword(term),
    entryType: phrase ? "phrase" : "word",
    correction,
    phonetic: dictionary?.phonetic || "",
    partOfSpeech,
    meaning: meaning || "（请补充中文释义）",
    definition: dictionary?.definition || "",
    exampleEn: dictionary?.example || "",
    exampleZh,
    usage: "",
    forms: dictionary?.forms || [],
    tags: [...new Set(tags)],
    sources: [correction.source, dictionary ? "FreeDictionaryAPI" : null, meaning ? "MyMemory" : null].filter(Boolean),
    sourceUrl: dictionary?.sourceUrl || "",
    warnings
  };
}
