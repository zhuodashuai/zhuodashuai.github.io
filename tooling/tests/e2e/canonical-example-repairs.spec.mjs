import {test,expect} from '@playwright/test';
import {CANONICAL_EXAMPLE_REPAIRS as table} from '../../../vocab/js/canonical-example-repairs-data.js';

test.use({serviceWorkers:'block'});
function observe(page){
  const forbidden=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())||new URL(r.url()).origin!=='http://127.0.0.1:4187')forbidden.push(r.url());});
  return {forbidden,errors};
}
async function lookup(page,term){
  await page.goto('/dictionary.html');
  await page.locator('#dictionary-query').fill(term);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-term')).toHaveText(term);
}
for(const [index,row] of table.rows.entries())test(`canonical card retains its exact meaning and receives approved bilingual examples: ${row.term}`,async({page})=>{
  const log=observe(page);await page.setViewportSize({width:index%2?390:1280,height:844});
  await lookup(page,row.term);
  const card=row.acceptedDisplayContexts.at(-1),pairs=[{en:row.replacementPair.en,zh:row.replacementPair.zh},...(row.additionalExamples||[])];
  await expect(page.locator('#dictionary-pos')).toHaveText(card.partOfSpeech);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(card.meaning.split('\n'));
  const details=page.locator('#dictionary-example-content details');await expect(details).toHaveCount(1);
  await expect(details.locator('summary')).toHaveText(`1. ${row.replacementPair.partOfSpeech} · ${row.replacementPair.meaningZh}`);
  if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
  await expect(details.locator('p[lang=en]')).toHaveText(pairs.map(pair=>pair.en));
  await expect(details.locator('p[lang=zh-CN]')).toHaveText(pairs.map(pair=>pair.zh));
  await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
  await expect(page.locator('#dictionary-source')).toContainText(row.canonicalSourceDescriptor.name);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  for(const selector of ['#dictionary-meaning','#dictionary-example-content'])expect(await page.locator(selector).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(log.errors).toEqual([]);expect(log.forbidden).toEqual([]);
});

test('actual saved-card UI preserves stored and book examples and hides a different-sense optional pair',async({page})=>{
  const log=observe(page);await page.goto('/dictionary.html');
  const result=await page.evaluate(async()=>{
    const {createDictionaryExamplesSection}=await import('/js/dictionary-examples-ui-v108.js');
    const anchor=document.createElement('div');document.body.append(anchor);
    const stored=document.createElement('p');stored.textContent='My saved telescope example.';
    const book=document.createElement('p');book.textContent='My existing book passage.';
    document.body.append(stored,book);
    const section=createDictionaryExamplesSection({root:document,after:anchor});
    const entry={term:'hubble',partOfSpeech:'proper noun',meaning:{zh:'哈勃太空望远镜的常用简称Hubble'},
      examples:[{en:stored.textContent,zh:'我的旧例句。'}],bookPassage:book.textContent,study:{box:4}};
    const before=JSON.stringify(entry);await section.show(entry);
    const wrongHidden=section.section.hidden,unchanged=before===JSON.stringify(entry);
    await section.show({term:'hubble',partOfSpeech:'noun',meaning:{zh:'① n. 小凸起, 小瘤'}});
    const correct=section.section.querySelector('p[lang=en]')?.textContent;
    return {wrongHidden,unchanged,stored:stored.textContent,book:book.textContent,correct};
  });
  expect(result).toEqual({wrongHidden:true,unchanged:true,stored:'My saved telescope example.',book:'My existing book passage.',
    correct:table.rows.find(row=>row.term==='hubble').replacementPair.en});
  expect(log.errors).toEqual([]);expect(log.forbidden).toEqual([]);
});

test('unavailable new optional module keeps the primary meaning usable without restoring the old wrong example',async({page})=>{
  const log=observe(page);
  await page.route('**/js/dictionary-canonical-example-repairs.js',route=>route.abort('failed'));
  await lookup(page,'hubble');
  await expect(page.locator('#dictionary-meaning')).toContainText('小凸起');
  await expect(page.locator('#dictionary-example-content')).toBeEmpty();
  await expect(page.locator('#dictionary-example-panel')).toBeHidden();
  expect(log.errors).toEqual([]);expect(log.forbidden).toEqual([]);
});

test('ordinary cards do not fetch the new optional graph during a partial offline update',async({page})=>{
  const log=observe(page),requested=[];
  page.on('request',r=>{if(/canonical-example-repair/u.test(r.url()))requested.push(r.url());});
  await page.route('**/js/*canonical-example-repair*.js',route=>route.abort('failed'));
  await lookup(page,'agitated');
  await expect(page.locator('#dictionary-example-content p[lang=en]').first()).not.toBeEmpty();
  expect(requested).toEqual([]);expect(log.errors).toEqual([]);expect(log.forbidden).toEqual([]);
});

test('tampered pinned source bytes cannot authorize a replacement example or change the primary card',async({page})=>{
  const log=observe(page);await lookup(page,'hubble');
  await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText([table.rows.find(row=>row.term==='hubble').replacementPair.en]);
  const before=await page.locator('#dictionary-meaning').innerText();
  const result=await page.evaluate(async()=>{
    const {loadDictionaryExamples,resetDictionaryExamplesCacheForTests}=await import('/js/dictionary-examples-current-v4.js');
    const fetchImpl=async(url,options)=>String(url).endsWith('/expanded-dictionary/manifest.json')
      ?new Response('{"schemaVersion":2,"version":"tampered"}'):fetch(url,options);
    const entry=await loadDictionaryExamples('hubble',{fetchImpl,savedEntry:{term:'hubble',partOfSpeech:'noun',meaning:'n. 小凸起, 小瘤'}});
    resetDictionaryExamplesCacheForTests();return entry;
  });
  expect(result).toBeNull();await expect(page.locator('#dictionary-meaning')).toHaveText(before);
  expect(log.errors).toEqual([]);expect(log.forbidden).toEqual([]);
});
