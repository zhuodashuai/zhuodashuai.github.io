import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fixture=JSON.parse(await readFile(new URL('../../dictionary/reviewed-senses/classroom-remaining-fixture-0018.json',import.meta.url)));
const names=new Set(fixture.baseline.selectedHeads);
// This exact pre-0018 selection is the old historical boundary. The new release
// separately requires the complete current183 = unchanged177 plus six additions.
export function historicalSelected177(rows){
 const old=rows.filter(r=>names.has(r.term));
 assert.equal(names.size,177);assert.equal(old.length,177);
 const digest=createHash('sha256').update(JSON.stringify(old)).digest('hex');
 assert.equal(digest,'ffd18e73bc16531541c2a86d6940718b6e813cfa1b7e8fe539a1af5e3b21a120');
 assert.equal(digest,fixture.baseline.selectedSha256);
 return old;
}
