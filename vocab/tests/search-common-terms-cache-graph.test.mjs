import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {restoreSearchCommonTermsShell} from '../../tooling/tests/helpers/search-common-terms-shell.mjs';
import {restoreChineseQueryCacheShell} from '../../tooling/tests/helpers/chinese-query-cache-shell.mjs';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const names=['personal-app-v108','owner-app-v108','dictionary-entry-v109','dictionary-app-v109','dictionary-app',
  'library-lookup-controller','library-lookup-ui','personal-lookup-flow','dictionary-suggestions','expanded-dictionary',
  'english-surface-variants','everyday-lookup','everyday-lookup-data','reviewed-senses-data','search-experience-data',
  'dictionary-examples-current-v4','dictionary-examples-ui-v108','entry-detail-v113','entry-detail-v108',
  'selected-common-sense','selected-legacy-examples','chinese-search','chinese-ranking','chinese-query-cache',
  'chinese-query-cache-release','chinese-query-cache-format','dictionary-offline-warm-v108','dictionary-form-evidence',
  'reviewed-canonical-forms','public-snapshot'];
const fresh=['./js/public-app-v113.js?v=120',...names.map(name=>'./js/'+name+'.js?v=117')];

test('common-terms graph adds exactly31 explicit URLs before every exact prior323offline path',async()=>{
  const sw=await read('sw.js'),body=sw.match(/const SHELL = \[([\s\S]*?)\];/u)?.[1];assert(body);
  const urls=JSON.parse('['+body.replace(/\/\/[^\r\n]*/gu,'').trim().replace(/,$/u,'')+']');
  assert(urls.every(url=>typeof url==='string'&&url.startsWith('./')));
  assert.equal(urls.filter(url=>url==='./').length,1,'The already-published public root is part of the exhaustive literal array');
  assert.equal(fresh.length,31);assert.deepEqual(urls.slice(0,31),fresh);assert.equal(urls.length,354);assert.equal(new Set(urls).size,354);
  assert.equal(hash(JSON.stringify(urls.slice(31))),'91c187c6e3d102ce832eb5c1127ac2f74eb252afcc3153b9b1e55829d6b62a5e');
  assert(!urls.some(url=>url.includes('/data/chinese-query-cache/')),'Packet assets are still demand-loaded');
  assert(!urls.some(url=>url.includes('/api/')));assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));
});

test('finite form rejection and canonical noun projection use the same fresh current source closure',async()=>{
  const engine=await read('js/expanded-dictionary.js');
  for(const target of ['dictionary-form-evidence','reviewed-canonical-forms','english-surface-variants','chinese-query-cache','everyday-lookup']){
    const urls=[...engine.matchAll(/\bfrom\s+["'](\.\/[^"']+)["']/gu)].map(m=>m[1]).filter(url=>url.startsWith('./'+target+'.js'));
    assert.deepEqual(urls,['./'+target+'.js?v=117']);
  }
  assert((await read('js/reviewed-canonical-forms.js')).includes("from './reviewed-senses-data.js?v=117'"));
  assert((await read('js/public-app-v113.js')).includes('from "./public-snapshot.js?v=117"'));
  for(const target of ['chinese-query-cache-release','chinese-query-cache-format'])assert((await read('js/chinese-query-cache.js')).includes("from './"+target+".js?v=117'"));
});

test('the new whole-shell bridge reverses exactly120/117URLs before all unchanged116historical pins',async()=>{
  for(const[file,current,previous]of [
    ['index.html','public-app-v113.js?v=120','public-app-v113.js?v=119'],
    ['dictionary.html','dictionary-entry-v109.js?v=117','dictionary-entry-v109.js?v=116'],
    ['owner.html','owner-app-v108.js?v=117','owner-app-v108.js?v=116'],
    ['personal.html','personal-app-v108.js?v=117','personal-app-v108.js?v=116']
  ]){
    const text=await read(file),restored=restoreSearchCommonTermsShell(file,text);
    assert.equal(text.split('src="js/'+current+'"').length,2);assert.equal(restored,text.replace('src="js/'+current+'"','src="js/'+previous+'"'));
    assert.doesNotThrow(()=>restoreChineseQueryCacheShell(file,text));
    for(const invalid of [text+'<!-- unrelated -->',text.replace('<main id="main">','<main id="different">'),text.replace(current,previous),text.slice(0,-1)])assert.throws(()=>restoreSearchCommonTermsShell(file,invalid),/snapshot changed/u);
    const lf=text.replace(/\r\n/gu,'\n');assert.equal(restoreSearchCommonTermsShell(file,lf.replace(/\n/gu,'\r\n')),restoreSearchCommonTermsShell(file,lf).replace(/\n/gu,'\r\n'));
  }
  assert.equal(restoreSearchCommonTermsShell('guide.html','unrelated'),'unrelated');
});
