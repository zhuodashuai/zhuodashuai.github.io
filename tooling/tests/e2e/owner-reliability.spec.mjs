import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBlankEntry, validatePublicEntry } from "../../../vocab/js/wordbook-schema.js";
import { pendingSynonymScan } from "../../../vocab/js/synonym-evidence.js";

const baseline = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });
let browserErrors;
test.beforeEach(async ({ context, page }, testInfo) => {
  const run = `reliability-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([
    { name: "e2e_run", value: run, url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
  browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
});
test.afterEach(() => expect(browserErrors).toEqual([]));

function fixture(imported = true) {
  const entries = ["alpha", "beta"].map((term, index) => validatePublicEntry({
    ...createBlankEntry(term), id: `reliability-word-${index}`, partOfSpeech: "noun", meaning: "测试词义", definition: "A test word.",
    usage: "原有用法", exampleEn: "This is a test word.", exampleZh: "这是一个测试词。", organizationMethod: "manual"
  }));
  if (imported) entries.forEach((entry) => { entry.synonymScan = pendingSynonymScan(entry, entries); });
  return { ...structuredClone(baseline), entries };
}

async function ownerReady(page, snapshot) {
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({ json: { snapshot, sha: "a".repeat(40) } }));
  await page.goto("/owner.html?e2e=1&testRun=reliability");
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect(page.locator("#owner-entry-count")).toHaveText("2");
}

async function editAlpha(page, usage) {
  await page.locator(".owner-entry-row", { has: page.getByRole("button", { name: "查看 alpha 的完整词条", exact: true }) })
    .getByRole("button", { name: "编辑", exact: true }).click();
  await page.locator("#field-usage").fill(usage);
}

test("foreground publication interrupts an automatic scan and ignores its late stale response", async ({ page }) => {
  const snapshot = fixture();
  const stale = structuredClone(snapshot);
  let releaseScan;
  const gate = new Promise((resolve) => { releaseScan = resolve; });
  let scans = 0;
  let scanReleased = false;
  let scanFinished = false;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    scans += 1;
    await gate;
    try {
      await route.fulfill({ json: { snapshot: stale, sha: "b".repeat(40), entry: stale.entries[0], action: "synonyms" } });
    } finally { scanFinished = true; }
  });
  let writes = 0;
  await page.route("**/api/v1/owner/publish", async (route) => {
    expect(scanReleased).toBe(false);
    writes += 1;
    const request = route.request().postDataJSON();
    expect(request.baseSha).toBe("a".repeat(40));
    expect(request.mutation.entry.usage).toBe("正在识别时手动写下的内容必须保留。");
    snapshot.entries[0] = request.mutation.entry;
    await route.fulfill({ json: { snapshot, sha: "c".repeat(40), entry: snapshot.entries[0], action: "updated" } });
  });
  await ownerReady(page, snapshot);
  await expect.poll(() => scans).toBe(1);
  await editAlpha(page, "正在识别时手动写下的内容必须保留。");
  // Two submit events model a rapid repeated user action while the first
  // publication is still awaiting its durable local queue transaction.
  await page.locator("#entry-form").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
  await expect(page.locator("#sync-label")).toHaveText("已发布");
  expect(writes).toBe(1);
  scanReleased = true;
  releaseScan();
  await expect.poll(() => scanFinished).toBe(true);
  await expect(page.locator("#sync-detail")).toContainText("ccccccc");
  await expect(page.locator("#field-usage")).toHaveValue("正在识别时手动写下的内容必须保留。");
  expect(scans).toBe(1);
});

test("a scan committed before foreground publication rebases through normal SHA checks", async ({ page }) => {
  const snapshot = fixture();
  let releaseScan;
  const gate = new Promise((resolve) => { releaseScan = resolve; });
  let scanStarted = false;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    scanStarted = true;
    await gate;
    await route.abort().catch(() => {});
  });
  const requests = [];
  await page.route("**/api/v1/owner/publish", async (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    if (requests.length === 1) {
      const entry = snapshot.entries[0];
      entry.synonymScan = { ...pendingSynonymScan(entry, snapshot.entries), status: "complete", reason: "" };
      entry.revision += 1;
      entry.updatedAt = new Date(Date.parse(entry.updatedAt) + 1000).toISOString();
      return route.fulfill({ status: 409, json: { error: { code: "github_conflict", message: "远端关系已更新", details: { snapshot, sha: "b".repeat(40) } } } });
    }
    expect(request.baseSha).toBe("b".repeat(40));
    expect(request.mutation.entry.usage).toBe("并发识别之后仍要发布这份手动内容。");
    expect(request.mutation.entry.synonymScan.status).toBe("complete");
    expect(request.mutation.expectedUpdatedAt).toBe(snapshot.entries[0].updatedAt);
    snapshot.entries[0] = request.mutation.entry;
    return route.fulfill({ json: { snapshot, sha: "c".repeat(40), entry: snapshot.entries[0], action: "updated" } });
  });
  await ownerReady(page, snapshot);
  await expect.poll(() => scanStarted).toBe(true);
  await editAlpha(page, "并发识别之后仍要发布这份手动内容。");
  await page.locator("#publish-button").click();
  await expect(page.locator("#sync-label")).toHaveText("已发布");
  expect(requests).toHaveLength(2);
  expect(requests[1].mutationId).not.toBe(requests[0].mutationId);
  await expect(page.locator("#field-usage")).toHaveValue("并发识别之后仍要发布这份手动内容。");
  releaseScan();
});

test("a timed-out mutation preserves its exact draft and waits for explicit review without replay", async ({ page }) => {
  const snapshot = fixture(false);
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => original(callback, delay === 45_000 ? 100 : delay, ...args);
  });
  let writes = 0;
  await page.route("**/api/v1/owner/publish", () => { writes += 1; });
  await ownerReady(page, snapshot);
  await editAlpha(page, "超时后不能丢失，也不能自动重发的草稿。");
  await page.locator("#publish-button").click();
  await expect(page.locator("#sync-label")).toHaveText("等待你复核");
  await expect(page.locator("#sync-detail")).toContainText("远端结果尚未确认");
  await expect(page.locator("#field-usage")).toHaveValue("超时后不能丢失，也不能自动重发的草稿。");
  const stored = await page.evaluate(async () => {
    const storage = await import("/js/owner-storage.js");
    return { drafts: await storage.listDrafts(), operations: await storage.listOutbox({ includeCompleted: true }) };
  });
  expect(stored.operations).toHaveLength(1);
  expect(stored.operations[0]).toMatchObject({ status: "review_required", lastError: { code: "request_timeout", retryable: false } });
  expect(stored.drafts[0].value.usage).toBe("超时后不能丢失，也不能自动重发的草稿。");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.locator("#refresh-remote").click();
  await expect(page.locator("#sync-label")).toHaveText("已连接 GitHub");
  expect(writes).toBe(1);
  await expect(page.locator("#retry-queue")).toBeHidden();
});
