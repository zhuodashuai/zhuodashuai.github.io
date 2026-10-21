import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sortWordbookEntries } from "../../../vocab/js/entry-sort.js";
import { filterEntriesByCollection } from "../../../vocab/js/collections.js";

const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }) => {
  await context.route("**/api/v1/public/wordbook*", route => route.fulfill({ json: snapshot }));
  page.on("pageerror", error => { throw error; });
});
const terms = page => page.locator("#entry-grid .word-card h3");

test("main wordbook defaults to newest added and keeps explicit sort through reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#library-sort")).toHaveValue("newest");
  await expect(terms(page)).toHaveText(sortWordbookEntries(snapshot.entries, "newest").map(entry => entry.term));
  await page.locator("#library-sort").selectOption("oldest");
  await expect(terms(page)).toHaveText(sortWordbookEntries(snapshot.entries, "oldest").map(entry => entry.term));
  await expect(page).toHaveURL(/sort=oldest/u);
  await page.reload();
  await expect(page.locator("#library-sort")).toHaveValue("oldest");
  await expect(terms(page)).toHaveText(sortWordbookEntries(snapshot.entries, "oldest").map(entry => entry.term));
});
test("chapter original order is the default, alphabetic choices preserve scope and full detail", async ({ page }) => {
  const chapter = filterEntriesByCollection(snapshot.entries, "never-let-me-go", "chapter-1");
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await expect(page.locator("#library-sort")).toHaveValue("source");
  await expect(terms(page)).toHaveText(chapter.map(entry => entry.term));
  for (const sort of ["az", "za", "newest", "oldest", "source"]) {
    await page.locator("#library-sort").selectOption(sort);
    await expect(terms(page)).toHaveText(sortWordbookEntries(chapter, sort).map(entry => entry.term));
    expect(new URL(page.url()).searchParams.get("chapter")).toBe("chapter-1");
  }
  await page.locator("#entry-grid [data-entry-action='detail']").first().click();
  await expect(page.locator("#dialog-term")).toHaveText(chapter[0].term);
  await expect(page.locator("#dialog-meaning")).toBeVisible();
});
test("sorting is display-only, search remains scoped and never sends a mutation", async ({ page }) => {
  const writes = [];
  page.on("request", request => { if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url()); });
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&sort=az");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(29);
  await page.locator("#library-search").fill("shrug");
  await expect(terms(page)).toHaveText(["shrug"]);
  await page.locator("#library-sort").selectOption("za");
  await expect(terms(page)).toHaveText(["shrug"]);
  expect(writes).toEqual([]);
});
for (const width of [320, 390, 1280]) {
  test(`sorting controls do not overflow or cover chapter cards at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?book=never-let-me-go&chapter=chapter-1");
    await expect(page.locator("#entry-grid .word-card")).toHaveCount(29);
    await expect(page.locator("#library-sort")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await page.locator("#library-sort").boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `qa-artifacts/public-sort-${width}.png` });
  });
}
