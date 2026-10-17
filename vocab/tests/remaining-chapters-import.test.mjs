import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { buildCollectionCatalog, filterEntriesByCollection } from "../js/collections.js";
import { createChapterQuiz, validateQuizAttempt } from "../js/chapter-quiz.js";
import { applyReviewRating, buildDueQueue } from "../js/study.js";
import { entrySynonymFingerprint } from "../js/synonym-evidence.js";
import {
  contextualizeReadingEntry, normalizeEnglish, parsePublicSnapshot,
  publicEntryMatchesQuery, reconcileLexicalEntryForPublish
} from "../js/wordbook-schema.js";

const book = "never-let-me-go";
const chapters = Array.from({ length: 11 }, (_, index) => index + 13);
const snapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const sourceUrl = chapter => new URL(`../data/reading-lists/${book}/chapter-${chapter}.json`, import.meta.url);
const membership = chapter => `collection:${book}:chapter-${chapter}`;
const newMembership = /^collection:never-let-me-go:chapter-(?:1[3-9]|2[0-3])$/u;
const newIdentity = /^public-nlmg-c(?:1[3-9]|2[0-3])-/u;
const oldChapterCounts = [29, 38, 28, 51, 24, 24, 30, 25, 24, 26, 28, 25];
// Independently checked against the merged photo document, not inferred from
// a vocabulary item's own claim about its page.
const reviewedPageBounds = new Map([
  [13, [144, 153]], [14, [154, 165]], [15, [166, 181]], [16, [182, 193]],
  [17, [194, 199]], [18, [203, 213]], [19, [214, 232]], [20, [233, 240]],
  [21, [241, 250]], [22, [251, 270]], [23, [271, 282]]
]);
const chapterChinese = new Map([
  [13, "十三"], [14, "十四"], [15, "十五"], [16, "十六"], [17, "十七"],
  [18, "十八"], [19, "十九"], [20, "二十"], [21, "二十一"], [22, "二十二"], [23, "二十三"]
]);
// Frozen before this import at f343952e8ab945330c081fb3d019de80b2d21199.
// This small digest verifies the 344 original identities, creation times,
// canonical lexical fields, saved synonyms, and every old chapter context,
// without committing a second full copy of the private owner's snapshot.
// Only import metadata, added chapter contexts, and strictly additive tags
// approved by the new source items on these 19 reused cards are excluded.
const baselineCount = 344;
const baselineDigest = "5ab7a9c14ad9a52d892479319cf8b6c1b879a8d90a0ed6d1aec5e00b0f4f2c0d";
// Exact original tag order from the pre-import snapshot. All other cards keep
// their complete tag arrays in the digest, with no tag normalization at all.
const originalReusedCardTags = new Map([
  ["public-nlmg-c10-go-out-of-one-s-way-to-do-something", ["collection:never-let-me-go:chapter-10", "文学阅读", "补充阅读", "习语", "口语表达"]],
  ["public-nlmg-c2-come-home-to-somebody", ["collection:never-let-me-go:chapter-2", "文学阅读", "习语"]],
  ["public-nlmg-c3-rummage", ["collection:never-let-me-go:chapter-3", "文学阅读", "动词", "动作", "collection:never-let-me-go:chapter-6", "精选补充", "单词", "collection:never-let-me-go:chapter-11", "补充阅读", "动作描写"]],
  ["public-nlmg-c5-on-the-verge-of", ["collection:never-let-me-go:chapter-5", "文学阅读", "补充阅读", "习语"]],
  ["public-nlmg-c3-loiter", ["collection:never-let-me-go:chapter-3", "文学阅读", "动词", "动作"]],
  ["public-nlmg-c3-let-slip", ["collection:never-let-me-go:chapter-3", "文学阅读", "补充阅读", "实用表达", "说漏嘴"]],
  ["public-nlmg-c6-dawn-on-somebody", ["collection:never-let-me-go:chapter-6", "文学阅读", "精选补充", "短语"]],
  ["public-nlmg-c9-laughing-stock", ["collection:never-let-me-go:chapter-9", "文学阅读", "补充阅读", "固定表达"]],
  ["public-nlmg-c6-fathom", ["collection:never-let-me-go:chapter-6", "文学阅读", "补充阅读", "文学描写", "构词联想"]],
  ["public-nlmg-c2-smirk", ["collection:never-let-me-go:chapter-2", "文学阅读", "名词", "辨析"]],
  ["public-nlmg-c4-rhubarb", ["collection:never-let-me-go:chapter-4", "文学阅读", "不可数名词", "植物", "场景描写"]],
  ["public-nlmg-c11-rafter", ["collection:never-let-me-go:chapter-11", "文学阅读", "划线词", "单词"]],
  ["public-nlmg-c5-back-down", ["collection:never-let-me-go:chapter-5", "文学阅读", "补充阅读", "短语动词"]],
  ["public-nlmg-c6-drift-apart", ["collection:never-let-me-go:chapter-6", "文学阅读", "补充阅读", "实用表达", "人物关系"]],
  ["public-nlmg-c8-tranquil", ["collection:never-let-me-go:chapter-8", "文学阅读", "划线词", "单词"]],
  ["public-nlmg-c5-innocuous", ["collection:never-let-me-go:chapter-5", "文学阅读", "补充阅读", "单词"]],
  ["public-nlmg-c5-allude", ["collection:never-let-me-go:chapter-5", "文学阅读", "补充阅读", "单词"]],
  ["public-nlmg-c6-complacent", ["collection:never-let-me-go:chapter-6", "文学阅读", "精选补充", "单词"]],
  ["public-nlmg-c10-hear-somebody-out", ["collection:never-let-me-go:chapter-10", "文学阅读", "补充阅读", "短语动词", "口语表达"]]
].map(([id, tags]) => [id, Object.freeze(tags)]));
const loadSnapshot = async () => parsePublicSnapshot(JSON.parse(await readFile(snapshotUrl, "utf8")), { allowLegacy: false });
const loadSources = async () => Promise.all(chapters.map(async chapter => {
  // A missing chapter must fail the suite, never silently become a skipped test.
  return JSON.parse(await readFile(sourceUrl(chapter), "utf8"));
}));
const approvedReuseTags = new Map();
for (const source of await loadSources()) {
  for (const item of source.items.filter(candidate => candidate.reuseExistingSameSense === true)) {
    const normalized = normalizeEnglish(item.term);
    const approved = approvedReuseTags.get(normalized) || new Set();
    for (const tag of [membership(source.chapter.number), "文学阅读", ...item.tags]) approved.add(tag);
    approvedReuseTags.set(normalized, approved);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function withoutNewContexts(entry) {
  const originalTags = originalReusedCardTags.get(entry.id);
  if (originalTags) {
    const originalSet = new Set(originalTags);
    const approved = approvedReuseTags.get(entry.normalized);
    assert.ok(approved, `${entry.term}: the frozen shared identity must be explicitly reused by a new source`);
    assert.deepEqual(entry.tags.filter(tag => originalSet.has(tag)), originalTags,
      `${entry.term}: all original tags and their order must survive`);
    for (const tag of entry.tags) {
      assert.ok(originalSet.has(tag) || approved.has(tag),
        `${entry.term}: additional tag ${tag} must be approved by its actual new source item`);
    }
  }
  return {
    ...entry,
    tags: originalTags ? [...originalTags] : entry.tags,
    readingContexts: entry.readingContexts.filter(context => !newMembership.test(context.membership))
  };
}

function immutableOriginal(entry) {
  const { revision: _revision, updatedAt: _updatedAt, synonymScan: _scan, ...rest } = withoutNewContexts(entry);
  return rest;
}

function oldEntries(snapshot) { return snapshot.entries.filter(entry => !newIdentity.test(entry.id)); }

function digest(entries) {
  const selected = entries.map(immutableOriginal).sort((left, right) => left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify(canonical(selected))).digest("hex");
}

function pages(value) {
  const text = String(value || "").replace(/^pp?\.\s*/iu, "").trim();
  assert.match(text, /^\d+(?:[-–]\d+)?(?:,\s*\d+(?:[-–]\d+)?)*$/u, "valid source book-page reference");
  return text.split(/,\s*/u).flatMap(group => {
    const [first, last = first] = group.split(/[-–]/u).map(Number);
    assert.ok(last >= first && last - first <= 300);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  });
}

function stableId(chapter, term) {
  return `public-nlmg-c${chapter}-${normalizeEnglish(term).replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 110)}`;
}

function seededRandom(seed) {
  let state = seed;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("all eleven remaining chapters have complete, numbered and page-local reviewed source lists", async () => {
  const sources = await loadSources();
  assert.deepEqual(sources.map(source => source.chapter.number), chapters);
  for (const [index, source] of sources.entries()) {
    const chapter = chapters[index];
    assert.equal(source.schemaVersion, 1);
    assert.deepEqual(source.collection, { id: book, title: "Never Let Me Go" });
    assert.deepEqual(source.chapter, { id: `chapter-${chapter}`, title: `Chapter ${chapter}`, number: chapter });
    assert.equal(source.sourceTitle, `Never Let Me Go — Chapter ${chapter}`);
    assert.equal(source.sourcePhotoDocument, "Never_Let_Me_Go_Merged_Deduplicated.pdf");
    assert.equal(source.originalInputKind, "excerpt", "source fragments must not become spelling aliases");
    assert.ok(Number.isSafeInteger(source.expectedItemCount) && source.expectedItemCount > 0);
    assert.equal(source.items.length, source.expectedItemCount);
    assert.equal(new Set(source.items.map(item => normalizeEnglish(item.term))).size, source.expectedItemCount);
    assert.deepEqual(source.items.map(item => item.order), source.items.map((_, itemIndex) => itemIndex + 1));
    assert.match(source.attributionNote, /自拟/u, "learning examples must not be represented as novel quotations");
    assert.match(source.attributionNote, /例句/u);
    const reviewed = new Set(pages(source.reviewedPages));
    assert.ok([...reviewed].every(page => page >= 144 && page <= 282), "only the supplied remaining book pages are claimed");
    assert.deepEqual([Math.min(...reviewed), Math.max(...reviewed)], reviewedPageBounds.get(chapter), "chapter boundaries match the supplied photo document");
    let lastPage = 0;
    for (const item of source.items) {
      for (const key of ["term", "originalInput", "partOfSpeech", "meaning", "definitionEn", "usage", "exampleEn", "exampleZh"]) {
        assert.ok(typeof item[key] === "string" && item[key].trim(), `${chapter}: ${item.term}: ${key}`);
      }
      const itemPages = pages(item.page);
      assert.ok(itemPages.every(page => reviewed.has(page)), `${item.term}: page belongs to this chapter`);
      assert.ok(itemPages[0] >= lastPage, `${item.term}: source follows reading order`);
      lastPage = itemPages[0];
      assert.equal(["划线词", "划线句提取", "补充阅读"].filter(tag => item.tags.includes(tag)).length, 1,
        `${item.term}: marked vocabulary, short marked-sentence extracts and supplements have distinct provenance`);
      assert.match(item.meaning, /^①\s+\p{Script=Han}/u, `${item.term}: numbered Chinese meaning`);
      assert.ok(item.meaning.split(/\n/u).filter(Boolean).every(point => /^(?:[①-⑳]|\d+[.、)）])\s*\p{Script=Han}/u.test(point)), `${item.term}: each separate Chinese point retains its number`);
      assert.match(item.usage, new RegExp(`^第${chapterChinese.get(chapter)}章语境：`, "u"));
      assert.match(item.usage, /\n用法：/u, `${item.term}: context and usage remain separate`);
      if (item.phonetic) {
        assert.match(item.phonetic, /^\/.+\/$/u, `${item.term}: supplied British headword or phrase pronunciation`);
      }
      assert.match(item.exampleZh, /\p{Script=Han}/u);
      for (const key of ["forms", "collocations", "confusedWith", "tags"]) assert.ok(Array.isArray(item[key]));
    }
  }
});

test("the published snapshot preserves all 344 original cards and original Chapter 1–12 contexts", async () => {
  const snapshot = await loadSnapshot();
  const original = oldEntries(snapshot);
  assert.equal(original.length, baselineCount);
  assert.equal(digest(original), baselineDigest, "adding remaining chapters must not rewrite the owner's original vocabulary or old chapter contexts");
  for (const [index, count] of oldChapterCounts.entries()) {
    assert.equal(filterEntriesByCollection(snapshot.entries, book, `chapter-${index + 1}`).length, count);
  }
  assert.equal(new Set(snapshot.entries.map(entry => entry.id)).size, snapshot.entries.length);
  assert.equal(new Set(snapshot.entries.map(entry => entry.normalized)).size, snapshot.entries.length);
  const raw = await readFile(snapshotUrl);
  assert.ok(raw.byteLength < 5_000_000, "the complete source must fit the production GitHub 5 MB snapshot reader");
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot), "utf8") < 5_000_000);
});

test("every remaining chapter card projects exactly its own source content, page and retained original form", async () => {
  const [snapshot, sources] = await Promise.all([loadSnapshot(), loadSources()]);
  const known = new Map(oldEntries(snapshot).map(entry => [entry.normalized, entry.id]));
  for (const [index, source] of sources.entries()) {
    const chapter = chapters[index];
    const cards = filterEntriesByCollection(snapshot.entries, book, `chapter-${chapter}`);
    assert.equal(cards.length, source.expectedItemCount);
    assert.deepEqual(cards.map(entry => entry.term), source.items.map(item => item.term));
    for (const [itemIndex, card] of cards.entries()) {
      const item = source.items[itemIndex];
      const normalized = normalizeEnglish(item.term);
      const expectedPriorId = known.get(normalized);
      if (expectedPriorId) {
        assert.equal(item.reuseExistingSameSense, true, `${item.term}: reuse is explicit rather than guessed`);
        assert.equal(card.id, expectedPriorId, `${item.term}: existing learning identity survives`);
      } else {
        assert.notEqual(item.reuseExistingSameSense, true, `${item.term}: a new headword is not mislabelled as reused`);
        assert.equal(card.id, stableId(chapter, item.term));
        known.set(normalized, card.id);
      }
      const view = contextualizeReadingEntry(card, book, `chapter-${chapter}`);
      for (const key of ["term", "originalInput", "entryType", "partOfSpeech", "meaning", "usage", "exampleEn", "exampleZh"]) {
        assert.equal(view[key], item[key], `${chapter}: ${item.term}: ${key}`);
      }
      // A reused headword intentionally keeps the owner's existing phonetic.
      if (!expectedPriorId) assert.equal(view.phonetic, item.phonetic || "");
      assert.equal(view.definition, item.definitionEn);
      assert.deepEqual(view.forms, item.forms);
      assert.deepEqual(view.collocations, item.collocations);
      assert.deepEqual(view.confusedWith, item.confusedWith);
      assert.equal(view.sourceTitle, source.sourceTitle);
      assert.equal(view.sourceWork, source.collection.title);
      assert.equal(view.sourceDate, `p. ${item.page}`);
      assert.equal(view.attributionNote, source.attributionNote.trim());
      const context = view.readingContexts.find(candidate => candidate.membership === membership(chapter));
      assert.equal(context.order, item.order);
      assert.equal(context.page, `p. ${item.page}`);
      assert.ok(publicEntryMatchesQuery(view, item.originalInput), `${item.term}: source form is still searchable`);
      assert.doesNotThrow(() => reconcileLexicalEntryForPublish(view), `${item.term}: publication gate`);
    }
  }
  assert.equal(known.size, snapshot.entries.length, "all new canonical cards are accounted for by reviewed sources");
  const catalog = buildCollectionCatalog(snapshot.entries).find(collection => collection.id === book);
  assert.deepEqual(catalog.chapters.map(({ number }) => number), Array.from({ length: 23 }, (_, index) => index + 1));
});

test("each remaining chapter produces randomized four-option Chinese tests for every selected card", async () => {
  const [snapshot, sources] = await Promise.all([loadSnapshot(), loadSources()]);
  for (const [index, source] of sources.entries()) {
    const chapter = chapters[index];
    const cards = filterEntriesByCollection(snapshot.entries, book, `chapter-${chapter}`)
      .map(entry => contextualizeReadingEntry(entry, book, `chapter-${chapter}`));
    const before = JSON.stringify(cards);
    const orders = new Set();
    const positions = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      const quiz = createChapterQuiz(cards, {
        id: `remaining-chapter-${chapter}-${seed}`, bookId: book, chapterId: `chapter-${chapter}`,
        now: "2026-10-18T12:00:00.000Z", random: seededRandom(seed)
      });
      assert.equal(quiz.questions.length, source.expectedItemCount, `Chapter ${chapter}: every source word is testable`);
      assert.deepEqual(quiz.omitted, []);
      assert.doesNotThrow(() => validateQuizAttempt(quiz));
      orders.add(quiz.questions.map(question => question.entryId).join("|"));
      for (const question of quiz.questions) {
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options.map(option => option.meaning)).size, 4);
        assert.equal(question.options.filter(option => option.id === question.correctOptionId).length, 1);
        positions.add(question.options.findIndex(option => option.id === question.correctOptionId));
        for (const option of question.options) {
          assert.ok(cards.some(entry => entry.id === option.sourceEntryId), "distractors stay in the same chapter");
          assert.match(option.meaning, /\p{Script=Han}/u);
        }
      }
    }
    assert.ok(orders.size > 1, `Chapter ${chapter}: different seeds change the order`);
    assert.equal(positions.size, 4, `Chapter ${chapter}: correct answer position is randomized`);
    assert.equal(JSON.stringify(cards), before, "quiz creation cannot mutate canonical cards");
  }
});

test("the eleven-chapter batch imports atomically per chapter, preserves learning identities and reimports byte-stably", async () => {
  const [snapshot, sources] = await Promise.all([loadSnapshot(), loadSources()]);
  const retained = oldEntries(snapshot).map(withoutNewContexts);
  assert.equal(retained.length, baselineCount);
  const prior = parsePublicSnapshot({ ...snapshot, entries: retained }, { allowLegacy: false });
  const directory = await mkdtemp(join(tmpdir(), "wordbook-remaining-chapters-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const timestamp = new Date(Math.max(...snapshot.entries.map(entry => Date.parse(entry.updatedAt))) + 1000).toISOString();
  const histories = retained.map(entry => applyReviewRating(entry.id, null, "good", new Date(timestamp)));
  const historiesBefore = structuredClone(histories);
  try {
    await writeFile(snapshotPath, JSON.stringify(prior), "utf8");
    let last = prior;
    for (const [index, source] of sources.entries()) {
      const result = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapters[index])), snapshotPath, timestamp });
      assert.equal(result.changed, true);
      assert.equal(result.totalChapterEntries, source.expectedItemCount);
      assert.equal(result.chapterEntries.length, source.expectedItemCount);
      const beforeTerms = new Set(last.entries.map(entry => entry.normalized));
      const newCount = source.items.filter(item => !beforeTerms.has(normalizeEnglish(item.term))).length;
      assert.equal(result.snapshot.entries.length, last.entries.length + newCount);
      for (const old of last.entries) {
        const next = result.snapshot.entries.find(entry => entry.id === old.id);
        assert.ok(next, `${old.term}: no existing card is removed`);
        assert.equal(next.createdAt, old.createdAt);
        const oldContexts = new Set(old.readingContexts.map(context => context.membership));
        assert.deepEqual(next.readingContexts.filter(context => oldContexts.has(context.membership)), old.readingContexts);
        assert.deepEqual(next.synonyms, old.synonyms);
      }
      for (const entry of result.chapterEntries) {
        assert.equal(entry.synonymScan.status, "pending", "a batch import must not pretend AI synonym recognition has completed");
        assert.equal(entry.synonymScan.sourceFingerprint, entrySynonymFingerprint(entry));
        assert.deepEqual(entry.synonymScan.matches, []);
      }
      last = result.snapshot;
    }
    assert.equal(last.entries.length, snapshot.entries.length);
    assert.equal(digest(oldEntries(last)), baselineDigest);
    const written = await readFile(snapshotPath, "utf8");
    for (const chapter of chapters) {
      const repeated = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapter)), snapshotPath, timestamp });
      assert.equal(repeated.changed, false, `Chapter ${chapter}: repeated import is idempotent`);
      assert.deepEqual(repeated.snapshot, last);
    }
    assert.equal(await readFile(snapshotPath, "utf8"), written);
    for (const chapter of chapters) {
      const views = filterEntriesByCollection(last.entries, book, `chapter-${chapter}`)
        .map(entry => contextualizeReadingEntry(entry, book, `chapter-${chapter}`));
      const queue = buildDueQueue(views, histories, new Date(timestamp));
      assert.equal(queue.some(({ entry }) => retained.some(old => old.id === entry.id)), false,
        "an already reviewed shared identity must not become new when another chapter is added");
    }
    assert.deepEqual(histories, historiesBefore, "batch import and chapter projection never reset saved learning histories");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("all checked-in remaining chapter sources are already imported and repeated checks leave canonical bytes untouched", async () => {
  const sources = await loadSources();
  const before = await readFile(snapshotUrl, "utf8");
  for (const [index, source] of sources.entries()) {
    const result = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapters[index])), checkOnly: true });
    assert.equal(result.changed, false);
    assert.equal(result.totalChapterEntries, source.expectedItemCount);
  }
  assert.equal(await readFile(snapshotUrl, "utf8"), before);
});

test("the importer accepts natural Chinese chapter labels from one to ninety-nine without numeric-label regressions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wordbook-chinese-chapter-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  const sourcePath = join(directory, "chapter.json");
  const timestamp = "2026-10-18T12:00:00.000Z";
  try {
    await writeFile(snapshotPath, JSON.stringify({ schemaVersion: 3, exportedAt: timestamp, revisionId: "natural-chinese-fixture", lastMutationId: "", entries: [] }), "utf8");
    for (const [number, label] of [[1, "一"], [10, "十"], [11, "十一"], [19, "十九"], [20, "二十"], [21, "二十一"], [22, "二十二"], [23, "二十三"], [30, "三十"], [99, "九十九"]]) {
      const fixture = {
        schemaVersion: 1, collection: { id: "chapter-label-fixture", title: "Chapter Label Fixture" },
        chapter: { id: `chapter-${number}`, title: `Chapter ${number}`, number },
        sourceTitle: `Chapter Label Fixture — Chapter ${number}`, originalInputKind: "excerpt", expectedItemCount: 1,
        items: [{ term: "context", originalInput: "in this context", entryType: "word", partOfSpeech: "noun", meaning: "① 语境。", definitionEn: "the situation in which something is understood", usage: `第${label}章语境：一个测试用的章节。\n用法：in context。`, exampleEn: "Read the word in context.", exampleZh: "结合语境读这个词。", page: "1", forms: [], collocations: [], tags: [] }]
      };
      await writeFile(sourcePath, JSON.stringify(fixture), "utf8");
      const result = await importReadingList({ sourcePath, snapshotPath, timestamp, checkOnly: true });
      assert.equal(result.chapterEntries.length, 1);
      assert.match(result.chapterEntries[0].attributionNote, new RegExp(`第${label}章`, "u"));
      if (number === 20) {
        fixture.items[0].usage = "第20章语境：不再把自然中文章号错误地要求成数字。";
        await writeFile(sourcePath, JSON.stringify(fixture), "utf8");
        await assert.rejects(importReadingList({ sourcePath, snapshotPath, checkOnly: true }), /第二十章语境/u);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
