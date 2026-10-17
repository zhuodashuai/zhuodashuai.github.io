import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const sw = await read("sw.js");
const manifest = JSON.parse(await read("manifest.webmanifest"));

test("quick notes have visible reader/editor entries and an app shortcut without changing the launch page", async () => {
  assert.match(await read("index.html"), /href="quick-notes\.html"[^>]*>随手记/);
  for (const page of ["owner.html", "guide.html"]) {
    assert.match(await read(page), /href="https:\/\/zhuodashuai\.github\.io\/vocab\/quick-notes\.html"[^>]*>随手记/);
  }
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.shortcuts.some((item) => item.name === "随手记" && item.url === "./quick-notes.html"));
});

test("the entire quick-notes page and versioned modules are precached", async () => {
  for (const file of ["quick-notes.html", "quick-notes.css?v=72", "js/quick-notes-app.js?v=72", "js/quick-notes-storage.js?v=72"]) {
    assert.ok(sw.includes(`"./${file}"`), `${file} must work offline after shell install`);
    await read(file.split("?")[0]);
  }
  const page = await read("quick-notes.html");
  assert.match(page, /js\/quick-notes-app\.js\?v=72/);
  assert.doesNotMatch(page, /js\/(?:owner-app|public-app)\.js/);
  assert.match(page, /<textarea\b/);
  const script = await read("js/quick-notes-app.js");
  const storage = await read("js/quick-notes-storage.js");
  for (const source of [script, storage]) {
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|owner-api\.js|owner-storage\.js|quiz-storage\.js|\.innerHTML\s*=/);
  }
});

test("a first offline notes navigation with a query falls back to the notepad, never the public library", async () => {
  const listeners = new Map();
  const requested = [];
  vm.runInNewContext(sw, {
    self: { location: { origin: "https://wordbook.test", href: "https://wordbook.test/vocab/sw.js" }, addEventListener: (name, fn) => listeners.set(name, fn) },
    caches: { open: async () => ({
      match: async (request) => { requested.push(typeof request === "string" ? request : request.url); return request === "./quick-notes.html" ? new Response("notes shell") : undefined; }
    }) },
    fetch: async () => { throw new Error("Offline"); },
    URL, Request, Response, AbortController, setTimeout, clearTimeout
  });
  let response;
  listeners.get("fetch")({ request: { method: "GET", mode: "navigate", url: "https://wordbook.test/vocab/quick-notes.html?release=new" }, respondWith: (value) => { response = value; } });
  assert.equal(await (await response).text(), "notes shell");
  assert.ok(requested.includes("./quick-notes.html"));
  assert.ok(!requested.includes("./index.html"));
});
