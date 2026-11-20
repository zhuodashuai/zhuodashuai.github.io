import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const baseline=JSON.parse(await readFile(new URL('../../dictionary/everyday-expansions/2026-11-19-search-experience/baseline.json',import.meta.url),'utf8'));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function historicalOrdinary1028(rows){
  const old=rows.filter(row=>!row.reviewedCanonicalSense).slice(0,1028);
  assert.equal(old.length,1028);assert.equal(hash(old),'5f5d1681f4fc17b6c46add8a47b4bae5456430c4acc388c0163b6584b1beb9ce');return old;
}
export function historicalSelected199(rows){
  const heads=new Set(baseline.selectedHeads);assert.equal(heads.size,199);
  const old=rows.filter(row=>row.reviewedCanonicalSense&&heads.has(row.term));
  assert.equal(old.length,199);assert.equal(hash(old),'b07aa29215bf754315cbe91c029958ee509a029f6e7bccf66c23328ca850e2de');return old;
}
