import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {searchExpandedDictionary} from '../../../vocab/js/expanded-dictionary.js';
import {CHINESE_QUERY_CACHE_RELEASE as release} from '../../../vocab/js/chinese-query-cache-release.js';
import {chineseQueryCacheBucket} from '../../../vocab/js/chinese-query-cache-format.js';
const ORIGIN='http://127.0.0.1:4187',CACHE_ROOT='/data/chinese-query-cache/';
const sha=value=>createHash('sha256').update(value).digest('hex');
const goldCache=new Map();
const localFetch=async(url,options)=>{expect(new URL(url).protocol).toBe('file:');expect(options.credentials).toBe('omit');return new Response(await readFile(fileURLToPath(url)));};
async function gold(query){
 if(goldCache.has(query))return goldCache.get(query);
 const rows=[];let offset=0,total;
 while(true){const page=await searchExpandedDictionary(query,{fetchImpl:localFetch,limit:50,offset,useChineseQueryCache:false});
  expect(page.ranking).toBe('global');expect(page.relatedIntegrated).toBe(true);total??=page.total;expect(page.total).toBe(total);rows.push(...page.results);
  if(!page.hasMore)break;expect(page.nextOffset).toBeGreaterThan(offset);offset=page.nextOffset;
 }
 expect(rows).toHaveLength(total);goldCache.set(query,rows);return rows;
}
async function bucketFor(query){
 expect(release.members).toContain(query);
 const descriptor=release.buckets[chineseQueryCacheBucket(query)];
 const bytes=await readFile(new URL('../../../vocab/data/chinese-query-cache/'+descriptor.file,import.meta.url));
 expect(bytes.length).toBe(descriptor.bytes);expect(sha(bytes)).toBe(descriptor.sha256);
 return JSON.parse(gunzipSync(bytes));
}
async function descriptorFor(query){return(await bucketFor(query)).entries.find(row=>row.query===query);}
function observe(page){const calls=[];page.on('request',request=>{const url=new URL(request.url());calls.push({path:url.pathname,method:request.method()});});return calls;}
function readonly(calls){expect(calls.filter(row=>!['GET','HEAD'].includes(row.method))).toEqual([]);expect(calls.some(row=>row.path.startsWith('/api/'))).toBe(false);}
async function query(page,value,{empty=false,error=false}={}){
 await page.locator('#dictionary-query').fill(value);await page.locator('#dictionary-query').press('Enter');
 await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase',error?'error':empty?'empty':'ready');
}
async function browserRows(page,queries){return page.evaluate(async queries=>{
 const module=await import('/js/expanded-dictionary.js?v=116');
 return Promise.all(queries.map(async query=>{let offset=0,total;const rows=[];
  while(true){const page=await module.searchExpandedDictionary(query,{limit:7,offset});if(page.ranking!=='global'||page.relatedIntegrated!==true)throw Error('Fullglobalpacketrequired');total??=page.total;if(page.total!==total)throw Error('Changingtotal');rows.push(...page.results);if(!page.hasMore)break;if(page.nextOffset<=offset)throw Error('Nonprogressingpage');offset=page.nextOffset;}
  if(total!==rows.length)throw Error('Incompletepacketstream');return rows;
 }));
},queries);}

test.afterEach(async({page,context})=>{await page.unrouteAll({behavior:'wait'});await context.unrouteAll({behavior:'wait'});});

test.describe('source-bound optional query cache',()=>{
 test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
 for(const width of[390,1280]){
  test(`known query renders early and every sourceDTO/page is unchanged at${width}px`,async({page})=>{
   const expected=await gold('开心');expect(expected.length).toBeGreaterThan(20);await descriptorFor('开心');
   const calls=observe(page);await page.setViewportSize({width,height:844});await page.goto('/dictionary.html#q='+encodeURIComponent('开心'));
   await expect(page.locator('#dictionary-term')).toHaveText(expected[0].term);
   await expect(page.locator('#dictionary-pos')).toHaveText(expected[0].partOfSpeech);
   expect(calls.some(row=>row.path.startsWith(CACHE_ROOT))).toBe(true);expect(calls.some(row=>row.path.includes('/data/chinese-search-ranking/'))).toBe(false);
   expect((await browserRows(page,['开心']))[0]).toEqual(expected);
   const disclosure=page.locator('#dictionary-choice-disclosure');if(!await disclosure.evaluate(node=>node.open))await disclosure.locator('summary').click();
   while(await page.locator('#dictionary-more').isVisible()){const before=await page.locator('#dictionary-choices strong').count();await page.locator('#dictionary-more').click();await expect.poll(()=>page.locator('#dictionary-choices strong').count()).toBeGreaterThan(before);}
   await expect(page.locator('#dictionary-choices strong')).toHaveText(expected.map(row=>row.term));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);readonly(calls);
  });
  test(`concurrent different queries in one authenticated bundle remain isolated at${width}px`,async({page})=>{
   const bucket=await bucketFor('开心'),first=bucket.entries.find(row=>row.query==='开心'),other=bucket.entries.find(row=>row.file===first.file&&row.query!=='开心');expect(other).toBeTruthy();
   const queries=['开心',other.query],expected=await Promise.all(queries.map(gold));const calls=observe(page);
   await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');await expect(page.locator('#dictionary-submit')).toBeEnabled();
   expect(await browserRows(page,queries)).toEqual(expected);
   expect(calls.filter(row=>row.path===CACHE_ROOT+first.file)).toHaveLength(1);
   expect(calls.filter(row=>row.path===CACHE_ROOT+release.buckets[chineseQueryCacheBucket('开心')].file)).toHaveLength(1);
   expect(calls.some(row=>row.path.includes('/data/chinese-search-ranking/'))).toBe(false);
   const again=await page.evaluate(async()=>{const module=await import('/js/expanded-dictionary.js?v=116');const one=await module.searchExpandedDictionary('开心');one.results[0].meaning='test-onlyreturnedobject';return(await module.searchExpandedDictionary('开心')).results[0];});
   expect(again).toEqual(expected[0][0]);readonly(calls);
  });
  test(`unknown input uses the complete source without speculative packet reads at${width}px`,async({page})=>{
   const input='未收录的测试词云鹤';expect(release.members).not.toContain(input);const expected=await gold(input);expect(expected).toEqual([]);
   const calls=observe(page);await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');await query(page,input,{empty:true});
   expect(calls.filter(row=>row.path.startsWith(CACHE_ROOT))).toEqual([]);expect(calls.some(row=>row.path.includes('/data/chinese-search-ranking/'))).toBe(true);
   await expect(page.locator('#dictionary-suggestion-panel')).toBeHidden();readonly(calls);
  });
  test(`corrupt advisory bundle falls back to the complete source at${width}px`,async({page})=>{
   const expected=await gold('人工客服'),descriptor=await descriptorFor('人工客服');const calls=observe(page);let corrupted=0;
   await page.route('**'+CACHE_ROOT+descriptor.file,async route=>{corrupted++;const original=await readFile(new URL('../../../vocab/data/chinese-query-cache/'+descriptor.file,import.meta.url));const corrupt=Buffer.from(original);corrupt[0]^=1;await route.fulfill({status:200,contentType:'application/octet-stream',body:corrupt});});
   await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');await query(page,'人工客服');
   await expect(page.locator('#dictionary-term')).toHaveText(expected[0].term);expect((await browserRows(page,['人工客服']))[0]).toEqual(expected);
   expect(corrupted).toBe(1);expect(calls.some(row=>row.path.includes('/data/chinese-search-ranking/'))).toBe(true);readonly(calls);
  });
  test(`corruption plus unavailable complete source stays an honest error at${width}px`,async({page})=>{
   const descriptor=await descriptorFor('人工客服'),calls=observe(page);let corrupted=0;
   await page.route('**'+CACHE_ROOT+descriptor.file,route=>{corrupted++;return route.fulfill({status:200,contentType:'application/octet-stream',body:Buffer.alloc(descriptor.bytes)});});
   await page.route('**/data/chinese-search-ranking/**',route=>route.fulfill({status:503,body:'unavailable'}));
   await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');await query(page,'人工客服',{error:true});expect(corrupted).toBe(1);
   await expect(page.locator('#dictionary-result')).toBeHidden();await expect(page.locator('#dictionary-query')).toHaveValue('人工客服');await expect(page.locator('#dictionary-suggestion-panel')).toBeHidden();readonly(calls);
  });
 }
});

test('cached Chinese owner choice keeps explicit consent, canonicalsource, copy and chapter scope',async({page,context})=>{
 const PUBLIC='/api/v1/public/wordbook',COLLECT='/api/v1/owner/dictionary-collection';
 const run='cache-owner-'+randomUUID();await context.addCookies([{name:'e2e_run',value:run,url:ORIGIN},{name:'e2e_auth',value:'owner',url:ORIGIN}]);
 await context.route('**'+PUBLIC+'*',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await context.request.get(ORIGIN+PUBLIC);return route.fulfill({response});});
 await page.addInitScript(()=>{window.__copyWrites=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copyWrites.push(value);}}});});
 const calls=observe(page),expected=(await gold('开心')).find(row=>row.term==='happy');expect(expected).toBeTruthy();
 await page.goto('/?auth=owner&book=never-let-me-go&chapter=chapter-1#library-lookup');await expect(page.locator('#lookup-auth')).toHaveText(/卓.*自动公开收录/u);const url=page.url();
 await page.locator('#lookup-input').fill('开心');await page.locator('#lookup-input').press('Enter');await expect(page.locator('#lookup-term')).toHaveText((await gold('开心'))[0].term);
 expect(calls.filter(row=>!['GET','HEAD'].includes(row.method))).toEqual([]);expect(calls.some(row=>row.path.startsWith(CACHE_ROOT))).toBe(true);
 await page.locator('#lookup-choices button[data-lookup-choice]').filter({hasText:/^happy\b/u}).click();await expect(page.locator('#lookup-receipts button')).toHaveCount(1);
 expect(calls.filter(row=>!['GET','HEAD'].includes(row.method))).toEqual([{path:COLLECT,method:'POST'}]);
 const snapshot=await context.request.get(ORIGIN+PUBLIC);const entries=(await snapshot.json()).entries.filter(row=>row.term==='happy');expect(entries).toHaveLength(1);
 expect(entries[0].sourceUrl).toBe(expected.url);expect(entries[0].meaning).toBeTruthy();
 await page.locator('#lookup-receipts button').click();await expect(page.locator('#dialog-term')).toHaveText('happy');await page.locator('#dialog-copy').click();
 await expect.poll(()=>page.evaluate(()=>window.__copyWrites.length)).toBe(1);expect(await page.evaluate(()=>window.__copyWrites[0])).toContain('happy');
 expect(page.url()).toBe(url);await expect(page.locator('#chapter-tabs button[data-value="chapter-1"]')).toHaveAttribute('aria-pressed','true');
});

test('real offline SW uses a warmed fullsource when the optional cached bundle is corrupt',async({page,context})=>{
 test.setTimeout(90000);const descriptor=await descriptorFor('人工客服'),expected=await gold('人工客服'),calls=observe(page);
 await page.goto('/dictionary.html');await query(page,'未收录的测试词云鹤',{empty:true});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:45000}).toBe(true);
 // Re-read underactualSWcontrol toauthenticateandwarmthefullindexforofflinefallback.
 expect((await browserRows(page,['人工客服']))[0]).toEqual(expected);
 const rankingPath=new URL((await import('../../../vocab/js/chinese-ranking-release.js')).CHINESE_RANKING_RELEASE.file,new URL(ORIGIN+'/data/chinese-search-ranking/')).pathname;
 const bucketDescriptor=release.buckets[chineseQueryCacheBucket('人工客服')];
 await page.evaluate(async({rankingPath,descriptor,bucketDescriptor})=>{const cache=await caches.open('zhuo-wordbook-v100');const response=await fetch(rankingPath,{cache:'reload',credentials:'omit'});await cache.put(rankingPath,response);const bucketPath='/data/chinese-query-cache/'+bucketDescriptor.file;await cache.put(bucketPath,await fetch(bucketPath,{cache:'reload',credentials:'omit'}));await cache.put('/data/chinese-query-cache/'+descriptor.file,new Response(new Uint8Array(descriptor.bytes),{headers:{'Content-Type':'application/octet-stream'}}));},{rankingPath,descriptor,bucketDescriptor});
 const rankingRelease=(await import('../../../vocab/js/chinese-ranking-release.js')).CHINESE_RANKING_RELEASE;
 await expect.poll(()=>page.evaluate(async paths=>{const cache=await caches.open('zhuo-wordbook-v100');return Promise.all(paths.map(async path=>Boolean(await cache.match(path))));},['/data/expanded-dictionary/manifest.json',rankingPath,CACHE_ROOT+bucketDescriptor.file,CACHE_ROOT+descriptor.file]),{timeout:30000}).toEqual([true,true,true,true]);
 const stored=await page.evaluate(async paths=>{const cache=await caches.open('zhuo-wordbook-v100');return Promise.all(paths.map(async path=>{const bytes=await(await cache.match(path)).arrayBuffer();return{bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')};}));},['/data/expanded-dictionary/manifest.json',rankingPath,CACHE_ROOT+bucketDescriptor.file,CACHE_ROOT+descriptor.file]);
 expect(stored[0].sha256).toBe(release.sourceManifestSha256);expect(stored[1]).toEqual({bytes:rankingRelease.bytes,sha256:rankingRelease.sha256});expect(stored[2]).toEqual({bytes:bucketDescriptor.bytes,sha256:bucketDescriptor.sha256});expect(stored[3].bytes).toBe(descriptor.bytes);expect(stored[3].sha256).not.toBe(descriptor.sha256);
 await page.evaluate(()=>history.replaceState(null,'','#q='+encodeURIComponent('人工客服')));
 const offlineStart=calls.length;await context.setOffline(true);
 try{await page.reload();await expect(page.locator('#dictionary-term')).toHaveText(expected[0].term);expect((await browserRows(page,['人工客服']))[0]).toEqual(expected);expect(calls.slice(offlineStart).some(row=>row.path===CACHE_ROOT+descriptor.file)).toBe(true);expect(calls.slice(offlineStart).some(row=>row.path===rankingPath)).toBe(true);readonly(calls);}finally{await context.setOffline(false);}
});


test('first known Chinese lookup before SWclaim replays only its actual bucket and bundle for offline use',async({context,page},info)=>{
 test.setTimeout(90000);const queryText='开心',expected=await gold(queryText),descriptor=await descriptorFor(queryText),bucketDescriptor=release.buckets[chineseQueryCacheBucket(queryText)];
 await context.addCookies([{name:'e2e_run',value:'cache-first-'+randomUUID(),url:ORIGIN},{name:'e2e_dictionary_first_install',value:'1',url:ORIGIN}]);
 expect(context.serviceWorkers()).toHaveLength(0);const calls=observe(page),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/dictionary.html#q='+encodeURIComponent(queryText));await expect(page.locator('#dictionary-term')).toHaveText(expected[0].term);
 expect(await page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(false);
 expect(calls.some(row=>row.path.includes('/data/chinese-search-ranking/'))).toBe(false);
 const url=page.url();await page.locator('#dictionary-query').fill('unfinished next word');
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:45000}).toBe(true);
 const paths=['/data/expanded-dictionary/manifest.json',CACHE_ROOT+bucketDescriptor.file,CACHE_ROOT+descriptor.file];
 await expect.poll(()=>page.evaluate(async paths=>{const cache=await caches.open('zhuo-wordbook-v100');return Promise.all(paths.map(async path=>Boolean(await cache.match(path))));},paths),{timeout:30000}).toEqual([true,true,true]);
 const stored=await page.evaluate(async paths=>{const cache=await caches.open('zhuo-wordbook-v100');return Promise.all(paths.map(async path=>{const bytes=await(await cache.match(path)).arrayBuffer();return{bytes:bytes.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')};}));},paths);
 expect(stored[0].sha256).toBe(release.sourceManifestSha256);expect(stored[1]).toEqual({bytes:bucketDescriptor.bytes,sha256:bucketDescriptor.sha256});expect(stored[2]).toEqual({bytes:descriptor.bytes,sha256:descriptor.sha256});
 expect(await page.evaluate(async()=>{const cache=await caches.open('zhuo-wordbook-v100');return(await cache.keys()).some(request=>new URL(request.url).pathname.includes('/data/chinese-search-ranking/'));})).toBe(false);
 await expect(page.locator('#dictionary-query')).toHaveValue('unfinished next word');expect(page.url()).toBe(url);
 await context.setOffline(true);
 try{await page.reload();await expect(page.locator('#dictionary-term')).toHaveText(expected[0].term);expect((await browserRows(page,[queryText]))[0]).toEqual(expected);expect(calls.some(row=>row.path.includes('/data/chinese-search-ranking/'))).toBe(false);readonly(calls);expect(errors).toEqual([]);}finally{await context.setOffline(false);}
});


test('an ordinary member explicitly saves a cached Chinese result privately without publishing',async({page,context})=>{
 await context.addCookies([{name:'e2e_run',value:'cache-member-'+randomUUID(),url:ORIGIN}]);
 const registration=await context.request.post(ORIGIN+'/api/v1/member/register',{headers:{Origin:ORIGIN,'X-Wordbook-Auth':'member'},data:{username:'cache_private_reader',password:'Synthetic cache testing2026'}});expect(registration.status()).toBe(200);
 const beforePublic=await(await context.request.get(ORIGIN+'/api/v1/public/wordbook')).json();
 const expected=(await gold('人工客服'))[0],calls=observe(page);await page.setViewportSize({width:390,height:844});await page.goto('/personal.html?auth=member');await expect(page.locator('#member-workspace')).toBeVisible();const url=page.url();
 await expect(page.locator('#member-dictionary-search')).toBeEnabled();await page.locator('#member-dictionary-term').fill('人工客服');await page.locator('#member-dictionary-term').press('Enter');
 await expect(page.locator('#member-dictionary-word')).toHaveText(expected.term);await expect(page.locator('#member-dictionary-pos')).toHaveText(expected.partOfSpeech);await expect(page.locator('#member-dictionary-meaning')).toHaveText(expected.meaning);
 expect(calls.some(row=>row.path.startsWith(CACHE_ROOT))).toBe(true);expect(calls.some(row=>row.path.includes('/data/chinese-search-ranking/'))).toBe(false);expect(calls.filter(row=>!['GET','HEAD'].includes(row.method))).toEqual([]);
 await page.locator('#member-dictionary-save').click();await expect(page.getByRole('button',{name:'查看 '+expected.term,exact:true})).toBeVisible();
 const entries=await(await context.request.get(ORIGIN+'/api/v1/member/entries',{headers:{'X-Wordbook-Auth':'member','X-Wordbook-Fields':'partOfSpeech'}})).json();expect(entries.entries).toHaveLength(1);expect(entries.entries[0].term).toBe(expected.term);expect(entries.entries[0].partOfSpeech).toBe(expected.partOfSpeech);expect(entries.entries[0].meaning).toBe(expected.meaning);
 expect(calls.filter(row=>!['GET','HEAD'].includes(row.method))).toEqual([{path:'/api/v1/member/entries',method:'POST'}]);expect(page.url()).toBe(url);expect(await(await context.request.get(ORIGIN+'/api/v1/public/wordbook')).json()).toEqual(beforePublic);
});
