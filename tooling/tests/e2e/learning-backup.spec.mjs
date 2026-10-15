import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const ORIGIN = "http://127.0.0.1:4187";
const ENTRY = "/?book=never-let-me-go&chapter=chapter-6&e2e=1&testRun=learning-backup";

test.beforeEach(async ({ context, page }, testInfo) => {
  const run = `learning-${testInfo.workerIndex}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: ORIGIN, sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled learning backup error: ${error.message}`); });
});

async function openBackup(page) {
  await page.goto(`${ORIGIN}${ENTRY}`);
  await expect(page.locator("#entry-count")).not.toHaveText("0");
  await page.locator("#learning-backup summary").click();
  await expect(page.locator("#learning-backup-export")).toBeVisible();
}

async function learning(page) {
  return page.evaluate(async () => {
    const { listReviewStates } = await import("/js/owner-storage.js");
    const { quizStorage } = await import("/js/quiz-storage.js");
    return { reviewStates: await listReviewStates(), quizAttempts: await quizStorage.listAttempts() };
  });
}

async function seed(page) {
  return page.evaluate(async () => {
    const storage = await import("/js/owner-storage.js");
    const { applyReviewRating } = await import("/js/study.js");
    const { createChapterQuiz, applyQuizAnswer } = await import("/js/chapter-quiz.js");
    const { quizStorage } = await import("/js/quiz-storage.js");
    const now = new Date("2026-10-15T12:00:00.000Z");
    const review = applyReviewRating("backup-fixture-apple", null, "good", now);
    await storage.putReviewState(review, { expected: null });
    const entries = [
      { id: "backup-fixture-apple", term: "apple", meaning: "苹果" }, { id: "backup-fixture-river", term: "river", meaning: "河流" },
      { id: "backup-fixture-chair", term: "chair", meaning: "椅子" }, { id: "backup-fixture-cloud", term: "cloud", meaning: "云朵" }
    ];
    const original = createChapterQuiz(entries, { id: "backup-fixture-attempt", bookId: "backup-fixture", chapterId: "chapter-1", now, random: () => 0.3 });
    await quizStorage.createAttempt(original);
    const question = original.questions[0];
    const answered = applyQuizAnswer(original, question.id, question.correctOptionId, "2026-10-15T12:01:00.000Z");
    await quizStorage.saveAttempt(answered, { expectedRevision: 0 });
    return { reviewStates: [review], quizAttempts: [answered] };
  });
}

async function protectedStores(page, { seedMarkers = false } = {}) {
  return page.evaluate(async (seedMarkers) => {
    const { openDatabase } = await import("/js/owner-storage.js");
    const database = await openDatabase();
    if (seedMarkers) {
      await new Promise((resolve, reject) => {
        const tx = database.transaction(["drafts", "outbox"], "readwrite");
        tx.objectStore("drafts").put({ id: "backup-test-preserved-draft", marker: "preserve local draft" });
        tx.objectStore("outbox").put({ operationId: "backup-test-preserved-operation", marker: "never publish" });
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
    }
    const names = ["entries", "drafts", "outbox", "publicCache"];
    const tx = database.transaction(names, "readonly");
    const contents = await Promise.all(names.map((name) => new Promise((resolve, reject) => {
      const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve([name, request.result]); request.onerror = () => reject(request.error);
    })));
    return Object.fromEntries(await Promise.all(contents.map(async ([name, rows]) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rows)));
      return [name, Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")];
    })));
  }, seedMarkers);
}

async function selectFile(page, value, name = "learning-backup.json") {
  await page.locator("#learning-backup-file").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(typeof value === "string" ? value : JSON.stringify(value)) });
}

test("private learning export transfers to a fresh browser only after explicit merge, and repeated import is idempotent", async ({ page, browser }) => {
  const writes = [];
  page.on("request", (request) => { if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(request.url()); });
  await openBackup(page);
  const seeded = await seed(page);
  const protectedBefore = await protectedStores(page, { seedMarkers: true });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#learning-backup-export").click();
  const download = await downloadPromise;
  const text = await readFile(await download.path(), "utf8");
  const backup = JSON.parse(text);
  expect(backup.reviewStates).toEqual(seeded.reviewStates); expect(backup.quizAttempts).toEqual(seeded.quizAttempts);
  expect(Object.keys(backup).sort()).toEqual(["backupVersion", "exportedAt", "format", "quizAttempts", "reviewStates"]);
  expect(await protectedStores(page)).toEqual(protectedBefore);
  expect(writes).toEqual([]);

  const second = await browser.newContext({ serviceWorkers: "block" });
  try {
    await second.addCookies([{ name: "e2e_run", value: "learning-fresh-browser", url: ORIGIN, sameSite: "Lax" }]);
    const fresh = await second.newPage();
    const freshWrites = [];
    fresh.on("request", (request) => { if (request.method() !== "GET" && request.url().includes("/api/")) freshWrites.push(request.url()); });
    await openBackup(fresh);
    expect(await learning(fresh)).toEqual({ reviewStates: [], quizAttempts: [] });
    const freshProtected = await protectedStores(fresh, { seedMarkers: true });
    await selectFile(fresh, text);
    await expect(fresh.locator("#learning-backup-apply")).toBeVisible();
    await expect(fresh.locator("#learning-backup-preview")).toContainText("复习 1 条 · 测试 1 轮");
    expect(await learning(fresh)).toEqual({ reviewStates: [], quizAttempts: [] });
    expect(await protectedStores(fresh)).toEqual(freshProtected);
    await fresh.locator("#learning-backup-apply").click();
    await expect(fresh.locator("#learning-backup-status")).toContainText("合并完成");
    expect(await learning(fresh)).toEqual(seeded);
    await selectFile(fresh, text);
    await expect(fresh.locator("#learning-backup-apply")).toBeEnabled();
    await fresh.locator("#learning-backup-apply").click();
    await expect(fresh.locator("#learning-backup-status")).toContainText("相同 2");
    expect(await learning(fresh)).toEqual(seeded);
    expect(await protectedStores(fresh)).toEqual(freshProtected); expect(freshWrites).toEqual([]);
  } finally { await second.close(); }
});

test("merging an older backup keeps newer local review and quiz progress", async ({ page }) => {
  await openBackup(page); const older = await seed(page);
  const newer = await page.evaluate(async () => {
    const storage = await import("/js/owner-storage.js");
    const { applyReviewRating } = await import("/js/study.js");
    const { applyQuizAnswer } = await import("/js/chapter-quiz.js");
    const { quizStorage } = await import("/js/quiz-storage.js");
    const current = await storage.getReviewState("backup-fixture-apple");
    const review = applyReviewRating(current.entryId, current, "again", new Date("2026-10-16T12:00:00.000Z"));
    await storage.putReviewState(review, { expected: current });
    const quiz = await quizStorage.getAttempt("backup-fixture-attempt");
    const question = quiz.questions[quiz.answers.length];
    const answered = applyQuizAnswer(quiz, question.id, question.correctOptionId, "2026-10-15T12:02:00.000Z");
    await quizStorage.saveAttempt(answered, { expectedRevision: quiz.revision });
    return { reviewStates: [review], quizAttempts: [answered] };
  });
  await selectFile(page, { format: "zhuo-wordbook-learning", backupVersion: 1, exportedAt: "2026-10-15T12:03:00.000Z", ...older });
  await expect(page.locator("#learning-backup-preview")).toContainText("保留本机较新 2");
  await page.locator("#learning-backup-apply").click();
  await expect(page.locator("#learning-backup-status")).toContainText("保留本机较新 2");
  expect(await learning(page)).toEqual(newer);
});

test("a malformed file with otherwise valid progress writes nothing and never enables merge", async ({ page }) => {
  await openBackup(page); const before = await seed(page);
  const protectedBefore = await protectedStores(page, { seedMarkers: true });
  const malformed = { format: "zhuo-wordbook-learning", backupVersion: 1, exportedAt: "2026-10-15T12:03:00.000Z", ...structuredClone(before) };
  malformed.reviewStates[0].entryId = "must-not-be-written";
  malformed.quizAttempts[0].questions[0].options[0].token = "must-not-be-imported";
  await selectFile(page, malformed);
  await expect(page.locator("#learning-backup-status")).toContainText("没有导入任何记录");
  await expect(page.locator("#learning-backup-apply")).toBeHidden();
  expect(await learning(page)).toEqual(before);
  expect(await protectedStores(page)).toEqual(protectedBefore);
});
