import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBlankEntry, validatePublicEntry } from "../../../vocab/js/wordbook-schema.js";

const baseline = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context, page }, info) => {
  const run = `publish-edit-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 32);
  await context.addCookies([
    { name: "e2e_run", value: run, url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled publish/edit race: ${error.message}`); });
  await page.addInitScript(() => {
    // Keep the genuine input/save boundary open deterministically. The owner
    // can still flush it through Save local; no production code is patched.
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => schedule(callback, delay === 400 ? 60_000 : delay, ...args);
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args);
      if (this.name !== "drafts" || this.transaction.mode !== "readonly" || !window.__holdPublishedDraftRead) return request;
      window.__holdPublishedDraftRead = false;
      return new Proxy(request, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, key, value) {
          if (key !== "onsuccess" || typeof value !== "function") return Reflect.set(target, key, value, target);
          target.onsuccess = (event) => {
            window.__publishedDraftReadHeld = true;
            window.__releasePublishedDraftRead = () => value.call(target, event);
          };
          return true;
        }
      });
    };
  });
});

async function ownerReady(page, info) {
  const entries = ["alpha", "beta"].map((term, index) => validatePublicEntry({
    ...createBlankEntry(term), id: `publish-edit-word-${index}`, partOfSpeech: "noun", meaning: "测试词义", definition: "A test word.",
    usage: `${term} 之前保存的内容`, exampleEn: "This is a test word.", exampleZh: "这是一个测试词。", organizationMethod: "manual"
  }));
  const snapshot = { ...structuredClone(baseline), entries };
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({ json: { snapshot, sha: "a".repeat(40) } }));
  const run = `publish-edit-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 32);
  await page.goto(`/owner.html?e2e=1&testRun=${run}`);
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect(page.locator("#owner-entry-count")).toHaveText("2");
  return snapshot;
}

async function editPublished(page, term) {
  await page.locator(".owner-entry-row", { has: page.getByRole("button", { name: `查看 ${term} 的完整词条`, exact: true }) })
    .getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator("#field-term")).toHaveValue(term);
}

async function holdPublication(page, snapshot, { holdCompletionRead = false } = {}) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const writes = [];
  await page.route("**/api/v1/owner/publish", async (route) => {
    const request = route.request().postDataJSON();
    writes.push(request);
    await gate;
    const entry = request.mutation.entry;
    snapshot.entries = snapshot.entries.map((candidate) => candidate.id === entry.id ? entry : candidate);
    snapshot.lastMutationId = request.mutationId;
    if (holdCompletionRead) await page.evaluate(() => { window.__holdPublishedDraftRead = true; });
    await route.fulfill({ json: { snapshot, sha: "c".repeat(40), entry, action: "updated" } });
  });
  return { writes, release };
}

async function savedDrafts(page) {
  return page.evaluate(async () => (await import("/js/owner-storage.js")).listDrafts());
}

test("publication completing inside the input debounce preserves the live form and later edits", async ({ page }, info) => {
  const snapshot = await ownerReady(page, info);
  await editPublished(page, "alpha");
  const publication = await holdPublication(page, snapshot);
  try {
    await page.locator("#field-usage").fill("本次明确发布的旧版本。");
    await page.locator("#publish-button").click();
    await expect.poll(() => publication.writes.length).toBe(1);
    await page.locator("#field-usage").fill("网络请求期间刚输入、尚未防抖保存的新笔记。");
    publication.release();
    await expect(page.locator("#sync-label")).toHaveText("较早版本已发布；当前修改仍在本地");
    await expect(page.locator("#field-usage")).toHaveValue("网络请求期间刚输入、尚未防抖保存的新笔记。");
    expect(snapshot.entries[0].usage).toBe("本次明确发布的旧版本。");
    await page.locator("#save-local").click();
    await expect.poll(async () => (await savedDrafts(page))[0].value.usage).toBe("网络请求期间刚输入、尚未防抖保存的新笔记。");
    await page.locator("#field-example-zh").fill("下一处修改不能把旧笔记带回本地词库。");
    await page.locator("#save-local").click();
    await expect.poll(async () => (await savedDrafts(page))[0].value.exampleZh).toBe("下一处修改不能把旧笔记带回本地词库。");
    const draft = (await savedDrafts(page))[0];
    expect(draft.value.usage).toBe("网络请求期间刚输入、尚未防抖保存的新笔记。");
    expect(draft.localState).toBe("local_saved");
    expect(publication.writes).toHaveLength(1);
    const operations = await page.evaluate(async () => (await import("/js/owner-storage.js")).listOutbox({ includeCompleted: true }));
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe("published");
  } finally {
    publication.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("a newer durable edit is not replaced by an older completion read", async ({ page }, info) => {
  const snapshot = await ownerReady(page, info);
  await editPublished(page, "alpha");
  const publication = await holdPublication(page, snapshot, { holdCompletionRead: true });
  try {
    await page.locator("#field-usage").fill("已经发布的版本。");
    await page.locator("#publish-button").click();
    await expect.poll(() => publication.writes.length).toBe(1);
    publication.release();
    await expect.poll(() => page.evaluate(() => Boolean(window.__publishedDraftReadHeld))).toBe(true);
    await page.locator("#field-usage").fill("发布结束读取期间又写下并保存的版本。");
    await page.locator("#save-local").click();
    await expect.poll(async () => (await savedDrafts(page))[0].value.usage).toBe("发布结束读取期间又写下并保存的版本。");
    await page.evaluate(() => window.__releasePublishedDraftRead());
    await expect(page.locator("#publish-button")).toBeEnabled();
    await expect(page.locator("#field-usage")).toHaveValue("发布结束读取期间又写下并保存的版本。");
    await expect(page.locator("#sync-label")).toHaveText("较早版本已发布；当前修改仍在本地");
    expect(publication.writes).toHaveLength(1);
  } finally {
    publication.release();
    await page.evaluate(() => window.__releasePublishedDraftRead?.());
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("switching drafts during the completion read cannot pull the editor back", async ({ page }, info) => {
  const snapshot = await ownerReady(page, info);
  await editPublished(page, "beta");
  await editPublished(page, "alpha");
  const publication = await holdPublication(page, snapshot, { holdCompletionRead: true });
  try {
    await page.locator("#field-usage").fill("只发布 alpha 的版本。");
    await page.locator("#publish-button").click();
    await expect.poll(() => publication.writes.length).toBe(1);
    publication.release();
    await expect.poll(() => page.evaluate(() => Boolean(window.__publishedDraftReadHeld))).toBe(true);
    await page.locator("#draft-list .draft-item").filter({ has: page.locator("strong", { hasText: /^beta$/ }) }).click();
    await expect(page.locator("#field-term")).toHaveValue("beta");
    await page.evaluate(() => window.__releasePublishedDraftRead());
    await expect(page.locator("#publish-button")).toBeEnabled();
    await expect(page.locator("#field-term")).toHaveValue("beta");
    await expect(page.locator("#field-usage")).toHaveValue("beta 之前保存的内容");
    expect(publication.writes).toHaveLength(1);
    const drafts = await savedDrafts(page);
    expect(drafts.find((draft) => draft.value.term === "alpha").localState).toBe("published");
    expect(drafts.find((draft) => draft.value.term === "beta").value.usage).toBe("beta 之前保存的内容");
  } finally {
    publication.release();
    await page.evaluate(() => window.__releasePublishedDraftRead?.());
    await page.unrouteAll({ behavior: "wait" });
  }
});
