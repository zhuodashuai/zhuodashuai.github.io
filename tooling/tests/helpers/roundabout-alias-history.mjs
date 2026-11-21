import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../../vocab/js/everyday-lookup-data.js';

const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const folder=new URL('../../dictionary/everyday-expansions/2026-11-20-common-followup/',import.meta.url);
const sourceBytes=await readFile(new URL('roundabout-alias-source-v2.json',folder));
const reviewBytes=await readFile(new URL('roundabout-alias-review-v2.json',folder));
assert.equal(hash(sourceBytes),'14b3ac625d38786ec614b5ba02aae589354c15c20cd6c47b9d02ef5da5849e11');
assert.equal(hash(reviewBytes),'749e0f3967c5dbeedc87209fdafd026bd32bba0a961a73a482a3a49b7c95568a');
const source=JSON.parse(sourceBytes),review=JSON.parse(reviewBytes);
assert.equal(review.sourceByteSha256,hash(sourceBytes));assert.equal(review.sourceSha256,hash(source));
assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,source.author);assert.deepEqual(review.issues,[]);
assert.deepEqual(source.newAliasRow,{term:'roundabout',aliases:['环岛路口'],targetEntrySha256:'65a6675a35eca4785fe6ec54d5db727e8ade24ce8827f1544f249cb819397961'});
assert.equal(hash(source.newAliasRow),'3da421d72494af48f2d1e8aea2be13e127aed3b638dafddf0d5469a3d3cd12b4');
assert.equal(review.approvedAliasRows.length,1);
assert.deepEqual(review.approvedAliasRows[0].row,source.newAliasRow);
assert.equal(review.approvedAliasRows[0].languageDecision,'PASS');
const target=EVERYDAY_LOOKUP_ENTRIES.filter(row=>row.term==='roundabout');assert.equal(target.length,1);
assert.deepEqual(target[0],source.target.fullExistingRow);
assert.equal(hash(target[0]),'65a6675a35eca4785fe6ec54d5db727e8ade24ce8827f1544f249cb819397961');
assert.equal(review.approvedAliasRows[0].targetEntrySha256,hash(target[0]));

// Preserve the complete old47 golden. Only one independently approved final
// alias row can be inverted; a head-only match or partial row grants nothing.
export function historicalRoundaboutAliases47(rows){
  if(rows.length===47){assert.equal(hash(rows),source.oldAliases.sha256);return rows;}
  assert.equal(rows.length,48);assert.deepEqual(rows[47],source.newAliasRow);
  assert.equal(hash(rows),source.proposedAliases.sha256);
  const old=rows.slice(0,47);assert.equal(hash(old),'9625af76bacc7ed9d96029e4ba3722cc5d3b3492e577dae1d922d64051bafa5f');return old;
}
