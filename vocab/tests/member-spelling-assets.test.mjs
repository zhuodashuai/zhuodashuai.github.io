import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fingerprintChineseQueryEngine} from '../../tooling/scripts/build-chinese-query-cache.mjs';
import {CHINESE_QUERY_CACHE_RELEASE as release} from '../js/chinese-query-cache-release.js';
import {MEMBER_SPELLING_PANEL_LINE,MEMBER_SPELLING_URLS,restoreMemberSpellingShell,
 restoreMemberSpellingServiceWorkerShell} from '../../tooling/tests/helpers/member-spelling-shell.mjs';
import {restoreLifeCoverageShell,restoreLifeCoverageServiceWorkerShell} from '../../tooling/tests/helpers/life-coverage-shell.mjs';
import {ENTRY_DETAIL_FOCUS_URLS,restoreEntryDetailFocusServiceWorkerShell} from '../../tooling/tests/helpers/entry-detail-focus-shell.mjs';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('the combined392 shell keeps member119, parent focus122 and all386 unchanged offline aliases in exact order',async()=>{
 const sw=await read('sw.js'),body=sw.match(/const SHELL = \[([\s\S]*?)\];/u)?.[1];assert(body);
 const urls=JSON.parse('['+body.replace(/\/\/[^\r\n]*/gu,'').trim().replace(/,$/u,'')+']');
 assert.equal(urls.length,392);assert.equal(new Set(urls).size,392);assert.deepEqual(urls.slice(0,2),MEMBER_SPELLING_URLS);
 assert.deepEqual(urls.slice(2,6),ENTRY_DETAIL_FOCUS_URLS);
 assert.equal(sha(JSON.stringify(urls.slice(6))),'488020e20f0a4f7af43463279a932c8959fdd72d852a3afedd8e762cdb646a0b');
 assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100";'));assert(!urls.some(url=>url.includes('/api/')||url.includes('/data/chinese-query-cache/')));
 assert(!urls.includes('./js/personal-spelling.js'),'No old bare consumer exists for this new helper');
 const prior=restoreMemberSpellingServiceWorkerShell(sw);assert.equal(urls.length-2,390);
 const old386=restoreEntryDetailFocusServiceWorkerShell(prior);assert.equal(JSON.parse('['+old386.match(/const SHELL = \[([\s\S]*?)\];/u)[1].replace(/\/\/[^\r\n]*/gu,'').trim().replace(/,$/u,'')+']').length,386);
 const eol=old386.includes('\r\n')?'\r\n':'\n',anchor='const SHELL = ['+eol;
 const memberPrefix=MEMBER_SPELLING_URLS.map(url=>'  '+JSON.stringify(url)+',').join(eol)+eol+eol;
 const historical388=old386.replace(anchor,anchor+memberPrefix);
 assert.equal(restoreMemberSpellingServiceWorkerShell(historical388),old386,'The exact original388 worker pins still authenticate');
 assert.equal(restoreMemberSpellingServiceWorkerShell(historical388.replace(/\r\n/gu,'\n').replace(/\n/gu,'\r\n')),old386.replace(/\r\n/gu,'\n').replace(/\n/gu,'\r\n'));
 assert.doesNotThrow(()=>restoreLifeCoverageServiceWorkerShell(sw));
 assert.equal(restoreMemberSpellingServiceWorkerShell(sw.replace(/\n/gu,'\r\n')),prior.replace(/\n/gu,'\r\n'));
 for(const changed of [sw+'// other\n',sw.replace('zhuo-wordbook-v100','zhuo-wordbook-v101'),sw.replace('personal-spelling.js?v=119','personal-spelling.js?v=118')])assert.throws(()=>restoreMemberSpellingServiceWorkerShell(changed),/snapshot changed/u);
});

test('the complete personal119 shell reverses only one exact panel line and its entry URL',async()=>{
 const html=await read('personal.html'),restored=restoreMemberSpellingShell('personal.html',html);
 assert.equal(html.split(MEMBER_SPELLING_PANEL_LINE+'\n').length,2);assert.equal(html.split('src="js/personal-app-v108.js?v=119"').length,2);
 assert.equal(restored,html.replace(MEMBER_SPELLING_PANEL_LINE+'\n','').replace('src="js/personal-app-v108.js?v=119"','src="js/personal-app-v108.js?v=118"'));
 assert.doesNotThrow(()=>restoreLifeCoverageShell('personal.html',html));
 for(const changed of [html.replace(MEMBER_SPELLING_PANEL_LINE+'\n',''),html.replace(MEMBER_SPELLING_PANEL_LINE,MEMBER_SPELLING_PANEL_LINE+'\n'+MEMBER_SPELLING_PANEL_LINE),
  html.replace(MEMBER_SPELLING_PANEL_LINE+'\n','')+MEMBER_SPELLING_PANEL_LINE+'\n',html.replace('aria-label="拼写建议"','aria-label="different"'),
  html.replace('<main id="main">','<main id="other">'),html.replace('personal-app-v108.js?v=119','personal-app-v108.js?v=118'),html+'<!-- unrelated -->'])assert.throws(()=>restoreMemberSpellingShell('personal.html',changed),/snapshot changed/u);
 const lf=html.replace(/\r\n/gu,'\n');assert.equal(restoreMemberSpellingShell('personal.html',lf.replace(/\n/gu,'\r\n')),restoreMemberSpellingShell('personal.html',lf).replace(/\n/gu,'\r\n'));
 assert.equal(restoreMemberSpellingShell('guide.html','unrelated'),'unrelated');
});

test('both personal programs share helper119 while the original lookup and normalization graph stays118 and114',async()=>{
 for(const file of ['personal-app.js','personal-app-v108.js']){const app=await read('js/'+file);
  assert.equal(app.split('from "./personal-spelling.js?v=119"').length,2);
  assert.equal(app.split('from "./expanded-dictionary.js?v=118"').length,2);
  assert(app.includes('from "./personal-dictionary.js?v=97"'));
 }
 const helper=await read('js/personal-spelling.js');assert(helper.includes('from "./dictionary-query-normalization.js?v=114"'));
 assert(!helper.includes('owner-api')&&!helper.includes('personal-api'),'The sidecar has no account or collection authority');
});

test('a personal UI release keeps the complete24-file engine raw bytes and current cache binding unchanged',async()=>{
 const root=resolve(import.meta.dirname,'../..');
 const graph=await fingerprintChineseQueryEngine({root,sourceManifestSha256:release.sourceManifestSha256,selectionSources:release.selectionSources});
 assert.equal(graph.engineBinding,'81a773934d49ddc17a157e06e208026fc5760ea8389ab5b6ca897c542a5da28e');
 assert.equal(graph.markerValue,graph.engineBinding);assert.equal(release.engineBinding,graph.engineBinding);
 assert.equal(release.buildVersion,'941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4');
 assert.equal(Object.keys(graph.sourceFiles).length,24);assert(!Object.keys(graph.sourceFiles).some(file=>file.endsWith('/personal-spelling.js')));
 const raw={};for(const file of Object.keys(graph.sourceFiles))raw[file]=sha(await readFile(resolve(root,file)));
 assert.equal(sha(JSON.stringify(raw)),'95ae2be5643107db81ecc9a2e674fe6bbc0109af26b73253dbf9f2146758b5da');
});
