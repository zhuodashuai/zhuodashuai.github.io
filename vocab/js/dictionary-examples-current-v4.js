// Optional UI adapter. The literal card head is independently authenticated by
// the additive reader; this does not approve arbitrary user-input form aliases.
// Existing selected-sense labels, book passages, cards and learning writes stay
// with their original UI. A failed optional example never blocks a meaning.
import { DICTIONARY_EXAMPLE_SOURCE, createDictionaryExamplesController as legacyController } from './dictionary-examples.js?v=96';
import { createAdditiveExamplesLoader } from './dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from './dictionary-examples-release-v4.js';
import { loadEverydayExamples } from './everyday-lookup.js';
import { applyExampleCorrections } from './dictionary-example-corrections.js';
export { DICTIONARY_EXAMPLE_SOURCE };
let clients=new WeakMap();
const active=new Set();
export function loadDictionaryExamples(term,{fetchImpl=globalThis.fetch,...options}={}){
  if(typeof fetchImpl!=='function')return Promise.reject(new Error('无法读取学习例句。'));
  if(options.signal?.aborted){const error=new Error('已取消读取例句。');error.name='AbortError';return Promise.reject(error);}
  const everyday=loadEverydayExamples(term);
  if(everyday)return Promise.resolve(everyday);
  let client=clients.get(fetchImpl);
  if(!client){client=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});clients.set(fetchImpl,client);active.add(client);}
  return client.load(term,{...options,lookupQuery:term}).then(entry=>applyExampleCorrections(term,entry,{signal:options.signal}));
}
export function createDictionaryExamplesController({load=loadDictionaryExamples,onChange=()=>{}}={}){
  return legacyController({load,onChange});
}
export function resetDictionaryExamplesCacheForTests(){
  for(const client of active)client.close();active.clear();clients=new WeakMap();
}
