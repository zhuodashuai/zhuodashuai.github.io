import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { applyQuizAnswer, createChapterQuiz, summarizeQuizAttempt } from "../js/chapter-quiz.js";
import { createQuizStorage, QuizConflictError, resolveQuizDatabaseName } from "../js/quiz-storage.js";

const entries = [
  { id: "apple", term: "apple", meaning: "苹果" },
  { id: "river", term: "river", meaning: "河流" },
  { id: "chair", term: "chair", meaning: "椅子" },
  { id: "cloud", term: "cloud", meaning: "云朵" }
];
function attempt(overrides = {}) {
  return createChapterQuiz(entries, { id: "one", bookId: "book", chapterId: "chapter-1", now: "2026-09-29T12:00:00Z", ...overrides });
}
function answer(value) {
  const question = value.questions[value.answers.length];
  return applyQuizAnswer(value, question.id, question.correctOptionId, "2026-09-29T12:01:00Z");
}

test("local E2E databases are isolated; production URL parameters cannot switch real storage", () => {
  assert.equal(resolveQuizDatabaseName(), "wordbook-chapter-quizzes");
  assert.equal(resolveQuizDatabaseName({ hostname: "localhost", search: "?e2e=1&testRun=ABC!123" }), "wordbook-chapter-quizzes-e2e-abc123");
  assert.equal(resolveQuizDatabaseName({ hostname: "zhuodashuai.github.io", search: "?e2e=1&testRun=abc" }), "wordbook-chapter-quizzes");
});

test("each saved answer survives closing and reopening with identical questions and order", async () => {
  const indexedDB = new IDBFactory();
  let storage = createQuizStorage({ indexedDB });
  const original = attempt();
  await storage.createAttempt(original);
  await storage.saveAttempt(answer(original), { expectedRevision: 0 });
  await storage.close();
  storage = createQuizStorage({ indexedDB });
  const resumed = await storage.getAttempt(original.id);
  assert.equal(resumed.answers.length, 1);
  assert.deepEqual(resumed.questions, original.questions);
  assert.equal(resumed.completedAt, null);
  let finished = resumed;
  while (!finished.completedAt) {
    const next = answer(finished);
    await storage.saveAttempt(next, { expectedRevision: finished.revision });
    finished = next;
  }
  await storage.close();
  const reloaded = await createQuizStorage({ indexedDB }).getAttempt(original.id);
  assert.deepEqual(reloaded, finished);
  assert.equal(summarizeQuizAttempt(reloaded).accuracy, 100);
  assert.equal((await indexedDB.databases()).some(({ name }) => name === "wordbook-db"), false);
});

test("history scopes by book and chapter, newest first, preserving multiple attempts", async () => {
  const storage = createQuizStorage({ indexedDB: new IDBFactory() });
  await storage.createAttempt(attempt());
  await storage.createAttempt(attempt({ id: "two", now: "2026-09-30T12:00:00Z" }));
  await storage.createAttempt(attempt({ id: "other-chapter", chapterId: "chapter-2" }));
  await storage.createAttempt(attempt({ id: "other-book", bookId: "second-book" }));
  assert.deepEqual((await storage.listAttempts({ bookId: "book", chapterId: "chapter-1" })).map(({ id }) => id), ["two", "one"]);
  assert.equal((await storage.listAttempts()).length, 4);
  assert.equal(await storage.getAttempt("absent"), null);
  await storage.close();
});

test("concurrent tabs atomically reject stale answers instead of overwriting them", async () => {
  const indexedDB = new IDBFactory();
  const first = createQuizStorage({ indexedDB });
  const second = createQuizStorage({ indexedDB });
  const original = attempt();
  await first.createAttempt(original);
  const correct = answer(original);
  const question = original.questions[0];
  const wrong = applyQuizAnswer(original, question.id, question.options.find(({ id }) => id !== question.correctOptionId).id);
  const result = await Promise.allSettled([
    first.saveAttempt(correct, { expectedRevision: 0 }),
    second.saveAttempt(wrong, { expectedRevision: 0 })
  ]);
  assert.equal(result.filter(({ status }) => status === "fulfilled").length, 1);
  assert.ok(result.find(({ status }) => status === "rejected").reason instanceof QuizConflictError);
  const stored = await first.getAttempt(original.id);
  assert.equal(stored.answers.length, 1);
  assert.deepEqual(stored, result.find(({ status }) => status === "fulfilled").value);
  await Promise.all([first.close(), second.close()]);
});

test("same-ID creation is append-only and saves require an explicit revision", async () => {
  const storage = createQuizStorage({ indexedDB: new IDBFactory() });
  const original = attempt();
  await storage.createAttempt(original);
  await assert.rejects(storage.createAttempt(original), QuizConflictError);
  await assert.rejects(storage.saveAttempt(answer(original)), /版本/);
  await assert.rejects(storage.saveAttempt(answer(original), { expectedRevision: 8 }), /版本/);
  await assert.rejects(storage.createAttempt(answer(original)), /新测试/);
  assert.deepEqual(await storage.getAttempt(original.id), original);
  await storage.close();
});

test("stored questions, metadata, and earlier answers cannot be rewritten", async () => {
  const storage = createQuizStorage({ indexedDB: new IDBFactory() });
  const original = attempt();
  await storage.createAttempt(original);
  const changed = answer(original);
  changed.bookTitle = "corrupted title";
  await assert.rejects(storage.saveAttempt(changed, { expectedRevision: 0 }), /不能改写/);
  const first = await storage.saveAttempt(answer(original), { expectedRevision: 0 });
  const next = answer(first);
  next.answers[0].at = "2026-09-29T12:00:10.000Z";
  await assert.rejects(storage.saveAttempt(next, { expectedRevision: 1 }), /不能改写/);
  assert.deepEqual(await storage.getAttempt(original.id), first);
  await storage.close();
});

test("opening failures remain visible and can be retried, never falling back to unsaved success", async () => {
  let count = 0;
  const real = new IDBFactory();
  const storage = createQuizStorage({ indexedDB: {
    open(...args) {
      count += 1;
      if (count === 1) throw new DOMException("Storage blocked", "SecurityError");
      return real.open(...args);
    }
  } });
  await assert.rejects(storage.createAttempt(attempt()), /Storage blocked/);
  const saved = await storage.createAttempt(attempt());
  assert.equal(saved.id, "one");
  await storage.close();
});

test("corrupt persisted records are rejected on reads, not displayed with invented scores", async () => {
  const indexedDB = new IDBFactory();
  const storage = createQuizStorage({ indexedDB });
  await storage.createAttempt(attempt());
  const db = await new Promise((resolve) => { const request = indexedDB.open("wordbook-chapter-quizzes", 1); request.onsuccess = () => resolve(request.result); });
  await new Promise((resolve) => {
    const transaction = db.transaction("attempts", "readwrite");
    transaction.objectStore("attempts").put({ ...attempt(), revision: 100 });
    transaction.oncomplete = resolve;
  });
  await assert.rejects(storage.getAttempt("one"), /进度/);
  await assert.rejects(storage.listAttempts(), /进度/);
  db.close(); await storage.close();
});

test("a quota failure aborts answer saving and leaves the last committed progress recoverable", async () => {
  const storage = createQuizStorage({ indexedDB: new IDBFactory() });
  const original = attempt();
  await storage.createAttempt(original);
  const put = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function () { throw new DOMException("Quota exhausted", "QuotaExceededError"); };
    await assert.rejects(storage.saveAttempt(answer(original), { expectedRevision: 0 }), /Quota exhausted/);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await storage.getAttempt(original.id), original);
  await storage.saveAttempt(answer(original), { expectedRevision: 0 });
  assert.equal((await storage.getAttempt(original.id)).answers.length, 1);
  await storage.close();
});
