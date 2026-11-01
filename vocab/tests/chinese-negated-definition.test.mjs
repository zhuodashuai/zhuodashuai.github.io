import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chineseVariantRank } from "../js/chinese-ranking.js";
import { searchExpandedDictionary } from "../js/expanded-dictionary.js";

test("explicit source exclusions cannot become translations through nominal modifiers", () => {
  for (const [meaning, query] of [
    ["不是普通手洗洗洁精", "洗洁精"],
    ["不特指给手机充电的充电宝", "充电宝"],
    ["并非家用的普通清洁剂", "清洁剂"],
    ["不是特别容易携带的备用电池", "备用电池"],
    ["不专指医院里的内科医生", "医生"],
    ["不是海鲜但也不是普通蔬菜", "蔬菜"],
  ]) assert.equal(chineseVariantRank(meaning, query, "noun phrase"), null, `${query}: ${meaning}`);
});

test("contrast, independent affirmative atoms and repeated occurrences retain real positive evidence", () => {
  for (const [meaning, query] of [
    ["不是普通清洁剂而是洗洁精", "洗洁精"],
    ["不指电池但是指充电宝", "充电宝"],
    ["不是洗洁精；洗洁精的主要原料", "洗洁精"],
    ["不是普通洗洁精而是浓缩洗洁精", "洗洁精"],
    ["不是没有清洁能力不过它属于普通清洁剂", "清洁剂"],
  ]) assert.notEqual(chineseVariantRank(meaning, query, "noun phrase"), null, `${query}: ${meaning}`);
});

test("lexical negative queries stay complete and a positive query does not inherit their opposite", () => {
  for (const query of ["不开心", "不安全", "不可靠", "无糖", "非处方药"]) {
    assert.equal(chineseVariantRank(query, query, "noun"), 0, query);
  }
  assert.equal(chineseVariantRank("不开心的", "开心", "adjective"), null);
  assert.equal(chineseVariantRank("无糖饮料", "糖", "noun"), null);
  assert.equal(chineseVariantRank("不是不开心", "不开心", "adjective"), null);
});

test("real local dictionary excludes contrasting household products without changing its complete source meanings", async () => {
  const requests = [];
  const fetchImpl = async url => { requests.push(String(url)); return new Response(await readFile(url)); };
  const expected = [
    { query: "洗洁精", keep: "washing-up liquid", reject: "dishwasher detergent" },
    { query: "充电宝", keep: "power bank", reject: "spare battery" },
  ];
  for (const { query, keep, reject } of expected) {
    const first = await searchExpandedDictionary(query, { fetchImpl, limit: 1 });
    assert.equal(first.ranking, "global"); assert.equal(first.results[0].term, keep);
    const all = [];
    let page = first;
    do {
      all.push(...page.results);
      if (!page.hasMore) break;
      page = await searchExpandedDictionary(query, { fetchImpl, limit: 1, offset: page.nextOffset });
    } while (true);
    assert.equal(all.length, first.total); assert.equal(new Set(all.map(row => row.term)).size, first.total);
    assert.ok(all.some(row => row.term === keep)); assert.ok(!all.some(row => row.term === reject));
    const literal = await searchExpandedDictionary(reject, { fetchImpl });
    assert.equal(literal.results[0].term, reject);
    assert.match(literal.results[0].meaning, query === "洗洁精" ? /不是普通手洗洗洁精/u : /不特指给手机充电的充电宝/u);
    const again = await searchExpandedDictionary(query, { fetchImpl, limit: 1 });
    assert.deepEqual(again, first);
  }
  assert.equal(requests.filter(url => /\.bin$/u.test(url)).length, 1);
  assert.ok(requests.every(url => url.startsWith("file:")));
});
