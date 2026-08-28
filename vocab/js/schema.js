export const SNAPSHOT_SCHEMA_VERSION = 2;

const ENTRY_TYPES = new Set(["word", "phrase", "quote", "proverb"]);
const ATTRIBUTION_STATES = new Set(["unverified", "candidate", "source-backed", "verified", "disputed"]);
const RATINGS = new Set(["again", "hard", "good", "easy", null]);
const QUALITY_STATES = new Set(["trusted", "machine-candidate", "incomplete"]);
const LEXICAL_TOKEN = /^(?=.*[\p{Script=Latin}\p{Number}])[\p{Script=Latin}\p{Mark}\p{Number}'./+#&-]+$/u;
const ABBREVIATION_WITH_FINAL_PERIOD = /^(?=(?:[^.]*\.){2,}$)[\p{Script=Latin}.]+$/u;

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function text(value, maximum = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function list(value, maximum = 30) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(String(item), 120)).filter(Boolean))].slice(0, maximum);
}

function webUrl(value) {
  const candidate = text(value, 1200);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function isoDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

export function cleanEnglishInput(value) {
  return String(value || "")
    .trim()
    .replace(/[‘’‚‛′‵ʼ❛❜]/g, "'")
    .replace(/[“”„‟″‶❝❞]/g, '"')
    .replace(/\s+/g, " ");
}

function normalizeKeyPunctuation(value) {
  return value
    .normalize("NFKC")
    .replace(/[‘’‚‛′‵ʼ❛❜]/g, "'")
    .replace(/[“”„‟″‶❝❞]/g, '"')
    .replace(/[\u00AD\u058A\u2010-\u2015\u2212\u2043\u2E3A\u2E3B\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[\u200B\u200C\u200D\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLexicalToken(value) {
  return LEXICAL_TOKEN.test(value);
}

function unwrapLexicalBoundary(value) {
  const pairs = new Map([
    ['"', '"'],
    ["'", "'"],
    ["(", ")"],
    ["[", "]"],
    ["{", "}"]
  ]);
  const closing = pairs.get(value[0]);
  if (!closing || value.at(-1) !== closing || value.length < 3) return value;
  const inner = value.slice(1, -1).trim();
  const innerType = classifyEntry(inner);
  return ["word", "phrase"].includes(innerType) ? inner : value;
}

function trimLexicalTerminalPunctuation(value) {
  let candidate = unwrapLexicalBoundary(value);
  if (classifyEntry(candidate) === "quote") return candidate;
  const withoutNonPeriodTerminators = candidate
    .replace(/^[,;:!?…]+/u, "")
    .replace(/[,;:!?…]+$/u, "")
    .trim();
  if (["word", "phrase"].includes(classifyEntry(withoutNonPeriodTerminators))) {
    candidate = withoutNonPeriodTerminators;
  }

  if (!ABBREVIATION_WITH_FINAL_PERIOD.test(candidate)) {
    const withoutPeriods = candidate.replace(/^\.+|\.+$/g, "").trim();
    const type = classifyEntry(withoutPeriods);
    const compactLexical = !withoutPeriods.includes(" ") && isLexicalToken(withoutPeriods);
    if (["word", "phrase"].includes(type) || compactLexical) candidate = withoutPeriods;
  }
  return candidate;
}

export function normalizeKey(value) {
  const canonical = normalizeKeyPunctuation(cleanEnglishInput(value));
  return trimLexicalTerminalPunctuation(canonical).toLocaleLowerCase("en-US");
}

export function validateEntryInput(value) {
  const cleaned = cleanEnglishInput(value);
  if (!cleaned) throw new Error("请输入一个英文单词、短语或名言。");
  if (cleaned.length > 500) throw new Error("一次请输入不超过 500 个字符。");
  const numericExpression = /^\p{Number}+(?:[./:-]\p{Number}+)+$/u.test(cleaned);
  if (!/[\p{Script=Latin}]/u.test(cleaned) && !numericExpression) throw new Error("请输入英文内容。");
  if (!/^[\p{Script=Latin}\p{Mark}\p{Number}\p{Punctuation}\p{Symbol}\p{Separator}]+$/u.test(cleaned)) {
    throw new Error("这里只接收英文及常见标点，请不要混入中文或其他文字。");
  }
  return cleaned;
}

export function classifyEntry(value) {
  const cleaned = cleanEnglishInput(value);
  if (!cleaned) return "word";
  const canonical = normalizeKeyPunctuation(cleaned);
  if (isLexicalToken(canonical)) return "word";

  const unwrapped = canonical.match(/^(?:"([\s\S]+)"|'([\s\S]+)')$/u);
  const body = (unwrapped?.[1] ?? unwrapped?.[2] ?? canonical).trim();
  const singleWithoutTerminator = body.replace(/[.!?…]+$/u, "").trim();
  if (!singleWithoutTerminator.includes(" ") && isLexicalToken(singleWithoutTerminator)) return "word";

  const words = cleaned.match(/[\p{Script=Latin}\p{Mark}]+(?:['-][\p{Script=Latin}\p{Mark}]+)*/gu) || [];
  if (unwrapped && words.length >= 2) return "quote";
  if (words.length >= 2 && /[.!?…]["')\]}]*$/u.test(canonical)) return "quote";
  if (words.length > 7) return "quote";
  const phraseBody = body.replace(/^[,;:]+|[,;:]+$/g, "").trim();
  const phraseTokens = phraseBody.split(" ").filter(Boolean);
  if (phraseTokens.length >= 2 && phraseTokens.length <= 7
    && phraseTokens.every((token) => isLexicalToken(token))) return "phrase";
  if (words.length === 1) return "word";
  if (words.length >= 2 && words.length <= 7 && !/[!?…]/u.test(canonical)) return "phrase";
  return "quote";
}

export function sanitizeEntry(candidate, { existing = null, preserveId = false, includeReview = true } = {}) {
  if (!candidate || typeof candidate !== "object") throw new Error("词条格式不正确。");
  const term = validateEntryInput(candidate.term);
  const normalized = normalizeKey(term);
  const now = new Date().toISOString();
  const candidateReview = candidate.review && typeof candidate.review === "object" ? candidate.review : {};
  const existingReview = existing?.review || {};
  const levelValue = Number(candidateReview.level ?? existingReview.level ?? 0);
  const level = Number.isFinite(levelValue) ? Math.min(7, Math.max(0, Math.trunc(levelValue))) : 0;
  const entryType = ENTRY_TYPES.has(candidate.entryType) ? candidate.entryType : classifyEntry(term);
  const sourceTitle = text(candidate.sourceTitle, 500);
  const sourceUrl = webUrl(candidate.sourceUrl);
  let attributionStatus = ATTRIBUTION_STATES.has(candidate.attributionStatus)
    ? candidate.attributionStatus
    : "unverified";
  if (["verified", "source-backed"].includes(attributionStatus) && (!sourceTitle || !sourceUrl)) {
    attributionStatus = "unverified";
  }
  if (["verified", "source-backed"].includes(attributionStatus) && new URL(sourceUrl).hostname.endsWith("wikiquote.org")) {
    attributionStatus = "candidate";
  }
  const correction = candidate.correction && typeof candidate.correction === "object"
    ? {
        status: ["exact", "autocorrected", "unchecked"].includes(candidate.correction.status) ? candidate.correction.status : "exact",
        original: text(candidate.correction.original || term, 500),
        chosen: text(candidate.correction.chosen || term, 500),
        confidence: Math.min(1, Math.max(0, Number(candidate.correction.confidence) || 0)),
        candidates: list(candidate.correction.candidates, 6),
        source: text(candidate.correction.source, 80)
      }
    : null;
  const qualitySource = candidate.quality && typeof candidate.quality === "object"
    ? candidate.quality
    : (existing?.quality && typeof existing.quality === "object" ? existing.quality : null);
  const quality = qualitySource
    ? {
        status: QUALITY_STATES.has(qualitySource.status) ? qualitySource.status : "incomplete",
        source: text(qualitySource.source, 160),
        autoSave: qualitySource.autoSave === true,
        reason: text(qualitySource.reason, 600)
      }
    : null;
  const rawHistory = Array.isArray(candidate.history) ? candidate.history : (existing?.history || []);
  const history = rawHistory.slice(-60).map((event) => ({
    at: isoDate(event?.at, now),
    rating: RATINGS.has(event?.rating) ? event.rating : null,
    fromLevel: Math.min(7, nonNegativeInteger(event?.fromLevel)),
    toLevel: Math.min(7, nonNegativeInteger(event?.toLevel))
  }));

  const entry = {
    ...(existing || {}),
    id: existing?.id || (preserveId && typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 180) : newId()),
    rawInput: text(candidate.rawInput || term, 500),
    term,
    normalized,
    headword: text(candidate.headword || term, 500),
    entryType,
    correction,
    quality,
    needsAttention: typeof candidate.needsAttention === "boolean"
      ? candidate.needsAttention
      : Boolean(existing?.needsAttention),
    phonetic: text(candidate.phonetic, 300),
    partOfSpeech: text(candidate.partOfSpeech, 160),
    meaning: text(candidate.meaning, 4000),
    definition: text(candidate.definition, 4000),
    exampleEn: text(candidate.exampleEn, 4000),
    exampleZh: text(candidate.exampleZh, 4000),
    usage: text(candidate.usage, 4000),
    author: text(candidate.author, 300),
    sourceTitle,
    sourceUrl,
    sourceLocator: text(candidate.sourceLocator, 300),
    attributionStatus,
    attributionNote: text(candidate.attributionNote, 1200),
    retrievedAt: candidate.retrievedAt ? isoDate(candidate.retrievedAt, now) : "",
    attributionCandidates: Array.isArray(candidate.attributionCandidates)
      ? candidate.attributionCandidates.slice(0, 6).map((item) => ({
          title: text(item?.title, 300),
          url: webUrl(item?.url)
        })).filter((item) => item.title && item.url)
      : [],
    forms: list(candidate.forms),
    tags: list(candidate.tags, 20),
    note: text(candidate.note, 4000),
    sources: list(candidate.sources, 20),
    createdAt: isoDate(existing?.createdAt || candidate.createdAt, now),
    updatedAt: isoDate(candidate.updatedAt, now),
    history
  };

  if (includeReview) {
    entry.review = {
      level,
      dueAt: isoDate(candidateReview.dueAt || existingReview.dueAt, now),
      reviewCount: nonNegativeInteger(candidateReview.reviewCount, existingReview.reviewCount || 0),
      lapseCount: nonNegativeInteger(candidateReview.lapseCount, existingReview.lapseCount || 0),
      lastRating: RATINGS.has(candidateReview.lastRating)
        ? candidateReview.lastRating
        : (existingReview.lastRating || null)
    };
  }

  return entry;
}

export function sanitizeEntries(candidates, { preserveIds = false, includeReview = true } = {}) {
  if (!Array.isArray(candidates)) throw new Error("词库数据必须是数组。");
  if (candidates.length > 10000) throw new Error("一次最多处理 10,000 个词条。");
  const byTerm = new Map();
  for (const candidate of candidates) {
    try {
      const entry = sanitizeEntry(candidate, { preserveId: preserveIds, includeReview });
      byTerm.set(entry.normalized, entry);
    } catch {
      // A malformed item is skipped; callers can compare input/output counts.
    }
  }

  const usedIds = new Set();
  return [...byTerm.values()].map((entry) => {
    if (!usedIds.has(entry.id)) {
      usedIds.add(entry.id);
      return entry;
    }
    const replacement = { ...entry, id: newId() };
    usedIds.add(replacement.id);
    return replacement;
  });
}

export function parseSnapshot(payload, options = {}) {
  const source = Array.isArray(payload) ? { entries: payload } : payload;
  if (!source || typeof source !== "object" || !Array.isArray(source.entries)) {
    throw new Error("词库快照格式不正确。");
  }
  const schemaVersion = Number(source.schemaVersion || source.version || 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`不支持的词库快照版本：${source.schemaVersion || source.version || "未知"}。`);
  }
  const { strict = false, ...sanitizeOptions } = options;
  const entries = sanitizeEntries(source.entries, sanitizeOptions);
  const rejectedCount = source.entries.length - entries.length;
  if (strict && rejectedCount) {
    throw new Error(`词库快照包含 ${rejectedCount} 个无效或重复词条，已拒绝导入。`);
  }
  return {
    schemaVersion,
    exportedAt: text(source.exportedAt || source.updatedAt, 80),
    rejectedCount,
    entries
  };
}

export function buildSnapshot(entries) {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries: sanitizeEntries(entries, { preserveIds: true, includeReview: true })
  };
}

export function toPublicEntry(entry) {
  const sanitized = sanitizeEntry(entry, { preserveId: true, includeReview: false });
  const {
    rawInput, correction, note, history, attributionCandidates, retrievedAt, ...publicEntry
  } = sanitized;
  const publicCorrection = correction?.status === "autocorrected"
    && normalizeKey(correction.original) !== normalizeKey(correction.chosen)
    ? {
        status: "autocorrected",
        original: correction.original,
        chosen: correction.chosen,
        confidence: correction.confidence,
        source: correction.source
      }
    : null;
  return {
    ...publicEntry,
    id: publicEntry.id.startsWith("public-") ? publicEntry.id : `public-${publicEntry.id}`,
    ...(publicCorrection ? { correction: publicCorrection } : {}),
    attributionStatus: sanitized.attributionStatus,
    retrievedAt: sanitized.retrievedAt
  };
}
