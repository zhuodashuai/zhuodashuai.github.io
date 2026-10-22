import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {verifyDictionaryPosNotationRevisions,applyDictionaryPosNotationRevisions} from '../lib/dictionary-pos-notation-revisions.mjs';
import {assertExactPosNotationNamespace,assertHistoricalDictionaryLineage,dictionaryNamespaceVersion,
  readHistoricalDictionaryNamespace,readDictionaryNamespace,SOURCE_LINEAGE_BASE_VERSION,SOURCE_LINEAGE_NOTATION_BASE_VERSION} from '../lib/dictionary-source-lineage.mjs';

const root=new URL('../../',import.meta.url);
const load=async file=>JSON.parse(await readFile(new URL('tooling/dictionary/source-revisions/'+file,root)));
const [pack,integrity,review]=await Promise.all(['finite-pos-notation-0001.json','finite-pos-notation-0001.integrity.json',
  'finite-pos-notation-0001.review.json'].map(load));
const verified=verifyDictionaryPosNotationRevisions(pack,integrity,review);
const FINAL_VERSION='5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432';
const fold=value=>value.toLocaleLowerCase('en-US');
function namespace(records,sources){
  const keys=new Map(),tokens=new Map([['头',[2636670]],['望',[3253174]],['月',[3431945]]]);
  const add=(key,ref)=>keys.set(fold(key),[...(keys.get(fold(key))||[]),ref]);
  for(const row of records){
    add(row.term,{id:row.id,kind:'canonical'});
    for(const form of row.forms)add(form,{id:row.id,kind:'form',term:form});
  }
  add('context headdress',{id:2636670,kind:'context',term:'context headdress',partOfSpeech:'noun',meaning:'旧语境仍然保留'});
  const value={records:new Map(records.map(row=>[row.term,row])),keys,tokens,
    manifest:{sources,counts:{records:records.length,englishKeys:keys.size,chineseTokens:tokens.size}}};
  reseal(value);return value;
}
function reseal(value){
  value.manifest.counts={records:value.records.size,englishKeys:value.keys.size,chineseTokens:value.tokens.size};
  value.manifest.version=dictionaryNamespaceVersion(value);
}
function fixture(){
  const before=namespace([...pack.entries.map(entry=>structuredClone(entry.before)),
    {id:12321,term:'other',partOfSpeech:'noun',meaning:'其他',forms:['moonless'],source:'mit'}],
  {mit:{name:'Fixture MIT'},'grammar-reviewed':{name:'Separate prior grammar attribution'}});
  const records=applyDictionaryPosNotationRevisions([...before.records.values()],verified).records;
  const after=namespace(records,{...structuredClone(before.manifest.sources),'pos-notation-reviewed':structuredClone(verified.source)});
  return {before,after};
}

test('exact three notation corrections retain every canonical/form/parent/context reference and Han posting',()=>{
  const {before,after}=fixture(),result=assertExactPosNotationNamespace(before,after,verified);
  assert.deepEqual(result.changedTerms,['headdress','longingly','moonless']);
  assert.equal(result.unchangedRecords,1);assert.equal(result.englishReferencesUnchanged,true);assert.equal(result.chinesePostingsUnchanged,true);
  assert.deepEqual(after.keys,before.keys);assert.deepEqual(after.tokens,before.tokens);
  assert.equal(after.keys.get('moonless').length,2);
  assert(after.keys.get('headdresses').some(ref=>ref.kind==='form'&&ref.id===2636670));
  assert.equal(after.keys.get('context headdress')[0].meaning,'旧语境仍然保留');
  assert.strictEqual(after.records.get('other'),before.records.get('other'));
});

for(const [name,mutate]of [
  ['lexical Chinese',a=>{a.records.get('headdress').meaning='n. 别的物体';}],
  ['old inline marker',a=>{a.records.get('headdress').meaning=pack.entries[0].before.meaning;}],
  ['corrected POS',a=>{a.records.get('longingly').partOfSpeech='adjective';}],
  ['canonical ID',a=>{a.records.get('moonless').id++;}],
  ['immutable seed',a=>{a.records.get('moonless').seed.rank++;}],
  ['valid plural',a=>{a.records.get('headdress').forms=[];}],
  ['active historical variant',a=>{a.records.get('headdress').variants=[{partOfSpeech:'adjective',meaning:pack.entries[0].before.meaning,source:'mit'}];}],
  ['unrelated record',a=>{a.records.set('other',{...a.records.get('other'),meaning:'被替换'});}],
  ['missing target',a=>{a.records.delete('moonless');}],
  ['missing unrelated record',a=>{a.records.delete('other');}],
  ['extra record',a=>{a.records.set('fifth',{id:12322,term:'fifth',partOfSpeech:'noun',meaning:'第五',forms:[],source:'mit'});}],
  ['missing canonical ref',a=>{a.keys.delete('headdress');}],
  ['missing valid form ref',a=>{a.keys.delete('headdresses');}],
  ['missing parent ref',a=>{a.keys.set('moonless',a.keys.get('moonless').filter(ref=>ref.id!==12321));}],
  ['missing context ref',a=>{a.keys.delete('context headdress');}],
  ['changed context gloss',a=>{a.keys.get('context headdress')[0].meaning='更改';}],
  ['added ref',a=>{a.keys.get('headdress').push({id:12321,kind:'form',term:'headdress'});}],
  ['changed Chinese posting',a=>{a.tokens.get('头').push(12321);}],
  ['missing Chinese token',a=>{a.tokens.delete('望');}],
  ['extra Chinese token',a=>{a.tokens.set('新',[12321]);}],
  ['changed old attribution',a=>{a.manifest.sources.mit.name='Another source';}],
  ['missing new attribution',a=>{delete a.manifest.sources['pos-notation-reviewed'];}],
  ['wrong new source SHA',a=>{a.manifest.sources['pos-notation-reviewed'].sha256='f'.repeat(64);}],
  ['wrong new source licence',a=>{a.manifest.sources['pos-notation-reviewed'].license='MIT';}],
  ['extra unrelated source',a=>{a.manifest.sources.unreviewed={name:'Unreviewed'};}]
])test(`resealed notation namespace rejects ${name}`,()=>{
  const {before,after}=fixture();
  // Mutation belongs only to the candidate; do not accidentally alter before.
  const candidate=structuredClone(after);mutate(candidate);reseal(candidate);
  assert.throws(()=>assertExactPosNotationNamespace(before,candidate,verified));
});

test('notation authority rejects a preexisting notation source rather than reapplying',()=>{
  const {before,after}=fixture();before.manifest.sources['pos-notation-reviewed']=structuredClone(verified.source);reseal(before);
  assert.throws(()=>assertExactPosNotationNamespace(before,after,verified));
});

for(const [name,value]of [['unverified raw pack',pack],['copied verified object',{...verified}],
  ['JSON-cloned verified object',JSON.parse(JSON.stringify(verified))],['missing pack',null]]){
  test(`notation lineage rejects ${name}`,()=>{
    const {before,after}=fixture();assert.throws(()=>assertExactPosNotationNamespace(before,after,value),/unverified pack/u);
  });
}

test('both historical reader and chain assertion reject an unregistered historical version before reading a namespace',async()=>{
  // The prior5c82 final is now a separately raw-pinned semantic baseline.
  // Merely creating a cabcf archive does not register it as a historical base.
  for(const version of ['f'.repeat(64),'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644','9f27',null]){
    await assert.rejects(readHistoricalDictionaryNamespace(version),/No reviewed transition/u);
    await assert.rejects(assertHistoricalDictionaryLineage(version,{},new Map()),/No reviewed transition/u);
  }
});

test('in-memory actual 102609-row source transition preserves all 102606 other records and complete indexes',async()=>{
  // This reads byte-pinned D22 data and constructs a candidate only in memory.
  // It does not generate or claim that the D23 namespace is physically present.
  const before=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_NOTATION_BASE_VERSION);
  const applied=applyDictionaryPosNotationRevisions([...before.records.values()],verified);
  const after={...before,records:new Map(applied.records.map(row=>[row.term,row])),
    manifest:{...before.manifest,sources:{...before.manifest.sources,'pos-notation-reviewed':verified.source}}};
  after.manifest.version=dictionaryNamespaceVersion(after);
  assert.equal(after.manifest.version,FINAL_VERSION);
  const result=assertExactPosNotationNamespace(before,after,verified);
  assert.equal(result.unchangedRecords,102606);assert.deepEqual(result.changedTerms,['headdress','longingly','moonless']);
  const changed=new Set(pack.entries.map(entry=>entry.term));let unchanged=0;
  for(const [term,row]of before.records){
    if(changed.has(term))assert.deepEqual(after.records.get(term),pack.entries.find(entry=>entry.term===term).after);
    else {assert.strictEqual(after.records.get(term),row);unchanged++;}
  }
  assert.equal(unchanged,102606);assert.equal(after.keys.size,140858);assert.equal(after.tokens.size,160071);
  assert.strictEqual(after.keys,before.keys);assert.strictEqual(after.tokens,before.tokens);
  assert.deepEqual(after.manifest.counts,before.manifest.counts);
});

test('actual D22 source identity is valid only for the named exact registered historical baselines',async()=>{
  const manifest=JSON.parse(await readFile(new URL('vocab/data/expanded-dictionary/manifest.json',root)));
  const expected=new Map([
    [SOURCE_LINEAGE_BASE_VERSION,{fromOriginal:102609,fromNotation:null}],
    [SOURCE_LINEAGE_NOTATION_BASE_VERSION,{fromOriginal:102605,fromNotation:102609}],
    [FINAL_VERSION,{fromOriginal:102602,fromNotation:102606}],
    ['cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644',{fromOriginal:102597,fromNotation:102601}]
  ]);
  assert(expected.has(manifest.version),'Unknown current namespace must not inherit a generic version mismatch waiver');
  const current=manifest.version===SOURCE_LINEAGE_BASE_VERSION||manifest.version===SOURCE_LINEAGE_NOTATION_BASE_VERSION
    ?await readHistoricalDictionaryNamespace(manifest.version)
    :await readDictionaryNamespace(manifest,fileURLToPath(new URL('vocab/data/expanded-dictionary/',root)));
  const original=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_BASE_VERSION,manifest,current.records);
  assert.equal(original.unchangedRecords,expected.get(manifest.version).fromOriginal);
  if(expected.get(manifest.version).fromNotation===null){
    await assert.rejects(assertHistoricalDictionaryLineage(SOURCE_LINEAGE_NOTATION_BASE_VERSION,manifest,current.records),/cannot regress/u);
  }else{
    const notation=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_NOTATION_BASE_VERSION,manifest,current.records);
    assert.equal(notation.unchangedRecords,expected.get(manifest.version).fromNotation);
  }
});
