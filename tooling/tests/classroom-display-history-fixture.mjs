import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const displays=JSON.parse(await fs.readFile(new URL('../dictionary/everyday-expansions/2026-10-28-class-senses/current-display-overrides.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(JSON.stringify(displays)).digest('hex'),'4ed173f06249a55165c407b91c4e3a517173b9a289f963de72c5580775f6d54b');
assert.equal(displays.length,12);
const approved=new Map(displays.map(row=>[row.term,row]));
// The frozen D30 head set overlaps this release only at "at fault". All its
// other historical primary displays and every raw capsule remain strict.
export const approvedCurrentDisplay = historical => historical.term === 'at fault' ? approved.get('at fault') : historical;
