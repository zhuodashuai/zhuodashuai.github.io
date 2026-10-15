import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }, info) => {
  const run = `review-races-${info.workerIndex}-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled review-save regression: ${error.message}`); });
});

async function delayReviewRequest(page, method, { failOnRelease = false } = {}) {
  await page.addInitScript(({ method, failOnRelease }) => {
    const original = IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method] = function (...args) {
      const request = original.apply(this, args);
      if (this.name !== "reviewStates" || !window.__delayNextReviewRequest) return request;
      window.__delayNextReviewRequest = false;
      let rejected = false;
      let errorHandler;
      return new Proxy(request, {
        get(target, key) {
          if (key === "error" && rejected) return new DOMException("Delayed old-scope read failed", "UnknownError");
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, key, value) {
          if (key === "onerror") errorHandler = value;
          if (key !== "onsuccess" || typeof value !== "function") return Reflect.set(target, key, value, target);
          target.onsuccess = (event) => {
            window.__reviewRequestHeld = true;
            let released = false;
            window.__releaseReviewRequest = () => {
              if (released) return;
              released = true;
              if (failOnRelease) {
                rejected = true;
                errorHandler?.call(target, new Event("error"));
              } else value.call(target, event);
            };
          };
          return true;
        }
      });
    };
  }, { method, failOnRelease });
}

async function openStudy(page) {
  await page.goto("/?book=never-let-me-go&chapter=chapter-10&e2e=1&testRun=review-save-races");
  await expect(page.locator("#entry-count")).toHaveText("26");
  await page.locator("#study-button").click();
  await page.locator("#recall-reveal").click();
  await expect(page.locator('#dialog-review-actions button[data-rating="good"]')).toBeEnabled();
  return page.locator("#dialog-term").innerText();
}

test("a delayed summary after rating card A cannot overwrite newly opened card C", async ({ page }) => {
  await delayReviewRequest(page, "getAll");
  const first = await openStudy(page);
  await page.evaluate(() => { window.__delayNextReviewRequest = true; });
  await page.locator('#dialog-review-actions button[data-rating="good"]').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__reviewRequestHeld))).toBe(true);
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await page.locator("#entry-grid .card-open").nth(1).click();
  const current = await page.locator("#dialog-term").innerText();
  expect(current).not.toBe(first);
  await expect(page.locator("#dialog-review-status")).toContainText("新词");
  const currentStatus = await page.locator("#dialog-review-status").innerText();
  await page.evaluate(async () => {
    window.__releaseReviewRequest();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page.locator("#dialog-term")).toHaveText(current);
  await expect(page.locator("#dialog-review-status")).toHaveText(currentStatus);
  await expect(page.locator('#dialog-review-actions button[data-rating="good"]')).toBeEnabled();
  const reviews = await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
  expect(reviews).toHaveLength(1); expect(reviews[0].reviewCount).toBe(1);
});

test("automatic PWA activation waits for a pending review save before requesting SKIP_WAITING", async ({ page }) => {
  await delayReviewRequest(page, "get");
  await page.addInitScript(() => {
    const serviceWorker = new EventTarget();
    const registration = new EventTarget();
    const worker = new EventTarget();
    window.__skipWaitingMessages = [];
    worker.state = "installing";
    worker.postMessage = (message) => window.__skipWaitingMessages.push(message);
    registration.waiting = null; registration.installing = worker; registration.update = async () => {};
    serviceWorker.controller = {};
    serviceWorker.register = async () => registration;
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    window.__triggerPwaUpdate = () => {
      registration.dispatchEvent(new Event("updatefound"));
      worker.state = "installed";
      worker.dispatchEvent(new Event("statechange"));
    };
  });
  await openStudy(page);
  await page.evaluate(() => { window.__delayNextReviewRequest = true; });
  await page.locator('#dialog-review-actions button[data-rating="good"]').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__reviewRequestHeld))).toBe(true);
  const whilePending = await page.evaluate(async () => {
    window.__triggerPwaUpdate();
    // Drain the update hook's awaits while keeping the actual score read held.
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
    return window.__skipWaitingMessages;
  });
  expect(whilePending).toEqual([]);
  const before = await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
  expect(before).toEqual([]);
  await page.evaluate(() => window.__releaseReviewRequest());
  await expect.poll(() => page.evaluate(() => window.__skipWaitingMessages.length)).toBe(1);
  const after = await page.evaluate(async () => (await import("/js/owner-storage.js")).listReviewStates());
  expect(after).toHaveLength(1); expect(after[0].reviewCount).toBe(1);
  expect(await page.evaluate(() => window.__skipWaitingMessages)).toEqual([{ type: "SKIP_WAITING" }]);
});

test("a late failed summary from an old chapter cannot disable a newer successful chapter summary", async ({ page }) => {
  await delayReviewRequest(page, "getAll", { failOnRelease: true });
  await page.goto("/?book=never-let-me-go&chapter=chapter-10&e2e=1&testRun=review-summary-race");
  await expect(page.locator("#entry-count")).toHaveText("26");
  await expect(page.locator("#study-summary")).toContainText("0/26");
  await page.evaluate(() => { window.__delayNextReviewRequest = true; });
  await page.locator('#chapter-tabs button[data-value="chapter-11"]').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__reviewRequestHeld))).toBe(true);
  await page.locator('#chapter-tabs button[data-value="chapter-12"]').click();
  await expect(page.locator("#entry-count")).toHaveText("25");
  await expect(page.locator("#study-summary")).toContainText("0/25");
  await expect(page.locator("#due-count")).toHaveText("25");
  const currentSummary = await page.locator("#study-summary").innerText();
  await page.evaluate(async () => {
    window.__releaseReviewRequest();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await expect(page.locator("#study-summary")).toHaveText(currentSummary);
  await expect(page.locator("#due-count")).toHaveText("25");
  await expect(page.locator("#study-button")).toBeEnabled();
});
