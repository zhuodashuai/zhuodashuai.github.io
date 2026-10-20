import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const batch = JSON.parse(await readFile(new URL("../../dictionary/chinese-related-003.json", import.meta.url), "utf8"));
const nextBatch = JSON.parse(await readFile(new URL("../../dictionary/chinese-related-004.json", import.meta.url), "utf8"));
const ORIGIN = "http://127.0.0.1:4187";
const API = `${ORIGIN}/api/v1/member`;
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `related-catalogue-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

async function publicQuery(page, term) {
  const group = [...batch.groups, ...nextBatch.groups].find(row => row.terms.includes(term));
  expect(group, term + " must belong to the reviewed catalogue").toBeTruthy();
  await page.locator("#dictionary-query").fill(term);
  await page.locator("#dictionary-query").press("Enter");
  // Some aliases already match every reviewed head directly. A completed
  // search then correctly has no supplementary related-results message.
  await expect.poll(async () => page.locator("#dictionary-choices button[data-dictionary-term]")
    .evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm).sort()))
    .toEqual([...group.heads].sort());
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  await expect(page.locator("#dictionary-related-status")).not.toContainText("正在补充");
}

function memberChoice(page, term) {
  return page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: new RegExp(`^${term}$`, "u") }) });
}

async function expectCatalogueRows(table, catalogue) {
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(30);
  expect(catalogue.groups).toHaveLength(30);
  for (let index = 0; index < catalogue.groups.length; index++) {
    const group = catalogue.groups[index], row = rows.nth(index);
    await expect(row).toHaveAttribute("data-related-number", String(group.number));
    await expect(row.locator("th")).toHaveText(String(group.number));
    await expect(row.locator("td").nth(0)).toHaveText(group.terms.join("／"));
    await expect(row.locator("td a")).toHaveText(group.terms[0]);
    await expect(row.locator("td a")).toHaveAttribute("href", `dictionary.html#q=${encodeURIComponent(group.terms[0])}`);
    await expect(row.locator(".related-heads")).toHaveText(group.heads.join(" / "));
    await expect(row.locator("small")).toHaveText(group.note);
  }
}

test("mobile manual keeps the numbered 30-group catalogue collapsed and exactly aligned with reviewed data", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide.html#chinese-related-catalogue");
  const catalogue = page.locator("#chinese-related-catalogue");
  await expect(catalogue.locator("summary")).toHaveText("中文近义词表（55–114）");
  await expect(catalogue).not.toHaveAttribute("open", "");
  const table = catalogue.locator('table[data-related-batch="003"]');
  await expect(table).toBeHidden();
  await catalogue.locator("summary").click();
  await expect(table.locator("caption")).toContainText("不是全量同义词");
  await expectCatalogueRows(table, batch);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("the first catalogue group opens a real dictionary query and preserves source definitions", async ({ page }) => {
  const group = batch.groups[0];
  expect(group.number).toBe(55); expect(group.terms[0]).toBe("勤奋");
  await page.goto("/guide.html#chinese-related-catalogue");
  await page.locator("#chinese-related-catalogue > summary").click();
  await page.locator('#chinese-related-catalogue table[data-related-batch="003"] tbody a').first().click();
  await expect(page.locator("#dictionary-query")).toHaveValue(group.terms[0]);
  const diligent = page.locator('#dictionary-choices button[data-dictionary-term="diligent"]');
  await expect(diligent).toBeVisible(); await diligent.click();
  await expect(page.locator("#dictionary-term")).toHaveText("diligent");
  await expect(page.locator("#dictionary-pos")).toHaveText("adjective");
  await expect(page.locator("#dictionary-source")).toContainText("ECDICT");
  await expect(page.locator("#dictionary-source")).toContainText("MIT");
  await expect(page.locator("#dictionary-meaning")).toContainText(/勤勉|勤奋/u);
});

test("new humility and loneliness associations reject misleading legacy senses", async ({ page }) => {
  await page.goto("/dictionary.html");
  for (const [term, expected, rejected, source, license] of [
    ["谦逊", "humble", "condescend", "ECDICT · 已上线核心整理", "MIT and project editorial additions"],
    // The 孤独 atom is in the existing original variant, not lonely's primary
    // 孤单/孤寂 gloss. Keep its real attribution instead of relabelling it MIT.
    ["孤独", "lonely", "autistic", "卓式原创释义（AI复核，精选义项）", "Project original content; AI-reviewed, not human-certified"]
  ]) {
    await publicQuery(page, term);
    if (term === "谦逊") await expect(page.locator("#dictionary-related-status")).toBeHidden();
    const terms = await page.locator("#dictionary-choices button[data-dictionary-term]").evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
    expect(terms).toContain(expected); expect(terms).not.toContain(rejected);
    expect(new Set(terms).size).toBe(terms.length);
    const card = page.locator(`#dictionary-choices button[data-dictionary-term="${expected}"]`);
    await card.click();
    await expect(page.locator("#dictionary-term")).toHaveText(expected);
    await expect(page.locator("#dictionary-source")).toContainText(source);
    await expect(page.locator("#dictionary-source")).toContainText(license);
  }
});

test("a new member can use a reviewed new group without automatic draft changes or saving", async ({ context, page }) => {
  const registration = await context.request.post(`${API}/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "catalogue_reader", password: "synthetic catalogue reading password 2026" }
  });
  expect(registration.status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  const writes = [], foreign = [];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (new URL(request.url()).origin !== ORIGIN) foreign.push(request.url());
  });
  await page.locator("#member-dictionary-term").fill(batch.groups[0].terms[0]);
  await page.locator("#member-dictionary-term").press("Enter");
  const diligent = memberChoice(page, "diligent");
  await expect(diligent).toBeVisible(); await diligent.click();
  await expect(page.locator("#member-dictionary-word")).toHaveText("diligent");
  await expect(page.locator("#member-dictionary-pos")).toHaveText("adjective");
  await expect(page.locator("#member-dictionary-meaning")).toContainText(/勤勉|勤奋/u);
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  const entries = await context.request.get(`${API}/entries`, { headers: { "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech" } });
  expect((await entries.json()).entries).toEqual([]);
  expect(writes).toEqual([]); expect(foreign).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
});

test("the fourth batch adds exactly 30 mobile-readable rows without expanding the manual by default", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide.html#chinese-related-catalogue");
  const catalogue = page.locator("#chinese-related-catalogue");
  await expect(catalogue.locator("summary")).toHaveText("中文近义词表（55–114）");
  await expect(catalogue).not.toHaveAttribute("open", "");
  await expect(catalogue.locator("table")).toHaveCount(2);
  const table = catalogue.locator('table[data-related-batch="004"]');
  await expect(table).toBeHidden();
  await catalogue.locator("summary").click();
  await expectCatalogueRows(table, nextBatch);
  await expect(catalogue.locator("tbody tr")).toHaveCount(60);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("the fourth batch's first manual link finds its complete reviewed group with the actual definition's attribution", async ({ page }) => {
  const group = nextBatch.groups[0];
  expect(group.number).toBe(85); expect(group.terms[0]).toBe("诚实");
  await page.goto("/guide.html#chinese-related-catalogue");
  await page.locator("#chinese-related-catalogue > summary").click();
  await page.locator('#chinese-related-catalogue table[data-related-batch="004"] tbody a').first().click();
  await expect(page.locator("#dictionary-query")).toHaveValue(group.terms[0]);
  await expect.poll(async () => page.locator("#dictionary-choices button[data-dictionary-term]")
    .evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm).sort()))
    .toEqual([...group.heads].sort());
  const honest = page.locator('#dictionary-choices button[data-dictionary-term="honest"]');
  await honest.click();
  await expect(page.locator("#dictionary-term")).toHaveText("honest");
  await expect(page.locator("#dictionary-pos")).toHaveText("adjective");
  await expect(page.locator("#dictionary-meaning")).toContainText("诚实");
  await expect(page.locator("#dictionary-source")).toContainText("ECDICT · 已上线核心整理");
  await expect(page.locator("#dictionary-source")).toContainText("MIT and project editorial additions");
  for (const forbidden of group.forbidden) await expect(page.locator(`#dictionary-choices button[data-dictionary-term="${forbidden}"]`)).toHaveCount(0);
  await publicQuery(page, group.terms[1]);
  // This query intentionally promotes the existing original variant because
  // the ECDICT primary gloss does not contain the requested 有耐心 atom.
  // Keep its actual attribution and both stored POS values, not a blanket MIT.
  await publicQuery(page, "有耐心");
  await page.locator('#dictionary-choices button[data-dictionary-term="patient"]').click();
  await expect(page.locator("#dictionary-term")).toHaveText("patient");
  await expect(page.locator("#dictionary-pos")).toHaveText("adjective · noun");
  await expect(page.locator("#dictionary-meaning")).toContainText("有耐心");
  await expect(page.locator("#dictionary-source")).toContainText("卓式原创释义（AI复核，精选义项）");
  await expect(page.locator("#dictionary-source")).toContainText("Project original content; AI-reviewed, not human-certified");
});

test("a new member can preview the fourth batch without collecting words, editing a draft or using foreign providers", async ({ context, page }) => {
  const registration = await context.request.post(`${API}/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "catalogue_four_reader", password: "synthetic fourth catalogue password 2026" }
  });
  expect(registration.status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  const writes = [], foreign = [], group = nextBatch.groups[0], head = group.heads[0];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (new URL(request.url()).origin !== ORIGIN) foreign.push(request.url());
  });
  await page.locator("#member-dictionary-term").fill(group.terms[0]);
  await page.locator("#member-dictionary-term").press("Enter");
  const choice = memberChoice(page, head);
  await expect(choice).toBeVisible(); await choice.click();
  await expect(page.locator("#member-dictionary-word")).toHaveText(head);
  await expect(page.locator("#member-dictionary-pos")).not.toHaveText("");
  await expect(page.locator("#member-dictionary-meaning")).toContainText(new RegExp(group.terms.join("|"), "u"));
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  const entries = await context.request.get(`${API}/entries`, { headers: { "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech" } });
  expect((await entries.json()).entries).toEqual([]);
  expect(writes).toEqual([]); expect(foreign).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
});
