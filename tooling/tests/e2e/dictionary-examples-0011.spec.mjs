import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { EVERYDAY_LOOKUP_ENTRIES } from "../../../vocab/js/everyday-lookup-data.js";

const approved = [];
for (const part of "abcdef") {
  const pack = JSON.parse(await readFile(new URL(`../../dictionary/examples/source/batch-0011-${part}.json`, import.meta.url), "utf8"));
  const review = JSON.parse(await readFile(new URL(`../../dictionary/examples/reviews/batch-0011-${part}.json`, import.meta.url), "utf8"));
  const accepted = new Set(review.approvedTerms);
  approved.push(...pack.entries.filter(row => accepted.has(row.term)));
}
const sample = Array.from({ length: 100 }, (_, index) => approved[Math.floor(index * approved.length / 100)]);
if (new Set(sample.map(row => row?.term)).size !== 100) throw Error("Expected 100 distinct approved new example heads.");
// The old batch stays unchanged. This exact later drink sense has a reviewed
// daily display; no other historical row can silently inherit an override.
const unsweetened = EVERYDAY_LOOKUP_ENTRIES.filter(row => row.term === "unsweetened");
expect(unsweetened).toHaveLength(1);
expect(createHash("sha256").update(JSON.stringify(unsweetened[0])).digest("hex"))
  .toBe("ab347e6c0865d1acb3a496a2ebacabece37935b33a5520ab23255bee3f0e7626");
const expectedSample = sample.map(row => row.term === "unsweetened"
  ? { ...unsweetened[0], meaningZh: unsweetened[0].meaning } : row);

test.use({ serviceWorkers: "block" });
test("100 new examples load under their exact headword, selected POS and Chinese sense without external providers", async ({ page }) => {
  test.setTimeout(120_000);
  const external = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (new URL(request.url()).origin !== "http://127.0.0.1:4187") external.push(request.url()); });
  await page.goto("/dictionary.html");
  for (const row of expectedSample) {
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
