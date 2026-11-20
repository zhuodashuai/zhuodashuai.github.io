import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';
import {automaticDictionaryCollection} from '../js/dictionary-collection.js';
import {reviewedEnglishSurfaceTarget,isReviewedEnglishSurfaceCandidate,authenticatedEnglishSurface} from '../js/english-surface-variants.js';

const root=new URL('../data/expanded-dictionary/',import.meta.url);
const proof=JSON.parse(await readFile(new URL('../../tooling/dictionary/english-surface-variants/side-effects.json',import.meta.url)));
const evidence=proof.sourceEvidence;
const hash=value=>createHash('sha256').update(value).digest('hex');
const fold=value=>value.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/\s+/gu,' ').trim().toLowerCase();
const bucket=value=>{let n=2166136261;for(const c of fold(value)){n^=c.codePointAt(0);n=Math.imul(n,16777619)>>>0;}return n%128;};
const manifestBytes=await readFile(new URL('manifest.json',root)),manifest=JSON.parse(manifestBytes);
const source=({name,license,url})=>({name,license,url});
const licensedSource=source(manifest.sources['pos-reviewed']);
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
    const row={id:entry.id??i*128+bucket(entry.term),term:entry.term,partOfSpeech:entry.pos||'noun',meaning:entry.meaning||'独立测试含义',forms:entry.forms||[],source:entry.source||'mit'};
    for(const [key,kind]of [[entry.term,'canonical'],...row.forms.map(form=>[form,'form'])]){
      const shard=en[bucket(key)];if(!shard.records.some(r=>r.id===row.id))shard.records.push(row);
      const old=shard.keys.find(k=>k[0]===fold(key)),ref={id:row.id,kind};if(old)old[1].push(ref);else shard.keys.push([fold(key),[ref]]);
    }
  });
  const descriptors=(kind,payloads)=>payloads.map((payload,i)=>{const body=JSON.stringify(payload),file=`${version}/${kind}-${String(i).padStart(3,'0')}.json`;files.set(file,body);return{bucket:i,file,sha256:hash(body),bytes:Buffer.byteLength(body),count:kind==='en'?payload.keys.length:0};});
  const english={buckets:128,shards:descriptors('en',en)},chinese={buckets:128,shards:descriptors('zh',Array.from({length:128},(_,i)=>({schemaVersion:2,kind:'zh',bucket:i,postings:[]})))};
  const data={schemaVersion:2,version,counts:{records:entries.length,englishKeys:english.shards.reduce((n,d)=>n+d.count,0),chineseTokens:0},sources:{mit:source(manifest.sources.mit),'pos-reviewed':licensedSource},english,chinese};
  return {fetchImpl:async url=>{const file=new URL(url).pathname.split('/expanded-dictionary/')[1];return new Response(file==='manifest.json'?JSON.stringify(data):files.get(file)||'missing',{status:file==='manifest.json'||files.has(file)?200:404});}};
}

test('side effects binds the complete actual POS-reviewed source, preserving its licensed computing sense and canonical identity',async()=>{
  assert.equal(manifest.version,evidence.manifestVersion);assert.equal(hash(manifestBytes),evidence.manifestSha256);
  const descriptor=manifest.english.shards[bucket('side effect')],bytes=await readFile(new URL(descriptor.file,root));
  const payload=JSON.parse(bytes),record=payload.records.find(row=>row.id===12574919);
  assert.deepEqual(descriptor,evidence.descriptor);assert.equal(bytes.length,evidence.actualBytes);assert.equal(hash(bytes),evidence.actualSha256);
  assert.deepEqual(record,evidence.rawRecord);assert.equal(hash(JSON.stringify(record)),evidence.rawRecordSha256);
  assert.deepEqual(payload.keys.find(([key])=>key==='side effect')[1],evidence.canonicalRefs);
  assert.deepEqual(source(manifest.sources['pos-reviewed']),source(evidence.sourceDescriptor));
  assert.equal(record.source,'pos-reviewed');assert.equal(record.partOfSpeech,'noun');assert(record.meaning.includes('[计]'));
  assert.deepEqual(record.variants,[{partOfSpeech:'',meaning:record.meaning,source:'mit'}]);
  assert.deepEqual((await searchExpandedDictionary('side effect',local())).results,[evidence.completeCurrentLiteralDTO]);
});

test('the plural is one finite whole surface; generic noun/plural/phrase rewriting is not admitted',()=>{
  assert.equal(reviewedEnglishSurfaceTarget('side effects'),'side effect');
  assert.equal(reviewedEnglishSurfaceTarget('well adjusted'),'well-adjusted');
  assert.equal(reviewedEnglishSurfaceTarget("rock 'n' roll"),"rock'n'roll");
  assert.equal(isReviewedEnglishSurfaceCandidate(12574919,'side effect'),true);
  for(const [id,term]of [[12574918,'side effect'],[12574919,'side effects'],[12574919,'Side Effect']])assert.equal(isReviewedEnglishSurfaceCandidate(id,term),false);
  for(const value of ['side effect','side effectss','side affects','sides effects','adverse effects','take notes','take note','side-effects','side\neffects',null,{}])assert.equal(reviewedEnglishSurfaceTarget(value),null);
});

test('complete raw row, POS-reviewed identity, descriptor and manifest mutations cannot authorize the plural',()=>{
  const record=evidence.rawRecord,descriptor=evidence.descriptor;
  const check=(r=record,v=manifest.version,m=hash(manifestBytes),d=descriptor,s=licensedSource)=>authenticatedEnglishSurface(JSON.stringify(r),v,m,JSON.stringify(d),JSON.stringify(s));
  assert.equal(check(),'side effects');
  for(const change of [{id:record.id+128},{term:'Side Effect'},{partOfSpeech:'verb'},{meaning:'无关义项'},{forms:['side effects']},{source:'mit'},
    {seed:{...record.seed,rank:record.seed.rank+1}},{seed:{...record.seed,workbook:false}},{variants:[]},
    {variants:[{...record.variants[0],partOfSpeech:'noun'}]}])assert.equal(check({...record,...change}),null);
  for(const change of [{bucket:descriptor.bucket+1},{file:descriptor.file+'x'},{sha256:'a'.repeat(64)},{bytes:descriptor.bytes+1},{count:descriptor.count+1}])assert.equal(check(record,manifest.version,hash(manifestBytes),{...descriptor,...change}),null);
  assert.equal(check(record,'b'.repeat(64)),null);assert.equal(check(record,manifest.version,'c'.repeat(64)),null);
  for(const change of [{name:'ECDICT'},{license:'MIT'},{url:'https://example.com/source'}])assert.equal(check(record,manifest.version,hash(manifestBytes),descriptor,{...licensedSource,...change}),null);
  assert.equal(check(record,manifest.version,hash(manifestBytes),descriptor,source(manifest.sources.mit)),null,'The retained MIT variant cannot impersonate the canonical POS-reviewed source');
});

test('the actual recovered plural retains the entire canonical DTO, original input, and explicit collection boundary',async()=>{
  const data=local(),expected=(await searchExpandedDictionary('side effect',data)).results[0];
  for(const input of ['side effects','Side effects!','“side effects”']){
    const result=await searchExpandedDictionary(input,data);assert.equal(result.results.length,1);
    const {matchedForm,...canonical}=result.results[0];assert.deepEqual(canonical,expected);assert.equal(matchedForm,input);
    assert.equal(automaticDictionaryCollection(input,result),false);assert.equal(Object.hasOwn(canonical,'id'),false);
  }
  const previous=data.requests.length;await searchExpandedDictionary('side effects',data);assert.equal(data.requests.length,previous);
  assert(data.requests.every(url=>!/[?&](?:q|query|word)=/u.test(url)));
});

test('a future whole plural literal or declared form wins, and whole-query or target ambiguities still propagate',async()=>{
  const literal=fixture([{term:'side effects',meaning:'未来独立完整词条'},{term:'side effect'}]);
  const found=await searchExpandedDictionary('side effects',literal);assert.equal(found.results[0].term,'side effects');assert.equal(found.results[0].meaning,'① 未来独立完整词条');assert.equal(found.results[0].matchedForm,undefined);
  const declared=fixture([{term:'consequence',forms:['side effects']},{term:'side effect'}]);
  assert.equal((await searchExpandedDictionary('side effects',declared)).results[0].term,'consequence');
  for(const entries of [[{term:'Side Effects'},{term:'SIDE EFFECTS'}],[{term:'Side Effect'},{term:'SIDE EFFECT'}]])await assert.rejects(searchExpandedDictionary('side effects',fixture(entries)),error=>error.code==='ambiguous_dictionary_match');
  const forged=fixture([{id:12574919,term:'side effect',source:'pos-reviewed',meaning:'同名但未经原始来源认证'}]);
  assert.deepEqual((await searchExpandedDictionary('side effects',forged)).results,[]);
  const formOnlyTarget=fixture([{term:'influence',forms:['side effect']}]);assert.deepEqual((await searchExpandedDictionary('side effects',formOnlyTarget)).results,[]);
});

test('warm plural authority is denied under a fresh same-version manifest after61seconds even if the old row is cached',async t=>{
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  for(const change of [{name:'Fresh POS source'},{sha256:'a'.repeat(64)}]){
    let changed=false;
    const data=local((body,url)=>changed&&url.endsWith('/manifest.json')?Buffer.from(JSON.stringify({...manifest,sources:{...manifest.sources,'pos-reviewed':{...manifest.sources['pos-reviewed'],...change}}})):body);
    const original=(await searchExpandedDictionary('side effect',data)).results[0];assert.equal((await searchExpandedDictionary('side effects',data)).results[0].term,'side effect');
    const previous=data.requests.length;changed=true;now+=61_000;
    const fresh=(await searchExpandedDictionary('side effect',data)).results[0];
    assert.deepEqual({...fresh,source:original.source},original);assert.equal(fresh.source,change.name||original.source);
    const denied=await searchExpandedDictionary('side effects',data);assert.deepEqual(denied.results,[]);assert.equal(automaticDictionaryCollection('side effects',denied),false);
    assert(data.requests.slice(previous).some(url=>url.endsWith('/manifest.json')));
  }
});

test('literal/target corruption, canceled and hanging source reads never publish a plural recovery',async()=>{
  for(const query of ['side effects','side effect']){
    const file=manifest.english.shards[bucket(query)].file;
    const corrupt=local((body,url)=>url.endsWith('/'+file)?Buffer.concat([body,Buffer.from(' ')]):body);
    await assert.rejects(searchExpandedDictionary('side effects',corrupt),error=>error.code==='invalid_dictionary_data');
  }
  let entered,release;const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  const targetFile=manifest.english.shards[bucket('side effect')].file;
  const delayed=local(async(body,url)=>{if(url.endsWith('/'+targetFile)){entered();await gate;}return body;});
  const controller=new AbortController(),pending=searchExpandedDictionary('side effects',{...delayed,signal:controller.signal});
  await ready;controller.abort();release();await assert.rejects(pending,error=>error.name==='AbortError');
  assert.equal((await searchExpandedDictionary('side effects',delayed)).results[0].term,'side effect');
  let held=false;
  const hanging=local(async(body,url,options)=>{if(!url.endsWith('/'+targetFile))return body;held=true;return new Promise((_,reject)=>{const abort=()=>reject(new DOMException('Aborted','AbortError'));if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});});});
  await assert.rejects(searchExpandedDictionary('side effects',{...hanging,timeoutMs:80}),error=>error.code==='dictionary_timeout');assert(held);
});

test('unrelated take notes and take note keep their distinct literal meaning boundary',async()=>{
  const data=local(),singular=await searchExpandedDictionary('take note',data),plural=await searchExpandedDictionary('take notes',data);
  assert.equal(singular.results[0].term,'take note');assert.deepEqual(singular.results[0].meaning,'① 重视, 注意');
  assert(plural.results.every(row=>row.term!=='take note'));
  assert.notDeepEqual(plural.results,singular.results);
});
