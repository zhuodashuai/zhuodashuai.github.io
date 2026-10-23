import test from 'node:test';
import assert from 'node:assert/strict';
import {loadD26Fixture} from './d26-regression-fixture.mjs';
const fixture=await loadD26Fixture();
test('D26 adds exactly83 independently reviewed whole selected-sense pairs without changing old85366 entries',()=>{assert.equal(fixture.pairByTerm.size,83);assert.equal(fixture.after.entries.size-fixture.before.entries.size,83);assert.equal(fixture.after.pairs-fixture.before.pairs,83);});
test('D26 retains9 source/form holds without falsely counting them as examples',()=>{assert.equal(fixture.queue.authorHolds.length,9);for(const row of fixture.queue.authorHolds)assert(!fixture.after.entries.has(row.term));});
test('D26 all83 exact source records, POS, full meanings, alternatives and runtime lookups pass',()=>{assert.equal(fixture.queue.entries.length,83);assert.equal(fixture.representatives.length,8);assert.equal(fixture.pairByTerm.get('touche').reviewer,'AI/examples26_reviewer_c');});
test('D26 inherited proof remains an admission-stage record rather than a false publication claim',()=>{assert.equal(fixture.provenance.published,false);assert.equal(fixture.provenance.examplesBuilt,false);assert.equal(fixture.provenance.coverageAdded,0);assert.equal(fixture.provenance.baselineSourceFiles.length,534);});
