import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {DICTIONARY_POS_NOTATION_REVISION_ID,DICTIONARY_POS_NOTATION_REVISION_SOURCE,
  validateDictionaryPosNotationRevisions,dictionaryPosNotationRevisionIntegrity,
  verifyDictionaryPosNotationRevisions,applyDictionaryPosNotationRevisions} from '../lib/dictionary-pos-notation-revisions.mjs';

const source=new URL('../dictionary/source-revisions/finite-pos-notation-0001.json',import.meta.url);
const packBytes=await readFile(source),pack=JSON.parse(packBytes);
const integrityBytes=await readFile(new URL('../dictionary/source-revisions/finite-pos-notation-0001.integrity.json',import.meta.url));
const reviewBytes=await readFile(new URL('../dictionary/source-revisions/finite-pos-notation-0001.review.json',import.meta.url));
const integrity=JSON.parse(integrityBytes),review=JSON.parse(reviewBytes);
const clone=value=>structuredClone(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject=fn=>assert.throws(fn,/Invalid dictionary POS notation revision:/u);
const verified=()=>verifyDictionaryPosNotationRevisions(pack,integrity,review);
const records=()=>pack.entries.map(entry=>clone(entry.before));
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

test('complete original source ledger and its original pending-scope notes retain their semantic root',()=>{
  assert.equal(hash(pack),'3a5409dad7b45fd84d3644886ab89fa03ab0ea85d96c6f61b4ebf78263a86c19');
  assert.equal(pack.id,DICTIONARY_POS_NOTATION_REVISION_ID);
  assert.deepEqual(pack.sourceDescriptorProposal,{id:'pos-notation-reviewed',...DICTIONARY_POS_NOTATION_REVISION_SOURCE});
  assert.equal(validateDictionaryPosNotationRevisions(pack),pack);
  const integrity=dictionaryPosNotationRevisionIntegrity(pack);
  assert.equal(integrity.semanticSha256,hash(pack));assert.equal(integrity.rows,3);
  assert.deepEqual(pack.entries.map(row=>row.term),['headdress','longingly','moonless']);
  for(const entry of pack.entries){
    assert.equal(entry.history.oldHoldClosed,false);assert.equal(entry.independentlyApproved,false);
    assert.equal(entry.implemented,false);assert.equal(entry.admitted,false);
    assert.deepEqual(entry.history.fullRawBeforeRecord,entry.before);
    assert.equal(entry.unchangedConditionalRootPair.exactAfterSourceIndependentlyReviewed,false);
  }
});

test('three corrections change only exact leading notation, POS and honest source attribution',()=>{
  const expected=[['noun','a.','n.'],['adverb','a.','adv.'],['adjective','n.','a.']];
  for(const[index,entry]of pack.entries.entries()){
    const[pos,oldPrefix,newPrefix]=expected[index];
    assert.equal(entry.after.partOfSpeech,pos);
    assert.equal(entry.after.meaning,newPrefix+entry.before.meaning.slice(oldPrefix.length));
    assert.equal(entry.after.source,'pos-notation-reviewed');
    for(const field of ['id','term','forms','seed'])assert.deepEqual(entry.after[field],entry.before[field]);
    assert(!Object.hasOwn(entry.before,'variants'));assert(!Object.hasOwn(entry.after,'variants'));
  }
  assert.deepEqual(pack.entries[0].after.forms,['headdresses']);
});

const mutations=[
  ['unknown schema',p=>p.schemaVersion=2],['renamed authority id',p=>p.id='finite-grammar-0001'],
  ['wrong source author',p=>p.authorPrincipal='e'],['wrong namespace',p=>p.baselineSourceVersion='0'.repeat(64)],
  ['deleted target',p=>p.entries.pop()],['fifth or duplicated target',p=>p.entries.push(clone(p.entries[0]))],
  ['duplicate term',p=>p.entries[1]=clone(p.entries[0])],['reordered entries',p=>p.entries.reverse()],
  ['unknown target',p=>p.entries[0].term='hat'],['foreign id',p=>p.entries[0].id++],
  ['stale before hash',p=>p.entries[0].beforeSha256='0'.repeat(64)],
  ['forged after hash',p=>p.entries[0].afterSha256='f'.repeat(64)],
  ['changed source name',p=>p.sourceDescriptorProposal.name='MIT'],
  ['misattributed licence',p=>p.sourceDescriptorProposal.license='MIT'],
  ['unrelated notice origin',p=>p.sourceDescriptorProposal.url='https://example.com/'],
  ['extra descriptor field',p=>p.sourceDescriptorProposal.sha256='f'.repeat(64)],
  ['unknown top field',p=>p.extra=true],['unknown entry field',p=>p.entries[0].extra=true],
  ['new lexical Chinese',p=>p.entries[0].after.meaning='n. 帽子'],
  ['changed space beyond marker',p=>p.entries[0].after.meaning='n.  饰头巾, 头式'],
  ['changed Chinese punctuation',p=>p.entries[1].after.meaning='adv. 渴望地，切望地'],
  ['generic word replacement',p=>p.entries[2].after.meaning='a. 月光明亮的'],
  ['wrong corrected POS',p=>p.entries[2].after.partOfSpeech='noun'],
  ['stale corrected marker',p=>p.entries[2].after.meaning='n. 无月亮的'],
  ['cleared valid plural',p=>p.entries[0].after.forms=[]],
  ['rewritten seed',p=>p.entries[0].after.seed.forms=[]],
  ['new seed field',p=>p.entries[1].after.seed.reviewed=true],
  ['altered original raw object',p=>p.entries[0].before.meaning='a. 另一个义项'],
  ['bad original POS as active variant',p=>p.entries[0].after.variants=[{partOfSpeech:'adjective',meaning:'a. 饰头巾, 头式',source:'mit'}]],
  ['empty variant promotion',p=>p.entries[0].after.variants=[]],
  ['closed historical hold',p=>p.entries[0].history.oldHoldClosed=true],
  ['deleted historical hold',p=>p.entries[1].history.priorHolds=[]],
  ['null historical object',p=>p.entries[0].history=null],
  ['invented source approval',p=>p.entries[0].independentlyApproved=true],
  ['invented implementation',p=>p.entries[0].implemented=true],
  ['invented admission',p=>p.entries[0].admitted=true],
  ['null Root pair',p=>p.entries[0].unchangedConditionalRootPair=null],
  ['changed Root pair author',p=>p.entries[0].unchangedConditionalRootPair.authorPrincipal='c'],
  ['changed Root example',p=>p.entries[0].unchangedConditionalRootPair.pair[3]='An unreviewed new example.'],
  ['earlier conditional review relabelled final',p=>p.entries[0].unchangedConditionalRootPair.exactAfterSourceIndependentlyReviewed=true],
  ['altered own primary record',p=>p.entries[2].ownPrimaryReading.allExactPrimaryRows[0].wnPos='n']
];
for(const[label,mutate]of mutations)test(`reject ledger: ${label}`,()=>{
  const changed=clone(pack);mutate(changed);reject(()=>validateDictionaryPosNotationRevisions(changed));
});

test('self-consistent changed lexical body and recomputed whole-source hash still cannot pass finite authority',()=>{
  const changed=clone(pack);changed.entries[0].after.meaning='n. 新释义';
  changed.entries[0].afterSha256=hash(changed.entries[0].after);
  reject(()=>validateDictionaryPosNotationRevisions(changed));
});

for(const[label,modify]of [
  ['getter',p=>{let reads=0;Object.defineProperty(p.entries[0].before,'meaning',{enumerable:true,get(){reads++;return 'a. 饰头巾, 头式';}});return()=>assert.equal(reads,0);}],
  ['custom iterator',p=>{let calls=0;p.entries[Symbol.iterator]=function*(){calls++;};return()=>assert.equal(calls,0);}],
  ['own map override',p=>{let calls=0;p.entries.map=()=>{calls++;return[];};return()=>assert.equal(calls,0);}],
  ['array accessor',p=>{let calls=0;Object.defineProperty(p.entries,'0',{get(){calls++;return null;},enumerable:true});return()=>assert.equal(calls,0);}],
  ['sparse array',p=>{delete p.entries[1];}],
  ['array string decoration',p=>{p.entries.extra=true;}],
  ['symbol property',p=>{p[Symbol('hidden')]=true;}],
  ['nonenumerable property',p=>{Object.defineProperty(p,'hidden',{value:true});}],
  ['class instance',p=>{p.entries[0].history=new Date();}],
  ['negative zero',p=>{p.extra=-0;}],
  ['invalid Unicode',p=>{p.extra='\ud800';}],
  ['invalid Unicode property',p=>{p['\ud800']=true;}],
  ['cycle',p=>{p.self=p;}]
])test(`reject non-JSON without hidden execution: ${label}`,()=>{
  const changed=clone(pack),after=modify(changed);reject(()=>validateDictionaryPosNotationRevisions(changed));after?.();
});

for(const value of [undefined,NaN,Infinity,1n,()=>{},new Map()])test(`reject non-JSON ${typeof value}/${String(value)}`,()=>{
  const changed=clone(pack);changed.extra=value;reject(()=>validateDictionaryPosNotationRevisions(changed));
});

test('unverified, raw or structurally forged objects never enter apply',()=>{
  for(const forged of [null,{},pack,{pack,source:pack.sourceDescriptorProposal},Object.create(null)])
    reject(()=>applyDictionaryPosNotationRevisions(pack.entries.map(row=>row.before),forged));
});

test('saved ledger, integrity and byte-exact original independent review have distinct authenticated roots',()=>{
  const raw=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(raw(packBytes),'658091b073f90d829bb901d11853e4a1a510653fdd08d0e8a2563a5e6827f3d9');
  assert.equal(raw(integrityBytes),'897da80fa257eed4e1491a3c67c0154104366e87b9493a3643d7078dee63f677');
  assert.equal(raw(reviewBytes),'98d0e8dede6697d2a4828de9e12553644c894c2c6722f61645ed4028934e4de7');
  assert.equal(hash(review),'78171150bcebbdc72ab5380d17a9ab9f6fd23d27eb1ed99b40ed70d85c4b2dc8');
  assert.deepEqual(dictionaryPosNotationRevisionIntegrity(pack),integrity);
});

test('actual C source / Root pair / E independent source opinion is not implementation or admission approval',()=>{
  const v=verified();assert.equal(v.review.authorPrincipal,'c');assert.equal(v.review.pairAuthorPrincipal,'root');
  assert.equal(v.review.reviewerPrincipal,'e');assert.equal(v.review.complete,true);
  assert.equal(v.review.scope.codeApproval,false);assert.equal(v.review.scope.sourceChangesApplied,0);
  assert.equal(v.review.scope.coverageAdded,0);assert.equal(v.review.scope.admitted,0);assert.equal(v.review.scope.published,false);
  assert.deepEqual(Object.keys(v.source),['name','license','url','sha256']);
  assert.deepEqual(v.source,{...DICTIONARY_POS_NOTATION_REVISION_SOURCE,sha256:integrity.semanticSha256});
  assert(Object.isFrozen(v));assert(Object.isFrozen(v.pack.entries[0].before.seed.forms));
  assert(!Object.isFrozen(pack));assert(!Object.isFrozen(review));assert(!Object.isFrozen(integrity));
});

test('deterministic all-three replacement preserves whole input and corrects only permitted active fields',()=>{
  const input=freeze(records()),snapshot=JSON.stringify(input),v=verified();
  const first=applyDictionaryPosNotationRevisions(input,v),second=applyDictionaryPosNotationRevisions(input,v);
  assert.deepEqual(first,second);assert.equal(JSON.stringify(input),snapshot);
  assert.equal(first.report.applied,3);assert.equal(first.report.ledgerSha256,integrity.semanticSha256);
  assert.equal(first.report.reviewSha256,integrity.reviewSemanticSha256);
  assert.equal(first.report.sourceId,'pos-notation-reviewed');
  assert.deepEqual(first.report.changedTerms,['headdress','longingly','moonless']);
  for(let index=0;index<pack.entries.length;index++){
    const entry=pack.entries[index],output=first.records[index];
    assert.deepEqual(output,entry.after);assert.equal(hash(output),entry.afterSha256);assert.notEqual(output,input[index]);
    assert.deepEqual(output.seed,input[index].seed);assert.deepEqual(output.forms,input[index].forms);
    assert(!Object.hasOwn(output,'variants'));assert.equal(entry.history.oldHoldClosed,false);
  }
});

test('unlisted records preserve identity, raw shape and order including existing finite4 records',()=>{
  const unlisted=[{id:50,term:'hat',partOfSpeech:'noun',meaning:'帽子',forms:['hats'],source:'mit'},
    {id:100,term:'been',partOfSpeech:'verb',meaning:'be的过去分词',forms:[],source:'grammar-reviewed'},
    {id:101,term:'headdresses',partOfSpeech:'noun',meaning:'独立同形词记录',forms:[],source:'other'}];
  const input=freeze([unlisted[0],records()[2],unlisted[1],records()[0],unlisted[2],records()[1]]);
  const result=applyDictionaryPosNotationRevisions(input,verified());
  assert.deepEqual(result.records.map(row=>row.term),input.map(row=>row.term));
  for(const row of unlisted)assert.equal(result.records.find(item=>item.id===row.id),row);
  assert.deepEqual(result.records.find(row=>row.term==='headdress').forms,['headdresses']);
});

test('verification snapshots and freezes only private clones, never caller objects',()=>{
  const p=clone(pack),i=clone(integrity),r=clone(review),v=verifyDictionaryPosNotationRevisions(p,i,r);
  assert(!Object.isFrozen(p));assert(!Object.isFrozen(p.entries[0].before.forms));assert(!Object.isFrozen(r));
  p.entries[0].after.meaning='改动';i.semanticSha256='0'.repeat(64);r.perTerm[0].decision='hold';
  assert.equal(v.pack.entries[0].after.meaning,pack.entries[0].after.meaning);
  assert.equal(v.review.perTerm[0].decision,review.perTerm[0].decision);
  assert.deepEqual(applyDictionaryPosNotationRevisions(records(),v).records,pack.entries.map(row=>row.after));
  const one=applyDictionaryPosNotationRevisions(records(),v);one.records[0].seed.forms.push('changed');
  assert.deepEqual(v.pack.entries[0].after.seed.forms,['headdresses']);
  assert.deepEqual(applyDictionaryPosNotationRevisions(records(),v).records[0].seed.forms,['headdresses']);
});

for(const[key,value]of Object.entries({schemaVersion:2,id:'another-ledger',rows:4,semanticSha256:'0'.repeat(64),reviewSemanticSha256:'f'.repeat(64),extra:true}))
  test(`reject integrity ${key}`,()=>reject(()=>verifyDictionaryPosNotationRevisions(pack,{...integrity,[key]:value},review)));

const reviewMutations=[
  ['source author self-review',r=>r.reviewerPrincipal='c'],['pair author self-review',r=>r.reviewerPrincipal='root'],
  ['unknown reviewer',r=>r.reviewerPrincipal='e2'],['misidentified source author',r=>r.authorPrincipal='root'],
  ['misidentified pair author',r=>r.pairAuthorPrincipal='c'],['not complete',r=>r.complete=false],
  ['code approval',r=>r.scope.codeApproval=true],['source installed',r=>r.scope.sourceChangesApplied=3],
  ['coverage manufactured',r=>r.scope.coverageAdded=3],['admission manufactured',r=>r.scope.admitted=3],
  ['history deleted',r=>r.scope.historyHoldsDeleted=3],['publication manufactured',r=>r.scope.published=true],
  ['wrong namespace',r=>r.sourceVersionObserved='0'.repeat(64)],['wrong ledger root',r=>r.ledgerSemanticSha256='f'.repeat(64)],
  ['source relabelled MIT',r=>r.sourceDescriptor.id='mit'],['missing opinion',r=>r.perTerm.pop()],
  ['duplicate opinion',r=>r.perTerm[1]=clone(r.perTerm[0])],['reordered opinions',r=>r.perTerm.reverse()],
  ['different after-source',r=>r.perTerm[0].after.meaning='n. changed'],['different before-source',r=>r.perTerm[0].before.forms=[]],
  ['different whole pair',r=>r.perTerm[1].pair[4]='不同的译文'],['source not actually read',r=>r.perTerm[0].exactAfterSourceIndependentlyReviewed=false],
  ['hold closed',r=>r.perTerm[2].historicalHoldClosed=true],['different historical reason',r=>r.perTerm[2].priorHolds[0].raw.reason='ignored'],
  ['source judgement changed',r=>r.perTerm[1].decision='hold'],['primary evidence changed',r=>r.perTerm[2].primaryRows[0].wnPos='n'],
  ['different rationale',r=>r.perTerm[0].sourceRationale+=' edited'],['extra approval field',r=>r.allWordsApproved=true],
  ['null opinion',r=>r.perTerm[0]=null],['null scope',r=>r.scope=null]
];
for(const[label,mutate]of reviewMutations)test(`reject independent review: ${label}`,()=>{
  const changed=clone(review);mutate(changed);reject(()=>verifyDictionaryPosNotationRevisions(pack,integrity,changed));
});

test('getter-bearing integrity and source review are rejected before invoking accessors',()=>{
  for(const target of ['integrity','review']){
    const i=clone(integrity),r=clone(review);let calls=0;
    Object.defineProperty(target==='integrity'?i:r,'reviewerPrincipal',{enumerable:true,get(){calls++;return'e';}});
    reject(()=>verifyDictionaryPosNotationRevisions(pack,i,r));assert.equal(calls,0);
  }
  for(const value of [null,42,[],false,'review'])reject(()=>verifyDictionaryPosNotationRevisions(pack,integrity,value));
});

test('editing both metadata and externally supplied root never creates a fifth authority',()=>{
  const p=clone(pack);p.entries[0].after.meaning='n. 自行改写';p.entries[0].afterSha256=hash(p.entries[0].after);
  const i={...integrity,semanticSha256:hash(p)};reject(()=>verifyDictionaryPosNotationRevisions(p,i,review));
});

test('a copied, cloned, prototype-mimicked or serialized verified pack has no private brand',()=>{
  const v=verified();
  for(const forged of [clone(v),JSON.parse(JSON.stringify(v)),{...v},Object.create(v)])
    reject(()=>applyDictionaryPosNotationRevisions(records(),forged));
});

const recordMutations=[
  ['missing target',r=>r.pop()],['duplicate target',r=>r.push(clone(r[0]))],
  ['duplicate unlisted term',r=>r.push({id:123,term:'headdress'})],
  ['unknown term at target id',r=>r[0].term='other'],['foreign id at target term',r=>r[0].id=123],
  ['modified lexical Chinese',r=>r[0].meaning='a. 新释义'],['changed original marker',r=>r[0].meaning='n. 饰头巾, 头式'],
  ['removed valid plural',r=>r[0].forms=[]],['changed seed',r=>r[1].seed.rank++],
  ['new historical variant',r=>r[0].variants=[]],['extra target field',r=>r[0].ignored=true],
  ['partly already applied',r=>r[0]=clone(pack.entries[0].after)],
  ['unlisted id missing',r=>r.push({term:'other'})],['unlisted term missing',r=>r.push({id:999})],
  ['unlisted malformed identity',r=>r.push({id:NaN,term:'other'})]
];
for(const[label,mutate]of recordMutations)test(`reject all-input apply atomically: ${label}`,()=>{
  const input=records();mutate(input);const snapshot=JSON.stringify(input);
  reject(()=>applyDictionaryPosNotationRevisions(input,verified()));assert.equal(JSON.stringify(input),snapshot);
});

test('even the final unlisted record is JSON-validated before any replacement or hidden execution',()=>{
  const input=records(),unlisted={id:999,term:'other'};let calls=0;
  Object.defineProperty(unlisted,'meaning',{enumerable:true,get(){calls++;return 'hidden';}});input.push(unlisted);
  const originals=input.slice(0,3);reject(()=>applyDictionaryPosNotationRevisions(input,verified()));assert.equal(calls,0);
  for(let index=0;index<3;index++)assert.equal(input[index],originals[index]);
});

test('canonical arrays cannot bypass whole-input checks with hidden iterators or sparse slots',()=>{
  for(const modify of [r=>{r[Symbol.iterator]=function*(){};},r=>{r.map=()=>[];},r=>{delete r[1];},r=>{r.extra=true;}]){
    const input=records();modify(input);reject(()=>applyDictionaryPosNotationRevisions(input,verified()));
  }
});

for(const where of ['ledger','ledger-nested','integrity','review','review-nested','canonical-array','canonical-record','canonical-nested'])
  test(`Proxy rejected before every trap or data read: ${where}`,()=>{
    const p=clone(pack),i=clone(integrity),r=clone(review),input=records();let traps=0;
    const wrap=value=>new Proxy(value,{get(){traps++;throw new Error('get trap ran');},
      ownKeys(){traps++;throw new Error('ownKeys trap ran');},getPrototypeOf(){traps++;throw new Error('prototype trap ran');},
      getOwnPropertyDescriptor(){traps++;throw new Error('descriptor trap ran');}});
    if(where==='ledger')reject(()=>validateDictionaryPosNotationRevisions(wrap(p)));
    else if(where==='ledger-nested'){p.entries[0].before.seed=wrap(p.entries[0].before.seed);reject(()=>validateDictionaryPosNotationRevisions(p));}
    else if(where==='integrity')reject(()=>verifyDictionaryPosNotationRevisions(p,wrap(i),r));
    else if(where==='review')reject(()=>verifyDictionaryPosNotationRevisions(p,i,wrap(r)));
    else if(where==='review-nested'){r.perTerm[0].after=wrap(r.perTerm[0].after);reject(()=>verifyDictionaryPosNotationRevisions(p,i,r));}
    else if(where==='canonical-array')reject(()=>applyDictionaryPosNotationRevisions(wrap(input),verified()));
    else if(where==='canonical-record'){input[0]=wrap(input[0]);reject(()=>applyDictionaryPosNotationRevisions(input,verified()));}
    else{input.push({id:999,term:'other',data:wrap({value:'hidden'})});reject(()=>applyDictionaryPosNotationRevisions(input,verified()));}
    assert.equal(traps,0);
  });

test('revoked proxies fail with the contract error before any native prototype exception',()=>{
  for(const make of [()=>({}),()=>[]]){
    const {proxy,revoke}=Proxy.revocable(make(),{});revoke();
    reject(()=>validateDictionaryPosNotationRevisions(proxy));
    reject(()=>applyDictionaryPosNotationRevisions(proxy,verified()));
  }
});

test('dynamic unlisted-slot substitution between validation and application is impossible',()=>{
  const input=[...records(),{id:999,term:'untouched',meaning:'unchanged'}];let reads=0;
  const poison={id:999,term:'UNREVIEWED-INJECTED',meaning:'not in the validated input'};
  const proxy=new Proxy(input,{get(target,key,receiver){if(key==='3'&&++reads>=2)return poison;return Reflect.get(target,key,receiver);}});
  reject(()=>applyDictionaryPosNotationRevisions(proxy,verified()));assert.equal(reads,0);
  assert.equal(input[3].term,'untouched');
});
