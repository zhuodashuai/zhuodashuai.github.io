import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadOriginalCatalogue, mergeOriginalPacks, originalContentHash, validateOriginalReview } from "../lib/original-dictionary-catalogue.mjs";

const pilot = JSON.parse(await readFile(new URL("../dictionary/source/original-pilot.json", import.meta.url), "utf8"));
const source = () => structuredClone({ ...pilot, entries: [pilot.entries[0]] });
const review = pack => ({ schemaVersion: 1, sourceFile: "one.json", sourceContentSha256: originalContentHash(pack),
  reviewer: "AI/independent-reviewer", reviewerKind: "AI", independentOfAuthor: true,
  approvedEntryIds: pack.entries.map(entry => entry.id), issues: [], scope: "selected-common-senses-only", note: "AI review, not human review." });

test("review hashes bind semantic content, not whitespace or a review status label", () => {
  const pack = source(); const hash = originalContentHash(pack);
  pack.entries[0].review = { status: "checked", reviewer: "someone", note: "changed metadata" };
  assert.equal(originalContentHash(pack), hash);
  pack.entries[0].senses[0].definitionZh += "补充内容。";
  assert.notEqual(originalContentHash(pack), hash);
});

test("stale review, unrelated IDs and author-self-review labels fail closed", () => {
  const pack = source(); const approved = review(pack);
  assert.equal(validateOriginalReview(approved, pack, "one.json").approved.size, 1);
  for (const change of [value => { value.sourceContentSha256 = "0".repeat(64); }, value => { value.approvedEntryIds.push("unrelated"); },
    value => { value.approvedEntryIds.push(value.approvedEntryIds[0]); }, value => { value.independentOfAuthor = false; },
    value => { value.publisherDefinition = "unexpected"; }]) {
    const changed = structuredClone(approved); change(changed);
    assert.throws(() => validateOriginalReview(changed, pack, "one.json"));
  }
});

test("an unresolved blocking issue cannot be relabelled approved", () => {
  const pack = source(); const checked = review(pack);
  checked.issues.push({ entryId: pack.entries[0].id, severity: "blocking", problem: "Meaning mismatch", resolution: "" });
  assert.throws(() => validateOriginalReview(checked, pack, "one.json"), /Unresolved blocking/u);
});

test("source merge rejects repeated canonical cards and ID collisions", () => {
  const pack = source();
  assert.throws(() => mergeOriginalPacks([pack, pack]), /Repeated canonical/u);
  const second = source(); second.entries[0].headword = "other";
  assert.throws(() => mergeOriginalPacks([pack, second]), /duplicate identifier/u);
  const rest = structuredClone({ ...pilot, entries: pilot.entries.slice(1) });
  assert.equal(mergeOriginalPacks([pack, rest]).entries.length, pilot.entries.length);
});

test("catalogue defaults to unapproved when evidence is missing, and rejects stale evidence", async t => {
  const parent = await mkdtemp(resolve(tmpdir(), "zhuo-catalogue-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const reviews = resolve(parent, "reviews"); await mkdir(reviews);
  const indexPath = resolve(parent, "index.json");
  await writeFile(indexPath, JSON.stringify({ schemaVersion: 1, name: "卓式词典", sourceFiles: ["one.json"] }));
  const pack = source(); pack.entries[0].review = { status: "checked", reviewer: "author", note: "not independent" };
  await writeFile(resolve(parent, "one.json"), JSON.stringify(pack));
  const missing = await loadOriginalCatalogue({ indexPath, reviewDirectory: reviews });
  assert.equal(missing.pack.entries[0].review.status, "draft");
  assert.equal(missing.reviewSummary[0].state, "review-missing");
  await writeFile(resolve(reviews, "one.json"), JSON.stringify(review(pack)));
  const checked = await loadOriginalCatalogue({ indexPath, reviewDirectory: reviews });
  assert.equal(checked.pack.entries[0].review.status, "checked");
  assert.equal(checked.pack.entries[0].review.reviewer, "AI/independent-reviewer");
  pack.entries[0].senses[0].examples[0].en = "A changed original example needs another review.";
  await writeFile(resolve(parent, "one.json"), JSON.stringify(pack));
  await assert.rejects(loadOriginalCatalogue({ indexPath, reviewDirectory: reviews }), /stale/u);
});

test("catalogue source paths cannot escape their declared directory", async t => {
  const parent = await mkdtemp(resolve(tmpdir(), "zhuo-catalogue-path-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const indexPath = resolve(parent, "index.json");
  await writeFile(indexPath, JSON.stringify({ schemaVersion: 1, name: "卓式词典", sourceFiles: ["../private.json"] }));
  await assert.rejects(loadOriginalCatalogue({ indexPath }), /Invalid original source/u);
});
