import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBlankEntry, validatePublicEntry } from "../../../vocab/js/wordbook-schema.js";

test.use({ serviceWorkers: "block" });
const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const pending = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };

// The real DOM/lookup graph runs against public static files. Account reads
// and the one explicitly selected owner collection are entirely intercepted;
// these cases cannot create accounts or mutate the local fixture's storage.
async function open({ context, page }, owner = false) {
  const writes = [], errors = [], session = { authenticated: true, authType: owner ? "github-owner" : "member",
    user: { id: owner ? "15604207-8000-4000-8000-000000000001" : "12345678-1234-4234-8234-123456789abc", username: owner ? "zhuodashuai" : "audit_reader" },
    csrfToken: "a".repeat(43), expiresAt: Date.now() + 3600000 };
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/api/v1/**", async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    let value;
    if (request.method() !== "GET") {
      writes.push({ method: request.method(), pathname, body: request.postDataJSON() });
      if (!owner || pathname !== "/api/v1/owner/dictionary-collection" || request.postDataJSON().term !== "happy") return route.abort();
      const entry = createBlankEntry("happy"); entry.partOfSpeech = "adjective"; entry.meaning = "① 高兴的；快乐的";
      validatePublicEntry(entry); value = { entry, added: true, sha: "a".repeat(40) };
    } else value = pathname.endsWith("/session") ? session : pathname.endsWith("/entries") ? { revision: 0, entries: [] }
      : pathname.endsWith("/learning") ? { revision: 0, reviews: [] } : pathname.endsWith("/folders") ? { revision: 0, folders: [] }
        : pathname === "/api/v1/public/wordbook" ? snapshot : null;
    await route.fulfill({ status: value ? 200 : 404, contentType: "application/json", body: JSON.stringify(value || {}) });
  });
  await page.goto(`/personal.html?auth=${owner ? "owner" : "member"}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#member-workspace")).toBeVisible(); await expect(page.locator("#member-dictionary-search")).toBeEnabled();
  return { writes, errors };
}
async function search(page, term) {
  await page.locator("#member-dictionary-term").fill(term); await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
}

for (const query of ["heppy", "ＨＥＰＰＹ"]) test(`a member's ${query} miss offers explicit spelling choices in place and preserves the unsaved draft`, async ({ context, page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const observed = await open({ context, page });
  await page.locator("#member-term").fill("my manual draft"); await page.locator("#member-note").fill("Keep my draft note");
  await search(page, query);
  await expect(page.locator('#member-dictionary-choices [data-dictionary-suggestion="happy"]')).toBeVisible();
  await expect(page.locator("#member-dictionary-choices")).toContainText("你是不是想查");
  await expect(page.locator("#member-dictionary-term")).toHaveValue(query);
  await expect(page.locator("#member-dictionary-result")).toBeHidden(); expect(observed.writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await info.attach(`personal-${query === "heppy" ? "ascii" : "fullwidth"}-heppy-suggestions-390.png`, {
    body: await page.locator(".dictionary-panel").screenshot(), contentType: "image/png"
  });
  await page.locator('[data-dictionary-suggestion="happy"]').click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("happy");
  await expect(page.locator("#member-dictionary-term")).toHaveValue("happy");
  await expect(page.locator("#member-dictionary-meaning")).not.toHaveText("");
  await expect(page.locator("#member-term")).toHaveValue("my manual draft");
  await expect(page.locator("#member-note")).toHaveValue("Keep my draft note");
  expect(observed.writes).toEqual([]); expect(observed.errors).toEqual([]);
});

test("owner candidates never write by rendering; explicit choice independently looks up and uses the normal public collection", async ({ context, page }) => {
  const observed = await open({ context, page }, true);
  await search(page, "heppy"); await expect(page.locator('[data-dictionary-suggestion="happy"]')).toBeVisible();
  expect(observed.writes).toEqual([]); await expect(page.locator("#member-dictionary-term")).toHaveValue("heppy");
  await page.locator('[data-dictionary-suggestion="happy"]').click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("happy");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText("已收录");
  expect(observed.writes).toHaveLength(1);
  expect(observed.writes[0]).toMatchObject({ method: "POST", pathname: "/api/v1/owner/dictionary-collection", body: { term: "happy" } });
  expect(observed.errors).toEqual([]);
});

for (const action of ["edit", "account changed"]) test(`late spelling candidates cannot return after ${action}`, async ({ context, page }) => {
  const gate = pending(), started = pending(); let held = false;
  await context.route("**/data/dictionary-suggestions/**", async route => {
    if (!held) { held = true; started.resolve(); await gate.promise; }
    try { await route.continue(); } catch { /* The obsolete read is allowed to be cancelled. */ }
  });
  const observed = await open({ context, page });
  try {
    await search(page, "heppy"); await started.promise;
    await expect(page.locator("#member-dictionary-search")).toBeEnabled();
    await expect(page.locator("#member-dictionary-status")).toContainText("未找到");
    if (action === "edit") {
      await search(page, "apple"); await expect(page.locator("#member-dictionary-word")).toHaveText("apple");
    } else {
      await page.evaluate(() => { const other = new BroadcastChannel("zhuo-member-auth-v1"); other.postMessage({ type: "changed", tabId: "different-test-tab" }); other.close(); });
      await expect(page.locator("#member-workspace")).toBeHidden();
    }
    gate.resolve(); await page.waitForTimeout(100);
    await expect(page.locator("[data-dictionary-suggestion]")).toHaveCount(0);
    if (action === "edit") await expect(page.locator("#member-dictionary-word")).toHaveText("apple");
    expect(observed.writes).toEqual([]); expect(observed.errors).toEqual([]);
  } finally { gate.resolve(); }
});
