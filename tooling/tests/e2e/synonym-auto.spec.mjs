import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBlankEntry, validatePublicEntry } from "../../../vocab/js/wordbook-schema.js";
import { entrySynonymFingerprint, pendingSynonymScan } from "../../../vocab/js/synonym-evidence.js";

const baseline = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });
let browserErrors;
test.beforeEach(async ({ context, page }, testInfo) => {
  await context.addCookies([
    { name: "e2e_run", value: `auto-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80), url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
  browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
});
test.afterEach(() => expect(browserErrors).toEqual([]));

function fixture(terms = ["delicious", "yummy", "palatable"], { imported = false } = {}) {
  const entries = terms.map((term, index) => validatePublicEntry({
    ...createBlankEntry(term), id: `auto-synonym-${index}`, meaning: "美味的；好吃的", definition: "Pleasant to taste.",
    partOfSpeech: "adjective", phonetic: "/test/", exampleEn: "The food is delicious.", exampleZh: "食物很美味。",
    usage: "形容食物味道好。", organizationMethod: "manual", senses: [{
      partOfSpeech: "adjective", meaningZh: "美味的；好吃的", definitionEn: "Pleasant to taste.",
      usageNotes: "形容食物味道好。", register: "neutral", collocations: [],
      examples: [{ en: "The food is delicious.", zh: "食物很美味。" }], confusables: []
    }]
  }));
  if (imported) entries.forEach((entry) => { entry.synonymScan = pendingSynonymScan(entry, entries); });
  return { ...structuredClone(baseline), entries };
}

async function serveSnapshot(page, snapshot) {
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({ json: { snapshot, sha: "a".repeat(40) } }));
}

function complete(snapshot, entryId, { matches = [] } = {}) {
  const entry = snapshot.entries.find((value) => value.id === entryId);
  entry.synonymScan = { ...pendingSynonymScan(entry, snapshot.entries), status: "complete", reason: "", matches };
  return { snapshot, sha: "b".repeat(40), entry, action: "synonyms", synonymScan: entry.synonymScan };
}

async function ownerReady(page) {
  await page.goto("/owner.html");
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect(page.locator("#owner-entry-list .owner-entry-row").first()).toBeVisible();
}

test("导入待识别词自动串行识别，更新双向卡片且不新增词或改正文", async ({ page }) => {
  const snapshot = fixture(undefined, { imported: true });
  const original = snapshot.entries.map(({ synonymScan, ...entry }) => entry);
  let active = 0;
  let maximumActive = 0;
  const calls = [];
  await serveSnapshot(page, snapshot);
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("e2e-csrf-token-000000000000000000000000");
    const { entryId } = route.request().postDataJSON();
    calls.push(entryId);
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    const target = snapshot.entries[0];
    const matches = entryId === snapshot.entries[1].id
      ? [{ targetId: target.id, targetFingerprint: entrySynonymFingerprint(target), note: "都形容食物美味；yummy 更口语。" }]
      : [];
    await route.fulfill({ json: complete(snapshot, entryId, { matches }) });
    active -= 1;
  });
  await ownerReady(page);
  await expect.poll(() => calls.length).toBe(3);
  await expect(page.locator(".owner-entry-synonym-status", { hasText: "已识别" })).toHaveCount(3);
  expect(maximumActive).toBe(1);
  expect(new Set(calls).size).toBe(3);
  expect(snapshot.entries.map(({ synonymScan, ...entry }) => entry)).toEqual(original);
  await expect(page.locator("#owner-entry-count")).toHaveText("3");
  const deliciousRow = page.locator(".owner-entry-row", { has: page.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }) });
  await expect(deliciousRow.locator(".owner-entry-synonyms")).toContainText("yummy");
  await expect(deliciousRow.locator(".owner-entry-synonym-status")).toContainText("1 个匹配");
  await deliciousRow.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-synonym-section").getByRole("button", { name: "打开词条 yummy", exact: true })).toBeVisible();
});

test("额度不足停止导入批次，刷新不形成重试循环，手动重新识别仍可用", async ({ page }) => {
  const snapshot = fixture(undefined, { imported: true });
  let calls = 0;
  await serveSnapshot(page, snapshot);
  await page.route("**/api/v1/owner/synonyms", (route) => {
    calls += 1;
    const { entryId } = route.request().postDataJSON();
    const entry = snapshot.entries.find((item) => item.id === entryId);
    if (calls === 1) {
      entry.synonymScan = { ...entry.synonymScan, reason: "daily_quota" };
      return route.fulfill({ json: { snapshot, sha: "b".repeat(40), entry, action: "synonyms", synonymScan: entry.synonymScan } });
    }
    return route.fulfill({ json: complete(snapshot, entryId) });
  });
  await ownerReady(page);
  await expect(page.locator(".owner-entry-synonym-status", { hasText: "今日额度不足" })).toHaveCount(1);
  await page.locator("#refresh-remote").click();
  await expect(page.locator("#sync-label")).toHaveText("已连接 GitHub");
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "重新识别 delicious 的同义词", exact: true }).click();
  await expect(page.locator(".owner-entry-synonym-status", { hasText: "已识别" })).toHaveCount(1);
  expect(calls).toBe(2);
  await expect(page.locator("#owner-entry-count")).toHaveText("3");
});

test("识别失败不撤回已加载词库或草稿，且公开访客不触发识别", async ({ page }) => {
  const snapshot = fixture(undefined, { imported: true });
  let calls = 0;
  await serveSnapshot(page, snapshot);
  await page.route("**/api/v1/owner/synonyms", (route) => {
    calls += 1;
    return route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "服务暂不可用" } } });
  });
  await ownerReady(page);
  await expect(page.locator("#sync-detail")).toContainText("词条已保存");
  await expect(page.locator("#owner-entry-count")).toHaveText("3");
  await expect(page.locator("#sync-label")).toHaveText("已连接 GitHub");
  expect(calls).toBe(1);
  await page.route("**/api/v1/public/wordbook*", (route) => route.fulfill({ json: snapshot }));
  await page.route("**/data/owner-wordbook.json*", (route) => route.fulfill({ json: snapshot }));
  await page.goto("/");
  await expect(page.locator("#entry-count")).toHaveText("3");
  await page.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-synonym-status")).toContainText("待识别");
  expect(calls).toBe(1);
});

test("重新识别不覆盖正在编辑的草稿，随后发布使用识别后的 SHA", async ({ page }) => {
  const snapshot = fixture(["delicious"]);
  await serveSnapshot(page, snapshot);
  let releaseScan;
  const scanGate = new Promise((resolve) => { releaseScan = resolve; });
  let scanStarted = false;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    scanStarted = true;
    await scanGate;
    await route.fulfill({ json: complete(snapshot, snapshot.entries[0].id) });
  });
  let published;
  await page.route("**/api/v1/owner/publish", async (route) => {
    published = route.request().postDataJSON();
    const entry = published.mutation.entry;
    snapshot.entries = [entry];
    await route.fulfill({ json: { snapshot, sha: "c".repeat(40), entry, action: "updated" } });
  });
  await ownerReady(page);
  await page.locator(".owner-entry-row").getByRole("button", { name: "编辑", exact: true }).click();
  await page.locator("#field-usage").fill("我的手动补充，不能被后台识别覆盖。");
  await page.getByRole("button", { name: "重新识别 delicious 的同义词", exact: true }).click();
  await expect.poll(() => scanStarted).toBe(true);
  await page.locator("#field-usage").fill("识别期间进一步补充，保持这份草稿。");
  releaseScan();
  await expect(page.locator(".owner-entry-synonym-status")).toContainText("已识别");
  await expect(page.locator("#field-usage")).toHaveValue("识别期间进一步补充，保持这份草稿。");
  await page.getByRole("button", { name: "发布到 GitHub", exact: true }).click();
  await expect.poll(() => published?.baseSha).toBe("b".repeat(40));
  expect(published.mutation.entry.usage).toBe("识别期间进一步补充，保持这份草稿。");
});

test("导入自动补识别每个页面最多 20 项，保留剩余待识别词", async ({ page }) => {
  const snapshot = fixture(Array.from({ length: 21 }, (_, index) => `word${String.fromCharCode(97 + index)}`), { imported: true });
  let calls = 0;
  await serveSnapshot(page, snapshot);
  await page.route("**/api/v1/owner/synonyms", (route) => {
    calls += 1;
    return route.fulfill({ json: complete(snapshot, route.request().postDataJSON().entryId) });
  });
  await ownerReady(page);
  await expect.poll(() => calls, { timeout: 15_000 }).toBe(20);
  await expect(page.locator(".owner-entry-synonym-status", { hasText: "已识别" })).toHaveCount(20);
  await page.locator("#refresh-remote").click();
  await expect(page.locator("#sync-label")).toHaveText("已连接 GitHub");
  expect(calls).toBe(20);
  await expect(page.locator(".owner-entry-synonym-status", { hasText: "待识别" })).toHaveCount(1);
});

test("词义修改后旧完成记录不能继续显示为已识别", async ({ page }) => {
  const snapshot = fixture(["delicious"]);
  complete(snapshot, snapshot.entries[0].id);
  snapshot.entries[0].usage = "修改后的新语境，需要重新识别。";
  await serveSnapshot(page, snapshot);
  await ownerReady(page);
  await expect(page.locator(".owner-entry-synonym-status")).toHaveText("同义词待识别");
  await page.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-synonym-status")).toContainText("待识别");
});

test("识别中点击发布会等待识别结束，不同时发送两次写入", async ({ page }) => {
  const snapshot = fixture(["delicious"]);
  await serveSnapshot(page, snapshot);
  let releaseScan;
  const scanGate = new Promise((resolve) => { releaseScan = resolve; });
  let scanStarted = false;
  let scanFinished = false;
  let published = false;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    scanStarted = true;
    await scanGate;
    scanFinished = true;
    await route.fulfill({ json: complete(snapshot, snapshot.entries[0].id) });
  });
  await page.route("**/api/v1/owner/publish", async (route) => {
    expect(scanFinished).toBe(true);
    published = true;
    const entry = route.request().postDataJSON().mutation.entry;
    snapshot.entries = [entry];
    await route.fulfill({ json: { snapshot, sha: "c".repeat(40), entry, action: "updated" } });
  });
  await ownerReady(page);
  await page.locator(".owner-entry-row").getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: "重新识别 delicious 的同义词", exact: true }).click();
  await expect.poll(() => scanStarted).toBe(true);
  await page.locator("#field-usage").fill("识别时也能继续编辑并排队发布。");
  await page.getByRole("button", { name: "发布到 GitHub", exact: true }).click();
  await expect(page.locator("#draft-state")).toContainText("等待同步");
  expect(published).toBe(false);
  releaseScan();
  await expect.poll(() => published).toBe(true);
  await expect(page.locator("#sync-label")).toHaveText("已发布");
});

test("识别结束后延迟返回的旧 GET 不覆盖新关系或 SHA", async ({ page }) => {
  const snapshot = fixture(["delicious"]);
  await serveSnapshot(page, snapshot);
  await ownerReady(page);
  let releaseGet;
  const getGate = new Promise((resolve) => { releaseGet = resolve; });
  let getStarted = false;
  const stale = structuredClone(snapshot);
  await page.route("**/api/v1/owner/wordbook", async (route) => {
    getStarted = true;
    await getGate;
    await route.fulfill({ json: { snapshot: stale, sha: "a".repeat(40) } });
  });
  await page.route("**/api/v1/owner/synonyms", (route) => route.fulfill({ json: complete(snapshot, snapshot.entries[0].id) }));
  await page.locator("#refresh-remote").click();
  await expect.poll(() => getStarted).toBe(true);
  await page.getByRole("button", { name: "重新识别 delicious 的同义词", exact: true }).click();
  await expect(page.locator(".owner-entry-synonym-status")).toContainText("已识别");
  releaseGet();
  await expect(page.locator("#sync-detail")).toContainText("bbbbbbb");
  await expect(page.locator(".owner-entry-synonym-status")).toContainText("已识别");
});

test("删除或改义项的匹配不计入识别数量，空结果过期后显示待补查", async ({ page }) => {
  const snapshot = fixture();
  const target = snapshot.entries[1];
  complete(snapshot, snapshot.entries[0].id, { matches: [{
    targetId: target.id, targetFingerprint: entrySynonymFingerprint(target), note: "都表示美味。"
  }] });
  complete(snapshot, snapshot.entries[2].id);
  await serveSnapshot(page, snapshot);
  await ownerReady(page);
  const firstRow = page.locator(".owner-entry-row", { has: page.getByRole("button", { name: "查看 delicious 的完整词条", exact: true }) });
  await expect(firstRow.locator(".owner-entry-synonym-status")).toContainText("1 个匹配");
  target.meaning = "与食物味道无关的新义项。";
  await page.locator("#refresh-remote").click();
  await expect(firstRow.locator(".owner-entry-synonym-status")).toHaveText("同义词待补查 · 词库已更新");
  await expect(firstRow.locator(".owner-entry-synonyms")).toBeHidden();
  await page.getByRole("button", { name: "查看 palatable 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-synonym-status")).toHaveText("词库已更新，同义词待补查。");
  await page.keyboard.press("Escape");
  snapshot.entries = snapshot.entries.filter((entry) => entry.id !== target.id);
  await page.locator("#refresh-remote").click();
  await expect(firstRow.locator(".owner-entry-synonym-status")).toHaveText("同义词待补查 · 词库已更新");
  await expect(page.locator("#owner-entry-count")).toHaveText("2");
});
