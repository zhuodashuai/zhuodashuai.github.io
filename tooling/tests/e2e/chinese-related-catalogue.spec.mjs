import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const batch = JSON.parse(await readFile(new URL("../../dictionary/chinese-related-003.json", import.meta.url), "utf8"));
const ORIGIN = "http://127.0.0.1:4187";
const API = `${ORIGIN}/api/v1/member`;
test.use({ serviceWorkers: "block" });

test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `related-catalogue-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

async function publicQuery(page, term) {
  const group = batch.groups.find(row => row.terms.includes(term));
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

test("mobile manual keeps the numbered 30-group catalogue collapsed and exactly aligned with reviewed data", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide.html#chinese-related-catalogue");
  const catalogue = page.locator("#chinese-related-catalogue");
  await expect(catalogue.locator("summary")).toHaveText("本批新增近义词表（55–84）");
  await expect(catalogue).not.toHaveAttribute("open", "");
  await expect(catalogue.locator("table")).toBeHidden();
  await catalogue.locator("summary").click();
  await expect(catalogue.locator("caption")).toContainText("不是全量同义词");
  const rows = catalogue.locator("tbody tr");
  await expect(rows).toHaveCount(30);
  expect(batch.groups).toHaveLength(30);
  for (let index = 0; index < batch.groups.length; index++) {
    const group = batch.groups[index], row = rows.nth(index);
    await expect(row.locator("th")).toHaveText(String(group.number));
    await expect(row.locator("td").nth(0)).toHaveText(group.terms.join("／"));
    await expect(row.locator("td a")).toHaveText(group.terms[0]);
    await expect(row.locator("td a")).toHaveAttribute("href", `dictionary.html#q=${encodeURIComponent(group.terms[0])}`);
    await expect(row.locator(".related-heads")).toHaveText(group.heads.join(" / "));
    await expect(row.locator("small")).toHaveText(group.note);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("the first catalogue group opens a real dictionary query and preserves source definitions", async ({ page }) => {
  const group = batch.groups[0];
  expect(group.number).toBe(55); expect(group.terms[0]).toBe("勤奋");
  await page.goto("/guide.html#chinese-related-catalogue");
  await page.locator("#chinese-related-catalogue > summary").click();
  await page.locator("#chinese-related-catalogue tbody a").first().click();
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
