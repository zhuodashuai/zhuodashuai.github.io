import { describe, expect, it } from "vitest";
import publishedSnapshot from "../../vocab/data/owner-wordbook.json";
import chapterEight from "../../vocab/data/reading-lists/never-let-me-go/chapter-8.json";
import chapterNine from "../../vocab/data/reading-lists/never-let-me-go/chapter-9.json";
// @ts-expect-error The browser projection module has no TypeScript declaration.
import { contextualizeReadingEntry } from "../../vocab/js/wordbook-schema.js";
import { PublishRequestSchema, validateSnapshot, type PublicEntry } from "../src/schema";
import { applyPublishMutation } from "../src/wordbook";

const remote = validateSnapshot(publishedSnapshot);
const book = "never-let-me-go";

for (const { source, count } of [{ source: chapterEight, count: 18 }, { source: chapterNine, count: 8 }]) {
  const chapter = source.chapter.id;
  const membership = `collection:${book}:${chapter}`;
  const cards = remote.entries.filter(entry => entry.tags.includes(membership));

  describe(`${source.chapter.title} actual-card publication regression`, () => {
    it(`retains precisely ${count} selected cards through the API snapshot round-trip`, () => {
      expect(source.items).toHaveLength(count);
      expect(cards).toHaveLength(count);
      expect(cards.map(entry => entry.term)).toEqual(source.items.map(item => item.term));
      expect(new Set(cards.map(entry => entry.id)).size).toBe(count);
      expect(new Set(cards.map(entry => entry.normalized)).size).toBe(count);
      const roundTrip = validateSnapshot(JSON.parse(JSON.stringify(remote)));
      expect(roundTrip).toEqual(publishedSnapshot);
      expect(roundTrip.entries.filter(entry => entry.tags.includes(membership))).toEqual(cards);
    });

    for (const view of ["canonical", "chapter-projected"] as const) {
      for (const item of source.items) {
        it(`${view}: ${item.term} passes the lexical gate and preserves its source context without changing another card`, () => {
          const canonical = cards.find(entry => entry.term === item.term)!;
          expect(canonical).toBeDefined();
          const candidate = view === "canonical"
            ? canonical
            : contextualizeReadingEntry(canonical, book, chapter) as PublicEntry;
          const request = PublishRequestSchema.parse({
            clientProtocol: "v38", queueProtocol: "v38", baseSha: "a".repeat(40),
            mutationId: `${chapter}-${view}-${canonical.id}`,
            mutation: { type: "update", entry: candidate, expectedUpdatedAt: canonical.updatedAt }
          });
          const result = applyPublishMutation(remote, request, "2026-09-30T12:00:00.000Z");
          expect(result.action).toBe("updated");
          expect(result.entry!.id).toBe(canonical.id);
          expect(result.entry!.createdAt).toBe(canonical.createdAt);
          expect(result.entry!.readingContexts).toEqual(canonical.readingContexts);
          expect(result.snapshot.entries).toHaveLength(remote.entries.length);
          expect(result.snapshot.entries.filter(entry => entry.id !== canonical.id))
            .toEqual(remote.entries.filter(entry => entry.id !== canonical.id));
          const restored = validateSnapshot(JSON.parse(JSON.stringify(result.snapshot)));
          expect(restored).toEqual(result.snapshot);
          const projected = contextualizeReadingEntry(result.entry!, book, chapter) as PublicEntry;
          expect(projected.term).toBe(item.term);
          expect(projected.originalInput).toBe(item.originalInput);
          expect(projected.phonetic).toBe(item.phonetic);
          expect(projected.partOfSpeech).toBe(item.partOfSpeech);
          expect(projected.meaning).toBe(item.meaning);
          expect(projected.definition).toBe(item.definitionEn);
          expect(projected.usage).toBe(item.usage);
          expect(projected.exampleEn).toBe(item.exampleEn);
          expect(projected.exampleZh).toBe(item.exampleZh);
          expect(projected.forms).toEqual(item.forms);
          expect(projected.sourceTitle).toBe(source.sourceTitle);
          expect(projected.sourceDate).toBe(`p. ${item.page}`);
          expect(projected.attributionNote).toBe(source.attributionNote);
        });
      }
    }
  });
}
