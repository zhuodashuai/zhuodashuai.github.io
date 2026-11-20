import {test,expect} from '@playwright/test';
import {createHash,randomUUID} from 'node:crypto';

const ORIGIN='http://127.0.0.1:4187',API=ORIGIN+'/api/v1/member';
const PUBLIC='/api/v1/public/wordbook',COLLECT='/api/v1/owner/dictionary-collection';
const PASSWORD='synthetic local spelling password 2026';
test.use({serviceWorkers:'block'});
test.beforeEach(async({context,page})=>{
  await context.addCookies([{name:'e2e_run',value:'spelling-'+randomUUID(),url:ORIGIN}]);
  page.on('pageerror',error=>{throw error;});
});
test.afterEach(async({context})=>{await context.unrouteAll({behavior:'wait'});});

async function seed(context,username='spelling_reader'){
  const response=await context.request.post(API+'/register',{headers:{Origin:ORIGIN,'X-Wordbook-Auth':'member'},data:{username,password:PASSWORD}});
  expect(response.status()).toBe(200);return response.json();
}
async function open(page,mode='member'){
  await page.goto('/personal.html?auth='+mode);
  await expect(page.locator('#member-workspace')).toBeVisible();
  await expect(page.locator('#member-entry-list')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#member-dictionary-search')).toBeEnabled();
}
async function query(page,value){
  await page.locator('#member-dictionary-term').fill(value);await page.locator('#member-dictionary-term').press('Enter');
  await expect(page.locator('#member-dictionary-search')).toBeEnabled();
}
function suggestion(page,term='happy'){return page.locator('#member-dictionary-suggestions').getByRole('button',{name:'查询 '+term,exact:true});}
async function privateEntries(context){
  const response=await context.request.get(API+'/entries',{headers:{'X-Wordbook-Auth':'member'}});
  expect(response.status()).toBe(200);return(await response.json()).entries;
}
async function hold(page,pattern){
  let release,reached;const gate=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>reached=resolve);
  await page.route(pattern,async route=>{const response=await route.fetch();reached();await gate;try{await route.fulfill({response});}catch{/* A cancelled caller must remain cancelled. */}});
  return{release,seen};
}
async function owner(context,page){
  await context.addCookies([{name:'e2e_auth',value:'owner',url:ORIGIN}]);
  await context.route('**'+PUBLIC+'*',async route=>{const response=await context.request.get(ORIGIN+PUBLIC);await route.fulfill({response});});
  await open(page,'owner');
}

for(const width of [390,1280])test(`member Enter typo shows real suggestions and explicit choice remains read-only at ${width}px`,async({context,page})=>{
  await page.setViewportSize({width,height:900});await seed(context);await open(page);
  await page.locator('#member-term').fill('my unfinished vocabulary draft');
  const requests=[];page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  await query(page,'heppy');await expect(suggestion(page)).toBeVisible();
  await expect(page.locator('#member-dictionary-result')).toBeHidden();
  await expect(page.locator('#member-dictionary-status')).toContainText(/未找到|未收录/u);
  await expect(page.locator('#member-dictionary-term')).toHaveValue('heppy');
  expect(await privateEntries(context)).toEqual([]);
  await suggestion(page).click();await expect(page.locator('#member-dictionary-word')).toHaveText('happy');
  await expect(page.locator('#member-dictionary-meaning')).toContainText(/高兴|快乐|幸福/u);
  await expect(page.locator('#member-dictionary-term')).toHaveValue('happy');
  await expect(page.locator('#member-dictionary-suggestion-panel')).toBeHidden();
  await expect(page.locator('#member-term')).toHaveValue('my unfinished vocabulary draft');
  expect(await privateEntries(context)).toEqual([]);
  expect(requests.filter(r=>new URL(r.url).origin!==ORIGIN||r.method!=='GET')).toEqual([]);
  expect(requests.some(r=>new URL(r.url).pathname.includes('/dictionary-suggestions/'))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('exact results, Chinese misses, and query errors never download spelling data',async({context,page})=>{
  await seed(context);await open(page);const reads=[];
  page.on('request',r=>{if(/dictionary-suggestions/u.test(r.url()))reads.push(r.url());});
  await query(page,'hip');await expect(page.locator('#member-dictionary-word')).toHaveText('hip');
  await query(page,'这是一个未收录的中文检索表达');await expect(page.locator('#member-dictionary-status')).toContainText(/未找到|未收录/u);
  await query(page,'<script>');await expect(page.locator('#member-dictionary-status')).toContainText('已安全拒绝');
  expect(reads).toEqual([]);await expect(page.locator('#member-dictionary-suggestion-panel')).toBeHidden();
});

test('a held spelling response never blocks lookup or replaces a later exact result',async({context,page})=>{
  await seed(context);await open(page);const held=await hold(page,'**/data/dictionary-suggestions/manifest.json*');
  try{
    await query(page,'heppy');await held.seen;
    await expect(page.locator('#member-dictionary-search')).toBeEnabled();
    await query(page,'hip');await expect(page.locator('#member-dictionary-word')).toHaveText('hip');
    held.release();await expect(page.locator('#member-dictionary-suggestion-panel')).toBeHidden();
    await expect(page.locator('#member-dictionary-word')).toHaveText('hip');expect(await privateEntries(context)).toEqual([]);
  }finally{held.release();}
});

test('editing without submitting clears pending suggestions and keeps the new input',async({context,page})=>{
  await seed(context);await open(page);const held=await hold(page,'**/data/dictionary-suggestions/manifest.json*');
  try{
    await query(page,'heppy');await held.seen;
    await page.locator('#member-dictionary-term').fill('a new unfinished query');held.release();
    await expect(page.locator('#member-dictionary-suggestion-panel')).toBeHidden();
    await expect(page.locator('#member-dictionary-term')).toHaveValue('a new unfinished query');
    await expect(page.locator('#member-dictionary-result')).toBeHidden();expect(await privateEntries(context)).toEqual([]);
  }finally{held.release();}
});

test('logout and another account cannot inherit an in-flight typo response',async({context,page})=>{
  await seed(context);await open(page);const held=await hold(page,'**/data/dictionary-suggestions/manifest.json*');
  try{
    await query(page,'heppy');await held.seen;await page.locator('#member-logout').click();
    await expect(page.locator('#member-workspace')).toBeHidden();
    await seed(context,'second_spelling_reader');
    await page.locator('#login-username').fill('second_spelling_reader');
    await page.locator('#login-password').fill(PASSWORD);
    await page.locator('#member-login-form button[type="submit"]').click();
    await expect(page.locator('#member-username')).toHaveText('@second_spelling_reader');held.release();
    await expect(page.locator('#member-dictionary-suggestion-panel')).toBeHidden();
    await expect(page.locator('#member-dictionary-term')).toHaveValue('');expect(await privateEntries(context)).toEqual([]);
  }finally{held.release();}
});

test('corrupt suggestion data leaves the honest miss and primary controls usable',async({context,page})=>{
  await seed(context);await open(page);
  await page.route('**/data/dictionary-suggestions/manifest.json*',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  await query(page,'heppy');await expect(page.locator('#member-dictionary-suggestion-status')).toContainText(/暂不可用|不可用/u);
  await expect(page.locator('#member-dictionary-status')).toContainText(/未找到|未收录/u);
  await expect(page.locator('#member-dictionary-result')).toBeHidden();await expect(suggestion(page)).toHaveCount(0);
  await query(page,'hip');await expect(page.locator('#member-dictionary-word')).toHaveText('hip');
  await expect(page.locator('#member-dictionary-suggestion-panel')).toBeHidden();expect(await privateEntries(context)).toEqual([]);
});

test('same-account revalidation invalidates old suggestions and a fresh retry still works',async({context,page})=>{
  await seed(context);await open(page);const held=await hold(page,'**/data/dictionary-suggestions/manifest.json*');
  try{
    await query(page,'heppy');await held.seen;
    const revalidated=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/member/session');
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect((await revalidated).status()).toBe(200);
    await expect(page.locator('#member-entry-list')).toHaveAttribute('aria-busy','false');held.release();
    await expect(page.locator('#member-dictionary-suggestion-panel')).toBeHidden();
    await query(page,'heppy');await expect(suggestion(page)).toBeVisible();expect(await privateEntries(context)).toEqual([]);
  }finally{held.release();}
});

test('owner miss is read-only and only explicit correction click starts canonical public collection',async({context,page})=>{
  await owner(context,page);const posts=[];
  page.on('request',request=>{if(request.method()==='POST')posts.push(request);});
  await query(page,'heppy');await expect(suggestion(page)).toBeVisible();expect(posts).toHaveLength(0);
  await suggestion(page).click();await expect(page.locator('#member-dictionary-word')).toHaveText('happy');
  await expect(page.locator('#member-dictionary-collection-status')).toContainText(/已收录|已在|原有内容/u);
  const collections=posts.filter(r=>new URL(r.url()).pathname===COLLECT);expect(collections).toHaveLength(1);
  expect(collections[0].postDataJSON().term).toBe('happy');expect(posts).toHaveLength(1);
});

test('starting typo suggestions does not cancel a previously authorized owner collection',async({context,page})=>{
  await owner(context,page);let release,reached;
  const gate=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>reached=resolve);
  await page.route('**'+COLLECT,async route=>{reached();await gate;await route.continue();});
  const posts=[];page.on('request',request=>{if(request.method()==='POST')posts.push(request);});
  try{
    await query(page,'abacus');await seen;
    await query(page,'heppy');await expect(suggestion(page)).toBeVisible();
    const confirmed=page.waitForResponse(response=>new URL(response.url()).pathname===COLLECT);
    release();expect((await confirmed).status()).toBe(200);
    const response=await context.request.get(ORIGIN+PUBLIC);expect(response.status()).toBe(200);
    expect((await response.json()).entries.some(entry=>entry.normalized==='abacus')).toBe(true);
    expect(posts).toHaveLength(1);expect(posts[0].postDataJSON().term).toBe('abacus');
    await expect(suggestion(page)).toBeVisible();await expect(page.locator('#member-dictionary-result')).toBeHidden();
  }finally{release();}
});

test('IME candidate Enter does not submit lookup or load spelling data',async({context,page})=>{
  await seed(context);await open(page);const requests=[];page.on('request',r=>requests.push(r.url()));
  const input=page.locator('#member-dictionary-term');await input.fill('heppy');
  await input.dispatchEvent('compositionstart');await input.press('Enter');await input.dispatchEvent('compositionend');
  await expect(page.locator('#member-dictionary-status')).toHaveText('');
  expect(requests.filter(url=>/dictionary-suggestions/u.test(url))).toEqual([]);
  await expect(page.locator('#member-dictionary-result')).toBeHidden();
  await input.press('Enter');await expect(suggestion(page)).toBeVisible();
});

for(const oldVersion of [117,118])test(`an exact older cached personal shell v${oldVersion} gains suggestions without crashing`,async({context,page})=>{
  await seed(context);
  await page.route('**/personal.html?auth=member',async route=>{
    const response=await route.fetch(),html=await response.text();
    const panel=/^        <div id="member-dictionary-suggestion-panel"[^\r\n]*(?:\r?\n|$)/gmu;
    expect([...html.matchAll(panel)]).toHaveLength(1);
    expect(html.split('js/personal-app-v108.js?v=119')).toHaveLength(2);
    const previous=html.replace(panel,'').replace('js/personal-app-v108.js?v=119',`js/personal-app-v108.js?v=${oldVersion}`);
    const expected={117:'29d880b74754c300d5e4bcb2a98f05c89c2d1b4c121f23babb34ffe34d4a7010',118:'cbea026917b2f4a82d8e2c9a75bb4795af0326660d8c9715683602cc8a191ee9'};
    expect(createHash('sha256').update(previous.replaceAll('\r\n','\n')).digest('hex')).toBe(expected[oldVersion]);
    await route.fulfill({response,body:previous});
  });
  await open(page);await query(page,'heppy');await expect(suggestion(page)).toBeVisible();
  expect(await page.locator('#member-dictionary-suggestion-panel').count()).toBe(1);
  await suggestion(page).click();await expect(page.locator('#member-dictionary-word')).toHaveText('happy');
  expect(await privateEntries(context)).toEqual([]);
});
