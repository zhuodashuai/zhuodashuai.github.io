import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});

test('inline happy association survives cold English shard delay without writes or changing its direct card',async({page})=>{
  const writes=[],foreign=[],english=[],ranking=[];
  page.on('request',request=>{const url=new URL(request.url());if(!['GET','HEAD'].includes(request.method()))writes.push(request.url());if(url.origin!=='http://127.0.0.1:4187')foreign.push(request.url());if(/\/en-\d{3}[.]json$/u.test(url.pathname))english.push(request.url());if(/[.]bin$/u.test(url.pathname))ranking.push(request.url());});
  await page.route(/\/expanded-dictionary\/[a-f0-9]{64}\/en-\d{3}[.]json$/u,async route=>{await new Promise(resolve=>setTimeout(resolve,5200));await route.continue().catch(()=>{});});
  await page.goto('/');const input=page.locator('#lookup-input');await input.fill('开心');await input.press('Enter');
  await expect(page.locator('#lookup-term')).toHaveText('chuffed');
  const choices=page.locator('#lookup-choices button[data-lookup-choice]');await expect(choices.filter({hasText:/^happy ·/u})).toBeVisible();await expect(choices.filter({hasText:/^chuffed ·/u})).toBeVisible();
  await expect(page.locator('#lookup-term')).toHaveText('chuffed');await expect(input).toHaveValue('开心');await expect(page.locator('#lookup-receipts button')).toHaveCount(0);
  expect(english).toEqual([]);expect(ranking).toHaveLength(1);expect(writes).toEqual([]);expect(foreign).toEqual([]);
});
