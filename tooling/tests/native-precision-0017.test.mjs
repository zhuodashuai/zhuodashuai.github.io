import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {DICTIONARY_EXAMPLE_CORRECTIONS as allCompiled} from '../../vocab/js/dictionary-example-corrections-data.js';
import {historicalCorrections79} from './helpers/correction-history-0079.mjs';
const compiled=historicalCorrections79(allCompiled);
import {applyExampleCorrections} from '../../vocab/js/dictionary-example-corrections.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {independentlyReviewedCorrections,correctionFromReviewedPair} from '../scripts/build-dictionary-example-corrections.mjs';
import {exampleSourceHash} from '../scripts/build-dictionary-examples.mjs';
import {historicalCorrections75,HISTORICAL_75_ROWS,HISTORICAL_75_SHA256} from './helpers/correction-history-0075.mjs';
const root=new URL('../../',import.meta.url),sha=x=>createHash('sha256').update(x).digest('hex'),hash=x=>sha(JSON.stringify(x));
const bytes=p=>fs.readFile(new URL(p,root)),read=async p=>JSON.parse(await bytes(p));
const fixture=await read('tooling/dictionary/examples/evidence/native-precision-0017-fixture.json');
const fetchImpl=async input=>new Response(await fs.readFile(new URL(input)));
const byTerm=new Map(fixture.rows.map(r=>[r.term,r]));

test('four precision corrections preserve the exact historical75 and form the complete historical79-row union',()=>{
 assert.deepEqual(fixture.rows.map(r=>r.term),['fainthearted','naysay','defalcate','facilitation']);
 assert.equal(fixture.baselineCorrectionRows.length,75);assert.equal(hash(fixture.baselineCorrectionRows),HISTORICAL_75_SHA256);
 assert.deepEqual(fixture.baselineCorrectionRows,HISTORICAL_75_ROWS);assert.deepEqual(historicalCorrections75(compiled),HISTORICAL_75_ROWS);
 const expected=[...HISTORICAL_75_ROWS,...fixture.rows.map(r=>r.compiledCorrection)].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
 assert.equal(compiled.length,79);assert.equal(new Set(compiled.map(r=>r.term)).size,79);assert.deepEqual(compiled,expected);
 assert.deepEqual(byTerm.get('fainthearted').onlyChangedFiveFields,['zh']);
 assert.deepEqual(byTerm.get('naysay').onlyChangedFiveFields,['en']);
 for(const term of ['defalcate','facilitation'])assert.deepEqual(byTerm.get(term).onlyChangedFiveFields,['en','zh']);
 assert.equal(fixture.allRawCanonicalMeaningsApproved,false);assert.equal(fixture.userSavedCardOrBookFieldsChanged,false);
});

test('the full four-row fixture has its reviewed exact bytes and fixed canonical identities',async()=>{
 assert.equal(sha(await bytes('tooling/dictionary/examples/evidence/native-precision-0017-fixture.json')),'e522f78192612209cac38ebdc6c911695bd3d12c24c007d4440a11471a35779a');
 assert.deepEqual(fixture.rows.map(r=>[r.term,r.canonicalRecord.id]),[['fainthearted',1749886],['naysay',1764278],['defalcate',1741042],['facilitation',1508570]]);
});

test('the exact language repairs address the observed cave, inflection, argument structure and repeated-stimulus precision',()=>{
 assert.equal(byTerm.get('fainthearted').approvedPair.zh,'胆怯的角色在黑暗的洞穴外犹豫不前。');
 assert.equal(byTerm.get('fainthearted').approvedPair.en,byTerm.get('fainthearted').originalSourceEntry.en);
 assert.equal(byTerm.get('naysay').approvedPair.en,'He naysaid every proposal without suggesting alternatives.');
 assert.equal(byTerm.get('naysay').approvedPair.zh,byTerm.get('naysay').originalSourceEntry.zh);
 assert.equal(byTerm.get('defalcate').approvedPair.en,'The novel follows a clerk accused of defalcating.');
 assert.equal(byTerm.get('defalcate').approvedPair.zh,'小说讲述一名被指控侵吞公款的职员的故事。');
 assert.equal(byTerm.get('facilitation').approvedPair.en,'In this nerve experiment, facilitation was seen when the second of two closely spaced stimuli produced a stronger average response than the first.');
 assert.equal(byTerm.get('facilitation').approvedPair.zh,'在这次神经实验中，两次刺激的间隔很短，第二次引发的平均反应比第一次更强，显示出助长作用。');
});

for(const row of fixture.rows)test(`${row.term}: native source/review and the entire immutable old DTO/canonical/selected sense stay exactly bound`,async()=>{
 const source=await read(row.sourceFile),review=await read(row.reviewFile);
 assert.equal(sha(await bytes(row.sourceFile)),row.sourceByteSha256);assert.equal(exampleSourceHash(source),row.sourceBuildSha256);
 assert.equal(sha(await bytes(row.reviewFile)),row.reviewByteSha256);assert.notEqual(source.author,review.reviewer);assert.equal(source.author,row.newPairAuthor);
 const approved=independentlyReviewedCorrections(source,review).find(r=>r.term===row.term);assert(approved);assert.deepEqual(review.issues,[]);
 assert.deepEqual(source.entries.find(r=>r.term===row.term),row.approvedPair);
 for(const field of ['term','partOfSpeech','meaningZh'])assert.equal(row.approvedPair[field],row.originalSourceEntry[field]);
 const originalBytes=await bytes(row.originalSourceFile);assert.equal(sha(originalBytes),row.originalSourceByteSha256);
 assert.deepEqual(JSON.parse(originalBytes).entries.find(r=>r.term===row.term),row.originalSourceEntry);
 assert.equal(row.historicalAuthorInference,false);assert.equal(row.wholeRawCanonicalGlossApproved,false);assert.equal(row.oldImmutableAssetsChanged,false);
 const c=row.canonicalPointer,b=await bytes('vocab/data/expanded-dictionary/'+c.file),manifest=await read('vocab/data/expanded-dictionary/manifest.json');
 assert.equal(sha(b),c.sha256);assert.equal(b.length,c.bytes);assert.equal(JSON.parse(b).keys.length,c.count);assert.deepEqual(JSON.parse(b).records[c.recordIndex],row.canonicalRecord);
 assert.equal(hash(row.canonicalRecord),row.canonicalRecordSha256);assert.deepEqual(manifest.sources[row.canonicalRecord.source],row.canonicalDescriptor);
 assert.equal(sha(await bytes('vocab/data/expanded-dictionary/manifest.json')),row.canonicalManifestSha256);
 const reader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});try{
  const old=await reader.load(row.term,{lookupQuery:row.term});assert.deepEqual(old,row.originalDTO);assert.equal(hash(old),row.originalDTOSha256);
  const before=JSON.stringify(old),expected=structuredClone(old),sense=expected.senses.find(s=>s.id===row.compiledCorrection.senseId);
  sense.examples[row.compiledCorrection.exampleIndex]={en:row.approvedPair.en,zh:row.approvedPair.zh};sense.reviewer=row.newPairReviewer;sense.source='原创例句·AI复核（精选义项）';
  assert.deepEqual(expected,row.expectedCorrectedDTO);assert.deepEqual(await applyExampleCorrections(row.term,old),expected);assert.equal(JSON.stringify(old),before);
  assert.deepEqual(correctionFromReviewedPair({row:approved,original:row.originalSourceEntry,previous:old,canonical:row.canonicalRecord}),row.compiledCorrection);
  assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl}),expected);
 }finally{reader.close();resetDictionaryExamplesCacheForTests();}
});

test('new corrections cannot migrate across heads, source identities, old meaning/POS/pair edits or async changes',async()=>{
 for(const row of fixture.rows){
  for(const other of fixture.rows.filter(r=>r.term!==row.term))assert.equal(await applyExampleCorrections(other.term,row.originalDTO),row.originalDTO);
  for(const change of [d=>{d.term+='x';},d=>{d.senses[0].id+='x';},d=>{d.senses[0].partOfSpeech='interjection';},d=>{d.senses[0].meaningZh='不同的含义';},d=>{d.senses[0].examples[0].en+=' Extra text.';},d=>{d.senses[0].examples[0].zh+='额外文字。';},d=>{d.senses[0].reviewer='AI/other';},d=>{d.senses[0].source='Different source';},d=>{d.approved=true;}]){
   const value=structuredClone(row.originalDTO);change(value);const before=JSON.stringify(value);assert.equal(await applyExampleCorrections(row.term,value),value);assert.equal(JSON.stringify(value),before);
  }
  const value=structuredClone(row.originalDTO),pending=applyExampleCorrections(row.term,value);value.senses[0].meaningZh='异步过程中修改';assert.equal(await pending,value);
  const controller=new AbortController(),before=JSON.stringify(row.originalDTO);controller.abort();await assert.rejects(applyExampleCorrections(row.term,row.originalDTO,{signal:controller.signal}),{name:'AbortError'});assert.equal(JSON.stringify(row.originalDTO),before);
 }
});

test('each corrected learning pair leaves all manual/book/private/folder/study fields unchanged in both saved-meaning shapes',async()=>{
 try{for(const row of fixture.rows)for(const context of [{partOfSpeech:row.approvedPair.partOfSpeech,meaning:row.approvedPair.meaningZh},{partOfSpeech:row.canonicalRecord.partOfSpeech,meaning:row.canonicalRecord.meaning},{partOfSpeech:'adverb',meaning:'An unrelated saved meaning.'}])for(const nested of [false,true]){
  const card={id:'my-'+row.term,term:row.term,partOfSpeech:context.partOfSpeech,meaning:nested?{zh:context.meaning}:context.meaning,example:'My saved original example.',exampleZh:'我保存的例句。',bookPassage:'An original book quotation.',source:{title:'My reading'},note:'Private note',folderIds:['reading'],study:{box:4,correct:8},review:{dueAt:'2026-11-01T12:00:00.000Z'},progress:{streak:3}},before=JSON.stringify(card);
  assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl,savedEntry:card}),row.expectedCorrectedDTO);assert.equal(JSON.stringify(card),before);
 }}finally{resetDictionaryExamplesCacheForTests();}
});
