import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ORIGIN = "http://127.0.0.1:4187";
const STORAGE_MODULE = "/js/quick-notes-storage.js?v=76";
const CANONICAL_COUNT = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8")).entries.length;

test.beforeEach(async ({ context, page }, info) => {
  const run = `notes-${createHash("sha256").update(info.testId).digest("hex").slice(0, 22)}`;
  await context.addCookies([{ name: "e2e_run", value: run, url: ORIGIN, sameSite: "Lax" }]);
  page.on("pageerror", error => { throw new Error(`Unhandled quick-notes regression: ${error.message}`); });
});

function runId(info) { return `notes-${createHash("sha256").update(info.testId).digest("hex").slice(0, 22)}`; }
function notesUrl(info) { return `/quick-notes.html?e2e=1&testRun=${runId(info)}`; }

async function saved(page) {
  await expect(page.locator("#quick-notes-save-status")).toHaveAttribute("data-state", "saved");
  await expect(page.locator("#quick-notes-error")).toBeHidden();
}

async function openNotes(page, info) {
  await page.goto(notesUrl(info));
  await saved(page);
}

async function notes(page) {
  return page.evaluate(async path => (await import(path)).quickNotesStorage.listQuickNotes(), STORAGE_MODULE);
}

async function downloadText(page, selector) {
  const pending = page.waitForEvent("download");
  await page.locator(selector).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return { text: await readFile(await download.path(), "utf8"), name: download.suggestedFilename() };
}

async function backupControls(page) {
  const details = page.locator(".notes-backup");
  if (!await details.evaluate(element => element.open)) await details.locator("summary").click();
}

async function importBackup(page, value) {
  await backupControls(page);
  await page.locator("#quick-notes-import-file").setInputFiles({
    name: "quick-notes-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value))
  });
}

async function openOldPages(page) {
  const details = page.locator("#quick-notes-pages");
  if (!await details.evaluate(element => element.open)) await details.locator("summary").click();
}

async function protectedStores(page, seed = false) {
  return page.evaluate(async seed => {
    const { openDatabase } = await import("/js/owner-storage.js?v=76");
    const database = await openDatabase();
    if (seed) {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(["drafts", "reviewStates"], "readwrite");
        transaction.objectStore("drafts").put({ id: "notes-protected-draft", text: "Never publish this private fixture" });
        transaction.objectStore("reviewStates").put({ entryId: "notes-protected-review", reviewCount: 7, marker: "keep existing learning" });
        transaction.oncomplete = resolve;
        transaction.onabort = () => reject(transaction.error);
      });
    }
    return Object.fromEntries(await Promise.all(["entries", "drafts", "outbox", "reviewStates"].map(name => new Promise((resolve, reject) => {
      const transaction = database.transaction(name, "readonly");
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => resolve([name, request.result]);
      request.onerror = () => reject(request.error);
    }))));
  }, seed);
}

async function holdNextSave(page) {
  await page.evaluate(async path => {
    const storage = (await import(path)).quickNotesStorage;
    const save = storage.saveQuickNote.bind(storage);
    let held = false;
    storage.saveQuickNote = candidate => {
      if (held) return save(candidate);
      held = true;
      globalThis.__notesSaveHeld = true;
      return new Promise((resolve, reject) => {
        globalThis.__releaseNotesSave = () => save(candidate).then(resolve, reject);
      });
    };
  }, STORAGE_MODULE);
}

test("an unauthenticated blank page immediately records exact multiline text locally without lookup or changing vocabulary and learning", async ({ page, context }, info) => {
  const apiRequests = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url()); });
  const canonicalBefore = await (await context.request.get("/api/v1/public/wordbook")).json();
  expect(canonicalBefore.entries).toHaveLength(CANONICAL_COUNT);
  await openNotes(page, info);
  const protectedBefore = await protectedStores(page, true);
  const text = "  by some fluke  \n\n听到的词先记下来：不要查询\n<script>window.__notesXss = true</script>\n";
  await page.locator("#quick-notes-text").fill(text);
  await page.locator("#quick-notes-text").press("Enter");
  await saved(page);
  await expect(page.locator("#quick-notes-text")).toHaveValue(`${text}\n`);
  expect((await notes(page)).map(note => note.text)).toEqual([`${text}\n`]);
  await page.reload();
  await saved(page);
  await expect(page.locator("#quick-notes-text")).toHaveValue(`${text}\n`);
  expect(await page.evaluate(() => Boolean(globalThis.__notesXss))).toBe(false);
  expect(await protectedStores(page)).toEqual(protectedBefore);
  expect(await (await context.request.get("/api/v1/public/wordbook")).json()).toEqual(canonicalBefore);
  expect(apiRequests).toEqual([]);
  expect((await context.cookies()).some(cookie => cookie.name === "e2e_auth")).toBe(false);
});

test("new pages remain separate and copy or txt export preserves literal text during the user gesture", async ({ page }, info) => {
  await openNotes(page, info);
  const first = "by some fluke\n  context / 偶然听到  \n";
  await page.locator("#quick-notes-text").fill(first);
  await saved(page);
  await page.locator("#quick-notes-new").click();
  await expect(page.locator("#quick-notes-text")).toHaveValue("");
  await page.locator("#quick-notes-new").click();
  expect(await notes(page)).toHaveLength(2);
  await page.locator("#quick-notes-text").fill("a second page\n另外一页");
  await saved(page);
  await openOldPages(page);
  await page.locator("#quick-notes-list button").filter({ hasText: "by some fluke" }).click();
  await expect(page.locator("#quick-notes-text")).toHaveValue(first);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => {
      globalThis.__copiedNotes = text;
      globalThis.__notesCopyActivated = navigator.userActivation.isActive;
    } } });
  });
  await page.locator("#quick-notes-copy").click();
  await expect(page.locator("#quick-notes-message")).toContainText("没有自动发送");
  expect(await page.evaluate(() => ({ text: globalThis.__copiedNotes, activated: globalThis.__notesCopyActivated }))).toEqual({ text: first, activated: true });
  const exported = await downloadText(page, "#quick-notes-export-text");
  expect(exported.name).toMatch(/\.txt$/);
  expect(exported.text).toBe(first);
  expect((await notes(page)).map(note => note.text).sort()).toEqual([first, "a second page\n另外一页"].sort());
});

test("failed local writes retain unsaved text and rescue exports while refusing new pages or switches until retry succeeds", async ({ page }, info) => {
  await openNotes(page, info);
  await page.locator("#quick-notes-text").fill("the older page");
  await saved(page);
  await page.locator("#quick-notes-new").click();
  await page.locator("#quick-notes-text").fill("current saved version");
  await saved(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    globalThis.__failNotesWrites = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "notes" && globalThis.__failNotesWrites) throw new DOMException("Simulated notes quota", "QuotaExceededError");
      return put.apply(this, args);
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { globalThis.__rescuedNotes = text; } } });
  });
  const rescue = "by some fluke\n尚未保存的第二行  ";
  await page.locator("#quick-notes-text").fill(rescue);
  await expect(page.locator("#quick-notes-save-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#quick-notes-retry")).toBeVisible();
  await expect(page.locator("#quick-notes-error")).toContainText("未保存");
  await page.locator("#quick-notes-new").click();
  await expect(page.locator("#quick-notes-text")).toHaveValue(rescue);
  expect(await notes(page)).toHaveLength(2);
  await openOldPages(page);
  await page.locator("#quick-notes-list button").filter({ hasText: "the older page" }).click();
  await expect(page.locator("#quick-notes-text")).toHaveValue(rescue);
  await expect(page.locator("#quick-notes-save-status")).toHaveAttribute("data-state", "error");
  await page.locator("#quick-notes-copy").click();
  expect(await page.evaluate(() => globalThis.__rescuedNotes)).toBe(rescue);
  expect((await downloadText(page, "#quick-notes-export-text")).text).toBe(rescue);
  expect((await notes(page)).some(note => note.text === rescue)).toBe(false);
  await page.evaluate(() => { globalThis.__failNotesWrites = false; });
  await page.locator("#quick-notes-retry").click();
  await saved(page);
  expect((await notes(page)).some(note => note.text === rescue)).toBe(true);
  await page.reload();
  await saved(page);
  await expect(page.locator("#quick-notes-text")).toHaveValue(rescue);
});

test("typing during a delayed initial getAll cannot be overwritten by the previously saved page", async ({ page }, info) => {
  await openNotes(page, info);
  await page.locator("#quick-notes-text").fill("an older saved note");
  await saved(page);
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    let intercepted = false;
    IDBDatabase.prototype.transaction = function (...args) {
      const result = transaction.apply(this, args);
      if (intercepted || !this.name.startsWith("wordbook-quick-notes") || args[1] !== "readonly") return result;
      intercepted = true;
      return new Proxy(result, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, key, value) {
          if (key !== "oncomplete" || typeof value !== "function") return Reflect.set(target, key, value, target);
          target.oncomplete = event => {
            globalThis.__notesInitialReadHeld = true;
            globalThis.__releaseNotesInitialRead = () => value.call(target, event);
          };
          return true;
        }
      });
    };
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__notesInitialReadHeld))).toBe(true);
  const fresh = "by some fluke\n新听到的，立即写";
  await page.locator("#quick-notes-text").fill(fresh);
  await expect(page.locator("#quick-notes-save-status")).toHaveAttribute("data-state", "pending");
  await page.evaluate(() => { globalThis.__releaseNotesInitialRead(); });
  await saved(page);
  await expect(page.locator("#quick-notes-text")).toHaveValue(fresh);
  expect((await notes(page)).map(note => note.text).sort()).toEqual(["an older saved note", fresh].sort());
});

test("a slow serial save never replaces newer typing and persists the final text before page navigation", async ({ page }, info) => {
  await openNotes(page, info);
  await holdNextSave(page);
  await page.locator("#quick-notes-text").fill("first in-flight text");
  await expect.poll(() => page.evaluate(() => Boolean(globalThis.__notesSaveHeld))).toBe(true);
  const newest = "first in-flight text\nnewer words typed while saving\nby some fluke";
  await page.locator("#quick-notes-text").fill(newest);
  await page.evaluate(() => { globalThis.__releaseNotesSave(); });
  await saved(page);
  await expect(page.locator("#quick-notes-text")).toHaveValue(newest);
  expect((await notes(page)).map(note => note.text)).toEqual([newest]);
  await page.locator("#quick-notes-new").click();
  await expect(page.locator("#quick-notes-text")).toHaveValue("");
  await openOldPages(page);
  await page.locator("#quick-notes-list button").filter({ hasText: "first in-flight text" }).click();
  await expect(page.locator("#quick-notes-text")).toHaveValue(newest);
});

test("two tabs editing one page preserve both versions as a conflict copy", async ({ page, context }, info) => {
  await openNotes(page, info);
  await page.locator("#quick-notes-text").fill("shared starting note");
  await saved(page);
  const second = await context.newPage();
  await openNotes(second, info);
  await expect(second.locator("#quick-notes-text")).toHaveValue("shared starting note");
  await holdNextSave(second);
  await second.locator("#quick-notes-text").fill("tab two's independently typed words");
  await expect.poll(() => second.evaluate(() => Boolean(globalThis.__notesSaveHeld))).toBe(true);
  await page.locator("#quick-notes-text").fill("tab one's independently typed words");
  await saved(page);
  await expect(second.locator("#quick-notes-text")).toHaveValue("tab two's independently typed words");
  await second.evaluate(() => { globalThis.__releaseNotesSave(); });
  await saved(second);
  await expect(second.locator("#quick-notes-message")).toContainText("两份内容都保留");
  const preserved = await notes(second);
  expect(preserved).toHaveLength(2);
  expect(preserved.map(note => note.text).sort()).toEqual(["tab one's independently typed words", "tab two's independently typed words"].sort());
  expect(new Set(preserved.map(note => note.id)).size).toBe(2);
  await second.close();
});

test("JSON backup includes latest text, repeated imports are idempotent, and older different text is restored separately", async ({ page }, info) => {
  await openNotes(page, info);
  const original = "by some fluke\noriginal notes";
  await page.locator("#quick-notes-text").fill(original);
  await backupControls(page);
  const backup = JSON.parse((await downloadText(page, "#quick-notes-export-backup")).text);
  expect(backup.format).toBe("zhuo-quick-notes");
  expect(backup.notes.map(note => note.text)).toEqual([original]);
  expect(Object.keys(backup).sort()).toEqual(["exportedAt", "format", "notes", "schemaVersion"]);
  await importBackup(page, backup);
  await expect(page.locator("#quick-notes-message")).toContainText("跳过 1 页重复内容");
  expect(await notes(page)).toHaveLength(1);
  const current = "newer current text\n不要覆盖";
  await page.locator("#quick-notes-text").fill(current);
  await saved(page);
  await importBackup(page, backup);
  await expect(page.locator("#quick-notes-message")).toContainText("另存 1 页不同版本");
  await expect(page.locator("#quick-notes-text")).toHaveValue(current);
  expect((await notes(page)).map(note => note.text).sort()).toEqual([original, current].sort());
  await importBackup(page, backup);
  await expect(page.locator("#quick-notes-message")).toContainText("跳过 1 页重复内容");
  expect(await notes(page)).toHaveLength(2);
  await expect(page.locator("#quick-notes-text")).toHaveValue(current);
});

test("after PWA readiness the first offline notes visit with query parameters opens the notes shell and retains edits across reload", async ({ page, context }, info) => {
  await page.goto("/");
  await expect(page.locator("#entry-count")).toHaveText(String(CANONICAL_COUNT));
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.goto(`${notesUrl(info)}&offlineFirst=1`);
    await saved(page);
    await expect(page.locator("#quick-notes-title")).toHaveText("随手记");
    await expect(page.locator("#library-search")).toHaveCount(0);
    await page.locator("#quick-notes-text").fill("by some fluke\n离线第一次打开也能写");
    await saved(page);
    await page.reload();
    await saved(page);
    await expect(page.locator("#quick-notes-text")).toHaveValue("by some fluke\n离线第一次打开也能写");
  } finally { await context.setOffline(false); }
});

for (const width of [360, 390]) {
  test(`the ${width}px mobile notes editor and public entry point fit without horizontal overflow`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator("#entry-count")).toHaveText(String(CANONICAL_COUNT));
    const entry = page.locator(".topbar .quick-notes-link");
    await expect(entry).toBeVisible();
    await entry.click();
    await saved(page);
    await expect(page.locator("#quick-notes-title")).toHaveText("随手记");
    await expect(page.getByRole("link", { name: "返回词库", exact: true })).toBeVisible();
    // The ordinary entry link intentionally has no test query. Prove that it
    // opens correctly, then isolate all fixture typing in the test-only DB.
    await page.goto(notesUrl(info));
    await saved(page);
    const text = "by some fluke\n听到一个词，先记在这里。\n稍后再整理";
    await page.locator("#quick-notes-text").fill(text);
    await saved(page);
    const geometry = await page.evaluate(() => {
      const textarea = document.querySelector("#quick-notes-text");
      const box = textarea.getBoundingClientRect();
      const header = document.querySelector(".notes-topbar").getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, fontSize: Number.parseFloat(getComputedStyle(textarea).fontSize), left: box.left, right: box.right, top: box.top, headerRight: header.right };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(width);
    expect(geometry.fontSize).toBeGreaterThanOrEqual(16);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.headerRight).toBeLessThanOrEqual(width);
    expect(geometry.top).toBeLessThan(300);
    if (width === 390) {
      const path = resolve("qa-artifacts/quick-notes-mobile.png");
      await mkdir(dirname(path), { recursive: true });
      await page.screenshot({ path, fullPage: true });
    }
  });
}

test("desktop notes remain compact and produce a reviewable screenshot", async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNotes(page, info);
  await page.locator("#quick-notes-text").fill("by some fluke\n\n听到的词先记下来，不必等查词。\n下一次再把这一页发给 ChatGPT 整理。");
  await saved(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const path = resolve("qa-artifacts/quick-notes-desktop.png");
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
});

test("management and manual entries point to the single Pages notes origin without navigating to production", async ({ page }) => {
  for (const path of ["/owner.html", "/guide.html"]) {
    await page.goto(path);
    await expect(page.locator("a.quick-notes-link")).toHaveAttribute("href", "https://zhuodashuai.github.io/vocab/quick-notes.html");
  }
});
