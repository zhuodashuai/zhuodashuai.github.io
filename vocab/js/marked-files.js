export const MARKED_FILE_LIMITS = Object.freeze({
  pdfBytes: 100 * 1024 * 1024,
  imageBytes: 20 * 1024 * 1024,
  pdfPages: 1000,
  batchPages: 5,
  imagePixels: 40_000_000,
  pdfImagePixels: 16_000_000,
  imageEdge: 1600,
  requestImageBytes: 2 * 1024 * 1024
});

export function markedAbortError() {
  return new DOMException("文件处理已停止。", "AbortError");
}

function checkAbort(signal) { if (signal?.aborted) throw markedAbortError(); }

export function detectMarkedFileKind(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error("文件内容无法读取。");
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "pdf";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  const brand = String.fromCharCode(...bytes.slice(4, 24));
  if (/ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/u.test(brand)) throw new Error("暂不支持 HEIC/HEIF 照片，请转换为 JPG/PNG，或使用相机的“兼容性最佳”格式。");
  throw new Error("仅支持真实的 PDF、JPG 和 PNG 文件；更改文件后缀不能转换格式。");
}

export function markedImageDimensions(bytes, kind) {
  if (kind === "png") {
    if (bytes.length < 24) throw new Error("PNG 文件不完整。");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (kind === "jpeg") {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 255) { offset += 1; continue; }
      while (bytes[offset] === 255) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) break;
        return { width: (bytes[offset + 5] << 8) | bytes[offset + 6], height: (bytes[offset + 3] << 8) | bytes[offset + 4] };
      }
      offset += length;
    }
    throw new Error("无法读到 JPG 图片尺寸，文件可能损坏。");
  }
  throw new Error("图片格式暂不支持。");
}

export function parseMarkedPageSelection(value, pageCount, maximum = MARKED_FILE_LIMITS.batchPages) {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > MARKED_FILE_LIMITS.pdfPages) throw new Error("文档页数不正确。");
  const input = String(value || "").normalize("NFKC").replace(/[，；;]/gu, ",").replace(/[–—]/gu, "-").trim();
  if (!input) throw new Error("请先填写要识别的页码，例如 1,3-5。");
  const result = new Set();
  for (const token of input.split(",")) {
    const match = /^(\d+)\s*(?:-\s*(\d+))?$/u.exec(token.trim());
    if (!match) throw new Error("页码请使用逗号或范围，例如 1,3-5。");
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > pageCount) throw new Error(`页码必须在 1–${pageCount} 之间，范围不能倒写。`);
    if (end - start + 1 > maximum) throw new Error(`每批最多识别 ${maximum} 页，请分批处理。`);
    for (let page = start; page <= end; page += 1) result.add(page);
    if (result.size > maximum) throw new Error(`每批最多识别 ${maximum} 页，请分批处理。`);
  }
  return [...result].sort((left, right) => left - right);
}

export function fitMarkedImage(width, height, maximum = MARKED_FILE_LIMITS.imageEdge) {
  if (![width, height, maximum].every((value) => Number.isFinite(value) && value > 0)) throw new Error("图片尺寸不正确。");
  const scale = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export function markedDataUrlBytes(value) {
  if (typeof value !== "string" || !/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]*={0,2}$/u.test(value)) throw new Error("识别图片编码不正确。");
  const data = value.slice(value.indexOf(",") + 1);
  if (!data.length || data.length % 4 !== 0) throw new Error("识别图片编码不正确。");
  return Math.floor(data.length * 3 / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
}

export function encodeMarkedPage(canvas) {
  for (const quality of [0.88, 0.76, 0.64, 0.5]) {
    const image = canvas.toDataURL("image/jpeg", quality);
    if (markedDataUrlBytes(image) <= MARKED_FILE_LIMITS.requestImageBytes) return image;
  }
  throw new Error("压缩后的页面仍超过 2 MiB；请裁剪为标记区域后重新选择图片。");
}

function canvasFor(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
}

async function imageSource(file, signal) {
  checkAbort(signal);
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (signal?.aborted) { bitmap.close(); throw markedAbortError(); }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const image = new Image();
    const cleanup = () => { signal?.removeEventListener("abort", abort); reader.onload = null; reader.onerror = null; image.onload = null; image.onerror = null; };
    const abort = () => { cleanup(); reader.abort(); image.removeAttribute("src"); reject(markedAbortError()); };
    signal?.addEventListener("abort", abort, { once: true });
    reader.onerror = () => { cleanup(); reject(new Error("照片无法读取，请重新选择 JPG/PNG。")); };
    reader.onload = () => { image.src = String(reader.result || ""); };
    image.onerror = () => { cleanup(); reject(new Error("照片无法解码，请重新选择 JPG/PNG。")); };
    image.onload = () => { cleanup(); resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => image.removeAttribute("src") }); };
    reader.readAsDataURL(file);
  });
}

export async function openMarkedFile(file, { signal, onProgress = () => {}, pdfjsLoader = () => import("../vendor/pdfjs/pdf.mjs?v=6.4.299") } = {}) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || typeof file.arrayBuffer !== "function") throw new Error("请选择非空的 PDF 或 JPG/PNG 文件。");
  if (file.size > MARKED_FILE_LIMITS.pdfBytes) throw new Error("文件超过 100 MiB，请先拆分 PDF 或压缩图片。");
  checkAbort(signal);
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  checkAbort(signal);
  const kind = detectMarkedFileKind(header);
  if (kind !== "pdf" && file.size > MARKED_FILE_LIMITS.imageBytes) throw new Error("图片超过 20 MiB，请先裁剪或压缩。");
  onProgress("正在本地读取文件；原文件不会上传。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkAbort(signal);
  if (detectMarkedFileKind(bytes) !== kind) throw new Error("文件内容不一致，请重新选择。");
  const hashBytes = await crypto.subtle.digest("SHA-256", bytes);
  checkAbort(signal);
  const fileHash = [...new Uint8Array(hashBytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let closed = false;
  if (kind !== "pdf") {
    const size = markedImageDimensions(bytes, kind);
    if (!size.width || !size.height || size.width * size.height > MARKED_FILE_LIMITS.imagePixels) throw new Error("照片像素过大（最多 4000 万像素），请先裁剪或使用标准相机分辨率。");
    return {
      kind: "image", fileName: String(file.name || "照片"), fileHash, pageCount: 1,
      async renderPage(pageNumber, { signal: renderSignal } = {}) {
        if (closed || pageNumber !== 1) throw new Error("照片已关闭或页码不正确。");
        checkAbort(renderSignal);
        const decoded = await imageSource(file, renderSignal);
        try {
          if (decoded.width * decoded.height > MARKED_FILE_LIMITS.imagePixels) throw new Error("照片像素过大，请先裁剪。");
          const dimensions = fitMarkedImage(decoded.width, decoded.height);
          const canvas = canvasFor(dimensions.width, dimensions.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("当前浏览器无法显示照片，请升级浏览器后重试。");
          context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
          checkAbort(renderSignal);
          if (closed) throw markedAbortError();
          return canvas;
        } finally { decoded.close(); }
      },
      async destroy() { closed = true; }
    };
  }
  onProgress("正在本地打开 PDF，请稍候…");
  const pdfjs = await pdfjsLoader();
  checkAbort(signal);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.mjs?v=6.4.299", import.meta.url).href;
  const task = pdfjs.getDocument({
    data: bytes, useWasm: false, isEvalSupported: false, enableXfa: false,
    disableFontFace: true, useSystemFonts: true,
    standardFontDataUrl: new URL("../vendor/pdfjs/standard_fonts/", import.meta.url).href,
    maxImageSize: MARKED_FILE_LIMITS.pdfImagePixels
  });
  const abortLoading = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener("abort", abortLoading, { once: true });
  let pdf;
  try {
    pdf = await task.promise;
    checkAbort(signal);
    if (pdf.numPages > MARKED_FILE_LIMITS.pdfPages) throw new Error("PDF 超过 1000 页，请先拆分为章节文件。");
  } catch (error) {
    await task.destroy().catch(() => {});
    if (signal?.aborted) throw markedAbortError();
    if (error?.name === "PasswordException") throw new Error("暂不支持加密或需要密码的 PDF，请先用原软件解锁后再选择。");
    throw new Error(error?.message || "PDF 无法打开，文件可能损坏或浏览器不支持。");
  } finally { signal?.removeEventListener("abort", abortLoading); }
  let activeRender = null;
  return {
    kind: "pdf", fileName: String(file.name || "文档.pdf"), fileHash, pageCount: pdf.numPages,
    async renderPage(pageNumber, { signal: renderSignal } = {}) {
      if (closed || !Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new Error("PDF 已关闭或页码不正确。");
      checkAbort(renderSignal);
      activeRender?.cancel();
      const page = await pdf.getPage(pageNumber);
      checkAbort(renderSignal);
      const original = page.getViewport({ scale: 1 });
      const scale = Math.min(2, MARKED_FILE_LIMITS.imageEdge / Math.max(original.width, original.height));
      const viewport = page.getViewport({ scale });
      const canvas = canvasFor(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器无法显示 PDF 页面。");
      const rendering = page.render({ canvasContext: context, canvas, viewport, background: "rgb(255,255,255)" });
      activeRender = rendering;
      const abortRender = () => rendering.cancel();
      renderSignal?.addEventListener("abort", abortRender, { once: true });
      try {
        await rendering.promise;
        checkAbort(renderSignal);
        if (closed) throw markedAbortError();
        return canvas;
      } catch (error) {
        if (renderSignal?.aborted || closed || error?.name === "RenderingCancelledException") throw markedAbortError();
        throw new Error("这一页无法完整显示；请换用清晰的 JPG/PNG 页面照片，不会尝试收录整页文字。");
      } finally {
        renderSignal?.removeEventListener("abort", abortRender);
        if (activeRender === rendering) activeRender = null;
        page.cleanup();
      }
    },
    async destroy() { if (closed) return; closed = true; activeRender?.cancel(); await task.destroy().catch(() => {}); }
  };
}
