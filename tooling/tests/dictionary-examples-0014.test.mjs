// Install at tooling/tests/dictionary-examples-0014.test.mjs only after gated integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateExampleReview,loadExampleBuild} from '../scripts/build-dictionary-examples.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const baseline='6dde68df3b52127a473d9e8a07b14df54cb82a88fe0c8380051b1e3bd66c05ef';

test('batch0014 retains all 32339 previously released heads and 33728 bilingual pairs unchanged',async()=>{
 const build=await loadExampleBuild(),current=new Map(build.entries.map(r=>[r.term,r]));
 let heads=0,pairs=0;
 for(let bucket=0;bucket<256;bucket++){
  const previous=await json(`../../vocab/data/dictionary-examples/${baseline}/examples-${bucket}.json`);
  for(const row of previous.entries){
   assert.deepEqual(current.get(row.term),row,row.term);heads++;
   pairs+=row.senses.reduce((total,sense)=>total+sense.examples.length,0);
  }
 }
 assert.equal(heads,32339);assert.equal(pairs,33728);
});

test('batch0014 adds exactly10000 distinct independently approved heads and accounts for every deferred candidate',async()=>{
 const queue=await json('../dictionary/examples/queues/batch-0014.json');
 const outcome=await json('../dictionary/examples/queues/batch-0014-outcome.json');
 assert.equal(queue.targetApprovedHeads,10000);assert.equal(queue.baselineExampleVersion,baseline);
 assert.equal(outcome.approvedHeads,10000);assert.equal(outcome.baselineHeads,32339);assert.equal(outcome.afterHeads,42339);
 const index=await json('../dictionary/examples/index.json');
 assert.deepEqual(index.sourceFiles.filter(f=>f.startsWith('batch-0014-')),queue.batches.map(q=>q.batchId.replace('examples-','batch-')+'.json'));
 const allQueued=new Set(),allWritten=new Set(),approved=new Map();
 const deferred=new Map(outcome.deferred.map(r=>[r.term,r]));assert.equal(deferred.size,outcome.deferred.length);
 for(const batch of queue.batches){
  assert.ok(typeof batch.assignedAuthor==='string'&&batch.assignedAuthor.trim(),'Frozen author provenance missing');
  const file=batch.batchId.replace('examples-','batch-')+'.json';
  const pack=await json('../dictionary/examples/source/'+file),review=await json('../dictionary/examples/reviews/'+file);
  assert.equal(pack.batchId,batch.batchId);assert.equal(review.independentOfAuthor,true);
  assert.match(review.reviewer,/^AI\/examples14_[a-z0-9_-]+$/u);
  const rows=validateExampleReview(pack,review),terms=new Set(batch.terms);
  for(const term of terms){assert.ok(!allQueued.has(term),term);allQueued.add(term);}
  for(const row of pack.entries){assert.ok(terms.has(row.term)&&!allWritten.has(row.term));allWritten.add(row.term);}
  for(const row of rows){
   assert.ok(!approved.has(row.term)&&!deferred.has(row.term),row.term);approved.set(row.term,row);
   assert.match(row.partOfSpeech,/^(?:noun|verb|adjective|adverb)$/u);
   assert.ok(row.en.split(/\s+/u).length>=5&&row.en.split(/\s+/u).length<=30,row.term);
   assert.match(row.meaningZh,/\p{Script=Han}/u);assert.match(row.zh,/\p{Script=Han}/u);
   assert.doesNotMatch(row.en,/\b(?:this word means|the word means|an example of this word|the term means)\b/iu);
  }
  for(const term of terms)assert.ok(approved.has(term)||deferred.has(term),'unaccounted '+term);
 }
 assert.equal(approved.size,10000);assert.equal(allWritten.size,outcome.authoredHeads);assert.equal(allQueued.size,outcome.queuedHeads);
 for(const row of deferred.values()){
  assert.ok(allQueued.has(row.term));assert.match(row.stage,/^(?:authoring|review)$/u);assert.ok(row.reason?.trim());
 }
 assert.equal(allQueued.size,approved.size+deferred.size);
 const build=await loadExampleBuild(),current=new Map(build.entries.map(r=>[r.term,r]));
 for(const [term,row] of approved){
  const entry=current.get(term);assert.ok(entry,term);assert.equal(entry.senses.length,1);
  const sense=entry.senses[0];assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaningZh);
  assert.equal(sense.reviewer,row.reviewer);assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);
 }
 // Later releases may append more independently reviewed examples.
 assert.ok(build.manifest.counts.heads>=42339);assert.ok(build.manifest.counts.examples>=43728);
});

test('all10000 added headwords map through actual client buckets to their exact reviewed card content',async()=>{
 const manifest=parseDictionaryExamplesManifest(await json('../../vocab/data/dictionary-examples/manifest-v2.json'));
 const byTerm=new Map();
 for(const descriptor of manifest.shards){
  const parsed=parseDictionaryExamplesShard(await json('../../vocab/data/dictionary-examples/'+descriptor.file),manifest,descriptor);
  for(const [term,entry] of parsed){assert.ok(!byTerm.has(term));byTerm.set(term,entry);}
 }
 const queue=await json('../dictionary/examples/queues/batch-0014.json');let checked=0;
 for(const batch of queue.batches){
  const file=batch.batchId.replace('examples-','batch-')+'.json';
  const rows=validateExampleReview(await json('../dictionary/examples/source/'+file),await json('../dictionary/examples/reviews/'+file));
  for(const row of rows){
   const result=byTerm.get(row.term);assert.equal(result?.term,row.term);
   assert.equal(result.senses[0].partOfSpeech,row.partOfSpeech);assert.equal(result.senses[0].meaningZh,row.meaningZh);
   assert.deepEqual(result.senses[0].examples,[{en:row.en,zh:row.zh}]);checked++;
  }
 }
 assert.equal(checked,10000);
});
