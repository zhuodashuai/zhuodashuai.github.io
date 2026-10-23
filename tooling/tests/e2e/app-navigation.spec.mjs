import { expect, test } from "@playwright/test";

const labels = ["公开词本", "查词", "随手记", "我的词本"];
const pages = [
  ["/", "公开词本"],
  ["/personal.html", "我的词本"],
  ["/dictionary.html", "查词"],
  ["/quick-notes.html", "随手记"],
  ["/owner.html", null],
  ["/guide.html", null]
];

for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`all six shells retain compact usable main navigation at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const writes = [];
    page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); });
    for (const [path, current] of pages) {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "主要导航", exact: true });
      await expect(nav.locator("a")).toHaveText(labels);
      await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
      if (current) await expect(nav.getByRole("link", { name: current, exact: true })).toHaveAttribute("aria-current", "page");
      else {
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);
        await expect(page.locator('footer a[aria-current="page"]')).toHaveText(path === "/owner.html" ? "管理" : "使用手册");
      }
      await expect(page.locator('header a[href="guide.html"]')).toHaveCount(0);
      await expect(page.locator('footer a[href^="guide.html"], footer a[href*="/guide.html"]')).toBeVisible();
      const geometry = await nav.locator("a").evaluateAll(links => ({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        boxes: links.map(link => {
          const box = link.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(link);
          return { left: box.left, right: box.right, top: box.top, height: box.height, lines: range.getClientRects().length };
        })
      }));
      expect(geometry.scrollWidth, path).toBeLessThanOrEqual(viewport.width);
      for (const box of geometry.boxes) {
        expect(box.left, path).toBeGreaterThanOrEqual(0);
        expect(box.right, path).toBeLessThanOrEqual(viewport.width);
        expect(box.height, path).toBeGreaterThanOrEqual(44);
        expect(box.lines, path).toBeLessThanOrEqual(1);
      }
      expect(new Set(geometry.boxes.map(box => Math.round(box.top))).size, path).toBe(1);
      if (viewport.width <= 390) expect(geometry.boxes[0].top, path).toBeGreaterThan(35);
    }
    expect(writes).toEqual([]);
  });
}

test("long account chrome does not squeeze the 360px primary navigation", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/personal.html");
  await expect(page.locator("#member-auth")).toBeVisible();
  // Layout-only account chrome; do not register or authenticate a real account.
  await page.evaluate(() => {
    const username = document.getElementById("member-username");
    username.textContent = "a_very_long_member_name_9"; username.hidden = false;
    const logout = document.getElementById("member-logout"); logout.hidden = false;
  });
  const geometry = await page.evaluate(() => {
    const nav = document.querySelector(".app-primary-nav").getBoundingClientRect();
    const account = document.querySelector(".app-account").getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, accountRight: account.right, navTop: nav.top, accountBottom: account.bottom };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(360);
  expect(geometry.accountRight).toBeLessThanOrEqual(360);
  expect(geometry.navTop).toBeGreaterThanOrEqual(geometry.accountBottom);
});

test("shared navigation is present without JavaScript and private forms remain fail-closed", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  try {
    for (const [path] of pages) {
      await page.goto(`http://127.0.0.1:4187${path}`);
      const nav = page.getByRole("navigation", { name: "主要导航", exact: true });
      await expect(nav.locator("a")).toHaveText(labels);
      await expect(nav.getByRole("link", { name: "我的词本", exact: true })).toHaveAttribute("href", "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/personal.html");
      if (path === "/personal.html") {
        await expect(page.locator("#member-login-form fieldset")).toHaveAttribute("disabled", "");
        await expect(page.locator("#member-register-form fieldset")).toHaveAttribute("disabled", "");
        await expect(page.locator("#login-username")).toBeDisabled();
        await expect(page.locator("#register-username")).toBeDisabled();
      }
    }
  } finally { await context.close(); }
});

test("public inline lookup navigation focuses its existing form without leaving the book", async ({ page }) => {
  await page.goto("/?book=never-let-me-go&chapter=chapter-1");
  await page.locator("#dictionary-link").click();
  await expect(page.locator("#lookup-input")).toBeFocused();
  await expect(page).toHaveURL(/\?book=never-let-me-go&chapter=chapter-1#library-lookup$/u);
  await expect(page.locator("#dictionary-link")).toHaveAttribute("href", "#library-lookup");
});
