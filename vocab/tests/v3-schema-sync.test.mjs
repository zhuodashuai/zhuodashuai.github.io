import assert from "node:assert/strict";
import test from "node:test";
import {
  entryLookupKeys,
  createBlankEntry,
  findDuplicate,
  needsAiCompletion,
  parsePublicSnapshot,
  safeHttpsUrl,
  validatePublicEntry
} from "../js/wordbook-schema.js";
import { classifySyncFailure, mergeAiCandidate, nextRetryAt, rebaseOperation, threeWayMergeEntry } from "../js/sync-logic.js";

function entry(term = "jab at", overrides = {}) {
  const blank = createBlankEntry(term);
  return validatePublicEntry({ ...blank, meaning: "测试释义", ...overrides });
}

test("v3 browser schema keeps jab at whole and rejects unknown fields", () => {
  const value = entry("jab at");
  assert.equal(value.entryType, "phrase");
  assert.equal(value.standardForm, "jab at");
  assert.throws(() => validatePublicEntry({ ...value, html: "<img onerror=alert(1)>" }), /未知字段/);
});

test("v3 browser schema accepts a Cloudflare-organized draft", () => {
  const value = entry("hip", { organizationMethod: "ai-cloudflare" });
  assert.equal(value.organizationMethod, "ai-cloudflare");
});

test("AI completion detection retries incomplete words but preserves complete duplicates", () => {
  const blankHip = createBlankEntry("hip");
  assert.equal(needsAiCompletion(blankHip), true);
  const completeHip = entry("hip", {
    phonetic: "/hɪp/",
    definition: "The side of the body below the waist.",
    senses: [{
      partOfSpeech: "noun", meaningZh: "髋部", definitionEn: "The side of the body below the waist.",
      usageNotes: "", register: "neutral", collocations: [],
      examples: [{ en: "She hurt her hip.", zh: "她伤到了髋部。" }], confusables: []
    }]
  });
  assert.equal(needsAiCompletion(completeHip), false);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "\u200b" }), true);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "/\u200b/" }), true);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "hip" }), true);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "", organizationMethod: "ai-cloudflare" }), false);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "", organizationMethod: "mixed" }), false);
  assert.equal(needsAiCompletion({ ...completeHip, phonetic: "", organizationMethod: "manual" }), true);
  for (const entryType of ["quote", "proverb", "sentence"]) {
    const completeNonLexical = entry("Knowledge is power.", {
      entryType,
      definition: "A complete non-lexical learning entry.",
      senses: [],
      phonetic: ""
    });
    assert.equal(needsAiCompletion(completeNonLexical), false, `${entryType} does not require lexical senses`);
  }
  assert.equal(needsAiCompletion({ ...completeHip, entryType: "phrase", senses: [] }), true);
});

test("AI fills schema-equivalent blank legacy fields without overwriting edits made in flight", () => {
  const baseline = { id: "stable-id", revision: 4, phonetic: undefined, meaning: "old", collocations: [] };
  const current = { id: "stable-id", revision: 4, phonetic: "", meaning: "owner edit", collocations: [] };
  const candidate = { id: "ai-generated-id", revision: 1, phonetic: "/hɪp/", meaning: "AI replacement", collocations: ["hip joint"] };
  const result = mergeAiCandidate(baseline, current, candidate);
  assert.equal(result.merged.id, "stable-id");
  assert.equal(result.merged.revision, 4);
  assert.equal(result.merged.phonetic, "/hɪp/");
  assert.equal(result.merged.meaning, "owner edit");
  assert.deepEqual(result.merged.collocations, ["hip joint"]);
  assert.equal(result.preservedManualChanges, true);
});

test("automatic AI completion fills blanks without replacing earlier manual content", () => {
  const baseline = {
    id: "stable-id", revision: 4, meaning: "卓手工释义", definition: "", phonetic: "", senses: [],
    correction: { status: "exact" }, organizationMethod: "manual"
  };
  const candidate = {
    id: "ai-id", revision: 1, meaning: "AI释义", definition: "AI definition", phonetic: "/hɪp/",
    senses: [{ partOfSpeech: "noun", meaningZh: "髋部" }], correction: { status: "exact", source: "ai" },
    organizationMethod: "ai-cloudflare"
  };
  const result = mergeAiCandidate(baseline, structuredClone(baseline), candidate, { fillMissingOnly: true });
  assert.equal(result.merged.id, "stable-id");
  assert.equal(result.merged.meaning, "卓手工释义");
  assert.equal(result.merged.definition, "AI definition");
  assert.equal(result.merged.phonetic, "/hɪp/");
  assert.equal(result.merged.senses.length, 1);
  assert.equal(result.merged.organizationMethod, "mixed");
  assert.equal(result.preservedManualChanges, true);
});

test("v3 browser schema migrates the real legacy shape without accepting schema zero", () => {
  const migrated = parsePublicSnapshot({ schemaVersion: 2, updatedAt: "2026-08-27T00:00:00.000Z", entries: [{
    id: "public-jab-at", term: "jab at", normalized: "jab at", headword: "jab", entryType: "phrase", meaning: "猛戳",
    definition: "To jab toward.", forms: [], tags: [], sources: [], createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z"
  }] });
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.entries[0].standardForm, "jab at");
  assert.throws(() => parsePublicSnapshot({ schemaVersion: 0, entries: [] }), /不支持/);
});

test("duplicate detection covers correction and standard-form aliases", () => {
  const correct = entry("receive", { id: "receive", entryType: "word" });
  const typo = entry("recieve", {
    id: "recieve", entryType: "word", standardForm: "receive",
    correction: { status: "suggested", original: "recieve", suggestion: "receive", chosen: "recieve", confidence: .98, source: "test" }
  });
  assert.equal(findDuplicate([correct], typo).id, "receive");
});

test("a rejected spelling suggestion is not reserved as an alias", () => {
  const keptOriginal = entry("desert", {
    id: "desert", entryType: "word", standardForm: "desert",
    correction: { status: "kept", original: "desert", suggestion: "dessert", chosen: "desert", confidence: .6, source: "test" }
  });
  assert.deepEqual(entryLookupKeys(keptOriginal), ["desert"]);
  assert.equal(findDuplicate([keptOriginal], entry("dessert", { id: "dessert", entryType: "word" })), null);
});

test("source URLs reject scripts, credentials and private networks", () => {
  assert.throws(() => safeHttpsUrl("javascript:alert(1)"));
  assert.throws(() => safeHttpsUrl("https://name:pass@example.com/source"));
  assert.throws(() => safeHttpsUrl("https://192.168.1.2/source"));
  assert.equal(safeHttpsUrl("https://example.edu/source#quote"), "https://example.edu/source");
});

test("three-way merge keeps one-sided changes and reports same-field conflicts", () => {
  const base = entry("receive", { id: "receive", entryType: "word", meaning: "收到", usage: "base" });
  const local = { ...base, meaning: "收到；接收" };
  const remote = { ...base, usage: "remote usage", updatedAt: "2026-08-28T01:00:00.000Z", revision: 2 };
  const clean = threeWayMergeEntry(base, local, remote);
  assert.equal(clean.conflicts.length, 0);
  assert.equal(clean.merged.meaning, "收到；接收");
  assert.equal(clean.merged.usage, "remote usage");
  const conflicted = threeWayMergeEntry(base, { ...base, meaning: "本地" }, { ...remote, meaning: "远端" });
  assert.deepEqual(conflicted.conflicts.map((item) => item.path), ["meaning"]);
  assert.equal(conflicted.merged.meaning, "本地");
});

test("operation rebasing never overwrites a remotely changed delete", () => {
  const base = entry("receive", { id: "receive", entryType: "word" });
  const remote = { ...base, meaning: "远端刚修改", updatedAt: "2026-08-28T01:00:00.000Z", revision: 2 };
  const result = rebaseOperation({
    entryId: "receive", baseEntry: base,
    request: { clientProtocol: "v38", queueProtocol: "v38", baseSha: "a".repeat(40), mutationId: "mutation-delete-1", mutation: { type: "delete", id: "receive", expectedUpdatedAt: base.updatedAt } }
  }, { entries: [remote] }, "b".repeat(40));
  assert.equal(result.status, "conflict");
  assert.equal(result.conflicts[0].path, "$delete");
});

test("a semantic rebase rotates the remote mutation id instead of reusing a bound idempotency key", () => {
  const base = entry("receive", { id: "receive", entryType: "word", meaning: "收到", usage: "base" });
  const local = { ...base, meaning: "收到；接收" };
  const remote = { ...base, usage: "remote usage", updatedAt: "2026-08-28T01:00:00.000Z", revision: 2 };
  const originalMutationId = "mutation-update-bound-1";
  const result = rebaseOperation({
    entryId: "receive",
    baseEntry: base,
    request: {
      clientProtocol: "v38",
      queueProtocol: "v38",
      baseSha: "a".repeat(40),
      mutationId: originalMutationId,
      mutation: { type: "update", entry: local, expectedUpdatedAt: base.updatedAt }
    }
  }, { entries: [remote] }, "b".repeat(40));

  assert.equal(result.status, "rebased");
  assert.equal(result.request.baseSha, "b".repeat(40));
  assert.equal(result.request.clientProtocol, "v38");
  assert.equal(result.request.queueProtocol, "v38");
  assert.equal(result.request.mutation.entry.meaning, "收到；接收");
  assert.equal(result.request.mutation.entry.usage, "remote usage");
  assert.notEqual(result.request.mutationId, originalMutationId);
  assert.match(result.request.mutationId, /^[0-9a-f-]{36}$/i);
});

test("retry classification and backoff distinguish conflicts and transient failures", () => {
  assert.deepEqual(classifySyncFailure({ status: 409 }), { state: "conflict", retryable: false });
  assert.deepEqual(classifySyncFailure({ status: 503 }), { state: "retry_wait", retryable: true });
  assert.equal(nextRetryAt(1, 0, 0, () => 0), "1970-01-01T00:00:05.000Z");
  assert.equal(nextRetryAt(8, 30, 0, () => 0), "1970-01-01T00:00:30.000Z");
});
