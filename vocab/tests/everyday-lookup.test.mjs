import test from "node:test";
import assert from "node:assert/strict";
import { EVERYDAY_LOOKUP_ENTRIES } from "../js/everyday-lookup-data.js";
import { searchEverydayDictionary, loadEverydayExamples } from "../js/everyday-lookup.js";

const heads = input => searchEverydayDictionary(input)?.results.map(row => row.term) || [];

test("human-service queries resolve people rather than a customer, bot, or general service", () => {
  for (const query of ["人工客服", "真人客服"]) {
    const terms = heads(query);
    assert(terms.length, query);
    assert(terms.some(term => ["live agent", "human agent", "customer service representative"].includes(term)), query);
    for (const wrong of ["customer", "customer agent", "customer service", "chatbot", "artificial intelligence"]) assert(!terms.includes(wrong), query + ": " + wrong);
  }
});

test("external-use alcohol queries stay separate from drinks and industrial alcohol", () => {
  for (const query of ["消毒酒精", "医用酒精"]) {
    const terms = heads(query);
    assert(terms.length, query);
    assert(terms.some(term => ["rubbing alcohol", "surgical spirit", "medical alcohol"].includes(term)), query);
    for (const wrong of ["alcohol", "methyl alcohol", "methanol", "denatured alcohol", "alcoholic drink", "disinfectant"]) assert(!terms.includes(wrong), query + ": " + wrong);
  }
});

test("complete Chinese lookup questions, spaces and outer punctuation preserve the subject", () => {
  const expected = heads("人工客服");
  for (const query of [" 人 工 客 服 ", "（人工客服）", "请问人工客服的英文是什么？", "请问，人工客服的英文是什么？", "请问一下人工客服的英文是什么？", "人工客服用英语怎么说", "人工客服用英文怎么说？", "人工客服的英文", "人工客服的英文怎么说", "人工客服的英语怎么说", "请问‘人工客服’的英文是什么？"]) {
    assert.deepEqual(heads(query), expected, query);
  }
  assert.deepEqual(heads("‘消 毒 酒 精’的英文是什么？"), heads("消毒酒精"));
});

test("no substring, negation deletion, compound deletion or chained question expansion occurs", () => {
  for (const query of ["不是人工客服", "非人工客服", "不要人工客服", "我不想要人工客服", "人工客服的反义词", "不是消毒酒精", "不含消毒酒精", "消毒酒精饮料", "人工，客服", "请问人工客服的英文是什么的英文", "我想知道人工客服的英文"]) {
    assert.equal(searchEverydayDictionary(query), null, query);
  }
});

test("English normalisation accepts listed forms without guessing other words", () => {
  for (const row of EVERYDAY_LOOKUP_ENTRIES) {
    assert.equal(heads(row.term)[0], row.term);
    assert.equal(heads(`“  ${row.term.toUpperCase().replaceAll(" ", "   ")}  ”?!`)[0], row.term);
    for (const form of row.englishForms) assert(heads(form).length, form);
  }
  assert.equal(searchEverydayDictionary("heppy"), null);
  assert.equal(searchEverydayDictionary("what is a live agent"), null);
  const row = EVERYDAY_LOOKUP_ENTRIES.find(item => item.englishForms.some(form => form.toLowerCase() !== item.term.toLowerCase()
    && !EVERYDAY_LOOKUP_ENTRIES.some(other => other.term.toLowerCase() === form.toLowerCase())));
  assert(row, "fixture contains an explicit noncanonical English form");
  const form = row.englishForms.find(form => form.toLowerCase() !== row.term.toLowerCase()
    && !EVERYDAY_LOOKUP_ENTRIES.some(other => other.term.toLowerCase() === form.toLowerCase()));
  const result = searchEverydayDictionary(form).results.find(item => item.term === row.term);
  assert.equal(result.matchedForm, form);
});

test("limits retain declared data order and report truncation", () => {
  const groups = new Map();
  for (const row of EVERYDAY_LOOKUP_ENTRIES) for (const alias of row.chineseAliases) {
    const list = groups.get(alias) || []; if (!list.includes(row.term)) list.push(row.term); groups.set(alias, list);
  }
  const shared = [...groups].find(([, terms]) => terms.length > 1); assert(shared, "at least one precise query has multiple alternatives");
  const [query, expected] = shared;
  const all = searchEverydayDictionary(query, { limit: 50 }); assert.deepEqual(all.results.map(row => row.term), expected);
  for (const limit of [0, 1, -1]) {
    const short = searchEverydayDictionary(query, { limit }); assert.deepEqual(short.results.map(row => row.term), expected.slice(0, 1)); assert.equal(short.hasMore, true);
  }
  assert.deepEqual(searchEverydayDictionary(query, { limit: Infinity }), searchEverydayDictionary(query));
});

test("invalid, oversized, control and executable-looking inputs cannot hit the overlay", () => {
  for (const input of [null, undefined, {}, [], 3, "", "   ", "a".repeat(201), "人".repeat(51), "人工\n客服", "人工\t客服", "人工\u202e客服", "人工客服\u2069", "live\u0000 agent", "<live agent>", "＜live agent＞", "javascript:live agent", "javascript：人工客服", "\ud800"]) {
    assert.equal(searchEverydayDictionary(input), null, String(input));
    assert.equal(loadEverydayExamples(input), null, String(input));
  }
});

test("example identity is stable for English heads and explicit forms, never for a query sentence", () => {
  const ids = new Set();
  for (const row of EVERYDAY_LOOKUP_ENTRIES) {
    const example = loadEverydayExamples(row.term); assert(example); assert.equal(example.term, row.term);
    assert.equal(example.senses.length, 1); const sense = example.senses[0];
    assert.match(sense.id, row.reviewedCanonicalSense ? /^reviewed-sense:[a-f0-9]{16}$/u : /^everyday:[a-f0-9]{16}$/u); assert(!ids.has(sense.id)); ids.add(sense.id);
    assert.equal(sense.partOfSpeech, row.partOfSpeech); assert.equal(sense.meaningZh, row.meaning);
    assert.deepEqual(sense.examples, [{ en: row.en, zh: row.zh }]);
    assert.equal(sense.source, row.exampleSource || "原创例句·作者自查（精选义项）");
    assert.equal(loadEverydayExamples(row.term.toUpperCase()).senses[0].id, sense.id);
  }
  for (const query of ["人工客服", "请问人工客服的英文是什么", "live agent?", '"live agent"', "what is live agent?"]) assert.equal(loadEverydayExamples(query), null, query);
});

test("results expose only the public dictionary contract and fresh mutable copies", () => {
  const row = EVERYDAY_LOOKUP_ENTRIES[0], first = searchEverydayDictionary(row.term).results[0];
  assert.deepEqual(Object.keys(first).sort(), ["license", "meaning", "partOfSpeech", "source", "term", "url"]);
  assert.equal(first.source, "卓的日常词组"); assert.equal(first.license, "Original composition");
  assert.equal(first.url, "https://zhuodashuai.github.io/vocab/");
  first.term = "changed"; assert.equal(searchEverydayDictionary(row.term).results[0].term, row.term);
  const example = loadEverydayExamples(row.term); example.senses[0].examples[0].en = "changed";
  assert.equal(loadEverydayExamples(row.term).senses[0].examples[0].en, row.en);
});
