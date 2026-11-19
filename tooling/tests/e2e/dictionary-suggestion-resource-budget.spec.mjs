import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative, sep, extname } from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".bin": "application/octet-stream", ".png": "image/png", ".webmanifest": "application/manifest+json" };
test.use({ serviceWorkers: "block", storageState: { cookies: [], origins: [] } });

for (const phase of ["headers", "body"]) test(`a real native ${phase} read beyond three seconds remains a spelling timeout`, async ({ page }, testInfo) => {
  const transfers = [], completions = [], timers = new Set();
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const file = resolve(root, pathname.replace(/^\//u, "")), inside = relative(root, file);
      if (inside.startsWith(`..${sep}`) || inside === "..") { response.writeHead(403); response.end(); return; }
      const bytes = await readFile(file), headers = { "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Content-Length": bytes.length, "Cache-Control": "no-store" };
      if (!pathname.includes("/data/dictionary-suggestions/") || pathname.endsWith("manifest.json")) { response.writeHead(200, headers); response.end(bytes); return; }
      const record = { pathname, startedAt: Date.now(), bytes: bytes.length }; transfers.push(record);
      if (phase === "body") { response.writeHead(200, headers); response.write(bytes.subarray(0, 1)); record.headersAt = Date.now(); }
      completions.push(new Promise(done => {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (phase === "headers") { response.writeHead(200, headers); record.headersAt = Date.now(); }
          response.end(phase === "body" ? bytes.subarray(1) : bytes); record.endedAt = Date.now(); done();
        }, 3200);
        timers.add(timer);
      }));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(`${origin}/vocab/dictionary.html`);
    await expect(page.locator("#dictionary-submit")).toBeEnabled();
    await page.locator("#dictionary-query").fill("heppy"); await page.locator("#dictionary-query").press("Enter");
    await expect.poll(() => transfers.length).toBe(3);
    await expect(page.locator("#dictionary-suggestion-status")).toContainText("拼写建议暂不可用");
    await Promise.all(completions);
    await expect(page.locator("#dictionary-suggestions button")).toHaveCount(0);
    await expect(page.locator("#dictionary-suggestion-status")).toContainText("拼写建议暂不可用");
    await expect(page.locator("#dictionary-query")).toHaveValue("heppy");
    await expect(page.locator("#dictionary-result")).toBeHidden();
    for (const transfer of transfers) {
      expect(transfer.endedAt - transfer.startedAt).toBeGreaterThanOrEqual(3000);
      if (phase === "body") expect(transfer.headersAt - transfer.startedAt).toBeLessThan(3000);
    }
    const timings = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter(entry => entry.name.includes("/data/dictionary-suggestions/") && !entry.name.endsWith("manifest.json"))
      .map(entry => ({ name: entry.name, startTime: entry.startTime, responseStart: entry.responseStart, responseEnd: entry.responseEnd, decodedBodySize: entry.decodedBodySize })));
    await testInfo.attach(`real-slow-${phase}.json`, { body: Buffer.from(JSON.stringify({ transfers, timings }, null, 2)), contentType: "application/json" });
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await page.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
  }
});
