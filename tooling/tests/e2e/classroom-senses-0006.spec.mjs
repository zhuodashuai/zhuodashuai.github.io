import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {dictionaryExamplesRelease} from '../../../vocab/js/dictionary-examples-release-v4.js';
import {createAdditiveExamplesLoader} from '../../../vocab/js/dictionary-examples-additive.js';
import {canonicalDisplayContexts} from '../../../vocab/js/canonical-example-repair-source.js';
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=x=>sha(JSON.stringify(x));
const source=JSON.parse(await readFile(new URL('../../dictionary/reviewed-senses/source/batch-0006.json',import.meta.url),'utf8'));
assert.equal(hash(source),'f4bfc5dfa7e8396cabe505a011b58e60d462fc9265f9b85ede8f4c5faea734ea');
assert.equal(source.exampleSource,'原创学习例句');assert.equal(source.entries.length,12);
const dataRoot=new URL('../../../vocab/data/expanded-dictionary/',import.meta.url);
const mb=await readFile(new URL('manifest.json',dataRoot));assert.equal(sha(mb),dictionaryExamplesRelease.source.manifestSha256);const manifest=JSON.parse(mb);
const fetchImpl=async input=>{const u=new URL(input);assert.equal(u.protocol,'file:');return new Response(await readFile(u));};
const rawLoader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl}),rows=[];
try{for(const row of source.entries){
 const d=manifest.english.shards.find(d=>d.bucket===row.canonicalId%128),b=await readFile(new URL(d.file,dataRoot));assert.equal(sha(b),d.sha256);assert.equal(b.length,d.bytes);
 const canonical=JSON.parse(b).records.find(r=>r.id===row.canonicalId&&r.term===row.term);assert(canonical);assert.equal(hash(canonical),row.canonicalSourceSha256);
 const originalDTO=await rawLoader.load(row.term,{lookupQuery:row.term});assert(originalDTO);
 const oldContexts=[],seen=new Set();const add=(partOfSpeech,meaning,kind)=>{if(!partOfSpeech?.trim()||!meaning?.trim())return;const k=JSON.stringify([partOfSpeech,meaning]);if(seen.has(k))return;seen.add(k);oldContexts.push({term:row.term,partOfSpeech,meaning,kind});};
 for(const c of canonicalDisplayContexts(canonical))add(c.partOfSpeech,c.meaning,'complete-old-canonical-display');
 for(const s of originalDTO.senses)add(s.partOfSpeech,s.meaningZh,'original-selected-sense');
 rows.push({...row,source:'卓式词典·义项补充',exampleSource:'原创学习例句',originalDTO,oldContexts,
  queries:[{kind:'literal',query:row.term},...row.englishForms.map(query=>({kind:'declared-form',query})),...row.chineseAliases.map(query=>({kind:'Chinese-alias',query}))]});
}}finally{rawLoader.close();}
const fixture={rows,queryCount:rows.reduce((n,r)=>n+r.queries.length,0),nativeLiteralChecks:rows.length,oldContextGuardCount:rows.reduce((n,r)=>n+r.oldContexts.length,0)};
test.use({serviceWorkers:'block'});
// Shared read-only browser checks. This file launches no browser or server.
async function watchReadOnlyContext(context,bases,report){
 const allowed=new Set(bases.map(b=>new URL(b).origin));
 context.on('request',r=>{
  const u=new URL(r.url());report.requestCount++;
  if(!['GET','HEAD'].includes(r.method()))report.writes.push({method:r.method(),url:r.url()});
  if(!allowed.has(u.origin))report.external.push(r.url());
  if(/(?:^|\/)api(?:\/|$)/u.test(u.pathname))report.api.push(r.url());
  if(/api\.openai|api\.anthropic|mymemory|languagetool|\/api\/v1\/(?:ai|enrich|translate|attribution)/iu.test(r.url()))report.providers.push(r.url());
 });
 await context.route('**/*',route=>{
  const r=route.request(),u=new URL(r.url());
  return !['GET','HEAD'].includes(r.method())||!allowed.has(u.origin)||/(?:^|\/)api(?:\/|$)/u.test(u.pathname)?route.abort('blockedbyclient'):route.continue();
 });
}
function freshBrowserReport(){return{queries:[],native:[],savedOld:[],savedNew:[],widths:[],writes:[],external:[],api:[],providers:[],errors:[],requestCount:0};}
async function verifyOrigin({context,base,fixture,modules,expect,report,width=390}){
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push({base,width,message:e.message}));
 await page.setViewportSize({width,height:844});await page.goto(base+'dictionary.html',{waitUntil:'domcontentloaded'});
 for(const row of fixture.rows)for(const q of row.queries){
  await page.locator('#dictionary-query').fill(q.query);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready',{timeout:20000});
  await expect.poll(()=>page.evaluate(()=>new URLSearchParams(location.hash.slice(1)).get('q'))).toBe(q.query);
  // A broad Chinese query can legitimately have several candidates. Select
  // the exact requested head explicitly, rather than asserting first-hit rank.
  const choices=page.locator('#dictionary-choices button').filter({has:page.locator('strong[lang=en]',{hasText:row.term})});
  if((await page.locator('#dictionary-term').textContent())!==row.term){
   const exact=page.locator('#dictionary-choices button').filter({has:page.locator('strong[lang=en]')});
   const index=await exact.evaluateAll((nodes,term)=>nodes.findIndex(n=>n.querySelector('strong')?.textContent===term),row.term);
   expect(index,'Expected exact head among query choices: '+q.query).toBeGreaterThanOrEqual(0);
   const disclosure=page.locator('#dictionary-choice-disclosure');
   if(!await disclosure.evaluate(n=>n.open))await disclosure.locator('summary').click();
   await exact.nth(index).click();
  }
  await expect(page.locator('#dictionary-term')).toHaveText(row.term);
  await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.meaning.split('\n'));
  await expect(page.locator('#dictionary-source a')).toHaveText(row.source);
  await expect(page.locator('#dictionary-source')).toHaveText('来源：'+row.source+' · Original composition');
  await expect(page.locator('#dictionary-example-panel')).toBeVisible({timeout:20000});
  const details=page.locator('#dictionary-example-content details');await expect(details).toHaveCount(1,{timeout:20000});
  if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
  await expect(details.locator('p[lang=en]')).toHaveText([row.en]);
  await expect(details.locator('p[lang=zh-CN]')).toHaveText([row.zh]);
  await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow').toBe(true);
  report.queries.push({base,width,kind:q.kind,query:q.query,term:row.term,pos:row.partOfSpeech,meaning:row.meaning,en:row.en,zh:row.zh,source:row.source,exampleSource:'原创学习例句'});
 }
 // At the other viewport, test every new card again without repeating a
 // duplicate query count claim for all forms/aliases.
 const alternate=width===390?1280:390;await page.setViewportSize({width:alternate,height:844});
 for(const row of fixture.rows){
  await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-term')).toHaveText(row.term);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.meaning.split('\n'));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  report.widths.push({base,width:alternate,term:row.term,noOverflow:true});
 }
 const native=await page.evaluate(async({rows,modulePath})=>{
  const{lookupPersonalDictionaryFast}=await import(new URL(modulePath,document.baseURI).href);let fallbackCalls=0;
  const forbidden=()=>{fallbackCalls++;throw Error('Exact selected head fell back to old/full dictionary');};
  const checks=[];
  for(const row of rows){const result=await lookupPersonalDictionaryFast(row.term,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden});
   const r=result.results.find(x=>x.term===row.term);if(!r||r.partOfSpeech!==row.partOfSpeech||r.meaning!==row.meaning||r.source!==row.source)throw Error('Native personal exact selected-head mismatch: '+row.term);
   checks.push({term:row.term,pos:r.partOfSpeech,meaning:r.meaning,source:r.source});}
  return{checks,fallbackCalls};
 },{rows:fixture.rows,modulePath:modules.personal});
 expect(native.checks.length).toBe(fixture.rows.length);expect(native.fallbackCalls).toBe(0);report.native.push({base,...native});
 const guards=await page.evaluate(async({rows,modulePath})=>{
  const{createDictionaryExamplesSection}=await import(new URL(modulePath,document.baseURI).href),old=[],accepted=[];
  for(const row of rows){
   const allowedOld=new Set(row.originalDTO.senses.flatMap(s=>s.examples).map(p=>JSON.stringify(p)));
   for(const c of row.oldContexts){
    const anchor=document.createElement('div'),stored=document.createElement('p');stored.textContent='Existing saved-fixture passage (not a book quotation).';document.body.append(anchor,stored);
    const section=createDictionaryExamplesSection({root:document,after:anchor});
    const card={term:row.term,partOfSpeech:c.partOfSpeech,meaning:{zh:c.meaning},examples:row.originalDTO.senses.flatMap(s=>s.examples),example:'Existing saved-fixture example.',bookPassage:stored.textContent,study:{box:4,correct:7}};
    const before=JSON.stringify(card);await section.show(card);
    const ens=[...section.section.querySelectorAll('p[lang=en]')].map(p=>p.textContent),zhs=[...section.section.querySelectorAll('p[lang="zh-CN"]')].map(p=>p.textContent);
    const pairs=ens.map((en,i)=>({en,zh:zhs[i]}));
    old.push({term:row.term,kind:c.kind,oldPOS:c.partOfSpeech,oldMeaning:c.meaning,unchanged:before===JSON.stringify(card),storedUnchanged:stored.textContent===card.bookPassage,
     newExampleAbsent:!ens.includes(row.en)&&!zhs.includes(row.zh),onlyOriginalOptionalPairs:pairs.every(p=>allowedOld.has(JSON.stringify(p))),hidden:section.section.hidden});
    section.clear();section.section.remove();anchor.remove();stored.remove();
   }
   const anchor=document.createElement('div');document.body.append(anchor);const section=createDictionaryExamplesSection({root:document,after:anchor});
   const card={term:row.term,partOfSpeech:row.partOfSpeech,meaning:{zh:row.meaning},example:'Existing selected-card fixture example.',bookPassage:'Existing selected-card fixture passage.',study:{box:3,correct:2}};
   const before=JSON.stringify(card);await section.show(card);
   accepted.push({term:row.term,shown:!section.section.hidden,unchanged:before===JSON.stringify(card),source:section.section.querySelector('.dictionary-learning-source')?.textContent,
    en:[...section.section.querySelectorAll('p[lang=en]')].map(p=>p.textContent),zh:[...section.section.querySelectorAll('p[lang="zh-CN"]')].map(p=>p.textContent)});
   section.clear();section.section.remove();anchor.remove();
  }
  return{old,accepted};
 },{rows:fixture.rows,modulePath:modules.examplesUI});
 expect(guards.old.length).toBe(fixture.oldContextGuardCount);
 for(const c of guards.old){expect(c.unchanged&&c.storedUnchanged&&c.newExampleAbsent&&c.onlyOriginalOptionalPairs,'Old context identity: '+c.term).toBe(true);}
 for(const c of guards.accepted){const row=fixture.rows.find(r=>r.term===c.term);expect(c.shown&&c.unchanged).toBe(true);expect(c.en).toEqual([row.en]);expect(c.zh).toEqual([row.zh]);expect(c.source).toBe('原创学习例句');}
 report.savedOld.push({base,checks:guards.old});report.savedNew.push({base,checks:guards.accepted});await page.close();
}
function assertNoForbiddenTraffic(expect,report){for(const key of['writes','external','api','providers','errors'])expect(report[key],key).toEqual([]);}

test('classroom selected senses: all literal/forms/Chinese queries, both layouts and exact saved-context separation',async({context})=>{
 test.setTimeout(120000);const base='http://127.0.0.1:4187/',report=freshBrowserReport();
 await watchReadOnlyContext(context,[base],report);
 await verifyOrigin({context,base,fixture,expect,report,width:390,modules:{personal:'js/personal-lookup-flow.js',examples:'js/dictionary-examples-current-v4.js',examplesUI:'js/dictionary-examples-ui-v108.js'}});
 expect(report.queries.length).toBe(fixture.queryCount);expect(report.native[0].checks.length).toBe(rows.length);
 expect(report.savedOld[0].checks.length).toBe(fixture.oldContextGuardCount);expect(report.savedNew[0].checks.length).toBe(rows.length);
 expect(report.widths.length).toBe(rows.length);assertNoForbiddenTraffic(expect,report);
});
