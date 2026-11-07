import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createReadingFrequencyIndex, parseReadingFrequency, readingFrequencyText,
  readRepeatedReadingPreference, saveRepeatedReadingPreference, REPEATED_READING_CARDS_KEY } from '../js/reading-frequency.js';

const payload=()=>({schemaVersion:1,collectionId:'teamwork',entries:{'public-frequency-fixture':{
  totalOccurrences:4,articleCount:2,articles:[
    {chapterId:'chapter-1',articleTitle:'First article',count:3,pages:[{pdfPage:3,count:2},{pdfPage:4,count:1}]},
    {chapterId:'chapter-2',articleTitle:'Second article',count:1,pages:[{pdfPage:2,count:1}]}
  ]
}}});

test('repeated cards default to hidden and the reversible setting survives storage failures',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  assert.equal(readRepeatedReadingPreference(storage),false);
  saveRepeatedReadingPreference(true,storage);assert.equal(data.get(REPEATED_READING_CARDS_KEY),'true');
  assert.equal(readRepeatedReadingPreference(storage),true);
  saveRepeatedReadingPreference(false,storage);assert.equal(readRepeatedReadingPreference(storage),false);
  const denied={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal(readRepeatedReadingPreference(denied),false);assert.doesNotThrow(()=>saveRepeatedReadingPreference(true,denied));
});

test('frequency totals are backed by actual article and page counts',()=>{
  const p=payload();assert.equal(parseReadingFrequency(p).get('public-frequency-fixture').totalOccurrences,4);
  for(const alter of [
    p=>p.entries['public-frequency-fixture'].totalOccurrences++,
    p=>p.entries['public-frequency-fixture'].articleCount++,
    p=>p.entries['public-frequency-fixture'].articles[0].pages[0].count++,
    p=>p.entries['public-frequency-fixture'].articles.push(p.entries['public-frequency-fixture'].articles[0])
  ]){const changed=payload();alter(changed);assert.throws(()=>parseReadingFrequency(changed));}
});

test('optional frequency metadata loads once and never blocks reading after failure or timeout',async()=>{
  let calls=0,updates=0;
  const index=createReadingFrequencyIndex({fetcher:async()=>{calls++;return Response.json(payload());},onChange:()=>updates++});
  assert.equal(await index.load(),true);assert.equal(await index.load(),true);
  assert.equal(calls,1);assert.equal(updates,1);assert.equal(index.get('public-frequency-fixture').articleCount,2);
  const failed=createReadingFrequencyIndex({fetcher:async()=>{throw new Error('offline');}});
  assert.equal(await failed.load(),false);assert.equal(failed.get('missing'),null);
  let finish;
  const delayed=createReadingFrequencyIndex({fetcher:()=>new Promise(resolve=>{finish=resolve;}),timeoutMs:5,onChange:()=>{throw new Error('late data must not change the page');}});
  assert.equal(await delayed.load(),false);
  finish(Response.json(payload()));await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(delayed.get('public-frequency-fixture'),null);
});

test('chapter records are never presented as literal word frequency',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../data/owner-wordbook.json',import.meta.url)));
  const entry=snapshot.entries.find(entry=>entry.term==='groupthink');
  assert.equal(readingFrequencyText(entry,null),'已记录 3 个来源章节');
  assert.equal(readingFrequencyText(entry,{totalOccurrences:8,articleCount:4}),'Teamwork 原文 8 次 · 4 篇');
  assert.equal(readingFrequencyText(entry,{totalOccurrences:0,articleCount:0}),'已记录 3 个来源章节');
  const main=snapshot.entries.find(entry=>!entry.readingContexts?.length);
  assert.equal(readingFrequencyText(main,null,{repeatedOnly:true}),'');
});

test('the active public shell retains old programs while loading the reversible reading policy',async()=>{
  const [html,program,detail,sw]=await Promise.all([
    readFile(new URL('../index.html',import.meta.url),'utf8'),readFile(new URL('../js/public-app-v113.js',import.meta.url),'utf8'),
    readFile(new URL('../js/entry-detail-v113.js',import.meta.url),'utf8'),readFile(new URL('../sw.js',import.meta.url),'utf8')
  ]);
  assert.match(html,/src="js\/public-app-v113\.js\?v=114"/u);
  assert.match(program,/respectCurrentScope: true/u);assert.match(program,/filterLearningEntries\(entries, state.collectionId, state.chapterId, \{ showRepeated: state.showRepeated \}\)/u);
  assert.match(program,/显示重复词/u);assert.match(detail,/阅读频率与来源/u);
  assert.match(detail,/dictionary-examples-ui-v108\.js/u);
  for(const file of ['public-app-v108.js','entry-detail-v108.js','public-app-v113.js','entry-detail-v113.js','reading-card-policy.js','reading-frequency.js','chapter-quiz-ui.js?v=113'])assert.ok(sw.includes(`./js/${file}`),file);
  assert.ok(sw.includes('./data/reading-lists/teamwork/frequency.json'));assert.match(sw,/const CACHE_NAME = "zhuo-wordbook-v100";/u);
});
