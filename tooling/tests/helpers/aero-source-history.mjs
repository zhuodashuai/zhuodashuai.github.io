import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateReviewedSensePack,validateSourceCorrectionPolicy,renderReviewedSenseModule} from '../../scripts/build-reviewed-dictionary-senses.mjs';

const folder=new URL('../../dictionary/reviewed-senses/',import.meta.url);
const bytes=file=>readFile(new URL(file,folder)),read=async file=>JSON.parse(await bytes(file));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const packBytes=await bytes('source/batch-0019.json'),reviewBytes=await bytes('reviews/batch-0019.json'),baselineBytes=await bytes('source-corrections-0019-baseline.json');
assert.equal(hash(packBytes),'85bc0125dd69bb5376fb116651d1f0d4c2baba3c79bdef02b0b881d72626d0fb');
assert.equal(hash(reviewBytes),'3cce683493dfec39c8d42db21b748598512f16fc432d4f7f945ca3144969efaf');
assert.equal(hash(baselineBytes),'ce46c4d5c703cb6e433e96b1c831394ad62b6f6b878033dd8d67e136de2f3baa');
const pack=JSON.parse(packBytes),review=JSON.parse(reviewBytes),baseline=JSON.parse(baselineBytes);
assert.equal(review.sourceByteSha256,hash(packBytes));assert.equal(review.sourceSha256,hash(pack));
assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,pack.author);assert.deepEqual(review.issues,[]);
assert.deepEqual(review.approvedTerms,['aeroallergen','aeroallergens']);
for(const[file,pin]of Object.entries(baseline.immutableFiles))assert.equal(hash(await readFile(new URL('../../../'+file,import.meta.url))),pin,file);
for(const[file,pin]of Object.entries(review.exactEvidence))assert.equal(hash(await bytes(file)),pin,file);
const before=await read('source-corrections-0019-canonical-before.json');
const manifestBytes=await readFile(new URL('../../../vocab/data/expanded-dictionary/manifest.json',import.meta.url)),manifest=JSON.parse(manifestBytes);
assert.equal(hash(manifestBytes),before.manifestByteSha256);const records=new Map();
for(const proof of before.records){
  const descriptor=manifest.english.shards.find(row=>row.bucket===proof.shard.bucket);assert.deepEqual(descriptor,proof.shard);
  const raw=await readFile(new URL('../../../vocab/data/expanded-dictionary/'+descriptor.file,import.meta.url));
  assert.equal(hash(raw),descriptor.sha256);assert.equal(raw.length,descriptor.bytes);
  const record=JSON.parse(raw).records.find(row=>row.id===proof.record.id&&row.term===proof.term);
  assert.deepEqual(record,proof.record);assert.equal(hash(record),proof.canonicalSourceSha256);records.set(proof.term,record);
}
const legacyFile='source-corrections-0019-legacy-examples.json',legacyBytes=await bytes(legacyFile),legacy=JSON.parse(legacyBytes);
const policyFile='source-corrections-0019-accuracy-policy.json',policyBytes=await bytes(policyFile),policy=JSON.parse(policyBytes);
const expected=validateReviewedSensePack(pack,review,records);
const projections=validateSourceCorrectionPolicy(policy,pack,review,records,manifest,hash(manifestBytes),legacy,
  new Map(legacy.entries.map(row=>[row.term,row.expectedEntry])),{file:policyFile,bytes:policyBytes,legacyFile,legacyBytes});
for(const row of expected)Object.assign(row,projections.get(row.term));
expected.sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
export const exactAeroCorrections=expected;
export const aeroSourceBaseline=baseline;

function inverse(rows,oldCount,oldHash){
  if(rows.length===oldCount){assert.equal(hash(rows),oldHash);return rows;}
  assert.equal(rows.length,oldCount+2);const removed=[];
  const old=rows.filter(row=>{const addition=expected.find(candidate=>candidate.term===row.term);if(!addition)return true;
    assert.deepEqual(row,addition,'Only the two full independently approved source-correction objects may be inverted');removed.push(row);return false;});
  assert.deepEqual(removed,expected);assert.equal(hash(old),oldHash);return old;
}
export const historicalAeroReviewed213=rows=>inverse(rows,213,baseline.priorReviewed213Sha256);
export const historicalAeroEveryday1290=rows=>inverse(rows,1290,baseline.priorEveryday1290Sha256);
export function historicalAeroReviewedModule(source,rows){
  const old=historicalAeroReviewed213(rows);const exact=renderReviewedSenseModule(rows);assert.equal(source,exact);
  const inverse=renderReviewedSenseModule(old);assert.equal(hash(inverse),baseline.priorReviewedModuleByteSha256);return inverse;
}
export function historicalAeroIndex18(index){
  const current=structuredClone(index);assert.equal(current.batches.length,19);
  assert.deepEqual(current.batches.pop(),{source:'batch-0019.json',review:'batch-0019.json'});
  assert.deepEqual(current.additionalSourceCorrectionPolicies.pop(),{policy:'source-corrections-0019-accuracy-policy.json',legacyExamples:'source-corrections-0019-legacy-examples.json'});
  assert.deepEqual(current,baseline.priorIndex);assert.equal(hash(JSON.stringify(current,null,2)+'\n'),baseline.priorIndexByteSha256);return current;
}
export function historicalAeroAudit(audit,expectedBeforeTwo,rows){
  historicalAeroEveryday1290(rows);assert.equal(rows.length,1292);
  assert.deepEqual(audit,{...expectedBeforeTwo,packagedRowsChecked:expectedBeforeTwo.packagedRowsChecked+2,
    distinctPublicExampleContextsChecked:expectedBeforeTwo.distinctPublicExampleContextsChecked+2});return expectedBeforeTwo;
}
