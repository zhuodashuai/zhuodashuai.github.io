// Actual generated D32 data / local in-memory accounts only. Not publication
// evidence or a claim that the whole dictionary is available offline.
import {test, expect} from '@playwright/test';
import {createHash, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {dictionaryExamplesRelease as release} from '../../../vocab/js/dictionary-examples-release-v4.js';
import {parseAdditiveCatalogue, parseAdditiveDelta} from '../../../vocab/js/dictionary-examples-additive-codec.js';
import {dictionaryExampleBucket, DICTIONARY_EXAMPLE_SOURCE} from '../../../vocab/js/dictionary-examples.js';
import {personalDictionaryResult} from '../../../vocab/js/personal-dictionary.js';

const ORIGIN='http://127.0.0.1:4187', API=`${ORIGIN}/api/v1/member`;
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const dataBase=new URL('../../../vocab/data/dictionary-examples/',import.meta.url);
const sourceBase=new URL('../../../vocab/data/expanded-dictionary/',import.meta.url);
const json=async url=>JSON.parse(await readFile(url,'utf8'));
// Historical D32 data stays fixed. The active runtime catalogue may append
// later releases, but must retain every exact D32 descriptor, key and pair.
const D32={
  catalogue:{file:'catalogue-v4/d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f.bin',codec:'gzip',bytes:1660,sha256:'d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f',decodedBytes:4056,decodedSha256:'ace34696bc4c219181753da0b107bea2be86d93402c3efda107f6ff00f10664a'},
  base:{file:'manifest-v2.json',bytes:57577,sha256:'23846f67b86c43bcd3b5b2e8b36fcf93ef19c63f2ac28ce982e989b3a13557e9',version:'afff0148b5c2cf401feb1ef646bb61a3fc2bcefd984050b8a0609f711f47c3c4',counts:{heads:86415,examples:87804}},
  source:{version:'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644',manifestSha256:'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f'}
};
const sourceManifestRaw=await readFile(new URL('manifest.json',sourceBase));
expect(hash(sourceManifestRaw)).toBe(D32.source.manifestSha256);
const sourceManifest=JSON.parse(sourceManifestRaw);
expect(sourceManifest.version).toBe(D32.source.version);
const baseManifestRaw=await readFile(new URL(D32.base.file,dataBase));
expect(baseManifestRaw.length).toBe(D32.base.bytes);expect(hash(baseManifestRaw)).toBe(D32.base.sha256);
const baseManifest=JSON.parse(baseManifestRaw);
async function actualCatalogue(descriptor){
  const raw=await readFile(new URL(descriptor.file,dataBase));
  expect(raw.length).toBe(descriptor.bytes);expect(hash(raw)).toBe(descriptor.sha256);
  const decoded=gunzipSync(raw);
  expect(decoded.length).toBe(descriptor.decodedBytes);expect(hash(decoded)).toBe(descriptor.decodedSha256);
  return parseAdditiveCatalogue(JSON.parse(decoded));
}
const d32Catalogue=await actualCatalogue(D32.catalogue);
expect(d32Catalogue.counts).toEqual({heads:86700,examples:88089});
expect(d32Catalogue.keys).toHaveLength(285);
function expectD32Preserved(current){
  expect(current.base).toEqual(D32.base);expect(current.source).toEqual(D32.source);
  expect(current.counts.heads).toBeGreaterThanOrEqual(d32Catalogue.counts.heads);
  expect(current.counts.examples).toBeGreaterThanOrEqual(d32Catalogue.counts.examples);
  expect(current.keys.length).toBeGreaterThanOrEqual(d32Catalogue.keys.length);
  expect(current.deltas.slice(0,d32Catalogue.deltas.length)).toEqual(d32Catalogue.deltas);
  const currentKeys=new Map(current.keys);
  for(const [term,index]of d32Catalogue.keys)expect(currentKeys.get(term)).toBe(index);
}
expect(release.base).toEqual(D32.base);expect(release.source).toEqual(D32.source);
const catalogue=await actualCatalogue(release.catalogue);
expectD32Preserved(catalogue);
// Only historical D32 deltas are read for these fixtures, not future batches.
const decodedDeltas=await Promise.all(d32Catalogue.deltas.map(async(descriptor,index)=>{
  const raw=await readFile(new URL(descriptor.file,dataBase));
  expect(raw.length).toBe(descriptor.bytes);expect(hash(raw)).toBe(descriptor.sha256);
  const decoded=gunzipSync(raw);
  expect(decoded.length).toBe(descriptor.decodedBytes);expect(hash(decoded)).toBe(descriptor.decodedSha256);
  const payload=JSON.parse(decoded),frozen=parseAdditiveDelta(payload,d32Catalogue,index),current=parseAdditiveDelta(payload,catalogue,index);
  for(const [term,delta]of d32Catalogue.keys)if(delta===index)expect(current.get(term)).toEqual(frozen.get(term));
  return frozen;
}));
const d32SourceFiles=['batch-0032-p001.json','batch-0032-p002.json','batch-0032-p002-child.json','batch-0032-ive-child.json','batch-0032-root.json','batch-0032-source9-01.json','batch-0032-yuk-child.json','batch-0032-source9-02.json','batch-0032-source9-03.json','batch-0032-role-01.json','batch-0032-role-02.json','batch-0032-role-03.json','batch-0032-role-04.json','batch-0032-role-05.json','batch-0032-source9-04.json'];
const standard=new Map();
for(const file of d32SourceFiles){
  for(const row of (await json(new URL(`../../dictionary/examples/source/${file}`,import.meta.url))).entries){
    expect(standard.has(row.term)).toBe(false);standard.set(row.term,row);
  }
}
expect(standard.size).toBe(285);
for(const [term,index]of d32Catalogue.keys){
  const row=decodedDeltas[index].get(term),expected=standard.get(term);
  expect(expected).toBeTruthy();expect(row.example.senses).toHaveLength(1);
  const sense=row.example.senses[0];expect(sense.examples).toHaveLength(1);
  expect([row.term,sense.partOfSpeech,sense.meaningZh,sense.examples[0].en,sense.examples[0].zh]).toEqual([expected.term,expected.partOfSpeech,expected.meaningZh,expected.en,expected.zh]);
}
const terms=['geo','ch.',"I've",'wei'];
const fixtures=new Map();
for(const term of terms){
  const deltaIndex=d32Catalogue.keys.find(([key])=>key===term)?.[1];
  expect(deltaIndex).toBeDefined();
  const row=decodedDeltas[deltaIndex].get(term),expected=standard.get(term);
  expect(row).toBeTruthy();expect(expected).toBeTruthy();
  const sense=row.example.senses[0];
  expect(row.example.senses).toHaveLength(1);expect(sense.examples).toHaveLength(1);
  expect([row.term,sense.partOfSpeech,sense.meaningZh,sense.examples[0].en,sense.examples[0].zh]).toEqual([expected.term,expected.partOfSpeech,expected.meaningZh,expected.en,expected.zh]);
  const sourceFile=sourceManifest.english.shards[row.canonicalId%128].file;
  const source=(await json(new URL(sourceFile,sourceBase))).records.find(source=>source.id===row.canonicalId);
  expect(hash(JSON.stringify(source))).toBe(row.canonicalSourceSha256);
  expect(source.term).toBe(term);expect(source.partOfSpeech).toBe(expected.partOfSpeech);
  const display=personalDictionaryResult({word:source.term,partOfSpeech:source.partOfSpeech,meaning:source.meaning});
  fixtures.set(term,{term,row,expected,source,display,delta:d32Catalogue.deltas[deltaIndex]});
}
const owner=await json(new URL('../../../vocab/data/owner-wordbook.json',import.meta.url));
const agitated=owner.entries.find(row=>row.term==='agitated');
const bookPassages=await json(new URL('../../../vocab/data/book-passages.json',import.meta.url));
const agitatedPassages=bookPassages.passages.filter(p=>p.bookId==='never-let-me-go'&&p.chapterId==='chapter-1'&&p.links.some(link=>link.entryId===agitated.id&&link.membership==='collection:never-let-me-go:chapter-1'));
const oldFile=baseManifest.shards[dictionaryExampleBucket('agitated')].file;
const oldAgitated=(await json(new URL(oldFile,dataBase))).entries.find(row=>row.term==='agitated');
expect(agitated).toBeTruthy();expect(oldAgitated).toBeTruthy();

function observe(page){
  const pageErrors=[],consoleErrors=[],requests=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  page.on('request',request=>requests.push({method:request.method(),url:request.url()}));
  return {pageErrors,consoleErrors,requests};
}
function expectLocalReads(observed){
  expect(observed.pageErrors).toEqual([]);expect(observed.consoleErrors).toEqual([]);
  expect(observed.requests.filter(r=>new URL(r.url).origin!==ORIGIN)).toEqual([]);
  expect(observed.requests.filter(r=>!['GET','HEAD'].includes(r.method))).toEqual([]);
}
async function isolated(context,info,extra=[]){
  // Unique per actual run: repeated targeted runs cannot share fixture accounts.
  await context.addCookies([{name:'e2e_run',value:`d32-${randomUUID()}`,url:ORIGIN},...extra]);
}
async function primary(page,fixture){
  await expect(page.locator('#dictionary-term')).toHaveText(fixture.term);
  await expect(page.locator('#dictionary-pos')).toHaveText(fixture.display.partOfSpeech);
  await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(fixture.display.meaning.split('\n'));
  await expect(page.locator('#dictionary-submit')).toBeEnabled();
}
async function dictionaryPair(page,fixture){
  const item=page.locator('#dictionary-example-content details');
  await expect(item).toHaveCount(1);
  await expect(item.locator('summary')).toHaveText(`1. ${fixture.expected.partOfSpeech} · ${fixture.expected.meaningZh}`);
  if(!await item.evaluate(node=>node.open))await item.locator('summary').click();
  await expect(item.locator('p[lang=en]')).toHaveText(fixture.expected.en);
  await expect(item.locator('p[lang=zh-CN]')).toHaveText(fixture.expected.zh);
  await expect(item.locator('p[lang=en]')).toBeVisible();
  await expect(item.locator('p[lang=zh-CN]')).toBeVisible();
}
async function sidecar(page,term,entry){
  const section=page.locator('.dictionary-learning-examples');
  await expect(section).toHaveAttribute('data-term',term);
  await expect(section.locator('.dictionary-learning-source')).toHaveText(DICTIONARY_EXAMPLE_SOURCE);
  await expect(section.locator('.dictionary-learning-note')).toContainText('不是书中原句');
  await expect(section.locator('.dictionary-learning-sense')).toHaveCount(entry.senses.length);
  for(const [i,sense]of entry.senses.entries()){
    const item=section.locator('.dictionary-learning-sense').nth(i);
    await expect(item.locator('h4')).toHaveText(`${sense.partOfSpeech} · ${sense.meaningZh}`);
    await expect(item.locator('[lang=en]')).toHaveText(sense.examples.map(x=>x.en));
    await expect(item.locator('[lang=zh-CN]')).toHaveText(sense.examples.map(x=>x.zh));
  }
}
function expectOnlySelectedNewData(observed,fixture){
  const paths=observed.requests.map(r=>new URL(r.url).pathname).filter(p=>/\/(?:catalogue-v4|delta-v4)\//u.test(p));
  expect(new Set(paths)).toEqual(new Set([`/data/dictionary-examples/${release.catalogue.file}`,`/data/dictionary-examples/${fixture.delta.file}`]));
  const oldBuckets=observed.requests.map(r=>new URL(r.url).pathname).filter(p=>/\/examples-\d+\.json$/u.test(p));
  expect(new Set(oldBuckets)).toEqual(new Set([`/data/dictionary-examples/${baseManifest.shards[dictionaryExampleBucket(fixture.term)].file}`]));
}

test.describe('D32 actual visible examples and local fixture accounts',()=>{
  test.use({serviceWorkers:'block'});
  test.beforeEach(async({context},info)=>isolated(context,info));
  for(const term of terms)test(`D32 exact primary source and visible new five cells: ${term}`,async({page})=>{
    const observed=observe(page),fixture=fixtures.get(term);
    await page.goto(`/dictionary.html#q=${encodeURIComponent(term)}`);
    await primary(page,fixture);await dictionaryPair(page,fixture);
    expectOnlySelectedNewData(observed,fixture);expectLocalReads(observed);
  });

  test('D32 member saves a new word and reads its separate real example without changing personal meaning or note',async({context,page})=>{
    const fixture=fixtures.get('geo'),observed=observe(page);
    const registered=await context.request.post(`${API}/register`,{headers:{Origin:ORIGIN,'X-Wordbook-Auth':'member'},data:{username:'d32_example_reader',password:'Synthetic D32 local password 82'}});
    expect(registered.status()).toBe(200);
    await page.goto('/personal.html?auth=member');
    await expect(page.locator('#member-workspace')).toBeVisible();
    await expect(page.locator('#member-entry-list')).toHaveAttribute('aria-busy','false');
    await page.locator('#member-dictionary-term').fill('geo');await page.locator('#member-dictionary-term').press('Enter');
    await expect(page.locator('#member-dictionary-word')).toHaveText('geo');
    await expect(page.locator('#member-dictionary-pos')).toHaveText(fixture.display.partOfSpeech);
    await expect(page.locator('#member-dictionary-meaning')).toHaveText(fixture.display.meaning);
    await page.locator('#member-dictionary-use').click();
    await page.locator('#member-note').fill('My own coastal observation; keep this note.');
    await page.locator('#member-save').click();await expect(page.locator('.personal-entry')).toHaveCount(1);
    const entries=async()=>{const r=await context.request.get(`${API}/entries`,{headers:{'X-Wordbook-Auth':'member','X-Wordbook-Fields':'partOfSpeech'}});expect(r.status()).toBe(200);return r.json();};
    const before=await entries();expect(before.entries).toHaveLength(1);expect(before.entries[0].term).toBe('geo');
    await page.getByRole('button',{name:'查看 geo',exact:true}).click();
    await sidecar(page,'geo',fixture.row.example);
    await expect(page.locator('#member-detail-meaning')).toHaveText(before.entries[0].meaning);
    await expect(page.locator('#member-detail-note')).toHaveText('My own coastal observation; keep this note.');
    expect(await entries()).toEqual(before);
    expect(observed.pageErrors).toEqual([]);expect(observed.consoleErrors).toEqual([]);
    expect(observed.requests.filter(r=>new URL(r.url).origin!==ORIGIN)).toEqual([]);
    expect(observed.requests.filter(r=>!['GET','HEAD'].includes(r.method)).map(r=>new URL(r.url).pathname)).toEqual(['/api/v1/member/entries']);
  });

  test('D32 public old card keeps original example, exact book passage and legacy learning example',async({page})=>{
    const observed=observe(page);
    await page.goto('/?book=never-let-me-go&chapter=chapter-1');
    await expect(page.locator('#entry-count')).toHaveText('29');
    await page.getByRole('button',{name:'查看 agitated 的完整词条',exact:true}).click();
    await expect(page.locator('#dialog-term')).toHaveText('agitated');
    await expect(page.locator('#dialog-example-en')).toHaveText(agitated.exampleEn);
    await expect(page.locator('#dialog-example-zh')).toHaveText(agitated.exampleZh);
    await expect(page.locator('#dialog-example-section h3')).toHaveText('原有学习例句');
    expect(agitatedPassages.length).toBeGreaterThan(0);
    await expect(page.locator('#dialog-source-examples .book-passage-text')).toHaveText(agitatedPassages.map(p=>p.text));
    await sidecar(page,'agitated',oldAgitated);
    expect(observed.requests.filter(r=>/\/(?:catalogue-v4|delta-v4)\//u.test(r.url))).toEqual([]);
    expectLocalReads(observed);
  });

  test('D32 gated then unavailable optional delta never blocks the full primary meaning or next search',async({page})=>{
    const fixture=fixtures.get('geo'),observed=observe(page);
    let reached,releaseGate;
    const seen=new Promise(resolve=>{reached=resolve;}),gate=new Promise(resolve=>{releaseGate=resolve;});
    // Only fault the real selected immutable resource. Never fabricate data,
    // fulfil a replacement example or change the primary dictionary transport.
    await page.route(`**/data/dictionary-examples/${fixture.delta.file}`,async route=>{reached();await gate;await route.abort('failed').catch(()=>{});});
    try{
      await page.goto('/dictionary.html#q=geo');await seen;
      await primary(page,fixture);
      await expect(page.locator('#dictionary-example-panel')).toHaveAttribute('aria-busy','true');
      await expect(page.locator('#dictionary-example-status')).toContainText('正在读取');
      releaseGate();
      await expect(page.locator('#dictionary-example-retry')).toBeVisible();
      await primary(page,fixture);
      await page.locator('#dictionary-query').fill('agitated');await page.locator('#dictionary-query').press('Enter');
      await expect(page.locator('#dictionary-term')).toHaveText('agitated');
      await expect(page.locator('#dictionary-meaning')).not.toBeEmpty();
      await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText(oldAgitated.senses.flatMap(s=>s.examples.map(x=>x.en)));
      expect(observed.pageErrors).toEqual([]);
      // The single deliberately aborted network resource can produce a browser
      // resource diagnostic; no application-console error is excused.
      expect(observed.consoleErrors.filter(text=>!/^Failed to load resource:.*(?:ERR_FAILED|Load failed)/u.test(text))).toEqual([]);
      expect(observed.requests.filter(r=>new URL(r.url).origin!==ORIGIN||!['GET','HEAD'].includes(r.method))).toEqual([]);
    }finally{releaseGate();}
  });
});

test.describe('D32 one naturally warmed new term survives its first native offline reload',()=>{
  test.use({serviceWorkers:'allow'});
  test('D32 first dictionary install: source, base absence, catalogue and selected delta remain readable offline on mobile',async({context,page},info)=>{
    test.setTimeout(90_000);
    const fixture=fixtures.get('geo'),observed=observe(page);
    await isolated(context,info,[{name:'e2e_dictionary_first_install',value:'1',url:ORIGIN}]);
    await page.setViewportSize({width:390,height:844});
    expect(context.serviceWorkers()).toHaveLength(0);
    // No route interception here: it disables native HTTP cache semantics.
    // No fetch wrapper, explicit warm request, cache.put or second lookup.
    await page.goto('/dictionary.html#q=geo');await primary(page,fixture);await dictionaryPair(page,fixture);
    expect(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(false);
    await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:45_000}).toBe(true);
    const sourceFiles=[sourceManifest.english.shards[dictionaryExampleBucket('geo')%128].file,sourceManifest.english.shards[fixture.row.canonicalId%128].file];
    const warmPaths=[...new Set(['/data/expanded-dictionary/manifest.json',...sourceFiles.map(f=>`/data/expanded-dictionary/${f}`),'/data/dictionary-examples/manifest-v2.json',`/data/dictionary-examples/${baseManifest.shards[dictionaryExampleBucket('geo')].file}`,`/data/dictionary-examples/${release.catalogue.file}`,`/data/dictionary-examples/${fixture.delta.file}`])];
    const expected=await Promise.all(warmPaths.map(async route=>{const b=await readFile(new URL(`../../../vocab/${route.slice(1)}`,import.meta.url));return {path:route,bytes:b.length,sha256:hash(b)};}));
    await expect.poll(()=>page.evaluate(async paths=>{
      if(!(await caches.keys()).includes('zhuo-wordbook-v100'))return [];
      const cache=await caches.open('zhuo-wordbook-v100');
      return Promise.all(paths.map(async path=>{const response=await cache.match(path);if(!response)return null;const body=await response.arrayBuffer();return {path,bytes:body.byteLength,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(x=>x.toString(16).padStart(2,'0')).join('')};}));
    },warmPaths),{timeout:30_000}).toEqual(expected);
    expectOnlySelectedNewData(observed,fixture);
    const offlineResponse=page.waitForResponse(response=>response.request().isNavigationRequest());
    await context.setOffline(true);expect(await page.evaluate(()=>navigator.onLine)).toBe(false);
    await page.reload();const response=await offlineResponse;
    expect(response.status()).toBe(200);expect(response.fromServiceWorker()).toBe(true);
    await primary(page,fixture);await dictionaryPair(page,fixture);
    expect(await page.evaluate(()=>navigator.onLine)).toBe(false);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const screenshot=info.outputPath('d32-geo-first-native-offline-mobile.png');
    await page.screenshot({path:screenshot,fullPage:true});await info.attach('D32 geo first native offline mobile',{path:screenshot,contentType:'image/png'});
    await info.attach('Exact naturally warmed selected-body tuples',{body:JSON.stringify(expected,null,2),contentType:'application/json'});
    expect(observed.pageErrors).toEqual([]);
    expect(observed.consoleErrors.filter(text=>!/^Failed to load resource:.*(?:ERR_INTERNET_DISCONNECTED|Load failed)/u.test(text))).toEqual([]);
    expect(observed.requests.filter(r=>new URL(r.url).origin!==ORIGIN||!['GET','HEAD'].includes(r.method))).toEqual([]);
    // Playwright closes this fresh context still offline. No warm second reload
    // or online unguarded continuation is used to convert a failure into a pass.
  });
});
