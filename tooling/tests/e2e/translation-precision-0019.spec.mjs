import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {watchAnonymousStaticContext,assertClassroomTraffic} from './browser-checks-classroom-0009.mjs';
import {freshPrecisionReport,verifyPrecisionViewport} from './browser-checks-translation-precision-0014.mjs';

const bytes=await readFile(new URL('../../dictionary/examples/evidence/translation-precision-0019-fixture.json',import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe('68ab75a6da4db87a64ba50e215d3edf8388f7b5c6b5e67f810f185c76765aea9');
const fixture=JSON.parse(bytes);
expect(fixture.rows.map(row=>row.term)).toEqual(['enlightened','gent','writhe','sulk']);
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of[390,1280])test(`four ZH-only precision fixes preserve exact dictionary and saved learning/book/private fields at ${width}px`,async({context,baseURL},testInfo)=>{
 test.setTimeout(180000);
 const base=new URL('./',baseURL).href,report=freshPrecisionReport();
 await watchAnonymousStaticContext(context,base,report,expect);
 try{
  // Reuse every existing primary/whole-original-DTO/cross-head/edited-DTO,
  // saved-field, manual EN/ZH/book-node and layout assertion unchanged.
  await verifyPrecisionViewport({context,base,fixture,expect,report,width});
  expect(report.queries).toHaveLength(4);expect(report.native).toHaveLength(1);
  expect(report.native[0].checks).toHaveLength(4);expect(report.saved).toHaveLength(24);
  expect(report.queries.every(r=>r.firstHit&&!r.candidateClicked)).toBe(true);
  const page=await context.newPage();
  try{
   await page.setViewportSize({width,height:844});
   await page.goto(new URL('dictionary.html',base).href,{waitUntil:'domcontentloaded'});
   const held=await page.evaluate(async original=>{
    const[{DICTIONARY_EXAMPLE_CORRECTIONS:rows},{applyExampleCorrections}]=await Promise.all([
     import(new URL('js/dictionary-example-corrections-data.js',document.baseURI)),
     import(new URL('js/dictionary-example-corrections.js',document.baseURI))]);
    const before=JSON.stringify(original),corrected=await applyExampleCorrections('distrust',original);
    return{count:rows.length,heldAbsent:!rows.some(r=>['distrust','chaplain','stallion','incredulous'].includes(r.term)),sameObject:corrected===original,unchanged:JSON.stringify(original)===before};
   },fixture.unusedHeldPair.originalDTO);
   expect(held).toEqual({count:83,heldAbsent:true,sameObject:true,unchanged:true});
   for(const row of fixture.rows){
    await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');
    await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready',{timeout:20000});
    await expect(page.locator('#dictionary-term')).toHaveText(row.term);
    await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText([row.approvedPair.en]);
    await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText([row.approvedPair.zh]);
    await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
    await testInfo.attach(`${row.term}-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
   }
  }finally{await page.close();}
  assertClassroomTraffic(expect,report);
 }finally{await testInfo.attach(`translation-precision-0019-${width}.json`,{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});}
});
