import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBlankEntry, validatePublicEntry } from "../../../vocab/js/wordbook-schema.js";

const baseline = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });

async function openEditor(context, page, info, { pauseDebounce = false, failures = 0 } = {}) {
  const run = `backup-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 32);
  await context.addCookies([
    { name: "e2e_run", value: run, url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ pauseDebounce, failures }) => {
    if (pauseDebounce) {
      const schedule = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 400) window.__ownerDraftTimerCallback = () => callback(...args);
        return schedule(callback, delay === 400 ? 60_000 : delay, ...args);
      };
    }
    const put = IDBObjectStore.prototype.put;
    window.__ownerBackupWrites = 0;
    window.__ownerBackupFailures = failures;
    IDBObjectStore.prototype.put = function (record, ...args) {
      if (this.name === "drafts" && String(record?.value?.usage || "").startsWith("备份测试")) {
        window.__ownerBackupWrites += 1;
        if (window.__ownerBackupFailures > 0) {
          window.__ownerBackupFailures -= 1;
          throw new DOMException("Test storage quota exhausted", "QuotaExceededError");
        }
      }
      return put.call(this, record, ...args);
    };
  }, { pauseDebounce, failures });
  const entry = validatePublicEntry({
    ...createBlankEntry("alpha"), id: "backup-test-alpha", partOfSpeech: "noun", meaning: "测试词义", definition: "A test word.",
    usage: "之前保存的内容", exampleEn: "This is a test word.", exampleZh: "这是一个测试词。", organizationMethod: "manual"
  });
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({ json: { snapshot: { ...baseline, entries: [entry] }, sha: "a".repeat(40) } }));
  await page.goto(`/owner.html?e2e=1&testRun=${run}`);
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect(page.locator("#owner-entry-count")).toHaveText("1");
  await page.locator(".backup-panel > summary").click();
  await page.locator(".owner-entry-row").getByRole("button", { name: "编辑", exact: true }).click();
  return errors;
}

async function backupJson(page) {
  const downloading = page.waitForEvent("download");
  await page.locator("#export-backup").click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  return JSON.parse(await readFile(await download.path(), "utf8"));
}

test("export flushes the newest editor input before the debounce timer can run", async ({ context, page }, info) => {
  const errors = await openEditor(context, page, info, { pauseDebounce: true });
  await page.locator("#field-usage").fill("备份测试：刚输入就导出，也必须包含这段修改。");
  expect(await page.evaluate(() => window.__ownerBackupWrites)).toBe(0);
  const backup = await backupJson(page);
  expect(backup.drafts).toHaveLength(1);
  expect(backup.drafts[0].value.usage).toBe("备份测试：刚输入就导出，也必须包含这段修改。");
  expect(await page.evaluate(() => window.__ownerBackupWrites)).toBe(1);
  expect(errors).toEqual([]);
});

test("deleting a dirty draft flushes then removes it and a late debounce cannot recreate it", async ({ context, page }, info) => {
  const errors = await openEditor(context, page, info, { pauseDebounce: true });
  await page.locator("#field-usage").fill("备份测试：删除之前仍然没有运行防抖保存。");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#discard-draft").click();
  await expect(page.locator("#entry-form")).toBeHidden();
  await expect(page.locator("#draft-list .draft-item")).toHaveCount(0);
  await page.evaluate(async () => {
    window.__ownerDraftTimerCallback?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const remaining = await page.evaluate(async () => (await import("/js/owner-storage.js?v=74")).listDrafts());
  expect(remaining).toEqual([]);
  expect(await page.evaluate(() => window.__ownerBackupWrites)).toBe(1);
  await expect(page.locator("#owner-workspace")).not.toHaveAttribute("inert", "");
  expect(errors).toEqual([]);
});

test("a save failure blocks draft deletion, preserves input, and permits a safe retry", async ({ context, page }, info) => {
  const errors = await openEditor(context, page, info, { pauseDebounce: true, failures: 1 });
  await page.locator("#field-usage").fill("备份测试：删除失败时仍要保留这份输入。");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#discard-draft").click();
  await expect(page.locator("#editor-error")).toContainText("删除未完成");
  await expect(page.locator("#entry-form")).toBeVisible();
  await expect(page.locator("#field-usage")).toHaveValue("备份测试：删除失败时仍要保留这份输入。");
  await expect(page.locator("#draft-list .draft-item")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#discard-draft").click();
  await expect(page.locator("#entry-form")).toBeHidden();
  await expect(page.locator("#draft-list .draft-item")).toHaveCount(0);
  expect(await page.evaluate(() => window.__ownerBackupWrites)).toBe(2);
  expect(errors).toEqual([]);
});

test("failed autosave and export retain the pending edit until a later export really saves it", async ({ context, page }, info) => {
  const errors = await openEditor(context, page, info, { failures: 2 });
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.locator("#field-usage").fill("备份测试：存储恢复后仍然必须导出这段最新输入。");
  await expect(page.locator("#editor-error")).toContainText("本地保存失败");
  expect(await page.evaluate(() => window.__ownerBackupWrites)).toBe(1);
  await page.locator("#export-backup").click();
  await expect(page.locator("#capture-status")).toContainText("导出失败");
  expect(await page.evaluate(() => window.__ownerBackupWrites)).toBe(2);
  expect(downloads).toHaveLength(0);
  const backup = await backupJson(page);
  expect(backup.drafts[0].value.usage).toBe("备份测试：存储恢复后仍然必须导出这段最新输入。");
  expect(await page.evaluate(() => window.__ownerBackupWrites)).toBe(3);
  expect(downloads).toHaveLength(1);
  await expect(page.locator("#capture-status")).toContainText("草稿备份已导出");
  expect(errors).toEqual([]);
});
