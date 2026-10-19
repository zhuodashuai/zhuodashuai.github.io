import { test, expect } from "@playwright/test";

const ORIGIN = process.env.WORDBOOK_E2E_ORIGIN || "http://127.0.0.1:4187";
const suggestionFiles = "**/data/dictionary-suggestions/**";
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  page.on("pageerror", error => { throw new Error(error.message); });
});

function observe(page) {
  const calls = [];
  page.on("request", request => calls.push({ method: request.method(), url: request.url() }));
  return calls;
}

function expectPublicReadOnly(calls) {
  for (const call of calls) {
    const url = new URL(call.url);
    expect(url.origin).toBe(ORIGIN); expect(["GET", "HEAD"]).toContain(call.method);
    expect(url.pathname).not.toMatch(/^\/api\//u); expect(url.hash).toBe("");
    for (const name of ["q", "query", "word", "term", "lookup"]) expect(url.searchParams.has(name)).toBe(false);
  }
}

async function open(page) {
  await page.goto("/dictionary.html");
  await expect(page.locator("#dictionary-query")).toBeEditable();
}

async function miss(page, value) {
  await page.locator("#dictionary-query").fill(value);
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-status")).toHaveAttribute("data-phase", "empty");
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  await expect(page.locator("#dictionary-result")).toBeHidden();
}

test("heppy offers happy first but changes neither the query nor the card until the user clicks at 390px", async ({ page }, info) => {
  const calls = observe(page);
  await page.setViewportSize({ width: 390, height: 844 }); await open(page); await miss(page, "heppy");
  const buttons = page.locator("#dictionary-suggestions button");
  await expect(buttons.first()).toHaveText("happy");
  await expect(page.locator("#dictionary-suggestion-panel")).toContainText("仅提供拼写建议，点选后查词。");
  await expect(page.locator("#dictionary-query")).toHaveValue("heppy");
  await expect(page).toHaveURL(/#q=heppy$/u);
  expect(await buttons.count()).toBeLessThanOrEqual(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("spelling-suggestions-heppy-mobile.png"), fullPage: true });
  await buttons.first().click();
  await expect(page.locator("#dictionary-term")).toHaveText("happy");
  await expect(page.locator("#dictionary-meaning")).toContainText(/快乐|幸福|高兴/u);
  await expect(page.locator("#dictionary-query")).toHaveValue("happy"); await expect(page).toHaveURL(/#q=happy$/u);
  await expect(page.locator("#dictionary-suggestion-panel")).toBeHidden();
  expectPublicReadOnly(calls);
});

test("a transposition typo recieve offers the actual receive headword and clicking performs a normal lookup", async ({ page }) => {
  const calls = observe(page); await open(page); await miss(page, "recieve");
  const choice = page.locator('#dictionary-suggestions button[data-dictionary-suggestion="receive"]');
  await expect(choice).toBeVisible(); await expect(page.locator("#dictionary-query")).toHaveValue("recieve");
  await choice.click(); await expect(page.locator("#dictionary-term")).toHaveText("receive");
  await expect(page.locator("#dictionary-meaning")).toContainText(/收到|接收|接受/u);
  expectPublicReadOnly(calls);
});

test("a phrase typo look afetr suggests the whole look after phrase without silently reducing it to look", async ({ page }) => {
  const calls = observe(page); await open(page); await miss(page, "look afetr");
  const choice = page.locator('#dictionary-suggestions button[data-dictionary-suggestion="look after"]');
  await expect(choice).toBeVisible(); await expect(page.locator("#dictionary-query")).toHaveValue("look afetr");
  await choice.click(); await expect(page.locator("#dictionary-term")).toHaveText("look after");
  await expect(page.locator("#dictionary-meaning")).toContainText(/照料|照顾|照看/u);
  expectPublicReadOnly(calls);
});

test("an unrelated nonexistent string keeps an honest miss and invents neither suggestions nor a definition", async ({ page }) => {
  const calls = observe(page); await open(page); await miss(page, "zzzznotawordxxyy");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#dictionary-suggestion-panel")).toBeHidden();
  await expect(page.locator("#dictionary-suggestions button")).toHaveCount(0);
  await expect(page.locator("#dictionary-term")).toBeEmpty();
  await expect(page.locator("#dictionary-query")).toHaveValue("zzzznotawordxxyy");
  expectPublicReadOnly(calls);
});

test("an optional suggestion download cannot hold Enter disabled or resurrect suggestions after a new exact query", async ({ page }) => {
  const gate = deferred(), seen = deferred(); let gated = false;
  await page.route(suggestionFiles, async route => {
    if (gated) return route.continue();
    gated = true; const response = await route.fetch(); seen.resolve(); await gate.promise;
    try { await route.fulfill({ response }); } catch { /* The input change deliberately cancels the optional request. */ }
  });
  const calls = observe(page);
  try {
    await open(page); await miss(page, "heppy"); await seen.promise;
    await expect(page.locator("#dictionary-suggestion-status")).toHaveText("正在查找相近拼写…");
    await expect(page.locator("#dictionary-query")).toBeEditable();
    await page.locator("#dictionary-query").fill("happy"); await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-term")).toHaveText("happy");
    gate.resolve(); await page.waitForLoadState("networkidle");
    await expect(page.locator("#dictionary-query")).toHaveValue("happy");
    await expect(page.locator("#dictionary-suggestion-panel")).toBeHidden();
    await expect(page.locator("#dictionary-suggestions button")).toHaveCount(0);
    expectPublicReadOnly(calls);
  } finally { gate.resolve(); }
});

test("editing while suggestions load immediately clears the panel and discards the late response", async ({ page }) => {
  const gate = deferred(), seen = deferred();
  await page.route(suggestionFiles, async route => {
    const response = await route.fetch(); seen.resolve(); await gate.promise;
    try { await route.fulfill({ response }); } catch { /* Editing deliberately cancels an optional download. */ }
  });
  try {
    await open(page); await miss(page, "heppy"); await seen.promise;
    await page.locator("#dictionary-query").fill("a new unfinished word");
    await expect(page.locator("#dictionary-suggestion-panel")).toBeHidden();
    gate.resolve(); await page.waitForLoadState("networkidle");
    await expect(page.locator("#dictionary-suggestions button")).toHaveCount(0);
    await expect(page.locator("#dictionary-query")).toHaveValue("a new unfinished word");
    await expect(page.locator("#dictionary-result")).toBeHidden();
  } finally { gate.resolve(); }
});

test("a failed optional spelling index is isolated and a following exact lookup still succeeds", async ({ page }) => {
  const calls = observe(page);
  await page.route(suggestionFiles, route => route.fulfill({ status: 503, body: "temporarily unavailable" }));
  await open(page); await miss(page, "heppy");
  await expect(page.locator("#dictionary-suggestion-status")).toContainText("拼写建议暂不可用");
  await expect(page.locator("#dictionary-status")).toHaveAttribute("data-phase", "empty");
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  await page.locator("#dictionary-query").fill("happy"); await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-term")).toHaveText("happy");
  await expect(page.locator("#dictionary-suggestion-panel")).toBeHidden();
  expectPublicReadOnly(calls);
});

test("exact words and phrases never download the optional spelling index", async ({ page }) => {
  const calls = observe(page); await open(page);
  for (const term of ["happy", "receive", "look after"]) {
    await page.locator("#dictionary-query").fill(term); await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-term")).toHaveText(term);
    await expect(page.locator("#dictionary-suggestion-panel")).toBeHidden();
  }
  await page.waitForLoadState("networkidle");
  expect(calls.filter(call => call.url.includes("/dictionary-suggestions/"))).toEqual([]);
  expectPublicReadOnly(calls);
});

test("a primary dictionary network failure does not masquerade as a spelling miss", async ({ page }) => {
  const calls = observe(page);
  await page.route("**/data/expanded-dictionary/manifest.json*", route => route.fulfill({ status: 503, body: "{}" }));
  await open(page); await page.locator("#dictionary-query").fill("heppy"); await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-status")).toHaveAttribute("data-phase", "error");
  await expect(page.locator("#dictionary-result")).toBeHidden();
  await expect(page.locator("#dictionary-suggestion-panel")).toBeHidden();
  await page.waitForLoadState("networkidle");
  expect(calls.filter(call => call.url.includes("/dictionary-suggestions/"))).toEqual([]);
  expectPublicReadOnly(calls);
});
