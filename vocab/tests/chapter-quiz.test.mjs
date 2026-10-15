import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyQuizAnswer, createChapterQuiz, quizMeaningsOverlap, shuffleQuizItems, summarizeQuizAttempt, unresolvedQuizMistakes, validateQuizAttempt } from "../js/chapter-quiz.js";
import { filterEntriesByCollection } from "../js/collections.js";
import { contextualizeReadingEntry } from "../js/wordbook-schema.js";
import { buildSynonymGroups } from "../js/synonym-groups.js";
import { setupChapterQuiz } from "../js/chapter-quiz-ui.js";

test("a cached pre-quiz page remains readable while its modules update", async () => {
  for (const refs of [{ launchButton: null, dialog: null }, { launchButton: {}, dialog: null }, { launchButton: null, dialog: {} }]) {
    const controller = setupChapterQuiz({ ...refs, getScope: () => { throw new Error("Old shell must not start a quiz"); } });
    assert.doesNotThrow(() => controller.updateScope());
    await controller.flushPendingSave();
  }
});

const snapshot = JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8"));
const fixture = [
  { id: "apple", term: "apple", meaning: "苹果", partOfSpeech: "noun" },
  { id: "river", term: "river", meaning: "河流", partOfSpeech: "noun" },
  { id: "chair", term: "chair", meaning: "椅子", partOfSpeech: "noun" },
  { id: "cloud", term: "cloud", meaning: "云朵", partOfSpeech: "noun" },
  { id: "jump", term: "jump", meaning: "跳跃", partOfSpeech: "verb" },
  { id: "sharp", term: "sharp", meaning: "尖锐的", partOfSpeech: "adjective" }
];
const settings = { id: "quiz-fixture", bookId: "book", chapterId: "chapter-1", now: "2026-09-29T12:00:00Z" };
function seeded(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

for (let chapter = 1; chapter <= 12; chapter += 1) {
  test(`Chapter ${chapter}: every current word has exactly four distinct, same-chapter Chinese options`, () => {
    const chapterId = `chapter-${chapter}`;
    const entries = filterEntriesByCollection(snapshot.entries, "never-let-me-go", chapterId)
      .map((entry) => contextualizeReadingEntry(entry, "never-let-me-go", chapterId));
    const sourceBefore = JSON.stringify(entries);
    const links = buildSynonymGroups(entries);
    // Multiple draws exercise different distractor combinations rather than
    // asserting only one favourable random arrangement.
    for (let seed = 1; seed <= 12; seed += 1) {
      const quiz = createChapterQuiz(entries, { ...settings, chapterId, random: seeded(seed) });
      assert.equal(quiz.questions.length, entries.length);
      assert.deepEqual(quiz.omitted, []);
      validateQuizAttempt(quiz);
      for (const question of quiz.questions) {
        assert.equal(question.options.length, 4);
        assert.equal(new Set(question.options.map(({ meaning }) => meaning)).size, 4);
        const correct = question.options.find((option) => option.id === question.correctOptionId);
        assert.equal(correct.sourceEntryId, question.entryId);
        assert.equal(correct.meaning, question.meaning);
        for (const option of question.options) {
          assert.match(option.meaning, /\p{Script=Han}/u);
          assert.ok(entries.some((entry) => entry.id === option.sourceEntryId));
          if (option.id === question.correctOptionId) continue;
          assert.equal(quizMeaningsOverlap(question.meaning, option.meaning), false);
          assert.equal(links.some((group) => group.members.some(({ entry }) => entry.id === question.entryId)
            && group.members.some(({ entry }) => entry.id === option.sourceEntryId)), false);
        }
      }
    }
    assert.equal(JSON.stringify(entries), sourceBefore, "creation never changes vocabulary or review records");
    for (const count of [1, 2, 3]) {
      const targets = entries.slice(0, count).map((entry) => entry.id);
      const practice = createChapterQuiz(entries, { ...settings, kind: "mistakes", targetEntryIds: targets, chapterId, random: seeded(count) });
      assert.equal(practice.questions.length, count, "a small wrong-word set still uses the whole chapter for options");
      assert.deepEqual(new Set(practice.questions.map((question) => question.entryId)), new Set(targets));
      assert.deepEqual(practice.omitted, []);
      validateQuizAttempt(practice);
      for (const question of practice.questions) {
        assert.equal(question.options.length, 4);
        assert.ok(question.options.some((option) => !targets.includes(option.sourceEntryId)));
        for (const option of question.options.filter((option) => option.sourceEntryId !== question.entryId)) {
          assert.equal(quizMeaningsOverlap(question.meaning, option.meaning), false);
          assert.ok(entries.some((entry) => entry.id === option.sourceEntryId));
        }
      }
    }
  });
}

test("questions and option positions are independently randomized; originals remain untouched", () => {
  const first = createChapterQuiz(fixture, { ...settings, random: seeded(42) });
  const second = createChapterQuiz(fixture, { ...settings, random: seeded(99) });
  assert.notDeepEqual(first.questions.map(({ id }) => id), second.questions.map(({ id }) => id));
  assert.ok(first.questions.some((question) => question.correctOptionId !== second.questions.find(({ id }) => id === question.id).correctOptionId));
  assert.deepEqual(new Set(first.questions.map(({ entryId }) => entryId)), new Set(fixture.map(({ id }) => id)));
  const values = [1, 2, 3];
  assert.deepEqual(shuffleQuizItems(values, () => 0), [2, 3, 1]);
  assert.deepEqual(values, [1, 2, 3]);
  assert.throws(() => shuffleQuizItems(values, () => 1), /随机数/);
});

test("Chinese overlap and declared synonyms cannot appear as distractors", () => {
  const extra = [
    { id: "tasty", term: "tasty", meaning: "美味的；很好吃", partOfSpeech: "adjective", entryType: "word", synonyms: ["palatable"] },
    { id: "palatable", term: "palatable", meaning: "可口的", partOfSpeech: "adjective", entryType: "word", synonyms: [] },
    { id: "yummy", term: "yummy", meaning: "好吃的", partOfSpeech: "adjective", entryType: "word", synonyms: [] }
  ];
  const quiz = createChapterQuiz([...fixture, ...extra], { ...settings, random: seeded(4) });
  const tasty = quiz.questions.find(({ entryId }) => entryId === "tasty");
  assert.equal(tasty.options.some(({ sourceEntryId }) => ["palatable", "yummy"].includes(sourceEntryId)), false);
  assert.equal(quizMeaningsOverlap("困惑不解的", "困惑的；茫然的"), true);
  assert.equal(quizMeaningsOverlap("温暖", "安静"), false);
});

test("missing meanings, ambiguous English headwords and too-small pools are explicitly omitted", () => {
  const quiz = createChapterQuiz([...fixture,
    { id: "bad", term: "bad", meaning: "meaning unavailable" },
    { id: "alias", term: "APPLE", meaning: "苹果公司" }
  ], settings);
  assert.ok(quiz.omitted.some(({ entryId, reason }) => entryId === "bad" && reason === "missing-meaning"));
  assert.equal(quiz.omitted.filter(({ reason }) => reason === "ambiguous-headword").length, 2);
  const tiny = createChapterQuiz(fixture.slice(0, 3), settings);
  assert.equal(tiny.questions.length, 0);
  assert.equal(tiny.omitted.length, 3);
  assert.equal(tiny.omitted.every(({ reason }) => reason === "insufficient-distinct-options"), true);
  assert.throws(() => validateQuizAttempt(tiny), /测试题目/);
  assert.deepEqual(summarizeQuizAttempt(tiny), { total: 0, answered: 0, correct: 0, wrong: 0, accuracy: null, wrongWords: [], completed: false });
});

test("same POS is preferred when three safe same-POS distractors exist", () => {
  const quiz = createChapterQuiz(fixture, { ...settings, random: seeded(9) });
  const nouns = new Set(fixture.filter(({ partOfSpeech }) => partOfSpeech === "noun").map(({ id }) => id));
  for (const question of quiz.questions.filter(({ partOfSpeech }) => partOfSpeech === "noun")) {
    assert.equal(question.options.every(({ sourceEntryId }) => nouns.has(sourceEntryId)), true);
  }
});

test("repeated source references do not create duplicate questions or incorrectly omit a word", () => {
  const quiz = createChapterQuiz([...fixture, fixture[0]], settings);
  assert.equal(quiz.questions.length, fixture.length);
  assert.deepEqual(quiz.omitted, []);
});

test("answers are sequential immutable snapshots and summary retains wrong-word details", () => {
  const initial = createChapterQuiz(fixture, settings);
  let current = initial;
  for (let index = 0; index < initial.questions.length; index += 1) {
    const question = current.questions[index];
    const option = index === 1 ? question.options.find(({ id }) => id !== question.correctOptionId).id : question.correctOptionId;
    const next = applyQuizAnswer(current, question.id, option, "2026-09-29T12:01:00Z");
    assert.equal(current.answers.length, index);
    assert.equal(next.revision, index + 1);
    validateQuizAttempt(next);
    current = next;
  }
  assert.equal(initial.answers.length, 0);
  assert.equal(current.completedAt, current.updatedAt);
  const summary = summarizeQuizAttempt(current);
  assert.equal(summary.correct, 5);
  assert.equal(summary.wrong, 1);
  assert.equal(summary.accuracy, 83.3);
  assert.equal(summary.wrongWords[0].term, current.questions[1].term);
  assert.equal(summary.wrongWords[0].meaning, current.questions[1].meaning);
  assert.notEqual(summary.wrongWords[0].selectedMeaning, summary.wrongWords[0].meaning);
  assert.throws(() => applyQuizAnswer(current, current.questions[0].id, current.questions[0].correctOptionId), /当前题目/);
  assert.throws(() => applyQuizAnswer(initial, initial.questions[1].id, initial.questions[1].correctOptionId), /当前题目/);
  assert.throws(() => applyQuizAnswer(initial, initial.questions[0].id, "bogus"), /有效选项/);
});

test("partial accuracy uses answered count, and backwards clocks cannot regress timestamps", () => {
  const initial = createChapterQuiz(fixture, settings);
  const question = initial.questions[0];
  const answered = applyQuizAnswer(initial, question.id, question.correctOptionId, "2020-01-01");
  assert.equal(answered.updatedAt, initial.startedAt);
  assert.equal(summarizeQuizAttempt(answered).accuracy, 100);
  assert.equal(summarizeQuizAttempt(answered).completed, false);
});

test("corrupt or forged result records fail validation instead of reporting a false score", () => {
  const initial = createChapterQuiz(fixture, settings);
  const answered = applyQuizAnswer(initial, initial.questions[0].id, initial.questions[0].correctOptionId);
  for (const corrupt of [
    { ...answered, revision: 0 },
    { ...answered, completedAt: answered.updatedAt },
    { ...answered, answers: [{ ...answered.answers[0], correct: false }] },
    { ...answered, questions: [{ ...answered.questions[0], options: [] }, ...answered.questions.slice(1)] }
  ]) assert.throws(() => validateQuizAttempt(corrupt));
});

test("mistake practice metadata is optional, survives answers, and rejects unsupported modes", () => {
  const original = createChapterQuiz(fixture, settings);
  assert.equal(Object.hasOwn(original, "kind"), false);
  assert.equal(Object.hasOwn(original, "practiceSourceAttemptId"), false);
  validateQuizAttempt(original);
  const practice = createChapterQuiz(fixture, { ...settings, id: "practice", kind: "mistakes", practiceSourceAttemptId: original.id, targetEntryIds: ["apple"] });
  assert.equal(practice.questions.length, 1);
  const question = practice.questions[0];
  const completed = applyQuizAnswer(practice, question.id, question.correctOptionId, "2026-09-29T12:01:00Z");
  assert.equal(completed.kind, "mistakes");
  assert.equal(completed.practiceSourceAttemptId, original.id);
  assert.ok(completed.completedAt);
  for (const invalid of [
    { ...practice, kind: "unknown" }, { ...practice, kind: null },
    { ...practice, practiceSourceAttemptId: "" }, { ...practice, practiceSourceAttemptId: "x".repeat(181) },
    { ...original, practiceSourceAttemptId: "source" }
  ]) assert.throws(() => validateQuizAttempt(invalid));
});

test("missing practice targets are omitted without manufacturing words or invalid distractors", () => {
  const before = structuredClone(fixture);
  const practice = createChapterQuiz(fixture, { ...settings, kind: "mistakes", targetEntryIds: ["apple", "apple", "deleted"] });
  assert.deepEqual(practice.questions.map((question) => question.entryId), ["apple"]);
  assert.deepEqual(practice.omitted, [{ entryId: "deleted", term: "deleted", reason: "missing-entry" }]);
  assert.deepEqual(fixture, before);
  const empty = createChapterQuiz(fixture, { ...settings, kind: "mistakes", targetEntryIds: [] });
  assert.equal(empty.questions.length, 0);
  assert.deepEqual(empty.omitted, []);
});

function answerNext(record, correct, now) {
  const question = record.questions[record.answers.length];
  const optionId = correct ? question.correctOptionId : question.options.find((option) => option.id !== question.correctOptionId).id;
  return applyQuizAnswer(record, question.id, optionId, now);
}

test("latest saved answers resolve earlier mistakes by stable ID across full and partial practice rounds", () => {
  let first = createChapterQuiz(fixture, { ...settings, id: "first", random: seeded(5) });
  first = answerNext(first, false, "2026-09-29T12:01:00Z");
  first = answerNext(first, false, "2026-09-29T12:02:00Z");
  const ids = first.questions.slice(0, 2).map((question) => question.entryId);
  const before = structuredClone(first);
  const untouched = createChapterQuiz(fixture, { ...settings, id: "untouched", now: "2026-09-29T12:03:00Z" });
  assert.deepEqual(new Set(unresolvedQuizMistakes([untouched, first]).map((word) => word.entryId)), new Set(ids), "new unanswered tests do not clear errors");
  let practice = createChapterQuiz(fixture, { ...settings, id: "practice", now: "2026-09-29T12:04:00Z", kind: "mistakes", targetEntryIds: ids, random: seeded(8) });
  practice = answerNext(practice, true, "2026-09-29T12:05:00Z");
  const correctedId = practice.questions[0].entryId;
  const outstandingId = ids.find((id) => id !== correctedId);
  assert.equal(practice.completedAt, null);
  assert.deepEqual(unresolvedQuizMistakes([first, practice, untouched]).map((word) => word.entryId), [outstandingId], "a saved correct answer resolves immediately even in an incomplete round");
  const renamed = fixture.map((entry) => entry.id === outstandingId ? { ...entry, term: `${entry.term} renamed` } : entry);
  let correction = createChapterQuiz(renamed, { ...settings, id: "correction", now: "2026-09-29T12:06:00Z", targetEntryIds: [outstandingId] });
  correction = answerNext(correction, true, "2026-09-29T12:07:00Z");
  assert.deepEqual(unresolvedQuizMistakes([first, practice, untouched, correction]), [], "a later full-test answer and renamed headword still resolve the same ID");
  let reopened = createChapterQuiz(renamed, { ...settings, id: "reopened", now: "2026-09-29T12:08:00Z", targetEntryIds: [correctedId] });
  reopened = answerNext(reopened, false, "2026-09-29T12:09:00Z");
  const records = [first, practice, untouched, correction, reopened];
  assert.deepEqual(unresolvedQuizMistakes(records).map((word) => word.entryId), [correctedId]);
  assert.deepEqual(unresolvedQuizMistakes(records), unresolvedQuizMistakes([...records].reverse()), "input record order cannot change the result");
  assert.deepEqual(first, before, "aggregating and correcting never rewrites original attempt history");
});

test("exact answer-time ties are deterministic and do not falsely clear unresolved mistakes", () => {
  const create = (id, now = settings.now) => createChapterQuiz(fixture, { ...settings, id, now, targetEntryIds: ["apple"] });
  const wrong = answerNext(create("wrong"), false, "2026-09-29T12:02:00Z");
  const tiedCorrect = answerNext(create("correct"), true, "2026-09-29T12:02:00Z");
  assert.equal(unresolvedQuizMistakes([wrong, tiedCorrect]).length, 1);
  assert.deepEqual(unresolvedQuizMistakes([wrong, tiedCorrect]), unresolvedQuizMistakes([tiedCorrect, wrong]));
  const laterRound = answerNext(create("later", "2026-09-29T12:01:00Z"), true, "2026-09-29T12:02:00Z");
  assert.deepEqual(unresolvedQuizMistakes([wrong, laterRound]), []);
});
