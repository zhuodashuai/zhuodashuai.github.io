import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {EVERYDAY_LOOKUP_ENTRIES,EVERYDAY_CHINESE_ALIASES} from '../../vocab/js/everyday-lookup-data.js';
import {SEARCH_EXPERIENCE_ENTRIES} from '../../vocab/js/search-experience-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {loadEverydayExamples} from '../../vocab/js/everyday-lookup.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createCanonicalSourceClient} from '../../vocab/js/canonical-example-repair-source.js';
import {CHINESE_QUERY_CACHE_RELEASE} from '../../vocab/js/chinese-query-cache-release.js';
import {historicalRoundaboutAliases47} from './helpers/roundabout-alias-history.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const root=path.resolve(import.meta.dirname,'../..'),folder=new URL('../dictionary/everyday-expansions/2026-11-20-common-followup/',import.meta.url);
const sourceBytes=await readFile(new URL('roundabout-alias-source-v2.json',folder)),source=JSON.parse(sourceBytes);
const reviewBytes=await readFile(new URL('roundabout-alias-review-v2.json',folder)),review=JSON.parse(reviewBytes);
const expected=source.target.fullExistingRow;
const dataRoot=await realpath(path.join(root,'vocab/data')),reads=[];
const fetchImpl=async(url,options)=>{
  const parsed=new URL(url);assert.equal(parsed.protocol,'file:');assert.equal(options.credentials,'omit');
  const file=await realpath(fileURLToPath(parsed)),relative=path.relative(dataRoot,file);assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  reads.push(relative);return new Response(await readFile(file));
};
const forbidden=()=>{throw Error('An existing packaged English head/form must not need a request');};
const display={term:'roundabout',partOfSpeech:expected.partOfSpeech,meaning:expected.meaning,source:'卓的日常词组',license:'Original composition',url:'https://zhuodashuai.github.io/vocab/'};

test('one independently approved alias changes exactly one source line and retains every old47 alias and every full entry',async()=>{
  assert.equal(hash(sourceBytes),'14b3ac625d38786ec614b5ba02aae589354c15c20cd6c47b9d02ef5da5849e11');
  assert.equal(hash(reviewBytes),'749e0f3967c5dbeedc87209fdafd026bd32bba0a961a73a482a3a49b7c95568a');
  assert.equal(review.sourceByteSha256,hash(sourceBytes));assert.equal(review.sourceSha256,hash(source));
  assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,source.author);assert.deepEqual(review.issues,[]);
  assert.deepEqual(review.approvedAliasRows.map(row=>[row.rowSha256,row.targetEntrySha256,row.languageDecision]),
    [[hash(source.newAliasRow),hash(expected),'PASS']]);
  assert.equal(EVERYDAY_CHINESE_ALIASES.length,48);
  assert.equal(hash(historicalRoundaboutAliases47(EVERYDAY_CHINESE_ALIASES)),'9625af76bacc7ed9d96029e4ba3722cc5d3b3492e577dae1d922d64051bafa5f');
  assert.equal(hash(EVERYDAY_LOOKUP_ENTRIES),'a63708dfcb6a7da22e1825aab6eb442ba4c5427c209c14372e531da8474c03fb');
  assert.equal(EVERYDAY_LOOKUP_ENTRIES.length,1290);assert.equal(SEARCH_EXPERIENCE_ENTRIES.length,49);
  const target=EVERYDAY_LOOKUP_ENTRIES.filter(row=>row.term==='roundabout');assert.equal(target.length,1);
  assert.deepEqual(target[0],expected);assert.equal(hash(target[0]),'65a6675a35eca4785fe6ec54d5db727e8ade24ce8827f1544f249cb819397961');
  const bytes=await readFile(path.join(root,source.source.file));assert.equal(hash(bytes),source.source.afterSha256);assert.equal(bytes.length,source.source.afterBytes);
  const current=bytes.toString('utf8');assert.equal(current.split(source.source.exactInsertedLine).length,2);
  const inverse=Buffer.from(current.replace(source.source.exactInsertedLine,''));
  assert.equal(hash(inverse),source.source.beforeSha256);assert.equal(inverse.length,source.source.beforeBytes);
});

test('环岛路口 returns the complete existing traffic noun from the actual uncached source, with its original stable example',async()=>{
  const results=[];let offset=0,total;
  for(;;){const page=await searchExpandedDictionary('环岛路口',{fetchImpl,useChineseQueryCache:false,limit:1,offset});
    assert.equal(page.ranking,'global');assert.equal(page.relatedIntegrated,true);assert(page.coverage===undefined||page.coverage==='full');
    total??=page.total;assert.equal(page.total,total);results.push(...page.results);
    if(!page.hasMore)break;assert(page.nextOffset>offset);offset=page.nextOffset;
  }
  assert.equal(total,1);assert.equal(results.length,1);const found=results[0];
  for(const[key,value]of Object.entries(display))assert.equal(found[key],value,key);
  assert(!found.alternatives?.some(row=>row.meaning.includes('迂回路线')),'Do not promote expanded806216 as a traffic-sense alternative');
  const original={...found,note:'Keep my traffic note.',example:'Keep my book example.',exampleTranslation:'保留原文例句。',folderIds:['reading'],study:{correct:4,wrong:1}};
  const before=JSON.stringify(original),examples=await loadDictionaryExamples(found.term,{savedEntry:original,fetchImpl:forbidden});
  assert.equal(examples.senses.length,1);assert.equal(examples.senses[0].id,'everyday:8c487edc01acbcc8');
  assert.equal(examples.senses[0].partOfSpeech,'noun');assert.equal(examples.senses[0].meaningZh,expected.meaning);
  assert.deepEqual(examples.senses[0].examples,[{en:expected.en,zh:expected.zh}]);assert.equal(JSON.stringify(original),before);
  assert(!reads.some(file=>file.replaceAll('\\','/').startsWith('chinese-query-cache/')));
});

test('English singular/plural displays and the separate old expanded canonical identity remain unchanged',async()=>{
  const singular=await searchExpandedDictionary('roundabout',{fetchImpl:forbidden,useChineseQueryCache:false});
  const plural=await searchExpandedDictionary('roundabouts',{fetchImpl:forbidden,useChineseQueryCache:false});
  assert.deepEqual(singular.results,[display]);assert.deepEqual(plural.results,[{...display,matchedForm:'roundabouts'}]);
  assert.deepEqual(loadEverydayExamples('roundabout'),loadEverydayExamples('roundabouts'));
  const client=createCanonicalSourceClient({version:CHINESE_QUERY_CACHE_RELEASE.dictionaryVersion,manifestSha256:CHINESE_QUERY_CACHE_RELEASE.sourceManifestSha256},{fetchImpl});
  try{
    const raw=await client.readLiteral('roundabout');assert.equal(raw.id,806216);
    assert.equal(hash(raw),'1da101b4b331a35b17b3416ea372b8c91f1e89b013e384593ddafb42778ffe4d');
    assert.equal(raw.meaning,'a. 迂回的, 委婉的\nn. 迂回路线');assert.equal(raw.source,'mit');
    assert.equal(raw.partOfSpeech,'adjective · noun');assert.deepEqual(raw.forms,['roundabouts']);
  }finally{client.close();}
});

test('one-alias history inverse refuses missing, changed, extra, duplicate and reordered source rows',()=>{
  assert.throws(()=>historicalRoundaboutAliases47(EVERYDAY_CHINESE_ALIASES.slice(1)));
  assert.throws(()=>historicalRoundaboutAliases47([...EVERYDAY_CHINESE_ALIASES,source.newAliasRow]));
  for(const mutate of[
    rows=>{rows[47].term='other head';},
    rows=>{delete rows[47].aliases;},
    rows=>{rows[47].aliases.push('旋转木马');},
    rows=>{rows[47].targetEntrySha256='0'.repeat(64);},
    rows=>{delete rows[47].targetEntrySha256;},
    rows=>{rows[0].aliases.push('unapproved');},
    rows=>{[rows[46],rows[47]]=[rows[47],rows[46]];}
  ]){const rows=structuredClone(EVERYDAY_CHINESE_ALIASES);mutate(rows);assert.throws(()=>historicalRoundaboutAliases47(rows));}
});
