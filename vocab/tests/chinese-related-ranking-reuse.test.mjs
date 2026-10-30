import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { searchExpandedDictionary, searchRelatedChineseDictionary, resetExpandedDictionaryCacheForTests } from '../js/expanded-dictionary.js';
import { createLibraryLookupController } from '../js/library-lookup-controller.js';
const manifestURL=new URL('../data/expanded-dictionary/manifest.json',import.meta.url), originalManifest=JSON.parse(await readFile(manifestURL));
const english=url=>/\/en-\d{3}[.]json$/u.test(String(url)), binary=url=>/[.]bin$/u.test(String(url));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function transport(transform){const requests=[];const fetchImpl=async(input,options={})=>{const url=new URL(input);assert.equal(url.protocol,'file:');assert(!options.method||options.method==='GET');assert.equal(options.credentials,'omit');requests.push({url:url.href,options});return await transform?.(url,options)??new Response(await readFile(url));};return{requests,fetchImpl};}
afterEach(()=>resetExpandedDictionaryCacheForTests());
const heads=result=>result.results.map(row=>row.term);
async function allPages(search,query,data){
 const results=[];let offset=0,total;
 for(let page=0;page<1000;page++){
  const next=await search(query,{...data,offset,limit:7});
  assert.equal(next.relatedIntegrated,true);assert.equal(next.ranking,'global');total??=next.total;assert.equal(next.total,total);assert.equal(next.offset,offset);assert.equal(next.nextOffset,offset+next.results.length);results.push(...next.results);
  if(!next.hasMore)break;assert(next.nextOffset>offset);offset=next.nextOffset;assert(page<999);
 }
 assert.equal(results.length,total);assert.equal(new Set(results.map(row=>row.term)).size,total);return{results,total};
}
for(const query of ['开心','不开心','好吃','快速','漂亮','聪明','担心','干净'])test('complete related ranking is identical cold warm and across pages: '+query,async()=>{
 const cold=transport(),expected=await allPages(searchRelatedChineseDictionary,query,cold);assert(expected.results.length>0);assert.equal(cold.requests.filter(row=>binary(row.url)).length,1);
 const warm=transport(),complete=await allPages(searchExpandedDictionary,query,warm),start=warm.requests.length,result=await allPages(searchRelatedChineseDictionary,query,warm);
 assert.deepEqual(result,expected);assert.deepEqual(result.results,complete.results.filter(row=>row.matchType==='related'));assert(!warm.requests.slice(start).some(row=>english(row.url)||binary(row.url)),'Ready authenticated corpus must be reused');
 if(query==='开心')assert(heads(result).includes('happy'));if(query==='不开心')assert(!heads(result).some(head=>['happy','glad'].includes(head)));if(query==='好吃')assert(!heads(result).includes('unpalatable'));
});
test('primary and related callers share the real in-flight complete ranking download',async()=>{
 const gate=deferred(),seen=deferred(),data=transport(async url=>{if(binary(url)){seen.resolve();await gate.promise;}});
 const primary=searchExpandedDictionary('热',data);await seen.promise;let settled=false;const related=searchRelatedChineseDictionary('开心',data).finally(()=>{settled=true;});
 try{await delay(20);assert.equal(settled,false);assert.equal(data.requests.filter(row=>binary(row.url)).length,1);}finally{gate.resolve();}
 const[first,second]=await Promise.all([primary,related]);assert.equal(first.ranking,'global');assert(heads(second).includes('happy'));assert.equal(data.requests.filter(row=>binary(row.url)).length,1);
});
for(const kind of ['manifest hash','record count'])test('changed '+kind+' cannot reuse the ready ranking or hide integrity failure',async()=>{
 let changed=false;const now=Date.now,data=transport(async url=>{if(url.href===manifestURL.href&&changed){const next=structuredClone(originalManifest);if(kind==='manifest hash')next.sources.mit.name+=' changed fixture';else next.counts.records++;return new Response(JSON.stringify(next));}});
 await searchExpandedDictionary('热',data);changed=true;
 try{Date.now=()=>now()+61000;await assert.rejects(searchRelatedChineseDictionary('开心',data),{code:'invalid_dictionary_data'});}finally{Date.now=now;}
});
test('another manifest version explicitly uses limited legacy reads rather than the wrong global index',async()=>{
 const version='0'.repeat(64),data=transport(async url=>{
  if(url.href===manifestURL.href){const next=structuredClone(originalManifest);next.version=version;for(const group of[next.english,next.chinese])for(const shard of group.shards)shard.file=shard.file.replace(originalManifest.version,version);return new Response(JSON.stringify(next));}
  if(url.pathname.includes('/'+version+'/'))return new Response(await readFile(new URL(url.href.replace(version,originalManifest.version))));
 });
 const result=await searchExpandedDictionary('热',data);assert.equal(result.coverage,'limited');assert.equal(result.ranking,'limited');assert(!data.requests.some(row=>binary(row.url)));assert(data.requests.some(row=>english(row.url)));
});
test('corrupt ranking bytes fail closed for both entry points and are never reused',async()=>{
 const data=transport(async url=>{if(binary(url)){const bad=Buffer.from(await readFile(url));bad[bad.length-1]^=1;return new Response(bad);}});
 await assert.rejects(searchExpandedDictionary('热',data),{code:'invalid_dictionary_data'});await assert.rejects(searchRelatedChineseDictionary('开心',data),{code:'invalid_dictionary_data'});assert.equal(data.requests.filter(row=>binary(row.url)).length,2);
});
test('ranking-only Chinese reads cannot populate the genuine English source cache',async()=>{
 const data=transport();await searchExpandedDictionary('开心',data);await searchRelatedChineseDictionary('开心',data);assert(!data.requests.some(row=>english(row.url)));
 const start=data.requests.length,result=await searchExpandedDictionary('happy',data);assert.equal(heads(result)[0],'happy');assert.equal(data.requests.slice(start).filter(row=>english(row.url)).length,1,'Literal English must authenticate its real shard');
});
test('selected meanings retain real English authentication and private provenance',async()=>{
 const good=transport();await searchExpandedDictionary('热',good);const start=good.requests.length,result=await searchExpandedDictionary('责任',good),selected=result.results.find(row=>row.term==='obligation');assert.equal(selected.matchedSourceEvidence.kind,'reviewed-canonical-primary');assert(good.requests.slice(start).some(row=>/\/en-041[.]json$/u.test(row.url)));
 const bad=transport(async url=>{if(/\/en-041[.]json$/u.test(url.href)){const shard=JSON.parse(await readFile(url));shard.records.find(row=>row.term==='obligation').meaning+=' changed';return new Response(JSON.stringify(shard));}});await searchExpandedDictionary('热',bad);await assert.rejects(searchExpandedDictionary('责任',bad),{code:'invalid_dictionary_data'});await assert.rejects(searchRelatedChineseDictionary('责任',bad),{code:'invalid_dictionary_data'});
});
test('already cancelled related lookup makes no extra requests with a ready corpus',async()=>{
 const data=transport();await searchExpandedDictionary('热',data);const start=data.requests.length,controller=new AbortController();controller.abort();await assert.rejects(searchRelatedChineseDictionary('开心',{...data,signal:controller.signal}),{name:'AbortError'});assert.equal(data.requests.length,start);
});
test('cancelling during actual ranking download cannot publish into another library query',async()=>{
 const gate=deferred(),seen=deferred(),states=[],data=transport(async url=>{if(binary(url)){seen.resolve();await gate.promise;}});
 const controller=createLibraryLookupController({search:(input,options)=>searchExpandedDictionary(input,{...options,...data}),relatedSearch:(input,options)=>searchRelatedChineseDictionary(input,{...options,...data}),onChange:value=>states.push({input:value.lookup.input,heads:heads(value.lookup)})});
 try{const old=controller.submit('开心');await seen.promise;controller.change('abacus');gate.resolve();await old;await controller.submit('abacus');assert.equal(controller.getState().lookup.input,'abacus');assert.deepEqual(heads(controller.getState().lookup),['abacus']);assert(!states.filter(row=>row.input==='abacus').some(row=>row.heads.includes('happy')));}finally{gate.resolve();controller.dispose();}
});
test('integrated library lookup needs no legacy English sidecar and performs no writes',async()=>{
 let englishReads=0,writes=0,relatedCalls=0;const data=transport(async url=>{if(english(url))englishReads++;});
 const controller=createLibraryLookupController({ownerRequested:false,ownerOrigin:false,collect:()=>{writes++;throw Error('No write permitted');},search:(input,options)=>searchExpandedDictionary(input,{...options,...data}),relatedSearch:()=>{relatedCalls++;throw Error('No second sidecar');}});
 try{await controller.submit('开心');const result=controller.getState().lookup;assert.equal(result.phase,'ready');assert(result.results.some(row=>row.term==='happy'));assert.equal(relatedCalls,0);assert.equal(englishReads,0);assert.equal(writes,0);}finally{controller.dispose();}
});
