import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const approved = [];
for (const part of "abcdef") {
  const pack = JSON.parse(await readFile(new URL(`../../dictionary/examples/source/batch-0012-${part}.json`, import.meta.url), "utf8"));
  const review = JSON.parse(await readFile(new URL(`../../dictionary/examples/reviews/batch-0012-${part}.json`, import.meta.url), "utf8"));
  const accepted = new Set(review.approvedTerms);
  approved.push(...pack.entries.filter(row => accepted.has(row.term)));
}
const sample = Array.from({ length: 100 }, (_, index) => approved[Math.floor(index * approved.length / 100)]);
if (new Set(sample.map(row => row?.term)).size !== 100) throw Error("Expected 100 distinct approved new example heads.");

test.use({ serviceWorkers: "block" });
test("100 new examples load under their exact headword, selected POS and Chinese sense without external providers", async ({ page }) => {
  test.setTimeout(120_000);
  const external = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (new URL(request.url()).origin !== "http://127.0.0.1:4187") external.push(request.url()); });
  await page.goto("/dictionary.html");
  for (const row of sample) {
    await page.locator("#dictionary-query").fill(row.term);
    await page.locator("#dictionary-query").press("Enter");
    await expect(page.locator("#dictionary-term"), row.term).toHaveText(row.term);
    const sense = page.locator("#dictionary-example-content .example-sense");
    await expect(sense, row.term).toHaveCount(1);
    await expect(sense.locator("summary"), row.term).toContainText(row.partOfSpeech);
    await expect(sense.locator("summary"), row.term).toContainText(row.meaningZh);
    await expect(sense.locator('[lang="en"]'), row.term).toHaveText(row.en);
    await expect(sense.locator('[lang="zh-CN"]'), row.term).toHaveText(row.zh);
  }
  expect(errors).toEqual([]); expect(external).toEqual([]);
});
