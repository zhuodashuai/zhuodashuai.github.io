import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildCollectionCatalog } from "../../../vocab/js/collections.js";

const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const availableChapters = buildCollectionCatalog(snapshot.entries).find(book => book.id === "never-let-me-go").chapters;
const lastChapter = availableChapters.at(-1);
const precedingChapter = availableChapters.at(-2);

test.beforeEach(async ({ context, page }, info) => {
  const run = `study-${info.workerIndex}-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 70);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw error; });
});

async function chapter(page, number = 10) {
  await page.goto(`/?book=never-let-me-go&chapter=chapter-${number}`);
  await expect(page.locator("#entry-count")).not.toHaveText("0");
}

test("study hides the answer until recall, resets for the next card, and ordinary browsing stays readable", async ({ page }) => {
  await chapter(page);
  await page.locator("#study-button").click();
  const first = await page.locator("#dialog-term").innerText();
  await expect(page.locator("#dialog-meaning")).toBeHidden();
  await expect(page.locator("#dialog-definition-section")).toBeHidden();
  await expect(page.locator("#dialog-example-section")).toBeHidden();
  await expect(page.locator("#dialog-copy")).toBeHidden();
  await expect(page.locator('#dialog-review-actions button[data-rating="good"]')).toBeDisabled();
  await page.getByRole("button", { name: "显示释义", exact: true }).click();
  await expect(page.locator("#dialog-meaning")).toBeVisible();
  await page.getByRole("button", { name: "记得", exact: true }).click();
  await expect(page.locator("#dialog-term")).not.toHaveText(first);
  await expect(page.locator("#recall-reveal")).toBeVisible();
  await expect(page.locator("#dialog-meaning")).toBeHidden();
  await expect(page.locator('#dialog-review-actions button[data-rating="good"]')).toBeDisabled();
  const reviews = await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
  expect(reviews).toHaveLength(1);
  expect(reviews[0].reviewCount).toBe(1);
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await page.locator("#entry-grid .card-open").first().click();
  await expect(page.locator("#dialog-meaning")).toBeVisible();
  await expect(page.locator("#recall-controls")).toBeHidden();
});

test("a review becomes due while the page stays open offline and the vocabulary revision stays unchanged", async ({ page, context }) => {
  await page.clock.install({ time: new Date("2026-10-15T12:00:00Z") });
  await chapter(page);
  await page.evaluate(async () => {
    const { listReviewStates, putReviewState } = await import("/js/owner-storage.js");
    const { applyReviewRating } = await import("/js/study.js");
    const { filterEntriesByCollection } = await import("/js/collections.js");
    const { parsePublicSnapshot } = await import("/js/wordbook-schema.js");
    const snapshot = parsePublicSnapshot(await (await fetch("/data/owner-wordbook.json")).json());
    const entries = filterEntriesByCollection(snapshot.entries, "never-let-me-go", "chapter-10");
    for (let i = 0; i < entries.length; i++) await putReviewState(applyReviewRating(entries[i].id, null, i === 0 ? "again" : "good", new Date()));
    if ((await listReviewStates()).length !== entries.length) throw new Error("Missing test review states");
  });
  await page.reload();
  await expect(page.locator("#due-count")).toHaveText("0");
  await expect(page.locator("#study-button")).toBeDisabled();
  await context.setOffline(true);
  await page.clock.fastForward(10 * 60 * 1000 + 1000);
  await expect(page.locator("#due-count")).toHaveText("1");
  await expect(page.locator("#study-button")).toBeEnabled();
  await expect(page.locator("#study-summary")).toContainText("待复习 1");
});

test("an unresponsive local database cannot block online cards or subsequent content refresh", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.addInitScript(() => { indexedDB.open = () => ({}); });
  try {
    await chapter(page);
    await expect(page.locator("#entry-grid .word-card")).toHaveCount(26);
    let requests = 0;
    page.on("request", (request) => { if (request.url().includes("/api/v1/public/wordbook")) requests++; });
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => requests).toBe(1);
    await expect(page.locator("#entry-grid")).toHaveAttribute("aria-busy", "false");
  } finally { await context.close(); }
});

test("warm local cache displays even while the live refresh is still hanging", async ({ browser }) => {
  // This case isolates IndexedDB startup from the independent SW cache. Page
  // routes do not intercept requests issued by a controlling service worker.
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await chapter(page);
  await expect.poll(() => page.evaluate(async () => Boolean((await (await import("/js/owner-storage.js")).getPublicCache())?.snapshot))).toBe(true);
  let release;
  let pendingRequests = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/v1/public/wordbook*", async (route) => { pendingRequests++; await pending; await route.continue().catch(() => {}); });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#entry-count")).toHaveText("26", { timeout: 2500 });
    await expect.poll(() => pendingRequests).toBe(1);
    await expect(page.locator("#data-status")).toContainText("本机词库");
    await expect(page.locator("#entry-grid .word-card")).toHaveCount(26);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await context.close();
  }
});

test("scope-aware search finds another chapter without falsely calling the word unpublished", async ({ page }) => {
  await chapter(page);
  await page.locator("#library-search").fill("innocuous");
  await expect(page.locator("#search-empty-title")).toContainText("本章未找到");
  await expect(page.locator("#search-empty-message")).toContainText("其他章节");
  await page.getByRole("button", { name: "搜索全书", exact: true }).click();
  await expect(page.locator("#entry-grid .word-card h3")).toHaveText(["innocuous"]);
  await expect(page.locator("#search-empty")).toBeHidden();
});

test("single-sense details show the example only once without removing source and word forms", async ({ page }) => {
  await chapter(page, 12);
  await page.getByRole("button", { name: "查看 awestruck 的完整词条", exact: true }).click();
  await expect(page.locator("#entry-dialog").getByText("We were awestruck by the scale of the ancient building.", { exact: true })).toHaveCount(1);
  await expect(page.locator("#dialog-source-status")).toContainText("p. 143");
  await expect(page.locator("#dialog-phonetic")).toContainText("adjective");
});

for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 500, height: 650 }]) {
  test(`mobile chapter navigation reveals cards in the first screen at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await chapter(page, lastChapter.number);
    await expect(page.locator("#book-select")).toHaveValue("never-let-me-go");
    await expect(page.locator("#chapter-select")).toHaveValue(lastChapter.id);
    await expect(page.locator("#chapter-next")).toBeDisabled();
    const layout = await page.evaluate(() => ({ firstCardTop: document.querySelector(".word-card").getBoundingClientRect().top,
      width: innerWidth, contentWidth: document.documentElement.scrollWidth, scrollY }));
    expect(layout.scrollY).toBe(0);
    expect(layout.contentWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.firstCardTop).toBeLessThan(viewport.height - 70);
    if (viewport.width === 390) await page.screenshot({ path: "qa-artifacts/study-upgrade-mobile.png" });
    await page.getByRole("button", { name: "上一章", exact: true }).click();
    await expect(page.locator("#chapter-select")).toHaveValue(precedingChapter.id);
    await expect(page.locator("#entry-count")).toHaveText(String(precedingChapter.count));
    await page.locator("#chapter-select").selectOption("chapter-1");
    await expect(page.locator("#entry-count")).toHaveText("29");
    await expect(page.locator("#chapter-previous")).toBeDisabled();
    await page.locator("#library-options > summary").click();
    await expect(page.locator("#filter-row")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
