import assert from "node:assert/strict";
import test from "node:test";
import { detectColoredUnderlines, markedFocusGeometry, focusMarkedPage, mapMarkedRegion, markedFocusHints } from "../js/marked-focus.js";

const COLORS = { paper: [238, 235, 220, 255], black: [24, 24, 24, 255], blue: [30, 55, 180, 255], red: [200, 35, 30, 255] };
function page(width = 400, height = 500, color = COLORS.paper) {
  const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  rectangle(image, 0, 0, width, height, color); return image;
}
function rectangle(image, left, top, width, height, color) {
  for (let y = top; y < Math.min(image.height, top + height); y += 1) for (let x = left; x < Math.min(image.width, left + width); x += 1) {
    if (x >= 0 && y >= 0) image.data.set(color, (y * image.width + x) * 4);
  }
}
function underline(image, x, y, width = 90, color = COLORS.blue) {
  rectangle(image, x, y, width, 2, color);
  // Several separate shapes stand in for ink contrast, not any known text.
  for (let glyph = x + 3; glyph < x + width - 3; glyph += 10) rectangle(image, glyph, y - 11, 4, 6, COLORS.black);
}

test("blue and red pen strips need nearby printed contrast, without depending on word text or fixed page positions", () => {
  for (const offset of [0, 35, 85]) {
    const image = page(); underline(image, 40 + offset, 120 + offset); underline(image, 90 + offset, 320, 100, COLORS.red);
    const marks = detectColoredUnderlines(image);
    assert.deepEqual(marks.map((mark) => mark.box), [[40 + offset, 120 + offset, 90, 2], [90 + offset, 320, 100, 2]]);
    assert.deepEqual(marks.map((mark) => mark.color), ["blue", "red"]);
    assert.ok(marks.every((mark) => !Object.hasOwn(mark, "text")));
  }
});

test("blank blue paper/desk borders, solid colored regions and dark keyboard-like backgrounds are not underline evidence", () => {
  const blank = page(); rectangle(blank, 50, 150, 200, 3, COLORS.blue);
  assert.deepEqual(detectColoredUnderlines(blank), []);
  const dark = page(400, 500, [35, 35, 35, 255]); rectangle(dark, 40, 200, 180, 2, COLORS.blue);
  rectangle(dark, 50, 190, 100, 6, [8, 8, 8, 255]); assert.deepEqual(detectColoredUnderlines(dark), []);
  const solid = page(); rectangle(solid, 20, 20, 300, 250, COLORS.blue);
  assert.deepEqual(detectColoredUnderlines(solid), []);
  const vertical = page(); rectangle(vertical, 100, 70, 3, 300, COLORS.red);
  assert.deepEqual(detectColoredUnderlines(vertical), []);
});

test("unmarked, black-pencil, broad highlight and circle-only pages use the unchanged original canvas", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement() { throw new Error("fallback must not draw a substitute image"); } };
  try {
    for (const color of [COLORS.black, [250, 235, 20, 255]]) {
      const image = page(); underline(image, 70, 180, 150, color);
      const source = { width: image.width, height: image.height, getContext: () => ({ getImageData: () => image }) };
      const result = focusMarkedPage(source);
      assert.equal(result.canvas, source); assert.equal(result.focused, false); assert.deepEqual(result.marks, []);
    }
    const circle = page();
    rectangle(circle, 60, 150, 100, 2, COLORS.blue); rectangle(circle, 60, 210, 100, 2, COLORS.blue);
    rectangle(circle, 60, 150, 2, 62, COLORS.blue); rectangle(circle, 158, 150, 2, 62, COLORS.blue);
    assert.deepEqual(detectColoredUnderlines(circle), []);
  } finally { globalThis.document = previousDocument; }
});

test("all credible underlines including separated line-wrap fragments are inside one padded focus, never silently merged into words", () => {
  const image = page(); underline(image, 260, 160, 90); underline(image, 30, 188, 55); underline(image, 170, 310, 75);
  const marks = detectColoredUnderlines(image);
  assert.equal(marks.length, 3);
  const geometry = markedFocusGeometry(image.width, image.height, marks);
  const [left, top, width, height] = geometry.crop;
  for (const mark of marks) {
    assert.ok(left <= mark.box[0] && top <= mark.box[1]);
    assert.ok(left + width >= mark.box[0] + mark.box[2] && top + height >= mark.box[1] + mark.box[3]);
  }
  assert.equal(geometry.focused, true);
  assert.ok(geometry.transform.outputWidth <= 1600 && geometry.transform.outputHeight <= 1600);
  assert.ok(!JSON.stringify(geometry).includes("word"));
});

test("padding and maximum-1600 upscale are deterministic at the 1600-pixel reference size", () => {
  const marks = [{ box: [326, 80, 300, 6] }, { box: [500, 330, 418, 14] }];
  const geometry = markedFocusGeometry(1200, 1600, marks);
  assert.deepEqual(geometry.crop, [262, 10, 720, 358]);
  assert.equal(geometry.transform.outputWidth, 1600);
  assert.equal(geometry.transform.outputHeight, 796);
  assert.deepEqual(markedFocusGeometry(400, 500, []).crop, [0, 0, 400, 500]);
});

test("focused output only resamples original pixels and never draws a fake mark", () => {
  const previousDocument = globalThis.document;
  const image = page(); underline(image, 100, 200, 90);
  const draws = [], fills = [];
  const source = { width: image.width, height: image.height, getContext: () => ({ getImageData: () => image }) };
  const resultCanvas = { width: 0, height: 0, getContext: () => ({ fillRect: (...args) => fills.push(args), drawImage: (...args) => draws.push(args) }) };
  globalThis.document = { createElement: (tag) => { assert.equal(tag, "canvas"); return resultCanvas; } };
  try {
    const result = focusMarkedPage(source);
    assert.equal(result.canvas, resultCanvas); assert.equal(result.focused, true);
    assert.equal(draws.length, 1); assert.equal(draws[0][0], source);
    assert.deepEqual(draws[0].slice(1, 5), result.crop);
    assert.equal(fills.length, 1); assert.ok(resultCanvas.width <= 1600 && resultCanvas.height <= 1600);
  } finally { globalThis.document = previousDocument; }
});

test("normalized model regions map back to the original preview independent of upscale", () => {
  const transform = markedFocusGeometry(1200, 1600, [{ box: [326, 80, 300, 6] }, { box: [500, 330, 418, 14] }]).transform;
  const region = mapMarkedRegion([0, 0, 1, 1], transform);
  assert.deepEqual(region, [262 / 1200, 10 / 1600, 720 / 1200, 358 / 1600]);
  const smaller = mapMarkedRegion([.25, .5, .4, .1], transform);
  assert.equal(smaller[0], (262 + .25 * 720) / 1200);
  assert.equal(smaller[1], (10 + .5 * 358) / 1600);
  assert.equal(smaller[2], .4 * 720 / 1200);
  assert.equal(smaller[3], .1 * 358 / 1600);
  assert.deepEqual(mapMarkedRegion([.1, .2, .3, .4], markedFocusGeometry(800, 1200, []).transform), [.1, .2, .3, .4]);
  assert.throws(() => mapMarkedRegion([.9, .2, .5, .1], transform), /位置/u);
  assert.throws(() => mapMarkedRegion([0, 0, 1, 1], { ...transform, cropX: -1 }), /映射/u);
});

test("model hints contain only bounded integer ink geometry in the sent crop, never word guesses", () => {
  const marks = [{ box: [326, 80, 300, 6], color: "blue" }, { box: [500, 330, 418, 14], color: "red" }];
  const transform = markedFocusGeometry(1200, 1600, marks).transform;
  const hints = markedFocusHints(marks, transform);
  assert.deepEqual(hints, [
    { region: [89, 196, 417, 16], kind: "underline", color: "blue" },
    { region: [331, 894, 580, 39], kind: "underline", color: "red" }
  ]);
  assert.ok(hints.every((hint) => Object.keys(hint).sort().join() === "color,kind,region"));
  assert.ok(hints.every((hint) => hint.region.every(Number.isInteger) && hint.region.every((value) => value >= 0 && value <= 1000)));
  assert.equal(markedFocusHints(Array.from({ length: 61 }, () => marks[0]), transform).length, 60);
  assert.throws(() => markedFocusHints([{ box: [0, 0, 10, 2], color: "blue" }], transform), /位置/u);
});

test("malformed/oversized pixel buffers and aborted work stop before drawing or AI calls", () => {
  assert.throws(() => detectColoredUnderlines({ width: 2000, height: 1, data: new Uint8ClampedArray(8000) }), /1600/u);
  assert.throws(() => detectColoredUnderlines({ width: 10, height: 10, data: new Uint8ClampedArray(100) }), /有效/u);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => detectColoredUnderlines(page(), { signal: controller.signal }), { name: "AbortError" });
  assert.throws(() => focusMarkedPage(null, { signal: controller.signal }), { name: "AbortError" });
  assert.throws(() => markedFocusGeometry(400, 500, [{ box: [390, 20, 20, 5] }]), /位置/u);
});
