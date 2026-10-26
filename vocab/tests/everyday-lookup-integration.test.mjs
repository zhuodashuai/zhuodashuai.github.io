import test from 'node:test';
import assert from 'node:assert/strict';
import { searchExpandedDictionary } from '../js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../js/personal-lookup-flow.js';
import { loadDictionaryExamples } from '../js/dictionary-examples-current-v4.js';

test('everyday Chinese intent works offline through the real dictionary and personal entry points', async()=>{
  const noNetwork=()=>{throw Error('A local everyday query must not start a network request');};
  for(const query of ['人工客服','真人客服','客服','消毒酒精','医用酒精','快递单号','免洗洗手液']){
    const publicResult=await searchExpandedDictionary(query,{fetchImpl:noNetwork});
    const personalResult=await lookupPersonalDictionaryFast(query,{hotLookup:noNetwork,hotReverse:noNetwork,fullSearch:noNetwork});
    assert(publicResult.results.length,query);assert.deepEqual(personalResult,publicResult);
    for(const row of publicResult.results){assert(row.partOfSpeech);assert(/\p{Script=Han}/u.test(row.meaning));assert.equal(row.source,'卓的日常词组');}
  }
});

test('person/service and alcohol/product queries stay in their intended sense',async()=>{
  const offline={fetchImpl:()=>{throw Error('Unexpected network');}};
  const people=await searchExpandedDictionary('人工客服',offline);
  assert(people.results.some(r=>r.term==='live agent'));
  assert(people.results.every(r=>['live agent','human agent','customer service representative'].includes(r.term)));
  const service=await searchExpandedDictionary('客服',offline);assert.equal(service.results[0].term,'customer service');
  const disinfecting=await searchExpandedDictionary('消毒酒精',offline);
  assert(disinfecting.results.some(r=>r.term==='rubbing alcohol'));
  assert(disinfecting.results.every(r=>['rubbing alcohol','surgical spirit'].includes(r.term)));
  const wipes=await searchExpandedDictionary('酒精棉片',offline);assert(wipes.results.every(r=>!['cotton ball','cotton swab','isopropyl alcohol'].includes(r.term)));
});

test('new phrases include a bilingual learning example without fetching the canonical archive',async()=>{
  for(const term of ['live agent','customer service representative','alcohol prep pad','tracking number']){
    const found=await loadDictionaryExamples(term,{fetchImpl:()=>{throw Error('Unexpected fetch');}});
    assert.equal(found.term,term);assert(found.senses.length);
    for(const sense of found.senses)for(const pair of sense.examples){assert(/[a-z]/iu.test(pair.en));assert(/\p{Script=Han}/u.test(pair.zh));}
  }
});

test('local fast answers retain cancellation semantics at all public adapters',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(searchExpandedDictionary('消毒酒精',{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(lookupPersonalDictionaryFast('人工客服',{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(loadDictionaryExamples('live agent',{signal:controller.signal}),{name:'AbortError'});
});
