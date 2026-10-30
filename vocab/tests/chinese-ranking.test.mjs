import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { chineseVariantRank, parseChineseRanking, normalizeChineseRankingQuery, createChineseRankingContext } from "../js/chinese-ranking.js";
import { CHINESE_RANKING_RELEASE } from "../js/chinese-ranking-release.js";
import { searchExpandedDictionary } from "../js/expanded-dictionary.js";

const ROOT = new URL("../", import.meta.url);
function fileTransport(transform) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const special = await transform?.(url, options);
    return special || new Response(await readFile(url));
  };
  return { requests, fetchImpl };
}

test("whole source meanings outrank compounds and explanatory mentions for arbitrary Chinese queries", () => {
  assert.equal(chineseVariantRank("n. 声音", "声音"), 0);
  assert.equal(chineseVariantRank("① 名词：声音；听觉可感知的振动。", "声音"), 0);
  assert.ok(chineseVariantRank("声音装置", "声音") > 0);
  assert.ok(chineseVariantRank("有关声音的说明", "声音") > 0);
  assert.equal(chineseVariantRank("甲乙；乙丙", "甲乙丙"), null);
  assert.equal(chineseVariantRank("安静的", "声音"), null);
});

test("temperature ranking uses source atoms, not emotional or technical overlaps or English head lists", () => {
  const direct = chineseVariantRank("adj. 热的", "热");
  const weather = chineseVariantRank("① 闷热得令人难受的；热得让人透不过气的。", "热");
  assert.equal(direct, 0); assert.equal(weather, 1);
  for (const noise of ["热情的", "热心的", "亲热的", "热闹的", "pron. 我的\n[医] 迈尔(热容单位)"]) {
    assert.ok(chineseVariantRank(noise, "热") > weather, noise);
  }
  assert.ok(chineseVariantRank("[医] 高温, 热", "热") > weather);
  const records = new Map([[1, { term: "source", partOfSpeech: "adjective", meaning: "adj. 热的" }]]);
  const normalized = normalizeChineseRankingQuery("热的", records);
  const context = createChineseRankingContext(normalized.term, records, normalized);
  assert.equal(chineseVariantRank("adj. 闷热的, 热得难受的", normalized.term, "adjective", { context }), 1);
});

test("global real-data search finds later temperature senses before truncation and reads no English shards", async () => {
  const data = fileTransport();
  const first = await searchExpandedDictionary("热", data), terms = first.results.map(row => row.term);
  assert.equal(first.ranking, "global"); assert.deepEqual(terms.slice(0, 2), ["hot", "heat"]);
  assert.ok(terms.includes("sweltering")); assert.ok(terms.includes("stifling")); assert.ok(!terms.includes("my"));
  assert.equal(first.results.length, 20); assert.equal(first.offset, 0); assert.equal(first.nextOffset, 20);
  assert.ok(first.total > 500); assert.equal(first.hasMore, true);
  const target = first.results.find(row => row.term === "stifling");
  assert.match(target.meaning, /闷热/u); assert.equal(target.source, "卓的公开词库");
  assert.ok(target.alternatives.some(row => row.source === "ECDICT" && /窒息/u.test(row.meaning)));
  assert.equal(data.requests.filter(item => /\.bin$/u.test(item.url)).length, 1);
  assert.equal(data.requests.filter(item => /\/en-\d{3}\.json$/u.test(item.url)).length, 0);
  const count = data.requests.length;
  await searchExpandedDictionary("热", data);
  assert.equal(data.requests.length, count);
});

test("all Chinese pages are stable, disjoint and complete beyond the old fifty-result ceiling", async () => {
  const data = fileTransport(), pages = []; let offset = 0, total;
  for (let page = 0; page < 40; page++) {
    const result = await searchExpandedDictionary("热", { ...data, offset });
    total ??= result.total; assert.equal(result.total, total);
    assert.equal(result.offset, offset); assert.equal(result.nextOffset, offset + result.results.length);
    pages.push(...result.results);
    if (!result.hasMore) break;
    assert.ok(result.nextOffset > offset); offset = result.nextOffset;
  }
  assert.equal(pages.length, total); assert.equal(new Set(pages.map(row => row.term)).size, total);
  assert.ok(pages.findIndex(row => row.term === "my") >= 20);
  const full = await searchExpandedDictionary("热", { ...data, limit: 50 });
  assert.deepEqual(pages.slice(0, 50), full.results);
  const end = await searchExpandedDictionary("热", { ...data, offset: total });
  assert.deepEqual(end.results, []); assert.equal(end.hasMore, false);
});

test("global ranking retains source POS beyond old curated heads and preserves whole-query negation", async () => {
  const data = fileTransport();
  const doctors = await searchExpandedDictionary("医生", data);
  assert.equal(doctors.ranking, "global");
  assert.equal(doctors.relatedIntegrated, true); assert.equal(doctors.results[0].term, "doctor");
  assert.ok(doctors.total > 6);
  assert.ok(doctors.results.some(row => row.term === "surgeon" && /外科医生/u.test(row.meaning)));
  const positive = await searchExpandedDictionary("开心", data), negative = await searchExpandedDictionary("不开心", data);
  assert.ok(!positive.results.some(row => /^(?:unhappy|sad)$/u.test(row.term)));
  assert.ok(!negative.results.some(row => /^(?:happy|glad)$/u.test(row.term)));
});

test("formerly finite reviewed queries use the complete sidecar and stable global pages", async () => {
  const data = fileTransport();
  const first = await searchExpandedDictionary("医生", { ...data, limit: 1, offset: 0 });
  assert.equal(first.ranking, "global"); assert.equal(first.results[0].term, "doctor");
  assert.ok(first.hasMore); assert.equal(first.nextOffset, 1);
  const second = await searchExpandedDictionary("医生", { ...data, limit: 1, offset: first.nextOffset });
  assert.equal(second.ranking, "global"); assert.notEqual(second.results[0].term, first.results[0].term);
  assert.equal(second.total, first.total); assert.ok(second.hasMore);
  const end = await searchExpandedDictionary("医生", { ...data, limit: 1, offset: first.total });
  assert.deepEqual(end.results, []); assert.equal(end.hasMore, false);
  assert.equal(data.requests.filter(item => /\.bin$/u.test(item.url)).length, 1);
  assert.equal(data.requests.filter(item => /\/en-\d{3}\.json$/u.test(item.url)).length, 0);
  assert.equal(data.requests.filter(item => /\/zh-\d{3}\.json$/u.test(item.url)).length, 0);
});

test("failed or corrupt ranking downloads fail explicitly and the next attempt reloads cleanly", async () => {
  let mode = "network", attempts = 0;
  const data = fileTransport(async url => {
    if (!/\.bin$/u.test(String(url))) return null;
    attempts++;
    if (mode === "network") return new Response("unavailable", { status: 503 });
    if (mode === "corrupt") {
      const bytes = await readFile(url), bad = Buffer.from(bytes); bad[bad.length - 1] ^= 1; return new Response(bad);
    }
    return null;
  });
  await assert.rejects(searchExpandedDictionary("热", data), /索引.*失败/u);
  mode = "corrupt";
  await assert.rejects(searchExpandedDictionary("热", data), { code: "invalid_dictionary_data" });
  mode = "healthy";
  const result = await searchExpandedDictionary("热", data);
  assert.equal(result.ranking, "global"); assert.equal(attempts, 3);
  const rankingRequests = data.requests.filter(item => /\.bin$/u.test(item.url));
  assert.deepEqual(rankingRequests.map(item => item.options.cache), ["force-cache", "reload", "reload"]);
});

test("a larger outer HTTP gzip length does not reject the exact decoded ranking binary", async () => {
  const data = fileTransport(async url => {
    if (!/\.bin$/u.test(String(url))) return null;
    const bytes = await readFile(url);
    // This Response represents what Fetch exposes after decoding HTTP gzip:
    // headers retain the wire length, body retains our inner gzip asset bytes.
    return new Response(bytes, { headers: { "content-encoding": "gzip", "content-length": String(bytes.length + 1088) } });
  });
  const result = await searchExpandedDictionary("热", data);
  assert.equal(result.ranking, "global");
  assert.ok(result.results.some(row => row.term === "sweltering"));
  assert.ok(result.results.some(row => row.term === "stifling"));
});

test("HTTP encoding does not bypass decoded-body size bounds or identity length checks", async () => {
  for (const encoding of ["gzip", "br", "identity", ""]) {
    const data = fileTransport(async url => {
      if (!/\.bin$/u.test(String(url))) return null;
      const bytes = await readFile(url), headers = { "content-length": String(bytes.length + 1088) };
      if (encoding) headers["content-encoding"] = encoding;
      // Non-identity headers cannot predict the decoded size. The reader must
      // still stop at descriptor.bytes, before hashing or gzip decompression.
      const body = encoding && encoding !== "identity" ? Buffer.concat([bytes, Buffer.from([0])]) : bytes;
      return new Response(body, { headers });
    });
    await assert.rejects(searchExpandedDictionary("热", data), { code: "invalid_dictionary_data" }, encoding || "no encoding");
  }
});

test("a changed dictionary cannot reuse an old sidecar merely by retaining the version string", async () => {
  const data = fileTransport(async url => {
    if (!String(url).endsWith("/expanded-dictionary/manifest.json")) return null;
    const payload = JSON.parse(await readFile(url)); payload.sources.mit.name += " changed";
    return new Response(JSON.stringify(payload));
  });
  await assert.rejects(searchExpandedDictionary("热", data), { code: "invalid_dictionary_data" });
  assert.equal(data.requests.length, 1);
});

test("ranking metadata enforces canonical IDs, source tuples and a matching dictionary version", async () => {
  const zipped = await readFile(new URL(`data/chinese-search-ranking/${CHINESE_RANKING_RELEASE.file}`, ROOT));
  const payload = JSON.parse(gunzipSync(zipped)), row = payload.records[0];
  const manifest = { version: payload.dictionaryVersion, counts: { records: 1 }, sources: new Map(row[2].map(tuple => [tuple[1], {}])) };
  const one = { ...payload, records: [row] };
  assert.equal(parseChineseRanking(one, manifest).size, 1);
  assert.throws(() => parseChineseRanking({ ...one, dictionaryVersion: "0".repeat(64) }, manifest));
  const wrongId = structuredClone(one); wrongId.records[0][0]++;
  assert.throws(() => parseChineseRanking(wrongId, manifest));
  const unknown = structuredClone(one); unknown.records[0][2][0][1] = "unknown";
  assert.throws(() => parseChineseRanking(unknown, manifest));
});

test("English lookups and aborted calls do not load the Chinese sidecar", async () => {
  const data = fileTransport(), controller = new AbortController(); controller.abort();
  await assert.rejects(searchExpandedDictionary("热", { ...data, signal: controller.signal }), { name: "AbortError" });
  assert.equal(data.requests.length, 0);
  await searchExpandedDictionary("stifling", data);
  assert.equal(data.requests.filter(item => /\.bin$/u.test(item.url)).length, 0);
});

test("daily Chinese aliases join complete pages while offline known rows stay explicitly partial", async () => {
  const data = fileTransport();
  const first = await searchExpandedDictionary("人工客服", { ...data, limit: 1, offset: 0 });
  const second = await searchExpandedDictionary("人工客服", { ...data, limit: 1, offset: first.nextOffset });
  assert.equal(first.offset, 0); assert.equal(first.nextOffset, 1); assert.ok(first.hasMore);
  assert.equal(second.offset, 1); assert.notEqual(first.results[0].term, second.results[0].term);
  assert.equal(second.total, first.total);
  assert.equal(first.relatedIntegrated, true); assert.equal(first.ranking, "global");
  assert.equal(data.requests.filter(row => /\.bin$/u.test(row.url)).length, 1);
  const end = await searchExpandedDictionary("人工客服", { ...data, limit: 1, offset: first.total });
  assert.deepEqual(end.results, []); assert.equal(end.hasMore, false);
  const offline = await searchExpandedDictionary("人工客服", { fetchImpl: () => { throw new Error("offline"); } });
  assert.equal(offline.coverage, "basic"); assert.equal(offline.nextOffset, null); assert.equal(offline.hasMore, false);
});
