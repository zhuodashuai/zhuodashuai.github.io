import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const bookId = "never-let-me-go";
const canonicalSnapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
async function reviewStates(page) {
  return page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
}
async function attempts(page, chapterId) {
  return page.evaluate(async scope => (await import("/js/quiz-storage.js")).quizStorage.listAttempts(scope), { bookId, chapterId });
}

test.beforeEach(async ({ context, page }, testInfo) => {
  const value = `reading-${testInfo.workerIndex}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", error => { throw new Error(`Unhandled chapter reading error: ${error.message}`); });
});

for (const [chapter, count] of [[8, 25], [9, 24], [10, 26], [11, 28], [12, 25]]) {
  test(`Chapter ${chapter}: every selected card opens with its own source, original form and bilingual example`, async ({ page }) => {
    test.setTimeout(120_000);
    const source = JSON.parse(await readFile(new URL(`../../../vocab/data/reading-lists/never-let-me-go/chapter-${chapter}.json`, import.meta.url), "utf8"));
    await page.goto(`/?book=${bookId}&chapter=chapter-${chapter}`);
    await expect(page.getByRole("heading", { name: `Never Let Me Go · Chapter ${chapter}`, exact: true })).toBeVisible();
    await expect(page.locator("#entry-count")).toHaveText(String(count));
    await expect(page.locator("#entry-grid .word-card h3")).toHaveText(source.items.map(item => item.term));
    for (const item of source.items) {
      const card = page.locator(".word-card").filter({ has: page.getByRole("heading", { name: item.term, exact: true }) });
      // These chapter selections deliberately teach one contextual sense per
      // card. Check its actual Chinese points, not just a non-empty container.
      expect(item.meaning.match(/[①-⑳]/gu)).toEqual(["①"]);
      const meaningPoints = item.meaning.replace(/^①\s*/u, "").split(/[；\n]+/u)
        .map(point => point.trim().replace(/。$/u, "")).filter(Boolean);
      const learningPoints = [...meaningPoints, item.usage];
      await expect(card.locator(".card-meaning li")).toHaveText(learningPoints);
      await expect(card.getByRole("button", { name: `朗读 ${item.term}`, exact: true })).toBeVisible();
      await expect(card.locator("button[data-audio-text]")).toHaveAttribute("data-audio-text", item.term);
      await card.getByRole("button", { name: `查看 ${item.term} 的完整词条`, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("#dialog-term")).toHaveText(item.term);
      await expect(dialog.locator("#dialog-speak")).toHaveAccessibleName(`朗读 ${item.term}`);
      await expect(dialog.locator("#dialog-speak")).toBeVisible();
      await expect(dialog.locator("#dialog-phonetic")).toHaveText(`${item.phonetic} · ${item.partOfSpeech}`);
      await expect(dialog.locator("#dialog-meaning li")).toHaveText(learningPoints);
      if (item.originalInput !== item.term) await expect(dialog.locator(".detail-original-form p")).toHaveText(item.originalInput);
      await expect(dialog.locator("#dialog-source-status")).toContainText(`Never Let Me Go — Chapter ${chapter}`);
      await expect(dialog.locator("#dialog-source-status")).toContainText("p. " + item.page);
      await expect(dialog.locator("#dialog-source-status")).toContainText(source.attributionNote);
      await expect(dialog.locator("#dialog-source-status")).toContainText(/例句为.*自拟句.*(?:不是|而非)小说原文/u);
      await expect(dialog.locator("#dialog-definition")).toHaveText(item.definitionEn);
      await expect(dialog.locator("#dialog-example-en")).toHaveText(item.exampleEn);
      await expect(dialog.locator("#dialog-example-zh")).toHaveText(item.exampleZh);
      await dialog.getByRole("button", { name: "关闭词条详情" }).click();
    }
    await page.locator("#library-search").fill(source.items[0].originalInput);
    await expect(page.locator("#entry-grid .word-card")).toHaveCount(1);
    await page.locator("#library-search").fill("");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#study-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#dialog-term")).toHaveText(source.items[0].term);
    await dialog.getByRole("button", { name: "很熟" }).click();
    await expect(dialog.locator("#dialog-term")).toHaveText(source.items[1].term);
    const reviews = await reviewStates(page);
    expect(reviews).toHaveLength(1);
    const firstCard = canonicalSnapshot.entries.find(entry => entry.term === source.items[0].term
      && entry.tags.includes(`collection:${bookId}:chapter-${chapter}`));
    expect(firstCard).toBeDefined();
    expect(reviews[0].entryId).toBe(firstCard.id);
    expect(reviews[0]).toMatchObject({ reviewCount: 1, lastRating: "easy" });
    await dialog.getByRole("button", { name: "关闭词条详情" }).click();
    await page.reload();
    await expect(page.locator("#due-count")).toHaveText(String(count - 1));
    await expect(page.locator("#entry-count")).toHaveText(String(count));
    expect(await reviewStates(page)).toEqual(reviews);
    await page.locator('#chapter-tabs button[data-value="chapter-7"]').click();
    await expect(page.locator("#due-count")).toHaveText("30");
    expect(await reviewStates(page)).toEqual(reviews);
  });

  test(`Chapter ${chapter}: quiz covers all ${count} words, saves one answer and resumes without changing study progress`, async ({ page }) => {
    const chapterId = `chapter-${chapter}`;
    await page.goto(`/?book=${bookId}&chapter=${chapterId}`);
    await expect(page.locator("#chapter-quiz-button")).toBeVisible();
    const before = await reviewStates(page);
    await page.locator("#chapter-quiz-button").click();
    await page.locator("#quiz-start").click();
    await expect(page.locator("#quiz-options > button")).toHaveCount(4);
    const initial = (await attempts(page, chapterId))[0];
    expect(initial.questions).toHaveLength(count);
    expect(new Set(initial.questions.map(question => question.entryId)).size).toBe(count);
    expect(initial.omitted).toEqual([]);
    for (const question of initial.questions) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options.map(option => option.meaning)).size).toBe(4);
      expect(question.options.every(option => /\p{Script=Han}/u.test(option.meaning))).toBe(true);
    }
    const first = initial.questions[0];
    await expect(page.locator("#quiz-term")).toHaveText(first.term);
    await page.locator(`#quiz-options > button[data-option-id="${first.correctOptionId}"]`).click();
    await expect(page.locator("#quiz-next")).toBeEnabled();
    expect((await attempts(page, chapterId))[0].answers).toHaveLength(1);
    await page.locator("#quiz-close").click();
    await page.reload();
    await page.locator("#chapter-quiz-button").click();
    await page.locator("#quiz-resume").click();
    await expect(page.locator("#quiz-term")).toHaveText(initial.questions[1].term);
    const resumed = (await attempts(page, chapterId))[0];
    expect(resumed.id).toBe(initial.id);
    expect(resumed.questions).toEqual(initial.questions);
    expect(resumed.answers[0].correct).toBe(true);
    expect(await reviewStates(page)).toEqual(before);
    await expect(page.locator("#due-count")).toHaveText(String(count));
  });
}
