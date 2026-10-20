import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { COMMON_CHINESE_GROUPS } from "../../../vocab/js/chinese-related-common.js";
import { personalDictionaryResult } from "../../../vocab/js/personal-dictionary.js";

const ORIGIN = "http://127.0.0.1:4187", API = `${ORIGIN}/api/v1/member`;
const manifest = JSON.parse(await readFile(new URL("../../../vocab/data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `common-senses-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

function representative(pos) {
  const group = COMMON_CHINESE_GROUPS.find(row => row.pos === pos && row.terms.length > 1)
    || COMMON_CHINESE_GROUPS.find(row => row.pos === pos);
  expect(group, `a reviewed common ${pos} group is required`).toBeTruthy();
  return group;
}
function displayedPos(evidence) {
  if (["mit", "core", "pos-reviewed"].includes(evidence.source) && !/^\s*(?:[①-⑳]|\d+[.、])/u.test(evidence.meaning)) {
    return personalDictionaryResult({ word: evidence.head, partOfSpeech: evidence.partOfSpeech, meaning: evidence.meaning })?.partOfSpeech || evidence.partOfSpeech;
  }
  return evidence.partOfSpeech;
}
async function publicQuery(page, group, term = group.terms[0]) {
  await page.locator("#dictionary-query").fill(term);
  await page.locator("#dictionary-query").press("Enter");
  await expect.poll(() => page.locator("#dictionary-choices button[data-dictionary-term]")
    .evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm).sort()))
    .toEqual([...group.heads].sort());
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  await expect(page.locator("#dictionary-related-status")).not.toContainText("正在补充");
}
async function expectActualEvidence(page, group, head) {
  const evidence = group.evidence.filter(row => row.head === head);
  await expect(page.locator("#dictionary-term")).toHaveText(head);
  expect(evidence.map(displayedPos)).toContain(await page.locator("#dictionary-pos").textContent());
  const meaning = await page.locator("#dictionary-meaning").textContent();
  expect(evidence.some(row => row.terms.some(term => meaning.includes(term)))).toBe(true);
  const source = await page.locator("#dictionary-source").textContent();
  expect(evidence.some(row => source.includes(manifest.sources[row.source].name)
    && source.includes(manifest.sources[row.source].license))).toBe(true);
  await expect(page.locator("#dictionary-related-match")).toContainText(group.pos);
  await expect(page.locator("#dictionary-related-match")).toContainText(group.sense);
}

test("common adjectives find the complete finite group with Enter on a narrow phone screen", async ({ page }) => {
  const group = representative("adjective");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dictionary.html");
  const dictionaryRequests = [];
  page.on("request", request => { if (request.url().includes("/data/expanded-dictionary/")) dictionaryRequests.push(request.url()); });
  await publicQuery(page, group);
  await page.locator(`#dictionary-choices button[data-dictionary-term="${group.heads[0]}"]`).click();
  await expectActualEvidence(page, group, group.heads[0]);
  for (const head of group.forbidden || []) await expect(page.locator(`#dictionary-choices button[data-dictionary-term="${head}"]`)).toHaveCount(0);
  expect(dictionaryRequests.some(url => /\/zh-\d{3}\.json(?:$|\?)/u.test(url))).toBe(false);
  expect(new Set(dictionaryRequests.filter(url => /\/en-\d{3}\.json(?:$|\?)/u.test(url))).size).toBeLessThanOrEqual(6);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("common nouns and verbs retain separate POS-bound source definitions rather than lending labels across senses", async ({ page }) => {
  await page.goto("/dictionary.html");
  for (const pos of ["noun", "verb"]) {
    const group = representative(pos);
    await publicQuery(page, group);
    for (const head of group.heads) {
      await page.locator(`#dictionary-choices button[data-dictionary-term="${head}"]`).click();
      await expectActualEvidence(page, group, head);
    }
  }
});

test("common adverb suffix lookup and related-result labels keep the actual matched Chinese sense", async ({ page }) => {
  const group = representative("adverb"), term = group.terms[0];
  await page.goto("/dictionary.html");
  await publicQuery(page, group, term + "地");
  await page.locator(`#dictionary-choices button[data-dictionary-term="${group.heads[0]}"]`).click();
  await expectActualEvidence(page, group, group.heads[0]);
  const associated = COMMON_CHINESE_GROUPS.find(row => row.terms.length > 1 && row.heads.some(head =>
    !row.evidence.some(evidence => evidence.head === head && evidence.terms.includes(row.terms[0]))));
  expect(associated, "include a real association whose matching atom differs from the user's exact query").toBeTruthy();
  await publicQuery(page, associated);
  const related = page.locator("#dictionary-choices button").filter({ has: page.locator(".related-badge") });
  await expect(related.first()).toBeVisible();
  const choice = related.first(), badge = await choice.locator(".related-badge").textContent();
  expect(associated.terms.some(alias => badge.includes(alias))).toBe(true);
  await choice.click();
  await expect(page.locator("#dictionary-related-match")).toContainText("限此义项");
  await expect(page.locator("#dictionary-related-match")).toContainText(associated.pos);
  await expect(page.locator("#dictionary-related-match")).toContainText(associated.sense);
  await expect(page.locator("#dictionary-related-status")).toContainText("近义关联仅供找词，具体含义和用法请看原释义");
  await expect(page.locator("#dictionary-related-match")).toContainText(badge.replace(/^近义关联：/u, ""));
});

test("a fresh member can inspect a large-catalogue result without automatic collection, draft changes or foreign provider calls", async ({ context, page }) => {
  const registration = await context.request.post(`${API}/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "common_sense_reader", password: "synthetic common sense password 2026" }
  });
  expect(registration.status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  const writes = [], foreign = [], group = representative("verb"), head = group.heads[0];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (new URL(request.url()).origin !== ORIGIN) foreign.push(request.url());
  });
  await page.locator("#member-dictionary-term").fill(group.terms[0]);
  await page.locator("#member-dictionary-term").press("Enter");
  const choice = page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: new RegExp(`^${head.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u") }) });
  await expect(choice).toBeVisible(); await choice.click();
  await expect(page.locator("#member-dictionary-word")).toHaveText(head);
  expect(group.evidence.filter(row => row.head === head).map(displayedPos)).toContain(await page.locator("#member-dictionary-pos").textContent());
  await expect(page.locator("#member-dictionary-meaning")).toContainText(new RegExp(group.terms.join("|"), "u"));
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  const entries = await context.request.get(`${API}/entries`, { headers: { "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech" } });
  expect((await entries.json()).entries).toEqual([]);
  expect(writes).toEqual([]); expect(foreign).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
});
