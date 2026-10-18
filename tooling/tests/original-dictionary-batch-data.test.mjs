import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOriginalDictionary, lookupOriginalDictionary } from "../lib/original-dictionary.mjs";
import { loadOriginalCatalogue } from "../lib/original-dictionary-catalogue.mjs";

const directory = new URL("../dictionary/", import.meta.url);
const plan = JSON.parse(await readFile(new URL("batches/0002-plan.json", directory), "utf8"));
const packs = {};
for (const group of ["verbs", "adjectives", "nouns"]) {
  packs[group] = parseOriginalDictionary(JSON.parse(await readFile(new URL(`source/batch-0002-${group}.json`, directory), "utf8")));
}

test("each 0002 assignment contains exactly 100 real, fully written planned headwords", () => {
  for (const [group, pack] of Object.entries(packs)) {
    assert.equal(pack.entries.length, 100);
    assert.deepEqual(pack.entries.map(entry => entry.headword), plan.groups[group]);
    for (const entry of pack.entries) {
      assert.ok(entry.senses.length >= 1, entry.headword);
      assert.equal(entry.review.status, "draft", "authors cannot self-promote entries");
      assert.equal(entry.review.reviewer, "");
      for (const sense of entry.senses) {
        assert.match(sense.definitionZh, /\p{Script=Han}/u);
        assert.match(sense.definitionEn, /[A-Za-z]/u);
        assert.ok(sense.examples.length >= 1);
        for (const example of sense.examples) {
          assert.match(example.en, /[A-Za-z]/u); assert.match(example.zh, /\p{Script=Han}/u);
          assert.doesNotMatch(example.en, /\p{Script=Han}/u);
        }
      }
    }
  }
});

test("cumulative catalogue preserves the old 30 cards and adds 300 canonical cards without duplicates", async () => {
  const result = await loadOriginalCatalogue();
  assert.equal(result.pack.entries.length, 330);
  assert.equal(new Set(result.pack.entries.map(entry => entry.id)).size, 330);
  assert.equal(new Set(result.pack.entries.map(entry => entry.headword)).size, 330);
  for (const entry of result.pack.entries) {
    const match = lookupOriginalDictionary(result.pack, entry.headword);
    assert.equal(match.status, "found", entry.headword);
    assert.equal(match.entries[0].id, entry.id);
  }
  assert.equal(lookupOriginalDictionary(result.pack, "by some fluke").status, "found");
  assert.equal(lookupOriginalDictionary(result.pack, "unwritten_999").status, "missing");
});

test("newly written examples are not duplicated across separate senses or entries", () => {
  const seen = new Map();
  for (const pack of Object.values(packs)) for (const entry of pack.entries) for (const sense of entry.senses) for (const example of sense.examples) {
    const key = example.en.toLowerCase().replace(/\s+/gu, " ").trim();
    assert.ok(!seen.has(key), `${sense.id} repeats ${seen.get(key)}`); seen.set(key, sense.id);
  }
});

test("frequent false friends and polysemous words remain explicit separate senses", () => {
  const find = word => Object.values(packs).flatMap(pack => pack.entries).find(entry => entry.headword === word);
  assert.match(find("actual").senses.map(sense => sense.definitionZh).join(" "), /实际|真实/u);
  assert.match(find("current").senses.map(sense => sense.definitionZh).join(" "), /当前|目前|现行/u);
  assert.match(find("effective").senses.map(sense => sense.definitionZh).join(" "), /效果|有效|预期/u);
  assert.match(find("efficient").senses.map(sense => sense.definitionZh).join(" "), /效率|浪费|资源|时间/u);
  assert.ok(find("capital").senses.length >= 2);
  assert.ok(find("case").senses.length >= 2);
  assert.ok(find("charge").senses.length >= 2);
});
