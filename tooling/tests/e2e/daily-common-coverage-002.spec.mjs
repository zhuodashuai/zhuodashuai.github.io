import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../../vocab/js/everyday-lookup-data.js';
const manifest=JSON.parse(await readFile(new URL('../../dictionary/everyday-expansions/2026-10-27-common2/manifest.json',import.meta.url),'utf8'));
const rows=manifest.addedHeads.map(term=>EVERYDAY_LOOKUP_ENTRIES.find(row=>row.term===term));
test.use({serviceWorkers:'block',viewport:{width:390,height:844}});
test('new daily words work through actual English and Chinese Enter submissions with matched examples',async({page})=>{
  test.setTimeout(180000);const errors=[],providers=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());if(/api\.openai|api\.anthropic|mymemory|languagetool|\/api\/v1\/(ai|enrich)/u.test(r.url()))providers.push(r.url());});
  await page.goto('/dictionary.html');await expect(page.locator('#dictionary-submit')).toBeEnabled();
  for(const{row,query}of[...rows.map(row=>({row,query:row.term})),...rows.map(row=>({row,query:row.chineseAliases[0]}))]){
    await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
    await expect.poll(()=>page.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('q'))).toBe(query);
    await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
    // One Chinese intent can legitimately offer both a noun and a verb phrase.
    // Keep the earlier correct choice first and select this exact new tuple.
    if(await page.locator('#dictionary-term').innerText()!==row.term){
      const disclosure=page.locator('#dictionary-choice-disclosure');if(!await disclosure.evaluate(n=>n.open))await disclosure.locator('summary').click();
      await page.locator('#dictionary-choices button').filter({has:page.locator('strong').filter({hasText:new RegExp('^'+row.term.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'$')})}).click();
    }
    await expect(page.locator('#dictionary-term')).toHaveText(row.term);await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
    await expect(page.locator('#dictionary-meaning p')).toHaveText(row.meaning.split(/\r?\n/u).filter(Boolean));
    const sense=page.locator('#dictionary-example-content .example-sense');await expect(sense).toHaveCount(1);
    await expect(sense.locator('[lang=en]')).toHaveText(row.en);await expect(sense.locator('[lang=zh-CN]')).toHaveText(row.zh);
    await expect(page.locator('#dictionary-example-source')).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  expect(errors).toEqual([]);expect(providers).toEqual([]);expect(writes).toEqual([]);
});
