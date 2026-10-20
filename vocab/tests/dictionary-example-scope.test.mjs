import test from "node:test";
import assert from "node:assert/strict";
import { dictionaryExampleSensePlan } from "../js/dictionary-app.js";

const sense = (id, partOfSpeech, meaningZh) => Object.freeze({ id, partOfSpeech, meaningZh,
  examples: Object.freeze([Object.freeze({ en: `Original example ${id}.`, zh: `原有例句 ${id}。` })]),
  source: "原创例句·AI复核（精选义项）", reviewer: "AI/test" });

test("a scoped autumn result opens the noun fall example instead of the first falling verb example", () => {
  const falling = sense("fall-verb", "verb", "落下；跌倒"), autumn = sense("fall-autumn", "noun", "秋天；秋季");
  const decline = sense("fall-decline", "noun", "下降；跌落");
  const entry = Object.freeze({ term: "fall", senses: Object.freeze([falling, autumn, decline]) });
  const before = JSON.stringify(entry);
  const plan = dictionaryExampleSensePlan(entry, { matchedPartOfSpeech: "noun", matchedSense: "秋天／秋季" });
  assert.equal(plan.scoped, true); assert.equal(plan.hasMatch, true);
  assert.deepEqual(plan.items.map(row => row.sense.id), ["fall-autumn", "fall-verb", "fall-decline"]);
  assert.deepEqual(plan.items.map(row => row.open), [true, false, false]);
  assert.deepEqual(plan.items.map(row => row.label), ["本次义项", "其他义项", "其他义项"]);
  assert.equal(plan.items[0].sense, autumn); assert.equal(plan.items[1].sense, falling);
  assert.equal(JSON.stringify(entry), before, "source order, examples, Chinese meanings and provenance remain intact");
});

test("example ranking never borrows a POS from another atom and opens only the first genuine match", () => {
  const wrong = sense("mixed-wrong", "noun · verb", "n. 学习\nvt. 研究");
  const first = sense("verb-first", "verb", "学习；研习"), second = sense("verb-second", "verb", "研习");
  const noun = sense("noun-only", "noun", "研习");
  const plan = dictionaryExampleSensePlan({ senses: [wrong, first, second, noun] },
    { matchedPartOfSpeech: "verb", matchedSense: "学习／研习" });
  assert.deepEqual(plan.items.map(row => row.sense.id), ["verb-first", "verb-second", "mixed-wrong", "noun-only"]);
  assert.deepEqual(plan.items.map(row => row.matched), [true, true, false, false]);
  assert.deepEqual(plan.items.map(row => row.open), [true, false, false, false]);
});

test("missing exact scoped meaning keeps all examples closed rather than highlighting compound or mentioned aliases", () => {
  const examples = [sense("mention", "noun", "谈论秋天与秋季的故事"), sense("compound", "noun", "秋季服装"),
    sense("wrong-pos", "adjective", "秋季的"), sense("other", "verb", "落下；下降")];
  const plan = dictionaryExampleSensePlan({ senses: examples }, { matchedPartOfSpeech: "noun", matchedSense: "秋天／秋季" });
  assert.equal(plan.scoped, true); assert.equal(plan.hasMatch, false);
  assert.deepEqual(plan.items.map(row => row.sense), examples);
  assert.ok(plan.items.every(row => !row.open && !row.matched && row.label === "其他义项"));
});

test("unscoped English lookup retains the original ordering and first-open behavior", () => {
  const examples = [sense("fall-verb", "verb", "落下"), sense("fall-noun", "noun", "秋天")];
  for (const result of [undefined, { term: "fall" }, { matchedPartOfSpeech: "noun" }, { matchedSense: "秋天" }]) {
    const plan = dictionaryExampleSensePlan({ senses: examples }, result);
    assert.equal(plan.scoped, false); assert.equal(plan.hasMatch, false);
    assert.deepEqual(plan.items.map(row => row.sense), examples);
    assert.deepEqual(plan.items.map(row => row.open), [true, false]);
    assert.ok(plan.items.every(row => !row.label));
  }
});
