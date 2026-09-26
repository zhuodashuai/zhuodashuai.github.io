import { describe, expect, it } from "vitest";
import publishedSnapshot from "../../vocab/data/owner-wordbook.json";
import chapterSource from "../../vocab/data/reading-lists/never-let-me-go/chapter-5.json";
// @ts-expect-error The browser projection module has no TypeScript declaration.
import { contextualizeReadingEntry } from "../../vocab/js/wordbook-schema.js";
import { PublicEntrySchema, PublishRequestSchema, validateSnapshot, type PublicEntry } from "../src/schema";
import { applyPublishMutation } from "../src/wordbook";
import { entry } from "./fixtures";

const membership = "collection:never-let-me-go:chapter-5";
const compositeTerms = ["kidnap / abduction", "explicitly / imply"];
const readingContext = {
  membership, page: "p. 49", originalInput: "carried on", entryType: "phrasal-verb" as const,
  partOfSpeech: "verb", meaning: "继续下去", definition: "To continue an activity.",
  usage: "carry on doing something", register: "neutral", collocations: [], confusedWith: [], forms: [],
  exampleEn: "We carried on walking.", exampleZh: "我们继续往前走。",
  sourceTitle: "Never Let Me Go — Chapter 5", sourceWork: "Never Let Me Go", sourceDate: "p. 49",
  attributionNote: "Original practice sentence."
};
const baseEntry = entry({ tags: [membership], readingContexts: [readingContext] });
const sense = baseEntry.senses[0];

function chapterEntries(entries: PublicEntry[]): PublicEntry[] {
  return entries.filter((candidate) => candidate.tags.includes(membership));
}

describe("Chapter 5 publication regression", () => {
  it("round-trips the actual 306-entry snapshot through the API snapshot validator", () => {
    const parsed = validateSnapshot(publishedSnapshot);
    expect(parsed.entries).toHaveLength(306);
    expect(chapterEntries(parsed.entries)).toHaveLength(159);
    expect(parsed).toEqual(publishedSnapshot);
    expect(validateSnapshot(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it("preserves both structured senses of each composite card in its reading context", () => {
    const parsed = validateSnapshot(publishedSnapshot);
    for (const term of compositeTerms) {
      const candidate = parsed.entries.find((item) => item.term === term)!;
      const context = candidate.readingContexts.find((item) => item.membership === membership)!;
      const source = chapterSource.items.find((item) => item.term === term)!;
      expect(candidate, term).toBeDefined();
      expect(context.senses, term).toHaveLength(2);
      expect(context.senses, term).toEqual(candidate.senses);
      expect(context.senses, term).toEqual(source.senses);
      expect(context.senses!.map((item) => item.partOfSpeech), term).toEqual(
        term === "kidnap / abduction" ? ["verb", "noun"] : ["adverb", "verb"]
      );
      const projected = contextualizeReadingEntry(candidate, "never-let-me-go", "chapter-5") as PublicEntry;
      expect(PublicEntrySchema.parse(projected).senses, term).toEqual(context.senses);
    }
  });

  for (const view of ["canonical", "Chapter 5 projected"] as const) {
    it(`accepts all 159 actual ${view} entries through the API publish and lexical quality gates`, () => {
      const remote = validateSnapshot(publishedSnapshot);
      const candidates = chapterEntries(remote.entries);
      expect(candidates).toHaveLength(159);
      expect(candidates.map((candidate) => candidate.term).sort()).toEqual(
        chapterSource.items.map((item) => item.term).sort()
      );
      const failures: string[] = [];
      for (const canonical of candidates) {
        const candidate = view === "canonical"
          ? canonical
          : contextualizeReadingEntry(canonical, "never-let-me-go", "chapter-5") as PublicEntry;
        try {
          const request = PublishRequestSchema.parse({
            clientProtocol: "v38", queueProtocol: "v38", baseSha: "a".repeat(40),
            mutationId: `chapter-five-api-check-${canonical.id}`,
            mutation: { type: "update", entry: candidate, expectedUpdatedAt: canonical.updatedAt }
          });
          const result = applyPublishMutation(remote, request, "2026-09-27T18:00:00.000Z");
          expect(result.action).toBe("updated");
          expect(result.entry!.id).toBe(canonical.id);
          expect(result.snapshot.entries).toHaveLength(306);
          expect(result.entry!.readingContexts).toEqual(canonical.readingContexts);
          if (compositeTerms.includes(candidate.term)) {
            expect(result.entry!.senses).toHaveLength(2);
          }
        } catch (error) {
          failures.push(`${candidate.term}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      expect(failures).toEqual([]);
    }, 30_000);
  }
});

describe("optional structured reading context senses", () => {
  it("preserves absent senses on an existing reading context without adding a default", () => {
    const parsed = PublicEntrySchema.parse(baseEntry);
    expect(parsed.readingContexts).toEqual([readingContext]);
    expect(Object.hasOwn(parsed.readingContexts[0], "senses")).toBe(false);
    expect(JSON.parse(JSON.stringify(parsed)).readingContexts).toEqual([readingContext]);
  });

  it.each([1, 2, 20])("round-trips a context with %i complete senses", (count) => {
    const senses = Array.from({ length: count }, () => structuredClone(sense));
    const context = { ...readingContext, senses };
    const parsed = PublicEntrySchema.parse({ ...baseEntry, readingContexts: [context] });
    expect(parsed.readingContexts).toEqual([context]);
    expect(PublicEntrySchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it.each([
    ["null", null],
    ["empty array", []],
    ["21 senses", Array.from({ length: 21 }, () => structuredClone(sense))],
    ["non-array", {}],
    ["missing required sense fields", [{ partOfSpeech: "verb" }]],
    ["unknown sense field", [{ ...sense, extra: true }]],
    ["malformed bilingual example", [{ ...sense, examples: [{ en: "An example." }] }]],
    ["unknown example field", [{ ...sense, examples: [{ en: "An example.", zh: "示例句子。", extra: true }] }]],
    ["overlong sense field", [{ ...sense, meaningZh: "词".repeat(1501) }]],
    ["control character", [{ ...sense, definitionEn: "Unsafe\u202Edefinition" }]]
  ])("rejects %s in context senses with an error at the context field", (_label, senses) => {
    const result = PublicEntrySchema.safeParse({
      ...baseEntry, readingContexts: [{ ...readingContext, senses }]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => (
        issue.path[0] === "readingContexts" && issue.path[1] === 0 && issue.path[2] === "senses"
      ))).toBe(true);
    }
  });
});
