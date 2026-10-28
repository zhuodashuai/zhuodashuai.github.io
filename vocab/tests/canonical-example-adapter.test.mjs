import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CANONICAL_EXAMPLE_REPAIRS as table} from '../js/canonical-example-repairs-data.js';
import {loadDictionaryExamples,createDictionaryExamplesController,resetDictionaryExamplesCacheForTests} from '../js/dictionary-examples-current-v4.js';

const localFetch=async url=>new Response(await readFile(new URL(url)));
test('every independently approved literal head reaches the current adapter and preserves saved dictionary fields',async()=>{
  for(const row of table.rows){
    const card={...row.acceptedDisplayContexts.at(-1),example:'My existing sentence.',note:'Keep my note.',progress:{box:4}};
    const before=structuredClone(card);
    const entry=await loadDictionaryExamples(row.term,{fetchImpl:localFetch,savedEntry:card});
    assert(entry,`missing approved literal head ${row.term}`);
    assert.equal(entry.senses[0].id,row.senseId);
    assert.deepEqual(entry.senses[0].examples,[{en:row.replacementPair.en,zh:row.replacementPair.zh},...(row.additionalExamples||[])]);
    assert.deepEqual(card,before);
    assert.notEqual(entry.senses[0].id,row.expectedOriginalEntry.senses[0].id);
  }
  resetDictionaryExamplesCacheForTests();
});
test('current adapter never returns the old wrong-sense example after optional source failure',async()=>{
  const row=table.rows.find(row=>row.term==='hubble');
  assert.equal(await loadDictionaryExamples(row.term,{fetchImpl:async()=>{throw Error('offline source');},savedEntry:row.acceptedDisplayContexts[0]}),null);
  let calls=0;
  assert.equal(await loadDictionaryExamples(row.term,{fetchImpl:async()=>{calls++;return localFetch();},
    savedEntry:{term:row.term,partOfSpeech:'proper noun',meaning:'哈勃太空望远镜的常用简称Hubble'}}),null);
  assert.equal(calls,0);
  resetDictionaryExamplesCacheForTests();
});
test('current controller rejects malformed managed contexts before an injected loader runs',async()=>{
  let calls=0;
  const controller=createDictionaryExamplesController({load:async()=>{calls++;return {term:'hubble',senses:[]};}});
  for(const entry of [null,{}, {term:'hubble',meaning:'n. 小凸起, 小瘤'},Object.create({partOfSpeech:'noun',meaning:'n. 小凸起, 小瘤'})]){
    await controller.show('hubble',{savedEntry:entry});
    assert.equal(controller.getState().phase,'missing');
  }
  assert.equal(calls,0);controller.clear();
});
for(const field of ['term','partOfSpeech','meaning'])test(`current controller discards a same-card ${field} edit while its example is pending`,async()=>{
  let finish;
  const controller=createDictionaryExamplesController({load:()=>new Promise(resolve=>{finish=resolve;})});
  const card={...table.rows.find(row=>row.term==='hubble').acceptedDisplayContexts[0]};
  const pending=controller.show('hubble',{savedEntry:card});
  card[field]='A different saved identity';
  finish({term:'hubble',senses:[]});await pending;
  assert.equal(controller.getState().phase,'missing');controller.clear();
});
test('same-card metadata edits remain eligible; switching cards cancels the previous result',async()=>{
  const waits=[];
  const controller=createDictionaryExamplesController({load:(term,{signal})=>new Promise(resolve=>waits.push({term,signal,resolve}))});
  const row=table.rows.find(row=>row.term==='hubble'),card={...row.acceptedDisplayContexts[0],note:'old'};
  const pending=controller.show(row.term,{savedEntry:card});card.note='new';
  waits[0].resolve({term:row.term,senses:[]});await pending;assert.equal(controller.getState().phase,'ready');
  const old=controller.show(row.term,{savedEntry:card});
  const next=controller.show('other',{savedEntry:{partOfSpeech:'verb',meaning:'其他义项'}});
  assert(waits[1].signal.aborted);waits[1].resolve({term:row.term,senses:[]});
  waits[2].resolve(null);await Promise.all([old,next]);
  assert.equal(controller.getState().term,'other');assert.equal(controller.getState().phase,'missing');controller.clear();
});
test('service worker keeps legacy offline caches and installs the complete new optional graph',async()=>{
  const body=await readFile(new URL('../sw.js',import.meta.url),'utf8');
  assert(body.includes('const CACHE_NAME = "zhuo-wordbook-v100"'));
  for(const file of ['canonical-example-repair-source.js','dictionary-canonical-example-repairs.js','canonical-example-repairs-data.js'])assert(body.includes(`"./js/${file}"`));
});
