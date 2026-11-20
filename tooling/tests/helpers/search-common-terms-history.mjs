import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateReviewedSensePack,validateSourceCorrectionPolicy} from '../../scripts/build-reviewed-dictionary-senses.mjs';
import {historicalSearch33,historicalOrdinary1061,historicalSelected210,historicalEveryday1271} from './life-coverage-history.mjs';
const directory=new URL('../../dictionary/everyday-expansions/2026-11-19-common-terms/',import.meta.url);
const bytes=await readFile(new URL('source.json',directory));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
assert.equal(hash(bytes),'ebaacb360562746a8e0dc6709732c57ff436300fe27366c9760b1866e4993ad7');
const source=JSON.parse(bytes),review=JSON.parse(await readFile(new URL('review.json',directory)));
assert.equal(source.entries.length,13);assert.equal(review.sourceSha256,hash(source));assert.equal(review.sourceByteSha256,hash(bytes));
assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,source.author);assert.deepEqual(review.issues,[]);
assert.deepEqual(review.approvedTerms,source.entries.map(row=>row.term));
assert.deepEqual(review.reviewedRows.map(({term,rowSha256,languageDecision})=>({term,rowSha256,languageDecision})),source.entries.map(row=>({term:row.term,rowSha256:hash(row),languageDecision:'PASS'})));
const baseline=JSON.parse(await readFile(new URL('baseline.json',directory)));
export function historicalSearch20(rows){
  rows=historicalSearch33(rows);
  assert.equal(rows.length,33);assert.deepEqual(rows.slice(20),source.entries);
  const old=rows.slice(0,20);assert.equal(hash(old),baseline.search20Sha256);return old;
}
export function historicalOrdinary1048(rows){
  const ordinary=historicalOrdinary1061(rows),removed=[];
  const old=ordinary.filter(row=>{
    const candidate=source.entries.find(entry=>entry.term===row.term);if(!candidate)return true;
    assert.deepEqual(row,candidate,'Only the exact independently approved row may be projected out');removed.push(row);return false;
  });
  assert.equal(ordinary.length,1061);assert.deepEqual(removed,source.entries);assert.equal(old.length,1048);
  assert.equal(hash(old),baseline.ordinary1048Sha256);return old;
}

// The separately approved correction cohort appends exactly three complete
// compiled objects. Reconstruct only those reviewed objects, then retain the
// complete original207 value hash rather than relaxing an old count check.
const correctionDirectory=new URL('../../dictionary/reviewed-senses/',import.meta.url);
const readCorrection=async file=>JSON.parse(await readFile(new URL(file,correctionDirectory)));
const correction=await readCorrection('source/batch-0017.json'),correctionReview=await readCorrection('reviews/batch-0017.json');
assert.equal(hash(correction),'45bdf792cd7113eb95a488b5444cadc42b39188286b2b9835fa160f2fe68941a');
assert.equal(correctionReview.sourceSha256,hash(correction));assert.equal(correctionReview.independentOfAuthor,true);
assert.notEqual(correctionReview.reviewer,correction.author);assert.deepEqual(correctionReview.issues,[]);
const before=await readCorrection('source-corrections-0017-canonical-before.json');
const records=new Map(before.records.map(row=>[row.term,row.record]));
const policyFile='source-corrections-0017-accuracy-policy.json';
const policyBytes=await readFile(new URL(policyFile,correctionDirectory)),policy=JSON.parse(policyBytes);
const legacy=await readCorrection('source-corrections-0017-legacy-examples.json');
const manifestBytes=await readFile(new URL('../../../vocab/data/expanded-dictionary/manifest.json',import.meta.url));
const expectedCorrections=validateReviewedSensePack(correction,correctionReview,records);
const projections=validateSourceCorrectionPolicy(policy,correction,correctionReview,records,JSON.parse(manifestBytes),hash(manifestBytes),legacy,
  new Map(legacy.entries.map(row=>[row.term,row.expectedEntry])),{file:policyFile,bytes:policyBytes});
for(const row of expectedCorrections)Object.assign(row,projections.get(row.term));
export function historicalSelected207(rows){
  const selected=historicalSelected210(rows),expected=new Map(expectedCorrections.map(row=>[row.term,row]));
  const removed=[],old=selected.filter(row=>{
    const correction=expected.get(row.term);if(!correction)return true;
    assert.deepEqual(row,correction,'Only the exact independently reviewed correction object may be projected out');removed.push(row);return false;
  });
  assert.equal(selected.length,210);
  assert.deepEqual(removed,expectedCorrections.toSorted((a,b)=>a.term.localeCompare(b.term,'en')));assert.equal(old.length,207);
  assert.equal(hash(old),'bf838a08a9d7e6d0b8f0fd0bf257384444124815f46839460268f2bb5975e7aa');return old;
}

/** An exception is a complete approved object, never a term/flag/schema guess.
 * Both historical cohorts are authenticated before returning these3 rows. */
export function exactSourceCorrectionRows(rows){
  historicalOrdinary1048(rows);historicalSelected207(rows);
  const corrections=rows.filter(row=>expectedCorrections.some(expected=>expected.term===row.term));
  assert.deepEqual(corrections,expectedCorrections.toSorted((a,b)=>a.term.localeCompare(b.term,'en')));
  assert.equal(historicalEveryday1271(rows).length-corrections.length,1268);return corrections;
}
