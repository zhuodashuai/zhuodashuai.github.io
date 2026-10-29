import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fixture=JSON.parse(await readFile(new URL('../../dictionary/reviewed-senses/existing-pairs/common-use-0020-baseline.json',import.meta.url),'utf8'));
const heads=new Set(fixture.selectedHeads);
assert.equal(heads.size,187);
export function historicalSelected187(rows){
  const old=rows.filter(row=>heads.has(row.term));
  assert.equal(old.length,187);
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'aaa7d4a16a5fe3e19c5a9c7c0fcbc3eac9f09d67d43be4bf0740ba589a184337');
  return old;
}
