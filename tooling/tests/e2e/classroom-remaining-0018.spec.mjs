import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {watchAnonymousStaticContext,assertClassroomTraffic,freshClassroomReport} from './browser-checks-classroom-0009.mjs';
const bytes=await readFile(new URL('../../dictionary/reviewed-senses/classroom-remaining-fixture-0018.json',import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe('05fc65bc9356c308305da6631342aa1eadc53d4ec8693b841c9be2b049a6c4b9');
const fixture=JSON.parse(bytes);
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of [390,1280])test(`six classroom meanings and26 first-hit queries remain readable at ${width}px`,async({context,baseURL},testInfo)=>{
 test.setTimeout(180000);
 const base=new URL('./',baseURL).href,report=freshClassroomReport();
 await watchAnonymousStaticContext(context,base,report,expect);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.setViewportSize({width,height:844});await page.goto(new URL('dictionary.html',base).href,{waitUntil:'domcontentloaded'});
  for(const row of fixture.source.entries)for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
   await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
   await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready',{timeout:20000});
   await expect(page.locator('#dictionary-term')).toHaveText(row.term);await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
   await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.meaning.split('\n'));
   await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText([row.en]);
   await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText([row.zh]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   report.queries.push({query,term:row.term,width,firstHit:true});
   if(query===row.term)await testInfo.attach(`${row.term.replaceAll(' ','-')}-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  }
  // Exercise actual optional sections on synthetic saved cards. Exact old raw,
  // formatted and original-selected contexts keep every old pair; unrelated
  // personal meanings stay closed. No account, persistence or fixture API.
  const saved=await page.evaluate(async rows=>{
   const {createDictionaryExamplesSection}=await import(new URL('js/dictionary-examples-ui-v108.js',document.baseURI));
   const checks=[];
   for(const row of rows){
    const contexts=[{kind:'old-formatted',partOfSpeech:row.currentPrimary.partOfSpeech,meaning:row.currentPrimary.meaning},{kind:'old-raw',partOfSpeech:row.canonicalRecord.partOfSpeech,meaning:row.canonicalRecord.meaning},...row.originalDTO.senses.map(s=>({kind:'old-selected',partOfSpeech:s.partOfSpeech,meaning:s.meaningZh})),{kind:'wrong-POS',partOfSpeech:'interjection',meaning:row.sourceEntry.meaning},{kind:'unrelated-meaning',partOfSpeech:row.sourceEntry.partOfSpeech,meaning:'My unrelated personal meaning.'}];
    for(const identity of contexts)for(const nested of [false,true]){
     const root=document.createElement('div'),anchor=document.createElement('div');root.style.maxWidth='100%';root.append(anchor);document.body.append(root);
     const texts=['My original saved English.','我的原有中文例句。','My original book quotation.'],nodes=texts.map(text=>{const p=document.createElement('p');p.textContent=text;root.append(p);return p;});
     const card={id:'my-old-'+row.term,term:row.term,partOfSpeech:identity.partOfSpeech,meaning:nested?{zh:identity.meaning}:identity.meaning,example:texts[0],exampleZh:texts[1],bookPassage:texts[2],note:'My private note.',study:{box:4,correct:7},review:{dueAt:'2026-11-01T12:00:00.000Z'},progress:{streak:3}},before=JSON.stringify(card),section=createDictionaryExamplesSection({root:document,after:anchor});
     try{await section.show(card);checks.push({term:row.term,kind:identity.kind,nested,hidden:section.section.hidden,cardUnchanged:JSON.stringify(card)===before,originalTextsUnchanged:JSON.stringify(nodes.map(n=>n.textContent))===JSON.stringify(texts),pairs:[...section.section.querySelectorAll('p[lang=en]')].map((n,i)=>({en:n.textContent,zh:section.section.querySelectorAll('p[lang="zh-CN"]')[i].textContent})),noOverflow:document.documentElement.scrollWidth<=innerWidth+1});}
     finally{section.clear();root.remove();}
    }
   }return checks;
  },fixture.bindings);
  expect(saved).toHaveLength(60);
  for(const check of saved){expect(check.cardUnchanged&&check.originalTextsUnchanged&&check.noOverflow).toBe(true);const old=fixture.bindings.find(r=>r.term===check.term).originalDTO;
   if(check.kind.startsWith('old-')){expect(check.hidden).toBe(false);expect(check.pairs).toEqual(old.senses.flatMap(s=>s.examples));}
   else{expect(check.hidden).toBe(true);expect(check.pairs).toEqual([]);}
  }
  report.savedAccepted.push(...saved);
  expect(report.queries).toHaveLength(26);expect(await context.cookies(base)).toEqual([]);
  assertClassroomTraffic(expect,report);
 }finally{
  await testInfo.attach(`classroom-remaining-0018-${width}.json`,{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});
  await page.close();
 }
});
