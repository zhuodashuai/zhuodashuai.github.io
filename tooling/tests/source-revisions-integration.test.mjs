import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";
import { verifyDictionaryPos } from "../lib/dictionary-pos.mjs";
import { verifyDictionarySupplement } from "../lib/dictionary-supplement.mjs";
import { verifyDictionarySourceRevisions, DICTIONARY_SOURCE_REVISION_SOURCE } from "../lib/dictionary-source-revisions.mjs";
import { buildExpandedDictionary, expandedSeedIntegrity, expandedBucket, expandedKey, expandedSha256,
  recoverPinnedExpandedSeedArchive, validateExpandedBuild } from "../scripts/build-expanded-dictionary.mjs";
import { buildDictionarySuggestions } from "../scripts/build-dictionary-suggestions.mjs";
import { loadExpandedPublicSource } from "../lib/expanded-public-source.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = async file => JSON.parse(await readFile(resolve(root, file), "utf8"));
const revisionDirectory = "tooling/dictionary/source-revisions/";
const pack = await read(`${revisionDirectory}finite-grammar-0001.json`);
const verified = verifyDictionarySourceRevisions(pack, await read(`${revisionDirectory}finite-grammar-0001.integrity.json`),
  await read(`${revisionDirectory}finite-grammar-0001.review.json`));
const terms = ["are", "did", "had", "been"];
const removed = ["ares", "dids", "hads", "beens"];
const seedRoot = "228cea0075dc455d4e9fb4633cdc7a9671a39f88b4b031b5643e8207d6f4a98b";
const en = (build, key) => JSON.parse(build.files.get(build.manifest.english.shards[expandedBucket(expandedKey(key))].file));
const refs = (build, key) => en(build, key).keys.find(([word]) => word === expandedKey(key))?.[1];

test("actual four-record integration preserves old source identity and all non-target records/references in memory", async () => {
  const directory = resolve(root, "vocab/data/expanded-dictionary");
  // All inputs remain read-only. No generated namespace or manifest is written.
  const oldRecords = new Map(), oldRefs = new Map(), oldDescriptors = [];
  for (let bucket = 0; bucket < 128; bucket++) {
    const file = `${pack.originalDictionaryVersion}/en-${String(bucket).padStart(3, "0")}.json`;
    const bytes = await readFile(resolve(directory, file));
    const shard = JSON.parse(bytes);
    assert.equal(shard.schemaVersion, 2); assert.equal(shard.kind, "en"); assert.equal(shard.bucket, bucket);
    oldDescriptors.push({ bucket, file, sha256: expandedSha256(bytes), bytes: bytes.length, count: shard.keys.length });
    for (const record of shard.records) {
      if (oldRecords.has(record.term)) assert.deepEqual(record, oldRecords.get(record.term));
      else oldRecords.set(record.term, record);
    }
    for (const [key, value] of shard.keys) { assert(!oldRefs.has(key)); oldRefs.set(key, value); }
  }
  // Original immutable namespace remains the baseline even after manifest.json
  // points to the corrected namespace. The digest pins all128 actual old shard
  // hashes/paths/sizes/counts, rather than trusting rewritten descriptor data.
  assert.equal(expandedSha256(JSON.stringify(oldDescriptors)), "0ccf8055e3c1ffec7e0dd582fbb1178db323ee1eb07a2d07c2dd9ebcebcc4805");
  const integrity = await read("tooling/dictionary/expanded-source-integrity.json");
  const prepared = await recoverPinnedExpandedSeedArchive({ root, integrity });
  assert.equal(expandedSeedIntegrity(prepared).semanticSha256, seedRoot);
  const catalogue = await loadOriginalCatalogue({ indexPath: resolve(root, "tooling/dictionary/source/index.json"),
    reviewDirectory: resolve(root, "tooling/dictionary/reviews") });
  const build = buildExpandedDictionary({ prepared, corePayload: await read("vocab/data/ecdict-core.json"),
    publicPayload: await loadExpandedPublicSource({ root }), originalPack: catalogue.pack,
    supplementPack: verifyDictionarySupplement(await read("tooling/dictionary/supplements/import-2026-10-19.json"),
      await read("tooling/dictionary/supplements/integrity.json")),
    posPack: verifyDictionaryPos(await read("tooling/dictionary/pos/pos-completion-2026-10-19.json"),
      await read("tooling/dictionary/pos/integrity.json")), sourceRevisionPack: verified });
  const byTerm = new Map(build.records.map(record => [record.term, record]));
  assert.equal(byTerm.size, 102609); assert.equal(oldRecords.size, 102609);
  let unchanged = 0;
  for (const [term, old] of oldRecords) {
    if (terms.includes(term)) continue;
    assert.deepEqual(byTerm.get(term), old, `unlisted canonical changed: ${term}`); unchanged++;
  }
  assert.equal(unchanged, 102605);
  for (const entry of pack.entries) {
    assert.deepEqual(oldRecords.get(entry.term), entry.before);
    assert.deepEqual(byTerm.get(entry.term), entry.after);
    assert.deepEqual(byTerm.get(entry.term).seed, entry.before.seed);
    assert.deepEqual(byTerm.get(entry.term).variants, entry.before.variants);
    assert.equal(refs(build, entry.term).find(ref => ref.kind === "canonical").id, entry.id);
  }
  for (const alias of removed) assert.equal(refs(build, alias), undefined, `historical seed alias regenerated: ${alias}`);
  for (const [parent, form] of [["do", "did"], ["have", "had"], ["be", "been"]]) {
    const actual = refs(build, form);
    assert.deepEqual(actual, oldRefs.get(form));
    assert.ok(actual.some(ref => ref.kind === "form" && ref.id === byTerm.get(parent).id));
    assert.ok(actual.some(ref => ref.kind === "canonical" && ref.id === byTerm.get(form).id));
  }
  const expectedRefs = new Map(oldRefs);
  for (const alias of removed) expectedRefs.delete(alias);
  const newRefs = new Map(build.manifest.english.shards.flatMap(descriptor => JSON.parse(build.files.get(descriptor.file)).keys));
  assert.deepEqual(newRefs, expectedRefs); // Includes all context and case-distinct refs.
  const recoveredAfter = { ...prepared, rows: build.records.filter(record => record.seed).map(record => {
    const original = [record, ...(record.variants || [])].find(value => value.source === "mit");
    assert(original); return { term: record.term, partOfSpeech: original.partOfSpeech, meaning: original.meaning, ...record.seed };
  }) };
  assert.deepEqual(expandedSeedIntegrity(recoveredAfter), integrity);
  assert.equal(build.report.posReview.applied, build.report.posReview.finalPosReviewed + 4);
  assert.equal(build.report.posReview.subsequentlyRevised, 4);
  assert.equal(build.report.sourceRevisions.applied, 4);
  assert.deepEqual(build.report.sourceRevisions.changedTerms, terms);
  assert.deepEqual(build.manifest.sources["grammar-reviewed"], verified.source);
  assert.equal(verified.source.name, DICTIONARY_SOURCE_REVISION_SOURCE.name);
  assert.equal(verified.source.sha256, build.report.sourceRevisions.ledgerSha256);
  assert.equal(validateExpandedBuild(build).canonicalRecords, 102609);
  const shards = new Map(build.manifest.english.shards.map(descriptor => [descriptor.file, build.files.get(descriptor.file)]));
  const suggestions = buildDictionarySuggestions({ manifest: build.manifest, shards });
  for (const term of terms) assert.ok(suggestions.rows.some(([head]) => head === term));
  for (const alias of removed) assert.ok(!suggestions.rows.some(([head]) => head === alias));

  // Correctly re-hash a stale alias payload: semantic validation, not only SHA,
  // must still reject a ref that contradicts the final active forms.
  const corrupt = { ...build, manifest: structuredClone(build.manifest), files: new Map(build.files) };
  const descriptor = corrupt.manifest.english.shards[expandedBucket("ares")];
  const shard = JSON.parse(corrupt.files.get(descriptor.file));
  const are = byTerm.get("are");
  if (!shard.records.some(record => record.id === are.id)) shard.records.push(are);
  shard.keys.push(["ares", [{ id: are.id, kind: "form", term: "ares" }]]);
  const body = `${JSON.stringify(shard)}\n`; corrupt.files.set(descriptor.file, body);
  descriptor.sha256 = expandedSha256(body); descriptor.bytes = Buffer.byteLength(body);
  descriptor.count++; corrupt.manifest.counts.englishKeys++;
  assert.throws(() => validateExpandedBuild(corrupt), /final active record/u);
  assert.throws(() => buildDictionarySuggestions({ manifest: corrupt.manifest,
    shards: new Map(corrupt.manifest.english.shards.map(d => [d.file, corrupt.files.get(d.file)])) }), /incorrect form reference/u);
});

test("suggestions recognize only the explicit grammar provenance, not arbitrary new source ids or wrong descriptors", async () => {
  const source = { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT",
    commit: "a".repeat(40), sha256: "b".repeat(64) };
  // Reuse the public envelope rather than inventing schema fields.
  const value = await read("vocab/data/owner-wordbook.json");
    const build = buildExpandedDictionary({ prepared: { schemaVersion: 1, source, rows: [] },
      corePayload: { schemaVersion: 1, source, columns: ["word", "partOfSpeech", "meaning", "forms"], entries: [] },
      publicPayload: { ...value, entries: [] }, originalPack: { schemaVersion: 1, name: "卓式词典", entries: [] } });
    const shards = new Map(build.manifest.english.shards.map(d => [d.file, build.files.get(d.file)]));
    const valid = structuredClone(build.manifest); valid.sources["grammar-reviewed"] = { ...verified.source };
    assert.equal(buildDictionarySuggestions({ manifest: valid, shards }).rows.length, 0);
    for (const mutate of [
      m => { m.sources["unreviewed-new-source"] = { ...verified.source }; },
      m => { m.sources["grammar-reviewed"].name = "ECDICT"; },
      m => { m.sources["grammar-reviewed"].license = "MIT"; },
      m => { m.sources["grammar-reviewed"].url = "https://example.org/wrong"; },
      m => { delete m.sources["grammar-reviewed"].sha256; },
      m => { m.sources["grammar-reviewed"].sha256 = "changed"; }
    ]) { const wrong = structuredClone(valid); mutate(wrong); assert.throws(() => buildDictionarySuggestions({ manifest: wrong, shards }), /provenance/u); }
    assert.throws(() => buildExpandedDictionary({ prepared: { schemaVersion: 1, source, rows: [] },
      corePayload: { schemaVersion: 1, source, columns: ["word", "partOfSpeech", "meaning", "forms"], entries: [] },
      publicPayload: { ...value, entries: [] }, originalPack: { schemaVersion: 1, name: "卓式词典", entries: [] }, sourceRevisionPack: pack }), /verified|verification|brand/iu);
});
