import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {CHINESE_QUERY_CACHE_RELEASE as release} from '../../../vocab/js/chinese-query-cache-release.js';
import {chineseQueryCacheBucket} from '../../../vocab/js/chinese-query-cache-format.js';
test.use({serviceWorkers:'block'});

test('inline happy association survives cold English shard delay without writes or changing its direct card',async({page})=>{
  const bucket=release.buckets[chineseQueryCacheBucket('开心')];
  const bytes=await readFile(new URL('../../../vocab/data/chinese-query-cache/'+bucket.file,import.meta.url));
  expect(bytes.length).toBe(bucket.bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(bucket.sha256);
  const member=JSON.parse(gunzipSync(bytes)).entries.find(row=>row.query==='开心');
  expect(member).toBeTruthy();
  const expectedCachePaths=[bucket.file,member.file].map(file=>'/data/chinese-query-cache/'+file);
  const writes=[],foreign=[],english=[],ranking=[],cache=[];
  page.on('request',request=>{const url=new URL(request.url());if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());if(url.origin!=='http://127.0.0.1:4187')foreign.push(request.url());if(/\/en-\d{3}[.]json$/u.test(url.pathname))english.push(request.url());if(url.pathname.startsWith('/data/chinese-search-ranking/'))ranking.push(url.pathname);if(url.pathname.startsWith('/data/chinese-query-cache/'))cache.push(url.pathname);});
  await page.route(/\/expanded-dictionary\/[a-f0-9]{64}\/en-\d{3}[.]json$/u,async route=>{await new Promise(resolve=>setTimeout(resolve,5200));await route.continue().catch(()=>{});});
  await page.goto('/');const input=page.locator('#lookup-input');await input.fill('开心');await input.press('Enter');
  await expect(page.locator('#lookup-term')).toHaveText('chuffed');
  const choices=page.locator('#lookup-choices button[data-lookup-choice]');await expect(choices.filter({hasText:/^happy ·/u})).toBeVisible();await expect(choices.filter({hasText:/^chuffed ·/u})).toBeVisible();
  await expect(page.locator('#lookup-term')).toHaveText('chuffed');await expect(input).toHaveValue('开心');await expect(page.locator('#lookup-receipts button')).toHaveCount(0);
  expect(english).toEqual([]);expect(ranking).toEqual([]);expect(cache).toEqual(expectedCachePaths);expect(writes).toEqual([]);expect(foreign).toEqual([]);
});
