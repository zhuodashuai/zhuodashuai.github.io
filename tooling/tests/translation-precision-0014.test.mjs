import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import{createHash}from'node:crypto';
import{DICTIONARY_EXAMPLE_CORRECTIONS as compiled}from'../../vocab/js/dictionary-example-corrections-data.js';
import{applyExampleCorrections}from'../../vocab/js/dictionary-example-corrections.js';
import{loadDictionaryExamples,resetDictionaryExamplesCacheForTests}from'../../vocab/js/dictionary-examples-current-v4.js';
import{createAdditiveExamplesLoader}from'../../vocab/js/dictionary-examples-additive.js';
import{dictionaryExamplesRelease}from'../../vocab/js/dictionary-examples-release-v4.js';
import{exampleSourceHash}from'../scripts/build-dictionary-examples.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x)),base=new URL('../dictionary/examples/corrections/',import.meta.url),read=async f=>JSON.parse(await fs.readFile(new URL(f,base))),fixture=await read('translation-precision-0014-fixture.json');
const fileFetch=async input=>new Response(await fs.readFile(new URL(input)));

test('five translation-only corrections retain exact approved English/POS/sense and all67 previous corrections',async()=>{
 assert.equal(sha(await fs.readFile(new URL('translation-precision-0014-fixture.json',base))),'0d0e769d8f68d2737becd96bf9a153f440b2cf6fe1fdcf86570cac47fa5d313c');
 const source=await read('source/quality-precision-0014.json'),review=await read('reviews/quality-precision-0014.json');assert.equal(sha(await fs.readFile(new URL('source/quality-precision-0014.json',base))),fixture.sourceByteSha256);assert.equal(sha(await fs.readFile(new URL('reviews/quality-precision-0014.json',base))),fixture.reviewByteSha256);assert.equal(exampleSourceHash(source),'e63ea584b9faf0fdafca8be7f2ed64500de7d29fe2d9ebebeada6e8a480af046');assert.equal(review.sourceSha256,exampleSourceHash(source));assert(review.independentOfAuthor);assert.notEqual(review.reviewer,source.author);assert.deepEqual(review.issues,[]);assert.deepEqual(source.entries.map(r=>r.term),['immunize','charade','eminence','meager','headway']);
 assert.equal(fixture.baselineCorrectionRows.length,67);assert.equal(compiled.length,72);for(const old of fixture.baselineCorrectionRows)assert.deepEqual(compiled.find(r=>r.term===old.term),old);
 for(const row of fixture.rows){const approved=source.entries.find(r=>r.term===row.term);assert.deepEqual(approved,row.approvedPair);for(const k of['term','partOfSpeech','meaningZh','en'])assert.equal(approved[k],row.originalSourceEntry[k]);assert.notEqual(approved.zh,row.originalSourceEntry.zh);assert.deepEqual(compiled.find(r=>r.term===row.term),row.compiledCorrection);}
});

test('all five complete source records and immutable DTOs stay exact while only approved translation slots change',async()=>{
 const reader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:fileFetch});try{for(const row of fixture.rows){const sourceBytes=await fs.readFile(new URL('../../'+row.originalSourceFile,import.meta.url));assert.equal(sha(sourceBytes),row.originalSourceByteSha256);assert.deepEqual(JSON.parse(sourceBytes).entries.find(x=>x.term===row.term),row.originalSourceEntry);const bytes=await fs.readFile(new URL('../../vocab/data/expanded-dictionary/'+row.canonicalPointer.file,import.meta.url));assert.equal(sha(bytes),row.canonicalPointer.sha256);assert.deepEqual(JSON.parse(bytes).records[row.canonicalPointer.recordIndex],row.canonicalRecord);
 const original=await reader.load(row.term,{lookupQuery:row.term});assert.equal(hash(original),row.originalDTOSha256);assert.deepEqual(original,row.originalDTO);const before=JSON.stringify(original),result=await applyExampleCorrections(row.term,original);assert.deepEqual(result,row.expectedCorrectedDTO);assert.equal(JSON.stringify(original),before);assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl:fileFetch}),row.expectedCorrectedDTO);
 }}finally{reader.close();resetDictionaryExamplesCacheForTests();}
});

test('correction authentication rejects altered full DTOs and different literal heads without mutating saved learning fields',async()=>{
 for(const row of fixture.rows){const otherHead=row.term==='immunize'?'charade':'immunize';const raw=structuredClone(row.originalDTO);assert.equal(await applyExampleCorrections(otherHead,raw),raw);
  const changes=[dto=>{dto.term=otherHead;},dto=>{dto.senses[0].partOfSpeech='interjection';},dto=>{dto.senses[0].meaningZh='A different personal meaning.';},dto=>{dto.senses[0].examples[0].zh='另一条旧译文。';},dto=>{dto.senses[0].id+='-different';}];
  for(const change of changes){const dto=structuredClone(row.originalDTO);change(dto);const before=JSON.stringify(dto);assert.equal(await applyExampleCorrections(row.term,dto),dto);assert.equal(JSON.stringify(dto),before);}
  for(const context of[{partOfSpeech:row.approvedPair.partOfSpeech,meaning:row.approvedPair.meaningZh},{partOfSpeech:'interjection',meaning:row.approvedPair.meaningZh},{partOfSpeech:row.approvedPair.partOfSpeech,meaning:'A different personal meaning.'}])for(const nested of[false,true]){const card={id:'old-'+row.term,term:row.term,partOfSpeech:context.partOfSpeech,meaning:nested?{zh:context.meaning}:context.meaning,example:'My original personal English.',exampleZh:'我的个人原译文。',bookPassage:'My original book passage.',note:'My original note.',study:{box:4,correct:7,incorrect:2},review:{dueAt:'2026-11-01T12:00:00.000Z'},progress:{streak:3}};const before=JSON.stringify(card),result=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:fileFetch});assert.deepEqual(result,row.expectedCorrectedDTO);assert.equal(JSON.stringify(card),before);}
 }resetDictionaryExamplesCacheForTests();
});
