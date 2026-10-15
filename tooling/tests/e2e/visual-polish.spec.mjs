import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page }, info) => {
  const run = `visual-${info.workerIndex}-${info.testId}`.replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
  await context.addCookies([{ name: "e2e_run", value: run, url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", (error) => { throw new Error(`Unhandled visual-polish error: ${error.message}`); });
});

function luminance(color) {
  const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

async function openChapter(page) {
  await page.goto("/?book=never-let-me-go&chapter=chapter-12");
  await expect(page.locator("#entry-count")).toHaveText("25");
  await expect(page.locator("#study-button")).toBeEnabled();
  await expect(page.locator("#entry-grid .word-card")).toHaveCount(25);
}

test("desktop selection stays visually secondary to the study action and keyboard search has a visible focus ring", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openChapter(page);
  const palette = await page.evaluate(() => {
    const colors = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return { color: style.color, background: style.backgroundColor };
    };
    return {
      primary: colors("#study-button"),
      selected: ["#collection-tabs", "#chapter-tabs", "#view-controls", "#filter-row"]
        .map((selector) => colors(`${selector} button[aria-pressed="true"]`))
    };
  });
  expect(contrast(palette.primary.color, palette.primary.background)).toBeGreaterThanOrEqual(4.5);
  for (const selected of palette.selected) {
    expect(selected.background).not.toBe(palette.primary.background);
    expect(luminance(selected.background)).toBeGreaterThan(luminance(palette.primary.background));
    expect(contrast(selected.color, selected.background)).toBeGreaterThanOrEqual(4.5);
  }

  const search = page.locator("#library-search");
  await search.focus();
  await expect(search).toBeFocused();
  const focus = await search.evaluate((node) => {
    const style = getComputedStyle(node);
    return { visible: node.matches(":focus-visible"), style: style.outlineStyle,
      width: parseFloat(style.outlineWidth), color: style.outlineColor, background: style.backgroundColor };
  });
  expect(focus.visible).toBe(true);
  expect(focus.style).not.toBe("none");
  expect(focus.width).toBeGreaterThanOrEqual(3);
  expect(contrast(focus.color, focus.background)).toBeGreaterThanOrEqual(3);
  await search.blur();
  await page.screenshot({ path: "qa-artifacts/visual-polish-desktop.png" });
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`review ratings retain distinct treatments, labels and touch targets at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openChapter(page);
    await page.locator("#study-button").click();
    await expect(page.locator("#dialog-meaning")).toBeHidden();
    await page.getByRole("button", { name: "显示释义", exact: true }).click();
    await expect(page.locator("#dialog-meaning")).toBeVisible();
    const buttons = page.locator("#dialog-review-actions button");
    await expect(buttons).toHaveText(["再来一次", "有点难", "记得", "很熟"]);
    for (const button of await buttons.all()) await expect(button).toBeEnabled();
    const ratings = await buttons.evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { color: style.color, background: style.backgroundColor, width: rect.width, height: rect.height };
    }));
    expect(new Set(ratings.map((rating) => rating.background)).size).toBe(4);
    for (const rating of ratings) {
      expect(contrast(rating.color, rating.background)).toBeGreaterThanOrEqual(4.5);
      expect(rating.width).toBeGreaterThanOrEqual(44);
      expect(rating.height).toBeGreaterThanOrEqual(44);
    }
    // Revealing is read-only: do not click any rating or alter study progress.
    await page.getByRole("button", { name: "关闭词条详情", exact: true }).click();
    await expect(page.locator("#entry-dialog")).toBeHidden();
  });
}

for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
  test(`mobile visual polish keeps chapter cards in the first screen without horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openChapter(page);
    const layout = await page.evaluate(() => {
      const firstCard = document.querySelector("#entry-grid .word-card").getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, contentWidth: document.documentElement.scrollWidth,
        firstCardTop: firstCard.top, firstCardBottom: firstCard.bottom, scrollY };
    });
    expect(layout.scrollY).toBe(0);
    expect(layout.contentWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.firstCardTop).toBeGreaterThan(0);
    expect(layout.firstCardTop).toBeLessThan(layout.height - 70);
    expect(layout.firstCardBottom).toBeGreaterThan(layout.firstCardTop);
    await expect(page.getByRole("combobox", { name: "选择章节", exact: true })).toHaveValue("chapter-12");
    if (viewport.width === 390) await page.screenshot({ path: "qa-artifacts/visual-polish-mobile.png" });
  });
}
