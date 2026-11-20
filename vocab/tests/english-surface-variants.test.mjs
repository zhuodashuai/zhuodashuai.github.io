import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';
import {automaticDictionaryCollection} from '../js/dictionary-collection.js';
import {reviewedEnglishSurfaceTarget,isReviewedEnglishSurfaceCandidate,authenticatedEnglishSurface} from '../js/english-surface-variants.js';

const root=new URL('../data/expanded-dictionary/',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const fold=value=>value.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/\s+/gu,' ').trim().toLowerCase();
const bucket=value=>{let n=2166136261;for(const c of fold(value)){n^=c.codePointAt(0);n=Math.imul(n,16777619)>>>0;}return n%128;};
const manifestBytes=await readFile(new URL('manifest.json',root)),manifest=JSON.parse(manifestBytes);
const sources=Object.fromEntries(Object.entries(manifest.sources).map(([id,{name,license,url}])=>[id,{name,license,url}]));
const fields=['term','partOfSpeech','meaning','source','license','url','alternatives'];
const lexical=row=>Object.fromEntries(fields.map(key=>[key,row[key]]));
function local(transform=body=>body){
  const requests=[];
  return {requests,fetchImpl:async(url,options)=>{
    assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');
    requests.push(String(url));return new Response(await transform(await readFile(url),String(url),options));
  }};
}
function fixture(entries){
  const version=hash(JSON.stringify(entries)),files=new Map(),en=Array.from({length:128},(_,i)=>({schemaVersion:2,kind:'en',bucket:i,records:[],keys:[]}));
  entries.forEach((entry,i)=>{
    const row={id:i*128+bucket(entry.term),term:entry.term,partOfSpeech:entry.pos||'noun',meaning:entry.meaning||'测试含义',forms:entry.forms||[],source:'mit'};
    const refs=[[entry.term,'canonical'],...row.forms.map(form=>[form,'form'])];
    for(const [key,kind]of refs){const shard=en[bucket(key)];if(!shard.records.some(r=>r.id===row.id))shard.records.push(row);const old=shard.keys.find(k=>k[0]===fold(key));const ref={id:row.id,kind};if(old)old[1].push(ref);else shard.keys.push([fold(key),[ref]]);}
  });
  const descriptors=(kind,payloads)=>payloads.map((payload,i)=>{const body=JSON.stringify(payload),file=`${version}/${kind}-${String(i).padStart(3,'0')}.json`;files.set(file,body);return {bucket:i,file,sha256:hash(body),bytes:Buffer.byteLength(body),count:kind==='en'?payload.keys.length:0};});
  const english={buckets:128,shards:descriptors('en',en)},chinese={buckets:128,shards:descriptors('zh',Array.from({length:128},(_,i)=>({schemaVersion:2,kind:'zh',bucket:i,postings:[]})))};
  const data={schemaVersion:2,version,counts:{records:entries.length,englishKeys:english.shards.reduce((n,d)=>n+d.count,0),chineseTokens:0},sources:{mit:sources.mit},english,chinese};
  return {fetchImpl:async url=>{const file=new URL(url).pathname.split('/expanded-dictionary/')[1];return new Response(file==='manifest.json'?JSON.stringify(data):files.get(file)||'missing',{status:file==='manifest.json'||files.has(file)?200:404});}};
}

test('only the two complete reviewed surfaces are proposed, without generic word rewriting',()=>{
  assert.equal(reviewedEnglishSurfaceTarget('well adjusted'),'well-adjusted');
  assert.equal(reviewedEnglishSurfaceTarget("rock 'n' roll"),"rock'n'roll");
  for(const value of ['well-adjusted','well adjustment','co op','black bird','re sign','rock n roll',"rock 'n roll",'by a fluke','by sheer fluke',null,{}])assert.equal(reviewedEnglishSurfaceTarget(value),null);
  assert(isReviewedEnglishSurfaceCandidate(10522514,'well-adjusted'));
  assert(!isReviewedEnglishSurfaceCandidate(10522515,'well-adjusted'));
});

test('source evidence binds the entire raw row, descriptor, manifest bytes and licensed source',async()=>{
  for(const [surface,target]of [['well adjusted','well-adjusted'],["rock 'n' roll","rock'n'roll"]]){
    const descriptor=manifest.english.shards[bucket(target)],bytes=await readFile(new URL(descriptor.file,root)),payload=JSON.parse(bytes),record=payload.records.find(r=>r.term===target);
    assert.equal(bytes.length,descriptor.bytes);assert.equal(hash(bytes),descriptor.sha256);
    const evidence=(r=record,v=manifest.version,m=hash(manifestBytes),d=descriptor,s=sources.mit)=>authenticatedEnglishSurface(JSON.stringify(r),v,m,JSON.stringify(d),JSON.stringify(s));
    assert.equal(evidence(),surface);
    for(const change of [{id:record.id+128},{term:record.term.toUpperCase()},{partOfSpeech:'verb'},{meaning:'无关的新含义'},{forms:['unrelated']},{source:'core'},{seed:{...record.seed,workbook:false}}])assert.equal(evidence({...record,...change}),null);
    for(const change of [{bucket:descriptor.bucket+1},{file:descriptor.file+'x'},{sha256:'a'.repeat(64)},{bytes:descriptor.bytes+1},{count:descriptor.count+1}])assert.equal(evidence(record,manifest.version,hash(manifestBytes),{...descriptor,...change}),null);
    assert.equal(evidence(record,'b'.repeat(64)),null);assert.equal(evidence(record,manifest.version,'c'.repeat(64)),null);
    assert.equal(evidence(record,manifest.version,hash(manifestBytes),descriptor,{...sources.mit,license:'Original composition'}),null);
  }
});

test('actual conventional variants preserve the full canonical card and original query, without auto-collection',async()=>{
  const data=local();
  for(const [input,target]of [['well adjusted','well-adjusted'],['Well adjusted!','well-adjusted'],['“well adjusted”','well-adjusted'],["rock 'n' roll","rock'n'roll"],['rock ʼnʼ roll',"rock'n'roll"],['“rock ʼnʼ roll”!',"rock'n'roll"]]){
    const expected=(await searchExpandedDictionary(target,data)).results[0],found=await searchExpandedDictionary(input,data);
    assert.equal(found.results.length,1,input);assert.deepEqual(lexical(found.results[0]),lexical(expected));
    assert.equal(found.results[0].matchedForm,input);assert.equal(automaticDictionaryCollection(input,found),false);
  }
  const count=data.requests.length;await searchExpandedDictionary('well adjusted',data);assert.equal(data.requests.length,count);
  assert(data.requests.every(url=>!/[?&](q|query|word)=/u.test(url)));
  for(const term of ['well-adjusted',"rock'n'roll",'rock and roll']){
    const result=await searchExpandedDictionary(term,data);assert.equal(result.results[0].term,term);assert.equal(result.results[0].matchedForm,undefined);
  }
});

test('complete literal, Unicode, case and declared form identities precede any surface recovery',async()=>{
  const data=fixture([{term:'well adjusted',meaning:'独立的完整词条'},{term:'well-adjusted',pos:'adjective'},
    {term:'rock ʼnʼ roll',meaning:'独立的 Unicode 标题'},{term:"rock'n'roll"}]);
  assert.equal((await searchExpandedDictionary('well adjusted',data)).results[0].meaning,'① 独立的完整词条');
  assert.equal((await searchExpandedDictionary('rock ʼnʼ roll',data)).results[0].meaning,'① 独立的 Unicode 标题');
  const declared=fixture([{term:'adjust',pos:'verb',forms:['well adjusted']},{term:'well-adjusted',pos:'adjective'}]);
  assert.equal((await searchExpandedDictionary('well adjusted',declared)).results[0].term,'adjust');
  const ambiguous=fixture([{term:'Well Adjusted'},{term:'WELL ADJUSTED'}]);
  await assert.rejects(searchExpandedDictionary('well adjusted',ambiguous),e=>e.code==='ambiguous_dictionary_match');
});

test('a forged or missing target cannot authorize recovery, and unrelated space-separated expressions stay separate',async()=>{
  const data=fixture([{term:'well-adjusted',pos:'adjective',meaning:'伪造的同名词条'},{term:"rock'n'roll"},
    {term:'black-bird'},{term:'co-op'},{term:'re-sign'},{term:'rock and roll'}]);
  for(const query of ['well adjusted',"rock 'n' roll",'black bird','co op','re sign','rock n roll'])assert.deepEqual((await searchExpandedDictionary(query,data)).results,[],query);
  const formTarget=fixture([{term:'calibrate',pos:'verb',forms:['well-adjusted']}]);
  assert.deepEqual((await searchExpandedDictionary('well adjusted',formTarget)).results,[]);
  const changedSource=local((body,url)=>url.endsWith('/manifest.json')?Buffer.from(JSON.stringify({...manifest,sources:{...manifest.sources,mit:{...manifest.sources.mit,name:'Unreviewed source'}}})):body);
  assert.deepEqual((await searchExpandedDictionary('well adjusted',changedSource)).results,[]);
});

test('a cached surface brand cannot survive a changed same-version manifest source after revalidation',async t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  for(const [surface,target]of [['well adjusted','well-adjusted'],["rock 'n' roll","rock'n'roll"]]){
    let changed=false;
    const data=local((body,url)=>changed&&url.endsWith('/manifest.json')
      ?Buffer.from(JSON.stringify({...manifest,sources:{...manifest.sources,mit:{...manifest.sources.mit,name:'Changed authenticated source'}}})):body);
    const original=(await searchExpandedDictionary(target,data)).results[0];
    assert.equal((await searchExpandedDictionary(surface,data)).results[0].term,target);
    const firstReadCount=data.requests.length;
    changed=true;now+=61_000;
    // Ordinary literal source selection still follows the fresh authenticated
    // manifest. Its old cached row grants no variant permission under that manifest.
    const fresh=(await searchExpandedDictionary(target,data)).results[0];
    assert.deepEqual({...lexical(fresh),source:original.source},lexical(original));
    assert.equal(fresh.source,'Changed authenticated source');
    const denied=await searchExpandedDictionary(surface,data);
    assert.deepEqual(denied.results,[]);assert.equal(automaticDictionaryCollection(surface,denied),false);
    assert(data.requests.slice(firstReadCount).some(url=>url.endsWith('/manifest.json')));
  }
});

test('literal and target corruption propagate, while cancellation cannot publish a recovered card',async()=>{
  for(const target of ['well adjusted','well-adjusted']){
    const file=manifest.english.shards[bucket(target)].file;
    const corrupt=local((body,url)=>url.endsWith('/'+file)?Buffer.concat([body,Buffer.from(' ')]):body);
    await assert.rejects(searchExpandedDictionary('well adjusted',corrupt),e=>e.code==='invalid_dictionary_data');
  }
  let entered,release;const ready=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
  const targetFile=manifest.english.shards[bucket('well-adjusted')].file;
  const delayed=local(async(body,url)=>{if(url.endsWith('/'+targetFile)){entered();await gate;}return body;});
  const controller=new AbortController(),pending=searchExpandedDictionary('well adjusted',{...delayed,signal:controller.signal});
  await ready;controller.abort();release();await assert.rejects(pending,e=>e.name==='AbortError');
  assert.equal((await searchExpandedDictionary('well adjusted',delayed)).results[0].term,'well-adjusted');
  const ordinary=local();assert.equal((await searchExpandedDictionary('abacus',ordinary)).results[0].term,'abacus');assert.equal(ordinary.requests.length,2);
});
