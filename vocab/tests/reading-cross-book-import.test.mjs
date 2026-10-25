import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { buildCollectionCatalog, collectionContextForEntry, filterEntriesByCollection } from "../js/collections.js";
import { contextualizeReadingEntry } from "../js/wordbook-schema.js";

const baselineUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const templateUrl = new URL("../data/reading-lists/never-let-me-go/chapter-1.json", import.meta.url);

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-cross-book-"));
  const snapshotPath = join(directory, "snapshot.json");
  const sourcePath = join(directory, "source.json");
  const before = JSON.parse(await readFile(baselineUrl, "utf8"));
  const word = before.entries.find(entry => entry.term === "agitated");
  const template = JSON.parse(await readFile(templateUrl, "utf8"));
  const source = {
    schemaVersion: 1,
    collection: { id: "second-reading-book", title: "Second Reading Book" },
    chapter: { id: "chapter-1", title: "Chapter 1", number: 1 },
    sourceTitle: "Second Reading Book — Chapter 1",
    expectedItemCount: 1,
    items: [{ ...template.items[0], reuseExistingEntryId: word.id,
      meaning: "① 不安的。\n② 本章指对消息的反应。",
      usage: "第一章语境：新书中人物对消息的反应。",
      exampleEn: "The news left the speaker agitated.", exampleZh: "消息让说话者不安。" }]
  };
  await writeFile(snapshotPath, JSON.stringify(before));
  await writeFile(sourcePath, JSON.stringify(source));
  try { await run({ before, word, source, sourcePath, snapshotPath }); }
  finally {
    const insideTemp = relative(tmpdir(), directory);
    assert(insideTemp && !insideTemp.startsWith(".."));
    await rm(directory, { recursive: true });
  }
}

test("an explicit second-book context shares the word ID while retaining the old card and examples", async () => {
  await fixture(async ({ before, word, sourcePath, snapshotPath }) => {
    const result = await importReadingList({ sourcePath, snapshotPath });
    assert.equal(result.changed, true);
    assert.equal(result.snapshot.entries.length, before.entries.length);
    assert.equal(result.chapterEntries[0].id, word.id);
    const after = result.snapshot.entries.find(entry => entry.id === word.id);
    for (const key of Object.keys(word).filter(key => !["tags", "readingContexts", "revision", "updatedAt", "synonymScan"].includes(key))) {
      assert.deepEqual(after[key], word[key], key);
    }
    assert.deepEqual(result.snapshot.entries.filter(entry => entry.id !== word.id), before.entries.filter(entry => entry.id !== word.id));
    const view = contextualizeReadingEntry(after, "second-reading-book", "chapter-1");
    assert.equal(view.sourceWork, "Second Reading Book");
    assert.equal(view.exampleEn, "The news left the speaker agitated.");
    assert.equal(collectionContextForEntry(after, "second-reading-book", "chapter-1").collectionTitle, "Second Reading Book");
    const catalog = buildCollectionCatalog(result.snapshot.entries);
    assert.equal(catalog.find(book => book.id === "second-reading-book").title, "Second Reading Book");
    assert.equal(catalog.find(book => book.id === "never-let-me-go").title, "Never Let Me Go");
    assert.equal(filterEntriesByCollection(result.snapshot.entries, "second-reading-book", "chapter-1").length, 1);
    const saved = await readFile(snapshotPath, "utf8");
    const repeated = await importReadingList({ sourcePath, snapshotPath });
    assert.equal(repeated.changed, false);
    assert.equal(await readFile(snapshotPath, "utf8"), saved);
  });
});

test("missing, mismatched and implicit cross-book reuse fail before writing", async () => {
  await fixture(async ({ source, sourcePath, snapshotPath }) => {
    const saved = await readFile(snapshotPath, "utf8");
    for (const id of ["public-not-an-existing-entry", "public-jab-at", null]) {
      const changed = structuredClone(source);
      if (id === null) delete changed.items[0].reuseExistingEntryId;
      else changed.items[0].reuseExistingEntryId = id;
      await writeFile(sourcePath, JSON.stringify(changed));
      await assert.rejects(importReadingList({ sourcePath, snapshotPath }), /复用|已存在/u);
      assert.equal(await readFile(snapshotPath, "utf8"), saved);
    }
  });
});
