// Run against the actual after-build fixture registration, never a projection.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadD30Fixture,D30_BUILD,assertD30MetadataTransition,D30_LF_RULES} from './d30-regression-fixture.mjs';
import {loadD29ReleaseMetadata} from './d29-regression-fixture.mjs';
const f=await loadD30Fixture();
test('D30 preserves85924wholeold entries and adds only214 exact heads/pairs',()=>{assert(f.before instanceof Map);assert.equal(f.before.size,85924);assert.equal(f.after.size,86138);assert.equal(f.afterPairs,87527);for(const[t,e]of f.before)assert.deepEqual(f.after.get(t),e);assert.equal(f.pairByTerm.size,214);assert.deepEqual([...f.after.keys()].filter(t=>!f.before.has(t)).sort(),[...f.pairByTerm.keys()].sort());});
test('D30 binds four exact cohorts, all543 old pack/review bytes and correct512 namespace',()=>{assert.deepEqual(f.cohortCounts,[98,83,14,19]);assert.deepEqual(f.principalCounts,{'d30_author_prepare -> d30_reviewer_role':200,'d30_author_p003 -> root':14});assert.equal(f.oldApprovedRawFilesVerified,1086);assert.equal(f.oldApprovedPrefixLength,543);assert.equal(f.newIndexLength,547);assert.equal(f.namespaceFilesVerified,512);assert.deepEqual(f.namespaceDescriptorCounts,{unchangedSource:256,unchangedD29Examples:256,actualD30Examples:256});});
test('D30 keeps259 complete dossiers,279 prior reasons and45 distinct exclusions',()=>{const c=f.queue.completeFrozenCandidate;assert.equal(c.selected.length,214);assert.equal(c.excluded.length,45);assert.equal(f.queue.all259DistinctSourceAndReasonObjects.length,259);assert.equal(f.queue.all279PriorReasonBindings.length,279);assert.equal(c.excluded.filter(e=>e.excludedCategory==='original-author-hold').length,39);assert.equal(c.excluded.filter(e=>e.excludedCategory==='independent-source-gloss-hold').length,2);assert.equal(c.excluded.filter(e=>e.excludedCategory==='additional-considered-not-selected').length,4);for(const e of c.excluded)assert(!f.after.has(e.term));for(const t of c.reserved27.terms)assert(!f.pairByTerm.has(t));});
test('D30 selects both exact separately reviewed repairs, never their superseded originals',()=>{assert.deepEqual(f.queue.original2ReplacedPairs.map(e=>e.term),['terminator','blaze out']);for(const e of f.queue.original2ReplacedPairs){const n=f.pairByTerm.get(e.term);assert(n);assert.notEqual(n.zh,e.originalPair[4]);assert.deepEqual([n.term,n.partOfSpeech,n.meaningZh,n.en],e.originalPair.slice(0,4));assert.deepEqual([n.term,n.partOfSpeech,n.meaningZh,n.en,n.zh],e.replacementProposal.completeObject.repairPair);}});
test('D30 actually replays214 canonical lookups and all14 exact overlapping queries by canonicalID/role',()=>{assert.equal(f.canonicalChecks,214);assert.equal(f.actualExampleCanonicalChecks,214);assert.equal(f.isolationQueryChecks,14);assert.equal(f.isolationCardIdentitiesUnchanged,true);assert.equal(f.unselectedParentSiblingNewPairLeaks,0);assert.equal(f.heldThreeQuartersHasNewPair,false);assert.equal(f.sourceChanged,0);assert.equal(f.formsChanged,0);});
test('D30 eight fullcards are manual literal expectations, not product-formatted expected values',()=>{assert.equal(f.representatives.length,8);for(const e of f.representatives){assert(e.display.meaning);assert(e.display.source&&e.display.license&&e.display.url);assert(e.pair.en&&e.pair.zh);assert.equal(e.visibleVariantCount,0);}});
test('D30 build registration names actual normal manifest/archive/queue/provenance bytes, not admission status',()=>{assert(D30_BUILD);for(const d of [f.queue,f.provenance]){assert.equal(d.examplesBuilt,false);assert.equal(d.published,false);assert.equal(d.coverageAdded,0);}assert.equal(f.metadataTransition.appendedRuleCount,3);assert.deepEqual(f.metadataTransition.changedCommonFields,['dictionaryExamplesVersion','dictionaryExamplesManifestSha256']);assert.equal(f.provenance.newLanguageDecisions,0);});

test('D30 rejects unrelated metadata edits and permits only three exact checkout layouts',async()=>{
 const {attributesRaw:gitPrefix,commonRaw:oldCommon}=await loadD29ReleaseMetadata();
 const common=await fs.readFile(new URL('../dictionary/chinese-related-common-examples.json',import.meta.url));
 const workingPrefix=Buffer.from(gitPrefix.toString('utf8').replace(/\n/gu,'\r\n'));
 const lf=Buffer.from(D30_LF_RULES.join('\n')+'\n'),crlf=Buffer.from(D30_LF_RULES.join('\r\n')+'\r\n');
 for(const [prefix,suffix] of [[gitPrefix,lf],[workingPrefix,lf],[workingPrefix,crlf]])
  assert.equal(assertD30MetadataTransition(Buffer.concat([prefix,suffix]),common,D30_BUILD).appendedRuleCount,3);
 for(const wrong of [Buffer.concat([gitPrefix,crlf]),Buffer.concat([workingPrefix,crlf,Buffer.from('\n')]),Buffer.concat([gitPrefix,lf,Buffer.from('# unrelated rule\n')]),gitPrefix])
  assert.throws(()=>assertD30MetadataTransition(wrong,common,D30_BUILD));
 const attrs=Buffer.concat([gitPrefix,lf]);
 for(const wrong of [oldCommon,Buffer.from(common.toString().replace('"reviewedAt": "2026-10-20"','"reviewedAt": "2026-10-21"')),Buffer.from(common.toString().replace(D30_BUILD.version,'0'.repeat(64))),Buffer.from(common.toString().replace('{','{"unexpected":true,'))])
  assert.throws(()=>assertD30MetadataTransition(attrs,wrong,D30_BUILD));
});
