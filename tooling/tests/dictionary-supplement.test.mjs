import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DICTIONARY_SUPPLEMENT_ID, DICTIONARY_SUPPLEMENT_SOURCE, dictionarySupplementIntegrity,
  renderDictionarySupplementReferences, validateDictionarySupplement, verifyDictionarySupplement } from "../lib/dictionary-supplement.mjs";
import { buildExpandedDictionary, expandedBucket, expandedKey, validateExpandedBuild } from "../scripts/build-expanded-dictionary.mjs";

const row = (extra = {}) => ({ term: "safety oracle", partOfSpeech: "noun", meaning: "安全判定器。\n语境提醒：按指定的安全要求判定状态或行为。", forms: [], domain: "安全验证",
  references: [{ title: "A primary safety verification study", url: "https://example.org/safety", locator: "Definition 4" }], ...extra });
const fixture = (entries = [row()]) => ({ schemaVersion: 1, id: DICTIONARY_SUPPLEMENT_ID, workbookSha256: "a".repeat(64),
  inputRecordsSha256: "b".repeat(64), source: { ...DICTIONARY_SUPPLEMENT_SOURCE }, entries });
const publicBaseline = JSON.parse(await readFile(new URL("../../vocab/data/owner-wordbook.json", import.meta.url)));
const publicPayload = { ...publicBaseline, entries: [] };
const source = { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT", commit: "a".repeat(40), sha256: "b".repeat(64) };
const build = (supplementPack, { mit = [], core = [], publicEntries = [], originalEntries = [] } = {}) => buildExpandedDictionary({
  prepared: { schemaVersion: 1, source, rows: mit.map((entry, rank) => ({ forms: [], workbook: false, rank, ...entry })) },
  corePayload: { schemaVersion: 1, source, columns: ["word", "partOfSpeech", "meaning", "forms"], entries: core },
  publicPayload: { ...publicPayload, entries: publicEntries }, originalPack: { schemaVersion: 1, name: "卓式词典", entries: originalEntries }, supplementPack
});

test("supplement validation preserves exact reviewed JSON and binds every provenance field", () => {
  const pack = fixture(), originalJSON = JSON.stringify(pack);
  assert.equal(validateDictionarySupplement(pack), pack);
  assert.equal(JSON.stringify(pack), originalJSON);
  const integrity = dictionarySupplementIntegrity(pack);
  assert.deepEqual(integrity, { schemaVersion: 1, id: DICTIONARY_SUPPLEMENT_ID, rows: 1,
    semanticSha256: createHash("sha256").update(originalJSON).digest("hex") });
  assert.equal(verifyDictionarySupplement(pack, integrity), pack);
  for (const mutate of [
    value => { value.workbookSha256 = "c".repeat(64); },
    value => { value.inputRecordsSha256 = "c".repeat(64); },
    value => { value.entries[0].meaning = "不同的中文定义"; },
    value => { value.entries[0].domain = "软件测试"; },
    value => { value.entries[0].references[0].locator = "Section 2"; },
    value => { value.entries[0].references[0].url = "https://example.org/different"; }
  ]) {
    const changed = structuredClone(pack); mutate(changed);
    assert.throws(() => verifyDictionarySupplement(changed, integrity), /semantic root mismatch/u);
  }
  assert.throws(() => verifyDictionarySupplement(pack, { ...integrity, rows: 2 }), /semantic root mismatch/u);
  assert.throws(() => verifyDictionarySupplement(pack, { ...integrity, approvedBy: "self" }), /integrity fields/u);
});

test("supplement rejects duplicates, unknown fields, guessed metadata and unlicensed relabelling", () => {
  for (const mutate of [
    value => { value.id = "other-import"; },
    value => { value.apiKey = "private"; },
    value => { value.workbookSha256 = ["a".repeat(64)]; },
    value => { value.source.license = "MIT"; },
    value => { value.source.name = "ECDICT"; },
    value => { value.source.privatePath = "private.xlsx"; },
    value => { value.entries.push(structuredClone(value.entries[0])); },
    value => { value.entries.push(row({ term: "SAFETY ORACLE" })); },
    value => { value.entries[0].definition = "Unexpected runtime field"; },
    value => { value.entries[0].term = "ｓａｆｅｔｙ oracle"; },
    value => { value.entries[0].term = "safety  oracle"; },
    value => { value.entries[0].term = "safety\u202e oracle"; },
    value => { value.entries[0].partOfSpeech = "noun\nverb"; },
    value => { value.entries[0].meaning = "no Chinese"; },
    value => { value.entries[0].meaning = "中".repeat(2001); },
    value => { value.entries[0].meaning = "中文\u202e定义"; },
    value => { value.entries[0].forms = ["safety oracles", "safety oracles"]; },
    value => { value.entries[0].forms = Array(1); },
    value => { value.entries[0].forms.extra = "private"; },
    value => { Object.defineProperty(value.entries[0], "domain", { get: () => "安全验证" }); },
    value => { value.entries[0].references = []; },
    value => { value.entries[0].references[0].privateComment = "private"; },
    value => { value.entries[0].references.push(structuredClone(value.entries[0].references[0])); },
    value => { value.entries[0].references[0].locator = ""; },
    value => { value.entries[0].references[0].url = "javascript:alert(1)"; },
    value => { value.entries[0].references[0].url = "http://example.org/paper"; },
    value => { value.entries[0].references[0].url = "https://user:password@example.org/paper"; },
    value => { value.entries[0].references[0].url = "https://example.org/ space"; }
  ]) {
    const pack = fixture(); mutate(pack);
    assert.throws(() => validateDictionarySupplement(pack), /Invalid dictionary supplement/u);
  }
});

test("supplement appends a separate source without overwriting existing primary definitions", () => {
  const pack = fixture([row({ term: "hip", meaning: "另一份中文说明。" }), row()]);
  const result = build(pack, { core: [["hip", "noun", "n. 髋部；臀部", []]],
    mit: [{ term: "hip", partOfSpeech: "noun", meaning: "n. 髋关节" }] });
  assert.equal(result.manifest.schemaVersion, 2);
  assert.equal(Object.keys(result.manifest.sources).length, 5);
  assert.deepEqual(Object.keys(result.manifest.sources), ["core", "mit", "public", "original", "supplement"]);
  const hip = result.records.find(entry => entry.term === "hip");
  assert.equal(hip.source, "core"); assert.equal(hip.meaning, "n. 髋部；臀部");
  assert.deepEqual(hip.variants.map(variant => variant.source), ["mit", "supplement"]);
  assert.deepEqual(Object.keys(hip.variants[1]).sort(), ["meaning", "partOfSpeech", "source"]);
  const added = result.records.find(entry => entry.term === "safety oracle");
  assert.equal(added.source, "supplement"); assert.equal(added.seed, undefined);
  assert.equal(added.references, undefined); assert.equal(added.domain, undefined);
  assert.deepEqual(result.manifest.sources.supplement, { ...DICTIONARY_SUPPLEMENT_SOURCE,
    sha256: dictionarySupplementIntegrity(pack).semanticSha256 });
  assert.equal(result.report.mitRows, 1); assert.equal(result.report.supplementRows, 2);
  assert.equal(result.report.commercialDefinitionsUsed, false);
  assert.match(result.report.sourcePolicy, /separate non-MIT source/u);
  assert.deepEqual(build(pack, { core: [["hip", "noun", "n. 髋部；臀部", []]],
    mit: [{ term: "hip", partOfSpeech: "noun", meaning: "n. 髋关节" }] }).manifest, result.manifest);
  assert.equal(validateExpandedBuild(result).canonicalRecords, 2);
  const key = expandedKey("safety oracle"), descriptor = result.manifest.english.shards[expandedBucket(key)];
  const shard = JSON.parse(result.files.get(descriptor.file));
  assert.ok(shard.keys.some(([term, refs]) => term === key && refs.some(ref => ref.kind === "canonical")));
  assert.ok(!shard.keys.some(([term]) => term === "ast"), "no guessed acronym aliases");
  const token = "安全", tokenDescriptor = result.manifest.chinese.shards[expandedBucket(token)];
  assert.ok(JSON.parse(result.files.get(tokenDescriptor.file)).postings.find(([value]) => value === token)[1].includes(added.id));
});

test("supplement overlap with licensed data retains the established MIT primary", () => {
  const result = build(fixture(), { mit: [{ term: "safety oracle", partOfSpeech: "noun", meaning: "原有中文说明" }] });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].source, "mit");
  assert.equal(result.records[0].meaning, "原有中文说明");
  assert.equal(result.records[0].variants[0].source, "supplement");
  assert.equal(result.records[0].variants[0].meaning, fixture().entries[0].meaning);
  assert.equal(validateExpandedBuild(result).canonicalRecords, 1);
});

test("public cards and checked original definitions stay ahead of supplementary paraphrases", () => {
  const publicEntry = publicBaseline.entries[0], term = publicEntry.term;
  const original = { id: "supplement-test-original", headword: term, kind: "phrase", forms: [],
    senses: [{ id: "supplement-test-sense", partOfSpeech: "noun", definitionZh: "独立编写的中文定义", definitionEn: "An independently composed test definition.",
      examples: [{ en: "This is an independently composed test sentence.", zh: "这是独立编写的测试句子。" }] }],
    authorship: { method: "independent-composition", agent: "AI-assisted draft", referenceUse: "headwords-only" },
    review: { status: "checked", reviewer: "AI/test", note: "Test fixture only." } };
  const supplement = fixture([row({ term })]);
  const withPublic = build(supplement, { publicEntries: [publicEntry], originalEntries: [original] });
  assert.equal(withPublic.records[0].source, "public");
  assert.equal(withPublic.records[0].meaning, publicEntry.meaning);
  assert.deepEqual(withPublic.records[0].variants.map(value => value.source), ["original", "supplement"]);
  const onlyOriginal = build(supplement, { originalEntries: [original] });
  assert.equal(onlyOriginal.records[0].source, "original");
  assert.equal(onlyOriginal.records[0].meaning, "1. noun：独立编写的中文定义");
  assert.equal(onlyOriginal.records[0].variants[0].source, "supplement");
  assert.equal(validateExpandedBuild(withPublic).canonicalRecords, 1);
  assert.equal(validateExpandedBuild(onlyOriginal).canonicalRecords, 1);
});

test("source reference HTML is deterministic, accessible, script-free and escapes text and attributes", () => {
  const pack = fixture();
  pack.entries[0].meaning = "中文释义 <img src=x onerror=alert(1)> & 语境。";
  pack.entries[0].domain = "<script>alert(1)</script>";
  pack.entries[0].references[0] = { title: '<img src=x onerror="alert(1)"> & source',
    url: 'https://example.org/paper?value="quoted"&section=4', locator: "Definition <4> & 'scope'" };
  const html = renderDictionarySupplementReferences(pack);
  assert.equal(renderDictionarySupplementReferences(pack), html);
  assert.match(html, /dictionary\.css\?v=86/u);
  assert.match(html, /script-src 'none'/u);
  assert.match(html, /<main id="main">/u);
  assert.match(html, /aria-labelledby="reference-title-1"/u);
  assert.match(html, /dictionary\.html#q=safety%20oracle/u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; source/u);
  assert.match(html, /value=&quot;quoted&quot;&amp;section=4/u);
  assert.match(html, /Definition &lt;4&gt; &amp; &#39;scope&#39;/u);
  assert.match(html, /rel="noopener noreferrer"/u);
  assert.match(html, /不是全部新增词条的专业审校证明/u);
  assert.doesNotMatch(html, /<script\b|<img src=x|workbookSha256|inputRecordsSha256|private\.xlsx/u);
});
