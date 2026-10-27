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
function senseText(value) {
  if (typeof value !== 'string') return '';
  return value.split(/\r?\n/u).map(line => line.trim()
    .replace(/^(?:[①-⑳]|\d{1,2}(?:\.(?!\d)|[、)）]))\s*/u, ''))
    .join(' ').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
function savedSense(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const meaning = typeof entry.meaning === 'string' ? entry.meaning : entry.meaning?.zh;
  const partOfSpeech = senseText(entry.partOfSpeech).toLocaleLowerCase('en-US');
  return partOfSpeech && senseText(meaning) ? { partOfSpeech, meaning: senseText(meaning) } : null;
}
function sameSavedSense(sense, card) {
  return card && senseText(sense.partOfSpeech).toLocaleLowerCase('en-US') === card.partOfSpeech
    && senseText(sense.meaningZh) === card.meaning;
}
export function loadDictionaryExamples(term,{fetchImpl=globalThis.fetch,savedEntry,...options}={}){
  if(typeof fetchImpl!=='function')return Promise.reject(new Error('无法读取学习例句。'));
  if(options.signal?.aborted){const error=new Error('已取消读取例句。');error.name='AbortError';return Promise.reject(error);}
  const everyday=loadEverydayExamples(term);
  // A new everyday sense must not replace an existing saved homograph: e.g.
  // bench press (a machine) and bench press (the exercise) have the same head.
  // Only exact saved POS/meaning identity authorizes the local fast answer.
  const scoped = Boolean(everyday) && savedEntry !== undefined;
  const card = scoped ? savedSense(savedEntry) : null;
  if(everyday && (!scoped || everyday.senses.some(sense => sameSavedSense(sense, card))))return Promise.resolve(everyday);
  let client=clients.get(fetchImpl);
  if(!client){client=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});clients.set(fetchImpl,client);active.add(client);}
  return client.load(term,{...options,lookupQuery:term}).then(async entry=>{
    if (!scoped) return applyExampleCorrections(term,entry,{signal:options.signal});
    const selected = entry?.senses.filter(sense => sameSavedSense(sense, card)) || [];
    if (!selected.length) return null;
    // Authenticate corrections against the complete original entry before
    // selecting its saved sense; never hash a filtered or reconstructed DTO.
    const corrected = await applyExampleCorrections(term,entry,{signal:options.signal});
    const ids = new Set(selected.map(sense => sense.id));
    return { ...corrected, senses: corrected.senses.filter(sense => ids.has(sense.id)) };
  });
}
export function createDictionaryExamplesController({load=loadDictionaryExamples,onChange=()=>{}}={}){
  let savedEntry;
  const controller = legacyController({load:(term,options)=>load(term,{...options,savedEntry}),onChange});
  return { ...controller,
    show(term, options = {}) {
      // Copy only the display identity now. A later card edit or switch cannot
      // change the meaning associated with an already started async request.
      const entry = options.savedEntry;
      savedEntry = entry === undefined ? undefined : {
        partOfSpeech: entry?.partOfSpeech,
        meaning: typeof entry?.meaning === 'string' ? entry.meaning : entry?.meaning?.zh,
      };
      return controller.show(term);
    },
    clear() { savedEntry = undefined; controller.clear(); },
  };
}
export function resetDictionaryExamplesCacheForTests(){
  for(const client of active)client.close();active.clear();clients=new WeakMap();
}
