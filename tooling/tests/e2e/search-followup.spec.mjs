import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {personalDictionaryResult} from '../../../vocab/js/personal-dictionary.js';

const ORIGIN='http://127.0.0.1:4187';
const read=async file=>JSON.parse(await readFile(new URL('../../../'+file,import.meta.url),'utf8'));
const ordinary=await read('tooling/dictionary/everyday-expansions/2026-11-19-search-followup/source.json');
const selected=await read('tooling/dictionary/reviewed-senses/source/batch-0016.json');
const rows=new Map([...ordinary.entries,...selected.entries].map(row=>[row.term,row]));
const queries=[['过境','transit'],['付款码','payment code'],['质保','warranty'],['离职','leave a job'],['进度','progress'],['by a fluke','by a fluke'],['nuanced','nuanced']];
const manifest=await read('vocab/data/expanded-dictionary/manifest.json');
const recovered=[];
for(const[input,term,id]of [['well adjusted','well-adjusted',10522514],["rock ʼnʼ roll","rock'n'roll",10140777]]){
  const descriptor=manifest.english.shards[id%128],bytes=await readFile(new URL('../../../vocab/data/expanded-dictionary/'+descriptor.file,import.meta.url));
  expect(bytes.length).toBe(descriptor.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(descriptor.sha256);
  const raw=JSON.parse(bytes).records.find(row=>row.id===id);expect(raw.term).toBe(term);
  const formatted=personalDictionaryResult({word:raw.term,partOfSpeech:raw.partOfSpeech,meaning:raw.meaning});
  recovered.push({input,term,partOfSpeech:formatted.partOfSpeech,meaning:formatted.meaning});
}

test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
test.beforeEach(async({page,context})=>{
  await context.addCookies([{name:'e2e_run',value:'search-followup-'+randomUUID(),url:ORIGIN}]);
  page.on('pageerror',error=>{throw error;});
});
const observe=page=>{const calls=[];page.on('request',request=>calls.push({method:request.method(),url:request.url()}));return calls;};
function readOnly(calls,{allowApi=false}={}){
  for(const call of calls){const url=new URL(call.url);expect(url.origin,call.url).toBe(ORIGIN);expect(['GET','HEAD'],call.url).toContain(call.method);
    if(!allowApi)expect(url.pathname).not.toMatch(/^\/api\//u);
    for(const key of['q','query','term','word','lookup','text'])expect(url.searchParams.has(key),call.url).toBe(false);
  }
}
async function query(page,input,{member=false,inline=false,allowEmpty=false}={}){
  const field=member?'#member-dictionary-term':inline?'#lookup-input':'#dictionary-query';
  await page.locator(field).fill(input);await page.locator(field).press('Enter');
  if(!member&&!inline)await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase',allowEmpty?/^(?:ready|empty)$/u:'ready');
  else await expect(page.locator(member?'#member-dictionary-search':'#lookup-submit')).toBeEnabled();
}
async function rendered(page,row,{member=false,inline=false}={}){
  const prefix=member?'member-dictionary':inline?'lookup':'dictionary';
  await expect(page.locator('#'+prefix+'-result')).toBeVisible();
  await expect(page.locator('#'+prefix+(member?'-word':'-term'))).toHaveText(row.term);
  await expect(page.locator('#'+prefix+'-pos')).toHaveText(row.partOfSpeech);
  if(member)await expect(page.locator('#'+prefix+'-meaning')).toHaveText(row.meaning);
  else await expect(page.locator('#'+prefix+'-meaning > p')).toHaveText(row.meaning.split(/\r?\n/u).map(line=>line.trim()).filter(Boolean));
}

for(const width of[390,1280]){
  test(`new reviewed searches and original examples render their source text without policy confusion at ${width}px`,async({page})=>{
    const calls=observe(page);await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');
    for(const[input,term]of queries){const row=rows.get(term);await query(page,input);await rendered(page,row);
      await expect(page.locator('#dictionary-source')).toContainText(row.dictionarySource||'卓式词典·义项补充');
      await expect(page.locator('#dictionary-example-content')).toContainText(row.en);
      await expect(page.locator('#dictionary-example-content')).toContainText(row.zh);
    }
    for(const row of recovered){await query(page,row.input);await rendered(page,row);await expect(page.locator('#dictionary-matched-form')).toBeVisible();
      await expect(page.locator('#dictionary-source')).toContainText('ECDICT');}
    await query(page,'warranties');await rendered(page,rows.get('warranty'));
    await expect(page.locator('#dictionary-meaning')).not.toContainText('保单');
    await expect(page.locator('#dictionary-variants')).not.toContainText('保单');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:test.info().outputPath('reviewed-warranty-'+width+'.png'),fullPage:true});
    for(const input of['保单','保险保单']){
      // The compound保险保单 may legitimately be absent. The requirement here
      // is that neither query teaches warranty as an insurance policy.
      await query(page,input,{allowEmpty:input==='保险保单'});const heads=new Set();
      for(let pageNumber=0;pageNumber<20;pageNumber++){
        for(const head of await page.locator('#dictionary-choices strong').allTextContents())heads.add(head);
        if(!await page.locator('#dictionary-more').isVisible())break;
        const before=await page.locator('#dictionary-choices strong').count();await page.locator('#dictionary-more').click();
        await expect.poll(()=>page.locator('#dictionary-choices strong').count()).toBeGreaterThan(before);
      }
      await expect(page.locator('#dictionary-more')).toBeHidden();expect(heads.has('warranty')).toBe(false);
      await expect(page.locator('#dictionary-term')).not.toHaveText('warranty');
      if(await page.locator('#dictionary-status').getAttribute('data-phase')==='empty'){
        await expect(page.locator('#dictionary-result')).toBeHidden();await expect(page.locator('#dictionary-choices strong')).toHaveCount(0);
      }
    }
    readOnly(calls);
  });

  test(`anonymous inline search exposes all7 reviewed rows without publishing or leaving the page at ${width}px`,async({page})=>{
    const calls=observe(page);await page.setViewportSize({width,height:844});await page.goto('/');const url=page.url();
    for(const[input,term]of queries){await query(page,input,{inline:true});await rendered(page,rows.get(term),{inline:true});await expect(page.locator('#lookup-collect')).toBeHidden();}
    expect(page.url()).toBe(url);await expect(page.locator('#lookup-receipts button')).toHaveCount(0);readOnly(calls,{allowApi:true});
  });

  test(`ordinary member searches stay private and passive before explicit save at ${width}px`,async({page,context})=>{
    // This registration is confined to the local synthetic server's isolated
    // e2e_run; no production account, provider or real password is contacted.
    const registration=await context.request.post(ORIGIN+'/api/v1/member/register',{headers:{Origin:ORIGIN,'X-Wordbook-Auth':'member'},data:{username:'coverage_reader',password:'Synthetic coverage phrase2026'}});
    expect(registration.status()).toBe(200);
    const calls=observe(page);await page.setViewportSize({width,height:844});await page.goto('/personal.html?auth=member');
    await expect(page.locator('#member-workspace')).toBeVisible();
    for(const row of rows.values()){
      await query(page,row.term,{member:true});await rendered(page,row,{member:true});
      await expect(page.locator('#member-dictionary-save')).toBeEnabled();
    }
    readOnly(calls,{allowApi:true});
    const entries=await context.request.get(ORIGIN+'/api/v1/member/entries',{headers:{'X-Wordbook-Auth':'member'}});
    expect(entries.status()).toBe(200);expect((await entries.json()).entries).toEqual([]);
  });

  test(`owner Chinese and recovered spelling previews require actual collection consent at ${width}px`,async({page,context})=>{
    await context.addCookies([{name:'e2e_auth',value:'owner',url:ORIGIN}]);
    const calls=observe(page);await page.setViewportSize({width,height:844});await page.goto('/?auth=owner#library-lookup');
    await expect(page.locator('#lookup-auth')).toHaveText(/卓.*自动公开收录/u);
    for(const[input,term]of queries.slice(0,5)){await query(page,input,{inline:true});await rendered(page,rows.get(term),{inline:true});await expect(page.locator('#lookup-collect')).toBeVisible();}
    for(const row of recovered){await query(page,row.input,{inline:true});await rendered(page,row,{inline:true});await expect(page.locator('#lookup-collect')).toBeVisible();}
    await expect(page.locator('#lookup-receipts button')).toHaveCount(0);readOnly(calls,{allowApi:true});
  });
}
