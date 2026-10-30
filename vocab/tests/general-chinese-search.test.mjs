import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { searchExpandedDictionary, searchRelatedChineseDictionary } from "../js/expanded-dictionary.js";
import { searchEverydayDictionary, everydayChineseEntries, matchesRetainedCanonicalAlternative } from "../js/everyday-lookup.js";

function transport(transform) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    const bytes = await readFile(url);
    return transform ? transform(url, bytes, options) : new Response(bytes);
  };
  return { requests, fetchImpl };
}

async function allPages(query, data, search = searchExpandedDictionary) {
  const rows = []; let offset = 0, total;
  for (let page = 0; page < 200; page++) {
    const result = await search(query, { ...data, offset, limit: 50 });
    assert.equal(result.ranking, "global"); assert.equal(result.relatedIntegrated, true);
    total ??= result.total; assert.equal(result.total, total);
    assert.equal(result.offset, offset);
    rows.push(...result.results);
    if (!result.hasMore) break;
    assert.ok(result.nextOffset > offset); offset = result.nextOffset;
  }
  assert.equal(rows.length, total); assert.equal(new Set(rows.map(row => row.term)).size, rows.length);
  return rows;
}

test("complete Chinese search keeps genuine source heads outside all former curated shortlists and POS gates", async () => {
  const data = transport();
  for (const [query, expected] of [["工作", ["work", "job", "labor", "working"]],
    ["严厉", ["strict", "stern", "harsh", "severe"]], ["安静", ["quiet", "silent", "tranquil"]]]) {
    const rows = await allPages(query, data), terms = new Set(rows.map(row => row.term));
    for (const head of expected) assert.ok(terms.has(head), `${query}: missing ${head}`);
    assert.ok(rows.length > expected.length);
  }
  const work = await allPages("工作", data);
  assert.match(work.find(row => row.term === "working").partOfSpeech, /adjective|noun/u);
  assert.ok(work.some(row => /verb/u.test(row.partOfSpeech)), "mixed roles remain visible with their actual source POS");
});

test("an approved everyday alias no longer hides other exact source meanings", async () => {
  const data = transport();
  for (const [query, heads] of [["糖", ["sugar", "glucose"]], ["无糖", ["sugarless", "sugar-free"]],
    ["酒精", ["alcohol", "ethanol"]]]) {
    const rows = await allPages(query, data);
    for (const head of heads) assert.ok(rows.some(row => row.term === head), `${query}: ${head}`);
  }
  assert.equal(data.requests.filter(row => /chinese-search-ranking/u.test(row.url)).length, 1);
  assert.ok(data.requests.every(row => row.options.credentials === "omit"));
});

test("superseded source meanings and explicit exclusions cannot re-enter through approved definition prose", async () => {
  const data = transport();
  for (const [query, excluded] of [["垃圾袋", "baggie"], ["光盘驱动器", "CD-ROM"],
    ["袋狼", "hyena"], ["剑鱼", "dorado"], ["玉米粥", "hominy"], ["达阵", "touchback"]]) {
    const rows = await allPages(query, data);
    assert.ok(!rows.some(row => row.term === excluded), `${query}: excluded ${excluded} sense leaked into recall`);
    if (query === "垃圾袋") assert.ok(rows.some(row => row.term === "bin liner"));
  }
  for (const [query, head] of [["食品小塑料袋", "baggie"], ["只读光盘", "CD-ROM"], ["鬣狗", "hyena"]]) {
    const actual = (await allPages(query, data)).find(row => row.term === head);
    const approved = searchEverydayDictionary(head).results[0];
    assert.ok(actual, `${query}: approved positive sense must remain available`);
    assert.equal(actual.meaning, approved.meaning); assert.equal(actual.partOfSpeech, approved.partOfSpeech);
    assert.equal(actual.source, approved.source);
  }
});

test("full-corpus matching preserves exact approved retained alternatives and their provenance", async () => {
  const data = transport();
  for (const [query, head] of [["直接离心浮选", "DCF"], ["商学士", "BSC"], ["拳击手", "stablemate"]]) {
    const actual = (await allPages(query, data)).find(row => row.term === head);
    assert.ok(actual, `${query}: retained ${head} source sense disappeared`);
    assert.ok(matchesRetainedCanonicalAlternative(head, actual), `${head}: only an exact approved retained tuple may surface`);
    for (const alternative of actual.alternatives || []) {
      assert.ok(matchesRetainedCanonicalAlternative(head, alternative), `${head}: unapproved side alternative`);
    }
  }
});

test("literal and reviewed one-hop related meanings share one complete rank and cursor", async () => {
  const data = transport(), direct = await allPages("难过", data);
  assert.ok(direct.slice(0, 20).some(row => row.term === "sad"));
  const integrated = await allPages("开心", data), related = await allPages("开心", data, searchRelatedChineseDictionary);
  assert.ok(related.length > 8, "associations are not truncated by the old optional eight-card path");
  assert.deepEqual(related, integrated.filter(row => row.matchType === "related"));
  assert.ok(integrated.slice(0, 20).some(row => row.term === "happy" && row.matchType === "related"));
  assert.ok(related.every(row => typeof row.matchedChinese === "string" && row.matchedChinese));
});

test("the related API normalises through the same corpus before deciding whether aliases exist", async () => {
  const data = transport();
  for (const query of ["工作的", "可靠地", "最低地", "需要的"]) {
    const main = await allPages(query, data);
    const related = await allPages(query, data, searchRelatedChineseDictionary);
    const expected = main.filter(row => row.matchType === "related");
    assert.ok(expected.length > 0, query);
    assert.deepEqual(related, expected, query);
  }
});

test("normalisation retains independent Chinese words and co-definition anchors cannot invent candidate relations", async () => {
  const data = transport();
  for (const word of ["目的地", "土地", "打的"]) {
    const rows = await allPages(word, data), response = await searchExpandedDictionary(word, data);
    assert.equal(response.normalizedQuery, undefined, word);
    if (word === "目的地") {
      assert.ok(rows.some(row => row.term === "destination"));
      assert.ok(!rows.some(row => ["creek", "brook", "rill", "sike"].includes(row.term)));
    }
  }
  const negative = await allPages("不开心", data);
  assert.ok(!negative.some(row => ["happy", "glad", "chuffed"].includes(row.term)));
  const adjective = await searchExpandedDictionary("安静的", data);
  assert.equal(adjective.normalizedQuery, "安静");
  assert.ok(adjective.results.some(row => row.term === "silent"));
});

test("source-supported adjective queries and their reviewed one-hop aliases share grammatical normalisation", async () => {
  const data = transport();
  for (const query of ["忧郁的", "滑稽的", "最低的", "富足的", "亲善的", "不开心的"]) {
    const result = await searchExpandedDictionary(query, data);
    assert.equal(result.normalizedQuery, query.slice(0, -1), query);
    assert.ok(result.total > 0, query); assert.equal(result.relatedIntegrated, true);
    if (query === "不开心的") assert.ok(!result.results.some(row => ["happy", "glad", "chuffed"].includes(row.term)));
  }
  const verbOnly = await searchExpandedDictionary("到达的", data);
  assert.equal(verbOnly.normalizedQuery, undefined);
});

test("known mixed aliases and complete lookup questions participate in full search; transport-only fallback is explicitly partial", async () => {
  const data = transport();
  for (const query of ["USB充电头", "USB充电头的英文怎么说", "无糖的英文怎么说"]) {
    const known = searchEverydayDictionary(query), actual = await searchExpandedDictionary(query, data);
    assert.ok(known?.results.length); assert.equal(actual.relatedIntegrated, true);
    assert.equal(actual.ranking, "global");
    for (const row of known.results) assert.ok(actual.results.some(item => item.term === row.term));
  }
  const offline = await searchExpandedDictionary("USB充电头", { fetchImpl: async () => { throw Error("offline"); } });
  assert.equal(offline.coverage, "basic"); assert.equal(offline.relatedIntegrated, true);
  assert.equal(offline.nextOffset, null); assert.equal(offline.hasMore, false);
  const corrupt = transport(() => new Response("{}"));
  await assert.rejects(searchExpandedDictionary("USB充电头", corrupt), { code: "invalid_dictionary_data" });
});

test("public source rows remain private from caller mutation and pagination preserves exact selected meaning provenance", async () => {
  const first = everydayChineseEntries(), entry = first.find(row => row.aliases.includes("无糖"));
  assert.ok(entry); const original = entry.result.meaning;
  entry.result.meaning = "changed"; entry.aliases.push("forged");
  const fresh = everydayChineseEntries().find(row => row.result.term === entry.result.term);
  assert.equal(fresh.result.meaning, original); assert.ok(!fresh.aliases.includes("forged"));
  const data = transport(), rows = await allPages("责任", data), obligation = rows.find(row => row.term === "obligation");
  assert.ok(obligation); assert.equal(obligation.source, "卓式词典·义项补充");
  assert.equal(obligation.matchedSourceEvidence.kind, "reviewed-canonical-primary");
  assert.equal(obligation.matchedSourceEvidence.canonicalId, 374313);
  assert.ok(!obligation.meaning.includes("恩惠"));
  assert.ok(obligation.matchedExampleSenseEvidence.length);
});
