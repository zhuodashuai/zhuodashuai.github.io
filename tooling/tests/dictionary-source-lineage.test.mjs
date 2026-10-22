import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verifyDictionarySourceRevisions,applyDictionarySourceRevisions} from '../lib/dictionary-source-revisions.mjs';
import {assertExactRevisionNamespace,dictionaryNamespaceVersion,assertHistoricalDictionaryLineage,
  SOURCE_LINEAGE_BASE_VERSION,SOURCE_LINEAGE_NOTATION_BASE_VERSION,readDictionaryNamespace} from '../lib/dictionary-source-lineage.mjs';
const root=new URL('../../',import.meta.url);
const json=async file=>JSON.parse(await readFile(new URL(file,root),'utf8'));
const[pack,integrity,review]=await Promise.all(['finite-grammar-0001.json','finite-grammar-0001.integrity.json','finite-grammar-0001.review.json']
  .map(file=>json('tooling/dictionary/source-revisions/'+file)));
const verified=verifyDictionarySourceRevisions(pack,integrity,review);
function namespace(records,sources){
  const keys=new Map(),tokens=new Map([['是',[128]],['有',[891]],['做',[2068]]]);
  const add=(key,ref)=>keys.set(key,[...(keys.get(key)||[]),ref]);
  for(const row of records){add(row.term,{id:row.id,kind:'canonical'});for(const form of row.forms)add(form,{id:row.id,kind:'form',term:form});}
  add('a contextual reading',{id:128,kind:'context',term:'a contextual reading',partOfSpeech:'verb',meaning:'原来的语境释义'});
  const result={records:new Map(records.map(row=>[row.term,row])),keys,tokens,manifest:{sources,counts:{records:records.length,englishKeys:keys.size,chineseTokens:tokens.size}}};
  result.manifest.version=dictionaryNamespaceVersion(result);return result;
}
function fixture(){
  const others=[{id:128,term:'be',partOfSpeech:'verb',meaning:'是',forms:['been'],source:'core'},
    {id:891,term:'have',partOfSpeech:'verb',meaning:'有',forms:['had'],source:'core'},
    {id:2068,term:'do',partOfSpeech:'verb',meaning:'做',forms:['did'],source:'core'},
    {id:222,term:'other',partOfSpeech:'noun',meaning:'其他',forms:[],source:'mit'}];
  const before=namespace([...pack.entries.map(row=>structuredClone(row.before)),...others],{core:{name:'Fixture core'},mit:{name:'Fixture MIT'},'pos-reviewed':{name:'Fixture POS'}});
  const after=namespace(applyDictionarySourceRevisions([...before.records.values()],verified).records,{...before.manifest.sources,'grammar-reviewed':verified.source});
  return{before,after};
}
function reseal(after){after.manifest.counts={records:after.records.size,englishKeys:after.keys.size,chineseTokens:after.tokens.size};after.manifest.version=dictionaryNamespaceVersion(after);}
test('exact four-source transition preserves every other record, token and canonical/context/parent reference',()=>{
  const{before,after}=fixture(),result=assertExactRevisionNamespace(before,after,verified);
  assert.deepEqual(result.changedTerms,['are','did','had','been']);assert.equal(result.unchangedRecords,4);assert.equal(result.removedExactFormRefs.length,4);
  for(const term of ['did','had','been'])assert(after.keys.get(term).some(ref=>ref.kind==='form'));
  assert.equal(after.keys.get('a contextual reading')[0].meaning,'原来的语境释义');
});
for(const field of ['meaning','seed','source','partOfSpeech','forms'])test('resealed current source corruption fails: '+field,()=>{
  const{before,after}=fixture(),target=after.records.get('been');
  target[field]=({meaning:'错误释义',seed:{rank:0,forms:[],workbook:false},source:'mit',partOfSpeech:'noun',forms:['beens']})[field];
  reseal(after);assert.throws(()=>assertExactRevisionNamespace(before,after,verified));
});
test('resealed unrelated record changes and omissions fail instead of hiding behind a new version',()=>{
  for(const mutate of [after=>after.records.get('other').meaning='篡改',after=>after.records.delete('other')]){
    const{before,after}=fixture();mutate(after);reseal(after);assert.throws(()=>assertExactRevisionNamespace(before,after,verified));
  }
});
test('a stale form reference cannot survive even if its file/version hashes are recomputed',()=>{
  const{before,after}=fixture();after.keys.set('beens',structuredClone(before.keys.get('beens')));reseal(after);
  assert.throws(()=>assertExactRevisionNamespace(before,after,verified));
});
test('valid parent and context references cannot be deleted wholesale',()=>{
  for(const key of ['had','did','been','a contextual reading']){
    const{before,after}=fixture();after.keys.delete(key);reseal(after);assert.throws(()=>assertExactRevisionNamespace(before,after,verified));
  }
});
test('a separate homograph at the same stale-form key survives the exact pair removal',()=>{
  const{before,after}=fixture();before.keys.get('ares').push({id:222,kind:'context',term:'ares',partOfSpeech:'noun',meaning:'独立语境'});
  after.keys.set('ares',[{id:222,kind:'context',term:'ares',partOfSpeech:'noun',meaning:'独立语境'}]);reseal(before);reseal(after);
  assert.doesNotThrow(()=>assertExactRevisionNamespace(before,after,verified));
});
test('Chinese postings and unrelated source provenance cannot change alongside a grammar repair',()=>{
  for(const mutate of [after=>after.tokens.get('是').push(222),after=>after.manifest.sources.mit.name='A different source']){
    const{before,after}=fixture();mutate(after);reseal(after);assert.throws(()=>assertExactRevisionNamespace(before,after,verified));
  }
});
test('an arbitrary historical dictionary version has no implicit lineage waiver',async()=>{
  await assert.rejects(assertHistoricalDictionaryLineage('f'.repeat(64),{},new Map()),/No reviewed transition/u);
});
test('actual current canonical dictionary is linked to the byte-pinned archived baseline, not rebased frozen evidence',async()=>{
  const manifest=await json('vocab/data/expanded-dictionary/manifest.json');
  const current=await readDictionaryNamespace(manifest,fileURLToPath(new URL('vocab/data/expanded-dictionary/',root)));
  const result=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_BASE_VERSION,manifest,current.records);
  assert.equal(result.historicalVersion,SOURCE_LINEAGE_BASE_VERSION);assert.equal(result.currentVersion,manifest.version);
  const expectedUnchanged=new Map([
    [SOURCE_LINEAGE_BASE_VERSION,102609],
    [SOURCE_LINEAGE_NOTATION_BASE_VERSION,102605],
    ['5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432',102602],
    ['cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644',102597]
  ]);
  assert(expectedUnchanged.has(manifest.version),'Actual source is not one of the four exact reviewed registered stages');
  assert.equal(result.unchangedRecords,expectedUnchanged.get(manifest.version));
});
