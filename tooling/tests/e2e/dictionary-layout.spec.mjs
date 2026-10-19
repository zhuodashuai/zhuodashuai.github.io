import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ORIGIN = process.env.WORDBOOK_E2E_ORIGIN || "http://127.0.0.1:4187";
const englishShard = "**/data/expanded-dictionary/**/en-*.json*";
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `dictionary-layout-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw new Error(error.message); });
});

async function open(page) {
  await page.goto("/dictionary.html");
  await expect(page.locator("#dictionary-query")).toBeVisible();
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
}

async function query(page, value) {
  await page.locator("#dictionary-query").fill(value);
  await page.locator("#dictionary-query").press("Enter");
  await expect(page.locator("#dictionary-result")).toBeVisible();
  await expect(page.locator("#dictionary-submit")).toBeEnabled();
}

async function box(locator) {
  const rectangle = await locator.boundingBox();
  expect(rectangle).not.toBeNull();
  return rectangle;
}

async function noOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test(`dictionary layout keeps navigation, search and a real result readable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await open(page);
    await expect(page.getByRole("navigation", { name: "页面导航" }).getByRole("link", { name: "中英词典", exact: true })).toHaveAttribute("aria-current", "page");
    const input = await box(page.locator("#dictionary-query"));
    const submit = await box(page.locator("#dictionary-submit"));
    expect(input.y + input.height).toBeLessThan(viewport.height - 24);
    expect(Math.abs((input.y + input.height / 2) - (submit.y + submit.height / 2))).toBeLessThanOrEqual(3);
    expect(input.x + input.width).toBeLessThanOrEqual(submit.x + 1);
    expect(input.width).toBeGreaterThan(submit.width);
    await noOverflow(page);
    await query(page, "override");
    await expect(page.locator("#dictionary-term")).toHaveText("override");
    await expect(page.locator("#dictionary-meaning")).not.toBeEmpty();
    await expect(page.locator("#dictionary-example-content .example-sense")).not.toHaveCount(0);
    await expect(page.locator("#dictionary-add")).toBeVisible();
    await noOverflow(page);
  });
}

test("dictionary desktop gives real Chinese choices a sidebar without displacing the selected definition", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await open(page); await query(page, "苹果");
  const choices = page.locator("#dictionary-choices button[data-dictionary-term]");
  expect(await choices.count()).toBeGreaterThan(1);
  const apple = page.locator('#dictionary-choices button[data-dictionary-term="apple"]');
  await expect(apple).toBeVisible();
  await apple.click();
  await expect(page.locator("#dictionary-term")).toHaveText("apple");
  await expect(page.locator("#dictionary-meaning")).toContainText("苹果");
  const sidebar = await box(page.locator("#dictionary-choice-panel"));
  const detail = await box(page.locator("#dictionary-result"));
  expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(detail.x + 1);
  expect(Math.abs(sidebar.y - detail.y)).toBeLessThanOrEqual(2);
  expect(detail.width).toBeGreaterThan(sidebar.width);
  expect(await apple.count()).toBeGreaterThan(0);
  await noOverflow(page);
});

test("dictionary result groups headword with POS and puts actions and examples before provenance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page); await query(page, "override");
  await expect(page.locator(".result-heading #dictionary-term")).toHaveText("override");
  await expect(page.locator(".result-heading #dictionary-pos")).not.toBeEmpty();
  const term = await box(page.locator("#dictionary-term"));
  const pos = await box(page.locator("#dictionary-pos"));
  expect(pos.y).toBeLessThan(term.y + term.height + 10);
  expect(pos.x).toBeLessThan(term.x + term.width + 40);
  await expect(page.locator("#dictionary-example-panel")).toBeVisible();
  await expect(page.locator(".result-provenance #dictionary-source")).toContainText("ECDICT");
  await expect(page.locator(".result-provenance #dictionary-variant-panel")).toBeVisible();
  const order = await page.evaluate(() => {
    const action = document.querySelector("#dictionary-add");
    const meaning = document.querySelector("#dictionary-meaning");
    const examples = document.querySelector("#dictionary-example-panel");
    const source = document.querySelector("#dictionary-source");
    const before = (first, second) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { actionBeforeExamples: before(action, examples), meaningBeforeExamples: before(meaning, examples), examplesBeforeSource: before(examples, source) };
  });
  expect(order).toEqual({ actionBeforeExamples: true, meaningBeforeExamples: true, examplesBeforeSource: true });
  await noOverflow(page);
});

test("dictionary phone stacks Chinese choices above the definition and keeps every choice inside the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page); await query(page, "苹果");
  await page.locator('#dictionary-choices button[data-dictionary-term="apple"]').click();
  await expect(page.locator("#dictionary-term")).toHaveText("apple");
  const sidebar = await box(page.locator("#dictionary-choice-panel"));
  const detail = await box(page.locator("#dictionary-result"));
  expect(sidebar.y + sidebar.height).toBeLessThanOrEqual(detail.y + 1);
  expect(Math.abs(sidebar.x - detail.x)).toBeLessThanOrEqual(2);
  const candidates = await page.locator("#dictionary-choices button").evaluateAll(elements => elements.map(element => {
    const rectangle = element.getBoundingClientRect();
    return { left: rectangle.left, right: rectangle.right };
  }));
  expect(candidates.length).toBeGreaterThan(1);
  for (const candidate of candidates) { expect(candidate.left).toBeGreaterThanOrEqual(0); expect(candidate.right).toBeLessThanOrEqual(391); }
  await noOverflow(page);
});

test("dictionary slow search shows cancellation below a stable input and submit row", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const gate = deferred(), seen = deferred(); let gated = false;
  await page.route(englishShard, async route => {
    if (gated) return route.continue();
    gated = true; const response = await route.fetch(); seen.resolve(); await gate.promise;
    try { await route.fulfill({ response }); } catch { /* Cancellation deliberately invalidates this old request. */ }
  });
  try {
    await open(page); await page.locator("#dictionary-query").fill("abacus");
    const inputBefore = await box(page.locator("#dictionary-query"));
    const submitBefore = await box(page.locator("#dictionary-submit"));
    await page.locator("#dictionary-query").press("Enter"); await seen.promise;
    await expect(page.locator("#dictionary-cancel")).toBeVisible();
    const inputDuring = await box(page.locator("#dictionary-query"));
    const submitDuring = await box(page.locator("#dictionary-submit"));
    const cancel = await box(page.locator("#dictionary-cancel"));
    for (const key of ["x", "y", "width", "height"]) {
      expect(Math.abs(inputBefore[key] - inputDuring[key]), `input ${key}`).toBeLessThanOrEqual(1);
      expect(Math.abs(submitBefore[key] - submitDuring[key]), `submit ${key}`).toBeLessThanOrEqual(1);
    }
    expect(cancel.y).toBeGreaterThanOrEqual(inputDuring.y + inputDuring.height);
    await noOverflow(page);
    await page.locator("#dictionary-cancel").click();
    await expect(page.locator("#dictionary-submit")).toBeEnabled();
    await expect(page.locator("#dictionary-query")).toHaveValue("abacus");
    await expect(page.locator("#dictionary-result")).toBeHidden();
  } finally { gate.resolve(); }
});

test("dictionary results take keyboard focus and remain visible within a short phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 440 }); await open(page);
  const onscreen = async locator => {
    await expect(locator).toBeFocused();
    await expect.poll(() => locator.evaluate(element => {
      const rectangle = element.getBoundingClientRect();
      return Math.max(-rectangle.top, rectangle.bottom - innerHeight);
    })).toBeLessThanOrEqual(0);
  };
  await query(page, "abacus");
  await expect(page.locator("#dictionary-term")).toHaveText("abacus");
  await onscreen(page.locator("#dictionary-term"));
  await query(page, "苹果");
  const first = page.locator("#dictionary-choices button").first();
  await onscreen(first);
  await page.locator('#dictionary-choices button[data-dictionary-term="apple"]').click();
  await expect(page.locator("#dictionary-term")).toHaveText("apple");
  await onscreen(page.locator("#dictionary-term"));
  await noOverflow(page);
});

test("a shipped long canonical phrase retains its complete headword, POS and expanded provenance at 320px", async ({ page }) => {
  const term = "proportional representation";
  const base = new URL("../../../vocab/data/expanded-dictionary/", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", base), "utf8"));
  let hash = 2166136261;
  for (const character of term) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  const descriptor = manifest.english.shards.find(shard => shard.bucket === hash % manifest.english.buckets);
  const shard = JSON.parse(await readFile(new URL(descriptor.file, base), "utf8"));
  const actual = shard.records.find(record => record.term === term);
  // Exercise real shipped content, not a fabricated oversized response.
  expect(actual).toBeTruthy(); expect(actual.term.length).toBeGreaterThan(25);
  expect(actual.partOfSpeech).toBeTruthy(); expect(actual.variants.length).toBeGreaterThan(0);
  await page.setViewportSize({ width: 320, height: 740 }); await open(page); await query(page, term);
  await expect(page.locator("#dictionary-term")).toHaveText(actual.term);
  await expect(page.locator("#dictionary-pos")).toHaveText(actual.partOfSpeech);
  await expect(page.locator("#dictionary-meaning")).toContainText(actual.meaning);
  await expect(page.locator("#dictionary-source")).toContainText("ECDICT");
  await page.locator("#dictionary-variant-summary").click();
  await expect(page.locator("#dictionary-variants")).toBeVisible();
  await expect(page.locator("#dictionary-variants .part-of-speech").first()).toHaveText(actual.variants[0].partOfSpeech);
  await expect(page.locator("#dictionary-variants")).toContainText(actual.variants[0].meaning);
  await noOverflow(page);
  for (const selector of ["#dictionary-term", "#dictionary-pos", "#dictionary-meaning", "#dictionary-source", "#dictionary-variants"]) {
    const rectangle = await box(page.locator(selector));
    expect(rectangle.x, selector).toBeGreaterThanOrEqual(0);
    expect(rectangle.x + rectangle.width, selector).toBeLessThanOrEqual(321);
  }
  await expect(page.locator("#dictionary-term")).toHaveText(actual.term);
  await expect(page.locator("#dictionary-pos")).toHaveText(actual.partOfSpeech);
});
