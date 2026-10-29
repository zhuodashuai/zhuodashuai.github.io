import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chineseSearchPlan, matchesChineseSearchEntry } from "../../vocab/js/chinese-search.js";
import { searchExpandedDictionary, searchRelatedChineseDictionary } from "../../vocab/js/expanded-dictionary.js";
import { isPinnedChineseRankingFixture } from "./helpers/chinese-ranking-fixture-asset.mjs";

test("the original 54 Chinese concept families still resolve real, correctly matched dictionary records", async () => {
  const seeds = ["开心", "不开心", "难过", "愤怒", "害怕", "担心", "疲倦", "困倦", "聪明", "愚蠢", "勇敢", "有礼貌",
    "美味", "快速", "缓慢", "干净", "肮脏", "帮助", "开始", "结束", "喜欢", "讨厌", "正确", "昂贵",
    "医生", "教师", "儿童", "婴儿", "朋友", "购买者", "寻找", "询问", "回答", "购买", "出售", "修理",
    "巨大", "微小", "困难", "漂亮", "惊讶", "嫉妒", "谨慎", "准确", "相似", "不同", "理解", "抱怨",
    "允许", "拒绝", "害羞", "著名", "错误", "安慰"];
  assert.equal(seeds.length, 54);
  const queries = [...new Set(seeds.flatMap(term => { const plan = chineseSearchPlan(term); assert.ok(plan); return [plan.term, ...plan.aliases]; }))];
  const fetchImpl = async (url, options) => {
    const target = new URL(url); assert.equal(target.protocol, "file:"); assert.equal(target.search, "");
    assert.ok(/\/vocab\/data\/expanded-dictionary\//u.test(target.pathname) || isPinnedChineseRankingFixture(target)); assert.equal(options.credentials, "omit");
    return new Response(await readFile(target));
  };
  let checks = 0;
  for (const term of queries) {
    const plan = chineseSearchPlan(term);
    for (const input of [term, term + "的"]) {
      const direct = await searchExpandedDictionary(input, { fetchImpl });
      const related = await searchRelatedChineseDictionary(input, { fetchImpl });
      assert.ok(direct.results.length || related.results.length || direct.hasMore || related.hasMore, input);
      const seen = new Set(direct.results.map(row => row.term));
      for (const row of direct.results) assert.ok(matchesChineseSearchEntry(row.term, row.meaning, plan.term), input + " / " + row.term);
      for (const row of related.results) {
        assert.equal(row.matchType, "related"); assert.ok(plan.aliases.includes(row.matchedChinese));
        assert.ok(matchesChineseSearchEntry(row.term, row.meaning, row.matchedChinese), input + " / " + row.term);
        assert.ok(!seen.has(row.term), "a canonical head must occur once"); seen.add(row.term);
      }
      checks++;
    }
  }
  assert.ok(checks >= 300, "cover aliases and suffix-query forms, not just 54 seed words");
  const positive = await searchRelatedChineseDictionary("开心", { fetchImpl });
  assert.deepEqual(positive.results.slice(0, 2).map(row => row.term), ["happy", "glad"]);
  const negative = await searchRelatedChineseDictionary("不开心", { fetchImpl });
  assert.equal(negative.results[0].term, "unhappy");
  const sad = await searchRelatedChineseDictionary("难过", { fetchImpl });
  assert.ok(!sad.results.some(row => row.term === "heart"));
  const liking = await searchRelatedChineseDictionary("喜欢", { fetchImpl });
  assert.ok(!liking.results.some(row => row.term === "fan mail"));
  for (const query of ["开心", "快乐", "高兴"]) {
    const direct = await searchExpandedDictionary(query, { fetchImpl }); const related = await searchRelatedChineseDictionary(query, { fetchImpl });
    assert.ok(![...direct.results, ...related.results].some(row => ["unhappy", "pistachio nut", "hedonist", "unpalatable"].includes(row.term)));
  }
  for (const query of ["医生", "医师", "大夫"]) {
    const direct = await searchExpandedDictionary(query, { fetchImpl }), related = await searchRelatedChineseDictionary(query, { fetchImpl });
    const terms = [...direct.results, ...related.results].map(row => row.term);
    assert.ok(terms.includes("doctor")); assert.ok(terms.includes("physician"));
    assert.ok(!terms.some(term => ["medical", "Dr", "healer", "medicine man", "Aesculapian", "Aesculapius", "pill roller", "appointment", "examination", "nurse", "pharmacist", "Ph.D."].includes(term)));
  }
  for (const [query, expected, excluded] of [["教师", "teacher", "pedagogical"], ["儿童", "child", "puerile"], ["婴儿", "baby", "infantile"]]) {
    const direct = await searchExpandedDictionary(query, { fetchImpl }), related = await searchRelatedChineseDictionary(query, { fetchImpl });
    const terms = [...direct.results, ...related.results].map(row => row.term);
    assert.ok(terms.includes(expected), query); assert.ok(!terms.includes(excluded), query);
  }
  for (const [query, expected] of [["购买", "buy"], ["购置", "purchase"], ["买", "buy"], ["出售", "sell"], ["卖出", "sell"], ["卖", "sell"]]) {
    const requests = [];
    const coldFetch = async (url, options) => { requests.push(String(url)); return fetchImpl(url, options); };
    const direct = await searchExpandedDictionary(query, { fetchImpl: coldFetch }), related = await searchRelatedChineseDictionary(query, { fetchImpl: coldFetch });
    assert.ok([...direct.results, ...related.results].some(row => row.term === expected), query);
    assert.ok(!requests.some(url => /\/zh-\d{3}\.json$/u.test(url)), "single-character trade aliases never need broad postings");
    assert.ok(requests.filter(url => /\/en-\d{3}\.json$/u.test(url)).length <= 4);
  }
});
