import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{EVERYDAY_LOOKUP_ENTRIES as rows,EVERYDAY_CHINESE_ALIASES as aliases}from'../../vocab/js/everyday-lookup-data.js';
import{searchEverydayDictionary,loadEverydayExamples}from'../../vocab/js/everyday-lookup.js';
import{searchExpandedDictionary}from'../../vocab/js/expanded-dictionary.js';
import{lookupPersonalDictionaryFast}from'../../vocab/js/personal-lookup-flow.js';
import{historicalSelectedRows}from'./selected-sense-history-fixture.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=async file=>JSON.parse(await readFile(new URL('../dictionary/everyday-expansions/2026-10-28-class/'+file,import.meta.url),'utf8'));
const manifest=await read('manifest.json'),baseline=await read('baseline.json'),byHead=new Map(rows.map(row=>[row.term,row]));
const added=manifest.addedHeads.map(term=>byHead.get(term)),noNetwork=()=>{throw Error('Reviewed common query must use the packaged dictionary immediately');};
test('common-class additions and alias-only changes match their complete independent approvals',async()=>{
  assert.equal(hash(manifest),'566c04f124cbf0426cdef9375eb1e4182447fb62394f7914523f0f1fc0c7752a');
  assert.equal(manifest.newEntries,60);assert.equal(new Set(manifest.addedHeads).size,60);assert.equal(hash(added),manifest.addedRowsSha256);
  for(const source of manifest.sources){
    const pack=await read(source.sourceFile),review=await read(source.reviewFile);assert.equal(hash(pack),source.sourceSha256);assert.equal(hash(review),source.reviewSha256);
    assert.equal(review.sourceSha256,hash(pack));assert(review.independentOfAuthor);assert.notEqual(review.reviewer,pack.author);
    for(const row of pack.entries){
      const decision=review.decisions.find(decision=>decision.term===row.term);assert.equal(decision?.rowSha256,hash(row));
      if(decision.decision==='approve-new-row'){assert.deepEqual(byHead.get(row.term),row);assert.equal(row.exampleSource,'原创学习例句');assert(!row.reviewedCanonicalSense);}
      else if(decision.decision==='approve-alias-only'){
        assert.deepEqual(byHead.get(row.term),row.targetSnapshot);assert.equal(hash(byHead.get(row.term)),row.targetEntrySha256);
        assert.deepEqual(aliases.find(record=>record.term===row.term),{term:row.term,aliases:row.aliases,targetEntrySha256:row.targetEntrySha256});
      }else assert.equal(decision.decision,'hold-existing-registry-extension');
    }
  }
  assert.equal(manifest.newAliases.length,9);assert.equal(manifest.newAliases.reduce((sum,row)=>sum+row.aliases.length,0),13);
});
test('all published ordinary/selected tuples and old alias records remain byte-semantically unchanged',()=>{
  const ordinary=rows.filter(row=>!row.reviewedCanonicalSense),selected=historicalSelectedRows(rows);
  assert.equal(baseline.ordinaryCount,962);assert.equal(hash(ordinary.slice(0,962)),baseline.ordinarySha256);
  assert(ordinary.length>=manifest.expectedOrdinaryCount);assert.equal(selected.length,baseline.selectedCount);assert.equal(hash(selected),baseline.selectedSha256);
  for(const row of baseline.aliases)assert.deepEqual(aliases.find(record=>record.term===row.term),row);
});
test('all approved English forms, Chinese lookup intents and bilingual examples work without requests',async()=>{
  for(const row of added){
    for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
      const result=await searchExpandedDictionary(query,{fetchImpl:noNetwork});assert(result.results.some(result=>result.term===row.term),query);
      assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:noNetwork,hotReverse:noNetwork,fullSearch:noNetwork}),result,query);
    }
    for(const query of row.chineseAliases){
      assert(searchEverydayDictionary(`请问${query}的英文是什么？`).results.some(result=>result.term===row.term),query);
      assert.equal(searchEverydayDictionary('不是'+query),null,query);
      assert.equal(searchEverydayDictionary(query+'和另一个东西'),null,query);
    }
    const sense=loadEverydayExamples(row.term).senses[0];assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaning);
    assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);assert.equal(sense.source,'原创学习例句');
  }
  for(const row of manifest.newAliases)for(const query of row.aliases)assert((await searchExpandedDictionary(query,{fetchImpl:noNetwork})).results.some(result=>result.term===row.term),query);
});
test('new timing, parental-leave, smoke and workplace meanings retain exact roles and do not acquire unrelated senses',()=>{
  const heads=query=>searchEverydayDictionary(query)?.results.map(row=>row.term)||[];
  assert.equal(heads('get off work')[0],'get off work');assert.notEqual(heads('get off')[0],'get off work');
  for(const [term,wrong]of [['maternity leave','paternity leave'],['paternity leave','maternity leave'],['secondhand smoke','vaping'],['vaping','secondhand smoke'],['prior authorization','written consent'],['written consent','prior authorization']]){
    const row=byHead.get(term);assert(row);for(const query of row.chineseAliases){assert(heads(query).includes(term),query);assert(!heads(query).includes(wrong),query);}
  }
  assert.equal(heads('every other year')[0],'every other year');
  for(const query of ['不是下班','产假和陪产假','二手烟和电子烟','每两年一次和每年一次','不是书面同意'])assert.equal(searchEverydayDictionary(query),null,query);
});
