import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { loadExpandedPublicSource } from "../../tooling/lib/expanded-public-source.mjs";
import { buildCollectionCatalog, filterEntriesByCollection } from "../js/collections.js";
import { contextualizeReadingEntry, parsePublicSnapshot } from "../js/wordbook-schema.js";
import { parseBookPassages, sourcePassagesForEntry } from "../js/book-passages.js";
import { createChapterQuiz, validateQuizAttempt } from "../js/chapter-quiz.js";

const sourceUrl = new URL("../data/reading-lists/the-forsyte-saga/chapter-1.json", import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, "utf8"));
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8")));
const passages = parseBookPassages(JSON.parse(await readFile(new URL("../data/book-passages.json", import.meta.url), "utf8")));
const bookId = "the-forsyte-saga", chapterId = "chapter-1", membership = `collection:${bookId}:${chapterId}`;
const entries = filterEntriesByCollection(snapshot.entries, bookId, chapterId);

test("all 108 reviewed Forsyte heads have complete chapter meanings, learning examples and their own original passage", async () => {
  assert.equal(source.expectedItemCount, 108);
  assert.equal(source.items.length, 108);
  assert.equal(entries.length, 108);
  assert.equal(new Set(entries.map(entry => entry.normalized)).size, 108);
  assert.equal(new Set(entries.map(entry => entry.id)).size, 108);
  for (const item of source.items) {
    const entry = entries.find(entry => entry.term === item.term);
    assert(entry, item.term);
    const view = contextualizeReadingEntry(entry, bookId, chapterId);
    assert.equal(view.sourceTitle, "The Forsyte Saga — Chapter 1");
    assert.equal(view.sourceDate, "");
    assert.equal(view.meaning, item.meaning);
    assert.match(view.meaning, /^①/u);
    assert.match(view.usage, /第一章语境/u);
    assert(view.partOfSpeech && view.definition && view.exampleEn && view.exampleZh);
    const original = sourcePassagesForEntry(passages, view);
    assert.equal(original.length, 1, item.term);
    assert(original[0].text && original[0].translation);
    assert.equal(original[0].bookId, bookId);
    assert.notEqual(original[0].text, item.exampleEn);
  }
  const result = await importReadingList({ sourcePath: fileURLToPath(sourceUrl), checkOnly: true });
  assert.equal(result.changed, false);
});

test("cross-book reuse preserves all old canonical words and 653 old reading contexts", async () => {
  const before = await loadExpandedPublicSource();
  let shared = 0, oldContexts = 0;
  for (const old of before.entries) {
    const after = snapshot.entries.find(entry => entry.id === old.id);
    assert(after, old.term);
    // This archive freezes the earlier book contexts, not every future version
    // of a shared canonical card. Later articles or owner edits may legitimately
    // add senses, examples and provenance to that same card.
    for (const key of ["id", "term", "normalized", "createdAt"]) {
      assert.deepEqual(after[key], old[key], `${old.term}.${key}: original identity survives`);
    }
    assert.deepEqual(after.tags.filter(tag => old.tags.includes(tag)), old.tags, `${old.term}: old memberships survive`);
    for (const context of old.readingContexts) {
      assert.deepEqual(after.readingContexts.find(item => item.membership === context.membership), context,
        `${old.term}: original ${context.membership} context survives`);
    }
    if (after.tags.includes(membership)) shared += 1;
    oldContexts += old.readingContexts.length;
  }
  assert.equal(shared, 4);
  assert.equal(oldContexts, 653);
  const oldIds = new Set(before.entries.map(entry => entry.id));
  assert.equal(entries.filter(entry => !oldIds.has(entry.id)).length, 104);
  assert(snapshot.entries.length >= before.entries.length + 104, "later additions are permitted without losing the imported cards");
  const catalog = buildCollectionCatalog(snapshot.entries);
  assert.equal(catalog.find(book => book.id === bookId).title, "The Forsyte Saga");
  assert.equal(catalog.find(book => book.id === "never-let-me-go").title, "Never Let Me Go");
});

test("all 614 previous original passages and their book metadata remain unchanged", async () => {
  const raw = await readFile(new URL("../../tooling/dictionary/public-source/book-passages-fd742758.json", import.meta.url));
  assert.equal(createHash("sha256").update(raw).digest("hex"), "66cfc168b2786380a432492c4a8c693438e6f579b303119b970a995f396b09ba");
  const before = parseBookPassages(JSON.parse(raw));
  assert.equal(before.passages.length, 614);
  for (const old of before.passages) assert.deepEqual(passages.passages.find(item => item.id === old.id), old);
  for (const old of before.books) assert.deepEqual(passages.books.find(item => item.id === old.id), old);
});

test("the new chapter uses the existing four-choice quiz with all chapter words", () => {
  const views = entries.map(entry => contextualizeReadingEntry(entry, bookId, chapterId));
  const quiz = createChapterQuiz(views, { id: "forsyte-quiz", bookId, chapterId, now: "2026-10-24T18:00:00Z" });
  assert.equal(quiz.questions.length, 108);
  assert.deepEqual(quiz.omitted, []);
  validateQuizAttempt(quiz);
  assert.equal(new Set(quiz.questions.map(question => question.entryId)).size, 108);
  for (const question of quiz.questions) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map(option => option.meaning)).size, 4);
  }
});
