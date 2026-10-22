// D24 is an exact historical five-source reentry, not a rebase of earlier opinions.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {loadExampleBuild,exampleSourceHash,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';
import {composeSemanticExampleSource} from '../lib/semantic-example-composition.mjs';
import {SEMANTIC_REVISION_PROOF_FILES} from '../lib/dictionary-semantic-revisions.mjs';
import {readDictionaryNamespace,readHistoricalDictionaryNamespace,assertExactSemanticNamespace,
 assertHistoricalDictionaryLineage,loadVerifiedSemanticRevision,SOURCE_LINEAGE_SEMANTIC_BASE_VERSION} from '../lib/dictionary-source-lineage.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';

const root=new URL('../../',import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex');
const read=file=>readFile(new URL(file,root)),json=async file=>JSON.parse(await read(file));
const semantic=value=>sha(JSON.stringify(value));
const normalizedEnglish=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const terms=['affordable','discretionary','download','competitiveness','revitalization'];
const sourceVersion='cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644';
const oldVersion='4506265fab099d7b70a59bb3667ab8276c083f14c66f4d149cacf73c5c7e8f92';
const version='9d88df54348516f0c4d6d554e0eb49348512a6026c693bae5ee88ad0959e0210';
const sourceManifestBytes=await read('tooling/dictionary/source-revisions/baseline-'+sourceVersion+'.manifest.json');
assert.equal(sourceManifestBytes.length,55060);assert.equal(sha(sourceManifestBytes),'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f');
const sourceManifest=JSON.parse(sourceManifestBytes),directory=fileURLToPath(new URL('vocab/data/expanded-dictionary/',root));
const namespace=await readDictionaryNamespace(sourceManifest,directory);
const precedingNamespace=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_SEMANTIC_BASE_VERSION);
const actualManifestBytes=await read('vocab/data/expanded-dictionary/manifest.json'),actualManifest=JSON.parse(actualManifestBytes);
const actualNamespace=actualManifestBytes.equals(sourceManifestBytes)?namespace:await readDictionaryNamespace(actualManifest,directory);
const proofs=Object.fromEntries(await Promise.all(Object.entries(SEMANTIC_REVISION_PROOF_FILES).map(async([key,file])=>[key,(await read('tooling/dictionary/source-revisions/'+file)).toString('utf8')])));
const candidate=JSON.parse(proofs.candidateText),originalReview=JSON.parse(proofs.reviewText);
const receiptBytes=await read('tooling/dictionary/source-revisions/semantic-common-five-0001.admission-review.json');
assert.equal(receiptBytes.length,40695);assert.equal(sha(receiptBytes),'884e97084b914d8259f951efb0040e716828e6de4e66d06326256182b6b43638');
const receipt=JSON.parse(receiptBytes);
const sourceBytes=await read('tooling/dictionary/examples/source/batch-0024-p001.json');
const reviewBytes=await read('tooling/dictionary/examples/reviews/batch-0024-p001.json');
assert.equal(sha(sourceBytes),'bcd45424c637f4c1ebd390de61c375b8a7a9fd0478fd29e6f0607b6f9093d472');
assert.equal(sha(reviewBytes),'116767cb53c6cbe6e85c586c13f6872e469a8aa12a5834c5b196ba89fe3cfbd7');
const source=JSON.parse(sourceBytes),review=JSON.parse(reviewBytes),approved=validateExampleReview(source,review);
const provenanceBytes=await read('tooling/dictionary/examples/queues/batch-0024-provenance.json');
assert.equal(sha(provenanceBytes),'830604f402655af18086e0e8e60e83f62defb8c28708b9781fb308485d13d811');
const provenance=JSON.parse(provenanceBytes),queue=await json('tooling/dictionary/examples/queues/batch-0024.json'),outcome=await json('tooling/dictionary/examples/queues/batch-0024-outcome.json');
const currentBuild=await loadExampleBuild(),currentEntries=new Map(currentBuild.entries.map(row=>[row.term,row]));

async function frozenExamples(expectedVersion,expectedSha,heads,pairs){
 const bytes=await read('tooling/dictionary/examples/archives/baseline-'+expectedVersion+'.manifest.json');
 assert.equal(bytes.length,57577);assert.equal(sha(bytes),expectedSha);
 const manifest=parseDictionaryExamplesManifest(JSON.parse(bytes)),entries=new Map();let pairCount=0;
 assert.equal(manifest.version,expectedVersion);assert.equal(manifest.shards.length,256);assert.deepEqual(manifest.counts,{heads,examples:pairs});
 for(const descriptor of manifest.shards){
  const content=await read('vocab/data/dictionary-examples/'+descriptor.file);assert.equal(content.length,descriptor.bytes);assert.equal(sha(content),descriptor.sha256);
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(content),manifest,descriptor)){
   assert(!entries.has(term));entries.set(term,row);pairCount+=row.senses.reduce((total,sense)=>total+sense.examples.length,0);
  }
 }
 assert.equal(entries.size,heads);assert.equal(pairCount,pairs);
 const sorted=[...entries.values()].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
 assert.equal(semantic({schemaVersion:2,bucketCount:256,entries:sorted}),expectedVersion);
 return{manifest,entries,pairs:pairCount};
}
const old=await frozenExamples(oldVersion,'f363840f5fcce67f80a0949fd0567383ebf08a00873e69e3543bc2ad7411621b',85262,86651);
const historical=await frozenExamples(version,'b73f2da425af9350b6ed1b4f4ebd14681f024202e11353c51d5801b610253c61',85267,86656);

test('D24 exact frozen cabcf source is independently linked to5c82, while current registered lineage is separate',async()=>{
 assert.equal(sourceManifest.version,sourceVersion);assert.equal(namespace.records.size,102609);assert.equal(namespace.keys.size,140858);assert.equal(namespace.tokens.size,160083);
 const transition=assertExactSemanticNamespace(precedingNamespace,namespace,await loadVerifiedSemanticRevision());
 assert.deepEqual(transition,provenance.sourceLineage);assert.equal(transition.unchangedRecords,102604);assert.equal(transition.changedChineseTokens,131);
 assert.equal(transition.englishReferencesUnchanged,true);assert.equal(transition.nonTargetChinesePostingsUnchanged,true);assert.equal(transition.exactTargetChinesePostingsVerified,true);
 for(const row of candidate.entries){assert.deepEqual(namespace.records.get(row.term),row.afterCandidate);assert.equal(semantic(namespace.records.get(row.term)),row.afterCandidateSha256);}
 const currentLineage=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_SEMANTIC_BASE_VERSION,actualManifest,actualNamespace.records);
 assert.equal(currentLineage.historicalVersion,SOURCE_LINEAGE_SEMANTIC_BASE_VERSION);assert.equal(currentLineage.currentVersion,actualManifest.version);
});

test('D24 exact source/review retain only the original five whole pairs and genuine separate actual-disk C opinion',()=>{
 const expected=composeSemanticExampleSource(proofs);assert.deepEqual(source,expected.source);assert.deepEqual(review,expected.review);
 assert.equal(source.batchId,'examples-0024-p001');assert.equal(review.sourceSha256,exampleSourceHash(source));assert.equal(review.reviewer,'AI/examples24_reviewer_c');
 assert.equal(review.independentOfAuthor,true);assert.deepEqual(review.approvedTerms,terms);assert.deepEqual(review.issues,[]);assert.equal(approved.length,5);
 assert.equal(receipt.authorPrincipal,'root');assert.equal(receipt.pairAuthorPrincipal,'root');assert.equal(receipt.sourceGeneratorPrincipal,'root');assert.equal(receipt.runtimeProposalAuthorPrincipal,'e');assert.equal(receipt.reviewerPrincipal,'c');
 assert.equal(receipt.actualDictionaryVersion,sourceVersion);assert.equal(receipt.actualSourceManifest.sha256,sha(sourceManifestBytes));assert.equal(receipt.actualSourceLocallyInstalledObserved,true);
 for(const[index,row]of approved.entries()){
  const entry=candidate.entries[index],opinion=receipt.perTerm[index],cells=[row.term,row.partOfSpeech,row.meaningZh,row.en,row.zh];
  assert.deepEqual(cells,entry.pair);assert.deepEqual(cells,opinion.pair);assert.equal(sha(cells.join('\t')),entry.pairSha256);assert.equal(opinion.pairTSVSha256,entry.pairSha256);
  assert.equal(opinion.actualSourceAndPairApproved,true);assert.equal(opinion.exactSourceAndPairReentryOnly,true);assert.equal(opinion.exampleAdmitted,false);
  assert.deepEqual(namespace.records.get(row.term),opinion.actualSource);assert.equal(semantic(opinion.actualSource),entry.afterCandidateSha256);
  const installed=historical.entries.get(row.term);assert.equal(installed.senses.length,1);const sense=installed.senses[0];
  assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaningZh);assert.equal(sense.reviewer,review.reviewer);assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);
 }
 assert.equal(originalReview.scopeConclusions.sourceApplied,0);assert.equal(originalReview.scopeConclusions.admissionAdded,0);
});

test('all nine older holds stay raw-identical at the genuinely discovered C pointers; no prior opinion is overwritten',async()=>{
 assert.equal(queue.queuedHeads,5);assert.equal(queue.oldHoldsRetained,true);assert.deepEqual(queue.entries,provenance.sourceQueues);
 assert.deepEqual(queue.entries.map(row=>row.term),terms);let count=0;
 for(const entry of candidate.entries){
  const queued=queue.entries.find(row=>row.term===entry.term),opinion=receipt.perTerm.find(row=>row.term===entry.term);
  assert.deepEqual(queued.historicalHolds,entry.retainedHolds);assert.deepEqual(queued.source,entry.afterCandidate);assert.equal(queued.sourceSha256,entry.afterCandidateSha256);
  assert.equal(queued.sourceAuthorPrincipal,'root');assert.equal(queued.authorPrincipal,'root');assert.equal(queued.reviewerPrincipal,'c');
  for(const[index,hold]of queued.historicalHolds.entries()){
   const original=opinion.priorHolds[index];assert.equal(original.file.split(/[\\/]/u).at(-1),hold.outcomeFile);assert.deepEqual(original.raw,hold.raw);assert.equal(original.fileSha256,hold.outcomeFileSha256);
   const bytes=await read('tooling/dictionary/examples/queues/'+hold.outcomeFile);assert.equal(sha(bytes),hold.outcomeFileSha256);assert.equal(bytes.length,original.fileBytes);
   const raw=original.pointer.split('/').slice(1).map(key=>key.replaceAll('~1','/').replaceAll('~0','~')).reduce((value,key)=>value[key],JSON.parse(bytes));
   assert.deepEqual(raw,hold.raw);assert.equal(semantic(raw),original.rawSemanticSha256);assert(hold.raw.reason.trim());count++;
  }
 }
 assert.equal(count,9);assert.equal(receipt.oldHistoricalHoldCount,9);assert.equal(receipt.oldHoldsRewritten,false);
});

test('D24 frozen index is exactly old532 plus its one pack, and the current index retains that whole prefix',async()=>{
 assert.equal(provenance.baselineSourceFiles.length,532);assert.equal(provenance.baselineSourceFiles.at(-1),'batch-0023-p001.json');
 const beforeBytes=Buffer.from(JSON.stringify({schemaVersion:1,sourceFiles:provenance.baselineSourceFiles},null,2)+'\n');
 assert.equal(beforeBytes.length,14620);assert.equal(sha(beforeBytes),'9f6d3926d2387add0f8273c34324e55fba7f8c720f0e99b7dcc1329fbd3a6d07');
 assert.deepEqual(provenance.inputs.find(row=>row.file==='tooling/dictionary/examples/index.json'),{file:'tooling/dictionary/examples/index.json',bytes:14620,sha256:'9f6d3926d2387add0f8273c34324e55fba7f8c720f0e99b7dcc1329fbd3a6d07'});
 const files=[...provenance.baselineSourceFiles,'batch-0024-p001.json'];assert.equal(files.length,533);assert.equal(new Set(files).size,533);
 const bytes=Buffer.from(JSON.stringify({schemaVersion:1,sourceFiles:files},null,2)+'\n');assert.equal(bytes.length,14648);assert.equal(sha(bytes),'3d534e73d1a7328b35707909efe5af61f0bc4f10f50bdd4be2abb0e3947f0916');
 const index=await json('tooling/dictionary/examples/index.json');assert(index.sourceFiles.length>=533);assert.deepEqual(index.sourceFiles.slice(0,533),files);assert.equal(new Set(index.sourceFiles).size,index.sourceFiles.length);
});

test('all old85262 whole entries and86651 pairs stay exact and only five novel selected pairs entered the D24 corpus',()=>{
 for(const[term,row]of old.entries)assert.deepEqual(historical.entries.get(term),row,'Changed older whole entry '+term);
 assert.deepEqual([...historical.entries.keys()].filter(term=>!old.entries.has(term)).sort(),[...terms].sort());
 const oldEnglish=new Set();for(const row of old.entries.values())for(const sense of row.senses)for(const pair of sense.examples)oldEnglish.add(normalizedEnglish(pair.en));
 const newEnglish=new Set();for(const term of terms)for(const sense of historical.entries.get(term).senses)for(const pair of sense.examples){const key=normalizedEnglish(pair.en);assert(!oldEnglish.has(key));assert(!newEnglish.has(key));newEnglish.add(key);}
 assert.equal(newEnglish.size,5);
 const owners=new Map();for(const[term,row]of historical.entries)for(const sense of row.senses)for(const pair of sense.examples){const key=normalizedEnglish(pair.en),prior=owners.get(key);assert(prior===undefined||prior===term);owners.set(key,term);}
 assert.equal(historical.entries.size,85267);assert.equal(historical.pairs,86656);assert.equal(102609-historical.entries.size,17342);
});

test('original admission provenance/outcome and C reentry keep their prebuild zero-coverage stage unchanged',()=>{
 assert.equal(outcome.beforeHeads,85262);assert.equal(outcome.beforeExamples,86651);assert.equal(outcome.plannedAfterHeads,85267);assert.equal(outcome.plannedAfterExamples,86656);assert.equal(outcome.plannedRemainingHeads,17342);
 assert.deepEqual(outcome.deferred,[]);assert.equal(outcome.actualCoverageAdded,0);assert.equal(provenance.coverageAdded,0);assert.equal(provenance.newLanguageDecisions,0);
 assert.equal(outcome.examplesBuilt,false);assert.equal(provenance.examplesBuilt,false);assert.equal(outcome.published,false);assert.equal(provenance.published,false);assert.equal(outcome.complete,false);
 assert.equal(provenance.stage,'five-exact-reviewed-example-sources-admitted-not-built-not-published');assert.equal(outcome.stage,provenance.stage);
 assert.equal(receipt.scope.importerCodeApproval,false);assert.equal(receipt.scope.exampleAdmission,0);assert.equal(receipt.scope.coverageAdded,0);assert.equal(receipt.scope.published,false);
});

test('every D24 historical whole entry survives in the separately rebuilt and raw-checked current corpus',async()=>{
 for(const[term,row]of historical.entries)assert.deepEqual(currentEntries.get(term),row,'Changed historical D24 entry '+term);
 const bytes=await read('vocab/data/dictionary-examples/manifest-v2.json');assert.deepEqual(bytes,currentBuild.files.get('manifest-v2.json'));
 const actual=parseDictionaryExamplesManifest(JSON.parse(bytes));assert.equal(actual.version,currentBuild.manifest.version);assert.equal(actual.shards.length,256);
 let heads=0,pairs=0;
 for(const descriptor of actual.shards){const content=await read('vocab/data/dictionary-examples/'+descriptor.file);assert.equal(content.length,descriptor.bytes);assert.equal(sha(content),descriptor.sha256);assert.deepEqual(content,currentBuild.files.get(descriptor.file));
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(content),actual,descriptor)){heads++;pairs+=row.senses.reduce((total,sense)=>total+sense.examples.length,0);assert.deepEqual(row,currentEntries.get(term));}}
 assert.deepEqual(actual.counts,{heads,examples:pairs});assert(heads>=85267);assert(pairs>=86656);
});
