import {restoreMemberSpellingShellIfCurrent,restoreMemberSpellingServiceWorkerShell} from '../../tooling/tests/helpers/member-spelling-shell.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LIFE_COVERAGE_URLS,restoreLifeCoverageShell,restoreLifeCoverageServiceWorkerShell} from '../../tooling/tests/helpers/life-coverage-shell.mjs';
import {restoreSearchCommonTermsShell} from '../../tooling/tests/helpers/search-common-terms-shell.mjs';
import {restoreEntryDetailFocusShellIfCurrent,restoreEntryDetailFocusServiceWorkerShellIfCurrent} from '../../tooling/tests/helpers/entry-detail-focus-shell.mjs';
const read=async file=>{const text=await readFile(new URL('../'+file,import.meta.url),'utf8');return file==='sw.js'?restoreEntryDetailFocusServiceWorkerShellIfCurrent(restoreMemberSpellingServiceWorkerShell(text)):restoreEntryDetailFocusShellIfCurrent(file,restoreMemberSpellingShellIfCurrent(file,text));};
const sha=text=>createHash('sha256').update(text).digest('hex');

test('life coverage prepends only32 explicit URLs and retains every354 prior offline URL in order',async()=>{
 const sw=await read('sw.js'),body=sw.match(/const SHELL = \[([\s\S]*?)\];/u)?.[1];assert(body);
 const urls=JSON.parse('['+body.replace(/\/\/[^\r\n]*/gu,'').trim().replace(/,$/u,'')+']');
 assert.equal(urls.length,386);assert.equal(new Set(urls).size,386);assert.equal(urls.filter(url=>url==='./').length,1);
 assert.equal(LIFE_COVERAGE_URLS.length,32);assert.deepEqual(urls.slice(0,32),LIFE_COVERAGE_URLS);
 assert.equal(sha(JSON.stringify(urls.slice(32))),'a50a865720fc662e7b4f479a7de342625f079d2fa87f806b4e27b7d604d0a579');
 assert(urls.includes('./js/english-laundry-phrase-evidence.js?v=118'));
 assert(!urls.includes('./js/english-laundry-phrase-evidence.js'),'No unneeded bare alias for a never-published new helper');
 assert(!urls.some(url=>url.includes('/data/chinese-query-cache/')||url.includes('/api/')));
 assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));
 const restored=restoreLifeCoverageServiceWorkerShell(sw);assert.equal(restoreLifeCoverageServiceWorkerShell(sw.replace(/\n/gu,'\r\n')),restored.replace(/\n/gu,'\r\n'));
 for(const mutation of [sw+'// unrelated\n',sw.replace('zhuo-wordbook-v100','zhuo-wordbook-v101'),sw.replace('english-laundry-phrase-evidence.js?v=118','english-laundry-phrase-evidence.js')])assert.throws(()=>restoreLifeCoverageServiceWorkerShell(mutation),/snapshot changed/u);
});

test('the new grammar helper and every changed upstream source consumer use the exact118 dependency',async()=>{
 const expected=[['expanded-dictionary.js','english-laundry-phrase-evidence.js'],['english-laundry-phrase-evidence.js','search-experience-data.js'],
 ['everyday-lookup-data.js','reviewed-senses-data.js'],['everyday-lookup-data.js','search-experience-data.js'],
 ['dictionary-entry-v109.js','dictionary-app-v109.js'],['dictionary-entry-v109.js','dictionary-offline-warm-v108.js'],
 ['public-app-v113.js','public-snapshot.js'],['reviewed-canonical-forms.js','reviewed-senses-data.js']];
 for(const[file,target]of expected){const source=await read('js/'+file),imports=[...source.matchAll(/\b(?:from\s+|import\s*)['"](\.\/[^'"]+)['"]/gu)].map(m=>m[1]);
  assert.deepEqual(imports.filter(url=>url.slice(2).split('?')[0]===target),['./'+target+'?v=118'],file+' -> '+target);
 }
});

test('whole118/121 HTML bodies authenticate before only four entry URLs are reversed into unchanged117 pins',async()=>{
 for(const[file,current,previous]of [['index.html','public-app-v113.js?v=121','public-app-v113.js?v=120'],
  ['dictionary.html','dictionary-entry-v109.js?v=118','dictionary-entry-v109.js?v=117'],
  ['owner.html','owner-app-v108.js?v=118','owner-app-v108.js?v=117'],['personal.html','personal-app-v108.js?v=118','personal-app-v108.js?v=117']]){
  const text=await read(file),prior=restoreLifeCoverageShell(file,text);
  assert.equal(text.split('src="js/'+current+'"').length,2);assert.equal(prior,text.replace('src="js/'+current+'"','src="js/'+previous+'"'));
  assert.doesNotThrow(()=>restoreSearchCommonTermsShell(file,text));
  for(const mutation of [text+'<!-- unrelated -->',text.replace('<main id="main">','<main id="wrong">'),text.replace(current,previous),text.slice(0,-1)])assert.throws(()=>restoreLifeCoverageShell(file,mutation),/snapshot changed/u);
  const lf=text.replace(/\r\n/gu,'\n');assert.equal(restoreLifeCoverageShell(file,lf.replace(/\n/gu,'\r\n')),restoreLifeCoverageShell(file,lf).replace(/\n/gu,'\r\n'));
 }
 assert((await read('index.html')).includes('href="styles.css?v=117"'));assert((await read('dictionary.html')).includes('href="dictionary.css?v=114"'));
 assert.equal(restoreLifeCoverageShell('guide.html','unrelated'),'unrelated');
});
