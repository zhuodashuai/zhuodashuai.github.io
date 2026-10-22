// Author's pure synthetic/adversarial checks. No source writes or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifySemanticRevisionBundle,applySemanticRevisionInMemory,snapshotSemanticJSON,SEMANTIC_AUTHORITY_IDS,SEMANTIC_RUNTIME_SOURCE,SEMANTIC_RUNTIME_SOURCE_KEY,SEMANTIC_SOURCE_REVISION_ID,SEMANTIC_BASE_VERSION,SEMANTIC_REVISION_PROOF_FILES} from '../lib/dictionary-semantic-revisions.mjs';
import {getSemanticAuthority} from '../lib/dictionary-semantic-authorities.mjs';
import {readDictionaryNamespace} from '../lib/dictionary-source-lineage.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
const ID='semantic-common-five-0001',read=file=>fs.readFileSync(file,'utf8');
const SOURCE=ROOT+'/tooling/dictionary/source-revisions/';
const proofs={candidateText:read(SOURCE+'semantic-common-five-0001.candidate.json'),reviewText:read(SOURCE+'semantic-common-five-0001.language-review.json'),sourceManifestText:read(SOURCE+'baseline-5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432.manifest.json'),runtimeProposalText:read(SOURCE+'semantic-common-five-0001.runtime-proposal.json'),runtimeReviewText:read(SOURCE+'semantic-common-five-0001.runtime-review.json'),runtimeNoticeText:read(SOURCE+'semantic-common-five-0001.notice-draft.html')};
const verify=()=>verifySemanticRevisionBundle(ID,proofs),clone=x=>structuredClone(x);

test('static authority is finite, deeply immutable, and unknown bundles cannot register reviewers',()=>{
 assert.deepEqual(SEMANTIC_AUTHORITY_IDS,[ID]);const a=getSemanticAuthority(ID);assert(Object.isFrozen(a)&&Object.isFrozen(a.targets)&&Object.isFrozen(a.targets[0]));
 assert.throws(()=>{a.reviewer='e';});assert.throws(()=>{a.targets.push({term:'other'});});
 for(const id of ['unknown','semantic-common-five-0002','__proto__',{},null,undefined])assert.throws(()=>getSemanticAuthority(id));
 assert.throws(()=>verifySemanticRevisionBundle('future-common-ten',proofs));
});
test('exact existing independent C receipt verifies only the five bound complete records and pairs',()=>{
 const result=verify();assert.equal(result.entries.length,5);assert.deepEqual(result.entries.map(row=>row.term),['affordable','discretionary','download','competitiveness','revitalization']);
 assert.equal(result.originalIndependentLanguageReceipt.reviewerPrincipal,'c');assert.equal(result.originalIndependentLanguageReceipt.authorPrincipal,'root');
 assert.equal(result.originalIndependentLanguageReceipt.scopeConclusions.sourceApplied,0);assert.equal(result.scope.languageOpinionStillConditional,true);assert.equal(result.scope.noticeCreated,false);assert.equal(result.scope.coverageAdded,0);
 assert.equal(result.originalCandidate.entries[0].completeAfterSourceRecordIndependentlyReviewed,false);assert(Object.isFrozen(result.entries[0].before.seed)&&Object.isFrozen(result.entries[0].after));
 assert.throws(()=>{result.entries[0].after.meaning='changed';});
});
for(const[label,file,mutate]of [
 ['candidate author self-sign','candidateText',x=>{x.authorPrincipal='c';}],['source POS','candidateText',x=>{x.entries[0].afterCandidate.partOfSpeech='noun';}],
 ['source meaning','candidateText',x=>{x.entries[0].afterCandidate.meaning='fake';}],['source attribution','candidateText',x=>{x.entries[0].afterCandidate.source='mit';}],
 ['immutable ID','candidateText',x=>{x.entries[0].afterCandidate.id++;}],['valid alias','candidateText',x=>{x.entries[2].afterCandidate.forms.pop();}],
 ['seed','candidateText',x=>{x.entries[0].afterCandidate.seed.workbook=false;}],['unknown key','candidateText',x=>{x.entries[0].afterCandidate.extra=true;}],
 ['raw legacy loss','candidateText',x=>{x.entries[0].before.variants=[];}],['legacy reactivation','candidateText',x=>{x.entries[0].afterCandidate.variants=x.entries[0].before.variants;}],
 ['wrong variant disposition','candidateText',x=>{x.entries[0].preservedTechnicalVariants=x.entries[0].quarantinedActiveVariants;}],['old hold loss','candidateText',x=>{x.entries[0].retainedHolds=[];}],
 ['English pair','candidateText',x=>{x.entries[0].pair[3]='An unrelated English sentence is here.';}],['Chinese pair','candidateText',x=>{x.entries[0].pair[4]='wrong';}],
 ['pair hash','candidateText',x=>{x.entries[0].pairSha256='0'.repeat(64);}],['extra target','candidateText',x=>{x.entries.push(clone(x.entries[0]));}],
 ['missing target','candidateText',x=>{x.entries.pop();}],['unreviewed after relabel','candidateText',x=>{x.entries[0].completeAfterSourceRecordIndependentlyReviewed=true;}],
 ['invented live status','candidateText',x=>{x.published=true;}],['uncreated notice relabel','candidateText',x=>{x.proposedSourceDescriptor.noticeNotCreatedOrPublishedYet=false;}],
 ['receipt self review','reviewText',x=>{x.reviewerPrincipal='root';}],['receipt arbitrary reviewer','reviewText',x=>{x.reviewerPrincipal='another-reviewer';}],
 ['receipt incomplete','reviewText',x=>{x.complete=false;}],['receipt unreviewed decision','reviewText',x=>{x.entries[0].decision='not-reviewed';}],
 ['receipt false admission','reviewText',x=>{x.entries[0].exampleAdmitted=true;}],['receipt source binding','reviewText',x=>{x.entries[0].beforeSha256='f'.repeat(64);}],
 ['receipt other pair','reviewText',x=>{x.entries[0].wholeFiveCellPair[2]='wrong';}],['manifest wrong version','sourceManifestText',x=>{x.version='f'.repeat(64);}],
 ['manifest wrong counts','sourceManifestText',x=>{x.counts.records--; }]
])test('finite raw proof rejects '+label,()=>{const x={...proofs},parsed=JSON.parse(x[file]);mutate(parsed);x[file]=JSON.stringify(parsed);assert.throws(()=>verifySemanticRevisionBundle(ID,x));});
test('raw JSON byte pins reject even EOL/space/BOM-only changes, not just semantics',()=>{
 for(const key of Object.keys(proofs))for(const suffix of [' ','\n','\r\n'])assert.throws(()=>verifySemanticRevisionBundle(ID,{...proofs,[key]:proofs[key]+suffix}));
 assert.throws(()=>verifySemanticRevisionBundle(ID,{...proofs,candidateText:'\ufeff'+proofs.candidateText}));
});
test('proof field shape rejects extra/absent fields and object-to-string coercion',()=>{
 for(const x of [{...proofs,authority:'c'},Object.fromEntries(Object.entries(proofs).slice(1)),{...proofs,candidateText:{toString(){throw Error('executed');}}},{...proofs,reviewText:Buffer.from(proofs.reviewText)}])assert.throws(()=>verifySemanticRevisionBundle(ID,x));
 let calls=0;const p={...proofs};Object.defineProperty(p,'candidateText',{get(){calls++;return proofs.candidateText;},enumerable:true});assert.throws(()=>verifySemanticRevisionBundle(ID,p));assert.equal(calls,0);
});
test('snapshot clones JSON without freezing or aliasing caller objects',()=>{
 const x={a:[{b:'value'}],n:2},y=snapshotSemanticJSON(x);assert.deepEqual(y,x);assert.notEqual(y,x);assert.notEqual(y.a,x.a);assert.notEqual(y.a[0],x.a[0]);assert.equal(Object.isFrozen(x.a[0]),false);y.a[0].b='different';assert.equal(x.a[0].b,'value');
});
for(const[label,value]of [['undefined',undefined],['function',()=>{}],['symbol',Symbol('x')],['bigint',1n],['NaN',NaN],['Infinity',Infinity],['negative zero',-0],['Date',new Date(0)],['Map',new Map()],['Set',new Set()],['Buffer',Buffer.from('x')],['typedarray',new Uint8Array([1])],['nullproto',Object.create(null)]])test('nonJSON rejected '+label,()=>assert.throws(()=>snapshotSemanticJSON(value)));
test('cycles, symbol/nonenumerable/accessor properties, sparse/decorated arrays and array prototype overrides reject',()=>{
 const cyc={};cyc.next=cyc;const arr=[];arr.push(arr);
 const symbol={a:1,[Symbol('x')]:2},hidden={};Object.defineProperty(hidden,'x',{value:1});
 const decorated=[1];decorated.map=()=>[];const iterator=[1];iterator[Symbol.iterator]=function*(){};const inherited=[1];Object.setPrototypeOf(inherited,{...Array.prototype});
 for(const x of [cyc,arr,symbol,hidden,Array(1),decorated,iterator,inherited,JSON.parse('{"__proto__":{}}'),{constructor:'x'}])assert.throws(()=>snapshotSemanticJSON(x));
 let calls=0;const accessor={};Object.defineProperty(accessor,'x',{get(){calls++;return 1;},enumerable:true});assert.throws(()=>snapshotSemanticJSON(accessor));assert.equal(calls,0);
});
test('Proxy and revoked Proxy reject at every depth before any trap',()=>{
 let traps=0;const handler={get(){traps++;throw Error('get');},ownKeys(){traps++;throw Error('ownKeys');},getPrototypeOf(){traps++;throw Error('proto');},getOwnPropertyDescriptor(){traps++;throw Error('descriptor');}};
 for(const target of [{},[],{x:1},[1],function(){}]){const proxy=new Proxy(target,handler);for(const x of [proxy,{nested:proxy},[proxy],{a:[{x:proxy}]}])assert.throws(()=>snapshotSemanticJSON(x));}
 const revoked=Proxy.revocable({},{});revoked.revoke();assert.throws(()=>snapshotSemanticJSON(revoked.proxy));assert.equal(traps,0);
 const p=new Proxy(proofs,handler);assert.throws(()=>verifySemanticRevisionBundle(ID,p));assert.equal(traps,0);
});
test('caller toJSON/map/iterator are never used as evidence serializers or source enumerators',()=>{
 let calls=0;const x={toJSON(){calls++;return {};}};assert.throws(()=>snapshotSemanticJSON(x));const a=[1];a.map=()=>{calls++;return [];};assert.throws(()=>snapshotSemanticJSON(a));const b=[1];b[Symbol.iterator]=function*(){calls++;};assert.throws(()=>snapshotSemanticJSON(b));assert.equal(calls,0);
});
test('forged, copied and proxied verified objects cannot create a private capability',()=>{
 const genuine=verify();for(const x of [{},JSON.parse(JSON.stringify(genuine)),{...genuine},new Proxy(genuine,{})])assert.throws(()=>applySemanticRevisionInMemory({},x),/private verified/);
});
test('a real capability is consumed after one apply attempt, including a failed dataset attempt',()=>{
 const genuine=verify();assert.throws(()=>applySemanticRevisionInMemory({},genuine),/field set/);assert.throws(()=>applySemanticRevisionInMemory({},genuine),/single-use/);
});
test('canonical/English dataset accepts only descriptor-first JSON before count/hash checks',()=>{
 let calls=0;const x={dictionaryVersion:getSemanticAuthority(ID).dictionary.version,records:[],englishKeys:[]};Object.defineProperty(x,'records',{get(){calls++;return [];},enumerable:true});assert.throws(()=>applySemanticRevisionInMemory(x,verify()));assert.equal(calls,0);
 for(const records of [new Proxy([],{}),Object.assign([],{map(){calls++;return [];}}),Object.assign([],{[Symbol.iterator]:function*(){calls++;}})])assert.throws(()=>applySemanticRevisionInMemory({dictionaryVersion:'x',records,englishKeys:[]},verify()));assert.equal(calls,0);
});
test('synthetic/version-only baselines cannot claim actual102609 source authority',()=>{
 const version=getSemanticAuthority(ID).dictionary.version;for(const x of [{dictionaryVersion:version,records:[],englishKeys:[]},{dictionaryVersion:'f'.repeat(64),records:[],englishKeys:[]},{dictionaryVersion:version,records:[],englishKeys:[],extra:true}])assert.throws(()=>applySemanticRevisionInMemory(x,verify()));
});

test('repo proof paths are finite relative names and baseline is archived not mutable active',()=>{
 assert.equal(SEMANTIC_SOURCE_REVISION_ID,ID);assert.equal(SEMANTIC_BASE_VERSION,getSemanticAuthority(ID).dictionary.version);
 assert.deepEqual(Object.keys(SEMANTIC_REVISION_PROOF_FILES).sort(),Object.keys(proofs).sort());
 assert(SEMANTIC_REVISION_PROOF_FILES.sourceManifestText.startsWith('baseline-5c82'));
 for(const[key,file]of Object.entries(SEMANTIC_REVISION_PROOF_FILES)){assert(!path.isAbsolute(file)&&!file.includes('..')&&!file.includes('/')&&!file.includes('\\'));assert.equal(read(SOURCE+file),proofs[key]);}
 assert(Object.isFrozen(SEMANTIC_REVISION_PROOF_FILES));assert.throws(()=>{SEMANTIC_REVISION_PROOF_FILES.reviewText='other';});
});
test('short runtime source is separately reviewed while original long descriptor and draft scopes stay historical',()=>{
 const v=verify();assert.equal(SEMANTIC_RUNTIME_SOURCE_KEY,'semantic-editorial');assert.deepEqual(Object.keys(SEMANTIC_RUNTIME_SOURCE).sort(),['license','name','url']);
 assert.deepEqual(v.source,SEMANTIC_RUNTIME_SOURCE);assert.equal(v.source.license.length,66);assert(v.originalCandidate.proposedSourceDescriptor.license.length>200);
 assert.equal(v.originalCandidate.proposedSourceDescriptor.noticeNotCreatedOrPublishedYet,true);assert.equal(v.originalIndependentLanguageReceipt.scopeConclusions.sourceApplied,0);
 assert.equal(v.originalIndependentRuntimeReview.authorPrincipal,'e');assert.equal(v.originalIndependentRuntimeReview.reviewerPrincipal,'c');
 assert.equal(v.originalIndependentRuntimeReview.scope.descriptorInstalled,false);assert.equal(v.originalRuntimeProposal.draftStatus.noticePublished,false);
 assert.equal(v.originalNoticeDraftText,proofs.runtimeNoticeText);assert.equal(v.runtimeProposalSha256,'e5213e9251b57909d8167bcb1041ac8a560600fef4b16857d2c90d92ea78b7f3');
 assert.equal(v.runtimeReviewSha256,'056fe3b41602c8642a0f92100ee577aab2396194d836b2124fcec8c542a243ec');
 assert(Object.isFrozen(SEMANTIC_RUNTIME_SOURCE)&&Object.isFrozen(v.originalRuntimeProposal.runtimeDescriptor));assert.throws(()=>{SEMANTIC_RUNTIME_SOURCE.license='changed';});
});
for(const[label,key,mutate]of[
 ['unreviewed short licence','runtimeProposalText',p=>{p.runtimeDescriptor.license='Unreviewed rights';}],
 ['extra runtime id','runtimeProposalText',p=>{p.runtimeDescriptor.id='semantic-editorial';}],
 ['long original runtime licence','runtimeProposalText',p=>{p.runtimeDescriptor.license=JSON.parse(proofs.candidateText).proposedSourceDescriptor.license;}],
 ['runtime notice marked live','runtimeProposalText',p=>{p.draftStatus.noticePublished=true;}],
 ['runtime source arbitrary URL','runtimeProposalText',p=>{p.runtimeDescriptor.url='https://example.org/';}],
 ['runtime swapped candidate binding','runtimeProposalText',p=>{p.scope.candidate.sha256='f'.repeat(64);}],
 ['runtime self review','runtimeReviewText',p=>{p.reviewerPrincipal='e';}],
 ['runtime arbitrary principal','runtimeReviewText',p=>{p.reviewerPrincipal='new-reviewer';}],
 ['runtime incomplete review','runtimeReviewText',p=>{p.complete=false;}],
 ['runtime changed candidate reviewed','runtimeReviewText',p=>{p.inputs[2].sha256='0'.repeat(64);}],
 ['runtime proof absent','runtimeReviewText',p=>{p.inputs=[];}],
 ['runtime falsely installed','runtimeReviewText',p=>{p.scope.descriptorInstalled=true;}]
])test('separate runtime authority rejects '+label,()=>{const p={...proofs},value=JSON.parse(p[key]);mutate(value);p[key]=JSON.stringify(value);assert.throws(()=>verifySemanticRevisionBundle(ID,p));});
test('exact notice text cannot be swapped, truncated, rewritten or replaced by JSON metadata',()=>{
 for(const text of ['',proofs.runtimeNoticeText.slice(1),proofs.runtimeNoticeText.replace('尚未实施、入库或发布','已经发布'),JSON.stringify({published:true})])assert.throws(()=>verifySemanticRevisionBundle(ID,{...proofs,runtimeNoticeText:text}));
 for(const key of ['runtimeProposalText','runtimeReviewText','runtimeNoticeText']){const p={...proofs};delete p[key];assert.throws(()=>verifySemanticRevisionBundle(ID,p));}
});
test('new proof fields reject accessors and nested Proxy values before side effects',()=>{
 let calls=0;for(const key of ['runtimeProposalText','runtimeReviewText','runtimeNoticeText']){
  const p={...proofs};Object.defineProperty(p,key,{get(){calls++;return proofs[key];},enumerable:true});assert.throws(()=>verifySemanticRevisionBundle(ID,p));
  assert.throws(()=>verifySemanticRevisionBundle(ID,{...proofs,[key]:new Proxy({},{get(){calls++;return ''},getPrototypeOf(){calls++;return Object.prototype}})}));
 }assert.equal(calls,0);
});
test('original proof files remain raw byte pins, not normalized or relabelled CI derivatives',()=>{
 const sha=text=>createHash('sha256').update(text).digest('hex'),a=getSemanticAuthority(ID);
 for(const[key,pin]of[['candidateText',a.candidate],['reviewText',a.review],['runtimeProposalText',a.runtime.proposal],['runtimeReviewText',a.runtime.review],['runtimeNoticeText',a.runtime.notice]]){
  assert.equal(Buffer.byteLength(proofs[key]),pin.bytes);assert.equal(sha(proofs[key]),pin.sha256);
 }
 assert.equal(JSON.parse(proofs.reviewText).stage,'future-exact-five-candidate-source-and-whole-pair-independent-language-review-not-implementation-or-reentry');
});

test('actual archived5c82 namespace remains exact5 edits/102604 full records and all140858 English rows unchanged in memory',async()=>{
 const manifest=JSON.parse(proofs.sourceManifestText);
 const baseline=await readDictionaryNamespace(manifest,ROOT+'/vocab/data/expanded-dictionary');
 const rows=[...baseline.records.values()],englishKeys=[...baseline.keys];
 assert.equal(rows.length,102609);assert(Array.isArray(englishKeys));assert.equal(englishKeys.length,140858);
 const dataset=clone({dictionaryVersion:manifest.version,records:rows,englishKeys});
 const originalSerialized=JSON.stringify(dataset),capability=verify(),result=applySemanticRevisionInMemory(dataset,capability);
 const targets=new Map(capability.entries.map(row=>[row.term,row]));let changed=0,unchanged=0;
 for(let i=0;i<dataset.records.length;i++){
  const row=dataset.records[i],actual=result.records[i],target=targets.get(row.term);
  if(target){changed++;assert.deepEqual(actual,target.after);}else{unchanged++;assert.deepEqual(actual,row);}
  assert.notEqual(actual,row);assert.equal(Object.isFrozen(row),false);assert(Object.isFrozen(actual));
 }
 assert.equal(changed,5);assert.equal(unchanged,102604);assert.deepEqual(result.englishKeys,dataset.englishKeys);assert.notEqual(result.englishKeys,dataset.englishKeys);
 assert.equal(JSON.stringify(dataset),originalSerialized);assert.equal(result.report.changedRecords,5);assert.equal(result.report.unchangedRecords,102604);
 assert.equal(result.report.runtimeSource.descriptor.license.length,66);assert.equal(result.report.runtimeSource.noticePublishedClaim,false);
 assert.equal(result.report.actualNamespaceGenerated,false);assert.equal(result.report.coverageAdded,0);assert.equal(result.report.published,false);
 assert.deepEqual(result.report.chinesePostings.requiredTargetIds,capability.entries.map(row=>row.id));assert.equal(result.report.chinesePostings.rebuilt,false);
 assert.throws(()=>applySemanticRevisionInMemory(dataset,capability),/single-use/);
 for(const mutation of[
  d=>{d.records.find(row=>!targets.has(row.term)).meaning+=' 非目标变更';},
  d=>{d.englishKeys[0][1][0].id++;},
  d=>{d.records[d.records.findIndex(row=>row.term==='affordable')]=clone(targets.get('affordable').after);}
 ]){
  const bad=clone(dataset);mutation(bad);const v=verify();assert.throws(()=>applySemanticRevisionInMemory(bad,v));assert.throws(()=>applySemanticRevisionInMemory(dataset,v),/single-use/);
 }
});
