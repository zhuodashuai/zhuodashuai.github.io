import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { searchExpandedDictionary, resetExpandedDictionaryCacheForTests } from "../js/expanded-dictionary.js";
import { DICTIONARY_SOURCE_REVISION_SOURCE } from "../../tooling/lib/dictionary-source-revisions.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const fold = value => value.normalize("NFKC").toLowerCase();
function bucket(value) { let hash = 2166136261; for (const char of fold(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; } return hash % 128; }
const sourcePack = JSON.parse(await readFile(new URL("../../tooling/dictionary/source-revisions/finite-grammar-0001.json", import.meta.url), "utf8"));

function fixture(rows = sourcePack.entries.map(entry => entry.after), contexts = []) {
  const source = { ...DICTIONARY_SOURCE_REVISION_SOURCE, sha256: "a".repeat(64) };
  const files = new Map(), requests = [], version = sha(JSON.stringify(rows) + JSON.stringify(contexts));
  const keyMaps = Array.from({ length: 128 }, () => new Map());
  const postings = Array.from({ length: 128 }, () => new Map());
  const byId = new Map(rows.map(row => [row.id, structuredClone(row)]));
  const add = (term, ref) => { const key = fold(term), map = keyMaps[bucket(key)]; map.set(key, [...(map.get(key) || []), ref]); };
  for (const row of rows) {
    add(row.term, { id: row.id, kind: "canonical" });
    for (const form of row.forms) add(form, { id: row.id, kind: "form", term: form });
    const tokens = new Set();
    for (const variant of [row, ...(row.variants || [])]) for (const run of variant.meaning.match(/\p{Script=Han}+/gu) || []) {
      const chars = [...run]; for (let index = 0; index < chars.length; index++) { tokens.add(chars[index]); if (index) tokens.add(chars[index - 1] + chars[index]); }
    }
    for (const token of tokens) { const map = postings[bucket(token)]; map.set(token, [...(map.get(token) || []), row.id].sort((a, b) => a - b)); }
  }
  for (const context of contexts) add(context.term, { id: context.id, kind: "context", term: context.term,
    partOfSpeech: context.partOfSpeech, meaning: context.meaning });
  const descriptors = kind => Array.from({ length: 128 }, (_, index) => {
    const keys = [...keyMaps[index]].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const ids = new Set(keys.flatMap(([, refs]) => refs.map(ref => ref.id)));
    const payload = kind === "en" ? { schemaVersion: 2, kind, bucket: index, records: [...ids].sort((a, b) => a - b).map(id => byId.get(id)), keys }
      : { schemaVersion: 2, kind, bucket: index, postings: [...postings[index]] };
    const file = `${version}/${kind}-${String(index).padStart(3, "0")}.json`, body = JSON.stringify(payload);
    files.set(file, body);
    return { bucket: index, file, sha256: sha(body), bytes: Buffer.byteLength(body), count: kind === "en" ? keys.length : payload.postings.length };
  });
  const english = { buckets: 128, shards: descriptors("en") }, chinese = { buckets: 128, shards: descriptors("zh") };
  const manifest = { schemaVersion: 2, version, counts: { records: rows.length,
    englishKeys: english.shards.reduce((n, d) => n + d.count, 0), chineseTokens: chinese.shards.reduce((n, d) => n + d.count, 0) },
    sources: { "grammar-reviewed": source,
      mit: { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT" },
      core: { name: "ECDICT核心", license: "MIT", url: "https://github.com/skywind3000/ECDICT" },
      public: { name: "公开词库", license: "Public project", url: "https://zhuodashuai.github.io/vocab/" } }, english, chinese };
  function rewrite(index, mutate) {
    const descriptor = manifest.english.shards[index], payload = JSON.parse(files.get(descriptor.file)); mutate(payload);
    const body = JSON.stringify(payload); files.set(descriptor.file, body); descriptor.sha256 = sha(body); descriptor.bytes = Buffer.byteLength(body);
  }
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options }); const path = new URL(url).pathname.split("/expanded-dictionary/")[1];
    return path === "manifest.json" ? new Response(JSON.stringify(manifest))
      : files.has(path) ? new Response(files.get(path)) : new Response("missing", { status: 404 });
  };
  return { manifest, files, fetchImpl, requests, rewrite };
}

test("the four actual revised records display verb metadata and explicit revision provenance without blank MIT duplicates", async () => {
  const data = fixture();
  for (const term of ["are", "did", "had", "been"]) {
    const result = (await searchExpandedDictionary(term, data)).results[0];
    const original = sourcePack.entries.find(entry => entry.term === term);
    assert.equal(result.term, term); assert.equal(result.partOfSpeech, "verb");
    assert.equal(result.meaning, `① ${original.after.meaning}`);
    assert.equal(result.source, DICTIONARY_SOURCE_REVISION_SOURCE.name);
    assert.equal(result.license, DICTIONARY_SOURCE_REVISION_SOURCE.license);
    assert.equal(result.url, DICTIONARY_SOURCE_REVISION_SOURCE.url);
    assert.equal(result.alternatives, undefined);
    assert.equal(result.seed, undefined); assert.equal(result.forms, undefined);
    assert.equal(result.meaning.includes("noun"), false);
  }
  for (const alias of ["ares", "dids", "hads", "beens"]) assert.deepEqual((await searchExpandedDictionary(alias, data)).results, []);
  assert.ok(data.requests.every(({ options }) => options.credentials === "omit"));
  assert.ok(data.requests.every(({ url }) => !url.includes("/api/") && !new URL(url).search));
});

test("duplicate suppression is limited to the same blank MIT gloss; distinct labelled senses and public contexts survive", async () => {
  const are = structuredClone(sourcePack.entries.find(entry => entry.term === "are").after);
  are.variants.push({ source: "core", partOfSpeech: "noun", meaning: "公亩〔面积单位〕" });
  const data = fixture([are], [{ id: are.id, term: "are present", partOfSpeech: "verb", meaning: "在场；出席" }]);
  const exact = (await searchExpandedDictionary("are", data)).results[0];
  assert.equal(exact.alternatives.length, 1); assert.equal(exact.alternatives[0].partOfSpeech, "noun");
  assert.equal(exact.alternatives[0].meaning, "① 公亩〔面积单位〕");
  assert.equal(exact.alternatives[0].source, "ECDICT核心");
  const context = (await searchExpandedDictionary("are present", data)).results[0];
  assert.equal(context.term, "are"); assert.equal(context.matchedForm, "are present");
  assert.equal(context.meaning, "在场；出席"); assert.equal(context.source, "公开词库");
  const reverse = (await searchExpandedDictionary("现在时", data)).results.find(row => row.term === "are");
  assert.equal(reverse.partOfSpeech, "verb"); assert.equal(reverse.source, DICTIONARY_SOURCE_REVISION_SOURCE.name);
});

test("a rehashed stale alias cannot use preserved seed.forms to bypass the strict active-form parser", async () => {
  const data = fixture(), are = sourcePack.entries.find(entry => entry.term === "are").after;
  data.rewrite(bucket("ares"), payload => {
    payload.records.push(are); payload.keys.push(["ares", [{ id: are.id, kind: "form", term: "ares" }]]);
  });
  data.manifest.english.shards[bucket("ares")].count++;
  data.manifest.counts.englishKeys++;
  await assert.rejects(searchExpandedDictionary("ares", data), error => error.code === "invalid_dictionary_data");
});

test("revision metadata is subject to the same bounded public manifest schema and never fetched as private state", async () => {
  for (const mutate of [
    m => { m.sources["grammar-reviewed"].url = "javascript:alert(1)"; },
    m => { m.sources["grammar-reviewed"].sha256 = "invalid"; },
    m => { m.sources["grammar-reviewed"].token = "private"; },
    m => { m.sources["grammar-reviewed"].url = "https://user:password@example.org/"; }
  ]) {
    resetExpandedDictionaryCacheForTests(); const data = fixture(); mutate(data.manifest);
    await assert.rejects(searchExpandedDictionary("are", data), error => error.code === "invalid_dictionary_data");
    assert.equal(data.requests.length, 1);
  }
});
