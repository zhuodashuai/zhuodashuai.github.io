import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOriginalDictionary, foldOriginalHeadword, lookupOriginalDictionary } from "../lib/original-dictionary.mjs";
import { loadOriginalCatalogue, originalContentHash } from "../lib/original-dictionary-catalogue.mjs";

const base = new URL("../dictionary/", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, base), "utf8"));
const plan = await read("batches/0004-plan.json");
const packs = {};
for (const group of ["verbs", "adjectives", "nouns"]) packs[group] = parseOriginalDictionary(await read(`source/batch-0004-${group}.json`));
const index = await read("source/index.json");
const earlierFiles = index.sourceFiles.filter(file => !file.startsWith("batch-0004-"));
const earlierPacks = await Promise.all(earlierFiles.map(async file => parseOriginalDictionary(await read(`source/${file}`))));
const find = word => Object.values(packs).flatMap(pack => pack.entries).find(entry => entry.headword === word);
const basePos = sense => sense.partOfSpeech.toLowerCase().match(/^(?:auxiliary verb|noun|verb|adjective|adverb|determiner|pronoun|quantifier)\b/u)?.[0] ?? sense.partOfSpeech;

test("batch 0004 contains exactly 300 planned new heads with complete meanings and actual examples", () => {
  const seen = new Set(earlierPacks.flatMap(pack => pack.entries.map(entry => foldOriginalHeadword(entry.headword))));
  for (const [group, pack] of Object.entries(packs)) {
    assert.equal(pack.entries.length, 100);
    assert.deepEqual(pack.entries.map(entry => entry.headword), plan.groups[group]);
    for (const entry of pack.entries) {
      const key = foldOriginalHeadword(entry.headword);
      assert.ok(!seen.has(key), `${entry.headword} repeats an existing head`);
      seen.add(key);
      assert.equal(entry.kind, "word");
      assert.deepEqual([entry.review.status, entry.review.reviewer], ["draft", ""]);
      for (const sense of entry.senses) {
        assert.match(sense.definitionZh, /\p{Script=Han}/u);
        assert.match(sense.definitionEn, /[A-Za-z]/u);
        assert.doesNotMatch(sense.definitionZh, /TODO|TBD|待补充|未编写/iu);
        assert.ok(sense.examples.length > 0);
        for (const example of sense.examples) {
          assert.match(example.zh, /\p{Script=Han}/u);
          assert.doesNotMatch(example.en, /\p{Script=Han}/u);
          assert.ok([entry.headword, ...entry.forms].some(form => new RegExp(`(?<![a-z])${form.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![a-z])`, "iu").test(example.en)), `${sense.id} needs its word or a declared form`);
        }
      }
    }
  }
});

test("all batch-0004 English examples are distinct from each other and all previous writing", () => {
  const seen = new Map();
  for (const pack of [...earlierPacks, ...Object.values(packs)]) for (const entry of pack.entries) for (const sense of entry.senses) for (const example of sense.examples) {
    const key = example.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
    assert.ok(!seen.has(key), `${sense.id} repeats ${seen.get(key)}`);
    seen.set(key, sense.id);
  }
});

test("batch 0004 review evidence is current and earlier canonical cards survive the cumulative merge", async () => {
  const result = await loadOriginalCatalogue();
  const expected = earlierPacks.reduce((sum, pack) => sum + pack.entries.length, 0) + 300;
  assert.equal(result.pack.entries.length, expected);
  assert.ok(expected >= 930);
  const allById = new Map(result.pack.entries.map(entry => [entry.id, entry]));
  for (const pack of earlierPacks) for (const entry of pack.entries) {
    const actual = allById.get(entry.id);
    assert.ok(actual);
    assert.deepEqual(actual, { ...entry, review: actual.review });
  }
  for (const [group, pack] of Object.entries(packs)) {
    const review = await read(`reviews/batch-0004-${group}.json`);
    assert.equal(review.sourceContentSha256, originalContentHash(pack));
    assert.equal(review.independentOfAuthor, true);
    assert.deepEqual([...review.approvedEntryIds].sort(), pack.entries.map(entry => entry.id).sort());
    for (const entry of pack.entries) {
      const found = lookupOriginalDictionary(result.pack, entry.headword);
      assert.equal(found.status, "found");
      assert.equal(found.entries[0].id, entry.id);
      assert.equal(found.entries[0].review.status, "checked");
      assert.match(found.entries[0].review.reviewer, /^AI\//u);
    }
  }
});

test("important irregular forms, cross-POS uses and uncountable nouns remain explicit", () => {
  const lie = find("lie");
  for (const form of ["lay", "lain", "lied", "lying"]) assert.ok(lie.forms.includes(form));
  assert.ok(!lie.forms.includes("lays"), "lays is not a form of lie");
  assert.ok(lie.senses.some(sense => /躺|平放/u.test(sense.definitionZh)));
  assert.ok(lie.senses.some(sense => /说谎|谎言/u.test(sense.definitionZh)));
  assert.ok(find("lead").forms.includes("led"));
  assert.ok(find("half").forms.includes("halves"));
  assert.ok(find("foot").forms.includes("feet"));
  for (const word of ["information", "knowledge", "guidance"]) assert.match(find(word).senses.map(sense => sense.definitionZh).join(" "), /不可数/u);
  for (const word of ["lead", "present", "patient", "pretty", "right", "sound", "house", "key", "level"]) assert.ok(new Set(find(word).senses.map(basePos)).size >= 2, word);
  assert.match(find("practise").senses.map(sense => sense.definitionZh).join(" "), /practice/u);
  assert.ok(find("several").senses.some(sense => ["determiner", "quantifier", "pronoun"].includes(basePos(sense))), "the ordinary quantity use needs its own appropriate label");
});
