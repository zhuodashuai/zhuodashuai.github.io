export const PUBLIC_SCHEMA_VERSION = 3;
export const ENTRY_TYPES = Object.freeze(["word", "phrase", "phrasal-verb", "idiom", "collocation", "sentence", "quote", "proverb"]);
export const ATTRIBUTION_STATES = Object.freeze(["verified", "candidate", "unverified", "disputed"]);

const ENTRY_KEYS = [
  "id", "revision", "originalInput", "term", "normalized", "standardForm", "entryType", "correction",
  "phonetic", "partOfSpeech", "meaning", "definition", "senses", "collocations", "synonyms", "exampleEn", "exampleZh",
  "usage", "register", "confusedWith", "forms", "tags", "author", "sourceTitle", "sourceWork", "sourceDate",
  "sourceUrl", "attributionStatus", "attributionNote", "sources", "organizationMethod", "createdAt", "updatedAt"
];
const CORRECTION_KEYS = ["status", "original", "suggestion", "chosen", "confidence", "source"];
const SENSE_KEYS = ["partOfSpeech", "meaningZh", "definitionEn", "usageNotes", "register", "collocations", "examples", "confusables"];
const EXAMPLE_KEYS = ["en", "zh"];
const SOURCE_KEYS = ["title", "url", "kind", "retrievedAt"];
const LEXICAL_ENTRY_TYPES = new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]);
const STRUCTURED_ORGANIZATION_METHODS = new Set(["ai-cloudflare", "ai-openai", "ai-anthropic", "mixed"]);

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} 格式不正确。`);
  return value;
}

function exactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} 包含缺失或未知字段。`);
  }
}

function string(value, label, maximum, { required = false } = {}) {
  if (typeof value !== "string") throw new Error(`${label} 必须是文本。`);
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error(`${label} 不能为空。`);
  if (cleaned.length > maximum) throw new Error(`${label} 超过 ${maximum} 个字符。`);
  return cleaned;
}

function stringList(value, label, maximumItems, maximumLength) {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} 格式不正确。`);
  return [...new Set(value.map((item) => string(item, label, maximumLength)).filter(Boolean))];
}

function isoDate(value, label) {
  const cleaned = string(value, label, 80, { required: true });
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} 不是有效日期。`);
  return date.toISOString();
}

function normalizeTypography(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeLookupInput(value) {
  const original = normalizeTypography(value);
  let cleaned = original;
  const wrapped = cleaned.match(/^(["'])(.+)\1$/);
  if (wrapped) cleaned = wrapped[2].trim();
  const withoutTerminalPunctuation = cleaned.replace(/[.!?,;:]+$/u, "").trim();
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/u.test(withoutTerminalPunctuation)
    ? withoutTerminalPunctuation
    : original;
}

export function normalizeEnglish(value) {
  return canonicalizeLookupInput(value).toLocaleLowerCase("en-US");
}

export function normalizePublicSearchQuery(value) {
  return normalizeTypography(value)
    .toLocaleLowerCase("zh-CN")
    .replace(/^[\p{P}\p{Z}]+/gu, "")
    .replace(/[\p{P}\p{Z}]+$/gu, "")
    .trim();
}

export function publicEntryMatchesQuery(entry, query) {
  const wanted = normalizePublicSearchQuery(query);
  if (!wanted) return true;
  const searchable = [
    entry?.term,
    entry?.standardForm,
    entry?.meaning,
    entry?.definition,
    entry?.author,
    entry?.sourceTitle,
    ...(Array.isArray(entry?.tags) ? entry.tags : []),
    ...(Array.isArray(entry?.collocations) ? entry.collocations : []),
    ...(Array.isArray(entry?.synonyms) ? entry.synonyms : [])
  ].filter(Boolean).join(" ");
  return normalizeTypography(searchable).toLocaleLowerCase("zh-CN").includes(wanted);
}

const CIRCLED_NUMBER_START = 0x2460;
const SUPPORTED_PARTS_OF_SPEECH = new Set([
  "noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner",
  "article", "interjection", "auxiliary", "participle", "infinitive", "gerund", "idiom", "phrase", "collocation"
]);

function circledNumber(index) {
  return String.fromCodePoint(CIRCLED_NUMBER_START + index);
}

function cleanMeaningItem(value, { stripTrailingSeparator = false } = {}) {
  const text = String(value || "").trim();
  return stripTrailingSeparator ? text.replace(/[；;]\s*$/u, "").trim() : text;
}

function meaningItemWithPartOfSpeech(partOfSpeech, meaning) {
  const label = String(partOfSpeech || "").normalize("NFKC").trim();
  const text = cleanMeaningItem(meaning);
  return label && text ? `${label}: ${text}` : text;
}

function parseCircledMeaning(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const matches = [...text.matchAll(/[①-⑳]/gu)];
  if (!matches.length || text.slice(0, matches[0].index).trim()) return null;
  if (matches.length > 20 || matches.some((match, index) => match[0].codePointAt(0) !== CIRCLED_NUMBER_START + index)) return null;
  const items = matches.map((match, index) => cleanMeaningItem(
    text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length),
    { stripTrailingSeparator: index < matches.length - 1 }
  ));
  return items.every(Boolean) ? items : null;
}

function parseArabicNumberedMeaning(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  // A marker must start the text or follow a real list boundary. The dot form
  // rejects a following digit so values such as "1.5 倍" stay untouched.
  const markerPattern = /(^|[\s；;])(\d{1,2})(?:\.(?!\d)[\t ]*|[、)）][\t ]*)/gu;
  const matches = [...text.matchAll(markerPattern)];
  if (matches.length < 2 || matches[0].index !== 0 || matches.length > 20) return null;
  if (matches.some((match, index) => Number(match[2]) !== index + 1)) return null;
  const items = matches.map((match, index) => cleanMeaningItem(
    text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length),
    { stripTrailingSeparator: index < matches.length - 1 }
  ));
  return items.every(Boolean) ? items : null;
}

function isPartOfSpeechLabel(value) {
  const label = String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return label.length <= 80 && Boolean(canonicalPartOfSpeech(label));
}

export function canonicalPartOfSpeech(value) {
  const raw = normalizeTypography(value).toLocaleLowerCase("en-US").replace(/[._]/g, " ");
  const chinese = new Map([
    ["名词", "noun"], ["动词", "verb"], ["形容词", "adjective"], ["副词", "adverb"],
    ["代词", "pronoun"], ["介词", "preposition"], ["连词", "conjunction"], ["限定词", "determiner"],
    ["冠词", "article"], ["感叹词", "interjection"], ["助动词", "auxiliary"], ["短语", "phrase"],
    ["习语", "idiom"], ["搭配", "collocation"], ["短语动词", "verb"], ["动词短语", "verb"],
    ["名词短语", "noun"], ["副词短语", "adverb"], ["介词短语", "preposition"],
    ["及物动词", "verb"], ["不及物动词", "verb"]
  ]);
  if (chinese.has(raw)) return chinese.get(raw);
  if (!raw || /[·/、，,&]|\b(?:and|or)\b|[和及]/iu.test(raw)) return "";
  const standaloneModifiers = new Map([
    ["countable", "noun"], ["uncountable", "noun"], ["plural", "noun"], ["singular", "noun"], ["proper", "noun"],
    ["transitive", "verb"], ["intransitive", "verb"], ["phrasal", "verb"], ["modal", "auxiliary"],
    ["prepositional", "preposition"], ["adverbial", "adverb"], ["idiomatic", "idiom"], ["expression", "phrase"]
  ]);
  if (standaloneModifiers.has(raw)) return standaloneModifiers.get(raw);
  const aliases = [
    [/\b(phrasal\s+verb|verb\s+phrase|verbs?)\b|^v\b/u, "verb"],
    [/\b(nouns?|noun\s+phrase)\b|^n\b/u, "noun"],
    [/\b(adjectives?|adj)\b/u, "adjective"],
    [/\b(adverbs?|adverbial|adv)\b/u, "adverb"],
    [/\b(pronouns?|pron)\b/u, "pronoun"],
    [/\b(prepositions?|prepositional|prep)\b/u, "preposition"],
    [/\b(conjunctions?|conj)\b/u, "conjunction"],
    [/\b(interjections?|interj)\b/u, "interjection"],
    [/\b(determiners?|det)\b/u, "determiner"],
    [/\b(auxiliary|modal)\b/u, "auxiliary"],
    [/\b(idiom|idiomatic)\b/u, "idiom"],
    [/\b(phrase|expression)\b/u, "phrase"]
  ];
  const canonical = aliases.find(([pattern]) => pattern.test(raw))?.[1] || raw.replace(/\s+/g, " ").trim();
  return SUPPORTED_PARTS_OF_SPEECH.has(canonical) ? canonical : "";
}

function parseStructuredMeaningLines(value) {
  const lines = String(value || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 20) return null;
  const parsed = lines.map((line) => {
    const withoutNumber = line.replace(/^(?:[①-⑳]|\d{1,2}(?:\.(?!\d)|[、)）]))\s*/u, "");
    const match = withoutNumber.match(/^([^:：]{1,80})[:：]\s*(.+)$/u);
    return match ? { partOfSpeech: match[1].trim(), meaning: cleanMeaningItem(match[2]) } : null;
  });
  return parsed.every(Boolean) ? parsed : null;
}

function parsePartOfSpeechLines(value) {
  const lines = String(value || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 20) return null;
  const items = lines.map((line) => {
    const match = line.match(/^([^:：]{1,80})[:：]\s*(.+)$/u);
    return match && isPartOfSpeechLabel(match[1]) ? meaningItemWithPartOfSpeech(match[1], match[2]) : "";
  });
  return items.every(Boolean) ? items : null;
}

function meaningFingerprint(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{S}\s]+/gu, "");
}

export function meaningItemsForDisplay(entry) {
  const meaning = String(entry?.meaning || "").trim();
  // Explicit owner-authored structure wins over possibly stale AI senses.
  const authoredItems = parseCircledMeaning(meaning)
    || parseArabicNumberedMeaning(meaning)
    || parsePartOfSpeechLines(meaning);
  const senses = Array.isArray(entry?.senses) ? entry.senses.slice(0, 20) : [];
  const senseMeaningItems = senses.map((sense) => cleanMeaningItem(sense?.meaningZh)).filter(Boolean);
  const senseDisplayItems = senses
    .map((sense) => meaningItemWithPartOfSpeech(sense?.partOfSpeech, sense?.meaningZh))
    .filter(Boolean);
  if (authoredItems) return authoredItems;
  if (!meaning) return senseDisplayItems;
  // Use structured boundaries for a plain AI aggregate only when its complete
  // semantic character sequence is identical. Any different owner-authored
  // wording remains authoritative even if older AI senses are still attached.
  if (senseMeaningItems.length > 1 && meaningFingerprint(meaning) === meaningFingerprint(senseMeaningItems.join(""))) return senseDisplayItems;
  return [meaning];
}

export function formatMeaningForDisplay(entry) {
  const items = meaningItemsForDisplay(entry);
  if (items.length <= 1) return items[0] || "";
  return items.map((item, index) => `${circledNumber(index)} ${item}`).join("\n");
}

function chineseQualityContent(value) {
  return String(value || "").split(/\r?\n/u).map((line) => {
    const withoutNumber = line.trim().replace(/^(?:[①-⑳]|\d{1,2}(?:\.(?!\d)|[、)）]))\s*/u, "");
    const match = withoutNumber.match(/^([^:：]{1,80})[:：]\s*(.+)$/u);
    return match && isPartOfSpeechLabel(match[1]) ? match[2] : withoutNumber;
  }).join(" ");
}

export function isPlausibleChineseMeaning(value, englishTerm = "") {
  const visible = visibleText(value);
  if (!visible) return false;
  const lowered = visible.toLocaleLowerCase("en-US");
  if (/\b(?:kamus|mymemory)\b|\bbm\s+ke\s+bi\b|translation\s+(?:warning|memory)|used\s+all\s+available\s+free\s+translations|machine\s+translation\s+output/iu.test(lowered)) return false;
  if (englishTerm && normalizeEnglish(visible) === normalizeEnglish(englishTerm)) return false;
  const content = chineseQualityContent(visible);
  const han = [...content.matchAll(/\p{Script=Han}/gu)].length;
  const latin = [...content.matchAll(/\p{Script=Latin}/gu)].length;
  return han > 0 && han / Math.max(1, han + latin) >= 0.2;
}

function isPlausibleEnglishDefinition(value) {
  const visible = visibleText(value);
  return /\p{Script=Latin}/u.test(visible) && !/\p{Script=Han}/u.test(visible);
}

function hasSinglePartOfSpeech(value) {
  return Boolean(canonicalPartOfSpeech(value));
}

function manualSingleSense(entry) {
  if (entry.organizationMethod !== "manual" || !hasSinglePartOfSpeech(entry.partOfSpeech)) return null;
  if (!isPlausibleChineseMeaning(entry.meaning, entry.term)
    || !isPlausibleEnglishDefinition(entry.definition)
    || !isPlausibleEnglishDefinition(entry.exampleEn)
    || !isPlausibleChineseMeaning(entry.exampleZh, entry.term)) return null;
  return {
    partOfSpeech: canonicalPartOfSpeech(entry.partOfSpeech),
    meaningZh: entry.meaning,
    definitionEn: entry.definition,
    usageNotes: entry.usage || "",
    register: entry.register || "neutral",
    collocations: Array.isArray(entry.collocations) ? entry.collocations : [],
    examples: [{ en: entry.exampleEn, zh: entry.exampleZh }],
    confusables: Array.isArray(entry.confusedWith) ? entry.confusedWith : []
  };
}

export function canGrandfatherUnstructuredLegacy(baseEntry, currentEntry) {
  return Boolean(
    baseEntry
    && currentEntry
    && LEXICAL_ENTRY_TYPES.has(baseEntry.entryType)
    && LEXICAL_ENTRY_TYPES.has(currentEntry.entryType)
    && (!Array.isArray(baseEntry.senses) || baseEntry.senses.length === 0)
    && (!Array.isArray(currentEntry.senses) || currentEntry.senses.length === 0)
    && !STRUCTURED_ORGANIZATION_METHODS.has(baseEntry.organizationMethod)
    && !STRUCTURED_ORGANIZATION_METHODS.has(currentEntry.organizationMethod)
  );
}

export function reconcileLexicalEntryForPublish(candidate, { allowLegacyWithoutSenses = false } = {}) {
  const entry = structuredClone(record(candidate, "词条"));
  if (!LEXICAL_ENTRY_TYPES.has(entry.entryType)) {
    if (!isPlausibleChineseMeaning(entry.meaning, entry.term)) throw new Error("中文释义不是可信的中文内容；请删除英文回声、机器翻译垃圾或占位文本后再发布。");
    return entry;
  }
  const senses = Array.isArray(entry.senses) ? entry.senses.map((sense) => structuredClone(sense)) : [];
  if (!senses.length) {
    const synthesized = manualSingleSense(entry);
    if (synthesized) senses.push(synthesized);
    else if (!allowLegacyWithoutSenses || STRUCTURED_ORGANIZATION_METHODS.has(entry.organizationMethod)) {
      throw new Error("新建词汇必须包含结构化义项；若不用 AI，请完整填写单一词性、可信的中英文释义及一组双语例句后再发布。");
    }
  }
  if (!senses.length) {
    if (!isPlausibleChineseMeaning(entry.meaning, entry.term)) throw new Error("中文释义不是可信的中文内容；请删除英文回声、机器翻译垃圾或占位文本后再发布。");
    return entry;
  }

  senses.forEach((sense, index) => {
    const label = `第 ${index + 1} 个义项`;
    if (!isPartOfSpeechLabel(sense.partOfSpeech)) throw new Error(`${label}缺少受支持的词性，不能发布。`);
    if (!isPlausibleEnglishDefinition(sense.definitionEn)) throw new Error(`${label}缺少可信的英文释义，不能发布。`);
    if (!Array.isArray(sense.examples) || !sense.examples.length || sense.examples.some((example) => (
      !isPlausibleEnglishDefinition(example?.en) || !isPlausibleChineseMeaning(example?.zh, entry.term)
    ))) {
      throw new Error(`${label}必须至少有一组完整、可信的双语例句，不能发布。`);
    }
  });

  if (senses.length === 1) {
    const meaningLines = String(entry.meaning || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    if (meaningLines.length !== 1) throw new Error("单义项词条的中文释义必须保持为一条非空行。");
    const expectedPart = canonicalPartOfSpeech(senses[0].partOfSpeech);
    const structured = parseStructuredMeaningLines(entry.meaning);
    let editedMeaning = String(entry.meaning || "").trim();
    if (structured?.length === 1) {
      if (!isPartOfSpeechLabel(structured[0].partOfSpeech)) {
        throw new Error(`中文释义中的词性“${structured[0].partOfSpeech}”不受支持。`);
      }
      if (canonicalPartOfSpeech(structured[0].partOfSpeech) !== expectedPart) {
        throw new Error(`中文释义中的词性“${structured[0].partOfSpeech}”与义项词性“${senses[0].partOfSpeech}”不一致。`);
      }
      editedMeaning = structured[0].meaning;
    } else {
      const numbered = parseCircledMeaning(editedMeaning) || parseArabicNumberedMeaning(editedMeaning);
      if (numbered?.length > 1) {
        throw new Error("当前只有 1 个完整义项，不能仅靠编号添加没有英文释义和双语例句的新义项；请重新用 AI 整理。");
      }
      if (numbered?.length === 1) [editedMeaning] = numbered;
    }
    if (!isPlausibleChineseMeaning(editedMeaning, entry.term)) {
      throw new Error("中文释义不是可信的中文内容；请删除英文回声、机器翻译垃圾或占位文本后再发布。");
    }
    senses[0].partOfSpeech = expectedPart;
    senses[0].meaningZh = editedMeaning;
  } else {
    const structured = parseStructuredMeaningLines(entry.meaning);
    if (!structured || structured.length !== senses.length) {
      throw new Error(`多义词必须按 ${senses.length} 行填写“词性：中文释义”，并与下方义项逐行对应。`);
    }
    structured.forEach((line, index) => {
      const expectedPart = canonicalPartOfSpeech(senses[index].partOfSpeech);
      if (canonicalPartOfSpeech(line.partOfSpeech) !== expectedPart) {
        throw new Error(`第 ${index + 1} 行词性“${line.partOfSpeech}”与第 ${index + 1} 个义项词性“${senses[index].partOfSpeech}”不一致。`);
      }
      if (!isPlausibleChineseMeaning(line.meaning, entry.term)) {
        throw new Error(`第 ${index + 1} 行不是可信的中文释义；请删除英文回声或机器翻译垃圾后再发布。`);
      }
      senses[index].partOfSpeech = expectedPart;
      senses[index].meaningZh = line.meaning;
    });
  }

  const positions = [];
  for (const sense of senses) {
    const part = canonicalPartOfSpeech(sense.partOfSpeech);
    if (!positions.includes(part)) positions.push(part);
  }
  entry.senses = senses;
  entry.partOfSpeech = positions.join(" · ");
  entry.meaning = senses.map((sense) => `${canonicalPartOfSpeech(sense.partOfSpeech)}：${cleanMeaningItem(sense.meaningZh)}`).join("\n");
  entry.definition = senses.map((sense) => `${canonicalPartOfSpeech(sense.partOfSpeech)}: ${visibleText(sense.definitionEn)}`).join("\n");
  return entry;
}

export function validateEnglishInput(value) {
  const cleaned = normalizeTypography(value);
  if (!cleaned || cleaned.length > 2000 || !/[A-Za-z]/.test(cleaned)) throw new Error("请输入 1 至 2,000 个字符的英文内容。");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)) throw new Error("输入包含不支持的控制字符。");
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(cleaned)) throw new Error("这里只接收英文内容；请移除中文后再试。");
  if (/<\/?[A-Za-z][^>]*>|javascript\s*:/iu.test(cleaned)) throw new Error("输入看起来像 HTML 或 JavaScript，已安全拒绝。");
  return cleaned;
}

export function classifyInput(value) {
  const cleaned = validateEnglishInput(value);
  if (/^["']?[A-Za-z]+(?:['-][A-Za-z]+)*[.!?,;:]?["']?$/u.test(cleaned)) return "word";
  const words = cleaned.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || [];
  if (words.length === 1) return "word";
  if (/^['"].+['"]$/.test(cleaned) || words.length > 7 || /[.!?]$/.test(cleaned)) return "quote";
  return "phrase";
}

export function safeHttpsUrl(value) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  if (cleaned.length > 2048) throw new Error("来源链接过长。");
  let url;
  try { url = new URL(cleaned); } catch { throw new Error("来源链接格式不正确。"); }
  const host = url.hostname.toLowerCase();
  const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
  if (url.protocol !== "https:" || url.username || url.password || host === "localhost" || host === "[::1]" || privateIpv4) {
    throw new Error("来源链接必须是公开 HTTPS 地址。");
  }
  url.hash = "";
  return url.href;
}

function validateSource(candidate) {
  const source = record(candidate, "来源记录");
  exactKeys(source, SOURCE_KEYS, "来源记录");
  const kind = string(source.kind, "来源类型", 30, { required: true });
  if (!["primary", "authoritative", "secondary", "candidate", "dictionary", "ai"].includes(kind)) throw new Error("来源类型不受支持。");
  return {
    title: string(source.title, "来源标题", 300),
    url: safeHttpsUrl(source.url),
    kind,
    retrievedAt: isoDate(source.retrievedAt, "来源检索时间")
  };
}

function validateSense(candidate) {
  const sense = record(candidate, "义项");
  exactKeys(sense, SENSE_KEYS, "义项");
  if (!Array.isArray(sense.examples) || sense.examples.length > 6) throw new Error("义项例句格式不正确。");
  return {
    partOfSpeech: string(sense.partOfSpeech, "义项词性", 80),
    meaningZh: string(sense.meaningZh, "义项中文", 1500),
    definitionEn: string(sense.definitionEn, "义项英文", 1500),
    usageNotes: string(sense.usageNotes, "义项用法", 1000),
    register: string(sense.register, "义项语域", 100),
    collocations: stringList(sense.collocations, "义项搭配", 20, 180),
    examples: sense.examples.map((candidateExample) => {
      const example = record(candidateExample, "义项例句");
      exactKeys(example, EXAMPLE_KEYS, "义项例句");
      return { en: string(example.en, "英文例句", 1000), zh: string(example.zh, "中文例句", 1000) };
    }),
    confusables: stringList(sense.confusables, "易混词", 20, 180)
  };
}

export function validatePublicEntry(candidate) {
  const rawSource = record(candidate, "公开词条");
  // synonyms was added without changing the public v3 version. Old GitHub
  // snapshots and recoverable IndexedDB drafts therefore omit it; normalize
  // that one known omission while continuing to reject every unknown field.
  const source = Object.prototype.hasOwnProperty.call(rawSource, "synonyms")
    ? rawSource
    : { ...rawSource, synonyms: [] };
  exactKeys(source, ENTRY_KEYS, "公开词条");
  const correctionSource = record(source.correction, "拼写建议");
  exactKeys(correctionSource, CORRECTION_KEYS, "拼写建议");
  const correctionStatus = string(correctionSource.status, "拼写状态", 20, { required: true });
  if (!["exact", "suggested", "accepted", "kept"].includes(correctionStatus)) throw new Error("拼写状态不受支持。");
  const entryType = string(source.entryType, "词条类型", 30, { required: true });
  if (!ENTRY_TYPES.includes(entryType)) throw new Error("词条类型不受支持。");
  const attributionStatus = string(source.attributionStatus, "出处状态", 30, { required: true });
  if (!ATTRIBUTION_STATES.includes(attributionStatus)) throw new Error("出处状态不受支持。");
  const organizationMethod = string(source.organizationMethod, "整理方式", 30, { required: true });
  if (!["manual", "local-dictionary", "ai-cloudflare", "ai-openai", "ai-anthropic", "mixed"].includes(organizationMethod)) throw new Error("整理方式不受支持。");
  const term = string(source.term, "英文词条", 2000, { required: true });
  validateEnglishInput(term);
  const id = string(source.id, "词条编号", 180, { required: true });
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error("词条编号格式不正确。");
  const revision = Number(source.revision);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("词条 revision 不正确。");
  const confidence = Number(correctionSource.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("拼写建议置信度不正确。");
  const createdAt = isoDate(source.createdAt, "创建时间");
  const updatedAt = isoDate(source.updatedAt, "更新时间");
  if (new Date(updatedAt) < new Date(createdAt)) throw new Error("更新时间不能早于创建时间。");
  const normalized = string(source.normalized, "标准键", 2000, { required: true });
  if (normalized !== normalizeEnglish(term)) throw new Error("词条标准键与英文词条不一致。");
  if (!Array.isArray(source.senses) || source.senses.length > 20) throw new Error("义项格式不正确。");
  if (!Array.isArray(source.sources) || source.sources.length > 20) throw new Error("来源记录格式不正确。");
  const sourceUrl = safeHttpsUrl(source.sourceUrl);
  const sourceTitle = string(source.sourceTitle, "来源标题", 500);
  const attributionNote = string(source.attributionNote, "核验说明", 1500);
  if (attributionStatus === "verified") {
    if (!sourceUrl || !sourceTitle || !attributionNote) throw new Error("已核验出处必须包含标题、链接和核验说明。");
    if (new URL(sourceUrl).hostname.toLowerCase().endsWith("wikiquote.org")) throw new Error("Wikiquote 不能作为唯一的已核验来源。");
  }
  const synonyms = stringList(source.synonyms, "同义词", 20, 180);
  const confusedWith = stringList(source.confusedWith, "易混词", 30, 180);
  const forms = stringList(source.forms, "词形", 30, 180);
  if (!LEXICAL_ENTRY_TYPES.has(entryType) && synonyms.length) {
    throw new Error("只有单词、短语、短语动词、习语和搭配可以保存同义词。");
  }
  const selfKeys = new Set([
    term,
    source.standardForm,
    correctionSource.original,
    correctionSource.suggestion,
    correctionSource.chosen
  ].map(normalizeEnglish).filter(Boolean));
  const relatedFieldKeys = new Set([...forms, ...confusedWith].map(normalizeEnglish).filter(Boolean));
  const synonymKeys = new Set();
  for (const synonym of synonyms) {
    try { validateEnglishInput(synonym); } catch { throw new Error("同义词必须是安全的英文内容。"); }
    const key = normalizeEnglish(synonym);
    if (selfKeys.has(key)) throw new Error("同义词不能重复当前词条或标准形式。");
    if (relatedFieldKeys.has(key)) throw new Error("同义词不能同时列为词形或易混词。");
    if (synonymKeys.has(key)) throw new Error("同义词不能重复（忽略大小写）。");
    if (key) synonymKeys.add(key);
  }
  return {
    id,
    revision,
    originalInput: string(source.originalInput, "原始输入", 2000),
    term,
    normalized,
    standardForm: string(source.standardForm, "标准形式", 2000, { required: true }),
    entryType,
    correction: {
      status: correctionStatus,
      original: string(correctionSource.original, "原始拼写", 2000),
      suggestion: string(correctionSource.suggestion, "建议拼写", 2000),
      chosen: string(correctionSource.chosen, "选定拼写", 2000),
      confidence,
      source: string(correctionSource.source, "拼写来源", 120)
    },
    phonetic: string(source.phonetic, "音标", 300),
    partOfSpeech: string(source.partOfSpeech, "词性", 160),
    meaning: string(source.meaning, "中文释义", 4000),
    definition: string(source.definition, "英文释义", 4000),
    senses: source.senses.map(validateSense),
    collocations: stringList(source.collocations, "常见搭配", 30, 180),
    synonyms,
    exampleEn: string(source.exampleEn, "英文例句", 4000),
    exampleZh: string(source.exampleZh, "例句翻译", 4000),
    usage: string(source.usage, "用法提醒", 4000),
    register: string(source.register, "语域", 160),
    confusedWith,
    forms,
    tags: stringList(source.tags, "标签", 30, 80),
    author: string(source.author, "作者", 300),
    sourceTitle,
    sourceWork: string(source.sourceWork, "作品", 500),
    sourceDate: string(source.sourceDate, "来源日期", 100),
    sourceUrl,
    attributionStatus,
    attributionNote,
    sources: source.sources.map(validateSource),
    organizationMethod,
    createdAt,
    updatedAt
  };
}

export function entryLookupKeys(entry) {
  const keys = [entry.term, entry.normalized, entry.standardForm];
  if (["suggested", "accepted"].includes(entry.correction?.status)) {
    keys.push(entry.correction.original, entry.correction.suggestion, entry.correction.chosen);
  } else if (entry.correction?.status === "kept") {
    // A rejected suggestion is not an alias of this entry and must remain
    // available as a separate, legitimate headword.
    keys.push(entry.correction.original, entry.correction.chosen);
  }
  return [...new Set(keys.map(normalizeEnglish).filter(Boolean))];
}

export function findDuplicate(entries, candidate, excludeId = "") {
  const wanted = new Set(entryLookupKeys(candidate));
  return entries.find((entry) => entry.id !== excludeId && entryLookupKeys(entry).some((key) => wanted.has(key))) || null;
}

export function rankExactEntryMatches(entries, query) {
  const wanted = normalizeEnglish(query);
  if (!wanted) return [...entries];
  return entries
    .map((entry, index) => ({
      entry,
      index,
      exact: [entry.term, entry.normalized, entry.standardForm].some((value) => normalizeEnglish(value) === wanted)
    }))
    .sort((left, right) => Number(right.exact) - Number(left.exact) || left.index - right.index)
    .map(({ entry }) => entry);
}

export function buildOwnerEnteredTermAllowlist(drafts = [], publicEntries = [], { excludeTerm = "", limit = Infinity } = {}) {
  const excluded = normalizeEnglish(excludeTerm);
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Infinity;
  const records = [
    ...drafts.map((draft, index) => ({
      entry: draft?.value,
      updatedAt: draft?.updatedAt || draft?.value?.updatedAt || "",
      index
    })),
    ...publicEntries.map((entry, index) => ({
      entry,
      updatedAt: entry?.updatedAt || "",
      index: drafts.length + index
    }))
  ].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || left.index - right.index);
  const terms = new Map();
  for (const { entry } of records) {
    if (!entry || !LEXICAL_ENTRY_TYPES.has(entry.entryType)) continue;
    const term = String(entry.term || "").trim();
    if (!term || term.length > 200) continue;
    try { validateEnglishInput(term); } catch { continue; }
    const key = normalizeEnglish(term);
    if (!key || key === excluded || terms.has(key)) continue;
    terms.set(key, term);
    if (terms.size >= maximum) break;
  }
  return [...terms.values()];
}

export function filterSynonymsToOwnerTerms(synonyms, allowedTerms, currentTerm = "") {
  const self = normalizeEnglish(currentTerm);
  const allowed = new Map();
  for (const candidate of Array.isArray(allowedTerms) ? allowedTerms : []) {
    const term = String(candidate || "").trim();
    if (!term) continue;
    const key = normalizeEnglish(term);
    if (key && key !== self && !allowed.has(key)) allowed.set(key, term);
  }
  const filtered = [];
  const seen = new Set();
  for (const candidate of Array.isArray(synonyms) ? synonyms : []) {
    const key = normalizeEnglish(candidate);
    if (!key || seen.has(key) || !allowed.has(key)) continue;
    seen.add(key);
    filtered.push(allowed.get(key));
  }
  return filtered;
}

function legacySource(name, retrievedAt) {
  const known = {
    ECDICT: ["ECDICT", "https://github.com/skywind3000/ECDICT"],
    FreeDictionaryAPI: ["FreeDictionaryAPI", "https://freedictionaryapi.com/"],
    Wiktionary: ["Wiktionary", "https://en.wiktionary.org/"]
  };
  const match = known[String(name || "")];
  if (!match) return null;
  return { title: match[0], url: match[1], kind: "dictionary", retrievedAt };
}

function migrateLegacyEntry(candidate, fallbackDate) {
  const source = record(candidate, "旧版词条");
  const term = validateEnglishInput(source.term);
  const createdAt = source.createdAt && !Number.isNaN(new Date(source.createdAt).getTime()) ? new Date(source.createdAt).toISOString() : fallbackDate;
  const updatedAt = source.updatedAt && !Number.isNaN(new Date(source.updatedAt).getTime()) ? new Date(source.updatedAt).toISOString() : createdAt;
  const rawType = String(source.entryType || "");
  const entryType = ENTRY_TYPES.includes(rawType) ? rawType : classifyInput(term);
  const rawSources = Array.isArray(source.sources) ? source.sources : [];
  const sources = rawSources.map((item) => legacySource(item, updatedAt)).filter(Boolean);
  const sourceUrl = (() => { try { return safeHttpsUrl(source.sourceUrl); } catch { return ""; } })();
  if (sourceUrl && !sources.some((item) => item.url === sourceUrl)) {
    sources.push({ title: String(source.sourceTitle || new URL(sourceUrl).hostname).slice(0, 300), url: sourceUrl, kind: "dictionary", retrievedAt: updatedAt });
  }
  const rawId = String(source.id || `public-${crypto.randomUUID()}`).replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 180);
  return validatePublicEntry({
    id: rawId || `public-${crypto.randomUUID()}`,
    revision: 1,
    originalInput: String(source.rawInput || term).slice(0, 2000),
    term,
    normalized: normalizeEnglish(term),
    standardForm: entryType === "word" ? (String(source.headword || term).trim().slice(0, 2000) || term) : term,
    entryType,
    correction: { status: "exact", original: term, suggestion: "", chosen: term, confidence: 1, source: "legacy-migration" },
    phonetic: String(source.phonetic || "").slice(0, 300),
    partOfSpeech: String(source.partOfSpeech || "").slice(0, 160),
    meaning: String(source.meaning || "").slice(0, 4000),
    definition: String(source.definition || "").slice(0, 4000),
    senses: [],
    collocations: [],
    synonyms: Array.isArray(source.synonyms) ? source.synonyms.map(String).slice(0, 20) : [],
    exampleEn: String(source.exampleEn || "").slice(0, 4000),
    exampleZh: String(source.exampleZh || "").slice(0, 4000),
    usage: String(source.usage || "").slice(0, 4000),
    register: "",
    confusedWith: [],
    forms: Array.isArray(source.forms) ? source.forms.map(String).slice(0, 30) : [],
    tags: Array.isArray(source.tags) ? source.tags.map(String).slice(0, 30) : [],
    author: String(source.author || "").slice(0, 300),
    sourceTitle: String(source.sourceTitle || "").slice(0, 500),
    sourceWork: "",
    sourceDate: "",
    sourceUrl,
    attributionStatus: ["quote", "proverb"].includes(entryType) && sourceUrl ? "candidate" : "unverified",
    attributionNote: "由公开词库旧版本安全迁移；出处状态需要重新核验。",
    sources,
    organizationMethod: "local-dictionary",
    createdAt,
    updatedAt
  });
}

export function parsePublicSnapshot(payload, { allowLegacy = true } = {}) {
  const source = record(payload, "公开词库快照");
  const version = source.schemaVersion;
  if (!Number.isInteger(version) || version < 1 || version > PUBLIC_SCHEMA_VERSION) throw new Error(`不支持的公开词库版本：${String(version)}。`);
  let snapshot;
  if (version < PUBLIC_SCHEMA_VERSION) {
    if (!allowLegacy || !Array.isArray(source.entries) || source.entries.length > 10000) throw new Error("旧版公开词库无法迁移。");
    const fallbackDate = source.updatedAt && !Number.isNaN(new Date(source.updatedAt).getTime()) ? new Date(source.updatedAt).toISOString() : new Date().toISOString();
    snapshot = {
      schemaVersion: PUBLIC_SCHEMA_VERSION,
      exportedAt: source.exportedAt ? isoDate(source.exportedAt, "导出时间") : fallbackDate,
      revisionId: `migrated-${crypto.randomUUID()}`,
      lastMutationId: "",
      entries: source.entries.map((entry) => migrateLegacyEntry(entry, fallbackDate))
    };
  } else {
    exactKeys(source, ["schemaVersion", "exportedAt", "revisionId", "lastMutationId", "entries"], "公开词库快照");
    if (!Array.isArray(source.entries) || source.entries.length > 10000) throw new Error("公开词库 entries 格式不正确。");
    snapshot = {
      schemaVersion: PUBLIC_SCHEMA_VERSION,
      exportedAt: isoDate(source.exportedAt, "导出时间"),
      revisionId: string(source.revisionId, "快照修订号", 180, { required: true }),
      lastMutationId: string(source.lastMutationId, "最后操作号", 180),
      entries: source.entries.map(validatePublicEntry)
    };
  }
  const ids = new Set();
  for (const entry of snapshot.entries) {
    if (ids.has(entry.id)) throw new Error(`公开词库存在重复编号：${entry.id}`);
    ids.add(entry.id);
    const duplicate = findDuplicate(snapshot.entries, entry, entry.id);
    if (duplicate) throw new Error(`公开词库存在重复词条：${entry.term}`);
  }
  return snapshot;
}

export function createBlankEntry(input) {
  const original = validateEnglishInput(input);
  const now = new Date().toISOString();
  return {
    id: `public-${crypto.randomUUID()}`,
    revision: 1,
    originalInput: original,
    term: original,
    normalized: normalizeEnglish(original),
    standardForm: original,
    entryType: classifyInput(original),
    correction: { status: "exact", original, suggestion: "", chosen: original, confidence: 1, source: "manual" },
    phonetic: "", partOfSpeech: "", meaning: "", definition: "", senses: [], collocations: [], synonyms: [],
    exampleEn: "", exampleZh: "", usage: "", register: "", confusedWith: [], forms: [], tags: [],
    author: "", sourceTitle: "", sourceWork: "", sourceDate: "", sourceUrl: "",
    attributionStatus: "unverified", attributionNote: "", sources: [], organizationMethod: "manual",
    createdAt: now, updatedAt: now
  };
}

export function hasCompletedAiOrganization(entry) {
  return ["ai-cloudflare", "ai-openai", "ai-anthropic", "mixed"].includes(entry?.organizationMethod);
}

function visibleText(value) {
  return String(value || "").normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
}

export function hasChineseHanText(value) {
  return /\p{Script=Han}/u.test(visibleText(value));
}

/**
 * Browser-side defence in depth for a provider response that passed the JSON
 * shape check but is not a usable bilingual learning entry. The server applies
 * stronger semantic checks; this guard prevents an old or regressed endpoint
 * from being presented as a successful organization result.
 */
export function assertCompleteAiCandidate(entry) {
  const issues = [];
  if (!isPlausibleChineseMeaning(entry?.meaning, entry?.term)) issues.push("中文释义不是可信中文");
  if (!visibleText(entry?.definition)) issues.push("英文释义为空");
  if (new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]).has(entry?.entryType)) {
    if (!Array.isArray(entry?.senses) || entry.senses.length === 0) {
      issues.push("词汇词条没有分义项");
    } else {
      entry.senses.forEach((sense, index) => {
        const label = `第 ${index + 1} 个义项`;
        if (!isPlausibleChineseMeaning(sense?.meaningZh, entry?.term)) issues.push(`${label}缺少可信中文`);
        if (!visibleText(sense?.definitionEn)) issues.push(`${label}缺少英文释义`);
        if (!Array.isArray(sense?.examples) || sense.examples.length === 0) {
          issues.push(`${label}缺少双语例句`);
        } else if (sense.examples.some((example) => !visibleText(example?.en) || !hasChineseHanText(example?.zh))) {
          issues.push(`${label}存在不完整的双语例句`);
        }
      });
    }
  }
  if (issues.length) {
    throw new Error(`AI 返回内容未通过前端完整性检查：${[...new Set(issues)].join("；")}。`);
  }
  return entry;
}

export function needsAiCompletion(entry) {
  if (!entry || typeof entry !== "object") return true;
  const lexicalTypes = new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]);
  const missingRequiredSenses = lexicalTypes.has(entry.entryType)
    && (!Array.isArray(entry.senses) || entry.senses.length === 0);
  const missingCore = !String(entry.meaning || "").trim()
    || !String(entry.definition || "").trim()
    || missingRequiredSenses;
  const phonetic = String(entry.phonetic || "").normalize("NFKC");
  const pronunciations = phonetic.match(/\/([^/\r\n]+)\/|\[([^\]\r\n]+)\]/gu) || [];
  const hasDelimitedPronunciation = pronunciations.some((segment) => /[A-Za-z\u0250-\u02AF]/u.test(segment));
  // The organizer is explicitly allowed to leave uncertain IPA blank. Once an
  // AI pass has otherwise completed the entry, do not burn another request on
  // every duplicate lookup just to ask for the same uncertain pronunciation.
  // Manual and migrated local entries still request completion when IPA is
  // missing so older drafts can be improved.
  const lexicalWordNeedsPronunciation = entry.entryType === "word"
    && !hasDelimitedPronunciation
    && !hasCompletedAiOrganization(entry);
  return missingCore || lexicalWordNeedsPronunciation;
}

export function buildPublicSnapshot(entries, { lastMutationId = "" } = {}) {
  return parsePublicSnapshot({
    schemaVersion: PUBLIC_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    revisionId: crypto.randomUUID(),
    lastMutationId,
    entries
  }, { allowLegacy: false });
}
