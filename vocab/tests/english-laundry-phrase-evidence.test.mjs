import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {searchExpandedDictionary as search} from '../js/expanded-dictionary.js';
import {isLaundryHangSourceCandidate,authenticatedLaundryHangSource,
  rejectsLaundryPhraseRecovery,authenticatedLaundryPhraseTarget} from '../js/english-laundry-phrase-evidence.js';
import {automaticDictionaryCollection} from '../js/dictionary-collection.js';
const data=new URL('../data/expanded-dictionary/',import.meta.url);
const proof=JSON.parse(await readFile(new URL('../../tooling/dictionary/english-phrase-recovery/hang-laundry.json',import.meta.url)));
const bytes=await readFile(new URL('manifest.json',data)),manifest=JSON.parse(bytes);
const sha=value=>createHash('sha256').update(value).digest('hex');
const bucket=value=>{let h=2166136261;for(const c of value.toLowerCase()){h^=c.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h%128;};
function local(transform=body=>body){const calls=[];return{calls,fetchImpl:async(input,options)=>{
  const url=new URL(input);assert.equal(url.protocol,'file:');assert.equal(options.credentials,'omit');
  const suffix=url.pathname.split('/expanded-dictionary/')[1];assert(suffix);calls.push(suffix);
  return new Response(await transform(await readFile(new URL(suffix,data)),suffix,options));
}};}
const bad=['hanged out the washing','hanged the washing out'];

test('whole raw hang identity, complete current source, shard and reviewed target bind the finite grammar proof',async()=>{
  assert.equal(proof.manifestSha256,sha(bytes));assert.equal(proof.manifestVersion,manifest.version);
  assert.equal(proof.record.id,114521);assert.equal(proof.recordJSONSha256,sha(JSON.stringify(proof.record)));
  assert.deepEqual(proof.record.forms,['hanged','hanging','hangs','hung']);
  assert.deepEqual(proof.rawSourceDescriptor,manifest.sources.core);
  assert.deepEqual(manifest.english.shards[bucket('hanged')],proof.descriptor);
  const raw=await readFile(new URL(proof.descriptor.file,data));assert.equal(raw.length,proof.descriptor.bytes);assert.equal(sha(raw),proof.descriptor.sha256);
  const payload=JSON.parse(raw);assert.deepEqual(payload.records.find(row=>row.id===114521),proof.record);
  assert.deepEqual(payload.keys.find(([key])=>key==='hanged')[1],proof.references);
  const args=[JSON.stringify(proof.record),manifest.version,sha(bytes),JSON.stringify(proof.descriptor),JSON.stringify(proof.parsedSourceDescriptor)];
  assert.equal(authenticatedLaundryHangSource(...args),true);assert.equal(authenticatedLaundryPhraseTarget(),true);
  assert.equal(isLaundryHangSourceCandidate(114521,'hang'),true);assert.equal(isLaundryHangSourceCandidate(114649,'hang'),false);
  for(let i=0;i<args.length;i++){const altered=[...args];altered[i]+=' changed';assert.equal(authenticatedLaundryHangSource(...altered),false);}
  for(const field of['id','term','partOfSpeech','meaning','forms','source','seed','variants']){
    const row=structuredClone(proof.record);row[field]=field==='id'?114649:field==='forms'?['hung']:field==='variants'?[]:'changed';
    assert.equal(authenticatedLaundryHangSource(JSON.stringify(row),...args.slice(1)),false,field);
  }
  for(const target of['hang out the washing','hang the washing out'])assert.equal(rejectsLaundryPhraseRecovery('hanged',target),true);
  for(const[first,target]of[['hung','hang out the washing'],['hanging','hang out the washing'],['hanged','hang up'],['hanged','hang a prisoner']])
    assert.equal(rejectsLaundryPhraseRecovery(first,target),false);
});

test('only inferred hanged-laundry surfaces are empty; the genuine word and all declared drying forms keep their exact source',async()=>{
  const transport=local();
  for(const query of[...bad,'HANGED THE WASHING OUT?','hanged\u00a0out the washing','ha\u200Bnged out the washing']){
    const result=await search(query,transport);assert.deepEqual(result.results,[],query);assert.equal(automaticDictionaryCollection(query,result),false);
  }
  const original=(await search('hanged',transport)).results;assert(original.some(row=>row.term==='hang'));
  assert.equal(automaticDictionaryCollection('hanged',{results:original}),false);
  const expected=(await search('hang out the washing',transport)).results[0];
  for(const query of['hangs out the washing','hung out the washing','hanging out the washing','hang the washing out',
    'hangs the washing out','hung the washing out','hanging the washing out']){
    const result=await search(query,transport);assert.equal(result.results.length,1);assert.equal(result.results[0].term,expected.term);
    for(const key of['partOfSpeech','meaning','source','license','url'])assert.equal(result.results[0][key],expected[key],query+' '+key);
  }
  assert.deepEqual((await search('hanged',transport)).results,original,'The ordinary word is never globally suppressed');
  assert.equal((await search('taking my temperature',transport)).results[0].term,"take someone's temperature");
  assert.equal((await search('taken notes',transport)).results[0].term,'take notes','Unlisted valid compositions remain open');
});

test('a real61s same-version label refresh cannot revive a stale source brand or silently collect wrong laundry',async t=>{
  let now=Date.now(),changed=false;t.mock.method(Date,'now',()=>now);
  const transport=local((body,file)=>changed&&file==='manifest.json'?Buffer.from(JSON.stringify({...manifest,
    sources:{...manifest.sources,core:{...manifest.sources.core,name:'Reviewed test refreshed core'}}})):body);
  assert.deepEqual((await search(bad[0],transport)).results,[]);
  const old=(await search('hanged',transport)).results.find(row=>row.term==='hang'),reads=transport.calls.length;
  changed=true;now+=61_000;
  for(const query of bad)await assert.rejects(search(query,transport),error=>error.code==='unreviewed_dictionary_form');
  assert(transport.calls.slice(reads).includes('manifest.json'));
  const fresh=(await search('hanged',transport)).results.find(row=>row.term==='hang');
  assert.equal(fresh.source,'Reviewed test refreshed core');assert.deepEqual({...fresh,source:old.source},old);
});

function addWhole(kind){
  const query=bad[0],b=bucket(query),desc=manifest.english.shards[b];
  return readFile(new URL(desc.file,data)).then(bytes=>{
    const payload=JSON.parse(bytes),term=kind==='canonical'?query:'future complete expression',record={id:20_000_000+bucket(term),term,
      partOfSpeech:'verb phrase',meaning:'未来独立完整词条；仅为字面或完整词形优先级测试。',forms:kind==='form'?[query]:[],source:'mit'};
    assert(!payload.keys.some(([key])=>key===query));payload.records.push(record);
    payload.keys.push([query,[{id:record.id,kind,...(kind==='form'?{term:query}:{})}]]);
    const body=Buffer.from(JSON.stringify(payload)),updated=structuredClone(manifest);
    updated.sources.core.name='Future independent source';updated.english.shards[b]={...desc,sha256:sha(body),bytes:body.length,count:payload.keys.length};
    updated.counts.records++;updated.counts.englishKeys++;
    return{query,record,transport:local((raw,file)=>file==='manifest.json'?Buffer.from(JSON.stringify(updated)):file===desc.file?body:raw)};
  });
}
test('future complete literal and complete declared form win before recovery even under changed manifest evidence',async()=>{
  for(const kind of['canonical','form']){const{query,record,transport}=await addWhole(kind),actual=await search(query,transport);
    assert.equal(actual.results.length,1);assert.equal(actual.results[0].term,record.term);
    assert.equal(actual.results[0].meaning,'① '+record.meaning);
    assert.equal(actual.results[0].matchedForm,kind==='canonical'?undefined:query);
  }
});

test('an altered authenticated raw tuple cannot borrow the old proof, while its literal word remains available',async()=>{
  const payload=JSON.parse(await readFile(new URL(proof.descriptor.file,data))),row=payload.records.find(row=>row.id===114521);
  row.meaning+='（未来测试记录）';const body=Buffer.from(JSON.stringify(payload)),updated=structuredClone(manifest);
  updated.english.shards[proof.descriptor.bucket]={...proof.descriptor,sha256:sha(body),bytes:body.length};
  const transport=local((raw,file)=>file==='manifest.json'?Buffer.from(JSON.stringify(updated)):file===proof.descriptor.file?body:raw);
  for(const query of bad)await assert.rejects(search(query,transport),error=>error.code==='unreviewed_dictionary_form');
  assert((await search('hanged',transport)).results.some(row=>row.term==='hang'));
});

test('corrupt source bytes and cancellation never become an inferred laundry card',async()=>{
  const corrupt=local((body,file)=>file===proof.descriptor.file?Buffer.from('{"corrupt":true}'):body);
  await assert.rejects(search(bad[0],corrupt),error=>error.code==='invalid_dictionary_data');
  let enter,release;const entered=new Promise(done=>enter=done),held=new Promise(done=>release=done);
  const transport=local(async(body,file)=>{if(file===proof.descriptor.file){enter();await held;}return body;});
  const controller=new AbortController(),pending=search(bad[1],{...transport,signal:controller.signal});
  await entered;controller.abort();
  try{await assert.rejects(pending,error=>error.name==='AbortError');}finally{release();}
});
