import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const bookId = "the-forsyte-saga", chapterId = "chapter-1";
const source = JSON.parse(await readFile(new URL("../../../vocab/data/reading-lists/the-forsyte-saga/chapter-1.json", import.meta.url), "utf8"));
const expectedCount = source.expectedItemCount;
const priorityTerms = ["patriarchal", "sappy", "plume of"];
test.use({ serviceWorkers: "block" });

for (const width of [390, 1440]) {
  test(`Forsyte reviewed chapter, priority hard words, original passages and existing-book meanings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/?book=${bookId}&chapter=${chapterId}`);
    await expect(page.locator("#entry-count")).toHaveText(String(expectedCount));
    await expect(page.locator("#entry-grid .word-card")).toHaveCount(expectedCount);
    await expect(page.locator("#entry-grid .word-card h3").filter({ hasText: /^at home$/iu })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const term of priorityTerms) {
      const item = source.items.find(item => item.term === term);
      expect(item, `${term}: reviewed source must include the learner's missing hard word`).toBeTruthy();
      await page.locator("#library-search").fill(term);
      await page.getByRole("button", { name: `查看 ${term} 的完整词条`, exact: true }).click();
      await expect(page.locator("#dialog-meaning")).toContainText(item.meaning.replace(/^①\s*/u, "").split(/[②；。\n]/u)[0]);
      await expect(page.locator("#dialog-meaning")).toContainText(item.usage);
      await expect(page.locator("#dialog-definition")).toHaveText(item.definitionEn);
      await expect(page.locator("#dialog-example-en")).toHaveText(item.exampleEn);
      await expect(page.locator("#dialog-example-zh")).toHaveText(item.exampleZh);
      await expect(page.locator("#dialog-source-examples .book-passage-text").filter({ hasText: item.bookQuoteEn }).first()).toBeVisible();
      await expect(page.locator("#dialog-source-examples .book-passage-source").first()).toHaveText("The Forsyte Saga · John Galsworthy · Chapter 1");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press("Escape");
    }
    await page.locator("#library-search").fill("at home");
    await expect(page.getByRole("button", { name: "查看 at home 的完整词条", exact: true })).toHaveCount(0);
    await page.locator("#library-search").fill("husband");
    await page.getByRole("button", { name: "查看 husband 的完整词条", exact: true }).click();
    await expect(page.locator("#dialog-meaning")).toContainText("节省使用");
    await expect(page.locator("#dialog-example-en")).toContainText("husbanded their strength");
    await expect(page.locator("#dialog-source-examples .book-passage-text")).toContainText("husbanding her aged voice");
    await expect(page.locator("#dialog-source-examples .book-passage-source").first()).toHaveText("The Forsyte Saga · John Galsworthy · Chapter 1");
    await expect(page.locator("#dialog-source-examples")).not.toContainText(/PDF 第|所提供的第一章照片/u);
    await page.keyboard.press("Escape");
    await page.locator("#library-search").fill("indulgent");
    await page.getByRole("button", { name: "查看 indulgent 的完整词条", exact: true }).click();
    await expect(page.locator("#dialog-meaning")).toContainText("宽厚迁就");
    await expect(page.locator("#dialog-source-examples .book-passage-text").filter({ hasText: "Indulgent and severe was her look." })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.goto("/?book=never-let-me-go&chapter=chapter-23");
    await page.locator("#library-search").fill("indulgent");
    await page.getByRole("button", { name: "查看 indulgent 的完整词条", exact: true }).click();
    await expect(page.locator("#dialog-meaning")).toContainText("迁就自己愿望");
    await expect(page.locator("#dialog-source-examples .book-passage-source")).toContainText("Never Let Me Go");
    await expect(page.locator("#dialog-source-examples")).not.toContainText("Indulgent and severe was her look.");
    expect(errors).toEqual([]);
  });
}

test("Forsyte quiz saves wrong words and resumes independently; card review survives a reload", async ({ page }) => {
  await page.goto(`/?book=${bookId}&chapter=${chapterId}`);
  await expect(page.locator("#entry-count")).toHaveText(String(expectedCount));
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-start").click();
  await expect(page.locator("#quiz-options > button")).toHaveCount(4);
  const getAttempts = () => page.evaluate(async ({ bookId, chapterId }) => (
    (await import("/js/quiz-storage.js")).quizStorage.listAttempts({ bookId, chapterId })
  ), { bookId, chapterId });
  const started = (await getAttempts())[0];
  expect(started.questions).toHaveLength(expectedCount);
  expect(new Set(started.questions.map(question => question.entryId))).toEqual(new Set(source.items.map(item => item.reuseExistingEntryId)));
  const first = started.questions[0], wrong = first.options.find(option => option.id !== first.correctOptionId);
  await page.locator(`#quiz-options > button[data-option-id="${wrong.id}"]`).click();
  await expect.poll(async () => (await getAttempts())[0].answers.length).toBe(1);
  expect((await getAttempts())[0].answers[0].correct).toBe(false);
  await page.locator("#quiz-close").click();
  await page.reload();
  await page.locator("#chapter-quiz-button").click();
  await page.locator("#quiz-resume").click();
  expect((await getAttempts())[0].id).toBe(started.id);
  expect((await getAttempts())[0].answers).toHaveLength(1);
  await page.locator("#quiz-close").click();
  await page.locator("#library-search").fill("husband");
  await page.getByRole("button", { name: "查看 husband 的完整词条", exact: true }).click();
  await expect(page.locator('#dialog-review-actions [data-rating="good"]')).toBeEnabled();
  await page.locator('#dialog-review-actions [data-rating="good"]').click();
  const reviews = () => page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
  await expect.poll(async () => (await reviews()).length).toBe(1);
  const saved = await reviews();
  await page.keyboard.press("Escape");
  await page.reload();
  expect(await reviews()).toEqual(saved);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await expect(page.locator("#entry-count")).toHaveText("29");
  await page.locator("#chapter-quiz-button").click();
  await expect(page.locator("#quiz-resume")).toBeHidden();
});
