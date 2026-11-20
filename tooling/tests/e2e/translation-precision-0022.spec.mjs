import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {watchAnonymousStaticContext,assertClassroomTraffic,freshClassroomReport} from './browser-checks-classroom-0009.mjs';
const bytes=await readFile(new URL('../../dictionary/examples/evidence/translation-precision-0022-fixture.json',import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe('67b030faad70ca397fc290ae2a2737c0363be15ff0dbd9439239128b104e25e3');
const fixture=JSON.parse(bytes),screens=new Set(['cheddar','whinge','surrealist','self-imposed','jo','internationally']);
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of [390,1280])test(`41 Chinese repairs preserve dictionary roles, original pairs and private saved cards at ${width}px`,async({context,baseURL},testInfo)=>{
 test.setTimeout(240000);const base=new URL('./',baseURL).href,traffic={...freshClassroomReport(),saved:[]};await watchAnonymousStaticContext(context,base,traffic,expect);
 const page=await context.newPage();page.on('pageerror',error=>traffic.errors.push(error.message));
 try{
  await page.setViewportSize({width,height:844});await page.goto(new URL('dictionary.html',base).href,{waitUntil:'domcontentloaded'});
  for(const row of fixture.rows){
   await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');
   await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');await expect(page.locator('#dictionary-term')).toHaveText(row.term);await expect(page.locator('#dictionary-pos')).toHaveText(row.expectedPrimary.partOfSpeech);
   await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.expectedPrimary.meaning.split(/\r?\n/u).filter(Boolean));
   const sense=row.expectedCorrectedDTO.senses[0];await expect(page.locator('#dictionary-example-content summary')).toHaveText('1. '+sense.partOfSpeech+' · '+sense.meaningZh);
   await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText(sense.examples.map(pair=>pair.en));await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText(sense.examples.map(pair=>pair.zh));await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);traffic.queries.push({term:row.term,partOfSpeech:row.expectedPrimary.partOfSpeech,meaning:row.expectedPrimary.meaning,example:sense.examples});
   if(screens.has(row.term))await testInfo.attach(`${row.term}-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  }
  const native=await page.evaluate(async rows=>{
   const [{createAdditiveExamplesLoader},{dictionaryExamplesRelease},current,corrections]=await Promise.all([import(new URL('js/dictionary-examples-additive.js',document.baseURI)),import(new URL('js/dictionary-examples-release-v4.js',document.baseURI)),import(new URL('js/dictionary-examples-current-v4.js',document.baseURI)),import(new URL('js/dictionary-example-corrections.js',document.baseURI))]);
   const fetchImpl=async(input,options={})=>{const u=new URL(typeof input==='string'||input instanceof URL?input:input.url,document.baseURI);if(u.origin!==location.origin||!['GET','HEAD'].includes(options.method||'GET')||/(?:^|\/)(?:api|private|auth)(?:\/|$)/u.test(u.pathname))throw Error('Non-static precision read');return fetch(u,{...options,credentials:'omit'});};
   const reader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl}),checks=[];
   try{for(const [index,row]of rows.entries()){
    const original=await reader.load(row.term,{lookupQuery:row.term}),before=JSON.stringify(original),corrected=await current.loadDictionaryExamples(row.term,{fetchImpl});
    if(before!==JSON.stringify(row.originalDTO)||JSON.stringify(corrected)!==JSON.stringify(row.expectedCorrectedDTO)||JSON.stringify(original)!==before)throw Error('Complete original/corrected DTO mismatch '+row.term);
    if(await corrections.applyExampleCorrections(rows[(index+1)%rows.length].term,original)!==original)throw Error('Cross-head transfer');
    for(const key of ['term','POS','meaning','ZH','senseId']){const dto=structuredClone(original);if(key==='term')dto.term+='x';if(key==='POS')dto.senses[0].partOfSpeech='interjection';if(key==='meaning')dto.senses[0].meaningZh='不同的私人意思';if(key==='ZH')dto.senses[0].examples[0].zh+='改过。';if(key==='senseId')dto.senses[0].id+='x';const snapshot=JSON.stringify(dto);if(await corrections.applyExampleCorrections(row.term,dto)!==dto||JSON.stringify(dto)!==snapshot)throw Error('Altered DTO obtained a correction '+row.term);}
    checks.push({term:row.term,originalDTO:original,correctedDTO:corrected,originalUnchanged:true,crossHeadRejected:true,alteredIdentityCases:5});
   }}finally{reader.close();current.resetDictionaryExamplesCacheForTests();}return checks;
  },fixture.rows);expect(native).toHaveLength(41);traffic.native.push(...native);
  const saved=await page.evaluate(async rows=>{
   const {createDictionaryExamplesSection}=await import(new URL('js/dictionary-examples-ui-v108.js',document.baseURI));const output=[];
   for(const row of rows)for(const identity of [{kind:'exact',partOfSpeech:row.approvedPair.partOfSpeech,meaning:row.approvedPair.meaningZh},{kind:'unrelated-POS',partOfSpeech:'interjection',meaning:row.approvedPair.meaningZh},{kind:'unrelated-meaning',partOfSpeech:row.approvedPair.partOfSpeech,meaning:'Another private meaning.'}])for(const nested of [false,true]){
    const root=document.createElement('div'),anchor=document.createElement('div');root.style.maxWidth='100%';root.append(anchor);document.body.append(root);const texts=['Keep my manual English.','保留我的手动译文。','Keep my book quotation.'],nodes=texts.map(text=>{const p=document.createElement('p');p.textContent=text;root.append(p);return p;});
    const card={term:row.term,id:'private-'+row.term,partOfSpeech:identity.partOfSpeech,meaning:nested?{zh:identity.meaning}:identity.meaning,example:texts[0],exampleZh:texts[1],bookPassage:texts[2],note:'Private note',folderIds:['reading','spoken'],study:{box:4,correct:7},review:{dueAt:'2026-11-01'},progress:{streak:3}},before=JSON.stringify(card),section=createDictionaryExamplesSection({root:document,after:anchor});
    try{await section.show(card);output.push({term:row.term,kind:identity.kind,nested,hidden:section.section.hidden,labels:[...section.section.querySelectorAll('h4')].map(node=>node.textContent),pairs:[...section.section.querySelectorAll('p[lang=en]')].map((node,index)=>({en:node.textContent,zh:section.section.querySelectorAll('p[lang="zh-CN"]')[index].textContent})),cardUnchanged:JSON.stringify(card)===before,manualAndBookUnchanged:JSON.stringify(nodes.map(node=>node.textContent))===JSON.stringify(texts),noOverflow:document.documentElement.scrollWidth<=innerWidth+1&&section.section.scrollWidth<=section.section.clientWidth+1});}finally{section.clear();root.remove();}
   }return output;
  },fixture.rows);expect(saved).toHaveLength(246);
  for(const check of saved){const row=fixture.rows.find(row=>row.term===check.term);expect(check.hidden).toBe(false);expect(check.cardUnchanged&&check.manualAndBookUnchanged&&check.noOverflow).toBe(true);expect(check.labels).toEqual(row.expectedCorrectedDTO.senses.map(sense=>sense.partOfSpeech+' · '+sense.meaningZh));expect(check.pairs).toEqual(row.expectedCorrectedDTO.senses.flatMap(sense=>sense.examples));}traffic.saved.push(...saved);
  expect(traffic.queries).toHaveLength(41);expect(traffic.errors).toEqual([]);expect(await context.cookies(base)).toEqual([]);assertClassroomTraffic(expect,traffic);
 }finally{await testInfo.attach(`translation-precision-0022-${width}.json`,{body:Buffer.from(JSON.stringify(traffic,null,2)),contentType:'application/json'});await page.close();}
});
