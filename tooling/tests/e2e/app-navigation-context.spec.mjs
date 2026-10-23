import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });
const fields = { book: "never-let-me-go", chapter: "chapter-1", view: "cards", sort: "source" };
const fragment = new URLSearchParams([...Object.entries(fields).map(([key, value]) => [`wb_${key}`, value]), ["wb_site", "local"]]).toString();
const nav = page => page.getByRole("navigation", { name: "主要导航", exact: true });

function recordWrites(page) {
  const writes = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); });
  return writes;
}

async function expectPublicScope(page, scope) {
  const url = new URL(page.url());
  for (const [key, value] of Object.entries(scope)) {
    // public-app canonicalizes its default cards view by omitting the parameter.
    expect(url.searchParams.get(key) ?? (key === "view" ? "cards" : null), key).toBe(value);
  }
  expect(url.hash).toBe("");
  for (const key of ["auth", "entry", "query", "q", "lookup"]) expect(url.searchParams.has(key), key).toBe(false);
  await expect(page.locator("#book-select")).toHaveValue(scope.book);
  await expect(page.locator("#chapter-select")).toHaveValue(scope.chapter);
  await expect(page.locator("#library-sort")).toHaveValue(scope.sort);
  await expect(page.locator(`[data-view="${scope.view}"]`)).toHaveAttribute("aria-pressed", "true");
}

for (const width of [390, 1440]) {
  test(`live chapter/view/sort survives personal return without Back at ${width}px`, async ({ page }) => {
    const writes = recordWrites(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?${new URLSearchParams(fields)}`);
    await expect(page.locator("#chapter-select")).toHaveValue("chapter-1");
    // These controls replaceState, rather than initiating another navigation.
    if (width < 720) await page.locator("#chapter-select").selectOption("chapter-2");
    else await page.locator('#chapter-tabs button[data-value="chapter-2"]').click();
    await page.locator("#library-sort").selectOption("za");
    await page.locator('[data-view="passages"]').click();
    await nav(page).getByRole("link", { name: "我的词本", exact: true }).click();
    await expect(page.locator("#member-auth")).toBeVisible();
    const transit = new URL(page.url());
    const scope = { ...fields, chapter: "chapter-2", view: "passages", sort: "za" };
    expect(Object.fromEntries(new URLSearchParams(transit.hash.slice(1)))).toEqual({ ...Object.fromEntries(Object.entries(scope).map(([key, value]) => [`wb_${key}`, value])), wb_site: "local" });
    await expect(nav(page).locator("a")).toHaveText(["公开词本", "查词", "随手记", "我的词本"]);
    await nav(page).getByRole("link", { name: "公开词本", exact: true }).click();
    await expectPublicScope(page, scope);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const clearance = await page.evaluate(() => ({ actual: document.querySelector(".app-header").getBoundingClientRect().height,
      css: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-header-clearance")) }));
    expect(clearance.css).toBe(Math.ceil(clearance.actual) + 12);
    expect(writes).toEqual([]);
  });
}

test("footer guide and its explicit return preserve public scope; inline lookup stays in-page", async ({ page }) => {
  const writes = recordWrites(page);
  await page.goto(`/?${new URLSearchParams(fields)}`);
  await expect(nav(page).getByRole("link", { name: "我的词本", exact: true })).toHaveAttribute("href", /wb_book=never-let-me-go/u);
  await expect(page.locator("#dictionary-link")).toHaveAttribute("href", "#library-lookup");
  await page.locator("#dictionary-link").click();
  await expect(page.locator("#lookup-input")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("chapter")).toBe("chapter-1");
  await page.locator(".app-footer").getByRole("link", { name: "使用手册", exact: true }).click();
  await expect(page.getByRole("heading", { name: "使用手册", exact: true })).toBeVisible();
  await page.locator(".guide-footer-nav").getByRole("link", { name: "回到词库", exact: true }).click();
  await expectPublicScope(page, fields);
  expect(writes).toEqual([]);
});

test("dictionary new q, reload and keyboard public-return retain only namespaced public query scope", async ({ page }) => {
  const writes = recordWrites(page);
  await page.goto(`/dictionary.html?${fragment}&auth=not-copied&entry=not-copied&book=not-copied#q=harbor`);
  await expect(page.locator("#dictionary-query")).toHaveValue("harbor");
  await page.locator("#dictionary-query").fill("river");
  await expect(page.locator('#dictionary-form button[type="submit"]')).toBeEnabled();
  await page.locator("#dictionary-query").press("Enter");
  await expect(page).toHaveURL(/#q=river$/u);
  expect(new URL(page.url()).searchParams.get("wb_chapter")).toBe("chapter-1");
  await page.reload();
  await expect(page.locator("#dictionary-query")).toHaveValue("river");
  await expect(page.locator("#dictionary-term")).toHaveText("river");
  const returnLink = nav(page).getByRole("link", { name: "公开词本", exact: true });
  await returnLink.focus();
  await expect(returnLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url => url.pathname === "/");
  await expectPublicScope(page, fields);
  expect(new URL(page.url()).hash.includes("river")).toBe(false);
  expect(writes).toEqual([]);
});

test("personal auth-mode Enter preserves existing lookup, not private search or commands", async ({ page }) => {
  const writes = recordWrites(page);
  await page.goto(`/personal?auth=owner&book=private-folder&chapter=private&entry=private&query=private#lookup=river&${fragment}&wb_auth=owner`);
  const authLink = page.locator("#member-standard-login-link");
  await expect(authLink).toBeVisible();
  await expect(authLink).toHaveAttribute("href", /wb_chapter=chapter-1/u);
  const target = new URL(await authLink.getAttribute("href"), page.url());
  expect(target.searchParams.get("auth")).toBe("member");
  expect([...target.searchParams.keys()]).toEqual(["auth"]);
  expect(new URLSearchParams(target.hash.slice(1)).get("lookup")).toBe("river");
  expect(new URLSearchParams(target.hash.slice(1)).has("wb_auth")).toBe(false);
  await authLink.focus();
  await expect(authLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/auth=member/u);
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("lookup")).toBe("river");
  await expect(page.locator("#member-dictionary-search")).toBeDisabled();
  await nav(page).getByRole("link", { name: "公开词本", exact: true }).click();
  await expectPublicScope(page, fields);
  expect(writes).toEqual([]);
});

test("unsafe and unrelated destinations remain untouched; fixed notes/auth origins are not retargeted", async ({ page }) => {
  const writes = recordWrites(page);
  await page.goto(`/personal.html#${fragment}`);
  const notes = nav(page).getByRole("link", { name: "随手记", exact: true });
  await expect(notes).toHaveAttribute("href", /wb_book=/u);
  expect(new URL(await notes.getAttribute("href")).origin).toBe("https://zhuodashuai.github.io");
  const results = await page.evaluate(async () => {
    const footer = document.querySelector(".app-footer");
    const values = ["javascript:alert(1)", "//evil.test/", "https://evil.test/personal.html", "/api/v1/member/entries", "quality/", "https://zhuodashuai.github.io/"];
    const links = values.map(href => { const link = document.createElement("a"); link.setAttribute("href", href); footer.append(link); return link; });
    const module = await import("/js/app-navigation-entry.js?v=107");
    module.setupAppNavigation().refresh();
    const result = links.map(link => link.getAttribute("href")); links.forEach(link => link.remove()); return { values, result };
  });
  expect(results.result).toEqual(results.values);
  expect(writes).toEqual([]);
});

test("no-context guide/lookup hrefs keep their original fallback syntax", async ({ page }) => {
  await page.goto("/dictionary.html#q=Tajik");
  await expect(page.locator(".app-footer").getByRole("link", { name: "使用手册", exact: true })).toHaveAttribute("href", "guide.html");
  await expect(nav(page).getByRole("link", { name: "公开词本", exact: true })).toHaveAttribute("href", "./");
});

test("ordinary header returns public chapter before delayed personal imports or DOMContentLoaded", async ({ page }) => {
  const writes = recordWrites(page);
  let releaseImport;
  let importRequested;
  const importGate = new Promise(resolve => { releaseImport = resolve; });
  const requested = new Promise(resolve => { importRequested = resolve; });
  const pattern = "**/js/personal-storage.js*";
  const delayImport = async route => {
    importRequested();
    await importGate;
    await route.continue();
  };
  await page.addInitScript(() => {
    globalThis.__navigationDclFired = false;
    document.addEventListener("DOMContentLoaded", () => { globalThis.__navigationDclFired = true; }, { once: true });
  });
  await page.route(pattern, delayImport);
  try {
    await page.goto(`/personal.html?auth=member#lookup=river&${fragment}`, { waitUntil: "commit" });
    await requested;
    const primary = nav(page);
    await expect(primary.locator("a")).toHaveText(["公开词本", "查词", "随手记", "我的词本"]);
    await expect(primary.getByRole("link", { name: "公开词本", exact: true })).toHaveAttribute("href", /book=never-let-me-go/u);
    expect(await page.evaluate(() => ({ ready: document.readyState, dcl: globalThis.__navigationDclFired }))).toEqual({ ready: "interactive", dcl: false });
    await expect(page.locator("#member-dictionary-search")).toBeDisabled();
    // Navigation must work while the actual application dependency is gated.
    await primary.getByRole("link", { name: "公开词本", exact: true }).click({ noWaitAfter: true });
    await page.waitForURL(url => url.pathname === "/", { waitUntil: "commit" });
    const returned = new URL(page.url());
    expect(Object.fromEntries(returned.searchParams)).toEqual(fields);
    expect(returned.hash).toBe("");
    releaseImport();
    await page.waitForLoadState("domcontentloaded");
    await expectPublicScope(page, fields);
    expect(writes).toEqual([]);
  } finally {
    releaseImport();
    await page.unroute(pattern, delayImport);
  }
});

test("two-origin static responders retain separate public records without copying storage", async ({ context, page }) => {
  const pagesRoot = "https://zhuodashuai.github.io/vocab/";
  const workerRoot = "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/";
  const entry = await readFile(new URL("../../../vocab/js/app-navigation-entry.js", import.meta.url));
  const helper = await readFile(new URL("../../../vocab/js/app-navigation.js", import.meta.url));
  const writes = recordWrites(page);
  const blocked = [];
  // Every request is answered locally or aborted, including modules. There is
  // no production request, authenticated response, private state or API body.
  await context.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" || ![new URL(pagesRoot).origin, new URL(workerRoot).origin].includes(url.origin)) {
      blocked.push(request.url()); await route.abort(); return;
    }
    if (["/vocab/js/app-navigation-entry.js", "/js/app-navigation-entry.js"].includes(url.pathname)) {
      await route.fulfill({ contentType: "text/javascript; charset=utf-8", body: entry }); return;
    }
    if (["/vocab/js/app-navigation.js", "/js/app-navigation.js"].includes(url.pathname)) {
      await route.fulfill({ contentType: "text/javascript; charset=utf-8", body: helper }); return;
    }
    if (request.resourceType() === "document" && ["/vocab/", "/", "/personal.html", "/vocab/quick-notes.html"].includes(url.pathname)) {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><meta charset="utf-8"><title>Isolated public-origin fixture</title></head><body>
        <header class="app-header"><a class="brand" href="./">Public origin fixture</a><nav class="app-primary-nav" aria-label="主要导航">
        <a href="./">公开词本</a><a href="dictionary.html">查词</a><a href="${pagesRoot}quick-notes.html">随手记</a><a href="${workerRoot}personal.html">我的词本</a>
        </nav></header><main>Static fixture only; no account or application storage code.</main>
        <script type="module" src="js/app-navigation-entry.js?v=107"></script></body></html>` }); return;
    }
    if (url.pathname.endsWith("/favicon.ico")) { await route.fulfill({ status: 204, body: "" }); return; }
    blocked.push(request.url()); await route.abort();
  });
  const fixtureKey = "navigation-public-origin-fixture";
  await page.goto(`${pagesRoot}?${new URLSearchParams(fields)}`);
  await page.evaluate(key => localStorage.setItem(key, "pages-public-records"), fixtureKey);
  await nav(page).getByRole("link", { name: "我的词本", exact: true }).click();
  expect(new URL(page.url()).origin).toBe(new URL(workerRoot).origin);
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("wb_site")).toBe("pages");
  await page.evaluate(key => localStorage.setItem(key, "worker-public-records"), fixtureKey);
  await nav(page).getByRole("link", { name: "公开词本", exact: true }).click();
  expect(new URL(page.url()).origin).toBe(new URL(pagesRoot).origin);
  expect(new URL(page.url()).pathname).toBe("/vocab/");
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(fields);
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate(key => localStorage.getItem(key), fixtureKey)).toBe("pages-public-records");
  await page.goto(`${workerRoot}?${new URLSearchParams(fields)}`);
  expect(await page.evaluate(key => localStorage.getItem(key), fixtureKey)).toBe("worker-public-records");
  await nav(page).getByRole("link", { name: "随手记", exact: true }).click();
  expect(new URL(page.url()).origin).toBe(new URL(pagesRoot).origin);
  expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("wb_site")).toBe("worker");
  expect(await page.evaluate(key => localStorage.getItem(key), fixtureKey)).toBe("pages-public-records");
  await nav(page).getByRole("link", { name: "公开词本", exact: true }).click();
  expect(new URL(page.url()).origin).toBe(new URL(workerRoot).origin);
  expect(new URL(page.url()).pathname).toBe("/");
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(fields);
  expect(new URL(page.url()).hash).toBe("");
  expect(await page.evaluate(key => localStorage.getItem(key), fixtureKey)).toBe("worker-public-records");
  expect(blocked).toEqual([]);
  expect(writes).toEqual([]);
});
