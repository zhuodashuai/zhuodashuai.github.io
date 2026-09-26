import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../../../vocab/data/reading-lists/never-let-me-go/chapter-5.json", import.meta.url), "utf8"));

test("Chapter 5 shows all 159 approved rows in reading order and their own source contexts", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-5");
  await expect(page.getByRole("heading", { name: "Never Let Me Go · Chapter 5", exact: true })).toBeVisible();
  await expect(page.locator("#entry-count")).toHaveText("159");
  await expect(page.locator("#entry-grid .word-card h3")).toHaveText(source.items.map(item => item.term));
  await expect(page.locator('#chapter-tabs button[data-value^="chapter-"] small')).toHaveText(["29", "38", "28", "51", "159"]);
  for (const term of ["loom", "confer furtively", "allude", "kidnap / abduction", "explicitly / imply", "eaves", "tuck oneself in", "hang in the air"]) {
    const item = source.items.find(item => item.term === term);
    await page.locator("#library-search").fill(item.originalInput);
    const card = page.locator(".word-card").filter({ has: page.getByRole("heading", { name: term, exact: true }) });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: `查看 ${term} 的完整词条` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#dialog-term")).toHaveText(term);
    await expect(dialog.locator("#dialog-source-status")).toContainText("Never Let Me Go — Chapter 5");
    await expect(dialog.locator("#dialog-source-status")).toContainText(`p. ${item.page}`);
    await expect(dialog.locator("#dialog-source-status")).toContainText("例句为学习用自拟句，不是小说原文");
    await expect(dialog.locator("#dialog-meaning li").first()).not.toBeEmpty();
    await dialog.getByRole("button", { name: "关闭词条详情" }).click();
  }
});

test("Chapter 5 review persists on mobile without changing the previous chapters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?book=never-let-me-go&chapter=chapter-5");
  await expect(page.locator("#due-count")).toHaveText("159");
  await page.locator("#study-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#dialog-term")).toHaveText("carry on");
  await expect(dialog.locator("#dialog-review-status")).toContainText("本轮 1/159");
  await dialog.getByRole("button", { name: "很熟" }).click();
  await expect(dialog.locator("#dialog-term")).toHaveText("a matter of");
  await dialog.getByRole("button", { name: "关闭词条详情" }).click();
  await page.reload();
  await expect(page.locator("#due-count")).toHaveText("158");
  for (const [chapter, count] of [[1,29],[2,38],[3,28],[4,51]]) {
    await page.locator(`#chapter-tabs button[data-value="chapter-${chapter}"]`).click();
    await expect(page.locator("#entry-count")).toHaveText(String(count));
    await expect(page.locator("#due-count")).toHaveText(String(count));
  }
});
