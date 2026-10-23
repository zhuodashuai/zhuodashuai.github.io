import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dictionaryExampleBucket } from "../../../vocab/js/dictionary-examples.js";

const ORIGIN = "http://127.0.0.1:4187";
const BOOK_PATH = "/?book=never-let-me-go&chapter=chapter-1";
const pack = JSON.parse(await readFile(new URL("../../dictionary/examples/source/batch-0018-p009.json", import.meta.url), "utf8"));
const tajik = pack.entries.find(row => row.term === "Tajik");
expect(tajik).toBeTruthy();
const dictionaryManifest = JSON.parse(await readFile(new URL("../../../vocab/data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
const descriptor = dictionaryManifest.english.shards[dictionaryExampleBucket("tajik") % 128];
const dictionaryShard = JSON.parse(await readFile(new URL(`../../../vocab/data/expanded-dictionary/${descriptor.file}`, import.meta.url), "utf8"));
const tajikSource = dictionaryShard.records.find(row => row.term === "Tajik");
expect(tajikSource).toBeTruthy();
test.use({ serviceWorkers: "allow" });

test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: `offline-routes-${createHash("sha256").update(info.testId).digest("hex").slice(0, 24)}`, url: ORIGIN }]);
  page.on("pageerror", error => { throw error; });
});

async function readLearning(page) {
  return page.evaluate(async () => {
    const { listReviewStates } = await import("/js/owner-storage.js");
    const { quizStorage } = await import("/js/quiz-storage.js");
    return { reviews: await listReviewStates(), quizzes: await quizStorage.listAttempts() };
  });
}

async function restoreOnline(context, page) {
  // A timeout can close the isolated context before finally executes.
  // Cleanup must never replace the original navigation/assertion failure.
  if (page.isClosed()) return;
  try { await context.setOffline(false); } catch { /* Context is already being disposed. */ }
}

async function checkTajik(page) {
  await expect(page.locator("#dictionary-term")).toHaveText("Tajik");
  await expect(page.locator("#dictionary-meaning")).toHaveText(`① ${tajikSource.meaning}`);
  await expect(page.locator("#dictionary-example-content summary")).toHaveText(`1. ${tajik.partOfSpeech} · ${tajik.meaningZh}`);
  await expect(page.locator('#dictionary-example-content p[lang="en"]')).toHaveText(tajik.en);
  await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText(tajik.zh);
}

async function prepareRedirectedShell({ context, page }, info, { warmGuideQuery = false } = {}) {
  expect(context.serviceWorkers()).toHaveLength(0);
  expect((await context.cookies()).some(cookie => /auth|session/iu.test(cookie.name))).toBe(false);
  await context.addCookies([{ name: "e2e_clean_html_redirects", value: "1", url: ORIGIN }]);
  const writes = [], foreign = [];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push({ method: request.method(), url: request.url() });
    if (new URL(request.url()).origin !== ORIGIN) foreign.push(request.url());
  });
  await page.goto(BOOK_PATH);
  await expect(page.locator("#entry-count")).not.toHaveText("0");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Seed one pre-existing book review through the real local storage API.
  // Later lookup/navigation must not write or advance this record.
  await page.evaluate(async () => {
    const { filterEntriesByCollection } = await import("/js/collections.js");
    const { parsePublicSnapshot } = await import("/js/wordbook-schema.js");
    const { putReviewState } = await import("/js/owner-storage.js");
    const { applyReviewRating } = await import("/js/study.js");
    const snapshot = parsePublicSnapshot(await (await fetch("/data/owner-wordbook.json")).json());
    const entry = filterEntriesByCollection(snapshot.entries, "never-let-me-go", "chapter-1")[0];
    if (!entry) throw new Error("Missing real Chapter1 fixture entry");
    await putReviewState(applyReviewRating(entry.id, null, "good", new Date("2026-10-01T12:00:00.000Z")));
  });
  const learning = await readLearning(page);
  expect(learning.reviews).toHaveLength(1);
  expect(learning.quizzes).toEqual([]);
  await page.goto("/dictionary.html#q=Tajik");
  await expect(page).toHaveURL(`${ORIGIN}/dictionary#q=Tajik`);
  await checkTajik(page);
  if (warmGuideQuery) {
    await page.goto(`/dictionary.html#q=${encodeURIComponent("勤奋")}`);
    await expect(page.locator("#dictionary-result")).toBeVisible();
    await expect(page.locator("#dictionary-submit")).toBeEnabled();
  }
  const cacheRows = await page.evaluate(async () => {
    const rows = [];
    for (const name of (await caches.keys()).filter(name => name.startsWith("zhuo-wordbook-"))) {
      const cache = await caches.open(name);
      for (const path of ["/dictionary.html", "/guide.html"]) {
        const response = await cache.match(path);
        if (response) rows.push({ name, key: new URL(path, location.origin).href, redirected: response.redirected, url: response.url, status: response.status });
      }
    }
    return rows;
  });
  for (const [html, clean] of [["dictionary.html", "dictionary"], ["guide.html", "guide"]]) {
    expect(cacheRows).toContainEqual(expect.objectContaining({ key: `${ORIGIN}/${html}`, redirected: true, url: `${ORIGIN}/${clean}`, status: 200 }));
  }
  await info.attach("real-redirected-precache", { body: JSON.stringify(cacheRows, null, 2), contentType: "application/json" });
  console.log(`Verified real redirected precache: ${JSON.stringify(cacheRows)}`);
  return { learning, writes, foreign };
}

test("clean-route fixture is cookie opt-in and preserves the default HTML routes", async ({ context }) => {
  for (const name of ["dictionary", "guide"]) {
    const original = await context.request.get(`${ORIGIN}/${name}.html`, { maxRedirects: 0 });
    expect(original.status()).toBe(200);
    expect(original.headers().location).toBeUndefined();
    expect((await context.request.get(`${ORIGIN}/${name}`, { maxRedirects: 0 })).status()).toBe(404);
  }
  await context.addCookies([{ name: "e2e_clean_html_redirects", value: "1", url: ORIGIN }]);
  for (const name of ["dictionary", "guide"]) {
    const redirected = await context.request.get(`${ORIGIN}/${name}.html?fixture=clean`, { maxRedirects: 0 });
    expect(redirected.status()).toBe(308);
    expect(redirected.headers().location).toBe(`/${name}?fixture=clean`);
    const clean = await context.request.get(`${ORIGIN}/${name}`);
    expect(clean.status()).toBe(200);
    expect(clean.headers()["content-type"]).toContain("text/html");
  }
});

test("offline actual dictionary navbar HTML navigation and fragment reload retain exact D18 content and book learning", async ({ context, page }, info) => {
  test.setTimeout(90_000);
  const before = await prepareRedirectedShell({ context, page }, info);
  await page.goto("/guide.html");
  await expect(page).toHaveURL(`${ORIGIN}/guide`);
  const link = page.locator('header nav a[href="dictionary.html"]');
  await expect(link).toHaveAttribute("href", "dictionary.html");
  await context.setOffline(true);
  try {
    // Do not replace this real .html link with the clean route: the redirected
    // CacheStorage Response must be usable for an actual offline navigation.
    await link.click();
    await expect(page.locator("#dictionary-query")).toBeVisible();
    await page.locator("#dictionary-query").fill("Tajik");
    await page.locator("#dictionary-query").press("Enter");
    await checkTajik(page);
    await expect(page).toHaveURL(/\/dictionary\.html#q=Tajik$/u);
    await page.reload();
    await checkTajik(page);
    expect(await readLearning(page)).toEqual(before.learning);
    expect(before.writes).toEqual([]);
    expect(before.foreign).toEqual([]);
  } finally { await restoreOnline(context, page); }
});

test("offline actual guide navbar and its fragment dictionary link survive redirected shells and reload", async ({ context, page }, info) => {
  test.setTimeout(90_000);
  const before = await prepareRedirectedShell({ context, page }, info, { warmGuideQuery: true });
  await page.goto(BOOK_PATH);
  const guide = page.locator("footer nav").getByRole("link", { name: "使用手册", exact: true });
  const guideUrl = new URL(await guide.getAttribute("href"), page.url());
  expect(guideUrl.origin).toBe(ORIGIN);
  expect(guideUrl.pathname).toBe("/guide.html");
  expect(guideUrl.search).toBe("");
  expect([...new URLSearchParams(guideUrl.hash.slice(1))]).toEqual([
    ["wb_book", "never-let-me-go"], ["wb_chapter", "chapter-1"], ["wb_site", "local"]
  ]);
  await context.setOffline(true);
  try {
    await guide.click();
    await expect(page.locator("h1")).toHaveText("使用手册");
    await page.reload();
    await expect(page.locator("h1")).toHaveText("使用手册");
    const catalogue = page.locator("#chinese-related-catalogue");
    await expect(catalogue).toHaveJSProperty("open", false);
    await catalogue.locator("summary").click();
    await expect(catalogue).toHaveJSProperty("open", true);
    const hashLink = catalogue.locator('a[href="dictionary.html#q=%E5%8B%A4%E5%A5%8B"]');
    await expect(hashLink).toHaveCount(1);
    await expect(hashLink).toBeVisible();
    await hashLink.click();
    await expect(page.locator("#dictionary-query")).toHaveValue("勤奋");
    await expect(page.locator("#dictionary-result")).toBeVisible();
    await page.locator("#dictionary-query").fill("Tajik");
    await page.locator("#dictionary-query").press("Enter");
    await checkTajik(page);
    await page.reload();
    await checkTajik(page);
    expect(await readLearning(page)).toEqual(before.learning);
    expect(before.writes).toEqual([]);
    expect(before.foreign).toEqual([]);
  } finally { await restoreOnline(context, page); }
});
