import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rejectedReviewedDictionaryForms,rejectsReviewedDictionaryForm} from '../js/dictionary-form-evidence.js';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';
import {searchEverydayDictionary} from '../js/everyday-lookup.js';
import {automaticDictionaryCollection} from '../js/dictionary-collection.js';

const proof=JSON.parse(await readFile(new URL('../../tooling/dictionary/search-benchmarks/resit-form-source-evidence.json',import.meta.url)));
const com=JSON.parse(await readFile(new URL('../../tooling/dictionary/search-benchmarks/comming-source-evidence.json',import.meta.url)));
const dataRoot=new URL('../data/expanded-dictionary/',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const bucket=value=>{let n=2166136261;for(const c of value.toLowerCase()){n^=c.codePointAt(0);n=Math.imul(n,16777619)>>>0;}return n%128;};
const manifestBytes=await readFile(new URL('manifest.json',dataRoot)),manifest=JSON.parse(manifestBytes);
function local(transform=body=>body){
  const requests=[];
  return {requests,fetchImpl:async(url,options)=>{
    assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');requests.push(String(url));
    return new Response(await transform(await readFile(url),String(url),options));
  }};
}
function fixture(entries){
  const version=manifest.version,files=new Map(),payloads=Array.from({length:128},(_,bucket)=>({schemaVersion:2,kind:'en',bucket,records:[],keys:[]}));
  entries.forEach((entry,index)=>{
    const row=entry.raw??{id:index*128+bucket(entry.term),term:entry.term,partOfSpeech:entry.pos||'verb',meaning:entry.meaning||'测试中的独立未来词条',forms:entry.forms||[],source:'mit'};
    for(const [key,kind]of [[row.term,'canonical'],...row.forms.map(form=>[form,'form'])]){
      const payload=payloads[bucket(key)];if(!payload.records.some(old=>old.id===row.id))payload.records.push(row);
      const folded=key.toLowerCase(),old=payload.keys.find(([value])=>value===folded),ref={id:row.id,kind,...(kind==='form'?{term:key}:{})};
      if(old)old[1].push(ref);else payload.keys.push([folded,[ref]]);
    }
  });
  const descriptors=(kind,rows)=>rows.map((row,i)=>{const text=JSON.stringify(row),file=`${version}/${kind}-${String(i).padStart(3,'0')}.json`;files.set(file,text);return{bucket:i,file,sha256:hash(text),bytes:Buffer.byteLength(text),count:kind==='en'?row.keys.length:0};});
  const english={buckets:128,shards:descriptors('en',payloads)},chinese={buckets:128,shards:descriptors('zh',Array.from({length:128},(_,bucket)=>({schemaVersion:2,kind:'zh',bucket,postings:[]})))};
  const supplied={schemaVersion:2,version,counts:{records:entries.length,englishKeys:english.shards.reduce((sum,row)=>sum+row.count,0),chineseTokens:0},sources:{mit:manifest.sources.mit},english,chinese};
  return{fetchImpl:async url=>{const file=new URL(url).pathname.split('/expanded-dictionary/')[1],body=file==='manifest.json'?JSON.stringify(supplied):files.get(file);return new Response(body||'missing',{status:body===undefined?404:200});}};
}

test('the resit relation evidence authenticates the actual whole MIT row and every wrong/retained source reference',async()=>{
  assert.equal(proof.manifestVersion,manifest.version);assert.equal(proof.manifestSha256,hash(manifestBytes));
  assert.equal(proof.record.id,5264684);assert.equal(proof.record.source,'mit');assert.equal(hash(JSON.stringify(proof.record)),proof.recordJSONSha256);
  assert.deepEqual(proof.record.forms,['resited','resiting','resits']);assert.deepEqual(proof.record.seed.forms,proof.record.forms);
  assert.deepEqual(proof.source,manifest.sources.mit);
  for(const binding of proof.bindings){
    assert.deepEqual(manifest.english.shards[bucket(binding.term)],binding.descriptor);
    const bytes=await readFile(new URL(binding.descriptor.file,dataRoot)),payload=JSON.parse(bytes);
    assert.equal(bytes.length,binding.actualBytes);assert.equal(hash(bytes),binding.actualSha256);
    const references=payload.keys.find(([key])=>key===binding.term)?.[1]??[];
    assert.deepEqual(references,binding.references);assert.deepEqual(references.map(ref=>payload.records.find(row=>row.id===ref.id)),binding.records);
    if(['resit','resited','resiting','resits'].includes(binding.term))assert.deepEqual(binding.records,[proof.record]);
  }
});

test('only two exact resit relations are rejected, and COM/comming/coms retains its original finite policy',()=>{
  const rejected=rejectedReviewedDictionaryForms(proof.record,proof.manifestVersion);
  assert.deepEqual(rejected,['resited','resiting']);assert(Object.isFrozen(rejected));assert.throws(()=>rejected.push('resits'));
  for(const form of rejected)assert.equal(rejectsReviewedDictionaryForm(proof.record,proof.manifestVersion,form),true);
  for(const form of ['resit','resits','resat','resitting','resite','resites','resited an exam','resiting an exam'])assert.equal(rejectsReviewedDictionaryForm(proof.record,proof.manifestVersion,form),false);
  assert.deepEqual(rejectedReviewedDictionaryForms(com.record,com.manifestVersion),['comming']);
  assert.equal(rejectsReviewedDictionaryForm(com.record,com.manifestVersion,'comming'),true);
  assert.equal(rejectsReviewedDictionaryForm(com.record,com.manifestVersion,'coms'),false);
  assert.deepEqual(rejectedReviewedDictionaryForms(null,proof.manifestVersion),[]);
});

test('altered IDs/POS/meaning/forms/seed/source or a different manifest version grant no suppression',()=>{
  const row=proof.record;
  for(const change of [{id:row.id+128},{term:'resite'},{partOfSpeech:'noun'},{meaning:row.meaning+'（变化）'},
    {forms:['resat','resitting','resits']},{source:'pos-reviewed'},{seed:{...row.seed,rank:row.seed.rank+1}},
    {seed:{...row.seed,forms:['resat','resitting','resits']}},{seed:{...row.seed,workbook:false}},{variants:[]}]){
    const altered={...row,...change};assert.deepEqual(rejectedReviewedDictionaryForms(altered,proof.manifestVersion),[]);
    assert.equal(rejectsReviewedDictionaryForm(altered,proof.manifestVersion,'resited'),false);
  }
  const wrongVersion=rejectedReviewedDictionaryForms(row,'a'.repeat(64));assert.deepEqual(wrongVersion,[]);assert(Object.isFrozen(wrongVersion));
  assert.deepEqual(rejectedReviewedDictionaryForms({...row,term:'another',forms:['resited','resiting']},proof.manifestVersion),[]);
});

test('wrong raw resit forms do not resolve the word or a new exam phrase, and cannot silently collect',async()=>{
  const data=local();
  for(const query of ['resited','resiting','resited an exam','resiting an exam']){
    const result=await searchExpandedDictionary(query,data);assert.deepEqual(result.results,[],query);
    assert.equal(automaticDictionaryCollection(query,result),false);
  }
  assert(data.requests.every(url=>!/[?&](?:q|query|word)=/u.test(url)));
});

test('every correct declared word and exam-phrase form keeps its complete authored DTO',async()=>{
  const data=local();
  for(const head of ['resit','resit an exam']){
    const expected=searchEverydayDictionary(head);assert(expected);
    for(const input of head==='resit'?['resit','resits','resat','resitting']:['resit an exam','resits an exam','resat an exam','resitting an exam']){
      const actual=await searchExpandedDictionary(input,data),declared=searchEverydayDictionary(input);
      assert(declared,input);assert.deepEqual(actual,declared,input);assert.equal(actual.results[0].term,head);
    }
  }
});

test('a future literal resited/resiting wins even beside the exact rejected form relation',async()=>{
  for(const term of ['resited','resiting']){
    const data=fixture([{raw:proof.record},{term,meaning:'重新安置（未来独立词条的测试含义）'}]);
    const result=await searchExpandedDictionary(term,data);assert.equal(result.results[0].term,term);assert.equal(result.results[0].matchedForm,undefined);
    assert.equal(result.results[0].meaning,'① 重新安置（未来独立词条的测试含义）');
  }
});

test('resite and its legitimate form/phrase relations survive alongside the exact bad resit relation',async()=>{
  const data=fixture([{raw:proof.record},{term:'resite',meaning:'重新安置',forms:['resited','resiting','resites']},{term:'resite a statue',pos:'verb phrase',meaning:'重新安置一尊雕像'}]);
  for(const input of ['resited','resiting','resites']){
    const result=await searchExpandedDictionary(input,data);assert.equal(result.results[0].term,'resite');assert.equal(result.results[0].meaning,'① 重新安置');assert.equal(result.results[0].matchedForm,input);
  }
  for(const input of ['resited a statue','resiting a statue']){
    const result=await searchExpandedDictionary(input,data);assert.equal(result.results[0].term,'resite a statue');assert.equal(result.results[0].meaning,'① 重新安置一尊雕像');assert.equal(result.results[0].matchedForm,input);
  }
});

test('the retained resits relation still works in the original raw source and corrupt raw form shards still fail closed',async()=>{
  const raw=fixture([{raw:proof.record},{term:'resit a test',pos:'verb phrase',meaning:'重新参加一次测试'}]),plural=await searchExpandedDictionary('resits',raw);
  // The reviewed whole-word packaged entry still wins its own declared form;
  // the original relation is independently retained by the exact policy API.
  assert.equal(plural.results[0].term,'resit');assert.equal(rejectsReviewedDictionaryForm(proof.record,proof.manifestVersion,'resits'),false);
  const rawPhrase=await searchExpandedDictionary('resits a test',raw);
  assert.equal(rawPhrase.results[0].term,'resit a test');assert.equal(rawPhrase.results[0].meaning,'① 重新参加一次测试');assert.equal(rawPhrase.results[0].matchedForm,'resits a test');
  for(const form of ['resited','resiting']){
    const file=proof.bindings.find(row=>row.term===form).descriptor.file;
    const corrupt=local((body,url)=>url.endsWith('/'+file)?Buffer.concat([body,Buffer.from(' ')]):body);
    await assert.rejects(searchExpandedDictionary(form,corrupt),error=>error.code==='invalid_dictionary_data');
  }
});
