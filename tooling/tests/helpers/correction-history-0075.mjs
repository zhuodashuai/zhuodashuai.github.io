// Project immutable historical cohorts by exact identity; later releases own
// the full current union assertion, while these rows remain byte-for-byte exact.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const bytes=await fs.readFile(new URL('../../dictionary/examples/evidence/translation-precision-0016-fixture.json',import.meta.url));
assert.equal(sha(bytes),'718151135297edd8a8cd644e182fa37fc8b5f91328d01b9a529aa56450b31ac0');
const fixture=JSON.parse(bytes),sort=rows=>rows.slice().sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
export const HISTORICAL_74_ROWS=Object.freeze(sort(fixture.baselineCorrectionRows).map(Object.freeze));
export const HISTORICAL_75_ROWS=Object.freeze(sort([...fixture.baselineCorrectionRows,...fixture.rows.map(r=>r.compiledCorrection)]).map(Object.freeze));
assert.equal(HISTORICAL_74_ROWS.length,74);assert.equal(HISTORICAL_75_ROWS.length,75);
export const HISTORICAL_75_SHA256=sha(JSON.stringify(HISTORICAL_75_ROWS));
const identity=row=>JSON.stringify([row.term,row.canonicalId,row.senseId,row.exampleIndex]);
const ids74=new Set(HISTORICAL_74_ROWS.map(identity)),ids75=new Set(HISTORICAL_75_ROWS.map(identity));
assert.equal(ids74.size,74);assert.equal(ids75.size,75);
export const historicalCorrections74=current=>current.filter(row=>ids74.has(identity(row)));
export const historicalCorrections75=current=>current.filter(row=>ids75.has(identity(row)));
