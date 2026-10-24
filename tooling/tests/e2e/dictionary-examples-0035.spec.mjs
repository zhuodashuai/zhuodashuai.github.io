// Real local generated assets and anonymous native pages; never private writes.
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {personalDictionaryResult} from '../../../vocab/js/personal-dictionary.js';
const json=async file=>JSON.parse(await readFile(new URL('../../../'+file,import.meta.url),'utf8'));
const index=await json('tooling/dictionary/examples/additive-index-v4.json'),release=index.releases.find(r=>r.id==='examples-0035'),rows=new Map(),canonicalIds=new Map();
for(const file of release.sourceFiles){
 for(const row of(await json('tooling/dictionary/examples/source/'+file)).entries)rows.set(row.term,row);
 for(const row of(await json('tooling/dictionary/examples/reviews/'+file)).evidence.rows)canonicalIds.set(row.term,row.canonicalId);
}
expect(rows.size).toBe(398);
const manifest=await json('vocab/data/expanded-dictionary/manifest.json'),samples=[];
for(const term of ['beatable','koan','troller','chitlins','superiorly','glasslike']){
 const row=rows.get(term);expect(row).toBeTruthy();
 // Canonical home lookup is authenticated by the full build/unit tests; this
 // read supplies the existing raw POS/meaning for unchanged UI rendering.
 const id=canonicalIds.get(term);expect(Number.isSafeInteger(id)).toBe(true);
 const descriptor=manifest.english.shards[id%128];
 const source=(await json('vocab/data/expanded-dictionary/'+descriptor.file)).records.find(r=>r.id===id&&r.term===term);
 expect(source).toBeTruthy();
 samples.push({term,row,display:personalDictionaryResult({word:term,partOfSpeech:source.partOfSpeech,meaning:source.meaning})});
}
test.use({serviceWorkers:'block'});
for(const [label,viewport]of [['phone',{width:390,height:844}],['desktop',{width:1280,height:900}]])test('D35 '+label+' shows six exact new bilingual cards without overflow',async({page})=>{
 await page.setViewportSize(viewport);const errors=[],writes=[],providers=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());if(/api\.openai\.com|api\.anthropic\.com|api\.mymemory|api\.languagetool|\/api\/v1\/(?:ai|enrich|ocr)/u.test(r.url()))providers.push(r.url());});
 for(const item of samples){
  await page.goto('/dictionary.html#q='+encodeURIComponent(item.term));
  await expect(page.locator('#dictionary-term')).toHaveText(item.term);
  await expect(page.locator('#dictionary-pos')).toHaveText(item.display.partOfSpeech);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(item.display.meaning.split('\n'));
  const details=page.locator('#dictionary-example-content details');await expect(details).toHaveCount(1);
  await expect(details.locator('summary')).toHaveText('1. '+item.row.partOfSpeech+' · '+item.row.meaningZh);
  if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
  await expect(details.locator('p[lang=en]')).toHaveText(item.row.en);await expect(details.locator('p[lang=zh-CN]')).toHaveText(item.row.zh);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors).toEqual([]);expect(writes).toEqual([]);expect(providers).toEqual([]);
});
