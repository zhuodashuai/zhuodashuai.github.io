// Independently reviewed D19 append-only selected-sense example release.
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
const outcome=await json('../dictionary/examples/queues/batch-0019-outcome.json');
const provenance=await json('../dictionary/examples/queues/batch-0019-provenance.json');
const queueSummary=await json('../dictionary/examples/queues/batch-0019.json');
const build=await loadExampleBuild(),built=new Map(build.entries.map(row=>[row.term,row]));
const dictionary=await json('../../vocab/data/expanded-dictionary/manifest.json'),currentCanonical=new Map();
for(const descriptor of dictionary.english.shards)for(const source of (await json('../../vocab/data/expanded-dictionary/'+descriptor.file)).records){
 if(currentCanonical.has(source.term))assert.deepEqual(source,currentCanonical.get(source.term));else currentCanonical.set(source.term,source);
}
// Frozen source opinions refer to 474e, never to a later active correction.
const historical=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_BASE_VERSION),canonical=historical.records;
const rows=[],queued=new Map(),packs=[];
for(const queue of provenance.sourceQueues){
 const file=queue.batchId.replace('examples-','batch-')+'.json';
 const pack=await json('../dictionary/examples/source/'+file),review=await json('../dictionary/examples/reviews/'+file);
 rows.push(...validateExampleReview(pack,review));packs.push({queue,pack,review,file});
 for(const entry of queue.entries){assert(!queued.has(entry.source.term));queued.set(entry.source.term,entry);}
}
test('D19 reports actual approvals and explicit holds while preserving the102609-head denominator',()=>{
 assert.equal(canonical.size,102609);assert.equal(outcome.beforeHeads,82339);assert.equal(outcome.beforeExamples,83728);
 assert.equal(outcome.queuedHeads,2000);assert.equal(queued.size,2000);assert.equal(provenance.fullGoal.pending,20270);
 assert.equal(rows.length,outcome.approvedHeads);assert.equal(rows.length+outcome.deferred.length,2000);
 assert.equal(outcome.afterHeads,82339+rows.length);assert.equal(outcome.afterExamples,83728+rows.length);
 assert.equal(outcome.remainingHeads,20270-rows.length);assert.equal(outcome.afterHeads+outcome.remainingHeads,102609);
 assert.equal(outcome.complete,false);assert.equal(new Set(rows.map(row=>row.term)).size,rows.length);
 assert.equal(new Set(outcome.deferred.map(row=>row.term)).size,outcome.deferred.length);
 for(const item of outcome.deferred){assert(queued.has(item.term));assert(!rows.some(row=>row.term===item.term));assert(item.reason.trim());assert.equal(item.sourceSha256,sha(JSON.stringify(queued.get(item.term).source)));}
});
test('every full frozen D19 source retains its genuine byte-pinned archived record; current lineage is checked separately',async()=>{
 for(const[term,entry]of queued){assert.deepEqual(entry.source,canonical.get(term));assert.equal(entry.sourceSha256,sha(JSON.stringify(entry.source)));assert.equal(entry.admission,null);}
 assert.equal(provenance.sourceDictionaryVersion,SOURCE_LINEAGE_BASE_VERSION);assert.equal(queueSummary.sourceDictionaryVersion,provenance.sourceDictionaryVersion);
 assert.equal(historical.manifest.version,provenance.sourceDictionaryVersion);
 const currentLineage=await assertHistoricalDictionaryLineage(provenance.sourceDictionaryVersion,dictionary,currentCanonical);
 assert.equal(currentLineage.historicalVersion,provenance.sourceDictionaryVersion);assert.equal(currentLineage.currentVersion,dictionary.version);
});
test('selected tags stay source-supported and never infer a role from Chinese or word endings',()=>{
 for(const row of rows){assert(isAllowedSelectedPos(row.partOfSpeech));assert(publishedPosSupports(queued.get(row.term).source,row.partOfSpeech));}
 assert(rows.some(row=>row.partOfSpeech==='pronoun'));assert(rows.some(row=>row.partOfSpeech==='preposition'));
 assert(rows.some(row=>row.partOfSpeech==='prepositional phrase'));
 assert.equal(publishedPosSupports({partOfSpeech:'noun',meaning:'人名'},'proper noun'),false);
 assert.equal(publishedPosSupports({partOfSpeech:'prepositional phrase'},'adverb'),false);
});
test('every retained exact pair is hash-bound to an actually declared different review principal',()=>{
 for(const{pack,review,file,queue}of packs){
  const audit=provenance.reviews.find(row=>row.file===file);assert(audit);
  assert.equal(review.sourceSha256,exampleSourceHash(pack));assert.equal(audit.compileAudit.sourceSha256,review.sourceSha256);
  assert.equal(audit.readDecision.sourceSha256,review.sourceSha256);assert.equal(audit.readDecision.stage,'complete-independent-reading');
  assert.equal(audit.readDecision.fullSourceRows,queue.entries.length);assert.equal(audit.readDecision.pairedRows,pack.entries.length);
  assert.equal(audit.reviewAudit.readDecisionSha256,sha(JSON.stringify(audit.readDecision)));
  assert.equal(audit.reviewAudit.compileAuditSha256,sha(JSON.stringify(audit.compileAudit)));
  assert.equal(audit.reviewAudit.reviewSha256,sha(JSON.stringify(review)));
  assert(!audit.reviewAudit.authorPrincipals.includes(audit.reviewAudit.reviewerPrincipal));
  assert.equal(audit.compileAudit.automaticAttention.length,0);assert.equal(audit.lock.rows,pack.entries.length);
  assert.equal(audit.lock.authorDeferrals.length+pack.entries.length,queue.entries.length);
  for(const row of pack.entries){const decision=audit.readDecision.perTerm.find(item=>item.term===row.term);assert(decision?.reason?.trim());assert.equal(review.approvedTerms.includes(row.term),decision.decision==='approve');}
 }
});
test('every approved D19 example is installed without overwriting held heads or another selected sense',()=>{
 for(const row of rows){const installed=built.get(row.term);assert.equal(installed.senses.length,1);const sense=installed.senses[0];
  assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaningZh);assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);assert.equal(sense.reviewer,row.reviewer);}
 assert(build.manifest.counts.heads>=outcome.afterHeads);assert(build.manifest.counts.examples>=outcome.afterExamples);
});
test('all82339 older heads and83728 older bilingual pairs remain exactly unchanged',async()=>{
 const oldManifest=parseDictionaryExamplesManifest(provenance.baselineManifest);let heads=0,pairs=0;
 assert.equal(oldManifest.version,'607a62a0614c35d437be636eb3bf9d13fb5c80bb332c9bfb53b430456a7cbe2b');
 for(const descriptor of oldManifest.shards){const bytes=await readFile(new URL('../../vocab/data/dictionary-examples/'+descriptor.file,import.meta.url));
  assert.equal(bytes.length,descriptor.bytes);assert.equal(sha(bytes),descriptor.sha256);
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(bytes),oldManifest,descriptor)){heads++;pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);assert.deepEqual(built.get(term),row);}}
 assert.equal(heads,82339);assert.equal(pairs,83728);
});
test('new sources append after all505 old sources without reordering them',async()=>{
 const index=await json('../dictionary/examples/index.json');assert.equal(provenance.baselineSourceFiles.length,505);
 assert.deepEqual(index.sourceFiles.slice(0,505),provenance.baselineSourceFiles);for(const{file}of packs)assert(index.sourceFiles.includes(file));
});
test('all current example shards pass actual client parser, byte sizes and SHA checks',async()=>{
 const manifest=parseDictionaryExamplesManifest(await json('../../vocab/data/dictionary-examples/manifest-v2.json'));let heads=0,pairs=0;
 for(const descriptor of manifest.shards){const bytes=await readFile(new URL('../../vocab/data/dictionary-examples/'+descriptor.file,import.meta.url));assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);
  for(const row of parseDictionaryExamplesShard(JSON.parse(bytes),manifest,descriptor).values()){heads++;pairs+=row.senses.reduce((n,s)=>n+s.examples.length,0);}}
 assert.deepEqual(manifest.counts,{heads,examples:pairs});assert.equal(manifest.version,build.manifest.version);
});
