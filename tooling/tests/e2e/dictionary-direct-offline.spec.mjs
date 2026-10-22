import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dictionaryExampleBucket } from "../../../vocab/js/dictionary-examples.js";

const ORIGIN = "http://127.0.0.1:4187";
const pack = JSON.parse(await readFile(new URL("../../dictionary/examples/source/batch-0018-p009.json", import.meta.url), "utf8"));
const tajik = pack.entries.find(row => row.term === "Tajik");
expect(tajik).toBeTruthy();
const dictionaryManifest = JSON.parse(await readFile(new URL("../../../vocab/data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
const exampleManifest = JSON.parse(await readFile(new URL("../../../vocab/data/dictionary-examples/manifest-v2.json", import.meta.url), "utf8"));
const warmPaths = [
  "/data/expanded-dictionary/manifest.json",
  `/data/expanded-dictionary/${dictionaryManifest.english.shards[dictionaryExampleBucket("tajik") % 128].file}`,
  "/data/dictionary-examples/manifest-v2.json",
  `/data/dictionary-examples/${exampleManifest.shards[dictionaryExampleBucket("Tajik")].file}`
];
test.use({ serviceWorkers: "allow" });

for (const cleanRoute of [false, true]) {
  test(`first-ever dictionary visit installs offline support without visiting the homepage (${cleanRoute ? "redirected" : "HTML"})`, async ({ context, page }, info) => {
    test.setTimeout(90_000);
    const writes = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url());
    });
    await context.addCookies([
      { name: "e2e_run", value: `dictionary-direct-${createHash("sha256").update(info.testId).digest("hex").slice(0, 20)}`, url: ORIGIN },
      { name: "e2e_dictionary_first_install", value: "1", url: ORIGIN },
      ...(cleanRoute ? [{ name: "e2e_clean_html_redirects", value: "1", url: ORIGIN }] : [])
    ]);
    expect(context.serviceWorkers()).toHaveLength(0);
    expect((await context.cookies()).some(cookie => /auth|session/iu.test(cookie.name))).toBe(false);
    // This must be the very first page: warming the homepage would hide a
    // missing registration in the dictionary's own entry point.
    await page.goto("/dictionary.html#q=Tajik");
    await expect(page.locator("#dictionary-term")).toHaveText("Tajik");
    await expect(page.locator('#dictionary-example-content p[lang="en"]')).toHaveText(tajik.en);
    await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText(tajik.zh);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), "Fixture must really expose the pre-claim first-read race").toBe(false);
    const beforeUrl = page.url();
    await page.locator("#dictionary-query").fill("still typing a new word");
    // Poll with an explicit deadline rather than await an unbounded .ready.
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 45_000 }).toBe(true);
    await expect(page).toHaveURL(beforeUrl);
    await expect(page.locator("#dictionary-query")).toHaveValue("still typing a new word");
    const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(registration => ({ scope: registration.scope, state: registration.active?.state })));
    expect(registrations).toEqual([{ scope: `${ORIGIN}/`, state: "activated" }]);
    // No repeated lookup, online reload, homepage visit or memory-cache reset:
    // the first read must be retained automatically after initial SW claim.
    await expect.poll(() => page.evaluate(async paths => {
      const cache = await caches.open("zhuo-wordbook-v100");
      return Promise.all(paths.map(async path => Boolean(await cache.match(path))));
    }, warmPaths), { timeout: 30_000 }).toEqual(warmPaths.map(() => true));
    await expect(page).toHaveURL(beforeUrl);
    await expect(page.locator("#dictionary-query")).toHaveValue("still typing a new word");
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator("#dictionary-term")).toHaveText("Tajik");
      await expect(page.locator("#dictionary-meaning")).not.toBeEmpty();
      await expect(page.locator('#dictionary-example-content p[lang="en"]')).toHaveText(tajik.en);
      await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText(tajik.zh);
      await expect(page.locator("nav.app-primary-nav a")).toHaveText(["公开词本", "查词", "随手记", "我的词本"]);
      await expect(page.locator('footer a[href="guide.html"]')).toBeVisible();
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      if (!page.isClosed()) await context.setOffline(false).catch(() => {});
    }
  });
}
