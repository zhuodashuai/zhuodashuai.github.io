import test from 'node:test';
import assert from 'node:assert/strict';
import {D32_BUILD,D32_COHORTS,D32_COUNTS,requireActualD32Build,assertD32CurrentIndex,assertD32ReviewedRow,assertD32RetainedConservation,loadD32Fixture} from './d32-regression-fixture.mjs';

// This fails before reads/imports if a future copy removes actual registration.
const f=await loadD32Fixture();

test('D32 actual285 registration is explicit and missing/incomplete registration fails closed',()=>{
 assert(D32_BUILD);assert.equal(requireActualD32Build().standardPacks.length,15);
 for(const value of[null,{}, {...D32_BUILD,standardPacks:D32_BUILD.standardPacks.slice(0,-1)}])assert.throws(()=>requireActualD32Build(value));
 assert.equal(f.published,false);assert.equal(f.productWrites,0);assert.equal(f.newLanguageDecisions,0);
});

test('D32 immutable gzip data matches actual normal full-reference86700/88089 without replacing D31v2',()=>{
 assert.equal(f.before.size,86415);assert.equal(f.base.version,'afff0148b5c2cf401feb1ef646bb61a3fc2bcefd984050b8a0609f711f47c3c4');assert.deepEqual(f.base.counts,{heads:86415,examples:87804});
 assert.deepEqual(f.audit.counts,{heads:D32_COUNTS.heads,examples:D32_COUNTS.examples});assert.equal(f.after.size,86700);assert.equal(f.audit.addedHeads,285);assert.equal(f.audit.addedExamples,285);assert.equal(f.delta.size,285);
 assert.equal(f.normalVersion,'c29b7a310169aed7ede8ad1a60f00c0388406590c9bd5205dbd5faa10cc19c80');assert.equal(f.normalVersion,f.audit.fullReferenceBuildVersion);assert.equal(f.catalogue.version,f.audit.version);assert.equal(f.catalogue.deltas.length,1);
});

test('D32 preserves every whole86415 old entry and87804 old pairs, not merely their counts',()=>{
 assert.equal(f.oldPairs,87804);for(const[term,entry]of f.before)assert.deepEqual(f.after.get(term),entry,'Whole old entry changed '+term);
 assert.equal(f.oldExampleRawBodiesVerified,256);assert.equal(f.sourceRawBodiesVerified,128);assert.equal(f.oldHistoryRescans,0);
 assert.equal(f.source.version,'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644');assert.equal(f.records.size,102609);
});

test('D32 exact15 packs and historical subset survive strict future index appends, old555 index unchanged',async()=>{
 assert.deepEqual(f.cohorts.map(c=>[c.name,c.count]),[['p001',21],['p002',60],['p002-child',2],['ive-child',1],['root',27],['source9-01',17],['yuk-child',1],['source9-02',16],['source9-03',17],['role-01',18],['role-02',20],['role-03',23],['role-04',21],['role-05',17],['source9-04',24]]);
 assert.deepEqual(f.index.releases[0].sourceFiles,D32_COHORTS.map(c=>'batch-0032-'+c[0]+'.json'));assert.equal(f.index.previousCatalogue,null);
 assert.deepEqual(f.currentIndex.releases[0],f.index.releases[0]);
 // Pure hypothetical append exercises only the index contract, not approval,
 // materialization, activation or hypothetical D33 coverage.
 const appended=structuredClone(f.index);appended.previousCatalogue=structuredClone(D32_BUILD.catalogue);appended.releases.push({id:'examples-0033',sourceFiles:['batch-0033-fixture-only.json']});
 assert.deepEqual(await assertD32CurrentIndex(appended),appended);
 for(const mutate of[value=>value.releases[0].sourceFiles.pop(),value=>value.releases[0].sourceFiles.reverse(),value=>value.releases[0].id='examples-9999',value=>value.base.sha256='0'.repeat(64),value=>value.source.version='0'.repeat(64),value=>value.releases.push(structuredClone(value.releases[0])),value=>value.releases[1].sourceFiles.push(value.releases[0].sourceFiles[0]),value=>value.previousCatalogue=null,value=>value.previousCatalogue.sha256='bad']){const changed=structuredClone(appended);mutate(changed);await assert.rejects(()=>assertD32CurrentIndex(changed));}
 assert.equal(f.build.oldIndex.sha256,'5ad539e7c6ff64c3f617ed77eac3082dd21468b338ef3d60a77f7d771720cb53');assert.equal(f.cohorts.length,15);for(const c of f.cohorts)assert(c.sourcePin.sha256&&c.reviewPin.sha256);
});

test('D32 all285 exact five cells keep independent principals, full source ID/hash and runtime data',()=>{
 assert.equal(f.rows.length,285);assert.equal(f.proofs.size,285);for(const row of f.rows){const{proof,cohort,review}=f.proofs.get(row.term),record=f.records.get(row.term);assertD32ReviewedRow(row,proof,cohort,record,review);const d=f.delta.get(row.term);assert.equal(d.canonicalId,proof.canonicalId);assert.equal(d.canonicalSourceSha256,proof.canonicalSourceSha256);assert.deepEqual(d.example.senses[0].examples,[{en:row.en,zh:row.zh}]);assert.equal(d.example.senses[0].partOfSpeech,row.partOfSpeech);assert.equal(d.example.senses[0].meaningZh,row.meaningZh);}
});

test('D32 real285 canonical searches and strict-reader285 examples cannot be activated by caller display markers',()=>{
 assert.equal(f.canonicalQueries,285);assert.equal(f.actualExampleQueries,285);assert.equal(f.noQueryIsolation,285);assert.equal(f.mismatchedQueryIsolation,285);assert(f.declaredFormIsolation>0);
 assert.equal(f.excludedQueries,308);assert.equal(f.oldRoleQueries,15);assert(f.fetches.some(p=>p.startsWith('dictionary-examples/delta-v4/')));assert(f.fetches.some(p=>p.startsWith('expanded-dictionary/')));
});

test('D32 both original queues retain593 considered/308 excluded,302 author holds and10 failed original pairs',()=>{
 assert.equal(f.queues[0].selectedHeads,244);assert.equal(f.queues[1].selectedHeads,41);assert.equal(f.queues[1].combinedD32Heads,285);assert.equal(f.conservation.considered,593);assert.equal(f.conservation.excluded.length,308);assert.equal(f.conservation.originalAuthorHolds,302);assert.equal(f.conservation.originalFailedPairs.length,10);
 for(const term of['ta-ta','HO','CAL','BOT','hella','CI','ALU']){assert(f.conservation.excluded.includes(term));assert(!f.delta.has(term));}
 assert.deepEqual(f.conservation.originalFailedPairs.filter(d=>f.delta.has(d.term)).map(d=>d.term).sort(),['aloha','mhm','yuk']);
});

test('D32 proof negatives reject self-review, changed five-cell text, canonical ID and whole-source substitutions',()=>{
 const row=f.rows[0],entry=f.proofs.get(row.term),record=f.records.get(row.term);
 for(const mutate of[p=>p.reviewerPrincipal=p.authorPrincipal,p=>p.canonicalId++,p=>p.canonicalSourceSha256='0'.repeat(64),p=>p.pairSha256='0'.repeat(64),p=>p.wholeIndependentDecision.decision='hold']){const proof=structuredClone(entry.proof);mutate(proof);assert.throws(()=>assertD32ReviewedRow(row,proof,entry.cohort,record,entry.review));}
 assert.throws(()=>assertD32ReviewedRow({...row,zh:row.zh+'（未复核）'},entry.proof,entry.cohort,record,entry.review));
 assert.throws(()=>assertD32ReviewedRow(row,entry.proof,entry.cohort,{...record,meaning:record.meaning+'（变化）'},entry.review));
});

test('D32 queue negatives reject dropping a hold, failed original or changing its retained reason',()=>{
 for(const mutation of[queues=>queues[0].retained.find(r=>r.originalAuthorHolds.length).originalAuthorHolds.pop(),queues=>queues[0].retained.find(r=>r.unselectedOriginalDecisions.length).unselectedOriginalDecisions.pop(),queues=>queues[1].retained[0].originalAuthorHolds[0].reason='silently cleared']){const queues=structuredClone(f.queues);mutation(queues);assert.throws(()=>assertD32RetainedConservation(queues,f.rows));}
});
