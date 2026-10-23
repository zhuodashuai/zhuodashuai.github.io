// Ordinary UI checks only, not offline/publication evidence. Requires actual registration.
import {test,expect} from '@playwright/test';
import {loadD31Fixture} from '../d31-regression-fixture.mjs';
const f=await loadD31Fixture();
test.use({serviceWorkers:'block'});
for(const item of f.representatives)test('D31 complete primary card and bilingual pair: '+item.term,async({page})=>{
 const errors=[],forbidden=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(request.method()!=='GET'||url.pathname.startsWith('/api/')){forbidden.push(request.url());return route.abort('blockedbyclient');}return route.continue();});
 await page.setViewportSize({width:item.width,height:844});await page.goto('./dictionary.html');await page.locator('#dictionary-query').fill(item.term);await page.locator('#dictionary-query').press('Enter');const display=item.display,pair=item.pair;
 await expect(page.locator('#dictionary-term')).toHaveText(display.term);await expect(page.locator('#dictionary-pos')).toHaveText(display.partOfSpeech);await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(display.meaning.split('\n'));await expect(page.locator('#dictionary-source a')).toHaveText(display.source);await expect(page.locator('#dictionary-source a')).toHaveAttribute('href',display.url);await expect(page.locator('#dictionary-source')).toContainText(display.license);await expect(page.locator('#dictionary-variants .variant')).toHaveCount(item.visibleVariantCount);
 const details=page.locator('#dictionary-example-content details');await expect(details).toHaveCount(1);await expect(details.locator('summary')).toHaveText(`1. ${pair.partOfSpeech} · ${pair.meaningZh}`);if(!await details.evaluate(e=>e.open))await details.locator('summary').click();await expect(details.locator('p[lang=en]')).toHaveText(pair.en);await expect(details.locator('p[lang=zh-CN]')).toHaveText(pair.zh);await expect(details.locator('p[lang=en]')).toBeVisible();await expect(details.locator('p[lang=zh-CN]')).toBeVisible();
 // Shared navigation is tested by the separately maintained navigation suite;
 // a data-only fixture does not pin an obsolete header/footer arrangement.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);for(const selector of['#dictionary-meaning','#dictionary-source','#dictionary-example-content'])expect(await page.locator(selector).evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await details.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(errors).toEqual([]);expect(forbidden).toEqual([]);
});
