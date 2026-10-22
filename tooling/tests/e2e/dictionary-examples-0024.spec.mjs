import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

const candidate=JSON.parse(await readFile(new URL('../../dictionary/source-revisions/semantic-common-five-0001.candidate.json',import.meta.url),'utf8'));
const exactPairs=[
 ['affordable','adjective','负担得起的；价格在经济承受范围内的','The rent was affordable, but the flat was far from my workplace.','房租我负担得起，但那套公寓离我的工作地点很远。'],
 ['discretionary','adjective','可自行酌情决定的','The manager has discretionary authority to waive the fee in exceptional cases.','经理有权在特殊情况下酌情免收这项费用。'],
 ['download','verb','下载〔把文件或程序从远端计算机传到本地〕','Download the route map before you leave the hotel.','离开酒店前下载好路线图。'],
 ['competitiveness','noun','好胜心；争强好胜的倾向','Her competitiveness turned a friendly quiz into a serious contest.','她的好胜心让一场友好的问答活动变成了认真的较量。'],
 ['revitalization','noun','复兴；重振〔重新恢复活跃和重要地位〕','New workshops and late-opening cafés contributed to the revitalization of the old harbour.','新开设的工坊和营业至深夜的咖啡馆促进了老港区的复兴。']
];
assert.deepEqual(candidate.entries.map(row=>row.pair),exactPairs);
const sourceName='卓式词典·释义校订';
const sourceUrl='https://zhuodashuai.github.io/vocab/dictionary-semantic-revisions.html';
const licence='项目原创中文释义；Princeton WordNet 3.1 为参考证据，适用其独立许可；原 ECDICT 数据保留 MIT 许可。';
test.use({serviceWorkers:'block'});

for(const[index,query]of [...exactPairs.map(p=>p[0]),'downloaded','downloading','downloads'].entries()){
 test(`D24 actual static ${query} retains exact corrected sense, original pair and navigation`,async({page})=>{
  const pair=exactPairs.find(p=>p[0]===query)||exactPairs[2],width=index%2?1440:390;
  const writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');
  await page.locator('#dictionary-query').fill(query);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-term')).toHaveText(pair[0]);
  await expect(page.locator('#dictionary-pos')).toHaveText(pair[1]);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(['① '+pair[2]]);
  await expect(page.locator('#dictionary-source a')).toHaveText(sourceName);
  await expect(page.locator('#dictionary-source a')).toHaveAttribute('href',sourceUrl);
  await expect(page.locator('#dictionary-source')).toContainText(licence);
  await expect(page.locator('#dictionary-variant-panel')).toBeHidden();
  await expect(page.locator('#dictionary-variants .variant')).toHaveCount(0);
  if(query!==pair[0]){
   await expect(page.locator('#dictionary-matched-form')).toHaveText('查询形式：'+query);
  }else await expect(page.locator('#dictionary-matched-form')).toBeHidden();
  await expect(page.locator('#dictionary-add')).toHaveAttribute('href',new RegExp('#lookup='+encodeURIComponent(pair[0])+'$','u'));
  const examples=page.locator('#dictionary-example-content'),details=examples.locator('details');
  await expect(examples.locator('summary')).toHaveText(`1. ${pair[1]} · ${pair[2]}`);
  await expect(details).toHaveCount(1);
  if(!await details.evaluate(el=>el.open))await details.locator('summary').click();
  await expect(examples.locator('p[lang="en"]')).toBeVisible();await expect(examples.locator('p[lang="en"]')).toHaveText(pair[3]);
  await expect(examples.locator('p[lang="zh-CN"]')).toBeVisible();await expect(examples.locator('p[lang="zh-CN"]')).toHaveText(pair[4]);
  await expect(page.locator('header .app-primary-nav a')).toHaveText(['公开词本','查词','随手记','我的词本']);
  await expect(page.locator('header a[href="guide.html"]')).toHaveCount(0);
  await expect(page.locator('footer a[href="guide.html"]')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await examples.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(writes).toEqual([]);expect(errors).toEqual([]);
 });
}

test('D24 source notice is reachable, scoped and links the retained independent WordNet licence',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/dictionary-semantic-revisions.html');
 await expect(page.getByRole('heading',{name:'释义校订说明',exact:true})).toBeVisible();
 await expect(page.locator('body')).toContainText('不表示 Princeton University 认可本站');
 await expect(page.locator('body')).toContainText('原条件意见保留其形成时的候选状态');
 await expect(page.locator('a[href="data/WORDNET-3.1-LICENSE.txt"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('a[href="data/WORDNET-3.1-LICENSE.txt"]').click();
 await expect(page.locator('body')).toContainText('Princeton University');
});
