import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pendingSynonymScan } from "../../../vocab/js/synonym-evidence.js";

const baseline = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const origin = "http://127.0.0.1:4187";
const csrfToken = "e2e-csrf-token-000000000000000000000000";
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context }, testInfo) => {
  await context.addCookies([
    { name: "e2e_run", value: `focus-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80), url: origin },
    { name: "e2e_auth", value: "owner", url: origin }
  ]);
});

function importedFixture() {
  const snapshot = structuredClone(baseline);
  snapshot.entries = snapshot.entries.filter((entry) => entry.entryType === "word").slice(0, 2);
  for (const entry of snapshot.entries) entry.synonymScan = pendingSynonymScan(entry, snapshot.entries);
  return snapshot;
}

async function serveSnapshot(page, snapshot) {
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({ json: { snapshot, sha: "a".repeat(40) } }));
}

test("后台连续识别保留列表键盘焦点，弹窗关闭返回重建后的同一词条按钮", async ({ page }) => {
  const snapshot = importedFixture();
  await serveSnapshot(page, snapshot);
  const scans = [];
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    const { entryId } = route.request().postDataJSON();
    await new Promise((release) => scans.push({ entryId, release }));
    const entry = snapshot.entries.find((candidate) => candidate.id === entryId);
    entry.synonymScan = { ...pendingSynonymScan(entry, snapshot.entries), status: "complete", reason: "" };
    await route.fulfill({ json: { snapshot, sha: "b".repeat(40), entry, action: "synonyms", synonymScan: entry.synonymScan } });
  });
  await page.goto("/owner.html");
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect.poll(() => scans.length).toBe(1);
  const button = page.getByRole("button", { name: `查看 ${snapshot.entries[0].term} 的完整词条`, exact: true });
  await button.focus();
  scans[0].release();
  await expect.poll(() => scans.length).toBe(2);
  await expect(button).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#entry-dialog")).toBeVisible();
  scans[1].release();
  await expect(page.locator(".owner-entry-synonym-status", { hasText: "已识别" })).toHaveCount(2);
  await expect(page.locator("#entry-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#entry-dialog")).toBeHidden();
  await expect(button).toBeFocused();
});

test("自动识别失败保留输入来源说明和焦点，只在同步详情显示后台错误", async ({ page }) => {
  const snapshot = importedFixture();
  await serveSnapshot(page, snapshot);
  let releaseScan;
  const scanGate = new Promise((resolve) => { releaseScan = resolve; });
  let calls = 0;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    calls += 1;
    await scanGate;
    await route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "服务暂不可用" } } });
  });
  await page.goto("/owner.html?input=hip");
  await expect(page.locator("#capture-status")).toContainText("尚未调用 AI，也没有建立或发布草稿");
  const inputMessage = await page.locator("#capture-status").textContent();
  await expect.poll(() => calls).toBe(1);
  releaseScan();
  await expect(page.locator("#sync-detail")).toContainText("同义词识别暂未完成");
  await expect(page.locator("#capture-status")).toHaveText(inputMessage);
  await expect(page.getByLabel("英文内容")).toHaveValue("hip");
  await expect(page.getByLabel("英文内容")).toBeFocused();
  await expect(page.locator("#draft-list > button")).toHaveCount(0);
  expect(calls).toBe(1);
});

test("测试扫描接口验证身份与CSRF并返回完整扫描及新SHA，不调用真实AI", async ({ context }) => {
  const initialResponse = await context.request.get("/api/v1/owner/wordbook");
  const initial = await initialResponse.json();
  const entry = initial.snapshot.entries.find((candidate) => candidate.entryType === "word");
  const data = { entryId: entry.id };
  const headers = { Origin: origin, "X-CSRF-Token": csrfToken };
  await context.clearCookies({ name: "e2e_auth" });
  const unauthenticated = await context.request.post("/api/v1/owner/synonyms", { headers, data });
  expect(unauthenticated.status()).toBe(401);
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: origin }]);
  const noCsrf = await context.request.post("/api/v1/owner/synonyms", { headers: { Origin: origin }, data });
  expect(noCsrf.status()).toBe(403);
  const wrongOrigin = await context.request.post("/api/v1/owner/synonyms", { headers: { ...headers, Origin: "https://invalid.example" }, data });
  expect(wrongOrigin.status()).toBe(403);
  const response = await context.request.post("/api/v1/owner/synonyms", { headers, data });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.sha).toMatch(/^[a-f0-9]{40}$/);
  expect(result.sha).not.toBe(initial.sha);
  expect(result.synonymScan.status).toBe("complete");
  expect(result.synonymScan.matches).toEqual([]);
  expect(result.snapshot.entries).toHaveLength(initial.snapshot.entries.length);
  expect(result.entry.meaning).toBe(entry.meaning);
  const current = await (await context.request.get("/api/v1/owner/wordbook")).json();
  expect(current.sha).toBe(result.sha);
  expect(current.snapshot).toEqual(result.snapshot);
});
