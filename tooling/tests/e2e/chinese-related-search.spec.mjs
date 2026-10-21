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
  await page.locator("#dictionary-choice-disclosure > summary").click();
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

test("mobile colloquial doctor query uses related meanings without rewriting source definitions or making writes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = [], foreign = [];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (new URL(request.url()).origin !== "http://127.0.0.1:4187") foreign.push(request.url());
  });
  await page.goto("/dictionary.html"); await query(page, "大夫");
  await page.locator("#dictionary-choice-disclosure > summary").click();
  const choices = page.locator("#dictionary-choices button[data-dictionary-term]");
  const terms = await choices.evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
  expect(terms).toContain("doctor"); expect(terms).toContain("physician");
  expect(new Set(terms).size).toBe(terms.length);
  for (const term of ["nurse", "medical", "Dr.", "Ph.D.", "examination", "appointment", "healer"]) expect(terms).not.toContain(term);
  // 大夫 has no standalone dictionary definition: every returned card must
  // disclose that its original 医生/医师 meaning supplied the association.
  await expect(choices.locator(".related-badge")).toHaveCount(terms.length);
  const doctor = page.locator('#dictionary-choices button[data-dictionary-term="doctor"]');
  await expect(doctor).toContainText("近义关联：医生"); await doctor.click();
  await expect(page.locator("#dictionary-term")).toHaveText("doctor");
  await expect(page.locator("#dictionary-pos")).toHaveText("noun · verb");
  await expect(page.locator("#dictionary-meaning")).toContainText("医生");
  await expect(page.locator("#dictionary-meaning")).toContainText("博士");
  await expect(page.locator("#dictionary-source")).toContainText("ECDICT");
  await expect(page.locator("#dictionary-source")).toContainText("MIT");
  await expect(page.locator("#dictionary-related-match")).toContainText("近义关联：医生");
  await expect(page.locator("#dictionary-query")).toHaveValue("大夫");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(writes).toEqual([]); expect(foreign).toEqual([]);
});

test("doctor and teacher searches distinguish professions from related topics and occupational adjectives", async ({ page }) => {
  await page.goto("/dictionary.html"); await query(page, "医生");
  let terms = await page.locator("#dictionary-choices button[data-dictionary-term]").evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
  expect(terms[0]).toBe("doctor"); expect(terms).toContain("physician");
  for (const term of ["nurse", "medical", "Dr.", "Ph.D.", "examination", "appointment", "healer"]) expect(terms).not.toContain(term);
  await expect(page.locator("#dictionary-term")).toHaveText("doctor");
  await expect(page.locator("#dictionary-related-match")).toBeHidden();
  await query(page, "教师");
  terms = await page.locator("#dictionary-choices button[data-dictionary-term]").evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
  expect(terms).toContain("teacher"); expect(terms).not.toContain("pedagogical");
  await page.locator('#dictionary-choices button[data-dictionary-term="teacher"]').click();
  await expect(page.locator("#dictionary-pos")).toHaveText("noun");
  await expect(page.locator("#dictionary-meaning")).toContainText("教师");
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

test("short trade queries find common verbs without downloading compound-posting lists", async ({ page }) => {
  const postings = [];
  page.on("request", request => { if (/\/expanded-dictionary\/.+\/zh-\d{3}\.json$/u.test(request.url())) postings.push(request.url()); });
  await page.goto("/dictionary.html");
  for (const [value, term] of [["购置", "buy"], ["出售", "sell"], ["卖", "sell"]]) {
    await query(page, value);
    const result = page.locator(`#dictionary-choices button[data-dictionary-term="${term}"]`);
    await expect(result).toBeVisible(); await result.click();
    await expect(page.locator("#dictionary-term")).toHaveText(term);
    await expect(page.locator("#dictionary-source")).toContainText("ECDICT");
  }
  expect(postings).toEqual([]);
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
