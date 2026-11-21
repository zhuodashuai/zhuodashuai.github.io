import {fileURLToPath} from 'node:url';
import {fingerprintChineseQueryEngine,selectionSource} from '../../tooling/scripts/build-chinese-query-cache.mjs';
import {SEARCH_RELEASE_125_MODULE_FILES,restoreSearchRelease125Module,restoreSearchRelease125ModuleIfCurrent} from '../../tooling/tests/helpers/search-release-125-modules.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SEARCH_RELEASE_125_URLS,restoreSearchRelease125Shell,restoreSearchRelease125ServiceWorkerShell,restoreSearchRelease125AssetIfCurrent} from '../../tooling/tests/helpers/search-release-125-shell.mjs';
import {restoreLifeCoverageShell,restoreLifeCoverageServiceWorkerShell} from '../../tooling/tests/helpers/life-coverage-shell.mjs';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const urls=text=>JSON.parse(text.match(/const SHELL = (\[[\s\S]*?\]);/u)[1].replace(/^\s*\/\/.*$/gmu,''));
test('release125 adds only26 precise code aliases before all399 actual previous URLs',async()=>{
 const sw=await read('sw.js'),all=urls(sw);assert.equal(all.length,425);assert.equal(new Set(all).size,425);assert.deepEqual(all.slice(0,26),SEARCH_RELEASE_125_URLS);
 assert.equal(sha(JSON.stringify(all.slice(26))),'97f826ed9520b0eceed7ea20855f3cd45e3647e31d4c8a6d3e2419363e708582');assert.equal(all.filter(x=>x==='./').length,1);
 assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));assert(!all.some(x=>x.includes('/api/')||x.includes('/data/chinese-query-cache/')));assert.deepEqual(urls(restoreSearchRelease125ServiceWorkerShell(sw)),all.slice(26));assert.doesNotThrow(()=>restoreLifeCoverageServiceWorkerShell(sw));
 const lf=sw.replaceAll('\r\n','\n');assert.equal(restoreSearchRelease125ServiceWorkerShell(lf.replaceAll('\n','\r\n')),restoreSearchRelease125ServiceWorkerShell(lf).replaceAll('\n','\r\n'));
 for(const changed of [sw+'// changed\n',sw.replace('zhuo-wordbook-v100','zhuo-wordbook-v101'),sw.replace('./js/saved-card-search.js?v=124','./js/saved-card-search.js?v=125'),sw.replace('  "./js/chinese-query-cache-release.js?v=125",','')])assert.throws(()=>restoreSearchRelease125ServiceWorkerShell(changed),/snapshot changed/u);
});
test('all4 complete125 HTML shells restore only their declared entry URL before every prior full-byte pin',async()=>{
 for(const[file,current,previous]of [['index.html','public-app-v113.js?v=125','public-app-v113.js?v=124'],['personal.html','personal-app-v108.js?v=125','personal-app-v108.js?v=124'],['owner.html','owner-app-v108.js?v=125','owner-app-v108.js?v=122'],['dictionary.html','dictionary-entry-v109.js?v=125','dictionary-entry-v109.js?v=118']]){
  const text=await read(file),prior=restoreSearchRelease125Shell(file,text);assert.equal(text.split('src="js/'+current+'"').length,2);assert.equal(prior,text.replace('src="js/'+current+'"','src="js/'+previous+'"'));assert.doesNotThrow(()=>restoreLifeCoverageShell(file,text));assert.equal(restoreSearchRelease125AssetIfCurrent(file,prior),prior);
  const lf=text.replaceAll('\r\n','\n');assert.equal(restoreSearchRelease125Shell(file,lf.replaceAll('\n','\r\n')),restoreSearchRelease125Shell(file,lf).replaceAll('\n','\r\n'));
  for(const changed of [text+'<!-- changed -->',text.replace(current,previous),text.replace('id="main"','id="changed"'),text.slice(0,-1)])assert.throws(()=>restoreSearchRelease125Shell(file,changed),/snapshot changed/u);
 }
 assert((await read('index.html')).includes('href="styles.css?v=117"'));assert((await read('dictionary.html')).includes('href="dictionary.css?v=114"'));
});
test('all49 refreshed consumer edges are exact while unchanged semantic, private and legacy API edges remain finite',async()=>{
 const edges=[{"file":"js/chinese-query-cache.js","from":"./chinese-query-cache-release.js?v=118","to":"./chinese-query-cache-release.js?v=125"},{"file":"js/everyday-lookup-data.js","from":"./reviewed-senses-data.js?v=118","to":"./reviewed-senses-data.js?v=125"},{"file":"js/everyday-lookup-data.js","from":"./search-experience-data.js?v=118","to":"./search-experience-data.js?v=125"},{"file":"js/everyday-lookup.js","from":"./everyday-lookup-data.js?v=118","to":"./everyday-lookup-data.js?v=125"},{"file":"js/reviewed-canonical-forms.js","from":"./reviewed-senses-data.js?v=118","to":"./reviewed-senses-data.js?v=125"},{"file":"js/english-laundry-phrase-evidence.js","from":"./search-experience-data.js?v=118","to":"./search-experience-data.js?v=125"},{"file":"js/selected-common-sense.js","from":"./reviewed-senses-data.js?v=118","to":"./reviewed-senses-data.js?v=125"},{"file":"js/selected-legacy-examples.js","from":"./reviewed-senses-data.js?v=118","to":"./reviewed-senses-data.js?v=125"},{"file":"js/selected-legacy-examples.js","from":"./selected-legacy-examples-data.js","to":"./selected-legacy-examples-data.js?v=125"},{"file":"js/expanded-dictionary.js","from":"./everyday-lookup.js?v=118","to":"./everyday-lookup.js?v=125"},{"file":"js/expanded-dictionary.js","from":"./selected-common-sense.js?v=118","to":"./selected-common-sense.js?v=125"},{"file":"js/expanded-dictionary.js","from":"./reviewed-canonical-forms.js?v=118","to":"./reviewed-canonical-forms.js?v=125"},{"file":"js/expanded-dictionary.js","from":"./english-laundry-phrase-evidence.js?v=118","to":"./english-laundry-phrase-evidence.js?v=125"},{"file":"js/expanded-dictionary.js","from":"./chinese-query-cache.js?v=118","to":"./chinese-query-cache.js?v=125"},{"file":"js/dictionary-suggestions.js","from":"./everyday-lookup.js?v=118","to":"./everyday-lookup.js?v=125"},{"file":"js/personal-lookup-flow.js","from":"./everyday-lookup.js?v=118","to":"./everyday-lookup.js?v=125"},{"file":"js/personal-lookup-flow.js","from":"./selected-common-sense.js?v=118","to":"./selected-common-sense.js?v=125"},{"file":"js/dictionary-examples-current-v4.js","from":"./everyday-lookup.js?v=118","to":"./everyday-lookup.js?v=125"},{"file":"js/dictionary-examples-current-v4.js","from":"./selected-common-sense.js?v=118","to":"./selected-common-sense.js?v=125"},{"file":"js/dictionary-examples-current-v4.js","from":"./selected-legacy-examples.js?v=118","to":"./selected-legacy-examples.js?v=125"},{"file":"js/dictionary-examples-ui-v108.js","from":"./dictionary-examples-current-v4.js?v=118","to":"./dictionary-examples-current-v4.js?v=125"},{"file":"js/entry-detail-v113.js","from":"./dictionary-examples-ui-v108.js?v=118","to":"./dictionary-examples-ui-v108.js?v=125"},{"file":"js/entry-detail-v108.js","from":"./dictionary-examples-ui-v108.js?v=118","to":"./dictionary-examples-ui-v108.js?v=125"},{"file":"js/dictionary-app-v109.js","from":"./expanded-dictionary.js?v=118","to":"./expanded-dictionary.js?v=125"},{"file":"js/dictionary-app-v109.js","from":"./dictionary-suggestions.js?v=118","to":"./dictionary-suggestions.js?v=125"},{"file":"js/dictionary-app-v109.js","from":"./dictionary-examples-current-v4.js?v=118","to":"./dictionary-examples-current-v4.js?v=125"},{"file":"js/dictionary-app.js","from":"./expanded-dictionary.js?v=118","to":"./expanded-dictionary.js?v=125"},{"file":"js/dictionary-app.js","from":"./dictionary-suggestions.js?v=118","to":"./dictionary-suggestions.js?v=125"},{"file":"js/library-lookup-controller.js","from":"./dictionary-app.js?v=118","to":"./dictionary-app.js?v=125"},{"file":"js/library-lookup-ui.js","from":"./library-lookup-controller.js?v=118","to":"./library-lookup-controller.js?v=125"},{"file":"js/library-lookup-ui.js","from":"./dictionary-app.js?v=118","to":"./dictionary-app.js?v=125"},{"file":"js/library-lookup-ui.js","from":"./expanded-dictionary.js?v=118","to":"./expanded-dictionary.js?v=125"},{"file":"js/dictionary-entry-v109.js","from":"./dictionary-app-v109.js?v=118","to":"./dictionary-app-v109.js?v=125"},{"file":"js/public-app-v113.js","from":"./entry-detail-v113.js?v=122","to":"./entry-detail-v113.js?v=125"},{"file":"js/public-app-v113.js","from":"./library-lookup-ui.js?v=123","to":"./library-lookup-ui.js?v=125"},{"file":"js/public-app.js","from":"./entry-detail-v113.js?v=122","to":"./entry-detail-v113.js?v=125"},{"file":"js/public-app.js","from":"./library-lookup-ui.js?v=123","to":"./library-lookup-ui.js?v=125"},{"file":"js/personal-app-v108.js","from":"./personal-lookup-flow.js?v=118","to":"./personal-lookup-flow.js?v=125"},{"file":"js/personal-app-v108.js","from":"./personal-lookup-flow.js?v=118","to":"./personal-lookup-flow.js?v=125"},{"file":"js/personal-app-v108.js","from":"./expanded-dictionary.js?v=118","to":"./expanded-dictionary.js?v=125"},{"file":"js/personal-app-v108.js","from":"./dictionary-suggestions.js?v=118","to":"./dictionary-suggestions.js?v=125"},{"file":"js/personal-app-v108.js","from":"./dictionary-examples-ui-v108.js?v=118","to":"./dictionary-examples-ui-v108.js?v=125"},{"file":"js/personal-app.js","from":"./personal-lookup-flow.js?v=118","to":"./personal-lookup-flow.js?v=125"},{"file":"js/personal-app.js","from":"./personal-lookup-flow.js?v=118","to":"./personal-lookup-flow.js?v=125"},{"file":"js/personal-app.js","from":"./expanded-dictionary.js?v=118","to":"./expanded-dictionary.js?v=125"},{"file":"js/personal-app.js","from":"./dictionary-suggestions.js?v=118","to":"./dictionary-suggestions.js?v=125"},{"file":"js/owner-app-v108.js","from":"./entry-detail-v108.js?v=122","to":"./entry-detail-v108.js?v=125"},{"file":"js/owner-app-v108.js","from":"./expanded-dictionary.js?v=118","to":"./expanded-dictionary.js?v=125"},{"file":"js/owner-app.js","from":"./expanded-dictionary.js?v=118","to":"./expanded-dictionary.js?v=125"}];
 const checked=new Set();for(const e of edges){const key=e.file+'\0'+e.to;if(checked.has(key))continue;checked.add(key);const source=await read(e.file),wanted=edges.filter(x=>x.file===e.file&&x.to===e.to).length;assert.equal(source.split(e.to).length-1,wanted,e.file+' -> '+e.to);assert(!source.includes('"'+e.from+'"')&&!source.includes("'"+e.from+"'"),e.file+' retains old changed edge');}
 for(const[file,targets]of [
  ['expanded-dictionary.js',['./dictionary-form-evidence.js?v=118','./english-surface-variants.js?v=118','./chinese-search.js?v=118','./chinese-ranking.js?v=118']],
  ['chinese-query-cache.js',['./chinese-query-cache-format.js?v=118']],['dictionary-entry-v109.js',['./dictionary-offline-warm-v108.js?v=118']],
  ['personal-app-v108.js',['./personal-spelling.js?v=119','./personal-dictionary.js?v=97','./owner-public-library.js?v=124']],
  ['personal-app.js',['./personal-spelling.js?v=119','./personal-dictionary.js?v=97','./dictionary-examples-ui.js?v=96']],
  ['public-app-v113.js',['./saved-card-search.js?v=124','./owner-public-library.js?v=124']],['library-lookup-ui.js',['./owner-public-library.js?v=99']],
  ['owner-app.js',['./entry-detail.js?v=96']],['dictionary-app.js',['./dictionary-examples.js?v=96']]]){
  const source=await read('js/'+file);for(const target of targets)assert(source.includes(target),file+' -> '+target);
 }
});



test('all25 complete current module snapshots permit only finite49 import views and reject unrelated body edits',async()=>{
 assert.equal(SEARCH_RELEASE_125_MODULE_FILES.length,25);
 for(const file of SEARCH_RELEASE_125_MODULE_FILES){
  const text=await read(file),prior=restoreSearchRelease125Module(file,text);
  assert.notEqual(prior,text,file);assert.equal(restoreSearchRelease125ModuleIfCurrent(file,text),prior);
  assert.equal(restoreSearchRelease125ModuleIfCurrent(file,prior),prior);
  assert(!prior.includes('?v=125'),file+' retains no changed125 edge');
  const lf=text.replaceAll('\r\n','\n');
  assert.equal(restoreSearchRelease125Module(file,lf.replaceAll('\n','\r\n')),restoreSearchRelease125Module(file,lf).replaceAll('\n','\r\n'));
  for(const altered of [text+'// unrelated body mutation\n',text.slice(0,-1),text.replace('?v=125','?v=126')])assert.throws(()=>restoreSearchRelease125Module(file,altered),/snapshot changed/u,file);
 }
 const engine=await read('js/expanded-dictionary.js');
 const view=restoreSearchRelease125Module('js/expanded-dictionary.js',engine);
 assert(engine.includes('906404e880562a13d1889876bc21951ef287aa8d0e7a4ec48713fe11f3e61a0d'));
 assert(view.includes('906404e880562a13d1889876bc21951ef287aa8d0e7a4ec48713fe11f3e61a0d'),'Historical edge view preserves current marker rather than fabricating old code');
 assert.throws(()=>restoreSearchRelease125Module('js/expanded-dictionary.js',engine.replace('906404e880562a13d1889876bc21951ef287aa8d0e7a4ec48713fe11f3e61a0d','81a773934d49ddc17a157e06e208026fc5760ea8389ab5b6ca897c542a5da28e')),/snapshot changed/u);
 assert.equal(restoreSearchRelease125Module('unrelated.js','unrelated'),'unrelated');
});


test('the actual current125 engine binds the frozen semantic graph independently of the historical941 archive',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const manifestBytes=await readFile(new URL('../data/expanded-dictionary/manifest.json',import.meta.url));
 const selected=await selectionSource(root);
 const fp=await fingerprintChineseQueryEngine({root,sourceManifestSha256:sha(manifestBytes),selectionSources:selected.selectionSources});
 assert.equal(Object.keys(fp.sourceFiles).length,24);
 assert.equal(fp.engineBinding,'906404e880562a13d1889876bc21951ef287aa8d0e7a4ec48713fe11f3e61a0d');
 assert.equal(fp.markerValue,fp.engineBinding);
 assert.notEqual(fp.engineBinding,'81a773934d49ddc17a157e06e208026fc5760ea8389ab5b6ca897c542a5da28e');
});
