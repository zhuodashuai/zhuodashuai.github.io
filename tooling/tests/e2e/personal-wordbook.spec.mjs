import { expect, test } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Synthetic accounts only. The server fixture is isolated by e2e_run and never
// contacts a provider, GitHub, or a production account/password database.
const ORIGIN = "http://127.0.0.1:4187";
const API = `${ORIGIN}/api/v1/member`;
const PASSWORD = "  A private test phrase 密码 42  ";
const NEW_PASSWORD = "  A different safe phrase 密码 73  ";
const runId = info => `member-${createHash("sha256").update(info.testId).digest("hex").slice(0, 22)}`;

async function isolate(context, info) {
  await context.addCookies([{ name: "e2e_run", value: runId(info), url: ORIGIN, sameSite: "Lax" }]);
}

test.beforeEach(async ({ context, page }, info) => {
  await isolate(context, info);
  page.on("pageerror", error => { throw new Error(`Unhandled personal-wordbook error: ${error.message}`); });
  page.on("dialog", dialog => dialog.accept());
});

async function request(context, method, path, data, csrfToken, extraHeaders = {}) {
  return context.request.fetch(`${API}/${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { Origin: ORIGIN, "Content-Type": "application/json" }),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}), ...extraHeaders
    },
    ...(data === undefined ? {} : { data })
  });
}

async function seedAccount(context, username, password = PASSWORD) {
  const response = await request(context, "POST", "register", { username, password });
  expect(response.status()).toBe(200);
  const session = await response.json();
  expect(session.authenticated).toBe(true);
  return session;
}

async function seedEntry(context, session, term, meaning = "① 测试释义", note = "") {
  const response = await request(context, "POST", "entries", { term, meaning, note, mutationId: randomUUID() }, session.csrfToken);
  expect(response.status()).toBe(200);
  return (await response.json()).entry;
}

async function list(context) {
  const response = await request(context, "GET", "entries");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toMatch(/private.*no-store/u);
  return response.json();
}

async function openPersonal(page) {
  await page.goto("/personal.html");
  await expect(page.locator("#member-auth")).toBeVisible();
  await expect(page.locator('[data-auth-view="register"]')).toBeEnabled();
  await expect(page.locator("#member-workspace")).toBeHidden();
}

async function acknowledge(page) {
  await expect(page.locator("#member-recovery")).toBeVisible();
  const code = await page.locator("#member-recovery-code").textContent();
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/u);
  await expect(page.locator("#member-recovery-continue")).toBeDisabled();
  await page.locator("#member-recovery-ack").check();
  await page.locator("#member-recovery-continue").click();
  await expect(page.locator("#member-recovery")).toBeHidden();
  await expect(page.locator("#member-recovery-code")).toHaveText("");
  return code;
}

async function register(page, username = "alice_member", password = PASSWORD) {
  await page.locator('[data-auth-view="register"]').click();
  await page.locator("#register-username").fill(username);
  await page.locator("#register-password").fill(password);
  await page.locator('#member-register-form button[type="submit"]').click();
  const code = await acknowledge(page);
  await ready(page, username.toLowerCase());
  await expect(page.locator("#register-password")).toHaveValue("");
  return code;
}

async function ready(page, username) {
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-username")).toHaveText(`@${username}`);
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "saved");
}

async function login(page, username, password = PASSWORD) {
  await page.locator('[data-auth-view="login"]').click();
  await page.locator("#login-username").fill(username);
  await page.locator("#login-password").fill(password);
  await page.locator('#member-login-form button[type="submit"]').click();
  await ready(page, username.toLowerCase());
}

function row(page, term) {
  return page.locator(".personal-entry").filter({ has: page.getByRole("button", { name: `查看 ${term}`, exact: true }) });
}

async function save(page, term, meaning = "① 我的中文释义\n② 另一个意思", note = "听到之后，立即记下。", enter = false) {
  await page.locator("#member-new").click();
  await page.locator("#member-term").fill(term);
  await page.locator("#member-meaning").fill(meaning);
  await page.locator("#member-note").fill(note);
  if (enter) await page.locator("#member-term").press("Enter");
  else await page.locator("#member-save").click();
  await expect(row(page, term)).toBeVisible();
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "saved");
  await expect(page.locator("#member-term")).toHaveValue("");
}

async function logout(page) {
  await page.locator("#member-logout").click();
  await expect(page.locator("#member-auth")).toBeVisible();
  await expect(page.locator("#member-workspace")).toBeHidden();
  await expect(page.locator("#member-entry-list")).toBeEmpty();
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator('[data-auth-view="login"]')).toBeEnabled();
}

async function publicSnapshot(context) {
  const response = await context.request.get(`${ORIGIN}/api/v1/public/wordbook`);
  expect(response.status()).toBe(200);
  return response.json();
}

async function accountTools(page) {
  const tools = page.locator(".account-tools");
  if (!await tools.evaluate(element => element.open)) await tools.locator("summary").click();
}

async function downloadText(page, selector) {
  const pending = page.waitForEvent("download");
  await page.locator(selector).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return readFile(await download.path(), "utf8");
}

test("register, save with Enter, search, view, edit, reload, login and delete without touching public words", async ({ context, page }) => {
  const before = await publicSnapshot(context);
  const unexpected = [];
  page.on("request", value => {
    const url = new URL(value.url());
    if (url.origin !== ORIGIN || /\/api\/v1\/owner\//u.test(url.pathname)) unexpected.push(value.url());
  });
  await openPersonal(page);
  await register(page, "Alice_Member");
  await save(page, "by some fluke", "", "Heard during a conversation.", true);
  await expect(row(page, "by some fluke")).toContainText("中文释义待补充");
  await row(page, "by some fluke").locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-dialog")).toBeVisible();
  await expect(page.locator("#member-detail-meaning")).toHaveText("中文释义尚待补充。");
  await page.locator("#member-detail-edit").click();
  await page.locator("#member-meaning").fill("① 碰巧；侥幸\n② 出于偶然的好运");
  await page.locator("#member-save").click();
  await expect(row(page, "by some fluke")).toContainText("① 碰巧；侥幸\n② 出于偶然的好运");
  await page.locator("#member-search").fill("偶然");
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  await page.locator("#member-search").fill("nonexistent phrase");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  await page.locator("#member-search").fill("");
  await page.reload();
  await ready(page, "alice_member");
  await expect(row(page, "by some fluke")).toContainText("① 碰巧；侥幸");
  await logout(page);
  await login(page, "ALICE_MEMBER");
  await expect(row(page, "by some fluke")).toBeVisible();
  await row(page, "by some fluke").locator('[data-action="delete"]').click();
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "saved");
  expect((await list(context)).entries).toHaveLength(0);
  expect(await publicSnapshot(context)).toEqual(before);
  expect(unexpected).toEqual([]);
  const owner = await context.request.get(`${ORIGIN}/api/v1/owner/wordbook`);
  expect(owner.status()).toBe(401);
  expect((await context.cookies()).some(cookie => cookie.name === "e2e_auth")).toBe(false);
});

test("two users remain separate across contexts, reload, and switching accounts in one browser page", async ({ browser, context, page }, info) => {
  const before = await publicSnapshot(context);
  await openPersonal(page);
  await register(page, "alice_member");
  await save(page, "alice private phrase");
  const aEntry = (await list(context)).entries[0];
  const other = await browser.newContext();
  await isolate(other, info);
  try {
    const bSession = await seedAccount(other, "bob_member");
    await seedEntry(other, bSession, "bob private phrase");
    const foreign = await request(other, "PUT", `entries/${aEntry.id}`, { revision: aEntry.revision, term: "stolen phrase", mutationId: randomUUID() }, bSession.csrfToken);
    expect(foreign.status()).toBe(404);
    expect((await list(other)).entries.map(entry => entry.term)).toEqual(["bob private phrase"]);
    expect((await list(context)).entries.map(entry => entry.term)).toEqual(["alice private phrase"]);
    await logout(page);
    await login(page, "bob_member");
    await expect(row(page, "bob private phrase")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("alice private phrase");
    await page.reload();
    await ready(page, "bob_member");
    await logout(page);
    await login(page, "alice_member");
    await expect(row(page, "alice private phrase")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("bob private phrase");
    expect(await publicSnapshot(context)).toEqual(before);
  } finally { await other.close(); }
});

test("duplicate and stale edits preserve user input and never overwrite a newer cloud version", async ({ context, page }) => {
  await openPersonal(page);
  await register(page);
  await save(page, "by some fluke");
  await page.locator("#member-term").fill("BY SOME FLUKE");
  await page.locator("#member-meaning").fill("this must not overwrite the existing record");
  await page.locator("#member-save").click();
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#member-conflict")).toContainText("没有重复新增");
  await expect(page.locator("#member-term")).toHaveValue("BY SOME FLUKE");
  expect((await list(context)).entries).toHaveLength(1);
  await page.locator("#member-cancel").click();
  await row(page, "by some fluke").locator('[data-action="edit"]').click();
  const original = (await list(context)).entries[0];
  const session = await (await request(context, "GET", "session")).json();
  const changed = await request(context, "PUT", `entries/${original.id}`, { revision: original.revision, term: original.term, meaning: "云端另一个设备的新版释义", note: "remote", mutationId: randomUUID() }, session.csrfToken);
  expect(changed.status()).toBe(200);
  await page.locator("#member-meaning").fill("当前页面尚未保存的旧版本修改");
  await page.locator("#member-save").click();
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#member-conflict")).toContainText("没有覆盖");
  await expect(page.locator("#member-meaning")).toHaveValue("当前页面尚未保存的旧版本修改");
  await page.locator("#member-refresh").click();
  await expect(row(page, "by some fluke")).toContainText("云端另一个设备的新版释义");
  await expect(page.locator("#member-meaning")).toHaveValue("当前页面尚未保存的旧版本修改");
  expect((await list(context)).entries[0].meaning).toBe("云端另一个设备的新版释义");
});

test.describe("controlled response races", () => {
  // Page.route cannot intercept a GET owned by an installed service worker.
  // Only these fault-injection cases block SW; real caching/offline behavior is
  // exercised below with the default serviceWorkers: allow browser context.
  test.use({ serviceWorkers: "block" });

test("a committed save with a lost response retries the same mutation without making a duplicate", async ({ context, page }) => {
  await openPersonal(page);
  await register(page);
  const mutationIds = [];
  let lost = false;
  await page.route(`${API}/entries`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    mutationIds.push(route.request().postDataJSON().mutationId);
    if (!lost) {
      lost = true;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.locator("#member-term").fill("uncertain acknowledgement");
  await page.locator("#member-meaning").fill("已提交但回包丢失的测试");
  await page.locator("#member-save").click();
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#member-term")).toHaveValue("uncertain acknowledgement");
  expect((await list(context)).entries).toHaveLength(1);
  await page.locator("#member-save").click();
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "saved");
  await expect(row(page, "uncertain acknowledgement")).toBeVisible();
  expect(mutationIds).toHaveLength(2);
  expect(new Set(mutationIds).size).toBe(1);
  expect((await list(context)).entries).toHaveLength(1);
});

test("late user A list responses cannot restore private content after logout and user B login", async ({ browser, context, page }, info) => {
  await openPersonal(page);
  await register(page);
  await save(page, "alice confidential phrase");
  const other = await browser.newContext();
  await isolate(other, info);
  const bSession = await seedAccount(other, "bob_member");
  await seedEntry(other, bSession, "bob safe phrase");
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { arrived = resolve; });
  let captured = false;
  await page.route(`${API}/entries`, async route => {
    if (route.request().method() !== "GET" || captured) return route.continue();
    captured = true;
    const response = await route.fetch();
    arrived();
    await gate;
    // Correct cancellation can close the original request before this gate.
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.locator("#member-refresh").click();
    await seen;
    await logout(page);
    await login(page, "bob_member");
    await expect(row(page, "bob safe phrase")).toBeVisible();
    release();
    await page.unroute(`${API}/entries`);
    await expect(page.locator("body")).not.toContainText("alice confidential phrase");
    await expect(page.locator("#member-username")).toHaveText("@bob_member");
    await page.locator("#member-refresh").click();
    await ready(page, "bob_member");
    await expect(page.locator("body")).not.toContainText("alice confidential phrase");
  } finally { release(); await other.close(); }
});

test("a continuously focused page locks at session expiry and needs explicit login before revealing words again", async ({ context, page }) => {
  const session = await seedAccount(context, "alice_member");
  await seedEntry(context, session, "private until session expiry");
  let shortened = false;
  await page.route(`${API}/session`, async route => {
    if (shortened) return route.continue();
    shortened = true;
    const response = await route.fetch();
    const value = await response.json();
    await route.fulfill({ response, json: { ...value, expiresAt: Date.now() + 3000 } });
  });
  await page.goto("/personal.html");
  await ready(page, "alice_member");
  await expect(row(page, "private until session expiry")).toBeVisible();
  // No focus, API call, or browser reload triggers the expiry. The page's own
  // generation-bound timer must hide data even though this fixture cookie is
  // intentionally still valid at the server.
  await expect(page.locator("#member-auth")).toBeVisible({ timeout: 7000 });
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "locked");
  await expect(page.locator("#member-workspace")).toBeHidden();
  await expect(page.locator("#member-entry-list")).toBeEmpty();
  await expect(page.locator("body")).not.toContainText("private until session expiry");
  expect((await (await request(context, "GET", "session")).json()).authenticated).toBe(true);
  await page.reload();
  await expect(page.locator("#member-auth")).toBeVisible();
  await expect(page.locator("#member-workspace")).toBeHidden();
  await login(page, "alice_member");
  await expect(row(page, "private until session expiry")).toBeVisible();
});

test("an unnoticed shared-cookie account change locks the old page instead of rendering B words under A's username", async ({ browser, context, page }, info) => {
  await openPersonal(page);
  await register(page, "alice_member");
  await save(page, "alice cookie scope phrase");
  const bContext = await browser.newContext();
  await isolate(bContext, info);
  try {
    const bSession = await seedAccount(bContext, "bob_member");
    await seedEntry(bContext, bSession, "bob must not leak into alice");
    // Reproduce a cookie changed by another login without any app tab or
    // BroadcastChannel event. The old page still believes it belongs to A.
    const bCookie = (await bContext.cookies()).find(cookie => cookie.name === "e2e_member_session");
    expect(bCookie).toBeTruthy();
    await context.addCookies([bCookie]);
    await expect(page.locator("#member-username")).toHaveText("@alice_member");
    const listRequest = page.waitForRequest(value => value.url() === `${API}/entries` && value.method() === "GET");
    await page.locator("#member-refresh").click();
    const observed = await listRequest;
    expect(observed.headers()["x-member-user"]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(observed.headers()["x-member-user"]).not.toBe(bSession.user.id);
    await expect(page.locator("#member-status")).toHaveAttribute("data-state", "locked");
    await expect(page.locator("#member-auth")).toBeVisible();
    await expect(page.locator("#member-workspace")).toBeHidden();
    await expect(page.locator("#member-entry-list")).toBeEmpty();
    await expect(page.locator("body")).not.toContainText("alice cookie scope phrase");
    await expect(page.locator("body")).not.toContainText("bob must not leak into alice");
    await login(page, "bob_member");
    await expect(row(page, "bob must not leak into alice")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("alice cookie scope phrase");
  } finally { await bContext.close(); }
});

});

test("a failed logout locks this page across reload even when the old server cookie survives", async ({ context, page }) => {
  await openPersonal(page);
  await register(page);
  await save(page, "must disappear on logout");
  await context.addCookies([{ name: "e2e_member_logout_fail", value: "1", url: ORIGIN }]);
  await logout(page);
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "locked");
  expect((await (await request(context, "GET", "session")).json()).authenticated).toBe(true);
  await page.reload();
  await expect(page.locator("#member-auth")).toBeVisible();
  await expect(page.locator("#member-workspace")).toBeHidden();
  await expect(page.locator("body")).not.toContainText("must disappear on logout");
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "locked");
  await login(page, "alice_member");
  await expect(row(page, "must disappear on logout")).toBeVisible();
});

test("recovery rotates the one-time code, invalidates old passwords and revokes every old session", async ({ browser, context, page }, info) => {
  await openPersonal(page);
  const firstCode = await register(page);
  await save(page, "survives password recovery");
  const oldSession = await browser.newContext();
  await isolate(oldSession, info);
  try {
    expect((await request(oldSession, "POST", "login", { username: "alice_member", password: PASSWORD })).status()).toBe(200);
    await logout(page);
    await page.locator('[data-auth-view="reset"]').click();
    await page.locator("#reset-username").fill("ALICE_MEMBER");
    await page.locator("#reset-recovery-code").fill(firstCode);
    await page.locator("#reset-password").fill(NEW_PASSWORD);
    await page.locator('#member-reset-form button[type="submit"]').click();
    const nextCode = await acknowledge(page);
    expect(nextCode).not.toBe(firstCode);
    await expect(page.locator("#member-auth")).toBeVisible();
    expect((await (await request(oldSession, "GET", "session")).json()).authenticated).toBe(false);
    expect((await request(oldSession, "POST", "login", { username: "alice_member", password: PASSWORD })).status()).toBe(401);
    expect((await request(oldSession, "POST", "password/reset", { username: "alice_member", recoveryCode: firstCode, newPassword: PASSWORD })).status()).toBe(401);
    await login(page, "alice_member", NEW_PASSWORD);
    await expect(row(page, "survives password recovery")).toBeVisible();
    await expect(page.locator("#reset-password")).toHaveValue("");
    await expect(page.locator("#reset-recovery-code")).toHaveValue("");
  } finally { await oldSession.close(); }
});

test("exports only this user's saved words; XSS stays text and private responses never enter browser storage", async ({ browser, context, page }, info) => {
  await openPersonal(page);
  const code = await register(page);
  const note = '<img src=x onerror="window.__memberXss=1"> private note';
  await save(page, "a private export phrase", "① 本账号专属", note);
  await row(page, "a private export phrase").locator('[data-action="view"]').click();
  await expect(page.locator("#member-detail-note")).toHaveText(note);
  expect(await page.evaluate(() => window.__memberXss)).toBeUndefined();
  expect(await page.locator("#member-detail-dialog img").count()).toBe(0);
  await page.locator("#member-detail-close").click();
  const other = await browser.newContext();
  await isolate(other, info);
  try {
    const bSession = await seedAccount(other, "bob_member");
    await seedEntry(other, bSession, "another tenants secret");
    await accountTools(page);
    const text = await downloadText(page, "#member-export");
    const exported = JSON.parse(text);
    expect(exported.entries.map(entry => entry.term)).toEqual(["a private export phrase"]);
    expect(text).not.toContain("another tenants secret");
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(code);
    expect(text).not.toMatch(/"(?:csrfToken|password|recoveryCode|rawSession|token)"\s*:/iu);
    const stored = await page.evaluate(async () => ({
      local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }),
      caches: (await Promise.all((await caches.keys()).map(async key => (await caches.open(key)).keys()))).flat().map(value => value.url),
      databases: (await indexedDB.databases()).map(value => value.name)
    }));
    expect(stored.local + stored.session).not.toContain("a private export phrase");
    expect(stored.local + stored.session).not.toContain(code);
    expect(stored.local + stored.session).not.toContain(PASSWORD);
    expect(stored.caches.filter(url => url.includes("/api/v1/member"))).toEqual([]);
    expect(stored.databases.filter(name => /member|personal/iu.test(name))).toEqual([]);
  } finally { await other.close(); }
});

test("offline save is never reported saved, preserves the open draft, and offline reload has no private preview", async ({ context, page }) => {
  await openPersonal(page);
  await register(page);
  await save(page, "cloud only private entry");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await ready(page, "alice_member");
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.locator("#member-term").fill("my unsent offline phrase");
  await page.locator("#member-meaning").fill("这条尚未传到云端");
  await context.setOffline(true);
  await page.locator("#member-save").click();
  await expect(page.locator("#member-status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#member-term")).toHaveValue("my unsent offline phrase");
  await expect(row(page, "my unsent offline phrase")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#member-session-retry")).toBeVisible();
  await expect(page.locator("#member-auth")).toBeHidden();
  await expect(page.locator("#member-workspace")).toBeHidden();
  await expect(page.locator("#member-entry-list")).toBeEmpty();
  await expect(page.locator("body")).not.toContainText("cloud only private entry");
  await context.setOffline(false);
  await page.locator("#member-session-retry").click();
  await ready(page, "alice_member");
  expect((await list(context)).entries.map(entry => entry.term)).toEqual(["cloud only private entry"]);
});

test("an uncached Cloudflare-style personal URL opens the blank private shell offline rather than the public reader", async ({ context, page }) => {
  await openPersonal(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.goto("/personal?offline-fallback-check=73");
  await expect(page.getByRole("heading", { name: "我的词本", exact: true })).toBeVisible();
  await expect(page.locator("#member-session-retry")).toBeVisible();
  await expect(page.locator("#member-auth")).toBeHidden();
  await expect(page.locator("#member-workspace")).toBeHidden();
  await expect(page.locator("#member-entry-list")).toBeEmpty();
  await expect(page.locator("#library-search")).toHaveCount(0);
});

test("account deletion revokes old sessions and deletes only that account's private data", async ({ browser, context, page }, info) => {
  const before = await publicSnapshot(context);
  await openPersonal(page);
  await register(page);
  await save(page, "deleted with this account");
  const old = await browser.newContext(), other = await browser.newContext();
  await isolate(old, info); await isolate(other, info);
  try {
    expect((await request(old, "POST", "login", { username: "alice_member", password: PASSWORD })).status()).toBe(200);
    const bSession = await seedAccount(other, "bob_member");
    await seedEntry(other, bSession, "other account stays intact");
    const session = await (await request(context, "GET", "session")).json();
    expect((await request(context, "DELETE", "account", { password: NEW_PASSWORD, confirmation: "DELETE" }, session.csrfToken)).status()).toBe(401);
    expect((await list(context)).entries).toHaveLength(1);
    await accountTools(page);
    await page.locator("#member-delete-account").click();
    await expect(page.locator("#delete-account-dialog")).toBeVisible();
    await page.locator("#delete-account-password").fill(PASSWORD);
    await page.locator("#delete-account-confirmation").fill("DELETE");
    await page.locator("#delete-account-submit").click();
    await expect(page.locator("#member-auth")).toBeVisible();
    await expect(page.locator("#member-entry-list")).toBeEmpty();
    await expect(page.locator("#delete-account-password")).toHaveValue("");
    expect((await (await request(old, "GET", "session")).json()).authenticated).toBe(false);
    expect((await request(old, "POST", "login", { username: "alice_member", password: PASSWORD })).status()).toBe(401);
    expect((await list(other)).entries.map(entry => entry.term)).toEqual(["other account stays intact"]);
    expect(await publicSnapshot(context)).toEqual(before);
  } finally { await old.close(); await other.close(); }
});

test("fixture enforces body UUID idempotency, same-origin JSON, CSRF and refuses identity/owner escalation", async ({ context }) => {
  const session = await seedAccount(context, "alice_member");
  const payload = { term: "idempotent phrase", meaning: "", note: "", mutationId: randomUUID() };
  const first = await request(context, "POST", "entries", payload, session.csrfToken);
  expect(first.status()).toBe(200);
  const value = await first.json();
  const repeat = await request(context, "POST", "entries", payload, session.csrfToken);
  expect(await repeat.json()).toEqual(value);
  expect((await list(context)).entries).toHaveLength(1);
  expect((await request(context, "POST", "entries", { ...payload, term: "changed reuse" }, session.csrfToken)).status()).toBe(409);
  expect((await request(context, "POST", "entries", { ...payload, mutationId: randomUUID() })).status()).toBe(403);
  expect((await request(context, "POST", "entries", { ...payload, mutationId: randomUUID() }, session.csrfToken, { Origin: "https://attacker.invalid" })).status()).toBe(403);
  expect((await request(context, "POST", "entries", { ...payload, mutationId: randomUUID(), userId: "owner", role: "admin" }, session.csrfToken)).status()).toBe(400);
  const otherRun = await context.request.get(`${ORIGIN}/api/v1/owner/wordbook`);
  expect(otherRun.status()).toBe(401);
});

for (const width of [360, 390, 500]) {
  test(`mobile ${width}px: auth, recovery, editor and card actions fit without horizontal scrolling`, async ({ context, page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openPersonal(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    await register(page);
    await save(page, "a worthwhile long expression to remember", "① 有用的表达\n② 保持清晰分行", "一小段备注。");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    const headerLines = await page.locator(".personal-brand strong, .personal-topbar nav > a, #member-logout").evaluateAll(elements => elements.map(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return { text: element.textContent, lines: range.getClientRects().length };
    }));
    for (const heading of headerLines) expect(heading.lines, `${heading.text} should not wrap into a vertical label`).toBeLessThanOrEqual(1);
    const measurements = await page.locator("#member-term, #member-meaning, #member-note").evaluateAll(elements => elements.map(element => ({ font: parseFloat(getComputedStyle(element).fontSize), left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })));
    for (const size of measurements) { expect(size.font).toBeGreaterThanOrEqual(16); expect(size.left).toBeGreaterThanOrEqual(0); expect(size.right).toBeLessThanOrEqual(width); }
    const button = await page.locator("#member-new").boundingBox();
    expect(button.height).toBeGreaterThanOrEqual(44);
    await row(page, "a worthwhile long expression to remember").locator('[data-action="view"]').click();
    await expect(page.locator("#member-detail-dialog")).toBeVisible();
    const dialog = await page.locator("#member-detail-dialog").boundingBox();
    expect(dialog.x).toBeGreaterThanOrEqual(0); expect(dialog.x + dialog.width).toBeLessThanOrEqual(width);
    await page.locator("#member-detail-close").click();
    const image = resolve(`qa-artifacts/member-mobile-${width}.png`);
    await mkdir(dirname(image), { recursive: true });
    await page.screenshot({ path: image, fullPage: true });
    expect((await list(context)).entries).toHaveLength(1);
  });
}
