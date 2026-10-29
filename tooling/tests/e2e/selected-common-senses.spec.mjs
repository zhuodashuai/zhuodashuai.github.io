import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source=JSON.parse(await readFile(new URL('../../dictionary/selected-common-senses/source/batch-0001.json',import.meta.url)));
expect(createHash('sha256').update(JSON.stringify(source)).digest('hex')).toBe('13ed10586ce3be0c64d3cb8d00d11dc400e53d30bab1c7f65aafe412dc18ab76');
const entry=source.entries[0];
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});

for(const width of[390,1280])test(`selected common duty sense preserves full group, honest provenance, new and old saved examples at ${width}px`,async({context,page},info)=>{
  await page.setViewportSize({width,height:844});
  const forbidden=[],requests=[],errors=[];
  const unsafe=request=>{const url=new URL(request.url()),headers=request.headers();return url.origin!=='http://127.0.0.1:4187'||!['GET','HEAD'].includes(request.method())||/(?:^|\/)(?:api|private|auth)(?:\/|$)/iu.test(url.pathname)||['q','word','query','term','lookup','auth','token'].some(k=>url.searchParams.has(k))||['cookie','authorization','x-wordbook-auth','x-csrf-token'].some(k=>headers[k]);};
  context.on('request',request=>{requests.push(request.url());if(unsafe(request))forbidden.push(request.url());});
  await context.route('**/*',route=>unsafe(route.request())?route.abort('blockedbyclient'):route.continue());
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/dictionary.html');
  const observations=[];
  for(const query of['义务','职责','责任']){
    await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
    await expect.poll(()=>page.locator('#dictionary-choices button[data-dictionary-term]').evaluateAll(nodes=>nodes.map(n=>n.dataset.dictionaryTerm).sort())).toEqual(['duty','obligation','responsibility']);
    const first=await page.locator('#dictionary-term').textContent();expect(first).toBe(query==='义务'?'duty':'responsibility');
    const disclosure=page.locator('#dictionary-choice-disclosure');if(!await disclosure.evaluate(n=>n.open))await disclosure.locator('summary').click();
    await page.locator('#dictionary-choices button[data-dictionary-term="obligation"]').click();
    await expect(page.locator('#dictionary-meaning')).toHaveText(entry.selectedRow.meaning.replaceAll('\n',''));
    await expect(page.locator('#dictionary-source')).toContainText('卓式词典·义项补充');await expect(page.locator('#dictionary-source')).toContainText('Original composition');
    await expect(page.locator('#dictionary-example-content details[open] summary')).toContainText('本次义项');
    await expect(page.locator('#dictionary-example-content')).toContainText(entry.selectedRow.en);await expect(page.locator('#dictionary-example-content')).toContainText(entry.selectedRow.zh);
    await expect(page.locator('#dictionary-related-match')).toContainText('noun');await expect(page.locator('#dictionary-related-match')).toContainText('义务／职责／责任');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    observations.push({query,first,selected:'obligation',newPair:true});
  }
  const native=await page.evaluate(async entry=>{
    const load=p=>import(new URL(p,document.baseURI).href),[flow,hot,expanded,examples,ui]=await Promise.all([load('js/personal-lookup-flow.js'),load('js/personal-dictionary.js?v=97'),load('js/expanded-dictionary.js?v=104'),load('js/dictionary-examples-current-v4.js'),load('js/dictionary-examples-ui-v108.js')]);
    const assert=(ok,message)=>{if(!ok)throw Error(message);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),groups=[];let hotCalls=0,fullCalls=0;
    for(const query of['义务','职责','责任']){
      const result=await flow.lookupPersonalDictionaryFast(query,{hotLookup:(q,o)=>{hotCalls++;return hot.lookupPersonalDictionary(q,o);},hotReverse:(q,o)=>{hotCalls++;return hot.searchPersonalDictionaryChinese(q,o);},fullSearch:(q,o)=>{fullCalls++;return expanded.searchExpandedDictionary(q,o);}}),related=await expanded.searchRelatedChineseDictionary(query);
      const expectedDirect=query==='义务'?['duty','obligation']:query==='职责'?['responsibility','duty']:['responsibility','duty','obligation'],expectedRelated=query==='义务'?['responsibility']:query==='职责'?['obligation']:[];
      assert(same(result.results.map(r=>r.term),expectedDirect),'native direct partition changed');assert(same(related.results.map(r=>r.term),expectedRelated),'native related partition changed');groups.push({query,direct:expectedDirect,related:expectedRelated});
    }
    assert(hotCalls===0&&fullCalls===3,'new source group used old hot answer');
    const contexts=[{term:'obligation',partOfSpeech:'noun',meaning:entry.selectedRow.meaning,kind:'new'},...entry.legacySavedContexts.map(c=>({...c,kind:'old'})),{term:'obligation',partOfSpeech:'noun',meaning:'义务',kind:'old'}],accepted=[];
    for(const c of contexts)for(const nested of[false,true]){
      const card={term:c.term,partOfSpeech:c.partOfSpeech,meaning:nested?{zh:c.meaning}:c.meaning,bookId:'book',chapterId:'chapter',bookPassage:'My original book passage.',example:'My own original example.',study:{correct:7,incorrect:2},review:{dueAt:'2026-12-01'}},before=JSON.stringify(card),dto=await examples.loadDictionaryExamples('obligation',{savedEntry:card});assert(dto,'saved example missing');
      if(c.kind==='new')assert(same(dto.senses[0].examples,[{en:entry.selectedRow.en,zh:entry.selectedRow.zh}]),'new context wrong pair');else assert(same(dto,entry.originalDTO),'old complete DTO changed');
      const anchor=document.createElement('div');document.body.append(anchor);const section=ui.createDictionaryExamplesSection({root:document,after:anchor,loadModule:async()=>examples});await section.show(card);assert(!section.section.hidden,'saved UI hidden');assert(section.section.textContent.includes(c.kind==='new'?entry.selectedRow.en:entry.originalDTO.senses[0].examples[0].en),'saved UI missing pair');if(c.kind==='old')assert(!section.section.textContent.includes(entry.selectedRow.en),'new pair leaked to old context');section.clear();section.section.remove();anchor.remove();assert(JSON.stringify(card)===before,'private saved card mutated');accepted.push({kind:c.kind,nested});
    }
    const wrong=[{term:'duty',partOfSpeech:'noun',meaning:entry.legacySavedContexts[0].meaning},{term:'obligation',partOfSpeech:'verb',meaning:entry.legacySavedContexts[0].meaning},{term:'obligation',partOfSpeech:'noun',meaning:'人情债'},{term:'obligation',partOfSpeech:'noun',meaning:'不是'+entry.legacySavedContexts[0].meaning},{term:'obligation',partOfSpeech:'noun',meaning:entry.legacySavedContexts[0].meaning+' extra'}];
    for(const card of wrong)assert(await examples.loadDictionaryExamples('obligation',{savedEntry:card})===null,'wrong context got an example');
    return{groups,hotCalls,fullCalls,accepted,rejected:wrong.length};
  },entry);
  expect(native.accepted).toHaveLength(8);expect(native.rejected).toBe(5);expect(forbidden).toEqual([]);expect(errors).toEqual([]);
  expect(new Set(requests.filter(url=>/\/en-\d{3}\.json(?:$|\?)/u.test(url))).size).toBeLessThanOrEqual(6);
  expect(requests.some(url=>/\/zh-\d{3}\.json(?:$|\?)/u.test(url))).toBe(false);
  await info.attach('selected-common-'+width+'.json',{body:Buffer.from(JSON.stringify({width,observations,native,requests,forbidden,errors},null,2)),contentType:'application/json'});
});
