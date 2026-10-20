import test from "node:test";
import assert from "node:assert/strict";
import { dictionaryExampleSensePlan } from "../js/dictionary-app.js";

const sense = (id, partOfSpeech, meaningZh) => Object.freeze({ id, partOfSpeech, meaningZh,
  examples: Object.freeze([Object.freeze({ en: `Original example ${id}.`, zh: `原有例句 ${id}。` })]),
  source: "原创例句·AI复核（精选义项）", reviewer: "AI/test" });
const proof = (...senses) => senses.map(({ id, partOfSpeech, meaningZh, examples }) => ({ id, partOfSpeech, meaningZh, examples }));

test("a scoped autumn result opens the noun fall example instead of the first falling verb example", () => {
  const falling = sense("fall-verb", "verb", "落下；跌倒"), autumn = sense("fall-autumn", "noun", "秋天；秋季");
  const decline = sense("fall-decline", "noun", "下降；跌落");
  const entry = Object.freeze({ term: "fall", senses: Object.freeze([falling, autumn, decline]) });
  const before = JSON.stringify(entry);
  const plan = dictionaryExampleSensePlan(entry, { term: "fall", matchedPartOfSpeech: "noun", matchedSense: "秋天／秋季",
    matchedExampleSenseIds: ["fall-autumn"], matchedExampleSenseEvidence: proof(autumn) });
  assert.equal(plan.scoped, true); assert.equal(plan.hasMatch, true);
  assert.deepEqual(plan.items.map(row => row.sense.id), ["fall-autumn", "fall-verb", "fall-decline"]);
  assert.deepEqual(plan.items.map(row => row.open), [true, false, false]);
  assert.deepEqual(plan.items.map(row => row.label), ["本次义项", "其他义项", "其他义项"]);
  assert.equal(plan.items[0].sense, autumn); assert.equal(plan.items[1].sense, falling);
  assert.equal(JSON.stringify(entry), before, "source order, examples, Chinese meanings and provenance remain intact");
});

test("reviewed example IDs never borrow a match from another atom and open only the first reviewed sense", () => {
  const wrong = sense("mixed-wrong", "noun · verb", "n. 学习\nvt. 研究");
  const first = sense("verb-first", "verb", "学习；研习"), second = sense("verb-second", "verb", "研习");
  const noun = sense("noun-only", "noun", "研习");
  const plan = dictionaryExampleSensePlan({ term: "study", senses: [wrong, first, second, noun] },
    { term: "study", matchedPartOfSpeech: "verb", matchedSense: "学习／研习", matchedExampleSenseIds: ["verb-first", "verb-second"],
      matchedExampleSenseEvidence: proof(first, second) });
  assert.deepEqual(plan.items.map(row => row.sense.id), ["verb-first", "verb-second", "mixed-wrong", "noun-only"]);
  assert.deepEqual(plan.items.map(row => row.matched), [true, true, false, false]);
  assert.deepEqual(plan.items.map(row => row.open), [true, false, false, false]);
});

test("missing exact scoped meaning keeps all examples closed rather than highlighting compound or mentioned aliases", () => {
  const examples = [sense("mention", "noun", "谈论秋天与秋季的故事"), sense("compound", "noun", "秋季服装"),
    sense("wrong-pos", "adjective", "秋季的"), sense("other", "verb", "落下；下降")];
  const plan = dictionaryExampleSensePlan({ term: "fall", senses: examples }, { term: "fall", matchedPartOfSpeech: "noun", matchedSense: "秋天／秋季",
    matchedExampleSenseIds: ["an-unavailable-reviewed-sense"] });
  assert.equal(plan.scoped, true); assert.equal(plan.hasMatch, false);
  assert.deepEqual(plan.items.map(row => row.sense), examples);
  assert.ok(plan.items.every(row => !row.open && !row.matched && row.label === "其他义项"));
});

test("physical foundation opens only its reviewed building-base sense, not an abstract shared Chinese alias", () => {
  const abstract = sense("foundation-abstract", "noun", "基础；基本原则"),
    physical = sense("foundation-building", "noun", "建筑物的地基；地下承重部分"),
    institution = sense("foundation-institution", "noun", "基金会");
  const entry = Object.freeze({ term: "foundation", senses: Object.freeze([abstract, physical, institution]) });
  const plan = dictionaryExampleSensePlan(entry, { term: "foundation", matchedPartOfSpeech: "noun", matchedSense: "地基／基础",
    matchedExampleSenseIds: ["foundation-building"], matchedExampleSenseEvidence: proof(physical) });
  assert.deepEqual(plan.items.map(row => row.sense.id), ["foundation-building", "foundation-abstract", "foundation-institution"]);
  assert.deepEqual(plan.items.map(row => row.open), [true, false, false]);
  assert.equal(plan.items[0].sense, physical);
  assert.equal(plan.items[1].label, "其他义项");
  assert.deepEqual(entry.senses, [abstract, physical, institution]);
});

test("a missing or empty reviewed whitelist never falls back to Chinese wording or a generic POS match", () => {
  const examples = [sense("exact-chinese", "noun", "地基；基础"), sense("qualified", "noun", "建筑物的地基")];
  for (const matchedExampleSenseIds of [undefined, null, [], ["unknown-id"], [null, {}, 1, ""]]) {
    const plan = dictionaryExampleSensePlan({ term: "foundation", senses: examples }, { term: "foundation", matchedPartOfSpeech: "noun", matchedSense: "地基／基础",
      matchedExampleSenseIds });
    assert.equal(plan.scoped, true); assert.equal(plan.hasMatch, false);
    assert.deepEqual(plan.items.map(row => row.sense), examples);
    assert.ok(plan.items.every(row => !row.open && !row.matched && row.label === "其他义项"));
  }
});

test("same-ID example drift fails closed unless POS, Chinese meaning, and ordered bilingual sentences all equal the review", () => {
  const physical = { ...sense("foundation-building", "noun", "建筑物的地基"), examples: [
    { en: "The workers laid the foundation.", zh: "工人们打好了地基。" },
    { en: "The foundation supports the house.", zh: "地基支撑着房屋。" },
  ] };
  const result = { term: "foundation", matchedPartOfSpeech: "noun", matchedSense: "地基／基础",
    matchedExampleSenseIds: [physical.id], matchedExampleSenseEvidence: structuredClone(proof(physical)) };
  assert.equal(dictionaryExampleSensePlan({ term: "foundation", senses: [physical] }, result).hasMatch, true);
  for (const change of [value => { value.partOfSpeech = "verb"; }, value => { value.meaningZh = "抽象基础"; },
    value => { value.examples[0].en = "A different example."; }, value => { value.examples[0].zh = "不同的译文。"; },
    value => { value.examples.push({ en: "A new sentence.", zh: "新增例句。" }); },
    value => { value.examples.reverse(); }]) {
    const drifted = structuredClone(physical); change(drifted);
    const plan = dictionaryExampleSensePlan({ term: "foundation", senses: [drifted] }, result);
    assert.equal(plan.hasMatch, false); assert.equal(plan.items[0].open, false);
    assert.equal(plan.items[0].label, "其他义项");
  }
});

test("reviewed IDs without complete evidence and a different selected head cannot authorize an example", () => {
  const physical = sense("foundation-building", "noun", "地基");
  const base = { term: "foundation", matchedPartOfSpeech: "noun", matchedSense: "地基／基础",
    matchedExampleSenseIds: [physical.id] };
  for (const matchedExampleSenseEvidence of [undefined, null, [], [{ id: physical.id }],
    [{ id: physical.id, partOfSpeech: "noun", meaningZh: "地基" }]]) {
    assert.equal(dictionaryExampleSensePlan({ term: "foundation", senses: [physical] },
      { ...base, matchedExampleSenseEvidence }).hasMatch, false);
  }
  const result = { ...base, matchedExampleSenseEvidence: proof(physical) };
  assert.equal(dictionaryExampleSensePlan({ term: "other-head", senses: [physical] }, result).hasMatch, false);
  assert.equal(dictionaryExampleSensePlan({ term: "foundation", senses: [physical] }, result).hasMatch, true);
  for (const entryTerm of [undefined, null, "", " ", "\u202efoundation", "foundation\u0000", "f".repeat(201)]) {
    assert.equal(dictionaryExampleSensePlan({ term: entryTerm, senses: [physical] }, result).hasMatch, false);
  }
  for (const resultTerm of [undefined, null, "", " ", "\u202efoundation", "foundation\u0000", "f".repeat(201)]) {
    assert.equal(dictionaryExampleSensePlan({ term: "foundation", senses: [physical] }, { ...result, term: resultTerm }).hasMatch, false);
  }
});

test("an intact proof cannot open a different grammatical role and qualified single roles remain supported", () => {
  const falling = sense("fall-verb", "verb", "落下"), mixed = sense("fall-mixed", "noun · verb", "秋季；落下"),
    noun = sense("fall-autumn", "noun (countable, often plural)", "秋季");
  const base = { term: "fall", matchedPartOfSpeech: "noun", matchedSense: "秋天／秋季",
    matchedExampleSenseIds: [falling.id, mixed.id, noun.id], matchedExampleSenseEvidence: proof(falling, mixed, noun) };
  const plan = dictionaryExampleSensePlan({ term: "fall", senses: [falling, mixed, noun] }, base);
  assert.deepEqual(plan.items.map(row => [row.sense.id, row.open]), [[noun.id, true], [falling.id, false], [mixed.id, false]]);
  for (const target of ["noun · verb", "n", "noun (countable)", "nounish"]) {
    const rejected = dictionaryExampleSensePlan({ term: "fall", senses: [noun] }, { ...base, matchedPartOfSpeech: target });
    assert.equal(rejected.hasMatch, false); assert.equal(rejected.items[0].open, false);
  }
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
