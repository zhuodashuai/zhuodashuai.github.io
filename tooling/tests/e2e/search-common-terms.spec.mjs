import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';

const ORIGIN='http://127.0.0.1:4187',PUBLIC='/api/v1/public/wordbook',MEMBER='/api/v1/member/entries',COLLECT='/api/v1/owner/dictionary-collection';
const sha=value=>createHash('sha256').update(value).digest('hex');
const directory=new URL('../../dictionary/everyday-expansions/2026-11-19-common-terms/',import.meta.url);
const sourceBytes=await readFile(new URL('source.json',directory));
expect(sha(sourceBytes)).toBe('ebaacb360562746a8e0dc6709732c57ff436300fe27366c9760b1866e4993ad7');
const source=JSON.parse(sourceBytes),review=JSON.parse(await readFile(new URL('review.json',directory)));
expect(review.sourceByteSha256).toBe(sha(sourceBytes));expect(review.independentOfAuthor).toBe(true);expect(review.reviewer).not.toBe(source.author);
expect(review.approvedTerms).toEqual(source.entries.map(row=>row.term));expect(source.entries).toHaveLength(13);
expect(source.entries.reduce((sum,row)=>sum+1+row.englishForms.length,0)).toBe(42);
const correctionBytes=await readFile(new URL('../../dictionary/reviewed-senses/source/batch-0017.json',import.meta.url));
expect(sha(correctionBytes)).toBe('fc994f62c92a4653714bc9ecbab2d7633f970751e56aec67c5a23b9ac877a2f4');
const corrections=JSON.parse(correctionBytes).entries;
const side=JSON.parse(await readFile(new URL('../../dictionary/english-surface-variants/side-effects.json',import.meta.url))).sourceEvidence.completeCurrentLiteralDTO;

test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
test.beforeEach(async({context})=>{await context.addCookies([{name:'e2e_run',value:'common-terms-'+randomUUID(),url:ORIGIN}]);});
test.afterEach(async({page,context})=>{await page.unrouteAll({behavior:'wait'});await context.unrouteAll({behavior:'wait'});});
function observe(page){const calls=[];page.on('request',request=>calls.push({url:request.url(),path:new URL(request.url()).pathname,method:request.method(),body:request.postDataJSON()}));return calls;}
const writes=calls=>calls.filter(call=>!['GET','HEAD','OPTIONS'].includes(call.method));
function noProvider(calls){expect(calls.filter(call=>new URL(call.url).origin!==ORIGIN)).toEqual([]);expect(calls.filter(call=>/\/api\/.*(?:ai|translate|organize)/u.test(call.path))).toEqual([]);}
function readOnly(calls){noProvider(calls);expect(writes(calls)).toEqual([]);expect(calls.filter(call=>call.path.startsWith('/api/'))).toEqual([]);}
async function submit(page,query,{empty=false}={}){
  await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase',empty?'empty':'ready');
  await expect(page.locator('#dictionary-query')).toHaveValue(query);
  expect(new URL(page.url()).hash).toBe('#q='+encodeURIComponent(query));
}
async function selectCompleteCandidate(page,head){
  const disclosure=page.locator('#dictionary-choice-disclosure');
  const choice=page.locator('#dictionary-choices button').filter({has:page.locator('strong',{hasText:new RegExp('^'+head.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')+'$','u')})});
  if(!await page.locator('#dictionary-choice-panel').isVisible()){
    // A sole exact result has no switcher to click. It must already be the
    // selected full card; a suggestion or a hidden unrelated row cannot pass.
    await expect(page.locator('#dictionary-choices button')).toHaveCount(1);
    await expect(choice).toHaveCount(1);await expect(choice).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#dictionary-more')).toBeHidden();
    await expect(page.locator('#dictionary-term')).toHaveText(head);return;
  }
  if(await page.locator('#dictionary-choice-panel').isVisible()&&!await disclosure.evaluate(node=>node.open))await disclosure.locator('summary').click();
  const more=page.locator('#dictionary-more');
  while(await more.isVisible()){
    const before=await page.locator('#dictionary-choices button').count();await expect(more).toBeEnabled();await more.click();
    await expect.poll(()=>page.locator('#dictionary-choices button').count()).toBeGreaterThan(before);
  }
  await expect(choice).toHaveCount(1);await choice.click();await expect(page.locator('#dictionary-term')).toHaveText(head);
}
async function card(page,row,{sourceLabel=row.dictionarySource||'卓式词典·原创释义',license='Original composition',url='https://zhuodashuai.github.io/vocab/'}={}){
  await expect(page.locator('#dictionary-result')).toBeVisible();await expect(page.locator('#dictionary-term')).toHaveText(row.term);
  await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.meaning.split(/\r?\n/u));
  await expect(page.locator('#dictionary-source')).toHaveText('来源：'+sourceLabel+' · '+license);
  await expect(page.locator('#dictionary-source a')).toHaveAttribute('href',url);
}
async function examples(page,senses){
  const details=page.locator('#dictionary-example-content .example-sense');await expect(details).toHaveCount(senses.length);
  for(const[index,sense]of senses.entries()){
    const detail=details.nth(index);await expect(detail.locator('summary')).toContainText(sense.partOfSpeech);
    const headingMeaning=sense.meaningZh.replace(/^\s*(?:[①-⑳]|[1-9]\d?[.、](?!\d))\s*/u,'');
    await expect(detail.locator('summary')).toContainText(sense.partOfSpeech+' · '+headingMeaning);
    if(!await detail.evaluate(node=>node.open))await detail.locator('summary').click();
    await expect(detail.locator('p[lang="en"]')).toHaveText(sense.examples.map(pair=>pair.en));
    await expect(detail.locator('p[lang="zh-CN"]')).toHaveText(sense.examples.map(pair=>pair.zh));
  }
}
async function screenshotAndNumbering(page,info,name){
  const summaries=await page.locator('#dictionary-example-content .example-sense summary').allTextContents();
  expect(summaries.filter(text=>/^\d+\.\s.*·\s*[①-⑳]/u.test(text))).toEqual([],'Each example sense heading has one ordinal');
  const observation=info.outputPath(name+'-numbering.json'),screenshot=info.outputPath(name+'.png');
  await writeFile(observation,JSON.stringify({summaries,redundantNumberPrefix:summaries.filter(text=>/^\d+\.\s.*·\s*[①-⑳]/u.test(text))},null,2));
  // Expanding a below-fold sense scrolls the browser. Start full-page capture
  // at the top so a sticky header is not misleadingly painted mid-document.
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  await page.screenshot({fullPage:true,path:screenshot});
  await info.attach(name+'-numbering.json',{path:observation,contentType:'application/json'});
  await info.attach(name,{path:screenshot,contentType:'image/png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}

for(const width of[390,1280]){
  for(const row of source.entries)test(`reviewed common expression ${row.term}: every whole form and complete Chinese alias at${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});const calls=observe(page);await page.goto('/dictionary.html');
    const senses=[{partOfSpeech:row.partOfSpeech,meaningZh:row.meaning,examples:[{en:row.en,zh:row.zh}]}];
    for(const query of[row.term,...row.englishForms]){
      await submit(page,query);await card(page,row);await examples(page,senses);
      if(query===row.term)await expect(page.locator('#dictionary-matched-form')).toBeHidden();
      else await expect(page.locator('#dictionary-matched-form')).toHaveText('查询形式：'+query);
    }
    for(const query of row.chineseAliases){await submit(page,query);await selectCompleteCandidate(page,row.term);await card(page,row);await examples(page,senses);}
    readOnly(calls);
  });
  for(const row of corrections)test(`corrected ${row.term} exposes every exact POS/sense pair at${width}px`,async({page},info)=>{
    await page.setViewportSize({width,height:844});const calls=observe(page);await page.goto('/dictionary.html');await submit(page,row.term);
    await card(page,row,{sourceLabel:'卓式词典·义项补充'});await examples(page,row.exampleSenses);
    await screenshotAndNumbering(page,info,`${row.term}-${width}`);readOnly(calls);
  });
  test(`mortuaries preserves only the two noun examples and original matched form at${width}px`,async({page},info)=>{
    const literal=corrections.find(row=>row.term==='mortuary'),projection=literal.formProjections[0];
    await page.setViewportSize({width,height:844});const calls=observe(page);await page.goto('/dictionary.html');await submit(page,'MORTUARIES!');
    await card(page,{term:'mortuary',...projection},{sourceLabel:'卓式词典·义项补充'});
    await expect(page.locator('#dictionary-matched-form')).toHaveText('查询形式：MORTUARIES!');
    await examples(page,literal.exampleSenses.filter(sense=>projection.exampleSenseIds.includes(sense.id)));
    await screenshotAndNumbering(page,info,'mortuaries-'+width);readOnly(calls);
  });
  test(`side effects preserves complete licensed canonical source at${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});const calls=observe(page);await page.goto('/dictionary.html');await submit(page,'side effects');
    await card(page,side,{sourceLabel:side.source,license:side.license,url:side.url});
    await expect(page.locator('#dictionary-matched-form')).toHaveText('查询形式：side effects');readOnly(calls);
  });
  test(`wrong exam participles cannot become a direct word card at${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});const calls=observe(page);await page.goto('/dictionary.html');
    for(const query of['resited an exam','resiting an exam']){await submit(page,query,{empty:true});await expect(page.locator('#dictionary-result')).toBeHidden();await expect(page.locator('#dictionary-choices button')).toHaveCount(0);}
    readOnly(calls);
  });
}

async function publicSnapshot(context){const response=await context.request.get(ORIGIN+PUBLIC);expect(response.status()).toBe(200);return response.json();}
async function bridgePublic(context){await context.route('**'+PUBLIC+'*',async route=>{if(route.request().method()!=='GET')return route.continue();return route.fulfill({response:await context.request.get(ORIGIN+PUBLIC)});});}
test('ordinary local fixture member explicitly saves the apostrophe phrase privately, refreshes and deduplicates',async({context,page})=>{
  const row=source.entries.find(row=>row.term==="hand in one's notice");
  const registration=await context.request.post(ORIGIN+'/api/v1/member/register',{headers:{Origin:ORIGIN,'X-Wordbook-Auth':'member'},data:{username:'common_phrase_reader',password:'Synthetic common phrase testing2026'}});expect(registration.status()).toBe(200);
  const before=await publicSnapshot(context),calls=observe(page);await page.setViewportSize({width:390,height:844});await page.goto('/personal.html?auth=member');
  await expect(page.locator('#member-workspace')).toBeVisible();await page.locator('#member-dictionary-term').fill(row.term);await page.locator('#member-dictionary-term').press('Enter');
  await expect(page.locator('#member-dictionary-word')).toHaveText(row.term);await expect(page.locator('#member-dictionary-pos')).toHaveText(row.partOfSpeech);await expect(page.locator('#member-dictionary-meaning')).toHaveText(row.meaning);expect(writes(calls)).toEqual([]);
  await page.locator('#member-dictionary-save').click();await expect(page.getByRole('button',{name:'查看 '+row.term,exact:true})).toBeVisible();
  const entries=async()=>{const response=await context.request.get(ORIGIN+MEMBER,{headers:{'X-Wordbook-Auth':'member','X-Wordbook-Fields':'partOfSpeech'}});expect(response.status()).toBe(200);return(await response.json()).entries;};
  const first=await entries();expect(first).toHaveLength(1);expect(first[0]).toMatchObject({term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning});
  await page.reload();await expect(page.getByRole('button',{name:'查看 '+row.term,exact:true})).toBeVisible();
  await page.locator('#member-dictionary-term').fill(row.term);await page.locator('#member-dictionary-term').press('Enter');await expect(page.locator('#member-dictionary-word')).toHaveText(row.term);await page.locator('#member-dictionary-save').click();
  await expect(page.locator('#member-status')).toContainText('未覆盖已有释义或备注');expect(await entries()).toEqual(first);
  expect(writes(calls).map(call=>({path:call.path,method:call.method}))).toEqual([{path:MEMBER,method:'POST'}]);expect(await publicSnapshot(context)).toEqual(before);noProvider(calls);
});
test('an owner explicitly chooses bank transfer then publishes the real canonical source and preserves deduplication',async({context,page})=>{
  const row=source.entries.find(row=>row.term==='bank transfer');await context.addCookies([{name:'e2e_auth',value:'owner',url:ORIGIN}]);await bridgePublic(context);
  const calls=observe(page);await page.goto('/?auth=owner#library-lookup');await expect(page.locator('#lookup-auth')).toHaveText(/卓.*自动公开收录/u);
  await page.locator('#lookup-input').fill('银行转账');await page.locator('#lookup-input').press('Enter');await expect(page.locator('#lookup-result')).toBeVisible();expect(writes(calls)).toEqual([]);
  const choice=page.locator('#lookup-choices button[data-lookup-choice]').filter({hasText:/^bank transfer\s+·/u});
  if(await choice.count())await choice.click();else{await expect(page.locator('#lookup-term')).toHaveText(row.term);await page.locator('#lookup-collect').click();}
  await expect(page.locator('#lookup-receipts button')).toHaveCount(1);
  const first=(await publicSnapshot(context)).entries.filter(entry=>entry.term===row.term);expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning,exampleEn:row.en,exampleZh:row.zh,sourceTitle:row.dictionarySource});
  expect(first[0].sources).toEqual([{title:row.dictionarySource,url:'https://zhuodashuai.github.io/vocab/',kind:'dictionary',retrievedAt:expect.any(String)}]);
  expect(writes(calls).map(call=>({path:call.path,method:call.method,keys:Object.keys(call.body).sort(),term:call.body.term}))).toEqual([{path:COLLECT,method:'POST',keys:['mutationId','term'],term:row.term}]);
  await page.reload();await page.locator('#lookup-input').fill(row.term);await page.locator('#lookup-input').press('Enter');await expect(page.locator('#lookup-receipts button')).toHaveCount(1);
  expect((await publicSnapshot(context)).entries.filter(entry=>entry.term===row.term)).toEqual(first);expect(writes(calls).every(call=>call.path===COLLECT&&call.body.term===row.term)).toBe(true);noProvider(calls);
});
