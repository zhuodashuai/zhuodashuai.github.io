import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadSearchExperienceContent} from '../scripts/build-search-experience-content.mjs';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../vocab/js/everyday-lookup-data.js';
import {SEARCH_EXPERIENCE_ENTRIES} from '../../vocab/js/search-experience-data.js';
import {historicalOrdinary1044,historicalSelected204} from './helpers/search-followup-history.mjs';
import {historicalSearch20,historicalOrdinary1048,historicalSelected207} from './helpers/search-common-terms-history.mjs';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const file=new URL('../dictionary/everyday-expansions/2026-11-19-search-followup/',import.meta.url);
const pack=JSON.parse(await readFile(new URL('source.json',file),'utf8'));
const baseline=JSON.parse(await readFile(new URL('baseline.json',file),'utf8'));
const local={fetchImpl:async(url,options)=>{
  assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');
  return new Response(await readFile(url));
}};
const forbidden=()=>{throw Error('A packaged exact English head must not wait for a network or old dictionary');};

test('four newly reviewed heads append after every unchanged prior ordinary and selected object',async()=>{
  const {entries,packs,module}=await loadSearchExperienceContent();
  const historicalEntries=historicalSearch20(entries);
  assert.deepEqual(packs.slice(0,2).map(item=>item.entries.length),[16,4]);
  assert.equal(packs.length,3);assert.equal(packs[2].entries.length,13);
  assert.deepEqual(pack.entries.map(row=>row.term),['payment code','leave a job','by a fluke','nuanced']);
  assert.deepEqual(historicalEntries.slice(16),pack.entries);
  assert.deepEqual(SEARCH_EXPERIENCE_ENTRIES,entries);
  assert.equal(module,await readFile(new URL('../../vocab/js/search-experience-data.js',import.meta.url),'utf8'));
  assert.equal(hash(entries.slice(0,16)),baseline.searchSha256);
  assert.equal(historicalOrdinary1044(EVERYDAY_LOOKUP_ENTRIES).length,1044);
  assert.equal(historicalSelected204(EVERYDAY_LOOKUP_ENTRIES).length,204);
  assert.equal(historicalOrdinary1048(EVERYDAY_LOOKUP_ENTRIES).length,1048);
  assert.equal(historicalSelected207(EVERYDAY_LOOKUP_ENTRIES).length,207);
  const review=JSON.parse(await readFile(new URL('review.json',file),'utf8'));
  assert.notEqual(review.reviewer,pack.author);assert.equal(review.independentOfAuthor,true);
  assert.deepEqual(review.approvedTerms,pack.entries.map(row=>row.term));
});

test('exact English heads and declared forms bypass slow legacy reads in both lookup entry points',async()=>{
  for(const row of pack.entries)for(const query of [row.term,...row.englishForms]){
    const result=await searchExpandedDictionary(query,{fetchImpl:forbidden});
    const personal=await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden});
    for(const answer of [result,personal]){
      assert.equal(answer.results.length,1,query);
      assert.equal(answer.results[0].term,row.term);
      assert.equal(answer.results[0].partOfSpeech,row.partOfSpeech);
      assert.equal(answer.results[0].meaning,row.meaning);
      assert.equal(answer.results[0].source,'卓式词典·原创释义');
      assert.equal(answer.results[0].license,'Original composition');
    }
  }
  const nuanced=await searchExpandedDictionary('nuanced',{fetchImpl:forbidden});
  assert.equal(nuanced.results[0].partOfSpeech,'adjective');
  const oldNoun=await searchExpandedDictionary('nuance',local);
  assert.equal(oldNoun.results[0].term,'nuance');
  assert.equal(oldNoun.results[0].partOfSpeech,'noun');
  assert(!oldNoun.results[0].meaning.includes(pack.entries.find(row=>row.term==='nuanced').meaning));
  assert.equal((await searchExpandedDictionary('by some fluke',local)).results[0].term,'by some fluke');
});

async function complete(query){
  const results=[];let offset=0,total;
  while(true){
    const page=await searchExpandedDictionary(query,{...local,limit:50,offset});
    assert(page.coverage===undefined||page.coverage==='full','Basic/limited fallback cannot pass a full-stream check');assert.equal(page.ranking,'global');
    assert.equal(page.relatedIntegrated,true);assert(Number.isSafeInteger(page.total));
    if(total===undefined)total=page.total;else assert.equal(page.total,total);
    results.push(...page.results);
    if(!page.hasMore)break;
    assert(Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset);offset=page.nextOffset;
  }
  assert.equal(results.length,total);assert.equal(new Set(results.map(row=>row.term)).size,results.length);
  return results;
}

test('new Chinese intents join complete ranked pages with their exact authored sense, not a partial preview',async()=>{
  for(const row of pack.entries)for(const alias of row.chineseAliases)for(const query of [alias,'请问'+alias+'的英文是什么']){
    const results=await complete(query),found=results.find(item=>item.term===row.term);
    assert(found,query);assert.equal(found.partOfSpeech,row.partOfSpeech);
    assert.equal(found.meaning,row.meaning);assert.equal(found.source,'卓式词典·原创释义');
  }
  for(const [query,head]of [['收款码','payment code'],['验证码','payment code'],['取款码','payment code'],
    ['被解雇','leave a job'],['被裁员','leave a job'],['退休','leave a job'],['下班','leave a job']]){
    assert(!(await complete(query)).some(item=>item.term===head),query+' must not become an unconditional synonym');
  }
});

test('each authored pair stays bound to its sense and leaves saved book examples and learning data untouched',async()=>{
  for(const row of pack.entries){
    const card={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning,
      example:'My existing book example.',exampleTranslation:'我的原文例句。',note:'Keep my note.',study:{correct:3,wrong:1}};
    const before=JSON.stringify(card);
    const example=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:forbidden});
    assert(example?.senses.some(sense=>sense.partOfSpeech===row.partOfSpeech&&sense.examples.some(pair=>pair.en===row.en&&pair.zh===row.zh)),row.term);
    assert.equal(JSON.stringify(card),before);
  }
});
