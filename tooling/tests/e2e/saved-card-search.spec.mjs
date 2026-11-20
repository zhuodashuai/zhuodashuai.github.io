import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parsePublicSnapshot,normalizePublicSearchQuery,publicEntryMatchesQuery,rankExactEntryMatches} from '../../../vocab/js/wordbook-schema.js';
import {sortWordbookEntries} from '../../../vocab/js/entry-sort.js';
import {ownerPublicEntries} from '../../../vocab/js/owner-public-library.js';
import {expectFullPublicEntry} from './public-entry-assertions.mjs';

const ORIGIN='http://127.0.0.1:4187';
const snapshot=parsePublicSnapshot(JSON.parse(await readFile(new URL('../../../vocab/data/owner-wordbook.json',import.meta.url),'utf8')));
const probes=['hip','hip,','ＨＩＰ','jab   at','agita','Kathy','Never Let Me Go','监视'];
// These five preserved queries have the same source-field matches under the
// prior matcher. Only the three typography-equivalent hip probes remove the
// independently audited internal fragments; no app matcher is used as oracle.
function expected(query,entries=snapshot.entries){return normalizePublicSearchQuery(query)==='hip'
 ?entries.filter(entry=>entry.term==='hip'):entries.filter(entry=>publicEntryMatchesQuery(entry,query));}
test.use({serviceWorkers:'block'});
test.beforeEach(async({context,page})=>{
 await context.addCookies([{name:'e2e_run',value:'saved-filter-'+randomUUID(),url:ORIGIN}]);
 page.on('pageerror',error=>{throw error;});
});
test.afterEach(async({page,context})=>{await page.unrouteAll({behavior:'wait'});await context.unrouteAll({behavior:'wait'});});
const publicIds=page=>page.locator('#entry-grid button[data-entry-id][data-entry-action="detail"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.entryId));
const ownerIds=page=>page.locator('#member-owner-public-list button[data-owner-public-entry]').evaluateAll(nodes=>nodes.map(node=>node.dataset.ownerPublicEntry));

for(const width of [390,1280])for(const mode of ['public','owner'])test(`saved ${mode} filtering keeps whole Latin starts and complete source cards at ${width}px`,async({page,context},testInfo)=>{
 await page.setViewportSize({width,height:900});
 if(mode==='owner'){
  await context.addCookies([{name:'e2e_auth',value:'owner',url:ORIGIN}]);
  await context.route('**/api/v1/public/wordbook*',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await context.request.get(ORIGIN+'/api/v1/public/wordbook');await route.fulfill({response});});
  await page.goto('/personal.html?auth=owner');await expect(page.locator('#member-owner-public-panel')).toBeVisible();await expect(page.locator('#member-owner-public-list')).toHaveAttribute('aria-busy','false');await expect(page.locator('#member-owner-public-status')).toContainText(snapshot.entries.length+' 个公开词条');
 }else{await page.goto('/');await expect(page.locator('#entry-count')).toHaveText(String(snapshot.entries.length));}
 const writes=[],foreign=[];context.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());if(new URL(request.url()).origin!==ORIGIN)foreign.push(request.url());});
 const evidence=[],ordered=mode==='owner'?ownerPublicEntries(snapshot,[]):snapshot.entries;
 const input=page.locator(mode==='owner'?'#member-owner-public-search':'#library-search');
 for(const query of probes){
  await input.fill(query);
  const rows=mode==='owner'?expected(query,ordered):rankExactEntryMatches(sortWordbookEntries(expected(query),'newest'),normalizePublicSearchQuery(query));
  if(mode==='public'){
   if(await page.locator('#library-show-all').isVisible())await page.locator('#library-show-all').click();
   const ids=await publicIds(page);evidence.push({query,expected:rows.map(x=>x.id),actual:ids});expect.soft(ids).toEqual(rows.map(x=>x.id));
  }else{
   const ids=await ownerIds(page);evidence.push({query,expected:rows.map(x=>x.id),actual:ids});expect.soft(ids).toEqual(rows.slice(0,20).map(x=>x.id));
   expect.soft(await page.locator('#member-owner-public-status').innerText()).toContain('匹配 '+rows.length+' 项');
   if(query==='Kathy'){
    await page.locator('#member-owner-public-more').click();await expect.poll(()=>ownerIds(page)).toHaveLength(40);expect(await ownerIds(page)).toEqual(rows.slice(0,40).map(x=>x.id));
   }
  }
 }
 await input.fill('hip');const hip=snapshot.entries.find(row=>row.term==='hip');
 await testInfo.attach('saved-card-query-source-ids',{body:JSON.stringify({mode,width,evidence},null,2),contentType:'application/json'});
 await input.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('saved-filter.png')});
 if(mode==='public'){
  await page.locator(`#entry-grid button[data-entry-id="${hip.id}"][data-entry-action="detail"]`).click();await expectFullPublicEntry(page,hip);await page.keyboard.press('Escape');await expect(page.locator('#entry-dialog')).toBeHidden();
  await page.goto('/?book=never-let-me-go&chapter=chapter-1');await expect(page.locator('#chapter-tabs button[data-value="chapter-1"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#library-search').fill('hip');expect.soft(await publicIds(page)).toEqual([]);expect.soft(await page.locator('#search-empty-message').innerText()).toContain('其他章节或词本中找到 1 个相关词条');
  await page.locator('#library-search').fill('agita');await expect(page.locator('#entry-grid h3')).toHaveText(['agitated']);
  expect(new URL(page.url()).searchParams.get('chapter')).toBe('chapter-1');
 }else{
  const target=page.locator(`#member-owner-public-list button[data-owner-public-entry="${hip.id}"]`);
  for(let step=0;step<10&&!await target.count();step++){const count=(await ownerIds(page)).length;await page.locator('#member-owner-public-more').click();await expect.poll(async()=>(await ownerIds(page)).length).toBeGreaterThan(count);}
  await target.click();let destination;
  await expect.poll(()=>{destination=context.pages().find(candidate=>{const url=new URL(candidate.url());return url.origin===ORIGIN&&url.searchParams.get('entry')===hip.id;});return Boolean(destination);}).toBe(true);
  await expectFullPublicEntry(destination,hip);
 }
 expect(writes).toEqual([]);expect(foreign).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
