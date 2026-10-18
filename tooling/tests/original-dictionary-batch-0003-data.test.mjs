import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOriginalDictionary, foldOriginalHeadword, lookupOriginalDictionary } from "../lib/original-dictionary.mjs";
import { loadOriginalCatalogue, originalContentHash } from "../lib/original-dictionary-catalogue.mjs";

const base = new URL("../dictionary/", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, base), "utf8"));
const plan = await read("batches/0003-plan.json");
const packs = {};
for (const group of ["verbs", "adjectives", "nouns"]) packs[group] = parseOriginalDictionary(await read(`source/batch-0003-${group}.json`));
const index = await read("source/index.json");
const oldFiles = index.sourceFiles.filter(file => !file.startsWith("batch-0003-"));
const oldPacks = await Promise.all(oldFiles.map(async file => parseOriginalDictionary(await read(`source/${file}`))));
const oldHeads = new Set(oldPacks.flatMap(pack => pack.entries.map(entry => foldOriginalHeadword(entry.headword))));

test("batch 0003 authors exactly 300 new heads once, with actual bilingual meanings and examples", () => {
  const seen = new Set(oldHeads);
  for (const [group, pack] of Object.entries(packs)) {
    assert.equal(pack.entries.length, 100);
    assert.deepEqual(pack.entries.map(entry => entry.headword), plan.groups[group]);
    for (const entry of pack.entries) {
      const key = foldOriginalHeadword(entry.headword);
      assert.ok(!seen.has(key), `${entry.headword} repeats a previously authored headword`);
      seen.add(key);
      assert.equal(entry.kind, "word");
      assert.equal(entry.review.status, "draft");
      assert.equal(entry.review.reviewer, "");
      for (const sense of entry.senses) {
        assert.match(sense.partOfSpeech, /[A-Za-z]/u);
        assert.match(sense.definitionZh, /\p{Script=Han}/u);
        assert.match(sense.definitionEn, /[A-Za-z]/u);
        assert.ok(sense.examples.length > 0);
        for (const example of sense.examples) {
          assert.match(example.zh, /\p{Script=Han}/u);
          assert.doesNotMatch(example.en, /\p{Script=Han}/u);
          assert.ok([entry.headword, ...entry.forms].some(form => new RegExp(`(?<![a-z])${form.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![a-z])`, "iu").test(example.en)), `${sense.id} needs an example using this word or a declared form`);
        }
      }
    }
  }
});

test("new example sentences are distinct from each other and from all earlier packs", () => {
  const seen = new Map();
  for (const pack of [...oldPacks, ...Object.values(packs)]) for (const entry of pack.entries) for (const sense of entry.senses) for (const example of sense.examples) {
    const key = example.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
    assert.ok(!seen.has(key), `${sense.id} duplicates ${seen.get(key)}`);
    seen.set(key, sense.id);
  }
});

test("all new source packs have current content-bound independent review before becoming checked", async () => {
  const result = await loadOriginalCatalogue();
  const expected = oldPacks.reduce((sum, pack) => sum + pack.entries.length, 0) + 300;
  assert.equal(result.pack.entries.length, expected);
  assert.ok(expected >= 630, "this batch's checkpoint includes at least 630 cards");
  for (const [group, pack] of Object.entries(packs)) {
    const review = await read(`reviews/batch-0003-${group}.json`);
    assert.equal(review.sourceContentSha256, originalContentHash(pack));
    assert.equal(review.independentOfAuthor, true);
    assert.equal(new Set(review.approvedEntryIds).size, 100);
    const item = result.reviewSummary.find(row => row.sourceFile === `batch-0003-${group}.json`);
    assert.equal(item.approved, 100);
    for (const entry of pack.entries) {
      const found = lookupOriginalDictionary(result.pack, entry.headword);
      assert.equal(found.status, "found");
      assert.equal(found.entries[0].id, entry.id);
      assert.equal(found.entries[0].review.status, "checked");
      assert.match(found.entries[0].review.reviewer, /^AI\//u);
    }
  }
});

test("ordinary grammar and easily confused meanings remain explicit rather than merged", () => {
  const find = word => Object.values(packs).flatMap(pack => pack.entries).find(entry => entry.headword === word);
  const hasPos = (word, pos) => find(word).senses.some(sense => sense.partOfSpeech.includes(pos));
  const basePos = sense => sense.partOfSpeech.toLowerCase().match(/^(?:auxiliary verb|noun|verb|adjective|adverb|determiner|pronoun)\b/u)?.[0] ?? sense.partOfSpeech;
  for (const word of ["do", "have"]) assert.ok(hasPos(word, "auxiliary"), `${word} needs its ordinary auxiliary use`);
  for (const word of ["light", "mean", "fine", "firm", "content", "contract", "fear", "field"]) assert.ok(new Set(find(word).senses.map(basePos)).size >= 2, word);
  assert.match(find("equipment").senses.map(sense => sense.definitionZh).join(" "), /不可数/u);
  assert.match(find("data").senses.map(sense => sense.definitionZh).join(" "), /数据/u);
  assert.ok(find("light").senses.some(sense => sense.partOfSpeech === "adjective" && /明亮|光线充足/u.test(sense.definitionZh)));
  assert.ok(find("mean").senses.some(sense => sense.partOfSpeech === "adjective" && /平均/u.test(sense.definitionZh)));
  assert.ok(find("first").forms.includes("firsts"));
  assert.doesNotMatch(find("loud").senses.find(sense => sense.partOfSpeech === "adverb").definitionZh, /read aloud/u);
  assert.ok(find("hang").forms.includes("hung"));
  assert.ok(find("get").forms.includes("got"));
  assert.ok(find("have").forms.includes("had"));
  const future = find("go").senses.filter(sense => /be going to/u.test(sense.definitionEn));
  assert.equal(future.length, 1, "one future construction must not become duplicate senses");
  assert.ok(future[0].examples.length >= 2, "show both intention and evidence-based prediction");
});
