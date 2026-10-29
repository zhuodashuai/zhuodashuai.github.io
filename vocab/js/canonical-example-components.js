import {CANONICAL_EXAMPLE_COMPONENTS} from './canonical-example-components-data.js';
import {canonicalSnapshot,canonicalKeys,canonicalText,canonicalHash,canonicalFreeze,canonicalEqual,
  canonicalJSONDigest,canonicalDisplayContexts,canonicalSavedContext,canonicalAlive,stoppedCanonicalExample,
  validateCanonicalPins,createCanonicalSourceClient} from './canonical-example-repair-source.js';

export const COMPONENT_KIND='canonical-additional-example-components-v1';
export const COMPONENT_HEADS=Object.freeze(['respectable','persistently','burden','honor','snuff','fertilize','socialize','claim']);
const ROW=['term','canonicalId','canonicalSourceSha256','exactCanonicalRecord','canonicalSourceDescriptor',
  'expectedOriginalEntry','expectedOriginalEntrySha256','canonicalContexts','legacyContexts','componentContexts',
  'componentPair','componentPairSha256','componentId','reviewer','sourceQualification','wholeRawSourceApproved'];
const copy=value=>canonicalSnapshot(value);
function context(term,partOfSpeech,meaning){return {term,partOfSpeech,meaning};}
export function canonicalComponentContexts(record,old,pair){
  return {canonicalContexts:canonicalDisplayContexts(record),
    legacyContexts:old.senses.map(s=>context(old.term,s.partOfSpeech,s.meaningZh)),
    componentContexts:[context(pair.term,pair.partOfSpeech,pair.meaningZh)]};
}
export function validateComponentOriginal(entry,term){
  canonicalKeys(entry,['term','senses']);
  if(entry.term!==term||!Array.isArray(entry.senses)||!entry.senses.length||entry.senses.length>24)throw Error('Invalid component original DTO');
  const ids=new Set();
  for(const sense of entry.senses){
    canonicalKeys(sense,['id','partOfSpeech','meaningZh','examples','reviewer','source']);
    for(const key of ['id','partOfSpeech','meaningZh','reviewer','source'])canonicalText(sense[key],key==='meaningZh'?2000:200);
    if(ids.has(sense.id)||!Array.isArray(sense.examples)||!sense.examples.length||sense.examples.length>8)throw Error('Invalid component original senses');
    ids.add(sense.id);
    for(const p of sense.examples){canonicalKeys(p,['en','zh']);canonicalText(p.en,1200);canonicalText(p.zh,1200);}
  }
}
export function validateCanonicalComponentTable(input){
  const table=copy(input);canonicalKeys(table,['schemaVersion','kind','pins','sourceSha256','reviewSha256','admissionSha256','rows']);
  if(table.schemaVersion!==1||table.kind!==COMPONENT_KIND||!Array.isArray(table.rows)||table.rows.length>8)throw Error('Invalid component table');
  table.pins=validateCanonicalPins(table.pins);
  for(const key of ['sourceSha256','reviewSha256','admissionSha256'])canonicalHash(table[key]);
  const terms=new Set(),ids=new Set(),sentences=new Set();
  for(const r of table.rows){
    canonicalKeys(r,ROW);canonicalText(r.term,200);
    if(!COMPONENT_HEADS.includes(r.term)||terms.has(r.term)||r.wholeRawSourceApproved!==false)throw Error('Unapproved component scope');
    terms.add(r.term);canonicalHash(r.canonicalSourceSha256);canonicalHash(r.expectedOriginalEntrySha256);canonicalHash(r.componentPairSha256);
    if(!Number.isSafeInteger(r.canonicalId)||r.canonicalId<1||r.exactCanonicalRecord.id!==r.canonicalId||r.exactCanonicalRecord.term!==r.term)throw Error('Invalid component canonical identity');
    validateComponentOriginal(r.expectedOriginalEntry,r.term);
    const p=r.componentPair;canonicalKeys(p,['term','partOfSpeech','meaningZh','en','zh']);
    for(const key of ['term','partOfSpeech','meaningZh','en','zh'])canonicalText(p[key],['en','zh'].includes(key)?1200:key==='meaningZh'?2000:200);
    if(p.term!==r.term||!/[A-Za-z]/u.test(p.en)||!/\p{Script=Han}/u.test(p.zh)||!/\p{Script=Han}/u.test(p.meaningZh)
      ||!/^canonical-component:[a-f0-9]{64}$/u.test(r.componentId)||ids.has(r.componentId)
      ||r.expectedOriginalEntry.senses.some(s=>s.id===r.componentId)||!/^AI\/[a-z0-9_-]{1,100}$/u.test(r.reviewer))throw Error('Invalid selected component');
    canonicalText(r.sourceQualification,2000);ids.add(r.componentId);
    const expected=canonicalComponentContexts(r.exactCanonicalRecord,r.expectedOriginalEntry,p);
    for(const key of ['canonicalContexts','legacyContexts','componentContexts'])if(!canonicalEqual(r[key],expected[key]))throw Error('Invalid finite component contexts');
    const contexts=[...r.canonicalContexts,...r.legacyContexts,...r.componentContexts].map(JSON.stringify);
    if(new Set(contexts).size!==contexts.length)throw Error('Ambiguous component display policy');
    const folded=p.en.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
    if(sentences.has(folded))throw Error('Duplicate component sentence');sentences.add(folded);
  }
  return canonicalFreeze(table);
}
function modeFor(row,saved,term){
  if(saved===undefined)return 'merged';
  const card=canonicalSavedContext(saved,term);
  if(card.term!==term)return null;
  if(row.legacyContexts.some(c=>canonicalEqual(c,card)))return 'legacy';
  if(row.componentContexts.some(c=>canonicalEqual(c,card)))return 'component';
  return row.canonicalContexts.some(c=>canonicalEqual(c,card))?'merged':null;
}
export function createCanonicalExampleComponentResolver(input,{fetchImpl=globalThis.fetch,loadOriginalEntry,timeoutMs=5500}={}){
  const table=validateCanonicalComponentTable(input),rows=new Map(table.rows.map(r=>[r.term,r]));
  if(typeof loadOriginalEntry!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw Error('Invalid component dependencies');
  const source=createCanonicalSourceClient(table.pins,{fetchImpl}),active=new Set();let closed=false;
  return {has:term=>rows.has(term),async load(term,options={}){
    if(closed)throw stoppedCanonicalExample();const row=rows.get(term);if(!row)return null;
    let signal;
    try{
      if(!options||Object.getPrototypeOf(options)!==Object.prototype)return null;
      const ds=Object.getOwnPropertyDescriptors(options);
      if(Reflect.ownKeys(options).some(k=>!['signal','savedEntry','lookupQuery'].includes(k)||!ds[k]?.enumerable||!Object.hasOwn(ds[k],'value')))return null;
      signal=ds.signal?.value;if(signal!==undefined&&!(signal instanceof AbortSignal))return null;
      canonicalAlive(signal);if(options.lookupQuery!==undefined&&options.lookupQuery!==term)return null;
      const saved=options.savedEntry,mode=modeFor(row,saved,term);if(!mode)return null;
      const savedBefore=saved===undefined?null:canonicalSavedContext(saved,term);
      const controller=new AbortController();active.add(controller);const stop=()=>controller.abort();signal?.addEventListener('abort',stop,{once:true});
      if(signal?.aborted)controller.abort();
      let timer,rejectStop;const stopped=new Promise((_,reject)=>{rejectStop=()=>reject(stoppedCanonicalExample());});
      controller.signal.addEventListener('abort',rejectStop,{once:true});if(controller.signal.aborted)rejectStop();
      const deadline=new Promise(resolve=>{timer=setTimeout(()=>{resolve(null);controller.abort();},timeoutMs);});
      const work=(async()=>{
        // No recursive adapter: dependencies supply the original immutable loader.
        const [canonical,original]=await Promise.allSettled([source.authenticate(row,{signal:controller.signal}),loadOriginalEntry(term,{signal:controller.signal,lookupQuery:term})]);
        canonicalAlive(controller.signal);if(closed)throw stoppedCanonicalExample();if(original.status!=='fulfilled')return null;
        const live=original.value,snapshot=copy(live);validateComponentOriginal(snapshot,term);
        if(!canonicalEqual(snapshot,row.expectedOriginalEntry)||await canonicalJSONDigest(snapshot)!==row.expectedOriginalEntrySha256)return null;
        if(JSON.stringify(copy(live))!==JSON.stringify(snapshot)||saved!==undefined&&!canonicalEqual(canonicalSavedContext(saved,term),savedBefore))return null;
        canonicalAlive(controller.signal);
        // Originals are valid. A failed optional source check cannot erase them.
        if(mode==='legacy'||canonical.status!=='fulfilled')return mode==='component'?null:copy(snapshot);
        if(!canonicalEqual(canonical.value,row.exactCanonicalRecord)
          ||await canonicalJSONDigest(row.componentPair)!==row.componentPairSha256
          ||row.componentId!==`canonical-component:${await canonicalJSONDigest([row.canonicalId,row.canonicalSourceSha256,row.componentPairSha256])}`)return null;
        canonicalAlive(controller.signal);
        if(JSON.stringify(copy(live))!==JSON.stringify(snapshot)||saved!==undefined&&!canonicalEqual(canonicalSavedContext(saved,term),savedBefore))return null;
        const p=row.componentPair,newSense={id:row.componentId,partOfSpeech:p.partOfSpeech,meaningZh:p.meaningZh,examples:[{en:p.en,zh:p.zh}],reviewer:row.reviewer,source:'原创学习例句'};
        return {term,senses:mode==='component'?[newSense]:[...copy(snapshot.senses),newSense]};
      })();
      try{return await Promise.race([work,deadline,stopped]);}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.signal.removeEventListener('abort',rejectStop);active.delete(controller);}
    }catch(error){if(closed||signal?.aborted)throw stoppedCanonicalExample();return null;}
  },close(){closed=true;for(const c of active)c.abort();active.clear();source.close();}};
}
export const createCanonicalExampleComponents=dependencies=>createCanonicalExampleComponentResolver(CANONICAL_EXAMPLE_COMPONENTS,dependencies);
