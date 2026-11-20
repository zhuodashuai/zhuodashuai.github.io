import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {isSearchContentHead,validateSearchContentSurfaces,createSearchContentExampleCheck,auditSearchContentAdmissions} from '../scripts/search-content-admission.mjs';
import {loadSearchExperienceContent} from '../scripts/build-search-experience-content.mjs';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../vocab/js/everyday-lookup-data.js';
import {SEARCH_EXPERIENCE_ENTRIES} from '../../vocab/js/search-experience-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
const root=resolve(import.meta.dirname,'../..');
const packRoot=new URL('../dictionary/everyday-expansions/2026-11-19-common-terms/',import.meta.url);
const source=JSON.parse(await readFile(new URL('source.json',packRoot)));
const baseline=JSON.parse(await readFile(new URL('baseline.json',packRoot)));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const forbidden=()=>{throw Error('An exact packaged head/form must not need legacy/provider/network reads');};
const local={fetchImpl:async(url,options)=>{assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');return new Response(await readFile(url));}};

test('canonical apostrophes are internal word punctuation, never broken or guessed heads',()=>{
  for(const value of ["hand in one's notice","don't","rock'n'roll",'well-adjusted','bank transfer'])assert.equal(isSearchContentHead(value),true,value);
  for(const value of ["'notice","notice'","one''s","one 's","one' s","one’s",'bank  transfer','bank--transfer','bank - transfer','BANK','<script>','notice\n',''])assert.equal(isSearchContentHead(value),false,value);
});

test('whole canonical/form/context/package collisions and repeated proposed forms fail admission',()=>{
  const row={term:'new head',englishForms:['new heads'],en:'A distinct original sentence.',zh:'一条独立例句。'};
  assert.deepEqual(validateSearchContentSurfaces([row]),{heads:1,wholeSurfaces:2});
  for(const inventory of [{canonicalRecords:[{term:'new head'}]},{canonicalKeys:[['new heads',[{id:5,kind:'form'}]]]},{canonicalKeys:[['new head',[{id:5,kind:'context'}]]]},{packagedEntries:[{term:'other owner',englishForms:['new heads']}]}])assert.throws(()=>validateSearchContentSurfaces([row],inventory));
  assert.throws(()=>validateSearchContentSurfaces([row,{...row,term:'other owner'}]));
  assert.throws(()=>validateSearchContentSurfaces([{...row,englishForms:['new head']}]));
  for(const language of ['en','zh']){
    const checker=createSearchContentExampleCheck([row]);
    assert.throws(()=>checker.visit({term:'existing owner',en:language==='en'?row.en:'Another sentence.',zh:language==='zh'?row.zh:'其他句子。'}));
  }
  assert.throws(()=>createSearchContentExampleCheck([row,{...row,term:'different owner'}]));
});

test('all13 heads and42 whole surfaces are independently approved against complete canonical and compressed example inventories',async()=>{
  assert.equal(hash(await readFile(new URL('source.json',packRoot))),'ebaacb360562746a8e0dc6709732c57ff436300fe27366c9760b1866e4993ad7');
  const review=JSON.parse(await readFile(new URL('review.json',packRoot)));
  assert.equal(review.sourceSha256,hash(source));assert.equal(review.sourceByteSha256,hash(await readFile(new URL('source.json',packRoot))));
  assert.notEqual(review.reviewer,source.author);assert.equal(review.independentOfAuthor,true);assert.equal(review.reviewer,'AI/chinese_common_terms_admission_reviewer');
  assert.deepEqual(review.approvedTerms,source.entries.map(row=>row.term));assert.deepEqual(review.issues,[]);
  assert.deepEqual(review.reviewedRows.map(({term,rowSha256,languageDecision})=>({term,rowSha256,languageDecision})),source.entries.map(row=>({term:row.term,rowSha256:hash(row),languageDecision:'PASS'})));
  const audit=await auditSearchContentAdmissions(root,source.entries);
  const previousAudit=JSON.parse(await readFile(new URL('admission-audit.json',packRoot)));
  assert.deepEqual(audit,JSON.parse(await readFile(new URL('final-admission-audit.json',packRoot))));
  assert.deepEqual(audit,{...previousAudit,packagedRowsChecked:1258,distinctPublicExampleContextsChecked:106071});
  const finalReview=JSON.parse(await readFile(new URL('final-audit-review.json',packRoot)));
  assert.equal(finalReview.reviewer,review.reviewer);assert.equal(finalReview.independentOfAuthor,true);
  for(const[field,file]of [['sourceByteSha256','source.json'],['originalReviewByteSha256','review.json'],
    ['originalAdmissionAuditByteSha256','admission-audit.json'],['finalAdmissionAuditByteSha256','final-admission-audit.json']]){
    assert.equal(finalReview[field],hash(await readFile(new URL(file,packRoot))));
  }
  assert.deepEqual(finalReview.independentlyRecomputedFinalAudit,audit);
  assert.equal(audit.heads,13);assert.equal(audit.wholeSurfaces,42);assert.equal(audit.canonicalUniqueRecords,102609);
  assert.equal(audit.canonicalEnglishShards,128);assert.equal(audit.canonicalRecordOccurrences,143911);
  assert.equal(audit.baseShards,256);assert.equal(audit.compressedDeltas,35);assert.equal(audit.completeImmutableExampleHeads,102609);
  assert.equal(audit.completeImmutableExamplePairs,103998);assert.equal(audit.exampleCollisions,0);assert.equal(audit.literalFormContextCollisions,0);
});

test('new13 rows append without changing the exact historical20 sources or ordinary1048 objects',async()=>{
  const {entries,packs,module}=await loadSearchExperienceContent();
  assert.deepEqual(packs.map(pack=>pack.entries.length),[16,4,13]);
  assert.deepEqual(entries.slice(20),source.entries);assert.equal(hash(entries.slice(0,20)),baseline.search20Sha256);
  assert.deepEqual(SEARCH_EXPERIENCE_ENTRIES,entries);assert.equal(module,await readFile(new URL('../../vocab/js/search-experience-data.js',import.meta.url),'utf8'));
  for(const[file,expected]of Object.entries(baseline.priorSourceAndReviewBytes))assert.equal(hash(await readFile(resolve(root,file))),expected,file);
  const ordinary=EVERYDAY_LOOKUP_ENTRIES.filter(row=>!row.reviewedCanonicalSense);
  const old=ordinary.filter(row=>!source.entries.some(entry=>JSON.stringify(entry)===JSON.stringify(row)));
  assert.equal(ordinary.length,1061);assert.equal(old.length,1048);assert.equal(hash(old),baseline.ordinary1048Sha256);
});

test('all canonical and finite forms return exact current source/POS/meaning without network in both English lookup entrypoints',async()=>{
  for(const row of source.entries)for(const query of[row.term,...row.englishForms]){
    for(const result of[await searchExpandedDictionary(query,{fetchImpl:forbidden}),await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden})]){
      assert.equal(result.results.length,1,query);const actual=result.results[0];
      assert.equal(actual.term,row.term,query);assert.equal(actual.partOfSpeech,row.partOfSpeech);assert.equal(actual.meaning,row.meaning);
      assert.equal(actual.source,'卓式词典·原创释义');assert.equal(actual.license,'Original composition');
    }
  }
  assert.equal((await searchExpandedDictionary('hand in one’s notice',{fetchImpl:forbidden})).results[0].term,"hand in one's notice");
  assert.equal((await searchExpandedDictionary(' taken notes ',{fetchImpl:forbidden})).results[0].term,'take notes');
  assert.equal((await searchExpandedDictionary('RESAT AN EXAM',{fetchImpl:forbidden})).results[0].term,'resit an exam');
  for(const query of ['resit','resits','resat','resitting']){
    const result=await searchExpandedDictionary(query,{fetchImpl:forbidden});assert.equal(result.results[0].term,'resit');
    assert.equal(result.results[0].partOfSpeech,'noun · verb');assert.equal(result.results[0].source,'卓的日常词组');
  }
  assert.equal((await searchExpandedDictionary('take note',local)).results[0].term,'take note');
  for(const query of ['apply','apply to','graduate','resited an exam','resiting an exam',"hand in someone's notice"]){
    const result=await searchExpandedDictionary(query,local);
    assert(!result.results.some(row=>['apply for','graduate from','resit an exam',"hand in one's notice"].includes(row.term)),query);
  }
});

async function complete(query){
  const results=[];let offset=0,total;
  while(true){
    const page=await searchExpandedDictionary(query,{...local,useChineseQueryCache:false,offset,limit:50});
    assert.equal(page.ranking,'global');assert.equal(page.relatedIntegrated,true);assert(page.coverage===undefined||page.coverage==='full');
    if(total===undefined)total=page.total;else assert.equal(page.total,total);results.push(...page.results);
    if(!page.hasMore)break;assert(page.nextOffset>offset);offset=page.nextOffset;
  }
  assert.equal(results.length,total);assert.equal(new Set(results.map(row=>row.term)).size,results.length);return results;
}
test('Chinese exact aliases preserve authentic scopes in complete globally ranked results',async()=>{
  for(const row of source.entries)for(const query of row.chineseAliases){
    const result=await complete(query),actual=result.find(item=>item.term===row.term);assert(actual,query);
    assert.equal(actual.partOfSpeech,row.partOfSpeech);assert.equal(actual.meaning,row.meaning);assert.equal(actual.source,'卓式词典·原创释义');
  }
  for(const[query,head]of [['申请大学','apply for'],['申请学校','apply for'],['毕业生','graduate from'],['一般误机','missed connection'],['电汇','bank transfer'],['病假条','medical certificate'],['留意','take notes']]){
    assert(!(await complete(query)).some(row=>row.term===head),query+' must not be an unconditional alias');
  }
});

test('all13 authored bilingual examples remain bound to the exact sense without mutating saved cards or review records',async()=>{
  for(const row of source.entries){
    const savedEntry={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning,example:'Keep my book example.',exampleTranslation:'保留我的原文例句。',note:'Keep my note.',study:{correct:4,wrong:2}};
    const before=JSON.stringify(savedEntry),example=await loadDictionaryExamples(row.term,{savedEntry,fetchImpl:forbidden});
    assert(example?.senses.some(sense=>sense.partOfSpeech===row.partOfSpeech&&sense.examples.some(pair=>pair.en===row.en&&pair.zh===row.zh)),row.term);
    assert.equal(JSON.stringify(savedEntry),before);
  }
});
