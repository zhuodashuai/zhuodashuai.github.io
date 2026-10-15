import assert from "node:assert/strict";
import test from "node:test";
import { candidateSynonymFingerprint, indexSynonymFingerprints } from "../js/synonym-evidence.js";

const word = (id) => ({ id, term: id, entryType: "word", meaning: "测试义项", definition: "A test meaning.", senses: [] });

test("indexed candidate stamps keep the existing trust format for every excluded source", () => {
  const entries = [word("alpha"), word("beta"), { ...word("quote"), entryType: "quote" }];
  const before = structuredClone(entries);
  const index = indexSynonymFingerprints(entries);
  for (const entry of entries) {
    assert.equal(index.candidateFingerprint(entry.id), candidateSynonymFingerprint(entries.filter((value) => value.id !== entry.id)));
  }
  assert.deepEqual(entries, before);
});

test("relation-only snapshots reuse stamps while meaning edits, additions and deletions invalidate them", () => {
  const entries = [word("alpha"), word("beta")];
  const initial = indexSynonymFingerprints(entries);
  const first = initial.candidateFingerprint("alpha");
  const relationUpdate = entries.map((entry) => ({ ...entry, revision: 9, updatedAt: "later", synonymScan: { status: "complete" } })).reverse();
  const refreshed = indexSynonymFingerprints(relationUpdate, initial);
  assert.equal(refreshed.candidates, initial.candidates);
  assert.equal(refreshed.candidateFingerprint("alpha"), first);
  const edited = indexSynonymFingerprints([entries[0], { ...entries[1], meaning: "改过的义项" }], refreshed);
  assert.notEqual(edited.candidates, refreshed.candidates);
  assert.notEqual(edited.candidateFingerprint("alpha"), first);
  const removed = indexSynonymFingerprints([entries[0]], refreshed);
  assert.notEqual(removed.candidateFingerprint("alpha"), first);
  const added = indexSynonymFingerprints([...entries, word("gamma")], refreshed);
  assert.notEqual(added.candidateFingerprint("alpha"), first);
});

test("all candidate labels reuse the entry semantic hashes instead of reading every entry repeatedly", () => {
  let semanticReads = 0;
  const entries = Array.from({ length: 100 }, (_, index) => new Proxy(word(`word-${index}`), {
    get(target, property) { if (property === "meaning") semanticReads += 1; return target[property]; }
  }));
  const index = indexSynonymFingerprints(entries);
  assert.equal(semanticReads, entries.length);
  for (const entry of entries) index.candidateFingerprint(entry.id);
  for (const entry of entries) index.candidateFingerprint(entry.id);
  assert.equal(semanticReads, entries.length, "candidate checks must not rehash the full semantic entries");
});
