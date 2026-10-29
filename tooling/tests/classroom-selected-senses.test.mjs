import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { REVIEWED_SENSE_ENTRIES as rows } from '../../vocab/js/reviewed-senses-data.js';
import { EVERYDAY_LOOKUP_ENTRIES, EVERYDAY_CHINESE_ALIASES } from '../../vocab/js/everyday-lookup-data.js';
import { searchEverydayDictionary, loadEverydayExamples } from '../../vocab/js/everyday-lookup.js';
import { searchExpandedDictionary } from '../../vocab/js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../../vocab/js/personal-lookup-flow.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const read=async p=>JSON.parse(await readFile(new URL('../dictionary/'+p,import.meta.url),'utf8'));
const manifest=await read('everyday-expansions/2026-10-28-class-senses/manifest.json');
const baseline=await read('everyday-expansions/2026-10-28-class-senses/baseline.json');
const pack=await read('reviewed-senses/source/batch-0006.json'),review=await read('reviewed-senses/reviews/batch-0006.json');
const byTerm=new Map(rows.map(row=>[row.term,row]));
const noNetwork=()=>{throw Error('Packaged selected senses must resolve without dictionary/provider requests');};
test('twelve selected senses have actual different-reader approvals and exact unchanged old131 rows',()=>{
  assert.equal(hash(manifest),'f745e0b35224fb5ccef9375f03d6934b5b822afdf1bb4992b2a4bf6f05c0720f');
  assert.equal(hash(pack),manifest.sourceSha256);assert.equal(hash(review),manifest.reviewSha256);
  assert.equal(review.sourceSha256,hash(pack));assert(review.independentOfAuthor);assert.notEqual(review.reviewer,pack.author);
  assert.equal(pack.entries.length,12);assert.deepEqual(review.approvedTerms,pack.entries.map(r=>r.term));
  const historicalHeads=new Set([...baseline.oldSelectedRows,...pack.entries].map(r=>r.term));
  const historicalRows=rows.filter(r=>historicalHeads.has(r.term));
  assert.equal(historicalRows.length,143);assert.equal(new Set(historicalRows.map(r=>r.term)).size,143);
  for(const old of baseline.oldSelectedRows)assert.deepEqual(byTerm.get(old.term),old);
  assert.equal(hash(EVERYDAY_LOOKUP_ENTRIES.filter(r=>!r.reviewedCanonicalSense)),baseline.oldOrdinarySha256);
  assert.deepEqual(EVERYDAY_CHINESE_ALIASES,baseline.oldAliases);
  for(const row of pack.entries){
    const approval=review.decisions.find(d=>d.term===row.term),actual=byTerm.get(row.term);
    assert.equal(approval?.verdict,'approved');assert.equal(approval.rowSha256,hash(row));assert(approval.reason.trim());
    for(const key of['term','partOfSpeech','meaning','chineseAliases','englishForms','en','zh','references','canonicalId','canonicalSourceSha256'])assert.deepEqual(actual[key],row[key]);
    assert.equal(actual.exampleSource,'原创学习例句');
  }
});
test('every approved head, declared form and Chinese intent returns the exact selected sense immediately',async()=>{
  for(const row of pack.entries){
    for(const query of[row.term,...row.englishForms,...row.chineseAliases]){
      const found=await searchExpandedDictionary(query,{fetchImpl:noNetwork});
      const result=found.results.find(item=>item.term===row.term);assert(result,query);
      assert.equal(result.partOfSpeech,row.partOfSpeech);assert.equal(result.meaning,row.meaning);
      assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:noNetwork,hotReverse:noNetwork,fullSearch:noNetwork}),found);
    }
    const sense=loadEverydayExamples(row.term).senses[0];
    assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaning);
    assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);assert.equal(sense.source,'原创学习例句');
  }
});
test('whole old alternatives are precisely retained only for the eleven approved heads',async()=>{
  const policy=await read('reviewed-senses/retained-alternatives-class-0006.json');
  const old=await read('reviewed-senses/retained-alternatives.json');
  assert.equal(hash(policy),manifest.newPolicySha256);assert.deepEqual(policy.entries.slice(0,10),old.entries);assert.equal(policy.entries.length,21);
  const added=policy.entries.slice(10);assert.deepEqual(added.map(r=>r.term),manifest.retainedNewHeads);
  for(const p of added){const actual=byTerm.get(p.term);assert(actual.retainLegacyChinese);assert.equal(actual.retainedCanonicalAlternatives.length,p.alternatives.length);}
  assert(!byTerm.get('at fault').retainLegacyChinese);assert(!byTerm.get('at fault').retainedCanonicalAlternatives);
  assert.equal(searchEverydayDictionary('不是一千美元'),null);
  assert.equal(searchEverydayDictionary('默认安排和拖欠债务'),null);
  assert(!searchEverydayDictionary('grander')?.results.some(r=>r.term==='grand'));
  assert(!searchEverydayDictionary('dedicating')?.results.some(r=>r.term==='dedicated'));
});

// Adjectives must not replace the existing exact event expression.
test('classroom adjective aliases preserve the established sharp-decline phrase and reject unrelated compounds',async()=>{
  const exact=await searchExpandedDictionary('急剧下降',{fetchImpl:noNetwork});
  assert.equal(exact.results[0].term,'sink like a stone');
  assert(!exact.results.some(r=>r.term==='precipitous'));
  for(const query of ['急剧的','骤然的','急剧变化的']){
    const found=await searchExpandedDictionary(query,{fetchImpl:noNetwork});
    assert.equal(found.results[0].term,'precipitous');assert.equal(found.results[0].partOfSpeech,'adjective');
  }
  for(const query of ['骤然下降','不是急剧的','急剧变化的天气和债务'])assert(!searchEverydayDictionary(query)?.results.some(r=>r.term==='precipitous'));
});
