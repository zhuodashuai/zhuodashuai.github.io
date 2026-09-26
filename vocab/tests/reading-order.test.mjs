import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { filterEntriesByCollection } from "../js/collections.js";
import { createBlankEntry, validatePublicEntry } from "../js/wordbook-schema.js";

const membership = "collection:never-let-me-go:chapter-5";

function context(overrides = {}) {
  return {
    membership, page: "p. 49", originalInput: "carry on", entryType: "phrase", partOfSpeech: "verb phrase",
    meaning: "继续", definition: "To continue.", usage: "第五章语境。", register: "neutral",
    collocations: [], confusedWith: [], forms: [], exampleEn: "Please carry on.", exampleZh: "请继续。",
    sourceTitle: "Never Let Me Go — Chapter 5", sourceWork: "Never Let Me Go", sourceDate: "p. 49",
    attributionNote: "Original practice sentence.", ...overrides
  };
}

test("optional chapter order survives validation without changing legacy contexts", () => {
  const entry = { ...createBlankEntry("carry on"), tags: [membership], readingContexts: [context()] };
  assert.deepEqual(validatePublicEntry(entry).readingContexts, entry.readingContexts);
  assert.equal(Object.hasOwn(validatePublicEntry(entry).readingContexts[0], "order"), false);
  for (const order of [1, 159, 100_000]) {
    assert.equal(validatePublicEntry({ ...entry, readingContexts: [context({ order })] }).readingContexts[0].order, order);
  }
  for (const order of [0, -1, 1.5, 100_001, "1", null]) {
    assert.throws(() => validatePublicEntry({ ...entry, readingContexts: [context({ order })] }), /章节顺序/u);
  }
  assert.throws(() => validatePublicEntry({ ...entry, readingContexts: [context({ unknownOrder: 1 })] }), /未知字段/u);
});

test("a chapter uses its own reading order, keeps ties stable, and puts missing orders last", () => {
  const make = (id, order) => ({
    id, tags: [membership, "collection:never-let-me-go:chapter-1"],
    readingContexts: [context(order === undefined ? {} : { order }), context({ membership: "collection:never-let-me-go:chapter-1", order: 9 })]
  });
  const entries = [make("old-shared", 4), make("legacy-one"), make("first", 1), make("second", 2), make("tied", 2), make("legacy-two")];
  const original = structuredClone(entries);
  assert.deepEqual(filterEntriesByCollection(entries, "never-let-me-go", "chapter-5").map(({ id }) => id),
    ["first", "second", "tied", "old-shared", "legacy-one", "legacy-two"]);
  assert.deepEqual(filterEntriesByCollection(entries, "all", "chapter-5"), entries);
  assert.deepEqual(filterEntriesByCollection(entries, "never-let-me-go", "all"), entries);
  assert.deepEqual(entries, original);
});

test("chapters with no explicit order retain the snapshot order", () => {
  const entries = ["zebra", "apple", "middle"].map((id) => ({ id, tags: [membership], readingContexts: [context()] }));
  assert.deepEqual(filterEntriesByCollection(entries, "never-let-me-go", "chapter-5"), entries);
});

test("imported order follows source rows for reused entries and stays local to the chapter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-order-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter-2.json");
  try {
    const [snapshot, source] = await Promise.all([
      readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8").then(JSON.parse),
      readFile(new URL("../data/reading-lists/never-let-me-go/chapter-2.json", import.meta.url), "utf8").then(JSON.parse)
    ]);
    await writeFile(snapshotPath, JSON.stringify(snapshot), "utf8");
    source.items.forEach((item, index) => { item.order = index + 1; });
    await writeFile(sourcePath, JSON.stringify(source), "utf8");
    const result = await importReadingList({ sourcePath, snapshotPath, checkOnly: true });
    const chapterTag = "collection:never-let-me-go:chapter-2";
    assert.deepEqual(filterEntriesByCollection(result.snapshot.entries, "never-let-me-go", "chapter-2").map(({ term }) => term), source.items.map(({ term }) => term));
    for (const entry of result.snapshot.entries) {
      const before = snapshot.entries.find(({ id }) => id === entry.id);
      assert.deepEqual(entry.readingContexts.filter(({ membership: tag }) => tag !== chapterTag), before.readingContexts.filter(({ membership: tag }) => tag !== chapterTag));
    }
    await writeFile(snapshotPath, JSON.stringify(result.snapshot), "utf8");
    assert.equal((await importReadingList({ sourcePath, snapshotPath, checkOnly: true })).changed, false);
    source.items[0].order = 0;
    await writeFile(sourcePath, JSON.stringify(source), "utf8");
    await assert.rejects(importReadingList({ sourcePath, snapshotPath, checkOnly: true }), /order 必须/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
