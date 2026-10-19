import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { exampleSourceHash, validateExampleReview, validateExampleSourceIndex, buildDictionaryExamples, loadExampleBuild } from "../scripts/build-dictionary-examples.mjs";
import { parseDictionaryExamplesManifest, parseDictionaryExamplesShard } from "../../vocab/js/dictionary-examples.js";

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
  assert.equal(result.manifest.shards.length, 256);
  assert.equal(result.files.size, 258);
  for (const item of result.manifest.shards) {
    const bytes = result.files.get(item.file);
    assert.equal(item.bytes, bytes.length);
    assert.equal(item.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(JSON.parse(bytes).bucket, item.bucket);
    assert.ok(bytes.length < 1024 * 1024);
  }
});

test("the bounded directory supports 80,890 synthetic heads without a full headword index or oversized download", () => {
  // Transport-capacity fixture only: these are not authored or published words.
  const authored = Array.from({ length: 80890 }, (_, i) => ({ term: `fixture-${i}`, partOfSpeech: "noun",
    meaningZh: "容量测试占位符", en: `Synthetic test item ${i} checks the data transport only.`, zh: `第${i}项仅测试数据传输。`, reviewer: "AI/test-fixture" }));
  const result = build({ originalPack: { entries: [] }, authored, knownTerms: authored.map(row => row.term) });
  const parsed = parseDictionaryExamplesManifest(result.manifest);
  assert.equal(parsed.counts.heads, 80890);
  assert.equal(Object.hasOwn(parsed, "keys"), false);
  assert.ok(result.files.get("manifest-v2.json").length < 100 * 1024);
  let heads = 0;
  for (const descriptor of parsed.shards) {
    assert.ok(descriptor.bytes < 512 * 1024);
    heads += parseDictionaryExamplesShard(JSON.parse(result.files.get(descriptor.file)), parsed, descriptor).size;
  }
  assert.equal(heads, 80890);
});

test("punctuated and multiword heads receive safe stable sense identifiers", () => {
  const authored = ["by some fluke", "ma'am", "café"].map(term => ({ ...row(), term,
    en: `This synthetic fixture checks ${term} safely.`, reviewer: "AI/test-fixture" }));
  const result = build({ originalPack: { entries: [] }, authored, knownTerms: authored.map(row => row.term) });
  const manifest = parseDictionaryExamplesManifest(result.manifest);
  for (const descriptor of manifest.shards) parseDictionaryExamplesShard(JSON.parse(result.files.get(descriptor.file)), manifest, descriptor);
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
test("the previous 800 source rows remain complete, unique and independently reviewed", async () => {
  const all = new Set();
  for (const part of ["a","b","c","d"]) {
    const url = new URL(`../dictionary/examples/source/batch-0002-${part}.json`,import.meta.url);
    const source = JSON.parse(await readFile(url,"utf8"));
    const review = JSON.parse(await readFile(new URL(`../dictionary/examples/reviews/batch-0002-${part}.json`,import.meta.url),"utf8"));
    const rows=validateExampleReview(source,review);assert.equal(rows.length,200);
    for(const row of rows){assert.ok(!all.has(row.term));all.add(row.term);assert.ok(row.en.toLowerCase().includes(row.term.toLowerCase()));assert.ok(row.en.split(/\s+/u).length>=8&&row.en.split(/\s+/u).length<=18);}
  }
});

test("the prior 2,400 rows remain independently cross-reviewed and preserve all earlier examples", async () => {
  const all = new Set(), sentences = new Set();
  for (const part of "abcdefghijkl") {
    const source = JSON.parse(await readFile(new URL(`../dictionary/examples/source/batch-0003-${part}.json`, import.meta.url), "utf8"));
    const review = JSON.parse(await readFile(new URL(`../dictionary/examples/reviews/batch-0003-${part}.json`, import.meta.url), "utf8"));
    const reviewer = "abcd".includes(part) ? "c" : "efgh".includes(part) ? "a" : "b";
    assert.equal(review.reviewer, `AI/examples_0003_${reviewer}`);
    const rows = validateExampleReview(source, review);
    assert.equal(source.batchId, `examples-0003-${part}`);
    assert.equal(source.entries.length, 200); assert.equal(rows.length, 200);
    for (const row of rows) {
      assert.ok(!all.has(row.term)); all.add(row.term);
      const sentence = row.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
      assert.ok(!sentences.has(sentence)); sentences.add(sentence);
      assert.ok(row.en.split(/\s+/u).length >= 5 && row.en.split(/\s+/u).length <= 30);
      assert.doesNotMatch(row.en, /\b(?:this word means|the word means|an example of this word)\b/iu);
    }
  }
  assert.equal(all.size, 2400);
  const build = await loadExampleBuild();
  const index = JSON.parse(await readFile(new URL("../dictionary/examples/index.json", import.meta.url), "utf8"));
  let authoredHeads = 0;
  for (const file of validateExampleSourceIndex(index)) {
    const pack = JSON.parse(await readFile(new URL(`../dictionary/examples/source/${file}`, import.meta.url), "utf8"));
    const review = JSON.parse(await readFile(new URL(`../dictionary/examples/reviews/${file}`, import.meta.url), "utf8"));
    authoredHeads += validateExampleReview(pack, review).length;
  }
  assert.ok(authoredHeads >= 3400);
  assert.deepEqual(build.manifest.counts, { heads: 1030 + authoredHeads, examples: 2419 + authoredHeads });
  assert.equal(build.originalHeads, 1030); assert.equal(build.originalExamples, 2419);
  assert.equal(build.addedHeads, authoredHeads); assert.equal(build.addedExamples, authoredHeads);
  // The old, immutable manifest is retained for already-open client versions.
  const legacy = JSON.parse(await readFile(new URL("../../vocab/data/dictionary-examples/manifest.json", import.meta.url), "utf8"));
  const current = new Map(build.entries.map(row => [row.term, row]));
  let retained = 0;
  for (const descriptor of legacy.shards) {
    const shard = JSON.parse(await readFile(new URL(`../../vocab/data/dictionary-examples/${descriptor.file}`, import.meta.url), "utf8"));
    for (const row of shard.entries) { assert.deepEqual(current.get(row.term), row); retained++; }
  }
  assert.equal(retained, 2030);
});

test("the last released 4,430 heads remain unchanged when later reviewed batches are appended", async () => {
  const build = await loadExampleBuild(), current = new Map(build.entries.map(row => [row.term, row]));
  const version = "19bfe8e62367839cb125f676e26de766f65698bdd53505ebe28d92cc4f06c6e6";
  let retained = 0;
  for (let bucket = 0; bucket < 256; bucket++) {
    const shard = JSON.parse(await readFile(new URL(`../../vocab/data/dictionary-examples/${version}/examples-${bucket}.json`, import.meta.url), "utf8"));
    for (const row of shard.entries) { assert.deepEqual(current.get(row.term), row); retained++; }
  }
  assert.equal(retained, 4430);
});

test("four continuation batches are cross-reviewed, with explicit deferral instead of fabricated completion", async () => {
  const written = new Set(), approved = new Set(), deferred = new Map(), sentences = new Set();
  for (const batch of ["0004", "0005", "0006", "0007"]) {
    for (const part of "abcdefghijkl") {
      const file = `batch-${batch}-${part}.json`;
      const pack = JSON.parse(await readFile(new URL(`../dictionary/examples/source/${file}`, import.meta.url), "utf8"));
      const review = JSON.parse(await readFile(new URL(`../dictionary/examples/reviews/${file}`, import.meta.url), "utf8"));
      assert.equal(pack.batchId, `examples-${batch}-${part}`);
      assert.equal(pack.entries.length, 200);
      const reviewer = "abcd".includes(part) ? "c" : "efgh".includes(part) ? "a" : "b";
      assert.equal(review.reviewer, `AI/examples4_${reviewer}`);
      const checked = validateExampleReview(pack, review), checkedTerms = new Set(checked.map(row => row.term));
      for (const row of pack.entries) {
        assert.ok(!written.has(row.term), `Repeated continuation head: ${row.term}`); written.add(row.term);
        if (!checkedTerms.has(row.term)) {
          assert.ok(review.issues.some(issue => issue.term === row.term && issue.blocking === true && issue.resolution?.trim()), `Unexplained deferral: ${row.term}`);
          deferred.set(row.term, row);
        }
      }
      for (const row of checked) {
        approved.add(row.term);
        const sentence = row.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
        assert.ok(!sentences.has(sentence), `Repeated continuation example: ${row.term}`); sentences.add(sentence);
        assert.ok(row.en.split(/\s+/u).length >= 5 && row.en.split(/\s+/u).length <= 30, row.term);
        assert.doesNotMatch(row.en, /\b(?:this word means|the word means|an example of this word)\b/iu);
      }
    }
  }
  assert.equal(written.size, 9600);
  assert.equal(approved.size + deferred.size, written.size);
  const build = await loadExampleBuild(), published = new Set(build.entries.map(row => row.term));
  // Later batches may extend the index; this fixture must continue protecting
  // these reviewed entries without imposing an obsolete global ceiling.
  assert.ok(build.addedHeads >= 3400 + approved.size);
  for (const term of approved) assert.ok(published.has(term), `Approved example missing: ${term}`);
  for (const [term, unapproved] of deferred) {
    // A later, separately reviewed example may legitimately resolve this head.
    // The unapproved source sentence itself must never enter the release.
    const entry = build.entries.find(row => row.term === term);
    assert.ok(!entry?.senses.some(sense => sense.examples.some(example => example.en === unapproved.en && example.zh === unapproved.zh)), `Deferred example published: ${term}`);
  }
  assert.ok(deferred.has("tion"));
});

test("the released 14,026-head catalogue is preserved exactly when batches 0008 and 0009 are added", async () => {
  const build = await loadExampleBuild(), current = new Map(build.entries.map(row => [row.term, row]));
  const version = "fe04743b8aa2a984094c9ba72a5f6836d7bb7f25d1e47c796cd0b720e0d20a50";
  let heads = 0, pairs = 0;
  for (let bucket = 0; bucket < 256; bucket++) {
    const shard = JSON.parse(await readFile(new URL(`../../vocab/data/dictionary-examples/${version}/examples-${bucket}.json`, import.meta.url), "utf8"));
    for (const row of shard.entries) {
      assert.deepEqual(current.get(row.term), row, row.term); heads++;
      pairs += row.senses.reduce((sum, sense) => sum + sense.examples.length, 0);
    }
  }
  assert.equal(heads, 14026); assert.equal(pairs, 15415);
});

test("batches 0008 and 0009 publish only independently approved examples and account for every queued head", async () => {
  const build = await loadExampleBuild(), current = new Map(build.entries.map(row => [row.term, row]));
  const queue = JSON.parse(await readFile(new URL("../dictionary/examples/queues/batches-0008-0009.json", import.meta.url), "utf8"));
  assert.equal(queue.schemaVersion, 1);
  assert.equal(queue.sourceDictionaryVersion, "36d4341b4f126a1711045b6df375cd12eb20641c81a0bca722a90d2f46848d7b");
  assert.equal(queue.baselineExampleVersion, "fe04743b8aa2a984094c9ba72a5f6836d7bb7f25d1e47c796cd0b720e0d20a50");
  const queuedPacks = new Map(queue.batches.map(pack => [pack.batchId, pack.terms]));
  assert.equal(queue.batches.length, 24); assert.equal(queuedPacks.size, 24);
  const written = new Set(), approved = new Set(), sentences = new Set(), deferred = [];
  for (const batch of ["0008", "0009"]) for (const part of "abcdefghijkl") {
    const file = `batch-${batch}-${part}.json`;
    const pack = JSON.parse(await readFile(new URL(`../dictionary/examples/source/${file}`, import.meta.url), "utf8"));
    const review = JSON.parse(await readFile(new URL(`../dictionary/examples/reviews/${file}`, import.meta.url), "utf8"));
    assert.equal(pack.batchId, `examples-${batch}-${part}`); assert.equal(pack.entries.length, 200);
    const queuedTerms = queuedPacks.get(pack.batchId);
    assert.equal(queuedTerms?.length, 200);
    assert.deepEqual(pack.entries.map(row => row.term), queuedTerms, `Authored heads differ from the frozen queue: ${file}`);
    const reviewer = "abcd".includes(part) ? "c" : "efgh".includes(part) ? "a" : "b";
    assert.equal(review.reviewer, `AI/examples8_${reviewer}`);
    const checked = validateExampleReview(pack, review), accepted = new Set(checked.map(row => row.term));
    for (const row of pack.entries) {
      assert.ok(!written.has(row.term), `Repeated batch 0008/0009 head: ${row.term}`); written.add(row.term);
      if (!accepted.has(row.term)) {
        assert.ok(review.issues.some(issue => issue.term === row.term && issue.blocking === true && issue.resolution?.trim()), `Unexplained deferral: ${row.term}`);
        deferred.push(row);
      }
    }
    for (const row of checked) {
      approved.add(row.term);
      const sentence = row.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
      assert.ok(!sentences.has(sentence), `Repeated batch 0008/0009 sentence: ${row.term}`); sentences.add(sentence);
      assert.ok(row.en.split(/\s+/u).length >= 5 && row.en.split(/\s+/u).length <= 30, row.term);
      assert.doesNotMatch(row.en, /\b(?:this word means|the word means|an example of this word)\b/iu);
      const entry = current.get(row.term);
      assert.ok(entry, `Reviewed example missing: ${row.term}`); assert.equal(entry.senses.length, 1);
      const sense = entry.senses[0];
      assert.equal(sense.partOfSpeech, row.partOfSpeech); assert.equal(sense.meaningZh, row.meaningZh); assert.equal(sense.reviewer, review.reviewer);
      assert.deepEqual(sense.examples, [{ en: row.en, zh: row.zh }]);
    }
  }
  assert.equal(written.size, 4800); assert.equal(approved.size + deferred.length, written.size);
  assert.ok(build.manifest.counts.heads >= 14026 + approved.size);
  for (const row of deferred) {
    assert.ok(!current.get(row.term)?.senses.some(sense => sense.examples.some(example => example.en === row.en && example.zh === row.zh)), `Unapproved sentence published: ${row.term}`);
  }
});
