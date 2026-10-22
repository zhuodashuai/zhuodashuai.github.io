import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {SEMANTIC_REVISION_PROOF_FILES} from '../lib/dictionary-semantic-revisions.mjs';
import {composeSemanticExampleSource} from '../lib/semantic-example-composition.mjs';
import {exampleSourceHash,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';

const directory=new URL('../dictionary/source-revisions/',import.meta.url);
const proofs=Object.fromEntries(await Promise.all(Object.entries(SEMANTIC_REVISION_PROOF_FILES)
  .map(async([key,file])=>[key,await readFile(new URL(file,directory),'utf8')])));
const candidate=JSON.parse(proofs.candidateText),sha=value=>createHash('sha256').update(value).digest('hex');

test('mechanical five-cell mapping preserves every Root pair, C principal and historical conditional scope',()=>{
  const original=JSON.stringify(proofs),first=composeSemanticExampleSource(Object.freeze({...proofs}));
  assert.equal(JSON.stringify(proofs),original);
  assert.equal(first.source.batchId,'examples-0024-p001');
  assert.equal(first.review.sourceSha256,exampleSourceHash(first.source));
  assert.equal(first.review.reviewer,'AI/examples24_reviewer_c');
  assert.equal(first.review.independentOfAuthor,true);
  assert.equal(validateExampleReview(first.source,first.review).length,5);
  assert.match(first.review.reviewMethod,/conditional/u);assert.match(first.review.reviewMethod,/grants none/u);
  for(let index=0;index<5;index++){
    const row=first.source.entries[index],cells=[row.term,row.partOfSpeech,row.meaningZh,row.en,row.zh];
    assert.deepEqual(cells,candidate.entries[index].pair);
    assert.equal(sha(cells.join('\t')),candidate.entries[index].pairSha256);
  }
});

test('outputs are detached from caller and every subsequent composition',()=>{
  const first=composeSemanticExampleSource(proofs);first.source.entries[0].en='Not reviewed.';
  first.review.approvedTerms.push('unknown');
  const second=composeSemanticExampleSource(proofs);
  assert.equal(second.source.entries[0].en,candidate.entries[0].pair[3]);
  assert.equal(second.review.approvedTerms.length,5);
});

for(const key of Object.keys(proofs))test('any changed raw proof refuses projection: '+key,()=>{
  assert.throws(()=>composeSemanticExampleSource({...proofs,[key]:proofs[key]+'\n'}));
});

for(const[label,mutate]of[
  ['EN sentence',p=>p.entries[0].pair[3]='A different sentence.'],
  ['Chinese translation',p=>p.entries[0].pair[4]='未经复核的译文。'],
  ['primary meaning',p=>p.entries[0].afterCandidate.meaning='免费的'],
  ['whole source variants',p=>p.entries[0].afterCandidate.variants=p.entries[0].before.variants],
  ['retained historical holds',p=>p.entries[0].retainedHolds=[]],
  ['target list',p=>p.entries.pop()]
])test('relabelled or selectively changed candidate cannot acquire C approval: '+label,()=>{
  const p=structuredClone(candidate);mutate(p);
  assert.throws(()=>composeSemanticExampleSource({...proofs,candidateText:JSON.stringify(p)}));
});

test('no Proxy, getter or invented caller reviewer is executed or accepted',()=>{
  let calls=0;const proxy=new Proxy(proofs,{get(){calls++;return null;}});
  assert.throws(()=>composeSemanticExampleSource(proxy));assert.equal(calls,0);
  const changed={...proofs};Object.defineProperty(changed,'reviewText',{enumerable:true,get(){calls++;return proofs.reviewText;}});
  assert.throws(()=>composeSemanticExampleSource(changed));assert.equal(calls,0);
  assert.throws(()=>composeSemanticExampleSource({...proofs,reviewer:'c'}));
});
