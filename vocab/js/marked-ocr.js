// This adapter deliberately owns the pinned Tesseract.js 7 worker protocol.
// The public createWorker Promise does not expose a worker until initialization
// finishes; owning it here lets cancellation stop even failed/slow startup.
const ASSET_ROOT = new URL("../vendor/tesseract/7.0.0/", import.meta.url);
export const LOCAL_OCR_ASSETS = Object.freeze({
  workerPath: new URL("worker.min.js", ASSET_ROOT).href,
  corePath: new URL("core/", ASSET_ROOT).href.replace(/\/$/u, ""),
  langPath: new URL("lang/", ASSET_ROOT).href.replace(/\/$/u, "")
});
export const LOCAL_OCR_LIMITS = Object.freeze({
  startupTimeoutMs: 60_000,
  recognitionTimeoutMs: 30_000,
  imageEdge: 1600,
  encodedBytes: 8 * 1024 * 1024
});

export class LocalMarkedOcrError extends Error {
  constructor(message, { code = "local_ocr_failed", action = "" } = {}) {
    super(message); this.name = "LocalMarkedOcrError"; this.code = code; this.action = action;
  }
}

function stopped() { return new DOMException("本地文字识别已停止。", "AbortError"); }
function checkAbort(signal) { if (signal?.aborted) throw stopped(); }
function validTimeout(value, fallback) { return Number.isFinite(value) && value > 0 ? Math.min(value, 120_000) : fallback; }

function pngBytes(canvas, signal, timeoutMs) {
  checkAbort(signal);
  if (!canvas || !Number.isSafeInteger(canvas.width) || !Number.isSafeInteger(canvas.height)
    || canvas.width < 1 || canvas.height < 1 || Math.max(canvas.width, canvas.height) > LOCAL_OCR_LIMITS.imageEdge
    || typeof canvas.toBlob !== "function") throw new LocalMarkedOcrError("请先生成不超过 1600 像素的本地文字区域。", { code: "invalid_ocr_image" });
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(stopped());
    const timer = setTimeout(() => finish(new LocalMarkedOcrError("本地图片编码等待过久，已停止处理。", { code: "ocr_timeout", action: "encode" })), validTimeout(timeoutMs, LOCAL_OCR_LIMITS.recognitionTimeoutMs));
    signal?.addEventListener("abort", abort, { once: true });
    try {
      canvas.toBlob(async (blob) => {
        try {
          if (finished) return;
          checkAbort(signal);
          if (!blob || blob.size < 1 || blob.size > LOCAL_OCR_LIMITS.encodedBytes) throw new LocalMarkedOcrError("文字区域图片过大或无法编码，请缩小区域后重试。", { code: "invalid_ocr_image" });
          const bytes = new Uint8Array(await blob.arrayBuffer()); checkAbort(signal);
          finish(null, bytes);
        } catch (error) { finish(error); }
      }, "image/png");
    } catch (error) { finish(error); }
  });
}

export function createMarkedOcrController({
  workerFactory = (url) => new Worker(url),
  onProgress = () => {},
  assets = LOCAL_OCR_ASSETS
} = {}) {
  let worker;
  try { worker = workerFactory(assets.workerPath); }
  catch { throw new LocalMarkedOcrError("当前浏览器无法启动本地文字识别。", { code: "worker_unavailable" }); }
  if (!worker || typeof worker.postMessage !== "function" || typeof worker.terminate !== "function") throw new LocalMarkedOcrError("本地识别引擎启动失败。", { code: "worker_unavailable" });
  const workerId = `zhuo-local-ocr-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
  const pending = new Map();
  let serial = 0, closed = false, initialized = false, initialization = null, recognizing = false;

  function terminate(reason = stopped()) {
    if (closed) return;
    closed = true; initialized = false;
    worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
    try { worker.terminate(); } catch { /* still settle all owned jobs if the browser worker is already gone */ }
    for (const job of pending.values()) { job.cleanup(); job.reject(reason); }
    pending.clear();
  }
  function report(callback, value) {
    try { callback(value); } catch { /* a presentation callback must not corrupt the worker lifecycle */ }
  }
  worker.onerror = (event) => {
    event.preventDefault?.();
    terminate(new LocalMarkedOcrError("本地文字识别引擎无法运行，请检查浏览器与识别文件后重试。", { code: "worker_error" }));
  };
  worker.onmessageerror = () => terminate(new LocalMarkedOcrError("本地识别引擎返回了无法读取的数据。", { code: "worker_message_error" }));
  worker.onmessage = ({ data: packet }) => {
    if (closed || !packet || packet.workerId !== workerId) return;
    const job = pending.get(packet.jobId);
    if (!job || packet.action !== job.action) return;
    if (packet.status === "progress") {
      const progress = Number(packet.data?.progress);
      const value = { action: job.action, status: String(packet.data?.status || "").slice(0, 100),
        progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0 };
      report(onProgress, value); if (job.onProgress) report(job.onProgress, value);
      return;
    }
    if (packet.status === "reject") {
      terminate(new LocalMarkedOcrError(`本地文字识别没有完成（${job.action}），请稍后重试；没有上传页图。`, { code: "ocr_job_failed", action: job.action }));
      return;
    }
    if (packet.status !== "resolve") return;
    pending.delete(packet.jobId); job.cleanup(); job.resolve({ jobId: packet.jobId, data: packet.data });
  };

  function request(action, payload, { signal, timeoutMs, onProgress: jobProgress, transfer = [] } = {}) {
    checkAbort(signal);
    if (closed) return Promise.reject(new LocalMarkedOcrError("本地识别引擎已停止，请重新开始识别。", { code: "worker_closed", action }));
    const jobId = `${workerId}-job-${++serial}`;
    return new Promise((resolve, reject) => {
      const abort = () => terminate(stopped());
      const timer = setTimeout(() => terminate(new LocalMarkedOcrError("本地文字识别等待过久，已停止处理；可以重新开始。", { code: "ocr_timeout", action })), validTimeout(timeoutMs, LOCAL_OCR_LIMITS.recognitionTimeoutMs));
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
      pending.set(jobId, { action, resolve, reject, cleanup, onProgress: jobProgress });
      signal?.addEventListener("abort", abort, { once: true });
      try { worker.postMessage({ workerId, jobId, action, payload }, transfer); }
      catch { terminate(new LocalMarkedOcrError("无法把文字区域送入本机识别引擎。", { code: "worker_send_failed", action })); }
    });
  }

  async function initialize({ signal, timeoutMs = LOCAL_OCR_LIMITS.startupTimeoutMs, onProgress: jobProgress } = {}) {
    checkAbort(signal);
    if (closed) throw new LocalMarkedOcrError("本地识别引擎已停止，请重新开始识别。", { code: "worker_closed" });
    if (initialized) return;
    if (initialization) return initialization;
    const deadline = Date.now() + validTimeout(timeoutMs, LOCAL_OCR_LIMITS.startupTimeoutMs);
    const settings = () => ({ signal, timeoutMs: Math.max(1, deadline - Date.now()), onProgress: jobProgress });
    initialization = (async () => {
      await request("load", { options: { lstmOnly: true, corePath: assets.corePath, logging: false } }, settings());
      await request("loadLanguage", { langs: ["eng"], options: {
        langPath: assets.langPath, cachePath: "zhuo-local-ocr-eng-7.0.0", cacheMethod: "write", gzip: true, lstmOnly: true
      } }, settings());
      await request("initialize", { langs: "eng", oem: 1, config: {} }, settings());
      checkAbort(signal); initialized = true;
    })();
    try { await initialization; }
    catch (error) { terminate(error); throw error; }
  }

  async function recognizeImageBytes(bytes, { signal, timeoutMs = LOCAL_OCR_LIMITS.recognitionTimeoutMs, onProgress: jobProgress, psm = "7" } = {}) {
    checkAbort(signal);
    if (!initialized || closed) throw new LocalMarkedOcrError("本地识别引擎尚未准备好，请重新开始。", { code: "worker_not_ready" });
    if (recognizing) throw new LocalMarkedOcrError("正在处理另一个文字区域，请依次识别。", { code: "ocr_busy" });
    if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > LOCAL_OCR_LIMITS.encodedBytes
      || !["6", "7", "8", "11", "13"].includes(String(psm))) throw new LocalMarkedOcrError("文字区域图片或识别方式不正确。", { code: "invalid_ocr_image" });
    const image = new Uint8Array(bytes);
    recognizing = true;
    try {
      return await request("recognize", { image,
        options: { tessedit_pageseg_mode: String(psm), user_defined_dpi: "300", preserve_interword_spaces: "1", rotateAuto: false },
        output: { text: true, blocks: true, tsv: true, hocr: false, pdf: false, imageColor: false, imageGrey: false, imageBinary: false, debug: false }
      }, { signal, timeoutMs, onProgress: jobProgress, transfer: [image.buffer] });
    } finally { recognizing = false; }
  }

  async function recognizeLineCanvas(canvas, options = {}) {
    const deadline = Date.now() + validTimeout(options.timeoutMs, LOCAL_OCR_LIMITS.recognitionTimeoutMs);
    try {
      const bytes = await pngBytes(canvas, options.signal, Math.max(1, deadline - Date.now()));
      return await recognizeImageBytes(bytes, { ...options, timeoutMs: Math.max(1, deadline - Date.now()) });
    } catch (error) {
      if (error?.name === "AbortError" || error?.code === "ocr_timeout") terminate(error);
      throw error;
    }
  }
  return { initialize, recognizeImageBytes, recognizeLineCanvas, terminate };
}

export async function createLocalMarkedOcr(options = {}) {
  checkAbort(options.signal);
  const controller = createMarkedOcrController(options);
  try {
    await controller.initialize({ signal: options.signal, timeoutMs: options.startupTimeoutMs, onProgress: options.startupProgress });
    return controller;
  } catch (error) { controller.terminate(error); throw error; }
}
