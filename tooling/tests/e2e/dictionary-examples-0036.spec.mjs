// Install at tooling/tests/e2e after exact D36 admission and actual normal build.
import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {dictionaryExampleBucket} from '../../../vocab/js/dictionary-examples.js';
import {dictionaryExamplesRelease as runtimeRelease} from '../../../vocab/js/dictionary-examples-release-v4.js';
import {parseAdditiveCatalogue} from '../../../vocab/js/dictionary-examples-additive-codec.js';
import {personalDictionaryResult} from '../../../vocab/js/personal-dictionary.js';
const json=async file=>JSON.parse(await readFile(new URL('../../../'+file,import.meta.url),'utf8'));
const index=await json('tooling/dictionary/examples/additive-index-v4.json'),release=index.releases.find(r=>r.id==='examples-0036'),rows=new Map(),canonicalIds=new Map();
for(const file of release.sourceFiles){
 for(const row of(await json('tooling/dictionary/examples/source/'+file)).entries)rows.set(row.term,row);
 for(const row of(await json('tooling/dictionary/examples/reviews/'+file)).evidence.rows)canonicalIds.set(row.term,row.canonicalId);
}
expect(rows.size).toBe(556);
const manifest=await json('vocab/data/expanded-dictionary/manifest.json'),samples=[];
for(const term of ['braillewriter','stative','electrochromic','actinopod','actor-proof','acyanogenic']){
 const row=rows.get(term);expect(row).toBeTruthy();const id=canonicalIds.get(term);expect(Number.isSafeInteger(id)).toBe(true);
 const descriptor=manifest.english.shards[id%128],source=(await json('vocab/data/expanded-dictionary/'+descriptor.file)).records.find(r=>r.id===id&&r.term===term);
 expect(source).toBeTruthy();samples.push({term,row,display:personalDictionaryResult({word:term,partOfSpeech:source.partOfSpeech,meaning:source.meaning})});
}
test.use({serviceWorkers:'block'});
for(const[label,viewport]of [['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]])test('D36 '+label+' shows six exact new bilingual cards without overflow',async({page})=>{
 await page.setViewportSize(viewport);const errors=[],writes=[],providers=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());if(/api\.openai\.com|api\.anthropic\.com|api\.mymemory|api\.languagetool|\/api\/v1\/(?:ai|enrich|ocr)/u.test(r.url()))providers.push(r.url());});
 for(const item of samples){
  await page.goto('/dictionary.html#q='+encodeURIComponent(item.term));await expect(page.locator('#dictionary-term')).toHaveText(item.term);await expect(page.locator('#dictionary-pos')).toHaveText(item.display.partOfSpeech);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(item.display.meaning.split('\n'));
  const details=page.locator('#dictionary-example-content details');await expect(details).toHaveCount(1);await expect(details.locator('summary')).toHaveText('1. '+item.row.partOfSpeech+' · '+item.row.meaningZh);
  if(!await details.evaluate(n=>n.open))await details.locator('summary').click();await expect(details.locator('p[lang=en]')).toHaveText(item.row.en);await expect(details.locator('p[lang=zh-CN]')).toHaveText(item.row.zh);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors).toEqual([]);expect(writes).toEqual([]);expect(providers).toEqual([]);
});

test.describe('D36 naturally warmed native offline reading',()=>{
 test.use({serviceWorkers:'allow'});
 test('D36 braillewriter retains its complete bilingual example after a native offline reload',async({context,page},info)=>{
  test.setTimeout(90_000);
  const item=samples.find(sample=>sample.term==='braillewriter'),hash=raw=>createHash('sha256').update(raw).digest('hex');
  const catalogueRaw=await readFile(new URL('../../../vocab/data/dictionary-examples/'+runtimeRelease.catalogue.file,import.meta.url));
  expect(hash(catalogueRaw)).toBe(runtimeRelease.catalogue.sha256);
  const catalogue=await parseAdditiveCatalogue(JSON.parse(gunzipSync(catalogueRaw)));
  const deltaIndex=catalogue.keys.find(([term])=>term===item.term)?.[1];
  expect(deltaIndex,'The real active catalogue must contain the D36 sample').toBeDefined();
  const base=await json('vocab/data/dictionary-examples/manifest-v2.json');
  const sourceFiles=[manifest.english.shards[dictionaryExampleBucket(item.term)%128].file,manifest.english.shards[canonicalIds.get(item.term)%128].file];
  const warmPaths=[...new Set(['/dictionary.html','/data/expanded-dictionary/manifest.json',...sourceFiles.map(file=>'/data/expanded-dictionary/'+file),'/data/dictionary-examples/manifest-v2.json','/data/dictionary-examples/'+base.shards[dictionaryExampleBucket(item.term)].file,'/data/dictionary-examples/'+runtimeRelease.catalogue.file,'/data/dictionary-examples/'+catalogue.deltas[deltaIndex].file])];
  const expected=await Promise.all(warmPaths.map(async path=>{const body=await readFile(new URL('../../../vocab'+path,import.meta.url));return{path,bytes:body.length,sha256:hash(body)};}));
  const errors=[],writes=[],providers=[],foreign=[];
  const fixtureOrigin=new URL(info.project.use.baseURL).origin;
  page.on('pageerror',error=>errors.push(error.message));
  context.on('request',request=>{
   if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());
   if(/api\.openai\.com|api\.anthropic\.com|api\.mymemory|api\.languagetool|\/api\/v1\/(?:ai|enrich|ocr)/u.test(request.url()))providers.push(request.url());
   if(new URL(request.url()).origin!==fixtureOrigin)foreign.push(request.url());
  });
  const checkCard=async()=>{
   await expect(page.locator('#dictionary-term')).toHaveText(item.term);
   await expect(page.locator('#dictionary-pos')).toHaveText(item.display.partOfSpeech);
   await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(item.display.meaning.split('\n'));
   const details=page.locator('#dictionary-example-content details');await expect(details).toHaveCount(1);
   await expect(details.locator('summary')).toHaveText('1. '+item.row.partOfSpeech+' · '+item.row.meaningZh);
   if(!await details.evaluate(node=>node.open))await details.locator('summary').click();
   await expect(details.locator('p[lang=en]')).toHaveText(item.row.en);await expect(details.locator('p[lang=zh-CN]')).toHaveText(item.row.zh);
  };
  await page.setViewportSize({width:390,height:844});
  expect(context.serviceWorkers()).toHaveLength(0);
  // Only the app's first real lookup may warm data: no routes, explicit fetch,
  // cache.put, homepage visit or extra online reload can manufacture success.
  try{
   await page.goto('/dictionary.html#q='+encodeURIComponent(item.term));await checkCard();
   const lookupUrl=page.url();
   await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:45_000,message:'The real dictionary worker must claim this page'}).toBe(true);
   expect(await page.evaluate(()=>new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/sw.js');
   await expect.poll(()=>page.evaluate(async paths=>{
    if(!(await caches.keys()).includes('zhuo-wordbook-v100'))return [];
    const cache=await caches.open('zhuo-wordbook-v100');
    return Promise.all(paths.map(async path=>{
     const response=await cache.match(path);if(!response?.ok)return null;
     const body=await response.arrayBuffer();
     return{path,bytes:body.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(value=>value.toString(16).padStart(2,'0')).join('')};
    }));
   },warmPaths),{timeout:30_000,message:'Every naturally warmed D36 resource must match its complete generated body'}).toEqual(expected);
   await context.setOffline(true);expect(await page.evaluate(()=>navigator.onLine)).toBe(false);
   const response=await page.reload();
   expect(response?.status(),'Offline navigation must return a real cached document').toBe(200);
   expect(response.fromServiceWorker(),'Offline navigation must be served by the native worker').toBe(true);
   await expect(page).toHaveURL(lookupUrl);await checkCard();
   expect(await page.evaluate(()=>navigator.onLine)).toBe(false);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   expect(errors).toEqual([]);expect(writes).toEqual([]);expect(providers).toEqual([]);expect(foreign).toEqual([]);
   await info.attach('D36 exact naturally warmed cache bodies',{body:JSON.stringify(expected,null,2),contentType:'application/json'});
  }finally{
   if(!page.isClosed())await context.setOffline(false).catch(()=>{});
  }
 });
});
