import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadSearchExperienceContent} from '../scripts/build-search-experience-content.mjs';
import {auditSearchContentAdmissions,validateSearchContentSurfaces,createSearchContentExampleCheck} from '../scripts/search-content-admission.mjs';
import {SEARCH_EXPERIENCE_ENTRIES} from '../../vocab/js/search-experience-data.js';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../vocab/js/everyday-lookup-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
import {historicalCommonSearch42,historicalCommonOrdinary1070,historicalCommonEveryday1283,historicalCommonAudit} from './helpers/common-followup-history.mjs';
import {historicalAeroEveryday1290,historicalAeroAudit,aeroSourceBaseline} from './helpers/aero-source-history.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const folder=new URL('../dictionary/everyday-expansions/2026-11-20-common-followup/',import.meta.url);
const sourceBytes=await readFile(new URL('source.json',folder)),source=JSON.parse(sourceBytes);
const reviewBytes=await readFile(new URL('review.json',folder)),review=JSON.parse(reviewBytes);
const baseline=JSON.parse(await readFile(new URL('baseline.json',folder)));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const forbidden=()=>{throw Error('A packaged English lookup must not call a provider or legacy dictionary');};
const dataRoot=await realpath(path.join(root,'vocab/data'));
const reads=[];
const local={useChineseQueryCache:false,fetchImpl:async(url,options)=>{
  const parsed=new URL(url);assert.equal(parsed.protocol,'file:');assert.equal(options.credentials,'omit');
  const file=await realpath(fileURLToPath(parsed)),relative=path.relative(dataRoot,file);
  assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  reads.push(relative);return new Response(await readFile(file));
}};
const expectedHeads=['open-book exam','deferred exam','job advertisement','plagiarism checker','handover note','employment reference letter','adverse reaction'];

test('seven full new rows retain exact independent review, originals and all42 prior search objects',async()=>{
  assert.equal(hash(sourceBytes),'1bce7c5556830ffe4a1250a9dc8ecf08264d455ec36cc0ec976976af2adc259b');
  assert.equal(hash(reviewBytes),'00f6e31e9391b0f8dc8d9b3c6e165f26f783ef50855825c8f579ddc5e9ab7b3d');
  assert.deepEqual(source.entries.map(row=>row.term),expectedHeads);
  assert.equal(review.sourceSha256,hash(source));assert.equal(review.sourceByteSha256,hash(sourceBytes));
  assert.equal(review.reviewer,'AI/next_common_admission_reviewer');assert.notEqual(review.reviewer,source.author);
  assert.equal(review.independentOfAuthor,true);assert.deepEqual(review.issues,[]);
  assert.deepEqual(review.approvedTerms,expectedHeads);
  assert.deepEqual(review.reviewedRows.map(({term,rowSha256,languageDecision})=>({term,rowSha256,languageDecision})),
    source.entries.map(row=>({term:row.term,rowSha256:hash(row),languageDecision:'PASS'})));
  const compiled=await loadSearchExperienceContent();assert.deepEqual(compiled.packs.map(pack=>pack.entries.length),[16,4,13,9,7]);
  assert.deepEqual(compiled.entries,SEARCH_EXPERIENCE_ENTRIES);assert.equal(compiled.entries.length,49);
  assert.deepEqual(compiled.entries.slice(42),source.entries);
  const old=historicalCommonSearch42(compiled.entries);assert.equal(hash(old),baseline.priorSearch42Sha256);
  assert.deepEqual(old.map(row=>row.term),baseline.priorSearchHeads);
  assert.equal(historicalCommonEveryday1283(EVERYDAY_LOOKUP_ENTRIES).length,1283);
  assert.equal(historicalCommonOrdinary1070(EVERYDAY_LOOKUP_ENTRIES.filter(row=>!row.reviewedCanonicalSense)).length,1070);
  let inverse=compiled.module;
  for(const row of source.entries){const exact='  '+JSON.stringify(row)+',\n';assert.equal(inverse.split(exact).length,2);inverse=inverse.replace(exact,'');}
  assert.equal(hash(inverse),baseline.priorSearchModuleByteSha256,'Generated module changes only by the seven exact appended row lines');
  assert.equal(compiled.module,await readFile(path.join(root,'vocab/js/search-experience-data.js'),'utf8'));
  for(const pin of baseline.priorPackPins)assert.equal(hash(await readFile(path.join(root,pin.file))),pin.sha256,pin.file);
});

test('all26 finite complete English surfaces return exact POS/source/meaning without a request in both entrypoints',async()=>{
  let surfaces=0;
  for(const row of source.entries)for(const query of[row.term,...row.englishForms]){
    for(const result of[await searchExpandedDictionary(query,{fetchImpl:forbidden,useChineseQueryCache:false}),
      await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden})]){
      assert.equal(result.results.length,1,query);const found=result.results[0];
      assert.equal(found.term,row.term,query);assert.equal(found.partOfSpeech,row.partOfSpeech,query);assert.equal(found.meaning,row.meaning,query);
      assert.equal(found.source,'卓式词典·原创释义');assert.equal(found.license,'Original composition');assert.equal(found.url,'https://zhuodashuai.github.io/vocab/');
    }surfaces++;
  }assert.equal(surfaces,26);
  for(const[query,head]of[[' “OPEN BOOK EXAMINATIONS” ','open-book exam'],['job ads,','job advertisement']]){
    const result=await searchExpandedDictionary(query,{fetchImpl:forbidden,useChineseQueryCache:false});assert.equal(result.results[0].term,head);
  }
});

async function complete(query){
  const results=[];let offset=0,total;
  for(;;){
    const page=await searchExpandedDictionary(query,{...local,offset,limit:5});
    assert.equal(page.ranking,'global');assert.equal(page.relatedIntegrated,true);assert(page.coverage===undefined||page.coverage==='full');
    total??=page.total;assert.equal(page.total,total);results.push(...page.results);
    if(!page.hasMore)break;assert(page.nextOffset>offset);offset=page.nextOffset;
  }
  assert.equal(results.length,total);assert.equal(new Set(results.map(row=>row.term)).size,results.length);return results;
}
test('all18 Chinese aliases select the stated noun phrase through the complete uncached real source stream',async()=>{
  let aliases=0;
  for(const row of source.entries)for(const query of row.chineseAliases){
    const found=(await complete(query)).find(value=>value.term===row.term);assert(found,query);
    assert.equal(found.partOfSpeech,row.partOfSpeech,query);assert.equal(found.meaning,row.meaning,query);assert.equal(found.source,'卓式词典·原创释义');aliases++;
  }assert.equal(aliases,18);
  assert(reads.some(file=>file.replaceAll('\\','/').startsWith('expanded-dictionary/')));
  assert(!reads.some(file=>file.replaceAll('\\','/').startsWith('chinese-query-cache/')),'Stale941 packets are deliberately excluded from this WIP source test');
});

test('nearby concepts are not silently added as unconditional aliases or English component forms',async()=>{
  for(const[query,head]of[['闭卷考试','open-book exam'],['线上考试','open-book exam'],['挂科补考','deferred exam'],
    ['查重率','plagiarism checker'],['口头交接','handover note'],['工作邀请','employment reference letter'],['过敏反应','adverse reaction']]){
    const found=(await complete(query)).find(row=>row.term===head);
    if(found)assert(['mention','compound','related'].includes(found.matchType),query+' is not an approved unconditional synonym for '+head);
  }
  for(const[query,head]of[['open book','open-book exam'],['exam','open-book exam'],['exam deferral','deferred exam'],
    ['job offer','job advertisement'],['stand for','handover note']]){
    const found=await searchExpandedDictionary(query,local);assert(!found.results.some(row=>row.term===head),query);
  }
});

test('all7 original bilingual examples bind to exact saved sense and preserve private learning fields',async()=>{
  for(const row of source.entries){
    const savedEntry={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning,
      example:'Keep my book example.',exampleTranslation:'保留我的原有例句。',note:'Keep my note.',folderIds:['reading'],study:{correct:3,wrong:1}};
    const before=JSON.stringify(savedEntry),examples=await loadDictionaryExamples(row.term,{savedEntry,fetchImpl:forbidden});
    assert.equal(examples.senses.length,1,row.term);const sense=examples.senses[0];
    assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaning);
    assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);assert.equal(sense.reviewer,review.reviewer);assert.equal(sense.source,'原创学习例句');
    assert.equal(JSON.stringify(savedEntry),before);
    const unrelated={...savedEntry,meaning:'An unrelated saved sense.'};
    const other=await loadDictionaryExamples(row.term,{savedEntry:unrelated,fetchImpl:local.fetchImpl});
    assert(!other||!other.senses.some(sense=>sense.examples.some(pair=>pair.en===row.en&&pair.zh===row.zh)),row.term);
  }
});

test('whole inventory audit retains exact coverage while rejecting each colliding form or example',async()=>{
  const audit=historicalAeroAudit(await auditSearchContentAdmissions(root,source.entries),aeroSourceBaseline.priorSevenNewHeadAudit,EVERYDAY_LOOKUP_ENTRIES);
  assert.equal(audit.heads,7);assert.equal(audit.wholeSurfaces,26);assert.equal(audit.canonicalUniqueRecords,102609);
  assert.equal(audit.canonicalWholeKeys,140858);assert.equal(audit.canonicalEnglishShards,128);
  assert.equal(audit.baseShards,256);assert.equal(audit.compressedDeltas,35);assert.equal(audit.completeImmutableExamplePairs,103998);
  assert.equal(audit.packagedRowsChecked,1283);assert.equal(audit.exampleCollisions,0);assert.equal(audit.literalFormContextCollisions,0);
  for(const row of source.entries){
    for(const surface of[row.term,...row.englishForms]){
      assert.throws(()=>validateSearchContentSurfaces(source.entries,{canonicalKeys:[[surface,[{id:123,kind:'form'}]]]}),surface);
    }
    assert.throws(()=>validateSearchContentSurfaces([...source.entries,{...row,term:'different proposed owner'}]),row.term);
    for(const language of['en','zh']){
      const check=createSearchContentExampleCheck(source.entries);
      assert.throws(()=>check.visit({term:'existing other head',en:language==='en'?row.en:'A different English sentence.',zh:language==='zh'?row.zh:'另一条中文例句。'}),row.term+language);
    }
  }
});

test('historical inverse fails on missing fields, lost or duplicate rows and any changed old object',()=>{
  assert.equal(SEARCH_EXPERIENCE_ENTRIES.length,49);assert.equal(historicalAeroEveryday1290(EVERYDAY_LOOKUP_ENTRIES).length,1290);
  for(const addition of source.entries)for(const field of Object.keys(addition)){
    const rows=structuredClone(SEARCH_EXPERIENCE_ENTRIES);delete rows.find(row=>row.term===addition.term)[field];
    assert.throws(()=>historicalCommonSearch42(rows),addition.term+field);
    const everyday=structuredClone(EVERYDAY_LOOKUP_ENTRIES);delete everyday.find(row=>row.term===addition.term)[field];
    assert.throws(()=>historicalCommonEveryday1283(everyday),addition.term+field);
  }
  for(const addition of source.entries){
    assert.throws(()=>historicalCommonSearch42(SEARCH_EXPERIENCE_ENTRIES.filter(row=>row.term!==addition.term)));
    assert.throws(()=>historicalCommonEveryday1283([...EVERYDAY_LOOKUP_ENTRIES,addition]));
  }
  const changed=structuredClone(SEARCH_EXPERIENCE_ENTRIES);changed[0].meaning+=' changed';assert.throws(()=>historicalCommonSearch42(changed));
  const old={packagedRowsChecked:1270,distinctPublicExampleContextsChecked:106083,constant:'unchanged'};
  const current={...old,packagedRowsChecked:1277,distinctPublicExampleContextsChecked:106090};
  const historicalEntries=historicalAeroEveryday1290(EVERYDAY_LOOKUP_ENTRIES);
  assert.deepEqual(historicalCommonAudit(current,old,historicalEntries),old);
  assert.throws(()=>historicalCommonAudit({...current,constant:'changed'},old,historicalEntries));
  assert.throws(()=>historicalCommonAudit({...current,packagedRowsChecked:1278},old,historicalEntries));
});
