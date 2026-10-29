import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bytes=await readFile(new URL('../../dictionary/reviewed-senses/classroom-next-fixture-0019.json',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(hash(bytes),'f3f2bdf39e76b6341a8468e47cd5cf3d463b8dfab2582d5ebdb9e6f3c8e2e40c');
const fixture=JSON.parse(bytes),heads=new Set(fixture.baseline.selectedHeads),legacyHeads=new Set(fixture.baseline.legacyTerms);
// Frozen historical identity sets and whole-object hashes remain independent
// of the growing current arrays. The new test owns the full current187/30.
export function historicalSelected183(rows){const old=rows.filter(r=>heads.has(r.term));assert.equal(heads.size,183);assert.equal(old.length,183);assert.equal(hash(JSON.stringify(old)),'434d20993a8bc2fc38544c71cb192833c6e7de759b951df78da839bb8340080e');return old;}
export function historicalLegacy26(rows){const old=rows.filter(r=>legacyHeads.has(r.term));assert.equal(legacyHeads.size,26);assert.equal(old.length,26);assert.equal(hash(JSON.stringify(old)),'7b7ece4fcdc48422a8dcbe6bd7be54f619d610fd61ee070d0b4c99c4898801dd');return old;}
