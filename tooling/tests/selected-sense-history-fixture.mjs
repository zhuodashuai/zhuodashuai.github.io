import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const baseline = JSON.parse(await readFile(new URL('../dictionary/everyday-expansions/2026-10-28-class-senses/baseline.json', import.meta.url), 'utf8'));
assert.equal(createHash('sha256').update(JSON.stringify(baseline)).digest('hex'), '85dab682c5a4f74a9b6c9cb314a046bb1032c3e9af8537f0a8ea75df1e4ccf2c');
assert.equal(baseline.oldSelectedRows.length, 131);
const heads = new Set(baseline.oldSelectedRows.map(row => row.term));
export const historicalSelectedRows = rows => rows.filter(row => row.reviewedCanonicalSense && heads.has(row.term));
