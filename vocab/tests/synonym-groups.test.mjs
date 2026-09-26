import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSynonymGroups } from "../js/synonym-groups.js";

const snapshot = JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8"));
const byTerm = new Map(snapshot.entries.map((entry) => [entry.term, entry]));
const curatedPairs = [
  ["mystified", "bewildered"],
  ["pull somebody's leg", "have somebody on"],
  ["be for it", "be in hot water"],
  ["ambivalent", "be torn between A and B"],
  ["daft", "potty"]
];
const pairKey = (terms) => [...terms].sort().join(" | ");
const keys = (groups) => groups.map((group) => pairKey(group.members.map(({ entry }) => entry.term)));

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function lexical(term, synonyms = [], extra = {}) {
  return {
    id: `test-${term}`, term, standardForm: term, originalInput: term,
    entryType: "word", partOfSpeech: "adjective", meaning: "学习释义", definition: "A lexical test entry.",
    senses: [], synonyms, tags: [], ...extra
  };
}

test("trial groups use collected entries and explain each curated near-synonym pair", () => {
  const groups = buildSynonymGroups(snapshot.entries);
  const groupKeys = keys(groups);
  for (const pair of curatedPairs) assert.ok(groupKeys.includes(pairKey(pair)), `${pair.join(" / ")} must be grouped`);
  assert.equal(new Set(groups.map(({ id }) => id)).size, groups.length, "group IDs must be unique");
  assert.equal(new Set(groupKeys).size, groups.length, "reciprocal references must not duplicate pairs");
  const collected = new Set(snapshot.entries.map(({ id }) => id));
  for (const group of groups) {
    assert.ok(group.id && group.title && group.note, "each group needs a stable identity, heading, and limitation note");
    assert.equal(group.members.length, 2, "pair-level evidence must not be expanded into semantic clusters");
    for (const member of group.members) {
      assert.ok(collected.has(member.entry.id), "no unentered synonym may be generated");
      assert.ok(member.note, "member-specific distinctions must be visible");
    }
  }
});

test("grouping is a reversible display projection and never changes saved entries or review identity", () => {
  const source = structuredClone(snapshot.entries);
  const before = structuredClone(source);
  freezeDeep(source);
  const groups = buildSynonymGroups(source);
  assert.deepEqual(source, before);
  for (const group of groups) {
    for (const { entry } of group.members) {
      assert.deepEqual(entry, before.find(({ id }) => id === entry.id));
    }
  }
  assert.deepEqual(buildSynonymGroups(source), groups, "recomputing must be deterministic");
});

test("deleting either collected member removes its group without leaving ghost synonyms", () => {
  for (const [left, right] of curatedPairs) {
    const pair = [byTerm.get(left), byTerm.get(right)];
    assert.equal(buildSynonymGroups(pair).length, 1);
    assert.deepEqual(buildSynonymGroups(pair.slice(0, 1)), []);
    assert.deepEqual(buildSynonymGroups(pair.slice(1)), []);
  }
  assert.deepEqual(buildSynonymGroups([]), []);
});

test("curated matches require the collected meaning, not merely the same spelling", () => {
  for (const [left, right] of curatedPairs) {
    const changed = structuredClone(byTerm.get(left));
    changed.meaning = "完全不相关的义项";
    changed.definition = "An unrelated technical meaning.";
    changed.usage = "An unrelated context.";
    changed.senses = [];
    changed.readingContexts = [];
    changed.synonyms = [];
    assert.deepEqual(buildSynonymGroups([changed, byTerm.get(right)]), [], `${left} must not match by headword alone`);
  }
});

test("curated matches reject incompatible parts of speech even when old Chinese words remain", () => {
  for (const [left, right] of curatedPairs) {
    for (const [changedTerm, partnerTerm] of [[left, right], [right, left]]) {
      const changed = structuredClone(byTerm.get(changedTerm));
      changed.partOfSpeech = "noun";
      changed.senses = changed.senses.map((sense) => ({ ...sense, partOfSpeech: "noun" }));
      changed.readingContexts = [];
      changed.synonyms = [];
      assert.deepEqual(buildSynonymGroups([changed, byTerm.get(partnerTerm)]), [], `${changedTerm} must not match an incompatible noun sense`);
    }
  }
});

test("existing synonym references form direct collected pairs but never a transitive union", () => {
  const entries = [lexical("alpha", ["beta", "not-collected"]), lexical("beta", ["alpha", "gamma"]), lexical("gamma")];
  const groupKeys = keys(buildSynonymGroups(entries));
  assert.deepEqual(groupKeys.sort(), [pairKey(["alpha", "beta"]), pairKey(["beta", "gamma"])].sort());
  assert.ok(!groupKeys.includes(pairKey(["alpha", "gamma"])));
  assert.deepEqual(keys(buildSynonymGroups(entries.filter(({ term }) => term !== "beta"))), []);
});

test("direct synonym references resolve collected spelling, deduplicate reciprocals, and ignore self links", () => {
  const entries = [lexical("delicious", ["YUMMY", "yummy", "delicious"]), lexical("yummy", ["delicious"])];
  assert.deepEqual(keys(buildSynonymGroups(entries)), [pairKey(["delicious", "yummy"])]);
});

test("sentences, quotations, and proverbs cannot be smuggled into lexical synonym groups", () => {
  for (const entryType of ["sentence", "quote", "proverb"]) {
    assert.deepEqual(buildSynonymGroups([
      lexical("alpha", ["beta"]),
      lexical("beta", ["alpha"], { entryType })
    ]), []);
    assert.deepEqual(buildSynonymGroups([
      { ...byTerm.get("mystified"), entryType }, byTerm.get("bewildered")
    ]), []);
  }
});

test("a saved synonym reference cannot duplicate a curated pair", () => {
  const left = structuredClone(byTerm.get("mystified"));
  const right = structuredClone(byTerm.get("bewildered"));
  left.synonyms = [right.term];
  right.synonyms = [left.term];
  assert.equal(buildSynonymGroups([left, right]).length, 1);
});

test("same general topic does not make different meanings interchangeable", () => {
  const unrelatedPairs = [
    ["surveillance", "perspicacious"],
    ["crop", "bumper crop"],
    ["rile", "resentful"],
    ["flail", "shudder"]
  ];
  for (const pair of unrelatedPairs) {
    const entries = pair.map((term) => byTerm.get(term));
    assert.ok(entries.every(Boolean), `regression fixture exists: ${pair.join(" / ")}`);
    assert.deepEqual(buildSynonymGroups(entries), [], `${pair.join(" / ")} must not be grouped by loose association`);
  }
});
