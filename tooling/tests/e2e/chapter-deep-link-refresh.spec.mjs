import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

const current = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const bookId = "never-let-me-go";
const oldSnapshot = {
  ...current,
  exportedAt: "2026-09-28T12:00:00.000Z",
  revisionId: "chapter-deeplink-seven-chapters-only",
  lastMutationId: "chapter-deeplink-fixture",
  entries: current.entries.filter(entry => !entry.tags.some(tag => [
    `collection:${bookId}:chapter-8`, `collection:${bookId}:chapter-9`
  ].includes(tag)))
};
const bookCount = current.entries.filter(entry => entry.tags.some(tag => tag.startsWith(`collection:${bookId}:`))).length;

async function snapshots(page, initial = "old") {
  let phase = initial;
  const handler = async route => {
    if (phase === "offline") return route.abort("failed");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify(phase === "old" ? oldSnapshot : current)
    });
  };
  await page.route("**/api/v1/public/wordbook*", handler);
  await page.route("**/data/owner-wordbook.json*", handler);
  return next => { phase = next; };
}

async function seedOldCache(page) {
  await page.route("**/__chapter-cache-bootstrap", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Cache fixture</title>" }));
  await page.goto("/__chapter-cache-bootstrap");
  await page.evaluate(async cached => {
    const { putPublicCache } = await import("/js/owner-storage.js");
    await putPublicCache(cached);
  }, oldSnapshot);
}

async function refreshWithCurrent(page, changePhase) {
  changePhase("current");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator('#chapter-tabs button[data-value="chapter-9"]')).toBeVisible();
}

async function expectChapter(page, chapter, count) {
  await expect(page).toHaveURL(new RegExp(`(?:\\?|&)chapter=chapter-${chapter}(?:&|$)`));
  await expect(page.locator("#library-heading")).toHaveText(`Never Let Me Go · Chapter ${chapter}`);
  await expect(page.locator(`#chapter-tabs button[data-value="chapter-${chapter}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#entry-count")).toHaveText(String(count));
}

test("Chapter 8 deep link survives an old offline IndexedDB cache until the new remote chapter arrives", async ({ page }) => {
  await seedOldCache(page);
  const changePhase = await snapshots(page, "offline");
  await page.goto(`/?book=${bookId}&chapter=chapter-8&release=deep-link-regression`);
  await expect(page.locator("#data-status")).toContainText("当前离线");
  await expect(page.locator('#chapter-tabs button[data-value="chapter-8"]')).toHaveCount(0);
  // It is acceptable to show the cached book while Chapter 8 is unavailable;
  // the original intent must be restored once the validated new data arrives.
  await refreshWithCurrent(page, changePhase);
  await expectChapter(page, 8, 18);
  await expect(page.locator("#chapter-quiz-button")).toBeVisible();
});

test("Chapter 8 deep link survives an initially stale successful live snapshot and a subsequent fresh snapshot", async ({ page }) => {
  const changePhase = await snapshots(page, "old");
  await page.goto(`/?book=${bookId}&chapter=chapter-8`);
  await expect(page.locator('#chapter-tabs button[data-value="chapter-7"]')).toBeVisible();
  await expect(page.locator('#chapter-tabs button[data-value="chapter-8"]')).toHaveCount(0);
  await expect(page.locator("#entry-grid")).toHaveAttribute("aria-busy", "false");
  await refreshWithCurrent(page, changePhase);
  await expectChapter(page, 8, 18);
});

test("a genuinely unavailable chapter falls back to the whole book without an empty or misleading quiz scope", async ({ page }) => {
  await snapshots(page, "current");
  await page.goto(`/?book=${bookId}&chapter=chapter-999`);
  await expect(page.locator("#library-heading")).toHaveText("Never Let Me Go");
  await expect(page.locator("#entry-count")).toHaveText(String(bookCount));
  await expect(page).not.toHaveURL(/(?:\?|&)chapter=/);
  await expect(page.locator('#chapter-tabs button[data-value="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#chapter-quiz-button")).toBeHidden();
});

test("choosing a different chapter while the deep link is unavailable cancels pending automatic restoration", async ({ page }) => {
  const changePhase = await snapshots(page, "old");
  await page.goto(`/?book=${bookId}&chapter=chapter-8`);
  await page.locator('#chapter-tabs button[data-value="chapter-7"]').click();
  await expectChapter(page, 7, 30);
  await refreshWithCurrent(page, changePhase);
  await expectChapter(page, 7, 30);
});
