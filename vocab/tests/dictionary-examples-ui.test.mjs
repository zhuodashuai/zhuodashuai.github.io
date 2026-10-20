import test from "node:test";
import assert from "node:assert/strict";
import { createDictionaryExamplesSection } from "../js/dictionary-examples-ui.js";
import { createDictionaryExamplesController, DICTIONARY_EXAMPLE_SOURCE } from "../js/dictionary-examples.js";

class Element {
  children = []; dataset = {}; attributes = {}; listeners = new Map(); hidden = false; textContent = "";
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
}
const root = { createElement: () => new Element() };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = () => new Promise(done => setImmediate(done));
const entry = term => ({ term, senses: [{ partOfSpeech: "noun", meaningZh: `${term} 的测试义项`,
  examples: [{ en: `${term} appears in a controlled test sentence.`, zh: `${term} 的测试译文。` }] }] });
const runtime = load => ({ DICTIONARY_EXAMPLE_SOURCE,
  createDictionaryExamplesController: options => createDictionaryExamplesController({ ...options, load }) });
const texts = node => [node.textContent, ...node.children.flatMap(texts)].filter(Boolean);

test("creating a section, suppressed study cards and nonlexical quotes never load example code or data", async () => {
  let imports = 0;
  const view = createDictionaryExamplesSection({ root, loadModule: () => { imports++; throw Error("Unexpected import"); } });
  assert.equal(imports, 0);
  await view.show({ term: "agitated" }, { enabled: false });
  await view.show({ term: "A quotation.", entryType: "quote" });
  assert.equal(imports, 0); assert.equal(view.section.hidden, true);
});

test("closing a card while its optional module imports prevents a later data download", async () => {
  const module = deferred(); let downloads = 0;
  const view = createDictionaryExamplesSection({ root, loadModule: () => module.promise });
  const pending = view.show({ term: "agitated" });
  view.clear();
  module.resolve(runtime(async () => { downloads++; return entry("agitated"); }));
  assert.equal(await pending, false); assert.equal(downloads, 0);
  assert.equal(view.section.hidden, true); assert.equal(view.section.dataset.term, undefined);
});

test("switching cards aborts the old caller and ignores an abort-ignoring late result without mutating saved examples", async () => {
  const old = deferred(), signals = new Map();
  const saved = { term: "first", exampleEn: "Preserved existing sentence.", exampleZh: "保留原句。", meaning: "原有释义" };
  const before = structuredClone(saved);
  const view = createDictionaryExamplesSection({ root, loadModule: async () => runtime((term, { signal }) => {
    signals.set(term, signal); return term === "first" ? old.promise : Promise.resolve(entry(term));
  }) });
  const pending = view.show(saved); await flush();
  await view.show({ term: "second" });
  assert.equal(signals.get("first").aborted, true);
  old.resolve(entry("first")); await pending;
  assert.equal(view.section.dataset.term, "second");
  assert.ok(texts(view.section).some(text => text.includes("second appears")));
  assert.ok(!texts(view.section).some(text => text.includes("first appears")));
  assert.deepEqual(saved, before);
});

test("an optional failure can retry, shows its own POS, meaning and provenance, and missing material hides", async () => {
  let calls = 0;
  const view = createDictionaryExamplesSection({ root, loadModule: async () => runtime(async term => {
    if (++calls === 1) throw Error("Unavailable");
    return term === "missing" ? null : entry(term);
  }) });
  assert.equal(await view.show({ term: "example" }), false);
  const retry = view.section.children.at(-1);
  assert.equal(retry.hidden, false); retry.listeners.get("click")(); await flush();
  assert.equal(retry.hidden, true);
  assert.ok(texts(view.section).includes(DICTIONARY_EXAMPLE_SOURCE));
  assert.ok(texts(view.section).includes("以下为独立学习例句，按各自词性和义项阅读，不是书中原句。"));
  assert.ok(texts(view.section).includes("noun · example 的测试义项"));
  assert.ok(!texts(view.section).some(text => /本次义项|匹配书中/u.test(text)));
  await view.show({ term: "missing" });
  assert.equal(view.section.hidden, true);
  view.clear(); assert.deepEqual(view.section.children.at(-2).children, []);
});
