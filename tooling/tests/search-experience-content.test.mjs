import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadSearchExperienceContent} from '../scripts/build-search-experience-content.mjs';
import {EVERYDAY_LOOKUP_ENTRIES,EVERYDAY_CHINESE_ALIASES} from '../../vocab/js/everyday-lookup-data.js';
import {REVIEWED_SENSE_ENTRIES} from '../../vocab/js/reviewed-senses-data.js';
import {historicalOrdinary1028,historicalSelected199} from './helpers/search-history-20261119.mjs';
import {historicalOrdinary1044,historicalSelected204} from './helpers/search-followup-history.mjs';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=async file=>JSON.parse(await readFile(new URL(file,import.meta.url),'utf8'));
const forbidden=()=>{throw Error('A compiled exact lookup must not contact an external service or shard');};
const local={fetchImpl:async url=>{assert.equal(new URL(url).protocol,'file:');return new Response(await readFile(url));}};

test('16 reviewed additions append without modifying any of1028 ordinary or199 selected historical objects',async()=>{
  const {packs,module}=await loadSearchExperienceContent(),entries=packs[0].entries;
  assert.equal(module,await readFile(new URL('../../vocab/js/search-experience-data.js',import.meta.url),'utf8'));
  assert.equal(historicalOrdinary1028(EVERYDAY_LOOKUP_ENTRIES).length,1028);
  assert.equal(historicalSelected199(EVERYDAY_LOOKUP_ENTRIES).length,199);
  const ordinary=historicalOrdinary1044(EVERYDAY_LOOKUP_ENTRIES);
  assert.equal(ordinary.length,1044);assert.deepEqual(ordinary.slice(1028),entries);
  assert.equal(hash(EVERYDAY_CHINESE_ALIASES),'9625af76bacc7ed9d96029e4ba3722cc5d3b3492e577dae1d922d64051bafa5f');
  assert.equal(historicalSelected204(REVIEWED_SENSE_ENTRIES).length,204);
});

test('new complete heads and reviewed variants retrieve identical local bilingual cards and preserve saved examples',async()=>{
  const {entries}=await loadSearchExperienceContent();
  for(const row of entries){
    for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
      const result=await searchExpandedDictionary(query,{fetchImpl:forbidden});
      const found=result.results.find(item=>item.term===row.term);assert(found,query);
      assert.equal(found.partOfSpeech,row.partOfSpeech,query);assert.equal(found.meaning,row.meaning,query);
    }
    const card={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning,
      example:'Keep my book example.',exampleTranslation:'保留原文例句。',note:'Keep my note.',study:{correct:4,wrong:2}};
    const saved=JSON.stringify(card),examples=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:forbidden});
    assert(examples.senses.some(sense=>sense.examples.some(pair=>pair.en===row.en&&pair.zh===row.zh)),row.term);
    assert.equal(JSON.stringify(card),saved);
  }
});

test('five corrections retain canonical IDs and raw source identity while separating freezer/login senses',async()=>{
  const pack=await read('../dictionary/reviewed-senses/source/batch-0015.json');
  const before=await read('../dictionary/everyday-expansions/2026-11-19-search-experience/canonical-before.json');
  for(const row of pack.entries){
    const canonical=before.find(item=>item.term===row.term);assert(canonical,row.term);
    assert.equal(row.canonicalId,canonical.id);assert.equal(row.canonicalSourceSha256,hash(canonical));
    const result=await searchExpandedDictionary(row.term,local);assert.equal(result.results[0].meaning,row.meaning);
    assert.equal(result.results[0].partOfSpeech,row.partOfSpeech);
  }
  const freezer=REVIEWED_SENSE_ENTRIES.find(row=>row.term==='freezer');assert(!freezer.chineseAliases.includes('冰箱'));
  for(const term of ['log in','sign in'])assert(!REVIEWED_SENSE_ENTRIES.find(row=>row.term===term).meaning.includes('注册'));
  const fluke=await searchExpandedDictionary('by some fluke',local);assert.equal(fluke.results[0].term,'by some fluke');
  assert(!historicalOrdinary1044(EVERYDAY_LOOKUP_ENTRIES).some(row=>row.term==='by a fluke'));
});
