import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EVERYDAY_LOOKUP_ENTRIES as rows,EVERYDAY_CHINESE_ALIASES as aliases} from '../../vocab/js/everyday-lookup-data.js';
import {searchEverydayDictionary,loadEverydayExamples} from '../../vocab/js/everyday-lookup.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const read=async f=>JSON.parse(await readFile(new URL('../dictionary/everyday-expansions/2026-10-27-common2/'+f,import.meta.url),'utf8'));
const manifest=await read('manifest.json'),baseline=await read('baseline.json'),byHead=new Map(rows.map(r=>[r.term,r]));
const added=manifest.addedHeads.map(term=>byHead.get(term));
const noNetwork=()=>{throw Error('An exact common query must not wait for a provider or large dictionary shard');};

test('the measured daily expansion consists only of exact independently approved rows and aliases',async()=>{
  assert.equal(hash(manifest),'3c182cfe4354e891a522ab24bc7a43af03e0b3623358130899bb388c5c52fa9a');assert.equal(manifest.newEntries,125);
  const approved=[];
  for(const source of manifest.sources){
    const pack=await read(source.sourceFile),review=await read(source.reviewFile);
    assert.equal(hash(pack),source.sourceSha256);assert.equal(hash(review),source.reviewSha256);
    assert.equal(review.sourceSha256,hash(pack));assert(review.independentOfAuthor);assert.notEqual(review.reviewer,pack.author);
    for(const row of pack.entries){const d=review.decisions.find(d=>d.term===row.term);assert.equal(d?.decision,'approve-new-row');assert.equal(d.rowSha256,hash(row));assert.deepEqual(byHead.get(row.term),row);approved.push(row);}
    for(const row of pack.aliases||[]){const d=review.aliasDecisions.find(d=>d.term===row.term);assert.equal(d?.decision,'approve-alias-only');assert.equal(d.rowSha256,hash(row));assert.equal(hash(byHead.get(row.term)),row.targetEntrySha256);}
  }
  assert.equal(approved.length,manifest.newEntries);assert.equal(hash(approved),manifest.addedRowsSha256);assert.deepEqual(approved,added);
  assert.equal(new Set(approved.map(r=>r.term.toLowerCase())).size,approved.length);
  for(const record of manifest.newAliases){assert.deepEqual(aliases.find(r=>r.term===record.term),record);assert.equal(hash(byHead.get(record.term)),record.targetEntrySha256);}
});

test('the published837 ordinary tuples, all131 selected meanings and old alias identities stay exact',()=>{
  const ordinary=rows.filter(r=>!r.reviewedCanonicalSense),selected=rows.filter(r=>r.reviewedCanonicalSense);
  assert.equal(baseline.ordinaryCount,837);assert.equal(hash(ordinary.slice(0,837)),baseline.ordinarySha256);
  // Later independently approved batches may append ordinary entries; every
  // tuple and alias approved by this historical release remains exact above.
  assert(ordinary.length>=manifest.expectedFinalOrdinaryCount);assert.equal(selected.length,131);assert.equal(hash(selected),baseline.selectedSha256);
  for(const record of baseline.aliases)assert.deepEqual(aliases.find(r=>r.term===record.term),record);
});

test('every approved Chinese intent and its lookup question resolves immediately at both lookup entry points',async()=>{
  const intents=added.flatMap(row=>row.chineseAliases.map(query=>[query,row.term]));
  for(const row of manifest.newAliases)for(const query of row.aliases)intents.push([query,row.term]);
  for(const[query,term]of intents){
    const result=await searchExpandedDictionary(query,{fetchImpl:noNetwork});assert(result.results.some(r=>r.term===term),query);
    assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:noNetwork,hotReverse:noNetwork,fullSearch:noNetwork}),result,query);
    assert(searchEverydayDictionary(`请问${query}的英文是什么？`).results.some(r=>r.term===term),query);
    assert.equal(searchEverydayDictionary('不是'+query),null,query);
    assert.equal(searchEverydayDictionary(query+'和其他东西'),null,query);
    const pair=loadEverydayExamples(term).senses[0];assert.equal(pair.partOfSpeech,byHead.get(term).partOfSpeech);assert.equal(pair.meaningZh,byHead.get(term).meaning);
    assert.deepEqual(pair.examples,[{en:byHead.get(term).en,zh:byHead.get(term).zh}]);
  }
});

test('known wrong-sense hits are replaced by the right action or object without folding away negation',()=>{
  const heads=q=>searchEverydayDictionary(q)?.results.map(r=>r.term)||[];
  for(const[q,term,wrong]of[
    ['粘锅','stick to the pan','non-stick'],['不粘锅','non-stick pan','stick to the pan'],
    ['分装','portion out','garish'],['削皮器','peeler','zester'],['榨汁机','juicer','cider mill'],
    ['衣服掉色','colours run','fade'],['货不对板','not as described','wrong item'],
    ['退差价','refund the difference','pay the difference'],['补差价','pay the difference','refund the difference'],
    ['尺码偏小','run small','run large'],['尺码偏大','run large','run small'],
  ]){assert.equal(heads(q)[0],term,q);assert(!heads(q).includes(wrong),q);}
  assert.equal(heads('AA制')[0],'split the bill');
  for(const q of['不想分装','不要去皮','未煮软','不需补差价','没有漏发','不去除霉斑','去皮的反义词','AA制和我请客'])assert.equal(searchEverydayDictionary(q),null,q);
});
