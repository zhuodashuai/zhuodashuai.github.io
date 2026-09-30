import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { filterEntriesByCollection } from "../js/collections.js";
import { createChapterQuiz, validateQuizAttempt } from "../js/chapter-quiz.js";
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
  ]]
]);

for (const [chapter, expected] of marked) {
  test(`Chapter ${chapter} retains exactly the marked selection, original forms and bilingual page-specific explanations`, async () => {
    const source = await load(chapter);
    assert.equal(source.expectedItemCount, expected.length);
    assert.equal(source.items.length, expected.length);
    assert.deepEqual(source.collection, { id: book, title: "Never Let Me Go" });
    assert.deepEqual(source.chapter, { id: `chapter-${chapter}`, title: `Chapter ${chapter}`, number: chapter });
    assert.equal(source.sourceTitle, `Never Let Me Go — Chapter ${chapter}`);
    assert.equal(source.sourcePhotoDocument, `Never_Let_Me_Go_Chapter_${chapter}_Photos.pdf`);
    assert.equal(source.originalInputKind, "excerpt");
    assert.deepEqual(source.items.map(item => [Number(item.page), item.term, item.originalInput]), expected);
    assert.deepEqual(source.items.map(item => item.order), expected.map((_, index) => index + 1));
    assert.equal(new Set(source.items.map(item => normalizeEnglish(item.term))).size, expected.length);
    for (const item of source.items) {
      assert.ok(item.tags.includes("划线词"), item.term + ": not an unapproved suggestion");
      assert.equal(item.tags.includes("精选补充"), false);
      assert.match(item.meaning, /^①\s+\p{Script=Han}/u, item.term + ": numbered Chinese meaning");
      assert.match(item.usage, chapter === 8 ? /^第八章语境：/u : /^第九章语境：/u);
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
    assert.equal(cards.length, expected.length);
    assert.deepEqual(cards.map(entry => entry.term), expected.map(row => row[1]));
    for (const [index, entry] of cards.entries()) {
      const item = source.items[index];
      const view = contextualizeReadingEntry(entry, book, `chapter-${chapter}`);
      assert.ok(view.id.startsWith(`public-nlmg-c${chapter}-`), item.term + ": stable chapter ID");
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
    assert.equal(repeated.totalChapterEntries, expected.length);
    assert.equal(await readFile(snapshotUrl, "utf8"), before, "check-only import never mutates the live source");
  });

  test(`Chapter ${chapter} quiz includes all ${expected.length} marked words with four same-chapter options`, () => {
    const cards = chapterEntries(snapshot.entries, chapter).map(entry => contextualizeReadingEntry(entry, book, `chapter-${chapter}`));
    const before = JSON.stringify(cards);
    for (let seed = 1; seed <= 12; seed++) {
      let state = seed;
      const quiz = createChapterQuiz(cards, {
        id: `chapter-${chapter}-fixture-${seed}`, bookId: book, chapterId: `chapter-${chapter}`,
        now: "2026-09-30T12:00:00Z",
        random: () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32)
      });
      assert.equal(quiz.questions.length, expected.length);
      assert.deepEqual(quiz.omitted, []);
      assert.deepEqual(new Set(quiz.questions.map(question => question.entryId)), new Set(cards.map(entry => entry.id)));
      assert.doesNotThrow(() => validateQuizAttempt(quiz));
      for (const question of quiz.questions) {
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options.map(option => option.meaning)).size, 4);
        assert.equal(question.options.filter(option => option.id === question.correctOptionId).length, 1);
        for (const option of question.options) {
          assert.ok(cards.some(entry => entry.id === option.sourceEntryId));
          assert.match(option.meaning, /\p{Script=Han}/u);
        }
      }
    }
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

test("both chapter imports add only the 26 selected cards and preserve all earlier entries, IDs and contexts", async () => {
  const memberships = new Set([8, 9].map(chapter => `collection:${book}:chapter-${chapter}`));
  const prior = { ...snapshot, entries: snapshot.entries.filter(entry => !entry.tags.some(tag => memberships.has(tag))) };
  assert.equal(snapshot.entries.length - prior.entries.length, 26);
  const priorIds = new Set(prior.entries.map(entry => entry.id));
  const directory = await mkdtemp(join(tmpdir(), "wordbook-chapter-eight-nine-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  try {
    await writeFile(snapshotPath, JSON.stringify(prior), "utf8");
    let last = prior;
    for (const chapter of [8, 9]) {
      const result = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapter)), snapshotPath, timestamp: "2026-09-30T12:00:00Z" });
      assert.equal(result.changed, true);
      assert.equal(result.snapshot.entries.length, last.entries.length + marked.get(chapter).length);
      assert.deepEqual(result.snapshot.entries.filter(entry => priorIds.has(entry.id)), prior.entries);
      last = result.snapshot;
    }
    assert.equal(last.entries.length, snapshot.entries.length);
    assert.equal(new Set(last.entries.map(entry => entry.id)).size, last.entries.length);
    assert.equal(new Set(last.entries.map(entry => entry.normalized)).size, last.entries.length);
    for (const [index, count] of [29, 38, 28, 51, 18, 16, 30].entries()) {
      const chapter = index + 1;
      assert.equal(chapterEntries(last.entries, chapter).length, count);
      assert.deepEqual(chapterEntries(last.entries, chapter), chapterEntries(prior.entries, chapter));
    }
    const bytes = await readFile(snapshotPath, "utf8");
    for (const chapter of [8, 9]) {
      const repeated = await importReadingList({ sourcePath: fileURLToPath(sourceUrl(chapter)), snapshotPath });
      assert.equal(repeated.changed, false);
      assert.deepEqual(repeated.snapshot, last);
    }
    assert.equal(await readFile(snapshotPath, "utf8"), bytes, "repeated import preserves byte-for-byte stored state");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
