import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

const ORIGIN = "http://127.0.0.1:4187";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `speed-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  const response = await context.request.post(`${ORIGIN}/api/v1/member/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "speed_reader", password: "isolated speed test password 2026" }
  });
  expect(response.status()).toBe(200);
  page.on("pageerror", error => { throw error; });
});
async function open(page) {
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
}
async function query(page, input) {
  await page.locator("#member-dictionary-term").fill(input);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-result")).toBeVisible();
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
}
async function hold(page, pattern) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(pattern, async route => {
    const response = await route.fetch(); await gate;
    try { await route.fulfill({ response }); } catch { /* Cancelled callers must not resurrect UI. */ }
  });
  return release;
}

test("cold and warm expanded lookup, fill and save do not wait for the hung 20-second compact warmup", async ({ page }) => {
  const release = await hold(page, "**/data/member-dictionary.json*");
  try {
    await open(page);
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now(); await query(page, "abacus");
      expect(Date.now() - started).toBeLessThan(4_000);
      await expect(page.locator("#member-dictionary-word")).toHaveText("abacus");
      await expect(page.locator("#member-dictionary-meaning")).toContainText("算盘");
      await expect(page.locator("#member-dictionary-status")).toContainText("基础词形索引仍在加载");
      await expect(page.locator("#member-dictionary-use")).toBeEnabled();
      await page.locator("#member-dictionary-use").click();
      if (!attempt) {
        await page.locator("#member-save").click();
        await expect(page.locator(".personal-entry")).toHaveCount(1);
      } else await expect(page.locator("#member-dictionary-status")).toContainText("不会重复");
    }
  } finally { release(); }
});

test("entries unlock adding while delayed learning still locks study, scoring and full-record backup", async ({ page }) => {
  const release = await hold(page, "**/api/v1/member/learning");
  try {
    await open(page);
    await expect(page.locator("#member-learning-summary")).toContainText("正在读取");
    await query(page, "hip");
    await expect(page.locator("#member-dictionary-use")).toBeEnabled();
    await page.locator("#member-dictionary-use").click();
    await expect(page.locator("#member-save")).toBeEnabled();
    await page.locator("#member-save").click();
    await expect(page.locator(".personal-entry")).toHaveCount(1);
    await expect(page.locator("#member-study-all")).toBeDisabled();
    await expect(page.locator("#member-study-ratings")).toHaveJSProperty("disabled", true);
    await expect(page.locator("#member-export")).toBeDisabled();
    // A synthetic click cannot bypass the same handler-side learning guards.
    await page.locator("#member-study-all").evaluate(button => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await expect(page.locator("#member-study-dialog")).not.toBeVisible();
    release();
    await expect(page.locator("#member-study-all")).toBeEnabled();
    await expect(page.locator("#member-export")).toBeEnabled();
  } finally { release(); }
});

test("Chinese basic results are labelled partial, usable immediately, and complete search stays explicitly available", async ({ page }) => {
  await open(page); await query(page, "苹果");
  await expect(page.locator("#member-dictionary-status")).toContainText("基础词库结果（非完整搜索）");
  await expect(page.locator("#member-dictionary-full")).toBeVisible();
  await expect(page.locator("#member-dictionary-use")).toBeEnabled();
  const original = await page.locator("#member-dictionary-word").textContent();
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-term")).toHaveValue(original);
  await page.locator("#member-dictionary-full").click();
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
  await expect(page.locator("#member-dictionary-full")).toBeHidden();
  await expect(page.locator("#member-dictionary-status")).not.toContainText("非完整搜索");
  await expect(page.locator(".dictionary-choice")).toHaveCount(20);
  // Searching more must not replace an explicitly filled draft.
  await expect(page.locator("#member-term")).toHaveValue(original);
});

test("a Chinese hot miss still reaches the complete rare-word dictionary", async ({ page }) => {
  await open(page); await query(page, "算盘");
  // Some hot versions contain abacus; if not, complete search automatically fills this gap.
  if (await page.locator("#member-dictionary-full").isVisible()) {
    await page.locator("#member-dictionary-full").click();
    await expect(page.locator("#member-dictionary-search")).toBeEnabled();
  }
  await expect(page.locator("#member-dictionary-meaning")).toContainText("算盘");
  await expect(page.locator("#member-dictionary-full")).toBeHidden();
});

test("input changes and logout discard late public lookup responses, without automatically filling private fields", async ({ page }) => {
  const compact = await hold(page, "**/data/member-dictionary.json*");
  const full = await hold(page, "**/data/expanded-dictionary/**/en-*.json*");
  try {
    await open(page);
    await page.locator("#member-dictionary-term").fill("abacus");
    await page.locator("#member-dictionary-term").press("Enter");
    await page.locator("#member-dictionary-term").fill("new input");
    full(); await page.waitForTimeout(850);
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await expect(page.locator("#member-term")).toHaveValue("");
    await page.locator("#member-dictionary-term").fill("abacus");
    await page.locator("#member-dictionary-term").press("Enter");
    await page.locator("#member-logout").click(); compact();
    await expect(page.locator("#member-workspace")).toBeHidden();
    await page.waitForTimeout(850);
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await expect(page.locator("#member-term")).toHaveValue("");
  } finally { compact(); full(); }
});
