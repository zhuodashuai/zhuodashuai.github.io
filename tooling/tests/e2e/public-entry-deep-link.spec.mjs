import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parsePublicSnapshot } from "../../../vocab/js/wordbook-schema.js";
import { expectFullPublicEntry } from "./public-entry-assertions.mjs";

const ORIGIN = "http://127.0.0.1:4187";
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8")));
const target = snapshot.entries.find(entry => entry.term === "hip");
expect(target?.senses.length, "the full-card deep-link fixture must retain both actual published senses").toBe(2);
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "e2e_run", value: `entry-deep-link-${randomUUID()}`, url: ORIGIN }]);
});

test("an anonymous exact entry ID opens the complete published card even outside the selected chapter, and survives reload", async ({ page }) => {
  const writes = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method()) && new URL(request.url()).pathname.startsWith("/api/")) writes.push(request.url()); });
  await page.goto(`/?entry=${encodeURIComponent(target.id)}&book=never-let-me-go&chapter=chapter-1`);
  await expectFullPublicEntry(page, target);
  expect(new URL(page.url()).searchParams.get("entry")).toBe(target.id);
  await page.reload();
  await expectFullPublicEntry(page, target);
  expect(writes).toEqual([]);
});

test("an entry deep link waits for its exact ID in a fresh public snapshot instead of opening a different cached card", async ({ page }) => {
  const old = {
    ...snapshot, revisionId: "entry-deeplink-target-not-yet-cached", lastMutationId: "entry-deeplink-old-fixture",
    entries: snapshot.entries.filter(entry => entry.id !== target.id)
  };
  await page.route("**/__entry-cache-bootstrap", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Entry cache fixture</title>" }));
  await page.goto("/__entry-cache-bootstrap");
  await page.evaluate(async cached => {
    const { putPublicCache } = await import("/js/owner-storage.js");
    await putPublicCache(cached);
  }, old);
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { reached = resolve; });
  await page.route("**/api/v1/public/wordbook*", async route => {
    reached(); await gate;
    try { await route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(snapshot) }); }
    catch { /* Cleanup can close a deliberately gated response. */ }
  });
  await page.route("**/data/owner-wordbook.json*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(old) }));
  try {
    await page.goto(`/?entry=${encodeURIComponent(target.id)}`); await seen;
    await expect(page.locator("#entry-count")).toHaveText(String(old.entries.length));
    await expect(page.locator("#entry-dialog")).toBeHidden();
    expect(new URL(page.url()).searchParams.get("entry")).toBe(target.id);
    release();
    await expectFullPublicEntry(page, target);
  } finally { release(); }
});

test("an unknown entry ID leaves the public library usable without silently opening the first card", async ({ page }) => {
  await page.goto("/?entry=public-00000000-0000-4000-8000-000000000000");
  await expect(page.locator("#entry-grid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#entry-count")).toHaveText(String(snapshot.entries.length));
  await expect(page.locator("#entry-dialog")).toBeHidden();
  await page.locator("#library-search").fill(target.term);
  await page.getByRole("button", { name: `查看 ${target.term} 的完整词条`, exact: true }).click();
  await expectFullPublicEntry(page, target);
});
