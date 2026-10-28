import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { loadExpandedPublicSource } from "../../tooling/lib/expanded-public-source.mjs";
import { buildCollectionCatalog, filterEntriesByCollection } from "../js/collections.js";
import { contextualizeReadingEntry, normalizeEnglish, parsePublicSnapshot } from "../js/wordbook-schema.js";
import { parseBookPassages, sourcePassagesForEntry } from "../js/book-passages.js";
import { createChapterQuiz, validateQuizAttempt } from "../js/chapter-quiz.js";

const sourceUrl = new URL("../data/reading-lists/the-forsyte-saga/chapter-1.json", import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, "utf8"));
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8")));
const passages = parseBookPassages(JSON.parse(await readFile(new URL("../data/book-passages.json", import.meta.url), "utf8")));
const bookId = "the-forsyte-saga", chapterId = "chapter-1", membership = `collection:${bookId}:${chapterId}`;
const entries = filterEntriesByCollection(snapshot.entries, bookId, chapterId);
const expectedCount = source.expectedItemCount;
const byId = new Map(snapshot.entries.map(entry => [entry.id, entry]));
const priorityTerms = ["patriarchal", "sappy", "plume of"];
const originalSharedIds = ["public-nlmg-c4-unfathomable", "public-nlmg-c5-brood-over",
  "public-nlmg-c21-scrutiny", "public-nlmg-c23-indulgent"];

test("all reviewed Forsyte heads have complete chapter meanings, learning examples and a linked original passage", async () => {
  assert(Number.isSafeInteger(expectedCount) && expectedCount > 0);
  assert.equal(source.items.length, expectedCount);
  assert.equal(entries.length, expectedCount);
  assert.equal(new Set(entries.map(entry => entry.normalized)).size, expectedCount);
  assert.equal(new Set(entries.map(entry => entry.id)).size, expectedCount);
  assert.deepEqual(new Set(entries.map(entry => entry.id)), new Set(source.items.map(item => item.reuseExistingEntryId)));
  for (const item of source.items) {
    const entry = byId.get(item.reuseExistingEntryId);
    assert(entry, item.term);
    assert.equal(entry.normalized, normalizeEnglish(item.term), `${item.term}: reviewed canonical identity survives`);
    assert(entry.tags.includes(membership), item.term);
    assert(Number.isSafeInteger(item.pdfPage) && item.pdfPage >= 1 && item.pdfPage <= 17, item.term);
    assert.equal(item.page, String(item.pdfPage), item.term);
    const view = contextualizeReadingEntry(entry, bookId, chapterId);
    const wholeBookView = contextualizeReadingEntry(entry, bookId, "all");
    assert.equal(wholeBookView.meaning, item.meaning, `${item.term}: whole-book study must use this novel's meaning`);
    assert.equal(wholeBookView.sourceWork, source.collection.title);
    assert.equal(view.sourceTitle, "The Forsyte Saga — Chapter 1");
    assert.equal(view.sourceWork, "The Forsyte Saga");
    assert.equal(view.sourceDate, `p. ${item.pdfPage}`);
    assert.equal(entry.readingContexts.find(context => context.membership === membership).page, `p. ${item.pdfPage}`);
    for (const field of ["originalInput", "entryType", "partOfSpeech", "meaning", "usage", "exampleEn", "exampleZh", "forms", "collocations"]) {
      assert.deepEqual(view[field], item[field], `${item.term}.${field}`);
    }
    assert.equal(view.definition, item.definitionEn);
    assert.match(view.meaning, /^①/u);
    assert.match(view.usage, /第一章语境/u);
    assert(view.partOfSpeech && view.definition && view.exampleEn && view.exampleZh);
    const original = sourcePassagesForEntry(passages, view);
    assert(original.length >= 1, item.term);
    const primary = original.find(passage => passage.text === item.bookQuoteEn && passage.translation === item.bookQuoteZh);
    assert(primary, `${item.term}: reviewed source quotation and translation must be linked to this card`);
    assert.equal(primary.bookId, bookId);
    assert.equal(primary.chapterId, chapterId);
    assert.equal(primary.source.pdfPage, item.pdfPage);
    assert.notEqual(primary.text, item.exampleEn);
  }
  const result = await importReadingList({ sourcePath: fileURLToPath(sourceUrl), checkOnly: true });
  assert.equal(result.changed, false);
});

test("difficulty curation preserves 98 original identities and explicitly covers the learner's missing hard words", () => {
  const retained = source.curation.retainedOriginalIds;
  assert.equal(retained.length, 98);
  assert.equal(new Set(retained).size, retained.length);
  for (const id of retained) assert(entries.some(entry => entry.id === id), `${id}: retained original card is missing`);
  const excluded = source.curation.excludedItems;
  assert.equal(excluded.length, 10);
  assert.equal(new Set(excluded.map(item => item.id)).size, excluded.length);
  assert.equal(new Set([...retained, ...excluded.map(item => item.id)]).size, 108, "every original chapter identity has one curation decision");
  for (const id of originalSharedIds) assert(retained.includes(id), `${id}: the original shared card must remain in the reviewed cohort`);
  for (const item of excluded) {
    assert(item.reason, `${item.term}: curation decision must remain reviewable`);
    assert.equal(source.items.some(retained => normalizeEnglish(retained.term) === normalizeEnglish(item.term)), false, item.term);
    const canonical = byId.get(item.id);
    assert.equal(Boolean(canonical?.tags.includes(membership)), false, item.term);
    assert.equal(Boolean(canonical?.readingContexts.some(context => context.membership === membership)), false, item.term);
    if (item.disposition === "removed-from-public-wordbook") assert.equal(canonical, undefined, item.term);
    else {
      assert.equal(item.disposition, "removed-from-chapter-only", item.term);
      assert(canonical, `${item.term}: a card retained for another book must survive`);
    }
  }
  const items = new Map(source.items.map(item => [normalizeEnglish(item.term), item]));
  for (const term of priorityTerms) assert(items.has(term), `${term}: learner-prioritized vocabulary is missing`);
  assert.equal(items.has("at home"), false);
  assert.match(items.get("patriarchal").meaning, /父权|家长|族长/u);
  assert.match(items.get("sappy").meaning, /汁|液/u);
  assert.match(items.get("sappy").definitionEn, /\bsap\b/iu);
  assert.match(items.get("plume of").bookQuoteEn, /plume of/iu);
  assert.match(items.get("plume of").usage, /羽|簇|穗|蓬/u);
});

test("cross-book reuse preserves all old canonical words and 653 old reading contexts", async () => {
  const before = await loadExpandedPublicSource();
  assert.equal(before.entries.length, 617);
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
    if (old.readingContexts.length === 0) {
      const pairs = entry => [
        { en: entry.exampleEn, zh: entry.exampleZh },
        ...entry.senses.flatMap(sense => sense.examples)
      ].filter(pair => pair.en && pair.zh);
      const retained = pairs(after);
      for (const pair of pairs(old)) {
        assert(retained.some(next => next.en === pair.en && next.zh === pair.zh),
          `${old.term}: original learning example survives even without a book context`);
      }
    }
    if (after.tags.includes(membership)) shared += 1;
    oldContexts += old.readingContexts.length;
  }
  assert(shared >= originalSharedIds.length);
  for (const id of originalSharedIds) assert(byId.get(id)?.tags.includes(membership), `${id}: original cross-book reuse survives`);
  assert.equal(oldContexts, 653);
  assert(snapshot.entries.length >= before.entries.length, "later curation cannot delete the historical canonical identities");
  const catalog = buildCollectionCatalog(snapshot.entries);
  assert.equal(catalog.find(book => book.id === bookId).title, "The Forsyte Saga");
  assert.equal(catalog.find(book => book.id === "never-let-me-go").title, "Never Let Me Go");
});

test("every shared Forsyte card projects chapter meanings without rewriting its identity or other book contexts", () => {
  for (const entry of entries.filter(entry => entry.readingContexts.some(context => context.membership !== membership))) {
    const before = structuredClone(entry);
    const view = contextualizeReadingEntry(entry, bookId, chapterId);
    assert.equal(view.id, entry.id);
    assert.equal(view.createdAt, entry.createdAt);
    for (const context of entry.readingContexts.filter(context => context.membership !== membership)) {
      const [, otherBook, otherChapter] = context.membership.split(":");
      const other = contextualizeReadingEntry(entry, otherBook, otherChapter);
      assert.equal(other.id, entry.id);
      for (const field of ["meaning", "definition", "usage", "exampleEn", "exampleZh", "sourceTitle", "sourceDate"]) {
        assert.equal(other[field], context[field], `${entry.term}: ${context.membership}.${field}`);
      }
    }
    assert.deepEqual(entry, before, `${entry.term}: switching books cannot change the canonical card or stored contexts`);
  }
});

test("all 614 previous original passages and their book metadata remain unchanged", async () => {
  const raw = await readFile(new URL("../../tooling/dictionary/public-source/book-passages-fd742758.json", import.meta.url));
  assert.equal(createHash("sha256").update(raw).digest("hex"), "66cfc168b2786380a432492c4a8c693438e6f579b303119b970a995f396b09ba");
  const before = parseBookPassages(JSON.parse(raw));
  assert.equal(before.passages.length, 614);
  for (const old of before.passages) assert.deepEqual(passages.passages.find(item => item.id === old.id), old);
  for (const old of before.books) assert.deepEqual(passages.books.find(item => item.id === old.id), old);
});

test("the revised chapter uses the existing four-choice quiz with every current chapter word", () => {
  const views = entries.map(entry => contextualizeReadingEntry(entry, bookId, chapterId));
  const before = structuredClone(views);
  const quiz = createChapterQuiz(views, { id: "forsyte-quiz", bookId, chapterId, now: "2026-10-24T18:00:00Z" });
  assert.equal(quiz.questions.length, expectedCount);
  assert.deepEqual(quiz.omitted, []);
  validateQuizAttempt(quiz);
  const ids = new Set(entries.map(entry => entry.id));
  assert.deepEqual(new Set(quiz.questions.map(question => question.entryId)), ids);
  for (const question of quiz.questions) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options.map(option => option.meaning)).size, 4);
    assert.equal(question.options.find(option => option.id === question.correctOptionId).sourceEntryId, question.entryId);
    for (const option of question.options) assert(ids.has(option.sourceEntryId), `${question.term}: distractors must stay in this chapter`);
  }
  assert.deepEqual(views, before, "quiz generation must not rewrite chapter cards");
});
