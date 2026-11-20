import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {resolveProductionDictionaryCollection} from './production-dictionary-fixture.mjs';
import {expectFullPublicEntry} from './public-entry-assertions.mjs';

const ORIGIN='http://127.0.0.1:4187',API=ORIGIN+'/api/v1/member';
const cases=[{query:'医生',kind:'compound',label:'相关释义',terms:['surgeon','dentist']},
 {query:'开心',kind:'mention',label:'解释中提及',terms:['fun','grin']}];
test.use({serviceWorkers:'block'});
test.beforeEach(async({page,context})=>{
 await context.addCookies([{name:'e2e_run',value:'match-context-'+randomUUID(),url:ORIGIN}]);
 page.on('pageerror',error=>{throw error;});
});
test.afterEach(async({page,context})=>{await page.unrouteAll({behavior:'wait'});await context.unrouteAll({behavior:'wait'});});
async function nativeRows(page,query){return page.evaluate(async query=>{
 const {searchExpandedDictionary}=await import('/js/expanded-dictionary.js?v=118');
 let response=await searchExpandedDictionary(query,{limit:20});const rows=[...response.results];
 while(response.hasMore){response=await searchExpandedDictionary(query,{limit:20,offset:response.nextOffset});rows.push(...response.results);}
 return rows;
},query);}
async function search(page,surface,query){
 const input=page.locator(surface==='inline'?'#lookup-input':'#member-dictionary-term');
 await input.fill(query);await input.press('Enter');
 await expect(page.locator(surface==='inline'?'#lookup-submit':'#member-dictionary-search')).toBeEnabled();
 await expect(page.locator(surface==='inline'?'#lookup-result':'#member-dictionary-result')).toBeVisible();
}
function candidate(page,surface,term){return surface==='inline'
 ?page.locator('#lookup-choices button[data-lookup-choice]').filter({hasText:new RegExp('^'+term+' ·','u')})
 :page.locator('#member-dictionary-choices button[data-dictionary-term]').filter({has:page.locator('strong',{hasText:new RegExp('^'+term+'$','u')})});}
async function reveal(page,surface,term){
 const all=page.locator(surface==='inline'?'#lookup-choices button[data-lookup-choice]':'#member-dictionary-choices button[data-dictionary-term]');
 for(let i=0;i<10&&!await candidate(page,surface,term).count();i++){
  const previous=await all.count();const more=page.locator(surface==='inline'?'#lookup-more':'#member-dictionary-more');
  await expect(more).toBeVisible();await more.click();await expect.poll(()=>all.count()).toBeGreaterThan(previous);
 }
 await expect(candidate(page,surface,term)).toHaveCount(1);
}

for(const width of [390,1280])for(const surface of ['inline','personal'])for(const item of cases){
 test(`${surface} keeps ${item.kind} evidence explicit in candidates and selected cards at ${width}px`,async({page,context},testInfo)=>{
  await page.setViewportSize({width,height:900});
  if(surface==='personal'){
   const registered=await context.request.post(API+'/register',{headers:{Origin:ORIGIN,'X-Wordbook-Auth':'member'},data:{username:'context_reader',password:'synthetic context evidence password2026'}});
   expect(registered.status()).toBe(200);
   await page.goto('/personal.html?auth=member');await expect(page.locator('#member-workspace')).toBeVisible();
   await expect(page.locator('#member-entry-list')).toHaveAttribute('aria-busy','false');
  }else await page.goto('/');
  const reads=[],writes=[],foreign=[];page.on('request',r=>{const url=new URL(r.url());reads.push({path:url.pathname,method:r.method()});if(!['GET','HEAD'].includes(r.method()))writes.push(url.pathname);if(url.origin!==ORIGIN)foreign.push(r.url());});
  const native=await nativeRows(page,item.query);const expected=item.terms.map(term=>native.find(row=>row.term===term));
  for(const row of expected){expect(row).toBeTruthy();expect(row.matchType).toBe(item.kind);expect(row.matchedChinese).toBe(item.query);}
  await search(page,surface,item.query);const evidence=[];
  const selectedStatus=page.locator(surface==='inline'?'#lookup-status':'#member-dictionary-status');
  for(const row of expected){
   await reveal(page,surface,row.term);const choice=candidate(page,surface,row.term);
   evidence.push({row,candidate:await choice.innerText()});
   expect.soft(await choice.innerText()).toContain(item.label);
   expect.soft(await choice.innerText()).not.toContain('近义关联');
   await choice.click();await expect(page.locator(surface==='inline'?'#lookup-term':'#member-dictionary-word')).toHaveText(row.term);
   await expect(page.locator(surface==='inline'?'#lookup-pos':'#member-dictionary-pos')).toHaveText(row.partOfSpeech);
   const status=await selectedStatus.innerText();evidence.at(-1).selectedStatus=status;
   expect.soft(status).toContain(item.label);expect.soft(status).toContain('“'+item.query+'”');
   expect.soft(status).not.toMatch(/近义关联|本次匹配|本次义项/u);
   if(surface==='personal'){await expect(page.locator('#member-dictionary-meaning')).toHaveText(row.meaning);expect(status).toContain(row.source);}
   else await expect(page.locator('#lookup-source')).toHaveText([row.source,row.license].filter(Boolean).join(' · '));
  }
  await testInfo.attach('actual-static-source-and-ui-evidence',{body:JSON.stringify({query:item.query,surface,width,native,evidence},null,2),contentType:'application/json'});
  await candidate(page,surface,item.terms.at(-1)).screenshot({path:testInfo.outputPath('candidate-context.png')});
  await selectedStatus.screenshot({path:testInfo.outputPath('selected-context.png')});
  await selectedStatus.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('context-result.png')});
  const literal=item.terms.at(-1);await search(page,surface,literal);
  await expect(page.locator(surface==='inline'?'#lookup-term':'#member-dictionary-word')).toHaveText(literal);
  await expect(selectedStatus).not.toContainText(/解释中提及|相关释义|近义关联/u);
  if(item.query==='开心'){
   await search(page,surface,'开心');await reveal(page,surface,'happy');const choice=candidate(page,surface,'happy');
   expect(await choice.innerText()).toContain('近义关联：快乐');await choice.click();
   await expect(page.locator(surface==='inline'?'#lookup-term':'#member-dictionary-word')).toHaveText('happy');
   if(surface==='personal')await expect(selectedStatus).toContainText('近义关联：快乐');
   await expect(selectedStatus).not.toContainText(/解释中提及|相关释义/u);
  }
  expect(await nativeRows(page,item.query),'Rendering must not mutate any source DTO, order, alternatives or match metadata').toEqual(native);
  expect(writes).toEqual([]);expect(foreign).toEqual([]);
  if(surface==='personal'){
   const entries=await context.request.get(API+'/entries',{headers:{'X-Wordbook-Auth':'member'}});expect(entries.status()).toBe(200);expect((await entries.json()).entries).toEqual([]);
  }else await expect(page.locator('#lookup-receipts button')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('owner390 compound choice keeps its context marker and publishes only one authenticated canonical head',async({page,context},testInfo)=>{
 await page.setViewportSize({width:390,height:900});
 await context.addCookies([{name:'e2e_auth',value:'owner',url:ORIGIN}]);
 await context.route('**/api/v1/public/wordbook*',async route=>{
  if(route.request().method()!=='GET')return route.continue();
  const response=await context.request.get(ORIGIN+'/api/v1/public/wordbook');await route.fulfill({response});
 });
 await page.goto('/personal.html?auth=owner');await expect(page.locator('#member-workspace')).toBeVisible();
 await expect(page.locator('#member-auth-type')).toHaveText('GitHub 身份');
 await expect(page.locator('#member-entry-list')).toHaveAttribute('aria-busy','false');
 const session=await context.request.get(API+'/session',{headers:{'X-Wordbook-Auth':'github-owner'}});expect(session.status()).toBe(200);const authorization=await session.json();
 const privateBefore=await context.request.get(API+'/entries',{headers:{'X-Wordbook-Auth':'github-owner','X-Wordbook-Fields':'partOfSpeech'}});expect(privateBefore.status()).toBe(200);const privateValue=await privateBefore.json();
 const expected=(await nativeRows(page,'医生')).find(row=>row.term==='surgeon');expect(expected.matchType).toBe('compound');expect(expected.matchedChinese).toBe('医生');
 const sourceEntry=await resolveProductionDictionaryCollection('surgeon');
 const calls=[],foreign=[];context.on('request',request=>{const url=new URL(request.url());if(!['GET','HEAD'].includes(request.method()))calls.push(request);if(url.origin!==ORIGIN)foreign.push(request.url());});
 await search(page,'personal','医生');await reveal(page,'personal','surgeon');
 const choice=candidate(page,'personal','surgeon');await expect(choice).toHaveAttribute('aria-label','公开收录 surgeon · 相关释义');await expect(choice).toContainText('相关释义');expect(calls).toEqual([]);
 await choice.click();await expect(page.locator('#member-dictionary-word')).toHaveText('surgeon');
 await expect(page.locator('#member-dictionary-status')).toContainText('相关释义：“医生”');
 await expect(page.locator('#member-dictionary-status')).not.toContainText(/近义关联|本次匹配|本次义项/u);
 await expect(page.locator('#member-dictionary-meaning')).toHaveText(expected.meaning);await expect(page.locator('#member-dictionary-pos')).toHaveText(expected.partOfSpeech);await expect(page.locator('#member-dictionary-status')).toContainText(expected.source);
 await expect(page.locator('#member-dictionary-public-link')).toBeVisible();expect(calls).toHaveLength(1);
 const request=calls[0],payload=request.postDataJSON();expect(new URL(request.url()).pathname).toBe('/api/v1/owner/dictionary-collection');expect(request.method()).toBe('POST');expect(Object.keys(payload).sort()).toEqual(['mutationId','term']);expect(payload.term).toBe('surgeon');expect(request.headers()['idempotency-key']).toBe(payload.mutationId);expect(request.headers()['x-csrf-token']).toBe(authorization.csrfToken);
 const response=await context.request.get(ORIGIN+'/api/v1/public/wordbook');expect(response.status()).toBe(200);const snapshot=await response.json();const rows=snapshot.entries.filter(row=>row.normalized==='surgeon');expect(rows).toHaveLength(1);const entry=rows[0];
 const stable=value=>({...value,id:'volatile',createdAt:'volatile',updatedAt:'volatile',sources:value.sources.map(source=>({...source,retrievedAt:'volatile'}))});
 expect(stable(entry)).toEqual(stable(sourceEntry));
 const privateAfter=await context.request.get(API+'/entries',{headers:{'X-Wordbook-Auth':'github-owner','X-Wordbook-Fields':'partOfSpeech'}});expect(privateAfter.status()).toBe(200);expect(await privateAfter.json()).toEqual(privateValue);
 await testInfo.attach('owner-canonical-collection-proof',{body:JSON.stringify({preview:expected,payload,published:entry,canonicalSource:sourceEntry},null,2),contentType:'application/json'});
 await page.locator('#member-dictionary-status').screenshot({path:testInfo.outputPath('owner-context.png')});
 await page.locator('#member-dictionary-public-link').click();let destination;
 await expect.poll(()=>{
  destination=context.pages().find(candidate=>{const url=new URL(candidate.url());return url.origin===ORIGIN&&url.pathname==='/'&&url.searchParams.get('entry')===entry.id;});
  return Boolean(destination);
 }).toBe(true);
 await expectFullPublicEntry(destination,entry);expect(calls).toHaveLength(1);expect(foreign).toEqual([]);
});
