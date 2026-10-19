import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { exampleSourceHash, validateExampleReview, validateExampleSourceIndex, buildDictionaryExamples, loadExampleBuild } from "../scripts/build-dictionary-examples.mjs";

const row = () => ({ term: "sample", partOfSpeech: "noun", meaningZh: "用于检测的样本", en: "The sample arrived safely at the laboratory this morning.", zh: "样本今天早上安全送达实验室。" });
const source = () => ({ schemaVersion: 1, batchId: "test", authorship: "independent-composition", entries: [row()] });
const review = pack => ({ schemaVersion: 1, sourceSha256: exampleSourceHash(pack), reviewer: "AI/independent-review", independentOfAuthor: true, approvedTerms: ["sample"], issues: [] });
const original = () => ({ entries: [{ headword: "test", review: { status: "checked", reviewer: "AI/prior-review" }, senses: [{ id: "test:sense-1", partOfSpeech: "verb", definitionZh: "检查是否正常", examples: [{ en: "Please test the device before the next lesson begins.", zh: "请在下节课开始前测试这台设备。" }] }] }] });
const build = overrides => buildDictionaryExamples({ originalPack: original(), authored: [], knownTerms: ["test", "sample"], ...overrides });

test("byte-hashed example assets retain LF bytes on Windows checkouts", async () => {
  const attributes = await readFile(new URL("../../.gitattributes", import.meta.url), "utf8");
  assert.match(attributes, /^vocab\/data\/dictionary-examples\/\*\* text eol=lf$/mu);
});

test("newly authored examples require an unchanged, independent AI review", () => {
  const pack = source(), approved = review(pack);
  assert.equal(validateExampleReview(pack, approved)[0].reviewer, "AI/independent-review");
  pack.entries[0].zh += "改";
  assert.throws(() => validateExampleReview(pack, approved), /stale/);
  assert.throws(() => validateExampleReview(source(), { ...review(source()), independentOfAuthor: false }));
  assert.throws(() => validateExampleReview(source(), { ...review(source()), reviewer: "human-certified" }));
});
test("reviews cannot approve absent, duplicate or unresolved heads", () => {
  const pack = source(), base = review(pack);
  assert.throws(() => validateExampleReview(pack, { ...base, approvedTerms: ["other"] }));
  assert.throws(() => validateExampleReview(pack, { ...base, approvedTerms: ["sample", "sample"] }));
  assert.throws(() => validateExampleReview(pack, { ...base, issues: [{ term: "sample", blocking: true }] }));
  assert.equal(validateExampleReview(pack, { ...base, approvedTerms: [] }).length, 0);
});
test("unexpected fields, missing Chinese, duplicate heads and unsafe text fail closed", () => {
  for (const change of [x => x.entries[0].extra = "copied", x => x.entries[0].zh = "not translated", x => x.entries.push({ ...row() }), x => x.entries[0].en += "\u202e", x => x.entries[0].en = "x".repeat(1201)]) {
    const pack = source(); change(pack);
    assert.throws(() => validateExampleReview(pack, review(pack)));
  }
});
test("sidecar keeps examples attached to their own selected POS and meaning", () => {
  const pack = source(), authored = validateExampleReview(pack, review(pack));
  const result = build({ authored });
  assert.deepEqual(result.manifest.counts, { heads: 2, examples: 2 });
  assert.equal(result.addedExamples, 1); assert.equal(result.originalExamples, 1);
  const sense = result.entries.find(x => x.term === "sample").senses[0];
  assert.equal(sense.meaningZh, row().meaningZh);
  assert.equal(sense.source, "原创例句·AI复核（精选义项）");
  assert.equal(sense.partOfSpeech, "noun");
});
test("deterministic, bounded assets have exact descriptors and checksums", () => {
  const result = build(), second = build();
  assert.equal(result.manifest.version, second.manifest.version);
  assert.equal(result.manifest.shards.length, 16);
  assert.equal(result.files.size, 18);
  for (const item of result.manifest.shards) {
    const bytes = result.files.get(item.file);
    assert.equal(item.bytes, bytes.length);
    assert.equal(item.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(JSON.parse(bytes).bucket, item.bucket);
    assert.ok(bytes.length < 1024 * 1024);
  }
});
test("unreleased heads, overwrites and cross-head repeated sentences are rejected", () => {
  const pack = source(), authored = validateExampleReview(pack, review(pack));
  assert.throws(() => build({ authored, knownTerms: ["test"] }), /absent/);
  assert.throws(() => build({ authored: [{ ...authored[0], term: "test" }] }), /overwrite/);
  assert.throws(() => build({ authored: [{ ...authored[0], en: original().entries[0].senses[0].examples[0].en }] }), /Repeated/);
});
test("author flags alone do not publish prior draft examples", () => {
  const pack = original(); pack.entries[0].review.status = "draft";
  assert.deepEqual(build({ originalPack: pack }).manifest.counts, { heads: 0, examples: 0 });
});

test("the explicit cumulative index preserves order and cannot traverse source directories", () => {
  assert.deepEqual(validateExampleSourceIndex({schemaVersion:1,sourceFiles:["batch-0002-a.json","batch-0001-b.json"]}),["batch-0002-a.json","batch-0001-b.json"]);
  for (const sourceFiles of [[],["../source.json"],["https://example.com/batch.json"],["batch-0002-a.json","batch-0002-a.json"],["source.json"]]) assert.throws(()=>validateExampleSourceIndex({schemaVersion:1,sourceFiles}));
});
test("the next 800 source rows are complete, unique, independently reviewed and cumulative", async () => {
  const all = new Set();
  for (const part of ["a","b","c","d"]) {
    const url = new URL(`../dictionary/examples/source/batch-0002-${part}.json`,import.meta.url);
    const source = JSON.parse(await readFile(url,"utf8"));
    const review = JSON.parse(await readFile(new URL(`../dictionary/examples/reviews/batch-0002-${part}.json`,import.meta.url),"utf8"));
    const rows=validateExampleReview(source,review);assert.equal(rows.length,200);
    for(const row of rows){assert.ok(!all.has(row.term));all.add(row.term);assert.ok(row.en.toLowerCase().includes(row.term.toLowerCase()));assert.ok(row.en.split(/\s+/u).length>=8&&row.en.split(/\s+/u).length<=18);}
  }
  const build=await loadExampleBuild();
  assert.deepEqual(build.manifest.counts,{heads:2030,examples:3419});
  assert.equal(build.originalHeads,1030);assert.equal(build.originalExamples,2419);
  assert.equal(build.addedHeads,1000);assert.equal(build.addedExamples,1000);
});
