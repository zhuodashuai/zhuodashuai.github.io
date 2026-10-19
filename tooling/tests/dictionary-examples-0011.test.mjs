import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadExampleBuild, validateExampleReview } from "../scripts/build-dictionary-examples.mjs";

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const BASELINE = "86793aa2a3f461ced05debe8936b72fc984b65574fc605e48b2476373036cc5b";

test("batch 0011 preserves all 20,008 released example heads and 21,397 bilingual pairs exactly", async () => {
  const build = await loadExampleBuild(), current = new Map(build.entries.map(row => [row.term, row]));
  let heads = 0, examples = 0;
  for (let bucket = 0; bucket < 256; bucket++) {
    const shard = await json(`../../vocab/data/dictionary-examples/${BASELINE}/examples-${bucket}.json`);
    for (const row of shard.entries) {
      assert.deepEqual(current.get(row.term), row, row.term);
      heads++; examples += row.senses.reduce((sum, sense) => sum + sense.examples.length, 0);
    }
  }
  assert.equal(heads, 20008); assert.equal(examples, 21397);
});

test("every queued batch 0011 head is independently approved or explicitly deferred, never silently counted", async () => {
  const queue = await json("../dictionary/examples/queues/batch-0011.json");
  const outcome = await json("../dictionary/examples/queues/batch-0011-outcome.json");
  assert.equal(queue.schemaVersion, 1); assert.equal(outcome.schemaVersion, 1);
  assert.equal(queue.sourceDictionaryVersion, "b0197460b31c1edd2c98edcd70273e4d70a8357b600d0c5c29a21e601a407e34");
  assert.equal(queue.baselineExampleVersion, BASELINE);
  assert.equal(queue.batches.length, 6);
  const build = await loadExampleBuild(), current = new Map(build.entries.map(row => [row.term, row]));
  const queued = new Set(), written = new Set(), approved = new Set(), sentences = new Set();
  const deferred = new Map(outcome.deferred.map(row => [row.term, row]));
  assert.equal(deferred.size, outcome.deferred.length);
  for (const [index, part] of [..."abcdef"].entries()) {
    const expected = queue.batches[index], file = `batch-0011-${part}.json`;
    assert.equal(expected.batchId, `examples-0011-${part}`); assert.equal(expected.terms.length, 200);
    for (const term of expected.terms) { assert.ok(!queued.has(term), term); queued.add(term); }
    const pack = await json(`../dictionary/examples/source/${file}`);
    const review = await json(`../dictionary/examples/reviews/${file}`);
    assert.equal(pack.batchId, expected.batchId);
    const reviewer = "ab".includes(part) ? "c" : "cd".includes(part) ? "a" : "b";
    assert.equal(review.reviewer, `AI/examples11_${reviewer}`);
    const accepted = validateExampleReview(pack, review), acceptedTerms = new Set(accepted.map(row => row.term));
    const actualTerms = new Set(pack.entries.map(row => row.term));
    assert.deepEqual(pack.entries.map(row => row.term), expected.terms.filter(term => actualTerms.has(term)));
    for (const row of pack.entries) {
      assert.ok(!written.has(row.term), row.term); written.add(row.term);
      if (!acceptedTerms.has(row.term)) assert.ok(deferred.has(row.term), `Unexplained rejection: ${row.term}`);
    }
    for (const row of accepted) {
      assert.ok(!deferred.has(row.term), `Deferred head approved: ${row.term}`);
      assert.ok(!approved.has(row.term), row.term); approved.add(row.term);
      const sentence = row.en.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
      assert.ok(!sentences.has(sentence), `Repeated sentence: ${row.term}`); sentences.add(sentence);
      assert.ok(row.en.split(/\s+/u).length >= 5 && row.en.split(/\s+/u).length <= 30, row.term);
      assert.doesNotMatch(row.en, /\b(?:this word means|the word means|an example of this word)\b/iu);
      const entry = current.get(row.term); assert.ok(entry, row.term); assert.equal(entry.senses.length, 1);
      const sense = entry.senses[0];
      assert.equal(sense.partOfSpeech, row.partOfSpeech); assert.equal(sense.meaningZh, row.meaningZh);
      assert.equal(sense.reviewer, review.reviewer); assert.deepEqual(sense.examples, [{ en: row.en, zh: row.zh }]);
    }
  }
  for (const [term, row] of deferred) {
    assert.ok(queued.has(term), `Unqueued deferral: ${term}`);
    assert.equal(typeof row.reason, "string"); assert.ok(row.reason.trim());
    // A later independently reviewed batch may resolve a head, but this batch's
    // explicit rejection cannot be published by merely changing the total.
    assert.ok(!approved.has(term));
    if (!written.has(term)) assert.equal(row.stage, "authoring");
  }
  assert.equal(queued.size, 1200);
  assert.equal(approved.size + deferred.size, queued.size);
  assert.equal(outcome.approvedHeads, approved.size); assert.equal(outcome.authoredHeads, written.size);
  assert.equal(outcome.queuedHeads, queued.size);
  assert.ok(build.manifest.counts.heads >= 20008 + approved.size);
  assert.ok(build.manifest.counts.examples >= 21397 + approved.size);
});
