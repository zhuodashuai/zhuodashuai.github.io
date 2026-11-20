import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {searchExpandedDictionary,resetExpandedDictionaryCacheForTests} from '../js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../js/dictionary-examples-current-v4.js';
import {searchEverydayDictionary,guardLegacySupplementaryResult} from '../js/everyday-lookup.js';
import {automaticDictionaryCollection} from '../js/dictionary-collection.js';
import {reviewedCanonicalFormTarget,isReviewedCanonicalFormCandidate,
  authenticatedReviewedCanonicalForm} from '../js/reviewed-canonical-forms.js';

const root=new URL('../data/expanded-dictionary/',import.meta.url);
const bytes=await readFile(new URL('manifest.json',root)),manifest=JSON.parse(bytes);
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const source=({name,license,url})=>({name,license,url});
const canonicalDescriptor=manifest.english.shards[56],formDescriptor=manifest.english.shards[76];
const formBytes=await readFile(new URL(formDescriptor.file,root)),formPayload=JSON.parse(formBytes);
const canonical=formPayload.records.find(row=>row.id===1333816);
const row=JSON.parse(await readFile(new URL('../../tooling/dictionary/reviewed-senses/source/batch-0017.json',import.meta.url),'utf8')).entries.find(row=>row.term==='mortuary');
const expected={term:'mortuary',partOfSpeech:'noun',meaning:row.formProjections[0].meaning,
  source:'卓式词典·义项补充',license:'Original composition',url:'https://zhuodashuai.github.io/vocab/'};
const lexical=({matchedForm,...entry})=>entry;
function local(transform=body=>body){
  const calls=[];return{calls,fetchImpl:async(url,options)=>{
    assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');
    calls.push(new URL(url).pathname);return new Response(await transform(await readFile(new URL(url)),new URL(url).pathname,options));
  }};
}
function rewrittenFormSource(edit){
  const payload=clone(formPayload);edit(payload);
  const body=Buffer.from(JSON.stringify(payload)),updated=clone(manifest);
  updated.english.shards[76]={...formDescriptor,sha256:sha(body),bytes:body.length,count:payload.keys.length};
  updated.counts.records+=payload.records.length-formPayload.records.length;
  updated.counts.englishKeys+=payload.keys.length-formPayload.keys.length;
  return local((original,path)=>path.endsWith('/manifest.json')?Buffer.from(JSON.stringify(updated))
    :path.endsWith('/en-076.json')?body:original);
}

test('the declared noun plural resolves a full authored noun card and preserves the original input',async()=>{
  assert.equal(searchEverydayDictionary('mortuaries'),null,'No packaged form shortcut');
  const data=local();
  for(const input of ['mortuaries','MORTUARIES!','“mortuaries”','ｍｏｒｔｕａｒｉｅｓ','\t mortuaries \n','mortuari\u200bes']){
    const result=await searchExpandedDictionary(input,data);
    assert.equal(result.results.length,1,input);assert.deepEqual(lexical(result.results[0]),expected,input);
    assert.equal(result.results[0].matchedForm,input);assert(!Object.hasOwn(result.results[0],'id'));
    assert.equal(automaticDictionaryCollection(input,result),false,input);
    assert.deepEqual(guardLegacySupplementaryResult(guardLegacySupplementaryResult(result)),result);
  }
  assert(data.calls.some(path=>path.endsWith('/en-076.json')));
  assert(data.calls.every(path=>!path.includes('/api/')));
  const literal=await searchExpandedDictionary('mortuary',data);
  assert.equal(literal.results[0].partOfSpeech,row.partOfSpeech);assert.equal(literal.results[0].meaning,row.meaning);
  assert(!Object.hasOwn(literal.results[0],'matchedForm'));
});

test('personal full and fast flows retain the same noun-only result rather than an old mixed-POS fallback',async()=>{
  const data=local(),hot=()=>({term:'mortuary',partOfSpeech:canonical.partOfSpeech,meaning:canonical.meaning,source:'ECDICT',matchedForm:'mortuaries'});
  for(const full of [false,true]){
    const result=await lookupPersonalDictionaryFast('mortuaries',{full,hotLookup:async()=>hot(),
      hotReverse:()=>{throw Error('No Chinese lookup');},fullSearch:(query,options)=>searchExpandedDictionary(query,{...options,...data})});
    assert.deepEqual(result.results,[{...expected,matchedForm:'mortuaries'}]);
  }
});

test('literal and plural examples use their exact approved senses and do not replace old saved fields',async()=>{
  const data=local();
  for(const [card,count,pos]of [[(await searchExpandedDictionary('mortuary',data)).results[0],3,['noun','noun','adjective']],
    [(await searchExpandedDictionary('mortuaries',data)).results[0],2,['noun','noun']]]){
    const saved={...card,note:'Keep my note.',study:{box:4,correct:3},example:'Keep my book sentence.'},before=JSON.stringify(saved);
    const examples=await loadDictionaryExamples('mortuary',{savedEntry:saved,fetchImpl:data.fetchImpl});
    assert.equal(examples.senses.length,count);assert.deepEqual(examples.senses.map(s=>s.partOfSpeech),pos);
    assert.equal(examples.senses.reduce((n,s)=>n+s.examples.length,0),count);assert.equal(JSON.stringify(saved),before);
  }
});

test('proofs bind both actual whole-row copies and deny every changed record, source and manifest field',async()=>{
  assert.equal(reviewedCanonicalFormTarget('mortuaries'),'mortuary');assert(isReviewedCanonicalFormCandidate(canonical.id,canonical.term));
  assert.equal(sha(formBytes),formDescriptor.sha256);
  assert.equal(sha(JSON.stringify(canonical)),row.canonicalSourceSha256);
  for(const descriptor of [canonicalDescriptor,formDescriptor]){
    const body=await readFile(new URL(descriptor.file,root));assert.equal(sha(body),descriptor.sha256);assert.equal(body.length,descriptor.bytes);
    const raw=JSON.parse(body).records.find(r=>r.id===canonical.id);assert.deepEqual(raw,canonical);
    const proof=(record=raw,version=manifest.version,digest=sha(bytes),desc=descriptor,origin=source(manifest.sources.mit))=>
      authenticatedReviewedCanonicalForm(JSON.stringify(record),version,digest,JSON.stringify(desc),JSON.stringify(origin));
    assert.equal(proof(),'mortuaries');
    for(const change of [{id:canonical.id+128},{term:'Mortuary'},{partOfSpeech:'adjective'},{meaning:'另一个释义'},
      {forms:[]},{source:'core'},{seed:{...canonical.seed,workbook:false}},{variants:[]}])assert.equal(proof({...canonical,...change}),null);
    for(const change of [{bucket:descriptor.bucket+1},{file:descriptor.file+'x'},{bytes:descriptor.bytes+1},{count:descriptor.count+1},{sha256:'a'.repeat(64)}])
      assert.equal(proof(raw,manifest.version,sha(bytes),{...descriptor,...change}),null);
    assert.equal(proof(raw,'a'.repeat(64)),null);assert.equal(proof(raw,manifest.version,'b'.repeat(64)),null);
    for(const key of ['name','license','url'])assert.equal(proof(raw,manifest.version,sha(bytes),descriptor,{...source(manifest.sources.mit),[key]:'changed'}),null);
  }
  for(const text of ['mortuary','mortuarys','mortuariess','cemeteries',null,{}])assert.equal(reviewedCanonicalFormTarget(text),null);
});

test('a new real whole literal wins over the reviewed plural, without trusting its form origin',async()=>{
  const data=rewrittenFormSource(payload=>{
    const id=20000076;assert(!payload.records.some(row=>row.id===id));
    payload.records.push({id,term:'mortuaries',partOfSpeech:'noun',meaning:'测试用独立词头',forms:[],source:'mit'});
    payload.keys.find(([key])=>key==='mortuaries')[1].push({id,kind:'canonical'});
  });
  const result=await searchExpandedDictionary('mortuaries',data);
  assert.equal(result.results[0].term,'mortuaries');assert.equal(result.results[0].source,'ECDICT');assert(!Object.hasOwn(result.results[0],'matchedForm'));
});

test('changed authenticated original records cannot borrow the finite noun projection',async()=>{
  for(const change of [{meaning:'另一个经过验证的含义'},{partOfSpeech:'adjective'},
    {seed:{...canonical.seed,workbook:false}},{variants:[{partOfSpeech:'noun',meaning:'另一释义',source:'mit'}]}]){
    const data=rewrittenFormSource(payload=>Object.assign(payload.records.find(r=>r.id===canonical.id),change));
    await assert.rejects(searchExpandedDictionary('mortuaries',data),error=>error.code==='unreviewed_dictionary_form');
  }
});

test('future source contexts cannot borrow the noun projection or bypass context ambiguity',async()=>{
  for(const count of [1,2]){
    const data=rewrittenFormSource(payload=>{
      const refs=payload.keys.find(([key])=>key==='mortuaries')[1];
      for(let i=0;i<count;i++)refs.push({id:canonical.id,kind:'context',term:'mortuaries',partOfSpeech:'noun',meaning:'独立公开语境'+i});
    });
    await assert.rejects(searchExpandedDictionary('mortuaries',data),error=>
      error.code===(count===1?'unreviewed_dictionary_form':'ambiguous_dictionary_match'));
  }
});

test('a cached canonical form origin is rejected after same-version source refresh',async t=>{
  let now=Date.now(),changed=false;t.mock.method(Date,'now',()=>now);
  const data=local((body,path)=>changed&&path.endsWith('/manifest.json')
    ?Buffer.from(JSON.stringify({...manifest,sources:{...manifest.sources,mit:{...manifest.sources.mit,name:'Changed source'}}})):body);
  assert.deepEqual(lexical((await searchExpandedDictionary('mortuaries',data)).results[0]),expected);
  changed=true;now+=61000;
  await assert.rejects(searchExpandedDictionary('mortuaries',data),error=>error.code==='unreviewed_dictionary_form');
  assert.equal((await searchExpandedDictionary('mortuary',data)).results[0].meaning,row.meaning);
});

test('corruption and in-flight cancellation never return the authored form card',async()=>{
  const corrupt=local((body,path)=>{if(!path.endsWith('/en-076.json'))return body;const broken=Buffer.from(body);broken[0]^=1;return broken;});
  await assert.rejects(searchExpandedDictionary('mortuaries',corrupt),error=>error.code==='invalid_dictionary_data');
  let started;const pending=new Promise(resolve=>{started=resolve;}),abort=new AbortController();
  const data=local(async(body,path,options)=>{if(!path.endsWith('/en-076.json'))return body;started();
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('stopped','AbortError')),{once:true}));});
  const lookup=searchExpandedDictionary('mortuaries',{...data,signal:abort.signal});
  try {await pending;abort.abort();await assert.rejects(lookup,error=>error.name==='AbortError');}
  finally {abort.abort();resetExpandedDictionaryCacheForTests();}
});
