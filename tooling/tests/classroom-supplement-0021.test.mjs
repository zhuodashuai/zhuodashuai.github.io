import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EVERYDAY_LOOKUP_ENTRIES as entries,EVERYDAY_CHINESE_ALIASES as aliases} from '../../vocab/js/everyday-lookup-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {searchEverydayDictionary} from '../../vocab/js/everyday-lookup.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>sha(JSON.stringify(value));
const directory=new URL('../dictionary/everyday-expansions/2026-10-29-classroom-0021/',import.meta.url);
const sourceBytes=await fs.readFile(new URL('source.json',directory));
const reviewBytes=await fs.readFile(new URL('review.json',directory));
const source=JSON.parse(sourceBytes),review=JSON.parse(reviewBytes);
const baseline=JSON.parse(await fs.readFile(new URL('baseline.json',directory)));
const forbidden=()=>{throw Error('A packaged expression must not wait for a dictionary shard or provider');};

test('three new classroom-theme expressions bind exact independent approval and preserve all published rows',()=>{
  assert.equal(sha(reviewBytes),'39b29887a7c515b3718f9a817ec9253c9cd31912e0cd43fb11edd8f1278c4e3b');
  assert.equal(sha(sourceBytes),review.sourceByteSha256);assert.equal(hash(source),review.sourceSha256);
  assert(review.independentOfAuthor);assert.notEqual(source.author,review.reviewer);assert.deepEqual(review.issues,[]);
  assert.deepEqual(source.entries.map(row=>row.term),["at somebody's discretion",'foot the bill','take a toll on']);
  assert.deepEqual(review.approvedTerms,source.entries.map(row=>row.term));
  const ordinary=entries.filter(row=>!row.reviewedCanonicalSense);
  assert.equal(ordinary.length,1028);
  assert.equal(baseline.ordinaryCount,1025);assert.equal(hash(ordinary.slice(0,1025)),baseline.ordinarySha256);
  assert.equal(hash(entries.filter(row=>row.reviewedCanonicalSense)),baseline.selectedSha256);
  assert.equal(hash(aliases),baseline.aliasesSha256);
  assert.deepEqual(ordinary.slice(1025,1028),source.entries);
  for(const row of source.entries){assert.equal(hash(row),review.reviewedRows.find(item=>item.term===row.term)?.rowSha256);}
});

test('all20 new English and Chinese queries use the same local meanings and examples without fallback or writes',async()=>{
  let queries=0;
  for(const row of source.entries){
    for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
      const result=await searchExpandedDictionary(query,{fetchImpl:forbidden}),first=result.results[0];
      assert.equal(first.term,row.term,query);assert.equal(first.partOfSpeech,row.partOfSpeech);assert.equal(first.meaning,row.meaning);
      assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden}),result);
      const card={...first,note:'Keep my note',study:{box:4,correct:7},example:'Keep my original sentence'},before=JSON.stringify(card);
      const examples=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:forbidden});
      assert.deepEqual(examples.senses[0].examples,[{en:row.en,zh:row.zh}]);assert.equal(JSON.stringify(card),before);queries++;
    }
  }
  assert.equal(queries,20);
  for(const query of ['feet the bill','take a toll road','with discretion','不是酌情决定','不用承担账单','没有造成持续损耗']){
    assert.equal(searchEverydayDictionary(query),null,query);
  }
});
