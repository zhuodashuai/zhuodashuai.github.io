import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expandedKey, expandedSeedIntegrity, normalizeExpandedTerm,
  recoverPinnedExpandedSeedArchive, validateExpandedBuild } from "../scripts/build-expanded-dictionary.mjs";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";
import { loadExpandedPublicSource } from "../lib/expanded-public-source.mjs";
import { verifyDictionarySupplement } from "../lib/dictionary-supplement.mjs";
import { preloadExpandedDictionary, searchExpandedDictionary, resetExpandedDictionaryCacheForTests } from "../../vocab/js/expanded-dictionary.js";
import { isPinnedChineseRankingFixture } from "./helpers/chinese-ranking-fixture-asset.mjs";
import {searchEverydayDictionary} from "../../vocab/js/everyday-lookup.js";
import {chineseSearchPlan} from "../../vocab/js/chinese-search.js";

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

test("all original MIT semantic fields recover from the byte-pinned archive to the separately tracked source root", async () => {
  const integrity = await readJSON(new URL("../dictionary/expanded-source-integrity.json", import.meta.url));
  const recovered = await recoverPinnedExpandedSeedArchive({ root: fileURLToPath(new URL("../../", import.meta.url)), integrity });
  assert.equal(recovered.rows.length, 102325);
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

test("all 617 pinned public cards and reviewed original entries retain their exact expanded source variants", async () => {
  const data = await corpus();
  const snapshot = await loadExpandedPublicSource();
  const { pack } = await loadOriginalCatalogue();
  const checked = pack.entries.filter(entry => entry.review.status === "checked");
  assert.equal(snapshot.entries.length, 617);
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

test("all currently reviewed Forsyte chapter words remain live and member-indexed without enlarging the pinned expanded public source", async () => {
  const [data, pinned, live, member, chapter] = await Promise.all([
    corpus(),
    loadExpandedPublicSource(),
    readJSON(new URL("../../vocab/data/owner-wordbook.json", import.meta.url)),
    readJSON(new URL("../../vocab/data/member-dictionary.json", import.meta.url)),
    readJSON(new URL("../../vocab/data/reading-lists/the-forsyte-saga/chapter-1.json", import.meta.url))
  ]);
  // The chapter is curated independently of this historical dictionary import.
  // Its current source list is the coverage contract; the pinned dictionary
  // remains immutable when that reading list legitimately grows or changes.
  assert.equal(chapter.collection.id, "the-forsyte-saga");
  assert.equal(chapter.chapter.id, "chapter-1");
  assert.ok(Number.isSafeInteger(chapter.expectedItemCount) && chapter.expectedItemCount > 0);
  assert.equal(chapter.items.length, chapter.expectedItemCount);
  assert.equal(new Set(chapter.items.map(item => normalizeExpandedTerm(item.term))).size, chapter.expectedItemCount);
  assert.equal(data.manifest.counts.records, 102609);
  assert.equal(data.records.length, 102609);
  assert.equal(data.manifest.sources.public.sha256, sha(JSON.stringify(pinned)));
  assert.notEqual(data.manifest.sources.public.sha256, sha(JSON.stringify(live)));

  const membership = "collection:the-forsyte-saga:chapter-1";
  const pinnedByTerm = new Map(pinned.entries.map(entry => [normalizeExpandedTerm(entry.term), entry]));
  const liveByTerm = new Map(live.entries.map(entry => [entry.term, entry]));
  const memberByTerm = new Map(member.published.map(row => [row[0], row]));
  for (const item of chapter.items) {
    const entry = liveByTerm.get(item.term);
    assert.ok(entry, `${item.term}: available in the live main wordbook`);
    assert.ok(entry.tags.includes(membership), `${item.term}: current chapter membership`);
    const projected = memberByTerm.get(item.term);
    assert.ok(projected, `${item.term}: available in the compact member index`);
    assert.deepEqual(projected.slice(0, 3), [entry.term, entry.partOfSpeech, entry.meaning], item.term);
    const pinnedEntry = pinnedByTerm.get(normalizeExpandedTerm(item.term));
    const record = data.byTerm.get(normalizeExpandedTerm(item.term));
    const variants = record ? [record, ...(record.variants || [])] : [];
    if (pinnedEntry) {
      const historical = variants.find(row => row.source === "public");
      assert.ok(historical, `${item.term}: existing pinned public source remains available`);
      assert.equal(historical.partOfSpeech, pinnedEntry.partOfSpeech.trim(), item.term);
      assert.equal(historical.meaning, pinnedEntry.meaning.trim(), item.term);
    } else {
      // A head may already occur in the MIT/original dictionary. A new reading
      // entry must not be retroactively attributed to the pinned public source.
      assert.ok(!variants.some(row => row.source === "public"),
        `${item.term}: no new public variant in the historical expanded dictionary`);
    }
  }
});

test("current runtime authenticates every English shard and the complete Chinese index; legacy parsing still authenticates all128 Chinese shards", async () => {
  const data = await corpus();
  resetExpandedDictionaryCacheForTests();
  const requested = new Set();
  const fetchImpl = async (url, options) => {
    assert.equal(options.credentials, "omit");
    const target = new URL(url);
    if (isPinnedChineseRankingFixture(target)) return new Response(await readFile(target), { headers: { "content-type": "application/octet-stream" } });
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
    // Keep the full128-shard parser check even when an early head is curated
    // and can now be returned without a network/file read.
    const candidate = shard.records.find(row => row.id % 128 === shard.bucket && !searchEverydayDictionary(row.term));
    assert.ok(candidate, `English bucket ${shard.bucket}`);
    const found = await searchExpandedDictionary(candidate.term, { fetchImpl, limit: 1 });
    assert.equal(found.results[0]?.term, candidate.term);
  }
  const complete = await searchExpandedDictionary('热', { fetchImpl, limit: 1 });
  assert.equal(complete.ranking, 'global'); assert.equal(complete.relatedIntegrated, true);
  assert(complete.total > 1); assert.equal(complete.results.length, 1);
  assert.equal(data.manifest.english.shards.filter(item => requested.has(item.file)).length, 128);
  assert.equal(data.manifest.chinese.shards.filter(item => requested.has(item.file)).length, 0,
    'The complete source-bound index replaces legacy Chinese posting downloads');
  for (const input of ["safety oracle", "test oracle", "importance sampling", "fan mail", "stuffed mushroom"]) {
    const found = await searchExpandedDictionary(input, { fetchImpl });
    assert.equal(found.results[0]?.term, input);
    assert.match(found.results[0].meaning, /\p{Script=Han}/u);
  }
  // Exercise the real old-catalogue parser with unchanged, individually pinned
  // shard bodies. Only its manifest namespace changes, making the current
  // ranking release deliberately ineligible; no fixture can claim global rank.
  const olderVersion = 'a'.repeat(64), older = structuredClone(data.manifest), legacyRequested = new Set();
  older.version = olderVersion;
  for (const group of [older.english, older.chinese]) for (const shard of group.shards)
    shard.file = shard.file.replace(data.manifest.version, olderVersion);
  const legacyFetch = async (input, options) => {
    assert.equal(options.credentials, 'omit'); assert(!options.method || options.method === 'GET');
    const target = new URL(input); assert(target.href.startsWith(directory.href)); assert.equal(target.search, '');
    const file = decodeURIComponent(target.href.slice(directory.href.length)); legacyRequested.add(file);
    if (file === 'manifest.json') return new Response(JSON.stringify(older));
    assert(file.startsWith(olderVersion + '/'), 'The limited parser may only read its own descriptor namespace');
    const raw = data.files.get(file.replace(olderVersion, data.manifest.version)); assert(raw);
    return new Response(raw);
  };
  for (const shard of data.chinese) {
    const [token] = [...shard.postings].filter(([term, ids]) => ids.length && !chineseSearchPlan(term)
      && !searchEverydayDictionary(term)).sort((a, b) => a[1].length - b[1].length)[0];
    assert(token, `Uncurated token for Chinese bucket ${shard.bucket}`);
    const found = await searchExpandedDictionary(token, { fetchImpl: legacyFetch, limit: 1 });
    assert.equal(found.coverage, 'limited'); assert.equal(found.ranking, 'limited');
    for (const result of found.results) assert(result.meaning.includes(token));
    assert(legacyRequested.has(older.chinese.shards[shard.bucket].file), `Actual parser must read Chinese bucket ${shard.bucket}`);
  }
  assert.equal(older.chinese.shards.filter(item => legacyRequested.has(item.file)).length, 128);
  resetExpandedDictionaryCacheForTests();
});
