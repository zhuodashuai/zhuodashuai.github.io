import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildExpandedDictionary, expandedBucket, expandedKey, expandedSeedIntegrity, expandedSha256,
  generateExpandedDictionary, normalizeExpandedSeed, recoverExpandedSeedFromManifest,
  recoverPinnedExpandedSeedArchive } from "../scripts/build-expanded-dictionary.mjs";
import { assertPinnedDictionarySeedIntegrity, parsePinnedDictionarySeedArchive, DICTIONARY_SEED_ARCHIVE_FILE,
  DICTIONARY_SEED_ARCHIVE_VERSION, DICTIONARY_SEED_ARCHIVE_SHA256 } from "../lib/dictionary-seed-archive.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const actualIntegrityBytes = await readFile(resolve(ROOT, "tooling/dictionary/expanded-source-integrity.json"));
const actualIntegrity = JSON.parse(actualIntegrityBytes);
const actualArchiveBytes = await readFile(resolve(ROOT, DICTIONARY_SEED_ARCHIVE_FILE));
const publicBaseline = JSON.parse(await readFile(resolve(ROOT, "vocab/data/owner-wordbook.json")));
const source = { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT", commit: "a".repeat(40), sha256: "b".repeat(64) };
const prepared = { schemaVersion: 1, source, rows: [
  { term: "go", partOfSpeech: "verb", meaning: "去；走", forms: ["gone", "went"], rank: 0, workbook: true },
  { term: "Polish", partOfSpeech: "adjective", meaning: "波兰的", forms: [], rank: 1, workbook: false },
  { term: "polish", partOfSpeech: "verb", meaning: "擦亮", forms: ["polished"], rank: 2, workbook: false }
] };
const fixture = () => {
  const result = buildExpandedDictionary({ prepared, corePayload: { schemaVersion: 1, source,
    columns: ["word", "partOfSpeech", "meaning", "forms"], entries: [["go", "verb", "前往", ["gone", "went"]]] },
    publicPayload: { ...publicBaseline, entries: [] }, originalPack: { schemaVersion: 1, name: "卓式词典", entries: [] } });
  const directory = resolve(ROOT, "nonexistent-seed-test-fixture");
  const files = new Map([...result.files].map(([file, bytes]) => [resolve(directory, file), Buffer.from(bytes)]));
  return { manifest: structuredClone(result.manifest), files, directory, reads: [], integrity: expandedSeedIntegrity(prepared) };
};
const recover = f => recoverExpandedSeedFromManifest(f.directory, f.integrity, f.manifest, {
  readBytes: async file => { f.reads.push(file); assert.ok(f.files.has(file), `Unexpected read ${file}`); return f.files.get(file); }
});
function editShard(f, bucket, mutate) {
  const descriptor = f.manifest.english.shards[bucket];
  const path = resolve(f.directory, descriptor.file);
  const shard = JSON.parse(f.files.get(path)); mutate(shard);
  const bytes = Buffer.from(`${JSON.stringify(shard)}\n`);
  f.files.set(path, bytes); descriptor.bytes = bytes.length; descriptor.sha256 = expandedSha256(bytes);
}
const canonicalBucket = expandedBucket(expandedKey("go"));
const formBucket = expandedBucket(expandedKey("went"));
assert.notEqual(canonicalBucket, formBucket);
const mutateAllCopies = (f, mutate) => {
  for (let bucket = 0; bucket < 128; bucket++) editShard(f, bucket, shard => {
    for (const record of shard.records) if (record.term === "go") mutate(record);
  });
};
async function tempRoot(t) {
  const directory = await mkdtemp(join(tmpdir(), "dictionary-seed-archive-"));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    assert.ok(directory.split(sep).at(-1).startsWith("dictionary-seed-archive-"));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("pinned historical archive authenticates exact raw bytes and immutable integrity", () => {
  assert.equal(expandedSha256(actualArchiveBytes), DICTIONARY_SEED_ARCHIVE_SHA256);
  assert.equal(parsePinnedDictionarySeedArchive(actualArchiveBytes).version, DICTIONARY_SEED_ARCHIVE_VERSION);
  assert.doesNotThrow(() => assertPinnedDictionarySeedIntegrity(structuredClone(actualIntegrity)));
  const reordered = Object.fromEntries(Object.entries(actualIntegrity).reverse());
  assert.doesNotThrow(() => assertPinnedDictionarySeedIntegrity(reordered));
  const frozen = structuredClone(actualIntegrity); Object.freeze(frozen.source); Object.freeze(frozen);
  assert.doesNotThrow(() => assertPinnedDictionarySeedIntegrity(frozen));
});

for (const nested of [false, true]) {
  for (const accessor of ["get", "set"]) test(`pinned gate rejects ${nested ? "nested" : "root"} ${accessor} without invocation`, () => {
    const value = structuredClone(actualIntegrity), object = nested ? value.source : value;
    const key = nested ? "sha256" : "semanticSha256"; let calls = 0;
    Object.defineProperty(object, key, { enumerable: true, [accessor]: () => { calls++; return "untrusted"; } });
    assert.throws(() => assertPinnedDictionarySeedIntegrity(value), /Pinned MIT seed integrity mismatch/u);
    assert.equal(calls, 0);
  });
  for (const hidden of ["extra", "existing", "symbol"]) test(`pinned gate rejects ${nested ? "nested" : "root"} ${hidden} hidden field`, () => {
    const value = structuredClone(actualIntegrity), object = nested ? value.source : value;
    if (hidden === "existing") Object.defineProperty(object, nested ? "sha256" : "semanticSha256", { enumerable: false });
    else Object.defineProperty(object, hidden === "symbol" ? Symbol("hidden") : "hidden", { value: true });
    assert.throws(() => assertPinnedDictionarySeedIntegrity(value), /Pinned MIT seed integrity mismatch/u);
  });
  test(`pinned gate rejects ${nested ? "nested" : "root"} proxy without traps`, () => {
    const value = structuredClone(actualIntegrity); let calls = 0;
    const proxy = new Proxy(nested ? value.source : value, {
      getPrototypeOf() { calls++; return Object.prototype; }, ownKeys() { calls++; return []; }, get() { calls++; return undefined; }
    });
    if (nested) value.source = proxy;
    assert.throws(() => assertPinnedDictionarySeedIntegrity(nested ? value : proxy), /Pinned MIT seed integrity mismatch/u);
    assert.equal(calls, 0);
  });
  test(`pinned gate rejects ${nested ? "nested" : "root"} non-JSON prototype`, () => {
    const value = structuredClone(actualIntegrity), object = nested ? value.source : value;
    Object.setPrototypeOf(object, null);
    assert.throws(() => assertPinnedDictionarySeedIntegrity(value), /Pinned MIT seed integrity mismatch/u);
  });
}

for (const [name, value] of [
  ["missing", undefined], ["null", null], ["string", "{}"], ["extra field", { ...actualIntegrity, regenerated: true }],
  ["changed rows", { ...actualIntegrity, rows: 102324 }],
  ["changed semantic root", { ...actualIntegrity, semanticSha256: "a".repeat(64) }],
  ["changed headlist", { ...actualIntegrity, headlistSha256: "a".repeat(64) }],
  ["changed workbook", { ...actualIntegrity, workbookHeadsSha256: "a".repeat(64) }],
  ["changed upstream", { ...actualIntegrity, source: { ...actualIntegrity.source, commit: "a".repeat(40) } }],
  ["recomputed replacement root", expandedSeedIntegrity(prepared)]
]) test(`immutable production integrity rejects ${name}`, () => {
  assert.throws(() => assertPinnedDictionarySeedIntegrity(value), /Pinned MIT seed integrity mismatch/u);
});

for (const [name, bytes] of [["string", actualArchiveBytes.toString()], ["missing", undefined],
  ["extra LF", Buffer.concat([actualArchiveBytes, Buffer.from("\n")])],
  ["replacement manifest", Buffer.from('{"schemaVersion":2}')], ["non UTF8", Buffer.from([255])]]) {
  test(`pinned manifest rejects ${name}`, () => assert.throws(() => parsePinnedDictionarySeedArchive(bytes), /archive manifest has changed/u));
}

test("explicit low-level fixture reader verifies all EN descriptors and selects unique MIT variant", async () => {
  const f = fixture(), result = await recover(f);
  assert.deepEqual(normalizeExpandedSeed(result), normalizeExpandedSeed(prepared));
  assert.deepEqual(expandedSeedIntegrity(result), f.integrity);
  assert.equal(f.reads.length, 128); assert.equal(new Set(f.reads).size, 128);
  assert.ok(f.reads.every(file => /en-\d{3}\.json$/u.test(file)));
  assert.equal(result.rows.filter(row => row.term === "go").length, 1);
  assert.equal(result.rows.find(row => row.term === "go").meaning, "去；走");
  assert.equal(result.rows.find(row => row.term === "go").workbook, true);
});

for (const [name, change] of [
  ["unsupported schema", f => { f.manifest.schemaVersion = 1; }],
  ["extra manifest field", f => { f.manifest.extra = true; }],
  ["missing descriptor", f => { f.manifest.english.shards.pop(); }],
  ["descriptor order", f => { f.manifest.english.shards.reverse(); }],
  ["unsafe path", f => { f.manifest.english.shards[0].file = "../manifest.json"; }],
  ["wrong namespace", f => { f.manifest.english.shards[0].file = `${"f".repeat(64)}/en-000.json`; }],
  ["duplicate descriptor bucket", f => { f.manifest.english.shards[1].bucket = 0; }],
  ["bad hash", f => { f.manifest.english.shards[0].sha256 = "f".repeat(64); }],
  ["wrong byte length", f => { f.manifest.english.shards[0].bytes++; }],
  ["wrong descriptor count", f => { f.manifest.english.shards[canonicalBucket].count++; }],
  ["wrong record total", f => { f.manifest.counts.records++; }],
  ["wrong key total", f => { f.manifest.counts.englishKeys++; }],
  ["MIT source mismatch", f => { f.manifest.sources.mit.sha256 = "f".repeat(64); }],
  ["header bucket", f => editShard(f, canonicalBucket, s => { s.bucket = (s.bucket + 1) % 128; })],
  ["header kind", f => editShard(f, canonicalBucket, s => { s.kind = "zh"; })],
  ["extra header field", f => editShard(f, canonicalBucket, s => { s.extra = true; })],
  ["duplicate local physical ID", f => editShard(f, canonicalBucket, s => { s.records.push(structuredClone(s.records[0])); })],
  ["conflicting physical copy", f => editShard(f, formBucket, s => { s.records.find(r => r.term === "go").meaning = "被改动的释义"; })],
  ["unknown source", f => mutateAllCopies(f, r => { r.source = "unknown"; })],
  ["noncanonical forms", f => mutateAllCopies(f, r => { r.forms = ["went", "gone", "went"]; })],
  ["wrong ID bucket", f => mutateAllCopies(f, r => { r.id++; })],
  ["missing local referenced copy", f => editShard(f, formBucket, s => { s.records = s.records.filter(r => r.term !== "go"); })],
  ["wrong key bucket", f => editShard(f, formBucket, s => { s.keys[0][0] = "go"; })],
  ["duplicate key", f => editShard(f, formBucket, s => { s.keys.push(structuredClone(s.keys[0])); f.manifest.english.shards[formBucket].count++; })],
  ["duplicate ref with reordered properties", f => editShard(f, formBucket, s => { const ref = s.keys[0][1][0]; s.keys[0][1].push(Object.fromEntries(Object.entries(ref).reverse())); })],
  ["unsupported ref kind", f => editShard(f, formBucket, s => { s.keys[0][1][0].kind = "seed-form"; })],
  ["form absent from active forms", f => editShard(f, formBucket, s => { s.keys[0][1][0].term = "not-went"; })],
  ["canonical ref with context gloss", f => editShard(f, canonicalBucket, s => { s.keys.find(([k]) => k === "go")[1][0].meaning = "错误"; })],
  ["canonical row unreferenced", f => editShard(f, canonicalBucket, s => { s.keys = s.keys.filter(([k]) => k !== "go"); f.manifest.english.shards[canonicalBucket].count--; })]
]) test(`historical EN verification rejects ${name} even with rewritten shard hashes`, async () => {
  const f = fixture(); change(f); await assert.rejects(recover(f));
});

for (const [name, change] of [
  ["rank", r => { r.seed.rank = 5; }], ["workbook flag", r => { r.seed.workbook = false; }],
  ["sorted unique seed forms", r => { r.seed.forms = ["went", "gone", "went"]; }],
  ["seed field", r => { r.seed.extra = true; }], ["missing seed", r => { delete r.seed; }],
  ["original MIT meaning", r => { r.variants.find(v => v.source === "mit").meaning = "改变的词义"; }],
  ["original MIT POS", r => { r.variants.find(v => v.source === "mit").partOfSpeech = "noun"; }],
  ["missing MIT identity", r => { r.variants = []; }],
  ["ambiguous MIT identity", r => { r.variants.push(structuredClone(r.variants.find(v => v.source === "mit"))); }]
]) test(`immutable source verification rejects changed ${name}`, async () => {
  const f = fixture(); mutateAllCopies(f, change); await assert.rejects(recover(f));
});

test("fresh production recovery authenticates actual archived 102325-row MIT root without reading active manifest", async () => {
  const recovered = await recoverPinnedExpandedSeedArchive({ root: ROOT, integrity: actualIntegrity });
  assert.equal(recovered.rows.length, 102325);
  assert.deepEqual(expandedSeedIntegrity(recovered), actualIntegrity);
  assert.equal(expandedSeedIntegrity(recovered).semanticSha256, "228cea0075dc455d4e9fb4633cdc7a9671a39f88b4b031b5643e8207d6f4a98b");
  assert.deepEqual(await readFile(resolve(ROOT, "tooling/dictionary/expanded-source-integrity.json")), actualIntegrityBytes);
  assert.deepEqual(await readFile(resolve(ROOT, DICTIONARY_SEED_ARCHIVE_FILE)), actualArchiveBytes);
});

test("missing pinned archive cannot fall back to an existing active manifest", async t => {
  const root = await tempRoot(t), f = fixture();
  await mkdir(join(root, "vocab/data/expanded-dictionary"), { recursive: true });
  await writeFile(join(root, "vocab/data/expanded-dictionary/manifest.json"), JSON.stringify(f.manifest));
  await assert.rejects(recoverPinnedExpandedSeedArchive({ root, integrity: actualIntegrity }), error => error.code === "ENOENT");
});

test("changed pinned archive cannot fall back to an active manifest", async t => {
  const root = await tempRoot(t);
  await mkdir(join(root, "tooling/dictionary/source-revisions"), { recursive: true });
  await writeFile(join(root, DICTIONARY_SEED_ARCHIVE_FILE), Buffer.concat([actualArchiveBytes, Buffer.from("\n")]));
  await assert.rejects(recoverPinnedExpandedSeedArchive({ root, integrity: actualIntegrity }), /archive manifest has changed/u);
});

for (const withPrepared of [false, true]) test(`missing integrity fails without bootstrap${withPrepared ? " even with --prepared" : ""}`, async t => {
  const root = await tempRoot(t), preparedPath = join(root, "prepared.json");
  if (withPrepared) await writeFile(preparedPath, JSON.stringify(prepared));
  await assert.rejects(generateExpandedDictionary({ root, ...(withPrepared ? { preparedPath } : {}) }), /Missing reviewed MIT seed integrity/u);
  await assert.rejects(stat(join(root, "tooling/dictionary/expanded-source-integrity.json")), error => error.code === "ENOENT");
});

test("recomputed malicious integrity and matching --prepared cannot replace the immutable production root", async t => {
  const root = await tempRoot(t), preparedPath = join(root, "prepared.json");
  await mkdir(join(root, "tooling/dictionary"), { recursive: true });
  const forged = Buffer.from(`${JSON.stringify(expandedSeedIntegrity(prepared))}\n`);
  await writeFile(join(root, "tooling/dictionary/expanded-source-integrity.json"), forged);
  await writeFile(preparedPath, JSON.stringify(prepared));
  await assert.rejects(generateExpandedDictionary({ root, preparedPath }), /Pinned MIT seed integrity mismatch/u);
  assert.deepEqual(await readFile(join(root, "tooling/dictionary/expanded-source-integrity.json")), forged);
});
