import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
const ORIGIN='http://127.0.0.1:4187',API=ORIGIN+'/api/v1/member/';
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const summaryPattern=row=>new RegExp('^1\\. (?:[^\\r\\n：]+：)?'+escape(row.partOfSpeech)+' · '+escape(row.meaningZh)+'$','u');
const json=async file=>JSON.parse(await readFile(new URL(file,import.meta.url),'utf8'));
const queue=await json('../../dictionary/examples/queues/batch-0021.json'),choices=new Map();
const wanted=['noun','adjective','proper noun','article','pronoun','verb'];
for(const batch of queue.batches){
 const file=batch.batchId.replace('examples-','batch-')+'.json';
 const pack=await json('../../dictionary/examples/source/'+file),review=await json('../../dictionary/examples/reviews/'+file),approved=new Set(review.approvedTerms);
 for(const row of pack.entries)if(approved.has(row.term)&&wanted.includes(row.partOfSpeech)&&!choices.has(row.partOfSpeech))choices.set(row.partOfSpeech,row);
}
expect([...choices.keys()].sort()).toEqual([...wanted].sort());
test.use({serviceWorkers:'block'});
const request=(context,method,path,data,session)=>context.request.fetch(API+path,{method,
 headers:{'X-Wordbook-Auth':'member','X-Wordbook-Fields':'partOfSpeech',...(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json'}),...(session?{'X-CSRF-Token':session.csrfToken}:{})},...(data===undefined?{}:{data})});
for(const[index,[pos,row]]of [...choices.entries()].entries()){
 test(`batch0021 public lookup ${pos} shows the exact reviewed bilingual example`,async({page})=>{
  const writes=[];page.on('request',req=>{if(req.url().includes('/api/')&&req.method()!=='GET')writes.push(req.url());});
  await page.setViewportSize({width:index%2?1024:390,height:844});await page.goto('/dictionary.html');
  await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');
  const content=page.locator('#dictionary-example-content');await expect(content.locator('summary')).toHaveText(summaryPattern(row));
  if(!await content.locator('details').evaluate(el=>el.open))await content.locator('summary').click();
  await expect(content.locator('p[lang="en"]')).toBeVisible();await expect(content.locator('p[lang="zh-CN"]')).toBeVisible();
  await expect(content.locator('p[lang="en"]')).toHaveText(row.en);await expect(content.locator('p[lang="zh-CN"]')).toHaveText(row.zh);
  expect(await content.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);expect(writes).toEqual([]);
 });
 test(`batch0021 saved ${pos} card preserves source sense, user note and learning state after reload`,async({context,page},info)=>{
  await context.addCookies([{name:'e2e_run',value:'examples21-'+createHash('sha256').update(info.testId).digest('hex').slice(0,24),url:ORIGIN}]);
  await page.setViewportSize({width:index%2?1024:390,height:844});
  const registered=await request(context,'POST','register',{username:'examples21_'+index,password:'Synthetic example test 密码 1234'});expect(registered.status()).toBe(200);const session=await registered.json();
  const saved=await request(context,'POST','entries',{term:row.term,partOfSpeech:pos,meaning:row.meaningZh,note:'Keep my own note.',mutationId:randomUUID()},session);expect(saved.status()).toBe(200);
  const before=await(await request(context,'GET','entries')).json(),learning=await(await request(context,'GET','learning')).json(),writes=[];
  page.on('request',req=>{if(req.url().includes('/api/')&&req.method()!=='GET')writes.push(req.url());});
  await page.goto('/personal.html?auth=member');await expect(page.locator('.personal-entry')).toHaveCount(1);
  async function check(){
   await page.getByRole('button',{name:`查看 ${row.term}`,exact:true}).click();
   const examples=page.locator('.dictionary-learning-examples');await expect(examples).toHaveAttribute('data-term',row.term);
   await expect(examples.locator('h4')).toHaveText(`${pos} · ${row.meaningZh}`);await expect(examples.locator('[lang="en"]')).toHaveText(row.en);await expect(examples.locator('[lang="zh-CN"]')).toHaveText(row.zh);
   await expect(page.locator('#member-detail-note')).toHaveText('Keep my own note.');expect(await examples.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  }
  await check();await page.locator('#member-detail-close').click();await page.reload();await check();
  expect(await(await request(context,'GET','entries')).json()).toEqual(before);expect(await(await request(context,'GET','learning')).json()).toEqual(learning);expect(writes).toEqual([]);
 });
}
