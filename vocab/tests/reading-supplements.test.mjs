import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createChapterQuiz, validateQuizAttempt } from "../js/chapter-quiz.js";
import { filterEntriesByCollection } from "../js/collections.js";
import { applyReviewRating, buildDueQueue } from "../js/study.js";
import { contextualizeReadingEntry, normalizeEnglish, parsePublicSnapshot } from "../js/wordbook-schema.js";

const bookId = "never-let-me-go";
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8")));
const source = async chapter => JSON.parse(await readFile(new URL(`../data/reading-lists/${bookId}/chapter-${chapter}.json`, import.meta.url), "utf8"));
const scope = chapter => filterEntriesByCollection(snapshot.entries, bookId, `chapter-${chapter}`)
  .map(entry => contextualizeReadingEntry(entry, bookId, `chapter-${chapter}`));

// Independent agreed selection, rather than deriving the expected new terms
// from the source under test. Chinese checks guard the intended chapter sense,
// not exact prose: improving a translation must not require rewriting a golden.
const selections = new Map([
  [5, { total: 24, additions: [
    ["expel", 49, /赶出|除名/u],
    ["revolve around", 51, /围绕|中心/u],
    ["ornate", 52, /装饰.*华丽|繁复/u],
    ["storm off", 53, /怒气|气冲冲/u],
    ["brace oneself", 57, /心理准备/u],
    ["baffling", 60, /困惑|难以理解/u]
  ] }],
  [6, { total: 24, additions: [
    ["hold something against somebody", 61, /责怪|记恨/u],
    ["cave in", 61, /垮|抵抗/u],
    ["drift apart", 62, /疏远/u],
    ["intervene", 63, /干预|介入/u],
    ["mystique", 66, /神秘.*魅力|吸引力/u],
    ["albeit", 66, /尽管|虽说/u],
    ["wary", 69, /警惕|谨慎/u],
    ["fathom", 71, /理解|弄明白/u]
  ] }],
  [8, { total: 25, additions: [
    ["scrawl", 89, /潦草|乱涂/u],
    ["put something down to something", 90, /归因/u],
    ["be in awe of", 91, /敬佩|赞叹/u],
    ["sought-after", 91, /抢手|追捧/u],
    ["discreet", 95, /谨慎|不张扬|保密/u],
    ["add up", 95, /说得通|合乎情理/u],
    ["drop a hint", 97, /暗示/u]
  ] }],
  [9, { total: 24, additions: [
    ["perceptive", 98, /敏锐|洞察/u],
    ["give weight to something", 98, /重视|分量|说服力/u],
    ["fleetingly", 99, /短暂|一闪而过/u],
    ["have one's work cut out", 100, /艰巨|费.*劲|不容易/u],
    ["laughing stock", 100, /笑柄/u],
    ["take off", 101, /流行|受欢迎/u],
    ["have guts", 102, /勇气|胆量/u],
    ["break the deadlock", 103, /打破.*僵局/u],
    ["get someone's back up", 103, /惹恼|反感|生气/u],
    ["downcast", 104, /垂头丧气|沮丧/u],
    ["have one's wits about one", 104, /冷静|清醒|机警/u],
    ["do somebody a disservice", 105, /害|不利|帮倒忙/u],
    ["negligible", 105, /微不足道|忽略/u],
    ["engross", 107, /全神贯注|完全投入/u],
    ["heart-to-heart", 108, /交心|谈心|推心置腹/u],
    ["be in someone's good books", 109, /好感|欢心|认可/u]
  ] }]
]);

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

for (const [chapter, { total, additions }] of selections) {
  test(`supplemented Chapter ${chapter} has the agreed useful selection, not a quantity-only expansion`, async () => {
    const data = await source(chapter);
    assert.equal(data.expectedItemCount, total);
    assert.equal(data.items.length, total);
    assert.ok(data.items.length >= 20 && data.items.length <= 30);
    assert.equal(new Set(data.items.map(item => normalizeEnglish(item.term))).size, total);
    assert.equal(new Set(data.items.map(item => item.order)).size, total);
    assert.equal(data.sourceTitle, `Never Let Me Go — Chapter ${chapter}`);
    let previousPage = 0;
    for (const item of data.items) {
      assert.ok(Number(item.page) >= previousPage, `${item.term}: page order`);
      previousPage = Number(item.page);
    }
    for (const [term, page, intendedSense] of additions) {
      const item = data.items.find(candidate => candidate.term === term);
      assert.ok(item, `missing approved addition: ${term}`);
      assert.equal(Number(item.page), page, `${term}: source page`);
      assert.ok(item.tags.includes("补充阅读"), `${term}: selection provenance`);
      assert.equal(item.tags.includes("划线词"), false, `${term}: not falsely marked as underlined`);
      assert.match(item.meaning, /^①\s+\p{Script=Han}/u, `${term}: numbered Chinese meaning`);
      assert.match(item.meaning, intendedSense, `${term}: appropriate chapter sense`);
      assert.match(item.phonetic, /\/.+\//u, `${term}: English pronunciation`);
      assert.match(item.usage, /^第[五六八九]章语境：/u, `${term}: contextual explanation`);
      assert.match(item.usage, /\n用法：/u, `${term}: usage separate from context`);
      assert.match(item.definitionEn, /[A-Za-z]/u);
      assert.match(item.exampleEn, /[A-Za-z]/u);
      assert.match(item.exampleZh, /\p{Script=Han}/u);
      assert.ok(item.originalInput.trim() && item.partOfSpeech.trim());
      assert.ok(item.collocations.length > 0);
    }
  });

  test(`Chapter ${chapter} publishes all supplements with exact local meanings and page provenance`, async () => {
    const data = await source(chapter);
    const entries = scope(chapter);
    assert.equal(entries.length, total);
    assert.deepEqual(entries.map(entry => entry.term), data.items.map(item => item.term));
    for (const [term] of additions) {
      const item = data.items.find(candidate => candidate.term === term);
      const entry = entries.find(candidate => candidate.term === term);
      assert.ok(entry, `unpublished addition: ${term}`);
      for (const key of ["originalInput", "meaning", "usage", "phonetic", "partOfSpeech", "exampleEn", "exampleZh"]) {
        assert.equal(entry[key], item[key], `${term}: ${key}`);
      }
      assert.equal(entry.definition, item.definitionEn);
      assert.equal(entry.sourceTitle, `Never Let Me Go — Chapter ${chapter}`);
      assert.equal(entry.sourceDate, `p. ${item.page}`);
      assert.ok(entry.tags.includes("补充阅读"));
    }
  });

  test(`Chapter ${chapter} supplements participate in randomized quizzes without replacing review IDs`, () => {
    const entries = scope(chapter);
    assert.equal(entries.length, total);
    const before = JSON.stringify(entries);
    for (const seed of [8, 108, 1008]) {
      const attempt = createChapterQuiz(entries, {
        id: `supplements-${chapter}-${seed}`, bookId, chapterId: `chapter-${chapter}`,
        now: "2026-10-08T16:00:00Z", random: seeded(seed)
      });
      validateQuizAttempt(attempt);
      assert.equal(attempt.questions.length, total);
      assert.deepEqual(attempt.omitted, []);
      assert.deepEqual(new Set(attempt.questions.map(question => question.entryId)), new Set(entries.map(entry => entry.id)));
      for (const question of attempt.questions) {
        assert.equal(question.options.length, 4);
        assert.equal(question.options.find(option => option.id === question.correctOptionId)?.sourceEntryId, question.entryId);
      }
    }
    const now = new Date("2026-10-08T16:00:00Z");
    const learned = entries.map(entry => applyReviewRating(entry.id, null, "easy", now));
    assert.equal(buildDueQueue(entries, learned, now).length, 0, "all new chapter items use the existing review scheduler");
    assert.equal(JSON.stringify(entries), before, "quiz and review never mutate cards");
  });
}

test("same-sense supplements reuse the original three cards and their pre-existing review keys", async () => {
  const shared = [
    ["hold something against somebody", 2, 6, "public-nlmg-c2-hold-something-against-somebody", "2026-09-23T16:51:55.526Z"],
    ["engross", 5, 9, "public-nlmg-c5-engross", "2026-09-26T12:54:45.873Z"],
    ["fleetingly", 8, 9, "public-nlmg-c8-fleetingly", "2026-09-30T03:25:20.400Z"]
  ];
  for (const [term, earlier, newer, id, createdAt] of shared) {
    const matches = snapshot.entries.filter(entry => entry.term === term);
    assert.equal(matches.length, 1, `${term}: no second independent card`);
    const card = matches[0];
    assert.equal(card.id, id);
    assert.equal(card.createdAt, createdAt);
    const olderView = scope(earlier).find(entry => entry.id === id);
    const newerView = scope(newer).find(entry => entry.id === id);
    assert.ok(olderView && newerView);
    assert.notEqual(newerView.usage, olderView.usage, `${term}: each chapter has its own context`);
    assert.equal(newerView.sourceTitle, `Never Let Me Go — Chapter ${newer}`);
    assert.equal(olderView.sourceTitle, `Never Let Me Go — Chapter ${earlier}`);
    assert.equal((await source(newer)).items.find(item => item.term === term).reuseExistingSameSense, true);
    const now = new Date("2026-10-08T16:00:00Z");
    const priorReview = applyReviewRating(id, null, "easy", now);
    const before = JSON.stringify(priorReview);
    assert.equal(buildDueQueue([olderView], [priorReview], now).length, 0);
    assert.equal(buildDueQueue([newerView], [priorReview], now).length, 0, "a new membership does not restart a learned word");
    assert.equal(JSON.stringify(priorReview), before);
  }
  assert.equal(new Set(snapshot.entries.map(entry => entry.id)).size, snapshot.entries.length);
  assert.equal(new Set(snapshot.entries.map(entry => entry.normalized)).size, snapshot.entries.length);
});
