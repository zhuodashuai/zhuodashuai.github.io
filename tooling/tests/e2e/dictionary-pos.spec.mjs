import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CORE_POS_CORRECTIONS } from "../../../vocab/js/core-pos-corrections.js";

const ORIGIN = "http://127.0.0.1:4187";
const pack = JSON.parse(await readFile(new URL("../../dictionary/pos/pos-completion-2026-10-19.json", import.meta.url), "utf8"));
const byTerm = new Map(pack.entries.map(entry => [entry.term, entry]));
const candidates = pack.entries.filter(entry => /^[A-Za-z][A-Za-z '-]*$/u.test(entry.term));
const requested = ["anticer", "earthed", "a bit", "as a rule", "as such", "booklist", "Smyth", "in abeyance", "come to grips with"];
const sample = new Map(requested.filter(term => byTerm.has(term)).map(term => [term, byTerm.get(term)]));
for (let index = 0; sample.size < 100 && index < candidates.length; index++) {
  const entry = candidates[Math.floor(index * candidates.length / 100)];
  sample.set(entry.term, entry);
}
if (sample.size !== 100) throw new Error("POS browser coverage must have 100 distinct approved headwords.");

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `pos-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

test("100 approved exact headwords render a nonempty full grammatical label without providers", async ({ page }) => {
  test.setTimeout(120_000);
  const external = [];
  page.on("request", request => { if (new URL(request.url()).origin !== ORIGIN) external.push(request.url()); });
  await page.goto("/dictionary.html");
  for (const entry of sample.values()) {
    await page.locator("#dictionary-query").fill(entry.term);
    await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-term"), entry.term).toHaveText(entry.term);
    await expect(page.locator("#dictionary-pos"), entry.term).not.toHaveText("");
    await expect(page.locator("#dictionary-pos"), entry.term).not.toContainText("未标注");
    await expect(page.locator("#dictionary-source"), entry.term).toContainText("词性校订");
  }
  expect(external).toEqual([]);
});

test("reviewed core grammar survives the compact fast path, save and reload for an ordinary new account", async ({ page, context }) => {
  expect(CORE_POS_CORRECTIONS.entries.length).toBeGreaterThan(500);
  const [term, , pos] = CORE_POS_CORRECTIONS.entries.find(([word]) => word === "a bit") || CORE_POS_CORRECTIONS.entries[0];
  const registered = await context.request.post(`${ORIGIN}/api/v1/member/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "pos_reader", password: "synthetic isolated POS password 88" }
  });
  expect(registered.status()).toBe(200);
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  await page.locator("#member-dictionary-term").fill(term);
  await page.locator("#member-dictionary-term").press("Enter");
  await expect(page.locator("#member-dictionary-word")).toHaveText(term);
  await expect(page.locator("#member-dictionary-pos")).toHaveText(pos);
  await expect(page.locator("#member-dictionary-status")).toContainText("词性校订");
  await page.locator("#member-dictionary-use").click();
  await expect(page.locator("#member-partOfSpeech")).toHaveValue(pos);
  await page.locator("#member-save").click();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".personal-entry")).toHaveCount(1);
  const saved = await context.request.get(`${ORIGIN}/api/v1/member/entries`, { headers: {
    "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech"
  } });
  expect((await saved.json()).entries[0].partOfSpeech).toBe(pos);
});

test("grammar phrases remain complete on a 390px phone and repeat from cache offline", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dictionary.html#q=as%20a%20rule");
  await expect(page.locator("#dictionary-term")).toHaveText("as a rule");
  const label = await page.locator("#dictionary-pos").textContent();
  expect(label).toMatch(/adverb|phrase/u);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await context.setOffline(true);
  try {
    await page.locator("#dictionary-query").fill("as a rule");
    await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-pos")).toHaveText(label);
  } finally { await context.setOffline(false); }
});
