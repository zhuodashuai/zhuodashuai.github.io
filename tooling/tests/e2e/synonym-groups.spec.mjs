import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `pause-${info.testId}`.replace(/[^a-z0-9-]/giu, "-").slice(0, 80), url: "http://127.0.0.1:4187" }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});
async function noRelations(page) {
  await expect(page.locator('#view-controls [data-view="synonyms"]')).toBeHidden();
  await expect(page.locator("#synonym-panel")).toBeHidden();
  await expect(page.locator(".synonym-group")).toHaveCount(0);
  await expect(page.locator(".card-synonyms:visible")).toHaveCount(0);
}
async function reviews(page) {
  return page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
}
function advance(current, revision) {
  current.exportedAt = new Date(Date.parse(snapshot.exportedAt) + revision * 60_000).toISOString();
  current.revisionId = `paused-synonym-refresh-${revision}`;
}
test("legacy synonym URL becomes normal unique chapter cards and retains scope after reload", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-3&view=synonyms");
  await expect(page.locator("#entry-count")).toHaveText("28");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(28);
  await noRelations(page);
  expect(new URL(page.url()).searchParams.get("view")).not.toBe("synonyms");
  await page.reload();
  await expect(page.locator("#library-heading")).toContainText("Chapter 3");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(28);
  expect(await reviews(page)).toEqual([]);
});
test("real pavilion false matches stay in archived data but never appear as synonyms", async ({ page }) => {
  const source = snapshot.entries.find(entry => entry.term === "pavilion");
  expect(source.synonymScan.matches).toHaveLength(6);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=synonyms");
  await expect(page.locator("#entry-count")).toHaveText("29");
  await expect(page.locator("#entry-grid h3").filter({ hasText: /^pavilion$/u })).toHaveCount(1);
  await noRelations(page);
  await page.getByRole("button", { name: "查看 pavilion 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-term")).toHaveText("pavilion");
  await expect(page.locator("#dialog-synonym-section")).toBeHidden();
  await expect(page.locator(".detail-synonyms")).toHaveCount(0);
  await expect(page.locator("#entry-dialog")).not.toContainText(/自动识别的近义关系|同义词待识别|pavilion \/ aerial/u);
  const copied = await page.evaluate(async value => (await import("/js/entry-detail.js")).entryTextForCopy(value), source);
  expect(copied).not.toContain("同义词：");
  expect(await reviews(page)).toEqual([]);
});
test("even reviewed legacy groups are hidden while the whole feature is paused", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-2");
  await page.locator("#library-search").fill("mystified");
  await page.getByRole("button", { name: "查看 mystified 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-synonym-section")).toBeHidden();
  await expect(page.locator("#dialog-meaning")).not.toBeEmpty();
  await expect(page.locator("#dialog-example-en")).not.toBeEmpty();
});
test("phone navigation shows one card per word with no paused group panel or overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?book=never-let-me-go&chapter=chapter-3&view=synonyms");
  await page.locator("#chapter-select").selectOption("chapter-4");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(51);
  await noRelations(page);
  const ids = await page.locator("#entry-grid .card-open").evaluateAll(nodes => nodes.map(node => node.dataset.entryId));
  expect(new Set(ids).size).toBe(ids.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#library-search").fill("bewildered");
  await page.getByRole("button", { name: "查看 bewildered 的完整词条", exact: true }).click();
  expect(await page.locator("#entry-dialog").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});
test("normal keyboard opening and closing restores the unique word opener", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-3&view=synonyms");
  const open = page.getByRole("button", { name: "查看 have somebody on 的完整词条", exact: true });
  await open.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#dialog-term")).toHaveText("have somebody on");
  await page.keyboard.press("Escape"); await expect(open).toBeFocused();
  expect(await reviews(page)).toEqual([]);
});
test("review after an old group URL still records the correct canonical word ID", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-3&view=synonyms");
  await page.getByRole("button", { name: "查看 have somebody on 的完整词条", exact: true }).click();
  await page.locator('#dialog-review-actions [data-rating="good"]').click();
  await expect(page.locator("#dialog-review-status")).toContainText("已记录");
  const states = await reviews(page);
  expect(states).toHaveLength(1);
  expect(states[0].entryId).toBe(snapshot.entries.find(entry => entry.term === "have somebody on").id);
  await page.keyboard.press("Escape"); await expect(page.locator("#entry-grid .word-card")).toHaveCount(28);
});
test("word search and type filtering do not search synthetic relation headings", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=synonyms");
  await page.locator("#library-search").fill("pavilion");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(1);
  await page.locator('#filter-row [data-filter="idiom"]').click();
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(0);
  await page.locator('#filter-row [data-filter="all"]').click();
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(1);
  await noRelations(page);
});
test("remote refresh replaces the card opener and returns focus without ghost groups", async ({ page }) => {
  const current = structuredClone(snapshot);
  const serve = route => route.fulfill({ json: current });
  await page.route("**/api/v1/public/wordbook*", serve); await page.route("**/data/owner-wordbook.json*", serve);
  await page.goto("/?book=never-let-me-go&chapter=chapter-3&view=synonyms");
  const origin = page.getByRole("button", { name: "查看 have somebody on 的完整词条", exact: true });
  const oldNode = await origin.elementHandle(); await origin.click(); advance(current, 1);
  const response = page.waitForResponse(reply => reply.url().includes("/api/v1/public/wordbook") && reply.status() === 200);
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); await response;
  await expect.poll(() => oldNode.evaluate(node => node.isConnected)).toBe(false);
  await expect(page.locator("#dialog-term")).toHaveText("have somebody on");
  await expect(page.locator("#dialog-synonym-section")).toBeHidden();
  await page.keyboard.press("Escape"); await expect(origin).toBeFocused();
});
test("remote meaning edits and deletion update the open card without writing learning records", async ({ page }) => {
  const current = structuredClone(snapshot), serve = route => route.fulfill({ json: current });
  await page.route("**/api/v1/public/wordbook*", serve); await page.route("**/data/owner-wordbook.json*", serve);
  await page.clock.install();
  await page.goto("/?book=never-let-me-go&chapter=chapter-2");
  await page.locator("#library-search").fill("mystified");
  await page.getByRole("button", { name: "查看 mystified 的完整词条", exact: true }).click();
  advance(current, 1); const changed = current.entries.find(entry => entry.term === "mystified");
  changed.meaning = "刷新后的测试义项。"; changed.readingContexts = [];
  await page.clock.fastForward(3500);
  let response = page.waitForResponse(reply => reply.url().includes("/api/v1/public/wordbook") && reply.status() === 200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await response;
  await expect(page.locator("#dialog-meaning")).toContainText("刷新后的测试义项");
  advance(current, 2); current.entries = current.entries.filter(entry => entry.id !== changed.id);
  await page.clock.fastForward(3500);
  response = page.waitForResponse(reply => reply.url().includes("/api/v1/public/wordbook") && reply.status() === 200);
  await page.evaluate(() => window.dispatchEvent(new Event("online"))); await response;
  await expect(page.locator("#entry-dialog")).toBeHidden(); expect(await reviews(page)).toEqual([]);
});
