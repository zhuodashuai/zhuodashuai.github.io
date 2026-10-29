// Finite historical cohort only. The latest test owns the complete current83;
// no old row, assertion or identity is waived when a new correction is added.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const bytes=await fs.readFile(new URL('../../dictionary/examples/evidence/native-precision-0017-fixture.json',import.meta.url));
assert.equal(sha(bytes),'e522f78192612209cac38ebdc6c911695bd3d12c24c007d4440a11471a35779a');
const fixture=JSON.parse(bytes);
export const HISTORICAL_79_ROWS=Object.freeze([...fixture.baselineCorrectionRows,...fixture.rows.map(row=>row.compiledCorrection)]
  .sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0).map(Object.freeze));
export const HISTORICAL_79_SHA256=sha(JSON.stringify(HISTORICAL_79_ROWS));
assert.equal(HISTORICAL_79_ROWS.length,79);
assert.equal(HISTORICAL_79_SHA256,'b6fbb50e6bc86ac1eef3395e9c3a768207c872fb2a3e243447ff8729a803c1f8');
const identity=row=>JSON.stringify([row.term,row.canonicalId,row.senseId,row.exampleIndex]);
const ids=new Set(HISTORICAL_79_ROWS.map(identity));assert.equal(ids.size,79);
export const historicalCorrections79=current=>current.filter(row=>ids.has(identity(row)));
