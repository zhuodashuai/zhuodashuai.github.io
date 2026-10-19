import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

// Opt-in diagnostics, not an Internet benchmark or a relaxed regression test.
// Uses the real shipped files over Chromium's bandwidth/latency emulation.
// Accounts and saves exist only in the isolated local E2E fixture server; its
// cheap synthetic password hashing does NOT measure production registration.
test.use({ serviceWorkers: "block" });
test.skip(process.env.WORDBOOK_PERF !== "1", "Set WORDBOOK_PERF=1 for local measured diagnostics.");

const ORIGIN = "http://127.0.0.1:4187";
const PROFILE = { offline: false, latency: 400, downloadThroughput: 187_500, uploadThroughput: 93_750, connectionType: "cellular3g" };
const scenarios = [
  { name: "hot-exact-cold", query: "hip", term: "hip", chinese: "髋部" },
  { name: "expanded-exact-cold", query: "abacus", term: "abacus", chinese: "算盘" },
  { name: "chinese-cold", query: "苹果", term: "apple", chinese: "苹果" },
  { name: "compact-503", query: "hip", term: "hip", chinese: "髋部", failure: "503" },
  { name: "compact-stalled", query: "abacus", term: "abacus", chinese: "算盘", failure: "stall" }
];

for (const scenario of scenarios) {
  test(`measure new-user lookup → use → save: ${scenario.name}`, async ({ context, page }, info) => {
    test.setTimeout(90_000);
    const run = createHash("sha256").update(info.testId).digest("hex").slice(0, 20);
    await context.addCookies([{ name: "e2e_run", value: `member-perf-${run}`, url: ORIGIN }]);
    const registration = await context.request.post(`${ORIGIN}/api/v1/member/register`, {
      headers: { Origin: ORIGIN, "X-Wordbook-Auth": "member" },
      data: { username: "fresh_perf_reader", password: "isolated synthetic performance password 2026" }
    });
    expect(registration.status()).toBe(200);

    const errors = [], requests = [], requestMap = new Map();
    page.on("pageerror", error => errors.push(error.message));
    const clockStart = performance.now();
    const now = () => Math.round(performance.now() - clockStart);
    page.on("request", request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/data/")) return;
      const row = { file: url.pathname.split("/").at(-1), path: url.pathname.startsWith("/api/") ? url.pathname : undefined,
        method: request.method(), startMs: now() };
      requestMap.set(request, row); requests.push(row);
    });
    page.on("requestfinished", request => {
      const row = requestMap.get(request); if (!row) return;
      row.endMs = now(); row.durationMs = row.endMs - row.startMs;
      void request.sizes().then(size => { row.transferBytes = size.responseBodySize; }).catch(() => {});
      void request.response().then(response => { row.status = response?.status(); }).catch(() => {});
    });
    page.on("requestfailed", request => {
      const row = requestMap.get(request); if (!row) return;
      row.endMs = now(); row.durationMs = row.endMs - row.startMs; row.failure = request.failure()?.errorText;
    });

    let releaseCompact;
    const stalled = new Promise(resolve => { releaseCompact = resolve; });
    if (scenario.failure) {
      await page.route("**/data/member-dictionary.json*", async route => {
        if (scenario.failure === "503") return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
        const response = await route.fetch(); await stalled;
        try { await route.fulfill({ response }); } catch { /* The real 20s loader deadline aborts this held response. */ }
      });
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", PROFILE);

    const marks = {};
    try {
      marks.navigationStartMs = now();
      await page.goto("/personal.html?auth=member");
      await expect(page.locator("#member-workspace")).toBeVisible({ timeout: 25_000 });
      marks.workspaceReadyMs = now();
      await expect(page.locator("#member-dictionary-term")).toBeEnabled();
      await page.locator("#member-dictionary-term").fill(scenario.query);
      marks.queryStartMs = now();
      await page.locator("#member-dictionary-term").press("Enter");
      await expect(page.locator("#member-dictionary-result")).toBeVisible({ timeout: 40_000 });
      await expect(page.locator("#member-dictionary-search")).toBeEnabled({ timeout: 5_000 });
      if (scenario.query !== scenario.term) {
        await page.locator(".dictionary-choice").filter({ has: page.locator("strong", { hasText: new RegExp(`^${scenario.term}$`, "u") }) }).click();
      }
      marks.queryReadyMs = now();
      await expect(page.locator("#member-dictionary-word")).toHaveText(scenario.term);
      await expect(page.locator("#member-dictionary-meaning")).toContainText(scenario.chinese);
      await expect(page.locator("#member-dictionary-use")).toBeEnabled({ timeout: 25_000 });
      marks.useEnabledMs = now();
      await page.locator("#member-dictionary-use").click();
      await expect(page.locator("#member-term")).toHaveValue(scenario.term);
      marks.draftReadyMs = now();
      await expect(page.locator("#member-save")).toBeEnabled();
      marks.saveStartMs = now();
      await page.locator("#member-save").click();
      await expect(page.locator(".personal-entry")).toHaveCount(1, { timeout: 25_000 });
      await expect(page.locator("#member-status")).toHaveText("已保存到你的私人词本。");
      marks.saveReadyMs = now();

      await page.locator("#member-dictionary-term").fill(scenario.query);
      marks.warmQueryStartMs = now(); await page.locator("#member-dictionary-term").press("Enter");
      await expect(page.locator("#member-dictionary-result")).toBeVisible({ timeout: 40_000 });
      await expect(page.locator("#member-dictionary-search")).toBeEnabled({ timeout: 5_000 }); marks.warmQueryReadyMs = now();
      await expect(page.locator(".personal-entry")).toHaveCount(1);
      expect(errors).toEqual([]);
      const report = { scenario: scenario.name, profile: PROFILE,
        caveat: "Synthetic local account/API server, real compressed shipped assets, CDP 400ms latency and 1.5Mbit/s download; not a production SLA.",
        marks, durationsMs: { pageToWorkspace: marks.workspaceReadyMs - marks.navigationStartMs,
          coldLookup: marks.queryReadyMs - marks.queryStartMs, waitForUse: marks.useEnabledMs - marks.queryReadyMs,
          fillDraft: marks.draftReadyMs - marks.useEnabledMs, save: marks.saveReadyMs - marks.saveStartMs,
          queryThroughSaved: marks.saveReadyMs - marks.queryStartMs, warmLookup: marks.warmQueryReadyMs - marks.warmQueryStartMs },
        requests };
      await info.attach("member-lookup-performance.json", { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: "application/json" });
      console.log(`MEMBER_PERF ${JSON.stringify(report)}`);
    } finally {
      releaseCompact();
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: "none" });
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}
