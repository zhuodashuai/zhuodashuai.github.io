import assert from "node:assert/strict";
import test from "node:test";
import { createBlankEntry, parsePublicSnapshot, validatePublicEntry, validateSynonymScan } from "../js/wordbook-schema.js";

const scan = (overrides = {}) => ({
  version: 1, status: "complete", sourceFingerprint: "s1:012345ab", candidatesFingerprint: "s1:89abcdef",
  checkedAt: "2026-09-26T12:00:00.000Z", candidateCount: 2,
  matches: [{ targetId: "word-yummy", targetFingerprint: "s1:aabbccdd", note: "都可形容食物好吃；yummy 更口语。" }],
  reason: "", ...overrides
});

test("synonym scan is optional and old entries do not acquire a default metadata field", () => {
  const entry = createBlankEntry("delicious");
  const parsed = validatePublicEntry(entry);
  assert.equal(Object.hasOwn(parsed, "synonymScan"), false);
  assert.deepEqual(parsed, entry);
});

test("synonym scan round-trips through entry and snapshot validation without changing lexical content", () => {
  const original = createBlankEntry("delicious");
  const entry = { ...original, synonymScan: scan() };
  assert.deepEqual(validatePublicEntry(entry), entry);
  const parsed = parsePublicSnapshot({ schemaVersion: 3, exportedAt: entry.createdAt, revisionId: "synonym-test-snapshot", lastMutationId: "", entries: [entry] });
  assert.deepEqual(parsed.entries[0], entry);
  assert.deepEqual(validateSynonymScan(scan({ status: "pending", matches: [], reason: "等待重试" })), scan({ status: "pending", matches: [], reason: "等待重试" }));
});

test("synonym scan rejects missing, unknown, malformed and over-limit fields", () => {
  const missing = scan();
  delete missing.reason;
  const cases = [
    null, [], missing, scan({ unknown: true }), scan({ version: 2 }), scan({ status: "failed" }),
    scan({ sourceFingerprint: "" }), scan({ sourceFingerprint: "s1:ABCDEF12" }), scan({ candidatesFingerprint: "s1:123" }),
    scan({ checkedAt: "yesterday" }), scan({ checkedAt: "2026-09-26" }),
    scan({ candidateCount: "2" }), scan({ candidateCount: -1 }), scan({ candidateCount: 1.5 }), scan({ candidateCount: 100001 }),
    scan({ reason: "x".repeat(501) }), scan({ reason: "\u202Eunsafe" }),
    scan({ matches: Array.from({ length: 21 }, (_, index) => ({ targetId: `word-${index}`, targetFingerprint: "s1:aabbccdd", note: "" })) }),
    scan({ matches: [{ targetId: "<word>", targetFingerprint: "s1:aabbccdd", note: "" }] }),
    scan({ matches: [{ targetId: "word-yummy", targetFingerprint: "s1:aabbccdd", note: "x".repeat(501) }] }),
    scan({ matches: [{ targetId: "word-yummy", targetFingerprint: "not-a-fingerprint", note: "" }] }),
    scan({ matches: [{ targetId: "word-yummy", targetFingerprint: "s1:aabbccdd", note: "", extra: true }] }),
    scan({ matches: [scan().matches[0], scan().matches[0]] })
  ];
  for (const candidate of cases) assert.throws(() => validateSynonymScan(candidate), JSON.stringify(candidate));
  for (const candidate of [null, undefined]) assert.throws(() => validatePublicEntry({ ...createBlankEntry("delicious"), synonymScan: candidate }));
});

test("synonym scan validates structure only, allowing pending evidence to reference a removed entry until reconciliation", () => {
  const metadata = scan({ status: "pending", matches: [{ targetId: "deleted-entry", targetFingerprint: "s1:aaaaaaaa", note: "待重新核对" }] });
  assert.deepEqual(validateSynonymScan(metadata), metadata);
});
