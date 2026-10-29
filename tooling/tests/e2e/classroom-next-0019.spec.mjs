import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {watchAnonymousStaticContext,assertClassroomTraffic,freshClassroomReport} from './browser-checks-classroom-0009.mjs';
const bytes=await readFile(new URL('../../dictionary/reviewed-senses/classroom-next-fixture-0019.json',import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe('f3f2bdf39e76b6341a8468e47cd5cf3d463b8dfab2582d5ebdb9e6f3c8e2e40c');
const fixture=JSON.parse(bytes),approved=fixture.source.entries.filter(r=>fixture.review.approvedTerms.includes(r.term));
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of[390,1280])test(`four classroom supplements keep21first-hits and54exact saved-DOM contexts at ${width}px`,async({context,baseURL},testInfo)=>{
 test.setTimeout(180000);const base=new URL('./',baseURL).href,report=freshClassroomReport();
 await watchAnonymousStaticContext(context,base,report,expect);
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.setViewportSize({width,height:844});await page.goto(new URL('dictionary.html',base).href,{waitUntil:'domcontentloaded'});
  for(const row of approved)for(const query of[row.term,...row.englishForms,...row.chineseAliases]){
   await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
   await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready',{timeout:20000});
   await expect(page.locator('#dictionary-term')).toHaveText(row.term);await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
   await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.meaning.split('\n'));
   await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText([row.en]);
   await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText([row.zh]);
   await expect(page.locator('#dictionary-example-content summary')).toHaveText('1. '+row.partOfSpeech+' · '+row.meaning);
   await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   report.queries.push({query,term:row.term,width,firstHit:true});
   if(query===row.term)await testInfo.attach(`${row.term}-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  }
  const checks=await page.evaluate(async rows=>{
   const{createDictionaryExamplesSection}=await import(new URL('js/dictionary-examples-ui-v108.js',document.baseURI));const checks=[];
   for(const row of rows){
    const contexts=[...row.canonicalContexts.map((c,i)=>({...c,kind:i?'old-formatted':'old-raw'})),...row.originalDTO.senses.map(s=>({partOfSpeech:s.partOfSpeech,meaning:s.meaningZh,kind:'old-selected'}))];
    if(row.integrated)contexts.push({partOfSpeech:row.sourceEntry.partOfSpeech,meaning:row.sourceEntry.meaning,kind:'new-selected'},{partOfSpeech:'interjection',meaning:row.sourceEntry.meaning,kind:'wrong-POS'},{partOfSpeech:row.sourceEntry.partOfSpeech,meaning:'An unrelated private meaning.',kind:'unrelated-meaning'});
    for(const identity of contexts)for(const nested of[false,true]){
     const root=document.createElement('div'),anchor=document.createElement('div');root.style.maxWidth='100%';root.append(anchor);document.body.append(root);
     const texts=['My saved original English.','我的原有手动译文。','My original book quotation.'],nodes=texts.map(text=>{const p=document.createElement('p');p.textContent=text;root.append(p);return p;});
     const card={id:'my-saved-'+row.term,term:row.term,partOfSpeech:identity.partOfSpeech,meaning:nested?{zh:identity.meaning}:identity.meaning,example:texts[0],exampleZh:texts[1],bookPassage:texts[2],note:'Private note',folderIds:['reading'],study:{box:4,correct:7},review:{dueAt:'2026-11-01T12:00:00.000Z'},progress:{streak:3}},before=JSON.stringify(card),section=createDictionaryExamplesSection({root:document,after:anchor});
     try{await section.show(card);checks.push({term:row.term,kind:identity.kind,nested,hidden:section.section.hidden,cardUnchanged:JSON.stringify(card)===before,manualBookPlaintextUnchanged:JSON.stringify(nodes.map(n=>n.textContent))===JSON.stringify(texts),labels:[...section.section.querySelectorAll('h4')].map(n=>n.textContent),pairs:[...section.section.querySelectorAll('p[lang=en]')].map((n,i)=>({en:n.textContent,zh:section.section.querySelectorAll('p[lang="zh-CN"]')[i].textContent})),noOverflow:document.documentElement.scrollWidth<=innerWidth+1&&section.section.scrollWidth<=section.section.clientWidth+1});}
     finally{section.clear();root.remove();}
    }
   }return checks;
  },fixture.bindings);
  expect(checks).toHaveLength(54);expect(checks.filter(c=>c.kind.startsWith('old-'))).toHaveLength(30);
  for(const check of checks){expect(check.cardUnchanged&&check.manualBookPlaintextUnchanged&&check.noOverflow).toBe(true);const row=fixture.bindings.find(r=>r.term===check.term),dto=check.kind.startsWith('old-')?row.originalDTO:check.kind==='new-selected'?row.expectedSelectedDTO:null;
   if(dto){expect(check.hidden).toBe(false);expect(check.labels).toEqual(dto.senses.map(s=>s.partOfSpeech+' · '+s.meaningZh));expect(check.pairs).toEqual(dto.senses.flatMap(s=>s.examples));}
   else{expect(check.hidden).toBe(true);expect(check.labels).toEqual([]);expect(check.pairs).toEqual([]);}
  }
  report.savedAccepted.push(...checks);expect(report.queries).toHaveLength(21);expect(await context.cookies(base)).toEqual([]);assertClassroomTraffic(expect,report);
 }finally{await testInfo.attach(`classroom-next-0019-${width}.json`,{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});await page.close();}
});
