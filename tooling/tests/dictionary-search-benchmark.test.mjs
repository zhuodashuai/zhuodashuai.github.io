import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSearchBenchmark, benchmarkHeadEvidence } from "../scripts/benchmark-dictionary-search.mjs";

const corpus = JSON.parse(await readFile(new URL("../dictionary/search-benchmarks/2026-11-19.json", import.meta.url)));

test("finite search corpus keeps all 235 distinct recorded inputs, three visible gaps and vetted exclusions", () => {
  assert.equal(validateSearchBenchmark(corpus), corpus);
  assert.equal(new Set(corpus.queries.map(row => row.query)).size, 235);
  assert.deepEqual(corpus.queries.filter(row => row.knownPending).map(row => row.query), ["by a fluke", "well adjusted", "rock ʼnʼ roll"]);
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
    value => { delete value.queries.find(row => row.knownPending).knownPending; },
  ]) { const value = structuredClone(corpus); mutate(value); assert.throws(() => validateSearchBenchmark(value)); }
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
