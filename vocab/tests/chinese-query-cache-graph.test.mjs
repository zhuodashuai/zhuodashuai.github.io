import {restoreSearchRelease125AssetIfCurrent} from '../../tooling/tests/helpers/search-release-125-shell.mjs';
import {restoreSearchCommonTermsShell} from '../../tooling/tests/helpers/search-common-terms-shell.mjs';
import {restoreLifeCoverageServiceWorkerShell} from '../../tooling/tests/helpers/life-coverage-shell.mjs';
import {dictionaryOfflineWarmUrl} from '../js/dictionary-offline-warm-v108.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {restoreChineseQueryCacheShell} from '../../tooling/tests/helpers/chinese-query-cache-shell.mjs';
import {restoreSearchCoverageFollowupShell} from '../../tooling/tests/helpers/search-coverage-followup-shell.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const read=async name=>{const text=restoreSearchRelease125AssetIfCurrent(name,await readFile(new URL('../'+name,import.meta.url),'utf8'));return name==='sw.js'?restoreLifeCoverageServiceWorkerShell(text):text;};
// Keep the historical non-root URL subset/hashes unchanged; the new common-terms
// graph gate independently parses the complete literal array, including './'.
const sw=await read('sw.js');
const declaration=sw.match(/const SHELL = \[([\s\S]*?)\];/u)?.[1];
assert(declaration,'Actual serviceworker shell must be available');
const urls=[...declaration.matchAll(/"(\.\/[^"\r\n]+)"/gu)].map(match=>match[1]);
const fresh=[
  "./js/public-app-v113.js?v=119",
  "./js/personal-app-v108.js?v=116",
  "./js/owner-app-v108.js?v=116",
  "./js/dictionary-entry-v109.js?v=116",
  "./js/dictionary-app-v109.js?v=116",
  "./js/dictionary-app.js?v=116",
  "./js/library-lookup-controller.js?v=116",
  "./js/library-lookup-ui.js?v=116",
  "./js/personal-lookup-flow.js?v=116",
  "./js/dictionary-suggestions.js?v=116",
  "./js/expanded-dictionary.js?v=116",
  "./js/english-surface-variants.js?v=116",
  "./js/everyday-lookup.js?v=116",
  "./js/everyday-lookup-data.js?v=116",
  "./js/reviewed-senses-data.js?v=116",
  "./js/search-experience-data.js?v=116",
  "./js/dictionary-examples-current-v4.js?v=116",
  "./js/dictionary-examples-ui-v108.js?v=116",
  "./js/entry-detail-v113.js?v=116",
  "./js/entry-detail-v108.js?v=116",
  "./js/selected-common-sense.js?v=116",
  "./js/selected-legacy-examples.js?v=116",
  "./js/chinese-search.js?v=116",
  "./js/chinese-ranking.js?v=116",
  "./js/chinese-query-cache.js?v=116",
  "./js/chinese-query-cache-release.js?v=116",
  "./js/chinese-query-cache-format.js?v=116",
  "./js/chinese-query-cache.js",
  "./js/chinese-query-cache-release.js",
  "./js/chinese-query-cache-format.js",
  "./js/dictionary-offline-warm-v108.js?v=116"
];

test('cache-phase graph retains every historical non-root offline alias and only adds exact current graph aliases',()=>{
 const prior116=urls.slice(31);
 assert.equal(sha(JSON.stringify(prior116)),'f79ef9663a528e243bfa4ac9e64e862e8d562c381ec471b13cb64e51cc02c056');
 assert.deepEqual(prior116.slice(0,fresh.length),fresh);
 assert.equal(urls.length-31-fresh.length,291);
 assert.equal(sha(JSON.stringify(urls.slice(31+fresh.length))),"d07e384375f4af968006a149733de9ac11641a99a9dac18771a8b463270b6b26");
 assert.equal(new Set(fresh).size,fresh.length);
 assert.match(sw,/const CACHE_NAME = "zhuo-wordbook-v100";/u);
 assert(!urls.some(url=>url.includes('/data/chinese-query-cache/')),'No membership,bucket or bundledresponse is installed inbulk');
 for(const name of['chinese-query-cache','chinese-query-cache-format','chinese-query-cache-release']){
  assert(urls.includes('./js/'+name+'.js?v=116'));assert(urls.includes('./js/'+name+'.js'));
 }
});

test('cache corruption reload bypasses stored packets while private APIs remain network-only',()=>{
 const api=sw.indexOf('if (url.pathname.startsWith("/api/"))');
 const reload=sw.indexOf('url.pathname.includes("/data/chinese-query-cache/")');
 const cache=sw.lastIndexOf('event.respondWith(cacheFirst(request, event))');
 assert(api>=0&&reload>api&&cache>reload);
 assert.match(sw.slice(api,api+120),/event\.respondWith\(fetch\(request\)\);/u);
 assert.match(sw.slice(reload,reload+360),/request\.cache === "reload"/u);
 assert.match(sw.slice(reload,reload+460),/reloadPublicShard\(request, event\)/u);
});

test('current118 imports are explicit and archived104,114 andplan-only95 edges stay finite',async()=>{
 for(const[file,targets]of[
  ['js/dictionary-entry-v109.js',['./dictionary-app-v109.js?v=118','./dictionary-offline-warm-v108.js?v=118']],
  ['js/dictionary-app-v109.js',['./expanded-dictionary.js?v=118','./dictionary-suggestions.js?v=118']],
  ['js/dictionary-app.js',['./expanded-dictionary.js?v=118','./dictionary-suggestions.js?v=118']],
  ['js/expanded-dictionary.js',['./chinese-query-cache.js?v=118','./chinese-search.js?v=118','./chinese-ranking.js?v=118','./everyday-lookup.js?v=118','./dictionary-form-evidence.js?v=118','./reviewed-canonical-forms.js?v=118']],
  ['js/chinese-ranking.js',['./chinese-search.js?v=118']],
  ['js/personal-lookup-flow.js',['./chinese-search.js?v=118','./everyday-lookup.js?v=118']],
  ['js/public-app-v113.js',['./library-lookup-ui.js?v=123','./entry-detail-v113.js?v=122']],
  ['js/public-app-v108.js',['./library-lookup-ui.js?v=114']],
  ['js/dictionary-app-v108.js',['./expanded-dictionary.js?v=104']],
  ['js/dictionary-entry.js',['./dictionary-app.js?v=104']],
  ['js/dictionary-app.js',['./chinese-search.js?v=95']],
  ['js/personal-app-v108.js',['./chinese-search.js?v=95','./personal-lookup-flow.js?v=118']]
 ]){
  const source=await read(file);for(const target of targets)assert(source.includes(target),file+'→'+target);
 }
});

test('new wholeHTMLpins authenticate before finite116→115 restoration and all older pins',async()=>{
 for(const[file,current,previous]of[
  ['index.html','src="js/public-app-v113.js?v=119"','src="js/public-app-v113.js?v=118"'],
  ['dictionary.html','src="js/dictionary-entry-v109.js?v=116"','src="js/dictionary-entry-v109.js?v=115"'],
  ['owner.html','src="js/owner-app-v108.js?v=116"','src="js/owner-app-v108.js?v=115"'],
  ['personal.html','src="js/personal-app-v108.js?v=116"','src="js/personal-app-v108.js?v=115"']
 ]){
  const source=await read(file),phase116=restoreSearchCommonTermsShell(file,source),restored=restoreChineseQueryCacheShell(file,source);
  assert.equal(phase116.split(current).length,2);assert.equal(restored,phase116.replace(current,previous));
  assert.doesNotThrow(()=>restoreSearchCoverageFollowupShell(file,source));
  assert.throws(()=>restoreChineseQueryCacheShell(file,source+'<!-- unrelated mutation -->'),/snapshot changed/u);
  assert.throws(()=>restoreChineseQueryCacheShell(file,source.replace('<main id="main">','<main id="wrong">')),/snapshot changed/u);
  const lf=source.replace(/\r\n/gu,'\n');assert.equal(restoreChineseQueryCacheShell(file,lf.replace(/\n/gu,'\r\n')),restoreChineseQueryCacheShell(file,lf).replace(/\n/gu,'\r\n'));
 }
 assert.equal(restoreChineseQueryCacheShell('guide.html','unrelated'),'unrelated');
});

test('first-known-query replay accepts only exact public cache bucket/bundle URLs',()=>{
 const base='https://zhuodashuai.github.io/vocab/',suffix='data/chinese-query-cache/'+'a'.repeat(64)+'/'+'b'.repeat(64)+'.bin',valid=base+suffix;
 assert.equal(dictionaryOfflineWarmUrl(valid,base),valid);
 for(const value of[valid+'?q=开心',valid+'#fragment',valid.replace('/data/','/api/'),valid.replace('https://zhuodashuai.github.io','https://unrelated.invalid'),valid.replace('.bin','.json'),valid.replace('b'.repeat(64),'b'.repeat(63)),valid.replace('a'.repeat(64),'A'.repeat(64))])assert.equal(dictionaryOfflineWarmUrl(value,base),null,value);
});
