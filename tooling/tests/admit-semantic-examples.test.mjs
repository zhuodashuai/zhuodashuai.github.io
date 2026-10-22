import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseSemanticAdmissionArgs,commitSemanticExampleAdmission,verifySemanticAdmissionReceipt} from '../scripts/admit-semantic-examples.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const root=new URL('../../',import.meta.url);
const receiptBytes=await readFile(new URL('tooling/dictionary/source-revisions/semantic-common-five-0001.admission-review.json',root));
// Frozen historical admission belongs to this exact raw source, never a later
// active pointer. Actual prepare separately requires the live local manifest.
const actualSourceBytes=await readFile(new URL('tooling/dictionary/source-revisions/baseline-cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644.manifest.json',root));

test('no flag and --check cannot write; one explicit --write is required',()=>{
 assert.deepEqual(parseSemanticAdmissionArgs([]),{write:false});
 assert.deepEqual(parseSemanticAdmissionArgs(['--check']),{write:false});
 assert.deepEqual(parseSemanticAdmissionArgs(['--write']),{write:true});
});
for(const args of [['--check','--write'],['--write','--check'],['--write','--write'],['--check','--check'],
 ['--write=true'],['--root=other'],['--authority=c'],[''],[' --write'],[null],[42]])
 test('ambiguous or unknown write arguments rejected: '+JSON.stringify(args),()=>assert.throws(()=>parseSemanticAdmissionArgs(args)));

test('getters, decorated arrays, revoked Proxies and iterators cannot silently request write',()=>{
 let calls=0;const getter=['--check'];Object.defineProperty(getter,'0',{get(){calls++;return'--write';},enumerable:true});
 const proxy=new Proxy(['--check'],{get(){calls++;return'--write';}});
 const decorated=['--check'];decorated.write=true;
 const symbolic=[];symbolic[Symbol.iterator]=function*(){calls++;yield'--write';};
 const revoked=Proxy.revocable([],{});revoked.revoke();
 for(const value of [getter,proxy,decorated,symbolic,revoked.proxy,new Array(1)])assert.throws(()=>parseSemanticAdmissionArgs(value));
 assert.equal(calls,0);
});

test('forged, copied and Proxy write plans fail before touching disk or invoking traps',async()=>{
 const files=['tooling/dictionary/examples/index.json','vocab/data/expanded-dictionary/manifest.json','vocab/data/dictionary-examples/manifest-v2.json'];
 const before=await Promise.all(files.map(async file=>sha(await readFile(new URL(file,root)))));
 let calls=0;const proxy=new Proxy({ready:true},{get(){calls++;return true;}});
 for(const value of [null,{},[],{kind:'exact-semantic-five-admission-plan',ready:true},proxy])await assert.rejects(commitSemanticExampleAdmission(value),/unverified or copied/u);
 assert.equal(calls,0);
 assert.deepEqual(await Promise.all(files.map(async file=>sha(await readFile(new URL(file,root))))),before);
});

test('plain reviewer strings or old conditional receipts are never actual-source admission authority',async()=>{
 const manifest=await readFile(new URL('vocab/data/expanded-dictionary/manifest.json',root));
 const historical=await readFile(new URL('tooling/dictionary/source-revisions/semantic-common-five-0001.language-review.json',root));
 for(const bytes of [historical,Buffer.from('{"reviewerPrincipal":"c","complete":true}'),Buffer.from([255])])
  assert.throws(()=>verifySemanticAdmissionReceipt(bytes,manifest));
 let calls=0;const proxy=new Proxy(historical,{get(){calls++;throw Error('trap');}});
 assert.throws(()=>verifySemanticAdmissionReceipt(proxy,manifest),/physical/u);assert.equal(calls,0);
});

test('genuine C actual-disk receipt binds exact historical manifest and all five complete pairs, not importer approval',()=>{
 assert.equal(sha(receiptBytes),'884e97084b914d8259f951efb0040e716828e6de4e66d06326256182b6b43638');
 assert.equal(sha(actualSourceBytes),'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f');
 const receipt=verifySemanticAdmissionReceipt(receiptBytes,actualSourceBytes);
 assert.equal(receipt.reviewerPrincipal,'c');assert.equal(receipt.sourceAuthorPrincipal,'root');
 assert.equal(receipt.pairAuthorPrincipal,'root');assert.equal(receipt.perTerm.length,5);
 assert.equal(receipt.perTerm.reduce((sum,row)=>sum+row.priorHolds.length,0),9);
 assert.equal(receipt.scope.importerCodeApproval,false);assert.equal(receipt.scope.exampleAdmission,0);assert.equal(receipt.scope.coverageAdded,0);
 assert(Object.isFrozen(receipt));assert(Object.isFrozen(receipt.perTerm[0].actualSource));
});
for(const[label,mutate]of[
 ['reviewer selfapproval',r=>r.reviewerPrincipal='root'],['wrongsource',r=>r.actualDictionaryVersion='0'.repeat(64)],
 ['new sentence',r=>r.perTerm[0].pair[3]='An unreviewed sentence.'],['newtranslation',r=>r.perTerm[0].pair[4]='未经复核。'],
 ['changed active record',r=>r.perTerm[0].actualSource.meaning='免费的'],['missingoldholds',r=>r.perTerm[0].priorHolds=[]],
 ['changed canonical proof',r=>r.perTerm[0].canonicalPhysicalProof.sha256='0'.repeat(64)],
 ['pretend code approval',r=>r.scope.importerCodeApproval=true],['pretend coverage',r=>r.scope.coverageAdded=5],
 ['pretend publication',r=>r.scope.published=true],['extra target',r=>r.perTerm.push(r.perTerm[0])]
])test('no rewritten C receipt can register '+label,()=>{
 const changed=JSON.parse(receiptBytes);mutate(changed);assert.throws(()=>verifySemanticAdmissionReceipt(Buffer.from(JSON.stringify(changed)),actualSourceBytes));
});
test('receipt and historical manifest keep exact raw LF/BOM/formatting identity',()=>{
 for(const bytes of [Buffer.concat([receiptBytes,Buffer.from('\n')]),Buffer.concat([Buffer.from([239,187,191]),receiptBytes]),Buffer.from(JSON.stringify(JSON.parse(receiptBytes)))])
  assert.throws(()=>verifySemanticAdmissionReceipt(bytes,actualSourceBytes));
 for(const bytes of [Buffer.concat([actualSourceBytes,Buffer.from('\n')]),Buffer.concat([Buffer.from([239,187,191]),actualSourceBytes]),Buffer.from(JSON.stringify(JSON.parse(actualSourceBytes)))])
  assert.throws(()=>verifySemanticAdmissionReceipt(receiptBytes,bytes));
 const bytes=Buffer.from(receiptBytes);let calls=0;bytes.toString=()=>{calls++;throw Error('caller coercion');};
 assert.doesNotThrow(()=>verifySemanticAdmissionReceipt(bytes,actualSourceBytes));assert.equal(calls,0);
});
