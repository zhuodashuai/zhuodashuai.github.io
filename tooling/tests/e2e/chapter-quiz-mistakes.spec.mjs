import { expect, test } from "@playwright/test";

const BOOK = "never-let-me-go";
const CHAPTER = "chapter-6";

test.beforeEach(async ({ context, page }, testInfo) => {
  const run = `mistakes-${testInfo.workerIndex}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled wrong-word practice error: ${error.message}`); });
  await page.goto(`/?book=${BOOK}&chapter=${CHAPTER}&e2e=1&testRun=${run.slice(0, 32)}`);
  await expect(page.locator("#entry-count")).toHaveText("24");
});

async function attempts(page) {
  return page.evaluate(async ({ bookId, chapterId }) => {
    const { quizStorage } = await import("/js/quiz-storage.js");
    return quizStorage.listAttempts({ bookId, chapterId });
  }, { bookId: BOOK, chapterId: CHAPTER });
}

async function reviews(page) {
  return page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
}

// Seed historical answers through the ordinary storage API so immutable
// revisions and real IndexedDB durability remain part of every browser test.
async function seedHistory(page, { ghost = false } = {}) {
  return page.evaluate(async ({ bookId, chapterId, ghost }) => {
    const { createChapterQuiz, applyQuizAnswer } = await import("/js/chapter-quiz.js");
    const { quizStorage } = await import("/js/quiz-storage.js");
    const { contextualizeReadingEntry, parsePublicSnapshot } = await import("/js/wordbook-schema.js");
    const { filterEntriesByCollection } = await import("/js/collections.js");
    const snapshot = parsePublicSnapshot(await (await fetch("/data/owner-wordbook.json")).json());
    const entries = filterEntriesByCollection(snapshot.entries, bookId, chapterId)
      .map((entry) => contextualizeReadingEntry(entry, bookId, chapterId));
    if (ghost) entries.push({ id: "deleted-quiz-entry", term: "retired vocabulary", meaning: "历史遗留词条", partOfSpeech: "noun" });
    let record = createChapterQuiz(entries, {
      bookId, chapterId, bookTitle: "Never Let Me Go", chapterTitle: "Chapter 6",
      now: "2026-10-10T10:00:00Z", id: crypto.randomUUID(),
      ...(ghost ? { targetEntryIds: ["deleted-quiz-entry"] } : {})
    });
    await quizStorage.createAttempt(record);
    for (let index = 0; index < record.questions.length; index += 1) {
      const question = record.questions[index];
      const option = index < 2 ? question.options.find((item) => item.id !== question.correctOptionId).id : question.correctOptionId;
      const next = applyQuizAnswer(record, question.id, option, new Date(Date.parse(record.startedAt) + (index + 1) * 1000));
      await quizStorage.saveAttempt(next, { expectedRevision: record.revision });
      record = next;
    }
    return record;
  }, { bookId: BOOK, chapterId: CHAPTER, ghost });
}

async function answer(page, record, { wrong = false } = {}) {
  const term = await page.locator("#quiz-term").innerText();
  const question = record.questions.find((item) => item.term === term);
  expect(question).toBeTruthy();
  const option = wrong ? question.options.find((item) => item.id !== question.correctOptionId).id : question.correctOptionId;
  await page.locator(`#quiz-options > button[data-option-id="${option}"]`).click();
  await expect(page.locator("#quiz-next")).toBeEnabled();
  return question;
}

test("two historical errors become a resumable practice round using the complete chapter as distractors", async ({ page }) => {
  const original = await seedHistory(page);
  const reviewsBefore = await reviews(page);
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-history").click();
  await page.locator(`.quiz-history-open[data-attempt-id="${original.id}"]`).click();
  await expect(page.locator("#quiz-wrong-list > li")).toHaveCount(2);
  await page.locator("#quiz-practice-attempt").click();
  await expect(page.locator("#quiz-title")).toHaveText("错词练习");
  await expect(page.locator("#quiz-options > button")).toHaveCount(4);
  const practice = (await attempts(page))[0];
  const wrongIds = original.questions.slice(0, 2).map((question) => question.entryId);
  expect(practice.kind).toBe("mistakes");
  expect(practice.practiceSourceAttemptId).toBe(original.id);
  expect(practice.questions.map((question) => question.entryId).sort()).toEqual([...wrongIds].sort());
  for (const question of practice.questions) {
    expect(question.options).toHaveLength(4);
    expect(question.options.some((option) => !wrongIds.includes(option.sourceEntryId))).toBe(true);
  }
  await answer(page, practice);
  await page.locator("#quiz-close").click();
  await page.reload();
  await page.locator("#chapter-quiz-button").click();
  await expect(page.locator("#quiz-mistakes")).toHaveText("只练错词（累计 1）");
  await expect(page.locator("#quiz-resume")).toContainText("错词练习");
  await page.locator("#quiz-resume").click();
  const resumed = (await attempts(page)).find((record) => record.id === practice.id);
  expect(resumed.questions).toEqual(practice.questions);
  expect(resumed.answers).toHaveLength(1);
  await answer(page, resumed);
  await page.locator("#quiz-next").click();
  await expect(page.locator("#quiz-result-accuracy")).toHaveText("100%");
  await page.locator("#quiz-menu").click();
  await expect(page.locator("#quiz-mistakes")).toHaveText("只练错词（累计 0）");
  await expect(page.locator("#quiz-mistakes")).toBeDisabled();
  const stored = await attempts(page);
  expect(stored.find((record) => record.id === original.id)).toEqual(original);
  expect(stored.find((record) => record.id === practice.id).completedAt).toBeTruthy();
  expect(await reviews(page)).toEqual(reviewsBefore);
});

test("cumulative mistakes clear after saved corrections and reappear after a later wrong answer", async ({ page }) => {
  const original = await seedHistory(page);
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-mistakes").click();
  await expect(page.locator("#quiz-unresolved-list > li")).toHaveCount(2);
  await page.locator("#quiz-practice-unresolved").click();
  const firstPractice = (await attempts(page))[0];
  expect(firstPractice.kind).toBe("mistakes");
  expect(firstPractice.practiceSourceAttemptId).toBeUndefined();
  const corrected = await answer(page, firstPractice);
  await page.locator("#quiz-next").click();
  await answer(page, firstPractice, { wrong: true });
  await page.locator("#quiz-next").click();
  await page.locator("#quiz-menu").click();
  await expect(page.locator("#quiz-mistakes")).toHaveText("只练错词（累计 1）");
  await page.locator("#quiz-mistakes").click();
  await expect(page.locator("#quiz-unresolved-list > li")).toHaveCount(1);
  await expect(page.locator("#quiz-unresolved-list")).not.toContainText(corrected.term);
  await page.locator("#quiz-practice-unresolved").click();
  const single = (await attempts(page))[0];
  expect(single.questions).toHaveLength(1);
  expect(single.questions[0].options).toHaveLength(4);
  await answer(page, single);
  await page.locator("#quiz-next").click();
  await page.locator("#quiz-restart").click();
  const reopened = (await attempts(page))[0];
  expect(reopened.questions).toHaveLength(1);
  await answer(page, reopened, { wrong: true });
  await page.locator("#quiz-next").click();
  await page.locator("#quiz-menu").click();
  await expect(page.locator("#quiz-mistakes")).toHaveText("只练错词（累计 1）");
  expect((await attempts(page)).find((record) => record.id === original.id)).toEqual(original);
});

test("a wrong-word link closes the quiz before opening ordinary entry detail", async ({ page }) => {
  const original = await seedHistory(page);
  const reviewsBefore = await reviews(page);
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-mistakes").click();
  const word = original.questions[0];
  await page.locator(`.quiz-wrong-open[data-entry-id="${word.entryId}"]`).click();
  await expect(page.locator("#chapter-quiz-dialog")).toBeHidden();
  await expect(page.locator("#entry-dialog")).toBeVisible();
  await expect(page.locator("#entry-dialog #dialog-term")).toHaveText(word.term);
  expect(await page.evaluate(() => document.querySelectorAll("dialog:modal").length)).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#chapter-quiz-button")).toBeFocused();
  expect(await reviews(page)).toEqual(reviewsBefore);
  expect((await attempts(page))[0]).toEqual(original);
});

test("deleted historical entries remain visible without creating empty practice attempts", async ({ page }) => {
  const original = await seedHistory(page, { ghost: true });
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-mistakes").click();
  await expect(page.locator("#quiz-unresolved-list")).toContainText("retired vocabulary");
  await expect(page.locator("#quiz-unresolved-list")).toContainText("词条已不在本章");
  await expect(page.locator(".quiz-wrong-open")).toBeDisabled();
  await expect(page.locator("#quiz-practice-unresolved")).toHaveText("开始错词练习（0）");
  await expect(page.locator("#quiz-practice-unresolved")).toBeDisabled();
  expect(await attempts(page)).toEqual([original]);
});
