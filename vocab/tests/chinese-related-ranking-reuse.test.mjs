import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { searchExpandedDictionary, searchRelatedChineseDictionary, resetExpandedDictionaryCacheForTests } from '../js/expanded-dictionary.js';
import { chineseSearchHeads, chineseSearchPlan } from '../js/chinese-search.js';
import { createLibraryLookupController } from '../js/library-lookup-controller.js';

const manifestURL=new URL('../data/expanded-dictionary/manifest.json',import.meta.url),originalManifest=JSON.parse(await readFile(manifestURL));
const english=url=>/\/en-\d{3}[.]json$/u.test(String(url)),binary=url=>/[.]bin$/u.test(String(url));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function transport(transform){const requests=[];const fetchImpl=async(input,options={})=>{const url=new URL(input);assert.equal(url.protocol,'file:');assert(!options.method||options.method==='GET');assert.equal(options.credentials,'omit');requests.push({url:url.href,options});const changed=await transform?.(url,options);return changed??new Response(await readFile(url));};return{requests,fetchImpl};}
afterEach(()=>resetExpandedDictionaryCacheForTests());
const heads=result=>result.results.map(row=>row.term);

for(const query of ['开心','不开心','好吃','快速','漂亮','聪明','担心','干净'])test('warm generic related ranking preserves exact cold results, order and hasMore: '+query,async()=>{
  assert(chineseSearchPlan(query));assert.equal(chineseSearchHeads(query),null);
  const cold=transport(),expected=await searchRelatedChineseDictionary(query,cold);assert(expected.results.length>0);assert(cold.requests.some(row=>english(row.url)));assert(!cold.requests.some(row=>binary(row.url)));assert(new Set(cold.requests.filter(row=>english(row.url)).map(row=>row.url)).size<=32,'Cold scan must retain the32-bucket budget');
  const warm=transport();await searchExpandedDictionary(query,warm);const start=warm.requests.length,result=await searchRelatedChineseDictionary(query,warm);
  assert.deepEqual(result,expected);assert(!warm.requests.slice(start).some(row=>english(row.url)||binary(row.url)),'An already authenticated ranking must avoid cold English downloads');
  if(query==='开心')assert.equal(heads(result)[0],'happy');
  if(query==='不开心')assert(!heads(result).some(head=>['happy','glad'].includes(head)));
  if(query==='好吃')assert(!heads(result).includes('unpalatable'));
});

test('uncached related lookup keeps the genuine English route and never starts a ranking download',async()=>{
  const data=transport();const result=await searchRelatedChineseDictionary('开心',data);assert.equal(heads(result)[0],'happy');assert(data.requests.some(row=>english(row.url)));assert(!data.requests.some(row=>binary(row.url)));
});

test('related lookup does not await or borrow an in-flight ranking download',async()=>{
  const gate=deferred(),seen=deferred();let rankingReleased=false;
  const data=transport(async url=>{if(binary(url)){seen.resolve();await gate.promise;rankingReleased=true;}});
  const primary=searchExpandedDictionary('热',data);await seen.promise;
  try{const related=await searchRelatedChineseDictionary('开心',data);assert.equal(heads(related)[0],'happy');assert.equal(rankingReleased,false);assert(data.requests.some(row=>english(row.url)));assert.equal(data.requests.filter(row=>binary(row.url)).length,1);}
  finally{gate.resolve();await primary;}
});

for(const kind of ['version','manifest hash','record count'])test('ready ranking with changed '+kind+' falls back to exact English source reads',async()=>{
  let changed=false;const now=Date.now;
  const transform=async url=>{
    if(url.href===manifestURL.href&&changed){const next=structuredClone(originalManifest);if(kind==='version'){next.version='0'.repeat(64);for(const group of[next.english,next.chinese])for(const shard of group.shards)shard.file=shard.file.replace(originalManifest.version,next.version);}else if(kind==='manifest hash')next.sources.mit.name+=' (changed fixture)';else next.counts.records++;return new Response(JSON.stringify(next));}
    if(kind==='version'&&url.pathname.includes('/'+'0'.repeat(64)+'/'))return new Response(await readFile(new URL(url.href.replace('0'.repeat(64),originalManifest.version))));
  };
  const warm=transport(transform);await searchExpandedDictionary('热',warm);changed=true;
  try{Date.now=()=>now()+61000;const start=warm.requests.length,result=await searchRelatedChineseDictionary('开心',warm);assert.equal(heads(result)[0],'happy');assert(warm.requests.slice(start).some(row=>english(row.url)));assert(!warm.requests.slice(start).some(row=>binary(row.url)));
    const cold=transport(transform);assert.deepEqual(result,await searchRelatedChineseDictionary('开心',cold));
  }finally{Date.now=now;}
});

test('failed corrupt ranking is never reused by a later related lookup',async()=>{
  const data=transport(async url=>{if(binary(url)){const bad=Buffer.from(await readFile(url));bad[bad.length-1]^=1;return new Response(bad);}});
  await assert.rejects(searchExpandedDictionary('热',data),{code:'invalid_dictionary_data'});const start=data.requests.length,result=await searchRelatedChineseDictionary('开心',data);assert.equal(heads(result)[0],'happy');assert(data.requests.slice(start).some(row=>english(row.url)));assert(!data.requests.slice(start).some(row=>binary(row.url)));
});

test('virtual related buckets never populate the genuine English shard cache',async()=>{
  const data=transport();await searchExpandedDictionary('开心',data);const start=data.requests.length;await searchRelatedChineseDictionary('开心',data);assert(!data.requests.slice(start).some(row=>english(row.url)));
  const afterRelated=data.requests.length;const result=await searchExpandedDictionary('happy',data);assert.equal(heads(result)[0],'happy');assert.equal(data.requests.slice(afterRelated).filter(row=>english(row.url)).length,1,'Literal English lookup must authenticate its real shard after a ranking-only association');
});

test('warm source-bound and finite-head plans retain genuine English authentication and private provenance',async()=>{
  for(const query of ['义务','责任','大夫']){const cold=transport(),expected=await searchRelatedChineseDictionary(query,cold),warm=transport();await searchExpandedDictionary('热',warm);const start=warm.requests.length,result=await searchRelatedChineseDictionary(query,warm);assert.deepEqual(result,expected);assert(warm.requests.slice(start).some(row=>english(row.url)),query+' lost genuine English source reads');}
  const good=transport();await searchExpandedDictionary('热',good);const start=good.requests.length;const result=await searchExpandedDictionary('责任',good),selected=result.results.find(row=>row.term==='obligation');assert.equal(selected.matchedSourceEvidence.kind,'reviewed-canonical-primary');assert(good.requests.slice(start).some(row=>/\/en-041[.]json$/u.test(row.url)));
  const bad=transport(async url=>{if(/\/en-041[.]json$/u.test(url.href)){const shard=JSON.parse(await readFile(url));shard.records.find(row=>row.term==='obligation').meaning+=' changed';return new Response(JSON.stringify(shard));}});await searchExpandedDictionary('热',bad);await assert.rejects(searchExpandedDictionary('责任',bad),{code:'invalid_dictionary_data'});
});

test('already cancelled warm related lookup makes no additional requests',async()=>{
  const data=transport();await searchExpandedDictionary('热',data);const start=data.requests.length,controller=new AbortController();controller.abort();await assert.rejects(searchRelatedChineseDictionary('开心',{...data,signal:controller.signal}),{name:'AbortError'});assert.equal(data.requests.length,start);
});

test('warm related cancellation while postings are pending cannot publish into a later library query',async()=>{
  const gate=deferred(),seen=deferred(),settled=deferred();let block=false;const states=[];
  const data=transport(async url=>{if(block&&/\/zh-041[.]json$/u.test(url.href)){seen.resolve();await gate.promise;settled.resolve();}});await searchExpandedDictionary('热',data);block=true;
  const controller=createLibraryLookupController({search:(input,options)=>searchExpandedDictionary(input,{...options,...data}),relatedSearch:(input,options)=>searchRelatedChineseDictionary(input,{...options,...data}),onChange:value=>states.push({input:value.lookup.input,heads:heads(value.lookup)})});
  try{await controller.submit('开心');await seen.promise;controller.change('abacus');gate.resolve();await settled.promise;await controller.submit('abacus');assert.equal(controller.getState().lookup.input,'abacus');assert.deepEqual(heads(controller.getState().lookup),['abacus']);assert(!states.filter(row=>row.input==='abacus').some(row=>row.heads.includes('happy')));}
  finally{gate.resolve();controller.dispose();}
});

test('actual library controller keeps happy visible despite 5.2 second cold English transport and performs no writes',async()=>{
  let englishDelays=0,writes=0;const done=deferred();const data=transport(async(url,options)=>{if(english(url)){englishDelays++;await delay(5200,undefined,{signal:options.signal});}});
  const controller=createLibraryLookupController({ownerRequested:false,ownerOrigin:false,collect:()=>{writes++;throw Error('No write permitted');},search:(input,options)=>searchExpandedDictionary(input,{...options,...data}),relatedSearch:(input,options)=>searchRelatedChineseDictionary(input,{...options,...data}),onChange:value=>{if(['ready','error'].includes(value.lookup.relatedPhase))done.resolve();}});
  try{await controller.submit('开心');await done.promise;const result=controller.getState().lookup;assert.equal(result.relatedPhase,'ready');assert.equal(result.results[0].term,'chuffed');assert(result.results.some(row=>row.term==='happy'));assert.equal(englishDelays,0);assert.equal(writes,0);}
  finally{controller.dispose();}
});
