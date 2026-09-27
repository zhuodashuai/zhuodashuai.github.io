import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 500, height: 650 }, { width: 1440, height: 900 }]) {
  test(`compact public introduction keeps search in the first screen at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?book=never-let-me-go&chapter=chapter-5");
    await expect(page.locator("#entry-count")).toHaveText("18");
    await expect(page.locator("#page-title")).toHaveText("卓的单词本");
    await expect(page.locator(".public-hero .about-card")).toHaveCount(0);
    const layout = await page.evaluate(() => {
      const hero = document.querySelector(".public-hero").getBoundingClientRect();
      const search = document.querySelector("#library-search").getBoundingClientRect();
      return { heroHeight: hero.height, searchTop: search.top, searchBottom: search.bottom,
        scrollY: window.scrollY, contentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth };
    });
    expect(layout.scrollY).toBe(0);
    expect(layout.heroHeight).toBeLessThanOrEqual(100);
    expect(layout.searchTop).toBeGreaterThan(0);
    expect(layout.searchBottom).toBeLessThan(viewport.height - 16);
    expect(layout.contentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    await expect(page.locator(".top-actions").getByRole("link", { name: "使用手册", exact: true })).toBeVisible();
    await page.locator("#library-search").fill("innocuous");
    await expect(page.locator("#entry-grid .word-card h3")).toHaveText(["innocuous"]);
    await page.getByRole("button", { name: "查看 innocuous 的完整词条", exact: true }).click();
    await expect(page.getByRole("dialog").locator("#dialog-term")).toHaveText("innocuous");
  });
}
