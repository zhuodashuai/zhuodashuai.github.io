import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const bookId = "never-let-me-go";
const membership = (chapter) => `collection:${bookId}:chapter-${chapter}`;
const agitated = snapshot.entries.find((entry) => entry.term === "agitated");
const shrug = snapshot.entries.find((entry) => entry.term === "shrug");
const meandering = snapshot.entries.find((entry) => entry.term === "meandering"
  && entry.tags.includes(membership(2)) && entry.tags.includes(membership(10)));

// Deliberately synthetic source text: these fixtures test wiring, not the
// accuracy of the real PDF transcription (validated separately by data QA).
function passage(id, chapter, entry, text, featured = true) {
  return { id, bookId, chapterId: `chapter-${chapter}`, text, translation: "这是自动化测试的参考译意。", note: "测试用摘句。",
    source: { title: "Never Let Me Go", edition: "Controlled test edition", pdfPage: chapter + 10, printedPage: String(chapter + 2) },
    featured, links: [{ entryId: entry.id, membership: membership(chapter) }] };
}

const fixture = {
  schemaVersion: 1,
  books: [{ id: bookId, title: "Never Let Me Go", author: "Kazuo Ishiguro", editionNote: "Controlled test edition" }],
  passages: [
    passage("fixture-agitated-c1", 1, agitated, "The donor seemed agitated in this controlled source fixture."),
    passage("fixture-shrug-c1", 1, shrug, "A shrug appears in the second controlled source fixture.", false),
    passage("fixture-meandering-c2", 2, meandering, "Their meandering talks belong to the Chapter 2 source fixture."),
    passage("fixture-meandering-c10", 10, meandering, "The meandering discussions belong to the Chapter 10 source fixture.")
  ]
};

test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context, page }, info) => {
  const run = `passages-${info.testId}`.replace(/[^a-z0-9-]/giu, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled book passage error: ${error.message}`); });
});

async function provide(page, data = fixture) {
  await page.route("**/data/book-passages.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) }));
}

async function openCard(page, term) {
  await page.getByRole("button", { name: `查看 ${term} 的完整词条`, exact: true }).click();
  await expect(page.locator("#dialog-term")).toHaveText(term);
}

async function noLearningChanges(page) {
  return page.evaluate(async () => ({
    reviews: await (await import("/js/owner-storage.js")).listReviewStates(),
    attempts: await (await import("/js/quiz-storage.js")).quizStorage.listAttempts({ bookId: "never-let-me-go", chapterId: "chapter-1" })
  }));
}

test("book original appears separately while the existing learning example and source remain intact", async ({ page }) => {
  await provide(page);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await expect(page.locator("#entry-count")).toHaveText("29");
  await openCard(page, "agitated");
  await expect(page.locator("#dialog-example-en")).toHaveText(agitated.exampleEn);
  await expect(page.locator("#dialog-example-zh")).toHaveText(agitated.exampleZh);
  await expect(page.locator("#dialog-source-examples .book-passage-text")).toHaveText(fixture.passages[0].text);
  await expect(page.locator("#dialog-example-section h3")).toHaveText("原有学习例句");
  await expect(page.locator("#dialog-source-section h3")).toHaveText("原学习例句的出处说明");
  await expect(page.locator("#dialog-source-examples .book-passage-source")).toHaveText("Never Let Me Go · Kazuo Ishiguro · Chapter 1");
  await expect(page.locator("#dialog-source-examples")).not.toContainText(/Controlled test edition|PDF 第|书页/u);
  await expect(page.locator("#dialog-source-examples .passage-field-label")).toHaveText("参考译意（学习用）");
  await expect(page.locator("#dialog-source-status")).toContainText(agitated.attributionNote);
  expect(await noLearningChanges(page)).toEqual({ reviews: [], attempts: [] });
});

test("a reused word shows the source for the active chapter, never the other chapter", async ({ page }) => {
  await provide(page);
  for (const chapter of [2, 10]) {
    await page.goto(`/?book=${bookId}&chapter=chapter-${chapter}`);
    await openCard(page, meandering.term);
    const expected = fixture.passages.find((item) => item.chapterId === `chapter-${chapter}`);
    const oldExample = meandering.readingContexts.find((item) => item.membership === membership(chapter)).exampleEn;
    await expect(page.locator("#dialog-example-en")).toHaveText(oldExample);
    await expect(page.locator("#dialog-source-examples article")).toHaveCount(1);
    await expect(page.locator("#dialog-source-examples .book-passage-text")).toHaveText(expected.text);
  }
});

test("a late source download cannot put the previous card's original into the new card", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/data/book-passages.json", async (route) => {
    await gate;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(fixture) });
  });
  try {
    await page.goto("/?book=never-let-me-go&chapter=chapter-1");
    await openCard(page, "agitated");
    await expect(page.locator("#dialog-source-examples-status")).toContainText("正在读取");
    await page.keyboard.press("Escape");
    await openCard(page, "shrug");
    release();
    await expect(page.locator("#dialog-source-examples .book-passage-text")).toHaveText(fixture.passages[1].text);
    await expect(page.locator("#dialog-source-examples")).not.toContainText(fixture.passages[0].text);
  } finally { release(); }
});

test("mobile excerpt tab is discoverable, keeps chapter scope and does not change word or learning counts", async ({ page }) => {
  await provide(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=passages");
  await expect(page.locator('button[data-view="passages"]')).toBeVisible();
  await expect(page.locator("#library-options")).toHaveJSProperty("open", false);
  await expect(page.locator("#passages-panel")).toBeVisible();
  await expect(page.locator("#passages-list article")).toHaveCount(1);
  await expect(page.locator("#passages-list .book-passage-source")).toHaveText("Never Let Me Go · Kazuo Ishiguro · Chapter 1");
  await page.locator(".passages-backup summary").click();
  await expect(page.locator("#passages-panel")).not.toContainText(/Controlled test edition|PDF 第|书页/u);
  await page.locator(".passages-backup summary").click();
  await expect(page.locator("#filter-row")).toBeHidden();
  await expect(page.locator("#entry-grid")).toBeHidden();
  await expect(page.locator("#chapter-quiz-button")).toBeHidden();
  await expect(page.locator("#entry-count")).toHaveText("29");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("#chapter-select").selectOption("chapter-2");
  await expect(page.locator("#passages-list .book-passage-text")).toHaveText(fixture.passages[2].text);
  await expect(page).toHaveURL(/chapter=chapter-2.*view=passages/u);
  await page.locator("#library-search").fill("nomatch-for-this-test");
  await expect(page.locator("#passages-list article")).toHaveCount(0);
  await expect(page.locator("#passages-status")).toContainText("没有符合当前搜索");
  await expect(page.locator("#search-empty")).toBeHidden();
  expect(await noLearningChanges(page)).toEqual({ reviews: [], attempts: [] });
  await page.locator('[data-view="cards"]').click();
  await expect(page.locator("#chapter-quiz-button")).toBeVisible();
});

test("local favorites survive reload, respect the chapter filter and never send a cloud mutation", async ({ page }) => {
  const mutations = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET") mutations.push(request.url());
  });
  await provide(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=passages");
  await page.locator("#passages-list .passage-favorite").click();
  await expect(page.locator("#passages-list .passage-favorite")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("#passages-list .passage-favorite")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#passages-favorites-only").check();
  await expect(page.locator("#passages-list article")).toHaveCount(1);
  await page.locator("#chapter-select").selectOption("chapter-2");
  await expect(page.locator("#passages-list article")).toHaveCount(0);
  await expect(page.locator("#passages-status")).toContainText("没有收藏");
  expect(await noLearningChanges(page)).toEqual({ reviews: [], attempts: [] });
  expect(mutations).toEqual([]);
});

test("favorite storage failure is visible and never pretends the sentence was saved", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(key).includes("book-passage-favorites")) throw new DOMException("Test quota failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await provide(page);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=passages");
  await page.locator("#passages-list .passage-favorite").click();
  await expect(page.locator("#passages-status")).toContainText("没有保存成功");
  await expect(page.locator("#passages-list .passage-favorite")).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(page.locator("#passages-list .passage-favorite")).toHaveAttribute("aria-pressed", "false");
});

test("a failed sidecar does not break cards, existing examples, or recall keyboard scoring", async ({ page }) => {
  await page.route("**/data/book-passages.json", (route) => route.fulfill({ status: 404, body: "not found" }));
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await openCard(page, "agitated");
  await expect(page.locator("#dialog-source-examples-status")).toContainText("原有例句仍可使用");
  await expect(page.locator("#dialog-example-en")).toHaveText(agitated.exampleEn);
  await expect(page.locator("#dialog-source-examples-section button")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#study-button").click();
  await expect(page.locator("#dialog-meaning")).toBeHidden();
  await expect(page.locator("#dialog-source-examples-section")).toBeHidden();
  await page.locator("#recall-reveal").click();
  await page.keyboard.press("Tab");
  await expect(page.locator('#dialog-review-actions button[data-rating="again"]')).toBeFocused();
  expect(await noLearningChanges(page)).toEqual({ reviews: [], attempts: [] });
});

test("original sentences stay concealed during active recall until the answer is revealed", async ({ page }) => {
  await provide(page);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await page.locator("#study-button").click();
  await expect(page.locator("#dialog-term")).toHaveText("agitated");
  await expect(page.locator("#dialog-source-examples .book-passage-text")).toHaveText(fixture.passages[0].text);
  await expect(page.locator("#dialog-source-examples-section")).toBeHidden();
  await page.locator("#recall-reveal").click();
  await expect(page.locator("#dialog-source-examples-section")).toBeVisible();
  await expect(page.locator("#dialog-example-en")).toHaveText(agitated.exampleEn);
  expect(await noLearningChanges(page)).toEqual({ reviews: [], attempts: [] });
});

test("source retry recovers from a failed download without reopening the word", async ({ page }) => {
  let requests = 0;
  await page.route("**/data/book-passages.json", (route) => ++requests === 1
    ? route.fulfill({ status: 503, body: "temporarily unavailable" })
    : route.fulfill({ contentType: "application/json", body: JSON.stringify(fixture) }));
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await openCard(page, "agitated");
  await page.getByRole("button", { name: "重试原句", exact: true }).click();
  await expect(page.locator("#dialog-source-examples .book-passage-text")).toHaveText(fixture.passages[0].text);
  await expect(page.getByRole("button", { name: "重试原句", exact: true })).toBeHidden();
  expect(requests).toBe(2);
});

test("source text is rendered as text, not executable markup", async ({ page }) => {
  const malicious = structuredClone(fixture);
  malicious.passages[0].text = '<img src="x" onerror="window.__passageInjected=true"> Plaintext test.';
  await provide(page, malicious);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=passages");
  await expect(page.locator("#passages-list .book-passage-text")).toHaveText(malicious.passages[0].text);
  await expect(page.locator("#passages-list img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__passageInjected)).toBeUndefined();
});

test("favorites JSON export contains only IDs, cleans its object URL and imports by merging", async ({ page }) => {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL;
    window.__passageRevokedUrls = [];
    URL.revokeObjectURL = function (url) {
      window.__passageRevokedUrls.push(String(url));
      return revoke.call(this, url);
    };
  });
  await provide(page);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=passages");
  await page.locator("#passages-list .passage-favorite").click();
  await page.locator(".passages-backup summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#passages-export-favorites").click();
  const download = await downloadPromise;
  const raw = await readFile(await download.path(), "utf8");
  expect(JSON.parse(raw)).toEqual({ schemaVersion: 1, ids: ["fixture-agitated-c1"] });
  expect(raw).not.toContain(fixture.passages[0].text);
  await expect.poll(() => page.evaluate(() => window.__passageRevokedUrls.length)).toBe(1);

  await page.goto("/?book=never-let-me-go&chapter=chapter-2&view=passages");
  await page.locator("#passages-list .passage-favorite").click();
  await page.locator(".passages-backup summary").click();
  await page.locator("#passages-import-file").setInputFiles({ name: "favorites.json", mimeType: "application/json", buffer: Buffer.from(raw) });
  await expect(page.locator("#passages-backup-status")).toContainText("当前共 2 项收藏");
  await expect(page.locator("#passages-backup-status")).toHaveAttribute("data-state", "success");
  await expect(page.locator("#passages-import-file")).toHaveValue("");
  await page.goto("/?book=never-let-me-go&view=passages");
  await page.locator("#passages-favorites-only").check();
  await expect(page.locator("#passages-list article")).toHaveCount(2);
  await expect(page.locator("#passages-spoiler-note")).toBeVisible();
  expect(await noLearningChanges(page)).toEqual({ reviews: [], attempts: [] });
});

test("invalid, oversized and storage-failed imports keep existing favorites and allow the same-file retry", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    window.__denyPassageBackupWrite = false;
    Storage.prototype.setItem = function (key, value) {
      if (window.__denyPassageBackupWrite && String(key).includes("book-passage-favorites")) throw new DOMException("Test storage failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await provide(page);
  await page.goto("/?book=never-let-me-go&chapter=chapter-1&view=passages");
  await page.locator("#passages-list .passage-favorite").click();
  await page.locator(".passages-backup summary").click();
  const input = page.locator("#passages-import-file");
  const keptIds = () => page.evaluate(() => JSON.parse(localStorage.getItem("zhuo-vocab:book-passage-favorites:v1")).ids);
  await input.setInputFiles({ name: "favorites.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, ids: ["fixture-meandering-c2"], unexpected: true })) });
  await expect(page.locator("#passages-backup-status")).toHaveAttribute("data-state", "error");
  expect(await keptIds()).toEqual(["fixture-agitated-c1"]);
  await expect(input).toHaveValue("");

  await input.setInputFiles({ name: "too-large.json", mimeType: "application/json", buffer: Buffer.alloc(1_000_001, 32) });
  await expect(page.locator("#passages-backup-status")).toContainText("超过 1 MB");
  expect(await keptIds()).toEqual(["fixture-agitated-c1"]);

  const valid = { name: "favorites.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, ids: ["fixture-meandering-c2"] })) };
  await page.evaluate(() => { window.__denyPassageBackupWrite = true; });
  await input.setInputFiles(valid);
  await expect(page.locator("#passages-backup-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#passages-backup-status")).toContainText("未覆盖原有收藏");
  expect(await keptIds()).toEqual(["fixture-agitated-c1"]);
  await expect(input).toHaveValue("");

  await page.evaluate(() => { window.__denyPassageBackupWrite = false; });
  await input.setInputFiles(valid);
  await expect(page.locator("#passages-backup-status")).toHaveAttribute("data-state", "success");
  expect(await keptIds()).toEqual(["fixture-agitated-c1", "fixture-meandering-c2"]);
});
