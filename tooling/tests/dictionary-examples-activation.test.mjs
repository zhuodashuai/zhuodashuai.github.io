import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadAdditiveExampleBuild } from '../scripts/build-dictionary-examples-additive.mjs';
import { dictionaryExamplesRelease, DICTIONARY_EXAMPLES_VERSION, DICTIONARY_EXAMPLES_COUNTS } from '../../vocab/js/dictionary-examples-release-v4.js';
import { createDictionaryExamplesController } from '../../vocab/js/dictionary-examples-current-v4.js';

test('application release pins select the exact actual normal build and retain at least the published D32 coverage',async()=>{
  const build=await loadAdditiveExampleBuild();assert.equal(build.catalogue.version,DICTIONARY_EXAMPLES_VERSION);
  assert.deepEqual(build.catalogue.counts,DICTIONARY_EXAMPLES_COUNTS);assert.deepEqual(build.descriptor,dictionaryExamplesRelease.catalogue);
  assert.deepEqual(build.catalogue.base,dictionaryExamplesRelease.base);assert.deepEqual(build.catalogue.source,dictionaryExamplesRelease.source);
  // Historical D32 assets/pairs are pinned separately. Later normal, reviewed
  // releases may append; their live directory must match this actual build.
  assert.ok(build.audit.addedHeads>=285);assert.equal(build.audit.addedHeads,build.catalogue.keys.length);
  assert.equal(build.audit.retainedWholeBaseEntries,86415);
  assert.equal(build.catalogue.counts.heads,86415+build.audit.addedHeads);
  assert.ok(Object.isFrozen(dictionaryExamplesRelease.source));assert.ok(Object.isFrozen(dictionaryExamplesRelease.base.counts));
});
test('existing UI controller semantics and cancellation remain available through the additive adapter',async()=>{
  let resolve;const states=[],controller=createDictionaryExamplesController({load:()=>new Promise(done=>resolve=done),onChange:state=>states.push(state.phase)});
  const result=controller.show('sample');controller.clear();resolve({term:'sample',senses:[]});
  assert.equal(await result,false);assert.equal(controller.getState().phase,'idle');assert.ok(states.includes('loading'));
});
test('service worker preserves the existing cache and old graph while installing only new directory metadata, not unvisited deltas',async()=>{
  const sw=await readFile(new URL('../../vocab/sw.js',import.meta.url),'utf8');
  assert.match(sw,/const CACHE_NAME = "zhuo-wordbook-v100";/u);
  for(const file of ['dictionary-examples.js?v=96','dictionary-entry.js?v=104','public-app.js?v=104','personal-app.js?v=107'])assert.ok(sw.includes(`./js/${file}`));
  for(const file of ['dictionary-app-v108.js','dictionary-entry-v108.js','dictionary-offline-warm-v108.js','dictionary-examples-ui-v108.js',
    'entry-detail-v108.js','public-app-v108.js','owner-app-v108.js','personal-app-v108.js','dictionary-examples-current-v4.js','dictionary-examples-release-v4.js',
    'dictionary-examples-additive.js','dictionary-examples-additive-codec.js'])assert.ok(sw.includes(`./js/${file}`));
  assert.ok(sw.includes(`./data/dictionary-examples/${dictionaryExamplesRelease.catalogue.file}`));
  const shell=sw.slice(sw.indexOf('const SHELL = ['),sw.indexOf('self.addEventListener("install"'));
  assert.ok(!shell.includes('/delta-v4/'));assert.ok(!shell.includes('/en-000.json'));assert.ok(!shell.includes('/examples-0.json'));
});
