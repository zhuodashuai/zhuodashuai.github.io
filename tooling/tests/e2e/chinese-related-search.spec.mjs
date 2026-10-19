import { test, expect } from "@playwright/test";

async function query(page, value) {
  await page.locator("#dictionary-query").fill(value);
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  await expect(page.locator("#dictionary-related-status")).toContainText("近义关联仅供", { timeout: 12_000 });
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function bucket(value) { let hash = 2166136261; for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; } return hash % 128; }

test("Chinese happiness finds real related English meanings on a phone without collecting anything", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = [], foreign = [];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (new URL(request.url()).origin !== "http://127.0.0.1:4187") foreign.push(request.url());
  });
  await page.goto("/dictionary.html"); await query(page, "开心");
  const choices = page.locator("#dictionary-choices button[data-dictionary-term]");
  await expect(choices.first()).toHaveAttribute("data-dictionary-term", "chuffed");
  const happy = page.locator('#dictionary-choices button[data-dictionary-term="happy"]');
  const glad = page.locator('#dictionary-choices button[data-dictionary-term="glad"]');
  await expect(happy).toContainText("近义关联：高兴"); await expect(glad).toBeVisible();
  await expect(page.locator('#dictionary-choices button[data-dictionary-term="pistachio nut"]')).toHaveCount(0);
  await happy.click();
  await expect(page.locator("#dictionary-term")).toHaveText("happy");
  await expect(page.locator("#dictionary-pos")).toHaveText("adjective");
  await expect(page.locator("#dictionary-meaning")).toContainText("高兴");
  await expect(page.locator("#dictionary-related-match")).toContainText("近义关联：高兴");
  await expect(page.locator("#dictionary-query")).toHaveValue("开心");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(writes).toEqual([]); expect(foreign).toEqual([]);
});

test("positive and negative meaning families never leak polarity or food compounds", async ({ page }) => {
  await page.goto("/dictionary.html");
  for (const value of ["快乐", "不开心", "好吃"]) {
    await query(page, value);
    const terms = await page.locator("#dictionary-choices button").evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
    if (value === "快乐") { expect(terms).toContain("happy"); expect(terms).not.toContain("unhappy"); }
    if (value === "不开心") { expect(terms).toContain("unhappy"); expect(terms).not.toContain("happy"); expect(terms).not.toContain("glad"); }
    if (value === "好吃") { expect(terms).toContain("tasty"); expect(terms).toContain("delicious"); expect(terms).not.toContain("unpalatable"); }
  }
});

test("slow optional associations leave direct lookup usable and cannot overwrite a later English query", async ({ page }) => {
  const held = deferred(), seen = deferred();
  const aliases = new Set(["高兴", "快乐", "愉快"].map(bucket));
  expect(aliases.has(bucket("开心"))).toBe(false);
  await page.route(/\/expanded-dictionary\/[a-f0-9]{64}\/zh-(\d{3})\.json$/u, async route => {
    const match = route.request().url().match(/zh-(\d{3})\.json$/u);
    if (!aliases.has(Number(match[1]))) return route.continue();
    seen.resolve(); await held.promise;
    await route.continue().catch(() => {});
  });
  await page.goto("/dictionary.html");
  await page.locator("#dictionary-query").fill("开心"); await page.locator("#dictionary-query").press("Enter");
  await seen.promise;
  await expect(page.locator("#dictionary-term")).toHaveText("chuffed");
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  await page.locator("#dictionary-query").fill("apple"); await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-term")).toHaveText("apple");
  held.resolve(); await page.waitForLoadState("networkidle");
  await expect(page.locator("#dictionary-term")).toHaveText("apple");
  await expect(page.locator("#dictionary-related-match")).toBeHidden();
});

test("warm local meaning associations remain available offline", async ({ page, context }) => {
  await page.goto("/dictionary.html"); await query(page, "开心");
  await context.setOffline(true);
  try {
    await query(page, "开心");
    await expect(page.locator('#dictionary-choices button[data-dictionary-term="happy"]')).toContainText("近义关联：高兴");
  } finally { await context.setOffline(false); }
});
