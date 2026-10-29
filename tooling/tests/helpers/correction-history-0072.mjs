// Exact historical72 projection; later sorted additions can interleave.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
const bytes=await fs.readFile(new URL('../../dictionary/examples/corrections/translation-precision-0014-fixture.json',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
assert.equal(sha(bytes),'0d0e769d8f68d2737becd96bf9a153f440b2cf6fe1fdcf86570cac47fa5d313c');
const fixture=JSON.parse(bytes),rows=[...fixture.baselineCorrectionRows,...fixture.rows.map(r=>r.compiledCorrection)].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
export const HISTORICAL_72_SHA256='2e9cd3a2ddd363bc5b64e6f452c1f62f2383fdf1ccfb94003978302121bfb331';
assert.equal(rows.length,72);assert.equal(sha(JSON.stringify(rows)),HISTORICAL_72_SHA256);
export const historicalCorrectionIdentity=row=>JSON.stringify([row.term,row.canonicalId,row.senseId,row.exampleIndex]);
const identities=new Set(rows.map(historicalCorrectionIdentity));assert.equal(identities.size,72);
export const historicalCorrections72=current=>current.filter(row=>identities.has(historicalCorrectionIdentity(row)));
export const HISTORICAL_72_ROWS=Object.freeze(rows.map(Object.freeze));
