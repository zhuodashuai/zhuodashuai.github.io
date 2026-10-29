import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createReviewedExistingPairAdmission,canReuseReviewedExistingPair,projectReviewedExistingPairRows,TERMS} from '../scripts/build-reviewed-existing-pairs.mjs';
import {validateReviewedSensePack} from '../scripts/build-reviewed-dictionary-senses.mjs';
import {REVIEWED_SENSE_ENTRIES as selected} from '../../vocab/js/reviewed-senses-data.js';
import {EVERYDAY_LOOKUP_ENTRIES as all,EVERYDAY_CHINESE_ALIASES as aliases} from '../../vocab/js/everyday-lookup-data.js';
import {loadEverydayExamples,loadAssociatedEverydayExamples} from '../../vocab/js/everyday-lookup.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {historicalSelected187} from './helpers/classroom-history-0187.mjs';
const base=new URL('../dictionary/reviewed-senses/',import.meta.url);
const read=async file=>JSON.parse(await fs.readFile(new URL(file,base),'utf8'));
const source=await read('source/batch-0014.json'),review=await read('reviews/batch-0014.json');
const evidence=await read('existing-pairs/source/common-use-0020.json');
const baseline=await read('existing-pairs/common-use-0020-baseline.json');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fold=value=>value.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
const declarations={sourceFile:'batch-0014.json',reviewFile:'batch-0014.json',bindingFile:'existing-pairs/source/common-use-0020.json'};
const admission=await createReviewedExistingPairAdmission(source,review,declarations);
const records=new Map(evidence.entries.map(row=>[row.term,row.fullCanonicalRecord]));
const reserved=()=>new Map(source.entries.map(row=>[fold(row.en),row.term]));
const forbidden=()=>{throw Error('An associated known pair must not wait for network, AI or dictionary shards');};

test('199 current selected cards retain all187 old objects and1028 ordinary entries; the12 pairs are exact reuse',()=>{
  assert.equal(hash(source),'98549e8230b147b67cbebb874c1333c1b681f24eaf241694fa63ce3a60d75ffb');
  assert.equal(hash(review),'ff573b1a7b177d75535110e0b82d18ce6f2d22fe1332d37763d2b683e769a21e');
  assert(review.independentOfAuthor);assert.notEqual(source.author,review.reviewer);assert.deepEqual(review.issues,[]);
  assert.deepEqual(source.entries.map(row=>row.term),TERMS);assert.equal(selected.length,199);
  assert.equal(hash(historicalSelected187(selected)),baseline.selectedSha256);
  assert.equal(all.filter(row=>!row.reviewedCanonicalSense).length,1028);
  assert.equal(hash(all.filter(row=>!row.reviewedCanonicalSense)),baseline.ordinarySha256);assert.equal(hash(aliases),baseline.aliasesSha256);
  const basic=validateReviewedSensePack(source,review,records,reserved(),new Set(),admission);
  const projected=projectReviewedExistingPairRows(admission,source,review,basic);
  for(const row of projected){
    assert.deepEqual(selected.find(item=>item.term===row.term),row);
    const old=evidence.entries.find(item=>item.term===row.term);
    assert.equal(row.en,old.oldFiveFieldPair.en);assert.equal(row.zh,old.oldFiveFieldPair.zh);
    assert.deepEqual(loadEverydayExamples(row.term),old.completeOldDTO);
  }
});

test('ordinary new-composition dedup remains strict; booleans lists and cloned capabilities grant no reuse',()=>{
  for(const fake of [undefined,true,{},new Set(TERMS),structuredClone(admission)]){
    assert.throws(()=>validateReviewedSensePack(source,review,records,reserved(),new Set(),fake),/Duplicate selected-sense/u);
    assert.equal(canReuseReviewedExistingPair(fake,source,review,source.entries[0],source.entries[0].term),false);
  }
  const owners=reserved();owners.set(fold(source.entries[0].en),'a different head');
  assert.throws(()=>validateReviewedSensePack(source,review,records,owners,new Set(),admission),/Duplicate selected-sense/u);
  assert.equal(canReuseReviewedExistingPair(admission,source,review,source.entries[0],'a different head'),false);
  for(const change of [{term:'another head'},{meaning:'① 未经核对的另一个意思。'},{zh:'另一条译文。'},{en:'Another English sentence.'},{canonicalId:1}]){
    const changed={...source.entries[0],...change};
    assert.equal(canReuseReviewedExistingPair(admission,source,review,changed,source.entries[0].term),false);
  }
});

test('exact source review and projection cannot be widened through caller declarations or getter objects',async()=>{
  await assert.rejects(createReviewedExistingPairAdmission({...source,author:'AI/another-author'},review,declarations));
  await assert.rejects(createReviewedExistingPairAdmission(source,{...review,reviewer:'AI/another-reader'},declarations));
  await assert.rejects(createReviewedExistingPairAdmission(source,review,{...declarations,bindingFile:'../other.json'}));
  const basic=validateReviewedSensePack(source,review,records,reserved(),new Set(),admission);
  assert.throws(()=>projectReviewedExistingPairRows({},source,review,basic));
  const changed=structuredClone(basic);changed[0].exampleReviewer='AI/forged-reader';
  assert.throws(()=>projectReviewedExistingPairRows(admission,source,review,changed));
  let reads=0;const getter={...source.entries[0]};Object.defineProperty(getter,'en',{enumerable:true,get(){reads++;return source.entries[0].en;}});
  assert.equal(canReuseReviewedExistingPair(admission,source,review,getter,source.entries[0].term),false);assert.equal(reads,0);
});

test('all60 literal forms and Chinese aliases return the richer card but the original specific example role',async()=>{
  let queries=0;
  for(const row of source.entries){
    const old=evidence.entries.find(item=>item.term===row.term).completeOldDTO;
    for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
      const result=await searchExpandedDictionary(query,{fetchImpl:forbidden}),first=result.results[0];
      assert.equal(first.term,row.term,query);assert.equal(first.partOfSpeech,row.partOfSpeech);assert.equal(first.meaning,row.meaning);
      assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden}),result);
      assert.deepEqual(await loadDictionaryExamples(row.term,{savedEntry:first,fetchImpl:forbidden}),old);queries++;
    }
  }
  assert.equal(queries,60);
  const showcase=await loadDictionaryExamples('showcase',{fetchImpl:forbidden});
  assert.equal(showcase.senses[0].partOfSpeech,'noun');
  assert.notEqual(showcase.senses[0].meaningZh,selected.find(row=>row.term==='showcase').meaning);
});

test('all finite original and new saved contexts preserve complete DTOs and private fields; changed identities fail closed',async()=>{
  let contexts=0;
  for(const row of selected.filter(row=>TERMS.includes(row.term))){
    const old=evidence.entries.find(item=>item.term===row.term).completeOldDTO;
    for(const identity of JSON.parse(row.existingExampleContextsJSON))for(const nested of [false,true]){
      const card={...identity,meaning:nested?{zh:identity.meaning}:identity.meaning,id:'my-saved-'+row.term,
        example:'Keep my manual example',exampleZh:'保留我的译文。',bookPassage:'Keep my quotation',note:'My private note',folderIds:['reading'],study:{box:4,correct:7},review:{dueAt:'2026-11-01'}};
      const before=JSON.stringify(card);assert.deepEqual(await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:forbidden}),old);assert.equal(JSON.stringify(card),before);contexts++;
    }
    for(const identity of [{term:row.term,partOfSpeech:'interjection',meaning:row.meaning},{term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning+' changed'}]){
      assert.equal(await loadDictionaryExamples(row.term,{savedEntry:identity,fetchImpl:forbidden}),null);
    }
    const mutable={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning};
    const pending=loadDictionaryExamples(row.term,{savedEntry:mutable,fetchImpl:forbidden});mutable.meaning+=' changed while pending';assert.equal(await pending,null);
  }
  assert(contexts>=72);
});

test('malformed optional contexts and source pins never read accessors or substitute a different role',async()=>{
  const row=selected.find(item=>item.term==='showcase');
  const identity={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning};
  const pins=dictionaryExamplesRelease.source;
  let reads=0;const getter={...identity};Object.defineProperty(getter,'meaning',{enumerable:true,get(){reads++;return row.meaning;}});
  assert.equal(loadAssociatedEverydayExamples(row.term,{context:getter,sourcePins:pins}),null);assert.equal(reads,0);
  assert.equal(await loadDictionaryExamples(row.term,{savedEntry:getter,fetchImpl:forbidden}),null);assert.equal(reads,0);
  assert.equal(loadAssociatedEverydayExamples(row.term,{context:identity,sourcePins:{...pins,version:'a'.repeat(64)}}),null);
  const controller=new AbortController(),pending=loadDictionaryExamples(row.term,{savedEntry:identity,fetchImpl:forbidden,signal:controller.signal});controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');
});

test('malformed terms retain the original asynchronous rejection contract without starting a fetch',async()=>{
  let fetches=0;
  for(const term of [null,undefined,0,'',{}]){
    let pending;
    assert.doesNotThrow(()=>{pending=loadDictionaryExamples(term,{fetchImpl:()=>{fetches++;throw Error('Must not fetch malformed terms');}});});
    assert.equal(typeof pending?.then,'function');await assert.rejects(pending);
  }
  assert.equal(fetches,0);
});

test('uppercase and explicit-form inputs cannot bypass the canonical saved-context or in-flight guards',async()=>{
  const original=evidence.entries.find(row=>row.term==='perk').completeOldDTO;
  const sense=original.senses[0];let fetches=0;
  const fetchImpl=()=>{fetches++;throw Error('Must not fetch a rejected associated surface');};
  for(const input of ['perk','PERK','perks']){
    const foreign={term:'foreign-head',partOfSpeech:sense.partOfSpeech,meaning:sense.meaningZh};
    assert.equal(await loadDictionaryExamples(input,{savedEntry:foreign,fetchImpl}),null);
    const card={term:'perk',partOfSpeech:sense.partOfSpeech,meaning:sense.meaningZh};
    const pending=loadDictionaryExamples(input,{savedEntry:card,fetchImpl});card.meaning+=' changed before resolution';
    assert.equal(await pending,null);
  }
  // Search resolves a form to its authenticated canonical card before loading.
  const result=await searchExpandedDictionary('perks',{fetchImpl:forbidden});
  assert.equal(result.results[0].term,'perk');
  assert.deepEqual(await loadDictionaryExamples('perk',{savedEntry:result.results[0],fetchImpl}),original);
  assert.equal(fetches,0);
});
