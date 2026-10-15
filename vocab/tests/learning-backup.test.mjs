import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
import { applyReviewRating } from "../js/study.js";
import { applyQuizAnswer, createChapterQuiz } from "../js/chapter-quiz.js";

globalThis.BroadcastChannel = undefined;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.indexedDB = new IDBFactory();
const owner = await import("../js/owner-storage.js");
const { createQuizStorage, planQuizAttemptMerge, quizStorage } = await import("../js/quiz-storage.js");
const {
  LEARNING_BACKUP_FORMAT, LEARNING_BACKUP_MAX_BYTES, createLearningBackupBlob, exportLearningBackup,
  learningRestoreMessage, parseLearningBackupText, planLearningRestore, previewLearningRestore,
  readLearningBackupFile, restoreLearningBackup, validateLearningBackup
} = await import("../js/learning-backup.js");

const at = "2026-10-15T12:00:00.000Z";
const entries = [
  { id: "apple", term: "apple", meaning: "苹果" }, { id: "river", term: "river", meaning: "河流" },
  { id: "chair", term: "chair", meaning: "椅子" }, { id: "cloud", term: "cloud", meaning: "云朵" }
];
const review = (id = "apple", current = null, rating = "good", now = at) => applyReviewRating(id, current, rating, new Date(now));
const attempt = (id = "quiz-one") => createChapterQuiz(entries, { id, bookId: "book", chapterId: "chapter-1", now: at, random: () => 0.3 });
function answer(value, { wrong = false, now = "2026-10-15T12:01:00.000Z" } = {}) {
  const question = value.questions[value.answers.length];
  const optionId = wrong ? question.options.find(({ id }) => id !== question.correctOptionId).id : question.correctOptionId;
  return applyQuizAnswer(value, question.id, optionId, now);
}
const document = (reviewStates = [], quizAttempts = []) => ({ format: LEARNING_BACKUP_FORMAT, backupVersion: 1, exportedAt: at, reviewStates, quizAttempts });
let quizzes;
let services;

test.beforeEach(async () => {
  await owner.closeDatabaseForTests(); await quizStorage.close();
  globalThis.indexedDB = new IDBFactory();
  quizzes = createQuizStorage({ indexedDB: globalThis.indexedDB, name: "learning-backup-test-quizzes" });
  services = { reviews: owner, quizzes };
});
test.afterEach(async () => { await owner.closeDatabaseForTests(); await quizzes.close(); await quizStorage.close(); });

test("private export round-trips exact review/attempt IDs and includes neither public content nor owner data", async () => {
  const state = review(); const quiz = answer(attempt());
  await owner.putReviewState(state, { expected: null });
  await quizzes.mergeAttempts([quiz]);
  const blob = await exportLearningBackup(services);
  const parsed = await readLearningBackupFile(blob);
  assert.deepEqual(Object.keys(parsed).sort(), ["backupVersion", "exportedAt", "format", "quizAttempts", "reviewStates"]);
  assert.deepEqual(parsed.reviewStates, [state]); assert.deepEqual(parsed.quizAttempts, [quiz]);
  assert.ok(blob.size < LEARNING_BACKUP_MAX_BYTES);
  const reordered = structuredClone(parsed);
  reordered.reviewStates[0] = Object.fromEntries(Object.entries(state).reverse());
  const result = planLearningRestore(reordered, { reviewStates: [state], quizAttempts: [quiz] });
  assert.equal(result.reviews.unchanged, 1); assert.equal(result.quizzes.unchanged, 1);
});

test("existing chapter-quiz export files can recover their original attempts without accepting extra owner fields", async () => {
  const quiz = answer(attempt());
  const legacy = { schemaVersion: 1, exportedAt: at, attempts: [quiz] };
  const backup = parseLearningBackupText(JSON.stringify(legacy));
  assert.deepEqual(backup, document([], [quiz]));
  assert.equal((await restoreLearningBackup(backup, services)).stores.quizzes.added, 1);
  assert.deepEqual(await owner.listReviewStates(), []);
  assert.throws(() => parseLearningBackupText(JSON.stringify({ ...legacy, drafts: [] })), /不.*备份/);
});

test("10 MB is measured in UTF-8 bytes, including dishonest file sizes, and oversized files are not read", async () => {
  const json = JSON.stringify(document());
  assert.deepEqual(parseLearningBackupText(json + " ".repeat(LEARNING_BACKUP_MAX_BYTES - new TextEncoder().encode(json).byteLength)), document());
  let read = false;
  await assert.rejects(readLearningBackupFile({ size: LEARNING_BACKUP_MAX_BYTES + 1, async text() { read = true; return json; } }), /10 MB/);
  assert.equal(read, false);
  await assert.rejects(readLearningBackupFile({ size: 1, async text() { return "中".repeat(Math.ceil(LEARNING_BACKUP_MAX_BYTES / 3) + 1); } }), /10 MB/);
  assert.throws(() => parseLearningBackupText("{"), /JSON/);
  assert.throws(() => validateLearningBackup({ ...document(), reviewStates: Array(10001).fill(review()) }), /数量/);
  assert.throws(() => validateLearningBackup({ ...document(), quizAttempts: Array(2001).fill(attempt()) }), /数量/);
});

test("extra credential fields and malformed nested records are rejected before either store can write", async () => {
  const cases = [
    { ...document(), token: "never-import" },
    document([{ ...review(), apiKey: "never-import" }]),
    document([], [{ ...attempt(), sessionToken: "never-import" }]),
    { ...document(), backupVersion: 2 },
    { ...document(), exportedAt: "yesterday" },
    document([review(), review()]), document([], [attempt(), attempt()])
  ];
  const nested = attempt(); nested.questions[0].options[0].authorization = "never-import"; cases.push(document([], [nested]));
  const forged = answer(attempt()); forged.answers[0].correct = false; cases.push(document([review()], [forged]));
  const badHistory = review(); badHistory.history[0].cookie = "never-import"; cases.push(document([badHistory]));
  let calls = 0;
  const spyServices = { reviews: { async mergeReviewStates() { calls += 1; } }, quizzes: { async mergeAttempts() { calls += 1; } } };
  for (const value of cases) await assert.rejects(restoreLearningBackup(value, spyServices));
  assert.equal(calls, 0);
  assert.deepEqual(await owner.listReviewStates(), []); assert.deepEqual(await quizzes.listAttempts(), []);
});

test("preview never imports and restore adds records without touching drafts, outbox, cache or unrelated progress", async () => {
  const db = await owner.openDatabase();
  const sentinels = { drafts: { id: "keep-draft", marker: "draft preserved" }, outbox: { operationId: "keep-outbox", marker: "no publication" }, publicCache: { key: "keep-cache", marker: "cache preserved" } };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(Object.keys(sentinels), "readwrite");
    for (const [name, value] of Object.entries(sentinels)) tx.objectStore(name).put(value);
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  const existing = review("unrelated"); await owner.putReviewState(existing, { expected: null });
  const imported = document([review()], [answer(attempt())]);
  const preview = await previewLearningRestore(imported, services);
  assert.equal(preview.reviews.added, 1); assert.equal(preview.quizzes.added, 1);
  assert.deepEqual(await owner.listReviewStates(), [existing]); assert.deepEqual(await quizzes.listAttempts(), []);
  const result = await restoreLearningBackup(imported, services);
  assert.equal(result.ok, true); assert.equal(result.stores.reviews.added, 1); assert.equal(result.stores.quizzes.added, 1);
  assert.deepEqual(await owner.getReviewState("unrelated"), existing);
  for (const [name, value] of Object.entries(sentinels)) {
    const records = await new Promise((resolve) => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); });
    assert.deepEqual(records, [value]);
  }
  await owner.closeDatabaseForTests();
  assert.deepEqual(await owner.getReviewState("apple"), imported.reviewStates[0]);
  const repeated = await restoreLearningBackup(imported, services);
  assert.equal(repeated.stores.reviews.unchanged, 1); assert.equal(repeated.stores.quizzes.unchanged, 1);
  assert.equal(repeated.stores.reviews.added + repeated.stores.quizzes.added, 0);
});

test("matching continuations advance progress, while older backups and independent branches preserve local state", async () => {
  const first = review(); const next = review("apple", first, "good", "2026-10-16T12:00:00.000Z");
  const original = attempt(); const once = answer(original); const twice = answer(once, { now: "2026-10-15T12:02:00.000Z" });
  await owner.putReviewState(first, { expected: null }); await quizzes.createAttempt(original);
  const advanced = await restoreLearningBackup(document([next], [twice]), services);
  assert.equal(advanced.stores.reviews.updated, 1); assert.equal(advanced.stores.quizzes.updated, 1);
  const old = await restoreLearningBackup(document([first], [once]), services);
  assert.equal(old.stores.reviews.keptLocal, 1); assert.equal(old.stores.quizzes.keptLocal, 1);
  const branch = review("apple", first, "again", "2026-10-17T12:00:00.000Z");
  const divergedQuiz = answer(answer(original, { wrong: true }), { now: "2026-10-15T12:03:00.000Z" });
  const divergent = await restoreLearningBackup(document([branch], [divergedQuiz]), services);
  assert.equal(divergent.stores.reviews.conflicts, 1); assert.equal(divergent.stores.quizzes.conflicts, 1);
  assert.deepEqual(await owner.getReviewState("apple"), next); assert.deepEqual(await quizzes.getAttempt(original.id), twice);
});

test("review merge does not erase known history or mistake counts when a purported newer record lacks continuity", () => {
  const local = review();
  const noHistory = { ...review("apple", local, "good", "2026-10-16T12:00:00.000Z"), history: [] };
  assert.equal(owner.planReviewStateMerge(local, noHistory).action, "conflict");
  const lapsed = review("apple", local, "again", "2026-10-16T12:00:00.000Z");
  const lostLapse = { ...review("apple", lapsed, "good", "2026-10-17T12:00:00.000Z"), lapseCount: 0 };
  assert.equal(owner.planReviewStateMerge(lapsed, lostLapse).action, "conflict");
});

test("progress made after preview is rechecked, not overwritten by the preview plan", async () => {
  const first = review(); const second = review("apple", first, "good", "2026-10-16T12:00:00.000Z");
  const third = review("apple", second, "again", "2026-10-17T12:00:00.000Z");
  const original = attempt(); const once = answer(original); const twice = answer(once, { now: "2026-10-15T12:02:00.000Z" });
  await owner.putReviewState(first, { expected: null }); await quizzes.createAttempt(original);
  const value = document([second], [once]);
  assert.equal((await previewLearningRestore(value, services)).reviews.updated, 1);
  await owner.putReviewState(third, { expected: first }); await quizzes.mergeAttempts([twice]);
  const result = await restoreLearningBackup(value, services);
  assert.equal(result.stores.reviews.keptLocal, 1); assert.equal(result.stores.quizzes.keptLocal, 1);
  assert.deepEqual(await owner.getReviewState("apple"), third); assert.deepEqual(await quizzes.getAttempt(original.id), twice);
});

test("a live answer and quiz import serialize without losing the longer matching attempt", async () => {
  const original = attempt(); const once = answer(original); const twice = answer(once, { now: "2026-10-15T12:02:00.000Z" });
  await quizzes.createAttempt(original);
  const results = await Promise.allSettled([quizzes.saveAttempt(once, { expectedRevision: 0 }), quizzes.mergeAttempts([twice])]);
  assert.equal(results[1].status, "fulfilled");
  assert.deepEqual(await quizzes.getAttempt(original.id), twice);
});

test("a quota failure rolls back the whole review transaction, including earlier records in the same batch", async () => {
  const put = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === "reviewStates" && value.entryId === "second") throw new DOMException("Quota exhausted", "QuotaExceededError");
      return put.call(this, value, ...args);
    };
    await assert.rejects(owner.mergeReviewStates([review("first"), review("second")]), /Quota exhausted/);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await owner.listReviewStates(), []);
});

test("quiz quota failure reports partial success, rolls back its whole batch, and permits an idempotent retry", async () => {
  const value = document([review()], [attempt("first"), attempt("second")]);
  const put = IDBObjectStore.prototype.put;
  let partial;
  try {
    IDBObjectStore.prototype.put = function (record, ...args) {
      if (this.name === "attempts" && record.id === "second") throw new DOMException("Quota exhausted", "QuotaExceededError");
      return put.call(this, record, ...args);
    };
    partial = await restoreLearningBackup(value, services);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.equal(partial.ok, false); assert.equal(partial.partial, true); assert.equal(partial.retryable, true);
  assert.equal(partial.stores.reviews.added, 1); assert.equal(partial.stores.quizzes.status, "failed");
  assert.match(learningRestoreMessage(partial), /部分记录已合并/); assert.match(learningRestoreMessage(partial), /可重试/);
  assert.deepEqual(await owner.listReviewStates(), value.reviewStates); assert.deepEqual(await quizzes.listAttempts(), []);
  const retry = await restoreLearningBackup(value, services);
  assert.equal(retry.ok, true); assert.equal(retry.stores.reviews.unchanged, 1); assert.equal(retry.stores.quizzes.added, 2);
});

test("review failure does not block independent quiz recovery and retry leaves it unchanged", async () => {
  const value = document([review()], [attempt()]);
  const broken = { reviews: { ...owner, async mergeReviewStates() { throw new Error("Database blocked"); } }, quizzes };
  const partial = await restoreLearningBackup(value, broken);
  assert.equal(partial.partial, true); assert.equal(partial.stores.reviews.status, "failed"); assert.equal(partial.stores.quizzes.added, 1);
  assert.deepEqual(await owner.listReviewStates(), []);
  const retry = await restoreLearningBackup(value, services);
  assert.equal(retry.stores.reviews.added, 1); assert.equal(retry.stores.quizzes.unchanged, 1);
});

test("wrong-only attempt metadata is preserved and cannot be changed on a matching attempt ID", () => {
  const mistakes = { ...attempt(), kind: "mistakes", practiceSourceAttemptId: "source-attempt" };
  assert.deepEqual(validateLearningBackup(document([], [mistakes])).quizAttempts[0], mistakes);
  const next = answer(mistakes); assert.equal(planQuizAttemptMerge(mistakes, next).action, "update");
  next.practiceSourceAttemptId = "different-source";
  assert.equal(planQuizAttemptMerge(mistakes, next).action, "conflict");
});
