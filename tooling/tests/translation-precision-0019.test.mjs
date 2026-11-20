import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DICTIONARY_EXAMPLE_CORRECTIONS as allCorrections} from '../../vocab/js/dictionary-example-corrections-data.js';
import {historicalCorrections83} from './helpers/correction-history-0083.mjs';
const compiled=historicalCorrections83(allCorrections);
import {applyExampleCorrections} from '../../vocab/js/dictionary-example-corrections.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {exampleSourceHash} from '../scripts/build-dictionary-examples.mjs';
import {independentlyReviewedCorrections,correctionFromReviewedPair} from '../scripts/build-dictionary-example-corrections.mjs';
import {historicalCorrections79,HISTORICAL_79_ROWS,HISTORICAL_79_SHA256} from './helpers/correction-history-0079.mjs';
const root=new URL('../../',import.meta.url),sha=x=>createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x));
const bytes=file=>fs.readFile(new URL(file,root)),read=async file=>JSON.parse(await bytes(file));
const fixtureFile='tooling/dictionary/examples/evidence/translation-precision-0019-fixture.json',fixture=await read(fixtureFile);
const fetchImpl=async input=>new Response(await fs.readFile(new URL(input)));

test('historical83 is exactly the entire unchanged historical79 plus four independently approved Chinese-only corrections',async()=>{
 assert.equal(sha(await bytes(fixtureFile)),'68ab75a6da4db87a64ba50e215d3edf8388f7b5c6b5e67f810f185c76765aea9');
 assert.deepEqual(fixture.rows.map(r=>r.term),['enlightened','gent','writhe','sulk']);
 assert.equal(fixture.baselineCorrectionRows.length,79);assert.equal(hash(fixture.baselineCorrectionRows),HISTORICAL_79_SHA256);
 assert.deepEqual(fixture.baselineCorrectionRows,HISTORICAL_79_ROWS);assert.deepEqual(historicalCorrections79(compiled),HISTORICAL_79_ROWS);
 const expected=[...HISTORICAL_79_ROWS,...fixture.rows.map(r=>r.compiledCorrection)].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
 assert.equal(compiled.length,83);assert.equal(new Set(compiled.map(r=>r.term)).size,83);assert.deepEqual(compiled,expected);
 assert.equal(hash(compiled),'573493f8e7ae05f88f433cc5e886b923cc33c2fdb2c0d23d0cf1ec39bf4af4b1');
 assert.equal(fixture.allRawCanonicalMeaningsApproved,false);assert.equal(fixture.originalSourceCorpusChanged,false);assert.equal(fixture.userSavedCardOrBookFieldsChanged,false);
});

test('the complete five-proposal source admits only the four approved terms and retains distrust as a blocking unresolved hold',async()=>{
 const source=await read(fixture.sourceFile),review=await read(fixture.reviewFile);
 assert.equal(sha(await bytes(fixture.sourceFile)),'482627d0b67e4384c9e2825c2e9e21536cbfb126f220f014be255ceebc1d7ad3');
 assert.equal(sha(await bytes(fixture.reviewFile)),'eb7f55c4d2814a5cde05c988ee81a81d32d113b46641fe5a276138baa034487b');
 assert.equal(exampleSourceHash(source),'df5975a2ece105e1b0c2c302039973e3c0f4fc806aeadc4ac1c098121387549e');
 assert.equal(source.author,'AI/next15_release_audit_precision_0019');assert.notEqual(source.author,review.reviewer);assert.equal(review.independentOfAuthor,true);
 assert.deepEqual(source.entries.map(r=>r.term),['enlightened','distrust','gent','writhe','sulk']);
 assert.deepEqual(independentlyReviewedCorrections(source,review).map(r=>r.term),fixture.rows.map(r=>r.term));
 assert.deepEqual(review.issues.map(r=>[r.term,r.blocking]),[['distrust',true]]);
 assert.throws(()=>independentlyReviewedCorrections(source,{...review,approvedTerms:[...review.approvedTerms,'distrust']}),/Unresolved example issue/u);
 assert(!compiled.some(r=>['distrust','chaplain','stallion','incredulous'].includes(r.term)));
 const held=fixture.unusedHeldPair;assert.deepEqual(source.entries.find(r=>r.term==='distrust'),held.pair);
 assert.equal(await applyExampleCorrections('distrust',held.originalDTO),held.originalDTO);
 assert.equal(held.pair.zh,'她不信任任何听起来太便于开脱的解释。');
 assert.equal(held.originalDTO.senses[0].examples[0].zh,'她不信任任何听起来过于省事的解释。');
 const index=await read('tooling/dictionary/examples/corrections/index.json'),batch=index.batches.find(b=>b.sourceFile==='quality-precision-0019.json');
 assert.deepEqual(Object.keys(batch.origins),fixture.rows.map(r=>r.term));assert(!Object.hasOwn(batch.origins,'distrust'));
});

test('the four Chinese fixes preserve rank, offer incompleteness, vessel depth and unasserted posture without changing English',()=>{
 const byTerm=new Map(fixture.rows.map(r=>[r.term,r]));
 assert.equal(byTerm.get('enlightened').approvedPair.zh,'她开明的做法鼓励初级员工质疑旧有惯例。');
 assert.equal(byTerm.get('gent').approvedPair.zh,'一位老绅士表示愿意把自己的伞给我们用。');
 assert.equal(byTerm.get('writhe').approvedPair.zh,'鳗鱼在一个不深的桶里扭动。');
 assert.equal(byTerm.get('sulk').approvedPair.zh,'失去戏里的角色后，他在窗边生闷气。');
 for(const r of fixture.rows){assert.deepEqual(Object.keys(r.approvedPair).filter(k=>r.approvedPair[k]!==r.originalSourceEntry[k]),['zh']);assert.equal(r.onlyChangedPairField,'zh');}
});

for(const row of fixture.rows)test(`${row.term} translation binds full canonical/source/review/old DTO bytes and changes only its own Chinese slot`,async()=>{
 const source=await read(row.sourceFile),review=await read(row.reviewFile),approved=independentlyReviewedCorrections(source,review).find(r=>r.term===row.term);assert(approved);
 assert.equal(sha(await bytes(row.originalSourceFile)),row.originalSourceByteSha256);assert.equal(sha(await bytes(row.originalReviewFile)),row.originalReviewByteSha256);
 assert.deepEqual((await read(row.originalSourceFile)).entries[row.frozenHistoricalSourceBinding.entryIndex],row.originalSourceEntry);
 assert.equal(hash(row.originalSourceEntry),row.oldFiveFieldPairSha256);assert.equal(hash(row.approvedPair),row.newFiveFieldPairSha256);
 const p=row.canonicalPointer,b=await bytes('vocab/data/expanded-dictionary/'+p.file);assert.equal(sha(b),p.sha256);assert.equal(b.length,p.bytes);assert.equal(JSON.parse(b).keys.length,p.count);assert.deepEqual(JSON.parse(b).records[p.recordIndex],row.canonicalRecord);assert.equal(hash(row.canonicalRecord),row.canonicalRecordSha256);
 const manifestBytes=await bytes('vocab/data/expanded-dictionary/manifest.json');assert.equal(sha(manifestBytes),row.canonicalManifestSha256);assert.deepEqual(JSON.parse(manifestBytes).sources[row.canonicalRecord.source],row.canonicalDescriptor);
 assert.equal(sha(await bytes('vocab/data/dictionary-examples/'+row.originalExampleAsset.file)),row.originalExampleAsset.sha256);
 assert.equal(row.sourceAuthorActuallyRecorded,null);assert.equal(row.originalEnglishAuthorshipClaim,false);assert.equal(row.wholeSourceApproved,false);
 const reader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});try{
  const original=await reader.load(row.term,{lookupQuery:row.term}),snapshot=JSON.stringify(original);assert.deepEqual(original,row.originalDTO);assert.equal(hash(original),row.originalDTOSha256);assert.deepEqual(row.currentPreCorrectionDTO,original);
  assert.deepEqual(correctionFromReviewedPair({row:approved,original:row.originalSourceEntry,previous:original,canonical:row.canonicalRecord}),row.compiledCorrection);
  assert.equal(row.compiledCorrection.canonicalId,row.canonicalRecord.id);assert.equal(row.compiledCorrection.canonicalSourceSha256,row.canonicalRecordSha256);
  const expected=structuredClone(original);expected.senses[0].examples[0].zh=row.approvedPair.zh;expected.senses[0].reviewer=review.reviewer;
  assert.deepEqual(expected,row.expectedCorrectedDTO);assert.deepEqual(await applyExampleCorrections(row.term,original),expected);assert.equal(JSON.stringify(original),snapshot);
  assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl}),expected);
 }finally{reader.close();resetDictionaryExamplesCacheForTests();}
});

test('four ZH corrections reject cross-head transfer and all edited or decorated whole DTOs without mutating them',async()=>{
 for(const row of fixture.rows){
  for(const other of fixture.rows.filter(r=>r.term!==row.term))assert.equal(await applyExampleCorrections(other.term,row.originalDTO),row.originalDTO);
  for(const change of [d=>{d.term+='x';},d=>{d.senses[0].id+='x';},d=>{d.senses[0].partOfSpeech='interjection';},d=>{d.senses[0].meaningZh='不同的含义';},d=>{d.senses[0].examples[0].en+=' Extra text.';},d=>{d.senses[0].examples[0].zh+='额外文字。';},d=>{d.senses[0].reviewer='AI/other';},d=>{d.senses[0].source='Different source';},d=>{d.privateNote='My own note';},d=>{d.senses.push(structuredClone(d.senses[0]));},d=>{d.senses[0].examples.push({en:'Another old sentence.',zh:'另一句旧句子。'});}]){
   const dto=structuredClone(row.originalDTO);change(dto);const before=JSON.stringify(dto);assert.equal(await applyExampleCorrections(row.term,dto),dto);assert.equal(JSON.stringify(dto),before);
  }
  const dto=structuredClone(row.originalDTO);let reads=0;Object.defineProperty(dto,'term',{enumerable:true,get(){reads++;return row.term;}});assert.equal(await applyExampleCorrections(row.term,dto),dto);assert.equal(reads,0);
 }
});

test('four ZH corrections reject stale asynchronous DTO changes and cancellation before or during the digest',async()=>{
 for(const row of fixture.rows){
  const edited=structuredClone(row.originalDTO),pending=applyExampleCorrections(row.term,edited);edited.senses[0].meaningZh='摘要等待期间改过的含义';assert.equal(await pending,edited);
  for(const initiallyAborted of[true,false]){const controller=new AbortController(),dto=structuredClone(row.originalDTO),before=JSON.stringify(dto);if(initiallyAborted)controller.abort();const pending=applyExampleCorrections(row.term,dto,{signal:controller.signal});if(!initiallyAborted)controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(JSON.stringify(dto),before);}
 }
});

test('ordinary learning examples stay separate from exact/manual/book/private/folder/study saved fields in both meaning shapes',async()=>{
 try{for(const row of fixture.rows)for(const context of[{partOfSpeech:row.approvedPair.partOfSpeech,meaning:row.approvedPair.meaningZh},...row.canonicalContexts.map(({partOfSpeech,meaning})=>({partOfSpeech,meaning})),{partOfSpeech:'adverb',meaning:'An unrelated personal meaning.'}])for(const nested of[false,true]){
  const card={id:'my-'+row.term,term:row.term,partOfSpeech:context.partOfSpeech,meaning:nested?{zh:context.meaning}:context.meaning,example:'My saved original English.',exampleZh:'我保存的例句。',bookPassage:'An original book quotation.',source:{title:'My own book'},note:'Private note',folderIds:['reading'],study:{box:4,correct:8},review:{dueAt:'2026-11-01T12:00:00.000Z'},progress:{streak:3}},before=JSON.stringify(card);
  assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl,savedEntry:card}),row.expectedCorrectedDTO);assert.equal(JSON.stringify(card),before);
 }}finally{resetDictionaryExamplesCacheForTests();}
});

test('unavailable optional immutable examples return a retryable failure without overwriting saved manual or book content',async()=>{
 for(const row of fixture.rows){const card={term:row.term,meaning:{zh:row.approvedPair.meaningZh},example:'My manual English.',exampleZh:'我的手动例句。',bookPassage:'My own book quotation.',study:{box:3},note:'Private'},before=JSON.stringify(card);try{await assert.rejects(loadDictionaryExamples(row.term,{fetchImpl:async()=>new Response('',{status:503}),savedEntry:card}));assert.equal(JSON.stringify(card),before);}finally{resetDictionaryExamplesCacheForTests();}}
});
