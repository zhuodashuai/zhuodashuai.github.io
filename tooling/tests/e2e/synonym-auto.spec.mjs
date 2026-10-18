import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBlankEntry, validatePublicEntry } from "../../../vocab/js/wordbook-schema.js";
import { pendingSynonymScan } from "../../../vocab/js/synonym-evidence.js";
const baseline = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([
    { name: "e2e_run", value: `paused-auto-${info.testId}`.replace(/[^a-z0-9-]/giu, "-").slice(0, 80), url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
  page.on("pageerror", error => { throw new Error(error.message); });
});
function fixture() {
  const entries = ["delicious", "yummy", "palatable"].map((term, index) => validatePublicEntry({
    ...createBlankEntry(term), id: `paused-synonym-${index}`, meaning: "美味的；好吃的", definition: "Pleasant to taste.",
    partOfSpeech: "adjective", phonetic: "/test/", exampleEn: "The food tastes good.", exampleZh: "食物味道好。", organizationMethod: "manual",
    senses: [{ partOfSpeech: "adjective", meaningZh: "美味的；好吃的", definitionEn: "Pleasant to taste.", usageNotes: "", register: "neutral", collocations: [], examples: [{ en: "The food tastes good.", zh: "食物味道好。" }], confusables: [] }]
  }));
  for (const entry of entries) entry.synonymScan = pendingSynonymScan(entry, entries);
  entries[0].synonyms = ["yummy"]; entries[1].synonyms = ["delicious"];
  return { ...structuredClone(baseline), entries };
}
async function serve(page, snapshot) {
  const calls = [];
  await page.route("**/api/v1/owner/wordbook", route => route.fulfill({ json: { snapshot, sha: "a".repeat(40) } }));
  await page.route("**/api/v1/owner/synonyms", route => {
    calls.push(route.request().postData());
    return route.fulfill({ status: 409, json: { error: { code: "synonym_feature_paused", message: "同义词功能暂未开放。" } } });
  });
  return calls;
}
async function ready(page) {
  await page.goto("/owner.html");
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect(page.locator("#owner-entry-count")).toHaveText("3");
}
test("pending imports load with no background model requests, relation previews or misleading status", async ({ page }) => {
  const snapshot = fixture(), before = structuredClone(snapshot), calls = await serve(page, snapshot); await ready(page);
  await expect(page.locator(".owner-entry-synonym-status:visible")).toHaveCount(0);
  await expect(page.locator(".owner-entry-synonyms:visible")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /重新识别.*同义词/u })).toHaveCount(0);
  expect(calls).toEqual([]); expect(snapshot).toEqual(before);
});
test("refresh, focus, online recovery and reload never restart paused recognition", async ({ page }) => {
  const snapshot = fixture(), calls = await serve(page, snapshot); await ready(page);
  await page.locator("#refresh-remote").click();
  await expect(page.locator("#sync-label")).toHaveText("已连接 GitHub");
  await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
  await page.reload(); await expect(page.locator("#owner-entry-count")).toHaveText("3"); expect(calls).toEqual([]);
});
test("editing and publishing preserve valid hidden relation metadata without model requests", async ({ page }) => {
  const snapshot = fixture(), calls = await serve(page, snapshot); let published;
  await page.route("**/api/v1/owner/publish", route => {
    published = route.request().postDataJSON(); const entry = published.mutation.entry;
    snapshot.entries = snapshot.entries.map(item => item.id === entry.id ? entry : item);
    return route.fulfill({ json: { snapshot, sha: "b".repeat(40), entry, action: "updated" } });
  });
  await ready(page);
  const row = page.locator(".owner-entry-row", { has: page.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }) });
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator("#synonyms-field")).toBeHidden();
  await page.locator("#field-usage").fill("保留我的补充笔记。");
  await page.getByRole("button", { name: "发布到 GitHub", exact: true }).click();
  await expect.poll(() => published?.mutation?.entry?.usage).toBe("保留我的补充笔记。");
  expect(published.mutation.entry.synonyms).toEqual(["yummy"]); expect(calls).toEqual([]);
  await expect(page.locator("#owner-entry-count")).toHaveText("3");
});
test("owner detail hides relations but retains meaning and existing examples", async ({ page }) => {
  const snapshot = fixture(), calls = await serve(page, snapshot); await ready(page);
  await page.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-synonym-section")).toBeHidden();
  await expect(page.locator(".detail-synonyms")).toHaveCount(0);
  await expect(page.locator("#dialog-meaning")).toContainText("美味");
  await expect(page.locator("#dialog-example-en")).toHaveText(snapshot.entries[0].exampleEn); expect(calls).toEqual([]);
});
test("semantically edited entries never advertise stale recognition as complete", async ({ page }) => {
  const snapshot = fixture(), calls = await serve(page, snapshot); snapshot.entries[0].meaning = "新语境中的义项。";
  await ready(page); await expect(page.locator(".owner-entry-synonym-status:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-synonym-section")).toBeHidden(); expect(calls).toEqual([]);
});
test("public visitors see exactly one ordinary card per headword and never trigger recognition", async ({ page }) => {
  const snapshot = fixture(), calls = await serve(page, snapshot);
  await page.route("**/api/v1/public/wordbook*", route => route.fulfill({ json: snapshot }));
  await page.route("**/data/owner-wordbook.json*", route => route.fulfill({ json: snapshot }));
  await page.goto("/?view=synonyms");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(3);
  for (const entry of snapshot.entries) await expect(page.getByRole("button", { name: `查看 ${entry.term} 的完整词条`, exact: true })).toHaveCount(1);
  await expect(page.locator(".card-synonyms:visible")).toHaveCount(0); expect(calls).toEqual([]);
});
