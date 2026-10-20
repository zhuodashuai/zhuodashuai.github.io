// Install in tooling/tests/e2e/dictionary-new-examples.spec.mjs after integration.
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const ORIGIN='http://127.0.0.1:4187',API=ORIGIN+'/api/v1/member/';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const queue=await json('../../dictionary/examples/queues/batch-0013.json');
const choices=new Map();
for(const batch of queue.batches){
 const file=batch.batchId.replace('examples-','batch-')+'.json';
 const pack=await json('../../dictionary/examples/source/'+file),review=await json('../../dictionary/examples/reviews/'+file);
 const approved=new Set(review.approvedTerms);
 for(const row of pack.entries)if(approved.has(row.term)&&!choices.has(row.partOfSpeech))choices.set(row.partOfSpeech,row);
 if(choices.size===4)break;
}
expect(choices.size).toBe(4);
test.use({serviceWorkers:'block'});
async function request(context,method,path,data,session){
 return context.request.fetch(API+path,{method,headers:{'X-Wordbook-Auth':'member','X-Wordbook-Fields':'partOfSpeech',
  ...(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json'}),...(session?{'X-CSRF-Token':session.csrfToken}:{})},
  ...(data===undefined?{}:{data})});
}
for(const [index,[pos,row]] of [...choices.entries()].entries())test(`new10000 batch ${pos} example reaches its exact saved card and survives reload`,async({context,page},info)=>{
 await context.addCookies([{name:'e2e_run',value:'new-examples-'+createHash('sha256').update(info.testId).digest('hex').slice(0,24),url:ORIGIN}]);
 page.on('pageerror',error=>{throw error;});
 await page.setViewportSize({width:index%2?1024:390,height:844});
 const registered=await request(context,'POST','register',{username:'new_examples_'+index,password:'Synthetic example test 密码 1234'});
 expect(registered.status()).toBe(200);const session=await registered.json();
 const added=await request(context,'POST','entries',{term:row.term,partOfSpeech:pos,meaning:row.meaningZh,note:'Keep this note unchanged.',mutationId:randomUUID()},session);
 expect(added.status()).toBe(200);
 const before=await(await request(context,'GET','entries')).json();
 const learning=await(await request(context,'GET','learning')).json();
 const writes=[],dataRequests=[];
 page.on('request',req=>{
  if(req.url().includes('/data/dictionary-examples/'))dataRequests.push(req.url());
  if(req.method()!=='GET'&&req.url().includes('/api/'))writes.push(req.url());
 });
 await page.goto('/personal.html?auth=member');
 await expect(page.locator('.personal-entry')).toHaveCount(1);expect(dataRequests).toHaveLength(0);
 async function openAndCheck(){
  await page.getByRole('button',{name:`查看 ${row.term}`,exact:true}).click();
  const view=page.locator('.dictionary-learning-examples');
  await expect(view).toHaveAttribute('data-term',row.term);
  await expect(view.locator('h4')).toHaveText(`${pos} · ${row.meaningZh}`);
  await expect(view.locator('[lang="en"]')).toHaveText(row.en);
  await expect(view.locator('[lang="zh-CN"]')).toHaveText(row.zh);
  await expect(page.locator('#member-detail-note')).toHaveText('Keep this note unchanged.');
  expect(await view.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 }
 await openAndCheck();expect(dataRequests).toHaveLength(2);
 await page.locator('#member-detail-close').click();await page.reload();await openAndCheck();
 expect(await(await request(context,'GET','entries')).json()).toEqual(before);
 expect(await(await request(context,'GET','learning')).json()).toEqual(learning);
 expect(writes).toEqual([]);
});
