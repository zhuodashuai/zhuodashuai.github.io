import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseOriginalDictionary, foldOriginalHeadword, lookupOriginalDictionary } from "../lib/original-dictionary.mjs";
import { loadOriginalCatalogue, originalContentHash } from "../lib/original-dictionary-catalogue.mjs";

const base = new URL("../dictionary/", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, base), "utf8"));
const plan = await read("batches/0005-plan.json");
const packs = {};
for (const group of ["a", "b"]) packs[group] = parseOriginalDictionary(await read(`source/batch-0005-${group}.json`));
const index = await read("source/index.json");
const earlier = await Promise.all(index.sourceFiles.filter(file => !file.startsWith("batch-0005-")).map(async file => parseOriginalDictionary(await read(`source/${file}`))));
const entries = Object.values(packs).flatMap(pack => pack.entries);
const find = word => entries.find(entry => entry.headword === word);

test("PDF-headword batch 0005 contains exactly100 new fully written heads, not publisher text or a word-only queue", () => {
  assert.equal(plan.selectionEvidence.kind, "supplied-pdf-visual-headwords-only");
  assert.equal(plan.selectionEvidence.fullBookCoverageVerified, false);
  assert.equal(plan.selectionEvidence.publisherDefinitionsAndExamplesPassedToAuthors, false);
  assert.equal(plan.selectionEvidence.sourceSha256, "9c350979054282441e21bbdfc441f3c8fd63d3c777872d5b6300470c917f8cb0");
  assert.deepEqual(plan.selectionEvidence.physicalPagesInspected, [1500,1501,1502,1503,1504,1505,1506,1507,1508,1509]);
  const seen = new Set(earlier.flatMap(pack => pack.entries.map(entry => foldOriginalHeadword(entry.headword))));
  for (const [group, pack] of Object.entries(packs)) {
    assert.equal(pack.entries.length, 50);
    assert.deepEqual(pack.entries.map(entry => entry.headword), plan.groups[group]);
    for (const entry of pack.entries) {
      const key = foldOriginalHeadword(entry.headword);
      assert.ok(!seen.has(key), `${key} repeats an existing head`);
      seen.add(key);
      assert.equal(entry.kind, "word");
      assert.deepEqual([entry.review.status, entry.review.reviewer], ["draft", ""]);
      for (const sense of entry.senses) {
        assert.match(sense.definitionZh, /\p{Script=Han}/u);
        assert.match(sense.definitionEn, /[A-Za-z]/u);
        assert.doesNotMatch(sense.definitionZh, /TODO|TBD|待补充|未编写/iu);
        for (const example of sense.examples) {
          assert.match(example.zh, /\p{Script=Han}/u);
          assert.ok([entry.headword, ...entry.forms].some(form => new RegExp(`(?<![a-z])${form.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![a-z])`, "iu").test(example.en)), sense.id);
        }
      }
    }
  }
});

test("batch0005 original English examples never duplicate the earlier corpus or each other", () => {
  const seen = new Set();
  for (const pack of [...earlier, ...Object.values(packs)]) for (const entry of pack.entries) for (const sense of entry.senses) for (const example of sense.examples) {
    const key = example.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
    assert.ok(!seen.has(key), `${sense.id} repeats an English sentence`);
    seen.add(key);
  }
});

test("both new packs have current independent review evidence and preserve all earlier canonical cards", async () => {
  const result = await loadOriginalCatalogue();
  const expected = earlier.reduce((sum, pack) => sum + pack.entries.length, 0) + 100;
  assert.equal(result.pack.entries.length, expected);
  assert.ok(expected >= 1030);
  const all = new Map(result.pack.entries.map(entry => [entry.id, entry]));
  for (const pack of earlier) for (const entry of pack.entries) assert.deepEqual(all.get(entry.id), { ...entry, review: all.get(entry.id).review });
  for (const [group, pack] of Object.entries(packs)) {
    const review = await read(`reviews/batch-0005-${group}.json`);
    assert.equal(review.sourceContentSha256, originalContentHash(pack));
    assert.equal(review.independentOfAuthor, true);
    assert.deepEqual([...review.approvedEntryIds].sort(), pack.entries.map(entry => entry.id).sort());
    for (const entry of pack.entries) {
      const found = lookupOriginalDictionary(result.pack, entry.headword);
      assert.equal(found.status, "found");
      assert.equal(found.entries[0].id, entry.id);
      assert.equal(found.entries[0].review.status, "checked");
    }
  }
});

test("irregular prefixed verbs, lexical plural and outward variant do not become duplicate cards", () => {
  for (const [word, forms] of Object.entries({ override:["overrode","overridden"], outrun:["outran"], outshine:["outshone"], overdo:["overdid","overdone"], overeat:["overate","overeaten"], overhang:["overhung"], overlay:["overlaid"], ovary:["ovaries"] })) {
    for (const form of forms) assert.ok(find(word).forms.includes(form), `${word}: ${form}`);
  }
  assert.ok(find("outward").forms.includes("outwards"));
  assert.ok(!find("outwards"));
  assert.match(find("outskirts").senses[0].partOfSpeech, /plural/iu);
  for (const word of ["outside", "over"]) assert.ok(new Set(find(word).senses.map(sense => sense.partOfSpeech.split(" ")[0])).size >= 3, word);
  assert.ok(find("outpatient").senses.some(sense => sense.partOfSpeech === "adjective"));
});
