import test from "node:test";
import assert from "node:assert/strict";
import { chineseSearchPlan } from "../../vocab/js/chinese-search.js";
import { allChineseResults, assertAuditableChineseRow, sharedChineseTransport } from "./helpers/general-chinese-search-contract.mjs";

test("the original 54 Chinese concept families still resolve real, correctly matched dictionary records", async () => {
  const seeds = ["开心", "不开心", "难过", "愤怒", "害怕", "担心", "疲倦", "困倦", "聪明", "愚蠢", "勇敢", "有礼貌",
    "美味", "快速", "缓慢", "干净", "肮脏", "帮助", "开始", "结束", "喜欢", "讨厌", "正确", "昂贵",
    "医生", "教师", "儿童", "婴儿", "朋友", "购买者", "寻找", "询问", "回答", "购买", "出售", "修理",
    "巨大", "微小", "困难", "漂亮", "惊讶", "嫉妒", "谨慎", "准确", "相似", "不同", "理解", "抱怨",
    "允许", "拒绝", "害羞", "著名", "错误", "安慰"];
  assert.equal(seeds.length, 54);
  const queries = [...new Set(seeds.flatMap(term => { const plan = chineseSearchPlan(term); assert.ok(plan); return [plan.term, ...plan.aliases]; }))];
  let checks = 0;
  for (const term of queries) {
    for (const input of [term, term + "的"]) {
      const complete = await allChineseResults(input);
      if (input === term || complete.normalizedQuery === term) assert.ok(complete.results.length, input);
      for (const row of complete.results) await assertAuditableChineseRow(input, row);
      checks++;
    }
  }
  assert.ok(checks >= 300, "cover aliases and suffix-query forms, not just 54 seed words");
  const positive = await allChineseResults("开心");
  assert.ok(positive.results.some(row => row.term === "happy"));
  assert.ok(positive.results.some(row => row.term === "glad"));
  assert.ok(!positive.firstPage.slice(0, 2).some(row => row.term === "unhappy"), "a negative compound must not outrank complete positive senses");
  const negative = await allChineseResults("不开心");
  assert.ok(negative.results.some(row => row.term === "unhappy"));
  assert.ok(!negative.firstPage.slice(0, 2).some(row => ["happy", "glad"].includes(row.term)), "a negated query must not be rewritten to its positive family");
  for (const query of ["开心", "快乐", "高兴", "难过", "喜欢"]) {
    const complete = await allChineseResults(query);
    for (const row of complete.results) await assertAuditableChineseRow(query, row);
    // These legacy rejected examples are not approved as synonyms merely
    // because their independent source can contain the same Chinese word.
    for (const row of complete.results.filter(row => ["unhappy", "pistachio nut", "hedonist", "unpalatable", "heart", "fan mail"].includes(row.term))) {
      assert.ok(!row.matchedSourceEvidence && !row.matchedExampleSenseEvidence && !row.matchedSense,
        `${query}/${row.term}: no unrelated source may inherit a reviewed synonym/example approval`);
    }
  }
  for (const query of ["医生", "医师", "大夫"]) {
    const complete = await allChineseResults(query), terms = complete.results.map(row => row.term);
    assert.ok(terms.includes("doctor")); assert.ok(terms.includes("physician"));
    for (const row of complete.results) await assertAuditableChineseRow(query, row);
    for (const row of complete.results.filter(row => ["medical", "Dr", "healer", "medicine man", "Aesculapian", "Aesculapius", "pill roller", "appointment", "examination", "nurse", "pharmacist", "Ph.D."].includes(row.term))) {
      assert.ok(!row.matchedSense && !row.matchedSourceEvidence && !row.matchedExampleSenseEvidence,
        `${query}/${row.term}: independent medical senses do not receive ordinary-doctor group approval`);
    }
  }
  for (const [query, expected, excluded] of [["教师", "teacher", "pedagogical"], ["儿童", "child", "puerile"], ["婴儿", "baby", "infantile"]]) {
    const complete = await allChineseResults(query);
    assert.ok(complete.results.some(row => row.term === expected), query);
    const other = complete.results.find(row => row.term === excluded);
    if (other) assert.ok(!other.matchedSense && !other.matchedSourceEvidence, `${query}/${excluded}: no person-POS approval for an adjectival derivative`);
    for (const row of complete.results) await assertAuditableChineseRow(query, row);
  }
  for (const [query, expected] of [["购买", "buy"], ["购置", "purchase"], ["买", "buy"], ["出售", "sell"], ["卖出", "sell"], ["卖", "sell"]]) {
    const complete = await allChineseResults(query);
    assert.ok(complete.results.some(row => row.term === expected), query);
    for (const row of complete.results) await assertAuditableChineseRow(query, row);
  }
  assert.equal(sharedChineseTransport.requests.filter(url => /\.bin$/u.test(url)).length, 1,
    "all original families share one hash-verified ranking corpus");
});
