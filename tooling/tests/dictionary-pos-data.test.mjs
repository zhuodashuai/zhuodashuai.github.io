import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyDictionaryPos } from "../lib/dictionary-pos.mjs";
import { generateDictionaryPos } from "../scripts/build-dictionary-pos.mjs";

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const pack = await read("../dictionary/pos/pos-completion-2026-10-19.json");
const integrity = await read("../dictionary/pos/integrity.json");
const hash = value => createHash("sha256").update(value).digest("hex");

test("shipped POS approvals and editorial records retain their independent evidence fingerprints", async () => {
  verifyDictionaryPos(pack, integrity);
  const editorialBytes = await readFile(new URL("../dictionary/pos/editorial-review.json", import.meta.url));
  assert.equal(hash(editorialBytes), pack.sources.editorial.sha256);
  const editorial = JSON.parse(editorialBytes);
  const approved = new Map(pack.entries.map(row => [row.term, row]));
  for (const row of editorial.entries) {
    assert.equal(approved.get(row.term)?.partOfSpeech, row.partOfSpeech, row.term);
    assert.ok(approved.get(row.term).evidence.some(item => item.source === "editorial"), row.term);
  }
  assert.equal(new Set(editorial.entries.map(row => row.term)).size, editorial.entries.length);
  await generateDictionaryPos({ check: true });
});

test("every applied shipped label matches an approved original meaning and retains its original source row", async () => {
  const manifest = await read("../../vocab/data/expanded-dictionary/manifest.json");
  const audit = await read("../../vocab/data/expanded-dictionary/source-audit.json");
  const approved = new Map(pack.entries.map(row => [row.term, row]));
  let applied = 0;
  for (const descriptor of manifest.english.shards) {
    const shard = await read(`../../vocab/data/expanded-dictionary/${descriptor.file}`);
    for (const row of shard.records) {
      if (row.id % 128 !== descriptor.bucket || row.source !== "pos-reviewed") continue;
      const review = approved.get(row.term);
      assert.ok(review, row.term);
      assert.equal(row.partOfSpeech, review.partOfSpeech, row.term);
      assert.equal(hash(row.meaning), review.meaningSha256, row.term);
      assert.ok(row.variants.some(item => item.source === review.baseSource
        && item.meaning === row.meaning && !item.partOfSpeech.trim()), row.term);
      applied++;
    }
  }
  assert.equal(applied, audit.posReview.applied);
  assert.equal(audit.posReview.reviewedRows, integrity.rows);
  // Later owner edits/removals are legal: stale approvals are safely skipped,
  // not an excuse to overwrite the edit or freeze every future publication.
  assert.equal(audit.posReview.applied + audit.posReview.alreadyPresent
    + audit.posReview.baseMismatch + audit.posReview.missingTerms, integrity.rows);
  assert.equal(audit.posReview.skipped.length, audit.posReview.alreadyPresent
    + audit.posReview.baseMismatch + audit.posReview.missingTerms);
});
