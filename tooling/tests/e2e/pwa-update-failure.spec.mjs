import { expect, test } from "@playwright/test";

test("a failed public auto-update exposes a mobile retry without covering chapter practice or blocking cards", async ({ context, page }, info) => {
  const run = `pwa-failure-${info.workerIndex}-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled PWA failure regression: ${error.message}`); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const serviceWorker = new EventTarget();
    const registration = new EventTarget();
    window.__pwaActivationAttempts = 0;
    registration.waiting = {
      postMessage() {
        window.__pwaActivationAttempts += 1;
        throw new DOMException("The waiting worker could not be activated", "InvalidStateError");
      }
    };
    registration.installing = null;
    registration.update = async () => {};
    serviceWorker.controller = {};
    serviceWorker.register = async () => registration;
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  });

  await page.goto("/?book=never-let-me-go&chapter=chapter-12");
  await expect(page.locator("#entry-count")).toHaveText("25");
  const banner = page.locator("#update-banner");
  const retry = page.locator("#apply-update");
  const practice = page.locator("#chapter-quiz-button");
  await expect(banner).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(retry).toContainText("点击重试");
  await expect(practice).toBeVisible();
  await expect(practice).toBeEnabled();

  const bannerBox = await banner.boundingBox();
  const practiceBox = await practice.boundingBox();
  expect(bannerBox).not.toBeNull();
  expect(practiceBox).not.toBeNull();
  expect(bannerBox.x).toBeGreaterThanOrEqual(0);
  expect(bannerBox.x + bannerBox.width).toBeLessThanOrEqual(390);
  expect(bannerBox.y).toBeGreaterThanOrEqual(0);
  expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(practiceBox.y - 8);
  expect(practiceBox.y + practiceBox.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await retry.click();
  await expect.poll(() => page.evaluate(() => window.__pwaActivationAttempts)).toBe(2);
  await expect(banner).toBeVisible();
  await expect(retry).toBeEnabled();

  await practice.click();
  await expect(page.locator("#chapter-quiz-dialog")).toBeVisible();
  await expect(page.locator("#quiz-start")).toBeEnabled();
  await page.locator("#quiz-close").click();
  await page.locator("#library-search").fill("awestruck");
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(1);
  await page.getByRole("button", { name: "查看 awestruck 的完整词条", exact: true }).click();
  await expect(page.locator("#dialog-term")).toHaveText("awestruck");
  await expect(page.locator("#dialog-meaning")).toBeVisible();
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await expect(banner).toBeVisible();
});
