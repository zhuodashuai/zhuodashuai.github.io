import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {composePosNotationExampleSource,parsePosNotationAdmissionArgs,commitPosNotationExampleAdmission,verifyPosNotationAdmissionReceipt}
 from '../scripts/admit-pos-notation-examples.mjs';
import {exampleSourceHash,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';
const directory=new URL('../dictionary/source-revisions/',import.meta.url);
const json=async file=>JSON.parse(await readFile(new URL(file,directory)));
const pack=await json('finite-pos-notation-0001.json'),integrity=await json('finite-pos-notation-0001.integrity.json'),
 review=await json('finite-pos-notation-0001.review.json');
const admissionBytes=await readFile(new URL('finite-pos-notation-0001.admission-review.json',directory));
const sourceManifestBytes=await readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url));
const clone=value=>structuredClone(value),sha=value=>createHash('sha256').update(value).digest('hex');
const reject=fn=>assert.throws(fn,/Invalid dictionary POS notation revision:|POS3 admission not ready:/u);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('pure mapping retains exact Root five fields and existing E review without new language decisions',()=>{
 const inputs=freeze([clone(pack),clone(integrity),clone(review)]),snapshot=JSON.stringify(inputs);
 const first=composePosNotationExampleSource(...inputs),second=composePosNotationExampleSource(...inputs);
 assert.deepEqual(first,second);assert.equal(JSON.stringify(inputs),snapshot);
 assert.equal(first.source.batchId,'examples-0023-p001');assert.equal(first.source.authorship,'independent-composition');
 assert.deepEqual(first.source.entries.map(row=>row.term),['headdress','longingly','moonless']);
 assert.equal(first.review.reviewer,'AI/examples23_reviewer_e');assert.equal(first.review.independentOfAuthor,true);
 assert.deepEqual(first.review.approvedTerms,['headdress','longingly','moonless']);assert.deepEqual(first.review.issues,[]);
 assert.equal(first.review.sourceSha256,exampleSourceHash(first.source));assert.match(first.review.reviewMethod,/no new language decision/u);
 assert.equal(validateExampleReview(first.source,first.review).length,3);
 for(let index=0;index<3;index++){
  const row=first.source.entries[index],entry=pack.entries[index],cells=[row.term,row.partOfSpeech,row.meaningZh,row.en,row.zh];
  assert.deepEqual(cells,entry.unchangedConditionalRootPair.pair);
  assert.equal(sha(cells.join('\t')),entry.unchangedConditionalRootPair.pairSha256);
 }
});

test('pure mapping output cannot mutate either caller data or a later composition',()=>{
 const first=composePosNotationExampleSource(pack,integrity,review);first.source.entries[0].en='Unreviewed replacement.';
 first.review.approvedTerms.push('unknown');
 const next=composePosNotationExampleSource(pack,integrity,review);
 assert.equal(next.source.entries[0].en,pack.entries[0].unchangedConditionalRootPair.pair[3]);assert.equal(next.review.approvedTerms.length,3);
});

for(const[label,modify]of [
 ['different whole pair',p=>p.entries[0].unchangedConditionalRootPair.pair[3]='A new sentence.'],
 ['changed meaning',p=>p.entries[1].after.meaning='adv. 新释义'],
 ['wrong POS',p=>p.entries[2].after.partOfSpeech='noun'],
 ['missing target',p=>p.entries.pop()],['additional target',p=>p.entries.push(clone(p.entries[0]))],
 ['historical hold discarded',p=>p.entries[0].history.priorHolds=[]]
])test(`pure mapping rejects unauthorized ${label}`,()=>{
 const changed=clone(pack);modify(changed);reject(()=>composePosNotationExampleSource(changed,integrity,review));
});

test('wrong independent principal cannot be mechanically relabelled into the new source review',()=>{
 for(const principal of ['c','root','e2']){
  const changed=clone(review);changed.reviewerPrincipal=principal;reject(()=>composePosNotationExampleSource(pack,integrity,changed));
 }
});

test('pure mapping refuses Proxy and hidden getter authorities without executing them',()=>{
 let traps=0;const proxy=new Proxy(pack,{get(){traps++;},getPrototypeOf(){traps++;}});
 reject(()=>composePosNotationExampleSource(proxy,integrity,review));assert.equal(traps,0);
 const changed=clone(review);let calls=0;Object.defineProperty(changed,'reviewerPrincipal',{enumerable:true,get(){calls++;return'e';}});
 reject(()=>composePosNotationExampleSource(pack,integrity,changed));assert.equal(calls,0);
});

test('no CLI flag and --check are read-only; --write is explicit and alone',()=>{
 assert.deepEqual(parsePosNotationAdmissionArgs([]),{write:false});
 assert.deepEqual(parsePosNotationAdmissionArgs(['--check']),{write:false});
 assert.deepEqual(parsePosNotationAdmissionArgs(['--write']),{write:true});
});
for(const args of [['--check','--check'],['--write','--write'],['--check','--write'],['--write','--check'],
 ['--root=other'],['--authority=other'],['--help'],['--write=true'],['--check=1'],['../file'],[''],[' --write'],[null],[false],[42],['--run-label=test']])
 test(`reject unknown, duplicate or ambiguous CLI ${JSON.stringify(args)}`,()=>reject(()=>parsePosNotationAdmissionArgs(args)));

test('CLI accessors, proxies and decorated/sparse arrays cannot covertly change check to write',()=>{
 const getter=['--check'];let calls=0;Object.defineProperty(getter,'0',{get(){calls++;return'--write';},enumerable:true});
 reject(()=>parsePosNotationAdmissionArgs(getter));assert.equal(calls,0);
 const proxy=new Proxy(['--check'],{get(){calls++;return'--write';}});reject(()=>parsePosNotationAdmissionArgs(proxy));assert.equal(calls,0);
 const decorated=['--check'];decorated.extra=true;reject(()=>parsePosNotationAdmissionArgs(decorated));
 const sparse=new Array(1);reject(()=>parsePosNotationAdmissionArgs(sparse));
 const symbolic=[];symbolic[Symbol.iterator]=function*(){};reject(()=>parsePosNotationAdmissionArgs(symbolic));
 const {proxy:revoked,revoke}=Proxy.revocable([],{});revoke();reject(()=>parsePosNotationAdmissionArgs(revoked));
});

test('forged or copied plans are refused before filesystem reads or writes',async()=>{
 for(const plan of [null,{},[],{kind:'exact-pos3-admission-plan',ready:true,outputs:[]},Object.create(null)])
  await assert.rejects(commitPosNotationExampleAdmission(plan),/unverified or copied plan/u);
 let traps=0;const proxy=new Proxy({ready:true},{get(){traps++;return true;}});
 await assert.rejects(commitPosNotationExampleAdmission(proxy),/unverified or copied plan/u);assert.equal(traps,0);
});

test('real raw-pinned disk review binds actual 5c82 manifest and only finite language reentry',()=>{
 const receipt=verifyPosNotationAdmissionReceipt(admissionBytes,sourceManifestBytes,pack,integrity,review);
 assert.equal(sha(admissionBytes),'7b5b3cb13e10be6d1e9989bc0585e838a860a16ff479d71cb54dc9b12b4f11b1');
 assert.equal(receipt.actualSourceManifest.sha256,sha(sourceManifestBytes));assert.equal(receipt.actualSourceManifest.bytes,sourceManifestBytes.length);
 assert.equal(receipt.actualDictionaryVersion,'5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432');
 assert.equal(receipt.scope.importerCodeApproval,false);assert.equal(receipt.scope.exampleAdmission,0);
 assert.equal(receipt.scope.coverageAdded,0);assert.equal(receipt.scope.published,false);
 assert(Object.isFrozen(receipt));assert(Object.isFrozen(receipt.perTerm[0].priorHolds));
});

for(const[label,modify]of [
 ['source author self-review',r=>r.reviewerPrincipal='c'],['pair author self-review',r=>r.reviewerPrincipal='root'],
 ['wrong source version',r=>r.actualDictionaryVersion='9f27'.padEnd(64,'0')],
 ['semantic instead of raw manifest hash',r=>r.actualSourceManifest.sha256=sha(JSON.stringify(JSON.parse(sourceManifestBytes)))],
 ['changed whole pair',r=>r.perTerm[0].pair[3]='A different unreviewed sentence.'],
 ['changed materialized source',r=>r.perTerm[1].actualSource.meaning='adv. 不同释义'],
 ['hold removed',r=>r.perTerm[2].priorHolds=[]],['new language admission',r=>r.scope.exampleAdmission=3],
 ['claimed importer code approval',r=>r.scope.importerCodeApproval=true],
 ['claimed publication',r=>r.scope.published=true],
 ['upstream code changed',r=>r.upstreamCodeBindings[0].sha256='0'.repeat(64)],
 ['independent audit citation replaced',r=>r.upstreamAudits[0].sha256='0'.repeat(64)],
 ['duplicated target',r=>r.perTerm[1]=clone(r.perTerm[0])],['extra target',r=>r.perTerm.push(clone(r.perTerm[0]))]
])test(`raw admission authority rejects ${label}`,()=>{
 const changed=JSON.parse(admissionBytes);modify(changed);
 assert.throws(()=>verifyPosNotationAdmissionReceipt(Buffer.from(JSON.stringify(changed)),sourceManifestBytes,pack,integrity,review));
});

for(const[label,bytes]of [
 ['added LF',Buffer.concat([admissionBytes,Buffer.from('\n')])],
 ['added BOM',Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),admissionBytes])],
 ['reformatted JSON',Buffer.from(JSON.stringify(JSON.parse(admissionBytes)))],
 ['invalid UTF8',Buffer.from([255])]
])test(`raw admission evidence rejects ${label}`,()=>assert.throws(()=>verifyPosNotationAdmissionReceipt(bytes,sourceManifestBytes,pack,integrity,review)));

test('raw manifest formatting, content and BOM cannot be silently normalized to the reviewed proof',()=>{
 for(const bytes of [Buffer.concat([sourceManifestBytes,Buffer.from('\n')]),
  Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),sourceManifestBytes]),Buffer.from(JSON.stringify(JSON.parse(sourceManifestBytes))),
  Buffer.from(sourceManifestBytes.toString().replace('5c82c9c5','9f27bbc2'))])
  assert.throws(()=>verifyPosNotationAdmissionReceipt(admissionBytes,bytes,pack,integrity,review));
});

test('binary evidence does not invoke overwritten toString and Proxy wrappers cannot substitute bytes',()=>{
 const bytes=Buffer.from(admissionBytes);let calls=0;bytes.toString=()=>{calls++;throw new Error('hidden toString');};
 assert.doesNotThrow(()=>verifyPosNotationAdmissionReceipt(bytes,sourceManifestBytes,pack,integrity,review));assert.equal(calls,0);
 const proxy=new Proxy(admissionBytes,{get(){calls++;throw new Error('trap');}});
 assert.throws(()=>verifyPosNotationAdmissionReceipt(proxy,sourceManifestBytes,pack,integrity,review),/physical byte buffers/u);assert.equal(calls,0);
});
