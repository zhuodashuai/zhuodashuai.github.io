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
let repairClients=new WeakMap(), generation=0;
const active=new Set();
// Finite literal heads only. The build test checks this list against the
// independently approved table. Do not fetch a new optional module for every
// ordinary card, or make an incomplete offline update disable legacy examples.
const canonicalRepairHeads=new Set(["DEM","E","FOB","M","abbr","aerospace","audio","blur","bootleg","bootstrap","breakaway","bse","carney","cavalier","characterize","cherokee","cleric","contemporary","dairy","deadpan","defeatist","downward","duff","ersatz","etcetera","fact-finding","farrow","feminist","flathead","follow-up","foo","fore","gay","head-on","hieroglyphic","hubble","ice-cream","indie","jettison","knock-on","melville","midland","molly","monmouth","navajo","offside","offstage","pinky","primo","pro","qed","retro","sabine","sales","savvy","scupper","semiliterate","sheepshead","situationist","sooner","south","starboard","steinway","substantial","sus","swank","thankyou","uptown","wally","wholemeal","wot","x-ray"]);
function originalClient(fetchImpl) {
  let client=clients.get(fetchImpl);
  if(!client){client=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});clients.set(fetchImpl,client);active.add(client);}
  return client;
}
function repairClient(fetchImpl) {
  if(repairClients.has(fetchImpl))return repairClients.get(fetchImpl);
  const started=generation;
  const pending=import('./dictionary-canonical-example-repairs.js').then(module=>{
    if(started!==generation)throw Object.assign(new Error('已停止读取例句。'),{name:'AbortError'});
    const client=module.createCanonicalExampleRepairs({fetchImpl,
      loadOriginalEntry:(term,options)=>originalClient(fetchImpl).load(term,options)});
    active.add(client);return client;
  });
  repairClients.set(fetchImpl,pending);
  pending.catch(()=>{if(repairClients.get(fetchImpl)===pending)repairClients.delete(fetchImpl);});
  return pending;
}
// Snapshot data fields without evaluating a saved card's accessors. Keep the
// full literal head, POS and Chinese meaning; approximate sense overlap cannot
// authorize a replacement example.
function canonicalCard(entry,term) {
  if(!entry||typeof entry!=='object'||Array.isArray(entry)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(entry)))return null;
  const own=(object,key)=>{const d=Object.getOwnPropertyDescriptor(object,key);return d?.enumerable&&Object.hasOwn(d,'value')?d.value:undefined;};
  let meaning=own(entry,'meaning');
  if(meaning&&typeof meaning==='object'&&!Array.isArray(meaning)
    &&[Object.prototype,null].includes(Object.getPrototypeOf(meaning)))meaning=own(meaning,'zh');
  const declared=Object.getOwnPropertyDescriptor(entry,'term');
  const card={term:declared?own(entry,'term'):term,partOfSpeech:own(entry,'partOfSpeech'),meaning};
  return Object.values(card).every(value=>typeof value==='string'&&value.trim())?card:null;
}
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
  if(canonicalRepairHeads.has(term)) {
    const context=savedEntry===undefined?undefined:canonicalCard(savedEntry,term);
    if(context===null)return Promise.resolve(null);
    return repairClient(fetchImpl).then(client=>client.load(term,{signal:options.signal,savedEntry,lookupQuery:term}))
      .then(entry=>savedEntry!==undefined&&JSON.stringify(canonicalCard(savedEntry,term))!==JSON.stringify(context)?null:entry)
      .catch(error=>{if(options.signal?.aborted||error?.name==='AbortError')throw error;return null;});
  }
  const everyday=loadEverydayExamples(term);
  // A new everyday sense must not replace an existing saved homograph: e.g.
  // bench press (a machine) and bench press (the exercise) have the same head.
  // Only exact saved POS/meaning identity authorizes the local fast answer.
  const scoped = Boolean(everyday) && savedEntry !== undefined;
  const card = scoped ? savedSense(savedEntry) : null;
  if(everyday && (!scoped || everyday.senses.some(sense => sameSavedSense(sense, card))))return Promise.resolve(everyday);
  const client=originalClient(fetchImpl);
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
  let savedEntry, managedGuard;
  const controller = legacyController({load:(term,options)=>{
    const entry=savedEntry, guard=managedGuard;
    if(guard&&!guard())return Promise.resolve(null);
    return Promise.resolve(load(term,{...options,savedEntry:entry})).then(result=>guard&&!guard()?null:result);
  },onChange});
  return { ...controller,
    show(term, options = {}) {
      // Copy only the display identity now. A later card edit or switch cannot
      // change the meaning associated with an already started async request.
      const entry = options.savedEntry;
      managedGuard=undefined;
      if(canonicalRepairHeads.has(term)&&entry!==undefined){
        savedEntry=canonicalCard(entry,term);
        const identity=JSON.stringify(savedEntry);
        managedGuard=()=>identity!=='null'&&JSON.stringify(canonicalCard(entry,term))===identity;
      } else savedEntry = entry === undefined ? undefined : {
        partOfSpeech: entry?.partOfSpeech,
        meaning: typeof entry?.meaning === 'string' ? entry.meaning : entry?.meaning?.zh,
      };
      return controller.show(term);
    },
    clear() { savedEntry = undefined; managedGuard=undefined; controller.clear(); },
  };
}
export function resetDictionaryExamplesCacheForTests(){
  generation++;for(const client of active)client.close();active.clear();clients=new WeakMap();repairClients=new WeakMap();
}
