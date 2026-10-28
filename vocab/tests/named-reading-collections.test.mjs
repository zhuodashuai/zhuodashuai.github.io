import assert from "node:assert/strict";
import test from "node:test";
import { createBlankEntry, contextualizeReadingEntry, validatePublicEntry } from "../js/wordbook-schema.js";
import { buildCollectionCatalog, collectionContextForEntry } from "../js/collections.js";
import { publicSelectionEntries } from "../js/personal-selection.js";
import { buildDueQueue } from "../js/study.js";
import { scheduleReview } from "../js/review.js";
import { createChapterQuiz } from "../js/chapter-quiz.js";

const articles = ["Collaborative Overload", "The Overcommitted Organization"];
const urls = ["https://hbr.org/2016/01/collaborative-overload", "https://hbr.org/2017/09/the-overcommitted-organization"];
const context = (term, chapter, meaning, order = 1) => ({
  membership: `collection:teamwork:chapter-${chapter}`, order, page: "p. 4", originalInput: term,
  entryType: "word", partOfSpeech: "noun", meaning, definition: "A workplace learning definition.",
  usage: "本文讨论团队协作；例句为自编。", register: "neutral", collocations: [], confusedWith: [], forms: [],
  exampleEn: "The team reviewed its work together.", exampleZh: "团队一起回顾了工作。",
  sourceTitle: `Teamwork — ${articles[chapter - 2]}`, sourceWork: "Teamwork", sourceDate: "p. 4",
  attributionNote: "原文作者与文章页码；学习例句为自编。"
});
function sharedCard() {
  return validatePublicEntry({ ...createBlankEntry("burnout"), id: "shared-burnout", partOfSpeech: "noun",
    meaning: "旧有通用释义", definition: "A canonical definition.", sourceTitle: articles[0], sourceWork: articles[0],
    sourceUrl: urls[0], author: "Rob Cross; Reb Rebele; Adam Grant",
    tags: ["collection:teamwork:chapter-3", "collection:teamwork:chapter-2"],
    sources: articles.map((title, index) => ({ title: `${title} - HBR; supplied PDF p.4`, url: urls[index], kind: "primary", retrievedAt: "2026-10-27T12:00:00Z" })),
    readingContexts: [context("burnout", 3, "长期压力造成的耗竭", 4), context("burnout", 2, "职业倦怠", 1)] });
}

test("a whole wordbook chooses its own unambiguous context while global and multi-chapter novel defaults remain unchanged", () => {
  const card = sharedCard();
  const before = structuredClone(card);
  const wholeBook = publicSelectionEntries([card], "teamwork", "all")[0];
  assert.equal(wholeBook.id, card.id);
  assert.equal(wholeBook.meaning, "职业倦怠");
  assert.equal(wholeBook.sourceTitle, "Teamwork — Collaborative Overload");
  assert.equal(collectionContextForEntry(wholeBook, "teamwork").chapterId, "chapter-2");
  assert.equal(contextualizeReadingEntry(card, "all", "all"), card);
  const novel = { ...card, tags: ["collection:novel:chapter-1"],
    readingContexts: [{ ...context("burnout", 2, "小说语境"), membership: "collection:novel:chapter-1", sourceWork: "Novel", sourceTitle: "Novel — Chapter 1" }] };
  assert.equal(contextualizeReadingEntry(novel, "novel", "all").meaning, "小说语境");
  const multiChapter = { ...novel, tags: [...novel.tags, "collection:novel:chapter-2"],
    readingContexts: [...novel.readingContexts, { ...novel.readingContexts[0], membership: "collection:novel:chapter-2", sourceTitle: "Novel — Chapter 2" }] };
  assert.equal(contextualizeReadingEntry(multiChapter, "novel", "all"), multiChapter);
  assert.deepEqual(card, before, "context projection never mutates the canonical card or its contexts");
});

test("an article projection uses its own primary evidence URL and never displays another article's author", () => {
  const card = sharedCard();
  const first = contextualizeReadingEntry(card, "teamwork", "chapter-2");
  assert.equal(first.author, card.author);
  assert.equal(first.sourceUrl, urls[0]);
  const second = contextualizeReadingEntry(card, "teamwork", "chapter-3");
  assert.equal(second.sourceUrl, urls[1]);
  assert.equal(second.author, "", "the correct article authors remain in the chapter attribution note");
  assert.equal(second.sourceTitle, "Teamwork — The Overcommitted Organization");
  const missing = { ...card, sources: [{ title: `${articles[1]} Handbook`, url: "https://example.com/handbook", kind: "primary" },
    { title: articles[1], url: "https://example.com/dictionary", kind: "dictionary" }] };
  assert.equal(contextualizeReadingEntry(missing, "teamwork", "chapter-3").sourceUrl, "");
  const ambiguous = { ...card, sources: [...card.sources, { title: articles[1], url: "https://example.com/other-edition", kind: "primary" }] };
  assert.equal(contextualizeReadingEntry(ambiguous, "teamwork", "chapter-3").sourceUrl, "");
});

test("a numbered novel chapter does not inherit another work's author or source link", () => {
  const canonical = sharedCard();
  const novelContext = { ...context("burnout", 2, "小说中的疲惫"),
    membership: "collection:novel:chapter-1", sourceWork: "Novel", sourceTitle: "Novel — Chapter 1" };
  const card = { ...canonical, tags: [...canonical.tags, novelContext.membership],
    readingContexts: [...canonical.readingContexts, novelContext] };
  const before = structuredClone(card);
  const view = contextualizeReadingEntry(card, "novel", "chapter-1");
  assert.equal(view.meaning, novelContext.meaning);
  assert.equal(view.author, "");
  assert.equal(view.sourceUrl, "");
  const sameWork = { ...card, sourceWork: "Novel", sourceTitle: "Novel — Chapter 2", author: "The novelist", sourceUrl: "https://example.com/novel" };
  const ownView = contextualizeReadingEntry(sameWork, "novel", "chapter-1");
  assert.equal(ownView.author, sameWork.author);
  assert.equal(ownView.sourceUrl, sameWork.sourceUrl);
  const withEvidence = { ...card, sources: [...card.sources, { title: "Novel — Chapter 1", kind: "primary", url: "https://example.com/novel", retrievedAt: "2026-10-28T12:00:00Z" }] };
  assert.equal(contextualizeReadingEntry(withEvidence, "novel", "chapter-1").sourceUrl, "https://example.com/novel");
  assert.deepEqual(card, before);
});

test("article study, review IDs, and chapter quiz use the selected source without leaking a different chapter", () => {
  const shared = sharedCard();
  const otherCards = [["turnover", "员工流失"], ["buffer", "缓冲机制"], ["criterion", "评判标准"]].map(([term, meaning], index) => (
    validatePublicEntry({ ...createBlankEntry(term), id: `article-${term}`, tags: ["collection:teamwork:chapter-3"],
      readingContexts: [context(term, 3, meaning, index + 1)] })
  ));
  const cards = [shared, ...otherCards];
  const selected = publicSelectionEntries(cards, "teamwork", "chapter-3");
  assert.deepEqual(selected.map(({ id }) => id), ["article-turnover", "article-buffer", "article-criterion", "shared-burnout"]);
  assert.equal(selected.at(-1).meaning, "长期压力造成的耗竭");
  const now = new Date("2026-10-27T12:00:00Z");
  const reviewed = scheduleReview({ entryId: shared.id }, "good", now);
  assert.equal(buildDueQueue(selected, [reviewed], now).some(({ entry }) => entry.id === shared.id), false);
  assert.equal(buildDueQueue(publicSelectionEntries(cards, "teamwork", "all"), [reviewed], now).some(({ entry }) => entry.id === shared.id), false);
  const book = buildCollectionCatalog(cards).find(({ id }) => id === "teamwork");
  const chapter = book.chapters.find(({ id }) => id === "chapter-3");
  const quiz = createChapterQuiz(selected, { bookId: book.id, bookTitle: book.title, chapterId: chapter.id,
    chapterTitle: chapter.title, id: "article-quiz", now, random: () => 0.4 });
  assert.equal(quiz.chapterTitle, "The Overcommitted Organization");
  assert.equal(quiz.questions.length, selected.length);
  assert.deepEqual(quiz.omitted, []);
  assert.equal(quiz.questions.find(({ entryId }) => entryId === shared.id).meaning, "长期压力造成的耗竭");
  for (const question of quiz.questions) {
    for (const option of question.options) assert.ok(selected.some(({ id }) => id === option.sourceEntryId));
  }
});
