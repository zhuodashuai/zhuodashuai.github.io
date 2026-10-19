import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expandedKey, expandedSeedIntegrity, normalizeExpandedTerm,
  recoverExpandedSeed, validateExpandedBuild } from "../scripts/build-expanded-dictionary.mjs";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";
import { verifyDictionarySupplement } from "../lib/dictionary-supplement.mjs";
import { preloadExpandedDictionary, searchExpandedDictionary, resetExpandedDictionaryCacheForTests } from "../../vocab/js/expanded-dictionary.js";

// Release data contract, not a claim that every source gloss is human-certified.
// These tests use tracked public assets only: never the user's private workbook.
const directory = new URL("../../vocab/data/expanded-dictionary/", import.meta.url);
const sha = value => createHash("sha256").update(value).digest("hex");
const readJSON = async url => JSON.parse(await readFile(url, "utf8"));
let loaded;
async function corpus() {
  loaded ||= (async () => {
    const manifestBytes = await readFile(new URL("manifest.json", directory));
    const manifest = JSON.parse(manifestBytes);
    const files = new Map(), english = [], chinese = [], byId = new Map();
    for (const [kind, descriptors] of [["en", manifest.english.shards], ["zh", manifest.chinese.shards]]) {
      for (const descriptor of descriptors) {
        assert.equal(descriptor.file, `${manifest.version}/${kind}-${String(descriptor.bucket).padStart(3, "0")}.json`);
        const bytes = await readFile(new URL(descriptor.file, directory));
        assert.equal(bytes.length, descriptor.bytes, `${descriptor.file}: exact byte count`);
        assert.equal(sha(bytes), descriptor.sha256, `${descriptor.file}: exact SHA-256`);
        files.set(descriptor.file, bytes);
        const payload = JSON.parse(bytes);
        (kind === "en" ? english : chinese).push(payload);
        if (kind === "en") for (const row of payload.records) if (row.id % 128 === descriptor.bucket) {
          assert.ok(!byId.has(row.id), `canonical record repeated: ${row.term}`);
          byId.set(row.id, row);
        }
      }
    }
    const records = [...byId.values()].sort((a, b) => a.id - b.id);
    const byTerm = new Map(records.map(row => [row.term, row]));
    assert.equal(byTerm.size, records.length, "no duplicate exact canonical spellings");
    return { manifest, manifestBytes, files, english, chinese, records, byTerm };
  })();
  return loaded;
}

test("30k import retains at least 102,609 complete canonical records with every shard byte and posting verified", async () => {
  const data = await corpus();
  assert.ok(data.manifest.counts.records >= 102609);
  assert.ok(data.manifest.counts.records - 82920 >= 19689);
  assert.equal(data.records.length, data.manifest.counts.records);
  assert.equal(data.files.size, 256);
  assert.deepEqual(validateExpandedBuild(data), {
    canonicalRecords: data.manifest.counts.records,
    englishKeys: data.manifest.counts.englishKeys,
    chineseTokens: data.manifest.counts.chineseTokens,
    allReferencesVerified: true,
    allHanPostingsVerified: true
  });
});

test("all shipped MIT semantic fields recover to the separately tracked source root", async () => {
  const integrity = await readJSON(new URL("../dictionary/expanded-source-integrity.json", import.meta.url));
  const recovered = await recoverExpandedSeed(fileURLToPath(directory), integrity);
  assert.ok(recovered.rows.length >= 102325);
  assert.deepEqual(expandedSeedIntegrity(recovered), integrity);
  assert.ok(!recovered.rows.some(row => ["fan mail", "stuffed mushroom"].includes(expandedKey(row.term))),
    "corrupt source rows are excluded instead of silently changing licensed wording");
});

test("53 supplementary cards keep exact meanings and references under a non-MIT source", async () => {
  const data = await corpus();
  const pack = await readJSON(new URL("../dictionary/supplements/import-2026-10-19.json", import.meta.url));
  const integrity = await readJSON(new URL("../dictionary/supplements/integrity.json", import.meta.url));
  verifyDictionarySupplement(pack, integrity);
  assert.equal(pack.entries.length, 53);
  assert.equal(data.manifest.sources.supplement.sha256, integrity.semanticSha256);
  assert.equal(data.manifest.sources.supplement.name, pack.source.name);
  assert.equal(data.manifest.sources.supplement.license, pack.source.license);
  assert.notEqual(pack.source.license, "MIT");
  const references = await readFile(new URL("../../vocab/dictionary-references.html", import.meta.url), "utf8");
  for (const entry of pack.entries) {
    const record = data.byTerm.get(entry.term);
    assert.ok(record, entry.term);
    const supplemental = [record, ...(record.variants || [])].find(row => row.source === "supplement");
    assert.ok(supplemental, `${entry.term}: preserve supplemental source even after owner public collection`);
    assert.equal(supplemental.meaning, entry.meaning, `${entry.term}: complete Chinese meaning`);
    assert.equal(supplemental.partOfSpeech, entry.partOfSpeech, entry.term);
    assert.match(supplemental.meaning, /\p{Script=Han}/u);
    assert.ok(entry.references.length > 0, entry.term);
    assert.ok(references.includes(`>${entry.term}</h2>`), `${entry.term}: visible attribution`);
    assert.ok(!Object.hasOwn(record, "english_definition"), "unaligned WordNet English is not paired into the card");
  }
});

test("all current public cards and reviewed original entries retain their exact source variants as users keep adding", async () => {
  const data = await corpus();
  const snapshot = await readJSON(new URL("../../vocab/data/owner-wordbook.json", import.meta.url));
  const { pack } = await loadOriginalCatalogue();
  const checked = pack.entries.filter(entry => entry.review.status === "checked");
  assert.ok(snapshot.entries.length >= 616);
  assert.ok(checked.length >= 1030);
  assert.equal(data.manifest.sources.public.sha256, sha(JSON.stringify(snapshot)));
  assert.equal(data.manifest.sources.original.sha256, sha(JSON.stringify(pack)));
  const variant = (record, source) => [record, ...(record.variants || [])].find(row => row.source === source);
  for (const entry of snapshot.entries) {
    const found = variant(data.byTerm.get(normalizeExpandedTerm(entry.term)), "public");
    assert.ok(found, entry.term);
    assert.equal(found.meaning, entry.meaning.trim(), entry.term);
    assert.equal(found.partOfSpeech, entry.partOfSpeech.trim(), entry.term);
  }
  for (const entry of checked) {
    const found = variant(data.byTerm.get(normalizeExpandedTerm(entry.headword)), "original");
    assert.ok(found, entry.headword);
    assert.equal(found.meaning, entry.senses.map((sense, index) => `${index + 1}. ${sense.partOfSpeech}：${sense.definitionZh}`).join("\n"), entry.headword);
    assert.equal(found.partOfSpeech, [...new Set(entry.senses.map(sense => sense.partOfSpeech))].join(" · "), entry.headword);
  }
});

test("the actual lookup runtime parses all 128 English and 128 Chinese shards without a provider", async () => {
  const data = await corpus();
  resetExpandedDictionaryCacheForTests();
  const requested = new Set();
  const fetchImpl = async (url, options) => {
    assert.equal(options.credentials, "omit");
    const target = new URL(url);
    assert.ok(target.href.startsWith(directory.href), "only local first-party fixture files may be fetched");
    const file = decodeURIComponent(target.href.slice(directory.href.length));
    requested.add(file);
    const bytes = file === "manifest.json" ? data.manifestBytes : data.files.get(file);
    assert.ok(bytes, `unknown first-party asset: ${file}`);
    return new Response(bytes, { headers: { "content-type": "application/json" } });
  };
  const meta = await preloadExpandedDictionary({ fetchImpl });
  assert.deepEqual(meta.counts, data.manifest.counts);
  for (const shard of data.english) {
    const candidate = shard.records.find(row => row.id % 128 === shard.bucket);
    assert.ok(candidate, `English bucket ${shard.bucket}`);
    const found = await searchExpandedDictionary(candidate.term, { fetchImpl, limit: 1 });
    assert.equal(found.results[0]?.term, candidate.term);
  }
  for (const shard of data.chinese) {
    const [token] = [...shard.postings].filter(([, ids]) => ids.length).sort((a, b) => a[1].length - b[1].length)[0];
    const found = await searchExpandedDictionary(token, { fetchImpl, limit: 1 });
    assert.ok(found.results.length > 0, `Chinese bucket ${shard.bucket}: ${token}`);
    assert.ok(found.results[0].meaning.includes(token), token);
  }
  assert.equal(data.manifest.english.shards.filter(item => requested.has(item.file)).length, 128);
  assert.equal(data.manifest.chinese.shards.filter(item => requested.has(item.file)).length, 128);
  for (const input of ["safety oracle", "test oracle", "importance sampling", "fan mail", "stuffed mushroom"]) {
    const found = await searchExpandedDictionary(input, { fetchImpl });
    assert.equal(found.results[0]?.term, input);
    assert.match(found.results[0].meaning, /\p{Script=Han}/u);
  }
  resetExpandedDictionaryCacheForTests();
});
