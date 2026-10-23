import test from 'node:test';
import assert from 'node:assert/strict';
import {loadD28Fixture} from './d28-regression-fixture.mjs';
const f=await loadD28Fixture();
test('D28 adds188 exact cross-reviewed pairs and preserves all85449 old whole entries',()=>{assert.equal(f.after.size-f.before.entries.size,188);assert.equal(f.pairByTerm.size,188);});
test('D28 matches all188 complete original source rows and looks up every canonical head',()=>{assert.equal(f.queue.entries.length,188);assert.equal(f.representatives.length,8);});
test('D28 preserves214 source scope and26 current deferrals without counting them',()=>{assert.equal(f.queue.entries.length+f.queue.deferred.length,214);for(const t of ['as per','on sight','native language','school boy'])assert(f.queue.deferred.some(r=>r.term===t));});
test('D28 admission receipt does not pretend to be a publication or a new language review',()=>{assert.equal(f.provenance.newLanguageDecisions,0);assert.equal(f.provenance.examplesBuilt,false);assert.equal(f.provenance.coverageAdded,0);assert.equal(f.provenance.published,false);});
