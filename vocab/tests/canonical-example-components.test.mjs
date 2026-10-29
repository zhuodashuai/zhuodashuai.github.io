import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../js/dictionary-examples-current-v4.js';
import {CANONICAL_EXAMPLE_COMPONENTS as table} from '../js/canonical-example-components-data.js';
import {createCanonicalExampleComponentResolver} from '../js/canonical-example-components.js';
const root=new URL('../../',import.meta.url),dir=new URL('tooling/dictionary/examples/evidence/classroom-components-0012/',root);
const {rows}=JSON.parse(await fs.readFile(new URL('bindings.json',dir))),source=JSON.parse(await fs.readFile(new URL('source.json',dir)));
const fetchImpl=async(url)=>new Response(await fs.readFile(fileURLToPath(url)));
test('only the eight reviewed literal heads enter the optional graph and its offline shell is complete',async()=>{
  const adapter=await fs.readFile(new URL('vocab/js/dictionary-examples-current-v4.js',root),'utf8');
  const declaration=adapter.match(/const componentHeads=new Set\((\[[^\n]+\])\);/u);
  assert(declaration);assert.deepEqual(JSON.parse(declaration[1].replaceAll("'",'"')),table.rows.map(r=>r.term));
  const shell=await fs.readFile(new URL('vocab/sw.js',root),'utf8');
  assert(shell.includes('const CACHE_NAME = "zhuo-wordbook-v100"'));
  for(const file of ['canonical-example-components.js','canonical-example-components-data.js'])assert(shell.includes(`"./js/${file}"`));
});
for(const row of rows)test(`real ${row.term} appends only its distinct reviewed component to exact canonical context`,async()=>{
  try{
    const pair=source.entries.find(p=>p.term===row.term);
    const result=await loadDictionaryExamples(row.term,{fetchImpl,savedEntry:{term:row.term,partOfSpeech:row.exactCanonicalRecord.partOfSpeech,meaning:row.exactCanonicalRecord.meaning}});
    assert.deepEqual({term:result.term,senses:result.senses.slice(0,-1)},row.originalDTO);
    assert.equal(result.senses.length,row.originalDTO.senses.length+1);
    assert.equal(result.senses.at(-1).meaningZh,pair.meaningZh);
    assert.deepEqual(result.senses.at(-1).examples,[{en:pair.en,zh:pair.zh}]);
  }finally{resetDictionaryExamplesCacheForTests();}
});
test('same POS and caller approval flags do not authorize an unrelated saved sense',async()=>{
  try{assert.equal(await loadDictionaryExamples('fertilize',{fetchImpl,savedEntry:{term:'fertilize',partOfSpeech:'verb',meaning:'完全不同的未审核义项',approved:true},approved:true}),null);}
  finally{resetDictionaryExamplesCacheForTests();}
});
for(const row of table.rows)test(`all finite contexts preserve or select the exact role: ${row.term}`,async()=>{
  const resolver=createCanonicalExampleComponentResolver(table,{fetchImpl,loadOriginalEntry:async term=>structuredClone(table.rows.find(r=>r.term===term).expectedOriginalEntry)});
  try{
    assert.equal((await resolver.load(row.term)).senses.length,row.expectedOriginalEntry.senses.length+1);
    for(const savedEntry of row.canonicalContexts)assert.equal((await resolver.load(row.term,{savedEntry})).senses.at(-1).id,row.componentId);
    for(const savedEntry of row.legacyContexts)assert.deepEqual(await resolver.load(row.term,{savedEntry}),row.expectedOriginalEntry);
    for(const savedEntry of row.componentContexts){const result=await resolver.load(row.term,{savedEntry});assert.equal(result.senses.length,1);assert.equal(result.senses[0].id,row.componentId);}
    const savedEntry={...row.legacyContexts[0],examples:[{en:'Stored text.',zh:'保存内容。'}],bookPassage:'Existing passage.',study:{box:4}},before=JSON.stringify(savedEntry);
    await resolver.load(row.term,{savedEntry});assert.equal(JSON.stringify(savedEntry),before);
  }finally{resolver.close();}
});
test('literal forms, wrong heads, same POS, caller flags and getters cannot acquire components',async()=>{
  let calls=0,reads=0;const row=table.rows[0],resolver=createCanonicalExampleComponentResolver(table,{fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);},loadOriginalEntry:async()=>structuredClone(row.expectedOriginalEntry)});
  try{
    for(const term of ['Respectable','ｒｅｓｐｅｃｔａｂｌｅ','respectables',' respectable ','well-adjusted'])assert.equal(await resolver.load(term),null);
    for(const savedEntry of [{...row.componentContexts[0],term:'other'}, {...row.componentContexts[0],meaning:'未审核的同词性含义',approved:true}])assert.equal(await resolver.load(row.term,{savedEntry}),null);
    assert.equal(await resolver.load(row.term,{savedEntry:row.componentContexts[0],approved:true}),null);
    const card={term:row.term,meaning:row.exactCanonicalRecord.meaning};Object.defineProperty(card,'partOfSpeech',{enumerable:true,get(){reads++;return 'adjective';}});
    assert.equal(await resolver.load(row.term,{savedEntry:card}),null);
    const options={};Object.defineProperty(options,'savedEntry',{enumerable:true,get(){reads++;return row.componentContexts[0];}});
    assert.equal(await resolver.load(row.term,options),null);assert.equal(reads,0);assert.equal(calls,0);
  }finally{resolver.close();}
});
test('a failed optional canonical check preserves valid old DTOs but never supplies the new component',async()=>{
  const row=table.rows.find(r=>r.term==='burden'),resolver=createCanonicalExampleComponentResolver(table,{fetchImpl:async()=>new Response('{}'),loadOriginalEntry:async()=>structuredClone(row.expectedOriginalEntry)});
  try{assert.deepEqual(await resolver.load(row.term,{savedEntry:row.canonicalContexts[0]}),row.expectedOriginalEntry);assert.equal(await resolver.load(row.term,{savedEntry:row.componentContexts[0]}),null);}
  finally{resolver.close();}
});
for(const [name,change]of [
  ['old sense omitted',old=>old.senses.pop()],['old ordering',old=>old.senses.reverse()],
  ['old ID',old=>old.senses[0].id='unbound'],['old metadata',old=>old.senses[0].reviewer='AI/unbound'],
  ['old pair',old=>old.senses[0].examples[0].zh='未经审核的变化。']
])test(`changed complete original ${name} cannot acquire a component`,async()=>{
  const row=table.rows.find(r=>r.term==='claim'),old=structuredClone(row.expectedOriginalEntry);change(old);
  const resolver=createCanonicalExampleComponentResolver(table,{fetchImpl,loadOriginalEntry:async()=>old});
  try{assert.equal(await resolver.load(row.term),null);}finally{resolver.close();}
});
test('card mutation while source authentication is pending invalidates the result',async()=>{
  const row=table.rows[0],savedEntry={...row.canonicalContexts[0]};let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const resolver=createCanonicalExampleComponentResolver(table,{fetchImpl:async(...args)=>{await gate;return fetchImpl(...args);},loadOriginalEntry:async()=>structuredClone(row.expectedOriginalEntry)});
  try{const pending=resolver.load(row.term,{savedEntry});savedEntry.meaning='异步期间修改了含义';release();assert.equal(await pending,null);}finally{release();resolver.close();}
});
test('original mutation while its digest is pending invalidates the result',async()=>{
  const row=table.rows[0],old=structuredClone(row.expectedOriginalEntry),bytes=Buffer.from(JSON.stringify(old)),native=globalThis.crypto;
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');let release,started;
  const gate=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:async(algorithm,input)=>{if(Buffer.from(input).equals(bytes)){started();await gate;}return native.subtle.digest(algorithm,input);}}}});
  const resolver=createCanonicalExampleComponentResolver(table,{fetchImpl,loadOriginalEntry:async()=>old});
  try{const pending=resolver.load(row.term);await ready;old.senses[0].meaningZh='摘要期间发生变化';release();assert.equal(await pending,null);}
  finally{release();resolver.close();Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('returned old and new examples are independent snapshots',async()=>{
  const row=table.rows[0],resolver=createCanonicalExampleComponentResolver(table,{fetchImpl,loadOriginalEntry:async()=>structuredClone(row.expectedOriginalEntry)});
  try{const a=await resolver.load(row.term);a.senses[0].examples[0].zh='改动';a.senses.at(-1).examples[0].en='Changed.';const b=await resolver.load(row.term);assert.deepEqual(b.senses[0],row.expectedOriginalEntry.senses[0]);assert.equal(b.senses.at(-1).examples[0].en,row.componentPair.en);}
  finally{resolver.close();}
});
test('new table scope, source flags and pair hashes cannot be broadened',async()=>{
  const altered=structuredClone(table);altered.rows[0].wholeRawSourceApproved=true;
  assert.throws(()=>createCanonicalExampleComponentResolver(altered,{fetchImpl,loadOriginalEntry:async()=>null}));
  const ninth=structuredClone(table);ninth.rows[0].term='well-adjusted';
  assert.throws(()=>createCanonicalExampleComponentResolver(ninth,{fetchImpl,loadOriginalEntry:async()=>null}));
  const changed=structuredClone(table),row=changed.rows[0];row.componentPair.en='An unapproved changed sentence.';
  const resolver=createCanonicalExampleComponentResolver(changed,{fetchImpl,loadOriginalEntry:async()=>structuredClone(row.expectedOriginalEntry)});
  try{assert.equal(await resolver.load(row.term),null);}finally{resolver.close();}
});
test('abort, close and a bounded deadline settle even when the old dependency ignores cancellation',async()=>{
  const row=table.rows[0],never=()=>new Promise(()=>{}),controller=new AbortController();
  const resolver=createCanonicalExampleComponentResolver(table,{fetchImpl,loadOriginalEntry:never,timeoutMs:30});
  try{assert.equal(await resolver.load(row.term),null);const pending=resolver.load(row.term,{signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});}
  finally{resolver.close();}
  const closed=createCanonicalExampleComponentResolver(table,{fetchImpl,loadOriginalEntry:never});
  const pending=closed.load(row.term);closed.close();await assert.rejects(pending,{name:'AbortError'});
});
