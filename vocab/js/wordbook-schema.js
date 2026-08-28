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
  if (!hasChineseHanText(entry?.meaning)) issues.push("中文释义没有有效汉字");
  if (!visibleText(entry?.definition)) issues.push("英文释义为空");
  if (new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]).has(entry?.entryType)) {
    if (!Array.isArray(entry?.senses) || entry.senses.length === 0) {
      issues.push("词汇词条没有分义项");
    } else {
      entry.senses.forEach((sense, index) => {
        const label = `第 ${index + 1} 个义项`;
        if (!hasChineseHanText(sense?.meaningZh)) issues.push(`${label}缺少有效中文`);
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
