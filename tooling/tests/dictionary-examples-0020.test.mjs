// D20 selected-sense append-only example release: real reader decisions, not templates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadExampleBuild,exampleSourceHash,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';
import {publishedPosSupports,isAllowedSelectedPos} from '../lib/dictionary-example-pos-policy.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=async relative=>JSON.parse(await readFile(new URL(relative,import.meta.url),'utf8'));
const outcome=await json('../dictionary/examples/queues/batch-0020-outcome.json'),provenance=await json('../dictionary/examples/queues/batch-0020-provenance.json');
const build=await loadExampleBuild(),built=new Map(build.entries.map(row=>[row.term,row]));
const dictionary=await json('../../vocab/data/expanded-dictionary/manifest.json'),canonical=new Map();
for(const descriptor of dictionary.english.shards)for(const source of (await json('../../vocab/data/expanded-dictionary/'+descriptor.file)).records){
 if(canonical.has(source.term))assert.deepEqual(source,canonical.get(source.term));else canonical.set(source.term,source);
}
const rows=[],queued=new Map(),packs=[];
for(const queue of provenance.sourceQueues){const file=queue.batchId.replace('examples-','batch-')+'.json';
 const pack=await json('../dictionary/examples/source/'+file),review=await json('../dictionary/examples/reviews/'+file);
 rows.push(...validateExampleReview(pack,review));packs.push({queue,pack,review,file});
 for(const item of queue.entries){assert(!queued.has(item.source.term));queued.set(item.source.term,item);}
}
test('D20 reports426 actual approvals,106 source holds and8 pair holds while retaining102609 total heads',()=>{
 assert.equal(canonical.size,102609);assert.equal(outcome.beforeHeads,84000);assert.equal(outcome.beforeExamples,85389);
 assert.equal(outcome.queuedHeads,540);assert.equal(queued.size,540);assert.equal(outcome.authoredHeads,434);
 assert.equal(outcome.approvedHeads,426);assert.equal(outcome.authorHeldHeads,106);assert.equal(outcome.reviewHeldHeads,8);
 assert.equal(rows.length,426);assert.equal(outcome.deferred.length,114);assert.equal(new Set(rows.map(x=>x.term)).size,426);
 assert.equal(outcome.afterHeads,84426);assert.equal(outcome.afterExamples,85815);assert.equal(outcome.remainingHeads,18183);
 assert.equal(outcome.afterHeads+outcome.remainingHeads,102609);assert.equal(outcome.complete,false);
 assert.equal(new Set(outcome.deferred.map(x=>x.term)).size,114);
 for(const item of outcome.deferred){assert(queued.has(item.term));assert(!rows.some(row=>row.term===item.term));assert(item.reason.trim());assert.equal(item.sourceSha256,sha(JSON.stringify(queued.get(item.term).source)));}
});
test('every D20 full source including nested provenance still equals exact released canonical record',()=>{
 assert.equal(provenance.sourceDictionaryVersion,dictionary.version);assert.deepEqual(provenance.historicalHoldExceptions,[]);assert.deepEqual(provenance.shortHeadExceptions,[]);
 for(const [term,item]of queued){assert.deepEqual(item.source,canonical.get(term));assert.equal(item.sourceSha256,sha(JSON.stringify(item.source)));}
});
test('every retained exact five-field pair has an explicit actual different-principal source-bound reading',()=>{
 for(const{pack,review,queue}of packs){const reader=provenance.readers.find(x=>x.batchId===pack.batchId);assert(reader);assert.notEqual(reader.authorPrincipal,reader.reviewerPrincipal);
  assert.equal(reader.sourceSha256,exampleSourceHash(pack));assert.equal(review.sourceSha256,reader.sourceSha256);assert.equal(reader.reviewSha256,sha(JSON.stringify(review)));
  assert.equal(reader.readEvidence.sourceRowsRead,queue.entries.length);assert.equal(reader.readEvidence.wholePairsRead,pack.entries.length);
  assert.equal(reader.readEvidence.authorHoldsRead,reader.authorHolds.length);assert.equal(reader.authorHolds.length+pack.entries.length,queue.entries.length);
  assert.equal(reader.readEvidence.sourceSha256,reader.inputSha256);assert.equal(reader.readEvidence.authoredSha256,reader.tsvSha256);
  assert.equal(reader.perTerm.length,pack.entries.length);assert(reader.readEvidence.proofFiles.length>0);
  for(const row of pack.entries){const decision=reader.perTerm.find(x=>x.term===row.term);assert(decision?.reason?.trim());assert.equal(review.approvedTerms.includes(row.term),decision.decision==='approve');}
 }
});
test('every D20 selected role remains exact-source-supported without proper-name promotion',()=>{
 for(const row of rows){assert(isAllowedSelectedPos(row.partOfSpeech));assert(publishedPosSupports(queued.get(row.term).source,row.partOfSpeech));}
 assert.equal(publishedPosSupports({partOfSpeech:'noun',meaning:'人名'},'proper noun'),false);
});
test('all426 exact approved D20 pairs are installed with the corresponding selected meaning and reviewer',()=>{
 for(const row of rows){const installed=built.get(row.term);assert.equal(installed.senses.length,1);const sense=installed.senses[0];assert.equal(sense.partOfSpeech,row.partOfSpeech);
  assert.equal(sense.meaningZh,row.meaningZh);assert.equal(sense.reviewer,row.reviewer);assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);}
 assert(build.manifest.counts.heads>=84426);assert(build.manifest.counts.examples>=85815);
});
test('all84000 older heads and85389 older pairs remain byte-bound and semantically unchanged',async()=>{
 const manifest=parseDictionaryExamplesManifest(provenance.baselineManifest);assert.equal(manifest.version,'ecbf796a417d9a21ff4bbba145a6d384b081949915ebac9b09140e35b9846db9');let heads=0,pairs=0;
 for(const descriptor of manifest.shards){const bytes=await readFile(new URL('../../vocab/data/dictionary-examples/'+descriptor.file,import.meta.url));assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(bytes),manifest,descriptor)){heads++;pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);assert.deepEqual(built.get(term),row);}}
 assert.equal(heads,84000);assert.equal(pairs,85389);
});
test('the three new D20 source files append after all518 older sources in original order',async()=>{
 const index=await json('../dictionary/examples/index.json');assert.equal(provenance.baselineSourceFiles.length,518);
 assert.deepEqual(index.sourceFiles.slice(0,518),provenance.baselineSourceFiles);for(const{file}of packs)assert(index.sourceFiles.includes(file));
});
test('all current example shards satisfy actual client parser, byte lengths and SHA manifests',async()=>{
 const manifest=parseDictionaryExamplesManifest(await json('../../vocab/data/dictionary-examples/manifest-v2.json'));let heads=0,pairs=0;
 for(const descriptor of manifest.shards){const bytes=await readFile(new URL('../../vocab/data/dictionary-examples/'+descriptor.file,import.meta.url));assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);
  for(const row of parseDictionaryExamplesShard(JSON.parse(bytes),manifest,descriptor).values()){heads++;pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);}}
 assert.deepEqual(manifest.counts,{heads,examples:pairs});assert.equal(manifest.version,build.manifest.version);
});
