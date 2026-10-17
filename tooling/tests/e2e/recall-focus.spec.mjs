import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }, info) => {
  const run = `recall-focus-${info.workerIndex}-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled recall-focus error: ${error.message}`); });
  await page.goto(`/?book=never-let-me-go&chapter=chapter-12&e2e=1&testRun=${run.slice(0, 32)}`);
  await expect(page.locator("#entry-count")).toHaveText("25");
  await expect(page.locator("#study-button")).toBeEnabled();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`keyboard recall hands focus to the visible answer and then permits scoring at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.locator("#study-button").click();
    await expect(page.locator("#entry-dialog")).toBeVisible();
    await expect(page.locator("#dialog-term")).toHaveText("hiccup");
    await expect(page.locator("#dialog-meaning")).toBeHidden();
    await expect(page.locator('#dialog-review-actions button[data-rating="again"]')).toBeDisabled();

    await page.locator("#recall-reveal").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#dialog-meaning")).toBeVisible();
    await expect(page.locator("#dialog-meaning")).toBeFocused();
    await expect(page.locator("#recall-controls")).toBeHidden();
    await expect(page.locator('#dialog-review-actions button[data-rating="again"]')).toBeEnabled();
    expect(await page.locator("#dialog-meaning").evaluate((node) => node.getClientRects().length)).toBeGreaterThan(0);

    // This fixture has no intervening source/synonym links. Tab should follow
    // the answer into scoring, not restart at the modal's close/audio buttons.
    await page.keyboard.press("Tab");
    await expect(page.locator('#dialog-review-actions button[data-rating="again"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#dialog-term")).not.toHaveText("hiccup");
    await expect(page.locator("#dialog-term")).toBeFocused();
    await expect(page.locator("#dialog-meaning")).toBeHidden();
    await expect(page.locator('#dialog-review-actions button[data-rating="again"]')).toBeDisabled();
    const reviews = await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
    expect(reviews).toHaveLength(1);
    expect(reviews[0].reviewCount).toBe(1);
    expect(reviews[0].lastRating).toBe("again");
  });
}

test("ordinary card browsing does not inherit the answer's reveal focus", async ({ page }) => {
  await page.locator("#study-button").click();
  await expect(page.locator("#entry-dialog")).toBeVisible();
  await page.locator("#recall-reveal").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#dialog-meaning")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#study-button")).toBeFocused();

  const opener = page.getByRole("button", { name: "查看 hiccup 的完整词条", exact: true });
  await opener.click();
  await expect(page.locator("#dialog-meaning")).toBeVisible();
  await expect(page.locator("#recall-controls")).toBeHidden();
  await expect(page.locator("#dialog-meaning")).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  expect(await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates())).toEqual([]);
});
