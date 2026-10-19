import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const ORIGIN = "http://127.0.0.1:4187";
const COLLECTION = "/api/v1/owner/dictionary-collection";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "e2e_run", value: `owner-collection-${randomUUID()}`, url: ORIGIN }, { name: "e2e_auth", value: "owner", url: ORIGIN }]);
});
async function open(page) {
  await page.goto("/personal.html?auth=owner");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-auth-type")).toHaveText("GitHub 身份");
  await expect(page.locator("#member-privacy-badge")).toHaveText("查词公开收录 · 学习记录私有");
  await expect(page.locator("#member-privacy-note")).toContainText("不会自动公开");
}
async function lookup(page, query) {
  await page.locator("#member-dictionary-term").fill(query);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-result")).toBeVisible();
}

test("owner exact English auto-collects publicly with source, leaves private editor alone and deduplicates", async ({ context, page }) => {
  await open(page); await page.locator("#member-term").fill("my unfinished draft");
  const calls = []; page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(request); });
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText("已收录到卓的公开词库");
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  await expect(page.locator("#member-term")).toHaveValue("my unfinished draft");
  const initial = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  const entry = initial.entries.find(value => value.normalized === "abacus");
  expect(entry.sourceTitle).toBeTruthy(); expect(entry.sources[0].kind).toBe("dictionary");
  expect(entry.definition).toBe(""); expect(entry.exampleEn).toBe(""); expect(entry.senses).toEqual([]);
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-collection-status")).toContainText("原有内容已保留");
  const after = await (await context.request.get(`${ORIGIN}/api/v1/public/wordbook`)).json();
  expect(after.entries.filter(value => value.normalized === "abacus")).toHaveLength(1);
  expect(after.entries.find(value => value.id === entry.id)).toEqual(entry);
  const saves = calls.filter(request => new URL(request.url()).pathname === COLLECTION);
  expect(saves).toHaveLength(2);
  for (const request of saves) {
    expect(Object.keys(request.postDataJSON()).sort()).toEqual(["mutationId", "term"]);
    expect(request.headers()["idempotency-key"]).toBe(request.postDataJSON().mutationId);
  }
  expect(calls.some(request => /ai|translate/u.test(new URL(request.url()).pathname))).toBe(false);
  expect(calls.some(request => request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/v1/member"))).toBe(false);
});

test("Chinese and matched forms wait for explicit public selection", async ({ page }) => {
  await open(page); let writes = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === COLLECTION) writes++; });
  await lookup(page, "苹果");
  await expect(page.locator("#member-dictionary-choices")).toBeVisible();
  await expect(page.locator("#member-dictionary-use")).toHaveText("收录到卓的公开词库");
  expect(writes).toBe(0);
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-dictionary-collection-status")).toContainText(/公开词库/u);
  expect(writes).toBe(1);
  await lookup(page, "went");
  await expect(page.locator("#member-dictionary-word")).toHaveText("go");
  await expect(page.locator("#member-dictionary-use")).toHaveText("收录到卓的公开词库");
  expect(writes).toBe(1);
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-dictionary-collection-status")).toContainText(/公开词库/u);
  expect(writes).toBe(2);
});

test("failed collection retries the same mutation key and old-query completion cannot show success", async ({ page }) => {
  await open(page); const bodies = []; let fail = true;
  await page.route(`**${COLLECTION}`, async route => {
    bodies.push(route.request().postDataJSON());
    if (fail) { fail = false; await route.fulfill({ status: 503, json: { error: { code: "temporary", message: "稍后重试" } } }); }
    else await route.continue();
  });
  await lookup(page, "abacus");
  await expect(page.locator("#member-dictionary-use")).toHaveText("重试公开收录");
  await expect(page.locator("#member-dictionary-public-link")).toBeHidden();
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-dictionary-public-link")).toBeVisible();
  expect(bodies[1].mutationId).toBe(bodies[0].mutationId);
  await page.unroute(`**${COLLECTION}`);
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; }), seen = new Promise(resolve => { reached = resolve; });
  await page.route(`**${COLLECTION}`, async route => { const response = await route.fetch(); reached(); await gate; try { await route.fulfill({ response }); } catch {} });
  await lookup(page, "abandon"); await seen;
  await page.locator("#member-dictionary-term").fill("new query"); release();
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
  await expect(page.locator("#member-dictionary-collection-status")).toBeHidden();
  await expect(page.locator("#member-dictionary-public-link")).toBeHidden();
});

test("public dictionary offers the authenticated owner search surface without writing anonymously", async ({ page }) => {
  await page.goto("/dictionary.html#q=abacus");
  await expect(page.locator("#dictionary-term")).toHaveText("abacus");
  await expect(page.locator("#dictionary-owner-link")).toHaveAttribute("href", `${ORIGIN}/personal.html?auth=owner#lookup=abacus`);
  await page.locator("#dictionary-owner-link").click();
  await expect(page.locator("#member-dictionary-term")).toHaveValue("abacus");
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
});
