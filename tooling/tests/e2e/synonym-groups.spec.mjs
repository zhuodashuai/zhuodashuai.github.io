import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const chapterThreeUrl = "/?book=never-let-me-go&chapter=chapter-3&view=synonyms";
const termId = (term) => snapshot.entries.find((entry) => entry.term === term).id;

test.use({ serviceWorkers: "block" });
let browserErrors;

test.beforeEach(async ({ context, page }, testInfo) => {
  const run = `synonyms-${testInfo.workerIndex}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
});

test.afterEach(() => expect(browserErrors, "synonym navigation must not emit unhandled errors").toEqual([]));

const panel = (page) => page.locator("#synonym-panel");
const member = (scope, term) => scope.getByRole("button", { name: `打开词条 ${term}`, exact: true });

async function expectChapterThreeReady(page) {
  await expect(page.locator("#library-heading")).toContainText("Chapter 3");
  await expect(page.locator("#entry-count")).toHaveText("28");
  await expect(panel(page)).toBeVisible();
  await expect(member(panel(page), "have somebody on")).toBeVisible();
}

test("同义词试用保留章节范围、完整词条数和跨章节已收录伙伴", async ({ page }) => {
  await page.goto(chapterThreeUrl);
  await expectChapterThreeReady(page);
  await expect(page.locator("#view-controls").getByRole("button", { name: /同义词分组/ })).toHaveAttribute("aria-pressed", "true");
  await expect(member(panel(page), "pull somebody's leg")).toBeVisible();
  await expect(panel(page)).toContainText("其他章节");
  await expect(panel(page).locator(".synonym-group")).toHaveCount(1);
  await expect(page.locator("#due-count")).toHaveText("28");

  await page.locator("#view-controls").getByRole("button", { name: "单词卡片", exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(28);
  expect(new URL(page.url()).searchParams.get("book")).toBe("never-let-me-go");
  expect(new URL(page.url()).searchParams.get("chapter")).toBe("chapter-3");
  await page.locator("#view-controls").getByRole("button", { name: /同义词分组/ }).click();
  await page.reload();
  await expectChapterThreeReady(page);
  expect(new URL(page.url()).searchParams.get("view")).toBe("synonyms");
});

test("分组词条与详情同义词支持键盘，伙伴打开同一弹窗，关闭返回原入口", async ({ page }) => {
  await page.goto(chapterThreeUrl);
  await expectChapterThreeReady(page);
  const origin = member(panel(page), "have somebody on");
  await origin.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#entry-dialog")).toBeVisible();
  await expect(page.locator("#dialog-term")).toHaveText("have somebody on");
  await expect(page.locator("#dialog-source-status")).toContainText("Chapter 3");
  const synonymSection = page.locator("#dialog-synonym-section");
  await expect(synonymSection).toBeVisible();
  const partner = member(synonymSection, "pull somebody's leg");
  await partner.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#dialog-term")).toHaveText("pull somebody's leg");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(page.locator("#dialog-source-status")).toContainText("Chapter 2");
  await page.keyboard.press("Escape");
  await expect(page.locator("#entry-dialog")).toBeHidden();
  await expect(origin).toBeFocused();
});

test("从同义词跳到伙伴后复习写入伙伴 ID，不误改原词或章节复习数", async ({ page }) => {
  await page.goto(chapterThreeUrl);
  await expectChapterThreeReady(page);
  await member(panel(page), "have somebody on").click();
  await member(page.locator("#dialog-synonym-section"), "pull somebody's leg").click();
  await expect(page.locator("#dialog-term")).toHaveText("pull somebody's leg");
  await page.locator('#dialog-review-actions [data-rating="good"]').click();
  await expect(page.locator("#dialog-review-status")).toContainText("已记录");
  const states = await page.evaluate(async () => {
    const { listReviewStates } = await import("/js/owner-storage.js");
    return listReviewStates();
  });
  expect(states).toHaveLength(1);
  expect(states[0].entryId).toBe(termId("pull somebody's leg"));
  expect(states[0].reviewCount).toBe(1);
  await page.getByRole("button", { name: "关闭词条详情" }).click();
  await expect(page.locator("#due-count")).toHaveText("28");
  await page.locator('#chapter-tabs button[data-value="chapter-2"]').click();
  await expect(page.locator("#due-count")).toHaveText("37");
});

test("分组可按中文组名与英文成员检索并与词性类型筛选相交", async ({ page }) => {
  await page.goto("/?view=synonyms");
  await expect(panel(page)).toBeVisible();
  await page.locator("#library-search").fill("困惑不解");
  await expect(panel(page).locator(".synonym-group")).toHaveCount(1);
  await expect(member(panel(page), "mystified")).toBeVisible();
  await expect(member(panel(page), "bewildered")).toBeVisible();
  await page.locator('#filter-row [data-filter="word"]').click();
  await expect(panel(page).locator(".synonym-group")).toHaveCount(1);
  await page.locator('#filter-row [data-filter="idiom"]').click();
  await expect(panel(page).locator(".synonym-group")).toHaveCount(0);
  await page.locator('#filter-row [data-filter="all"]').click();
  await page.locator("#library-search").fill("have somebody on");
  await expect(panel(page).locator(".synonym-group")).toHaveCount(1);
  await expect(member(panel(page), "pull somebody's leg")).toBeVisible();
  await page.locator("#library-search").fill("delicious");
  await expect(panel(page).locator(".synonym-group")).toHaveCount(0);
});

test("切换章节会重算组而保留试用视图，卡片详情同样可查看已收录伙伴", async ({ page }) => {
  await page.goto(chapterThreeUrl);
  await expectChapterThreeReady(page);
  await page.locator('#chapter-tabs button[data-value="chapter-4"]').click();
  await expect(page.locator("#library-heading")).toContainText("Chapter 4");
  await expect(member(panel(page), "bewildered")).toBeVisible();
  await expect(member(panel(page), "have somebody on")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("chapter")).toBe("chapter-4");
  expect(new URL(page.url()).searchParams.get("view")).toBe("synonyms");
  await page.locator("#view-controls").getByRole("button", { name: "单词卡片", exact: true }).click();
  await page.locator("#library-search").fill("bewildered");
  await page.getByRole("button", { name: "查看 bewildered 的完整词条", exact: true }).click();
  await expect(member(page.locator("#dialog-synonym-section"), "mystified")).toBeVisible();
});

test("手机分组及同义词详情不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?book=never-let-me-go&view=synonyms");
  await expect(member(panel(page), "be torn between A and B")).toBeVisible();
  const measure = () => page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    dialogWidth: document.querySelector("#entry-dialog").scrollWidth,
    dialogClientWidth: document.querySelector("#entry-dialog").clientWidth
  }));
  let size = await measure();
  expect(size.pageWidth).toBeLessThanOrEqual(size.viewport);
  await member(panel(page), "be torn between A and B").click();
  await expect(page.locator("#entry-dialog")).toBeVisible();
  size = await measure();
  expect(size.pageWidth).toBeLessThanOrEqual(size.viewport);
  expect(size.dialogWidth).toBeLessThanOrEqual(size.dialogClientWidth + 1);
  await member(page.locator("#dialog-synonym-section"), "ambivalent").click();
  await expect(page.locator("#dialog-term")).toHaveText("ambivalent");
});

test("远端删除成员后刷新不保留幽灵组，也不会向词库添加词", async ({ page }) => {
  let current = structuredClone(snapshot);
  const serve = (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
  await page.route("**/api/v1/public/wordbook*", serve);
  await page.route("**/data/owner-wordbook.json*", serve);
  await page.goto(chapterThreeUrl);
  await expectChapterThreeReady(page);
  current.entries = current.entries.filter((entry) => entry.term !== "pull somebody's leg");
  await page.reload();
  await expect(page.locator("#entry-count")).toHaveText("28");
  await expect(panel(page).locator(".synonym-group")).toHaveCount(0);
  await expect(member(panel(page), "pull somebody's leg")).toHaveCount(0);
  await page.locator("#view-controls").getByRole("button", { name: "单词卡片", exact: true }).click();
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(28);
});

function advanceSnapshot(snapshotValue, revision) {
  snapshotValue.exportedAt = new Date(Date.parse(snapshot.exportedAt) + revision * 60_000).toISOString();
  snapshotValue.revisionId = `e2e-synonym-fresh-${revision}`;
}

function replaceMystifiedMeaning(snapshotValue) {
  const entry = snapshotValue.entries.find(({ term }) => term === "mystified");
  entry.meaning = "刷新后的不相关技术义项。";
  entry.definition = "An unrelated technical sense used for a refresh regression.";
  entry.usage = "刷新测试语境；不沿用旧义项。";
  entry.senses = entry.senses.map((sense) => ({
    ...sense, meaningZh: entry.meaning, definitionEn: entry.definition, usageNotes: entry.usage
  }));
  entry.readingContexts = [];
  entry.revision += 1;
  entry.updatedAt = snapshotValue.exportedAt;
  return entry;
}

test("公开详情保持打开时远端改义项会更新正文并移除旧同义关系，删除后关闭且不写复习", async ({ page }) => {
  const current = structuredClone(snapshot);
  const serve = (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(current) });
  await page.route("**/api/v1/public/wordbook*", serve);
  await page.route("**/data/owner-wordbook.json*", serve);
  await page.clock.install();
  await page.goto("/?book=never-let-me-go&chapter=chapter-2");
  await page.locator("#library-search").fill("mystified");
  await page.getByRole("button", { name: "查看 mystified 的完整词条", exact: true }).click();
  await expect(member(page.locator("#dialog-synonym-section"), "bewildered")).toBeVisible();

  advanceSnapshot(current, 1);
  const changed = replaceMystifiedMeaning(current);
  await page.clock.fastForward(3_500);
  let response = page.waitForResponse((reply) => reply.url().includes("/api/v1/public/wordbook") && reply.status() === 200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await response;
  await expect(page.locator("#entry-dialog")).toBeVisible();
  await expect(page.locator("#dialog-term")).toHaveText("mystified");
  await expect(page.locator("#dialog-meaning")).toContainText(changed.meaning.replace(/。$/u, ""));
  await expect(member(page.locator("#dialog-synonym-section"), "bewildered")).toHaveCount(0);
  await expect(page.locator("#dialog-synonym-status")).toContainText("待识别");

  advanceSnapshot(current, 2);
  current.entries = current.entries.filter(({ term }) => term !== "mystified");
  await page.clock.fastForward(3_500);
  response = page.waitForResponse((reply) => reply.url().includes("/api/v1/public/wordbook") && reply.status() === 200);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await response;
  await expect(page.locator("#entry-dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: "查看 mystified 的完整词条", exact: true })).toHaveCount(0);
  const states = await page.evaluate(async () => {
    const { listReviewStates } = await import("/js/owner-storage.js");
    return listReviewStates();
  });
  expect(states).toEqual([]);
});

test("Owner 详情保持打开时读取新快照会更新义项与近义关系，删除当前词会关闭详情", async ({ context, page }) => {
  const current = structuredClone(snapshot);
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  // This test owns the remote snapshot. Do not let the server's independent
  // scan fixture replace it while testing refresh/edit/delete transitions.
  await page.route("**/api/v1/owner/synonyms", (route) => route.fulfill({
    status: 429,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "synonym_limit", message: "测试中暂停后台识别" } })
  }));
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ sha: "b".repeat(40), snapshot: current })
  }));
  await page.goto("/owner.html");
  await expect(page.locator("#owner-entry-count")).toHaveText(String(snapshot.entries.length));
  await page.locator("#owner-search").fill("mystified");
  await page.getByRole("button", { name: "查看 mystified 的完整词条", exact: true }).click();
  await expect(member(page.locator("#dialog-synonym-section"), "bewildered")).toBeVisible();

  advanceSnapshot(current, 1);
  const changed = replaceMystifiedMeaning(current);
  // Invoke the existing refresh handler without dismissing the modal: this
  // exercises an arriving snapshot while its detail is already on screen.
  await expect(page.locator("#refresh-remote")).toBeEnabled();
  await page.locator("#refresh-remote").evaluate((control) => control.click());
  await expect(page.locator("#dialog-meaning")).toContainText(changed.meaning.replace(/。$/u, ""));
  await expect(member(page.locator("#dialog-synonym-section"), "bewildered")).toHaveCount(0);
  await expect(page.locator("#dialog-synonym-status")).toContainText("待识别");

  advanceSnapshot(current, 2);
  current.entries = current.entries.filter(({ term }) => term !== "mystified");
  await expect(page.locator("#refresh-remote")).toBeEnabled();
  await page.locator("#refresh-remote").evaluate((control) => control.click());
  await expect(page.locator("#entry-dialog")).toBeHidden();
  await expect(page.locator("#owner-entry-count")).toHaveText(String(snapshot.entries.length - 1));
});
