import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
const ORIGIN='http://127.0.0.1:4187',API=ORIGIN+'/api/v1/member/';
const json=async file=>JSON.parse(await readFile(new URL(file,import.meta.url),'utf8'));
const rows=(await Promise.all(['p001','p002','p003'].map(id=>json('../../dictionary/examples/source/batch-0022-'+id+'.json')))).flatMap(pack=>pack.entries);
const wanted=['FAX','DNA','HON','PG','IBM','viz','Middle England','bicarb','are','did','had','been'];
const chosen=wanted.map(term=>{const row=rows.find(item=>item.term===term);expect(row).toBeTruthy();return row;});
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const summaryPattern=row=>new RegExp('^1\\. (?:[^\\r\\n：]+：)?'+escape(row.partOfSpeech)+' · '+escape(row.meaningZh)+'$','u');
test.use({serviceWorkers:'block'});

for(const[index,row]of chosen.entries())test(`D22 ${row.term} lookup displays the exact reviewed bilingual pair`,async({page})=>{
 const writes=[],errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('/api/')&&request.method()!=='GET')writes.push(request.url());});
 await page.setViewportSize({width:index%2?1024:390,height:844});await page.goto('/dictionary.html');
 await expect(page.locator('.app-primary-nav a')).toHaveText(['公开词本','查词','随手记','我的词本']);
 await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');
 const content=page.locator('#dictionary-example-content');await expect(content.locator('summary')).toHaveText(summaryPattern(row));
 if(!await content.locator('details').evaluate(element=>element.open))await content.locator('summary').click();
 await expect(content.locator('p[lang="en"]')).toBeVisible();await expect(content.locator('p[lang="en"]')).toHaveText(row.en);
 await expect(content.locator('p[lang="zh-CN"]')).toHaveText(row.zh);expect(await content.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 expect(writes).toEqual([]);expect(errors).toEqual([]);
});

const request=(context,method,path,data,session)=>context.request.fetch(API+path,{method,
 headers:{'X-Wordbook-Auth':'member','X-Wordbook-Fields':'partOfSpeech',...(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json'}),...(session?{'X-CSRF-Token':session.csrfToken}:{})},...(data===undefined?{}:{data})});
for(const[index,term]of ['IBM','bicarb','are'].entries())test(`D22 saved ${term} card preserves personal note and learning state`,async({context,page},info)=>{
 const row=rows.find(item=>item.term===term);
 await context.addCookies([{name:'e2e_run',value:'examples22-'+createHash('sha256').update(info.testId).digest('hex').slice(0,24),url:ORIGIN}]);
 const registered=await request(context,'POST','register',{username:'examples22_'+index,password:'Synthetic local test 密码 1234'});expect(registered.status()).toBe(200);const session=await registered.json();
 const saved=await request(context,'POST','entries',{term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaningZh,note:'My existing note stays.',mutationId:randomUUID()},session);expect(saved.status()).toBe(200);
 const entry=(await saved.json()).entry;
 expect((await request(context,'POST',`reviews/${encodeURIComponent(entry.id)}`,{rating:'good',revision:0,mutationId:randomUUID()},session)).status()).toBe(200);
 const before=await(await request(context,'GET','entries')).json(),learning=await(await request(context,'GET','learning')).json(),writes=[];
 expect(learning.reviews).toHaveLength(1);expect(learning.reviews[0].entryId).toBe(entry.id);expect(learning.reviews[0].revision).toBe(1);
 page.on('request',req=>{if(req.url().includes('/api/')&&req.method()!=='GET')writes.push(req.url());});await page.setViewportSize({width:390,height:844});
 await page.goto('/personal.html?auth=member');await expect(page.locator('.personal-entry')).toHaveCount(1);
 async function check(){
  await page.getByRole('button',{name:`查看 ${row.term}`,exact:true}).click();const examples=page.locator('.dictionary-learning-examples');
  await expect(examples).toHaveAttribute('data-term',row.term);await expect(examples.locator('h4')).toHaveText(`${row.partOfSpeech} · ${row.meaningZh}`);
  await expect(examples.locator('[lang="en"]')).toHaveText(row.en);await expect(examples.locator('[lang="zh-CN"]')).toHaveText(row.zh);
  await expect(page.locator('#member-detail-note')).toHaveText('My existing note stays.');expect(await examples.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 }
 await check();await page.locator('#member-detail-close').click();await page.reload();await check();
 expect(await(await request(context,'GET','entries')).json()).toEqual(before);expect(await(await request(context,'GET','learning')).json()).toEqual(learning);expect(writes).toEqual([]);
});
