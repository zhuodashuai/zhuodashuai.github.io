import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { contextualizeReadingEntry, normalizeEnglish, parsePublicSnapshot } from "../js/wordbook-schema.js";
import { buildCollectionCatalog, collectionMemberships, filterEntriesByCollection } from "../js/collections.js";
import { publicSelectionEntries } from "../js/personal-selection.js";
import { createChapterQuiz, validateQuizAttempt } from "../js/chapter-quiz.js";
import { buildDueQueue } from "../js/study.js";
import { scheduleReview } from "../js/review.js";

// Source packets reflect the learner-requested difficulty curation.
const articleTitles = ["The Truth About Hierarchy", "Collaborative Overload", "The Overcommitted Organization"];
const articleUrls = ["https://shop.sloanreview.mit.edu/store/the-truth-about-hierarchy",
  "https://hbr.org/2016/01/collaborative-overload", "https://hbr.org/2017/09/the-overcommitted-organization"];
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8")));
const byId = new Map(snapshot.entries.map(entry => [entry.id, entry]));
const sources = await Promise.all(articleTitles.map((_, index) => readFile(
  new URL(`../data/reading-lists/teamwork/chapter-${index + 1}.json`, import.meta.url), "utf8").then(JSON.parse)));
const knownSourceIds = new Set(sources.flatMap(source => source.items.map(item => item.reuseExistingEntryId)));
const catalog = buildCollectionCatalog(snapshot.entries).find(book => book.id === "teamwork");
const selection = chapter => publicSelectionEntries(snapshot.entries, "teamwork", chapter);
const pageLabel = item => `PDF p. ${item.pdfPage}${item.printedPage !== null && item.printedPage !== undefined && item.printedPage !== "" ? ` · print p. ${item.printedPage}` : ""}`;

for (const [index, source] of sources.entries()) {
  const chapterId = `chapter-${index + 1}`;
  const membership = `collection:teamwork:${chapterId}`;
  test(`Teamwork ${chapterId} preserves its reviewed cohort, canonical IDs, order and complete article context`, () => {
    assert.equal(source.collection.id, "teamwork");
    assert.equal(source.chapter.id, chapterId);
    assert.equal(source.chapter.title, articleTitles[index]);
    assert.equal(catalog.title, "Teamwork");
    assert.equal(catalog.chapters.find(chapter => chapter.id === chapterId).title, articleTitles[index]);
    const sourceByTerm = new Map(source.items.map(item => [normalizeEnglish(item.term), item]));
    assert.equal(sourceByTerm.size, source.items.length, "reviewed source terms remain unique");
    assert.equal(source.expectedItemCount, source.items.length);
    assert.equal(source.items.length + source.curation.excludedItems.length, source.curation.originalItemCount);
    for (const excluded of source.curation.excludedItems) {
      assert.ok(excluded.reason, `${excluded.term}: exclusion must remain reviewable`);
      const canonical = snapshot.entries.find(entry => entry.normalized === normalizeEnglish(excluded.term));
      if (canonical) assert.equal(canonical.tags.includes(membership), false, `${excluded.term}: retained card remains outside this chapter`);
    }
    const views = selection(chapterId);
    const viewById = new Map(views.map(entry => [entry.id, entry]));
    assert.equal(viewById.size, views.length);
    const sourceIds = new Set(source.items.map(item => item.reuseExistingEntryId));
    assert.deepEqual(views.filter(entry => sourceIds.has(entry.id)).map(entry => entry.id),
      [...source.items].sort((a, b) => a.order - b.order).map(item => item.reuseExistingEntryId));
    for (const item of source.items) {
      const canonical = byId.get(item.reuseExistingEntryId);
      assert.ok(canonical, `${item.term}: original canonical ID must still exist`);
      assert.equal(normalizeEnglish(canonical.term), normalizeEnglish(item.term));
      assert.ok(canonical.tags.includes(membership));
      const context = canonical.readingContexts.find(context => context.membership === membership);
      const view = viewById.get(canonical.id);
      assert.ok(context && view, `${item.term}: stored and served article contexts must exist`);
      assert.equal(context.order, item.order);
      assert.equal(context.page, pageLabel(item));
      for (const version of [context, view]) {
        for (const field of ["originalInput", "entryType", "partOfSpeech", "meaning", "usage", "exampleEn", "exampleZh", "forms", "collocations"]) {
          assert.deepEqual(version[field], item[field], `${item.term}: ${field}`);
        }
        assert.equal(version.definition, item.definitionEn);
        assert.equal(version.sourceTitle, `Teamwork — ${articleTitles[index]}`);
        assert.equal(version.sourceWork, "Teamwork");
        assert.equal(version.sourceDate, `PDF p. ${item.pdfPage}`);
        assert.ok(version.attributionNote.includes(source.authors), `${item.term}: correct article authors remain attributed`);
        assert.match(version.attributionNote, /例句为自拟/u);
      }
      assert.equal(view.id, item.reuseExistingEntryId);
      assert.equal(view.sourceUrl, articleUrls[index], `${item.term}: selected article must not link to a canonical card's other source`);
      assert.equal(view.senses[0].meaningZh, item.meaning);
      assert.equal(view.senses[0].definitionEn, item.definitionEn);
      assert.equal(view.senses[0].usageNotes, item.usage);
      assert.deepEqual(view.senses[0].examples, [{ en: item.exampleEn, zh: item.exampleZh }]);
    }
  });
}

const sharedItems = sources[1].items.filter(item => sources[2].items.some(other => other.reuseExistingEntryId === item.reuseExistingEntryId));
test("shared curated cards keep one canonical identity while their articles expose independent contexts and links", () => {
  for (const secondItem of sharedItems) {
  const thirdItem = sources[2].items.find(item => item.reuseExistingEntryId === secondItem.reuseExistingEntryId);
  const canonical = byId.get(secondItem.reuseExistingEntryId);
  const before = structuredClone(canonical);
  const second = contextualizeReadingEntry(canonical, "teamwork", "chapter-2");
  const third = contextualizeReadingEntry(canonical, "teamwork", "chapter-3");
  assert.equal(second.id, third.id);
  assert.equal(second.usage, secondItem.usage);
  assert.equal(third.usage, thirdItem.usage);
  assert.notEqual(second.usage, third.usage);
  assert.equal(second.sourceUrl, articleUrls[1]);
  assert.equal(third.sourceUrl, articleUrls[2]);
  assert.notEqual(second.sourceUrl, third.sourceUrl);
  assert.deepEqual(canonical, before, "switching articles must not rewrite shared cards or stored chapter contexts");
  }
});

test("curation removes plain basic vocabulary while retaining advanced and non-obvious workplace language", () => {
  const expected = [
    { removed: ["status", "allocate", "leadership role", "speak up"], kept: ["espouse", "haphazard", "latitude", "defer to"] },
    { removed: ["exhaust", "finite", "agenda", "rotate"], kept: ["lopsided", "blue-chip", "hiatus", "kudos"] },
    { removed: ["on track", "mandatory", "thrive", "hands-on"], kept: ["bandwidth", "bristle at", "cantankerous", "free rein"] }
  ];
  sources.forEach((source, index) => {
    const terms = new Set(source.items.map(item => item.term));
    for (const term of expected[index].removed) assert.equal(terms.has(term), false, term);
    for (const term of expected[index].kept) assert.equal(terms.has(term), true, term);
  });
});

test("basic article exclusions do not fall back into the main wordbook", () => {
  const excludedTerms = new Set(sources.flatMap(source => source.curation.excludedItems.map(item => normalizeEnglish(item.term))));
  const main = filterEntriesByCollection(snapshot.entries, "main");
  for (const entry of main) assert.equal(excludedTerms.has(entry.normalized), false, `${entry.term}: removed article basic leaked into main`);
  for (const entry of snapshot.entries.filter(entry => excludedTerms.has(entry.normalized))) {
    assert.ok(collectionMemberships(entry).length, `${entry.term}: retained basic must belong to another reading collection`);
  }
  const teamworkIds = new Set(selection("all").map(entry => entry.id));
  for (const entry of main) assert.equal(teamworkIds.has(entry.id), false, `${entry.term}: main and Teamwork must not duplicate a card`);
});

test("the whole Teamwork wordbook deduplicates cards and shares review progress across its article chapters", () => {
  const wholeBook = selection("all");
  const wholeIds = new Set(wholeBook.map(entry => entry.id));
  assert.equal(wholeIds.size, wholeBook.length);
  for (const id of knownSourceIds) assert.ok(wholeIds.has(id), `${id}: reviewed card missing from whole book`);
  for (const canonical of filterEntriesByCollection(snapshot.entries, "teamwork")) {
    if (!knownSourceIds.has(canonical.id)) continue;
    const firstContext = canonical.readingContexts.filter(context => context.membership.startsWith("collection:teamwork:"))
      .sort((a, b) => Number(a.membership.split(":").at(-1).slice(8)) - Number(b.membership.split(":").at(-1).slice(8)))[0];
    const view = wholeBook.find(entry => entry.id === canonical.id);
    assert.equal(view.sourceTitle, firstContext.sourceTitle);
    assert.equal(view.meaning, firstContext.meaning);
  }
  const reviewedId = sharedItems[0]?.reuseExistingEntryId || [...knownSourceIds][0];
  const now = new Date("2026-10-27T12:00:00Z");
  const review = scheduleReview({ entryId: reviewedId }, "good", now);
  const savedReview = structuredClone(review);
  for (const scope of [wholeBook, ...sources.map(source => selection(source.chapter.id))].filter(cards => cards.some(entry => entry.id === reviewedId))) {
    assert.equal(scope.filter(entry => entry.id === reviewedId).length, 1);
    assert.equal(buildDueQueue(scope, [review], now).some(({ entry }) => entry.id === reviewedId), false);
  }
  assert.deepEqual(review, savedReview);
});

for (const [index, source] of sources.entries()) {
  const chapterId = `chapter-${index + 1}`;
  test(`Teamwork ${chapterId} quizzes every current chapter card using only that chapter's meanings and IDs`, () => {
    const cards = selection(chapterId);
    const ids = new Set(cards.map(entry => entry.id));
    const before = JSON.stringify(cards);
    let seed = index + 1;
    const quiz = createChapterQuiz(cards, { id: `teamwork-published-${chapterId}`, bookId: "teamwork", chapterId,
      bookTitle: catalog.title, chapterTitle: catalog.chapters.find(chapter => chapter.id === chapterId).title,
      now: "2026-10-27T12:00:00Z", random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
    validateQuizAttempt(quiz);
    assert.equal(quiz.chapterTitle, articleTitles[index]);
    assert.equal(quiz.questions.length, cards.length);
    assert.deepEqual(quiz.omitted, []);
    assert.deepEqual(new Set(quiz.questions.map(question => question.entryId)), ids);
    for (const question of quiz.questions) {
      assert.ok(ids.has(question.entryId));
      assert.equal(question.options.length, 4);
      assert.equal(question.options.find(option => option.id === question.correctOptionId).sourceEntryId, question.entryId);
      for (const option of question.options) assert.ok(ids.has(option.sourceEntryId));
    }
    assert.equal(JSON.stringify(cards), before, "quiz creation cannot rewrite chapter cards or their IDs");
  });
}
