import { describe, expect, it } from "vitest";
import { PublicEntrySchema } from "../src/schema";
import { entry } from "./fixtures";

const membership = "collection:never-let-me-go:chapter-5";
const readingContext = {
  membership, page: "p. 49", originalInput: "carry on", entryType: "phrase" as const, partOfSpeech: "verb phrase",
  meaning: "继续", definition: "To continue.", usage: "第五章语境。", register: "neutral",
  collocations: [], confusedWith: [], forms: [], exampleEn: "Please carry on.", exampleZh: "请继续。",
  sourceTitle: "Never Let Me Go — Chapter 5", sourceWork: "Never Let Me Go", sourceDate: "p. 49",
  attributionNote: "Original practice sentence."
};

describe("optional reading context order", () => {
  it("round-trips legacy context JSON without introducing a default order", () => {
    const result = PublicEntrySchema.parse(entry({ tags: [membership], readingContexts: [readingContext] }));
    expect(result.readingContexts).toEqual([readingContext]);
    expect(Object.hasOwn(result.readingContexts[0], "order")).toBe(false);
  });

  it("accepts bounded positive integers and rejects other values and unknown keys", () => {
    const base = entry({ tags: [membership], readingContexts: [readingContext] });
    for (const order of [1, 159, 100_000]) {
      expect(PublicEntrySchema.parse({ ...base, readingContexts: [{ ...readingContext, order }] }).readingContexts[0].order).toBe(order);
    }
    for (const order of [0, -1, 1.5, 100_001, "1", null]) {
      expect(PublicEntrySchema.safeParse({ ...base, readingContexts: [{ ...readingContext, order }] }).success).toBe(false);
    }
    expect(PublicEntrySchema.safeParse({ ...base, readingContexts: [{ ...readingContext, unknownOrder: 1 }] }).success).toBe(false);
  });
});
