import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../../../vocab/data/reading-lists/never-let-me-go/chapter-5.json", import.meta.url), "utf8"));
const selectedTerms = [
  "loom", "pine", "ghastly", "defiant", "keep at bay", "confer furtively",
  "precarious", "allude", "engross", "corner", "snub", "acute", "back down",
  "innocuous", "brood over", "get away with", "bluff", "on the verge of"
];
const originalOrders = [14, 20, 21, 29, 34, 36, 40, 49, 53, 56, 72, 74, 81, 102, 120, 125, 140, 150];
// Independent visible expectations: the authored single-sense marker is removed
// before Chinese semicolons become separate learning points on cards and dialogs.
const displayedMeanings = new Map([
  ["loom", ["隐约耸现，令人感到压迫"]],
  ["pine", ["苦苦盼望、思念"]],
  ["ghastly", ["可怕的、骇人的"]],
  ["defiant", ["不服气的、带有反抗意味的"]],
  ["keep at bay", ["使危险暂时无法逼近"]],
  ["confer furtively", ["悄悄商议", "偷偷交换意见"]],
  ["precarious", ["不稳固的、摇摇欲坠的"]],
  ["allude", ["隐约提及、暗示"]],
  ["engross", ["使全神贯注、完全投入"]],
  ["corner", ["堵住她，使她无法再推脱"]],
  ["snub", ["冷落、怠慢"]],
  ["acute", ["强烈的、尖锐的"]],
  ["back down", ["退让、服软"]],
  ["innocuous", ["无害的", "不会引起不快的"]],
  ["brood over", ["反复烦恼、耿耿于怀"]],
  ["get away with", ["做错事却蒙混过关"]],
  ["bluff", ["虚张声势、假装掌握证据"]],
  ["on the verge of", ["濒于……", "眼看就要……"]]
]);
const loomEntryId = "public-nlmg-c5-loom";

async function reviewStates(page) {
  return page.evaluate(async () => {
    const { listReviewStates } = await import("/js/owner-storage.js");
    return listReviewStates();
  });
}

test("Chapter 5 shows exactly the 18 selected rows in original reading order and their own source contexts", async ({ page }) => {
  test.setTimeout(60_000);
  expect(source.expectedItemCount).toBe(18);
  expect(source.items.map(item => item.term)).toEqual(selectedTerms);
  expect(source.items.map(item => item.order)).toEqual(originalOrders);
  await page.goto("/?book=never-let-me-go&chapter=chapter-5");
  await expect(page.getByRole("heading", { name: "Never Let Me Go · Chapter 5", exact: true })).toBeVisible();
  await expect(page.locator("#entry-count")).toHaveText("18");
  await expect(page.locator("#entry-grid .word-card h3")).toHaveText(selectedTerms);
  await expect(page.locator('#chapter-tabs button[data-value^="chapter-"] small')).toHaveText(["29", "38", "28", "51", "18"]);
  for (const term of selectedTerms) {
    const item = source.items.find(item => item.term === term);
    await page.locator("#library-search").fill(item.originalInput);
    const card = page.locator(".word-card").filter({ has: page.getByRole("heading", { name: term, exact: true }) });
    await expect(card).toHaveCount(1);
    const learningPoints = [...displayedMeanings.get(term), item.usage];
    await expect(card.locator(".card-meaning li")).toHaveText(learningPoints);
    await card.getByRole("button", { name: `查看 ${term} 的完整词条` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#dialog-term")).toHaveText(term);
    if (item.originalInput !== term) {
      await expect(dialog.locator(".detail-original-form p")).toHaveText(item.originalInput);
    }
    await expect(dialog.locator("#dialog-source-status")).toContainText("Never Let Me Go — Chapter 5");
    await expect(dialog.locator("#dialog-source-status")).toContainText(`p. ${item.page}`);
    await expect(dialog.locator("#dialog-source-status")).toContainText("例句为学习用自拟句，不是小说原文");
    await expect(dialog.locator("#dialog-meaning li")).toHaveText(learningPoints);
    await expect(dialog.locator("#dialog-definition")).toHaveText(item.definitionEn);
    await expect(dialog.locator("#dialog-example-en")).toHaveText(item.exampleEn);
    await expect(dialog.locator("#dialog-example-zh")).toHaveText(item.exampleZh);
    await dialog.getByRole("button", { name: "关闭词条详情" }).click();
  }
  await page.goto("/");
  await expect(page.locator("#entry-count")).toHaveText("169");
});

test("Chapter 5 review persists under the retained entry ID on mobile without changing the previous chapters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?book=never-let-me-go&chapter=chapter-5");
  await expect(page.locator("#due-count")).toHaveText("18");
  expect(await reviewStates(page)).toEqual([]);
  await page.locator("#study-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#dialog-term")).toHaveText("loom");
  await expect(dialog.locator("#dialog-review-status")).toContainText("本轮 1/18");
  await dialog.getByRole("button", { name: "很熟" }).click();
  await expect(dialog.locator("#dialog-term")).toHaveText("pine");
  await expect(page.locator("#due-count")).toHaveText("17");
  const storedReviews = await reviewStates(page);
  expect(storedReviews).toHaveLength(1);
  expect(storedReviews[0]).toMatchObject({ entryId: loomEntryId, reviewCount: 1, lastRating: "easy" });
  await dialog.getByRole("button", { name: "关闭词条详情" }).click();
  await page.reload();
  await expect(page.locator("#entry-count")).toHaveText("18");
  await expect(page.locator("#due-count")).toHaveText("17");
  expect(await reviewStates(page)).toEqual(storedReviews);
  for (const [chapter, count] of [[1,29],[2,38],[3,28],[4,51]]) {
    await page.locator(`#chapter-tabs button[data-value="chapter-${chapter}"]`).click();
    await expect(page.locator("#entry-count")).toHaveText(String(count));
    await expect(page.locator("#due-count")).toHaveText(String(count));
  }
  await page.locator('#chapter-tabs button[data-value="chapter-5"]').click();
  await expect(page.locator("#due-count")).toHaveText("17");
  await page.locator("#study-button").click();
  await expect(dialog.locator("#dialog-term")).toHaveText("pine");
  expect(await reviewStates(page)).toEqual(storedReviews);
});
