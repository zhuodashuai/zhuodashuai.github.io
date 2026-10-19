import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

const ORIGIN = "http://127.0.0.1:4187";
const API = `${ORIGIN}/api/v1/member`;
const RELATED_POSTING = "**/data/expanded-dictionary/**/zh-041.json*"; // 高兴, not the direct 开心 posting.
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `personal-related-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

async function openMember(context, page) {
  const registration = await context.request.post(`${API}/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "related_reader", password: "synthetic related lookup password 2026" }
  });
  expect(registration.status()).toBe(200);
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
}

async function openOwner(context, page) {
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
  await page.goto("/personal.html?auth=owner");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-auth-type")).toHaveText("GitHub 身份");
}

async function query(page, value, { empty = false } = {}) {
  await page.locator("#member-dictionary-term").fill(value);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
  if (!empty) await expect(page.locator("#member-dictionary-result")).toBeVisible();
}

function choice(page, term) {
  return page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: new RegExp(`^${term}$`, "u") }) });
}

async function holdRelatedPosting(page) {
  let release, reached;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { reached = resolve; });
  await page.route(RELATED_POSTING, async route => {
    const response = await route.fetch(); reached(); await gate;
    try { await route.fulfill({ response }); } catch { /* Editing/logout intentionally cancels the optional caller. */ }
  });
  return { release, seen };
}

test("mobile Chinese synonym choices keep source definitions, direct-first order and explicit private saving", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await openMember(context, page);
  const calls = [];
  page.on("request", request => calls.push({ url: request.url(), method: request.method() }));
  await query(page, "开心");
  await expect(choice(page, "happy")).toBeVisible();
  await expect(choice(page, "happy")).toContainText("近义关联：高兴");
  await expect(page.locator(".dictionary-choice strong").first()).toHaveText("chuffed");
  const words = await page.locator(".dictionary-choice strong").allTextContents();
  expect(new Set(words).size).toBe(words.length);
  expect(words).not.toContain("pistachio nut"); expect(words).not.toContain("unhappy");
  await choice(page, "happy").click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("happy");
  await expect(page.locator("#member-dictionary-pos")).toContainText("adjective");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("高兴");
  await expect(page.locator("#member-dictionary-status")).toContainText("近义关联：高兴");
  await expect(page.locator("#member-term")).toHaveValue("");
  const entries = await context.request.get(`${API}/entries`, { headers: { "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech" } });
  expect((await entries.json()).entries).toEqual([]);
  expect(calls.filter(call => new URL(call.url).origin !== ORIGIN)).toEqual([]);
  expect(calls.filter(call => call.method !== "GET")).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-term")).toHaveValue("happy");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
});

test("optional related downloads never delay the direct card or replace a selected direct meaning", async ({ context, page }) => {
  const held = await holdRelatedPosting(page);
  try {
    await openMember(context, page); await query(page, "开心"); await held.seen;
    await expect(page.locator("#member-dictionary-word")).toHaveText("chuffed");
    await expect(page.locator("#member-dictionary-use")).toBeEnabled();
    await expect(choice(page, "happy")).toHaveCount(0);
    const meaning = await page.locator("#member-dictionary-meaning").textContent();
    held.release(); await expect(choice(page, "happy")).toBeVisible();
    await expect(page.locator("#member-dictionary-word")).toHaveText("chuffed");
    await expect(page.locator("#member-dictionary-meaning")).toHaveText(meaning);
    await expect(page.locator("#member-dictionary-status")).not.toContainText("近义关联");
  } finally { held.release(); }
});

test("editing after a direct Chinese result discards late optional choices", async ({ context, page }) => {
  const held = await holdRelatedPosting(page);
  try {
    await openMember(context, page); await query(page, "开心"); await held.seen;
    await query(page, "apple"); held.release(); await page.waitForLoadState("networkidle");
    await expect(page.locator("#member-dictionary-word")).toHaveText("apple");
    await expect(page.locator("#member-dictionary-choices")).toBeHidden();
    await expect(page.locator("#member-dictionary-status")).not.toContainText("近义关联");
    await expect(page.locator("#member-dictionary-term")).toHaveValue("apple");
  } finally { held.release(); }
});

test("logout discards late optional Chinese choices without restoring private UI", async ({ context, page }) => {
  const held = await holdRelatedPosting(page);
  try {
    await openMember(context, page); await query(page, "开心"); await held.seen;
    await page.locator("#member-logout").click();
    await expect(page.locator("#member-workspace")).toBeHidden(); held.release(); await page.waitForLoadState("networkidle");
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await expect(page.locator("#member-dictionary-choices")).toBeHidden();
    await expect(page.locator("#member-dictionary-term")).toHaveValue("");
  } finally { held.release(); }
});

test("a failed optional synonym posting leaves direct lookup and use controls intact", async ({ context, page }) => {
  let failed = false;
  await page.route(RELATED_POSTING, route => { failed = true; return route.fulfill({ status: 503, body: "synthetic optional outage" }); });
  await openMember(context, page); await query(page, "开心");
  await expect.poll(() => failed).toBe(true);
  await expect(page.locator("#member-dictionary-word")).toHaveText("chuffed");
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
  await expect(page.locator("#member-dictionary-use")).toBeEnabled();
  await expect(page.locator("#member-dictionary-status")).not.toContainText(/失败|AI|近义关联/u);
  await expect(choice(page, "happy")).toHaveCount(0);
});

test("owner empty-direct lookup may preview a related meaning but never auto-publishes it", async ({ context, page }) => {
  await openOwner(context, page);
  const writes = [];
  page.on("request", request => { if (request.method() !== "GET" && new URL(request.url()).pathname.startsWith("/api/")) writes.push(request.url()); });
  await query(page, "不开心", { empty: true });
  await expect(choice(page, "unhappy")).toBeVisible();
  await expect(page.locator("#member-dictionary-word")).toHaveText("unhappy");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("不快乐");
  await expect(page.locator("#member-dictionary-status")).toContainText("近义关联：不快乐");
  await expect(page.locator("#member-dictionary-use")).toBeEnabled();
  await expect(page.locator("#member-dictionary-use")).toHaveText("收录到卓的公开词库");
  await expect(page.locator("#member-dictionary-collection-status")).toBeHidden();
  expect(writes).toEqual([]);
  await expect(page.locator("#member-term")).toHaveValue("");
});

test("choosing a different source sense removes an association unsupported by that sense", async ({ context, page }) => {
  await openMember(context, page); await query(page, "疲倦");
  await expect(choice(page, "beat")).toBeVisible(); await choice(page, "beat").click();
  await expect(page.locator("#member-dictionary-status")).toContainText("近义关联：疲乏");
  const alternate = page.locator("#member-dictionary-alternatives details").filter({ hasText: "卓式原创释义" });
  await alternate.locator("summary").click();
  await alternate.getByRole("button", { name: "选择此释义", exact: true }).click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("beat");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("击败");
  await expect(page.locator("#member-dictionary-status")).not.toContainText("近义关联");
  await expect(page.locator("#member-term")).toHaveValue("");
});
