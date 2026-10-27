import {test,expect} from '@playwright/test';
const ORIGIN='http://127.0.0.1:4187';
test.use({serviceWorkers:'block',viewport:{width:390,height:844}});
async function query(page,value){
 await page.locator('#dictionary-query').fill(value);await page.locator('#dictionary-query').press('Enter');
 await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
 await expect.poll(()=>page.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('q'))).toBe(value);
 await expect(page.locator('#dictionary-result')).toBeVisible();
}
test('a retained barrel form cannot open the VAT tax example and the ordinary new sense remains usable',async({page})=>{
 const requests=[];page.on('request',r=>requests.push({url:r.url(),method:r.method()}));await page.goto('/dictionary.html');
 await query(page,'VAT');await expect(page.locator('#dictionary-meaning')).toContainText('增值税');
 await expect(page.locator('#dictionary-example-content [lang=en]')).not.toHaveCount(0);
 await page.locator('#dictionary-variant-summary').click();await expect(page.locator('#dictionary-variants')).toContainText('大桶');
 await expect(page.locator('#dictionary-variants')).toContainText('普通名词 vat');
 await query(page,'vats');await expect(page.locator('#dictionary-term')).toHaveText('VAT');
 await expect(page.locator('#dictionary-meaning')).toContainText('大桶');await expect(page.locator('#dictionary-meaning')).not.toContainText('增值税');
 await expect(page.locator('#dictionary-example-panel')).toBeHidden();
 await query(page,'VAT');await expect(page.locator('#dictionary-example-panel')).toBeVisible();
 await expect(page.locator('#dictionary-meaning')).toContainText('增值税');
 for(const r of requests){expect(new URL(r.url).origin).toBe(ORIGIN);expect(['GET','HEAD']).toContain(r.method);}
});
test('old boxing and news-agency Chinese queries keep their separate meanings without horse or university examples',async({page})=>{
 test.setTimeout(60000);await page.goto('/dictionary.html');
 await query(page,'stablemate');await expect(page.locator('#dictionary-meaning')).toContainText('同厩');
 await expect(page.locator('#dictionary-example-content [lang=en]')).not.toHaveCount(0);
 await query(page,'受雇于同一老板的拳击手');await expect(page.locator('#dictionary-term')).toHaveText('stablemate');
 await expect(page.locator('#dictionary-meaning')).toContainText('拳击手');await expect(page.locator('#dictionary-example-panel')).toBeHidden();
 await query(page,'印度联合新闻社');await expect(page.locator('#dictionary-term')).toHaveText('uni');
 await expect(page.locator('#dictionary-meaning')).toContainText('印度联合新闻社');await expect(page.locator('#dictionary-example-panel')).toBeHidden();
 await query(page,'大学');await expect(page.locator('#dictionary-term')).toHaveText('uni');
 await expect(page.locator('#dictionary-meaning')).toContainText('非正式简称');await expect(page.locator('#dictionary-example-panel')).toBeVisible();
});
test('retained dated meanings show their actual register while new examples stay with the selected current sense',async({page})=>{
 await page.goto('/dictionary.html');await query(page,'chippie');await expect(page.locator('#dictionary-meaning')).toContainText('炸鱼薯条');
 await page.locator('#dictionary-variant-summary').click();await expect(page.locator('#dictionary-variants')).toContainText('美式旧俚语');
 await expect(page.locator('#dictionary-variants')).toContainText('冒犯');
 await query(page,'galumph');await page.locator('#dictionary-variant-summary').click();
 await expect(page.locator('#dictionary-variants')).toContainText('较少见或旧式用法');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.locator('#dictionary-example-source')).toBeHidden();
});
