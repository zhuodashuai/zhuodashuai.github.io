import{test,expect}from'@playwright/test';
import{readFile}from'node:fs/promises';
const source=JSON.parse(await readFile(new URL('../../dictionary/everyday-expansions/2026-10-28-followup/alias-source.json',import.meta.url),'utf8'));
test.use({serviceWorkers:'block'});
for(const width of[390,1280])test(`six exact class aliases preserve the original bilingual cards at${width}px`,async({page})=>{
  const errors=[],forbidden=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{
    if(!['GET','HEAD'].includes(r.method())||new URL(r.url()).origin!=='http://127.0.0.1:4187')forbidden.push(r.url());
  });
  await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');
  for(const proposal of source.entries){
    const row=proposal.targetSnapshot;
    for(const query of proposal.aliases){
      await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
      await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
      await expect(page.locator('#dictionary-term')).toHaveText(row.term);await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
      await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.meaning.split('\n'));
      await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText(row.en);
      await expect(page.locator('#dictionary-example-content p[lang=zh-CN]')).toHaveText(row.zh);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
  }
  expect(errors).toEqual([]);expect(forbidden).toEqual([]);
});
