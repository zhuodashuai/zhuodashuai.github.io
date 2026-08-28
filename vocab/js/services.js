import { LOCAL_CORRECTIONS, LOCAL_ENTRIES, STOP_WORDS } from "./data.js";

const TIMEOUT_MS = 7000;

export function normalizeInput(value) {
  return value
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function validateEnglishInput(value) {
  const normalized = normalizeInput(value);
  if (!normalized) throw new Error("请输入一个英文单词或短语。");
  if (normalized.length > 80) throw new Error("一次请输入不超过 80 个字符。");
  if (!/^[a-z][a-z' -]*$/i.test(normalized)) {
    throw new Error("这里只需要输入英文单词或短语，不要加入中文或其他符号。");
  }
  return normalized;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
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

async function translateToChinese(text) {
  if (!text) return "";
  const endpoint = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=en%7Czh-CN`;
  const data = await fetchWithTimeout(endpoint);
  const translated = decodeEntities(data.responseData?.translatedText || "").trim();
  if (!translated || normalizeInput(translated) === normalizeInput(text)) return "";
  return translated;
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

export async function lookupTerm(rawInput, { skipCorrection = false } = {}) {
  const original = validateEnglishInput(rawInput);
  let correction = { status: "exact", original, chosen: original, confidence: 1, candidates: [], source: "local" };
  const warnings = [];

  if (!skipCorrection && !LOCAL_ENTRIES[original]) {
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
  try {
    dictionary = await getDictionaryEntry(term);
  } catch {
    warnings.push("英文字典暂时不可用，可先手动补充内容后保存。");
  }

  let meaning = LOCAL_ENTRIES[term]?.meaning || "";
  try {
    meaning ||= await translateToChinese(term);
  } catch {
    warnings.push("中文翻译暂时不可用，释义仍可手动填写。");
  }

  let exampleZh = "";
  if (dictionary?.example) {
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
