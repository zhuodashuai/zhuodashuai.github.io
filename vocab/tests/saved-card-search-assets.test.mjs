import {restoreSearchRelease125AssetIfCurrent} from '../../tooling/tests/helpers/search-release-125-shell.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fingerprintChineseQueryEngine} from '../../tooling/scripts/build-chinese-query-cache.mjs';
import {loadHistorical941Kernel} from '../../tooling/tests/helpers/historical-query-kernel-941.mjs';
import {SAVED_CARD_SEARCH_URLS,restoreSavedCardSearchShell,restoreSavedCardSearchServiceWorkerShell,restoreSavedCardSearchAssetIfCurrent} from '../../tooling/tests/helpers/saved-card-search-shell.mjs';
import {restoreLifeCoverageShell,restoreLifeCoverageServiceWorkerShell} from '../../tooling/tests/helpers/life-coverage-shell.mjs';
const read=async file=>restoreSearchRelease125AssetIfCurrent(file,await readFile(new URL('../'+file,import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const urls=text=>JSON.parse('['+text.match(/const SHELL = \[([\s\S]*?)\];/u)[1].replace(/\/\/[^\r\n]*/gu,'').trim().replace(/,$/u,'')+']');

test('saved-filter124 adds exactly four code aliases before all395 previous URLs without changing cache or data policy',async()=>{
 const sw=await read('sw.js'),all=urls(sw);assert.equal(all.length,399);assert.equal(new Set(all).size,399);assert.deepEqual(all.slice(0,4),SAVED_CARD_SEARCH_URLS);assert.equal(all.filter(x=>x==='./').length,1);
 assert.equal(sha(JSON.stringify(all.slice(4))),'47e28301fb387614c4a4aa8d75bf2650009ea27888b8c989bf666590c16e626c');assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));assert(!all.some(x=>x.includes('/api/')||x.includes('/data/chinese-query-cache/')));assert(!all.includes('./js/saved-card-search.js'));
 const prior=restoreSavedCardSearchServiceWorkerShell(sw);assert.deepEqual(urls(prior),all.slice(4));assert.doesNotThrow(()=>restoreLifeCoverageServiceWorkerShell(sw));
 const lf=sw.replaceAll('\r\n','\n');assert.equal(restoreSavedCardSearchServiceWorkerShell(lf.replaceAll('\n','\r\n')),restoreSavedCardSearchServiceWorkerShell(lf).replaceAll('\n','\r\n'));
 for(const changed of [sw+'// changed\n',sw.replace('zhuo-wordbook-v100','zhuo-wordbook-v101'),sw.replace('./js/saved-card-search.js?v=124','./js/saved-card-search.js?v=125'),sw.replace('./js/library-lookup-ui.js?v=123','./js/library-lookup-ui.js?v=122'),sw.replace('  "./js/owner-public-library.js?v=124",','')])assert.throws(()=>restoreSavedCardSearchServiceWorkerShell(changed),/snapshot changed/u);
 assert.equal(restoreSavedCardSearchAssetIfCurrent('sw.js',prior),prior);
});

test('complete public and personal124 HTML snapshots undo only two script URLs before all older shell pins',async()=>{
 for(const[file,current,previous]of [['index.html','public-app-v113.js?v=124','public-app-v113.js?v=123'],['personal.html','personal-app-v108.js?v=124','personal-app-v108.js?v=123']]){
  const text=await read(file),prior=restoreSavedCardSearchShell(file,text);assert.equal(text.split('src="js/'+current+'"').length,2);assert.equal(prior,text.replace('src="js/'+current+'"','src="js/'+previous+'"'));assert.doesNotThrow(()=>restoreLifeCoverageShell(file,text));
  const lf=text.replaceAll('\r\n','\n');assert.equal(restoreSavedCardSearchShell(file,lf.replaceAll('\n','\r\n')),restoreSavedCardSearchShell(file,lf).replaceAll('\n','\r\n'));
  for(const changed of [text+'<!-- changed -->',text.replace(current,previous),text.replace('<main id="main">','<main id="changed">'),text.slice(0,-1)])assert.throws(()=>restoreSavedCardSearchShell(file,changed),/snapshot changed/u);
  assert.equal(restoreSavedCardSearchAssetIfCurrent(file,prior),prior);
 }
 assert((await read('owner.html')).includes('src="js/owner-app-v108.js?v=122"'));assert((await read('dictionary.html')).includes('src="js/dictionary-entry-v109.js?v=118"'));assert((await read('index.html')).includes('href="styles.css?v=117"'));assert((await read('dictionary.html')).includes('href="dictionary.css?v=114"'));
});

test('current public and personal filters use124 while unchanged link callers keep explicit99 and other UI versions stay fixed',async()=>{
 for(const file of ['public-app.js','public-app-v113.js','personal-app.js','personal-app-v108.js'])assert((await read('js/'+file)).includes('from "./owner-public-library.js?v=124"'),file);
 for(const file of ['public-app.js','public-app-v113.js','owner-public-library.js'])assert((await read('js/'+file)).includes('from "./saved-card-search.js?v=124"'),file);
 for(const file of ['library-lookup-ui.js','public-app-v108.js'])assert((await read('js/'+file)).includes('from "./owner-public-library.js?v=99"'),file);
 for(const file of ['personal-app.js','personal-app-v108.js']){const source=await read('js/'+file);assert(source.includes('from "./expanded-dictionary.js?v=118"'));assert(source.includes('from "./personal-spelling.js?v=119"'));assert(source.includes('from "./personal-dictionary.js?v=97"'));}
 assert((await read('js/public-app-v113.js')).includes('from "./library-lookup-ui.js?v=123"'));
 assert.equal(sha((await read('js/saved-card-search.js')).replaceAll('\r\n','\n')),'589ae9299f64bd835c8192472b48a934f38a099b37a1d7de96b69f5cb3bd0770');
 assert.equal(sha((await read('tests/saved-card-search.test.mjs')).replaceAll('\r\n','\n')),'ede810e9ec95ab672179259713695533197365526a25e39384dfed3f84488f8d');
});

test('the actual archived24-module941 kernel retains its complete saved-filter124 historical byte bindings',async()=>{
 const {root,url:historicalUrl,release}=await loadHistorical941Kernel();const fp=await fingerprintChineseQueryEngine({root,sourceManifestSha256:release.sourceManifestSha256,selectionSources:release.selectionSources});assert.equal(Object.keys(fp.sourceFiles).length,24);assert.equal(fp.engineBinding,'81a773934d49ddc17a157e06e208026fc5760ea8389ab5b6ca897c542a5da28e');assert.equal(fp.markerValue,fp.engineBinding);assert.equal(release.engineBinding,fp.engineBinding);assert.equal(release.buildVersion,'941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4');
 const hashes=await Promise.all([...Object.keys(fp.sourceFiles),'vocab/js/chinese-query-cache-release.js'].map(async file=>[file,sha(await readFile(new URL(file,historicalUrl)))]));hashes.sort(([a],[b])=>a.localeCompare(b));assert.equal(sha(JSON.stringify(hashes)),'4fd8701ee6bda2a2869e28a837b71b31e619f7539d3335e284fdef50479b14e1');
});
