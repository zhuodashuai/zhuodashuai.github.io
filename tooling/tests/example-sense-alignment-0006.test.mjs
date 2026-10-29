import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REVIEWED_SENSE_ENTRIES as allSelected} from '../../vocab/js/reviewed-senses-data.js';
import {CANONICAL_EXAMPLE_REPAIRS as allRepairs} from '../../vocab/js/canonical-example-repairs-data.js';
import {EVERYDAY_LOOKUP_ENTRIES,EVERYDAY_CHINESE_ALIASES} from '../../vocab/js/everyday-lookup-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {canonicalDisplayContexts} from '../../vocab/js/canonical-example-repair-source.js';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=async name=>JSON.parse(await readFile(new URL('../dictionary/'+name,import.meta.url),'utf8'));
const baseline=await read('everyday-expansions/2026-10-29-sense-alignment/baseline.json');
const manifest=await read('everyday-expansions/2026-10-29-sense-alignment/manifest.json');
const pack=await read('reviewed-senses/source/batch-0007.json'),review=await read('reviewed-senses/reviews/batch-0007.json');
const canonicalPacks=await Promise.all(['0006','0007','0008'].map(async n=>({source:await read('examples/canonical-repairs/source/canonical-quality-'+n+'.json'),review:await read('examples/canonical-repairs/reviews/canonical-quality-'+n+'.json')})));
// This release proves the exact historical 147/72 rows. Later additive packs
// have their own complete-current counts and must preserve every row here.
const selectedHeads=new Set([...baseline.selectedRows,...pack.entries].map(r=>r.term));
const canonicalHeads=new Set([...baseline.canonicalRows,...canonicalPacks.flatMap(p=>p.source.entries)].map(r=>r.term));
const selected=allSelected.filter(r=>selectedHeads.has(r.term));
const repairs={...allRepairs,rows:allRepairs.rows.filter(r=>canonicalHeads.has(r.term))};
const fileFetch=async input=>{const url=new URL(input);assert.equal(url.protocol,'file:');return new Response(await readFile(url));};
const noNetwork=()=>{throw Error('A packaged selected sense fell back to a dictionary/provider');};

test('four fully approved curated senses retain every old143/69 row and all ordinary source records',async()=>{
 assert.equal(hash(baseline),'2cdd7548c595a55d18e4e9abb2b91a1cca55073141960d57a982b12e4e67ccc9');
 assert.equal(hash(manifest),'2a35a1158a9cc5f6c432f0be8386c28b3acc808cce6cd1c2e219154b62083df1');
 assert.equal(hash(pack),manifest.sourceSha256);assert.equal(hash(review),manifest.reviewSha256);assert.equal(review.sourceSha256,hash(pack));assert(review.independentOfAuthor);assert.notEqual(review.reviewer,pack.author);assert.deepEqual(review.issues,[]);
 assert.deepEqual(review.approvedTerms,['lane','capture','past','data']);assert.equal(pack.exampleSource,'原创学习例句');
 assert.equal(selected.length,147);assert.equal(new Set(selected.map(r=>r.term)).size,147);assert.equal(repairs.rows.length,72);assert.equal(repairs.rows.reduce((n,r)=>n+1+(r.additionalExamples?.length??0),0),73);
 for(const old of baseline.selectedRows)assert.deepEqual(selected.find(r=>r.term===old.term),old);
 for(const old of baseline.canonicalRows)assert.deepEqual(repairs.rows.find(r=>r.term===old.term),old);
 assert.deepEqual(EVERYDAY_LOOKUP_ENTRIES.filter(r=>!r.reviewedCanonicalSense).slice(0,baseline.ordinaryRows.length),baseline.ordinaryRows);assert.deepEqual(EVERYDAY_CHINESE_ALIASES.slice(0,baseline.aliases.length),baseline.aliases);
 for(const row of pack.entries){const actual=selected.find(r=>r.term===row.term);for(const key of ['term','partOfSpeech','meaning','chineseAliases','englishForms','en','zh','references','canonicalId','canonicalSourceSha256'])assert.deepEqual(actual[key],row[key]);assert.equal(actual.exampleSource,'原创学习例句');}
});

test('curated literal/form/Chinese intentions resolve immediately with the reviewed POS and specific meaning',async()=>{
 let count=0;for(const row of pack.entries)for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
  const result=await searchExpandedDictionary(query,{fetchImpl:noNetwork});assert.equal(result.results[0].term,row.term,query);assert.equal(result.results[0].partOfSpeech,row.partOfSpeech);assert.equal(result.results[0].meaning,row.meaning);count++;
 }
 assert.equal(count,42);
 for(const query of ['获得','赢得','急剧下降']){const found=await searchExpandedDictionary(query,{fetchImpl:fileFetch});assert.equal(found.results[0].term,{'获得':'get','赢得':'win','急剧下降':'sink like a stone'}[query]);}
 for(const query of ['不是车道','过去和数据','捕获和数据']){const found=await searchExpandedDictionary(query,{fetchImpl:fileFetch});assert(!found.results.some(r=>pack.entries.some(p=>p.term===r.term)),query);}
});

test('only the exact whole original data variant survives while wrong technical tails stay inactive',async()=>{
 const policy=await read('reviewed-senses/retained-alternatives-sense-0007.json');assert.equal(hash(policy),manifest.policySha256);assert.equal(policy.entries.length,22);assert.deepEqual(policy.entries.slice(0,21),baseline.retentionPolicy.entries);
 assert.equal(policy.entries[21].term,'data');assert.equal(policy.entries[21].alternatives.length,1);assert.equal(policy.entries[21].alternatives[0].source,'original');
 const data=selected.find(r=>r.term==='data');assert.equal(data.retainedCanonicalAlternatives.length,1);assert(!JSON.stringify(data.retainedCanonicalAlternatives).includes('DOS'));
 for(const term of ['lane','capture','past'])assert(!selected.find(r=>r.term===term).retainedCanonicalAlternatives);
 for(const [query,forbidden]of [['系统日期','data'],['过去分词','past'],['截获命令','capture']]){const found=await searchExpandedDictionary(query,{fetchImpl:fileFetch});assert(!found.results.some(r=>r.term===forbidden),query);}
});

test('three exact independent canonical approvals add only south/contemporary/characterize and keep old valid examples',()=>{
 const fresh=[];for(const {source,review}of canonicalPacks){assert.equal(review.sourceSha256,hash(source));assert(review.independentOfAuthor);assert.notEqual(source.author,review.reviewer);assert.deepEqual(review.issues,[]);assert.equal(source.entries.length,1);
  for(const row of source.entries){fresh.push(row.term);assert.equal(review.decisions.find(d=>d.term===row.term)?.rowSha256,hash(row));assert.equal(hash(row.exactCanonicalRecord),row.canonicalSourceSha256);assert.equal(hash(row.expectedOriginalEntry),row.expectedOriginalEntrySha256);assert.equal(hash(row.replacementPair),row.replacementPairSha256);assert.equal(hash(row.retiredOriginalPair),row.retiredOriginalPairSha256);
   const actual=repairs.rows.find(r=>r.term===row.term);for(const k of ['canonicalId','canonicalSourceSha256','expectedOriginalEntry','acceptedDisplayContexts','replacementPair'])assert.deepEqual(actual[k],row[k]);assert.notEqual(actual.senseId,row.expectedOriginalEntry.senses[0].id);
  }
 }assert.deepEqual(fresh,['south','contemporary','characterize']);assert.deepEqual(repairs.rows.filter(r=>!baseline.canonicalRows.some(old=>old.term===r.term)).map(r=>r.term),['characterize','contemporary','south']);
});

test('canonical examples attach to exact source contexts without changing stored cards or borrowing a different old sense',async()=>{
 for(const {source}of canonicalPacks)for(const row of source.entries){
  for(const context of row.acceptedDisplayContexts){const card={...context,example:'Keep my existing example.',bookPassage:'Keep my book passage.',study:{box:4,correct:7}},before=structuredClone(card);const found=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:fileFetch});assert.deepEqual(found.senses[0].examples,[{en:row.replacementPair.en,zh:row.replacementPair.zh}]);assert.deepEqual(card,before);}
  const old=row.expectedOriginalEntry.senses[0];for(const context of [{partOfSpeech:old.partOfSpeech,meaning:old.meaningZh},{partOfSpeech:'interjection',meaning:row.exactCanonicalRecord.meaning},{partOfSpeech:row.exactCanonicalRecord.partOfSpeech,meaning:'Unrelated personal meaning.'}]){let reads=0;const card={term:row.term,...context,example:old.examples[0].en,bookPassage:'Retain this.',study:{box:2}},before=structuredClone(card);assert.equal(await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:async()=>{reads++;throw Error('Wrong context must fail before source fetch');}}),null);assert.equal(reads,0);assert.deepEqual(card,before);}
 }resetDictionaryExamplesCacheForTests();
});

test('curated examples preserve old saved meanings and native quick lookup without provider calls',async()=>{
 const sourceManifest=JSON.parse(await readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url),'utf8'));
 const raw=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:fileFetch});
 try{for(const row of pack.entries){
  const direct=await lookupPersonalDictionaryFast(row.term,{hotLookup:noNetwork,hotReverse:noNetwork,fullSearch:noNetwork});assert.equal(direct.results[0].term,row.term);assert.equal(direct.results[0].meaning,row.meaning);
  const card={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning,example:'Keep old selected-card sentence.',study:{box:3}},before=structuredClone(card);const found=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:noNetwork});assert.deepEqual(found.senses[0].examples,[{en:row.en,zh:row.zh}]);assert.deepEqual(card,before);
  const dto=await raw.load(row.term,{lookupQuery:row.term}),oldPairs=new Set(dto.senses.flatMap(s=>s.examples).map(p=>JSON.stringify(p)));
  const shard=sourceManifest.english.shards.find(s=>s.bucket===row.canonicalId%128),sourceBytes=await readFile(new URL('../../vocab/data/expanded-dictionary/'+shard.file,import.meta.url));assert.equal(createHash('sha256').update(sourceBytes).digest('hex'),shard.sha256);const original=JSON.parse(sourceBytes).records.find(r=>r.term===row.term&&r.id===row.canonicalId);assert.equal(hash(original),row.canonicalSourceSha256);
  const contexts=[...canonicalDisplayContexts(original),...dto.senses.map(s=>({term:row.term,partOfSpeech:s.partOfSpeech,meaning:s.meaningZh}))];
  for(const context of contexts){const saved={...context,example:'Keep the original student example.',examples:dto.senses.flatMap(s=>s.examples),bookPassage:'Keep the original passage.',study:{box:5,correct:11}},before=structuredClone(saved);const optional=await loadDictionaryExamples(row.term,{savedEntry:saved,fetchImpl:fileFetch});assert.deepEqual(saved,before);for(const pair of optional?.senses.flatMap(s=>s.examples)??[])assert(oldPairs.has(JSON.stringify(pair)),row.term);}
 }}finally{raw.close();resetDictionaryExamplesCacheForTests();}
});
