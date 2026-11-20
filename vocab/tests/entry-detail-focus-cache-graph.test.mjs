import {restoreSearchMatchContextAssetIfCurrent} from '../../tooling/tests/helpers/search-match-context-shell.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fingerprintChineseQueryEngine} from '../../tooling/scripts/build-chinese-query-cache.mjs';
import {CHINESE_QUERY_CACHE_RELEASE as release} from '../js/chinese-query-cache-release.js';
import {ENTRY_DETAIL_FOCUS_URLS,restoreEntryDetailFocusShell,restoreEntryDetailFocusShellIfCurrent,restoreEntryDetailFocusServiceWorkerShell,restoreEntryDetailFocusServiceWorkerShellIfCurrent} from '../../tooling/tests/helpers/entry-detail-focus-shell.mjs';
import {restoreLifeCoverageShell,restoreLifeCoverageServiceWorkerShell} from '../../tooling/tests/helpers/life-coverage-shell.mjs';
import {restoreMemberSpellingShellIfCurrent,restoreMemberSpellingServiceWorkerShell} from '../../tooling/tests/helpers/member-spelling-shell.mjs';
const read=async file=>{const text=restoreSearchMatchContextAssetIfCurrent(file,await readFile(new URL('../'+file,import.meta.url),'utf8'));return file==='sw.js'?restoreMemberSpellingServiceWorkerShell(text):restoreMemberSpellingShellIfCurrent(file,text);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const urls=text=>JSON.parse('['+text.match(/const SHELL = \[([\s\S]*?)\];/u)[1].replace(/\/\/[^\r\n]*/gu,'').trim().replace(/,$/u,'')+']');

test('UI122 adds exactly four aliases without altering any of the386 prior offline URLs or cache policy',async()=>{
 const sw=await read('sw.js'),all=urls(sw);assert.equal(all.length,390);assert.equal(new Set(all).size,390);
 assert.deepEqual(all.slice(0,4),ENTRY_DETAIL_FOCUS_URLS);assert.equal(all.filter(x=>x==='./').length,1);
 assert.equal(sha(JSON.stringify(all.slice(4))),'488020e20f0a4f7af43463279a932c8959fdd72d852a3afedd8e762cdb646a0b');
 assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));assert(!all.some(x=>x.includes('/api/')||x.includes('/data/chinese-query-cache/')));
 const prior=restoreEntryDetailFocusServiceWorkerShell(sw);assert.deepEqual(urls(prior),all.slice(4));assert.doesNotThrow(()=>restoreLifeCoverageServiceWorkerShell(sw));
 const lf=sw.replaceAll('\r\n','\n');assert.equal(restoreEntryDetailFocusServiceWorkerShell(lf.replaceAll('\n','\r\n')),restoreEntryDetailFocusServiceWorkerShell(lf).replaceAll('\n','\r\n'));
 for(const mutation of [sw+'// unrelated\n',sw.replace('zhuo-wordbook-v100','zhuo-wordbook-v101'),sw.replace('./js/entry-detail-v108.js?v=122','./js/entry-detail-v108.js?v=123'),sw.replace('./js/entry-detail-v108.js?v=118','./js/entry-detail-v108.js?v=117'),sw.replace('  "./js/public-app-v113.js?v=122",',''),sw.replace('  "./js/public-app-v113.js?v=122",','  "./js/public-app-v113.js?v=122",\n  "./js/public-app-v113.js?v=122",')])assert.throws(()=>restoreEntryDetailFocusServiceWorkerShell(mutation),/snapshot changed/u);
 assert.equal(restoreEntryDetailFocusServiceWorkerShellIfCurrent(prior),prior);
});

test('only the whole authenticated public and owner UI122 HTML snapshots reverse into prior exact shells',async()=>{
 for(const[file,current,previous]of [['index.html','public-app-v113.js?v=122','public-app-v113.js?v=121'],['owner.html','owner-app-v108.js?v=122','owner-app-v108.js?v=118']]){
  const text=await read(file),prior=restoreEntryDetailFocusShell(file,text);assert.equal(text.split('src="js/'+current+'"').length,2);
  assert.equal(prior,text.replace('src="js/'+current+'"','src="js/'+previous+'"'));assert.doesNotThrow(()=>restoreLifeCoverageShell(file,text));
  const lf=text.replaceAll('\r\n','\n');assert.equal(restoreEntryDetailFocusShell(file,lf.replaceAll('\n','\r\n')),restoreEntryDetailFocusShell(file,lf).replaceAll('\n','\r\n'));
  for(const mutation of [text+'<!-- unrelated -->',text.replace(current,previous),text.replace(current,current+'0'),text.replace('<main id="main">','<main id="wrong">'),text.slice(0,-1)])assert.throws(()=>restoreEntryDetailFocusShell(file,mutation),/snapshot changed/u);
  assert.equal(restoreEntryDetailFocusShellIfCurrent(file,prior),prior);
 }
 assert((await read('personal.html')).includes('src="js/personal-app-v108.js?v=118"'));assert((await read('dictionary.html')).includes('src="js/dictionary-entry-v109.js?v=118"'));
 assert((await read('index.html')).includes('href="styles.css?v=117"'));assert((await read('dictionary.html')).includes('href="dictionary.css?v=114"'));
 assert.equal(restoreEntryDetailFocusShell('guide.html','unrelated'),'unrelated');
});

test('only the three current detail callers use122 while compatible archived callers retain their explicit edges',async()=>{
 for(const[file,expected]of [['public-app.js','./entry-detail-v113.js?v=122'],['public-app-v113.js','./entry-detail-v113.js?v=122'],['owner-app-v108.js','./entry-detail-v108.js?v=122'],['owner-app.js','./entry-detail.js?v=96'],['public-app-v108.js','./entry-detail-v108.js']]){
  const source=await read('js/'+file),imports=[...source.matchAll(/\bfrom\s+["'](\.\/entry-detail[^"']+)["']/gu)].map(m=>m[1]);assert.deepEqual(imports,[expected],file);
 }
 for(const file of ['entry-detail-v113.js','entry-detail-v108.js']){
  const source=await read('js/'+file);assert(source.includes('./dictionary-examples-ui-v108.js?v=118'));assert(!source.includes('?v=122'),'The refreshed presenter retains its unchanged dependency graph');
 }
});

test('the full24-module engine and its release descriptor keep their exact pre-UI122 bytes and cache941 binding',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));const fp=await fingerprintChineseQueryEngine({root,sourceManifestSha256:release.sourceManifestSha256,selectionSources:release.selectionSources});
 assert.equal(Object.keys(fp.sourceFiles).length,24);assert.equal(fp.engineBinding,'81a773934d49ddc17a157e06e208026fc5760ea8389ab5b6ca897c542a5da28e');assert.equal(fp.markerValue,fp.engineBinding);assert.equal(release.engineBinding,fp.engineBinding);
 assert.equal(release.buildVersion,'941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4');
 const files=[...Object.keys(fp.sourceFiles),'vocab/js/chinese-query-cache-release.js'];const hashes=await Promise.all(files.map(async file=>[file,sha(await readFile(new URL('../../'+file,import.meta.url)))]));hashes.sort(([a],[b])=>a.localeCompare(b));
 assert.equal(sha(JSON.stringify(hashes)),'4fd8701ee6bda2a2869e28a837b71b31e619f7539d3335e284fdef50479b14e1');
});
