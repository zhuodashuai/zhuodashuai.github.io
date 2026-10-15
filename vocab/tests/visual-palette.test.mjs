import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../styles.css", import.meta.url), "utf8");

// Inspect only the explicit declarations used by this design contract. Browser
// layout tests cover the cascade; this is not a replacement CSS implementation.
function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^{}]*)\\}`));
  assert.ok(match, `Missing palette rule: ${selector}`);
  return Object.fromEntries(match[1].split(";").filter((part) => part.includes(":"))
    .map((part) => {
      const colon = part.indexOf(":");
      return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
    }));
}

const tokens = declarations(":root");

function color(value) {
  const variable = value.match(/^var\((--[\w-]+)\)$/);
  if (variable) {
    assert.ok(tokens[variable[1]], `Missing color token: ${variable[1]}`);
    return color(tokens[variable[1]]);
  }
  if (value === "white") value = "#ffffff";
  assert.match(value, /^#[\da-f]{3}(?:[\da-f]{3})?$/i, `Expected an opaque CSS palette color, got ${value}`);
  const hex = value.length === 4 ? value.slice(1).split("").map((digit) => digit + digit).join("") : value.slice(1);
  return hex.match(/../g).map((channel) => parseInt(channel, 16) / 255);
}

function luminance(value) {
  const [red, green, blue] = color(value).map((channel) => channel <= .04045
    ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * red + .7152 * green + .0722 * blue;
}

function assertContrast(foreground, background, minimum, label) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  const ratio = (light + .05) / (dark + .05);
  assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
}

const cardBackground = declarations(".word-card").background;
const fieldRule = declarations("input, textarea, select");
const shellBackground = declarations(".library-shell").background;

test("normal text, secondary text and vocabulary metadata remain readable on study surfaces", () => {
  for (const background of ["var(--paper)", cardBackground, shellBackground, "var(--green-soft)"]) {
    for (const foreground of ["var(--ink)", "var(--muted)", "var(--green-2)"]) {
      assertContrast(foreground, background, 4.5, `${foreground} on ${background}`);
    }
  }
  const primary = declarations(".primary-link, .primary-button");
  assertContrast(primary.color, primary.background, 4.5, "Primary action text");
  const meaning = declarations(".word-card .card-meaning");
  assertContrast(meaning.color, cardBackground, 4.5, "Card meaning text");
  const tags = declarations(".tag-list span, .attribution-chip");
  assertContrast(tags.color, tags.background, 4.5, "Tag text");
});

test("selected navigation stays readable and distinct without competing with primary actions", () => {
  for (const selector of [
    '.collection-tabs button[aria-pressed="true"], .chapter-tabs button[aria-pressed="true"]',
    '.filter-row button[aria-pressed="true"]',
    '.view-controls button[aria-pressed="true"]'
  ]) {
    const selected = declarations(selector);
    assertContrast(selected.color, selected.background, 4.5, `${selector} text`);
    assertContrast(selected["border-color"], selected.background, 3, `${selector} selected border`);
    assert.notDeepEqual(color(selected.background), color(declarations(".study-launch").background), "Selection is not another primary action");
  }
});

test("focus indicator is visible against page, card, selected sage and dark action surfaces", () => {
  const focus = declarations(":focus-visible");
  assert.match(focus.outline, /^3px solid var\(--focus\)$/);
  for (const background of ["var(--paper)", cardBackground, shellBackground, "var(--green-soft)", "var(--green)"]) {
    assertContrast("var(--focus)", background, 3, `Keyboard focus on ${background}`);
  }
});

test("input and button boundaries use the accessible control token, not decorative separators", () => {
  assert.match(fieldRule.border, /var\(--control-border\)/);
  assert.match(declarations("button").border, /var\(--control-border\)/);
  assert.notEqual(tokens["--control-border"], tokens["--line"]);
  for (const background of [fieldRule.background, cardBackground, shellBackground]) {
    assertContrast("var(--control-border)", background, 3, `Control boundary on ${background}`);
  }
});

test("input keyboard focus keeps its outline instead of relying on a faint shadow", () => {
  const pointerFocus = declarations("input:focus, textarea:focus, select:focus");
  assert.doesNotMatch(pointerFocus.outline || "", /\bnone\b|^0(?:px)?(?:\s|$)/);
  const keyboardFocus = declarations("input:focus-visible, textarea:focus-visible, select:focus-visible");
  assert.match(keyboardFocus.outline, /^3px solid var\(--focus\)$/);
  assert.ok(parseFloat(keyboardFocus["outline-offset"]) >= 2);
});

test("card elevation is restricted to precise hover pointers and reduced motion remains respected", () => {
  const hover = source.match(/@media\s*\(hover:\s*hover\)\s+and\s*\(pointer:\s*fine\)\s*\{\s*\.word-card:hover\s*\{[^}]*\}\s*\}/);
  assert.ok(hover, "Card elevation must not stick after a mobile tap");
  assert.doesNotMatch(source.replace(hover[0], ""), /\.word-card:hover\s*\{/);
  assert.match(source, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?transition-duration:\s*\.001ms\s*!important/);
});
