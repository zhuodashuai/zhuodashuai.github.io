import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const ORIGIN = "http://127.0.0.1:4187";
const API = `${ORIGIN}/api/v1/member`;
const PASSWORD = "  synthetic private learning 密码 74  ";
const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const chapter = id => snapshot.entries.filter(entry => entry.tags.includes(`collection:never-let-me-go:${id}`));
const shared = chapter("chapter-1").find(entry => entry.tags.includes("collection:never-let-me-go:chapter-2"));
const runId = info => `selection-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`;
async function isolate(context, info) { await context.addCookies([{ name: "e2e_run", value: runId(info), url: ORIGIN }]); }
test.beforeEach(async ({ context, page }, info) => {
  await isolate(context, info);
  page.on("pageerror", error => { throw new Error(error.message); });
  page.on("dialog", dialog => dialog.accept());
});

async function api(context, method, path, data, session, mode = "member") {
  return context.request.fetch(`${API}/${path}`, { method,
    headers: { "X-Wordbook-Auth": mode, ...(method === "GET" ? {} : { Origin: ORIGIN, "Content-Type": "application/json" }), ...(session ? { "X-CSRF-Token": session.csrfToken } : {}) },
    ...(data === undefined ? {} : { data }) });
}
async function seed(context, name = "alice_learning") {
  const response = await api(context, "POST", "register", { username: name, password: PASSWORD });
  expect(response.status()).toBe(200); return response.json();
}
async function entries(context, mode = "member") { const response = await api(context, "GET", "entries", undefined, undefined, mode); expect(response.status()).toBe(200); return response.json(); }
async function learning(context, mode = "member") { const response = await api(context, "GET", "learning", undefined, undefined, mode); expect(response.status()).toBe(200); return response.json(); }
async function select(context, session, ids, ch = "chapter-1", mode = "member") {
  const response = await api(context, "POST", "selections", { entryIds: ids, collectionId: "never-let-me-go", chapterId: ch, mutationId: randomUUID() }, session, mode);
  expect(response.status()).toBe(200); return response.json();
}
async function ready(page, username = "alice_learning") {
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-username")).toHaveText(`@${username}`);
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#member-learning-summary")).not.toContainText("正在读取");
}
async function open(page, username = "alice_learning", suffix = "?auth=member") { await page.goto(`/personal.html${suffix}`); await ready(page, username); }
function row(page, term) { return page.locator(".personal-entry").filter({ has: page.getByRole("button", { name: `查看 ${term}`, exact: true }) }); }
async function sourceScope(page, ch = "chapter-1") {
  if (!await page.locator("#member-source-panel").isVisible()) await page.locator("#member-source-toggle").click();
  await expect(page.locator("#member-source-book option[value=never-let-me-go]")).toHaveCount(1);
  await page.locator("#member-source-book").selectOption("never-let-me-go");
  await page.locator("#member-source-chapter").selectOption(ch);
  await expect(page.locator("#member-source-list .source-select")).toHaveCount(chapter(ch).length);
}
async function privateScope(page, ch) { await page.locator("#member-book").selectOption("never-let-me-go"); await page.locator("#member-chapter").selectOption(ch); }
async function screenshot(page, name) { await mkdir(resolve("test-results"), { recursive: true }); await page.screenshot({ path: resolve(`test-results/${name}.png`), fullPage: true }); }

test("select only checked Chapter 1 words, select all without duplicates, and persist across a fresh browser context", async ({ browser, context, page }, info) => {
  const before = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  await seed(context); await open(page); await sourceScope(page);
  for (const entry of chapter("chapter-1").slice(0, 3)) await page.locator(`.source-select[data-entry-id="${entry.id}"]`).check();
  await page.locator("#member-source-add").click();
  await expect(page.locator(".personal-entry")).toHaveCount(3);
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "saved");
  expect((await entries(context)).entries.map(entry => entry.term).sort()).toEqual(chapter("chapter-1").slice(0, 3).map(entry => entry.term).sort());
  await privateScope(page, "chapter-1"); await page.locator("#member-source-close").click();
  await screenshot(page, "member-selection-desktop");
  await sourceScope(page);
  await page.locator("#member-source-all").click(); await page.locator("#member-source-add").click();
  await expect(page.locator(".personal-entry")).toHaveCount(chapter("chapter-1").length);
  await privateScope(page, "chapter-1");
  const other = await browser.newContext(); await isolate(other, info);
  try {
    expect((await api(other, "POST", "login", { username: "alice_learning", password: PASSWORD })).status()).toBe(200);
    const otherPage = await other.newPage(); await otherPage.goto(`${ORIGIN}/personal.html?auth=member`); await ready(otherPage);
    expect((await entries(other)).entries).toHaveLength(chapter("chapter-1").length);
  } finally { await other.close(); }
  expect(await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json()).toEqual(before);
});

test("shared Chapter 1/2 word reuses its card and note-only edits preserve both distinct chapter meanings", async ({ context, page }) => {
  const session = await seed(context);
  await select(context, session, [shared.id]);
  const initial = (await entries(context)).entries[0];
  await select(context, session, [shared.id], "chapter-2");
  const merged = (await entries(context)).entries[0];
  expect(merged.id).toBe(initial.id); expect(merged.sourceContexts).toHaveLength(2);
  expect(merged.meaning).toBe(initial.meaning); expect(merged.meaningEdited).toBe(false);
  const first = merged.sourceContexts.find(item => item.chapterId === "chapter-1");
  const second = merged.sourceContexts.find(item => item.chapterId === "chapter-2");
  await open(page); await privateScope(page, "chapter-2");
  await row(page, shared.term).locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-meaning")).toHaveText(second.meaning);
  await page.locator("#member-detail-edit").click();
  await expect(page.locator("#member-term")).toHaveAttribute("readonly", "");
  await page.locator("#member-note").fill("My note concerns Chapter 2 only.");
  await page.locator("#member-save").click();
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "saved");
  const edited = (await entries(context)).entries[0];
  expect(edited.meaningEdited).toBe(false); expect(edited.meaning).toBe(initial.meaning);
  await privateScope(page, "chapter-1");
  await row(page, shared.term).locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-meaning")).toHaveText(first.meaning);
  await page.locator("#member-detail-close").click();
  await privateScope(page, "chapter-2");
  await row(page, shared.term).locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-meaning")).toHaveText(second.meaning);
  expect(edited.sourceContexts).toEqual(merged.sourceContexts);
});

test("active recall hides Chinese first, saves cloud history, excludes missing meanings, and exports only own learning", async ({ context, page }) => {
  const session = await seed(context); await select(context, session, [chapter("chapter-1")[0].id]);
  expect((await api(context, "POST", "entries", { term: "untranslated personal phrase", meaning: "", note: "", mutationId: randomUUID() }, session)).status()).toBe(200);
  await open(page); await page.locator("#member-study-all").click();
  await expect(page.locator("#member-study-dialog")).toBeVisible();
  await expect(page.locator("#member-study-progress")).toContainText("1 / 1");
  await expect(page.locator("#member-study-answer")).toBeHidden();
  await expect(page.locator("#member-study-ratings")).toBeHidden();
  await page.locator("#member-study-reveal").click();
  await expect(page.locator("#member-study-answer")).toBeVisible();
  await screenshot(page, "member-study-revealed");
  await page.locator('[data-member-rating="good"]').click();
  await expect(page.locator("#member-study-progress")).toHaveText("本次学习完成");
  const reviews = (await learning(context)).reviews; expect(reviews).toHaveLength(1); expect(reviews[0].reviewCount).toBe(1); expect(reviews[0].history).toHaveLength(1);
  await page.locator("#member-study-close").click();
  await expect(page.locator("#member-learning-summary")).toContainText("1");
  const tools = page.locator(".account-tools"); await tools.locator("summary").click();
  const downloadPending = page.waitForEvent("download"); await page.locator("#member-export").click();
  const download = await downloadPending; const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.entries).toHaveLength(2); expect(exported.reviews || exported.learning?.reviews).toHaveLength(1);
  expect(JSON.stringify(exported)).not.toMatch(/"(?:password|recoveryCode|csrfToken|rawSession)"\s*:/u);
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await caches.open(key)).keys()))).flat().map(item => item.url));
  expect(cached.filter(url => url.includes("/api/v1/member/"))).toEqual([]);
});

test.describe("controlled cloud review races", () => {
  test.use({ serviceWorkers: "block" });
  test("lost review acknowledgement retries one mutation; revision conflict never advances the question", async ({ context, page }) => {
    const session = await seed(context); await select(context, session, [chapter("chapter-1")[0].id]);
    await open(page);
    let lost = false; const ids = [];
    await page.route(`${API}/reviews/*`, async route => {
      ids.push(route.request().postDataJSON().mutationId);
      if (!lost) { lost = true; const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort("failed"); }
      else await route.continue();
    });
    await page.locator("#member-study-all").click(); await page.locator("#member-study-reveal").click();
    await page.locator('[data-member-rating="good"]').click();
    await expect(page.locator("#member-study-status")).toHaveAttribute("data-state", "error");
    await expect(page.locator("#member-study-progress")).toContainText("1 / 1");
    await page.locator("#member-study-retry").click();
    await expect(page.locator("#member-study-progress")).toHaveText("本次学习完成");
    expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(1); expect((await learning(context)).reviews[0].reviewCount).toBe(1);
    await page.locator("#member-study-close").click(); await page.locator("#member-study-all").click(); await page.locator("#member-study-reveal").click();
    const old = (await learning(context)).reviews[0];
    expect((await api(context, "POST", `reviews/${old.entryId}`, { rating: "hard", revision: old.revision, mutationId: randomUUID() }, session)).status()).toBe(200);
    await page.locator('[data-member-rating="easy"]').click();
    await expect(page.locator("#member-study-status")).toHaveAttribute("data-state", "error");
    await expect(page.locator("#member-study-progress")).toContainText("1 / 1");
    expect((await learning(context)).reviews[0].reviewCount).toBe(2);
    await page.locator("#member-study-sync").click();
    await expect(page.locator('[data-member-rating="good"]')).toBeEnabled();
    await page.locator('[data-member-rating="good"]').click();
    await expect(page.locator("#member-study-progress")).toHaveText("本次学习完成");
    expect((await learning(context)).reviews[0].reviewCount).toBe(3);
  });

  test("offline review does not advance and delayed list reads disable save until their snapshot resolves", async ({ context, page }) => {
    const session = await seed(context); await select(context, session, [chapter("chapter-1")[0].id]); await open(page);
    let release; const gate = new Promise(resolve => { release = resolve; }); let reached;
    const seen = new Promise(resolve => { reached = resolve; }); let delayed = false;
    await page.route(`${API}/entries`, async route => { if (route.request().method() !== "GET" || delayed) return route.continue(); delayed = true; const response = await route.fetch(); reached(); await gate; await route.fulfill({ response }); });
    try {
      await page.locator("#member-term").fill("new concurrent phrase");
      await page.locator("#member-refresh").click(); await seen;
      await expect(page.locator("#member-save")).toBeDisabled(); release();
      await expect(page.locator("#member-save")).toBeEnabled();
      await page.locator("#member-cancel").click();
      await page.locator("#member-study-all").click(); await page.locator("#member-study-reveal").click();
      await context.setOffline(true); await page.locator('[data-member-rating="again"]').click();
      await expect(page.locator("#member-study-status")).toHaveAttribute("data-state", "error");
      await expect(page.locator("#member-study-progress")).toContainText("1 / 1");
      await context.setOffline(false); expect((await learning(context)).reviews).toHaveLength(0);
      await page.locator("#member-study-retry").click();
      await expect(page.locator("#member-study-progress")).toHaveText("本次学习完成");
    } finally { release(); await context.setOffline(false); }
  });
});

test("private selections/reviews stay isolated and a silent B cookie switch locks A instead of leaking B", async ({ browser, context, page }, info) => {
  const a = await seed(context); await select(context, a, [chapter("chapter-1")[0].id]); await open(page);
  const bContext = await browser.newContext(); await isolate(bContext, info);
  try {
    const b = await seed(bContext, "bob_learning"); expect((await entries(bContext)).entries).toHaveLength(0); expect((await learning(bContext)).reviews).toHaveLength(0);
    const aEntry = (await entries(context)).entries[0];
    expect((await api(bContext, "POST", `reviews/${aEntry.id}`, { rating: "good", revision: 0, mutationId: randomUUID() }, b)).status()).toBe(404);
    await select(bContext, b, [chapter("chapter-2")[0].id], "chapter-2");
    await context.addCookies([(await bContext.cookies()).find(cookie => cookie.name === "e2e_member_session")]);
    await page.locator("#member-refresh").click();
    await expect(page.locator("#member-workspace")).toBeHidden(); await expect(page.locator("#member-entry-list")).toBeEmpty();
    expect((await context.request.get(`${ORIGIN}/api/v1/owner/wordbook`)).status()).toBe(401);
  } finally { await bContext.close(); }
});

test("existing GitHub owner login opens a separate cloud wordbook without registration or public mutation", async ({ context, page }) => {
  const member = await seed(context); await select(context, member, [chapter("chapter-1")[0].id]);
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
  const before = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  const calls = []; page.on("request", request => { if (/\/register|\/owner\/publish/u.test(request.url())) calls.push(request.url()); });
  const auto = await (await api(context, "GET", "session", undefined, undefined, "auto")).json(); expect(auto.authType).toBe("member");
  const owner = await (await api(context, "GET", "session", undefined, undefined, "github-owner")).json(); expect(owner.authType).toBe("github-owner"); expect(owner.user.id).not.toBe(member.user.id);
  await open(page, "zhuodashuai", "?auth=owner"); await expect(page.locator("#member-auth-type")).toContainText("GitHub");
  await page.locator("#member-private-tools > summary").click();
  await sourceScope(page); await page.locator(`.source-select[data-entry-id="${chapter("chapter-1")[1].id}"]`).check(); await page.locator("#member-source-add").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  await page.locator("#member-study-all").click(); await page.locator("#member-study-reveal").click(); await page.locator('[data-member-rating="good"]').click();
  await expect(page.locator("#member-study-progress")).toHaveText("本次学习完成");
  expect((await learning(context, "github-owner")).reviews).toHaveLength(1); expect((await learning(context)).reviews).toHaveLength(0);
  expect((await entries(context)).entries[0].term).toBe(chapter("chapter-1")[0].term);
  expect(calls).toEqual([]); expect(await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json()).toEqual(before);
});

test("390px selection, chapter filtering and learning controls remain readable without horizontal overflow", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await seed(context); await open(page); await sourceScope(page);
  for (const entry of chapter("chapter-1").slice(0, 2)) await page.locator(`.source-select[data-entry-id="${entry.id}"]`).check();
  await page.locator("#member-source-add").click(); await expect(page.locator(".personal-entry")).toHaveCount(2); await privateScope(page, "chapter-1");
  await page.locator("#member-source-close").click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await screenshot(page, "member-selection-mobile");
  await page.locator("#member-study-all").click(); await expect(page.locator("#member-study-answer")).toBeHidden();
  await page.locator("#member-study-reveal").click(); const bounds = await page.locator("#member-study-dialog").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
});
