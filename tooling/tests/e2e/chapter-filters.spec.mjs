import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`chapter filters omit empty categories and reset incompatible selections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?book=never-let-me-go&chapter=chapter-1");
    await expect(page.locator("#entry-count")).toHaveText("29");
    if (width === 390) await page.locator("#library-options > summary").click();
    const filters = page.locator("#filter-row");
    for (const type of ["all", "word", "phrase", "phrasal-verb", "idiom", "collocation"]) {
      await expect(filters.locator(`[data-filter="${type}"]`)).toBeVisible();
    }
    for (const type of ["sentence", "quote", "proverb"]) {
      await expect(filters.locator(`[data-filter="${type}"]`)).toBeHidden();
    }
    await filters.locator('[data-filter="phrase"]').click();
    await expect(filters.locator('[data-filter="phrase"]')).toHaveAttribute("aria-pressed", "true");
    if (width === 390) await page.locator("#chapter-select").selectOption("chapter-12");
    else await page.locator('#chapter-tabs [data-value="chapter-12"]').click();
    await expect(page.locator("#entry-count")).toHaveText("25");
    await expect(filters.locator('[data-filter="all"]')).toHaveAttribute("aria-pressed", "true");
    await expect(filters.locator('[data-filter="phrase"]')).toBeHidden();
    await expect(page.locator("#entry-grid .word-card")).toHaveCount(25);
    await expect(page.locator("#empty-message")).toBeHidden();
  });
}

test("searching does not erase available type controls or clear the selected filter", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-12");
  await expect(page.locator("#entry-count")).toHaveText("25");
  const word = page.locator('#filter-row [data-filter="word"]');
  await word.click();
  await page.locator("#library-search").fill("there-is-no-such-word-in-this-chapter");
  await expect(page.locator("#search-empty")).toBeVisible();
  await expect(word).toBeVisible();
  await expect(word).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#filter-row [data-filter="idiom"]')).toBeVisible();
  await page.locator("#library-search").fill("");
  await expect(page.locator("#entry-grid .word-card").first()).toBeVisible();
  await expect(word).toHaveAttribute("aria-pressed", "true");
});
