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
  ['expanded-dictionary.js',['97','103','104','111','112','114','115','116','117','118']],['dictionary-app.js',['99','103','104','111','112','114','115','116','117','118']],
  ['library-lookup-controller.js',['99','103','104','111','112','114','115','116','117','118']],['library-lookup-ui.js',['100','103','104','111','112','114','115','116','117','118','123']],
  ['public-app.js',['101','103','104']],['personal-app.js',['100','103','104','105','107']],
  ['owner-app.js',['97','103','104']],['dictionary-entry.js',['102','103','104']],
  ['app-navigation.js',['105','107']],['app-navigation-entry.js',['105','106','107']],
  ['personal-lookup-flow.js',['97','111','112','114','115','116','117','118']],['dictionary-suggestions.js',['89','114','115','116','117','118']],
  ['everyday-lookup.js',['111','112','114','115','116','117','118']],
  ['everyday-lookup-data.js',['114','115','116','117','118']],['reviewed-senses-data.js',['114','115','116','117','118']],
  ['dictionary-app-v109.js',['114','115','116','117','118']],['dictionary-entry-v109.js',['114','115','116','117','118']],
  ['owner-app-v108.js',['114','115','116','117','118','122']],['personal-app-v108.js',['114','115','116','117','118','119','123','124']],
  ['owner-public-library.js',['99','124']],
  ['english-surface-variants.js',['115','116','117','118']],['search-experience-data.js',['115','116','117','118']],
  ['selected-common-sense.js',['115','116','117','118']],['selected-legacy-examples.js',['115','116','117','118']],
  ['dictionary-examples-current-v4.js',['115','116','117','118']],['dictionary-examples-ui-v108.js',['115','116','117','118']],
  ['entry-detail-v113.js',['115','116','117','118','122']],['entry-detail-v108.js',['115','116','117','118','122']],
  ['dictionary-form-evidence.js',['114','117','118']],['reviewed-canonical-forms.js',['117','118']],
  ['chinese-query-cache.js',['116','117','118']],['chinese-query-cache-release.js',['116','117','118']],
  ['chinese-query-cache-format.js',['116','117','118']],['dictionary-offline-warm-v108.js',['116','117','118']],
  ['personal-spelling.js',['119']],
  ['english-laundry-phrase-evidence.js',['118']],
  ['chapter-quiz-ui.js',['82','113']],['collections.js',['82','113']]
]);
// Reviewed retained cache aliases and the active import graph are independent.
// Do not derive an active version from the largest (or any other) cache alias.
const reviewedActiveVersions=new Map([
  ['expanded-dictionary.js','118'],['dictionary-app.js','118'],
  ['library-lookup-controller.js','118'],['library-lookup-ui.js','123'],
  ['public-app.js','104'],['personal-app.js','107'],
  ['owner-app.js','104'],['dictionary-entry.js','104'],
  ['app-navigation.js','107'],['app-navigation-entry.js','107'],
  ['personal-lookup-flow.js','118'],['dictionary-suggestions.js','118'],
  ['everyday-lookup.js','118'],
  ['everyday-lookup-data.js','118'],['reviewed-senses-data.js','118'],
  ['dictionary-app-v109.js','118'],['dictionary-entry-v109.js','118'],
  ['owner-app-v108.js','122'],['personal-app-v108.js','124'],['owner-public-library.js','124'],
  ['english-surface-variants.js','118'],['search-experience-data.js','118'],
  ['selected-common-sense.js','118'],['selected-legacy-examples.js','118'],
  ['dictionary-examples-current-v4.js','118'],['dictionary-examples-ui-v108.js','118'],
  ['entry-detail-v113.js','122'],['entry-detail-v108.js','122'],
  ['dictionary-form-evidence.js','118'],['reviewed-canonical-forms.js','118'],
  ['chinese-query-cache.js','118'],['chinese-query-cache-release.js','118'],
  ['chinese-query-cache-format.js','118'],['dictionary-offline-warm-v108.js','118'],
  ['personal-spelling.js','119'],
  ['english-laundry-phrase-evidence.js','118'],
  ['chapter-quiz-ui.js','113'],['collections.js','113']
]);
// These additive APIs have compatible callers at95 or bare URLs. Account for
// their exact cache aliases without adding them to changedApiModules/poisoning.
const reviewedCompatibleCacheAliases=new Map([
  ['chinese-search.js',['95','111','112','114','116','117','118']],
  ['chinese-ranking.js',['111','112','114','116','117','118']],['public-app-v113.js',['114','115','116','117','118','119','120','121','122','123','124']],
  ['public-snapshot.js',['82','114','116','117','118']]
]);
expect([...reviewedActiveVersions.keys()].sort()).toEqual([...reviewedAliases.keys()].sort());
for (const match of shellDeclaration.matchAll(/["'](\.\/js\/[^"']+\.js\?v=\d+)["']/gu)) {
  const url = new URL(match[1], "http://127.0.0.1:4187/");
  const name = url.pathname.split("/").at(-1);
  const version = url.searchParams.get("v");
  const versions=cachedModuleVersions.get(name)||new Set();versions.add(version);cachedModuleVersions.set(name,versions);
}
for(const[name,versions]of cachedModuleVersions){
  if(reviewedCompatibleCacheAliases.has(name)){
    expect([...versions].sort((a,b)=>Number(a)-Number(b))).toEqual(reviewedCompatibleCacheAliases.get(name));
  }else if(reviewedAliases.has(name)){
    expect([...versions].sort((a,b)=>Number(a)-Number(b))).toEqual(reviewedAliases.get(name));
    // Old cache aliases stay available to offline/previous clients; their
    // presence never exempts a stale import from the poison handler below.
    const active=reviewedActiveVersions.get(name);
    expect(versions.has(active)).toBe(true);
    declaredModuleVersions.set(name,active);
  }else{
    if(versions.size!==1)throw new Error(`Module upgrade fixture found conflicting SHELL versions for ${name}.`);
    declaredModuleVersions.set(name,[...versions][0]);
  }
}
for(const name of reviewedAliases.keys())if(!declaredModuleVersions.has(name))throw new Error(`Missing reviewed module ${name}.`);
for(const name of reviewedCompatibleCacheAliases.keys())expect(cachedModuleVersions.has(name)).toBe(true);

// Current ranking/catalogue readers use118 and plan-only consumers retain95.
// The prior115 URLs remain cache aliases; archived callers retain only the exact edges
// below. Never infer a compatible API or current version from max(v).
for(const[file,edges]of[
  ['dictionary-app-v109.js',[['chinese-search.js','./chinese-search.js?v=95']]],
  ['dictionary-app.js',[['chinese-search.js','./chinese-search.js?v=95']]],
  ['dictionary-app-v108.js',[['chinese-search.js','./chinese-search.js?v=95']]],
  ['personal-app.js',[['chinese-search.js','./chinese-search.js?v=95'],['personal-lookup-flow.js','./personal-lookup-flow.js?v=118',2],['personal-spelling.js','./personal-spelling.js?v=119']]],
  ['personal-app-v108.js',[['chinese-search.js','./chinese-search.js?v=95'],['personal-lookup-flow.js','./personal-lookup-flow.js?v=118',2],['personal-spelling.js','./personal-spelling.js?v=119']]],
  ['personal-dictionary.js',[['chinese-search.js','./chinese-search.js?v=95']]],
  ['expanded-dictionary.js',[['chinese-search.js','./chinese-search.js?v=118'],['everyday-lookup.js','./everyday-lookup.js?v=118'],['english-surface-variants.js','./english-surface-variants.js?v=118'],['selected-common-sense.js','./selected-common-sense.js?v=118'],['dictionary-form-evidence.js','./dictionary-form-evidence.js?v=118'],['reviewed-canonical-forms.js','./reviewed-canonical-forms.js?v=118'],['english-laundry-phrase-evidence.js','./english-laundry-phrase-evidence.js?v=118']]],
  ['personal-spelling.js',[['dictionary-query-normalization.js','./dictionary-query-normalization.js?v=114']]],
  ['english-laundry-phrase-evidence.js',[['search-experience-data.js','./search-experience-data.js?v=118']]],
  ['dictionary-entry-v109.js',[['dictionary-offline-warm-v108.js','./dictionary-offline-warm-v108.js?v=118']]],
  ['chinese-query-cache.js',[['chinese-query-cache-release.js','./chinese-query-cache-release.js?v=118'],['chinese-query-cache-format.js','./chinese-query-cache-format.js?v=118']]],
  ['reviewed-canonical-forms.js',[['reviewed-senses-data.js','./reviewed-senses-data.js?v=118']]],
  ['chinese-ranking.js',[['chinese-search.js','./chinese-search.js?v=118']]],
  ['personal-lookup-flow.js',[['chinese-search.js','./chinese-search.js?v=118'],['everyday-lookup.js','./everyday-lookup.js?v=118']]],
  ['dictionary-examples-current-v4.js',[['everyday-lookup.js','./everyday-lookup.js?v=118'],['selected-common-sense.js','./selected-common-sense.js?v=118'],['selected-legacy-examples.js','./selected-legacy-examples.js?v=118']]],
  ['public-app-v113.js',[['chapter-quiz-ui.js','./chapter-quiz-ui.js?v=113'],['collections.js','./collections.js?v=113'],['public-snapshot.js','./public-snapshot.js?v=118'],['entry-detail-v113.js','./entry-detail-v113.js?v=122'],['library-lookup-ui.js','./library-lookup-ui.js?v=123']]],
  ['public-app-v108.js',[['chapter-quiz-ui.js','./chapter-quiz-ui.js?v=82'],['collections.js','./collections.js?v=82'],['library-lookup-ui.js','./library-lookup-ui.js?v=114'],['entry-detail-v108.js','./entry-detail-v108.js']]],
  ['dictionary-entry.js',[['dictionary-app.js','./dictionary-app.js?v=104']]],
  ['dictionary-app-v108.js',[['expanded-dictionary.js','./expanded-dictionary.js?v=104']]],
  ['owner-app-v108.js',[['collections.js','./collections.js?v=82'],['entry-detail-v108.js','./entry-detail-v108.js?v=122']]]
]){
  const source=await readFile(new URL('../../../vocab/js/'+file,import.meta.url),'utf8');
  const imports=[...source.matchAll(/\b(?:from\s+|import\s*)["'](\.\/[^"']+)["']/gu)].map(match=>match[1]);
  for(const[target,expected,count=1]of edges)expect(imports.filter(specifier=>specifier.slice(2).split('?')[0]===target),file+' -> '+target).toEqual(Array(count).fill(expected));
}

// Exact current filter consumers must use124; the inline navigation function
// and archived reader retain their99 API. A finite compatibility edge does
// not let current filter callers silently keep a stale implementation.
for(const[file,expected]of [['public-app.js','124'],['public-app-v113.js','124'],['personal-app.js','124'],['personal-app-v108.js','124'],['library-lookup-ui.js','99'],['public-app-v108.js','99']]){
 const source=await readFile(new URL('../../../vocab/js/'+file,import.meta.url),'utf8');
 const imports=[...source.matchAll(/\bfrom\s+["'](\.\/owner-public-library\.js[^"']*)["']/gu)].map(match=>match[1]);
 expect(imports,file+' public library edge').toEqual(['./owner-public-library.js?v='+expected]);
}

test.use({ serviceWorkers: "block" });

const changedApiModules = new Set([
  ...reviewedAliases.keys(),
  'chinese-query-cache.js','chinese-query-cache-release.js','chinese-query-cache-format.js','dictionary-offline-warm-v108.js',
  'english-surface-variants.js','search-experience-data.js','selected-common-sense.js','selected-legacy-examples.js',
  'dictionary-examples-current-v4.js','dictionary-examples-ui-v108.js','entry-detail-v113.js','entry-detail-v108.js',
  "runtime-config.js", "personal-api.js", "personal-storage.js", "personal-selection.js", "personal-study.js", "personal-dictionary.js", "member-dictionary-manifest.js", "core-dictionary.js", "book-passages.js", "book-passages-ui.js",
  "owner-api.js", "owner-storage.js", "entry-detail.js", "synonym-evidence.js",
  "chapter-quiz.js", "chapter-quiz-ui.js", "quiz-storage.js",
  "wordbook-schema.js", "collections.js", "owner-backup.js", "sync-logic.js",
  "saved-card-search.js"
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
    // The current public reading policy uses113; retained reading programs and
    // owner collection writes use the compatible82 API. Exact caller edges
    // above pin those decisions.
    // Both remain poisoned at bare or any other non-reviewed URL.
    const compatible = ["chapter-quiz-ui.js", "collections.js"].includes(name) ? ["82", "113"]
      : name === "owner-public-library.js" ? ["99", "124"] : [declaredModuleVersions.get(name)];
    if (changedApiModules.has(name) && !compatible.includes(url.searchParams.get("v"))) {
      consumedOldUrls.push(url.pathname);
      await route.fulfill({ contentType: "text/javascript", body: 'export const oldModuleVersion = "v66";' });
    } else await route.continue();
  });
  return { consumedOldUrls, errors };
}

test("new public study, backup and quiz boot without consuming stale unversioned API modules", async ({ page }) => {
  const diagnostic = await poisonOldModuleUrls(page);
  await page.goto("/?book=never-let-me-go&chapter=chapter-12");
  // Two previously learned words are hidden by the existing reading policy,
  // but remain available when the user chooses to show repeated cards.
  await expect(page.locator("#entry-count")).toHaveText("23");
  await page.locator("#show-repeated-reading-cards").check();
  await expect(page.locator("#entry-count")).toHaveText("25");
  await page.locator("#show-repeated-reading-cards").uncheck();
  await expect(page.locator("#entry-count")).toHaveText("23");
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
