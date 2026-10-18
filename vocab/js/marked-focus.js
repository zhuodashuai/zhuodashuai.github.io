const REFERENCE_EDGE = 1600;
const MAX_PIXELS = 1600 * 1600;

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException("标记区域处理已停止。", "AbortError");
}

function validPixels(image) {
  const width = image?.width, height = image?.height, data = image?.data;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || Math.max(width, height) > 1600 || width * height > MAX_PIXELS || !ArrayBuffer.isView(data) || data.length !== width * height * 4) {
    throw new Error("标记区域只处理边长不超过 1600 的有效页面预览。");
  }
  return { width, height, data };
}

function quantile(sorted, proportion) {
  const position = (sorted.length - 1) * proportion;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

// This is color/geometry evidence, not OCR: it never invents a word, decides
// that a word is unknown, or joins text broken across printed lines.
export function detectColoredUnderlines(image, { signal } = {}) {
  const { width, height, data } = validPixels(image);
  abortIfNeeded(signal);
  const scale = Math.max(.125, Math.max(width, height) / REFERENCE_EDGE);
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    // Transparent source pixels are not evidence of colored pen ink.
    if (data[offset + 3] < 200) continue;
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    if (blue - red >= 10 && blue - green >= 3 && blue >= 35) mask[index] = 1;
    else if (red - green >= 25 && red - blue >= 20 && red >= 60) mask[index] = 2;
  }
  const marks = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed]) continue;
    abortIfNeeded(signal);
    const color = mask[seed]; mask[seed] = 0;
    queue[0] = seed;
    let count = 1, cursor = 0;
    let left = width, right = 0, top = height, bottom = 0;
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    while (cursor < count) {
      const index = queue[cursor++], x = index % width, y = Math.floor(index / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      sumX += x; sumY += y; sumXX += x * x; sumXY += x * y;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
          const neighbour = ny * width + nx;
          if (mask[neighbour] !== color) continue;
          mask[neighbour] = 0; queue[count++] = neighbour;
        }
      }
    }
    const markWidth = right - left + 1, markHeight = bottom - top + 1;
    if (count < Math.max(8, 25 * scale * scale) || markWidth < Math.max(6, 24 * scale)
      || markHeight > Math.max(12, 90 * scale)) continue;
    const denominator = count * sumXX - sumX * sumX;
    const slope = denominator > 0 ? (count * sumXY - sumX * sumY) / denominator : 100;
    if (Math.abs(slope) > .35) continue;
    const residuals = new Float64Array(count);
    for (let index = 0; index < count; index += 1) {
      const point = queue[index];
      residuals[index] = Math.floor(point / width) - slope * (point % width);
    }
    residuals.sort();
    const thickness = quantile(residuals, .95) - quantile(residuals, .05) + 1;
    if (markWidth / Math.max(thickness, 1) < 8 || thickness > Math.max(3, 20 * scale)) continue;

    // Desk edges and blue shadows can look like pen strips. Require a light
    // local paper background with a moderate amount of printed-looking ink
    // immediately above; neither blank paper nor a dark keyboard is enough.
    const sampleTop = Math.max(0, top - Math.max(5, Math.round(40 * scale)));
    const sampleCount = (top - sampleTop) * markWidth;
    if (!sampleCount) continue;
    const gray = new Float32Array(sampleCount);
    let sampleIndex = 0;
    for (let y = sampleTop; y < top; y += 1) for (let x = left; x <= right; x += 1) {
      const pixel = (y * width + x) * 4;
      gray[sampleIndex++] = (data[pixel] + data[pixel + 1] + data[pixel + 2]) / 3;
    }
    gray.sort();
    const paperMedian = quantile(gray, .5), inkThreshold = Math.min(160, paperMedian * .75);
    let inkCount = 0;
    for (const value of gray) if (value < inkThreshold) inkCount += 1;
    const inkAboveFraction = inkCount / gray.length;
    if (paperMedian < 70 || inkAboveFraction < .02 || inkAboveFraction > .65) continue;
    marks.push({ box: [left, top, markWidth, markHeight], color: color === 1 ? "blue" : "red",
      pixels: count, slope, thickness, paperMedian, inkAboveFraction });
  }
  abortIfNeeded(signal);
  // Geometry order is only for a stable UI; skewed photos can differ from
  // printed reading order, so consumers must not infer linguistic ordering.
  return marks.sort((first, second) => first.box[1] - second.box[1] || first.box[0] - second.box[0]);
}

export function markedFocusGeometry(width, height, marks, { maximum = 1600, maxUpscale = 4 } = {}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || Math.max(width, height) > 1600 || !Array.isArray(marks)
    || !Number.isFinite(maximum) || maximum < 1 || maximum > 1600
    || !Number.isFinite(maxUpscale) || maxUpscale < 1 || maxUpscale > 8) throw new Error("标记区域尺寸不正确。");
  let cropX = 0, cropY = 0, cropWidth = width, cropHeight = height;
  if (marks.length) {
    const scale = Math.max(.125, Math.max(width, height) / REFERENCE_EDGE);
    let left = width, top = height, right = 0, bottom = 0;
    for (const mark of marks) {
      const box = mark?.box;
      if (!Array.isArray(box) || box.length !== 4 || box.some((value) => !Number.isFinite(value))
        || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0
        || box[0] + box[2] > width || box[1] + box[3] > height) throw new Error("标记位置不正确。");
      left = Math.min(left, box[0]); top = Math.min(top, box[1]);
      right = Math.max(right, box[0] + box[2]); bottom = Math.max(bottom, box[1] + box[3]);
    }
    cropX = Math.max(0, Math.floor(left - 64 * scale));
    cropY = Math.max(0, Math.floor(top - 70 * scale));
    const endX = Math.min(width, Math.ceil(right + 64 * scale));
    const endY = Math.min(height, Math.ceil(bottom + 24 * scale));
    cropWidth = endX - cropX; cropHeight = endY - cropY;
  }
  const focused = cropX !== 0 || cropY !== 0 || cropWidth !== width || cropHeight !== height;
  const outputScale = focused ? Math.min(maxUpscale, maximum / Math.max(cropWidth, cropHeight)) : 1;
  return { focused, crop: [cropX, cropY, cropWidth, cropHeight], transform: {
    originalWidth: width, originalHeight: height, cropX, cropY, cropWidth, cropHeight,
    outputWidth: Math.max(1, Math.round(cropWidth * outputScale)),
    outputHeight: Math.max(1, Math.round(cropHeight * outputScale))
  } };
}

export function focusMarkedPage(canvas, { signal, maximum = 1600, maxUpscale = 4 } = {}) {
  abortIfNeeded(signal);
  if (!canvas || !Number.isSafeInteger(canvas.width) || !Number.isSafeInteger(canvas.height)
    || canvas.width < 1 || canvas.height < 1 || Math.max(canvas.width, canvas.height) > 1600) throw new Error("请先生成不超过 1600 像素的页面预览。");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器无法读取页面标记区域。");
  const marks = detectColoredUnderlines(context.getImageData(0, 0, canvas.width, canvas.height), { signal });
  const geometry = markedFocusGeometry(canvas.width, canvas.height, marks, { maximum, maxUpscale });
  const hints = markedFocusHints(marks, geometry.transform);
  const metadata = { ...geometry, marks, hints, hintLimitExceeded: marks.length > 60 };
  if (!geometry.focused) return { canvas, ...metadata };
  abortIfNeeded(signal);
  const focusedCanvas = document.createElement("canvas");
  focusedCanvas.width = geometry.transform.outputWidth; focusedCanvas.height = geometry.transform.outputHeight;
  const focusedContext = focusedCanvas.getContext("2d");
  if (!focusedContext) throw new Error("浏览器无法生成标记区域图片。");
  focusedContext.fillStyle = "white"; focusedContext.fillRect(0, 0, focusedCanvas.width, focusedCanvas.height);
  focusedContext.imageSmoothingEnabled = true;
  focusedContext.imageSmoothingQuality = "high";
  focusedContext.drawImage(canvas, ...geometry.crop, 0, 0, focusedCanvas.width, focusedCanvas.height);
  abortIfNeeded(signal);
  return { canvas: focusedCanvas, ...metadata };
}

// Hints describe colored ink only. They contain no expected or recovered word
// strings, and their coordinates refer to the exact cropped image being sent.
export function markedFocusHints(marks, transform) {
  if (!Array.isArray(marks)) throw new Error("彩色标记提示不正确。");
  // Validate the transform even when no hints are present.
  mapMarkedRegion([0, 0, 1, 1], transform);
  return marks.slice(0, 60).map((mark) => {
    const box = mark?.box;
    if (!["blue", "red"].includes(mark?.color) || !Array.isArray(box) || box.length !== 4
      || box.some((value) => !Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0
      || box[0] < transform.cropX || box[1] < transform.cropY
      || box[0] + box[2] > transform.cropX + transform.cropWidth
      || box[1] + box[3] > transform.cropY + transform.cropHeight) throw new Error("彩色标记提示位置不正确。");
    const left = Math.max(0, Math.min(999, Math.round((box[0] - transform.cropX) / transform.cropWidth * 1000)));
    const top = Math.max(0, Math.min(999, Math.round((box[1] - transform.cropY) / transform.cropHeight * 1000)));
    const right = Math.max(left + 1, Math.min(1000, Math.round((box[0] + box[2] - transform.cropX) / transform.cropWidth * 1000)));
    const bottom = Math.max(top + 1, Math.min(1000, Math.round((box[1] + box[3] - transform.cropY) / transform.cropHeight * 1000)));
    return { region: [left, top, right - left, bottom - top], kind: "underline", color: mark.color };
  });
}

export function mapMarkedRegion(region, transform) {
  if (!Array.isArray(region) || region.length !== 4 || region.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
    || region[2] <= 0 || region[3] <= 0 || region[0] + region[2] > 1.001 || region[1] + region[3] > 1.001) throw new Error("识别返回的标记位置不正确。");
  const keys = ["originalWidth", "originalHeight", "cropX", "cropY", "cropWidth", "cropHeight"];
  if (!transform || keys.some((key) => !Number.isFinite(transform[key]))
    || transform.originalWidth <= 0 || transform.originalHeight <= 0 || transform.cropWidth <= 0 || transform.cropHeight <= 0
    || transform.cropX < 0 || transform.cropY < 0
    || transform.cropX + transform.cropWidth > transform.originalWidth || transform.cropY + transform.cropHeight > transform.originalHeight) throw new Error("页面标记映射不正确。");
  const [x, y, width, height] = region;
  return [
    (transform.cropX + x * transform.cropWidth) / transform.originalWidth,
    (transform.cropY + y * transform.cropHeight) / transform.originalHeight,
    Math.min(width, 1 - x) * transform.cropWidth / transform.originalWidth,
    Math.min(height, 1 - y) * transform.cropHeight / transform.originalHeight
  ];
}
