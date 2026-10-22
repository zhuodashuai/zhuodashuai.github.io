// Draft planned for tooling/tests/e2e/dictionary-examples-0025-v2.spec.mjs.
// No browser run is permitted until actual built pins are registered.
import {test,expect} from '@playwright/test';
import {loadD25RegressionFixture,d25MeaningLines} from '../d25-regression-fixture-v2.mjs';
const fixture=await loadD25RegressionFixture();
test.use({serviceWorkers:'block'}); // UI regression only; real offline belongs to release verification.

async function expectDisplay(page,display){
 await expect(page.locator('#dictionary-term')).toHaveText(display.term);
 await expect(page.locator('#dictionary-pos')).toHaveText(display.partOfSpeech||'词性未标注');
 await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(d25MeaningLines(display.meaning));
 await expect(page.locator('#dictionary-source a')).toHaveText(display.source);await expect(page.locator('#dictionary-source a')).toHaveAttribute('href',display.url);
 if(display.license)await expect(page.locator('#dictionary-source')).toContainText(display.license);
 const alternatives=display.alternatives||[],panel=page.locator('#dictionary-variant-panel'),rows=page.locator('#dictionary-variants .variant');
 await expect(rows).toHaveCount(alternatives.length);
 if(alternatives.length){await expect(panel).toBeVisible();if(!await panel.evaluate(el=>el.open))await page.locator('#dictionary-variant-summary').click();
  for(const[index,row]of alternatives.entries()){const section=rows.nth(index);await expect(section.locator('h3')).toHaveText(row.source);await expect(section.locator('.part-of-speech')).toHaveText(row.partOfSpeech||'词性未标注');await expect(section.locator('.meaning .meaning-line')).toHaveText(d25MeaningLines(row.meaning));await expect(section.locator('.source a')).toHaveAttribute('href',row.url);}
 }else await expect(panel).toBeHidden();
 if(display.matchedForm)await expect(page.locator('#dictionary-matched-form')).toHaveText('查询形式：'+display.matchedForm);else await expect(page.locator('#dictionary-matched-form')).toBeHidden();
}
async function expectWholePair(page,pair){
 const content=page.locator('#dictionary-example-content'),details=content.locator('details');await expect(details).toHaveCount(1);
 await expect(details.locator('summary')).toHaveText(`1. ${pair.partOfSpeech} · ${pair.meaningZh}`);
 if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
 await expect(content.locator('p[lang="en"]')).toBeVisible();await expect(content.locator('p[lang="en"]')).toHaveText(pair.en);
 await expect(content.locator('p[lang="zh-CN"]')).toBeVisible();await expect(content.locator('p[lang="zh-CN"]')).toHaveText(pair.zh);
}
for(const[index,row]of fixture.representativeDisplays.entries())test(`D25 ${row.family}: ${row.term} has exact source and complete selected pair`,async({page})=>{
 const errors=[],forbidden=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(request.method()!=='GET'||url.pathname.startsWith('/api/')){forbidden.push({method:request.method(),origin:url.origin,path:url.pathname});return route.abort('blockedbyclient');}return route.continue();});
 await page.setViewportSize({width:row.width,height:844});await page.goto('/dictionary.html');
 // Canonical source is checked even for the existing context/form case.
 await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');await expectDisplay(page,row.canonicalDisplay);await expectWholePair(page,row.pair);
 if(row.query!==row.term){await page.locator('#dictionary-query').fill(row.query);await page.locator('#dictionary-query').press('Enter');await expectDisplay(page,row.queryDisplay);await expectWholePair(page,row.pair);}
 await expect(page.locator('header .app-primary-nav a')).toHaveText(['公开词本','查词','随手记','我的词本']);await expect(page.locator('header .app-primary-nav a[aria-current="page"]')).toHaveText('查词');
 const links=await page.locator('header .app-primary-nav a').evaluateAll(nodes=>nodes.map(node=>node.href));
 expect(links[0]).toBe(new URL('./',page.url()).href);expect(new URL(links[1]).pathname).toMatch(/\/dictionary(?:\.html)?$/u);expect(links[2]).toBe('https://zhuodashuai.github.io/vocab/quick-notes.html');expect(links[3]).toBe(new URL('/personal.html',page.url()).href);
 for(const link of links){const url=new URL(link);expect(url.username).toBe('');expect(url.password).toBe('');expect(url.searchParams.has('auth')).toBe(false);}
 await expect(page.locator('header a[href="guide.html"]')).toHaveCount(0);await expect(page.locator('footer a[href="guide.html"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await page.locator('#dictionary-example-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 if(index===0){const before=page.url();await page.locator('footer a[href="guide.html"]').click();await expect(page.locator('main h1')).toHaveText('使用手册');await page.goBack();expect(page.url()).toBe(before);await expectDisplay(page,row.queryDisplay);await expectWholePair(page,row.pair);}
 expect(forbidden).toEqual([]);expect(errors).toEqual([]);
});
