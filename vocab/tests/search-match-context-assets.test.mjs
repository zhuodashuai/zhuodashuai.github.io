import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fingerprintChineseQueryEngine} from '../../tooling/scripts/build-chinese-query-cache.mjs';
import {CHINESE_QUERY_CACHE_RELEASE as release} from '../js/chinese-query-cache-release.js';
import {SEARCH_MATCH_CONTEXT_URLS,restoreSearchMatchContextShell,restoreSearchMatchContextServiceWorkerShell,restoreSearchMatchContextAssetIfCurrent} from '../../tooling/tests/helpers/search-match-context-shell.mjs';
import {restoreLifeCoverageShell,restoreLifeCoverageServiceWorkerShell} from '../../tooling/tests/helpers/life-coverage-shell.mjs';
import {restoreSavedCardSearchAssetIfCurrent} from '../../tooling/tests/helpers/saved-card-search-shell.mjs';
const read=async file=>restoreSavedCardSearchAssetIfCurrent(file,await readFile(new URL('../'+file,import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const urls=text=>JSON.parse('['+text.match(/const SHELL = \[([\s\S]*?)\];/u)[1].replace(/\/\/[^\r\n]*/gu,'').trim().replace(/,$/u,'')+']');

test('UI123 prepends exactly three presenter URLs and preserves the entire392-alias old shell',async()=>{
 const sw=await read('sw.js'),all=urls(sw);assert.equal(all.length,395);assert.equal(new Set(all).size,395);
 assert.deepEqual(all.slice(0,3),SEARCH_MATCH_CONTEXT_URLS);assert.equal(all.filter(x=>x==='./').length,1);
 assert.equal(sha(JSON.stringify(all.slice(3))),'d8d93f46f025cd38e92d82fc94af15ed19dde0b19f311e692d27da94ae4fd744');
 assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));assert(!all.some(x=>x.includes('/api/')||x.includes('/data/chinese-query-cache/')));
 const prior=restoreSearchMatchContextServiceWorkerShell(sw);assert.equal(urls(prior).length,392);assert.deepEqual(urls(prior),all.slice(3));assert.doesNotThrow(()=>restoreLifeCoverageServiceWorkerShell(sw));
 const lf=sw.replaceAll('\r\n','\n');assert.equal(restoreSearchMatchContextServiceWorkerShell(lf.replaceAll('\n','\r\n')),restoreSearchMatchContextServiceWorkerShell(lf).replaceAll('\n','\r\n'));
 for(const changed of [sw+'// other\n',sw.replace('zhuo-wordbook-v100','zhuo-wordbook-v101'),sw.replace('./js/library-lookup-ui.js?v=123','./js/library-lookup-ui.js?v=124'),sw.replace('./js/personal-spelling.js?v=119','./js/personal-spelling.js?v=118'),sw.replace('  "./js/public-app-v113.js?v=123",','')])assert.throws(()=>restoreSearchMatchContextServiceWorkerShell(changed),/snapshot changed/u);
 assert.equal(restoreSearchMatchContextAssetIfCurrent('sw.js',prior),prior);
});

test('whole public and personal123 HTML pins reverse only their two entry URLs before every prior pin',async()=>{
 for(const[file,current,previous]of [['index.html','public-app-v113.js?v=123','public-app-v113.js?v=122'],['personal.html','personal-app-v108.js?v=123','personal-app-v108.js?v=119']]){
  const text=await read(file),old=restoreSearchMatchContextShell(file,text);assert.equal(text.split('src="js/'+current+'"').length,2);
  assert.equal(old,text.replace('src="js/'+current+'"','src="js/'+previous+'"'));assert.doesNotThrow(()=>restoreLifeCoverageShell(file,text));
  const lf=text.replaceAll('\r\n','\n');assert.equal(restoreSearchMatchContextShell(file,lf.replaceAll('\n','\r\n')),restoreSearchMatchContextShell(file,lf).replaceAll('\n','\r\n'));
  for(const changed of [text+'<!-- other -->',text.replace(current,previous),text.replace('<main id="main">','<main id="other">'),text.slice(0,-1)])assert.throws(()=>restoreSearchMatchContextShell(file,changed),/snapshot changed/u);
  assert.equal(restoreSearchMatchContextAssetIfCurrent(file,old),old);
 }
 assert((await read('owner.html')).includes('src="js/owner-app-v108.js?v=122"'));assert((await read('dictionary.html')).includes('src="js/dictionary-entry-v109.js?v=118"'));
 assert((await read('index.html')).includes('href="styles.css?v=117"'));assert((await read('dictionary.html')).includes('href="dictionary.css?v=114"'));
});

test('only current public callers refresh the lookup presenter while all engine, owner and spelling edges stay exact',async()=>{
 for(const file of ['public-app.js','public-app-v113.js']){const source=await read('js/'+file);assert.equal(source.split('from "./library-lookup-ui.js?v=123"').length,2);assert(source.includes('from "./entry-detail-v113.js?v=122"'));}
 const archived=await read('js/public-app-v108.js');assert(archived.includes('from "./library-lookup-ui.js?v=114"'));
 for(const file of ['personal-app.js','personal-app-v108.js']){const source=await read('js/'+file);assert(source.includes('from "./personal-spelling.js?v=119"'));assert(source.includes('from "./personal-dictionary.js?v=97"'));assert(source.includes('from "./expanded-dictionary.js?v=118"'));}
 const inline=await read('js/library-lookup-ui.js');assert(inline.includes('from "./library-lookup-controller.js?v=118"'));assert(inline.includes('from "./dictionary-app.js?v=118"'));assert(inline.includes('from "./expanded-dictionary.js?v=118"'));
});

test('all24 engine modules and the cache941 descriptor retain complete byte bindings after presenter-only123',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));const fp=await fingerprintChineseQueryEngine({root,sourceManifestSha256:release.sourceManifestSha256,selectionSources:release.selectionSources});
 assert.equal(Object.keys(fp.sourceFiles).length,24);assert.equal(fp.engineBinding,'81a773934d49ddc17a157e06e208026fc5760ea8389ab5b6ca897c542a5da28e');assert.equal(fp.markerValue,fp.engineBinding);assert.equal(release.engineBinding,fp.engineBinding);
 assert.equal(release.buildVersion,'941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4');
 const files=[...Object.keys(fp.sourceFiles),'vocab/js/chinese-query-cache-release.js'];const hashes=await Promise.all(files.map(async file=>[file,sha(await readFile(new URL('../../'+file,import.meta.url)))]));hashes.sort(([a],[b])=>a.localeCompare(b));assert.equal(sha(JSON.stringify(hashes)),'4fd8701ee6bda2a2869e28a837b71b31e619f7539d3335e284fdef50479b14e1');
});
