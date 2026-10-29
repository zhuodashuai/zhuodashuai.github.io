import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REVIEWED_SENSE_ENTRIES as selected} from '../../vocab/js/reviewed-senses-data.js';
import {CANONICAL_EXAMPLE_REPAIRS as repairs} from '../../vocab/js/canonical-example-repairs-data.js';
import {EVERYDAY_LOOKUP_ENTRIES,EVERYDAY_CHINESE_ALIASES} from '../../vocab/js/everyday-lookup-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {canonicalDisplayContexts} from '../../vocab/js/canonical-example-repair-source.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const bytesHash=x=>createHash('sha256').update(x).digest('hex');
const read=async name=>JSON.parse(await readFile(new URL('../dictionary/'+name,import.meta.url),'utf8'));
const baseline=await read('everyday-expansions/2026-10-29-classroom-search/baseline.json');
const manifest=await read('everyday-expansions/2026-10-29-classroom-search/manifest.json');
const pack=await read('reviewed-senses/source/batch-0008.json'),review=await read('reviewed-senses/reviews/batch-0008.json');
const canonicalPacks=await Promise.all(manifest.canonicalRepairs.map(async pin=>({pin,source:await read('examples/canonical-repairs/source/'+pin.name),review:await read('examples/canonical-repairs/reviews/'+pin.name)})));
const fileFetch=async input=>{const url=new URL(input);assert.equal(url.protocol,'file:');return new Response(await readFile(url));};
const noNetwork=()=>{throw Error('An immediate selected sense reached a dictionary or provider');};

test('classroom pack preserves all old 147 selected, 72 canonical and ordinary rows with actual independent approvals',()=>{
 assert.equal(hash(baseline),'9a0523fde259ef9ac8cf8f104905a07f513b3fd397908c05e921e0ae688f524a');
 assert.equal(hash(manifest),'26d6eb52621881395f683019acd7afcc70517c1409bb9c44e563efd2e0ceee7a');
 assert.equal(hash(pack),manifest.selectedSourceSha256);assert.equal(hash(review),manifest.selectedReviewSha256);
 assert.equal(review.sourceSha256,hash(pack));assert(review.independentOfAuthor);assert.notEqual(review.reviewer,pack.author);assert.deepEqual(review.issues,[]);
 const historicalTerms=new Set([...baseline.selectedRows,...pack.entries].map(r=>r.term));
 const historicalSelected=selected.filter(r=>historicalTerms.has(r.term));
 assert.equal(historicalSelected.length,156);assert.equal(new Set(historicalSelected.map(r=>r.term)).size,156);
 assert.equal(repairs.rows.length,75);assert.equal(repairs.rows.reduce((n,r)=>n+1+(r.additionalExamples?.length??0),0),76);
 for(const old of baseline.selectedRows)assert.deepEqual(selected.find(r=>r.term===old.term),old);
 for(const old of baseline.canonicalRows)assert.deepEqual(repairs.rows.find(r=>r.term===old.term),old);
 assert.equal(baseline.ordinaryRows.length,1022);assert.equal(baseline.aliases.length,45);
 assert.deepEqual(EVERYDAY_LOOKUP_ENTRIES.filter(r=>!r.reviewedCanonicalSense),baseline.ordinaryRows);
 assert.deepEqual(EVERYDAY_CHINESE_ALIASES,baseline.aliases);
 assert.deepEqual(review.approvedTerms,pack.entries.map(r=>r.term));
 for(const row of pack.entries){const actual=selected.find(r=>r.term===row.term);
  for(const key of ['term','partOfSpeech','meaning','chineseAliases','englishForms','en','zh','references','canonicalId','canonicalSourceSha256'])assert.deepEqual(actual[key],row[key]);
  assert.equal(actual.exampleSource,'原创学习例句');
 }
});

test('all 36 literal, inflected and Chinese selected queries return exact meanings, POS and examples with zero fallback',async()=>{
 let count=0;
 for(const row of pack.entries)for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
  const found=await searchExpandedDictionary(query,{fetchImpl:noNetwork});assert.equal(found.results[0].term,row.term,query);
  assert.equal(found.results[0].partOfSpeech,row.partOfSpeech);assert.equal(found.results[0].meaning,row.meaning);
  assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:noNetwork,hotReverse:noNetwork,fullSearch:noNetwork}),found);
  const card={...found.results[0],example:'Keep this saved example.',bookPassage:'Keep this book passage.',study:{box:4,correct:7}},before=structuredClone(card);
  const optional=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:noNetwork});
  assert.deepEqual(optional.senses[0].examples,[{en:row.en,zh:row.zh}]);assert.equal(optional.senses[0].source,'原创学习例句');
  assert.deepEqual(card,before);count++;
 }
 assert.equal(count,36);assert.equal(pack.entries.length,9);assert.equal(pack.entries.reduce((n,r)=>n+r.meaning.split('\n').length,0),12);
});

test('all 22 old retention decisions remain exact and seven new decisions keep complete licensed tuples',async()=>{
 const additions=await read('reviewed-senses/retained-alternatives-classroom-0008-additions.json');
 const combined=await read('reviewed-senses/retained-alternatives-classroom-0008.json');
 assert.equal(hash(additions),manifest.newPolicySha256);assert.equal(hash(combined),manifest.combinedPolicySha256);
 assert.equal(combined.entries.length,29);assert.deepEqual(combined.entries.slice(0,22),baseline.retentionPolicy.entries);
 assert.deepEqual(combined.entries.slice(22),additions.entries);
 for(const policy of additions.entries){const actual=selected.find(r=>r.term===policy.term);assert(actual.retainLegacyChinese);assert.equal(actual.retainedCanonicalAlternatives.length,policy.alternatives.length);
  assert(policy.independentOfAuthor);assert.notEqual(policy.author,policy.reviewer);assert.equal(policy.selectedRowSha256,hash(pack.entries.find(r=>r.term===policy.term)));
 }
 for(const term of ['shortness of breath','homemaker']){const row=selected.find(r=>r.term===term);assert(!row.retainLegacyChinese);assert(!row.retainedCanonicalAlternatives);}
 const compatible=additions.entries.find(r=>r.term==='compatible');assert.equal(compatible.alternatives.length,2);
 for(const tuple of compatible.alternatives){assert(tuple.meaning.includes('[计]'));assert(tuple.meaning.includes('相容的; 兼容的'));}
});

test('three canonical components bind exact full records, original DTOs, pair hashes and different-reader decisions',async()=>{
 const dictionary=JSON.parse(await readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url),'utf8'));
 for(const {pin,source,review}of canonicalPacks){
  assert.equal(hash(source),pin.sourceSha256);assert.equal(hash(review),pin.reviewSha256);assert.equal(review.sourceSha256,hash(source));
  assert(review.independentOfAuthor);assert.notEqual(review.reviewer,source.author);assert.deepEqual(review.issues,[]);
  assert.equal(source.entries.length,1);const row=source.entries[0],actual=repairs.rows.find(r=>r.term===row.term);
  assert.equal(review.decisions[0].rowSha256,hash(row));assert.equal(hash(row.exactCanonicalRecord),row.canonicalSourceSha256);
  assert.equal(hash(row.expectedOriginalEntry),row.expectedOriginalEntrySha256);assert.equal(hash(row.replacementPair),row.replacementPairSha256);
  assert.equal(hash(row.retiredOriginalPair),row.retiredOriginalPairSha256);assert.notEqual(actual.senseId,row.expectedOriginalEntry.senses[0].id);
  for(const key of ['canonicalId','canonicalSourceSha256','expectedOriginalEntry','acceptedDisplayContexts','replacementPair'])assert.deepEqual(actual[key],row[key]);
  const shard=dictionary.english.shards.find(s=>s.bucket===row.canonicalId%128),bytes=await readFile(new URL('../../vocab/data/expanded-dictionary/'+shard.file,import.meta.url));
  assert.equal(bytesHash(bytes),shard.sha256);assert.deepEqual(JSON.parse(bytes).records.find(r=>r.id===row.canonicalId&&r.term===row.term),row.exactCanonicalRecord);
 }
 assert.deepEqual(repairs.rows.filter(r=>!baseline.canonicalRows.some(old=>old.term===r.term)).map(r=>r.term),['TB','cart','laundry']);
});

test('canonical medical, horse-cart and clean-laundry pairs appear only on their complete source identities',async()=>{
 try{for(const {source}of canonicalPacks)for(const row of source.entries){
  for(const context of row.acceptedDisplayContexts)for(const nested of [false,true]){
   const card={...context,meaning:nested?{zh:context.meaning}:context.meaning,example:'Keep the existing sentence.',bookPassage:'Keep the existing passage.',study:{box:3,correct:5}},before=structuredClone(card);
   const found=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:fileFetch});
   assert.deepEqual(found.senses[0].examples,[{en:row.replacementPair.en,zh:row.replacementPair.zh}]);assert.equal(found.senses[0].source,'原创学习例句');assert.deepEqual(card,before);
  }
  const wrong=[...row.expectedOriginalEntry.senses.map(s=>({partOfSpeech:s.partOfSpeech,meaning:s.meaningZh})),{partOfSpeech:'interjection',meaning:row.exactCanonicalRecord.meaning},{partOfSpeech:row.exactCanonicalRecord.partOfSpeech,meaning:'Unrelated personal definition.'}];
  if(row.term==='TB')wrong.push({partOfSpeech:'noun',meaning:'结核杆菌'},{partOfSpeech:'noun',meaning:'[计] 太字节(万亿字节)'},{partOfSpeech:'noun',meaning:'结核病'});
  for(const context of wrong){let reads=0;const card={term:row.term,...context,example:'Keep the original.',bookPassage:'Keep the passage.',study:{box:5}},before=structuredClone(card);
   assert.equal(await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:async()=>{reads++;throw Error('A partial or different sense must fail before source reads');}}),null);assert.equal(reads,0);assert.deepEqual(card,before);
  }
 }}finally{resetDictionaryExamplesCacheForTests();}
});

test('all twelve immutable original DTOs remain available and no selected example leaks onto old saved meanings',async()=>{
 const dictionary=JSON.parse(await readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url),'utf8'));
 const reader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:fileFetch});
 try{
  for(const {source}of canonicalPacks)for(const row of source.entries)assert.deepEqual(await reader.load(row.term,{lookupQuery:row.term}),row.expectedOriginalEntry);
  for(const row of pack.entries){const dto=await reader.load(row.term,{lookupQuery:row.term}),oldPairs=dto.senses.flatMap(s=>s.examples);
   const shard=dictionary.english.shards.find(s=>s.bucket===row.canonicalId%128),bytes=await readFile(new URL('../../vocab/data/expanded-dictionary/'+shard.file,import.meta.url));assert.equal(bytesHash(bytes),shard.sha256);
   const original=JSON.parse(bytes).records.find(r=>r.id===row.canonicalId&&r.term===row.term);assert.equal(hash(original),row.canonicalSourceSha256);
   for(const context of [...canonicalDisplayContexts(original),...dto.senses.map(s=>({term:row.term,partOfSpeech:s.partOfSpeech,meaning:s.meaningZh}))]){
    const card={...context,examples:oldPairs,example:'My old sentence.',bookPassage:'My old passage.',study:{box:4}},before=structuredClone(card);
    const optional=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:fileFetch});assert.deepEqual(card,before);
    for(const pair of optional?.senses.flatMap(s=>s.examples)??[])assert(oldPairs.some(old=>old.en===pair.en&&old.zh===pair.zh),row.term);
   }
  }
 }finally{reader.close();resetDictionaryExamplesCacheForTests();}
});

test('qualified classroom aliases neither steal established meanings nor match unrelated compound intentions',async()=>{
 for(const [query,term]of [['获得','get'],['赢得','win'],['急剧下降','sink like a stone']])assert.equal((await searchExpandedDictionary(query,{fetchImpl:fileFetch})).results[0].term,term);
 for(const [query,term]of [['不太靠谱','iffy'],['不太稳妥','dicey'],['模糊的图像','illegible'],['付钱请来的清洁工','homemaker'],['呼吸很快','shortness of breath']]){
  const result=await searchExpandedDictionary(query,{fetchImpl:fileFetch});assert(!result.results.some(r=>r.term===term),query);
 }
 for(const query of ['不是小字条款','字迹看不清和购物','体弱但安排没把握']){
  const result=await searchExpandedDictionary(query,{fetchImpl:fileFetch});assert(!result.results.some(r=>pack.entries.some(p=>p.term===r.term)),query);
 }
});
