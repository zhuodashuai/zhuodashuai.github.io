import {test,expect} from '@playwright/test';
import {CANONICAL_EXAMPLE_COMPONENTS as table} from '../../../vocab/js/canonical-example-components-data.js';
function observe(page){const writes=[],foreign=[],errors=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());if(new URL(r.url()).origin!=='http://127.0.0.1:4192')foreign.push(r.url());});page.on('pageerror',e=>errors.push(e.message));return {writes,foreign,errors};}
for(const [i,row]of table.rows.entries())test(`real dictionary card retains all old senses and adds its labelled component: ${row.term}`,async({page},testInfo)=>{
  const log=observe(page);await page.setViewportSize({width:i%2?390:1280,height:844});await page.goto('/dictionary.html');
  await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-term')).toHaveText(row.term);
  const oldPairs=row.expectedOriginalEntry.senses.flatMap(s=>s.examples),details=page.locator('#dictionary-example-content details');
  await expect(details).toHaveCount(row.expectedOriginalEntry.senses.length+1);
  for(const item of await details.all())if(!await item.evaluate(el=>el.open))await item.locator('summary').click();
  await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText([...oldPairs.map(p=>p.en),row.componentPair.en]);
  await expect(page.locator('#dictionary-example-content p[lang=zh-CN]')).toHaveText([...oldPairs.map(p=>p.zh),row.componentPair.zh]);
  await expect(details.last().locator('summary')).toContainText(row.componentPair.meaningZh);
  await expect(page.locator('#dictionary-pos')).toHaveText(row.exactCanonicalRecord.partOfSpeech);
  const meaning=await page.locator('#dictionary-meaning').innerText();expect(row.canonicalContexts.some(c=>c.meaning.replace(/\s+/gu,' ').trim()===meaning.replace(/\s+/gu,' ').trim())).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(log).toEqual({writes:[],foreign:[],errors:[]});
  if(['burden','honor'].includes(row.term))await page.screenshot({path:testInfo.outputPath(`${row.term}-complete-card.png`),fullPage:true});
});
test('actual saved-card section selects old/new contexts and leaves books and study state untouched',async({page})=>{
  const log=observe(page);await page.goto('/dictionary.html');
  const result=await page.evaluate(async()=>{
    const {createDictionaryExamplesSection}=await import('/js/dictionary-examples-ui-v108.js'),{CANONICAL_EXAMPLE_COMPONENTS:t}=await import('/js/canonical-example-components-data.js');
    const row=t.rows.find(r=>r.term==='burden'),anchor=document.createElement('div');document.body.append(anchor);
    const section=createDictionaryExamplesSection({root:document,after:anchor}),saved={...row.legacyContexts[0],examples:[{en:'My stored example.',zh:'我的保存内容。'}],bookPassage:'Existing book passage.',study:{box:4}};
    const before=JSON.stringify(saved);await section.show(saved);const old=[...section.section.querySelectorAll('p[lang=en]')].map(p=>p.textContent);
    await section.show({...row.componentContexts[0]});const selected=[...section.section.querySelectorAll('p[lang=en]')].map(p=>p.textContent);
    await section.show({term:'burden',partOfSpeech:'verb',meaning:'未审核含义',approved:true});return {old,selected,hidden:section.section.hidden,unchanged:JSON.stringify(saved)===before};
  });
  const row=table.rows.find(r=>r.term==='burden');expect(result).toEqual({old:row.expectedOriginalEntry.senses.flatMap(s=>s.examples.map(p=>p.en)),selected:[row.componentPair.en],hidden:true,unchanged:true});expect(log).toEqual({writes:[],foreign:[],errors:[]});
});
test('unavailable optional graph retains old examples and the canonical primary card',async({page})=>{
  const log=observe(page),row=table.rows.find(r=>r.term==='claim');await page.route('**/js/canonical-example-components.js',r=>r.abort('failed'));
  await page.goto('/dictionary.html');await page.locator('#dictionary-query').fill(row.term);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-term')).toHaveText(row.term);
  await expect(page.locator('#dictionary-example-content details')).toHaveCount(row.expectedOriginalEntry.senses.length);
  const scoped=await page.evaluate(async()=>{
    const {loadDictionaryExamples}=await import('/js/dictionary-examples-current-v4.js'),{CANONICAL_EXAMPLE_COMPONENTS:t}=await import('/js/canonical-example-components-data.js');
    const r=t.rows.find(x=>x.term==='claim');
    return {newOnly:await loadDictionaryExamples('claim',{savedEntry:r.componentContexts[0]}),unrelated:await loadDictionaryExamples('claim',{savedEntry:{term:'claim',partOfSpeech:'noun',meaning:'未审核含义',approved:true}})};
  });
  expect(scoped).toEqual({newOnly:null,unrelated:null});
  expect(log).toEqual({writes:[],foreign:[],errors:[]});
});
test('unrelated cards do not request the component graph',async({page})=>{
  const requested=[];page.on('request',r=>{if(/canonical-example-components/u.test(r.url()))requested.push(r.url());});
  await page.goto('/dictionary.html');await page.locator('#dictionary-query').fill('agitated');await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-example-content p[lang=en]').first()).not.toBeEmpty();expect(requested).toEqual([]);
});
