import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DICTIONARY_EXAMPLE_CORRECTIONS as compiled} from '../../vocab/js/dictionary-example-corrections-data.js';
import {applyExampleCorrections} from '../../vocab/js/dictionary-example-corrections.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {exampleSourceHash} from '../scripts/build-dictionary-examples.mjs';
import {independentlyReviewedCorrections,correctionFromReviewedPair} from '../scripts/build-dictionary-example-corrections.mjs';
import {historicalCorrections83,HISTORICAL_83_ROWS,HISTORICAL_83_SHA256} from './helpers/correction-history-0083.mjs';
const root=new URL('../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex'),hash=v=>sha(JSON.stringify(v));
const bytes=file=>fs.readFile(new URL(file,root)),read=async file=>JSON.parse(await bytes(file));
const fixtureFile='tooling/dictionary/examples/evidence/translation-precision-0022-fixture.json';
const fixtureBytes=await bytes(fixtureFile);assert.equal(sha(fixtureBytes),'67b030faad70ca397fc290ae2a2737c0363be15ff0dbd9439239128b104e25e3');
const fixture=JSON.parse(fixtureBytes),fetchImpl=async input=>new Response(await fs.readFile(new URL(input)));

test('current124 is exactly the unchanged historical83 and41 independently approved Chinese-only repairs',()=>{
 assert.equal(fixture.rows.length,41);assert.equal(compiled.length,124);assert.equal(new Set(compiled.map(row=>row.term)).size,124);
 assert.deepEqual(fixture.baselineCorrectionRows,HISTORICAL_83_ROWS);assert.equal(fixture.baselineCorrectionSha256,HISTORICAL_83_SHA256);assert.deepEqual(historicalCorrections83(compiled),HISTORICAL_83_ROWS);
 const expected=[...HISTORICAL_83_ROWS,...fixture.rows.map(row=>row.compiledCorrection)].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);assert.deepEqual(compiled,expected);
 assert.equal(hash(compiled),'6cd71e67212923ac16ff6d7805bc7fe7b33c83b269d3f1e50a80f18b57b5c636');
 assert.equal(fixture.originalEnglishAuthorshipInferred,false);assert.equal(fixture.allRawCanonicalMeaningsApproved,false);assert.equal(fixture.originalSourceCorpusChanged,false);assert.equal(fixture.userSavedCardOrBookFieldsChanged,false);
});

test('the41-row source has separate Chinese authorship and independent review, with no held role forced into admission',async()=>{
 const source=await read(fixture.sourceFile),review=await read(fixture.reviewFile),index=await read('tooling/dictionary/examples/corrections/index.json');
 assert.equal(sha(await bytes(fixture.sourceFile)),fixture.sourceByteSha256);assert.equal(sha(await bytes(fixture.reviewFile)),fixture.reviewByteSha256);
 assert.equal(exampleSourceHash(source),'8fbf27ffbeef1fd4790fcd90e41b67caabe35567d85af58eb6b090495629f669');assert.equal(review.sourceSha256,exampleSourceHash(source));assert.notEqual(source.author,review.reviewer);assert.equal(review.independentOfAuthor,true);assert.deepEqual(review.issues,[]);
 assert.deepEqual(independentlyReviewedCorrections(source,review).map(row=>row.term),fixture.rows.map(row=>row.term));
 const batch=index.batches.find(row=>row.sourceFile==='quality-precision-0022.json');assert(batch);assert.deepEqual(Object.keys(batch.origins),fixture.rows.map(row=>row.term));
 assert.deepEqual(fixture.notAdmitted,['catherine','aberdeen','organisational','mickey']);for(const term of fixture.notAdmitted){assert(!compiled.some(row=>row.term===term));assert(!source.entries.some(row=>row.term===term));assert(!Object.hasOwn(batch.origins,term));}
});

for(const row of fixture.rows)test(`${row.term}: preserve exact English, POS, selected label and original DTO while correcting only its Chinese slot`,async()=>{
 const source=await read(row.sourceFile),review=await read(row.reviewFile),pair=independentlyReviewedCorrections(source,review).find(pair=>pair.term===row.term);assert(pair);
 assert.equal(sha(await bytes(row.originalSourceFile)),row.originalSourceByteSha256);assert.equal(sha(await bytes(row.originalReviewFile)),row.originalReviewByteSha256);assert.deepEqual((await read(row.originalSourceFile)).entries[row.frozenHistoricalSourceBinding.entryIndex],row.originalSourceEntry);
 assert.equal(hash(row.originalSourceEntry),row.oldFiveFieldPairSha256);assert.equal(hash(row.approvedPair),row.newFiveFieldPairSha256);assert.deepEqual(Object.keys(row.approvedPair).filter(key=>row.approvedPair[key]!==row.originalSourceEntry[key]),['zh']);assert.equal(row.onlyChangedPairField,'zh');
 const p=row.canonicalPointer,b=await bytes('vocab/data/expanded-dictionary/'+p.file);assert.equal(sha(b),p.sha256);assert.equal(b.length,p.bytes);assert.deepEqual(JSON.parse(b).records[p.recordIndex],row.canonicalRecord);assert.equal(hash(row.canonicalRecord),row.canonicalRecordSha256);
 const manifest=await bytes('vocab/data/expanded-dictionary/manifest.json');assert.equal(sha(manifest),row.canonicalManifestSha256);for(const record of [row.canonicalRecord,...(row.canonicalRecord.variants??[])])assert.deepEqual(JSON.parse(manifest).sources[record.source],row.allReferencedSourceDescriptors[record.source]);
 assert.equal(sha(await bytes('vocab/data/dictionary-examples/'+row.originalExampleAsset.file)),row.originalExampleAsset.sha256);assert.equal(row.originalEnglishAuthorshipClaim,false);assert.equal(row.wholeSourceApproved,false);
 const reader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});try{
  const original=await reader.load(row.term,{lookupQuery:row.term}),before=JSON.stringify(original);assert.deepEqual(original,row.originalDTO);assert.equal(hash(original),row.originalDTOSha256);assert.deepEqual(row.currentPreCorrectionDTO,original);
  assert.deepEqual(correctionFromReviewedPair({row:pair,original:row.originalSourceEntry,previous:original,canonical:row.canonicalRecord}),row.compiledCorrection);
  assert.deepEqual(await applyExampleCorrections(row.term,original),row.expectedCorrectedDTO);assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl}),row.expectedCorrectedDTO);assert.equal(JSON.stringify(original),before);
 }finally{reader.close();resetDictionaryExamplesCacheForTests();}
});

test('each new correction rejects cross-head transfers and altered complete DTO identities without mutation',async()=>{
 for(const [index,row]of fixture.rows.entries()){
  const other=fixture.rows[(index+1)%fixture.rows.length];assert.equal(await applyExampleCorrections(other.term,row.originalDTO),row.originalDTO);
  for(const change of [dto=>{dto.term+='x';},dto=>{dto.senses[0].id+='x';},dto=>{dto.senses[0].partOfSpeech='interjection';},dto=>{dto.senses[0].meaningZh='私人另一个意思';},dto=>{dto.senses[0].examples[0].en+=' Changed.';},dto=>{dto.senses[0].examples[0].zh+='改过。';},dto=>{dto.senses[0].reviewer='AI/another';}]){
   const dto=structuredClone(row.originalDTO);change(dto);const before=JSON.stringify(dto);assert.equal(await applyExampleCorrections(row.term,dto),dto);assert.equal(JSON.stringify(dto),before);
  }
  let reads=0;const dto=structuredClone(row.originalDTO);Object.defineProperty(dto,'term',{enumerable:true,get(){reads++;return row.term;}});assert.equal(await applyExampleCorrections(row.term,dto),dto);assert.equal(reads,0);
 }
});

test('all41 examples remain separate from manual, quotation, folder and private study fields in both saved meaning shapes',async()=>{
 try{for(const row of fixture.rows)for(const nested of [false,true]){
  const card={...row.expectedPrimary,id:'private-'+row.term,meaning:nested?{zh:row.expectedPrimary.meaning}:row.expectedPrimary.meaning,example:'Keep my own English.',exampleZh:'保留我的译文。',bookPassage:'Keep my original book passage.',note:'Private note',folderIds:['reading','spoken'],study:{box:4,correct:8},review:{dueAt:'2026-11-01'},progress:{streak:3}},before=JSON.stringify(card);
  assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl,savedEntry:card}),row.expectedCorrectedDTO);assert.equal(JSON.stringify(card),before);
 }}finally{resetDictionaryExamplesCacheForTests();}
});

test('unavailable optional examples fail retryably and never overwrite a saved card or book passage',async()=>{
 try{for(const row of fixture.rows){const card={term:row.term,meaning:{zh:row.approvedPair.meaningZh},example:'My original example.',bookPassage:'My quotation.',study:{box:3}},before=JSON.stringify(card);await assert.rejects(loadDictionaryExamples(row.term,{fetchImpl:async()=>new Response('',{status:503}),savedEntry:card}));assert.equal(JSON.stringify(card),before);resetDictionaryExamplesCacheForTests();}}finally{resetDictionaryExamplesCacheForTests();}
});
