import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDictionaryController, createDictionaryCountLoader, initialDictionaryQuery, numberedDictionaryMeaning, dictionaryMeaningLines, dictionaryChoicePreview, personalDictionaryLink, ownerDictionaryLink } from "../js/dictionary-app.js";

const row = (term = "watch") => ({ term, partOfSpeech: "noun · verb", meaning: "① n. 手表\n② v. 观看", source: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT" });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test("fragment prefilling is bounded, decoded once, and never a search parameter", () => {
  assert.equal(initialDictionaryQuery("#q=by%20some%20fluke"), "by some fluke");
  assert.equal(initialDictionaryQuery("#q=%E7%9B%91%E8%A7%86"), "监视");
  assert.equal(initialDictionaryQuery("#q=24%2F7"), "24/7");
  assert.equal(initialDictionaryQuery("#lookup=watch"), "");
  for (const value of ["#q=%E0%A4%A", `#q=${"a".repeat(201)}`, "#q=word%00", null]) assert.equal(initialDictionaryQuery(value), "");
});

test("link enters the personal book with a canonical fragment, not a write action", () => {
  const local = new URL(personalDictionaryLink("jab at", { href: "http://127.0.0.1:4187/dictionary.html" }));
  assert.equal(local.pathname, "/personal.html"); assert.equal(local.search, ""); assert.equal(local.hash, "#lookup=jab%20at");
  const deployed = new URL(personalDictionaryLink("24/7", { href: "https://zhuodashuai.github.io/vocab/dictionary.html" }));
  assert.equal(deployed.origin, "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev");
  assert.equal(deployed.hash, "#lookup=24%2F7");
});

test("owner search enters the fixed authenticated Worker with the query only in the fragment", () => {
  const url = new URL(ownerDictionaryLink("apple", { href: "https://zhuodashuai.github.io/vocab/dictionary.html" }));
  assert.equal(url.origin, "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev");
  assert.equal(url.pathname, "/personal.html"); assert.equal(url.search, "?auth=owner"); assert.equal(url.hash, "#lookup=apple");
});

test("meaning numbering is additive only when the source has not numbered it", () => {
  assert.equal(numberedDictionaryMeaning("n. 手表"), "① n. 手表");
  assert.equal(numberedDictionaryMeaning("① n. 手表\n② v. 观看"), "① n. 手表\n② v. 观看");
  assert.equal(numberedDictionaryMeaning("1. 观看\n2. 留意"), "1. 观看\n2. 留意");
  assert.equal(numberedDictionaryMeaning(""), "");
});

test("manifest count failure stays isolated and can recover after a successful lookup retry", async () => {
  let calls = 0, failed = true; const values = [];
  const refresh = createDictionaryCountLoader({ preload: async () => {
    calls++; if (failed) throw new Error("unavailable"); return { counts: { records: 17 } };
  }, onChange: value => values.push(value) });
  const first = refresh(); assert.equal(first, refresh()); assert.equal(await first, false);
  assert.equal(calls, 1); assert.deepEqual(values, [null]);
  failed = false; assert.equal(await refresh(), true); assert.equal(calls, 2); assert.deepEqual(values, [null, 17]);
});

test("meaning rows preserve source numbering and synonym groups without inventing senses", () => {
  assert.deepEqual(dictionaryMeaningLines("① n. 髋部；臀部\n② adj. 时髦的；消息灵通的"), ["① n. 髋部；臀部", "② adj. 时髦的；消息灵通的"]);
  assert.deepEqual(dictionaryMeaningLines("n. 监视；监督"), ["① n. 监视；监督"]);
  assert.deepEqual(dictionaryMeaningLines("1. 原义\r\n\r\n2. 引申义"), ["1. 原义", "2. 引申义"]);
  assert.deepEqual(dictionaryMeaningLines(""), []);
  assert.deepEqual(dictionaryMeaningLines("<img src=x onerror=alert(1)>"), ["① <img src=x onerror=alert(1)>"]);
});

test("candidate previews stay short and readable without changing the full source meaning", () => {
  assert.equal(dictionaryChoicePreview(" ① n. 苹果\n② adj. 苹果的 "), "① n. 苹果 ② adj. 苹果的");
  assert.equal(dictionaryChoicePreview("词".repeat(81)), "词".repeat(80) + "…");
  assert.equal(dictionaryChoicePreview("😀".repeat(81)), "😀".repeat(80) + "…");
  assert.equal(dictionaryChoicePreview(""), "");
});

test("English result preserves all POS, complete meaning and independent source variants", async () => {
  const entry = { ...row(), alternatives: [{ partOfSpeech: "verb", meaning: "留意；密切关注", source: "卓式原创释义（AI复核，精选义项）", license: "original", url: "https://zhuodashuai.github.io/vocab/" }] };
  let call;
  const controller = createDictionaryController({ search: async (...args) => { call = args; return { results: [entry], hasMore: false }; } });
  await controller.submit("watch");
  assert.equal(call[0], "watch"); assert.equal(call[1].limit, 20); assert.ok(call[1].signal instanceof AbortSignal);
  assert.equal(controller.getState().phase, "ready"); assert.deepEqual(controller.getState().results[0], entry);
  assert.equal(controller.select(-1), false); assert.equal(controller.select(1), false);
});

test("Chinese choices are capped at twenty and retain selected variant POS", async () => {
  const entries = Array.from({ length: 21 }, (_, index) => row(`entry-${index}`));
  entries[1] = { ...entries[1], partOfSpeech: "adjective", meaning: "时髦的", source: "selected source" };
  const controller = createDictionaryController({ search: async () => ({ results: entries, hasMore: false }) });
  await controller.submit("时髦"); assert.equal(controller.getState().results.length, 20); assert.equal(controller.getState().hasMore, true);
  assert.equal(controller.select(1), true);
  const selected = controller.getState().results[controller.getState().selectedIndex];
  assert.equal(selected.partOfSpeech, "adjective"); assert.equal(selected.source, "selected source");
});

test("an unfinished bounded reverse lookup is a refinement request, not a false missing-word claim", async () => {
  const controller = createDictionaryController({ search: async () => ({ results: [], hasMore: true }) });
  await controller.submit("的");
  assert.equal(controller.getState().phase, "refine"); assert.equal(controller.getState().hasMore, true);
  assert.deepEqual(controller.getState().results, []); assert.match(controller.getState().message, /候选较多.*更具体/u);
  assert.doesNotMatch(controller.getState().message, /没有找到|未收录|不存在/u);
});

test("editing cancels the current query, removes old cards, and ignores late completion", async () => {
  const first = deferred(), second = deferred(), calls = [];
  const controller = createDictionaryController({ search: (query, options) => { calls.push([query, options]); return query === "first" ? first.promise : second.promise; } });
  const firstRun = controller.submit("first"); controller.change("second");
  assert.equal(calls[0][1].signal.aborted, true); assert.equal(controller.getState().phase, "idle"); assert.deepEqual(controller.getState().results, []);
  const secondRun = controller.submit("second"); second.resolve({ results: [row("second")], hasMore: false }); await secondRun;
  first.resolve({ results: [row("first")], hasMore: false }); await firstRun;
  assert.equal(controller.getState().results[0].term, "second");
});

test("cancel is immediate, clears all prior meaning, and permits retry", async () => {
  const pending = deferred(); let calls = 0;
  const controller = createDictionaryController({ search: async () => { calls++; if (calls === 1) return pending.promise; return { results: [row()], hasMore: false }; } });
  const run = controller.submit("watch"); controller.cancel(); assert.equal(controller.getState().phase, "cancelled");
  pending.resolve({ results: [row("stale")], hasMore: false }); await run; assert.deepEqual(controller.getState().results, []);
  await controller.submit("watch"); assert.equal(controller.getState().results[0].term, "watch");
});

test("repeat submit during loading does not start a second request", async () => {
  const pending = deferred(); let calls = 0;
  const controller = createDictionaryController({ search: () => { calls++; return pending.promise; } });
  const first = controller.submit("watch"); assert.equal(await controller.submit("watch"), false); assert.equal(calls, 1);
  pending.resolve({ results: [], hasMore: false }); await first; assert.equal(controller.getState().phase, "empty");
});

test("misses, ambiguity and network errors never keep a stale card or invent definitions", async () => {
  let outcome = "ready";
  const controller = createDictionaryController({ search: async () => {
    if (outcome === "error") throw new Error("provider secret must not appear");
    if (outcome === "ambiguous") throw Object.assign(new Error("ambiguous"), { code: "ambiguous_dictionary_match" });
    return { results: outcome === "ready" ? [row()] : [], hasMore: false };
  } });
  await controller.submit("watch"); outcome = "missing"; await controller.submit("xyzzy_missing");
  assert.equal(controller.getState().phase, "empty"); assert.deepEqual(controller.getState().results, []);
  outcome = "error"; await controller.submit("watch"); assert.equal(controller.getState().phase, "error");
  assert.deepEqual(controller.getState().results, []); assert.doesNotMatch(controller.getState().message, /secret/u);
  outcome = "ambiguous"; await controller.submit("ambiguous"); assert.match(controller.getState().message, /没有自动选取/u);
});

test("public document has labelled Enter form, no account or provider calls, and safe text rendering", async () => {
  const html = await readFile(new URL("../dictionary.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../js/dictionary-app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../dictionary.css", import.meta.url), "utf8");
  assert.match(html, /for="dictionary-query"/u); assert.match(html, /type="submit"/u); assert.match(html, /role="status" aria-live="polite"/u);
  assert.match(html, /dictionary\.css\?v=86/u); assert.match(html, /dictionary-app\.js\?v=88/u);
  assert.doesNotMatch(html.match(/<form[\s\S]*?<\/form>/u)[0], /\bname=/u);
  assert.match(html, /connect-src 'self';/u); assert.match(html, /MIT 许可证/u);
  assert.match(script, /expanded-dictionary\.js\?v=88/u); assert.match(script, /counts\.records/u);
  assert.match(script, /import\("\.\/dictionary-examples\.js\?v=84"\)/u);
  assert.ok(html.indexOf('id="dictionary-add"') < html.indexOf('id="dictionary-example-panel"'));
  assert.doesNotMatch(script, /innerHTML|localStorage|indexedDB|\/api\/|fetch\(|registerServiceWorker|82920/u);
  assert.match(css, /@media \(max-width: 640px\)/u); assert.match(css, /min-width: 0/u);
});
