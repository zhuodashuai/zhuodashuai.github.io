import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildMemberDictionary} from '../scripts/build-member-dictionary.mjs';
import {loadD29Fixture,D29_BUILD,assertD29MetadataTransition,assertD29ProtectedBytes,loadD29ReleaseMetadata} from './d29-regression-fixture.mjs';

// Install/run only after the normal build has been performed and D29_BUILD
// has been filled from its actual saved manifest, queue and provenance bytes.
const f=await loadD29Fixture();
test('D29 adds 287 pairs and preserves all 85,637 old whole entries',()=>{
 assert(f.before instanceof Map);assert.equal(f.before.size,85637);
 assert.equal(f.after.size-f.before.size,287);assert.equal(f.pairByTerm.size,287);
 assert.equal(f.afterPairs,87313);assert.equal(f.namespaceFilesVerified,512);
 assert.deepEqual(f.namespaceDescriptorCounts,{unchangedSource:256,unchangedD28Examples:256,actualD29Examples:256});
 for(const[term,row]of f.before)assert.deepEqual(f.after.get(term),row);
});
test('D29 binds three exact independently reviewed cohorts and every canonical runtime lookup',()=>{
 assert.deepEqual(f.cohortCounts,[153,132,2]);assert.equal(f.canonicalChecks,287);
 assert.equal(f.representatives.length,8);assert.equal(f.queue.all395ExactPriorReasonBindings.length,395);
 assert.deepEqual(f.principalCounts,{'c -> e2':153,'e -> root':134});
});
test('D29 preserves 402 source objects, 115 deferrals and both superseded original pairs',()=>{
 assert.equal(f.queue.all402CompleteOriginalAuthorObjects.length,402);
 assert.equal(f.queue.entries.length+f.queue.deferred.length,402);
 assert.equal(f.queue.deferred.length,115);
 assert.deepEqual([f.queue.originalAuthorDeferrals.c.length,f.queue.originalAuthorDeferrals.e.length],[39,61]);
 assert.deepEqual([f.queue.originalPrecisionOrPairHolds.c8.length,f.queue.originalPrecisionOrPairHolds.e7Source.length],[8,7]);
 for(const term of ['such and such','workgroup','scaremonger','uncultured','sophist','supergiant','stablemate','deep freeze'])assert(f.queue.deferred.some(r=>r.term===term));
 assert.deepEqual(f.queue.original2RejectedPairsAndDecisions.map(r=>r.term).sort(),['police action','the real thing']);
});
test('D29 admission evidence preserves scope boundaries after a real build',()=>{
 for(const doc of [f.queue,f.provenance]){assert.equal(doc.examplesBuilt,false);assert.equal(doc.published,false);assert.equal(doc.coverageAdded,0);}
 assert.equal(f.provenance.newLanguageDecisions,0);assert.equal(f.provenance.sourceChanges,0);assert.equal(f.provenance.formsChanges,0);
 assert.equal(f.provenance.baselineSourceFiles.length,540);
 assert.equal(f.queue.sourceChanged,false);assert.equal(f.queue.formsChanged,false);
});

test('D29 permits only the three LF rules and two actual common-review pointer changes',async()=>{
 assert.equal(f.metadataTransition.appendedRuleCount,3);
 assert.deepEqual(f.metadataTransition.commonFields,['dictionaryExamplesVersion','dictionaryExamplesManifestSha256']);
 const {attributesRaw,commonRaw}=await loadD29ReleaseMetadata();
 assert.deepEqual(assertD29MetadataTransition(attributesRaw,commonRaw,D29_BUILD),f.metadataTransition);
 // These are substantive boundary changes, not formatter-shaped expectations.
 assert.throws(()=>assertD29MetadataTransition(Buffer.concat([attributesRaw,Buffer.from('# unauthorized fourth line\n')]),commonRaw,D29_BUILD));
 const changedPrefix=Buffer.from(attributesRaw);changedPrefix[0]^=1;
 assert.throws(()=>assertD29MetadataTransition(changedPrefix,commonRaw,D29_BUILD));
 const alteredPolicy=commonRaw.toString().replace('"reviewedAt": "2026-10-20"','"reviewedAt": "2026-10-21"');
 assert.notEqual(alteredPolicy,commonRaw.toString());
 assert.throws(()=>assertD29MetadataTransition(attributesRaw,Buffer.from(alteredPolicy),D29_BUILD));
 const wrongPointer=commonRaw.toString().replace(D29_BUILD.version,'0'.repeat(64));
 assert.notEqual(wrongPointer,commonRaw.toString());
 assert.throws(()=>assertD29MetadataTransition(attributesRaw,Buffer.from(wrongPointer),D29_BUILD));
});
test('D29 rejects any protected content outside the exact observed raw transports',async()=>{
 for(const file of ['vocab/data/owner-wordbook.json','vocab/data/book-passages.json','vocab/data/ecdict-core.json','vocab/data/member-dictionary.json']){
  const raw=await fs.readFile(new URL('../../'+file,import.meta.url));assertD29ProtectedBytes(file,raw);
  const wrongBytes=Buffer.from(raw);wrongBytes[0]^=1;assert.throws(()=>assertD29ProtectedBytes(file,wrongBytes));
  assert.throws(()=>assertD29ProtectedBytes(file,Buffer.concat([raw,Buffer.from('\n')])));
 }
 assert.throws(()=>assertD29ProtectedBytes('vocab/data/unspecified.json',Buffer.from('{}')));
});

test('D29 derives the CI member transport from exact inputs; only two provenance hashes differ',async()=>{
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const forms={};
 for(const name of ['ecdict-core','owner-wordbook']){
  const file='vocab/data/'+name+'.json',raw=await fs.readFile(new URL('../../'+file,import.meta.url));
  assertD29ProtectedBytes(file,raw);
  // Reconstruct both specific known input transports, then verify their exact
  // raw tuples BEFORE building. This is not a normalized acceptance boundary.
  const lf=Buffer.from(raw.toString('utf8').replace(/\r\n/gu,'\n'));
  const windows=Buffer.from(lf.toString('utf8').replace(/\n/gu,'\r\n'));
  const pins=name==='ecdict-core'
   ? [[1963099,'eb430465c024ce3fd6c1ace668eb437135ed8b52ecffcacf8be05b49e070f5f6'],[1963100,'e226936f68144d47c50529607f994287ac9919870681567bfd61d46e38e5d302']]
   : [[3022710,'4c3fb9ae6d0e0ec9cb85a0d989c677a6d7942e72d0468d73ad2dc30a1785fa4c'],[3090428,'4063f5bdeccd6b21a38aa45a55eb40e91596c4800b8bc17f5955923c4be9db0e']];
  assert.deepEqual([lf.length,sha(lf)],pins[0]);assert.deepEqual([windows.length,sha(windows)],pins[1]);
  assertD29ProtectedBytes(file,lf);assertD29ProtectedBytes(file,windows);
  forms[name]={lf,windows};
 }
 const build=(core,owner)=>Buffer.from(JSON.stringify(buildMemberDictionary(JSON.parse(core),JSON.parse(owner),{
  coreFileSha256:sha(core),publicFileSha256:sha(owner)
 }))+'\n');
 const original=build(forms['ecdict-core'].windows,forms['owner-wordbook'].windows);
 const ci=build(forms['ecdict-core'].lf,forms['owner-wordbook'].lf);
 assert.deepEqual(assertD29ProtectedBytes('vocab/data/member-dictionary.json',original),{
  bytes:843625,sha256:'932408e43361be26db2308062f1e6c818ef02d8dc2e1a131d49b77cb3229ef21'});
 assert.deepEqual(assertD29ProtectedBytes('vocab/data/member-dictionary.json',ci),{
  bytes:843625,sha256:'efaf0d86965569a358d8e0530b259b4f2c5236a17af9483b098f2db0f9a632f0'});
 const old=JSON.parse(original),restored=JSON.parse(ci);
 for(const key of ['core','published']){
  assert.notEqual(restored.source[key].fileSha256,old.source[key].fileSha256);
  restored.source[key].fileSha256=old.source[key].fileSha256;
 }
 // Restoring precisely these two fields recovers EVERY original output byte,
 // including all head/POS/gloss/form/alias rows, counts and source identities.
 assert.deepEqual(Buffer.from(JSON.stringify(restored)+'\n'),original);
 for(const mutate of [
  doc=>{doc.core[0][2]+='错误释义';},
  doc=>{doc.published[0][1]='verb';},
  doc=>{doc.counts.core++;},
  doc=>{doc.source.core.name='different';},
  doc=>{doc.extra=true;}
 ]){
  const changed=JSON.parse(ci);mutate(changed);
  assert.notDeepEqual(changed,JSON.parse(ci));
  assert.throws(()=>assertD29ProtectedBytes('vocab/data/member-dictionary.json',Buffer.from(JSON.stringify(changed)+'\n')));
 }
 // Even mixed provenance from otherwise valid transports is not registered.
 for(const raw of [build(forms['ecdict-core'].lf,forms['owner-wordbook'].windows),build(forms['ecdict-core'].windows,forms['owner-wordbook'].lf)])
  assert.throws(()=>assertD29ProtectedBytes('vocab/data/member-dictionary.json',raw));
});
