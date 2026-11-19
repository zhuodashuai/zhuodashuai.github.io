import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {parsePublicSnapshot,publicEntryMatchesQuery,normalizePublicSearchQuery,contextualizeReadingEntry} from '../../../vocab/js/wordbook-schema.js';
import {sortWordbookEntries} from '../../../vocab/js/entry-sort.js';
import {filterLearningEntries} from '../../../vocab/js/reading-card-policy.js';
import {createChapterQuiz} from '../../../vocab/js/chapter-quiz.js';
import {expectFullPublicEntry} from './public-entry-assertions.mjs';

const raw=JSON.parse(await readFile(new URL('../../../vocab/data/owner-wordbook.json',import.meta.url),'utf8'));
const snapshot=parsePublicSnapshot(raw),all=snapshot.entries,ordered=sortWordbookEntries(all,'newest');
const ids=rows=>rows.map(row=>row.id);
const visibleIds=page=>page.locator('#entry-grid .card-open').evaluateAll(nodes=>nodes.map(node=>node.dataset.entryId));
const far=ordered.find((row,index)=>index>640&&all.filter(other=>other.term.toLowerCase()===row.term.toLowerCase()).length===1);
const firstStudy=all[0];
const cohorts=all.slice(0,175),cohortIds=new Set(ids(cohorts));
const largeChapter={...raw,revisionId:raw.revisionId+'-card-window-chapter',entries:raw.entries.map(entry=>cohortIds.has(entry.id)
  ?{...entry,tags:[...entry.tags,'collection:card-window-test:chapter-1']}:entry)};
const preview=createChapterQuiz(cohorts,{bookId:'card-window-test',chapterId:'chapter-1',id:'window-fixture-preview',random:()=>.5});
expect(preview.questions).toHaveLength(175);expect(preview.omitted).toEqual([]);

test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});

async function sourceResponse(page,getSnapshot){
  const handler=route=>route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(getSnapshot())});
  await page.route('**/api/v1/public/wordbook*',handler);await page.route('**/data/owner-wordbook.json*',handler);
}

for(const variant of ['current-v113','current-reusable'])test.describe(variant,()=>{
  test.beforeEach(async({page})=>{
    if(variant==='current-reusable')await page.route('**/js/public-app-v113.js*',async route=>route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../../../vocab/js/public-app.js',import.meta.url),'utf8')}));
    page.on('pageerror',error=>{throw error;});
  });

  test('the default window, explicit more/all and focus preserve every source ID without learning writes',async({page})=>{
    await page.goto('/');await expect(page.locator('#entry-count')).toHaveText(String(all.length));
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    expect(await visibleIds(page)).toEqual(ids(ordered.slice(0,160)));
    await expect(page.locator('#library-card-window-status')).toHaveText(`已显示 160/${all.length}`);
    expect(await page.locator('#library-show-more').evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.locator('#library-show-more').click();await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
    expect(await visibleIds(page)).toEqual(ids(ordered.slice(0,320)));
    await expect(page.locator('#library-card-window-status')).toHaveText(`已显示 320/${all.length}`);
    // These inputs preserve the same search and ordering, so expanding the
    // view must not be undone by selecting the default or harmless spacing.
    await page.locator('#library-sort').selectOption('newest');
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
    for(const query of ['   ','']){
      await page.locator('#library-search').fill(query);await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
      expect(await visibleIds(page)).toEqual(ids(ordered.slice(0,320)));
    }
    await page.locator('#library-show-all').click();await expect(page.locator('#entry-grid .word-card')).toHaveCount(all.length);
    expect(await visibleIds(page)).toEqual(ids(ordered));await expect(page.locator('#library-card-window')).toBeHidden();
    await expect(page.locator('#entry-grid .card-open').nth(320)).toBeFocused();
    await expect(page.locator('#entry-count')).toHaveText(String(all.length));
    expect(await page.evaluate(async()=>(await import('/js/owner-storage.js?v=82')).listReviewStates())).toEqual([]);
  });

  test('full-source search and view changes reset the window while a small chapter keeps all its cards',async({page})=>{
    await page.goto('/');await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.locator('#library-show-more').click();await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
    await page.locator('#show-repeated-reading-cards').check();await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.locator('#show-repeated-reading-cards').uncheck();
    await page.locator('#library-show-more').click();await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
    await page.locator('#library-search').fill(far.term);
    const matches=sortWordbookEntries(all.filter(row=>publicEntryMatchesQuery(row,normalizePublicSearchQuery(far.term))),'newest');
    await expect(page.locator(`#entry-grid .card-open[data-entry-id="${far.id}"]`)).toBeVisible();
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(Math.min(160,matches.length));
    await expect(page.locator('#entry-count')).toHaveText(String(all.length));
    await page.locator('#library-search').fill('');await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.locator('#library-show-more').click();await page.locator('#library-sort').selectOption('oldest');
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    expect(await visibleIds(page)).toEqual(ids(sortWordbookEntries(all,'oldest').slice(0,160)));
    await page.locator('#library-show-more').click();await page.locator('#filter-row [data-filter="word"]').click();
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.locator('#collection-tabs [data-value="never-let-me-go"]').click();
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.locator('#filter-row [data-filter="all"]').click();await page.locator('#library-show-more').click();
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
    await page.locator('#chapter-tabs [data-value="chapter-12"]').click();
    const chapter=filterLearningEntries(all,'never-let-me-go','chapter-12').map(row=>contextualizeReadingEntry(row,'never-let-me-go','chapter-12'));
    await expect(page.locator('#entry-count')).toHaveText('23');await expect(page.locator('#entry-grid .word-card')).toHaveCount(23);
    expect(await visibleIds(page)).toEqual(ids(sortWordbookEntries(chapter,'oldest')));
    await expect(page.locator('#library-card-window')).toBeHidden();
    await page.locator('#library-search').fill('there-is-no-such-card');await expect(page.locator('#entry-grid .word-card')).toHaveCount(0);
    await expect(page.locator('#library-card-window')).toBeHidden();
    await page.locator('#view-controls [data-view="passages"]').click();await expect(page.locator('#library-card-window')).toBeHidden();
  });

  test('unchanged source refresh preserves expansion and a real revision restores the initial limit',async({page})=>{
    let reads=0,value=raw;
    await sourceResponse(page,()=>{reads++;return value;});
    await page.goto('/');await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.waitForLoadState('networkidle');await page.locator('#library-show-more').click();
    const before=reads;await page.evaluate(()=>dispatchEvent(new Event('online')));
    await expect.poll(()=>reads).toBeGreaterThan(before);await page.waitForLoadState('networkidle');
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
    value={...raw,revisionId:raw.revisionId+'-card-window-revision',exportedAt:new Date(Date.parse(raw.exportedAt)+1000).toISOString()};
    await page.evaluate(()=>dispatchEvent(new Event('online')));await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await expect(page.locator('#entry-count')).toHaveText(String(all.length));
  });

  test('forced refreshes during a held old read coalesce into one latest-source read without a focus storm',async({page})=>{
    let reads=0,value=raw,holdNext=false,releaseOld,oldReached;
    const held=new Promise(resolve=>{releaseOld=resolve;}),seen=new Promise(resolve=>{oldReached=resolve;});
    const writes=[];page.on('request',request=>{if(!['GET','HEAD','OPTIONS'].includes(request.method()))writes.push(request.url());});
    const handler=async route=>{
      // Capture the old source before the gate: changing value cannot turn
      // that pending response into the fresh revision being tested.
      const captured=structuredClone(value);reads++;
      if(holdNext){holdNext=false;oldReached();await held;}
      await route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(captured)});
    };
    await page.route('**/api/v1/public/wordbook*',handler);await page.route('**/data/owner-wordbook.json*',handler);
    try{
      await page.goto('/');await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
      await page.waitForLoadState('networkidle');await page.locator('#library-show-more').click();
      await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
      const initialReads=reads;holdNext=true;await page.evaluate(()=>dispatchEvent(new Event('online')));await seen;
      expect(reads).toBe(initialReads+1);
      value={...raw,revisionId:raw.revisionId+'-queued-forced-refresh',exportedAt:new Date(Date.parse(raw.exportedAt)+1000).toISOString()};
      await page.evaluate(()=>{for(let i=0;i<8;i++){dispatchEvent(new Event('online'));dispatchEvent(new Event('focus'));}});
      expect(reads).toBe(initialReads+1);await expect(page.locator('#entry-grid .word-card')).toHaveCount(320);
      releaseOld();await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
      expect(reads).toBe(initialReads+2);expect(await visibleIds(page)).toEqual(ids(ordered.slice(0,160)));
      await expect(page.locator('#entry-count')).toHaveText(String(all.length));expect(writes).toEqual([]);
      expect(await page.evaluate(async()=>(await import('/js/owner-storage.js?v=82')).listReviewStates())).toEqual([]);
    }finally{releaseOld();await page.unrouteAll({behavior:'wait'});}
  });

  test('study still reaches a card outside the window and a large chapter quiz uses all175 source identities',async({page})=>{
    await page.goto('/');await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    expect(await visibleIds(page)).not.toContain(firstStudy.id);await expect(page.locator('#due-count')).toHaveText(String(all.length));
    await page.locator('#study-button').click();await expect(page.locator('#dialog-term')).toHaveText(firstStudy.term);
    await expect(page.locator('#dialog-review-status')).toContainText(`本轮 1/${all.length}`);
    await page.keyboard.press('Escape');
    await sourceResponse(page,()=>largeChapter);await page.goto('/?book=card-window-test&chapter=chapter-1');
    await page.locator('#show-repeated-reading-cards').check();
    await expect(page.locator('#entry-count')).toHaveText('175');await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.locator('#chapter-quiz-button').click();await page.locator('#quiz-start').click();
    await expect(page.locator('#quiz-options > button')).toHaveCount(4);
    const attempt=await page.evaluate(async()=>(await import('/js/quiz-storage.js?v=82')).quizStorage.listAttempts({bookId:'card-window-test',chapterId:'chapter-1'}));
    expect(attempt[0].questions).toHaveLength(175);expect(attempt[0].omitted).toEqual([]);
    expect(new Set(attempt[0].questions.map(question=>question.entryId))).toEqual(cohortIds);
    await page.locator('#quiz-close').click();expect(await page.evaluate(async()=>(await import('/js/owner-storage.js?v=82')).listReviewStates())).toEqual([]);
    await page.locator('#library-show-more').click();await expect(page.locator('#entry-grid .word-card')).toHaveCount(175);
    await expect(page.locator('#library-card-window')).toBeHidden();await expect(page.locator('#entry-grid .card-open').nth(160)).toBeFocused();
  });

  test('an explicit card deep link retains the full source DOM and its exact modal invoker',async({page})=>{
    await page.goto(`/?entry=${encodeURIComponent(far.id)}`);
    await expect(page.locator('#entry-dialog')).toBeVisible();await expect(page.locator('#dialog-term')).toHaveText(far.term);
    await expect(page.locator('#entry-grid .word-card')).toHaveCount(all.length);await expect(page.locator('#library-card-window')).toBeHidden();
    await page.keyboard.press('Escape');await expect(page.locator(`#entry-grid .card-open[data-entry-id="${far.id}"]`)).toBeFocused();
  });

  test('a missing cached deep-link target stays bounded until its exact fresh card arrives',async({page})=>{
    const target=all.find(row=>row.term==='hip');
    const old={...raw,revisionId:'window-target-not-cached',entries:raw.entries.filter(row=>row.id!==target.id)};
    await page.route('**/__card-window-cache-bootstrap',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Cache fixture</title>'}));
    await page.goto('/__card-window-cache-bootstrap');
    await page.evaluate(async cached=>(await import('/js/owner-storage.js?v=82')).putPublicCache(cached),old);
    let release,reached;const gate=new Promise(resolve=>{release=resolve;}),seen=new Promise(resolve=>{reached=resolve;});
    await page.route('**/api/v1/public/wordbook*',async route=>{
      reached();await gate;
      try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(raw)});}catch{/* A failed assertion can close the gated page. */}
    });
    await page.route('**/data/owner-wordbook.json*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(old)}));
    try{
      await page.goto(`/?entry=${encodeURIComponent(target.id)}`);await seen;
      await expect(page.locator('#entry-count')).toHaveText(String(old.entries.length));
      await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);await expect(page.locator('#entry-dialog')).toBeHidden();
      expect(new URL(page.url()).searchParams.get('entry')).toBe(target.id);
      release();await expectFullPublicEntry(page,target);
      await expect(page.locator('#entry-grid .word-card')).toHaveCount(all.length);
      await page.keyboard.press('Escape');await expect(page.locator(`#entry-grid .card-open[data-entry-id="${target.id}"]`)).toBeFocused();
      await page.goto('/?entry=public-00000000-0000-4000-8000-000000000000');
      await expect(page.locator('#entry-count')).toHaveText(String(all.length));
      await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);await expect(page.locator('#entry-dialog')).toBeHidden();
    }finally{release();}
  });

  test('mobile expansion controls remain reachable and focus the first new card after the last batch',async({page},info)=>{
    await page.setViewportSize({width:390,height:844});await sourceResponse(page,()=>largeChapter);
    await page.goto('/?book=card-window-test&chapter=chapter-1');
    const options=page.locator('#library-options');await options.locator(':scope > summary').click();
    await page.locator('#show-repeated-reading-cards').check();await options.locator(':scope > summary').click();
    await expect(page.locator('#entry-count')).toHaveText('175');await expect(page.locator('#entry-grid .word-card')).toHaveCount(160);
    await page.locator('#library-show-more').scrollIntoViewIfNeeded();
    for(const id of ['library-show-more','library-show-all'])expect(await page.locator('#'+id).evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('mobile-card-window-footer.png'),fullPage:false});
    await page.locator('#library-show-more').click();await expect(page.locator('#entry-grid .word-card')).toHaveCount(175);
    expect(await visibleIds(page)).toEqual(ids(cohorts));await expect(page.locator('#library-card-window')).toBeHidden();
    await expect(page.locator('#entry-grid .card-open').nth(160)).toBeFocused();
    await expect(page.locator('#entry-grid .word-card h3').nth(160)).toHaveText(cohorts[160].term);
  });
});
