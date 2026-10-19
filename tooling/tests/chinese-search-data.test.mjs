import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chineseSearchPlan, matchesChineseSearchMeaning } from "../../vocab/js/chinese-search.js";
import { searchExpandedDictionary, searchRelatedChineseDictionary } from "../../vocab/js/expanded-dictionary.js";

test("all 24 Chinese concept families resolve only real, correctly matched dictionary records", async () => {
  const seeds = ["开心", "不开心", "难过", "愤怒", "害怕", "担心", "疲倦", "困倦", "聪明", "愚蠢", "勇敢", "有礼貌",
    "美味", "快速", "缓慢", "干净", "肮脏", "帮助", "开始", "结束", "喜欢", "讨厌", "正确", "昂贵"];
  const queries = [...new Set(seeds.flatMap(term => { const plan = chineseSearchPlan(term); assert.ok(plan); return [plan.term, ...plan.aliases]; }))];
  const fetchImpl = async (url, options) => {
    const target = new URL(url); assert.equal(target.protocol, "file:"); assert.equal(target.search, "");
    assert.match(target.pathname, /\/vocab\/data\/expanded-dictionary\//u); assert.equal(options.credentials, "omit");
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
      for (const row of direct.results) assert.ok(matchesChineseSearchMeaning(row.meaning, plan.term), input + " / " + row.term);
      for (const row of related.results) {
        assert.equal(row.matchType, "related"); assert.ok(plan.aliases.includes(row.matchedChinese));
        assert.ok(matchesChineseSearchMeaning(row.meaning, row.matchedChinese), input + " / " + row.term);
        assert.ok(!seen.has(row.term), "a canonical head must occur once"); seen.add(row.term);
      }
      checks++;
    }
  }
  assert.ok(checks >= 150, "cover aliases and their adjective-query forms, not just 24 seed words");
  const positive = await searchRelatedChineseDictionary("开心", { fetchImpl });
  assert.deepEqual(positive.results.slice(0, 2).map(row => row.term), ["happy", "glad"]);
  const negative = await searchRelatedChineseDictionary("不开心", { fetchImpl });
  assert.equal(negative.results[0].term, "unhappy");
  for (const query of ["开心", "快乐", "高兴"]) {
    const direct = await searchExpandedDictionary(query, { fetchImpl }); const related = await searchRelatedChineseDictionary(query, { fetchImpl });
    assert.ok(![...direct.results, ...related.results].some(row => ["unhappy", "pistachio nut", "hedonist", "unpalatable"].includes(row.term)));
  }
});
