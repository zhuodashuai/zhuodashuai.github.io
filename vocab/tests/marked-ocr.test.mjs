import assert from "node:assert/strict";
import test from "node:test";
import { createLocalMarkedOcr, createMarkedOcrController, LOCAL_OCR_ASSETS } from "../js/marked-ocr.js";

function fakeEngine(handler = () => ({})) {
  const engine = {
    sent: [], transfers: [], terminated: 0, onmessage: null, onerror: null, onmessageerror: null,
    postMessage(packet, transfer) {
      this.sent.push(packet); this.transfers.push(transfer);
      queueMicrotask(async () => {
        const response = await handler(packet, engine);
        if (response === null) return;
        engine.reply(packet, "resolve", response);
      });
    },
    reply(packet, status, data) { this.onmessage?.({ data: { workerId: packet.workerId, jobId: packet.jobId, action: packet.action, status, data } }); },
    terminate() { this.terminated += 1; }
  };
  return engine;
}
const makeReady = async (engine = fakeEngine(), options = {}) => ({ engine, controller: await createLocalMarkedOcr({ workerFactory: () => engine, ...options }) });

test("pinned local worker initializes in a bounded owned protocol and caches only English weights", async () => {
  const { engine, controller } = await makeReady();
  assert.deepEqual(engine.sent.map((packet) => packet.action), ["load", "loadLanguage", "initialize"]);
  assert.deepEqual(engine.sent[0].payload, { options: { lstmOnly: true, corePath: LOCAL_OCR_ASSETS.corePath, logging: false } });
  assert.deepEqual(engine.sent[1].payload, { langs: ["eng"], options: { langPath: LOCAL_OCR_ASSETS.langPath, cachePath: "zhuo-local-ocr-eng-7.0.0", cacheMethod: "write", gzip: true, lstmOnly: true } });
  assert.equal(engine.sent[2].payload.oem, 1);
  assert.match(LOCAL_OCR_ASSETS.workerPath, /\/vendor\/tesseract\/7\.0\.0\/worker\.min\.js$/u);
  assert.ok(!JSON.stringify(engine.sent).includes("cdn")); assert.ok(!JSON.stringify(engine.sent).includes("image"));
  controller.terminate(); controller.terminate(); assert.equal(engine.terminated, 1);
  await assert.rejects(controller.initialize(), { code: "worker_closed" });
});

test("OCR requests typed image bytes and bbox/TSV output without any image/PDF/debug output", async () => {
  const engine = fakeEngine((packet) => packet.action === "recognize" ? { text: "raggy", confidence: 92, blocks: [], tsv: "5\tword" } : {});
  const { controller } = await makeReady(engine);
  const input = new Uint8Array([137, 80, 78, 71]);
  const result = await controller.recognizeImageBytes(input);
  assert.equal(result.data.text, "raggy"); assert.equal(result.data.confidence, 92);
  const packet = engine.sent.at(-1);
  assert.equal(packet.action, "recognize"); assert.deepEqual(packet.payload.image, input);
  assert.notEqual(packet.payload.image, input); assert.deepEqual(engine.transfers.at(-1), [packet.payload.image.buffer]);
  assert.deepEqual(packet.payload.options, { tessedit_pageseg_mode: "7", user_defined_dpi: "300", preserve_interword_spaces: "1", rotateAuto: false });
  assert.equal(packet.payload.output.blocks, true); assert.equal(packet.payload.output.tsv, true);
  for (const key of ["pdf", "imageColor", "imageGrey", "imageBinary", "debug", "hocr"]) assert.equal(packet.payload.output[key], false);
  await controller.recognizeImageBytes(input, { psm: "8" });
  assert.equal(engine.sent.at(-1).payload.options.tessedit_pageseg_mode, "8");
  controller.terminate();
});

test("a language-load rejection immediately settles initialization and terminates the worker", async () => {
  const engine = fakeEngine((packet, owner) => {
    if (packet.action === "loadLanguage") { owner.reply(packet, "reject", "missing weights"); return null; }
    return {};
  });
  await assert.rejects(createLocalMarkedOcr({ workerFactory: () => engine }), { code: "ocr_job_failed", action: "loadLanguage" });
  assert.equal(engine.terminated, 1); assert.equal(engine.sent.length, 2);
});

test("cancellation during the first initialization step terminates without an invisible background worker", async () => {
  const engine = fakeEngine(() => null), abort = new AbortController();
  const loading = createLocalMarkedOcr({ workerFactory: () => engine, signal: abort.signal });
  abort.abort(); await assert.rejects(loading, { name: "AbortError" });
  assert.equal(engine.terminated, 1); assert.equal(engine.sent.length, 1);
  let created = false;
  await assert.rejects(createLocalMarkedOcr({ signal: abort.signal, workerFactory: () => { created = true; return engine; } }), { name: "AbortError" });
  assert.equal(created, false);
});

test("startup and recognition deadlines settle rather than merely terminating an unresolved Promise", async () => {
  const startup = fakeEngine(() => null);
  await assert.rejects(createLocalMarkedOcr({ workerFactory: () => startup, startupTimeoutMs: 5 }), { code: "ocr_timeout" });
  assert.equal(startup.terminated, 1);
  const recognition = fakeEngine((packet) => packet.action === "recognize" ? null : {});
  const { controller } = await makeReady(recognition);
  await assert.rejects(controller.recognizeImageBytes(new Uint8Array([1]), { timeoutMs: 5 }), { code: "ocr_timeout" });
  assert.equal(recognition.terminated, 1);
});

test("one worker accepts only serial OCR jobs and cancelled late packets cannot become results", async () => {
  const engine = fakeEngine((packet) => packet.action === "recognize" ? null : {});
  const { controller } = await makeReady(engine);
  const abort = new AbortController();
  const recognizing = controller.recognizeImageBytes(new Uint8Array([1, 2]), { signal: abort.signal });
  await assert.rejects(controller.recognizeImageBytes(new Uint8Array([3])), { code: "ocr_busy" });
  const lateHandler = engine.onmessage, old = engine.sent.at(-1);
  abort.abort(); await assert.rejects(recognizing, { name: "AbortError" });
  lateHandler({ data: { workerId: old.workerId, jobId: old.jobId, action: old.action, status: "resolve", data: { text: "late" } } });
  await assert.rejects(controller.recognizeImageBytes(new Uint8Array([4])), { code: "worker_not_ready" });
  assert.equal(engine.terminated, 1); assert.equal(engine.sent.filter((packet) => packet.action === "recognize").length, 1);
});

test("progress is bounded, presentation failures are ignored, and wrong-worker packets cannot advance startup", async () => {
  const updates = [];
  const engine = fakeEngine((packet, owner) => {
    owner.onmessage({ data: { ...packet, workerId: "unrelated-worker", status: "resolve", data: { bad: true } } });
    owner.reply(packet, "progress", { status: "recognizing text", progress: 5 });
    return {};
  });
  const { controller } = await makeReady(engine, { onProgress(value) { updates.push(value); throw new Error("bad presentation callback"); } });
  assert.equal(updates.length, 3); assert.ok(updates.every((update) => update.progress === 1));
  assert.equal(engine.sent.length, 3); controller.terminate();
});

test("canvas input is encoded as an in-memory PNG, with no blob URLs or file upload", async () => {
  const { engine, controller } = await makeReady();
  let type;
  const canvas = { width: 500, height: 80, toBlob(callback, mime) { type = mime; callback(new Blob([new Uint8Array([137, 80, 78, 71])])); } };
  await controller.recognizeLineCanvas(canvas);
  assert.equal(type, "image/png"); assert.equal(engine.sent.at(-1).action, "recognize");
  await assert.rejects(controller.recognizeLineCanvas({ ...canvas, width: 1700 }), { code: "invalid_ocr_image" });
  assert.equal(engine.sent.filter((packet) => packet.action === "recognize").length, 1); controller.terminate();
});

test("cancelling PNG encoding also terminates the owned engine before OCR can start", async () => {
  const { engine, controller } = await makeReady(), abort = new AbortController();
  let callback;
  const encoding = controller.recognizeLineCanvas({ width: 100, height: 20, toBlob(done) { callback = done; } }, { signal: abort.signal });
  abort.abort(); await assert.rejects(encoding, { name: "AbortError" });
  callback(new Blob([new Uint8Array([1, 2])]));
  assert.equal(engine.terminated, 1); assert.equal(engine.sent.length, 3);
});

test("a stalled canvas encoder is deadline-bounded before any recognition request", async () => {
  const { engine, controller } = await makeReady();
  await assert.rejects(controller.recognizeLineCanvas({ width: 100, height: 20, toBlob() {} }, { timeoutMs: 5 }), { code: "ocr_timeout", action: "encode" });
  assert.equal(engine.terminated, 1); assert.equal(engine.sent.length, 3);
});

test("native worker errors and message decoding errors reject owned jobs without global uncaught errors", async () => {
  for (const mode of ["error", "messageerror"]) {
    const engine = fakeEngine(() => null), controller = createMarkedOcrController({ workerFactory: () => engine });
    const initializing = controller.initialize();
    let prevented = false;
    if (mode === "error") engine.onerror({ preventDefault() { prevented = true; } }); else engine.onmessageerror({});
    await assert.rejects(initializing, { code: mode === "error" ? "worker_error" : "worker_message_error" });
    if (mode === "error") assert.equal(prevented, true);
    assert.equal(engine.terminated, 1);
  }
});
