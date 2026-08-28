export const SNAPSHOT_SCHEMA_VERSION = 2;

const ENTRY_TYPES = new Set(["word", "phrase", "quote", "proverb"]);
const ATTRIBUTION_STATES = new Set(["unverified", "candidate", "source-backed", "verified", "disputed"]);
const RATINGS = new Set(["again", "hard", "good", "easy", null]);

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
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

export function normalizeKey(value) {
  return cleanEnglishInput(value).toLocaleLowerCase("en-US");
}

export function validateEntryInput(value) {
  const cleaned = cleanEnglishInput(value);
  if (!cleaned) throw new Error("请输入一个英文单词、短语或名言。");
  if (cleaned.length > 500) throw new Error("一次请输入不超过 500 个字符。");
  if (!/[\p{Script=Latin}]/u.test(cleaned)) throw new Error("请输入英文内容。");
  if (!/^[\p{Script=Latin}\p{Mark}\p{Number}\p{Punctuation}\p{Separator}]+$/u.test(cleaned)) {
    throw new Error("这里只接收英文及常见标点，请不要混入中文或其他文字。");
  }
  return cleaned;
}

export function classifyEntry(value) {
  const cleaned = cleanEnglishInput(value);
  const words = cleaned.match(/[\p{Script=Latin}\p{Mark}]+(?:['-][\p{Script=Latin}\p{Mark}]+)*/gu) || [];
  const simple = /^[\p{Script=Latin}\p{Mark}' -]+$/u.test(cleaned);
  if (simple && words.length === 1) return "word";
  if (simple && words.length <= 7 && !(words.length >= 3 && /^[A-Z]/.test(cleaned))) return "phrase";
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
  return {
    ...publicEntry,
    id: publicEntry.id.startsWith("public-") ? publicEntry.id : `public-${publicEntry.id}`,
    attributionStatus: sanitized.attributionStatus,
    retrievedAt: sanitized.retrievedAt
  };
}
