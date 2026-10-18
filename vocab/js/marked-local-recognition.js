import { detectColoredUnderlines } from "./marked-focus.js?v=78";
import { createLocalMarkedOcr } from "./marked-ocr.js?v=78";

const LIMIT = 60;
const VARIANTS = ["raw", "clean", "color-binary"];
const stopped = () => new DOMException("本地识别已停止。", "AbortError");
function check(signal) { if (signal?.aborted) throw stopped(); }
function notify(callback, value) { try { callback?.(value); } catch { /* presentation must not change recognition */ } }
function median(values) { values.sort((a, b) => a - b); const mid = (values.length - 1) / 2; return (values[Math.floor(mid)] + values[Math.ceil(mid)]) / 2; }
function colorInk(red, green, blue, color) { return color === "blue" ? blue - red >= 10 && blue - green >= 3 && blue >= 35 : red - green >= 25 && red - blue >= 20 && red >= 60; }
function key(value) { return String(value || "").normalize("NFKC").replace(/[‘’]/gu, "'").trim().replace(/\s+/gu, " ").toLowerCase(); }

/** Literal OCR token normalization only; never a spelling correction. */
export function markedLiteralText(value) {
  if (typeof value !== "string" || value.length > 2000) return "";
  return (value.normalize("NFKC").replace(/[‘’]/gu, "'").match(/[A-Za-z][A-Za-z0-9]*(?:['-][A-Za-z0-9]+)*-?/gu) || []).join(" ").slice(0, 200);
}

/** Rank actual OCR alternatives, never synthesize a term from the lexicon. */
export function selectMarkedOcrAlternative(readings, knownTerms = new Set()) {
  const grouped = new Map();
  for (const reading of readings) {
    const text = markedLiteralText(reading.text);
    if (!text) continue;
    const normalized = key(text);
    const item = grouped.get(normalized) || { text, votes: 0, confidence: 0 };
    item.votes += 1;
    item.confidence = Math.max(item.confidence, Number.isFinite(Number(reading.confidence)) ? Number(reading.confidence) : 0);
    grouped.set(normalized, item);
  }
  if (!grouped.size) return null;
  const items = [...grouped.values()].sort((a, b) => b.votes - a.votes || b.confidence - a.confidence || a.text.localeCompare(b.text));
  let chosen = items[0];
  if (chosen.votes < 2) {
    const attested = items.filter(item => knownTerms.has(key(item.text)));
    if (attested.length === 1) chosen = attested[0];
  }
  return { text: chosen.text, confidence: chosen.confidence,
    certainty: grouped.size === 1 && chosen.votes >= 2 && chosen.confidence >= 40 ? "clear" : "uncertain",
    alternatives: items.filter(item => item !== chosen).map(item => item.text).slice(0, 5) };
}

function quantile(values, proportion) { values.sort((a, b) => a - b); const at = (values.length - 1) * proportion; return values[Math.floor(at)] + (values[Math.ceil(at)] - values[Math.floor(at)]) * (at % 1); }
function contrast(gray) {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value] += 1;
  const cut = gray.length * .01;
  let low = 0, high = 255, count = 0;
  while (low < 255 && count + histogram[low] <= cut) count += histogram[low++];
  count = 0;
  while (high > low && count + histogram[high] <= cut) count += histogram[high--];
  if (high <= low) return gray;
  return Uint8ClampedArray.from(gray, value => (value - low) * 255 / (high - low));
}

/** Small baseline-sheared strips preserve a rare word without whole-page OCR. */
function prepareStrip(image, mark, variant, signal) {
  check(signal);
  const { width: pageWidth, height: pageHeight, data } = image;
  const [x, y, width, height] = mark.box;
  const referenceScale = Math.max(.125, Math.max(pageWidth, pageHeight) / 1600);
  const side = Math.max(2, Math.round(10 * referenceScale));
  // Page resolution does not cap font size: a small screenshot can contain
  // full-size 32 px type. Do not clip ascenders just because the page is short.
  const above = Math.max(32, Math.round(32 * referenceScale));
  const below = Math.max(2, Math.round(6 * referenceScale));
  const left = Math.max(0, x - side), stripWidth = Math.min(pageWidth, x + width + side) - left, stripHeight = above + below;
  const residuals = [];
  for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) {
    const pixel = (row * pageWidth + column) * 4;
    if (colorInk(data[pixel], data[pixel + 1], data[pixel + 2], mark.color)) residuals.push(row - mark.slope * column);
  }
  if (!residuals.length) throw new Error("无法定位原图中的彩色标记，请手动核对。");
  const intercept = median(residuals);
  const rgb = new Uint8ClampedArray(stripWidth * stripHeight * 3);
  const channels = [];
  for (let row = 0; row < stripHeight; row += 1) for (let column = 0; column < stripWidth; column += 1) {
    const sourceX = left + column;
    const sourceY = mark.slope * sourceX + intercept - above + row;
    const top = Math.floor(sourceY), blend = sourceY - top;
    const target = (row * stripWidth + column) * 3;
    for (let channel = 0; channel < 3; channel += 1) {
      const first = top < 0 || top >= pageHeight ? 255 : data[(top * pageWidth + sourceX) * 4 + channel];
      const second = top + 1 < 0 || top + 1 >= pageHeight ? 255 : data[((top + 1) * pageWidth + sourceX) * 4 + channel];
      rgb[target + channel] = first * (1 - blend) + second * blend;
    }
    channels.push(rgb[target + (mark.color === "blue" ? 2 : 0)]);
  }
  const binaryThreshold = Math.min(150, quantile(channels, .75) * .60);
  let gray = new Uint8ClampedArray(stripWidth * stripHeight);
  for (let index = 0; index < gray.length; index += 1) {
    const red = rgb[index * 3], green = rgb[index * 3 + 1], blue = rgb[index * 3 + 2];
    const brightness = (red + green + blue) / 3;
    const colored = mark.color === "blue" ? blue - red >= 6 && blue - green >= 1 : red - green >= 15 && red - blue >= 12;
    gray[index] = variant === "color-binary" ? (rgb[index * 3 + (mark.color === "blue" ? 2 : 0)] < binaryThreshold ? 0 : 255)
      : variant === "clean" && colored && brightness > 65 ? 255 : .299 * red + .587 * green + .114 * blue;
  }
  if (variant !== "color-binary") gray = contrast(gray);
  const strip = document.createElement("canvas"); strip.width = stripWidth; strip.height = stripHeight;
  const context = strip.getContext("2d");
  if (!context) throw new Error("浏览器无法准备本地文字区域。");
  const pixels = context.createImageData(stripWidth, stripHeight);
  for (let index = 0; index < gray.length; index += 1) {
    pixels.data[index * 4] = pixels.data[index * 4 + 1] = pixels.data[index * 4 + 2] = gray[index]; pixels.data[index * 4 + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const border = 20, factor = Math.min(3, (1600 - border * 2) / Math.max(stripWidth, stripHeight));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(stripWidth * factor) + border * 2; canvas.height = Math.round(stripHeight * factor) + border * 2;
  const output = canvas.getContext("2d");
  if (!output) { strip.width = strip.height = 0; throw new Error("浏览器无法放大本地文字区域。"); }
  output.fillStyle = "white"; output.fillRect(0, 0, canvas.width, canvas.height);
  output.imageSmoothingEnabled = true; output.imageSmoothingQuality = "high";
  output.drawImage(strip, border, border, canvas.width - border * 2, canvas.height - border * 2);
  strip.width = strip.height = 0;
  return canvas;
}

function sourceRegion(mark, width, height) {
  const [x, y, w, h] = mark.box, scale = Math.max(.125, Math.max(width, height) / 1600);
  const left = Math.max(0, x - 10 * scale), top = Math.max(0, y - 45 * scale);
  const right = Math.min(width, x + w + 10 * scale), bottom = Math.min(height, y + h + 3 * scale);
  return [left / width, top / height, (right - left) / width, (bottom - top) / height];
}

/** Only an actual OCR trailing hyphen plus right-to-left line wrap permits joining. */
export function joinMarkedLineWraps(items, width, height, knownTerms = new Set()) {
  const scale = Math.max(.125, Math.max(width, height) / 1600), consumed = new Set(), result = [];
  for (let index = 0; index < items.length; index += 1) {
    if (consumed.has(index)) continue;
    const first = items[index]; let partnerIndex = -1;
    if (/^[A-Za-z]+-$/u.test(first.text) && first.mark.box[0] > width * .60) {
      partnerIndex = items.findIndex((second, candidateIndex) => candidateIndex > index && !consumed.has(candidateIndex)
        && /^[a-z]+$/u.test(second.text) && second.mark.color === first.mark.color && second.mark.box[0] < width * .30
        && second.mark.box[1] - first.mark.box[1] >= 25 * scale && second.mark.box[1] - first.mark.box[1] <= 100 * scale);
    }
    if (partnerIndex < 0) { result.push(first); continue; }
    const second = items[partnerIndex]; consumed.add(partnerIndex);
    const left = Math.min(first.region[0], second.region[0]), top = Math.min(first.region[1], second.region[1]);
    const right = Math.max(first.region[0] + first.region[2], second.region[0] + second.region[2]);
    const bottom = Math.max(first.region[1] + first.region[3], second.region[1] + second.region[3]);
    const joined = first.text.slice(0, -1) + second.text;
    const hyphenated = first.text + second.text;
    const joinedKnown = knownTerms.has(key(joined)), hyphenatedKnown = knownTerms.has(key(hyphenated));
    // A printed line-end hyphen can be either lexical (well-known) or a soft
    // wrap. Geometry cannot decide: retain the actual hyphen unless only the
    // dehyphenated literal combination is already independently attested.
    const text = joinedKnown && !hyphenatedKnown ? joined : hyphenated;
    result.push({ ...first, text, originalText: `${first.text}\n${second.text}`, context: text, region: [left, top, right - left, bottom - top],
      certainty: "uncertain", alternatives: [joined, hyphenated].filter(alternative => alternative !== text) });
  }
  return result;
}

export async function createMarkedPageRecognizer({ signal, onProgress, knownTerms = [], ocrFactory = createLocalMarkedOcr } = {}) {
  check(signal);
  if (typeof ocrFactory !== "function") throw new Error("本地识别引擎配置不正确。");
  const known = new Set((Array.isArray(knownTerms) ? knownTerms : []).slice(0, 20_000).filter(term => typeof term === "string" && term.length <= 200).map(key));
  const lifetime = new AbortController(); let engine = null, opening = null, closed = false, busy = false;
  function terminate() { if (closed) return; closed = true; lifetime.abort(); engine?.terminate(); signal?.removeEventListener("abort", terminate); }
  signal?.addEventListener("abort", terminate, { once: true });
  async function getEngine() {
    check(lifetime.signal);
    if (!opening) opening = Promise.resolve().then(() => ocrFactory({ signal: lifetime.signal, onProgress })).then(value => {
      if (closed) { value.terminate(); throw stopped(); } engine = value; return value;
    });
    return opening;
  }
  async function recognizePage(canvas, { signal: pageSignal, onProgress: pageProgress } = {}) {
    check(pageSignal); check(lifetime.signal);
    if (busy) throw new Error("正在识别另一页，请依次处理。");
    if (!canvas?.getContext || !Number.isSafeInteger(canvas.width) || !Number.isSafeInteger(canvas.height)
      || canvas.width < 1 || canvas.height < 1 || Math.max(canvas.width, canvas.height) > 1600) throw new Error("请先准备不超过 1600 像素的页面预览。");
    busy = true; pageSignal?.addEventListener("abort", terminate, { once: true });
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("浏览器无法读取页面。");
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const marks = detectColoredUnderlines(image, { signal: lifetime.signal });
      if (!marks.length) return { candidates: [], warnings: ["未定位到清晰的蓝色或红色下划线；铅笔、黑线和高亮暂不支持，可手动记录。"] };
      if (marks.length > LIMIT) return { candidates: [], warnings: ["这一页的标记过多，请分成较小区域后重试；没有添加词条。"] };
      const skipped = new Set();
      for (const first of marks.filter(mark => mark.box[2] > canvas.width * .35)) {
        const nearby = marks.filter(mark => mark.color === first.color && mark.box[1] >= first.box[1] && mark.box[1] - first.box[1] <= 110 * Math.max(canvas.width, canvas.height) / 1600);
        if (nearby.filter(mark => mark.box[2] > canvas.width * .35).length >= 2) nearby.forEach(mark => skipped.add(mark));
      }
      const relevant = marks.filter(mark => !skipped.has(mark));
      const warnings = skipped.size ? ["发现多行长句标记，本次不将整句拆成单词；请另行核对保存。"] : [];
      if (!relevant.length) return { candidates: [], warnings };
      const worker = await getEngine(), items = [];
      for (const [index, mark] of relevant.entries()) {
        const readings = [];
        for (const variant of VARIANTS) {
          check(lifetime.signal);
          const strip = prepareStrip(image, mark, variant, lifetime.signal);
          try {
            const { data } = await worker.recognizeLineCanvas(strip, { signal: lifetime.signal, psm: "8", timeoutMs: 30_000 });
            readings.push({ text: data?.text || "", confidence: data?.confidence || 0 });
          } finally { strip.width = strip.height = 0; }
        }
        const selected = selectMarkedOcrAlternative(readings, known);
        if (selected) items.push({ ...selected, context: selected.text, markType: "underline", region: sourceRegion(mark, canvas.width, canvas.height), mark });
        else warnings.push("有一处标记未读出清晰英文，请对照原图手动记录。");
        const progress = { status: "recognizing marked words", progress: (index + 1) / relevant.length };
        notify(onProgress, progress); notify(pageProgress, progress);
      }
      const candidates = joinMarkedLineWraps(items, canvas.width, canvas.height, known).map(({ mark: _mark, confidence: _confidence, ...candidate }) => candidate);
      if (candidates.some(candidate => candidate.certainty === "uncertain")) warnings.push("部分词的识别结果有分歧或置信度较低，请对照标记核对后勾选。");
      check(lifetime.signal); return { candidates, warnings: [...new Set(warnings)] };
    } finally { busy = false; pageSignal?.removeEventListener("abort", terminate); }
  }
  return { recognizePage, terminate };
}
