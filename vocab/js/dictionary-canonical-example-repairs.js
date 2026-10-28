import { CANONICAL_EXAMPLE_REPAIRS } from './canonical-example-repairs-data.js';
import { canonicalSnapshot, canonicalKeys, canonicalText, canonicalHash, canonicalFreeze,
  canonicalEqual, canonicalFold, canonicalJSONDigest, canonicalDisplayContexts, canonicalSavedContext,
  canonicalAlive, stoppedCanonicalExample, validateCanonicalPins, createCanonicalSourceClient } from './canonical-example-repair-source.js';

const KIND = 'canonical-same-sense-example-only-v1';
const ROW = ['term','canonicalId','canonicalSourceSha256','exactCanonicalRecord','canonicalSourceDescriptor',
  'expectedOriginalEntry','expectedOriginalEntrySha256','acceptedDisplayContexts','replacementPair','senseId','reviewer'];
const PAIR = ['term','partOfSpeech','meaningZh','en','zh'];

function pair(value, row) {
  canonicalKeys(value, PAIR);
  for (const key of PAIR) canonicalText(value[key], key === 'en' || key === 'zh' ? 1200 : key === 'meaningZh' ? 20000 : 200);
  if (value.term !== row.term || value.partOfSpeech !== row.exactCanonicalRecord.partOfSpeech
    || value.meaningZh !== row.exactCanonicalRecord.meaning || !/\p{Script=Latin}/u.test(value.en) || !/\p{Script=Han}/u.test(value.zh)) throw Error('Invalid canonical replacement pair');
}
function oldEntry(entry, term) {
  canonicalKeys(entry, ['term','senses']);
  if (entry.term !== term || !Array.isArray(entry.senses) || entry.senses.length !== 1) throw Error('Invalid original example entry');
  const sense = entry.senses[0]; canonicalKeys(sense, ['id','partOfSpeech','meaningZh','examples','reviewer','source']);
  for (const key of ['id','partOfSpeech','meaningZh','reviewer','source']) canonicalText(sense[key], key === 'meaningZh' ? 20000 : 200);
  if (!Array.isArray(sense.examples) || sense.examples.length !== 1) throw Error('Ambiguous original example pair');
  canonicalKeys(sense.examples[0], ['en','zh']); canonicalText(sense.examples[0].en,1200); canonicalText(sense.examples[0].zh,1200);
}
function tableSnapshot(input) {
  const table = canonicalSnapshot(input); canonicalKeys(table, ['schemaVersion','kind','pins','rows']);
  if (table.schemaVersion !== 1 || table.kind !== KIND || !Array.isArray(table.rows) || table.rows.length > 128) throw Error('Invalid canonical repair table');
  table.pins = validateCanonicalPins(table.pins); const seen = new Set(), sentences = new Set();
  for (const row of table.rows) {
    canonicalKeys(row, Object.hasOwn(row,'additionalExamples') ? [...ROW,'additionalExamples'] : ROW);
    canonicalText(row.term,200); canonicalHash(row.canonicalSourceSha256); canonicalHash(row.expectedOriginalEntrySha256);
    if (/\p{Script=Han}|[<>]|javascript\s*:/iu.test(row.term) || seen.has(canonicalFold(row.term))) throw Error('Duplicate or unsafe canonical head');
    seen.add(canonicalFold(row.term)); const record = row.exactCanonicalRecord;
    if (!Number.isSafeInteger(row.canonicalId) || row.canonicalId < 0 || record.id !== row.canonicalId || record.term !== row.term) throw Error('Invalid canonical identity');
    canonicalText(record.partOfSpeech,80); canonicalText(record.meaning,20000);
    if (!/\p{Script=Han}/u.test(record.meaning) || !canonicalEqual(row.acceptedDisplayContexts,canonicalDisplayContexts(record))) throw Error('Invalid saved contexts');
    oldEntry(row.expectedOriginalEntry,row.term); pair(row.replacementPair,row);
    canonicalText(row.reviewer,200);
    if (!/^AI\/[a-z0-9_-]{1,100}$/u.test(row.reviewer)
      || row.senseId !== `canonical-example:${row.canonicalId}:${row.canonicalSourceSha256}`
      || row.senseId === row.expectedOriginalEntry.senses[0].id) throw Error('Invalid canonical example identity');
    const examples = [{en:row.replacementPair.en,zh:row.replacementPair.zh},...(row.additionalExamples||[])];
    if (row.additionalExamples && (!Array.isArray(row.additionalExamples) || !row.additionalExamples.length || row.additionalExamples.length > 7)) throw Error('Invalid additional examples');
    for (const example of examples) {
      canonicalKeys(example,['en','zh']); canonicalText(example.en,1200); canonicalText(example.zh,1200);
      if (!/\p{Script=Latin}/u.test(example.en) || !/\p{Script=Han}/u.test(example.zh) || sentences.has(canonicalFold(example.en))) throw Error('Duplicate or invalid learning example');
      sentences.add(canonicalFold(example.en));
    }
  }
  return canonicalFreeze(table);
}

/** The application supplies a shipped, build-verified table, never card flags
 * or serialized request data. This factory also supports isolated test tables. */
export function createCanonicalExampleRepairResolver(input, { fetchImpl = globalThis.fetch, loadOriginalEntry, timeoutMs = 5500 } = {}) {
  const table = tableSnapshot(input);
  if (typeof loadOriginalEntry !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw Error('Invalid canonical example dependencies');
  const rows = new Map(table.rows.map(row=>[row.term,row]));
  const source = createCanonicalSourceClient(table.pins,{fetchImpl}); const active = new Set(); let closed = false;
  return {
    has(term) { return rows.has(term); },
    async load(term, options = {}) {
      if (closed) throw stoppedCanonicalExample(); const row = rows.get(term);
      if (!row) return null;
      let signal;
      try {
        if (!options || typeof options !== 'object' || Array.isArray(options) || Object.getPrototypeOf(options)!==Object.prototype) return null;
        const descriptors = Object.getOwnPropertyDescriptors(options);
        if (Reflect.ownKeys(options).some(key=>!['signal','savedEntry','lookupQuery'].includes(key)
          || !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key],'value'))) return null;
        signal = descriptors.signal?.value;
        if (signal !== undefined && !(signal instanceof AbortSignal)) return null;
        canonicalAlive(signal);
        if (options.lookupQuery !== undefined && options.lookupQuery !== term) return null;
        const saved = options.savedEntry, scoped = saved !== undefined;
        const context = scoped ? canonicalSavedContext(saved,term) : null;
        if (scoped && !row.acceptedDisplayContexts.some(item=>canonicalEqual(item,context))) return null;
        const controller = new AbortController(); active.add(controller);
        const stop = () => controller.abort(); signal?.addEventListener('abort',stop,{once:true});
        if (signal?.aborted) controller.abort();
        let timer, rejectStopped;
        const cancelled = new Promise((_,reject)=>{rejectStopped=()=>reject(stoppedCanonicalExample());});
        controller.signal.addEventListener('abort',rejectStopped,{once:true});
        if(controller.signal.aborted)rejectStopped();
        const deadline = new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);});
        const work = (async()=>{
          const [record, entry] = await Promise.all([source.authenticate(row,{signal:controller.signal}),
            loadOriginalEntry(term,{signal:controller.signal,lookupQuery:term})]);
          canonicalAlive(controller.signal); if(closed)throw stoppedCanonicalExample();
          if (!canonicalEqual(record,row.exactCanonicalRecord)) return null;
          const snapshot = canonicalSnapshot(entry); oldEntry(snapshot,term);
          const serialized = JSON.stringify(snapshot);
          if (!canonicalEqual(snapshot,row.expectedOriginalEntry) || await canonicalJSONDigest(snapshot)!==row.expectedOriginalEntrySha256) return null;
          canonicalAlive(controller.signal);
          if (JSON.stringify(canonicalSnapshot(entry))!==serialized || scoped && !canonicalEqual(canonicalSavedContext(saved,term),context)) return null;
          const replacement = row.replacementPair;
          return {term,senses:[{id:row.senseId,partOfSpeech:replacement.partOfSpeech,meaningZh:replacement.meaningZh,
            examples:[{en:replacement.en,zh:replacement.zh},...(row.additionalExamples||[]).map(pair=>({...pair}))],
            reviewer:row.reviewer,source:'原创学习例句'}]};
        })();
        try { return await Promise.race([work,deadline,cancelled]); }
        finally { clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.signal.removeEventListener('abort',rejectStopped);active.delete(controller); }
      } catch(error) {
        if(closed||signal?.aborted)throw stoppedCanonicalExample();
        // A failed optional repair must never fall back to a known wrong sense.
        return null;
      }
    },
    close() { closed=true;for(const c of active)c.abort();active.clear();source.close(); }
  };
}

// Fixed, private default authority; neither load options nor saved cards can
// substitute a different compiled table or turn a form into an approved head.
const defaultTable = tableSnapshot(CANONICAL_EXAMPLE_REPAIRS);
const defaultHeads = new Set(defaultTable.rows.map(row=>row.term));
export const hasCanonicalExampleRepair = term => defaultHeads.has(term);
export const createCanonicalExampleRepairs = dependencies => createCanonicalExampleRepairResolver(defaultTable,dependencies);
