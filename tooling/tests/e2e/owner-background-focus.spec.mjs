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

function importedFixture(count = 2) {
  const snapshot = structuredClone(baseline);
  snapshot.entries = snapshot.entries.filter((entry) => entry.entryType === "word").slice(0, count);
  for (const entry of snapshot.entries) entry.synonymScan = pendingSynonymScan(entry, snapshot.entries);
  return snapshot;
}

async function serveSnapshot(page, snapshot) {
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({ json: { snapshot, sha: "a".repeat(40) } }));
}

test("暂停后台识别后远端刷新仍保留列表行与按钮节点，弹窗关闭返回同一词条按钮", async ({ page }) => {
  const snapshot = importedFixture();
  let reads = 0;
  let scans = 0;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  await page.route("**/api/v1/owner/wordbook", async (route) => {
    reads += 1;
    if (reads > 1) await refreshGate;
    await route.fulfill({ json: { snapshot, sha: (reads > 1 ? "b" : "a").repeat(40) } });
  });
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    scans += 1;
    await route.fulfill({ status: 410, json: { error: { code: "feature_paused", message: "同义词功能已暂停" } } });
  });
  try {
    await page.goto("/owner.html");
    await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
    await expect(page.locator("#owner-entry-count")).toHaveText("2");
    const button = page.getByRole("button", { name: `查看 ${snapshot.entries[0].term} 的完整词条`, exact: true });
    const row = page.locator(".owner-entry-row").filter({ has: button });
    const originalRow = await row.elementHandle();
    const originalButtons = await row.locator("button").elementHandles();
    expect(originalRow).not.toBeNull();
    expect(originalButtons).toHaveLength(4);
    await expect(row.locator("button:visible")).toHaveCount(3);
    const expectOriginalNodes = async () => {
      expect(await row.evaluate((current, original) => current === original, originalRow)).toBe(true);
      expect(await row.locator("button").evaluateAll((current, original) => (
        current.length === original.length && current.every((node, index) => node === original[index])
      ), originalButtons)).toBe(true);
    };
    await page.locator("#refresh-remote").click();
    await expect.poll(() => reads).toBe(2);
    await button.focus();
    releaseRefresh();
    await expect(page.locator("#sync-detail")).toContainText("bbbbbbb");
    await expectOriginalNodes();
    await expect(button).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#entry-dialog")).toBeVisible();
    await expect(page.locator(".owner-entry-synonym-status:visible")).toHaveCount(0);
    await expectOriginalNodes();
    await expect(page.locator("#entry-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#entry-dialog")).toBeHidden();
    await expect(button).toBeFocused();
    expect(scans).toBe(0);
  } finally {
    releaseRefresh();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("保留的词条按钮在远端刷新更新内容后打开最新详情和编辑草稿", async ({ page }) => {
  const snapshot = importedFixture();
  const original = structuredClone(snapshot.entries[0]);
  const updatedMeaning = "髋骨；构成骨盆的骨骼";
  const updatedDefinition = "A large bone forming either side of the pelvis.";
  const updatedExample = { en: "The scan showed a fracture in her hipbone.", zh: "扫描显示她的髋骨出现了骨折。" };
  const updated = {
    ...original,
    revision: original.revision + 1,
    updatedAt: new Date().toISOString(),
    originalInput: "hipbone",
    term: "hipbone",
    normalized: "hipbone",
    standardForm: "hipbone",
    correction: { ...original.correction, original: "hipbone", chosen: "hipbone", suggestion: "" },
    phonetic: "/ˈhɪpboʊn/",
    partOfSpeech: "noun",
    meaning: `noun：${updatedMeaning}`,
    definition: `noun: ${updatedDefinition}`,
    senses: [{
      ...original.senses[0],
      partOfSpeech: "noun",
      meaningZh: updatedMeaning,
      definitionEn: updatedDefinition,
      usageNotes: "",
      register: "general",
      collocations: ["hipbone fracture"],
      examples: [updatedExample],
      confusables: []
    }],
    collocations: ["hipbone fracture"],
    exampleEn: updatedExample.en,
    exampleZh: updatedExample.zh,
    usage: "",
    register: "general",
    confusedWith: [],
    forms: ["hipbones"]
  };
  snapshot.entries[1].synonymScan = {
    ...pendingSynonymScan(snapshot.entries[1], snapshot.entries), status: "complete", reason: ""
  };
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  let calls = 0;
  let scans = 0;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    scans += 1;
    await route.fulfill({ status: 410, json: { error: { code: "feature_paused", message: "同义词功能已暂停" } } });
  });
  await page.route("**/api/v1/owner/wordbook", async (route) => {
    calls += 1;
    if (calls > 1) {
      await refreshGate;
      snapshot.entries[0] = updated;
    }
    await route.fulfill({ json: { snapshot, sha: (calls > 1 ? "c" : "a").repeat(40) } });
  });
  try {
    await page.goto("/owner.html");
    await expect.poll(() => calls).toBe(1);
    const button = page.locator(`button[data-entry-id="${original.id}"][data-entry-action="detail"]`);
    const row = page.locator(".owner-entry-row").filter({ has: button });
    const edit = row.getByRole("button", { name: "编辑", exact: true });
    await expect(button).toHaveAccessibleName(`查看 ${original.term} 的完整词条`);
    const originalButton = await button.elementHandle();
    const originalEdit = await edit.elementHandle();
    expect(originalButton).not.toBeNull();
    expect(originalEdit).not.toBeNull();
    await page.locator("#refresh-remote").click();
    await expect.poll(() => calls).toBe(2);
    releaseRefresh();
    await expect(button).toHaveAccessibleName("查看 hipbone 的完整词条");
    await expect(row.locator(".owner-entry-synonym-status")).toBeHidden();
    await expect(row.getByRole("button", { name: "重新识别 hipbone 的同义词", exact: true })).toHaveCount(0);
    await expect(row.locator(".owner-entry-part-of-speech + p")).toContainText(updatedMeaning);
    expect(await button.evaluate((current, previous) => current === previous, originalButton)).toBe(true);
    expect(await edit.evaluate((current, previous) => current === previous, originalEdit)).toBe(true);

    await button.click();
    const dialog = page.locator("#entry-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "hipbone", exact: true })).toBeVisible();
    await expect(dialog.locator("#dialog-meaning")).toContainText(updatedMeaning);
    await expect(dialog.locator("article.detail-sense")).toHaveCount(1);
    await expect(dialog.locator(".sense-meaning-zh > p")).toHaveText(updatedMeaning);
    await expect(dialog.locator(".sense-definition-en > p")).toHaveText(updatedDefinition);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();

    await edit.click();
    await expect(page.getByLabel("发布词条", { exact: true })).toHaveValue(updated.term);
    await expect(page.getByLabel("标准形式", { exact: true })).toHaveValue(updated.standardForm);
    await expect(page.getByLabel("中文释义", { exact: true })).toHaveValue(updated.meaning);
    await expect(page.getByLabel("英文释义", { exact: true })).toHaveValue(updated.definition);
    await expect(page.getByLabel("英文例句", { exact: true })).toHaveValue(updated.exampleEn);
    expect(calls).toBe(2);
    expect(scans).toBe(0);
  } finally {
    releaseRefresh();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("列表连续筛选移除所有不匹配行，零结果后清空搜索恢复完整顺序", async ({ page }) => {
  const snapshot = importedFixture(3);
  const terms = snapshot.entries.map((entry) => entry.term);
  expect(new Set(terms).size).toBe(3);
  for (const entry of snapshot.entries) {
    entry.synonymScan = { ...pendingSynonymScan(entry, snapshot.entries), status: "complete", reason: "" };
  }
  await serveSnapshot(page, snapshot);
  await page.goto("/owner.html");
  const rows = page.locator(".owner-entry-row");
  const labels = rows.locator(".owner-entry-term-button > strong");
  const search = page.locator("#owner-search");
  await expect(rows).toHaveCount(3);
  await expect(labels).toHaveText(terms);
  const originalRows = await rows.elementHandles();

  // Removing two consecutive siblings catches iteration over a live
  // HTMLCollection, where removing the first node can skip the next one.
  await search.fill(terms[2]);
  await expect(rows).toHaveCount(1);
  await expect(labels).toHaveText([terms[2]]);
  expect(await rows.evaluate((current, original) => current === original, originalRows[2])).toBe(true);
  expect(await originalRows[0].evaluate((row) => row.isConnected)).toBe(false);
  expect(await originalRows[1].evaluate((row) => row.isConnected)).toBe(false);

  await search.fill("no-entry-matches-e2e-filter");
  await expect(rows).toHaveCount(0);
  expect(await originalRows[2].evaluate((row) => row.isConnected)).toBe(false);

  await search.clear();
  await expect(rows).toHaveCount(3);
  await expect(labels).toHaveText(terms);
  await expect(page.locator("#owner-entry-count")).toHaveText("3");
  expect(await rows.locator(".owner-entry-term-button").evaluateAll((buttons) => (
    buttons.map((button) => button.dataset.entryId)
  ))).toEqual(snapshot.entries.map((entry) => entry.id));
});

test("预填的前台输入暂停自动识别，保留来源说明、输入和焦点", async ({ page }) => {
  const snapshot = importedFixture();
  await serveSnapshot(page, snapshot);
  await page.clock.install();
  const writes = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/")) writes.push(request.url());
  });
  let calls = 0;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    calls += 1;
    await route.fulfill({ status: 503, json: { error: { code: "ai_unavailable", message: "服务暂不可用" } } });
  });
  await page.goto("/owner.html?input=hip");
  await expect(page.locator("#capture-status")).toContainText("尚未调用 AI，也没有建立或发布草稿");
  const inputMessage = await page.locator("#capture-status").textContent();
  // Run beyond the 50 ms background scheduler after startup has consumed the
  // handoff. Nonempty foreground input must reserve the owner's attention.
  await page.clock.runFor(200);
  await expect(page.locator("#capture-status")).toHaveText(inputMessage);
  await expect(page.getByLabel("英文内容")).toHaveValue("hip");
  await expect(page.getByLabel("英文内容")).toBeFocused();
  await expect(page.locator("#draft-list > button")).toHaveCount(0);
  expect(calls).toBe(0);
  expect(writes).toEqual([]);
});

test("空白输入页不再启动同义词识别，保留输入提示和焦点", async ({ page }) => {
  const snapshot = importedFixture();
  await serveSnapshot(page, snapshot);
  await page.clock.install();
  let calls = 0;
  await page.route("**/api/v1/owner/synonyms", async (route) => {
    calls += 1;
    await route.fulfill({ status: 410, json: { error: { code: "feature_paused", message: "同义词功能已暂停" } } });
  });
  await page.goto("/owner.html");
  await expect(page.locator("#owner-entry-count")).toHaveText("2");
  const inputMessage = await page.locator("#capture-status").textContent();
  await page.getByLabel("英文内容").focus();
  await page.clock.runFor(200);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.clock.runFor(200);
  await expect(page.locator("#sync-detail")).not.toContainText("同义词");
  await expect(page.locator("#capture-status")).toHaveText(inputMessage);
  await expect(page.getByLabel("英文内容")).toHaveValue("");
  await expect(page.getByLabel("英文内容")).toBeFocused();
  await expect(page.locator("#draft-list > button")).toHaveCount(0);
  expect(calls).toBe(0);
});

test("已暂停扫描接口仍验证身份与 CSRF，拒绝旧客户端且不改远端快照", async ({ context }) => {
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
  expect(response.status()).toBe(409);
  const result = await response.json();
  expect(result.error.code).toBe("synonym_feature_paused");
  const current = await (await context.request.get("/api/v1/owner/wordbook")).json();
  expect(current.sha).toBe(initial.sha);
  expect(current.snapshot).toEqual(initial.snapshot);
});
