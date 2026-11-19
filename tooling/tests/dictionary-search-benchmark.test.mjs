import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { validateSearchBenchmark, benchmarkHeadEvidence } from "../scripts/benchmark-dictionary-search.mjs";

const corpus = JSON.parse(await readFile(new URL("../dictionary/search-benchmarks/2026-11-19.json", import.meta.url)));

test("finite search corpus keeps all 235 distinct recorded inputs, three historical gaps and vetted exclusions", () => {
  assert.equal(validateSearchBenchmark(corpus), corpus);
  assert.equal(new Set(corpus.queries.map(row => row.query)).size, 235);
  assert.deepEqual(corpus.queries.filter(row => row.historicalGap).map(row => row.query), ["by a fluke", "well adjusted", "rock ʼnʼ roll"]);
  assert.deepEqual(corpus.queries.find(row => row.query === "occured").expectedHeads, ["occur"]);
  assert.match(corpus.queries.find(row => row.query === "comming").knownIncorrectForm, /COM/u);
  for (const [query, wrong] of [["体检", "postmortem"], ["洗洁精", "dishwasher detergent"], ["充电宝", "spare battery"], ["转机", "rotating mechanism"]]) {
    assert(corpus.queries.find(row => row.query === query).excludedHeads.includes(wrong));
  }
  for (const [query, term] of [["文献综述", "literature review"], ["会员卡", "membership card"], ["凉快", "cool"]]) {
    assert(corpus.queries.find(row => row.query === query).expectedHeads.includes(term));
  }
});

test("benchmark rejects duplicate, unsafe, prose-bearing or silently removed cases", () => {
  for (const mutate of [
    value => { value.queries[1].query = value.queries[0].query; },
    value => { value.queries[0].query += "\u202e"; },
    value => { value.queries[0].meaning = "A copied definition does not belong in this head-only corpus."; },
    value => { value.queries.pop(); },
    value => { delete value.queries.find(row => row.historicalGap).historicalGap; },
  ]) { const value = structuredClone(corpus); mutate(value); assert.throws(() => validateSearchBenchmark(value)); }
});

test("follow-up keeps the complete byte-pinned historical corpus and changes only two independently explained head expectations",async()=>{
  const bytes=await readFile(new URL("../dictionary/search-benchmarks/historical/2026-11-19-pre-followup.json",import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"),"81df7b002e54495f0ade2f7974ffa9688278bf3006f71f88f2929aaa7ca29304");
  const old=JSON.parse(bytes);assert.equal(validateSearchBenchmark(old),old);
  assert.deepEqual(corpus.notes.slice(0,old.notes.length),old.notes);
  assert.deepEqual(corpus.queries.filter(row=>row.expectationReview).map(row=>row.query),["well adjusted","离职"]);
  for(let index=0;index<old.queries.length;index++){
    const expected=structuredClone(old.queries[index]),current=structuredClone(corpus.queries[index]);
    if(expected.knownPending){expected.historicalGap=expected.knownPending;delete expected.knownPending;}
    if(expected.query==="well adjusted")expected.expectedHeads=["well adjusted","well-adjusted"];
    if(expected.query==="离职")expected.expectedHeads=["leave a job"];
    delete current.expectationReview;assert.deepEqual(current,expected);
  }
});

test("a nonempty false positive cannot count as head accuracy and full-stream recall cannot count as top-five rank", () => {
  const row = { expectedHeads: ["physical", "checkup"], excludedHeads: ["postmortem"] };
  const falsePositive = benchmarkHeadEvidence(row, [{ term: "postmortem" }]);
  assert.equal(falsePositive.available, true); assert.equal(falsePositive.expectedHeadFound, false);
  assert.deepEqual(falsePositive.excludedHeadViolations, ["postmortem"]);
  const late = benchmarkHeadEvidence(row, ["one", "two", "three", "four", "five", "physical"].map(term => ({ term })));
  assert.equal(late.expectedHeadFound, true); assert.equal(late.firstExpectedPosition, 6);
  assert.equal(late.expectedHeadTop1, false); assert.equal(late.expectedHeadTop5, false);
  const empty = benchmarkHeadEvidence(row, []); assert.equal(empty.available, false); assert.equal(empty.expectedHeadFound, false);
});
