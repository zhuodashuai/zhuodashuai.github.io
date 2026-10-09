import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const [chapter, count] of [[6,24], [7,30]]) {
  test(`Chapter ${chapter}: all entries open with bilingual examples and chapter-specific sources`, async ({ page }) => {
    test.setTimeout(90_000);
    const source = JSON.parse(await readFile(new URL(`../../../vocab/data/reading-lists/never-let-me-go/chapter-${chapter}.json`, import.meta.url), "utf8"));
    await page.goto(`/?book=never-let-me-go&chapter=chapter-${chapter}`);
    await expect(page.locator("#entry-count")).toHaveText(String(count));
    await expect(page.locator("#entry-grid .word-card h3")).toHaveText(source.items.map(i => i.term));
    for (const item of source.items) {
      const card = page.locator(".word-card").filter({ has: page.getByRole("heading", { name: item.term, exact: true }) });
      await expect(card.locator(".card-meaning li").first()).not.toBeEmpty();
      await card.getByRole("button", { name: `查看 ${item.term} 的完整词条`, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("#dialog-term")).toHaveText(item.term);
      await expect(dialog.locator("#dialog-source-status")).toContainText(`Never Let Me Go — Chapter ${chapter}`);
      await expect(dialog.locator("#dialog-source-status")).toContainText("p. " + item.page);
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
    await dialog.getByRole("button", { name: "关闭词条详情" }).click();
    await page.reload();
    await expect(page.locator("#due-count")).toHaveText(String(count - 1));
    await expect(page.locator("#entry-count")).toHaveText(String(count));
  });
}

