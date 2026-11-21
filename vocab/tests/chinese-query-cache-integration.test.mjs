import {loadHistorical941Kernel} from '../../tooling/tests/helpers/historical-query-kernel-941.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {CHINESE_QUERY_CACHE_RELEASE as release} from '../js/chinese-query-cache-release.js';
import {CHINESE_RANKING_RELEASE as rankingRelease} from '../js/chinese-ranking-release.js';
import {searchExpandedDictionary,searchRelatedChineseDictionary,resetExpandedDictionaryCacheForTests,CHINESE_QUERY_ENGINE_BINDING} from '../js/expanded-dictionary.js';

const dataRoot=fileURLToPath(new URL('../data/',import.meta.url));
const root=new URL('../data/chinese-query-cache/',import.meta.url);
const manifestURL=new URL('../data/expanded-dictionary/manifest.json',import.meta.url);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let expectedPromise;
async function expectedPackets(){
  if(!expectedPromise)expectedPromise=(async()=>{
    assert(release.members.length>0,'The final source-compiled catalogue must replace the empty bootstrap.');
    assert.equal(release.engineBinding,CHINESE_QUERY_ENGINE_BINDING);
    const origins=new Map([[release.buildVersion,release]]);
    assert([1,2].includes(release.schemaVersion));
    if(release.schemaVersion===2){
      const {release:historical}=await loadHistorical941Kernel();
      const origin={buildVersion:historical.buildVersion,dictionaryVersion:historical.dictionaryVersion,
        sourceManifestSha256:historical.sourceManifestSha256,engineBinding:historical.engineBinding,
        releaseFileSha256:'ac57572f62c413787165ba041a69e14ee517e19db854adea45cbe10ab64c80ef',selectionSources:historical.selectionSources};
      assert.deepEqual(release.legacyOrigins,[origin],'Only the exact authenticated historical941 origin may own reused envelopes');
      assert.equal(release.authorization.kind,'complete-source-and-related-replay');
      assert.equal(release.authorization.currentSourceCompileEngineBinding,release.engineBinding);
      origins.set(origin.buildVersion,origin);
    }
    const packetDigest=packet=>{
      const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'
        ?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
      return sha(canonical(packet));
    };
    const bundles=new Map(),queries=new Map();
    for(const bucket of release.buckets){
      const compressed=await readFile(new URL(bucket.file,root));
      assert.equal(compressed.length,bucket.bytes);assert.equal(sha(compressed),bucket.sha256);
      const decoded=gunzipSync(compressed);assert.equal(decoded.length,bucket.uncompressedBytes);
      const index=JSON.parse(decoded);assert.equal(index.bucket,bucket.bucket);
      assert.equal(index.schemaVersion,release.schemaVersion);assert.equal(index.dictionaryVersion,release.dictionaryVersion);assert.equal(index.engineBinding,release.engineBinding);
      for(const descriptor of index.entries){
        let bundle=bundles.get(descriptor.file);
        if(!bundle){
          const bytes=await readFile(new URL(descriptor.file,root));
          assert.equal(bytes.length,descriptor.bytes);assert.equal(sha(bytes),descriptor.sha256);
          const body=gunzipSync(bytes);assert.equal(body.length,descriptor.uncompressedBytes);
          const payload=JSON.parse(body);
          const namespace=descriptor.file.split('/')[0],origin=origins.get(namespace);
          assert(origin,'Every envelope must have an exact current or authenticated historical owner');
          assert.equal(descriptor.file,namespace+'/'+descriptor.sha256+'.bin');
          assert.equal(payload.schemaVersion,1);assert.equal(payload.dictionaryVersion,origin.dictionaryVersion);assert.equal(payload.engineBinding,origin.engineBinding);
          assert(payload.packets.length>=1&&payload.packets.length<=16);
          bundle={file:descriptor.file,packets:payload.packets};bundles.set(descriptor.file,bundle);
        }
        const packet=bundle.packets.find(row=>row.query===descriptor.query);
        assert(packet,'Every indexed query has its own inner response, not the first bundle response.');
        assert.equal(packet.results.length,descriptor.total);assert.equal(packet.metadata.total,descriptor.total);
        if(release.schemaVersion===2)assert.equal(packetDigest(packet),descriptor.packetSha256,'The complete inner response retains its freshly compiled current authorization');
        assert(!queries.has(packet.query));queries.set(packet.query,packet);
      }
    }
    assert.equal(queries.size,release.members.length);
    for(const query of release.members)assert(queries.has(query));
    return{bundles,queries};
  })();
  return expectedPromise;
}
function transport({cache='allow',full='allow',manifest=undefined,gate=undefined}={}){
  const requests=[],bytes=new Map();
  const fetchImpl=async(input,options={})=>{
    const url=new URL(input);assert.equal(url.protocol,'file:');assert.equal(url.search,'');assert.equal(url.hash,'');
    assert.equal(options.credentials,'omit');assert(!options.method||options.method==='GET');
    const file=fileURLToPath(url),relative=path.relative(dataRoot,file);
    assert(relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative));
    const cacheFile=relative.startsWith('chinese-query-cache'+path.sep);
    const fullFile=relative.startsWith('chinese-search-ranking'+path.sep);
    requests.push(relative.replaceAll('\\','/'));
    if(cacheFile&&cache==='deny')throw new Error('Cache-bypass baseline cannot request query packets.');
    if(fullFile&&full==='deny')throw new Error('A known cached query cannot download the complete corpus.');
    if(fullFile&&full==='missing')return new Response('Unavailable',{status:503});
    if(url.href===manifestURL.href&&manifest)return new Response(manifest());
    if(!bytes.has(file))bytes.set(file,await readFile(url));
    let body=bytes.get(file);
    if(cacheFile&&cache==='corrupt'){body=Buffer.from(body);body[0]^=1;}
    if(cacheFile&&gate)await gate(url);
    return new Response(body);
  };
  return{fetchImpl,requests};
}
function page(packet,offset,limit,relatedOnly=false){
  const all=relatedOnly?packet.results.filter(row=>row.matchType==='related'):packet.results;
  const results=all.slice(offset,offset+limit),nextOffset=offset+results.length;
  return{...packet.metadata,total:all.length,results,hasMore:nextOffset<all.length,nextOffset,offset};
}

test('every compiled query returns its entire ordinary and related DTO streams through the actual default engine',{timeout:300_000},async()=>{
  resetExpandedDictionaryCacheForTests();
  const expected=await expectedPackets(),client=transport({full:'deny'});let seen=0;
  for(const bundle of expected.bundles.values())for(const packet of bundle.packets){
    const limit=[7,19,50][seen%3];
    for(const[search,relatedOnly]of[[searchExpandedDictionary,false],[searchRelatedChineseDictionary,true]]){
      const rows=[],expectedRows=relatedOnly?packet.results.filter(row=>row.matchType==='related'):packet.results;
      const before=client.requests.length;let offset=0;
      while(true){
        const actual=await search(packet.query,{fetchImpl:client.fetchImpl,limit,offset});
        assert.deepEqual(actual,page(packet,offset,limit,relatedOnly),packet.query+' related '+relatedOnly+' offset '+offset);
        rows.push(...actual.results);
        if(!actual.hasMore)break;
        assert(actual.nextOffset>offset);offset=actual.nextOffset;
      }
      assert.deepEqual(rows,expectedRows,packet.query+' complete stream');
      assert.equal(new Set(rows.map(row=>row.term)).size,rows.length,packet.query+' unique heads');
      const end=await search(packet.query,{fetchImpl:client.fetchImpl,limit,offset:rows.length});
      assert.deepEqual(end,page(packet,rows.length,limit,relatedOnly));
      // A periodic current-manifest refresh remains allowed. The already
      // decoded sibling view requires no additional data asset downloads.
      if(relatedOnly)assert.deepEqual(client.requests.slice(before).filter(file=>file!=='expanded-dictionary/manifest.json'),[]);
    }
    seen++;
  }
  assert.equal(seen,release.members.length);
  assert(client.requests.some(file=>file.startsWith('chinese-query-cache/')));
  assert(!client.requests.some(file=>file.startsWith('chinese-search-ranking/')||/\/en-\d+\.json$/u.test(file)));
});

test('cache bypass and an unknown query retain the original complete source path',async()=>{
  resetExpandedDictionaryCacheForTests();
  const {queries}=await expectedPackets(),query=queries.has('开心')?'开心':release.members[0],packet=queries.get(query);
  const baseline=transport({cache:'deny'});
  const actual=await searchExpandedDictionary(query,{fetchImpl:baseline.fetchImpl,limit:19,useChineseQueryCache:false});
  assert.deepEqual(actual,page(packet,0,19));
  assert(baseline.requests.some(file=>file.endsWith(rankingRelease.file)));
  assert(!baseline.requests.some(file=>file.startsWith('chinese-query-cache/')));
  const fresh=transport({cache:'deny'}),unknown='紫色量子章鱼咖啡枢纽';assert(!release.members.includes(unknown));
  const empty=await searchExpandedDictionary(unknown,{fetchImpl:fresh.fetchImpl});
  assert.equal(empty.total,0);assert.equal(empty.ranking,'global');assert.deepEqual(empty.results,[]);
  assert(!fresh.requests.some(file=>file.startsWith('chinese-query-cache/')));
  // A now-warm complete corpus remains useful without another cache request.
  assert.deepEqual(await searchExpandedDictionary(query,{fetchImpl:fresh.fetchImpl,limit:19}),page(packet,0,19));
});

test('a damaged advisory cache falls back to authentic complete results; dual failure keeps integrity visible',async()=>{
  resetExpandedDictionaryCacheForTests();
  const {queries}=await expectedPackets(),query=queries.has('人工客服')?'人工客服':release.members[0],packet=queries.get(query);
  const fallback=transport({cache:'corrupt'});
  assert.deepEqual(await searchExpandedDictionary(query,{fetchImpl:fallback.fetchImpl,limit:19}),page(packet,0,19));
  assert(fallback.requests.some(file=>file.startsWith('chinese-query-cache/')));
  assert(fallback.requests.some(file=>file.endsWith(rankingRelease.file)));
  const unavailable=transport({cache:'corrupt',full:'missing'});
  await assert.rejects(searchExpandedDictionary(query,{fetchImpl:unavailable.fetchImpl}),error=>error.code==='invalid_dictionary_data');
});

test('a refreshed same-version manifest cannot reuse cache results under changed source attribution',async()=>{
  resetExpandedDictionaryCacheForTests();
  const {queries}=await expectedPackets(),query=release.members[0],packet=queries.get(query);
  const original=await readFile(manifestURL,'utf8'),changed=JSON.parse(original);changed.sources.mit.name+=' changed';
  let altered=false,now=Date.now();const realNow=Date.now;
  const client=transport({manifest:()=>altered?JSON.stringify(changed):original});
  try{
    Date.now=()=>now;
    assert.deepEqual(await searchExpandedDictionary(query,{fetchImpl:client.fetchImpl,limit:19}),page(packet,0,19));
    const before=client.requests.length;altered=true;now+=61_000;
    await assert.rejects(searchExpandedDictionary(query,{fetchImpl:client.fetchImpl}),error=>error.code==='invalid_dictionary_data');
    assert.deepEqual(client.requests.slice(before),['expanded-dictionary/manifest.json']);
  }finally{Date.now=realNow;}
});

test('concurrent queries in one real bundle remain isolated when one caller aborts',{timeout:10_000},async()=>{
  resetExpandedDictionaryCacheForTests();
  const {bundles}=await expectedPackets(),bundle=[...bundles.values()].find(row=>row.packets.filter(packet=>packet.results.length).length>=2);assert(bundle);
  const[a,b]=bundle.packets.filter(packet=>packet.results.length);let releaseGate,observed;
  const held=new Promise(resolve=>{releaseGate=resolve;}),seen=new Promise(resolve=>{observed=resolve;});
  const client=transport({full:'deny',gate:async url=>{if(url.href.endsWith(bundle.file)){observed();await held;}}});
  const abort=new AbortController();
  const first=searchExpandedDictionary(a.query,{fetchImpl:client.fetchImpl,signal:abort.signal,limit:19});
  const rejected=assert.rejects(first,error=>error.name==='AbortError');
  const second=searchExpandedDictionary(b.query,{fetchImpl:client.fetchImpl,limit:19});
  try{
    await seen;abort.abort();await rejected;releaseGate();
    const answer=await second;assert.deepEqual(answer,page(b,0,19));
    answer.results[0].meaning='Caller mutation';
    assert.deepEqual(await searchExpandedDictionary(b.query,{fetchImpl:client.fetchImpl,limit:19}),page(b,0,19));
    assert.equal(client.requests.filter(file=>file.endsWith(bundle.file)).length,1);
  }finally{releaseGate();}
});

test('ordinary and related callers share one genuine in-flight bundle without loading the full corpus',{timeout:10_000},async()=>{
  resetExpandedDictionaryCacheForTests();
  const {bundles}=await expectedPackets(),bundle=[...bundles.values()].find(row=>row.packets.some(packet=>packet.results.some(result=>result.matchType==='related')));assert(bundle);
  const packet=bundle.packets.find(row=>row.results.some(result=>result.matchType==='related'));
  let releaseGate,observed;
  const held=new Promise(resolve=>{releaseGate=resolve;}),seen=new Promise(resolve=>{observed=resolve;});
  const client=transport({full:'deny',gate:async url=>{if(url.href.endsWith(bundle.file)){observed();await held;}}});
  const ordinary=searchExpandedDictionary(packet.query,{fetchImpl:client.fetchImpl,limit:19});
  const related=searchRelatedChineseDictionary(packet.query,{fetchImpl:client.fetchImpl,limit:19});
  try{
    await seen;releaseGate();
    const[a,b]=await Promise.all([ordinary,related]);
    assert.deepEqual(a,page(packet,0,19));assert.deepEqual(b,page(packet,0,19,true));
    assert.equal(client.requests.filter(file=>file.endsWith(bundle.file)).length,1);
    assert(!client.requests.some(file=>file.startsWith('chinese-search-ranking/')));
  }finally{releaseGate();}
});
