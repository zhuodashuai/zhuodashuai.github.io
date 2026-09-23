import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionCatalog,
  collectionContextForEntry,
  collectionMemberships,
  filterEntriesByCollection,
  preserveCollectionTags,
  splitChineseMeaningPoints,
  visibleEntryTags
} from "../js/collections.js";
import { contextualizeReadingEntry } from "../js/wordbook-schema.js";

const entries = [
  { id: "main", term: "hip", tags: [], sourceTitle: "", sourceWork: "" },
  {
    id: "chapter-one",
    term: "agitated",
    tags: ["collection:never-let-me-go:chapter-1", "文学阅读", "形容词"],
    sourceTitle: "Never Let Me Go — Chapter 1",
    sourceWork: "Never Let Me Go"
  },
  {
    id: "chapter-two",
    term: "example",
    tags: ["collection:never-let-me-go:chapter-2", "文学阅读"],
    sourceTitle: "Never Let Me Go — Chapter 2",
    sourceWork: "Never Let Me Go"
  }
];

test("collection membership tags create one independent book with ordered chapters", () => {
  const catalog = buildCollectionCatalog(entries);
  assert.deepEqual(catalog.map(({ id, title, count }) => ({ id, title, count })), [
    { id: "main", title: "卓的主词本", count: 1 },
    { id: "never-let-me-go", title: "Never Let Me Go", count: 2 }
  ]);
  assert.deepEqual(catalog[1].chapters.map(({ id, title, count }) => ({ id, title, count })), [
    { id: "chapter-1", title: "Chapter 1", count: 1 },
    { id: "chapter-2", title: "Chapter 2", count: 1 }
  ]);
});

test("book and chapter filters never leak entries from the main wordbook or another chapter", () => {
  assert.deepEqual(filterEntriesByCollection(entries, "main").map((entry) => entry.id), ["main"]);
  assert.deepEqual(filterEntriesByCollection(entries, "never-let-me-go").map((entry) => entry.id), ["chapter-one", "chapter-two"]);
  assert.deepEqual(filterEntriesByCollection(entries, "never-let-me-go", "chapter-1").map((entry) => entry.id), ["chapter-one"]);
});

test("reserved collection tags stay internal and survive AI tag replacement", () => {
  const chapterEntry = entries[1];
  assert.equal(collectionMemberships(chapterEntry)[0].chapterNumber, 1);
  assert.deepEqual(visibleEntryTags(chapterEntry), ["文学阅读", "形容词"]);
  assert.deepEqual(
    preserveCollectionTags(chapterEntry.tags, ["新标签"]),
    ["collection:never-let-me-go:chapter-1", "新标签"]
  );
  assert.deepEqual(collectionContextForEntry(chapterEntry), {
    tag: "collection:never-let-me-go:chapter-1",
    collectionId: "never-let-me-go",
    chapterId: "chapter-1",
    chapterNumber: 1,
    collectionTitle: "Never Let Me Go",
    chapterTitle: "Chapter 1",
    sourceTitle: "Never Let Me Go — Chapter 1",
    page: ""
  });
});

test("one canonical entry can expose different chapter contexts without duplicating its review identity", () => {
  const shared = {
    id: "shared-shrug",
    term: "shrug",
    originalInput: "shrug",
    entryType: "word",
    partOfSpeech: "verb",
    meaning: "耸肩。",
    definition: "To raise the shoulders.",
    senses: [],
    collocations: [],
    exampleEn: "She shrugged.",
    exampleZh: "她耸了耸肩。",
    usage: "第一章语境。",
    register: "neutral",
    confusedWith: [],
    forms: [],
    tags: ["collection:never-let-me-go:chapter-1", "collection:never-let-me-go:chapter-2"],
    sourceTitle: "Never Let Me Go — Chapter 1",
    sourceWork: "Never Let Me Go",
    sourceDate: "",
    attributionNote: "Chapter 1",
    readingContexts: [{
      membership: "collection:never-let-me-go:chapter-2",
      page: "p. 21",
      originalInput: "shrug",
      entryType: "word",
      partOfSpeech: "verb",
      meaning: "耸肩。",
      definition: "To raise the shoulders to show uncertainty or helplessness.",
      usage: "第二章语境：没有作出激烈回应。",
      register: "neutral",
      collocations: ["shrug quietly"],
      confusedWith: [],
      forms: ["shrugged"],
      exampleEn: "He shrugged quietly.",
      exampleZh: "他安静地耸了耸肩。",
      sourceTitle: "Never Let Me Go — Chapter 2",
      sourceWork: "Never Let Me Go",
      sourceDate: "p. 21",
      attributionNote: "Chapter 2"
    }]
  };
  const catalog = buildCollectionCatalog([shared]);
  assert.equal(catalog[1].count, 1);
  assert.deepEqual(catalog[1].chapters.map(({ id, count }) => ({ id, count })), [
    { id: "chapter-1", count: 1 },
    { id: "chapter-2", count: 1 }
  ]);
  const chapterTwo = contextualizeReadingEntry(shared, "never-let-me-go", "chapter-2");
  assert.equal(chapterTwo.id, shared.id);
  assert.equal(chapterTwo.sourceTitle, "Never Let Me Go — Chapter 2");
  assert.equal(chapterTwo.sourceDate, "p. 21");
  assert.match(chapterTwo.usage, /第二章语境/u);
  assert.deepEqual(chapterTwo.collocations, ["shrug quietly"]);
  assert.equal(collectionContextForEntry(chapterTwo, "never-let-me-go", "chapter-2").page, "p. 21");
});

test("chapter meanings split each semicolon sense into a separate learning point", () => {
  assert.deepEqual(splitChineseMeaningPoints("焦躁不安的；情绪不平静的。"), ["焦躁不安的", "情绪不平静的"]);
  assert.deepEqual(splitChineseMeaningPoints("耸肩。"), ["耸肩"]);
});
