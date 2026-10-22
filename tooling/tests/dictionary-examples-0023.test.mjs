// D23 data regression: exact three reentries, never a rewrite of earlier opinions.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {loadExampleBuild,exampleSourceHash,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';
import {composePosNotationExampleSource,verifyPosNotationAdmissionReceipt} from '../scripts/admit-pos-notation-examples.mjs';
import {readDictionaryNamespace,readHistoricalDictionaryNamespace,assertExactPosNotationNamespace,
 assertHistoricalDictionaryLineage,SOURCE_LINEAGE_NOTATION_BASE_VERSION} from '../lib/dictionary-source-lineage.mjs';
import {verifyDictionaryPosNotationRevisions} from '../lib/dictionary-pos-notation-revisions.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';

const root=new URL('../../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>readFile(new URL(file,root)),json=async file=>JSON.parse(await read(file));
const terms=['headdress','longingly','moonless'];
const sourceVersion='5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432';
const oldExampleVersion='e929d35b959c01772ab80d36db38775c7ecf8d4490c28c6928a3d29674f30ebc';
const exampleVersion='4506265fab099d7b70a59bb3667ab8276c083f14c66f4d149cacf73c5c7e8f92';
const sourcePrefix='tooling/dictionary/source-revisions/finite-pos-notation-0001';
const pack=await json(sourcePrefix+'.json'),integrity=await json(sourcePrefix+'.integrity.json'),originalReview=await json(sourcePrefix+'.review.json');
const verified=verifyDictionaryPosNotationRevisions(pack,integrity,originalReview);
const diskReceiptBytes=await read(sourcePrefix+'.admission-review.json');
assert.equal(diskReceiptBytes.length,21487);assert.equal(sha(diskReceiptBytes),'7b5b3cb13e10be6d1e9989bc0585e838a860a16ff479d71cb54dc9b12b4f11b1');
const currentManifestBytes=await read('vocab/data/expanded-dictionary/manifest.json'),currentManifest=JSON.parse(currentManifestBytes);
const manifestBytes=await read('tooling/dictionary/source-revisions/baseline-'+sourceVersion+'.manifest.json');
assert.equal(manifestBytes.length,54705);assert.equal(sha(manifestBytes),'da424df6edf245db2da69925a1c6e5e2d0936f3458709aa0ded1dde82983a82b');
const manifest=JSON.parse(manifestBytes),namespace=await readDictionaryNamespace(manifest,fileURLToPath(new URL('vocab/data/expanded-dictionary/',root)));
const currentNamespace=await readDictionaryNamespace(currentManifest,fileURLToPath(new URL('vocab/data/expanded-dictionary/',root)));
const precedingNamespace=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_NOTATION_BASE_VERSION);
const diskReceipt=verifyPosNotationAdmissionReceipt(diskReceiptBytes,manifestBytes,pack,integrity,originalReview);
const sourceBytes=await read('tooling/dictionary/examples/source/batch-0023-p001.json');
const reviewBytes=await read('tooling/dictionary/examples/reviews/batch-0023-p001.json');
const source=JSON.parse(sourceBytes),review=JSON.parse(reviewBytes),approved=validateExampleReview(source,review);
const queue=await json('tooling/dictionary/examples/queues/batch-0023.json');
const provenance=await json('tooling/dictionary/examples/queues/batch-0023-provenance.json');
const outcome=await json('tooling/dictionary/examples/queues/batch-0023-outcome.json');
const build=await loadExampleBuild(),currentEntries=new Map(build.entries.map(entry=>[entry.term,entry]));

const oldManifestBytes=await read('tooling/dictionary/examples/archives/baseline-'+oldExampleVersion+'.manifest.json');
assert.equal(oldManifestBytes.length,57577);assert.equal(sha(oldManifestBytes),'27ec47fe51962cacf4a1829eb8c3bf71d4d2ea4bcd9eea39f92cba43863c86e1');
const oldManifest=parseDictionaryExamplesManifest(JSON.parse(oldManifestBytes)),oldEntries=new Map();let oldPairs=0;
const normalizedEnglish=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const oldEnglish=new Set();
for(const descriptor of oldManifest.shards){
 const bytes=await read('vocab/data/dictionary-examples/'+descriptor.file);assert.equal(bytes.length,descriptor.bytes);assert.equal(sha(bytes),descriptor.sha256);
 for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(bytes),oldManifest,descriptor)){
  assert(!oldEntries.has(term));oldEntries.set(term,row);
  for(const sense of row.senses)for(const pair of sense.examples){oldPairs++;oldEnglish.add(normalizedEnglish(pair.en));}
 }
}

test('D23 complete frozen corrected source is exactly5c82; current registered lineage is independent',async()=>{
 assert.equal(manifest.version,sourceVersion);assert.equal(manifest.english.shards.length,128);assert.equal(manifest.chinese.shards.length,128);
 assert.equal(namespace.records.size,102609);
 const lineage=assertExactPosNotationNamespace(precedingNamespace,namespace,verified);
 assert.deepEqual(lineage,provenance.sourceLineage);assert.deepEqual(lineage.changedTerms,terms);assert.equal(lineage.unchangedRecords,102606);
 assert.equal(lineage.englishReferencesUnchanged,true);assert.equal(lineage.chinesePostingsUnchanged,true);
 for(const entry of verified.pack.entries){assert.deepEqual(namespace.records.get(entry.term),entry.after);assert.equal(sha(JSON.stringify(namespace.records.get(entry.term))),entry.afterSha256);}
 assert.deepEqual(namespace.records.get('headdress').forms,['headdresses']);
 const currentLineage=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_NOTATION_BASE_VERSION,currentManifest,currentNamespace.records);
 assert.equal(currentLineage.historicalVersion,SOURCE_LINEAGE_NOTATION_BASE_VERSION);assert.equal(currentLineage.currentVersion,currentManifest.version);
});

test('D23 source and mapped review retain the exact independently read three whole pairs',()=>{
 assert.equal(sha(sourceBytes),'b80b59aa60da7fc4832ff4b1879b30d9c8b0d826f3779678143b7ae8f9eed6a5');
 assert.equal(sha(reviewBytes),'1521c8cd8a47593131d7b1edb802f1659a01e8fdf3ba0270be4ac8e19f75e1f6');
 const expected=composePosNotationExampleSource(pack,integrity,originalReview);assert.deepEqual(source,expected.source);assert.deepEqual(review,expected.review);
 assert.equal(source.batchId,'examples-0023-p001');assert.equal(review.sourceSha256,exampleSourceHash(source));
 assert.equal(review.reviewer,'AI/examples23_reviewer_e');assert.equal(review.independentOfAuthor,true);assert.deepEqual(review.approvedTerms,terms);
 assert.equal(approved.length,3);assert.deepEqual(approved.map(row=>row.term),terms);
 assert.equal(diskReceipt.authorPrincipal,'c');assert.equal(diskReceipt.pairAuthorPrincipal,'root');assert.equal(diskReceipt.reviewerPrincipal,'e');
 for(const[index,row]of approved.entries()){
  const opinion=diskReceipt.perTerm[index],cells=[row.term,row.partOfSpeech,row.meaningZh,row.en,row.zh];
  assert.deepEqual(cells,opinion.pair);assert.equal(sha(cells.join('\t')),opinion.pairSha256);assert.deepEqual(namespace.records.get(row.term),opinion.actualSource);
  const installed=currentEntries.get(row.term);assert.equal(installed.senses.length,1);const sense=installed.senses[0];
  assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaningZh);assert.equal(sense.reviewer,review.reviewer);
  assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);
 }
});

test('all three original historical holds retain complete raw hashes, pointers and reasons',async()=>{
 assert.equal(queue.queuedHeads,3);assert.deepEqual(queue.entries,provenance.sourceQueues);assert.equal(queue.oldHoldsRetained,true);
 assert.deepEqual(provenance.sourceQueues.map(row=>row.term),terms);
 for(const entry of verified.pack.entries){
  const recorded=provenance.sourceQueues.find(row=>row.term===entry.term),opinion=diskReceipt.perTerm.find(row=>row.term===entry.term);
  assert.deepEqual(recorded.historicalHolds,entry.history.priorHolds);assert.deepEqual(opinion.priorHolds,entry.history.priorHolds);
  assert.equal(recorded.sourceAuthorPrincipal,'c');assert.equal(recorded.authorPrincipal,'root');assert.equal(recorded.reviewerPrincipal,'e');
  assert.deepEqual(recorded.source,entry.after);assert.equal(recorded.sourceSha256,entry.afterSha256);
  for(const hold of recorded.historicalHolds){const bytes=await read('tooling/dictionary/examples/queues/'+hold.outcomeFile);assert.equal(sha(bytes),hold.outcomeFileSha256);
   const original=hold.pointer.split('/').slice(1).reduce((value,key)=>value[key],JSON.parse(bytes));assert.deepEqual(original,hold.raw);assert(hold.raw.reason.trim());}
  assert.equal(entry.history.oldHoldClosed,false);assert.equal(opinion.historicalHoldsEdited,false);
 }
});

test('all old531 source-index entries remain in exact original order, followed only by the new pack',async()=>{
 assert.equal(provenance.baselineSourceFiles.length,531);assert.equal(provenance.baselineSourceFiles.at(-1),'batch-0022-p003.json');
 const oldIndexBytes=Buffer.from(JSON.stringify({schemaVersion:1,sourceFiles:provenance.baselineSourceFiles},null,2)+'\n');
 assert.equal(oldIndexBytes.length,14592);assert.equal(sha(oldIndexBytes),'69e2f317cb0c2ebb52d59ffcb5be539e835d7ec930eb0d3ad0bf402a0feea58a');
 assert.deepEqual(provenance.inputs.find(row=>row.file==='tooling/dictionary/examples/index.json'),
  {file:'tooling/dictionary/examples/index.json',bytes:14592,sha256:'69e2f317cb0c2ebb52d59ffcb5be539e835d7ec930eb0d3ad0bf402a0feea58a'});
 const index=await json('tooling/dictionary/examples/index.json');assert.equal(index.sourceFiles.length,532);
 assert.deepEqual(index.sourceFiles,[...provenance.baselineSourceFiles,'batch-0023-p001.json']);assert.equal(new Set(index.sourceFiles).size,532);
});

test('all85259 old heads and86648 whole bilingual pairs are unchanged and exactly three new heads exist',()=>{
 assert.equal(oldManifest.version,oldExampleVersion);assert.equal(oldManifest.shards.length,256);assert.deepEqual(oldManifest.counts,{heads:85259,examples:86648});
 assert.equal(oldEntries.size,85259);assert.equal(oldPairs,86648);
 for(const[term,row]of oldEntries)assert.deepEqual(currentEntries.get(term),row,'Changed historical whole entry '+term);
 assert.deepEqual([...currentEntries.keys()].filter(term=>!oldEntries.has(term)).sort(),[...terms].sort());
 const oldSorted=[...oldEntries.values()].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
 assert.equal(sha(JSON.stringify({schemaVersion:2,bucketCount:256,entries:oldSorted})),oldExampleVersion);
 const allNewEnglish=new Set();
 for(const term of terms)for(const sense of currentEntries.get(term).senses)for(const pair of sense.examples){
  const key=normalizedEnglish(pair.en);assert(!oldEnglish.has(key),'New English duplicates an earlier whole example');assert(!allNewEnglish.has(key));allNewEnglish.add(key);
 }
 assert.equal(allNewEnglish.size,3);
 const fullEnglishOwners=new Map();
 for(const[term,row]of currentEntries)for(const sense of row.senses)for(const pair of sense.examples){
  const key=normalizedEnglish(pair.en),owner=fullEnglishOwners.get(key);
  assert(owner===undefined||owner===term,'Normalized English is reused across different headwords');fullEnglishOwners.set(key,term);
 }
});

test('actual new build independently proves85262heads86651pairs while original prebuild facts stay0coverage',async()=>{
 assert.equal(build.manifest.version,exampleVersion);
 assert.deepEqual(build.manifest.counts,{heads:85262,examples:86651});assert.equal(102609-build.manifest.counts.heads,17347);
 assert.equal(build.manifest.shards.length,256);const bytes=await read('vocab/data/dictionary-examples/manifest-v2.json');assert.deepEqual(bytes,build.files.get('manifest-v2.json'));
 assert.equal(sha(bytes),'f363840f5fcce67f80a0949fd0567383ebf08a00873e69e3543bc2ad7411621b');
 const actual=parseDictionaryExamplesManifest(JSON.parse(bytes));assert.equal(actual.version,build.manifest.version);
 let heads=0,pairs=0;
 for(const descriptor of actual.shards){const content=await read('vocab/data/dictionary-examples/'+descriptor.file);assert.equal(content.length,descriptor.bytes);assert.equal(sha(content),descriptor.sha256);assert.deepEqual(content,build.files.get(descriptor.file));
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(content),actual,descriptor)){heads++;pairs+=row.senses.reduce((total,sense)=>total+sense.examples.length,0);assert.deepEqual(row,currentEntries.get(term));}}
 assert.equal(heads,85262);assert.equal(pairs,86651);
 assert.equal(outcome.beforeHeads,85259);assert.equal(outcome.beforeExamples,86648);assert.equal(outcome.plannedAfterHeads,85262);
 assert.equal(outcome.plannedAfterExamples,86651);assert.equal(outcome.plannedRemainingHeads,17347);assert.deepEqual(outcome.deferred,[]);
 assert.equal(outcome.actualCoverageAdded,0);assert.equal(provenance.coverageAdded,0);assert.equal(provenance.newLanguageDecisions,0);
 assert.equal(outcome.examplesBuilt,false);assert.equal(provenance.examplesBuilt,false);assert.equal(outcome.complete,false);
 assert.equal(outcome.published,false);assert.equal(provenance.published,false);assert.equal(diskReceipt.scope.exampleAdmission,0);
 assert.equal(provenance.stage,'three-exact-reviewed-example-sources-admitted-not-built-not-published');
 assert.equal(outcome.stage,provenance.stage);
});
