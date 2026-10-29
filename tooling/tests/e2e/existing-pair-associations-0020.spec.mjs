import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {REVIEWED_SENSE_ENTRIES} from '../../../vocab/js/reviewed-senses-data.js';
import {watchAnonymousStaticContext,assertClassroomTraffic,freshClassroomReport} from './browser-checks-classroom-0009.mjs';
const source=JSON.parse(await readFile(new URL('../../dictionary/reviewed-senses/source/batch-0014.json',import.meta.url),'utf8'));
const evidence=JSON.parse(await readFile(new URL('../../dictionary/reviewed-senses/existing-pairs/source/common-use-0020.json',import.meta.url),'utf8'));
const rows=source.entries.map(row=>({source:row,compiled:REVIEWED_SENSE_ENTRIES.find(item=>item.term===row.term),original:evidence.entries.find(item=>item.term===row.term).completeOldDTO}));
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of [390,1280])test(`same-head original pairs retain their specific roles across72 searches and all saved contexts at ${width}px`,async({context,baseURL},testInfo)=>{
  test.setTimeout(180000);const base=new URL('./',baseURL).href,report=freshClassroomReport();
  await watchAnonymousStaticContext(context,base,report,expect);
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  try{
    await page.setViewportSize({width,height:844});await page.goto(new URL('dictionary.html',base).href,{waitUntil:'domcontentloaded'});
    let queries=0;
    for(const row of rows)for(const query of [row.source.term,row.source.term.toUpperCase(),...row.source.englishForms,...row.source.chineseAliases]){
      await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
      await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
      await expect(page.locator('#dictionary-term')).toHaveText(row.source.term);await expect(page.locator('#dictionary-pos')).toHaveText(row.source.partOfSpeech);
      await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.source.meaning.split('\n'));
      const original=row.original.senses[0];
      await expect(page.locator('#dictionary-example-content summary')).toHaveText('1. '+original.partOfSpeech+' · '+original.meaningZh);
      await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText(original.examples.map(pair=>pair.en));
      await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText(original.examples.map(pair=>pair.zh));
      await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);queries++;
      if(query===row.source.term)await testInfo.attach(`${row.source.term}-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    }
    expect(queries).toBe(72);
    const checks=await page.evaluate(async rows=>{
      const {createDictionaryExamplesSection}=await import(new URL('js/dictionary-examples-ui-v108.js',document.baseURI));
      const output=[];
      for(const row of rows){
        const accepted=JSON.parse(row.compiled.existingExampleContextsJSON);
        const rejected=[{term:row.source.term,partOfSpeech:'interjection',meaning:row.source.meaning},{term:row.source.term,partOfSpeech:row.source.partOfSpeech,meaning:'An unrelated private meaning.'}];
        for(const [kind,identities]of [['accepted',accepted],['rejected',rejected]])for(const identity of identities)for(const nested of [false,true]){
          const root=document.createElement('div'),anchor=document.createElement('div');root.style.maxWidth='100%';root.append(anchor);document.body.append(root);
          const texts=['Keep my manual English.','保留我的手动译文。','Keep my book quotation.'];
          const nodes=texts.map(text=>{const p=document.createElement('p');p.textContent=text;root.append(p);return p;});
          const card={...identity,meaning:nested?{zh:identity.meaning}:identity.meaning,id:'my-'+row.source.term,example:texts[0],exampleZh:texts[1],bookPassage:texts[2],note:'Private note',folderIds:['reading'],study:{box:4,correct:7},review:{dueAt:'2026-11-01'}};
          const before=JSON.stringify(card),section=createDictionaryExamplesSection({root:document,after:anchor});
          try{
            await section.show(card);output.push({term:row.source.term,kind,nested,hidden:section.section.hidden,
              labels:[...section.section.querySelectorAll('h4')].map(node=>node.textContent),
              pairs:[...section.section.querySelectorAll('p[lang=en]')].map((node,index)=>({en:node.textContent,zh:section.section.querySelectorAll('p[lang="zh-CN"]')[index].textContent})),
              cardUnchanged:JSON.stringify(card)===before,originalTextUnchanged:JSON.stringify(nodes.map(node=>node.textContent))===JSON.stringify(texts),
              noOverflow:document.documentElement.scrollWidth<=innerWidth+1&&section.section.scrollWidth<=section.section.clientWidth+1});
          }finally{section.clear();root.remove();}
        }
      }
      return output;
    },rows);
    const acceptedCount=rows.reduce((total,row)=>total+JSON.parse(row.compiled.existingExampleContextsJSON).length*2,0);
    expect(checks.filter(check=>check.kind==='accepted')).toHaveLength(acceptedCount);expect(checks.filter(check=>check.kind==='rejected')).toHaveLength(48);
    for(const check of checks){
      expect(check.cardUnchanged&&check.originalTextUnchanged&&check.noOverflow).toBe(true);
      const original=rows.find(row=>row.source.term===check.term).original;
      if(check.kind==='accepted'){
        expect(check.hidden).toBe(false);expect(check.labels).toEqual(original.senses.map(sense=>sense.partOfSpeech+' · '+sense.meaningZh));expect(check.pairs).toEqual(original.senses.flatMap(sense=>sense.examples));
      }else{expect(check.hidden).toBe(true);expect(check.labels).toEqual([]);expect(check.pairs).toEqual([]);}
    }
    await testInfo.attach(`existing-pair-contexts-${width}.json`,{body:Buffer.from(JSON.stringify({queries,acceptedCount,rejectedCount:48,checks,traffic:report},null,2)),contentType:'application/json'});
    assertClassroomTraffic(expect,report);expect(report.errors).toEqual([]);
  }finally{await page.close();}
});
