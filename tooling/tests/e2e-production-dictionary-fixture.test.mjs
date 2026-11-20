import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveProductionDictionaryCollection,findProductionCollectedEntry} from './e2e/production-dictionary-fixture.mjs';
const source=JSON.parse(await readFile(new URL('../dictionary/everyday-expansions/2026-11-19-common-terms/source.json',import.meta.url)));
test('the fixture executes the production packaged canonical/form resolver without accepting browser meanings',async()=>{
  const row=source.entries.find(row=>row.term==='bank transfer');
  for(const query of [row.term,...row.englishForms]){
    const entry=await resolveProductionDictionaryCollection(query);
    assert.equal(entry.term,row.term);assert.equal(entry.partOfSpeech,row.partOfSpeech);assert.equal(entry.meaning,row.meaning);
    assert.equal(entry.sourceTitle,row.dictionarySource);assert.equal(entry.exampleEn,row.en);assert.equal(entry.exampleZh,row.zh);
    assert.equal(entry.correction.source,'packaged-everyday-dictionary');
    assert.equal(findProductionCollectedEntry({entries:[entry]},'bank transfers'),entry);
  }
});
test('ordinary raw canonical collection preserves source and rejects raw form-only or Chinese input',async()=>{
  for(const term of ['apple','abacus']){
    const entry=await resolveProductionDictionaryCollection(term);
    assert.equal(entry.term,term);assert.equal(entry.partOfSpeech,'noun');assert(entry.meaning);
    assert.equal(entry.correction.source,'verified-local-dictionary');
    assert.equal(entry.exampleEn,'');assert.equal(entry.exampleZh,'');assert.deepEqual(entry.senses,[]);
  }
  for(const input of ['银行转账','resited','resiting'])await assert.rejects(resolveProductionDictionaryCollection(input));
});
