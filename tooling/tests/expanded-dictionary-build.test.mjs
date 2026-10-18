import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { buildExpandedDictionary, expandedBucket, expandedChineseTokens, expandedKey, expandedSeedIntegrity,
  expandedSha256, normalizeExpandedSeed, recoverExpandedSeed, validateExpandedBuild } from "../scripts/build-expanded-dictionary.mjs";

const publicBaseline = JSON.parse(await readFile(new URL("../../vocab/data/owner-wordbook.json", import.meta.url)));
const emptyPublic = { ...publicBaseline, entries: [] };
const source = { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT", commit: "a".repeat(40), sha256: "b".repeat(64) };
const emptyOriginal = { schemaVersion: 1, name: "卓式词典", entries: [] };
const core = (rows = []) => ({ schemaVersion: 1, source, columns: ["word", "partOfSpeech", "meaning", "forms"], entries: rows });
const seed = rows => ({ schemaVersion: 1, source, rows: rows.map((item, rank) => ({ forms: [], workbook: false, rank, ...item })) });
function build(prepared, extra = {}) { return buildExpandedDictionary({ prepared, corePayload: core(), publicPayload: emptyPublic, originalPack: emptyOriginal, ...extra }); }
const english = (build, key) => JSON.parse(build.files.get(build.manifest.english.shards[expandedBucket(expandedKey(key))].file));
const reference = (build, key) => english(build, key).keys.find(([word]) => word === expandedKey(key))?.[1];

test("expanded shards are deterministic and retain editorial primary plus full licensed variants", () => {
  const prepared = seed([{ term: "hip", partOfSpeech: "noun adjective", meaning: "n. 髋部；屋脊\nadj. 时髦的", forms: ["hips"], workbook: true }]);
  const corePayload = core([["hip", "noun", "n. 髋部；臀部\nadj. 时髦的", ["hips"]]]);
  const a = build(prepared, { corePayload }), b = build(prepared, { corePayload });
  assert.deepEqual(a.manifest, b.manifest); assert.deepEqual([...a.files], [...b.files]);
  assert.equal(a.records.length, 1); assert.equal(a.records[0].source, "core");
  assert.equal(a.records[0].partOfSpeech, "noun · adjective");
  assert.equal(a.records[0].variants.find(item => item.source === "mit").meaning, prepared.rows[0].meaning);
  assert.equal(a.records[0].seed.workbook, true);
  assert.deepEqual(validateExpandedBuild(a), { canonicalRecords: 1, englishKeys: 2, chineseTokens: a.manifest.counts.chineseTokens, allReferencesVerified: true, allHanPostingsVerified: true });
});

test("literal compounds and suffixes stay separate; known and ambiguous forms carry complete records in one bucket", () => {
  const result = build(seed([
    { term: "able", partOfSpeech: "adjective", meaning: "有能力的" },
    { term: "ability", partOfSpeech: "noun", meaning: "能力", forms: ["abilities"] },
    { term: "go", partOfSpeech: "verb", meaning: "去；走", forms: ["went", "gone"] },
    { term: "axe", partOfSpeech: "noun", meaning: "斧", forms: ["axes"] },
    { term: "axis", partOfSpeech: "noun", meaning: "轴", forms: ["axes"] },
    { term: "well-being", partOfSpeech: "noun", meaning: "安康" }
  ]));
  assert.notEqual(reference(result, "ability")[0].id, reference(result, "able")[0].id);
  assert.equal(reference(result, "well being"), undefined);
  const refs = reference(result, "axes"); assert.equal(new Set(refs.map(item => item.id)).size, 2);
  const shard = english(result, "axes"); assert.ok(refs.every(ref => shard.records.some(row => row.id === ref.id)));
  const went = reference(result, "went")[0]; assert.equal(went.kind, "form");
  assert.equal(english(result, "went").records.find(row => row.id === went.id).term, "go");
  assert.equal(reference(result, "go")[0].kind, "canonical");
  assert.equal(validateExpandedBuild(result).canonicalRecords, 6);
});

test("case-distinct canonical spellings are preserved instead of silently collapsed", () => {
  const result = build(seed([{ term: "Polish", partOfSpeech: "adjective", meaning: "波兰的" }, { term: "polish", partOfSpeech: "verb", meaning: "擦亮" }]));
  assert.equal(result.records.length, 2); assert.equal(reference(result, "POLISH").filter(item => item.kind === "canonical").length, 2);
  assert.equal(result.report.canonicalCasefoldCollisions, 1); validateExpandedBuild(result);
});

test("Han postings contain every real single character and adjacent bigram from all source variants", () => {
  const result = build(seed([{ term: "tasty", partOfSpeech: "adjective", meaning: "美味；可口" }]), { corePayload: core([["tasty", "adjective", "好吃的", []]]) });
  assert.deepEqual(expandedChineseTokens("美味，可口"), ["口", "可", "可口", "味", "美", "美味"].sort());
  assert.ok(!expandedChineseTokens("美味，可口").includes("味可"));
  for (const token of ["好", "好吃", "美味", "可口"]) {
    const shard = JSON.parse(result.files.get(result.manifest.chinese.shards[expandedBucket(token)].file));
    assert.deepEqual(shard.postings.find(([candidate]) => candidate === token)[1], [result.records[0].id]);
  }
  validateExpandedBuild(result);
});

test("public reading forms retain their own contextual gloss without replacing generic primary", () => {
  const entry = publicBaseline.entries.find(item => item.readingContexts.some(context => expandedKey(context.originalInput) !== expandedKey(item.term)));
  assert.ok(entry);
  const result = build(seed([]), { publicPayload: { ...publicBaseline, entries: [entry] } });
  const context = entry.readingContexts.find(item => expandedKey(item.originalInput) !== expandedKey(entry.term));
  const ref = reference(result, context.originalInput).find(item => item.kind === "context");
  assert.equal(ref.meaning, context.meaning); assert.equal(ref.partOfSpeech, context.partOfSpeech);
  assert.equal(english(result, context.originalInput).records.find(item => item.id === ref.id).term, entry.term);
  assert.equal(result.records[0].meaning, entry.meaning); validateExpandedBuild(result);
});

test("source digest binds all MIT semantic fields independently of shard metadata", () => {
  const prepared = seed([{ term: "tasty", partOfSpeech: "adjective", meaning: "美味的", forms: ["tastier"], workbook: true }]);
  const original = expandedSeedIntegrity(prepared);
  for (const field of ["term", "partOfSpeech", "meaning", "forms", "rank", "workbook"]) {
    const changed = structuredClone(prepared);
    changed.rows[0][field] = ({ term: "taste", partOfSpeech: "noun", meaning: "味道", forms: [], rank: 2, workbook: false })[field];
    assert.notEqual(expandedSeedIntegrity(changed).semanticSha256, original.semanticSha256, field);
  }
  assert.equal(original.source.license, "MIT"); assert.equal(original.source.sha256, source.sha256);
});

test("oversized, duplicate, unsafe or non-Chinese rows fail rather than truncate or inflate coverage", () => {
  const good = { term: "example", partOfSpeech: "noun", meaning: "例子" };
  for (const bad of [{ term: "a".repeat(201) }, { meaning: "中".repeat(2001) }, { partOfSpeech: "x".repeat(201) },
    { meaning: "not Chinese" }, { term: "abc\u0000" }, { forms: ["x".repeat(201)] }]) {
    assert.throws(() => build(seed([{ ...good, ...bad }])));
  }
  assert.throws(() => normalizeExpandedSeed(seed([good, good])), /Duplicate/u);
  assert.throws(() => build({ ...seed([good]), source: { ...source, license: "unknown" } }), /licensed/u);
});

test("full verification detects mutated English records and incorrect Chinese postings", () => {
  const original = build(seed([{ term: "example", partOfSpeech: "noun", meaning: "例子" }]));
  const altered = { ...original, files: new Map(original.files), manifest: structuredClone(original.manifest) };
  const descriptor = altered.manifest.chinese.shards.find(item => JSON.parse(altered.files.get(item.file)).postings.length);
  const shard = JSON.parse(altered.files.get(descriptor.file)); shard.postings[0][1] = [];
  const bytes = `${JSON.stringify(shard)}\n`; altered.files.set(descriptor.file, bytes);
  descriptor.sha256 = expandedSha256(bytes); descriptor.bytes = Buffer.byteLength(bytes);
  assert.throws(() => validateExpandedBuild(altered), /Han posting/u);
});

test("core missing Chinese and out-of-contract public cards are explicitly counted without changing source data", () => {
  const publicPayload = structuredClone(publicBaseline); publicPayload.entries = publicPayload.entries.slice(0, 1);
  const term = publicPayload.entries[0].term; publicPayload.entries[0].meaning = "中".repeat(2450);
  const result = build(seed([]), { corePayload: core([["hasn't", "", "=has not", []]]), publicPayload });
  assert.deepEqual(result.report.coreOmittedWithoutChinese, ["hasn't"]);
  assert.equal(result.report.coreRowsInput, 1); assert.equal(result.report.coreRows, 0);
  assert.equal(result.report.publicRowsInput, 1); assert.equal(result.report.publicRows, 0);
  assert.equal(result.report.omittedPublic[0].term, term);
  assert.equal(publicPayload.entries[0].meaning.length, 2450); assert.equal(result.records.length, 0);
});

test("immutable MIT semantic root rejects gloss tampering even after manifest and shard hashes are rewritten", async t => {
  const prepared = seed([{ term: "example", partOfSpeech: "noun", meaning: "例子", workbook: true }]);
  const integrity = expandedSeedIntegrity(prepared); const result = build(prepared);
  const directory = await mkdtemp(join(tmpdir(), "expanded-source-root-"));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")));
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(join(directory, result.manifest.version));
  for (const [file, bytes] of result.files) await writeFile(join(directory, file), bytes);
  await writeFile(join(directory, "manifest.json"), JSON.stringify(result.manifest));
  assert.deepEqual((await recoverExpandedSeed(directory, integrity)).rows, normalizeExpandedSeed(prepared).rows);
  const bucket = result.records[0].id % 128; const descriptor = result.manifest.english.shards[bucket];
  const shard = JSON.parse(result.files.get(descriptor.file)); shard.records[0].meaning = "错误释义";
  const bytes = `${JSON.stringify(shard)}\n`; descriptor.sha256 = expandedSha256(bytes); descriptor.bytes = Buffer.byteLength(bytes);
  await writeFile(join(directory, descriptor.file), bytes); await writeFile(join(directory, "manifest.json"), JSON.stringify(result.manifest));
  await assert.rejects(recoverExpandedSeed(directory, integrity), /semantic root mismatch/u);
});
