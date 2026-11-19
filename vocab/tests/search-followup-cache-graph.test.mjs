import {restoreChineseQueryCacheShell} from '../../tooling/tests/helpers/chinese-query-cache-shell.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {restoreSearchCoverageFollowupShell} from '../../tooling/tests/helpers/search-coverage-followup-shell.mjs';
import {restoreSearchExperienceShell} from '../../tooling/tests/helpers/search-experience-shell.mjs';

const read = file => readFile(new URL('../'+file, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const freshModules = ['personal-app-v108','owner-app-v108','dictionary-entry-v109','dictionary-app-v109',
  'dictionary-app','library-lookup-controller','library-lookup-ui','personal-lookup-flow','dictionary-suggestions',
  'expanded-dictionary','english-surface-variants','everyday-lookup','everyday-lookup-data','reviewed-senses-data',
  'search-experience-data','dictionary-examples-current-v4','dictionary-examples-ui-v108','entry-detail-v113',
  'entry-detail-v108','selected-common-sense','selected-legacy-examples'];

test('fresh search/data/example reader closure has exact116 edges while compatible dependencies keep their versions', async () => {
  const edges = [
    ['dictionary-entry-v109.js','dictionary-app-v109.js'],
    ...['dictionary-app-v109.js','dictionary-app.js','owner-app-v108.js','owner-app.js','personal-app-v108.js','personal-app.js','library-lookup-ui.js'].map(file=>[file,'expanded-dictionary.js']),
    ['library-lookup-ui.js','library-lookup-controller.js'],['library-lookup-ui.js','dictionary-app.js'],
    ['library-lookup-controller.js','dictionary-app.js'],
    ['public-app-v113.js','library-lookup-ui.js'],['public-app.js','library-lookup-ui.js'],
    ['expanded-dictionary.js','everyday-lookup.js'],['expanded-dictionary.js','english-surface-variants.js'],
    ['expanded-dictionary.js','selected-common-sense.js'],['everyday-lookup.js','everyday-lookup-data.js'],
    ['everyday-lookup-data.js','reviewed-senses-data.js'],['everyday-lookup-data.js','search-experience-data.js'],
    ['dictionary-suggestions.js','everyday-lookup.js'],['personal-lookup-flow.js','everyday-lookup.js'],
    ['personal-lookup-flow.js','selected-common-sense.js'],['selected-common-sense.js','reviewed-senses-data.js'],
    ['selected-legacy-examples.js','reviewed-senses-data.js'],
    ['dictionary-examples-current-v4.js','everyday-lookup.js'],['dictionary-examples-current-v4.js','selected-common-sense.js'],
    ['dictionary-examples-current-v4.js','selected-legacy-examples.js'],
    ['public-app-v113.js','entry-detail-v113.js'],['public-app.js','entry-detail-v113.js'],
    ['owner-app-v108.js','entry-detail-v108.js'],['personal-app-v108.js','dictionary-examples-ui-v108.js'],
    ['entry-detail-v113.js','dictionary-examples-ui-v108.js'],['entry-detail-v108.js','dictionary-examples-ui-v108.js'],
    ['personal-app-v108.js','personal-lookup-flow.js',2],['personal-app.js','personal-lookup-flow.js',2],
  ];
  for(const[file,target,count=1]of edges){
    const source=await read('js/'+file);
    const imports=[...source.matchAll(/\b(?:from\s+|import\s*)["'](\.\/[^"']+)["']/gu)].map(match=>match[1]);
    assert.deepEqual(imports.filter(url=>url.slice(2).split('?')[0]===target),Array(count).fill('./'+target+'?v=116'),file+' -> '+target);
  }
  for(const[file,target]of [['dictionary-app-v109.js','dictionary-examples-current-v4.js'],['dictionary-examples-ui-v108.js','dictionary-examples-current-v4.js'],['dictionary-app-v109.js','dictionary-suggestions.js'],['dictionary-app.js','dictionary-suggestions.js']]){
    const source=await read('js/'+file);
    assert.equal(source.split('import("./'+target+'?v=116")').length,2,file+' optional current reader');
  }
  for(const[file,target]of [['expanded-dictionary.js','chinese-search.js'],['personal-lookup-flow.js','chinese-search.js'],['expanded-dictionary.js','chinese-ranking.js']]){
    assert((await read('js/'+file)).includes('./'+target+'?v=116'),file+' current catalogue/ranking edge');
  }
  assert((await read('js/dictionary-app-v108.js')).includes('from "./expanded-dictionary.js?v=104"'));
  assert((await read('js/dictionary-entry.js')).includes('import "./dictionary-app.js?v=104"'));
  assert((await read('js/public-app-v108.js')).includes('from "./library-lookup-ui.js?v=114"'));
});

test('additive offline graph retains exact268 old URLs and all private-network cache rules', async () => {
  const source=await read('sw.js');
  const declaration=source.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/u)?.[1];assert(declaration);
  const urls=[...declaration.matchAll(/["'](\.\/[^"']+)["']/gu)].map(match=>match[1]);
  const fresh=['./js/public-app-v113.js?v=118',...freshModules.map(name=>'./js/'+name+'.js?v=115'),'./js/english-surface-variants.js'];
  const priorUrls=urls.slice(31);
  assert.deepEqual(priorUrls.slice(0,23),fresh);assert.equal(new Set(urls).size,322);
  assert.equal(priorUrls.slice(23).length,268);
  assert.equal(hash(JSON.stringify(priorUrls.slice(23))),'483535a9752bf66f13e38f41c2ddc334412d96091b469a99178b4f41cbf1fe3e');
  const currentTail=source.slice(source.indexOf('self.addEventListener("install"')).replace(/\r\n/gu,'\n');
  const cacheRepair=' || url.pathname.includes("/data/chinese-query-cache/")';
  assert.equal(currentTail.split(cacheRepair).length,2,'Exactly the new publicpacket reload bypass');
  const tail=currentTail.replace(cacheRepair,'');
  assert.equal(hash(tail),'595ce0ff2848cc05043cb3b72136b6789837e4baa2e4039e5eb0270c005ebd41');
  assert.match(source,/const CACHE_NAME = "zhuo-wordbook-v100"/u);
  assert(!urls.some(url=>url.includes('/api/')));
  assert((await read('index.html')).includes('href="styles.css?v=117"'));
  assert((await read('dictionary.html')).includes('href="dictionary.css?v=114"'));
});

test('new HTML pins reverse only4 current entry URLs before unchanged historical shell checks', async () => {
  for(const[file,current,previous]of [['index.html','public-app-v113.js?v=118','public-app-v113.js?v=117'],['owner.html','owner-app-v108.js?v=115','owner-app-v108.js?v=114'],['personal.html','personal-app-v108.js?v=115','personal-app-v108.js?v=114'],['dictionary.html','dictionary-entry-v109.js?v=115','dictionary-entry-v109.js?v=114']]){
    const source=await read(file),cacheRestored=restoreChineseQueryCacheShell(file,source),prior=restoreSearchCoverageFollowupShell(file,source);
    assert.equal(prior,cacheRestored.replace('src="js/'+current+'"','src="js/'+previous+'"'));
    assert.notEqual(restoreSearchExperienceShell(file,source),source);
    assert.throws(()=>restoreSearchCoverageFollowupShell(file,source+'<!-- unrelated -->'),/snapshot changed/u);
    assert.throws(()=>restoreSearchCoverageFollowupShell(file,source.replace('<main id="main">','<main id="other">')),/snapshot changed/u);
    const lf=source.replace(/\r\n/gu,'\n');
    assert.equal(restoreSearchCoverageFollowupShell(file,lf.replace(/\n/gu,'\r\n')),restoreSearchCoverageFollowupShell(file,lf).replace(/\n/gu,'\r\n'));
  }
});
