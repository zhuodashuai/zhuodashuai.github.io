import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lookupPersonalDictionaryFast } from "../js/personal-lookup-flow.js";
import { applyCorePosCorrection, isReviewedCoreDictionaryResult, personalDictionaryResult } from "../js/personal-dictionary.js?v=95";
import { CORE_POS_CORRECTIONS } from "../js/core-pos-corrections.js?v=88";

const row = (term, extra = {}) => ({ term, partOfSpeech: "noun", meaning: "测试释义", source: "ECDICT", ...extra });
const response = (...results) => ({ results, hasMore: false });
const never = () => new Promise(() => {});
const later = (value, ms = 5) => new Promise(resolve => setTimeout(() => resolve(value), ms));
const options = extra => ({ hotLookup: async () => null, hotReverse: async () => response(), fullSearch: async () => response(),
  hotGraceMs: 10, chineseDelayMs: 10, formWaitMs: 15, ...extra });

test("English starts both sources immediately and a hung hot index cannot delay a warm expanded result", async () => {
  let hotCalls = 0, fullCalls = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const start = Date.now();
    const result = await lookupPersonalDictionaryFast("abacus", options({ hotLookup: () => { hotCalls++; return never(); },
      fullSearch: async () => { fullCalls++; return response(row("abacus")); } }));
    assert.equal(result.results[0].term, "abacus"); assert.match(result.results[0].warning, /基础词形索引仍在加载/u);
    assert.ok(Date.now() - start < 300);
  }
  assert.equal(hotCalls, 2); assert.equal(fullCalls, 2);
});

test("a ready hot exact remains first and does not wait for slow expanded data", async () => {
  const result = await lookupPersonalDictionaryFast("hip", options({ hotLookup: async () => row("hip"), fullSearch: never }));
  assert.deepEqual(result, response(row("hip")));
});

test("full tracked-core/public exact can return without the grace, preserving its full POS, meanings and alternatives", async () => {
  for (const source of [
    { source: "ECDICT · 已上线核心整理", license: "MIT and project editorial additions", url: "https://github.com/skywind3000/ECDICT" },
    { source: "卓的公开词库", license: "Public project content; not relabelled as ECDICT", url: "https://zhuodashuai.github.io/vocab/" }
  ]) {
    const full = response(row("hip", { ...source, partOfSpeech: "noun · adjective", meaning: "① n. 髋部；臀部\n② adj. 时髦的；消息灵通的", alternatives: [row("hip", { source: "其他合法来源" })] }));
    const started = Date.now();
    const result = await lookupPersonalDictionaryFast("ＨＩＰ,", options({ hotLookup: never, fullSearch: async () => full, hotGraceMs: 750 }));
    assert.deepEqual(result, full); assert.ok(Date.now() - started < 500, "equivalent exact must not wait for the 750ms grace");
  }
});

test("reviewed core proof requires the exact approved tuple and provenance, without side effects", () => {
  const source = CORE_POS_CORRECTIONS.source;
  // Explicit fixture projection: these are not production whitelist entries.
  const projection = { source, entries: [["fixture-head", "核心测试释义", "noun phrase / adjective phrase"],
    ["Polish", "波兰的", "proper adjective"]] };
  const value = { term: "fixture-head", partOfSpeech: projection.entries[0][2], meaning: projection.entries[0][1],
    source: source.name, license: source.license, url: source.url };
  const before = structuredClone({ value, projection });
  assert.equal(isReviewedCoreDictionaryResult(value, projection), true);
  const formatted = personalDictionaryResult({ word: value.term, partOfSpeech: value.partOfSpeech, meaning: value.meaning });
  assert.equal(isReviewedCoreDictionaryResult({ ...value, partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning }, projection), true);
  for (const altered of [null, {}, { ...value, term: "Fixture-head" }, { ...value, term: "not-in-core" },
    { ...value, partOfSpeech: "verb" }, { ...value, meaning: "新的释义" }, { ...value, source: "ECDICT" },
    { ...value, license: "MIT" }, { ...value, url: "https://example.com/" }, { ...value, matchedForm: "fixture-heads" }])
    assert.equal(isReviewedCoreDictionaryResult(altered, projection), false);
  assert.equal(isReviewedCoreDictionaryResult({ ...value, term: "polish", partOfSpeech: "proper adjective", meaning: "波兰的" }, projection), false);
  assert.equal(isReviewedCoreDictionaryResult(value, null), false);
  assert.deepEqual({ value, projection }, before, "proof must not mutate the result or approval");
});

test("a shipped exact reviewed core result bypasses a hung hot load without the 750ms grace", {
  skip: CORE_POS_CORRECTIONS.entries.length ? false : "reviewed core projection is not generated yet"
}, async () => {
  const [term, meaning, partOfSpeech] = CORE_POS_CORRECTIONS.entries[0], source = CORE_POS_CORRECTIONS.source;
  const formatted = personalDictionaryResult({ word: term, meaning, partOfSpeech });
  const value = { term, partOfSpeech: formatted.partOfSpeech || partOfSpeech, meaning: formatted.meaning,
    source: source.name, license: source.license, url: source.url };
  assert.equal(isReviewedCoreDictionaryResult(value), true);
  const full = response(value), started = Date.now();
  const result = await lookupPersonalDictionaryFast(term, options({ hotLookup: never, fullSearch: async () => full, hotGraceMs: 750 }));
  assert.deepEqual(result, full);
  assert.ok(Date.now() - started < 500, "independently proved exact core result must not wait for the 750ms grace");
  const changedCase = [...term].map(letter => letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()).join("");
  if (changedCase !== term) {
    const hot = row("legacy-core-choice");
    const changed = await lookupPersonalDictionaryFast(changedCase, options({ hotLookup: () => later(hot), fullSearch: async () => full }));
    assert.deepEqual(changed, response(hot), "case-only ambiguity must still give the old core a chance");
  }
});

test("plain MIT/original exact, nonexact tracked heads and matched forms still wait for the known lemma", async () => {
  for (const value of [row("received", { source: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT" }),
    row("received", { source: "卓式原创释义（AI复核，精选义项）" }),
    row("receiving", { source: "ECDICT · 已上线核心整理", license: "MIT and project editorial additions", url: "https://github.com/skywind3000/ECDICT" }),
    row("received", { source: "ECDICT · 已上线核心整理", license: "MIT and project editorial additions", url: "https://github.com/skywind3000/ECDICT", matchedForm: "received" }),
    row("received", { source: CORE_POS_CORRECTIONS.source.name, license: CORE_POS_CORRECTIONS.source.license, url: CORE_POS_CORRECTIONS.source.url })]) {
    const result = await lookupPersonalDictionaryFast("received", options({ hotLookup: () => later(row("receive", { matchedForm: "received" })), fullSearch: async () => response(value) }));
    assert.equal(result.results[0].term, "receive");
  }
});

test("every shipped tracked-core/public primary used by the fast path preserves compact POS and Chinese text", async () => {
  const data = path => readFile(new URL(`../data/${path}`, import.meta.url), "utf8").then(JSON.parse);
  const compact = await data("member-dictionary.json"), manifest = await data("expanded-dictionary/manifest.json");
  const core = new Map(compact.core.map(([term, partOfSpeech, meaning]) => {
    const raw = { word: term, partOfSpeech, meaning }, value = applyCorePosCorrection(raw, personalDictionaryResult(raw));
    const normalized = personalDictionaryResult({ ...raw, partOfSpeech: value.partOfSpeech });
    return [term, { ...value, partOfSpeech: normalized.partOfSpeech || value.partOfSpeech }];
  }));
  const published = new Map(compact.published.map(([term, partOfSpeech, meaning]) => [term, { partOfSpeech, meaning }]));
  let checkedCore = 0, checkedPublic = 0;
  for (const descriptor of manifest.english.shards) {
    const shard = await data(`expanded-dictionary/${descriptor.file}`);
    for (const value of shard.records) {
      if (value.id % 128 !== descriptor.bucket) continue;
      const provenance = manifest.sources[value.source];
      const reviewed = value.source === "pos-reviewed" && isReviewedCoreDictionaryResult({ ...value,
        source: provenance.name, license: provenance.license, url: provenance.url });
      if (!["core", "public"].includes(value.source) && !reviewed) continue;
      const expected = (value.source === "core" || reviewed ? core : published).get(value.term);
      assert.ok(expected, value.term);
      const actual = value.source === "core" || reviewed ? personalDictionaryResult({ word: value.term, partOfSpeech: value.partOfSpeech, meaning: value.meaning }) : value;
      assert.equal(actual.partOfSpeech, expected.partOfSpeech, `${value.term} POS`);
      assert.equal(actual.meaning, expected.meaning, `${value.term} Chinese`);
      if (value.source === "core" || reviewed) checkedCore++; else checkedPublic++;
    }
  }
  assert.equal(checkedCore, compact.counts.core); assert.ok(checkedPublic > 0);
});

test("a fast expanded exact allows a short hot grace, preserving known received/went lemmas and lettering choice", async () => {
  for (const [input, lemma] of [["received", "receive"], ["went", "go"], ["lettering", "letter"]]) {
    const result = await lookupPersonalDictionaryFast(input, options({
      hotLookup: () => later(row(lemma, { matchedForm: input })), fullSearch: async () => response(row(input)) }));
    assert.deepEqual(result.results.map(value => value.term), [lemma, input]);
  }
});

test("hot forms have a bounded optional exact check, without losing valid known glosses on ordinary network failure", async () => {
  for (const fullSearch of [never, async () => { throw new Error("offline"); }]) {
    const result = await lookupPersonalDictionaryFast("apples", options({ hotLookup: async () => row("apple", { matchedForm: "apples" }), fullSearch }));
    assert.equal(result.results[0].term, "apple"); assert.match(result.results[0].warning, /扩展词条暂未加载/u);
  }
});

test("ambiguity and corrupted full source are not silently accepted as a form guess", async () => {
  for (const code of ["ambiguous_dictionary_match", "invalid_dictionary_data"]) {
    const fail = async () => { throw Object.assign(new Error(code), { code }); };
    const verified = await lookupPersonalDictionaryFast("axes", options({ hotLookup: fail, fullSearch: async () => response(row("axes")) }));
    assert.equal(verified.results[0].term, "axes", "a fully verified exact entry can resolve an older compact-index ambiguity");
    await assert.rejects(lookupPersonalDictionaryFast("axes", options({ hotLookup: fail, fullSearch: async () => response() })), error => error.code === code);
    await assert.rejects(lookupPersonalDictionaryFast("axes", options({ hotLookup: async () => row("axe", { matchedForm: "axes" }), fullSearch: fail })), error => error.code === code);
  }
});

test("Chinese hot matches are explicitly partial and do not start the large search unnecessarily", async () => {
  let fullCalls = 0;
  const result = await lookupPersonalDictionaryFast("苹果", options({ hotReverse: async () => response(row("apple")),
    fullSearch: async () => { fullCalls++; return response(row("other")); } }));
  assert.equal(result.coverage, "basic"); assert.equal(result.results[0].term, "apple"); assert.equal(fullCalls, 0);
});

test("current Chinese UI prefers complete ranked results over early compact hits and preserves paging metadata", async () => {
  let completeCalls = 0;
  const verified = { ...response(row("hot"), row("sweltering"), row("stifling")), hasMore: true, nextOffset: 3, total: 42 };
  const result = await lookupPersonalDictionaryFast("热", options({ preferCompleteChinese: true,
    hotReverse: async () => response(row("hot")), fullSearch: () => { completeCalls++; return later(verified, 20); } }));
  assert.equal(completeCalls, 1);
  assert.deepEqual(result.results, verified.results);
  assert.equal(result.nextOffset, 3); assert.equal(result.total, 42); assert.equal(result.hasMore, true);
  assert.notEqual(result.coverage, "basic");
});

test("ranked Chinese returns without waiting for a hung compact source and keeps safe offline fallback", async () => {
  const verified = { ...response(row("sweltering")), nextOffset: 1 };
  const fast = await lookupPersonalDictionaryFast("热", options({ preferCompleteChinese: true,
    hotReverse: never, fullSearch: async () => verified, chineseDelayMs: 1000 }));
  assert.deepEqual(fast, verified);
  const partial = await lookupPersonalDictionaryFast("热", options({ preferCompleteChinese: true,
    hotReverse: async () => response(row("hot")), fullSearch: async () => { throw new Error("offline"); } }));
  assert.deepEqual(partial.results, [row("hot")]); assert.equal(partial.coverage, "basic");
});

test("ranked Chinese results and counts do not depend on which source resolves first", async () => {
  const verified = { ...response(row("existing")), total: 1, nextOffset: 1 };
  for (const compactFirst of [true, false]) {
    const actual = await lookupPersonalDictionaryFast("新词", options({ preferCompleteChinese: true,
      hotReverse: () => compactFirst ? response(row("new-public")) : later(response(row("new-public")), 20),
      fullSearch: () => compactFirst ? later(verified, 20) : verified }));
    assert.deepEqual(actual, verified);
  }
});

test("ranked Chinese cancellation never turns a partial hit into a completed search", async () => {
  const controller = new AbortController();
  const pending = lookupPersonalDictionaryFast("热", options({ preferCompleteChinese: true, signal: controller.signal,
    hotReverse: async () => response(row("hot")), fullSearch: never }));
  await later(null, 5); controller.abort();
  await assert.rejects(pending, error => error.name === "AbortError");
});

test("mid-load hot Chinese can win after full search starts; its caller is cancelled without any later replacement", async () => {
  let fullSignal, fullCalls = 0;
  const result = await lookupPersonalDictionaryFast("苹果", options({ hotReverse: () => later(response(row("apple")), 20),
    fullSearch: (_input, { signal }) => { fullCalls++; fullSignal = signal; return later(response(row("late")), 40); } }));
  assert.equal(result.coverage, "basic"); assert.equal(result.results[0].term, "apple"); assert.equal(fullCalls, 1); assert.ok(fullSignal.aborted);
  await later(null, 50); assert.equal(result.results[0].term, "apple");
});

test("Chinese hot misses/errors still search all sources; complete results can beat a hung hot load", async () => {
  for (const hotReverse of [async () => response(), async () => { throw new Error("offline"); }, never]) {
    const result = await lookupPersonalDictionaryFast("生僻义", options({ hotReverse, fullSearch: async () => ({ ...response(row("outgrowth")), hasMore: true }) }));
    assert.equal(result.results[0].term, "outgrowth"); assert.equal(result.hasMore, true); assert.notEqual(result.coverage, "basic");
  }
});

test("explicit complete search bypasses partial hot results and preserves source alternatives and hasMore", async () => {
  let hotCalls = 0;
  const full = { ...response(row("apple", { alternatives: [row("apple", { source: "原创词典" })] })), hasMore: true };
  const result = await lookupPersonalDictionaryFast("苹果", options({ full: true, hotReverse: async () => { hotCalls++; return response(row("apple")); }, fullSearch: async () => full }));
  assert.deepEqual(result, full); assert.equal(hotCalls, 0);
});

test("input/logout cancellation promptly rejects all pending race paths and aborts their caller signals", async () => {
  for (const input of ["abacus", "苹果"]) {
    const controller = new AbortController(), signals = [];
    const hanging = (_input, { signal }) => { signals.push(signal); return never(); };
    const pending = lookupPersonalDictionaryFast(input, options({ signal: controller.signal, hotLookup: hanging, hotReverse: hanging, fullSearch: hanging }));
    await later(null, 20); controller.abort();
    await assert.rejects(pending, error => error.name === "AbortError"); assert.ok(signals.length); assert.ok(signals.every(signal => signal.aborted));
  }
});
