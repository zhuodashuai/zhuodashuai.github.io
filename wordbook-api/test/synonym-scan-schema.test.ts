import { describe, expect, it } from "vitest";
import { PublicEntrySchema, PublicSnapshotSchema, SynonymScanSchema } from "../src/schema";
import { entry, snapshot } from "./fixtures";

const scan = (overrides: Record<string, unknown> = {}) => ({
  version: 1, status: "complete", sourceFingerprint: "s1:012345ab", candidatesFingerprint: "s1:89abcdef",
  checkedAt: "2026-09-26T12:00:00.000Z", candidateCount: 2,
  matches: [{ targetId: "word-yummy", targetFingerprint: "s1:aabbccdd", note: "都可形容食物好吃；yummy 更口语。" }],
  reason: "", ...overrides
});

describe("optional synonym recognition metadata", () => {
  it("keeps legacy entries byte-equivalent without inserting metadata", () => {
    const original = entry();
    const parsed = PublicEntrySchema.parse(original);
    expect(Object.hasOwn(parsed, "synonymScan")).toBe(false);
    expect(parsed).toEqual(original);
  });

  it("preserves complete and pending records through strict public validation", () => {
    for (const status of ["complete", "pending"]) {
      const synonymScan = SynonymScanSchema.parse(scan({ status }));
      const original = entry({ synonymScan });
      expect(PublicEntrySchema.parse(original)).toEqual(original);
      expect(PublicSnapshotSchema.parse(snapshot([original])).entries[0].synonymScan).toEqual(synonymScan);
    }
  });

  it("rejects malformed, incomplete, duplicate and oversized metadata", () => {
    const missing: Record<string, unknown> = scan();
    delete missing.reason;
    const invalid = [
      null, [], missing, scan({ extra: true }), scan({ version: 2 }), scan({ status: "failed" }),
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
    for (const candidate of invalid) expect(SynonymScanSchema.safeParse(candidate).success, JSON.stringify(candidate)).toBe(false);
    expect(PublicEntrySchema.safeParse({ ...entry(), synonymScan: null }).success).toBe(false);
  });

  it("defers relation existence and sense-fingerprint freshness to reconciliation and rendering", () => {
    const synonymScan = SynonymScanSchema.parse(scan({ status: "pending", matches: [{ targetId: "deleted-entry", targetFingerprint: "s1:aaaaaaaa", note: "待重新核对" }] }));
    expect(PublicSnapshotSchema.parse(snapshot([entry({ synonymScan })])).entries[0].synonymScan).toEqual(synonymScan);
  });
});
