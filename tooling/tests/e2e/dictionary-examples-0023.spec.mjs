import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const pack=JSON.parse(await readFile(new URL('../../dictionary/source-revisions/finite-pos-notation-0001.json',import.meta.url),'utf8'));
// Read actual approved source data, but pin the complete selected pairs too:
// changing both a source file and a rendered result must not bless a new error.
const exactPairs=new Map([
  ['headdress',['headdress','noun','头饰；头部服饰',
    'The dancer adjusted her headdress before stepping onto the stage.','舞者上台前调整了一下头饰。']],
  ['longingly',['longingly','adverb','渴望地；满怀向往地',
    'He gazed longingly at the sea from his office window.','他从办公室的窗户满怀向往地望着大海。']],
  ['moonless',['moonless','adjective','没有月亮或看不见月亮的',
    'We followed the torchlight along the path on a moonless night.','在一个看不见月亮的夜晚，我们循着手电筒的光沿小路前行。']]
]);
const meaningLines=new Map([
  ['headdress','① n. 饰头巾, 头式'],
  ['longingly','① adv. 渴望地, 切望地'],
  ['moonless','① adj. 无月亮的']
]);
assert.deepEqual(pack.entries.map(entry=>entry.term),[...exactPairs.keys()]);
assert.equal(pack.sourceDescriptorProposal.id,'pos-notation-reviewed');
assert.equal(pack.sourceDescriptorProposal.name,'原有释义＋词性标记校订');
assert.equal(pack.sourceDescriptorProposal.url,'https://zhuodashuai.github.io/vocab/dictionary-pos-notation-revisions.html');
const rows=new Map(pack.entries.map(entry=>{
  const pair=entry.unchangedConditionalRootPair.pair;
  assert.deepEqual(pair,exactPairs.get(entry.term));
  assert.equal(entry.after.partOfSpeech,pair[1]);
  assert.equal(entry.after.source,'pos-notation-reviewed');
  return [entry.term,{term:pair[0],partOfSpeech:pair[1],meaningZh:pair[2],en:pair[3],zh:pair[4]}];
}));

// Normal HTTP from the real local filesystem, not synthetic dictionary routes.
// First-install/offline behavior is tested independently in the existing suite.
test.use({serviceWorkers:'block'});

async function assertMobileShell(page,width){
  const nav=page.getByRole('navigation',{name:'主要导航',exact:true});
  await expect(nav.locator('a')).toHaveText(['公开词本','查词','随手记','我的词本']);
  await expect(nav.getByRole('link',{name:'查词',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.locator('header a[href="guide.html"]')).toHaveCount(0);
  const geometry=await nav.locator('a').evaluateAll(links=>({
    documentWidth:document.documentElement.scrollWidth,
    boxes:links.map(link=>{const rect=link.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,height:rect.height};})
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(width);
  for(const box of geometry.boxes){
    expect(box.left).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(new Set(geometry.boxes.map(box=>Math.round(box.top))).size).toBe(1);
  const manual=page.locator('footer').getByRole('link',{name:'使用手册',exact:true});
  await expect(manual).toHaveAttribute('href','guide.html');await expect(manual).toBeVisible();
}

for(const {term,width,query}of [
  {term:'headdress',width:360,query:'headdress'},
  {term:'longingly',width:390,query:'longingly'},
  {term:'moonless',width:360,query:'moonless'},
  {term:'headdress',width:390,query:'headdresses'}
])test(`D23 ${query} at${width}px shows corrected POS, numbered meaning and the exact whole pair`,async({page})=>{
  const row=rows.get(term),writes=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))writes.push({url:request.url(),method:request.method()});});
  await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');
  await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-term')).toHaveText(term);
  await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText([meaningLines.get(term)]);
  const source=page.locator('#dictionary-source');
  await expect(source.locator('a')).toHaveText('原有释义＋词性标记校订');
  await expect(source.locator('a')).toHaveAttribute('href',pack.sourceDescriptorProposal.url);
  await expect(source).toContainText(pack.sourceDescriptorProposal.license);
  await expect(page.locator('#dictionary-variant-panel')).toBeHidden();
  await expect(page.locator('#dictionary-variants .variant')).toHaveCount(0);
  if(query!==term){
    await expect(page.locator('#dictionary-matched-form')).toHaveText('查询形式：headdresses');
    await expect(page.locator('#dictionary-add')).toHaveAttribute('href',/#lookup=headdress$/u);
  }else await expect(page.locator('#dictionary-matched-form')).toBeHidden();
  const content=page.locator('#dictionary-example-content');
  await expect(content.locator('summary')).toHaveText(`1. ${row.partOfSpeech} · ${row.meaningZh}`);
  const details=content.locator('details');
  await expect(details).toHaveCount(1);
  if(!await details.evaluate(element=>element.open))await details.locator('summary').click();
  await expect(content.locator('p[lang="en"]')).toBeVisible();
  await expect(content.locator('p[lang="en"]')).toHaveText(row.en);
  await expect(content.locator('p[lang="zh-CN"]')).toBeVisible();
  await expect(content.locator('p[lang="zh-CN"]')).toHaveText(row.zh);
  expect(await page.locator('#dictionary-result').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  expect(await content.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await assertMobileShell(page,width);
  expect(writes).toEqual([]);expect(errors).toEqual([]);
});
