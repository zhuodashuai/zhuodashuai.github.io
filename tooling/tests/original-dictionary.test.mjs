import test from "node:test";
import assert from "node:assert/strict";
import {
  ORIGINAL_DICTIONARY_LIMITS, normalizeOriginalHeadword, foldOriginalHeadword,
  parseOriginalDictionary, lookupOriginalDictionary, selectPublishableOriginalEntries
} from "../lib/original-dictionary.mjs";

const entry = (id, headword, overrides = {}) => ({
  id, headword, kind: headword.includes(" ") ? "phrase" : "word", forms: [],
  senses: [{ id: `${id}:sense-1`, partOfSpeech: "noun", definitionZh: "用于演示的一项含义。", definitionEn: "A meaning composed for this local demonstration.",
    examples: [{ en: "This is a newly written example.", zh: "这是新编写的例句。" }] }],
  authorship: { method: "independent-composition", agent: "AI-assisted draft", referenceUse: "headwords-only" },
  review: { status: "draft", reviewer: "", note: "Only selected senses are drafted; this is not exhaustive." }, ...overrides
});
const pack = (entries = [entry("demo", "demo")]) => ({ schemaVersion: 1, name: "卓式词典", entries });
const ids = result => result.entries.map(item => item.id);
const clone = value => structuredClone(value);

test("normalization is typographic, preserves case and never silently fixes spelling", () => {
  assert.equal(normalizeOriginalHeadword("  ＵＳ  "), "US");
  assert.equal(normalizeOriginalHeadword("  look\n\t after  "), "look after");
  assert.equal(normalizeOriginalHeadword("can’t"), "can't");
  assert.equal(normalizeOriginalHeadword("“Word”"), '"Word"');
  assert.equal(normalizeOriginalHeadword("accomodate"), "accomodate");
  assert.equal(foldOriginalHeadword(" ＵＳ "), "us");
  for (const value of [null, undefined, 2, {}, ["word"], "bad\u0000word", "a".repeat(2049)]) assert.throws(() => normalizeOriginalHeadword(value));
});

test("parsed data has exactly the JSON pack shape, is separately owned and deeply immutable", () => {
  const input = pack(), parsed = parseOriginalDictionary(input);
  assert.deepEqual(Object.keys(parsed), ["schemaVersion", "name", "entries"]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), input);
  input.entries[0].senses[0].examples[0].zh = "已被外部修改。";
  assert.equal(parsed.entries[0].senses[0].examples[0].zh, "这是新编写的例句。");
  assert.throws(() => { parsed.entries[0].forms.push("changed"); }, TypeError);
  assert.throws(() => { parsed.entries[0].senses[0].definitionZh = "改变"; }, TypeError);
});

test("all pilot drafts stay private even if a reviewer name is supplied", () => {
  const parsed = parseOriginalDictionary(pack([entry("draft", "draft", { review: { status: "draft", reviewer: "Zhuo", note: "" } })]));
  assert.deepEqual(selectPublishableOriginalEntries(parsed), []);
  assert.equal(lookupOriginalDictionary(parsed, "draft").status, "found");
});

test("only checked entries with a nonempty named reviewer pass the separate publication gate", () => {
  const parsed = parseOriginalDictionary(pack([
    entry("checked", "checked", { review: { status: "checked", reviewer: " Zhuo ", note: "Personally checked this drafted sense." } }),
    entry("unnamed", "unnamed", { review: { status: "checked", reviewer: " \t ", note: "" } }), entry("draft", "draft")
  ]));
  assert.deepEqual(selectPublishableOriginalEntries(parsed).map(value => value.id), ["checked"]);
  assert.equal(parsed.entries[0].review.reviewer, "Zhuo");
});

test("case-sensitive exact headwords win while folded US/us matches remain ambiguous", () => {
  const parsed = parseOriginalDictionary(pack([entry("country", "US"), entry("pronoun", "us")]));
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, "ＵＳ")), ["country"]);
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, "us")), ["pronoun"]);
  assert.equal(lookupOriginalDictionary(parsed, "Us").status, "ambiguous");
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, "Us")), ["country", "pronoun"]);
});

test("homographs and normalized identical headwords are not blindly merged", () => {
  const parsed = parseOriginalDictionary(pack([entry("lead-metal", "lead"), entry("lead-verb", "ｌｅａｄ")]));
  const result = lookupOriginalDictionary(parsed, "lead");
  assert.equal(result.status, "ambiguous"); assert.deepEqual(ids(result), ["lead-metal", "lead-verb"]);
  assert.equal(parsed.entries.length, 2);
});

test("inflection collisions return all candidates and never auto-select a lemma", () => {
  const parsed = parseOriginalDictionary(pack([
    entry("axe", "axe", { forms: ["axes"] }), entry("axis", "axis", { forms: ["axes"] }),
    entry("go", "go", { forms: ["went", "gone"] })
  ]));
  const result = lookupOriginalDictionary(parsed, " AXES ");
  assert.equal(result.status, "ambiguous"); assert.deepEqual(ids(result), ["axe", "axis"]);
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, "went")), ["go"]);
  assert.equal(lookupOriginalDictionary(parsed, "went").status, "found");
});

test("an exact headword wins over another entry's matching form without erasing collisions for folded queries", () => {
  const parsed = parseOriginalDictionary(pack([
    entry("axes-headword", "axes"), entry("axe", "axe", { forms: ["axes"] }), entry("axis", "axis", { forms: ["axes"] })
  ]));
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, "axes")), ["axes-headword"]);
  assert.equal(lookupOriginalDictionary(parsed, "AXES").status, "ambiguous");
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, "AXES")), ["axes-headword", "axe", "axis"]);
});

test("complete phrases, punctuation and original casing stay intact without fuzzy substring lookup", () => {
  const parsed = parseOriginalDictionary(pack([
    entry("phrase", "look after", { forms: ["looked after", "looking after"] }), entry("cant", "can't"),
    entry("iphone", "iPhone"), entry("covid", "COVID-19"), entry("cpp", "C++"), entry("always", "24/7")
  ]));
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, " LOOKED   AFTER ")), ["phrase"]);
  assert.deepEqual(ids(lookupOriginalDictionary(parsed, "can’t")), ["cant"]);
  assert.equal(parsed.entries[2].headword, "iPhone");
  for (const input of ["look", "after", "look afetr", "ship", "hip", "accomodate", '"look after"', "", "  "]) {
    assert.deepEqual(lookupOriginalDictionary(parsed, input), { status: "missing", entries: [] });
  }
});

test("lookup results cannot mutate the private index or stored candidate arrays", () => {
  const parsed = parseOriginalDictionary(pack());
  lookupOriginalDictionary(parsed, "demo").entries.length = 0;
  assert.equal(lookupOriginalDictionary(parsed, "demo").entries.length, 1);
  assert.throws(() => lookupOriginalDictionary(pack(), "demo"), /parseOriginalDictionary/u);
  assert.throws(() => selectPublishableOriginalEntries(pack()), /parseOriginalDictionary/u);
  for (const input of [undefined, {}, null, "word\u0000", "a".repeat(161)]) assert.throws(() => lookupOriginalDictionary(parsed, input));
});

test("entry IDs and sense IDs are unique across the entire pack", () => {
  assert.throws(() => parseOriginalDictionary(pack([entry("same", "one"), entry("same", "two")])), /duplicate identifier/u);
  const first = entry("one", "one"), second = entry("two", "two"); second.senses[0].id = first.senses[0].id;
  assert.throws(() => parseOriginalDictionary(pack([first, second])), /duplicate identifier/u);
});

test("all object levels reject copied-source or exhaustive-coverage extra fields", () => {
  const mutations = [
    value => { value.sourcePdf = "commercial.pdf"; }, value => { value.completeDictionary = true; },
    value => { value.entries[0].sourceMeaning = "Copied text"; }, value => { value.entries[0].source = { title: "Commercial dictionary" }; },
    value => { value.entries[0].senses[0].sourceUrl = "https://publisher.invalid"; },
    value => { value.entries[0].senses[0].exhaustive = true; }, value => { value.entries[0].senses[0].examples[0].copiedFrom = "book"; },
    value => { value.entries[0].authorship.sourceDefinition = "copied"; }, value => { value.entries[0].review.sourcePage = 1; }
  ];
  for (const mutate of mutations) { const input = pack(); mutate(input); assert.throws(() => parseOriginalDictionary(input), /unknown field/u); }
});

test("missing fields, wrong types, bad language, control text and nonoriginal provenance fail closed", () => {
  const mutations = [
    value => { value.schemaVersion = "1"; }, value => { value.name = "All commercial dictionaries"; }, value => { delete value.entries[0].forms; },
    value => { value.entries[0].headword = ""; }, value => { value.entries[0].headword = "中文"; }, value => { value.entries[0].headword = "<script>"; },
    value => { value.entries[0].kind = "exhaustive"; }, value => { value.entries[0].forms = "form"; },
    value => { value.entries[0].forms = ["went", "ｗｅｎｔ"]; }, value => { value.entries[0].senses = []; },
    value => { value.entries[0].senses[0].partOfSpeech = ""; }, value => { value.entries[0].senses[0].definitionZh = "English only"; },
    value => { value.entries[0].senses[0].definitionEn = "纯中文"; }, value => { value.entries[0].senses[0].examples = []; },
    value => { value.entries[0].senses[0].examples[0].en = "仅中文"; }, value => { value.entries[0].senses[0].examples[0].zh = "English only"; },
    value => { value.entries[0].senses[0].definitionZh = "释义\u0000"; }, value => { value.entries[0].review.status = "published"; },
    value => { value.entries[0].review.reviewer = false; }, value => { value.entries[0].authorship.method = "paraphrased-source"; },
    value => { value.entries[0].authorship.referenceUse = "definitions"; }, value => { value.entries[0].authorship.agent = "human verified"; }
  ];
  for (const mutate of mutations) { const input = pack(); mutate(input); assert.throws(() => parseOriginalDictionary(input)); }
  for (const input of [null, [], new Date(), {}]) assert.throws(() => parseOriginalDictionary(input));
});

test("oversized entries and nested values are bounded before indexing", () => {
  for (const mutate of [
    value => { value.entries = Array(ORIGINAL_DICTIONARY_LIMITS.entries + 1).fill(value.entries[0]); },
    value => { value.entries[0].forms = Array(33).fill("form"); }, value => { value.entries[0].senses = Array(25).fill(value.entries[0].senses[0]); },
    value => { value.entries[0].senses[0].examples = Array(9).fill({ en: "Example.", zh: "例句。" }); },
    value => { value.entries[0].headword = "a".repeat(161); }, value => { value.entries[0].senses[0].definitionZh = "义".repeat(2001); },
    value => { value.entries[0].senses[0].examples[0].en = "x".repeat(1201); }, value => { value.entries[0].review.note = "x".repeat(2001); }
  ]) { const input = pack(); mutate(input); assert.throws(() => parseOriginalDictionary(input)); }
});

test("aggregate text is capped even when each independently bounded field is valid", () => {
  // Share immutable strings across rows so the 256 MiB logical-input bound does
  // not require allocating a 256 MiB JSON string or source payload in the test.
  const paddedForms = Array.from({ length: 32 }, (_, index) => `form${index}`.padEnd(2048, " "));
  const entries = Array.from({ length: 4500 }, (_, index) => {
    const item = entry(`bounded-${index}`, `term${index}`);
    item.forms = paddedForms;
    item.senses[0].definitionZh = "义".repeat(2000); item.senses[0].definitionEn = "A".repeat(2000);
    item.senses[0].examples = [{ en: "A".repeat(1200), zh: "例".repeat(1200) }]; item.review.note = "N".repeat(2000);
    return item;
  });
  assert.throws(() => parseOriginalDictionary(pack(entries)), /aggregate text limit/u);
});

test("array containers reject sparse, source-bearing or getter-backed rows before access", () => {
  for (const mutate of [
    value => { value.entries = Array(1); },
    value => { value.entries.sourceMeaning = "copied"; },
    value => { value.entries[0].forms.sourcePdf = "source.pdf"; },
    value => { value.entries[0].senses[0].examples[Symbol("source")] = "book"; }
  ]) { const input = pack(); mutate(input); assert.throws(() => parseOriginalDictionary(input)); }
  const input = pack(); let accesses = 0;
  Object.defineProperty(input.entries, "0", { enumerable: true, get() { accesses += 1; return entry("x", "x"); } });
  assert.throws(() => parseOriginalDictionary(input), /accessor/u); assert.equal(accesses, 0);
});

test("pure parsing and lookup make no external requests or property-getter calls", () => {
  const previousFetch = globalThis.fetch; let requests = 0, accesses = 0;
  globalThis.fetch = () => { requests += 1; throw new Error("no network allowed"); };
  try {
    const parsed = parseOriginalDictionary(pack()); lookupOriginalDictionary(parsed, "demo"); selectPublishableOriginalEntries(parsed);
    const hostile = pack(); Object.defineProperty(hostile.entries[0], "headword", { enumerable: true, get() { accesses += 1; return "hostile"; } });
    assert.throws(() => parseOriginalDictionary(hostile), /accessor/u);
    assert.equal(requests, 0); assert.equal(accesses, 0);
  } finally { globalThis.fetch = previousFetch; }
});
