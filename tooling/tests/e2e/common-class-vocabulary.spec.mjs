import {test,expect}from'@playwright/test';import{readFile}from'node:fs/promises';
const pack=JSON.parse(await readFile(new URL('../../dictionary/everyday-expansions/2026-10-28-class/authored-additions.json',import.meta.url),'utf8'));
test.use({serviceWorkers:'block'});
for(let group=0;group<6;group++)test(`common vocabulary ${group+1}: exact English/Chinese searches and original bilingual cards`,async({page})=>{
  const errors=[],writes=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{
    if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());
    if(new URL(r.url()).origin!=='http://127.0.0.1:4187')external.push(r.url());
  });
  await page.setViewportSize({width:group%2?390:1280,height:844});await page.goto('/dictionary.html');
  for(const row of pack.entries.slice(group*10,group*10+10))for(const query of [row.term,row.chineseAliases[0]]){
    await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
    await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
    if(await page.locator('#dictionary-term').innerText()!==row.term){
      const disclosure=page.locator('#dictionary-choice-disclosure');if(!await disclosure.evaluate(el=>el.open))await disclosure.locator('summary').click();
      await page.locator('#dictionary-choices button').filter({has:page.locator('strong',{hasText:row.term})}).click();
    }
    await expect(page.locator('#dictionary-term')).toHaveText(row.term);await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
    await expect(page.locator('#dictionary-meaning p')).toHaveText(row.meaning.split('\n'));
    await expect(page.locator('#dictionary-example-content [lang=en]')).toHaveText(row.en);
    await expect(page.locator('#dictionary-example-content [lang=zh-CN]')).toHaveText(row.zh);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  expect(errors).toEqual([]);expect(writes).toEqual([]);expect(external).toEqual([]);
});
