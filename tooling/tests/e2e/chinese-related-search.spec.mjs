import { test, expect } from "@playwright/test";

async function query(page, value) {
  await page.locator("#dictionary-query").fill(value);
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-result")).toBeVisible();
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

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
  await expect(happy).toContainText(/近义关联：(高兴|快乐|愉快)/u); await expect(glad).toBeVisible();
  await expect(page.locator('#dictionary-choices button[data-dictionary-term="pistachio nut"]')).toHaveCount(0);
  await happy.click();
  await expect(page.locator("#dictionary-term")).toHaveText("happy");
  await expect(page.locator("#dictionary-pos")).toHaveText("adjective");
  await expect(page.locator("#dictionary-meaning")).toContainText("快乐");
  await expect(page.locator("#dictionary-related-match")).toContainText(/近义关联：(高兴|快乐|愉快)/u);
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

test("doctor and teacher searches rank their professions first while preserving each source POS", async ({ page }) => {
  await page.goto("/dictionary.html"); await query(page, "医生");
  let terms = await page.locator("#dictionary-choices button[data-dictionary-term]").evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
  expect(terms[0]).toBe("doctor"); expect(terms).toContain("physician");
  await expect(page.locator("#dictionary-term")).toHaveText("doctor");
  await expect(page.locator("#dictionary-related-match")).toBeHidden();
  await query(page, "教师");
  terms = await page.locator("#dictionary-choices button[data-dictionary-term]").evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
  expect(terms[0]).toBe("teacher");
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

test("short trade queries find common verbs in the complete stream without legacy posting downloads", async ({ page }) => {
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

test("a delayed complete Chinese download cannot overwrite a later English query", async ({ page }) => {
  const held = deferred(), seen = deferred();
  await page.route(/\/chinese-search-ranking\/[^?]+[.]bin$/u, async route => {
    seen.resolve(); await held.promise;
    await route.continue().catch(() => {});
  });
  try{
    await page.goto("/dictionary.html");
    await page.locator("#dictionary-query").fill("开心"); await page.locator("#dictionary-query").press("Enter");
    await seen.promise;
    await expect(page.locator("#dictionary-result")).toBeHidden();
    await page.locator("#dictionary-query").fill("apple"); await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-term")).toHaveText("apple");
    held.resolve(); await page.waitForLoadState("networkidle");
    await expect(page.locator("#dictionary-term")).toHaveText("apple");
    await expect(page.locator("#dictionary-related-match")).toBeHidden();
  }finally{held.resolve();}
});

test("warm local meaning associations remain available offline", async ({ page, context }) => {
  await page.goto("/dictionary.html"); await query(page, "开心");
  await context.setOffline(true);
  try {
    await query(page, "开心");
    await expect(page.locator('#dictionary-choices button[data-dictionary-term="happy"]')).toContainText(/近义关联：(高兴|快乐|愉快)/u);
  } finally { await context.setOffline(false); }
});
