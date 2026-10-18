import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });
const baseline = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
// Reserve this real word for the new-draft path while keeping the real catalog.
baseline.entries = baseline.entries.filter((entry) => entry.term.toLowerCase() !== "electrify");
const dictionary = { schemaVersion: 1, count: 1,
  columns: ["key", "word", "phonetic", "partOfSpeech", "meaning", "definition", "collins", "oxford", "bnc", "frq", "tags", "forms"],
  entries: [["electrify", "electrify", "/ɪˈlektrɪfaɪ/", "verb", "使通电；使兴奋", "To supply with electricity.", 0, 0, 0, 0, "", []]] };
let browserErrors, cspErrors, networkRequests;

test.beforeEach(async ({ context, page }, testInfo) => {
  const run = `marked-${testInfo.testId}`.replace(/[^a-z0-9-]/giu, "-").slice(0, 80);
  await context.addCookies([
    { name: "e2e_run", value: run, url: "http://127.0.0.1:4187" },
    { name: "e2e_auth", value: "owner", url: "http://127.0.0.1:4187" }
  ]);
  browserErrors = []; cspErrors = []; networkRequests = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => networkRequests.push({ url: request.url(), method: request.method() }));
  page.on("console", (message) => { if (/Content Security Policy|Refused to (?:load|execute|connect)/iu.test(message.text())) cspErrors.push(message.text()); });
  await page.route("**/api/v1/owner/wordbook", (route) => route.fulfill({ json: { snapshot: baseline, sha: "a".repeat(40) } }));
  await page.route("**/data/ecdict-core.json*", (route) => route.fulfill({ json: dictionary }));
});
test.afterEach(() => {
  expect(browserErrors).toEqual([]); expect(cspErrors).toEqual([]);
  expect(networkRequests.filter((request) => request.method !== "GET")).toEqual([]);
  expect(networkRequests.every((request) => new URL(request.url).origin === "http://127.0.0.1:4187")).toBe(true);
});

async function ready(page) {
  await page.goto("/capture.html?e2e=1&testRun=marked");
  await expect(page.locator("#capture-workspace")).toBeVisible();
}
async function imageFile(page, { text = "electrified", marked = true, color = "#f4eedb", name = "my-private-notes.png" } = {}) {
  const data = await page.evaluate(({ text: word, marked: ink, color: fill }) => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 1100;
    const context = canvas.getContext("2d"); context.fillStyle = fill; context.fillRect(0, 0, 800, 1100);
    context.fillStyle = "black"; context.font = "32px Georgia"; context.fillText(word, 90, 160);
    if (ink) {
      context.strokeStyle = "#224fc7"; context.lineWidth = 3; context.beginPath();
      context.moveTo(90, 165); context.lineTo(90 + context.measureText(word).width, 165); context.stroke();
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, { text, marked, color });
  return { name, mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}
async function choosePhoto(page, file) {
  await page.locator("#capture-file").setInputFiles(file || await imageFile(page));
  await expect(page.locator("#capture-start")).toBeEnabled();
}
async function scan(page) {
  await page.locator("#capture-start").click();
  await expect(page.locator("#capture-status")).toContainText("已完成", { timeout: 20000 });
}
async function drafts(page) { return page.evaluate(async () => (await import("/js/owner-storage.js?v=78")).listDrafts()); }
function sourcePdf(pageCount = 6) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"], pages = [];
  for (let index = 0; index < pageCount; index += 1) {
    const pageId = objects.length + 1, contentId = pageId + 1; pages.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    const content = "BT /F1 16 Tf 60 700 Td (electrified) Tj ET\n0.1 0.2 0.8 RG 1.5 w 60 697 m 127 697 l S";
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pageCount} /Kids [${pages.join(" ")}] >>`;
  let output = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name: "private-reading.pdf", mimeType: "application/pdf", buffer: Buffer.from(output) };
}

test("real local photo OCR is explicit and unchecked, then edited English becomes a draft visible in the owner page", async ({ page }) => {
  await ready(page); await choosePhoto(page);
  expect(networkRequests.some((request) => request.url.includes("/vendor/tesseract/"))).toBe(false);
  await page.locator("#capture-book").selectOption("never-let-me-go"); await page.locator("#capture-chapter").selectOption("chapter-7");
  await scan(page); await expect(page.locator(".capture-candidate")).toHaveCount(1);
  // This checks interaction/provenance, not a language-quality pass. Georgia
  // ligatures can be misread, so keep the real raw reading and correct it here.
  const recognizedText = await page.locator(".capture-candidate-term").inputValue();
  expect(recognizedText).toMatch(/[A-Za-z]/u);
  await expect(page.locator(".capture-candidate input[type=checkbox]")).not.toBeChecked();
  await expect(page.locator("#capture-import")).toBeDisabled();
  await page.locator(".capture-candidate summary").click();
  await expect(page.locator(".capture-original-text")).toHaveValue(recognizedText);
  await page.locator(".capture-original-text").fill("electrified");
  await page.locator(".capture-candidate-term").fill("electrify"); await page.locator(".capture-candidate input[type=checkbox]").check();
  await page.locator("#capture-import").click(); await expect(page.locator("#capture-import-status")).toContainText("已保存 1 份本地草稿");
  const saved = await drafts(page); expect(saved).toHaveLength(1); expect(saved[0].value.term).toBe("electrify");
  expect(saved[0].value.originalInput).toBe("electrified"); expect(saved[0].value.meaning).toContain("通电");
  expect(saved[0].value.tags).toContain("collection:never-let-me-go:chapter-7");
  expect(saved[0].base.captureSources[0].fileName).toBe("my-private-notes.png");
  expect(saved[0].base.captureSources[0].recognizedText).toBe(recognizedText);
  expect(saved[0].base.captureSources[0].originalText).toBe("electrified");
  expect(JSON.stringify(saved[0].value)).not.toContain("my-private-notes.png");
  await expect(page.locator("#capture-open-drafts")).toHaveAttribute("href", "owner.html");
  // Preserve the deliberate e2e DB namespace; production uses a shared DB.
  await page.goto("/owner.html?e2e=1&testRun=marked");
  await expect(page.locator("#draft-list .draft-item", { hasText: "electrify" })).toHaveCount(1);
  await page.locator("#draft-list .draft-item", { hasText: "electrify" }).click();
  await expect(page.locator("#field-original-input")).toHaveValue("electrified");
});

test("repeated real OCR does not duplicate or overwrite a local draft", async ({ page }) => {
  await ready(page); const file = await imageFile(page);
  for (let index = 0; index < 2; index += 1) {
    await choosePhoto(page, file); await scan(page);
    await expect(page.locator(".capture-candidate")).toHaveCount(1);
    await page.locator(".capture-candidate input[type=checkbox]").check(); await page.locator("#capture-import").click();
    await expect(page.locator("#capture-import-status")).toContainText(index ? "已保存 0 份本地草稿；1 项" : "已保存 1 份本地草稿");
  }
  expect(await drafts(page)).toHaveLength(1);
});

test("real PDF worker and OCR process only selected pages, with one serial OCR worker for the batch", async ({ page }) => {
  await ready(page); await page.locator("#capture-file").setInputFiles(sourcePdf());
  await expect(page.locator("#capture-start")).toBeEnabled({ timeout: 15000 });
  await expect(page.locator("#capture-page-count")).toHaveText("PDF · 共 6 页");
  expect(networkRequests.some((request) => request.url.includes("/vendor/tesseract/"))).toBe(false);
  await page.locator("#capture-pages").fill("1-6"); await page.locator("#capture-start").click();
  await expect(page.locator("#capture-status")).toContainText("每批最多识别 5 页");
  await page.locator("#capture-pages").fill("2,4"); await scan(page);
  await expect(page.locator(".capture-candidate")).toHaveCount(2);
  await expect(page.locator(".capture-candidate").first()).toContainText("第 2 页");
  await expect(page.locator(".capture-candidate").last()).toContainText("第 4 页");
  expect(networkRequests.filter((request) => request.url.endsWith("/vendor/tesseract/7.0.0/worker.min.js"))).toHaveLength(1);
  expect(networkRequests.some((request) => request.url.includes("/vendor/pdfjs/pdf.worker.mjs"))).toBe(true);
  expect(await drafts(page)).toEqual([]);
});

test("an unmarked page never loads an OCR worker or turns page text into vocabulary", async ({ page }) => {
  await ready(page); await choosePhoto(page, await imageFile(page, { marked: false })); await scan(page);
  await expect(page.locator(".capture-candidate")).toHaveCount(0); await expect(page.locator("#capture-import")).toBeDisabled();
  await expect(page.locator("#capture-warnings")).toContainText("下划线");
  expect(networkRequests.some((request) => request.url.includes("/vendor/tesseract/"))).toBe(false);
  expect(await drafts(page)).toEqual([]);
});

test("a missing local engine resource shows failure and cannot create drafts", async ({ context, page }) => {
  await context.route("**/vendor/tesseract/7.0.0/lang/eng.traineddata.gz", (route) => route.fulfill({ status: 404, body: "not present" }));
  await ready(page); await choosePhoto(page); await page.locator("#capture-start").click();
  await expect(page.locator("#capture-status")).toContainText("本地识别未完成", { timeout: 15000 });
  await expect(page.locator(".capture-candidate")).toHaveCount(0); expect(await drafts(page)).toEqual([]);
});

test("cancel and a new photo stop local startup, and no late OCR can replace the new document", async ({ context, page }) => {
  let downloads = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  await context.route("**/vendor/tesseract/7.0.0/lang/eng.traineddata.gz", async (route) => {
    downloads += 1; if (downloads === 1) await gate;
    try { await route.continue(); } catch { /* expected after hard worker cancellation */ }
  });
  try {
    await ready(page); await choosePhoto(page); await page.locator("#capture-start").click();
    await expect.poll(() => downloads).toBe(1); await page.locator("#capture-cancel").click();
    await choosePhoto(page, await imageFile(page, { text: "orchard", name: "new-photo.png" })); release();
    await expect(page.locator(".capture-candidate")).toHaveCount(0); await expect(page.locator("#capture-file-name")).toHaveText("new-photo.png");
    await scan(page); await expect(page.locator(".capture-candidate-term")).toHaveValue("orchard");
    expect(await drafts(page)).toEqual([]);
  } finally { release(); }
});

test("ordinary users and expired owner verification cannot start the local import workflow", async ({ page }) => {
  let owner = false;
  await page.route("**/api/v1/session", (route) => route.fulfill({ json: { authenticated: true,
    user: owner ? { login: "zhuodashuai", id: 156042078 } : { login: "ordinary-member", id: 1234 }, csrfToken: "e2e-csrf-token-000000000000000000000000" } }));
  await page.goto("/capture.html"); await expect(page.locator("#capture-workspace")).toBeHidden();
  owner = true; await page.locator("#capture-auth-retry").click(); await expect(page.locator("#capture-workspace")).toBeVisible();
  await choosePhoto(page); owner = false; await page.locator("#capture-start").click();
  await expect(page.locator("#capture-workspace")).toBeHidden();
  expect(networkRequests.some((request) => request.url.includes("/vendor/tesseract/"))).toBe(false);
});

test("390-pixel phone layout and candidate location controls remain usable with real OCR", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await ready(page); await choosePhoto(page); await scan(page);
  await expect(page.locator(".capture-candidate")).toHaveCount(1);
  const recognizedText = await page.locator(".capture-candidate-term").inputValue();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "查看标记", exact: true }).click();
  await expect(page.locator("#capture-preview-caption")).toContainText(`标记位置：${recognizedText}`);
  await expect(page.locator("#capture-preview-caption")).toBeFocused();
  await expect(page.locator(".capture-candidate input[type=checkbox]")).not.toBeChecked();
  await page.screenshot({ path: test.info().outputPath("capture-phone-local.png"), fullPage: true });
});
