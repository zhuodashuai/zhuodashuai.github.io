import { normalizeEnglish, type PublicEntry, type PublicSnapshot } from "../src/schema";

export function entry(overrides: Partial<PublicEntry> = {}): PublicEntry {
  const now = "2026-08-28T00:00:00.000Z";
  const term = overrides.term || "jab at";
  const result: PublicEntry = {
    id: "public-jab-at",
    revision: 1,
    originalInput: term,
    term,
    normalized: normalizeEnglish(term),
    standardForm: term,
    entryType: "phrase",
    correction: { status: "exact", original: term, suggestion: "", chosen: term, confidence: 1, source: "test" },
    phonetic: "/dʒæb æt/",
    partOfSpeech: "verb phrase",
    meaning: "朝某人或某物猛戳；言语上挖苦",
    definition: "To make a quick sharp movement or criticism toward someone or something.",
    senses: [],
    synonyms: [],
    collocations: ["take a jab at"],
    exampleEn: "He jabbed at the button.",
    exampleZh: "他猛戳按钮。",
    usage: "Treat the phrase as a whole.",
    register: "neutral",
    confusedWith: [],
    forms: ["jabbed at"],
    tags: ["短语"],
    author: "",
    sourceTitle: "",
    sourceWork: "",
    sourceDate: "",
    sourceUrl: "",
    attributionStatus: "unverified",
    attributionNote: "",
    sources: [],
    organizationMethod: "manual",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
  if (overrides.term !== undefined && overrides.normalized === undefined) result.normalized = normalizeEnglish(result.term);
  if (overrides.term !== undefined && overrides.standardForm === undefined) result.standardForm = result.term;
  if (overrides.term !== undefined && overrides.originalInput === undefined) result.originalInput = result.term;
  if (overrides.correction === undefined) {
    result.correction = { status: "exact", original: result.term, suggestion: "", chosen: result.term, confidence: 1, source: "test" };
  }
  return result;
}

export function snapshot(entries: PublicEntry[] = [entry()]): PublicSnapshot {
  return {
    schemaVersion: 3,
    exportedAt: "2026-08-28T00:00:00.000Z",
    revisionId: "revision-test-0001",
    lastMutationId: "",
    entries
  };
}
