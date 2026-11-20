import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {historicalAeroEveryday1290,historicalAeroAudit} from './aero-source-history.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const directory=new URL('../../dictionary/everyday-expansions/2026-11-20-common-followup/',import.meta.url);
const sourceBytes=await readFile(new URL('source.json',directory)),reviewBytes=await readFile(new URL('review.json',directory));
const baselineBytes=await readFile(new URL('baseline.json',directory));
assert.equal(hash(sourceBytes),'1bce7c5556830ffe4a1250a9dc8ecf08264d455ec36cc0ec976976af2adc259b');
assert.equal(hash(reviewBytes),'00f6e31e9391b0f8dc8d9b3c6e165f26f783ef50855825c8f579ddc5e9ab7b3d');
assert.equal(hash(baselineBytes),'6331d6d077d99391482fbd021732215fd93c43c78915699c9e74665421249900');
const source=JSON.parse(sourceBytes),review=JSON.parse(reviewBytes),baseline=JSON.parse(baselineBytes);
assert.equal(source.entries.length,7);assert.equal(review.sourceSha256,hash(source));assert.equal(review.sourceByteSha256,hash(sourceBytes));
assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,source.author);
assert.equal(review.reviewer,'AI/next_common_admission_reviewer');assert.deepEqual(review.issues,[]);
assert.deepEqual(review.approvedTerms,source.entries.map(row=>row.term));
assert.deepEqual(review.reviewedRows.map(({term,rowSha256,languageDecision})=>({term,rowSha256,languageDecision})),
  source.entries.map(row=>({term:row.term,rowSha256:hash(row),languageDecision:'PASS'})));

// Only these seven complete independently approved objects cross this boundary.
// A matching head, removed field, duplicate or changed old object grants nothing.
function inverse(rows,oldCount,oldHash){
  if(rows.length===oldCount){assert.equal(hash(rows),oldHash);return rows;}
  assert.equal(rows.length,oldCount+7);
  const removed=[],old=rows.filter(row=>{
    const expected=source.entries.find(entry=>entry.term===row.term);if(!expected)return true;
    assert.deepEqual(row,expected,'Only a complete independently approved new object may be removed');removed.push(row);return false;
  });
  assert.deepEqual(removed,source.entries);assert.equal(old.length,oldCount);assert.equal(hash(old),oldHash);return old;
}
export const historicalCommonSearch42=rows=>inverse(rows,42,baseline.priorSearch42Sha256);
export const historicalCommonOrdinary1070=rows=>inverse(rows,1070,baseline.priorOrdinary1070Sha256);
export const historicalCommonEveryday1283=rows=>inverse(rows.length===1283?rows:historicalAeroEveryday1290(rows),1283,baseline.priorEveryday1283Sha256);

export function historicalCommonPacks4(packs){
  assert.equal(packs.length,5);assert.deepEqual(packs[4].entries,source.entries);
  assert.equal(packs[4].directory.replaceAll('\\','/').split('/').at(-1),'2026-11-20-common-followup');
  const old=packs.slice(0,4);assert.deepEqual(old.map(pack=>pack.entries.length),[16,4,13,9]);
  assert.equal(hash(old.flatMap(pack=>pack.entries)),baseline.priorSearch42Sha256);return old;
}

export function historicalCommonAudit(audit,expectedBeforeSeven,rows){
  if(rows.length===1292){
    audit=historicalAeroAudit(audit,{...expectedBeforeSeven,packagedRowsChecked:expectedBeforeSeven.packagedRowsChecked+7,
      distinctPublicExampleContextsChecked:expectedBeforeSeven.distinctPublicExampleContextsChecked+7},rows);
    rows=historicalAeroEveryday1290(rows);
  }
  historicalCommonEveryday1283(rows);
  assert.equal(rows.length,1290);
  assert.deepEqual(audit,{...expectedBeforeSeven,
    packagedRowsChecked:expectedBeforeSeven.packagedRowsChecked+7,
    distinctPublicExampleContextsChecked:expectedBeforeSeven.distinctPublicExampleContextsChecked+7});
  return expectedBeforeSeven;
}
