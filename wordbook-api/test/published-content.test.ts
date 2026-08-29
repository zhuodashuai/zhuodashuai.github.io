import { describe, expect, it } from "vitest";
import publishedSnapshot from "../../vocab/data/owner-wordbook.json";
import { PublicSnapshotSchema } from "../src/schema";

describe("published wordbook content", () => {
  it("passes the Worker schema after curated lexical corrections", () => {
    const parsed = PublicSnapshotSchema.parse(publishedSnapshot);
    expect(parsed.entries.map((entry) => entry.term)).toEqual([
      "jab at",
      "hip",
      "surveillance",
      "perspicacious"
    ]);
    expect(parsed.entries.every((entry) => entry.synonyms.length === 0)).toBe(true);
  });
});
