import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const baseline=JSON.parse(await readFile(new URL('../../dictionary/everyday-expansions/2026-11-19-search-followup/baseline.json',import.meta.url),'utf8'));
assert.equal(baseline.ordinarySha256,'c00421acd46b12cc96e01b4aec674df43f915fb7121ddfd51175db08f15d5a39');
assert.equal(baseline.selectedSha256,'bd672f10d8e49f175f3ea77fdb126bc13b7d3bc3bf4b1bab2ce809d17b1f3d1f');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function historicalOrdinary1044(rows){
  const old=rows.filter(row=>!row.reviewedCanonicalSense).slice(0,1044);
  assert.equal(old.length,1044);assert.equal(hash(old),baseline.ordinarySha256);return old;
}
export function historicalSelected204(rows){
  const heads=new Set(baseline.selectedHeads);assert.equal(heads.size,204);
  const old=rows.filter(row=>row.reviewedCanonicalSense&&heads.has(row.term));
  assert.equal(old.length,204);assert.equal(hash(old),baseline.selectedSha256);return old;
}
