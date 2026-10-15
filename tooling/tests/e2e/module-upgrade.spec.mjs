import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const changedApiModules = new Set([
  "owner-api.js", "owner-storage.js", "entry-detail.js", "synonym-evidence.js",
  "chapter-quiz.js", "chapter-quiz-ui.js", "quiz-storage.js"
]);

test.beforeEach(async ({ context, page }, info) => {
  const run = `upgrade-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([
    { name: "e2e_run", value: run, url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
});

async function poisonOldModuleUrls(page) {
  const consumedOldUrls = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Simulate still-fresh pre-upgrade responses at the old, unversioned URLs.
  // This is a module-graph regression, not a claim to emulate HTTP caching.
  await page.route("**/js/*.js*", async (route) => {
    const url = new URL(route.request().url());
    if (changedApiModules.has(url.pathname.split("/").at(-1)) && url.searchParams.get("v") !== "67") {
      consumedOldUrls.push(url.pathname);
      await route.fulfill({ contentType: "text/javascript", body: 'export const oldModuleVersion = "v66";' });
    } else await route.continue();
  });
  return { consumedOldUrls, errors };
}

test("new public study, backup and quiz boot without consuming stale unversioned API modules", async ({ page }) => {
  const diagnostic = await poisonOldModuleUrls(page);
  await page.goto("/?book=never-let-me-go&chapter=chapter-12");
  await expect(page.locator("#entry-count")).toHaveText("25");
  await expect(page.locator("#learning-backup-export")).toHaveCount(1);
  await page.locator("#study-button").click();
  await expect(page.locator("#recall-reveal")).toBeVisible();
  await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
  await page.locator("#chapter-quiz-button").click();
  await expect(page.locator("#chapter-quiz-dialog")).toBeVisible();
  expect(diagnostic.consumedOldUrls).toEqual([]);
  expect(diagnostic.errors).toEqual([]);
});

test("new owner boot does not import pre-upgrade storage, transport or fingerprint modules", async ({ page }) => {
  const diagnostic = await poisonOldModuleUrls(page);
  await page.goto("/owner.html?input=hip");
  await expect(page.locator("#owner-identity-text")).toHaveText("@zhuodashuai");
  await expect(page.locator("#capture-input")).toHaveValue("hip");
  await expect(page.locator("#organize-button")).toBeEnabled();
  expect(diagnostic.consumedOldUrls).toEqual([]);
  expect(diagnostic.errors).toEqual([]);
});
