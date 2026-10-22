import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../../../vocab/sw.js", import.meta.url), "utf8");
const shellDeclaration = workerSource.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/u)?.[1];
if (!shellDeclaration) throw new Error("Module upgrade fixture could not find the service worker SHELL.");

// A cache namespace is not a module graph version: independent modules can
// legitimately keep their previous URL when their content has not changed.
// Read only explicit versioned JS literals; never execute the service worker.
const declaredModuleVersions = new Map(),cachedModuleVersions=new Map();
const reviewedAliases=new Map([
  ['expanded-dictionary.js',['97','103']],['dictionary-app.js',['99','103']],
  ['library-lookup-controller.js',['99','103']],['library-lookup-ui.js',['100','103']],
  ['public-app.js',['101','103']],['personal-app.js',['100','103']],
  ['owner-app.js',['97','103']],['dictionary-entry.js',['102','103']]
]);
for (const match of shellDeclaration.matchAll(/["'](\.\/js\/[^"']+\.js\?v=\d+)["']/gu)) {
  const url = new URL(match[1], "http://127.0.0.1:4187/");
  const name = url.pathname.split("/").at(-1);
  const version = url.searchParams.get("v");
  const versions=cachedModuleVersions.get(name)||new Set();versions.add(version);cachedModuleVersions.set(name,versions);
}
for(const[name,versions]of cachedModuleVersions){
  if(reviewedAliases.has(name)){
    expect([...versions].sort((a,b)=>Number(a)-Number(b))).toEqual(reviewedAliases.get(name));
    // Only the active graph uses v103. Old cache aliases stay available to
    // offline/previous clients; their presence must not exempt a stale import.
    declaredModuleVersions.set(name,'103');
  }else{
    if(versions.size!==1)throw new Error(`Module upgrade fixture found conflicting SHELL versions for ${name}.`);
    declaredModuleVersions.set(name,[...versions][0]);
  }
}
for(const name of reviewedAliases.keys())if(!declaredModuleVersions.has(name))throw new Error(`Missing reviewed module ${name}.`);

test.use({ serviceWorkers: "block" });

const changedApiModules = new Set([
  ...reviewedAliases.keys(),
  "runtime-config.js", "personal-api.js", "personal-storage.js", "personal-selection.js", "personal-study.js", "personal-dictionary.js", "member-dictionary-manifest.js", "core-dictionary.js", "book-passages.js", "book-passages-ui.js",
  "owner-api.js", "owner-storage.js", "entry-detail.js", "synonym-evidence.js",
  "chapter-quiz.js", "chapter-quiz-ui.js", "quiz-storage.js",
  "wordbook-schema.js", "collections.js", "owner-backup.js", "sync-logic.js"
]);
for (const name of changedApiModules) {
  if (!declaredModuleVersions.has(name)) throw new Error(`Module upgrade fixture needs an explicit SHELL version for ${name}.`);
}

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
    const name = url.pathname.split("/").at(-1);
    if (changedApiModules.has(name) && url.searchParams.get("v") !== declaredModuleVersions.get(name)) {
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

test("private selection and learning boot with the versioned graph and the existing GitHub owner login", async ({ page }) => {
  const diagnostic = await poisonOldModuleUrls(page);
  await page.goto("/personal.html?auth=owner");
  await expect(page.locator("#member-username")).toHaveText("@zhuodashuai");
  await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", false);
  await page.locator("#member-private-tools > summary").click();
  await expect(page.locator("#member-private-tools")).toHaveJSProperty("open", true);
  await page.locator("#member-source-toggle").click();
  await expect(page.locator("#member-source-book option[value='never-let-me-go']")).toHaveCount(1);
  await page.locator("#member-source-book").selectOption("never-let-me-go");
  await page.locator("#member-source-chapter").selectOption("chapter-1");
  await expect(page.locator("#member-source-list .source-select")).toHaveCount(29);
  expect(diagnostic.consumedOldUrls).toEqual([]);
  expect(diagnostic.errors).toEqual([]);
});

test("direct dictionary boot rejects stale lookup modules despite retained legacy offline cache aliases",async({page})=>{
  const diagnostic=await poisonOldModuleUrls(page);
  await page.goto('/dictionary.html#q=happy');await expect(page.locator('#dictionary-term')).toHaveText('happy');
  await expect(page.locator('#dictionary-example-content summary')).toHaveCount(2);
  await expect(page.locator('#dictionary-example-content summary').first()).toBeVisible();
  expect(diagnostic.consumedOldUrls).toEqual([]);expect(diagnostic.errors).toEqual([]);
});
