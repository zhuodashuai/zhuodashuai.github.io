import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadSearchExperienceContent} from '../scripts/build-search-experience-content.mjs';
import {auditSearchContentAdmissions} from '../scripts/search-content-admission.mjs';
import {SEARCH_EXPERIENCE_ENTRIES} from '../../vocab/js/search-experience-data.js';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../vocab/js/everyday-lookup-data.js';
import {REVIEWED_SENSE_ENTRIES} from '../../vocab/js/reviewed-senses-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
import {historicalCommonSearch42,historicalCommonOrdinary1070,historicalCommonPacks4} from './helpers/common-followup-history.mjs';
const root=resolve(import.meta.dirname,'../..');
const folder=new URL('../dictionary/everyday-expansions/2026-11-20-life-common-terms/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,folder),'utf8'));
const source=await read('source.json'),review=await read('review.json'),baseline=await read('baseline.json');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const forbidden=()=>{throw Error('A declared whole surface must not query a provider or legacy index');};
const local={useChineseQueryCache:false,fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');
  assert(new URL(url).pathname.includes('/vocab/data/'));return new Response(await readFile(new URL(url)));
}};

test('all9 final source rows have fresh independent exact metadata admission, not a copied draft status',async()=>{
  assert.equal(hash(await readFile(new URL('source.json',folder))),'0791607eadf16c95e6f66637b3788ed760cb8eff49c5f8af857bfdf064317a78');
  assert.equal(hash(await readFile(new URL('review.json',folder))),'e1b95c5092c2064188af63fac4564583ac2d4d375184b5e4e2ec6df0cd5e5bba');
  assert.equal(review.sourceSha256,hash(source));assert.equal(review.sourceByteSha256,hash(await readFile(new URL('source.json',folder))));
  assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,source.author);
  assert.equal(review.reviewer,'AI/chinese_life_common_terms_admission_reviewer');assert.deepEqual(review.issues,[]);
  assert.deepEqual(review.approvedTerms,source.entries.map(row=>row.term));
  assert.deepEqual(review.reviewedRows.map(({term,rowSha256,languageDecision})=>({term,rowSha256,languageDecision})),
    source.entries.map(row=>({term:row.term,rowSha256:hash(row),languageDecision:'PASS'})));
  const original=await read('language-source.json');
  assert.equal(hash(await readFile(new URL('language-source.json',folder))),'97a28693a255ebcad06515e32bd5919cb769867a50eb9604bdbc7226f22e1ecb');
  for(const [index,row]of source.entries.entries()){
    const {exampleReviewer,...current}=row,{exampleReviewer:oldReviewer,...old}=original.entries[index];
    assert.deepEqual(current,old);assert.equal(exampleReviewer,review.reviewer);assert.equal(oldReviewer,'PENDING/independent-review');
  }
  const audit=await auditSearchContentAdmissions(root,source.entries);
  assert.equal(audit.heads,9);assert.equal(audit.wholeSurfaces,52);assert.equal(audit.canonicalEnglishShards,128);
  assert.equal(audit.canonicalUniqueRecords,102609);assert.equal(audit.canonicalRecordOccurrences,143911);
  assert.equal(audit.baseShards,256);assert.equal(audit.compressedDeltas,35);assert.equal(audit.completeImmutableExamplePairs,103998);
  assert.equal(audit.exampleCollisions,0);assert.equal(audit.literalFormContextCollisions,0);
});

test('the9 appended rows preserve all33 old additions, ordinary1061 objects and reviewed210 objects exactly',async()=>{
  const compiled=await loadSearchExperienceContent();assert.deepEqual(historicalCommonPacks4(compiled.packs).map(pack=>pack.entries.length),[16,4,13,9]);
  const historicalSearch=historicalCommonSearch42(SEARCH_EXPERIENCE_ENTRIES);
  assert.equal(historicalSearch.length,42);assert.deepEqual(SEARCH_EXPERIENCE_ENTRIES,compiled.entries);
  assert.equal(hash(historicalSearch.slice(0,33)),baseline.priorSearch33Sha256);
  assert.deepEqual(historicalSearch.slice(33),source.entries);
  for(const[file,pin]of Object.entries(baseline.priorSourceAndReviewBytes))assert.equal(hash(await readFile(resolve(root,file))),pin,file);
  const ordinary=historicalCommonOrdinary1070(EVERYDAY_LOOKUP_ENTRIES.filter(row=>!row.reviewedCanonicalSense)),newHeads=new Set(source.entries.map(row=>row.term));
  assert.equal(ordinary.length,1070);const old=ordinary.filter(row=>!newHeads.has(row.term));
  assert.equal(old.length,1061);assert.deepEqual(old.map(row=>row.term),baseline.ordinary1061Heads);assert.equal(hash(old),baseline.ordinary1061Sha256);
  const prior=new Set(baseline.reviewed210Heads),selected=REVIEWED_SENSE_ENTRIES.filter(row=>prior.has(row.term));
  assert.equal(selected.length,210);assert.equal(hash(selected),baseline.reviewed210Sha256);
});

test('all52 declared complete surfaces keep exact original meanings and POS in both English entrypoints without network',async()=>{
  let count=0;
  for(const row of source.entries)for(const query of[row.term,...row.englishForms]){
    for(const result of[await searchExpandedDictionary(query,{fetchImpl:forbidden}),
      await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden})]){
      assert.equal(result.results.length,1,query);const value=result.results[0];
      assert.equal(value.term,row.term,query);assert.equal(value.partOfSpeech,row.partOfSpeech);assert.equal(value.meaning,row.meaning);
      assert.equal(value.source,'卓式词典·原创释义');assert.equal(value.license,'Original composition');
      assert.equal(value.url,'https://zhuodashuai.github.io/vocab/');
    }count++;
  }assert.equal(count,52);
  for(const query of ['TAKING MY TEMPERATURE','take someone’s temperature',' “delivery addresses” ']){
    const result=await searchExpandedDictionary(query,local);assert.equal(result.results.length,1,query);
    assert(source.entries.some(row=>row.term===result.results[0].term));
  }
});

async function full(query){
  const rows=[];let offset=0,total;
  while(true){const page=await searchExpandedDictionary(query,{...local,offset,limit:7});
    assert.equal(page.ranking,'global');assert.equal(page.relatedIntegrated,true);assert(page.coverage===undefined||page.coverage==='full');
    total??=page.total;assert.equal(page.total,total);rows.push(...page.results);
    if(!page.hasMore)break;assert(page.nextOffset>offset);offset=page.nextOffset;
  }assert.equal(rows.length,total);assert.equal(new Set(rows.map(row=>row.term)).size,rows.length);return rows;
}
test('all26 Chinese aliases are reachable with exact scope and source through the complete7-result paging stream',async()=>{
  let count=0;
  for(const row of source.entries)for(const query of row.chineseAliases){const found=(await full(query)).find(value=>value.term===row.term);
    assert(found,query);assert.equal(found.partOfSpeech,row.partOfSpeech);assert.equal(found.meaning,row.meaning);
    assert.equal(found.source,'卓式词典·原创释义');count++;
  }assert.equal(count,26);
  for(const[query,head]of[['账单地址','delivery address'],['闲逛','hang out the washing'],['中毒反应','allergic reaction'],
    ['过敏性休克','allergic reaction'],['药房配药','repeat prescription'],['行李托运','luggage storage'],['课程表','shift rota'],
    ['雇主推荐信','employment reference'],['工作证明书','employment reference']])assert(!(await full(query)).some(row=>row.term===head),query);
  const cause=(await full('过敏原')).find(row=>row.term==='allergic reaction');
  if(cause)assert(['mention','compound','related'].includes(cause.matchType),'An explanatory cause is not an unconditional reaction noun alias');
});

test('all9 original pairs stay tied to their approved full sense and preserve private study/card fields',async()=>{
  for(const row of source.entries){const card={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning,
    note:'Keep my note.',example:'Keep my original English.',exampleZh:'保留我的原有译文。',folderIds:['reading'],study:{correct:7,wrong:2}};
    const before=JSON.stringify(card),entry=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:forbidden});
    assert.equal(entry.senses.length,1,row.term);assert.equal(entry.senses[0].partOfSpeech,row.partOfSpeech);
    assert.equal(entry.senses[0].meaningZh,row.meaning);assert.deepEqual(entry.senses[0].examples,[{en:row.en,zh:row.zh}]);
    assert.equal(JSON.stringify(card),before);
    const wrong={...card,meaning:'An unrelated private sense.'};
    const rejected=await loadDictionaryExamples(row.term,{savedEntry:wrong,fetchImpl:local.fetchImpl});
    assert(!rejected||!rejected.senses.some(s=>s.examples.some(pair=>pair.en===row.en&&pair.zh===row.zh)));
  }
});
