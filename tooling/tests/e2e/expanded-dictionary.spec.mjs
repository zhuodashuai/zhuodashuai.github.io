import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ORIGIN = "http://127.0.0.1:4187";
const PASSWORD = "synthetic bilingual dictionary password 79";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `expanded-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
  const registration = await context.request.post(`${ORIGIN}/api/v1/member/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" }, data: { username: "bilingual_reader", password: PASSWORD }
  });
  expect(registration.status()).toBe(200);
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
});
async function query(page, term) {
  await page.locator("#member-dictionary-term").fill(term);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-result")).toBeVisible();
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
}

test("Chinese lookup selects an English card, saves POS/meaning, and does not duplicate it on English lookup", async ({ page, context }) => {
  const calls = []; page.on("request", request => calls.push(request.url()));
  await query(page, "苹果");
  const apple = page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: /^apple$/u }) });
  await expect(apple).toBeVisible(); await apple.click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("apple");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("苹果");
  await expect(page.locator("#member-dictionary-status")).toContainText(/ECDICT|基础/u);
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-term")).toHaveValue("apple");
  await page.locator("#member-note").fill("我的中文反查备注，重复查询不能覆盖。");
  await page.locator("#member-save").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  await query(page, "apple"); await page.locator("#member-dictionary-use").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  await expect(page.locator("#member-detail-note")).toHaveText("我的中文反查备注，重复查询不能覆盖。");
  const saved = await context.request.get(`${ORIGIN}/api/v1/member/entries`, { headers: { "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech" } });
  const payload = await saved.json(); expect(payload.entries).toHaveLength(1);
  expect(payload.entries[0].partOfSpeech).toContain("noun");
  expect(calls.filter(url => new URL(url).origin !== ORIGIN)).toEqual([]);
  expect(calls.some(url => /organize|translate|dictionaryapi|mymemory/u.test(url))).toBe(false);
});

test("a word outside the old 8k index uses a small shard, preserves the draft, and is cached for repeat lookup", async ({ page }) => {
  await page.locator("#member-term").fill("my unsaved expression");
  await page.locator("#member-note").fill("Keep this draft.");
  const files = []; page.on("request", request => { if (request.url().includes("/expanded-dictionary/")) files.push(request.url()); });
  await query(page, "abacus");
  await expect(page.locator("#member-dictionary-word")).toHaveText("abacus");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("算盘");
  await expect(page.locator("#member-dictionary-pos")).toContainText("noun");
  await expect(page.locator("#member-term")).toHaveValue("my unsaved expression");
  await expect(page.locator("#member-note")).toHaveValue("Keep this draft.");
  expect(files.filter(url => /\/en-\d+\.json/u.test(url)).length).toBeLessThanOrEqual(2);
  expect(files.some(url => /\/zh-\d+\.json/u.test(url))).toBe(false);
  const before = files.length; await query(page, "abacus"); expect(files.length).toBe(before);
  await expect(page.locator(".personal-entry")).toHaveCount(0);
});

test("Chinese results remain usable from memory offline and fit a 390px screen", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await query(page, "苹果");
  const choices = await page.locator(".dictionary-choice strong").allTextContents(); expect(choices).toContain("apple");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  try {
    await context.setOffline(true); await query(page, "苹果");
    expect(await page.locator(".dictionary-choice strong").allTextContents()).toEqual(choices);
    await expect(page.locator("#member-dictionary-use")).toBeEnabled();
  } finally { await context.setOffline(false); }
});

test("new exact entries resolve old hot-index ambiguities, and a healthy expanded index survives a compact outage", async ({ page }) => {
  for (const term of ["lives", "leaves"]) {
    await query(page, term); await expect(page.locator("#member-dictionary-word")).toHaveText(term);
  }
  await page.route("**/data/member-dictionary.json*", route => route.abort("failed"));
  await page.reload(); await expect(page.locator("#member-workspace")).toBeVisible();
  await query(page, "hip");
  await expect(page.locator("#member-dictionary-word")).toHaveText("hip");
  await expect(page.locator("#member-dictionary-pos")).toContainText("noun");
  await expect(page.locator("#member-dictionary-pos")).toContainText("adjective");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("髋部");
});

test("a familiar phrase now has its labelled original meaning, and an independent form has a selectable exact entry", async ({ page }) => {
  await query(page, "by some fluke");
  await expect(page.locator("#member-dictionary-word")).toHaveText("by some fluke");
  await expect(page.locator("#member-dictionary-meaning")).toContainText("碰巧");
  await expect(page.locator("#member-dictionary-status")).toContainText("AI复核");
  await query(page, "lettering");
  const literal = page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: /^lettering$/u }) });
  await expect(literal).toBeVisible(); await literal.click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("lettering");
  await expect(page.locator("#member-dictionary-pos")).toContainText("noun");
});

test("an unavailable Chinese manifest is an honest retryable error, not an empty successful result", async ({ page }) => {
  let fail = true;
  await page.route("**/data/expanded-dictionary/manifest.json*", route => fail
    ? route.fulfill({ status: 503, contentType: "application/json", body: '{}' }) : route.continue());
  await query(page, "苹果");
  await expect(page.locator("#member-dictionary-status")).toContainText("非完整搜索");
  await page.locator("#member-dictionary-full").click();
  await expect(page.locator("#member-dictionary-status")).toContainText(/失败|暂时|503/u);
  await expect(page.locator("#member-dictionary-result")).toBeHidden();
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
  fail = false; await query(page, "苹果");
  // A healthy current query already returns the complete ranked first page.
  await expect(page.locator("#member-dictionary-full")).toBeHidden();
  await expect(page.locator("#member-dictionary-status")).not.toContainText("非完整搜索");
  await expect(page.locator("#member-dictionary-result")).toBeVisible();
  await expect(page.locator("#member-dictionary-search")).toBeEnabled();
  await expect(page.locator(".dictionary-choice")).toHaveCount(20);
});

test("logout discards a delayed expanded lookup without resurrecting old results", async ({ page }) => {
  let release, seen, finished;
  const held = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { seen = resolve; });
  const settled = new Promise(resolve => { finished = resolve; });
  await page.route("**/data/expanded-dictionary/**/zh-*.json*", async route => {
    const response = await route.fetch(); seen(); await held;
    try { await route.fulfill({ response }); } catch { /* Logout intentionally aborts lookup. */ }
    finally { finished(); }
  });
  try {
    // Complete Chinese search starts on Enter; hold that first request rather
    // than waiting for a compact preview before a now-unnecessary second click.
    await page.locator("#member-dictionary-term").fill("苹果");
    await page.locator("#member-dictionary-term").press("Enter");
    await reached;
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await page.locator("#member-logout").click(); await expect(page.locator("#member-workspace")).toBeHidden();
    release(); await settled;
    await expect(page.locator("#member-dictionary-result")).toBeHidden();
    await expect(page.locator("#member-dictionary-choices")).toBeHidden();
    await expect(page.locator("#member-dictionary-term")).toHaveValue("");
  } finally { release(); }
});

test("100 real UI queries cover 80 newly searchable English entries and 20 Chinese queries without bulk-adding cards", async ({ page }) => {
  test.slow();
  const base = new URL("../../../vocab/data/expanded-dictionary/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8"));
  const old = JSON.parse(await readFile(new URL("../../../vocab/data/member-dictionary.json", import.meta.url), "utf8"));
  const oldHeads = new Set([...old.core, ...old.published].map(row => row[0].toLowerCase()));
  const candidates = [];
  for (const descriptor of manifest.english.shards) {
    const shard = JSON.parse(await readFile(new URL(descriptor.file, base), "utf8"));
    candidates.push(...shard.records.filter(row => row.id % 128 === descriptor.bucket && /^[a-z]{4,16}$/u.test(row.term) && !oldHeads.has(row.term)));
  }
  candidates.sort((a, b) => a.term < b.term ? -1 : 1);
  expect(candidates.length).toBeGreaterThan(10_000);
  const english = Array.from({ length: 80 }, (_, index) => candidates[Math.floor(index * candidates.length / 80)].term);
  const chinese = ["苹果", "算盘", "显微镜", "小提琴", "天文学", "建筑师", "蝴蝶", "忧郁", "慷慨", "耐心", "哲学", "氧气", "光合作用", "计算机", "女演员", "律师", "信用", "保险", "概率", "胰腺"];
  const calls = []; page.on("request", request => calls.push(request.url()));
  for (const term of english) {
    await query(page, term);
    const literalChoice = page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: new RegExp(`^${term}$`, "u") }) });
    if (await literalChoice.count()) await literalChoice.click();
    await expect(page.locator("#member-dictionary-word")).toHaveText(term);
    await expect(page.locator("#member-dictionary-meaning")).toContainText(/\p{Script=Han}/u);
  }
  for (const term of chinese) {
    await query(page, term);
    await expect(page.locator("#member-dictionary-meaning")).toContainText(term);
  }
  expect(new Set(english).size + chinese.length).toBe(100);
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  expect(calls.filter(url => new URL(url).origin !== ORIGIN || new URL(url).pathname.startsWith("/api/"))).toEqual([]);
});
