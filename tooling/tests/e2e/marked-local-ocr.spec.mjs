import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
let browserErrors, cspErrors;
test.beforeEach(async ({ context, page }, testInfo) => {
  await context.addCookies([
    { name: "e2e_run", value: `local-ocr-${testInfo.testId}`.replace(/[^a-z0-9-]/giu, "-").slice(0, 80), url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
  browserErrors = []; cspErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (/Content Security Policy|Refused to (?:load|execute|connect)/iu.test(message.text())) cspErrors.push(message.text()); });
});
test.afterEach(() => { expect(browserErrors).toEqual([]); expect(cspErrors).toEqual([]); });

test("the owned Tesseract7 worker reads a real local canvas under narrow CSP without cloud or blob worker requests", async ({ page }) => {
  test.setTimeout(60_000);
  const requests = [];
  page.on("request", (request) => requests.push({ url: request.url(), method: request.method() }));
  await page.goto("/capture.html?e2e=1&testRun=localocr");
  const result = await page.evaluate(async () => {
    const { createLocalMarkedOcr } = await import("/js/marked-ocr.js?v=78");
    const progress = [];
    const engine = await createLocalMarkedOcr({ onProgress: (value) => progress.push(value), startupTimeoutMs: 30000 });
    try {
      const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 110;
      const context = canvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, 600, 110);
      context.fillStyle = "black"; context.font = "48px Georgia"; context.fillText("electrified", 30, 75);
      const first = await engine.recognizeLineCanvas(canvas);
      const second = await engine.recognizeLineCanvas(canvas);
      const words = (first.data.blocks || []).flatMap((block) => (block.paragraphs || []).flatMap((paragraph) => (paragraph.lines || []).flatMap((line) => line.words || [])));
      return { text: first.data.text.trim(), repeated: second.data.text.trim(), confidence: first.data.confidence,
        words: words.map((word) => ({ text: word.text, bbox: word.bbox, confidence: word.confidence })),
        tsv: first.data.tsv, progress, imageColor: first.data.imageColor, pdf: first.data.pdf };
    } finally { engine.terminate(); }
  });
  expect(result.text.toLowerCase()).toBe("electrified"); expect(result.repeated).toBe(result.text);
  expect(result.confidence).toBeGreaterThan(70);
  expect(result.words).toHaveLength(1); expect(result.words[0].bbox.x1).toBeGreaterThan(result.words[0].bbox.x0);
  expect(result.tsv).toContain("electrified"); expect(result.imageColor).toBeNull(); expect(result.pdf).toBeNull();
  expect(result.progress.some((value) => value.action === "recognize")).toBe(true);
  expect(requests.filter((request) => request.url.endsWith("/worker.min.js"))).toHaveLength(1);
  expect(requests.some((request) => /\/core\/tesseract-core-(?:relaxedsimd-|simd-)?lstm\.wasm\.js$/u.test(request.url))).toBe(true);
  expect(requests.some((request) => request.url.endsWith("/lang/eng.traineddata.gz"))).toBe(true);
  expect(requests.filter((request) => request.method !== "GET")).toEqual([]);
  expect(requests.every((request) => new URL(request.url).origin === "http://127.0.0.1:4187")).toBe(true);
  await expect.poll(() => page.workers().length).toBe(0);
});

test("real worker language-download failure rejects and closes, rather than leaving startup pending", async ({ context, page }) => {
  await context.route("**/vendor/tesseract/7.0.0/lang/eng.traineddata.gz", (route) => route.fulfill({ status: 404, body: "not present" }));
  await page.goto("/capture.html?e2e=1&testRun=localocrmissing");
  const result = await page.evaluate(async () => {
    const { createLocalMarkedOcr } = await import("/js/marked-ocr.js?v=78");
    try { await createLocalMarkedOcr({ startupTimeoutMs: 10000 }); return "unexpected success"; }
    catch (error) { return { code: error.code, action: error.action }; }
  });
  expect(result).toEqual({ code: "ocr_job_failed", action: "loadLanguage" });
  await expect.poll(() => page.workers().length).toBe(0);
});

test("cancelling real initialization closes the browser worker and settles its Promise", async ({ page }) => {
  await page.goto("/capture.html?e2e=1&testRun=localocrcancel");
  const result = await page.evaluate(async () => {
    const { createLocalMarkedOcr } = await import("/js/marked-ocr.js?v=78");
    const abort = new AbortController();
    const initialization = createLocalMarkedOcr({ signal: abort.signal });
    abort.abort();
    try { await initialization; return "unexpected success"; } catch (error) { return error.name; }
  });
  expect(result).toBe("AbortError"); await expect.poll(() => page.workers().length).toBe(0);
});
