import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { COMMON_CHINESE_GROUPS } from "../../../vocab/js/chinese-related-common.js";
import { personalDictionaryResult } from "../../../vocab/js/personal-dictionary.js";

const ORIGIN = "http://127.0.0.1:4187", API = `${ORIGIN}/api/v1/member`;
const NEXT = COMMON_CHINESE_GROUPS.filter(group => group.number >= 346);
const manifest = JSON.parse(await readFile(new URL("../../../vocab/data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
const examplesManifest = JSON.parse(await readFile(new URL("../../../vocab/data/dictionary-examples/manifest-v2.json", import.meta.url), "utf8"));
const exampleShards = new Map();
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `next-senses-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

function choose(pos, predicate = () => true) {
  const group = NEXT.find(row => row.pos === pos && predicate(row));
  expect(group, `the new catalogue must include a reviewed ${pos} meeting this scenario, not fall back to the previous batch`).toBeTruthy();
  return group;
}
function formatted(evidence) {
  if (["mit", "core", "pos-reviewed"].includes(evidence.source) && !/^\s*(?:[①-⑳]|\d+[.、])/u.test(evidence.meaning)) {
    const row = personalDictionaryResult({ word: evidence.head, partOfSpeech: evidence.partOfSpeech, meaning: evidence.meaning });
    if (row) return { partOfSpeech: row.partOfSpeech || evidence.partOfSpeech, meaning: row.meaning.length <= 2000 ? row.meaning : evidence.meaning };
  }
  return { partOfSpeech: evidence.partOfSpeech, meaning: evidence.meaning };
}
function meaningLines(value) {
  const numbered = /^\s*(?:[①-⑳]|\d+[.、])/u.test(value) ? value : `① ${value}`;
  return numbered.split(/\r?\n/u).filter(line => line.trim());
}
async function query(page, group, term = group.terms[0]) {
  await page.locator("#dictionary-query").fill(term);
  await page.locator("#dictionary-query").press("Enter");
  await expect.poll(() => page.locator("#dictionary-choices button[data-dictionary-term]")
    .evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm).sort()))
    .toEqual([...group.heads].sort());
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
  await expect(page.locator("#dictionary-related-status")).not.toContainText("正在补充");
}
async function selectHead(page, group, head = group.heads[0]) {
  const disclosure = page.locator("#dictionary-choice-disclosure");
  if (!await disclosure.evaluate(element => element.open)) await disclosure.locator(":scope > summary").click();
  await page.locator(`#dictionary-choices button[data-dictionary-term="${head}"]`).click();
  await expect(page.locator("#dictionary-term")).toHaveText(head);
  const pos = await page.locator("#dictionary-pos").textContent();
  const lines = await page.locator("#dictionary-meaning .meaning-line").allTextContents();
  const source = await page.locator("#dictionary-source").textContent();
  const evidence = group.evidence.filter(row => row.head === head);
  expect(evidence.some(row => formatted(row).partOfSpeech === pos
    && JSON.stringify(meaningLines(formatted(row).meaning)) === JSON.stringify(lines)
    && source.includes(manifest.sources[row.source].name) && source.includes(manifest.sources[row.source].license)),
  `${group.id}/${head}: the visible POS, complete definition and provenance must belong to one intact source variant`).toBe(true);
  await expect(page.locator("#dictionary-related-match")).toContainText(group.pos);
  await expect(page.locator("#dictionary-related-match")).toContainText(group.sense);
  await expect(page.locator("#dictionary-related-match")).toContainText("限此义项");
}
async function searchResult(page, input, head) {
  return page.evaluate(async ({ input, head }) => {
    const module = await import(new URL("js/expanded-dictionary.js", location.href).href);
    const direct = await module.searchExpandedDictionary(input);
    const related = await module.searchRelatedChineseDictionary(input);
    return [...direct.results, ...related.results].find(row => row.term === head);
  }, { input, head });
}
async function examplesFor(head) {
  let hash = 2166136261;
  for (const char of head) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  const descriptor = examplesManifest.shards[hash % 256];
  if (!exampleShards.has(descriptor.file)) exampleShards.set(descriptor.file, readFile(new URL(`../../../vocab/data/dictionary-examples/${descriptor.file}`, import.meta.url), "utf8").then(JSON.parse));
  return (await exampleShards.get(descriptor.file)).entries.find(row => row.term === head);
}
async function reviewedExampleCase() {
  for (const group of NEXT) for (const head of group.heads) {
    const proofs = group.exampleSenses?.[head];
    expect(Array.isArray(proofs), `${group.id}/${head}: an explicit reviewed example scope, including an empty list, is required`).toBe(true);
    if (!proofs.length) continue;
    const original = await examplesFor(head);
    if (original && original.senses.length > proofs.length) return { group, head, proofs, original };
  }
  throw new Error("the next batch needs a real reviewed multi-sense example contrast; do not silently skip the whitelist regression");
}

test("the next substantial batch works with Enter on a 390px phone without broad Chinese downloads", async ({ page }) => {
  expect(NEXT.length, "a next release must not masquerade as another thirty-group increment").toBeGreaterThanOrEqual(100);
  const group = choose("adjective");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dictionary.html");
  const requests = [];
  page.on("request", request => { if (request.url().includes("/data/expanded-dictionary/")) requests.push(request); });
  await query(page, group, group.terms[0] + "的");
  await selectHead(page, group);
  expect(requests.some(request => /\/zh-\d{3}\.json(?:$|\?)/u.test(request.url()))).toBe(false);
  expect(new Set(requests.filter(request => /\/en-\d{3}\.json(?:$|\?)/u.test(request.url())).map(request => request.url())).size).toBeLessThanOrEqual(6);
  expect(requests.every(request => ["GET", "HEAD"].includes(request.method()) && new URL(request.url()).origin === ORIGIN)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test("a new noun and a real verb sharing one head keep their own target roles and source senses", async ({ page }) => {
  let pair;
  for (const noun of NEXT.filter(row => row.pos === "noun")) {
    for (const head of noun.heads) {
      const verb = COMMON_CHINESE_GROUPS.find(row => row.pos === "verb" && row.heads.includes(head));
      if (verb) { pair = { noun, verb, head }; break; }
    }
    if (pair) break;
  }
  expect(pair, "include an actual new noun versus verb contrast, not a synthetic missing word").toBeTruthy();
  await page.goto("/dictionary.html");
  for (const group of [pair.noun, pair.verb]) {
    await query(page, group);
    await selectHead(page, group, pair.head);
    const result = await searchResult(page, group.terms[0], pair.head);
    expect(result.matchedPartOfSpeech).toBe(group.pos);
    expect(result.matchedSense).toBe(group.sense);
    const proofs = group.exampleSenses[pair.head];
    expect(result.matchedExampleSenseIds).toEqual(proofs.map(row => row.id));
    expect(result.matchedExampleSenseEvidence).toEqual(proofs);
    for (const rejected of group.forbidden) await expect(page.locator(`#dictionary-choices button[data-dictionary-term="${rejected}"]`)).toHaveCount(0);
  }
  expect(pair.noun.sense).not.toBe(pair.verb.sense);
});

test("a newly reviewed adjective does not import its explicitly rejected unrelated meaning", async ({ page }) => {
  const group = choose("adjective", row => row.forbidden.length > 0);
  await page.goto("/dictionary.html");
  for (const term of [group.terms[0], group.terms.at(-1)]) {
    await query(page, group, term);
    for (const head of group.heads) {
      await selectHead(page, group, head);
      const result = await searchResult(page, term, head);
      expect(result.matchedPartOfSpeech).toBe("adjective");
      expect(result.matchedSense).toBe(group.sense);
    }
    for (const rejected of group.forbidden) await expect(page.locator(`#dictionary-choices button[data-dictionary-term="${rejected}"]`)).toHaveCount(0);
  }
});

test("a new exact example whitelist opens only the audited sense and retains all other original learning examples", async ({ page }) => {
  const { group, head, proofs, original } = await reviewedExampleCase();
  await page.goto("/dictionary.html");
  await query(page, group); await selectHead(page, group, head);
  const result = await searchResult(page, group.terms[0], head);
  expect(result.matchedExampleSenseIds).toEqual(proofs.map(row => row.id));
  expect(result.matchedExampleSenseEvidence).toEqual(proofs);
  const content = page.locator("#dictionary-example-content"), panels = content.locator("details.example-sense");
  await expect(panels).toHaveCount(original.senses.length);
  await expect(page.locator("#dictionary-example-panel")).toHaveAttribute("aria-busy", "false");
  const approvedIds = new Set(proofs.map(proof => proof.id));
  // The UI deliberately ranks approved senses first, retaining original order
  // within each partition. Use that exact sequence rather than substring
  // locators: two different senses can share a short Chinese prefix (or even
  // the same visible label) without becoming the same semantic identity.
  const ordered = original.senses.map((sense, index) => ({ sense, index, approved: approvedIds.has(sense.id) }))
    .sort((a, b) => Number(b.approved) - Number(a.approved) || a.index - b.index);
  expect(ordered[0].approved).toBe(true);
  await expect(content.locator("details.example-sense[open]")).toHaveCount(1);
  for (const [index, { sense, approved }] of ordered.entries()) {
    const panel = panels.nth(index);
    await expect(panel.locator("summary")).toHaveText(`${index + 1}. ${approved ? "本次义项" : "其他义项"}：${sense.partOfSpeech} · ${sense.meaningZh}`);
    if (index === 0) await expect(panel).toHaveAttribute("open", "");
    else await expect(panel).not.toHaveAttribute("open", "");
    for (const example of sense.examples) {
      await expect(panel.getByText(example.en, { exact: true })).toHaveCount(1);
      await expect(panel.getByText(example.zh, { exact: true })).toHaveCount(1);
    }
  }
});

test("looking up a new Chinese sense does not overwrite the same English head's original data or keep a stale scope", async ({ page }) => {
  const group = choose("verb"), head = group.heads[0];
  await page.goto("/dictionary.html");
  const before = await searchResult(page, head, head);
  expect(before.term).toBe(head); expect(before.matchedSense).toBeUndefined();
  await query(page, group); await selectHead(page, group, head);
  await page.locator("#dictionary-query").fill(head);
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-status")).toHaveAttribute("data-phase", "ready");
  await expect(page.locator("#dictionary-term")).toHaveText(head);
  await expect(page.locator("#dictionary-pos")).toHaveText(before.partOfSpeech);
  await expect(page.locator("#dictionary-related-match")).toBeHidden();
  const after = await searchResult(page, head, head);
  expect(after).toEqual(before);
  await expect(page.locator("#dictionary-source")).toContainText(before.source);
  await expect(page.locator("#dictionary-source")).toContainText(before.license);
});

test("a fresh member can inspect the next batch without automatic collection, draft edits or foreign providers", async ({ context, page }) => {
  const registration = await context.request.post(`${API}/register`, {
    headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
    data: { username: "next_sense_reader", password: "synthetic next sense password 2026" }
  });
  expect(registration.status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/personal.html?auth=member");
  await expect(page.locator("#member-workspace")).toBeVisible();
  await expect(page.locator("#member-entry-list")).toHaveAttribute("aria-busy", "false");
  const writes = [], foreign = [], group = choose("verb"), head = group.heads[0];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    if (new URL(request.url()).origin !== ORIGIN) foreign.push(request.url());
  });
  await page.locator("#member-dictionary-term").fill(group.terms[0]);
  await page.locator("#member-dictionary-term").press("Enter");
  const choice = page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: new RegExp(`^${head.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u") }) });
  await expect(choice).toBeVisible(); await choice.click();
  await expect(page.locator("#member-dictionary-word")).toHaveText(head);
  expect(group.evidence.filter(row => row.head === head).map(row => formatted(row).partOfSpeech)).toContain(await page.locator("#member-dictionary-pos").textContent());
  await expect(page.locator("#member-dictionary-status")).toContainText(group.sense);
  await expect(page.locator("#member-term")).toHaveValue("");
  await expect(page.locator(".personal-entry")).toHaveCount(0);
  const entries = await context.request.get(`${API}/entries`, { headers: { "X-Wordbook-Auth": "member", "X-Wordbook-Fields": "partOfSpeech" } });
  expect((await entries.json()).entries).toEqual([]);
  expect(writes).toEqual([]); expect(foreign).toEqual([]);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
});
