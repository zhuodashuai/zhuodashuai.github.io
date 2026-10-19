import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { applyDictionaryPosOverlay, dictionaryPosIntegrity, DICTIONARY_POS_ID,
  DICTIONARY_POS_SOURCE, validateDictionaryPos, verifyDictionaryPos } from "../lib/dictionary-pos.mjs";
import { buildExpandedDictionary, expandedSeedIntegrity, expandedSha256,
  normalizeExpandedSeed, recoverExpandedSeed, validateExpandedBuild } from "../scripts/build-expanded-dictionary.mjs";
import { buildMemberDictionary } from "../scripts/build-member-dictionary.mjs";

const publicBaseline = JSON.parse(await readFile(new URL("../../vocab/data/owner-wordbook.json", import.meta.url)));
const source = { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT", commit: "a".repeat(40), sha256: "b".repeat(64) };
const core = rows => ({ schemaVersion: 1, source, columns: ["word", "partOfSpeech", "meaning", "forms"], entries: rows });
const seed = rows => ({ schemaVersion: 1, source, rows: rows.map((row, rank) => ({ partOfSpeech: "", forms: [], workbook: false, rank, ...row })) });
const build = (prepared, posPack = null, extra = {}) => buildExpandedDictionary({ prepared, posPack, corePayload: core([]),
  publicPayload: { ...publicBaseline, entries: [] }, originalPack: { schemaVersion: 1, name: "卓式词典", entries: [] }, ...extra });
const record = (term = "abacus", extra = {}) => ({ id: 1, term, partOfSpeech: "", meaning: "算盘", forms: [], source: "mit", ...extra });
const approval = (row = record(), extra = {}) => ({ term: row.term, baseSource: row.source,
  meaningSha256: expandedSha256(row.meaning), partOfSpeech: "noun", evidence: [{ source: "wordnet", locator: "index.noun: abacus" }], ...extra });
const pack = (entries = [approval()]) => ({ schemaVersion: 1, id: DICTIONARY_POS_ID,
  sources: { wordnet: { name: "Princeton WordNet", url: "https://wordnet.princeton.edu/", license: "WordNet licence", sha256: "c".repeat(64) } }, entries });

test("POS review root binds actual reviewed JSON, evidence, sources and every entry", () => {
  const value = pack();
  const root = dictionaryPosIntegrity(value);
  assert.deepEqual(root, { schemaVersion: 1, id: DICTIONARY_POS_ID, rows: 1,
    semanticSha256: expandedSha256(JSON.stringify(value)) });
  assert.equal(verifyDictionaryPos(value, root), value);
  for (const change of [
    changed => { changed.entries[0].partOfSpeech = "verb"; },
    changed => { changed.entries[0].meaningSha256 = "0".repeat(64); },
    changed => { changed.entries[0].evidence[0].locator = "different evidence"; },
    changed => { changed.sources.wordnet.sha256 = "d".repeat(64); }
  ]) {
    const changed = structuredClone(value); change(changed);
    assert.throws(() => verifyDictionaryPos(changed, root), /independent semantic root mismatch/u);
  }
  assert.throws(() => verifyDictionaryPos(value, { ...root, approved: true }), /integrity fields/u);
});

test("strict POS packs reject unsafe, duplicate, unknown and empty evidence without truncation", () => {
  for (const change of [
    value => { value.extra = true; },
    value => { value.id = "other"; },
    value => { value.entries.push(structuredClone(value.entries[0])); },
    value => { value.entries[0].term = "ＡＢＡＣＵＳ"; },
    value => { value.entries[0].term = "abacus\u202e"; },
    value => { value.entries[0].term = "算盘"; },
    value => { value.entries[0].term = "<abacus>"; },
    value => { value.entries[0].baseSource = "pos-reviewed"; },
    value => { value.entries[0].meaningSha256 = "not-a-hash"; },
    value => { value.entries[0].partOfSpeech = "noun\nverb"; },
    value => { value.entries[0].partOfSpeech = "n".repeat(201); },
    value => { value.entries[0].evidence = []; },
    value => { value.entries[0].evidence[0].source = "unknown"; },
    value => { value.entries[0].evidence.push(structuredClone(value.entries[0].evidence[0])); },
    value => { value.sources.wordnet.url = "http://wordnet.princeton.edu/"; },
    value => { value.sources.wordnet.url = "https://user:secret@wordnet.princeton.edu/"; },
    value => { value.sources.wordnet.sha256 = "invalid"; }
  ]) {
    const value = pack(); change(value);
    assert.throws(() => validateDictionaryPos(value), /Invalid dictionary POS review/u);
  }
});

test("POS validation does not invoke getters, prototypes or hidden JSON-excluded fields", () => {
  let invoked = 0;
  for (const target of ["root", "source", "entry", "evidence", "array", "source-table"]) {
    const value = pack();
    if (target === "root") Object.defineProperty(value, "id", { enumerable: true, get() { invoked++; return DICTIONARY_POS_ID; } });
    if (target === "source") Object.defineProperty(value.sources.wordnet, "name", { enumerable: true, get() { invoked++; return "WordNet"; } });
    if (target === "entry") Object.defineProperty(value.entries[0], "partOfSpeech", { enumerable: true, get() { invoked++; return "noun"; } });
    if (target === "evidence") Object.defineProperty(value.entries[0].evidence[0], "locator", { enumerable: true, get() { invoked++; return "entry"; } });
    if (target === "array") Object.defineProperty(value.entries, "0", { enumerable: true, get() { invoked++; return approval(); } });
    if (target === "source-table") Object.defineProperty(value.sources, "wordnet", { enumerable: true, get() { invoked++; return {}; } });
    assert.throws(() => validateDictionaryPos(value), /Invalid dictionary POS review/u);
  }
  assert.equal(invoked, 0);
  const hidden = pack(); Object.defineProperty(hidden.entries[0], "partOfSpeech", { value: "noun", enumerable: false });
  assert.throws(() => validateDictionaryPos(hidden), /entry fields/u);
  const custom = pack(); Object.setPrototypeOf(custom.entries[0], { extra: true });
  assert.throws(() => validateDictionaryPos(custom), /entry fields/u);
});

test("overlay preserves exact meanings, IDs, forms, seed, original variants and source input", () => {
  const row = record("abacus", { forms: ["abaci"], seed: { rank: 8, forms: ["abaci"], workbook: true },
    variants: [{ source: "public", partOfSpeech: "noun", meaning: "学习用的算盘" }] });
  const before = structuredClone(row);
  const result = applyDictionaryPosOverlay([row], pack([approval(row)]));
  assert.deepEqual(row, before);
  assert.equal(result.records[0].source, "pos-reviewed");
  assert.equal(result.records[0].partOfSpeech, "noun");
  for (const field of ["id", "term", "meaning", "forms", "seed"]) assert.deepEqual(result.records[0][field], row[field]);
  assert.deepEqual(result.records[0].variants, [
    { partOfSpeech: "", meaning: "算盘", source: "mit" }, ...row.variants
  ]);
  assert.equal(result.report.applied, 1); assert.deepEqual(result.report.skipped, []);
});

test("exact spelling identities do not merge Polish and polish", () => {
  const rows = [record("Polish", { meaning: "波兰的" }), record("polish", { meaning: "擦亮" })];
  const value = pack([approval(rows[0], { partOfSpeech: "adjective" }), approval(rows[1], { partOfSpeech: "verb" })]);
  assert.equal(validateDictionaryPos(value), value);
  const result = applyDictionaryPosOverlay(rows, value);
  assert.deepEqual(result.records.map(row => row.partOfSpeech), ["adjective", "verb"]);
  assert.equal(result.report.applied, 2);
});

test("future publication, changed meanings and removed terms skip safely instead of overwriting", () => {
  const rows = [record("filled", { partOfSpeech: "adjective" }), record("changed", { meaning: "新释义" }),
    record("different-source", { source: "public" })];
  const value = pack([
    approval(rows[0]), approval(rows[1], { meaningSha256: expandedSha256("旧释义") }),
    approval(rows[2], { baseSource: "mit" }), approval(record("gone"))
  ]);
  const result = applyDictionaryPosOverlay(rows, value);
  assert.deepEqual(result.records, rows);
  assert.equal(result.report.applied, 0); assert.equal(result.report.alreadyPresent, 1);
  assert.equal(result.report.baseMismatch, 2); assert.equal(result.report.missingTerms, 1);
  assert.deepEqual(result.report.skipped.map(row => row.reason), ["primary-pos-already-present",
    "primary-source-or-meaning-changed", "primary-source-or-meaning-changed", "term-no-longer-present"]);
});

test("expanded POS layer changes neither canonical IDs, aliases nor Chinese postings", () => {
  const prepared = seed([{ term: "abacus", meaning: "算盘", forms: ["abaci"] },
    { term: "happy", partOfSpeech: "adjective", meaning: "快乐的" }]);
  const before = build(prepared);
  const after = build(prepared, pack([approval(before.records[0])]));
  assert.deepEqual(after.manifest.counts, before.manifest.counts);
  assert.deepEqual(after.records.map(row => [row.id, row.term, row.forms, row.meaning]), before.records.map(row => [row.id, row.term, row.forms, row.meaning]));
  for (let bucket = 0; bucket < 128; bucket++) {
    const oldEn = JSON.parse(before.files.get(before.manifest.english.shards[bucket].file));
    const newEn = JSON.parse(after.files.get(after.manifest.english.shards[bucket].file));
    assert.deepEqual(newEn.keys, oldEn.keys);
    assert.equal(after.files.get(after.manifest.chinese.shards[bucket].file), before.files.get(before.manifest.chinese.shards[bucket].file));
  }
  assert.deepEqual(after.manifest.sources["pos-reviewed"], { ...DICTIONARY_POS_SOURCE, sha256: dictionaryPosIntegrity(pack([approval(before.records[0])])).semanticSha256 });
  assert.equal(after.report.posReview.missingBefore, 1); assert.equal(after.report.posReview.missingAfter, 0);
  assert.deepEqual(after.records[1], before.records[1]);
  assert.deepEqual(validateExpandedBuild(after), validateExpandedBuild(before));
});

test("reviewed overlay still recovers the unchanged independent MIT seed", async t => {
  const prepared = seed([{ term: "abacus", meaning: "算盘", forms: ["abaci"] }]);
  const baseline = build(prepared);
  const after = build(prepared, pack([approval(baseline.records[0])]));
  const integrity = expandedSeedIntegrity(prepared);
  const directory = await mkdtemp(join(tmpdir(), "dictionary-pos-root-"));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")));
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(join(directory, after.manifest.version));
  for (const [file, bytes] of after.files) await writeFile(join(directory, file), bytes);
  await writeFile(join(directory, "manifest.json"), JSON.stringify(after.manifest));
  assert.deepEqual((await recoverExpandedSeed(directory, integrity)).rows, normalizeExpandedSeed(prepared).rows);
});

test("compact MIT rows recover only their own Chinese POS labels, not externally licensed labels", () => {
  const corePayload = { schemaVersion: 1, source, count: 3,
    columns: ["key", "word", "phonetic", "partOfSpeech", "meaning", "definition", "collins", "oxford", "bnc", "frq", "tags", "forms"],
    entries: [
      ["abacus", "abacus", "", "", "算盘", "", 0, 0, 0, 0, "", []],
      ["labelled", "labelled", "", "", "n. 球\nv. 击球", "", 0, 0, 0, 0, "", []],
      ["known", "known", "", "noun", "已有词性不替换", "", 0, 0, 0, 0, "", []]
    ] };
  const value = pack([approval(record("abacus", { source: "core" }))]);
  const result = buildMemberDictionary(corePayload, { ...publicBaseline, entries: [] }, {
    coreFileSha256: expandedSha256(JSON.stringify(corePayload)), publicFileSha256: "d".repeat(64), posPack: value
  });
  const rows = new Map(result.core.map(row => [row[0], row]));
  assert.equal(rows.get("abacus")[1], "", "WordNet labels cannot be misattributed to the old MIT-only schema");
  assert.equal(rows.get("labelled")[1], "noun · verb");
  assert.equal(rows.get("known")[1], "noun");
  assert.deepEqual(result.core.map(row => [row[0], row[2], row[3]]), [
    ["abacus", "算盘", []], ["known", "已有词性不替换", []], ["labelled", "n. 球\nv. 击球", []]
  ]);
  assert.deepEqual(Object.keys(result.source.core), ["name", "license", "url", "fileSha256"]);
  assert.equal(result.source.core.license, "MIT");
  assert.equal(result.counts.core, 3);
});
