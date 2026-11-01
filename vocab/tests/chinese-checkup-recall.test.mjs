import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chineseSearchPlan, chineseSearchHeads, requiresWholeChineseSourceAtom,
  matchesWholeChineseSourceAtom, matchesChineseSearchMeaning } from "../js/chinese-search.js";
import { searchExpandedDictionary } from "../js/expanded-dictionary.js";

const family = ["体检", "体格检查", "健康检查"];

test("medical-examination recall is an exact finite whole-query family with no English head shortlist", () => {
  for (const term of family) {
    const plan = chineseSearchPlan(term);
    assert.deepEqual(plan, { term, aliases: family.filter(alias => alias !== term) });
    assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.aliases));
    assert.equal(requiresWholeChineseSourceAtom(term), true);
    assert.equal(chineseSearchHeads(term), null);
  }
  for (const term of ["尸检", "尸体检查", "身体检查", "健康筛查", "体检医生", "体检的", "不体检", "晶体检波器"]) {
    assert.equal(requiresWholeChineseSourceAtom(term), false, term);
    assert.equal(chineseSearchPlan(term), null, term);
  }
});

test("finite checkup matching binds whole affirmative atoms to their own noun source role", () => {
  for (const [meaning, term, pos] of [
    ["n. 体检", "体检", "noun"],
    ["① 体检", "体检", "noun phrase"],
    ["① adj. 身体的\n② n. 体格检查", "体格检查", "adjective · noun"],
    ["ｎ．健康检查", "健康检查", "noun"],
    ["① n. 健康检查\n[网络] 体检；检查身体", "体检", "noun"],
  ]) assert.equal(matchesWholeChineseSourceAtom(meaning, term, pos), true, meaning);
  for (const [meaning, pos] of [
    ["n. 尸体检查", "noun"], ["n. 活体检定", "noun"], ["[电] 晶体检波器", "noun"],
    ["n. 体检医生", "noun"], ["adj. 体检的", "adjective"], ["adj. 体检", "adjective"],
    ["adj. 身体的；体检", "adjective · noun"], ["n. 不是体检", "noun"],
    ["n. 体检(并非普通体检)", "noun"], ["n. (使)体检", "noun"],
    ["n. 体检\u202e", "noun"], ["[网络] 体检", "adjective"],
  ]) assert.equal(matchesWholeChineseSourceAtom(meaning, "体检", pos), false, meaning);
  assert.equal(matchesWholeChineseSourceAtom("[网络] 耐心", "耐心", "noun"), false);
  assert.equal(matchesChineseSearchMeaning("[网络] 耐心", "耐心"), false,
    "An approved finite family cannot promote arbitrary network glosses");
});

test("all three actual local checkup streams have complete stable pages and preserve their source meanings", async () => {
  const requests = [], fetchImpl = async url => { requests.push(String(url)); return new Response(await readFile(url)); };
  const expected = ["checkup", "check-up", "medical checkup", "physical"];
  const before = new Map();
  for (const head of expected) before.set(head, await searchExpandedDictionary(head, { fetchImpl }));
  for (const query of family) {
    const all = []; let offset = 0, total;
    for (let count = 0; count < 30; count++) {
      const page = await searchExpandedDictionary(query, { fetchImpl, limit: 2, offset });
      assert.equal(page.ranking, "global"); total ??= page.total; assert.equal(page.total, total);
      all.push(...page.results); assert.equal(page.offset, offset);
      if (!page.hasMore) break;
      assert.equal(page.nextOffset, offset + page.results.length); assert.ok(page.nextOffset > offset); offset = page.nextOffset;
    }
    assert.equal(all.length, total); assert.equal(new Set(all.map(row => row.term)).size, total);
    for (const term of expected) assert.ok(all.some(row => row.term === term), `${query} must recall ${term}`);
    for (const term of ["postmortem", "bioassay", "crystal detector", "medical examiner", "health screening"]) {
      assert.ok(!all.some(row => row.term === term), `${query} must not equate ${term}`);
    }
    for (const row of all) {
      assert.ok(family.some(term => matchesWholeChineseSourceAtom(row.meaning, term, row.partOfSpeech)),
        `${query}: ${row.term} needs an actual complete noun atom`);
    }
    const full = await searchExpandedDictionary(query, { fetchImpl, limit: 50 });
    assert.deepEqual(full.results, all);
    const end = await searchExpandedDictionary(query, { fetchImpl, offset: total });
    assert.deepEqual(end.results, []); assert.equal(end.hasMore, false);
  }
  for (const head of expected) assert.deepEqual(await searchExpandedDictionary(head, { fetchImpl }), before.get(head));
  const unexpanded = await searchExpandedDictionary("尸检", { fetchImpl });
  assert.equal(unexpanded.total, 0); assert.deepEqual(unexpanded.results, []);
  assert.equal(requests.filter(url => /\.bin$/u.test(url)).length, 1);
});
