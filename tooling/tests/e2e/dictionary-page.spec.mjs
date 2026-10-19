import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ORIGIN = process.env.WORDBOOK_E2E_ORIGIN || "http://127.0.0.1:4187";
const publicSnapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const publicHeads = new Set(publicSnapshot.entries.map(entry => entry.term.toLowerCase()));
const englishShard = "**/data/expanded-dictionary/**/en-*.json*";
const exampleShard = "**/data/dictionary-examples/**/examples-*.json*";
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `public-dictionary-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

function observeRequests(page) {
  const calls = [];
  page.on("request", request => calls.push({ method: request.method(), url: request.url(), authType: request.headers()["x-wordbook-auth"] }));
  return calls;
}

function expectPublicOnly(calls) {
  for (const call of calls) {
    const url = new URL(call.url);
    expect(url.origin, call.url).toBe(ORIGIN);
    expect(["GET", "HEAD"], call.url).toContain(call.method);
    expect(url.pathname, call.url).not.toMatch(/^\/api\//u);
    expect(url.hash, call.url).toBe("");
    for (const name of ["q", "query", "term", "word", "lookup"]) expect(url.searchParams.has(name), call.url).toBe(false);
    expect(url.hostname, call.url).not.toMatch(/openai|anthropic|mymemory|languagetool|dictionaryapi/iu);
  }
}

async function open(page, fragment = "") {
  await page.goto(`/dictionary.html${fragment}`);
  await expect(page.locator("#dictionary-query")).toBeVisible();
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
}

async function query(page, value) {
  await page.locator("#dictionary-query").fill(value);
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-result")).toBeVisible();
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
}

test("examples: actual reviewed sidecar shows its own senses and bilingual text after the primary meaning at 390px", async ({ page }) => {
  const manifest = JSON.parse(await readFile(new URL("../../../vocab/data/dictionary-examples/manifest.json", import.meta.url), "utf8"));
  expect(Object.hasOwn(manifest.keys, "override")).toBe(true);
  const payload = JSON.parse(await readFile(new URL(`../../../vocab/data/dictionary-examples/${manifest.shards[manifest.keys.override].file}`, import.meta.url), "utf8"));
  const actual = payload.entries.find(item => item.term === "override");
  const calls = observeRequests(page);
  await page.setViewportSize({ width: 390, height: 844 }); await open(page); await query(page, "override");
  await expect(page.locator("#dictionary-example-content .example-sense")).toHaveCount(actual.senses.length);
  await expect(page.locator("#dictionary-example-panel")).toContainText("原创例句·AI复核（精选义项）");
  await expect(page.locator("#dictionary-example-content summary").first()).toContainText(actual.senses[0].meaningZh);
  await expect(page.locator('#dictionary-example-content p[lang="en"]').first()).toHaveText(actual.senses[0].examples[0].en);
  await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]').first()).toHaveText(actual.senses[0].examples[0].zh);
  await expect(page.locator("#dictionary-add")).toHaveAttribute("href", /#lookup=override$/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expectPublicOnly(calls);
});

test("examples: a slow optional shard cannot hold the meaning, CTA or next input disabled", async ({ page }) => {
  const gate = deferred(), seen = deferred();
  await page.route(exampleShard, async route => { seen.resolve(); await gate.promise; await route.continue(); });
  try {
    await open(page); await query(page, "override"); await seen.promise;
    await expect(page.locator("#dictionary-meaning")).not.toBeEmpty();
    await expect(page.locator("#dictionary-submit")).toBeEnabled(); await expect(page.locator("#dictionary-query")).toBeEditable();
    await expect(page.locator("#dictionary-add")).toHaveAttribute("href", /#lookup=override$/u);
    await expect(page.locator("#dictionary-example-status")).toContainText("正在读取");
    gate.resolve(); await expect(page.locator("#dictionary-example-content .example-sense")).not.toHaveCount(0);
  } finally { gate.resolve(); }
});

test("examples: missing optional material stays hidden without claiming a failed or missing dictionary word", async ({ page }) => {
  const manifest = JSON.parse(await readFile(new URL("../../../vocab/data/dictionary-examples/manifest.json", import.meta.url), "utf8"));
  expect(Object.hasOwn(manifest.keys, "abacus")).toBe(false);
  const calls = observeRequests(page); await open(page); await query(page, "abacus");
  await expect(page.locator("#dictionary-term")).toHaveText("abacus");
  await expect(page.locator("#dictionary-meaning")).toContainText("算盘");
  await expect(page.locator("#dictionary-example-panel")).toBeHidden();
  await expect(page.locator("#dictionary-status")).toContainText("已找到");
  expect(calls.some(call => /\/dictionary-examples\/[^/]+\/examples-/u.test(new URL(call.url).pathname))).toBe(false);
  expectPublicOnly(calls);
});

test("examples: failure and local retry never clear the meaning or rerun the main dictionary request", async ({ page }) => {
  let failed = false;
  await page.route(exampleShard, async route => {
    if (!failed) { failed = true; await route.fulfill({ status: 503, body: "temporarily unavailable" }); }
    else await route.continue();
  });
  const calls = observeRequests(page); await open(page); await query(page, "override");
  await expect(page.locator("#dictionary-example-retry")).toBeVisible();
  await expect(page.locator("#dictionary-example-status")).toContainText("词义查询不受影响");
  await expect(page.locator("#dictionary-term")).toHaveText("override");
  const initialMeaning = await page.locator("#dictionary-meaning").textContent();
  const mainRequests = calls.filter(call => call.url.includes("/expanded-dictionary/")).length;
  await page.locator("#dictionary-example-retry").click();
  await expect(page.locator("#dictionary-example-content .example-sense")).not.toHaveCount(0);
  await expect(page.locator("#dictionary-meaning")).toHaveText(initialMeaning);
  expect(calls.filter(call => call.url.includes("/expanded-dictionary/")).length).toBe(mainRequests);
  expectPublicOnly(calls);
});

test("examples: a late previous result cannot repopulate material after the input changes to another headword", async ({ page }) => {
  const gate = deferred(), seen = deferred();
  await page.route(exampleShard, async route => { seen.resolve(); await gate.promise; await route.continue(); });
  try {
    await open(page); await query(page, "override"); await seen.promise;
    await page.locator("#dictionary-query").fill("abacus");
    await expect(page.locator("#dictionary-example-panel")).toBeHidden();
    await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-term")).toHaveText("abacus");
    gate.resolve(); await page.waitForLoadState("networkidle");
    await expect(page.locator("#dictionary-example-panel")).toBeHidden();
    await expect(page.locator("#dictionary-example-content")).toBeEmpty();
    await expect(page.locator("#dictionary-meaning")).toContainText("算盘");
  } finally { gate.resolve(); }
});

function bucket(value) {
  let hash = 2166136261;
  for (const character of value.toLowerCase()) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % 128;
}

test("an unsigned visitor can press Enter for real expanded words absent from the 616-card learning library", async ({ page }) => {
  expect(publicHeads.has("abacus")).toBe(false);
  const calls = observeRequests(page); await open(page);
  for (const [word, meaning] of [["abacus", /算盘/u], ["outgrowth", /生长|产物|结果|发展/u], ["override", /推翻|否决|不顾|优先|取代|凌驾|覆盖/u]]) {
    await query(page, word);
    await expect(page.locator("#dictionary-term")).toHaveText(word);
    await expect(page.locator("#dictionary-meaning")).toContainText(meaning);
    await expect(page.locator("#dictionary-source")).toContainText(/ECDICT/u);
  }
  await expect(page.locator("#dictionary-count")).toContainText(/82[,.，]?920/u);
  expectPublicOnly(calls);
});

test("Chinese meanings return actual English choices without login or a private lookup API", async ({ page }) => {
  const calls = observeRequests(page); await open(page);
  await query(page, "苹果");
  const apple = page.locator('#dictionary-choices button[data-dictionary-term="apple"]');
  await expect(apple).toBeVisible(); await apple.click();
  await expect(page.locator("#dictionary-term")).toHaveText("apple");
  await expect(page.locator("#dictionary-meaning")).toContainText("苹果");
  await query(page, "洞察力");
  await expect(page.locator("#dictionary-meaning")).toContainText("洞察力");
  await expect(page.locator("#dictionary-term")).toContainText(/[A-Za-z]/u);
  expectPublicOnly(calls);
});

test("invalid input is rejected locally and an honest missing result does not leave an old card visible", async ({ page }) => {
  const calls = observeRequests(page); await open(page); await query(page, "abacus");
  const before = calls.filter(call => call.url.includes("/data/expanded-dictionary/")).length;
  await page.locator("#dictionary-query").fill("<script>alert(1)</script>");
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-status")).toContainText(/输入|不支持|无效/u);
  await expect(page.locator("#dictionary-result")).toBeHidden();
  expect(calls.filter(call => call.url.includes("/data/expanded-dictionary/")).length).toBe(before);
  await page.locator("#dictionary-query").fill("zzzznotawordxxyy");
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-status")).toContainText(/未收录|未找到|没有|尚未/u);
  await expect(page.locator("#dictionary-result")).toBeHidden();
  await expect(page.locator("#dictionary-choices")).toBeHidden();
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  expectPublicOnly(calls);
});

test("a failed public index request is retryable and never shown as a successful empty search", async ({ page }) => {
  let fail = true; const calls = observeRequests(page);
  await page.route("**/data/expanded-dictionary/manifest.json*", route => fail
    ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : route.continue());
  await open(page);
  await page.locator("#dictionary-query").fill("abacus"); await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-status")).toContainText(/失败|暂时|503/u);
  await expect(page.locator("#dictionary-result")).toBeHidden();
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  fail = false; await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-term")).toHaveText("abacus");
  await expect(page.locator("#dictionary-meaning")).toContainText("算盘");
  await expect(page.locator("#dictionary-count")).toContainText(/82[,.，]?920/u);
  expectPublicOnly(calls);
});

test("changing the input while a shard is delayed cannot resurrect a stale word card", async ({ page }) => {
  expect(bucket("abacus")).not.toBe(bucket("outgrowth"));
  let release, reached, gated = false;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { reached = resolve; });
  const suffix = `/en-${String(bucket("abacus")).padStart(3, "0")}.json`;
  await page.route(englishShard, async route => {
    if (gated || !new URL(route.request().url()).pathname.endsWith(suffix)) return route.continue();
    gated = true; const response = await route.fetch(); reached(); await gate;
    try { await route.fulfill({ response }); } catch { /* Changing input can deliberately cancel the old UI operation. */ }
  });
  const calls = observeRequests(page);
  try {
    await open(page); await page.locator("#dictionary-query").fill("abacus"); await page.locator("#dictionary-query").press("Enter");
    await seen; await page.locator("#dictionary-query").fill("outgrowth"); await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-term")).toHaveText("outgrowth");
    release();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#dictionary-query")).toHaveValue("outgrowth");
    await expect(page.locator("#dictionary-term")).toHaveText("outgrowth");
    await expect(page.locator("#dictionary-result")).toBeVisible();
    expectPublicOnly(calls);
  } finally { release(); }
});

test("source variants stay explicitly labelled and do not replace the selected canonical headword", async ({ page }) => {
  const calls = observeRequests(page); await open(page); await query(page, "override");
  await expect(page.locator("#dictionary-source")).toContainText("ECDICT");
  await expect(page.locator("#dictionary-variant-panel")).toBeVisible();
  await page.locator("#dictionary-variant-summary").click();
  await expect(page.locator("#dictionary-variants")).toBeVisible();
  await expect(page.locator("#dictionary-variants")).toContainText(/原创|AI复核/u);
  await expect(page.locator("#dictionary-term")).toHaveText("override");
  await expect(page.locator("#dictionary-add")).toHaveAttribute("href", /#lookup=override$/u);
  expectPublicOnly(calls);
});

test("a 390px phone layout has visible keyboard focus and no horizontal overflow after a long result", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = observeRequests(page); await open(page);
  await page.locator("#dictionary-query").focus(); await expect(page.locator("#dictionary-query")).toBeFocused();
  await query(page, "override");
  await page.locator("#dictionary-variant-summary").click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await page.locator("#dictionary-add").scrollIntoViewIfNeeded();
  const box = await page.locator("#dictionary-add").boundingBox();
  expect(box).not.toBeNull(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(392);
  await page.locator("#dictionary-query").focus();
  const focus = await page.locator("#dictionary-query").evaluate(element => {
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return { active: document.activeElement === element, outline: style.outlineStyle, shadow: style.boxShadow, left: rect.left, right: rect.right };
  });
  expect(focus.active).toBe(true); expect(focus.outline !== "none" || focus.shadow !== "none").toBe(true);
  expect(focus.left).toBeGreaterThanOrEqual(0); expect(focus.right).toBeLessThanOrEqual(392);
  await page.screenshot({ path: info.outputPath("dictionary-mobile-390px.png"), fullPage: true });
  expectPublicOnly(calls);
});

test("fragment prefill automatically searches without leaking the query through any network URL", async ({ page }) => {
  const calls = observeRequests(page); await open(page, `#q=${encodeURIComponent("outgrowth")}`);
  await expect(page.locator("#dictionary-query")).toHaveValue("outgrowth");
  await expect(page.locator("#dictionary-term")).toHaveText("outgrowth");
  await expect(page.locator("#dictionary-result")).toBeVisible();
  expect(calls.filter(call => /outgrowth|%E6%B4%9E/iu.test(call.url))).toEqual([]);
  expectPublicOnly(calls);
});

test("adding a public result only opens the unsigned personal login flow, never saving or invoking AI", async ({ page }) => {
  const calls = observeRequests(page); await open(page); await query(page, "abacus");
  expectPublicOnly(calls);
  const beforeNavigation = calls.length;
  await page.locator("#dictionary-add").click();
  await expect(page).toHaveURL(/\/personal\.html(?:\?[^#]*)?#lookup=abacus$/u);
  await expect(page.locator("#member-auth")).toBeVisible();
  await expect(page.locator("#member-workspace")).toBeHidden();
  for (const call of calls.slice(beforeNavigation)) {
    const url = new URL(call.url);
    expect(url.origin).toBe(ORIGIN); expect(["GET", "HEAD"]).toContain(call.method);
    expect(url.hash).toBe("");
    expect(url.pathname).not.toMatch(/organize|translate|\/ai(?:\/|$)|\/selections(?:\/|$)|\/entries(?:\/|$)/u);
  }
});

test("an empty 616-card home search links to the real public dictionary rather than pretending the new word is absent everywhere", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#entry-count")).toHaveText(String(publicSnapshot.entries.length));
  await page.getByLabel("搜索已收录词卡").fill("abacus");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(0);
  await expect(page.locator("#search-empty")).toBeVisible();
  await expect(page.locator("#search-dictionary-link")).toHaveAttribute("href", /dictionary\.html#q=abacus$/u);
  const calls = observeRequests(page);
  await page.locator("#search-dictionary-link").click();
  await expect(page).toHaveURL(/\/dictionary\.html#q=abacus$/u);
  await expect(page.locator("#dictionary-term")).toHaveText("abacus");
  await expect(page.locator("#dictionary-meaning")).toContainText("算盘");
  expectPublicOnly(calls);
});

const FIXTURE_PASSWORD = "public dictionary bridge fixture password 80";
const MEMBER_API = "/api/v1/member/";
async function memberReady(page, username) {
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-username")).toHaveText(`@${username}`);
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
}
function expectNoLookupOrEntryWrite(calls, allowedAuthWrites = []) {
  for (const call of calls) {
    const url = new URL(call.url);
    expect(url.origin).toBe(ORIGIN); expect(url.hash).toBe("");
    expect(url.pathname).not.toMatch(/organize|translate|\/ai(?:\/|$)|\/selections(?:\/|$)/u);
    expect(url.pathname).not.toContain("/data/expanded-dictionary/");
    expect(url.searchParams.has("q")).toBe(false); expect(url.searchParams.has("lookup")).toBe(false);
    if (!["GET", "HEAD"].includes(call.method)) expect(allowedAuthWrites).toContain(url.pathname);
    expect(call.url).not.toContain("abacus");
  }
}

test("an existing ordinary session receives the fragment once as query prefill, without looking up or saving it", async ({ context, page }) => {
  const registered = await context.request.post(`${ORIGIN}${MEMBER_API}register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" }, data: { username: "bridge_existing", password: FIXTURE_PASSWORD }
  });
  expect(registered.status()).toBe(200);
  const calls = observeRequests(page);
  await page.goto("/personal.html#lookup=abacus"); await memberReady(page, "bridge_existing");
  await expect(page.locator("#member-auth-type")).toHaveText("普通账号");
  await expect(page.locator("#member-dictionary-term")).toHaveValue("abacus");
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator("#member-meaning")).toHaveValue("");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(calls.find(call => new URL(call.url).pathname === `${MEMBER_API}session`)?.authType).toBe("auto");
  expectNoLookupOrEntryWrite(calls);
});

test("the existing GitHub owner identity is preserved by a lookup fragment without forced member registration", async ({ context, page }) => {
  await context.addCookies([{ name: "e2e_auth", value: "owner", url: ORIGIN }]);
  const calls = observeRequests(page);
  await page.goto("/personal.html#lookup=abacus"); await memberReady(page, "zhuodashuai");
  await expect(page.locator("#member-auth-type")).toHaveText("GitHub 身份");
  await expect(page.locator("#member-delete-account")).toBeHidden();
  await expect(page.locator("#member-dictionary-term")).toHaveValue("abacus");
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(new URL(page.url()).searchParams.has("auth")).toBe(false);
  expect(calls.find(call => new URL(call.url).pathname === `${MEMBER_API}session`)?.authType).toBe("auto");
  expectNoLookupOrEntryWrite(calls);
});

test("registration recovery defers prefill until ready and logout/login never replays the original fragment", async ({ page }) => {
  const calls = observeRequests(page);
  await page.goto("/personal.html#lookup=abacus");
  await expect(page.locator("#member-auth")).toBeVisible();
  await page.locator('[data-auth-view="register"]').click();
  await page.locator("#register-username").fill("bridge_recovery");
  await page.locator("#register-password").fill(FIXTURE_PASSWORD);
  await page.locator('#member-register-form button[type="submit"]').click();
  await expect(page.locator("#member-recovery")).toBeVisible();
  await expect(page.locator("#member-workspace")).toBeHidden();
  await expect(page.locator("#member-dictionary-term")).toHaveValue("");
  await page.locator("#member-recovery-ack").check(); await page.locator("#member-recovery-continue").click();
  await memberReady(page, "bridge_recovery");
  await expect(page.locator("#member-dictionary-term")).toHaveValue("abacus");
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  await page.locator("#member-dictionary-term").fill("my next expression");
  await page.locator("#member-logout").click();
  await expect(page.locator("#member-auth")).toBeVisible();
  await page.locator("#login-username").fill("bridge_recovery");
  await page.locator("#login-password").fill(FIXTURE_PASSWORD);
  await page.locator('#member-login-form button[type="submit"]').click();
  await memberReady(page, "bridge_recovery");
  await expect(page.locator("#member-dictionary-term")).toHaveValue("");
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expectNoLookupOrEntryWrite(calls, [`${MEMBER_API}register`, `${MEMBER_API}logout`, `${MEMBER_API}login`]);
});

test("switching login modes retains lookup while GitHub login opens separately and reconfirms the original owner page", async ({ context, page }) => {
  const calls = observeRequests(page);
  await page.goto("/personal.html#lookup=abacus");
  await expect(page.locator("#member-auth")).toBeVisible();
  await expect(page.locator("#member-github-owner-link")).toHaveAttribute("href", /personal\.html\?auth=owner#lookup=abacus$/u);
  await page.locator("#member-github-owner-link").click();
  await expect(page.locator("#member-owner-gate")).toBeVisible();
  await expect(page.locator("#member-standard-login-link")).toHaveAttribute("href", /personal\.html\?auth=member#lookup=abacus$/u);
  await page.locator("#member-standard-login-link").click();
  await expect(page.locator("#member-auth")).toBeVisible();
  await page.locator("#member-github-owner-link").click();
  await expect(page.locator("#member-owner-gate")).toBeVisible();
  await expect(page.locator("#member-owner-login-link")).toHaveAttribute("target", "_blank");
  await expect(page.locator("#member-owner-login-link")).toHaveAttribute("rel", /noopener/u);
  const originalUrl = page.url();
  const [popup] = await Promise.all([context.waitForEvent("page"), page.locator("#member-owner-login-link").click()]);
  try {
    await expect(popup.locator("#login-link")).toBeVisible();
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    expect(new URL(popup.url()).hash).toBe("");
    expect(page.url()).toBe(originalUrl);
    // The local E2E server simulates OAuth only; no production identity or
    // password is used, and no real GitHub site is opened by this fixture.
    await popup.locator("#login-link").click();
    await expect(popup.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
    expect(page.url()).toBe(originalUrl);
    await page.locator("#member-owner-refresh").click();
    await memberReady(page, "zhuodashuai");
    await expect(page.locator("#member-auth-type")).toHaveText("GitHub 身份");
    await expect(page.locator("#member-dictionary-term")).toHaveValue("abacus");
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await expect(page.locator("#member-term")).toHaveValue("");
    await expect(page.locator(".personal-entry")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expectNoLookupOrEntryWrite(calls);
  } finally { await popup.close(); }
});
