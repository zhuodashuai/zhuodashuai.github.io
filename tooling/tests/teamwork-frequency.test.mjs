import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { articlePageContent, assertTeamworkFrequencyCurrent, countSurfaceOccurrences,
  frequencySurfaces, normalizeFrequencyText } from '../scripts/build-teamwork-frequency.mjs';

test('frequency matching normalizes PDF ligatures, broken words and compound typography',()=>{
  const text='The ﬁrm faced a back-\nlog. Its 360degree feedback was useful. Effic acy mattered.';
  assert.match(normalizeFrequencyText(text),/firm faced a backlog/u);
  assert.equal(countSurfaceOccurrences(text,['backlog','backlogs']).count,1);
  assert.equal(countSurfaceOccurrences(text,['360-degree feedback']).count,1);
  assert.equal(countSurfaceOccurrences(text,['efficacy']).count,1);
});

test('frequency counts full source words, not substrings, and merges overlapping variants once',()=>{
  assert.equal(countSurfaceOccurrences('Dissent, dissents, dissenting, and nondissent.',['dissent','dissents']).count,2);
  const result=countSurfaceOccurrences('A priori assessment; another a priori assessment.',['a priori','a priori assessment']);
  assert.equal(result.count,2);
  assert.equal(result.spans[0].start,0);
});

test('source surfaces reject full prose aliases while accepting recorded number and spelling forms',()=>{
  const word={id:'example',term:'material',entryType:'word',standardForm:'material',forms:['materials'],
    readingContexts:[{membership:'collection:teamwork:chapter-6',originalInput:'material impact',forms:[]}]};
  assert.deepEqual(frequencySurfaces(word),['material','materials']);
  assert.deepEqual(frequencySurfaces({...word,term:'360-degree feedback',standardForm:'360-degree feedback',forms:[],readingContexts:[]}),['360-degree feedback']);
  assert.deepEqual(frequencySurfaces({...word,term:'crossfire',standardForm:'crossfire',forms:[],readingContexts:[{membership:'collection:teamwork:chapter-5',originalInput:'cross fire'}]}),['crossfire','cross fire']);
});

test('source-reviewed inserted complements count as expressions without inventing synonyms',()=>{
  assert.equal(countSurfaceOccurrences('They were bringing lessons from one project to bear on others.',[],{term:'bring something to bear on'}).count,1);
  assert.equal(countSurfaceOccurrences('They shared lessons with other projects.',[],{term:'bring something to bear on'}).count,0);
  assert.equal(countSurfaceOccurrences('The plan leads us astray.',[],{term:'lead astray'}).count,1);
});

test('article cleaning removes bios and running matter while retaining the following body and sidebars',()=>{
  const text='Body text.\nRob Cross is a professor at a university. Give and Take and Originals.\nFollowing body.\nHarvard Business Review\nThis document is authorized for use by A Person';
  const clean=articlePageContent(text,2,7);
  assert.match(clean,/Body text/u);assert.match(clean,/Following body/u);
  assert.doesNotMatch(clean,/Rob Cross|Harvard Business Review|A Person/u);
});

const sourceDirectory=new URL('../../vocab/data/reading-lists/teamwork/',import.meta.url);
const packets=await Promise.all((await readdir(sourceDirectory)).filter(name=>/^chapter-\d+\.json$/u.test(name))
  .map(async name=>JSON.parse(await readFile(new URL(name,sourceDirectory)))));
const snapshot=JSON.parse(await readFile(new URL('../../vocab/data/owner-wordbook.json',import.meta.url)));
const frequency=JSON.parse(await readFile(new URL('frequency.json',sourceDirectory)));

test('published source counts are bound to current canonical forms and all thirteen article packets',()=>{
  assert.doesNotThrow(()=>assertTeamworkFrequencyCurrent({snapshot,packets,frequency}));
  assert.equal(frequency.sourceArticles.length,13);
  assert.deepEqual(frequency.zeroMatches.map(row=>row.term),['spar','polarize']);
  const originalChapters=new Set(frequency.sourceArticles.slice(0,7).map(article=>article.chapterId));
  const originalArticles=term=>Object.values(frequency.entries).find(entry=>entry.term===term).articles
    .filter(article=>originalChapters.has(article.chapterId));
  const originalCount=term=>originalArticles(term).reduce((total,article)=>total+article.count,0);
  assert.equal(originalCount('groupthink'),5);
  assert.equal(originalArticles('groupthink').length,3);
  assert.equal(originalArticles('dissent').length,3,'The scan finds an occurrence in a source without a separate card membership.');
  assert.equal(originalCount('360-degree feedback'),1);
  assert.equal(originalCount('efficacy'),1);
});

test('input checks reject stale terms, forms and article lists without claiming to recount PDFs',()=>{
  const entry=snapshot.entries.find(entry=>entry.term==='groupthink');
  const changed={...snapshot,entries:snapshot.entries.map(row=>row===entry?{...row,forms:[...row.forms,'novel form']}:row)};
  assert.throws(()=>assertTeamworkFrequencyCurrent({snapshot:changed,packets,frequency}),/inputs changed/u);
  const addedPacket={...packets[0],chapter:{id:'chapter-14',number:14,title:'New article'}};
  assert.throws(()=>assertTeamworkFrequencyCurrent({snapshot,packets:[...packets,addedPacket],frequency}),/inputs changed/u);
  const changedPacket={...packets[0],issue:'A changed source packet'};
  assert.throws(()=>assertTeamworkFrequencyCurrent({snapshot,packets:[changedPacket,...packets.slice(1)],frequency}),/inputs changed/u);
  assert.doesNotThrow(()=>assertTeamworkFrequencyCurrent({snapshot:{...snapshot,revisionId:'another-revision',entries:[...snapshot.entries,{id:'unrelated',term:'unrelated',tags:[]}]},packets,frequency}));
});
