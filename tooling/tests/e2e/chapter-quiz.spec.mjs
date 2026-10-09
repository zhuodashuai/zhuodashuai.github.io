import { expect, test } from "@playwright/test";

const BOOK = "never-let-me-go";
const CHAPTER = "chapter-6";
const CHAPTER_SIZE = 24;

test.beforeEach(async ({ context, page }, testInfo) => {
  const run = `quiz-${testInfo.workerIndex}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled chapter quiz error: ${error.message}`); });
});

async function openChapter(page, chapter = CHAPTER) {
  await page.goto(`/?book=${BOOK}&chapter=${chapter}`);
  await expect(page.locator("#chapter-quiz-button")).toBeVisible();
  await expect(page.locator("#chapter-quiz-button")).toBeEnabled();
}

async function attempts(page, chapter = CHAPTER) {
  return page.evaluate(async ({ bookId, chapterId }) => {
    const { quizStorage } = await import("/js/quiz-storage.js");
    return quizStorage.listAttempts({ bookId, chapterId });
  }, { bookId: BOOK, chapterId: chapter });
}

async function reviewStates(page) {
  return page.evaluate(async () => {
    const { listReviewStates } = await import("/js/owner-storage.js");
    return listReviewStates();
  });
}

async function startQuiz(page) {
  await page.locator("#chapter-quiz-button").click();
  await expect(page.locator("#chapter-quiz-dialog")).toBeVisible();
  await page.locator("#quiz-start").click();
  await expect(page.locator("#quiz-options > button")).toHaveCount(4);
  return (await attempts(page))[0];
}

async function answerCurrent(page, attempt, { wrong = false } = {}) {
  const term = await page.locator("#quiz-term").innerText();
  const question = attempt.questions.find((candidate) => candidate.term === term);
  expect(question, `The displayed term ${term} must belong to the frozen attempt`).toBeTruthy();
  const option = question.options.find((candidate) => wrong ? candidate.id !== question.correctOptionId : candidate.id === question.correctOptionId);
  await page.locator(`#quiz-options > button[data-option-id="${option.id}"]`).click();
  await expect(page.locator("#quiz-next")).toBeVisible();
  await expect(page.locator("#quiz-next")).toBeEnabled();
  return question;
}

test("chapter-only floating quiz uses the whole chapter and retains exact score and wrong words without changing reviews", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.locator("#entry-count")).not.toHaveText("0");
  await expect(page.locator("#chapter-quiz-button")).toBeHidden();
  await openChapter(page);
  await page.locator("#library-search").fill("quandary");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(1);
  const reviewsBefore = await reviewStates(page);
  const attempt = await startQuiz(page);
  expect(attempt.questions).toHaveLength(CHAPTER_SIZE);
  expect(new Set(attempt.questions.map((question) => question.entryId)).size).toBe(CHAPTER_SIZE);
  const wrongTerm = attempt.questions[0].term;
  for (let index = 0; index < attempt.questions.length; index += 1) {
    await expect(page.locator("#quiz-progress")).toHaveText(new RegExp(`^${index + 1}\\s*/\\s*${CHAPTER_SIZE}$`));
    const question = attempt.questions[index];
    await expect(page.locator("#quiz-term")).toHaveText(question.term);
    const options = page.locator("#quiz-options > button");
    await expect(options).toHaveCount(4);
    const labels = await page.locator("#quiz-options > button > span:last-child").allTextContents();
    expect(new Set(labels).size).toBe(4);
    expect(labels.every((label) => /\p{Script=Han}/u.test(label))).toBe(true);
    await answerCurrent(page, attempt, { wrong: index === 0 });
    for (const option of await options.all()) await expect(option).toBeDisabled();
    const stored = (await attempts(page))[0];
    expect(stored.answers).toHaveLength(index + 1);
    expect(stored.answers[index].correct).toBe(index !== 0);
    await page.locator("#quiz-next").click();
  }
  await expect(page.locator("#quiz-result-accuracy")).toContainText("95.8%");
  await expect(page.locator("#quiz-wrong-list")).toContainText(wrongTerm);
  const completed = (await attempts(page))[0];
  expect(completed.completedAt).toBeTruthy();
  expect(completed.answers.filter((answer) => !answer.correct)).toHaveLength(1);
  expect(await reviewStates(page)).toEqual(reviewsBefore);
  await page.locator("#quiz-close").click();
  await page.reload();
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-history").click();
  await expect(page.locator("#quiz-history-list .quiz-history-open")).toHaveCount(1);
  await page.locator("#quiz-history-list .quiz-history-open").click();
  await expect(page.locator("#quiz-result-accuracy")).toContainText("95.8%");
  await expect(page.locator("#quiz-wrong-list")).toContainText(wrongTerm);
  expect(await reviewStates(page)).toEqual(reviewsBefore);
});

test("closing and reloading resumes the same frozen quiz while chapter histories remain independent", async ({ page }) => {
  await openChapter(page);
  const started = await startQuiz(page);
  await answerCurrent(page, started, { wrong: true });
  await page.keyboard.press("Escape");
  await expect(page.locator("#chapter-quiz-dialog")).toBeHidden();
  await expect(page.locator("#chapter-quiz-button")).toBeFocused();
  await page.reload();
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-resume").click();
  const resumed = (await attempts(page))[0];
  expect(resumed.id).toBe(started.id);
  expect(resumed.questions).toEqual(started.questions);
  expect(resumed.answers).toHaveLength(1);
  await expect(page.locator("#quiz-term")).toBeVisible();
  await page.locator("#quiz-close").click();
  await page.locator('#chapter-tabs button[data-value="chapter-7"]').click();
  await page.locator("#chapter-quiz-button").click();
  await expect(page.locator("#quiz-resume")).toBeHidden();
  await page.locator("#quiz-history").click();
  await expect(page.locator("#quiz-history-list .quiz-history-open")).toHaveCount(0);
  expect(await attempts(page, "chapter-7")).toEqual([]);
  expect((await attempts(page))[0].id).toBe(started.id);
});

test("each new attempt shuffles the complete question set and answer positions", async ({ page }) => {
  await openChapter(page);
  const first = await startQuiz(page);
  await page.locator("#quiz-close").click();
  const second = await startQuiz(page);
  expect(second.id).not.toBe(first.id);
  expect(second.questions.map((question) => question.entryId).sort()).toEqual(first.questions.map((question) => question.entryId).sort());
  // Comparing complete question permutations avoids a flaky assertion that a
  // single question or answer must always land at a different random position.
  expect(second.questions.map((question) => question.entryId)).not.toEqual(first.questions.map((question) => question.entryId));
  const correctPosition = (question) => question.options.findIndex((option) => option.id === question.correctOptionId);
  const firstPositions = first.questions.map((question) => [question.entryId, correctPosition(question)]).sort();
  const secondPositions = second.questions.map((question) => [question.entryId, correctPosition(question)]).sort();
  expect(secondPositions).not.toEqual(firstPositions);
  expect(await attempts(page)).toHaveLength(2);
});

test("a compact mobile quiz is keyboard usable and does not overflow or hide the close control", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openChapter(page);
  const button = page.locator("#chapter-quiz-button");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#chapter-quiz-dialog")).toBeVisible();
  await page.locator("#quiz-start").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#quiz-options > button")).toHaveCount(4);
  await page.locator("#quiz-options > button").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#quiz-next")).toBeEnabled();
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector("#chapter-quiz-dialog");
    const close = document.querySelector("#quiz-close").getBoundingClientRect();
    return { documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      dialogWidth: dialog.scrollWidth, dialogClient: dialog.clientWidth,
      closeTop: close.top, closeRight: close.right, closeBottom: close.bottom, height: innerHeight };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.dialogWidth).toBeLessThanOrEqual(geometry.dialogClient + 1);
  expect(geometry.closeTop).toBeGreaterThanOrEqual(0);
  expect(geometry.closeRight).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.closeBottom).toBeLessThanOrEqual(geometry.height);
  await page.keyboard.press("Escape");
  await expect(page.locator("#chapter-quiz-dialog")).toBeHidden();
  await expect(button).toBeFocused();
});

test("the cached PWA starts and saves a chapter quiz offline and resumes it after reload", async ({ page, context }) => {
  await openChapter(page);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#entry-count")).toHaveText(String(CHAPTER_SIZE));
  const started = await startQuiz(page);
  await answerCurrent(page, started);
  const saved = (await attempts(page))[0];
  expect(saved.answers).toHaveLength(1);
  await page.reload();
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-resume").click();
  const restored = (await attempts(page))[0];
  expect(restored).toEqual(saved);
  await expect(page.locator("#quiz-term")).toBeVisible();
  await context.setOffline(false);
});

test("denied quiz storage is reported without disabling ordinary cards or falsely saving an attempt", async ({ page }) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...args) {
      if (String(name).startsWith("wordbook-chapter-quizzes")) throw new DOMException("Quiz storage denied", "SecurityError");
      return open.call(this, name, ...args);
    };
  });
  await openChapter(page);
  await expect(page.locator("#entry-count")).toHaveText(String(CHAPTER_SIZE));
  await page.locator("#chapter-quiz-button").click();
  await expect(page.locator("#chapter-quiz-dialog")).toContainText(/保存|存储|记录/);
  const start = page.locator("#quiz-start");
  if (await start.count() && await start.isEnabled()) await start.click();
  await expect(page.locator("#quiz-options > button")).toHaveCount(0);
  await expect(page.locator("#quiz-result-accuracy")).toHaveCount(0);
  await page.locator("#quiz-close").click();
  await page.getByRole("button", { name: "查看 quandary 的完整词条", exact: true }).click();
  await expect(page.locator("#entry-dialog #dialog-term")).toHaveText("quandary");
});

test("rapid repeated answers are committed only once", async ({ page }) => {
  await openChapter(page);
  const started = await startQuiz(page);
  const question = started.questions[0];
  await page.locator(`#quiz-options > button[data-option-id="${question.correctOptionId}"]`).evaluate((button) => {
    button.click();
    button.click();
    // Even duplicated event delivery must respect the active-save lock.
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(page.locator("#quiz-next")).toBeEnabled();
  const stored = (await attempts(page))[0];
  expect(stored.revision).toBe(1);
  expect(stored.answers).toHaveLength(1);
  expect(stored.answers[0].correct).toBe(true);
  await page.locator("#quiz-next").click();
  await expect(page.locator("#quiz-term")).toHaveText(started.questions[1].term);
});

test("a failed answer save stays unanswered and can be retried without a false score", async ({ page }) => {
  await openChapter(page);
  const started = await startQuiz(page);
  const question = started.questions[0];
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    globalThis.__failQuizWrites = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "attempts" && globalThis.__failQuizWrites) throw new DOMException("Simulated quiz quota", "QuotaExceededError");
      return originalPut.apply(this, args);
    };
  });
  await page.locator(`#quiz-options > button[data-option-id="${question.correctOptionId}"]`).click();
  await expect(page.locator("#quiz-message")).toContainText("没有保存成功");
  await expect(page.locator("#quiz-next")).toHaveCount(0);
  await expect(page.locator("#quiz-feedback")).toHaveCount(0);
  expect((await attempts(page))[0].answers).toHaveLength(0);
  for (const option of await page.locator("#quiz-options > button").all()) await expect(option).toBeEnabled();
  await page.evaluate(() => { globalThis.__failQuizWrites = false; });
  await answerCurrent(page, started);
  expect((await attempts(page))[0].answers).toHaveLength(1);
  await expect(page.locator("#quiz-feedback")).toContainText("已保存");
});

test("a background library rerender does not change the open quiz or shrink its scope", async ({ page }) => {
  await openChapter(page);
  const started = await startQuiz(page);
  const question = started.questions[0];
  await page.locator("#quiz-options > button").first().focus();
  await page.evaluate(() => {
    const search = document.querySelector("#library-search");
    search.value = "quandary";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(1);
  await expect(page.locator("#quiz-term")).toHaveText(question.term);
  await expect(page.locator("#quiz-options > button").first()).toBeFocused();
  expect((await attempts(page))[0].questions).toEqual(started.questions);
  await answerCurrent(page, started);
  await page.locator("#quiz-next").click();
  await expect(page.locator("#quiz-progress")).toHaveText(/^2\s*\/\s*24$/);
});

test("two tabs cannot overwrite one another's answer to the same saved attempt", async ({ page, context }) => {
  await openChapter(page);
  const started = await startQuiz(page);
  const secondTab = await context.newPage();
  await openChapter(secondTab);
  await secondTab.locator("#chapter-quiz-button").click();
  await secondTab.locator("#quiz-resume").click();
  await expect(secondTab.locator("#quiz-term")).toHaveText(started.questions[0].term);
  await answerCurrent(page, started, { wrong: true });
  const committed = (await attempts(page))[0];
  await secondTab.locator(`#quiz-options > button[data-option-id="${started.questions[0].correctOptionId}"]`).click();
  await expect(secondTab.locator("#quiz-message")).toContainText("另一个页面更新");
  await expect(secondTab.locator("#quiz-next")).toHaveCount(0);
  expect((await attempts(secondTab))[0]).toEqual(committed);
  await secondTab.locator("#quiz-menu").click();
  await secondTab.locator("#quiz-resume").click();
  await expect(secondTab.locator("#quiz-term")).toHaveText(started.questions[1].term);
  await expect(secondTab.locator("#quiz-progress")).toHaveText(/^2\s*\/\s*24$/);
  await secondTab.close();
});

for (const delayedView of ["menu", "history"]) {
  test(`a late ${delayedView} read failure from a closed chapter cannot corrupt the newly opened chapter`, async ({ page }) => {
    await openChapter(page);
    if (delayedView === "history") {
      await page.locator("#chapter-quiz-button").click();
      await expect(page.locator("#quiz-history")).toBeVisible();
    }
    await page.evaluate(async () => {
      const { quizStorage } = await import("/js/quiz-storage.js");
      const list = quizStorage.listAttempts.bind(quizStorage);
      let captured = false;
      quizStorage.listAttempts = (scope) => {
        if (scope.chapterId === "chapter-6" && !captured) {
          captured = true;
          return new Promise((_resolve, reject) => {
            globalThis.__releaseOldQuizRead = () => reject(new Error("Delayed previous chapter failure"));
          });
        }
        return list(scope);
      };
    });
    await page.locator(delayedView === "menu" ? "#chapter-quiz-button" : "#quiz-history").click();
    await expect.poll(() => page.evaluate(() => typeof globalThis.__releaseOldQuizRead)).toBe("function");
    await page.locator("#quiz-close").click();
    await page.locator('#chapter-tabs button[data-value="chapter-7"]').click();
    await page.locator("#chapter-quiz-button").click();
    await expect(page.locator("#quiz-scope")).toContainText("Chapter 7");
    await expect(page.locator("#quiz-start")).toBeEnabled();
    await page.evaluate(() => { globalThis.__releaseOldQuizRead(); });
    await expect(page.locator("#quiz-message")).toHaveText("");
    await expect(page.locator("#quiz-scope")).toContainText("Chapter 7");
    await expect(page.locator("#quiz-retry")).toHaveCount(0);
    await page.locator("#quiz-start").click();
    await expect(page.locator("#quiz-progress")).toHaveText(/^1\s*\/\s*30$/);
    expect((await attempts(page, "chapter-7"))[0].questions).toHaveLength(30);
  });
}

test("closing after a failed save and reopening recovers the unanswered quiz without a stale error", async ({ page }) => {
  await openChapter(page);
  const started = await startQuiz(page);
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    globalThis.__failQuizWrites = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "attempts" && globalThis.__failQuizWrites) throw new DOMException("Simulated quota", "QuotaExceededError");
      return originalPut.apply(this, args);
    };
  });
  await page.locator("#quiz-options > button").first().click();
  await expect(page.locator("#quiz-message")).toContainText("没有保存成功");
  await page.locator("#quiz-close").click();
  await page.evaluate(() => { globalThis.__failQuizWrites = false; });
  await page.locator("#chapter-quiz-button").click();
  await expect(page.locator("#quiz-message")).toHaveText("");
  await page.locator("#quiz-resume").click();
  await expect(page.locator("#quiz-term")).toHaveText(started.questions[0].term);
  expect((await attempts(page))[0].answers).toHaveLength(0);
  await answerCurrent(page, started);
  expect((await attempts(page))[0].answers).toHaveLength(1);
  await expect(page.locator("#quiz-feedback")).toContainText("已保存");
});
