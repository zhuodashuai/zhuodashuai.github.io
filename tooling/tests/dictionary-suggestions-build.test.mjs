import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { buildDictionarySuggestions, dictionarySuggestionPriority, generateDictionarySuggestions,
  loadDictionarySuggestionBuild } from "../scripts/build-dictionary-suggestions.mjs";
import { expandedBucket, expandedKey, expandedSha256 } from "../scripts/build-expanded-dictionary.mjs";

const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sourceNames = ["core", "mit", "original", "public", "supplement", "pos-reviewed"];
function fixture(terms = [{ term: "happy", source: "core", forms: ["happier"] },
  { term: "happen", source: "mit" }, { term: "Polish", source: "mit" }, { term: "polish", source: "mit" },
  { term: "give up", source: "public" }, { term: "café", source: "mit" }, { term: "a", source: "mit" },
  { term: "e.g.", source: "mit" }, { term: "A".repeat(65), source: "mit" }]) {
  const version = "a".repeat(64), shards = new Map(), descriptors = [];
  const records = terms.map((row, index) => ({ id: index * 128 + expandedBucket(expandedKey(row.term)),
    term: row.term, partOfSpeech: "noun", meaning: "测试释义", forms: [], ...row }));
  let englishKeys = 0;
  for (let bucket = 0; bucket < 128; bucket++) {
    const keys = new Map(), add = (key, ref) => keys.set(key, [...(keys.get(key) || []), ref]);
    for (const record of records) {
      const key = expandedKey(record.term);
      if (expandedBucket(key) === bucket) add(key, { id: record.id, kind: "canonical" });
      for (const form of record.forms) if (expandedBucket(expandedKey(form)) === bucket) add(expandedKey(form), { id: record.id, kind: "form", term: form });
    }
    const keyRows = [...keys].sort(([a], [b]) => cmp(a, b));
    const ids = new Set(keyRows.flatMap(([, refs]) => refs.map(ref => ref.id)));
    const bytes = json({ schemaVersion: 2, kind: "en", bucket, records: records.filter(row => ids.has(row.id)), keys: keyRows });
    const file = `${version}/en-${String(bucket).padStart(3, "0")}.json`;
    shards.set(file, bytes); englishKeys += keyRows.length;
    descriptors.push({ bucket, file, sha256: expandedSha256(bytes), bytes: bytes.length, count: keyRows.length });
  }
  const sources = Object.fromEntries(sourceNames.map(name => [name, { name, license: "Test", url: "https://example.org/" }]));
  return { manifest: { schemaVersion: 2, version, counts: { records: records.length, englishKeys, chineseTokens: 0 },
    sources, english: { buckets: 128, shards: descriptors } }, shards };
}
function mutateShard(input, bucket, update) {
  const copy = { manifest: structuredClone(input.manifest), shards: new Map(input.shards) };
  const descriptor = copy.manifest.english.shards[bucket];
  const payload = JSON.parse(copy.shards.get(descriptor.file)); update(payload);
  const bytes = json(payload); copy.shards.set(descriptor.file, bytes);
  descriptor.sha256 = expandedSha256(bytes); descriptor.bytes = bytes.length;
  return copy;
}

test("suggestion build is deterministic, canonical-only, case-preserving and length-sharded", () => {
  const input = fixture(), a = buildDictionarySuggestions(input), b = buildDictionarySuggestions(input);
  assert.deepEqual(a.manifest, b.manifest); assert.deepEqual(a.files, b.files);
  assert.equal(a.manifest.dictionaryVersion, input.manifest.version);
  assert.deepEqual(a.manifest.counts, { canonicalHeads: 9, eligibleHeads: 5, excludedHeads: 4 });
  assert.deepEqual(a.rows, [["give up", 1], ["happen", 2], ["happy", 0], ["Polish", 2], ["polish", 2]]);
  assert.equal(a.rows.some(([term]) => term === "happier"), false);
  assert.equal(a.manifest.shards.length, 63);
  for (const descriptor of a.manifest.shards) {
    const bytes = a.files.get(descriptor.file), payload = JSON.parse(bytes);
    assert.equal(descriptor.file, `${a.manifest.version}/length-${String(descriptor.length).padStart(2, "0")}.json`);
    assert.equal(expandedSha256(bytes), descriptor.sha256); assert.equal(bytes.length, descriptor.bytes);
    assert.equal(payload.schemaVersion, 1); assert.equal(payload.length, descriptor.length);
    assert.equal(payload.rows.length, descriptor.count);
    assert.ok(payload.rows.every(([term]) => expandedKey(term).length === descriptor.length));
    assert.ok(payload.rows.every(row => row.length === 2));
  }
});

test("source tier uses retained provenance including core variants; it is never frequency", () => {
  for (const [record, expected] of [
    [{ source: "core" }, 0], [{ source: "mit" }, 2], [{ source: "pos-reviewed", variants: [{ source: "mit" }] }, 2],
    [{ source: "pos-reviewed", variants: [{ source: "core" }] }, 0],
    [{ source: "mit", variants: [{ source: "public" }] }, 1], [{ source: "original" }, 1], [{ source: "supplement" }, 1]
  ]) assert.equal(dictionarySuggestionPriority(record), expected);
  const result = buildDictionarySuggestions(fixture([{ term: "happy", source: "pos-reviewed", variants: [
    { source: "core", partOfSpeech: "adjective", meaning: "快乐的" }] }]));
  assert.deepEqual(result.rows, [["happy", 0]]);
  const changed = fixture(); changed.manifest.version = "b".repeat(64);
  // Paths bind to the source version, not only the suggestion rows.
  assert.throws(() => buildDictionarySuggestions(changed), /descriptor/u);
});

test("eligible boundary lengths, apostrophes, hyphens and complete phrases retain original display", () => {
  const allowed = ["Up", "a".repeat(64), "can't", "well-being", "by some fluke"];
  const excluded = ["x", "a".repeat(65), "word--word", "word  word", "word/word", "word1", "naïve"];
  // Repeated whitespace is malformed source data, rather than an eligible head.
  assert.throws(() => buildDictionarySuggestions(fixture([{ term: "word  word", source: "core" }])), /record/u);
  const build = buildDictionarySuggestions(fixture([...allowed, ...excluded.filter(term => term !== "word  word")]
    .map(term => ({ term, source: "mit" }))));
  assert.deepEqual(new Set(build.rows.map(([term]) => term)), new Set(allowed));
  assert.equal(JSON.parse(build.files.get(build.manifest.shards.find(item => item.length === 64).file)).rows[0][0], "a".repeat(64));
  assert.throws(() => buildDictionarySuggestions(fixture([{ term: "same", source: "core" }, { term: "same", source: "mit" }])), /canonical reference/u);
});

test("source integrity rejects malformed descriptors, shard bytes, provenance and incomplete coverage", () => {
  const input = fixture(), bucket = expandedBucket("happy");
  for (const mutate of [
    copy => { copy.manifest.english.shards[0].file = "../outside.json"; },
    copy => { copy.manifest.english.shards[0].bucket = 1; },
    copy => { copy.manifest.english.shards[0].bytes++; },
    copy => { copy.manifest.english.shards[0].sha256 = "b".repeat(64); },
    copy => { copy.manifest.counts.records++; },
    copy => { copy.manifest.counts.englishKeys++; },
    copy => { copy.shards.delete(copy.manifest.english.shards[0].file); },
    copy => { copy.manifest.sources.mit.license = ""; }
  ]) {
    const copy = { manifest: structuredClone(input.manifest), shards: new Map(input.shards) }; mutate(copy);
    assert.throws(() => buildDictionarySuggestions(copy), /Invalid suggestion source/u);
  }
  for (const update of [
    payload => { payload.schemaVersion = 1; },
    payload => { payload.records[0].source = "unknown"; },
    payload => { payload.records.push(payload.records[0]); },
    payload => { payload.records[0].term = "bad\u0000"; },
    payload => { payload.keys[0][1].push(payload.keys[0][1][0]); },
    payload => { payload.keys.push(payload.keys[0]); },
    payload => { payload.records[0].variants = [{ source: "unknown", meaning: "坏", partOfSpeech: "noun" }]; },
    payload => { payload.keys[0][1][0].id = 9999999; },
    payload => { payload.keys[0][1][0].kind = "form"; }
  ]) assert.throws(() => buildDictionarySuggestions(mutateShard(input, bucket, update)), /Invalid suggestion source/u);
});

test("conflicting copies across alias shards and duplicate canonical references fail closed", () => {
  const input = fixture(), happyBucket = expandedBucket("happy"), aliasBucket = expandedBucket("happier");
  assert.notEqual(happyBucket, aliasBucket);
  const changed = mutateShard(input, aliasBucket, payload => {
    payload.records.find(row => row.term === "happy").meaning = "改变了的释义";
  });
  assert.throws(() => buildDictionarySuggestions(changed), /conflicting duplicate/u);
  const duplicated = mutateShard(input, happyBucket, payload => {
    payload.keys.find(([key]) => key === "happy")[1].push({ id: payload.records.find(row => row.term === "happy").id, kind: "canonical", term: "happy" });
  });
  assert.throws(() => buildDictionarySuggestions(duplicated), /canonical reference/u);
});

test("invalid UTF-8 or JSON is rejected even when the declared byte hash matches", () => {
  const input = fixture();
  for (const bytes of [Buffer.from("not JSON\n"), Buffer.from([0x22, 0xc3, 0x28, 0x22])]) {
    const copy = { manifest: structuredClone(input.manifest), shards: new Map(input.shards) };
    const descriptor = copy.manifest.english.shards[0];
    descriptor.bytes = bytes.length; descriptor.sha256 = expandedSha256(bytes); copy.shards.set(descriptor.file, bytes);
    assert.throws(() => buildDictionarySuggestions(copy), /shard JSON/u);
  }
});

test("generated current catalogue covers every eligible canonical head, without aliases or dictionary mutation", async () => {
  const build = await loadDictionarySuggestionBuild();
  const sourceManifest = JSON.parse(await readFile(new URL("../../vocab/data/expanded-dictionary/manifest.json", import.meta.url)));
  const expected = new Map();
  for (const descriptor of sourceManifest.english.shards) {
    const shard = JSON.parse(await readFile(new URL(`../../vocab/data/expanded-dictionary/${descriptor.file}`, import.meta.url)));
    for (const [key, refs] of shard.keys) for (const ref of refs) if (ref.kind === "canonical") {
      const row = shard.records.find(record => record.id === ref.id);
      if (key.length >= 2 && key.length <= 64 && /^[a-z]+(?:[ '-][a-z]+)*$/u.test(key)) expected.set(row.term, dictionarySuggestionPriority(row));
    }
  }
  assert.equal(build.manifest.counts.canonicalHeads, sourceManifest.counts.records);
  assert.deepEqual(new Map(build.rows), expected);
  for (const [file, bytes] of build.files) {
    assert.ok((await readFile(new URL(`../../vocab/data/dictionary-suggestions/${file}`, import.meta.url))).equals(bytes), file);
  }
  assert.ok(build.totalShardBytes < 3 * 1024 * 1024);
});

test("CLI generation/check preserves immutable namespaces and detects a stale pointer", async t => {
  const root = await mkdtemp(join(tmpdir(), "dictionary-suggestions-"));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/")));
    await rm(root, { recursive: true, force: true });
  });
  const input = fixture(), directory = join(root, "vocab/data/expanded-dictionary");
  for (const [file, bytes] of [...input.shards, ["manifest.json", json(input.manifest)]]) {
    const path = join(directory, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  }
  const a = await generateDictionarySuggestions({ root });
  const b = await generateDictionarySuggestions({ root, check: true }); assert.deepEqual(a.manifest, b.manifest);
  const pointer = join(root, "vocab/data/dictionary-suggestions/manifest.json");
  await writeFile(pointer, "{}\n");
  await assert.rejects(generateDictionarySuggestions({ root, check: true }), /Stale/u);
  await generateDictionarySuggestions({ root });
  const shardPath = join(root, "vocab/data/dictionary-suggestions", a.manifest.shards[0].file);
  await writeFile(shardPath, "corrupted\n");
  await assert.rejects(generateDictionarySuggestions({ root }), /immutable/u);
  assert.deepEqual(JSON.parse(await readFile(pointer)), a.manifest);
});
