import assert from "node:assert/strict";
import test from "node:test";
import { buildSynonymGroups, synonymGroupsForEntry } from "../js/synonym-groups.js";
import { entrySynonymFingerprint, candidateSynonymFingerprint, pendingSynonymScan } from "../js/synonym-evidence.js";

function word(term, meaning = "美味的") {
  return { id: term, term, standardForm: term, entryType: "word", partOfSpeech: "adjective", meaning,
    definition: "Having a pleasant taste.", senses: [], readingContexts: [], forms: [], confusedWith: [], synonyms: [] };
}
function recognized(source, targets) {
  return { ...source, synonymScan: { ...pendingSynonymScan(source, targets, "2026-09-26T00:00:00.000Z"), status: "complete", reason: "",
    matches: targets.map((target) => ({ targetId: target.id, targetFingerprint: entrySynonymFingerprint(target), note: "均指食物好吃；语体不同。" })) } };
}

test("automatic recognition has no headword allowlist and new links update both old and new cards", () => {
  const delicious = word("delicious"), yummy = word("yummy"), palatable = word("palatable");
  let entries = [delicious, recognized(yummy, [delicious])];
  assert.equal(buildSynonymGroups(entries).length, 1);
  assert.equal(synonymGroupsForEntry(delicious, entries).length, 1);
  entries.push(recognized(palatable, [delicious, yummy]));
  assert.equal(buildSynonymGroups(entries).length, 3);
  for (const entry of entries) assert.equal(synonymGroupsForEntry(entry, entries).length, 2);
  assert.equal(entries.length, 3);
  assert.ok(entries.every((entry) => entry.synonyms.length === 0), "read-only relations need no reciprocal data rewrites");
});

test("deleted, renamed and semantically changed endpoints invalidate automatic evidence", () => {
  const a = word("delicious"), b = recognized(word("yummy"), [a]);
  assert.equal(buildSynonymGroups([b]).length, 0);
  assert.equal(buildSynonymGroups([{ ...a, term: "acoustic" }, b]).length, 0);
  assert.equal(buildSynonymGroups([{ ...a, meaning: "可接受的（提议）" }, b]).length, 0);
  assert.equal(buildSynonymGroups([a, { ...b, partOfSpeech: "noun" }]).length, 0);
});

test("pending results never create false matches and one pair does not imply transitive synonymy", () => {
  const a = word("alpha"), b = recognized(word("beta"), [a]), c = recognized(word("gamma"), [b]);
  assert.equal(buildSynonymGroups([a, b, c]).length, 2);
  assert.equal(buildSynonymGroups([a, { ...b, synonymScan: { ...b.synonymScan, status: "pending" } }]).length, 0);
  const before = structuredClone([a, b, c]);
  buildSynonymGroups([a, b, c]);
  assert.deepEqual([a, b, c], before);
});

test("semantic stamps ignore review/dates/relations but cover senses and chapter meanings", () => {
  const a = word("hip", "时髦的");
  const first = entrySynonymFingerprint(a);
  assert.equal(first, entrySynonymFingerprint({ ...a, revision: 2, updatedAt: "later", synonyms: ["stylish"], synonymScan: {} }));
  assert.notEqual(first, entrySynonymFingerprint({ ...a, readingContexts: [{ meaning: "髋部" }] }));
  assert.notEqual(first, entrySynonymFingerprint({ ...a, senses: [{ meaningZh: "髋部" }] }));
  assert.equal(candidateSynonymFingerprint([a, word("yummy")]), candidateSynonymFingerprint([word("yummy"), a]));
});

test("context-specific cards fail closed rather than carrying a different chapter's sense", () => {
  const hip = word("hip", "时髦的"), stylish = recognized(word("stylish", "时髦的"), [hip]);
  assert.equal(synonymGroupsForEntry({ ...hip, meaning: "髋部" }, [hip, stylish]).length, 0);
  assert.equal(synonymGroupsForEntry(hip, [hip, stylish]).length, 1);
  const sameChapterDisplay = { ...hip, senses: [{ meaningZh: hip.meaning }], usage: "本章语境说明" };
  assert.equal(synonymGroupsForEntry(sameChapterDisplay, [hip, stylish]).length, 1, "same meaning's reconstructed chapter display retains its valid relation");
});
