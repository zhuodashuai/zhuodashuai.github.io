import assert from "node:assert/strict";
import test from "node:test";
import { readyAppNavigation } from "../js/app-navigation-ready-v109.js";

function fixture({ failRefresh = false } = {}) {
  const listeners = new Map(), attributes = Array.from({ length: 3 }, () => new Set(["inert", "data-app-navigation-pending"]));
  let href = "./";
  const targets = attributes.map(set => ({ removeAttribute(name) {
    assert(listeners.has("click") && listeners.has("auxclick"), "capture must exist before unlocking");
    assert.equal(new URL(href).searchParams.get("chapter"), "chapter-1", "href must be refreshed before unlocking");
    set.delete(name);
  } }));
  const header = targets[0]; header.getBoundingClientRect = () => ({ height: 80 });
  const link = { getAttribute: () => href, setAttribute(_, next) { if (failRefresh) throw new Error("refresh failed"); href = next; } };
  const window = { addEventListener() {}, removeEventListener() {} };
  const document = { readyState: "complete", defaultView: window,
    querySelector: () => header,
    querySelectorAll: selector => selector.includes("data-app-navigation-pending")
      ? targets.filter((_, index) => attributes[index].has("data-app-navigation-pending")) : [link],
    documentElement: { style: { setProperty() {} } },
    addEventListener(name, listener, capture) { assert.equal(capture, true); assert(!listeners.has(name)); listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); } };
  const location = { href: "http://127.0.0.1:4187/personal?auth=member#wb_book=never-let-me-go&wb_chapter=chapter-1&wb_view=cards&wb_sort=source&wb_site=local" };
  return { document, location, window, attributes, listeners, href: () => href };
}

test("personal header and both auth-mode links unlock only after capture and context refresh", () => {
  const f = fixture(); const controller = readyAppNavigation(f);
  assert(f.attributes.every(set => set.size === 0)); assert.equal(f.listeners.size, 2);
  assert.equal(new URL(f.href()).searchParams.get("book"), "never-let-me-go");
  assert.equal(readyAppNavigation(f), controller); assert.equal(f.listeners.size, 2);
  controller.destroy(); assert.equal(f.listeners.size, 0);
});

test("missing document or failed context refresh never unlocks a pending personal header", () => {
  assert.equal(readyAppNavigation({ document: null, location: null }), null);
  const f = fixture({ failRefresh: true });
  assert.throws(() => readyAppNavigation(f), /refresh failed/u);
  assert(f.attributes.every(set => set.has("inert") && set.has("data-app-navigation-pending")));
});
