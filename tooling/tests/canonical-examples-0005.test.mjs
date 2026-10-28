import test from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{CANONICAL_EXAMPLE_REPAIRS as table}from'../../vocab/js/canonical-example-repairs-data.js';
import{loadDictionaryExamples,resetDictionaryExamplesCacheForTests}from'../../vocab/js/dictionary-examples-current-v4.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=async file=>JSON.parse(await readFile(new URL('../dictionary/examples/canonical-repairs/'+file,import.meta.url),'utf8'));
const source=await read('source/canonical-quality-0005.json'),review=await read('reviews/canonical-quality-0005.json'),proof=await read('canonical-quality-0005-provenance.json');

test('batch0005 admits exactly18 independent source-bound pairs without changing canonical meanings',()=>{
 assert.equal(hash(source),'70b829c2d954023966dd488c16d465e86e31a789feaa9840f366537c97bd3e90');assert.equal(hash(review),'50c0e0d945138b8b63944361f641a77b7be97f5abb6b6ac071fe662281992066');
 assert.equal(review.sourceSha256,hash(source));assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,source.author);assert.deepEqual(review.issues,[]);
 assert.equal(source.entries.length,18);assert.equal(review.decisions.length,18);assert.equal(table.rows.length,69);assert.equal(table.rows.reduce((n,r)=>n+1+(r.additionalExamples?.length??0),0),70);assert.equal(hash(table.rows),proof.compiledRowsSha256);
 for(const row of source.entries){
  const decision=review.decisions.find(d=>d.term===row.term);assert.equal(decision?.decision,'approve-canonical-example-repair');assert.equal(decision.rowSha256,hash(row));
  const compiled=table.rows.find(r=>r.term===row.term);assert(compiled,row.term);
  for(const key of['canonicalId','canonicalSourceSha256','exactCanonicalRecord','canonicalSourceDescriptor','expectedOriginalEntry','expectedOriginalEntrySha256','acceptedDisplayContexts','replacementPair'])assert.deepEqual(compiled[key],row[key],row.term+'/'+key);
  assert.equal(row.replacementPair.partOfSpeech,row.exactCanonicalRecord.partOfSpeech);assert.equal(row.replacementPair.meaningZh,row.exactCanonicalRecord.meaning);assert.notEqual(compiled.senseId,row.expectedOriginalEntry.senses[0].id);
 }
});

test('the51 published rows and52 pairs remain exact after the18 new rows append',()=>{
 assert.equal(proof.baselineHead,'af2081aab55a7e85ed4ed4c3cb0ed387c3d6d739');assert.equal(proof.beforeRows.length,51);assert.equal(proof.newHeads,18);assert.equal(proof.newPairs,18);assert.equal(proof.combinedHeads,69);assert.equal(proof.combinedPairs,70);
 assert.equal(hash(source),proof.sourceSha256);assert.equal(hash(review),proof.reviewSha256);
 const old=proof.beforeRows.map(r=>{const row=table.rows.find(x=>x.term===r.term);assert.equal(hash(row),r.sha256,r.term);return row;});assert.equal(old.reduce((n,r)=>n+1+(r.additionalExamples?.length??0),0),52);
});

test('new examples fit36 exact saved contexts and reject54 different saved identities without mutation',async()=>{
 const fetchImpl=async url=>new Response(await readFile(new URL(url)));let accepted=0,rejected=0;
 for(const row of source.entries){
  for(const identity of row.acceptedDisplayContexts){
   const card={...identity,example:'My saved sentence.',bookPassage:'Keep this original book passage.',study:{box:4}},before=structuredClone(card);
   const result=await loadDictionaryExamples(row.term,{fetchImpl,savedEntry:card});assert(result,row.term);assert.deepEqual(result.senses[0].examples,[{en:row.replacementPair.en,zh:row.replacementPair.zh}]);assert.deepEqual(card,before);accepted++;
  }
  const old=row.expectedOriginalEntry.senses[0];
  for(const identity of[{partOfSpeech:old.partOfSpeech,meaning:old.meaningZh},{partOfSpeech:'interjection',meaning:row.exactCanonicalRecord.meaning},{partOfSpeech:row.exactCanonicalRecord.partOfSpeech,meaning:'An unrelated saved meaning.'}]){
   const card={term:row.term,...identity,example:'My saved sentence.',study:{box:3}},before=structuredClone(card);let reads=0;
   assert.equal(await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:async()=>{reads++;throw Error('Wrong saved identity must stop before loading');}}),null,row.term);assert.equal(reads,0);assert.deepEqual(card,before);rejected++;
  }
 }
 assert.equal(accepted,36);assert.equal(rejected,54);resetDictionaryExamplesCacheForTests();
});
