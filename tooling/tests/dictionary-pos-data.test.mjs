import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyDictionaryPos } from "../lib/dictionary-pos.mjs";
import { generateDictionaryPos } from "../scripts/build-dictionary-pos.mjs";
import {verifyDictionarySourceRevisions} from '../lib/dictionary-source-revisions.mjs';
import {loadVerifiedSemanticRevision} from '../lib/dictionary-source-lineage.mjs';

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
  const [revisionPack,revisionIntegrity,revisionReview]=await Promise.all(['finite-grammar-0001.json',
    'finite-grammar-0001.integrity.json','finite-grammar-0001.review.json']
    .map(file=>read('../dictionary/source-revisions/'+file)));
  const revisions=verifyDictionarySourceRevisions(revisionPack,revisionIntegrity,revisionReview);
  const revised=new Map(revisions.pack.entries.map(entry=>[entry.term,entry]));
  const semantic=await loadVerifiedSemanticRevision(),semanticRevised=new Map(semantic.entries.map(entry=>[entry.term,entry]));
  let applied = 0,subsequentlyRevised=0,subsequentlySemantic=0;
  for (const descriptor of manifest.english.shards) {
    const shard = await read(`../../vocab/data/expanded-dictionary/${descriptor.file}`);
    for (const row of shard.records) {
      if (row.id % 128 !== descriptor.bucket || !['pos-reviewed','grammar-reviewed','semantic-editorial'].includes(row.source)) continue;
      const review = approved.get(row.term);
      assert.ok(review, row.term);
      if(row.source==='semantic-editorial'){
        const transition=semanticRevised.get(row.term);assert.ok(transition,row.term);assert.deepEqual(row,transition.after);
        assert.equal(transition.before.source,'pos-reviewed');assert.equal(transition.before.partOfSpeech,review.partOfSpeech);
        assert.equal(hash(transition.before.meaning),review.meaningSha256,'Original POS opinion still binds its original meaning');
        assert.ok(transition.before.variants.some(item=>item.source===review.baseSource&&item.meaning===transition.before.meaning&&!item.partOfSpeech.trim()));
        assert.deepEqual(row.seed,transition.before.seed);assert.deepEqual(row.forms,transition.before.forms);
        subsequentlySemantic++;continue;
      }
      if(row.source==='grammar-reviewed'){
        const transition=revised.get(row.term);assert.ok(transition,row.term);assert.deepEqual(row,transition.after);
        assert.equal(transition.before.partOfSpeech,review.partOfSpeech,'Old POS evidence must remain truthful');
        assert.deepEqual(row.seed,transition.before.seed);assert.deepEqual(row.variants,transition.before.variants);
        subsequentlyRevised++;
      }else{
        assert.equal(row.partOfSpeech, review.partOfSpeech, row.term);
        applied++;
      }
      assert.equal(hash(row.meaning), review.meaningSha256, row.term);
      assert.ok(row.variants.some(item => item.source === review.baseSource
        && item.meaning === row.meaning && !item.partOfSpeech.trim()), row.term);
    }
  }
  assert.equal(applied+subsequentlyRevised+subsequentlySemantic, audit.posReview.applied);
  assert.equal(subsequentlySemantic,5);
  assert.deepEqual(audit.posReview.supersededPosReviewedByStage,[
    {id:revisions.pack.id,count:4},{id:'future-pos-notation-three-0001',count:0},{id:semantic.authorityId,count:5}]);
  assert.deepEqual(manifest.sources['semantic-editorial'],{...semantic.source,sha256:semantic.candidateSha256});
  if(audit.sourceRevisions){
    assert.equal(subsequentlyRevised,4);assert.equal(audit.sourceRevisions.applied,4);
    assert.equal(audit.sourceRevisions.ledgerSha256,revisions.integrity.semanticSha256);
    assert.equal(audit.sourceRevisions.reviewSha256,revisions.integrity.reviewSemanticSha256);
    assert.equal(audit.posReview.subsequentlyRevised,subsequentlyRevised);assert.equal(audit.posReview.finalPosReviewed,applied);
    assert.deepEqual(manifest.sources['grammar-reviewed'],revisions.source);
  }else{
    assert.equal(subsequentlyRevised,0);assert.equal(audit.posReview.subsequentlyRevised,undefined);
    assert.equal(audit.posReview.finalPosReviewed,undefined);
  }
  assert.equal(audit.posReview.reviewedRows, integrity.rows);
  // Later owner edits/removals are legal: stale approvals are safely skipped,
  // not an excuse to overwrite the edit or freeze every future publication.
  assert.equal(audit.posReview.applied + audit.posReview.alreadyPresent
    + audit.posReview.baseMismatch + audit.posReview.missingTerms, integrity.rows);
  assert.equal(audit.posReview.skipped.length, audit.posReview.alreadyPresent
    + audit.posReview.baseMismatch + audit.posReview.missingTerms);
});
