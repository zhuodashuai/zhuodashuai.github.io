import {test,expect} from '@playwright/test';
import {watchAnonymousStaticContext,assertClassroomTraffic,freshClassroomReport} from './browser-checks-classroom-0009.mjs';

test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of [390,1280])test(`source-scoped search and copied English spellings work without providers at ${width}px`,async({page,context,baseURL},info)=>{
  test.setTimeout(90000);
  const report=freshClassroomReport();await watchAnonymousStaticContext(context,new URL('/',baseURL).href,report,expect);
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');
  const query=async input=>{
    await page.locator('#dictionary-query').fill(input);await page.locator('#dictionary-query').press('Enter');
    await expect.poll(()=>page.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('q'))).toBe(input);
    await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    report.queries.push({input,term:await page.locator('#dictionary-term').textContent()});
  };
  for(const [input,head] of [['U.S.,','U.S.'],['e.g.,','e.g.'],['self‑esteem','self-esteem'],['mother‑in‑law','mother-in-law'],['donʼt',"don't"],['out‑of‑pocket expense','out-of-pocket expense']]){
    await query(input);await expect(page.locator('#dictionary-term')).toHaveText(head);
  }
  for(const [input,keep,reject]of [['洗洁精','washing-up liquid','dishwasher detergent'],['充电宝','power bank','spare battery']]){
    await query(input);await expect(page.locator('#dictionary-term')).toHaveText(keep);
    const heads=await page.locator('#dictionary-choices strong').allTextContents();expect(heads).not.toContain(reject);
  }
  for(const input of ['体检','体格检查','健康检查']){
    await query(input);const heads=await page.locator('#dictionary-choices strong').allTextContents();
    expect(heads).toEqual(expect.arrayContaining(['check-up','checkup','physical','medical checkup']));
    for(const wrong of ['postmortem','bioassay','crystal detector','medical examiner'])expect(heads).not.toContain(wrong);
    await expect(page.locator('#dictionary-meaning')).toContainText(/体检|健康检查|体格检查/u);
  }
  await info.attach(`search-health-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  await page.locator('#dictionary-query').fill('heppy');await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','empty');
  const happy=page.locator('[data-dictionary-suggestion="happy"]');await expect(happy).toBeVisible();
  await expect(page.locator('#dictionary-query')).toHaveValue('heppy');await expect(page.locator('#dictionary-result')).toBeHidden();
  await happy.click();await expect(page.locator('#dictionary-term')).toHaveText('happy');
  await expect(page.locator('#dictionary-meaning')).toContainText(/快乐|幸福|高兴/u);
  expect(await context.cookies()).toEqual([]);assertClassroomTraffic(expect,report);
  await info.attach(`search-quality-${width}.json`,{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});
});
