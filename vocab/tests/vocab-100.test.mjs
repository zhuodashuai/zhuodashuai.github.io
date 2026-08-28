import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const datasetUrl = new URL("../quality/datasets/vocab-100.json", import.meta.url);
const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));

const EXPECTED_CATEGORY_COUNTS = {
  ordinary: 40,
  polysemy: 20,
  phrase: 20,
  spelling: 10,
  special: 10
};

const EXPECTED_INPUTS = {
  ordinary: [
    "apple", "book", "chair", "city", "doctor", "family", "garden", "house", "language", "water",
    "accept", "build", "choose", "discover", "explain", "improve", "remember", "solve", "travel", "write",
    "careful", "difficult", "efficient", "familiar", "generous", "honest", "practical", "quiet", "responsible", "useful",
    "actually", "carefully", "frequently", "however", "probably", "analyze", "evidence", "hypothesis", "significant", "variable"
  ],
  polysemy: [
    "hip", "bank", "bat", "charge", "current", "fair", "file", "issue", "light", "match",
    "mean", "pitch", "right", "rock", "run", "scale", "set", "spring", "board", "date"
  ],
  phrase: [
    "look after", "give up", "take off", "run into", "carry out", "account for", "put up with", "get along with", "come across", "turn down",
    "figure out", "break down", "bring about", "point out", "rely on", "deal with", "set up", "take part in", "in charge of", "by and large"
  ],
  spelling: [
    "accomodate", "definately", "enviroment", "neccessary", "recieve", "seperate", "wierd", "colour", "centre", "realise"
  ],
  special: [
    "Beijing", "iPhone", "COVID-19", "e.g.", "Ph.D.", "24/7", "New York", "U.S.", "can't", "C++"
  ]
};

const EXPECTED_CORRECTIONS = new Map([
  ["accomodate", "accommodate"],
  ["definately", "definitely"],
  ["enviroment", "environment"],
  ["neccessary", "necessary"],
  ["recieve", "receive"],
  ["seperate", "separate"],
  ["wierd", "weird"]
]);

const ENTRY_KEYS = [
  "canonicalTerm",
  "category",
  "correctionPolicy",
  "expectedType",
  "id",
  "input",
  "requiredMeaningGroups"
].sort();

test("the gold dataset is explicitly public and contains exactly 100 cases", () => {
  assert.equal(dataset.schemaVersion, 1);
  assert.match(dataset.name, /100 项质量金标准/);
  assert.match(dataset.description, /公开、非个人测试数据/);
  assert.equal(dataset.entries.length, 100);
});

test("the five required categories have the exact agreed distribution and inputs", () => {
  assert.deepEqual(dataset.expectedCategoryCounts, EXPECTED_CATEGORY_COUNTS);

  const actualCounts = Object.fromEntries(Object.keys(EXPECTED_CATEGORY_COUNTS).map((category) => [
    category,
    dataset.entries.filter((entry) => entry.category === category).length
  ]));
  assert.deepEqual(actualCounts, EXPECTED_CATEGORY_COUNTS);

  for (const [category, expectedInputs] of Object.entries(EXPECTED_INPUTS)) {
    const actualInputs = dataset.entries.filter((entry) => entry.category === category).map((entry) => entry.input);
    assert.deepEqual(actualInputs, expectedInputs, `${category} inputs changed unexpectedly`);
  }
});

test("every case has only the non-personal gold fields and a unique identity", () => {
  const ids = new Set();
  const inputs = new Set();
  const canonicalTerms = new Set();

  for (const entry of dataset.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ENTRY_KEYS, `${entry.id} has an unexpected field`);
    assert.match(entry.id, /^(ordinary|polysemy|phrase|spelling|special)-\d{3}$/);
    assert.ok(!ids.has(entry.id), `duplicate id: ${entry.id}`);
    assert.ok(!inputs.has(entry.input), `duplicate input: ${entry.input}`);
    assert.ok(!canonicalTerms.has(entry.canonicalTerm), `duplicate canonical term: ${entry.canonicalTerm}`);
    ids.add(entry.id);
    inputs.add(entry.input);
    canonicalTerms.add(entry.canonicalTerm);
  }
});

test("canonical terms, expected types, and correction policies are internally consistent", () => {
  for (const entry of dataset.entries) {
    assert.equal(entry.input, entry.input.trim(), `${entry.id} input has surrounding whitespace`);
    assert.equal(entry.canonicalTerm, entry.canonicalTerm.trim(), `${entry.id} canonical term has surrounding whitespace`);
    assert.ok(["word", "phrase"].includes(entry.expectedType), `${entry.id} has an unsupported expectedType`);
    assert.ok(["preserve", "correct"].includes(entry.correctionPolicy), `${entry.id} has an unsupported correctionPolicy`);

    if (entry.correctionPolicy === "correct") {
      assert.equal(EXPECTED_CORRECTIONS.get(entry.input), entry.canonicalTerm, `${entry.id} is not an approved correction`);
    } else {
      assert.equal(entry.canonicalTerm, entry.input, `${entry.id} must preserve the supplied spelling and casing`);
    }

    if (entry.category === "phrase") assert.equal(entry.expectedType, "phrase");
    if (["ordinary", "polysemy", "spelling"].includes(entry.category)) assert.equal(entry.expectedType, "word");
  }

  assert.equal(dataset.entries.filter((entry) => entry.correctionPolicy === "correct").length, 7);
  assert.equal(dataset.entries.filter((entry) => entry.correctionPolicy === "preserve").length, 93);
});

test("every case defines reliable Chinese meaning alternatives", () => {
  for (const entry of dataset.entries) {
    assert.ok(Array.isArray(entry.requiredMeaningGroups) && entry.requiredMeaningGroups.length > 0, `${entry.id} has no required meaning group`);
    for (const group of entry.requiredMeaningGroups) {
      assert.ok(Array.isArray(group) && group.length > 0, `${entry.id} has an empty meaning group`);
      for (const alternative of group) {
        assert.equal(typeof alternative, "string");
        assert.equal(alternative, alternative.trim());
        assert.match(alternative, /\p{Script=Han}/u, `${entry.id} meaning must contain Chinese text`);
      }
    }
  }
});

test("the global garbage blocklist is present, unique, and absent from gold meanings", () => {
  assert.ok(Array.isArray(dataset.forbiddenText) && dataset.forbiddenText.length >= 8);
  const folded = dataset.forbiddenText.map((value) => value.toLocaleLowerCase("en-US"));
  assert.equal(new Set(folded).size, folded.length, "forbiddenText contains duplicates");

  const goldText = dataset.entries.flatMap((entry) => entry.requiredMeaningGroups.flat()).join("\n").toLocaleLowerCase("en-US");
  for (const forbidden of folded) {
    assert.ok(forbidden.trim().length >= 4, `forbidden fragment is too broad: ${forbidden}`);
    assert.ok(!goldText.includes(forbidden), `gold meanings contain forbidden text: ${forbidden}`);
  }
});
