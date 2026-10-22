import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DICTIONARY_SOURCE_REVISION_ID,DICTIONARY_SOURCE_REVISION_SOURCE,
  validateDictionarySourceRevisions,dictionarySourceRevisionIntegrity,
  verifyDictionarySourceRevisions,applyDictionarySourceRevisions} from '../lib/dictionary-source-revisions.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const objSha=value=>hash(JSON.stringify(value));
const base=new URL('../dictionary/source-revisions/',import.meta.url);
const packBytes=await readFile(new URL('finite-grammar-0001.json',base));
const integrityBytes=await readFile(new URL('finite-grammar-0001.integrity.json',base));
const reviewBytes=await readFile(new URL('finite-grammar-0001.review.json',base));
const pack=JSON.parse(packBytes),integrity=JSON.parse(integrityBytes),review=JSON.parse(reviewBytes);
const clone=value=>structuredClone(value);
const verified=()=>verifyDictionarySourceRevisions(pack,integrity,review);
const records=()=>pack.entries.map(entry=>clone(entry.before));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const reject=fn=>assert.throws(fn,/Invalid dictionary source revision:/u);

test('exact ledger, independent integrity and original E2 receipt retain saved byte fingerprints',()=>{
  assert.equal(hash(packBytes),'ab5d33f6edc7f427e3447dcec4a5d204db69b5cbe08025419afa3917070b677a');
  assert.equal(hash(integrityBytes),'d7b566daa9956b6dca476ace08c50278f9e480444b92f637595a1bf2cfc7a681');
  assert.equal(hash(reviewBytes),'95f0631e7804bcc299cd09a59b9a60e42fad2f3faf2755484ee3e9544095b348');
  assert.equal(objSha(pack),'cdf8077a3337d7a9618fae69b5f9b05af6a6a65dd99e409b284307721e1120e1');
  assert.equal(objSha(review),'a4dccc2531ebe53c4ed6da70ff2c9737b204ec8b4faf542f901d641f57b1f5eb');
  assert.equal(pack.id,DICTIONARY_SOURCE_REVISION_ID);assert.deepEqual(pack.source,DICTIONARY_SOURCE_REVISION_SOURCE);
  assert.deepEqual(dictionarySourceRevisionIntegrity(pack),integrity);
});

test('prior independent receipt is exact source opinion, not implementation or automatic admission approval',()=>{
  const v=verified();assert.equal(v.review.reviewerPrincipal,'e2');assert.equal(v.review.sourceCandidateAuthorPrincipal,'c');
  assert.equal(v.review.formalAdmissions,0);assert.equal(v.review.sourceRepairsApplied,0);assert.equal(v.review.published,false);
  assert(v.review.designAssessment.independentImplementationReviewRequired);
  assert.equal(v.source.sha256,integrity.semanticSha256);assert(Object.isFrozen(v));assert(Object.isFrozen(v.pack.entries[0].before.seed.forms));
});

test('apply corrects all exact records deterministically without mutating inputs or their historical source',()=>{
  const input=freeze(records()),before=JSON.stringify(input),v=verified();
  const first=applyDictionarySourceRevisions(input,v),second=applyDictionarySourceRevisions(input,v);
  assert.deepEqual(first,second);assert.equal(JSON.stringify(input),before);
  assert.equal(first.report.applied,4);assert.equal(first.report.supersededPosReviewed,4);
  assert.deepEqual(first.report.changedTerms,['are','did','had','been']);assert.equal(first.report.ledgerSha256,integrity.semanticSha256);
  assert.equal(first.report.reviewSha256,integrity.reviewSemanticSha256);
  for(const[index,entry]of pack.entries.entries()){
    const out=first.records[index];assert.equal(objSha(out),entry.afterSha256);assert.deepEqual(out,entry.after);
    assert.deepEqual(out.seed,entry.before.seed);assert.deepEqual(out.variants,entry.before.variants);assert.equal(out.meaning,entry.before.meaning);
    assert.deepEqual(out.forms,[]);assert.equal(out.partOfSpeech,'verb');assert.equal(out.source,'grammar-reviewed');assert.notEqual(out,input[index]);
    assert.equal(entry.before.source,'pos-reviewed');assert.notEqual(objSha(entry.before),objSha(out));
  }
});

test('unlisted records and valid parent forms remain identical, including the same object references',()=>{
  const parents=[{id:2068,term:'do',forms:['did','does','doing','done'],meaning:'做',source:'core'},
    {id:891,term:'have',forms:['had','has','having'],meaning:'有',source:'core'},
    {id:128,term:'be',forms:['been','being','is','was'],meaning:'是',source:'core'},
    {id:9999999,term:'ares',meaning:'独立同形记录在本模块外',forms:[],source:'other-reviewed-source'}];
  const input=freeze([...records().slice(0,2),...parents,...records().slice(2)]),result=applyDictionarySourceRevisions(input,verified());
  for(const parent of parents){assert.equal(result.records.find(row=>row.id===parent.id),parent);}
  assert.deepEqual(parents[0].forms,['did','does','doing','done']);assert.deepEqual(parents[1].forms,['had','has','having']);assert.deepEqual(parents[2].forms,['been','being','is','was']);
});

test('verification snapshots all data; later caller mutation cannot change an authenticated pack',()=>{
  const p=clone(pack),i=clone(integrity),r=clone(review),v=verifyDictionarySourceRevisions(p,i,r);
  p.entries[0].after.meaning='篡改';i.semanticSha256='0'.repeat(64);r.reviewerPrincipal='c';
  assert.equal(v.pack.entries[0].after.meaning,pack.entries[0].after.meaning);
  assert.equal(applyDictionarySourceRevisions(records(),v).records[0].meaning,pack.entries[0].after.meaning);
});

const packMutations=[
  ['unknown top field',p=>{p.extra=true;}],['schema',p=>{p.schemaVersion=2;}],['id',p=>{p.id='other';}],
  ['wrong source version',p=>{p.originalDictionaryVersion='0'.repeat(64);}],['wrong author',p=>{p.authorPrincipal='e2';}],
  ['missing entry',p=>{p.entries.pop();}],['extra entry',p=>{p.entries.push(clone(p.entries[0]));}],
  ['duplicate entry',p=>{p.entries[1]=clone(p.entries[0]);}],['reordered entries',p=>{p.entries.reverse();}],
  ['unknown target',p=>{p.entries[0].term='is';}],['wrong target id',p=>{p.entries[0].id++;}],
  ['before hash',p=>{p.entries[0].beforeSha256='0'.repeat(64);}],['after hash',p=>{p.entries[0].afterSha256='0'.repeat(64);}],
  ['relabelled MIT correction',p=>{p.source.license='MIT';}],['unknown notice origin',p=>{p.source.url='https://example.com/';}],
  ['extra source descriptor field',p=>{p.source.commit='a'.repeat(40);}],
  ['changed original meaning',p=>{p.entries[0].before.meaning='另一义项';}],
  ['cleared original seed',p=>{p.entries[0].before.seed.forms=[];}],
  ['cleared revised seed',p=>{p.entries[0].after.seed.forms=[];}],
  ['changed revised meaning',p=>{p.entries[0].after.meaning='被改动的释义';}],
  ['wrong revised POS',p=>{p.entries[0].after.partOfSpeech='noun';}],
  ['reinserted stale active form',p=>{p.entries[0].after.forms=['ares'];}],
  ['old correction source',p=>{p.entries[0].after.source='pos-reviewed';}],
  ['discarded original variant',p=>{p.entries[0].after.variants=[];}],
  ['added fake area-unit live variant',p=>{p.entries[0].after.variants.push({partOfSpeech:'noun',meaning:'公亩',source:'mit'});}],
  ['unapproved runtime revision field',p=>{p.entries[0].after.revision=1;}]
];
for(const[label,mutate]of packMutations)test(`reject pack: ${label}`,()=>{
  const changed=clone(pack);mutate(changed);reject(()=>validateDictionarySourceRevisions(changed));
});

for(const[key,value]of Object.entries({rows:3,semanticSha256:'0'.repeat(64),reviewSemanticSha256:'0'.repeat(64),id:'changed',schemaVersion:2}))
  test(`reject integrity ${key}`,()=>reject(()=>verifyDictionarySourceRevisions(pack,{...integrity,[key]:value},review)));
test('reject extra integrity fields rather than silently interpreting another approval schema',()=>reject(()=>verifyDictionarySourceRevisions(pack,{...integrity,approved:true},review)));
test('null or non-object prior review and null per-term opinion fail with a contract error',()=>{
  for(const value of [null,[],42,'review'])reject(()=>verifyDictionarySourceRevisions(pack,integrity,value));
  const changed=clone(review);changed.perTerm[0]=null;reject(()=>verifyDictionarySourceRevisions(pack,integrity,changed));
});

const reviewMutations=[
  ['self review',r=>{r.reviewerPrincipal='c';}],['pair author review',r=>{r.reviewerPrincipal='root';}],
  ['unknown reviewer',r=>{r.reviewerPrincipal='another-agent';}],['wrong source author',r=>{r.sourceCandidateAuthorPrincipal='e2';}],
  ['wrong pair author',r=>{r.pairAuthorPrincipal='e2';}],['misstated implementation approval',r=>{r.sourceRepairsApplied=4;}],
  ['misstated admission',r=>{r.formalAdmissions=4;}],['misstated publication',r=>{r.published=true;}],
  ['wrong stage',r=>{r.stage='approved-code';}],['missing reviewed record',r=>{r.perTerm.pop();}],
  ['duplicate reviewed record',r=>{r.perTerm[1]=clone(r.perTerm[0]);}],
  ['different after-source',r=>{r.perTerm[0].proposedSource.meaning='改了';}],
  ['altered review opinion',r=>{r.perTerm[0].sourceOpinion+=' changed';}],
  ['altered original primary evidence',r=>{r.primaryEvidence[0].supports='new claim';}]
];
for(const[label,mutate]of reviewMutations)test(`reject review: ${label}`,()=>{
  const changed=clone(review);mutate(changed);reject(()=>verifyDictionarySourceRevisions(pack,integrity,changed));
});

test('rewriting both pack and calculated external integrity cannot approve a fifth or changed record',()=>{
  const changed=clone(pack);changed.entries[0].after.seed.forms=[];changed.entries[0].afterSha256=objSha(changed.entries[0].after);
  const forged={...integrity,semanticSha256:objSha(changed)};reject(()=>verifyDictionarySourceRevisions(changed,forged,review));
});
test('raw or cloned verified-looking objects cannot bypass the private verification brand',()=>{
  for(const value of [pack,null,{},clone(verified()),{pack,integrity,review,source:{...pack.source,sha256:integrity.semanticSha256}}])reject(()=>applyDictionarySourceRevisions(records(),value));
});

const recordMutations=[
  ['missing target',r=>{r[0]={id:500,term:'different'};}],['duplicate target',r=>{r.push(clone(r[0]));}],
  ['duplicate unlisted id',r=>{r.push({id:r[0].id,term:'not-are'});}],
  ['target id with foreign term',r=>{r[0].term='not-are';}],['target term with foreign id',r=>{r[0].id++;}],
  ['altered meaning',r=>{r[1].meaning='不同';}],['altered seed',r=>{r[2].seed.forms=[];}],
  ['altered variants',r=>{r[3].variants[0].partOfSpeech='noun';}],['extra target field',r=>{r[0].unread=true;}],
  ['already applied source',r=>{r[0]=clone(pack.entries[0].after);}]
];
for(const[label,mutate]of recordMutations)test(`reject apply: ${label} atomically`,()=>{
  const changed=records();mutate(changed);const before=JSON.stringify(changed);reject(()=>applyDictionarySourceRevisions(changed,verified()));assert.equal(JSON.stringify(changed),before);
});

test('sparse arrays, array decorations and non-JSON fields fail without invoking getters',()=>{
  const sparse=clone(pack);delete sparse.entries[0];reject(()=>validateDictionarySourceRevisions(sparse));
  const decorated=clone(pack);decorated.entries.extra=true;reject(()=>validateDictionarySourceRevisions(decorated));
  const accessor=clone(pack);let reads=0;Object.defineProperty(accessor.entries[0].before,'meaning',{get(){reads++;return '坏';},enumerable:true});
  reject(()=>validateDictionarySourceRevisions(accessor));assert.equal(reads,0);
  for(const value of [undefined,NaN,Infinity,1n,()=>false,new Date()]){const changed=clone(pack);changed.unserializable=value;reject(()=>validateDictionarySourceRevisions(changed));}
  const symbolic=clone(pack);symbolic[Symbol('hidden')]=true;reject(()=>validateDictionarySourceRevisions(symbolic));
  const cyclic=clone(pack);cyclic.loop=cyclic;reject(()=>validateDictionarySourceRevisions(cyclic));
});
