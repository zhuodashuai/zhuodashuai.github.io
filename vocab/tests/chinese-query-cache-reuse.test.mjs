import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {chineseQueryCacheBucket} from '../js/chinese-query-cache-format.js';

const source=await readFile(new URL('../js/chinese-query-cache.js',import.meta.url),'utf8');
const root=new URL('../data/chinese-query-cache/',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
const dictionaryVersion='1'.repeat(64),engineBinding='3'.repeat(64),sourceManifestSha256='2'.repeat(64),buildVersion='4'.repeat(64);
const manifest={version:dictionaryVersion,integritySha256:sourceManifestSha256},selectionSources=[{file:'vocab/data/ecdict-core.json',sha256:'9'.repeat(64),bytes:1963099,entries:7502,license:'MIT'}];
const origin={dictionaryVersion:'a'.repeat(64),engineBinding:'b'.repeat(64),sourceManifestSha256:'c'.repeat(64),buildVersion:'d'.repeat(64),releaseFileSha256:'e'.repeat(64),selectionSources};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const live=[];afterEach(()=>live.splice(0).forEach(mod=>mod.resetChineseQueryPacketCacheForTests()));
function queries(count=3){const result=['开心'];for(let i=0;result.length<count;i++){const query='测试'+i;if(chineseQueryCacheBucket(query)===chineseQueryCacheBucket('开心'))result.push(query);}return result.sort();}
function dto(index=0){return {term:'happy'+index,partOfSpeech:'adjective',meaning:'① 开心的。',source:'原创学习释义',license:'Original composition',url:'https://zhuodashuai.github.io/vocab/',
  alternatives:[{partOfSpeech:'adjective',meaning:'愉快的',source:'ECDICT',license:'MIT',url:'https://github.com/skywind3000/ECDICT'}],
  matchType:'related',matchedChinese:'快乐',matchedPartOfSpeech:'adjective',matchedSense:'开心／愉快',
  matchedExampleSenseIds:['sense:'+index],matchedExampleSenseEvidence:[{id:'sense:'+index,partOfSpeech:'adjective',meaningZh:'开心的',examples:[{en:'The team was happy with the result.',zh:'团队对结果很满意。'}]}],
  matchedSourceEvidence:{kind:'reviewed-canonical-primary',groupId:'common',sourceId:'reviewed:happy',canonicalId:42,canonicalSourceSha256:'a'.repeat(64),selectedSourceSha256:'b'.repeat(64),selectedRowSha256:'c'.repeat(64)}};}
function fixture({packet:changePacket,bundle:changeBundle,entry:changeEntry,bucket:changeBucket,release:changeRelease,count=3,authorizeMutation=false}={}){
  const members=queries(count),assets=new Map(),expected=new Map(),entries=Array.from({length:64},()=>[]),bundleFiles=[];
  const zip=payload=>{const decoded=Buffer.from(JSON.stringify(payload)),bytes=gzipSync(decoded);return {bytes,decoded,sha256:sha(bytes)};};
  for(const [index,group]of [members.slice(0,Math.min(2,count)),members.slice(2)].entries()){
    if(!group.length)continue;const owner=index===0?origin:{dictionaryVersion,engineBinding,buildVersion};
    const packets=group.map((query,i)=>{const packet={query,metadata:{query,total:2,ranking:'global',relatedIntegrated:true},results:[dto(i),dto(i+10)]};expected.set(query,structuredClone(packet));return packet;});
    const hashes=new Map(packets.map(packet=>[packet.query,sha(stable(packet))]));
    const payload={schemaVersion:1,dictionaryVersion:owner.dictionaryVersion,engineBinding:owner.engineBinding,packets};
    packets.forEach((packet,i)=>changePacket?.(packet,i,index));changeBundle?.(payload,index);
    if(authorizeMutation)for(const packet of packets)hashes.set(packet.query,sha(stable(packet)));
    const zipped=zip(payload),file=owner.buildVersion+'/'+zipped.sha256+'.bin';assets.set(new URL(file,root).href,zipped.bytes);bundleFiles.push(new URL(file,root).href);
    for(const query of group){const entry={query,file,sha256:zipped.sha256,bytes:zipped.bytes.length,uncompressedBytes:zipped.decoded.length,total:expected.get(query).metadata.total,packetSha256:hashes.get(query)};
      changeEntry?.(entry,query,index);entries[chineseQueryCacheBucket(query)].push(entry);}
  }
  const buckets=entries.map((items,bucket)=>{items.sort((a,b)=>a.query<b.query?-1:1);const payload={schemaVersion:2,dictionaryVersion,engineBinding,bucket,entries:items};changeBucket?.(payload,bucket);
    const zipped=zip(payload),file=buildVersion+'/'+zipped.sha256+'.bin';assets.set(new URL(file,root).href,zipped.bytes);return {bucket,file,sha256:zipped.sha256,bytes:zipped.bytes.length,uncompressedBytes:zipped.decoded.length};});
  const release={schemaVersion:2,dictionaryVersion,engineBinding,sourceManifestSha256,buildVersion,members,buckets,selectionSources,
    legacyOrigins:[structuredClone(origin)],authorization:{kind:'complete-source-and-related-replay',currentSourceCompileBuildVersion:'5'.repeat(64),currentSourceCompileEngineBinding:engineBinding,
      currentSourceCompileReleaseSha256:'6'.repeat(64),fullSourceAndRelatedCheckLogSha256:'7'.repeat(64)}};changeRelease?.(release);
  return {release,assets,expected,bundleFiles,members};
}
async function reader(fx){let transformed=source;for(const [before,after]of [
  ["import { CHINESE_QUERY_CACHE_RELEASE } from './chinese-query-cache-release.js?v=118';",'const CHINESE_QUERY_CACHE_RELEASE = '+JSON.stringify(fx.release)+';'],
  ["'./chinese-query-cache-format.js?v=118'",JSON.stringify(new URL('../js/chinese-query-cache-format.js?v=118',import.meta.url).href)],
  ["new URL('../data/chinese-query-cache/', import.meta.url)",'new URL('+JSON.stringify(root.href)+')']]){assert.equal(transformed.split(before).length,2);transformed=transformed.replace(before,after);}
  transformed+='\nexport { CHINESE_QUERY_CACHE_RELEASE as fixtureRelease };';const mod=await import('data:text/javascript;base64,'+Buffer.from(transformed).toString('base64')+'#'+Math.random());live.push(mod);return mod;}
function transport(fx,override){const requests=[];const fetchImpl=async(input,options)=>{const url=new URL(input);assert(url.href.startsWith(root.href));assert.match(url.href.slice(root.href.length),/^[a-f0-9]{64}\/[a-f0-9]{64}\.bin$/u);
  assert.equal(options.credentials,'omit');assert(!options.method&&!options.body);requests.push({url:url.href,options});const response=await override?.(url,options,requests.length);if(response!==undefined)return response;assert(fx.assets.has(url.href));return new Response(fx.assets.get(url.href));};return {fetchImpl,requests};}
const options=data=>({manifest,engineBinding,...data});
const invalid=error=>error?.code==='invalid_dictionary_data';

for(const [name,change]of [
  ...['buildVersion','dictionaryVersion','sourceManifestSha256','engineBinding','releaseFileSha256'].map(key=>['legacy.'+key,{release:value=>{value.legacyOrigins[0][key]=[value.legacyOrigins[0][key]];}}]),
  ['legacy.selectionSources.sha256',{release:value=>{const source=value.legacyOrigins[0].selectionSources[0];source.sha256=[source.sha256];}}],
  ...['currentSourceCompileBuildVersion','currentSourceCompileEngineBinding','currentSourceCompileReleaseSha256','fullSourceAndRelatedCheckLogSha256'].map(key=>['authorization.'+key,{release:value=>{value.authorization[key]=[value.authorization[key]];}}]),
  ['current.selectionSources.sha256',{release:value=>{value.selectionSources=structuredClone(value.selectionSources);value.selectionSources[0].sha256=[value.selectionSources[0].sha256];}}],
  ['descriptor.packetSha256',{entry:value=>{value.packetSha256=[value.packetSha256];}}],
])test('single-element-array hash rejected: '+name,async()=>{
  const fx=fixture(change),mod=await reader(fx),data=transport(fx);
  await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
  // Release fields are rejected before any network work; packet hashes are
  // rejected while parsing the bucket, before a payload is requested.
  assert.equal(data.requests.length,name==='descriptor.packetSha256'?1:0);
});

test('schema2 returns complete old and delta packets under distinct envelope bindings with fresh DTOs',async()=>{
  const fx=fixture(),mod=await reader(fx),data=transport(fx);
  for(const query of fx.members){const actual=await mod.readChineseQueryPacket(query,options(data)),expected=fx.expected.get(query);assert.deepEqual(actual,{metadata:expected.metadata,results:expected.results});}
  assert.equal(data.requests.length,3);assert(data.requests.some(request=>request.url.includes(origin.buildVersion)));assert(data.requests.some(request=>fx.bundleFiles[1]===request.url));
  const value=await mod.readChineseQueryPacket(fx.members[0],options(data));value.results[0].alternatives[0].meaning='mutated';value.results[0].matchedExampleSenseEvidence[0].examples[0].zh='mutated';
  assert.deepEqual((await mod.readChineseQueryPacket(fx.members[0],options(data))).results,fx.expected.get(fx.members[0]).results);
  assert(Object.isFrozen(mod.fixtureRelease.legacyOrigins[0].selectionSources[0]));assert(Object.isFrozen(mod.fixtureRelease.authorization));
  assert(!Object.hasOwn(value.results[0],'id'));assert(!Object.hasOwn(value.results[0],'trusted'));
});

for(const [name,change]of [
  ['meaning',row=>{row.meaning='不同的释义';}],['POS',row=>{row.partOfSpeech='noun';}],['source',row=>{row.source='Another source';}],
  ['licence',row=>{row.license='Another licence';}],['URL',row=>{row.url='https://example.org/changed';}],['alternative',row=>{row.alternatives[0].meaning='不同义项';}],
  ['matched sense',row=>{row.matchedSense='different';}],['matched POS',row=>{row.matchedPartOfSpeech='noun';}],['example',row=>{row.matchedExampleSenseEvidence[0].examples[0].zh='不同例句';}],
  ['evidence id',row=>{row.matchedExampleSenseIds[0]='other';row.matchedExampleSenseEvidence[0].id='other';}],['source proof',row=>{row.matchedSourceEvidence.selectedRowSha256='f'.repeat(64);}],
  ['match flag',row=>{row.matchType='mention';}]
])test('current full-packet digest rejects changed '+name+' even with a valid new gzip hash',async()=>{
  const fx=fixture({packet:(packet,index,group)=>{if(group===0&&index===1)change(packet.results[0]);}}),mod=await reader(fx),data=transport(fx);
  await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
});
test('current digest includes complete result order, metadata and fresh-delta packets too',async()=>{
  for(const change of [packet=>packet.results.reverse(),packet=>{packet.metadata.coverage='full';}]){
    const fx=fixture({packet:(packet,index,group)=>{if(group===1)change(packet);}}),mod=await reader(fx),data=transport(fx);
    await assert.rejects(mod.readChineseQueryPacket(fx.members[2],options(data)),invalid);
  }
});
for(const [name,mutate]of [
  ['old envelope rewritten to current engine',payload=>{payload.engineBinding=engineBinding;}],
  ['wrong old dictionary',payload=>{payload.dictionaryVersion=dictionaryVersion;}],
  ['missing changed sibling',payload=>{payload.packets.pop();}],
  ['duplicate sibling',payload=>{payload.packets.push(payload.packets[0]);}],
  ['wrong inner query',payload=>{payload.packets[1].query='不存在';}],
  ['more than16 siblings',payload=>{payload.packets=Array(17).fill(payload.packets[0]);}],
])test('whole legacy bundle rejects '+name,async()=>{
  const fx=fixture({bundle:(value,index)=>{if(index===0)mutate(value);}}),mod=await reader(fx),data=transport(fx);
  await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
});
for(const [name,mutate]of [
  ['unlisted namespace',entry=>{entry.file='f'.repeat(64)+'/'+entry.sha256+'.bin';}],
  ['traversal',entry=>{entry.file='../'+entry.file;}],
  ['filename hash mismatch',entry=>{entry.file=origin.buildVersion+'/'+'f'.repeat(64)+'.bin';}],
  ['missing current packet digest',entry=>{delete entry.packetSha256;}],
  ['bad compressed bound',entry=>{entry.bytes=262145;}],
  ['bad decoded bound',entry=>{entry.uncompressedBytes=4194305;}],
])test('current index rejects '+name+' before any payload read',async()=>{
  const fx=fixture({entry:(entry,query,group)=>{if(group===0)mutate(entry);}}),mod=await reader(fx),data=transport(fx);
  await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);assert.equal(data.requests.length,1);
});
test('current index cannot omit/add/duplicate/reorder or split an old sibling to another payload descriptor',async()=>{
  for(const mutate of [value=>value.entries.pop(),value=>value.entries.push(value.entries[0]),value=>value.entries.reverse(),value=>{value.entries[1].file=buildVersion+'/'+value.entries[1].sha256+'.bin';}]){
    const fx=fixture({bucket:value=>{if(value.entries.length)mutate(value);}}),mod=await reader(fx),data=transport(fx);
    await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
  }
});
test('schema1 contract stays exact and schema2 refuses preview/forged-origin/authorization metadata',async()=>{
  for(const mutate of [value=>{value.schemaVersion=1;},value=>{value.authorization.kind='capacity-only-whole-legacy-bundle-preview';},
    value=>{value.authorization.currentSourceCompileEngineBinding='f'.repeat(64);},value=>{value.authorization.fullSourceAndRelatedCheckLogSha256='0'.repeat(64);},
    value=>{value.legacyOrigins.push(structuredClone(value.legacyOrigins[0]));},value=>{value.legacyOrigins[0].engineBinding=engineBinding;},
    value=>{value.legacyOrigins[0].selectionSources[0].license='Unknown';},value=>{delete value.legacyOrigins[0].sourceManifestSha256;},value=>{value.extra='unsafe';}]){
    const fx=fixture({release:mutate}),mod=await reader(fx),data=transport(fx);await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
  }
});
test('unknown, English, changed full manifest or engine never acquire legacy authority, including warmed reads',async()=>{
  const fx=fixture(),mod=await reader(fx),data=transport(fx);
  for(const query of ['happy','未知输入'])assert.equal(await mod.readChineseQueryPacket(query,options(data)),null);assert.equal(data.requests.length,0);
  await mod.readChineseQueryPacket(fx.members[0],options(data));const before=data.requests.length;
  for(const extra of [{manifest:{...manifest,integritySha256:'f'.repeat(64)}},{engineBinding:'f'.repeat(64)},{manifest:{...manifest,version:'f'.repeat(64)}}])assert.equal(await mod.readChineseQueryPacket(fx.members[0],options({...data,...extra})),null);
  assert.equal(data.requests.length,before);
});
test('legacy corruption/truncation is not rescued by another origin or an earlier cached generation',async()=>{
  for(const changed of [bytes=>{const next=Buffer.from(bytes);next[15]^=1;return next;},bytes=>bytes.subarray(0,bytes.length-1)]){
    const fx=fixture(),mod=await reader(fx),data=transport(fx);await mod.readChineseQueryPacket(fx.members[0],options(data));mod.resetChineseQueryPacketCacheForTests();
    fx.assets.set(fx.bundleFiles[0],changed(fx.assets.get(fx.bundleFiles[0])));await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
  }
});
test('rehashed old payload still obeys all structural validation even if descriptor packet hash agrees',async()=>{
  for(const mutate of [packet=>{packet.metadata.coverage='basic';},packet=>{packet.metadata.total=1;},packet=>{packet.results[0].trusted=true;},packet=>{packet.results[1]=structuredClone(packet.results[0]);},
    packet=>{packet.metadata.normalizedQuery=null;},packet=>{packet.results[0].matchedChinese=null;}]){
    const fx=fixture({authorizeMutation:true,packet:(packet,index,group)=>{if(group===0)mutate(packet);}});
    // Re-authorized digest alone cannot waive the production shape contract.
    // The hash-valid structures are still rejected before a result is returned.
    const mod=await reader(fx),data=transport(fx);await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
  }
});
test('two legacy sibling consumers share work; aborting one never cancels the healthy caller',async()=>{
  const fx=fixture(),mod=await reader(fx),entered=deferred(),gate=deferred(),controller=new AbortController();
  const data=transport(fx,async url=>{if(url.href===fx.bundleFiles[0]){entered.resolve();await gate.promise;}});
  const first=mod.readChineseQueryPacket(fx.members[0],options({...data,signal:controller.signal}));const firstError=assert.rejects(first,{name:'AbortError'});
  const second=mod.readChineseQueryPacket(fx.members[1],options(data));await entered.promise;controller.abort();gate.resolve();await firstError;
  assert.deepEqual((await second).results,fx.expected.get(fx.members[1]).results);assert.equal(data.requests.length,2);
});
test('caller timeout/retry and reset preserve shared-work generations for old and delta payloads',async()=>{
  const fx=fixture(),mod=await reader(fx),gate=deferred(),entered=deferred();let stalled=true;
  const data=transport(fx,async url=>{if(stalled&&url.href===fx.bundleFiles[0]){entered.resolve();await gate.promise;}});
  const first=mod.readChineseQueryPacket(fx.members[0],options({...data,timeoutMs:15}));const rejection=assert.rejects(first,error=>error.code==='dictionary_timeout');await entered.promise;await rejection;
  gate.resolve();await delay(5);assert.deepEqual((await mod.readChineseQueryPacket(fx.members[1],options(data))).results,fx.expected.get(fx.members[1]).results);
  mod.resetChineseQueryPacketCacheForTests();stalled=false;const second=mod.readChineseQueryPacket(fx.members[2],options(data));mod.resetChineseQueryPacketCacheForTests();await assert.rejects(second,{name:'AbortError'});
  assert.deepEqual((await mod.readChineseQueryPacket(fx.members[2],options(data))).results,fx.expected.get(fx.members[2]).results);
});
test('caller abort and reset during actual per-packet SHA work never grant stale results',async context=>{
  for(const reset of [false,true]){
    const fx=fixture(),mod=await reader(fx),entered=deferred(),gate=deferred(),controller=new AbortController();let reads=0;
    const native=crypto.subtle.digest.bind(crypto.subtle);
    const mock=context.mock.method(crypto.subtle,'digest',async(...args)=>{if(++reads===3){entered.resolve();await gate.promise;}return native(...args);});
    try{
      const data=transport(fx),first=mod.readChineseQueryPacket(fx.members[0],options({...data,signal:controller.signal})),rejected=assert.rejects(first,{name:'AbortError'});
      const second=mod.readChineseQueryPacket(fx.members[1],options(data));const secondResult=reset?assert.rejects(second,{name:'AbortError'}):second;
      await entered.promise;if(reset)mod.resetChineseQueryPacketCacheForTests();else controller.abort();gate.resolve();await rejected;
      if(reset)await secondResult;else assert.deepEqual((await secondResult).results,fx.expected.get(fx.members[1]).results);
    }finally{gate.resolve();mock.mock.restore();}
  }
});
test('schema2 payload still enforces exact decoded-stream bounds and repair reload after transport failure',async()=>{
  const fx=fixture({entry:entry=>{entry.uncompressedBytes--;}}),mod=await reader(fx),data=transport(fx);
  await assert.rejects(mod.readChineseQueryPacket(fx.members[0],options(data)),invalid);
  const healthy=fixture(),reader2=await reader(healthy);let broken=true;
  const network=transport(healthy,url=>url.href===healthy.bundleFiles[0]&&broken?new Response('',{status:503}):undefined);
  await assert.rejects(reader2.readChineseQueryPacket(healthy.members[0],options(network)),error=>error.code==='dictionary_network');broken=false;
  assert.deepEqual((await reader2.readChineseQueryPacket(healthy.members[0],options(network))).results,healthy.expected.get(healthy.members[0]).results);
  assert.equal(network.requests.at(-1).options.cache,'reload');
});
