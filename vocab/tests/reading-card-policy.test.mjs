import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionCatalog, filterEntriesByCollection, MAIN_READING_HOME_TAG } from "../js/collections.js";
import { buildLearningCatalog, filterLearningEntries, firstReadingMembership, recordedReadingSources } from "../js/reading-card-policy.js";

function context(book, chapter, title, order = 1) {
  return {
    membership: `collection:${book}:chapter-${chapter}`, order, page: `PDF p. ${chapter}`,
    sourceTitle: `${book === "teamwork" ? "Teamwork" : "Never Let Me Go"} — ${title}`,
    sourceWork: book === "teamwork" ? "Teamwork" : "Never Let Me Go", sourceDate: `PDF p. ${chapter}`,
    originalInput: "shared word", entryType: "word", partOfSpeech: "noun", meaning: "该篇语境。",
    definition: "A source-specific meaning.", usage: "原语境。", register: "neutral", collocations: [],
    confusedWith: [], forms: [], exampleEn: "The source keeps its own example.", exampleZh: "该来源保留自己的例句。", attributionNote: "原来源。"
  };
}
function card(id, contexts) {
  return {
    id, term: id, tags: contexts.map(row => row.membership), readingContexts: contexts,
    sourceTitle: contexts[0]?.sourceTitle || "", sourceWork: contexts[0]?.sourceWork || "", sourceUrl: "https://example.org/original",
    sources: contexts.map(row => ({ title: `${row.sourceTitle.split(" — ")[1]} - supplied PDF p.${row.order}`, url: `https://example.org/${row.membership.split(":")[1]}/${row.membership.split(":")[2]}`, kind: "primary" })),
    revision: 3, updatedAt: "2026-11-03T12:00:00.000Z"
  };
}
function fixture() {
  return [
    card("main", []),
    card("earlier-book", [context("never-let-me-go", 22, "Chapter 22"), context("teamwork", 6, "Article Six", 3)]),
    card("article-five", [context("teamwork", 5, "Article Five"), context("teamwork", 6, "Article Six", 2)]),
    card("article-six", [context("teamwork", 6, "Article Six")])
  ];
}

test("first recorded source wins across books and is not chosen by the lowest chapter number", () => {
  const entry = fixture()[1];
  entry.tags.reverse();
  assert.equal(firstReadingMembership(entry).tag, "collection:never-let-me-go:chapter-22");
  const laterImport = card("later-import", [context("teamwork", 7, "Article Seven"), context("teamwork", 1, "Article One")]);
  assert.equal(firstReadingMembership(laterImport).chapterId, "chapter-7");
  assert.equal(firstReadingMembership({ tags: ["not a membership", "collection:teamwork:chapter-2"], readingContexts: [] }).chapterId, "chapter-2");
  assert.equal(firstReadingMembership(fixture()[0]), null);
});

test("later chapter cards and their learning queues contain only first-recorded entries by default", () => {
  const entries = fixture();
  assert.deepEqual(filterLearningEntries(entries, "teamwork", "chapter-6").map(entry => entry.id), ["article-six"]);
  assert.deepEqual(filterLearningEntries(entries, "teamwork").map(entry => entry.id), ["article-five", "article-six"]);
  assert.deepEqual(filterLearningEntries(entries, "never-let-me-go", "chapter-22").map(entry => entry.id), ["earlier-book"]);
  assert.deepEqual(filterLearningEntries(entries, "main").map(entry => entry.id), ["main"]);
  assert.deepEqual(filterLearningEntries(entries).map(entry => entry.id), entries.map(entry => entry.id));
  assert.equal(filterLearningEntries(entries, "teamwork", "chapter-6")[0], entries[3], "The same canonical object and review identity are retained");
});

test("showing repeated words restores all raw chapter memberships without creating or changing cards", () => {
  const entries = fixture(), before = structuredClone(entries);
  const visible = filterLearningEntries(entries, "teamwork", "chapter-6", { showRepeated: true });
  assert.deepEqual(visible, filterEntriesByCollection(entries, "teamwork", "chapter-6"));
  assert.deepEqual(visible.map(entry => entry.id), ["article-six", "article-five", "earlier-book"]);
  assert.deepEqual(entries, before);
});

test("catalogue counts agree with visible chapter scopes and retain hidden source totals", () => {
  const entries = fixture(), book = buildLearningCatalog(entries).find(row => row.id === "teamwork");
  assert.equal(book.count, 2); assert.equal(book.recordedCount, 3); assert.equal(book.repeatsHidden, 1);
  assert.deepEqual(book.chapters.map(({ id, count, recordedCount, repeatsHidden }) => ({ id, count, recordedCount, repeatsHidden })), [
    { id: "chapter-5", count: 1, recordedCount: 1, repeatsHidden: 0 },
    { id: "chapter-6", count: 1, recordedCount: 3, repeatsHidden: 2 }
  ]);
  assert.equal(book.chapters.reduce((sum, chapter) => sum + chapter.count, 0), book.count);
  const restored = buildLearningCatalog(entries, { showRepeated: true });
  for (const raw of buildCollectionCatalog(entries)) {
    const selected = restored.find(row => row.id === raw.id);
    assert.equal(selected.count, raw.count);
    assert.deepEqual(selected.chapters.map(row => row.count), raw.chapters.map(row => row.count));
    assert.equal(selected.repeatsHidden, 0);
  }
});

test("source records retain all distinct articles and their own page and URL even when cards are hidden", () => {
  const entry = fixture()[2], before = structuredClone(entry);
  const sources = recordedReadingSources(entry);
  assert.deepEqual(sources.map(row => row.membership), entry.readingContexts.map(row => row.membership));
  assert.deepEqual(sources.map(row => row.chapterTitle), ["Article Five", "Article Six"]);
  assert.deepEqual(sources.map(row => row.page), ["PDF p. 5", "PDF p. 6"]);
  assert.deepEqual(sources.map(row => row.isPrimaryCardHome), [true, false]);
  assert.deepEqual(sources.map(row => row.sourceUrl), ["https://example.org/teamwork/chapter-5", "https://example.org/teamwork/chapter-6"]);
  assert.deepEqual(entry, before);
  const repeatedTransport = structuredClone(entry);
  repeatedTransport.tags.push(repeatedTransport.tags[0]);
  repeatedTransport.readingContexts.push(repeatedTransport.readingContexts[0]);
  assert.equal(recordedReadingSources(repeatedTransport).length, 2);
});

test("zero-card chapters stay accessible so readers can restore their repeated source view", () => {
  const entries = [fixture()[2]];
  const book = buildLearningCatalog(entries).find(row => row.id === "teamwork");
  assert.deepEqual(book.chapters.map(row => [row.id, row.count, row.recordedCount]), [["chapter-5", 1, 1], ["chapter-6", 0, 1]]);
  assert.equal(buildLearningCatalog(entries, { showRepeated: true }).find(row => row.id === "teamwork").chapters[1].count, 1);
});

test("an existing main card stays home when later articles add source records", () => {
  const entry = card("already-in-main", []), originalId = entry.id;
  const later = context("teamwork", 6, "Article Six");
  entry.tags.push(MAIN_READING_HOME_TAG, later.membership);
  entry.readingContexts.push(later);
  const entries = [entry, fixture()[3]], before = structuredClone(entries);
  assert.equal(firstReadingMembership(entry), null);
  for (const showRepeated of [false, true]) {
    const main = filterLearningEntries(entries, "main", "all", { showRepeated });
    assert.equal(main.length, 1); assert.equal(main[0], entry); assert.equal(main[0].id, originalId);
    const catalog = buildLearningCatalog(entries, { showRepeated }).find(book => book.id === "main");
    assert.equal(catalog.count, 1); assert.equal(catalog.recordedCount, 1); assert.equal(catalog.repeatsHidden, 0);
  }
  assert.deepEqual(filterLearningEntries(entries, "teamwork", "chapter-6").map(card => card.id), ["article-six"]);
  assert.deepEqual(new Set(filterLearningEntries(entries, "teamwork", "chapter-6", { showRepeated: true }).map(card => card.id)), new Set([originalId, "article-six"]));
  assert.deepEqual(recordedReadingSources(entry).map(source => source.isPrimaryCardHome), [false]);
  assert.equal(buildLearningCatalog(entries).reduce((count, book) => count + book.count, 0), entries.length);
  assert.deepEqual(entries, before, "The home marker is read without changing any card, source or review identity");
});
