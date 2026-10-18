import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKED_FILE_LIMITS, detectMarkedFileKind, markedImageDimensions,
  parseMarkedPageSelection, fitMarkedImage, markedDataUrlBytes,
  encodeMarkedPage, openMarkedFile
} from "../js/marked-files.js";

const bytes = (text) => new TextEncoder().encode(text);
const png = (width, height) => {
  const result = new Uint8Array(32);
  result.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(result.buffer).setUint32(16, width);
  new DataView(result.buffer).setUint32(20, height);
  return result;
};
const jpeg = (width, height) => new Uint8Array([
  255, 216, 255, 224, 0, 4, 0, 0, 255, 192, 0, 11, 8,
  height >> 8, height & 255, width >> 8, width & 255, 1, 1, 17, 0, 255, 217
]);
function fileFor(content, extra = {}) {
  return {
    name: "private-source.pdf", size: content.byteLength,
    slice: (start, end) => ({ arrayBuffer: async () => content.slice(start, end).buffer }),
    arrayBuffer: async () => content.slice().buffer,
    ...extra
  };
}
function fakePdf({ pageCount = 2, error = null } = {}) {
  const state = { options: null, destroys: 0 };
  const library = {
    GlobalWorkerOptions: {},
    getDocument(options) {
      state.options = options;
      return {
        promise: error ? Promise.reject(error) : Promise.resolve({ numPages: pageCount }),
        async destroy() { state.destroys += 1; }
      };
    }
  };
  return { state, library };
}

test("file type comes from magic bytes rather than a misleading filename", () => {
  assert.equal(detectMarkedFileKind(bytes("%PDF-1.7\n")), "pdf");
  assert.equal(detectMarkedFileKind(png(200, 400)), "png");
  assert.equal(detectMarkedFileKind(jpeg(200, 400)), "jpeg");
  assert.throws(() => detectMarkedFileKind(bytes("not a pdf")), /真实|格式/u);
  assert.throws(() => detectMarkedFileKind([137, 80, 78, 71]), /无法读取/u);
});

test("HEIC reports a truthful conversion requirement instead of pretending to decode", () => {
  for (const brand of ["heic", "heix", "mif1", "msf1"]) {
    assert.throws(() => detectMarkedFileKind(bytes(`0000ftyp${brand}00000000`)), /HEIC\/HEIF/u);
  }
});

test("JPEG and PNG dimensions are read before a potentially large bitmap is decoded", () => {
  assert.deepEqual(markedImageDimensions(png(4032, 3024), "png"), { width: 4032, height: 3024 });
  assert.deepEqual(markedImageDimensions(jpeg(3024, 4032), "jpeg"), { width: 3024, height: 4032 });
  assert.throws(() => markedImageDimensions(new Uint8Array(12), "png"), /不完整/u);
  assert.throws(() => markedImageDimensions(new Uint8Array([255, 216, 255]), "jpeg"), /损坏/u);
});

test("selected PDF page ranges are explicit, deduplicated, sorted and limited to five", () => {
  assert.deepEqual(parseMarkedPageSelection("5,1,3-4,3", 10), [1, 3, 4, 5]);
  assert.deepEqual(parseMarkedPageSelection("１，３–５", 10), [1, 3, 4, 5]);
  assert.deepEqual(parseMarkedPageSelection("2; 4", 4), [2, 4]);
  for (const invalid of ["", "all", "1,", "0", "11", "4-2", "1-6", "1,2,3,4,5,6", "1.5", "-1"]) {
    assert.throws(() => parseMarkedPageSelection(invalid, 10));
  }
  assert.throws(() => parseMarkedPageSelection("1", 1001), /页数/u);
});

test("request image dimensions never exceed 1600 pixels and do not upscale photos", () => {
  assert.deepEqual(fitMarkedImage(4032, 3024), { width: 1600, height: 1200 });
  assert.deepEqual(fitMarkedImage(3024, 4032), { width: 1200, height: 1600 });
  assert.deepEqual(fitMarkedImage(500, 800), { width: 500, height: 800 });
  assert.deepEqual(fitMarkedImage(1, 10000), { width: 1, height: 1600 });
  for (const invalid of [[0, 1], [1, NaN], [-5, 20], [Infinity, 10]]) assert.throws(() => fitMarkedImage(...invalid));
});

test("JPEG encoding tries progressively smaller qualities and rejects oversized results", () => {
  assert.equal(markedDataUrlBytes("data:image/jpeg;base64,YQ=="), 1);
  assert.equal(markedDataUrlBytes("data:image/png;base64,YWI="), 2);
  assert.equal(markedDataUrlBytes("data:image/jpeg;base64,YWJj"), 3);
  assert.throws(() => markedDataUrlBytes("data:text/plain;base64,YWJj"), /编码/u);
  assert.throws(() => markedDataUrlBytes("data:image/jpeg;base64,"), /编码/u);
  assert.throws(() => markedDataUrlBytes("data:image/jpeg;base64,=="), /编码/u);
  const large = `data:image/jpeg;base64,${"A".repeat(Math.ceil((MARKED_FILE_LIMITS.requestImageBytes + 3) / 3) * 4)}`;
  const qualities = [];
  assert.equal(encodeMarkedPage({ toDataURL(type, quality) {
    assert.equal(type, "image/jpeg"); qualities.push(quality);
    return qualities.length < 3 ? large : "data:image/jpeg;base64,YWJj";
  } }), "data:image/jpeg;base64,YWJj");
  assert.deepEqual(qualities, [.88, .76, .64]);
  assert.throws(() => encodeMarkedPage({ toDataURL: () => large }), /超过 2 MiB/u);
});

test("empty, over-limit and cancelled files stop before full file reads", async () => {
  let reads = 0;
  const file = fileFor(bytes("%PDF-1.7"), { arrayBuffer: async () => { reads += 1; throw new Error("must not read"); } });
  await assert.rejects(openMarkedFile({ ...file, size: 0 }), /非空/u);
  await assert.rejects(openMarkedFile({ ...file, size: MARKED_FILE_LIMITS.pdfBytes + 1 }), /100 MiB/u);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(openMarkedFile(file, { signal: abort.signal }), { name: "AbortError" });
  const photo = fileFor(png(100, 100), { size: MARKED_FILE_LIMITS.imageBytes + 1, arrayBuffer: file.arrayBuffer });
  await assert.rejects(openMarkedFile(photo), /20 MiB/u);
  assert.equal(reads, 0);
});

test("oversized photo pixel counts reject before browser bitmap allocation", async () => {
  await assert.rejects(openMarkedFile(fileFor(png(10000, 10000))), /4000 万像素/u);
  await assert.rejects(openMarkedFile(fileFor(png(0, 100))), /像素/u);
});

test("PDF loading uses local worker/fonts and disables eval, wasm and font-face", async () => {
  const { state, library } = fakePdf();
  const source = bytes("%PDF-1.7\nmock document");
  const result = await openMarkedFile(fileFor(source), { pdfjsLoader: async () => library });
  assert.equal(result.kind, "pdf"); assert.equal(result.pageCount, 2);
  assert.equal(result.fileHash.length, 64); assert.match(result.fileHash, /^[a-f0-9]{64}$/u);
  assert.equal(state.options.isEvalSupported, false); assert.equal(state.options.useWasm, false);
  assert.equal(state.options.disableFontFace, true); assert.equal(state.options.enableXfa, false);
  assert.equal(state.options.maxImageSize, 16_000_000);
  assert.match(state.options.standardFontDataUrl, /\/vendor\/pdfjs\/standard_fonts\/$/u);
  assert.match(library.GlobalWorkerOptions.workerSrc, /\/vendor\/pdfjs\/pdf\.worker\.mjs\?v=6\.4\.299$/u);
  await result.destroy(); await result.destroy(); assert.equal(state.destroys, 1);
  await assert.rejects(result.renderPage(1), /已关闭/u);
});

test("PDFs beyond 1000 pages or needing a password fail safely and release the worker", async () => {
  const huge = fakePdf({ pageCount: 1001 });
  await assert.rejects(openMarkedFile(fileFor(bytes("%PDF-1.7")), { pdfjsLoader: async () => huge.library }), /1000 页/u);
  assert.equal(huge.state.destroys, 1);
  const locked = fakePdf({ error: Object.assign(new Error("password"), { name: "PasswordException" }) });
  await assert.rejects(openMarkedFile(fileFor(bytes("%PDF-1.7")), { pdfjsLoader: async () => locked.library }), /密码/u);
  assert.equal(locked.state.destroys, 1);
});

test("cancelling PDF loading destroys the loading task and returns AbortError", async () => {
  const controller = new AbortController();
  let rejectLoading, destroys = 0;
  const library = {
    GlobalWorkerOptions: {},
    getDocument() {
      queueMicrotask(() => controller.abort());
      return { promise: new Promise((_resolve, reject) => { rejectLoading = reject; }), async destroy() { destroys += 1; rejectLoading(new Error("cancelled")); } };
    }
  };
  await assert.rejects(openMarkedFile(fileFor(bytes("%PDF-1.7")), { signal: controller.signal, pdfjsLoader: async () => library }), { name: "AbortError" });
  assert.ok(destroys >= 1);
});

test("PDF page rendering is bounded, cleaned and abortable without falling back to page text", async () => {
  const previousDocument = globalThis.document;
  const controller = new AbortController();
  const seen = { renders: 0, cleanups: 0, cancels: 0, destroys: 0 };
  let abortMode = false;
  globalThis.document = { createElement(tag) {
    assert.equal(tag, "canvas");
    return { width: 0, height: 0, getContext: () => ({}) };
  } };
  const page = {
    getViewport: ({ scale }) => ({ width: 3000 * scale, height: 4000 * scale }),
    render({ canvas, viewport }) {
      seen.renders += 1;
      assert.deepEqual({ width: canvas.width, height: canvas.height }, { width: 1200, height: 1600 });
      assert.equal(viewport.height, 1600);
      let rejectRender;
      const promise = abortMode ? new Promise((_resolve, reject) => { rejectRender = reject; }) : Promise.resolve();
      if (abortMode) queueMicrotask(() => controller.abort());
      return { promise, cancel() { seen.cancels += 1; rejectRender?.(Object.assign(new Error("cancelled"), { name: "RenderingCancelledException" })); } };
    },
    cleanup() { seen.cleanups += 1; }
  };
  const library = { GlobalWorkerOptions: {}, getDocument: () => ({
    promise: Promise.resolve({ numPages: 1, getPage: async () => page }),
    async destroy() { seen.destroys += 1; }
  }) };
  try {
    const pdf = await openMarkedFile(fileFor(bytes("%PDF-1.7")), { pdfjsLoader: async () => library });
    await assert.rejects(pdf.renderPage(2), /页码/u);
    const rendered = await pdf.renderPage(1);
    assert.equal(rendered.height, 1600); assert.equal(seen.cleanups, 1);
    abortMode = true;
    await assert.rejects(pdf.renderPage(1, { signal: controller.signal }), { name: "AbortError" });
    assert.equal(seen.cancels, 1); assert.equal(seen.cleanups, 2);
    await pdf.destroy(); assert.equal(seen.destroys, 1);
  } finally { globalThis.document = previousDocument; }
});
