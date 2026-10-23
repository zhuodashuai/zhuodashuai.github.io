import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadD29Fixture,D29_BUILD,assertD29MetadataTransition,assertD29ProtectedBytes} from './d29-regression-fixture.mjs';

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
 const attributesRaw=await fs.readFile(new URL('../../.gitattributes',import.meta.url));
 const commonRaw=await fs.readFile(new URL('../dictionary/chinese-related-common-examples.json',import.meta.url));
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
