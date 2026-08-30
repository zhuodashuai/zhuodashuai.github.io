import { describe, expect, it } from "vitest";
import publishedSnapshot from "../../vocab/data/owner-wordbook.json";
import { PublicSnapshotSchema } from "../src/schema";

const REQUIRED_BASELINE_TERMS = [
  "jab at",
  "hip",
  "surveillance",
  "perspicacious"
];

describe("published wordbook content", () => {
  it("passes the strict Worker schema for every published entry", () => {
    const parsed = PublicSnapshotSchema.parse(publishedSnapshot);
    expect(parsed.entries.length).toBeGreaterThanOrEqual(REQUIRED_BASELINE_TERMS.length);
  });

  it("retains the curated baseline without rejecting owner-added entries", () => {
    const parsed = PublicSnapshotSchema.parse(publishedSnapshot);
    expect(parsed.entries.map((entry) => entry.normalized)).toEqual(
      expect.arrayContaining(REQUIRED_BASELINE_TERMS)
    );
  });

  it("keeps published entry ids and normalized terms unique", () => {
    const parsed = PublicSnapshotSchema.parse(publishedSnapshot);
    const ids = parsed.entries.map((entry) => entry.id);
    const normalizedTerms = parsed.entries.map((entry) => entry.normalized);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(normalizedTerms).size).toBe(normalizedTerms.length);
  });
});
