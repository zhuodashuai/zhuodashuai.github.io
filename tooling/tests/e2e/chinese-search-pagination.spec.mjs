import { test, expect } from "@playwright/test";

// Keep this UI contract independent of the source-bound ranking/index tests.
// The fixture exposes three pages, including a repeated boundary row, so that
// a passing test requires real pagination rather than expanding a hidden list.
test.use({ serviceWorkers: "block" });
const moduleFixture = `
const rows = Array.from({length: 43}, (_, i) => ({term: "heat-fixture-" + i,
  partOfSpeech: "adjective", meaning: "热的；第" + i + "项测试义项", source: "测试公开词典", license: "Original fixture", url: "https://example.com/"}));
export async function searchExpandedDictionary(input, {offset = 0, limit = 20} = {}) {
  const end = Math.min(rows.length, offset + limit - (offset > 0 ? 1 : 0));
  const page = rows.slice(offset > 0 ? offset - 1 : 0, end);
  return {query: input, results: page, hasMore: end < rows.length, nextOffset: end};
}
export async function searchRelatedChineseDictionary() { return {results: [], hasMore: false}; }
export async function preloadExpandedDictionary() { return {counts: {records: rows.length}, version: "a".repeat(64)}; }
`;

for (const surface of ["inline", "standalone"]) {
  test(`${surface}: more pages preserve selection, deduplicate results, and issue no writes`, async ({ page }) => {
    const errors = [], writes = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(request.url()); });
    await page.route("**/js/expanded-dictionary.js*", route => route.fulfill({ contentType: "text/javascript", body: moduleFixture }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(surface === "inline" ? "/" : "/dictionary.html");
    const input = page.locator(surface === "inline" ? "#lookup-input" : "#dictionary-query");
    const choices = page.locator(surface === "inline" ? "#lookup-choices button[data-lookup-choice]" : "#dictionary-choices button");
    const heading = page.locator(surface === "inline" ? "#lookup-term" : "#dictionary-term");
    const more = page.locator(surface === "inline" ? "#lookup-more" : "#dictionary-more");
    await input.fill("热"); await input.press("Enter");
    await expect(choices).toHaveCount(20);
    if (surface === "standalone") await page.locator("#dictionary-choice-disclosure").evaluate(node => { node.open = true; });
    await choices.nth(5).click(); await expect(heading).toHaveText("heat-fixture-5");
    if (surface === "standalone") await page.locator("#dictionary-choice-disclosure").evaluate(node => { node.open = true; });
    await more.click(); await expect(choices).toHaveCount(39);
    await expect(heading).toHaveText("heat-fixture-5");
    await more.click(); await expect(choices).toHaveCount(43);
    await expect(more).toBeHidden(); await expect(heading).toHaveText("heat-fixture-5");
    const terms = await choices.allTextContents(); expect(new Set(terms).size).toBe(terms.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]); expect(writes).toEqual([]);
  });
}
