// D21 selected-sense append-only release with six exact grammatical admissions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadExampleBuild,exampleSourceHash,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';
import {publishedPosSupports,isAllowedSelectedPos} from '../lib/dictionary-example-pos-policy.mjs';
import {assertHistoricalDictionaryLineage,readHistoricalDictionaryNamespace,SOURCE_LINEAGE_BASE_VERSION} from '../lib/dictionary-source-lineage.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=async relative=>JSON.parse(await readFile(new URL(relative,import.meta.url),'utf8'));
const outcome=await json('../dictionary/examples/queues/batch-0021-outcome.json'),provenance=await json('../dictionary/examples/queues/batch-0021-provenance.json');
const build=await loadExampleBuild(),built=new Map(build.entries.map(row=>[row.term,row]));
const dictionary=await json('../../vocab/data/expanded-dictionary/manifest.json'),currentCanonical=new Map();
for(const descriptor of dictionary.english.shards)for(const source of (await json('../../vocab/data/expanded-dictionary/'+descriptor.file)).records){
 if(currentCanonical.has(source.term))assert.deepEqual(source,currentCanonical.get(source.term));else currentCanonical.set(source.term,source);
}
const historical=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_BASE_VERSION),canonical=historical.records;
const rows=[],queued=new Map(),packs=[];
for(const queue of provenance.sourceQueues){const file=queue.batchId.replace('examples-','batch-')+'.json';
 const pack=await json('../dictionary/examples/source/'+file),review=await json('../dictionary/examples/reviews/'+file);
 rows.push(...validateExampleReview(pack,review));packs.push({queue,pack,review,file});
 for(const item of queue.entries){assert(!queued.has(item.source.term));queued.set(item.source.term,item);}
}
test('D21 reports755 actual approvals,142 source holds and12 pair holds while retaining102609 total heads',()=>{
 assert.equal(canonical.size,102609);assert.equal(outcome.beforeHeads,84426);assert.equal(outcome.beforeExamples,85815);
 assert.equal(outcome.queuedHeads,909);assert.equal(queued.size,909);assert.equal(outcome.authoredHeads,767);
 assert.equal(outcome.approvedHeads,755);assert.equal(outcome.authorHeldHeads,142);assert.equal(outcome.reviewHeldHeads,12);
 assert.equal(rows.length,755);assert.equal(outcome.deferred.length,154);assert.equal(new Set(rows.map(x=>x.term)).size,755);
 assert.equal(outcome.afterHeads,85181);assert.equal(outcome.afterExamples,86570);assert.equal(outcome.remainingHeads,17428);
 assert.equal(outcome.afterHeads+outcome.remainingHeads,102609);assert.equal(outcome.complete,false);
 assert.equal(new Set(outcome.deferred.map(x=>x.term)).size,154);
 for(const item of outcome.deferred){assert(queued.has(item.term));assert(!rows.some(row=>row.term===item.term));assert(item.reason.trim());assert.equal(item.sourceSha256,sha(JSON.stringify(queued.get(item.term).source)));}
});
test('every D21 source retains its exact byte-pinned historical record; the current registered chain is independent',async()=>{
 assert.equal(provenance.sourceDictionaryVersion,SOURCE_LINEAGE_BASE_VERSION);assert.equal(historical.manifest.version,provenance.sourceDictionaryVersion);
 const currentLineage=await assertHistoricalDictionaryLineage(provenance.sourceDictionaryVersion,dictionary,currentCanonical);
 assert.equal(currentLineage.historicalVersion,provenance.sourceDictionaryVersion);assert.equal(currentLineage.currentVersion,dictionary.version);
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
test('every D21 selected role remains exact-source-supported without proper-name promotion',()=>{
 for(const row of rows){assert(isAllowedSelectedPos(row.partOfSpeech));assert(publishedPosSupports(queued.get(row.term).source,row.partOfSpeech));}
 assert.equal(publishedPosSupports({partOfSpeech:'noun',meaning:'人名'},'proper noun'),false);
});
test('all755 exact approved D21 pairs are installed with the corresponding selected meaning and reviewer',()=>{
 for(const row of rows){const installed=built.get(row.term);assert.equal(installed.senses.length,1);const sense=installed.senses[0];assert.equal(sense.partOfSpeech,row.partOfSpeech);
  assert.equal(sense.meaningZh,row.meaningZh);assert.equal(sense.reviewer,row.reviewer);assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);}
 assert(build.manifest.counts.heads>=85181);assert(build.manifest.counts.examples>=86570);
});
test('all84426 older heads and85815 older pairs remain byte-bound and semantically unchanged',async()=>{
 const manifest=parseDictionaryExamplesManifest(provenance.baselineManifest);assert.equal(manifest.version,'3c60c619f24b4783809424ff57e3cb88d86311b62ef174c40ebb6d4866fb53f1');let heads=0,pairs=0;
 for(const descriptor of manifest.shards){const bytes=await readFile(new URL('../../vocab/data/dictionary-examples/'+descriptor.file,import.meta.url));assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(bytes),manifest,descriptor)){heads++;pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);assert.deepEqual(built.get(term),row);}}
 assert.equal(heads,84426);assert.equal(pairs,85815);
});
test('the seven new D21 source files append after all521 older sources in original order',async()=>{
 const index=await json('../dictionary/examples/index.json');assert.equal(provenance.baselineSourceFiles.length,521);assert.equal(packs.length,7);
 assert.deepEqual(index.sourceFiles.slice(0,521),provenance.baselineSourceFiles);for(const{file}of packs)assert(index.sourceFiles.includes(file));
});
test('six exact selected grammatical functions are bound without changing raw source meanings',()=>{
 const exact={
  I:['pronoun','6f763bee5b505d293a44ded713314b100c0106fe857b78d97ea497fac4244672','946323d848882ba522a58013a2334f045be0608deb00eb69d321b4accc896d08'],
  the:['article','e1acb6c7ee39f40f6c0997f8af4353d3d9b6199d43faa0788ce58f82d85a5e91','6769c55f2e6c766d22701478870816b2b084c51bc9760124077803a260a99d35'],
  is:['verb','7f8e7f33ec09d6eeaafdb5b2d6789bf29b0a08774c133e0aec71bef8b15aee13','261a4a452cee3f4d4e0a2d8ca361be084411e4346257d11cf1be380cda9b8d37'],
  was:['verb','13b2583e4a58f58449ab5679bf083226eaa79f0a236789d1b1032ffacc08ec74','6eb99694c24bfa71c2e5bf2fd626de6a2bc4df5d9c8b75b384b9757d91783722'],
  has:['verb','d8d2b31c006d3e237b51f2c8577013c4b43eb88a08a63a8f7e6e50e156a6e2ae','d7cd6ee3eebf30697ff59ccddf7c8304c610f23bf0513a6a7140c06897f03b71'],
  were:['verb','04d2b421e1540a2c777160d4ee0e8c54625e982d9c1288952eb413ed43d07e4c','626b3bbbd90a9868e63e9aa902aacb50147cacffbf123fbbf17b9d91a7aed7e4']
 };
 const finite=packs.find(x=>x.pack.batchId==='examples-0021-p007');assert(finite);assert.deepEqual(finite.pack.entries.map(x=>x.term),Object.keys(exact));
 assert.equal(provenance.finiteGrammarReadSha256,'fa58362a27411e926322f14179045069913728ce680a74f4cb5eac68845f09fd');
 for(const row of finite.pack.entries){const[pos,sourceSha,pairSha]=exact[row.term];assert.equal(row.partOfSpeech,pos);assert.equal(sha(JSON.stringify(queued.get(row.term).source)),sourceSha);
  assert.equal(sha([row.term,row.partOfSpeech,row.meaningZh,row.en,row.zh].join('\t')),pairSha);assert(finite.review.approvedTerms.includes(row.term));}
 assert.deepEqual(provenance.shortHeadExceptions.map(x=>x.term),['I','the','is','was','has']);
 assert.equal(canonical.get('the').meaning,'art. 那');assert(provenance.finiteGrammaticalClarification.includes('raw art.那 is preserved'));
 for(const term of ['are','did','had'])assert(!rows.some(row=>row.term===term),'No unresolved source-repair admission '+term);
});
test('were re-entry preserves and exactly names the old unresolved hold instead of erasing history',async()=>{
 assert.equal(provenance.historicalHoldExceptions.length,1);const exception=provenance.historicalHoldExceptions[0];assert.equal(exception.term,'were');
 assert.equal(exception.file,'batch-0017-outcome.json');const bytes=await readFile(new URL('../dictionary/examples/queues/'+exception.file,import.meta.url));
 assert.equal(sha(bytes),'c2f04c6f51887be451ceaa80f27d58b6acf1618b86f79c15d27d8530d7137af5');assert.equal(exception.sha256,sha(bytes));
 const old=JSON.parse(bytes).deferred.filter(row=>row.term==='were');assert.equal(old.length,1);
 for(const key of ['reason','stage','pack'])assert.equal(old[0][key],exception[key]);
 assert.equal(exception.sourceSha256,sha(JSON.stringify(canonical.get('were'))));assert(rows.some(row=>row.term==='were'));
});
test('all current example shards satisfy actual client parser, byte lengths and SHA manifests',async()=>{
 const manifest=parseDictionaryExamplesManifest(await json('../../vocab/data/dictionary-examples/manifest-v2.json'));let heads=0,pairs=0;
 for(const descriptor of manifest.shards){const bytes=await readFile(new URL('../../vocab/data/dictionary-examples/'+descriptor.file,import.meta.url));assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);
  for(const row of parseDictionaryExamplesShard(JSON.parse(bytes),manifest,descriptor).values()){heads++;pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);}}
 assert.deepEqual(manifest.counts,{heads,examples:pairs});assert.equal(manifest.version,build.manifest.version);
});
