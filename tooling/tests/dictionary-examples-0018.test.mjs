// Install at tooling/tests/dictionary-examples-0018.test.mjs only after gated integration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateExampleReview,loadExampleBuild} from '../scripts/build-dictionary-examples.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const baseline='18d4b3c0d8d5e761b4a0c53743913dd4fc539298340cbcbe719a78a251bacff8';
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');

test('batch0018 retains full frozen lexical context and byte-checkable realization provenance',async()=>{
 const queue=await json('../dictionary/examples/queues/batch-0018.json');
 const provenance=await json('../dictionary/examples/queues/batch-0018-provenance.json');
 const outcome=await json('../dictionary/examples/queues/batch-0018-outcome.json');
 assert.equal(provenance.schemaVersion,1);assert.equal(provenance.batchId,'0018');
 assert.equal(provenance.sourceDictionaryVersion,queue.sourceDictionaryVersion);
 assert.equal(provenance.sourceQueues.length,queue.batches.length);
 const currentManifest=await json('../../vocab/data/dictionary-examples/manifest-v2.json');
 assert.match(provenance.examplesVersion,/^[a-f0-9]{64}$/u);
 if(currentManifest.counts.heads===82339)assert.equal(provenance.examplesVersion,currentManifest.version);
 const ids=new Set(),terms=new Set(),approved=new Set(),sourceRows=new Map(),approvedRows=new Map();
 for(let i=0;i<queue.batches.length;i++){
  const frozen=provenance.sourceQueues[i],batch=queue.batches[i];
  assert.equal(frozen.batchId,batch.batchId);assert.equal(frozen.assignedAuthor,batch.assignedAuthor);
  assert.equal(frozen.sourceDictionaryVersion,queue.sourceDictionaryVersion);
  assert.equal(frozen.baselineExampleVersion,baseline);assert.equal(frozen.authorship,'not-authored-input-queue');
  assert.deepEqual(frozen.entries.map(row=>row.term),batch.terms);assert.ok(!ids.has(frozen.batchId));ids.add(frozen.batchId);
  for(const row of frozen.entries){
   assert.ok(!terms.has(row.term));terms.add(row.term);sourceRows.set(row.term,row);
   assert.ok(row.partOfSpeech?.trim()&&row.meaning?.trim()&&Array.isArray(row.variants));
   assert.ok(Array.isArray(row.evidence)&&row.evidence.length,'Full lexical evidence missing: '+row.term);
  }
  const file=batch.batchId.replace('examples-','batch-')+'.json';
  for(const row of validateExampleReview(await json('../dictionary/examples/source/'+file),await json('../dictionary/examples/reviews/'+file))){approved.add(row.term);approvedRows.set(row.term,row);}
 }
 assert.equal(terms.size,outcome.queuedHeads);assert.equal(approved.size,10000);
 const pinned=new Set();
 for(const pin of provenance.explicitPosEvidence){
  assert.ok(approved.has(pin.term)&&!pinned.has(pin.term));pinned.add(pin.term);
  const frozen=sourceRows.get(pin.term);assert.ok(frozen);
  assert.equal(pin.sourcePartOfSpeech,frozen.partOfSpeech);assert.equal(pin.sourceMeaning,frozen.meaning);
  assert.equal(pin.partOfSpeech,approvedRows.get(pin.term).partOfSpeech);
  assert.ok(pin.basis?.trim()&&Array.isArray(pin.references)&&pin.references.length);
 }
 const packs=new Set();
 for(const proof of provenance.realizationEvidence){
  assert.ok(!packs.has(proof.packId));packs.add(proof.packId);
  assert.ok(ids.has('examples-0018-'+proof.packId));assert.equal(proof.document.packId,proof.packId);
  assert.equal(createHash('sha256').update(proof.rawJson).digest('hex'),proof.sha256);
  assert.deepEqual(JSON.parse(proof.rawJson),proof.document);
  const frozen=provenance.sourceQueues.find(q=>q.batchId==='examples-0018-'+proof.packId);
  assert.equal(proof.document.author,frozen.assignedAuthor);
  for(const row of proof.document.entries){
   const source=frozen.entries.find(e=>e.term===row.term),accepted=approvedRows.get(row.term);
   assert.ok(source&&accepted);assert.equal(row.partOfSpeech,accepted.partOfSpeech);assert.equal(row.en,accepted.en);
   assert.equal(row.sourcePartOfSpeech,source.partOfSpeech);assert.equal(row.sourceMeaning,source.meaning);
   assert.match(source.term,/\b(?:sth|sb|something|somebody|someone)\b|\b(?:one|someone|somebody)[’']s\b/iu);
   assert.ok(row.placeholderMapping?.trim()&&row.basis?.trim());
   assert.ok(Array.isArray(row.realizedPhrases)&&row.realizedPhrases.length);
   for(const phrase of row.realizedPhrases)assert.ok(new RegExp('(?:^|[^A-Za-z])'+escapeRegex(phrase)+'(?=$|[^A-Za-z])','iu').test(accepted.en));
  }
 }
});

test('batch0018 retains all 72339 previously released heads and 73728 bilingual pairs unchanged',async()=>{
 const build=await loadExampleBuild(),current=new Map(build.entries.map(r=>[r.term,r]));
 let heads=0,pairs=0;
 for(let bucket=0;bucket<256;bucket++){
  const previous=await json(`../../vocab/data/dictionary-examples/${baseline}/examples-${bucket}.json`);
  for(const row of previous.entries){
   assert.deepEqual(current.get(row.term),row,row.term);heads++;
   pairs+=row.senses.reduce((total,sense)=>total+sense.examples.length,0);
  }
 }
 assert.equal(heads,72339);assert.equal(pairs,73728);
});

test('batch0018 adds exactly10000 distinct independently approved heads and accounts for every deferred candidate',async()=>{
 const queue=await json('../dictionary/examples/queues/batch-0018.json');
 const outcome=await json('../dictionary/examples/queues/batch-0018-outcome.json');
 assert.equal(queue.targetApprovedHeads,10000);assert.equal(queue.baselineExampleVersion,baseline);
 assert.equal(outcome.approvedHeads,10000);assert.equal(outcome.baselineHeads,72339);assert.equal(outcome.afterHeads,82339);
 const index=await json('../dictionary/examples/index.json');
 assert.deepEqual(index.sourceFiles.filter(f=>f.startsWith('batch-0018-')),queue.batches.map(q=>q.batchId.replace('examples-','batch-')+'.json'));
 const allQueued=new Set(),allWritten=new Set(),approved=new Map();
 const deferred=new Map(outcome.deferred.map(r=>[r.term,r]));assert.equal(deferred.size,outcome.deferred.length);
 for(const batch of queue.batches){
  assert.ok(typeof batch.assignedAuthor==='string'&&batch.assignedAuthor.trim(),'Frozen author provenance missing');
  const file=batch.batchId.replace('examples-','batch-')+'.json';
  const pack=await json('../dictionary/examples/source/'+file),review=await json('../dictionary/examples/reviews/'+file);
  assert.equal(pack.batchId,batch.batchId);assert.equal(review.independentOfAuthor,true);
  assert.match(review.reviewer,/^AI\/examples18_[a-z0-9_-]+$/u);
  const authorRole=batch.assignedAuthor.startsWith('root')?'root':batch.assignedAuthor.match(/^author18_([a-e])(?:_|$)/u)?.[1];
  assert.ok(authorRole,'Unknown author role: '+batch.assignedAuthor);
  const reviewerRole=review.reviewer.slice('AI/examples18_'.length).replace(/^reviewer_/u,'');
  assert.notEqual(reviewerRole,authorRole,'Authored examples cannot approve themselves: '+file);
  const rows=validateExampleReview(pack,review),terms=new Set(batch.terms);
  for(const term of terms){assert.ok(!allQueued.has(term),term);allQueued.add(term);}
  for(const row of pack.entries){assert.ok(terms.has(row.term)&&!allWritten.has(row.term));allWritten.add(row.term);}
  for(const row of rows){
   assert.ok(!approved.has(row.term)&&!deferred.has(row.term),row.term);approved.set(row.term,row);
   assert.match(row.partOfSpeech,/^(?:noun|verb|adjective|adverb|proper noun|plural noun)$/u);
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
 assert.ok(build.manifest.counts.heads>=82339);assert.ok(build.manifest.counts.examples>=83728);
});

test('all10000 added headwords map through actual client buckets to their exact reviewed card content',async()=>{
 const manifest=parseDictionaryExamplesManifest(await json('../../vocab/data/dictionary-examples/manifest-v2.json'));
 const byTerm=new Map();
 for(const descriptor of manifest.shards){
  const parsed=parseDictionaryExamplesShard(await json('../../vocab/data/dictionary-examples/'+descriptor.file),manifest,descriptor);
  for(const [term,entry] of parsed){assert.ok(!byTerm.has(term));byTerm.set(term,entry);}
 }
 const queue=await json('../dictionary/examples/queues/batch-0018.json');let checked=0;
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
