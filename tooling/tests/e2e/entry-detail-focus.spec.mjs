import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

for (const implementation of ["entry-detail-v113.js", "entry-detail-v108.js", "entry-detail.js"]) {
  test.describe(implementation, () => {
    test.beforeEach(async ({ page }) => {
      // Exercise each retained controller against the same actual public shell.
      // Only its implementation bytes differ; normal imports, cards and events run.
      if (implementation !== "entry-detail-v113.js") {
        const body = await readFile(new URL(`../../../vocab/js/${implementation}`, import.meta.url));
        await page.route("**/js/entry-detail-v113.js?*", route => route.fulfill({ body, contentType: "text/javascript" }));
      }
      await page.goto("/");
      await page.locator("#entry-grid button[data-entry-id]").first().click();
      await expect(page.locator("#entry-dialog")).toBeVisible();
    });

    for (const target of ["lookup-input", "library-search", "dictionary-link"]) {
      test(`a queued close preserves a new focus choice on ${target}`, async ({ page }) => {
        const focused = await page.evaluate(async id => {
          const dialog = document.getElementById("entry-dialog");
          const closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
          dialog.close();
          // Native close is queued. A quick reader can move to another control
          // before it arrives; the delayed handler must not undo that choice.
          document.getElementById(id).focus({ preventScroll: true });
          await closed;
          return document.activeElement?.id;
        }, target);
        expect(focused).toBe(target);
        await expect(page.locator(`#${target}`)).toBeFocused();
        await expect(page.locator("#entry-dialog")).toBeHidden();
      });
    }

    test("a replaced invoker still receives fallback focus when no new control was chosen", async ({ page }) => {
      const focused = await page.evaluate(async () => {
        const dialog = document.getElementById("entry-dialog");
        const original = document.querySelector("#entry-grid button[data-entry-id]");
        const replacement = original.cloneNode(true);
        replacement.id = "replacement-entry-invoker";
        original.replaceWith(replacement);
        const closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
        dialog.close();
        await closed;
        return document.activeElement?.id;
      });
      expect(focused).toBe("replacement-entry-invoker");
    });

    test("native Escape returns to the connected invoker", async ({ page }) => {
      const invoker = page.locator("#entry-grid button[data-entry-id]").first();
      await page.keyboard.press("Escape");
      await expect(page.locator("#entry-dialog")).toBeHidden();
      await expect(invoker).toBeFocused();
    });

    test("a queued old close does not clear a newly reopened card", async ({ page }) => {
      const result = await page.evaluate(async () => {
        const dialog = document.getElementById("entry-dialog");
        const closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
        dialog.close();
        const next = document.querySelectorAll("#entry-grid button[data-entry-id]")[1];
        next.click();
        const term = document.getElementById("dialog-term").textContent;
        await closed;
        return { open: dialog.open, term, after: document.getElementById("dialog-term").textContent,
          focusInside: dialog.contains(document.activeElement) };
      });
      expect(result.open).toBe(true);
      expect(result.after).toBe(result.term);
      expect(result.focusInside).toBe(true);
    });

    test("closing active recall returns focus to the study launcher", async ({ page }) => {
      await page.keyboard.press("Escape");
      await expect(page.locator("#entry-dialog")).toBeHidden();
      await page.locator("#study-button").click();
      await expect(page.locator("#entry-dialog")).toBeVisible();
      await expect(page.locator("#recall-controls")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#entry-dialog")).toBeHidden();
      await expect(page.locator("#study-button")).toBeFocused();
    });

    test("mobile Enter after a quick return to lookup searches instead of reopening the card", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(async () => {
        const dialog = document.getElementById("entry-dialog");
        const closed = new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
        dialog.close();
        const input = document.getElementById("lookup-input");
        input.value = "abacus";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus({ preventScroll: true });
        await closed;
      });
      // Send to the actual focused element, not locator.press(), which would
      // refocus the input and conceal the delayed-close defect.
      await page.keyboard.press("Enter");
      await expect(page.locator("#lookup-result")).toBeVisible();
      await expect(page.locator("#lookup-term")).toHaveText("abacus");
      await expect(page.locator("#lookup-meaning")).toContainText("算盘");
      await expect(page.locator("#entry-dialog")).toBeHidden();
      await expect(page.locator("#lookup-receipts button")).toHaveCount(0);
    });
  });
}
