import { z } from "zod";
import { ApiError } from "./security";

export const PUBLIC_SCHEMA_VERSION = 3;
const ENTRY_TYPES = ["word", "phrase", "phrasal-verb", "idiom", "collocation", "sentence", "quote", "proverb"] as const;
const LEXICAL_ENTRY_TYPES = new Set<(typeof ENTRY_TYPES)[number]>(["word", "phrase", "phrasal-verb", "idiom", "collocation"]);
const ATTRIBUTION_STATES = ["verified", "candidate", "unverified", "disputed"] as const;
const CORRECTION_DECISIONS = ["exact", "suggested", "accepted", "kept"] as const;

const bounded = (maximum: number) => z.string().trim().max(maximum);
const isoDate = z.string().datetime({ offset: true });

const SUSPICIOUS_TRANSLATION_GARBAGE = [
  /\bkamus\b/iu,
  /\bmymemory\b/iu,
  /\bbm\s+ke\s+bi\b/iu,
  /translation\s+(?:warning|memory)/iu,
  /used all available free translations/iu
];

export function hasPlausibleChineseMeaning(value: string): boolean {
  const visible = value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  if (!visible || SUSPICIOUS_TRANSLATION_GARBAGE.some((pattern) => pattern.test(visible))) return false;
  const content = visible.split(/\r?\n/u).map((line) => {
    const withoutNumber = line.trim().replace(/^(?:[①-⑳]|\d{1,2}(?:\.(?!\d)|[、)）]))\s*/u, "");
    const labelled = withoutNumber.match(/^[A-Za-z][A-Za-z ._-]{0,79}\s*[:：]\s*(.+)$/u);
    return labelled?.[1] || withoutNumber;
  }).join(" ");
  const han = [...content.matchAll(/\p{Script=Han}/gu)].length;
  const latin = [...content.matchAll(/\p{Script=Latin}/gu)].length;
  return han > 0 && han / Math.max(1, han + latin) >= 0.2;
}

function normalizeTypography(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Remove ordinary wrapper punctuation only when the whole input is one
 * lexical item. This makes hip, Hip, HIP, hip! and “hip” share one lookup
 * key without stripping punctuation from sentences and quotations.
 */
export function canonicalizeLookupInput(value: string): string {
  let cleaned = normalizeTypography(value);
  const wrapped = cleaned.match(/^(["'])(.+)\1$/);
  if (wrapped) cleaned = wrapped[2].trim();
  const withoutTerminalPunctuation = cleaned.replace(/[.!?,;:]+$/u, "").trim();
  if (/^[A-Za-z]+(?:['-][A-Za-z]+)*$/u.test(withoutTerminalPunctuation)) {
    return withoutTerminalPunctuation;
  }
  return normalizeTypography(value);
}

export function normalizeEnglish(value: string): string {
  return canonicalizeLookupInput(value)
    .toLocaleLowerCase("en-US");
}

export function validateEnglishInput(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_input", "请输入英文内容。");
  const cleaned = normalizeTypography(value);
  if (!cleaned || cleaned.length > 2000 || !/[A-Za-z]/.test(cleaned)) {
    throw new ApiError(400, "invalid_input", "请输入 1 至 2,000 个字符的英文内容。");
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(cleaned)) {
    throw new ApiError(400, "invalid_input", "输入包含不支持的控制字符。");
  }
  if (/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(cleaned)) {
    throw new ApiError(400, "invalid_input", "这里只接收英文内容；请移除中文后再试。");
  }
  if (/<\/?[A-Za-z][^>]*>|javascript\s*:/iu.test(cleaned)) {
    throw new ApiError(400, "invalid_input", "输入看起来像 HTML 或 JavaScript，已安全拒绝。");
  }
  return cleaned;
}

export function validateAllowedSynonyms(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) {
    throw new ApiError(400, "invalid_allowed_synonyms", "同义词白名单必须是最多 200 项的英文数组。");
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    let cleaned: string;
    try {
      cleaned = validateEnglishInput(candidate);
    } catch {
      throw new ApiError(400, "invalid_allowed_synonyms", `同义词白名单第 ${index + 1} 项不是安全的英文内容。`);
    }
    if (cleaned.length > 200) {
      throw new ApiError(400, "invalid_allowed_synonyms", `同义词白名单第 ${index + 1} 项超过 200 个字符。`);
    }
    if (!LEXICAL_ENTRY_TYPES.has(classifyInput(cleaned))) continue;
    const key = normalizeEnglish(cleaned);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }
  return result;
}

export function countEnglishTokens(value: string): number {
  return value.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length || 0;
}

export function classifyInput(value: string): (typeof ENTRY_TYPES)[number] {
  const cleaned = validateEnglishInput(value);
  if (/^["']?[A-Za-z]+(?:['-][A-Za-z]+)*[.!?,;:]?["']?$/u.test(cleaned)) return "word";
  const wordCount = countEnglishTokens(cleaned);
  if (wordCount === 1) return "word";
  if (/^['\"].+['\"]$/.test(cleaned) || wordCount > 7 || /[.!?]$/.test(cleaned)) return "quote";
  return "phrase";
}

export function safeHttpsUrl(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > 2048) throw new ApiError(400, "invalid_url", "来源链接格式不正确。");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "invalid_url", "来源链接格式不正确。");
  }
  const host = url.hostname.toLowerCase();
  const privateIpv4 = /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
  if (url.protocol !== "https:" || url.username || url.password || host === "localhost" || host === "[::1]" || privateIpv4) {
    throw new ApiError(400, "invalid_url", "来源链接必须是公开可访问的 HTTPS 地址。");
  }
  url.hash = "";
  return url.href;
}

export const SourceSchema = z.object({
  title: bounded(300),
  url: bounded(2048).transform((value) => safeHttpsUrl(value)),
  kind: z.enum(["primary", "authoritative", "secondary", "candidate", "dictionary", "ai"]),
  retrievedAt: isoDate
}).strict();

export type SourceRecord = z.infer<typeof SourceSchema>;

const ExampleSchema = z.object({
  en: bounded(1000),
  zh: bounded(1000)
}).strict();

const SenseSchema = z.object({
  partOfSpeech: bounded(80),
  meaningZh: bounded(1500),
  definitionEn: bounded(1500),
  usageNotes: bounded(1000),
  register: bounded(100),
  collocations: z.array(bounded(180)).max(20),
  examples: z.array(ExampleSchema).max(6),
  confusables: z.array(bounded(180)).max(20)
}).strict();

const CorrectionSchema = z.object({
  status: z.enum(CORRECTION_DECISIONS),
  original: bounded(2000),
  suggestion: bounded(2000),
  chosen: bounded(2000),
  confidence: z.number().min(0).max(1),
  source: bounded(120)
}).strict().superRefine((correction, context) => {
  const original = normalizeEnglish(correction.original);
  const suggestion = normalizeEnglish(correction.suggestion);
  const chosen = normalizeEnglish(correction.chosen);
  if (!original) context.addIssue({ code: "custom", path: ["original"], message: "correction original is required" });
  if (!chosen) context.addIssue({ code: "custom", path: ["chosen"], message: "correction chosen is required" });
  if (correction.status === "exact") {
    if (suggestion) context.addIssue({ code: "custom", path: ["suggestion"], message: "exact correction cannot have a suggestion" });
    if (chosen !== original) context.addIssue({ code: "custom", path: ["chosen"], message: "exact correction must keep the original" });
  } else if (correction.status === "suggested") {
    if (!suggestion || suggestion === original) {
      context.addIssue({ code: "custom", path: ["suggestion"], message: "suggested correction requires a different suggestion" });
    }
    if (chosen !== original) context.addIssue({ code: "custom", path: ["chosen"], message: "suggested correction must keep the original until accepted" });
  } else if (correction.status === "accepted") {
    if (!suggestion || suggestion === original) {
      context.addIssue({ code: "custom", path: ["suggestion"], message: "accepted correction requires a different suggestion" });
    }
    if (chosen !== suggestion) context.addIssue({ code: "custom", path: ["chosen"], message: "accepted correction must choose the suggestion" });
  }
});

export const PublicEntrySchema = z.object({
  id: z.string().trim().min(1).max(180).regex(/^[A-Za-z0-9._:-]+$/),
  revision: z.number().int().min(1),
  originalInput: bounded(2000),
  term: bounded(2000).min(1),
  normalized: bounded(2000).min(1),
  standardForm: bounded(2000).min(1),
  entryType: z.enum(ENTRY_TYPES),
  correction: CorrectionSchema,
  phonetic: bounded(300),
  partOfSpeech: bounded(160),
  meaning: bounded(4000),
  definition: bounded(4000),
  senses: z.array(SenseSchema).max(20),
  synonyms: z.array(bounded(180)).max(20).default([]),
  collocations: z.array(bounded(180)).max(30),
  exampleEn: bounded(4000),
  exampleZh: bounded(4000),
  usage: bounded(4000),
  register: bounded(160),
  confusedWith: z.array(bounded(180)).max(30),
  forms: z.array(bounded(180)).max(30),
  tags: z.array(bounded(80)).max(30),
  author: bounded(300),
  sourceTitle: bounded(500),
  sourceWork: bounded(500),
  sourceDate: bounded(100),
  sourceUrl: bounded(2048).transform((value) => safeHttpsUrl(value)),
  attributionStatus: z.enum(ATTRIBUTION_STATES),
  attributionNote: bounded(1500),
  sources: z.array(SourceSchema).max(20),
  organizationMethod: z.enum(["manual", "local-dictionary", "ai-cloudflare", "ai-openai", "ai-anthropic", "mixed"]),
  createdAt: isoDate,
  updatedAt: isoDate
}).strict().superRefine((entry, context) => {
  if (entry.normalized !== normalizeEnglish(entry.term)) {
    context.addIssue({ code: "custom", path: ["normalized"], message: "normalized must match term" });
  }
  if (normalizeEnglish(entry.correction.chosen) !== normalizeEnglish(entry.term)) {
    context.addIssue({ code: "custom", path: ["correction", "chosen"], message: "correction chosen must match term" });
  }
  const selfKeys = new Set([
    entry.term,
    entry.standardForm,
    entry.correction.original,
    entry.correction.suggestion,
    entry.correction.chosen
  ].map((value) => normalizeEnglish(value)).filter(Boolean));
  const relatedFieldKeys = new Set([...entry.forms, ...entry.confusedWith].map((value) => normalizeEnglish(value)).filter(Boolean));
  const synonymKeys = new Set<string>();
  if (!LEXICAL_ENTRY_TYPES.has(entry.entryType) && entry.synonyms.length) {
    context.addIssue({ code: "custom", path: ["synonyms"], message: "non-lexical entries cannot have synonyms" });
  }
  entry.synonyms.forEach((synonym, index) => {
    const key = normalizeEnglish(synonym);
    try {
      validateEnglishInput(synonym);
    } catch {
      context.addIssue({ code: "custom", path: ["synonyms", index], message: "synonym must be safe English text" });
    }
    if (selfKeys.has(key)) {
      context.addIssue({ code: "custom", path: ["synonyms", index], message: "synonym cannot repeat the entry term or canonical form" });
    }
    if (relatedFieldKeys.has(key)) {
      context.addIssue({ code: "custom", path: ["synonyms", index], message: "synonym cannot duplicate a form or confused word" });
    }
    if (synonymKeys.has(key)) {
      context.addIssue({ code: "custom", path: ["synonyms", index], message: "synonyms must be unique" });
    }
    if (key) synonymKeys.add(key);
  });
  if (entry.attributionStatus === "candidate" && entry.author
    && !entry.sourceUrl
    && !entry.sources.some((source) => source.kind === "candidate" && source.url)) {
    context.addIssue({ code: "custom", path: ["author"], message: "candidate author requires a reviewable citation" });
  }
  if (entry.attributionStatus === "verified") {
    if (!entry.sourceUrl || !entry.sourceTitle || !entry.attributionNote) {
      context.addIssue({ code: "custom", path: ["attributionStatus"], message: "verified attribution requires title, URL and notes" });
    }
    try {
      if (entry.sourceUrl && new URL(entry.sourceUrl).hostname.toLowerCase().endsWith("wikiquote.org")) {
        context.addIssue({ code: "custom", path: ["attributionStatus"], message: "Wikiquote cannot be the sole verified source" });
      }
    } catch {
      // URL field already reports the validation failure.
    }
  }
  if (new Date(entry.updatedAt).getTime() < new Date(entry.createdAt).getTime()) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt cannot precede createdAt" });
  }
});

export type PublicEntry = z.infer<typeof PublicEntrySchema>;

export const PublicSnapshotSchema = z.object({
  schemaVersion: z.literal(PUBLIC_SCHEMA_VERSION),
  exportedAt: isoDate,
  revisionId: z.string().trim().min(12).max(180),
  lastMutationId: z.string().trim().max(180),
  entries: z.array(PublicEntrySchema).max(10_000)
}).strict().superRefine((snapshot, context) => {
  const termOwners = new Map(snapshot.entries.map((entry, index) => [normalizeEnglish(entry.term), index]));
  snapshot.entries.forEach((entry, entryIndex) => {
    entry.synonyms.forEach((synonym, synonymIndex) => {
      const ownerIndex = termOwners.get(normalizeEnglish(synonym));
      if (ownerIndex === undefined || ownerIndex === entryIndex) {
        context.addIssue({
          code: "custom",
          path: ["entries", entryIndex, "synonyms", synonymIndex],
          message: "synonym must reference another published entry term"
        });
      }
    });
  });
});

export type PublicSnapshot = z.infer<typeof PublicSnapshotSchema>;

const AiSenseSchema = z.object({
  partOfSpeech: bounded(80),
  meaningZh: bounded(1500),
  definitionEn: bounded(1500),
  usageNotes: bounded(1000),
  register: bounded(100),
  collocations: z.array(bounded(180)).max(12),
  examples: z.array(ExampleSchema).max(4),
  confusables: z.array(bounded(180)).max(12)
}).strict();

export const AiOrganizedSchema = z.object({
  suggestedTerm: bounded(2000).min(1),
  standardForm: bounded(2000).min(1),
  entryType: z.enum(ENTRY_TYPES),
  phonetic: bounded(300),
  partOfSpeech: bounded(160),
  meaning: bounded(4000),
  definition: bounded(4000),
  senses: z.array(AiSenseSchema).max(12),
  synonyms: z.array(bounded(180)).max(12),
  collocations: z.array(bounded(180)).max(20),
  exampleEn: bounded(4000),
  exampleZh: bounded(4000),
  usage: bounded(4000),
  register: bounded(160),
  confusedWith: z.array(bounded(180)).max(20),
  forms: z.array(bounded(180)).max(20),
  tags: z.array(bounded(80)).max(20),
  author: bounded(300),
  sourceTitle: bounded(500),
  sourceWork: bounded(500),
  sourceDate: bounded(100),
  attributionNote: bounded(1500)
}).strict();

export type AiOrganized = z.infer<typeof AiOrganizedSchema>;

export const AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "suggestedTerm", "standardForm", "entryType", "phonetic", "partOfSpeech", "meaning", "definition",
    "senses", "synonyms", "collocations", "exampleEn", "exampleZh", "usage", "register", "confusedWith", "forms", "tags",
    "author", "sourceTitle", "sourceWork", "sourceDate", "attributionNote"
  ],
  properties: {
    suggestedTerm: { type: "string", maxLength: 2000 },
    standardForm: { type: "string", maxLength: 2000 },
    entryType: { type: "string", enum: ENTRY_TYPES },
    phonetic: { type: "string", maxLength: 300 },
    partOfSpeech: { type: "string", maxLength: 160 },
    meaning: { type: "string", maxLength: 4000 },
    definition: { type: "string", maxLength: 4000 },
    senses: {
      type: "array", maxItems: 12, items: {
        type: "object", additionalProperties: false,
        required: ["partOfSpeech", "meaningZh", "definitionEn", "usageNotes", "register", "collocations", "examples", "confusables"],
        properties: {
          partOfSpeech: { type: "string", maxLength: 80 },
          meaningZh: { type: "string", maxLength: 1500 },
          definitionEn: { type: "string", maxLength: 1500 },
          usageNotes: { type: "string", maxLength: 1000 },
          register: { type: "string", maxLength: 100 },
          collocations: { type: "array", maxItems: 12, items: { type: "string", maxLength: 180 } },
          examples: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, required: ["en", "zh"], properties: { en: { type: "string", maxLength: 1000 }, zh: { type: "string", maxLength: 1000 } } } },
          confusables: { type: "array", maxItems: 12, items: { type: "string", maxLength: 180 } }
        }
      }
    },
    synonyms: { type: "array", maxItems: 12, items: { type: "string", maxLength: 180 } },
    collocations: { type: "array", maxItems: 20, items: { type: "string", maxLength: 180 } },
    exampleEn: { type: "string", maxLength: 4000 },
    exampleZh: { type: "string", maxLength: 4000 },
    usage: { type: "string", maxLength: 4000 },
    register: { type: "string", maxLength: 160 },
    confusedWith: { type: "array", maxItems: 20, items: { type: "string", maxLength: 180 } },
    forms: { type: "array", maxItems: 20, items: { type: "string", maxLength: 180 } },
    tags: { type: "array", maxItems: 20, items: { type: "string", maxLength: 80 } },
    author: { type: "string", maxLength: 300 },
    sourceTitle: { type: "string", maxLength: 500 },
    sourceWork: { type: "string", maxLength: 500 },
    sourceDate: { type: "string", maxLength: 100 },
    attributionNote: { type: "string", maxLength: 1500 }
  }
} as const;

function toArray(value: unknown, maximum = 30): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, maximum)
    : [];
}

function migrationDate(value: unknown, fallback: string): string {
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) return new Date(value).toISOString();
  return fallback;
}

function migrateLegacyEntry(candidate: Record<string, unknown>, now: string): PublicEntry {
  const term = validateEnglishInput(candidate.term);
  const createdAt = migrationDate(candidate.createdAt, now);
  const updatedAt = migrationDate(candidate.updatedAt, createdAt);
  const oldCorrection = candidate.correction && typeof candidate.correction === "object" ? candidate.correction as Record<string, unknown> : {};
  const original = typeof candidate.rawInput === "string" && candidate.rawInput.trim() ? candidate.rawInput : term;
  const legacyChosen = typeof oldCorrection.chosen === "string" && oldCorrection.chosen.trim() ? oldCorrection.chosen.trim() : term;
  const suggestion = normalizeEnglish(legacyChosen) === normalizeEnglish(original) ? "" : legacyChosen;
  const oldStatus = oldCorrection.status;
  const status = oldStatus === "autocorrected" && suggestion && normalizeEnglish(term) === normalizeEnglish(suggestion)
    ? "accepted"
    : oldStatus === "unchecked" || normalizeEnglish(original) !== normalizeEnglish(term) || suggestion
      ? "kept"
      : "exact";
  const oldType = typeof candidate.entryType === "string" ? candidate.entryType : classifyInput(term);
  const entryType = ENTRY_TYPES.includes(oldType as (typeof ENTRY_TYPES)[number]) ? oldType as (typeof ENTRY_TYPES)[number] : classifyInput(term);
  const oldAttribution = candidate.attributionStatus;
  const attributionStatus = oldAttribution === "source-backed" ? "candidate"
    : ATTRIBUTION_STATES.includes(oldAttribution as (typeof ATTRIBUTION_STATES)[number]) ? oldAttribution as (typeof ATTRIBUTION_STATES)[number]
      : "unverified";
  let sourceUrl = "";
  try { sourceUrl = safeHttpsUrl(candidate.sourceUrl); } catch { sourceUrl = ""; }
  return PublicEntrySchema.parse({
    id: String(candidate.id || `public-${crypto.randomUUID()}`).slice(0, 180).replace(/[^A-Za-z0-9._:-]/g, "-"),
    revision: 1,
    originalInput: original,
    term,
    normalized: normalizeEnglish(term),
    standardForm: entryType === "word" && typeof candidate.headword === "string" && candidate.headword.trim()
      ? candidate.headword.trim()
      : term,
    entryType,
    correction: {
      status,
      original,
      suggestion,
      chosen: term,
      confidence: typeof oldCorrection.confidence === "number" ? Math.max(0, Math.min(1, oldCorrection.confidence)) : 1,
      source: typeof oldCorrection.source === "string" ? oldCorrection.source : "legacy-migration"
    },
    phonetic: typeof candidate.phonetic === "string" ? candidate.phonetic : "",
    partOfSpeech: typeof candidate.partOfSpeech === "string" ? candidate.partOfSpeech : "",
    meaning: typeof candidate.meaning === "string" ? candidate.meaning : "",
    definition: typeof candidate.definition === "string" ? candidate.definition : "",
    senses: [],
    synonyms: toArray(candidate.synonyms, 20),
    collocations: [],
    exampleEn: typeof candidate.exampleEn === "string" ? candidate.exampleEn : "",
    exampleZh: typeof candidate.exampleZh === "string" ? candidate.exampleZh : "",
    usage: typeof candidate.usage === "string" ? candidate.usage : "",
    register: "",
    confusedWith: [],
    forms: toArray(candidate.forms),
    tags: toArray(candidate.tags),
    author: typeof candidate.author === "string" ? candidate.author : "",
    sourceTitle: typeof candidate.sourceTitle === "string" ? candidate.sourceTitle : "",
    sourceWork: "",
    sourceDate: "",
    sourceUrl,
    attributionStatus: attributionStatus === "verified" && (!sourceUrl || !candidate.sourceTitle) ? "unverified" : attributionStatus,
    attributionNote: typeof candidate.attributionNote === "string" ? candidate.attributionNote : "Migrated from public schema v2.",
    sources: [],
    organizationMethod: "local-dictionary",
    createdAt,
    updatedAt
  });
}

export function validateSnapshot(payload: unknown): PublicSnapshot {
  if (!payload || typeof payload !== "object") throw new ApiError(400, "invalid_snapshot", "公开词库快照格式不正确。");
  const source = payload as Record<string, unknown>;
  const version = source.schemaVersion;
  if (version === 0 || typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > PUBLIC_SCHEMA_VERSION) {
    throw new ApiError(400, "unsupported_schema", `不支持的公开词库版本：${String(version)}。`);
  }
  let snapshot: PublicSnapshot;
  if (version < PUBLIC_SCHEMA_VERSION) {
    if (!Array.isArray(source.entries)) throw new ApiError(400, "invalid_snapshot", "公开词库 entries 必须是数组。");
    const now = new Date().toISOString();
    snapshot = {
      schemaVersion: PUBLIC_SCHEMA_VERSION,
      exportedAt: migrationDate(source.exportedAt || source.updatedAt, now),
      revisionId: `migrated-${crypto.randomUUID()}`,
      lastMutationId: "",
      entries: source.entries.map((entry, index) => {
        if (!entry || typeof entry !== "object") throw new ApiError(400, "invalid_entry", `第 ${index + 1} 个词条格式不正确。`);
        return migrateLegacyEntry(entry as Record<string, unknown>, now);
      })
    };
  } else {
    const parsed = PublicSnapshotSchema.safeParse(payload);
    if (!parsed.success) {
      const hasDanglingSynonym = parsed.error.issues.some((issue) => issue.message === "synonym must reference another published entry term");
      throw new ApiError(
        400,
        "invalid_snapshot",
        hasDanglingSynonym ? "公开词库包含未实际输入或尚未发布的同义词引用。" : "公开词库没有通过严格 schema 校验。",
        parsed.error.issues
      );
    }
    snapshot = parsed.data;
  }

  const ids = new Set<string>();
  const keys = new Map<string, string>();
  for (const entry of snapshot.entries) {
    if (ids.has(entry.id)) throw new ApiError(400, "duplicate_id", `公开词库存在重复 ID：${entry.id}`);
    ids.add(entry.id);
    const aliases = [entry.normalized, normalizeEnglish(entry.standardForm)];
    if (["suggested", "accepted"].includes(entry.correction.status)) {
      aliases.push(
        normalizeEnglish(entry.correction.original),
        normalizeEnglish(entry.correction.suggestion),
        normalizeEnglish(entry.correction.chosen)
      );
    } else if (entry.correction.status === "kept") {
      aliases.push(
        normalizeEnglish(entry.correction.original),
        normalizeEnglish(entry.correction.chosen)
      );
    }
    for (const key of new Set(aliases.filter(Boolean))) {
      const owner = keys.get(key);
      if (owner && owner !== entry.id) throw new ApiError(400, "duplicate_term", `公开词库存在重复词条或拼写别名：${key}`);
      keys.set(key, entry.id);
    }
  }
  const integrity = PublicSnapshotSchema.safeParse(snapshot);
  if (!integrity.success) {
    throw new ApiError(400, "invalid_snapshot", "公开词库包含未实际输入或尚未发布的同义词引用。", integrity.error.issues);
  }
  return integrity.data;
}

export const PublishRequestSchema = z.object({
  // Server-enforced rollout gate: old owner pages that predate the run-bound
  // queue protocol must refresh before they can mutate GitHub.
  clientProtocol: z.literal("v38"),
  queueProtocol: z.literal("v38"),
  baseSha: z.string().regex(/^[0-9a-f]{40}$/i),
  mutationId: z.string().trim().min(12).max(180),
  mutation: z.discriminatedUnion("type", [
    z.object({ type: z.literal("add"), entry: PublicEntrySchema }).strict(),
    z.object({ type: z.literal("update"), entry: PublicEntrySchema, expectedUpdatedAt: isoDate }).strict(),
    z.object({ type: z.literal("delete"), id: z.string().trim().min(1).max(180), expectedUpdatedAt: isoDate }).strict()
  ])
}).strict().superRefine((request, context) => {
  if (request.mutation.type !== "delete" && request.mutation.entry.correction.status === "suggested") {
    context.addIssue({
      code: "custom",
      path: ["mutation", "entry", "correction", "status"],
      message: "publishing requires an explicit accept, keep or manual spelling decision"
    });
  }
  if (request.mutation.type !== "delete") {
    const entry = request.mutation.entry;
    if (!hasPlausibleChineseMeaning(entry.meaning)) {
      context.addIssue({
        code: "custom",
        path: ["mutation", "entry", "meaning"],
        message: "publishing requires a plausible Chinese meaning"
      });
    }
    if (entry.tags.includes("待复核")) {
      context.addIssue({
        code: "custom",
        path: ["mutation", "entry", "tags"],
        message: "a review-required candidate cannot be published until explicitly reviewed"
      });
    }
  }
});

export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export function makeEntryFromAi(
  input: string,
  organized: AiOrganized,
  provider: "cloudflare" | "openai" | "anthropic",
  sources: SourceRecord[],
  correctionConfidence = 0.55
): PublicEntry {
  const now = new Date().toISOString();
  const inputWordCount = countEnglishTokens(input);
  const entryType = inputWordCount > 1 && organized.entryType === "word" ? classifyInput(input) : organized.entryType;
  const quoteLike = ["quote", "proverb"].includes(entryType);
  const preservesMultiwordExpression = (value: string): boolean => inputWordCount < 2 || countEnglishTokens(value) >= 2;
  const rawSuggested = organized.suggestedTerm.trim();
  // A model must not silently rewrite the wording or punctuation of a quote.
  // Exact evidence lookup, rather than model memory, is the correction gate.
  const suggested = quoteLike ? input : preservesMultiwordExpression(rawSuggested) ? rawSuggested : input;
  const rawStandardForm = organized.standardForm.trim() || suggested || input;
  const standardForm = quoteLike ? input : preservesMultiwordExpression(rawStandardForm) ? rawStandardForm : input;
  const hasSuggestion = normalizeEnglish(input) !== normalizeEnglish(suggested);
  const hasEvidence = quoteLike && sources.length > 0;
  return PublicEntrySchema.parse({
    id: `public-${crypto.randomUUID()}`,
    revision: 1,
    originalInput: input,
    term: input,
    normalized: normalizeEnglish(input),
    standardForm,
    entryType,
    correction: {
      status: hasSuggestion ? "suggested" : "exact",
      original: input,
      suggestion: hasSuggestion ? suggested : "",
      chosen: input,
      confidence: hasSuggestion ? Math.max(0, Math.min(1, correctionConfidence)) : 1,
      source: hasSuggestion ? `ai-${provider}+edit-distance-heuristic` : `ai-${provider}`
    },
    phonetic: organized.phonetic,
    partOfSpeech: organized.partOfSpeech,
    meaning: organized.meaning,
    definition: organized.definition,
    senses: organized.senses,
    synonyms: organized.synonyms,
    collocations: organized.collocations,
    exampleEn: organized.exampleEn,
    exampleZh: organized.exampleZh,
    usage: organized.usage,
    register: organized.register,
    confusedWith: organized.confusedWith,
    forms: organized.forms,
    tags: organized.tags,
    author: hasEvidence ? organized.author : "",
    sourceTitle: hasEvidence ? organized.sourceTitle : "",
    sourceWork: hasEvidence ? organized.sourceWork : "",
    sourceDate: hasEvidence ? organized.sourceDate : "",
    sourceUrl: sources[0]?.url || "",
    attributionStatus: hasEvidence ? "candidate" : "unverified",
    attributionNote: quoteLike
      ? (hasEvidence ? "AI 通过英文网络搜索找到候选来源；尚未人工核验原始文本。" : "未找到可核验的来源；作者与出处保持空白。")
      : organized.attributionNote,
    sources,
    organizationMethod: `ai-${provider}`,
    createdAt: now,
    updatedAt: now
  });
}
