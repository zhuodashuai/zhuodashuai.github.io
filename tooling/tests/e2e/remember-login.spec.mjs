import { expect, test } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:4187";
const PASSWORD = "a synthetic private passphrase only";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `remember-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80), url: ORIGIN }]);
  page.on("pageerror", error => { throw error; });
});

test("the checked remember choice is explicit and can be disabled for member and owner login", async ({ page }) => {
  await page.goto("/personal.html");
  await expect(page.locator("#member-auth")).toBeVisible();
  await expect(page.locator("#member-remember-login")).toBeChecked();
  await page.locator("#member-remember-login").uncheck();
  await page.locator("#login-username").fill("synthetic_user");
  await page.locator("#login-password").fill(PASSWORD);
  const request = page.waitForRequest("**/api/v1/member/login");
  await page.locator('#member-login-form button[type="submit"]').click();
  expect((await request).postDataJSON()).toEqual({ username: "synthetic_user", password: PASSWORD, remember: false });
  await page.goto("/owner.html");
  await expect(page.locator("#login-link")).toBeVisible();
  await expect(page.locator("#remember-login")).toBeChecked();
  await expect(page.locator("#login-link")).toHaveAttribute("href", "/api/v1/auth/login?remember=1");
  await page.locator("#remember-login").uncheck();
  await expect(page.locator("#login-link")).toHaveAttribute("href", "/api/v1/auth/login");
});

test("a transient session check hides private data and can recover without a password or permanent lock", async ({ context, page }) => {
  const response = await context.request.post(`${ORIGIN}/api/v1/member/register`, { headers: { Origin: ORIGIN }, data: { username: "remember_member", password: PASSWORD, remember: true } });
  expect(response.status()).toBe(200);
  await page.goto("/personal.html");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await page.route("**/api/v1/member/session", route => route.fulfill({ status: 503, json: { error: { code: "oauth_refresh_unavailable", message: "Temporary failure" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#member-session-retry")).toBeVisible();
  await expect(page.locator("#member-workspace")).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem("zhuo-member-explicit-login-required"))).toBeNull();
  await page.unroute("**/api/v1/member/session");
  await page.locator("#member-session-retry").click();
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-username")).toHaveText("@remember_member");
  await expect(page.locator("#member-auth")).toBeHidden();
});

test("failed owner logout remains locked through a late session response and reload", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
  await page.goto("/owner.html?login=ok");
  await expect(page.locator("#owner-workspace")).toBeVisible();
  await expect(page).not.toHaveURL(/login=ok/);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/api/v1/session", async route => {
    await gate;
    await route.fulfill({ json: { authenticated: true, user: { login: "zhuodashuai", id: 156042078, avatarUrl: "" }, csrfToken: "e2e-csrf-token-000000000000000000000000", expiresAt: Date.now() + 3600_000 } });
  });
  await page.route("**/api/v1/auth/logout", route => route.fulfill({ status: 503, json: { error: { code: "temporary_failure", message: "Temporary failure" } } }));
  const pending = page.waitForRequest("**/api/v1/session");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await pending;
  await page.locator("#logout-button").click();
  await expect(page.locator("#auth-gate")).toBeVisible();
  release();
  await expect(page.locator("#auth-message")).toContainText("此页已锁定");
  await expect(page.locator("#owner-workspace")).toBeHidden();
  await page.unroute("**/api/v1/session");
  await page.reload();
  await expect(page.locator("#auth-gate")).toBeVisible();
  await expect(page.locator("#owner-workspace")).toBeHidden();
  await expect(page.locator("#auth-message")).toContainText("此页已退出");
});

test("a retry after an outage retains the expected member identity when a cookie changes", async ({ context, page }) => {
  const register = username => context.request.post(`${ORIGIN}/api/v1/member/register`, { headers: { Origin: ORIGIN }, data: { username, password: PASSWORD, remember: true } });
  expect((await register("remember_alice")).status()).toBe(200);
  await page.goto("/personal.html");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  await page.route("**/api/v1/member/session", route => route.fulfill({ status: 503, json: { error: { code: "temporary_failure", message: "Temporary failure" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#member-session-retry")).toBeVisible();
  expect((await register("remember_bob")).status()).toBe(200);
  await page.unroute("**/api/v1/member/session");
  await page.locator("#member-session-retry").click();
  await expect(page.locator("#member-status")).toContainText("账号已改变");
  await expect(page.locator("#member-workspace")).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem("zhuo-member-explicit-login-required"))).toBe("1");
});
