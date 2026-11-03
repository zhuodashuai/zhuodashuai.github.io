// The original83-row release remains an exact fixed cohort when later rows
// interleave in the sorted current table. The newest test owns the full union.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HISTORICAL_79_ROWS} from './correction-history-0079.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await fs.readFile(new URL('../../dictionary/examples/evidence/translation-precision-0019-fixture.json',import.meta.url));
assert.equal(sha(bytes),'68ab75a6da4db87a64ba50e215d3edf8388f7b5c6b5e67f810f185c76765aea9');
const fixture=JSON.parse(bytes);
export const HISTORICAL_83_ROWS=Object.freeze([...HISTORICAL_79_ROWS,...fixture.rows.map(row=>row.compiledCorrection)]
 .sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0).map(Object.freeze));
export const HISTORICAL_83_SHA256='573493f8e7ae05f88f433cc5e886b923cc33c2fdb2c0d23d0cf1ec39bf4af4b1';
assert.equal(HISTORICAL_83_ROWS.length,83);assert.equal(sha(JSON.stringify(HISTORICAL_83_ROWS)),HISTORICAL_83_SHA256);
const identity=row=>JSON.stringify([row.term,row.canonicalId,row.senseId,row.exampleIndex]);
const ids=new Set(HISTORICAL_83_ROWS.map(identity));assert.equal(ids.size,83);
export const historicalCorrections83=current=>current.filter(row=>ids.has(identity(row)));
