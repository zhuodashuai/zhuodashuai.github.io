import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { filterEntriesByCollection } from "../js/collections.js";
import { createChapterQuiz, validateQuizAttempt } from "../js/chapter-quiz.js";
import { applyReviewRating, buildDueQueue, buildStudySummary } from "../js/study.js";
import {
  contextualizeReadingEntry, normalizeEnglish, parsePublicSnapshot,
  publicEntryMatchesQuery, reconcileLexicalEntryForPublish
} from "../js/wordbook-schema.js";

const book = "never-let-me-go";
const snapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(snapshotUrl, "utf8")));
const sourceUrl = chapter => new URL(`../data/reading-lists/${book}/chapter-${chapter}.json`, import.meta.url);
const load = async chapter => JSON.parse(await readFile(sourceUrl(chapter), "utf8"));
const chapterEntries = (entries, chapter) => filterEntriesByCollection(entries, book, `chapter-${chapter}`);
const selectedCounts = new Map([[8, 25], [9, 24], [10, 26], [11, 28], [12, 25]]);
const chapterLabels = new Map([[8, "八"], [9, "九"], [10, "十"], [11, "十一"], [12, "十二"]]);
const importTimestamp = new Date(Math.max(...snapshot.entries.map(entry => Date.parse(entry.updatedAt))) + 1000).toISOString();
// Exact marked selection, independent of the canonical cards: page, headword,
// and original inflected form must survive normalization and repeated import.
const marked = new Map([
  [8, [
    [88, "be crawling with", "crawling with"], [88, "tranquil", "tranquil"],
    [88, "a hissing noise", "hissing noise"], [89, "gouge", "gouging"],
    [91, "wheel round", "wheeled round"], [91, "blow", "blow"],
    [91, "flappy", "flappy"], [92, "sycamore", "sycamore"],
    [92, "bust-up", "bust-up"], [93, "stomach-churning", "stomach-churning"],
    [93, "chorus", "chorus"], [93, "vomit", "vomiting"], [93, "gross", "gross"],
    [93, "cuddle", "cuddled"], [93, "binoculars", "binoculars"],
    [95, "snog", "snogging"], [97, "tease out", "tease out clues"],
    [97, "fleetingly", "fleetingly"]
  ]],
  [9, [
    [98, "stifling", "stifling"], [98, "charcoal", "charcoal"],
    [98, "commandeer", "commandeered"], [98, "easel", "easels"],
    [101, "demented", "demented"], [102, "afresh", "afresh"],
    [103, "sulkiness", "sulkiness"], [108, "keyed up", "keyed up"]
  ]],
  [10, [
    [114, "tenuous", "tenuous"], [114, "grumpy", "grumpy"],
    [114, "disgustedly", "disgustedly"], [114, "veteran", "veterans"],
    [116, "ledger book", "ledgerbook"], [116, "daunt", "daunted"],
    [117, "languid", "languid"], [118, "incongruous", "incongruous"],
    [119, "storm out", "stormed out of rooms"], [119, "snog", "snogging"],
    [119, "knuckle", "knuckles"], [122, "take the bait", "take the bait"],
    [122, "leave somebody in the lurch", "leaving Tommy in the lurch"]
  ]],
  [11, [
    [124, "mattress", "mattress"], [125, "speculate", "speculating"],
    [125, "assortment", "a really odd assortment"], [126, "mug", "mugs of tea"],
    [126, "rafter", "rafters"], [126, "snog", "snogging me"],
    [127, "jolt", "such a jolt"], [127, "retaliation", "a retaliation"],
    [127, "bluff", "bluffed"], [131, "whiskers", "grey whiskers"],
    [131, "blotchy", "blotchy with fury"], [131, "aura", "an alarming aura"],
    [132, "slam", "slam the door"], ["133–134", "for kicks", "Just for kicks?"],
    [134, "fretfully", "hovering fretfully"]
  ]],
  [12, [
    [136, "hiccup", "our little hiccups"], [136, "intrigue", "intrigued"],
    [137, "fizzle out", "fizzle out"], [138, "batch", "come in batches"],
    [138, "a spate of", "a whole spate of others"], [143, "awestruck", "awestruck"]
  ]]
]);

for (const [chapter, expected] of marked) {
  test(`Chapter ${chapter} retains all marked entries alongside the approved supplements`, async () => {
    const source = await load(chapter);
    assert.equal(source.expectedItemCount, selectedCounts.get(chapter));
    assert.equal(source.items.length, selectedCounts.get(chapter));
    assert.deepEqual(source.collection, { id: book, title: "Never Let Me Go" });
    assert.deepEqual(source.chapter, { id: `chapter-${chapter}`, title: `Chapter ${chapter}`, number: chapter });
    assert.equal(source.sourceTitle, `Never Let Me Go — Chapter ${chapter}`);
    assert.equal(source.sourcePhotoDocument, chapter < 10
      ? `Never_Let_Me_Go_Chapter_${chapter}_Photos.pdf` : "Images 261011 000208.pdf");
    assert.equal(source.originalInputKind, "excerpt");
    assert.deepEqual(source.items.filter(item => item.tags.includes("划线词")).map(item => [String(item.page), item.term, item.originalInput]),
      expected.map(([page, term, original]) => [String(page), term, original]));
    assert.deepEqual(source.items.map(item => item.order), source.items.map((_, index) => index + 1));
    assert.equal(new Set(source.items.map(item => normalizeEnglish(item.term))).size, source.items.length);
    for (const item of source.items) {
      assert.ok(item.tags.includes("划线词") || item.tags.includes("补充阅读"), item.term + ": selection provenance");
      assert.equal(item.tags.includes("划线词") && item.tags.includes("补充阅读"), false, "supplements are not mislabelled as marked");
      assert.match(item.meaning, /^①\s+\p{Script=Han}/u, item.term + ": numbered Chinese meaning");
      assert.match(item.usage, new RegExp(`^第${chapterLabels.get(chapter)}章语境：`, "u"));
      assert.match(item.usage, /\n用法：/u, item.term + ": context and usage are separate lines");
      assert.match(item.phonetic, /\/.+\/$/u, item.term + ": headword or phrase pronunciation retained");
      for (const key of ["partOfSpeech", "definitionEn", "exampleEn", "exampleZh"]) {
        assert.ok(item[key]?.trim(), item.term + ": " + key);
      }
      assert.match(item.exampleZh, /\p{Script=Han}/u);
    }
  });

  test(`Chapter ${chapter} canonical cards preserve every source field and reimport without changes`, async () => {
    const source = await load(chapter);
    const cards = chapterEntries(snapshot.entries, chapter);
    assert.equal(cards.length, selectedCounts.get(chapter));
    assert.deepEqual(cards.map(entry => entry.term), source.items.map(item => item.term));
    for (const [index, entry] of cards.entries()) {
      const item = source.items[index];
      const view = contextualizeReadingEntry(entry, book, `chapter-${chapter}`);
      if (!item.reuseExistingSameSense) assert.ok(view.id.startsWith(`public-nlmg-c${chapter}-`), item.term + ": stable chapter ID");
      for (const key of ["term", "originalInput", "entryType", "partOfSpeech", "phonetic", "meaning", "usage", "exampleEn", "exampleZh"]) {
        assert.equal(view[key], item[key], item.term + ": " + key);
      }
      assert.deepEqual(view.forms, item.forms);
      assert.equal(view.definition, item.definitionEn);
      assert.equal(view.sourceTitle, source.sourceTitle);
      assert.equal(view.sourceDate, "p. " + item.page);
      assert.ok(publicEntryMatchesQuery(view, item.originalInput), item.term + ": original remains searchable");
      assert.doesNotThrow(() => reconcileLexicalEntryForPublish(view), item.term + ": publication gate");
    }
    const before = await readFile(snapshotUrl, "utf8");
    const repeated = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapter)), checkOnly: true });
    assert.equal(repeated.changed, false);
    assert.equal(repeated.totalChapterEntries, selectedCounts.get(chapter));
    assert.equal(await readFile(snapshotUrl, "utf8"), before, "check-only import never mutates the live source");
  });

  test(`Chapter ${chapter} quiz includes all selected words with four same-chapter options`, () => {
    const cards = chapterEntries(snapshot.entries, chapter).map(entry => contextualizeReadingEntry(entry, book, `chapter-${chapter}`));
    const before = JSON.stringify(cards);
    const questionOrders = new Set();
    const correctOptionPositions = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      let state = seed;
      const quiz = createChapterQuiz(cards, {
        id: `chapter-${chapter}-fixture-${seed}`, bookId: book, chapterId: `chapter-${chapter}`,
        now: "2026-09-30T12:00:00Z",
        random: () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32)
      });
      assert.equal(quiz.questions.length, selectedCounts.get(chapter));
      questionOrders.add(quiz.questions.map(question => question.entryId).join("|"));
      assert.deepEqual(quiz.omitted, []);
      assert.deepEqual(new Set(quiz.questions.map(question => question.entryId)), new Set(cards.map(entry => entry.id)));
      assert.doesNotThrow(() => validateQuizAttempt(quiz));
      for (const question of quiz.questions) {
        correctOptionPositions.add(question.options.findIndex(option => option.id === question.correctOptionId));
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options.map(option => option.meaning)).size, 4);
        assert.equal(question.options.filter(option => option.id === question.correctOptionId).length, 1);
        for (const option of question.options) {
          assert.ok(cards.some(entry => entry.id === option.sourceEntryId));
          assert.match(option.meaning, /\p{Script=Han}/u);
        }
      }
    }
    assert.ok(questionOrders.size > 1, "different random seeds change question order");
    assert.equal(correctOptionPositions.size, 4, "the correct answer is not fixed to one option position");
    assert.equal(JSON.stringify(cards), before);
  });
}

test("source notes retain chapter-specific qualifications rather than teaching imagined events as facts", async () => {
  const chapter8 = await load(8);
  const chapter9 = await load(9);
  const item = (source, term) => source.items.find(entry => entry.term === term);
  assert.match(item(chapter8, "gouge").usage, /并未明确说纸真的被划破/u);
  assert.match(item(chapter8, "blow").usage, /不是说他已爆发/u);
  assert.match(item(chapter8, "chorus").usage, /并非真的集体呕吐/u);
  assert.match(item(chapter8, "cuddle").usage, /跨行断字/u);
  assert.match(item(chapter8, "sycamore").meaning, /英国.*欧洲槭/u);
  assert.match(item(chapter9, "commandeer").usage, /不表示真的发生军事征用/u);
  assert.match(item(chapter9, "demented").usage, /不是在给苍蝇作医学诊断/u);
  assert.match(item(chapter9, "sulkiness").usage, /不等于普通的安静或害羞/u);
});

for (const chapters of [[8, 9], [10, 11, 12]]) {
test(`Chapters ${chapters.join(", ")} import without duplicating shared cards or replacing earlier contexts`, async () => {
  const memberships = new Set(chapters.map(chapter => `collection:${book}:chapter-${chapter}`));
  const prior = { ...snapshot, entries: snapshot.entries.flatMap(entry => {
    if (!entry.tags.some(tag => memberships.has(tag))) return [entry];
    const contexts = entry.readingContexts.filter(context => !memberships.has(context.membership));
    return contexts.length ? [{ ...entry, tags: entry.tags.filter(tag => !memberships.has(tag)), readingContexts: contexts }] : [];
  }) };
  // All requested memberships are removed, but cards shared with other chapters
  // remain. In particular, snog is shared by Chapters 8, 10 and 11; subtracting
  // an old fixed count would either discard that card or hide a duplication.
  const priorTerms = new Set(prior.entries.map(entry => entry.normalized));
  const sourceTerms = new Set((await Promise.all(chapters.map(load))).flatMap(source => source.items.map(item => normalizeEnglish(item.term))));
  const expectedNewCards = [...sourceTerms].filter(term => !priorTerms.has(term)).length;
  assert.equal(snapshot.entries.length - prior.entries.length, expectedNewCards);
  assert.equal(expectedNewCards, chapters[0] === 8 ? 46 : 72);
  const directory = await mkdtemp(join(tmpdir(), "wordbook-reading-chapters-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  try {
    await writeFile(snapshotPath, JSON.stringify(prior), "utf8");
    let last = prior;
    for (const chapter of chapters) {
      const result = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapter)), snapshotPath, timestamp: importTimestamp });
      assert.equal(result.changed, true);
      const source = await load(chapter);
      const already = new Set(last.entries.map(entry => entry.normalized));
      assert.equal(result.snapshot.entries.length, last.entries.length + source.items.filter(item => !already.has(normalizeEnglish(item.term))).length);
      for (const old of last.entries) {
        const next = result.snapshot.entries.find(entry => entry.id === old.id);
        assert.equal(next.createdAt, old.createdAt);
        assert.deepEqual(next.readingContexts.filter(context => !memberships.has(context.membership)),
          old.readingContexts.filter(context => !memberships.has(context.membership)));
        if (!source.items.some(item => normalizeEnglish(item.term) === old.normalized)) assert.deepEqual(next, old);
      }
      last = result.snapshot;
    }
    assert.equal(last.entries.length, snapshot.entries.length);
    assert.equal(new Set(last.entries.map(entry => entry.id)).size, last.entries.length);
    assert.equal(new Set(last.entries.map(entry => entry.normalized)).size, last.entries.length);
    for (const [index, count] of [29, 38, 28, 51, 24, 24, 30, 25, 24, 26, 28, 25].entries()) {
      const chapter = index + 1;
      if (chapters.includes(chapter)) continue;
      assert.equal(chapterEntries(last.entries, chapter).length, count);
      const earlier = chapterEntries(prior.entries, chapter);
      const after = chapterEntries(last.entries, chapter);
      assert.deepEqual(after.map(entry => entry.id), earlier.map(entry => entry.id));
      for (const old of earlier) {
        const next = after.find(entry => entry.id === old.id);
        assert.deepEqual(next.readingContexts.filter(context => !memberships.has(context.membership)), old.readingContexts);
      }
    }
    const bytes = await readFile(snapshotPath, "utf8");
    for (const chapter of chapters) {
      const repeated = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapter)), snapshotPath });
      assert.equal(repeated.changed, false);
      assert.deepEqual(repeated.snapshot, last);
    }
    assert.equal(await readFile(snapshotPath, "utf8"), bytes, "repeated import preserves byte-for-byte stored state");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
}

test("new chapter memberships reuse original study identities and retain review histories across all shared contexts", () => {
  const shared = [
    ["public-nlmg-c2-meandering", "meandering", [2, 10]],
    ["public-nlmg-c8-snog", "snog", [8, 10, 11]],
    ["public-nlmg-c5-bluff", "bluff", [5, 11]],
    ["public-nlmg-c3-rummage", "rummage", [3, 6, 11]],
    ["public-nlmg-c3-have-somebody-on", "have somebody on", [3, 12]],
    ["public-nlmg-c6-wary", "wary", [6, 12]]
  ];
  const now = new Date(importTimestamp);
  const histories = shared.map(([id]) => applyReviewRating(id, null, "easy", now));
  const before = structuredClone(histories);
  for (const [id, term, chapters] of shared) {
    assert.equal(snapshot.entries.filter(entry => entry.normalized === normalizeEnglish(term)).length, 1, term + ": one global card");
    const canonical = snapshot.entries.find(entry => entry.id === id);
    assert.equal(canonical.term, term);
    for (const chapter of chapters) {
      const cards = chapterEntries(snapshot.entries, chapter).map(entry => contextualizeReadingEntry(entry, book, `chapter-${chapter}`));
      const view = cards.find(entry => entry.id === id);
      assert.ok(view, term + ": shared chapter " + chapter);
      assert.equal(view.createdAt, canonical.createdAt);
      assert.equal(view.sourceTitle, `Never Let Me Go — Chapter ${chapter}`);
      assert.equal(buildDueQueue(cards, histories, now).some(({ entry }) => entry.id === id), false,
        term + ": a recently reviewed shared card is not new in another chapter");
      assert.ok(buildStudySummary(cards, histories, now).scheduledCount >= 1);
      const state = histories.find(review => review.entryId === id);
      const due = buildDueQueue(cards, histories, new Date(state.dueAt)).find(({ entry }) => entry.id === id);
      assert.equal(due.status, "review");
      assert.deepEqual(due.reviewState, state);
    }
  }
  assert.deepEqual(histories, before, "chapter projection and queue construction never reset saved progress");
});
