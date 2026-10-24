// Optional public assets only. No member API, provider, credentials or private
// storage. This module does not activate itself or alter the legacy reader.
import { parseDictionaryExamplesManifest, parseDictionaryExamplesShard, dictionaryExampleBucket } from './dictionary-examples.js?v=96';
import { parseArtifactReference, parseAdditiveCatalogue, parseAdditiveDelta, decodeGzipArtifact, deltaIndex, digest } from './dictionary-examples-additive-codec.js';

const EXAMPLES=new URL('../data/dictionary-examples/',import.meta.url);
const SOURCES=new URL('../data/expanded-dictionary/',import.meta.url);
const fold=value=>value.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US');
const json=raw=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
function invalid(){const error=new Error('例句数据暂不可用。');error.code='invalid_dictionary_examples_additive';return error;}
function aborted(){const error=new Error('已停止读取例句。');error.name='AbortError';return error;}
function timeout(){const error=new Error('读取例句超时。');error.code='dictionary_examples_timeout';return error;}
function termText(value){if(typeof value!=='string'||!value.trim()||value.length>200||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>]|javascript\s*:/iu.test(value)||/\p{Script=Han}/u.test(value))throw invalid();}
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==[...keys].sort().join())throw invalid();}
function sourceBucket(term){let hash=2166136261;for(const ch of fold(term)){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619)>>>0;}return hash%128;}
function wait(promise,signal,milliseconds){
  if(signal?.aborted)return Promise.reject(aborted());
  return new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>finish(reject,timeout()),milliseconds);
    const stop=()=>finish(reject,aborted());function finish(callback,value){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);callback(value);}
    signal?.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(value=>finish(resolve,value),error=>finish(reject,error));});
}
async function bytes(response,maximum,signal){
  if(!response?.ok)throw invalid();const length=response.headers?.get('content-length');
  // Fetch already removes HTTP Content-Encoding. Content-Length still measures
  // the wire representation, which can exceed an already-gzipped artifact's
  // size when a CDN applies gzip again. Bound and authenticate the actual Fetch
  // body below; an identity response can still be rejected early by its length.
  const encoding=response.headers?.get('content-encoding')?.trim().toLowerCase();
  if(length!=null&&(!/^\d+$/u.test(length)||(!encoding||encoding==='identity')&&Number(length)>maximum))throw invalid();
  if(!response.body?.getReader){const raw=new Uint8Array(await response.arrayBuffer());if(raw.length>maximum)throw invalid();return raw;}
  const reader=response.body.getReader(),chunks=[];let total=0,complete=false;const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try{while(true){if(signal.aborted)throw aborted();const {done,value}=await reader.read();if(done){complete=true;break;}
      if(!(value instanceof Uint8Array))throw invalid();total+=value.length;if(total>maximum)throw invalid();chunks.push(value);}}
  finally{signal.removeEventListener('abort',cancel);if(!complete)cancel();reader.releaseLock();}
  if(signal.aborted)throw aborted();const raw=new Uint8Array(total);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}return raw;
}

/** A release is supplied only by a version-pinned application graph. Caller
 * maps/display labels never grant canonical identity or source authority.
 * New deltas require a literal canonical query; arbitrary form/query surfaces
 * cannot inherit the example through an alias. Existing base behavior stays.
 */
export function createAdditiveExamplesLoader(release,{fetchImpl=globalThis.fetch}={}){
  let pinned;try{pinned=structuredClone(release);}catch{throw invalid();}
  exact(pinned,['catalogue','base','source']);pinned.catalogue=parseArtifactReference(pinned.catalogue);
  // Validate pins through the same strict catalogue schema before first use.
  // These synchronous shape checks also prevent fetches to caller-supplied URLs.
  exact(pinned.base,['file','bytes','sha256','version','counts']);exact(pinned.source,['version','manifestSha256']);
  const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
  if(pinned.base.file!=='manifest-v2.json'||!Number.isSafeInteger(pinned.base.bytes)||pinned.base.bytes<1||pinned.base.bytes>524288
    ||!isHash(pinned.base.sha256)||!isHash(pinned.base.version)||!isHash(pinned.source.version)||!isHash(pinned.source.manifestSha256)||typeof fetchImpl!=='function')throw invalid();
  const pending=new Map(),cache=new Map(),failed=new Set(),active=new Set();let closed=false;
  function cached(key,operation){
    if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return Promise.resolve(value);}
    if(pending.has(key))return pending.get(key);
    const promise=Promise.resolve().then(operation).then(value=>{if(!closed){cache.set(key,value);while(cache.size>8)cache.delete(cache.keys().next().value);}return value;})
      .catch(error=>{failed.add(key);throw error;}).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});
    pending.set(key,promise);return promise;
  }
  async function download(url,maximum,key,{sha256,size}={}){
    if(closed)throw aborted();const controller=new AbortController();active.add(controller);const timer=setTimeout(()=>controller.abort(),5000);
    try{return await wait((async()=>{
      const response=await fetchImpl(url.href,{credentials:'omit',redirect:'error',mode:'same-origin',cache:failed.has(key)?'reload':'no-cache',signal:controller.signal});
      const raw=await bytes(response,maximum,controller.signal);
      if(size!==undefined&&raw.length!==size||sha256&&await digest(raw)!==sha256)throw invalid();
      if(controller.signal.aborted)throw aborted();return raw;
    })(),controller.signal,5000);}finally{clearTimeout(timer);active.delete(controller);}
  }
  function baseManifest(){return cached('base',async()=>{
    const raw=await download(new URL(pinned.base.file,EXAMPLES),524288,'base',{sha256:pinned.base.sha256,size:pinned.base.bytes});
    const value=parseDictionaryExamplesManifest(json(raw));if(value.schemaVersion!==2||value.version!==pinned.base.version||JSON.stringify(value.counts)!==JSON.stringify(pinned.base.counts))throw invalid();return value;
  });}
  function catalogue(){return cached('catalogue',async()=>{
    const descriptor=pinned.catalogue,raw=await download(new URL(descriptor.file,EXAMPLES),descriptor.bytes,'catalogue',{sha256:descriptor.sha256,size:descriptor.bytes});
    const value=await parseAdditiveCatalogue(await decodeGzipArtifact(raw,descriptor));
    if(JSON.stringify(value.base)!==JSON.stringify(pinned.base)||JSON.stringify(value.source)!==JSON.stringify(pinned.source))throw invalid();return value;
  });}
  function baseBucket(manifest,term){const descriptor=manifest.shards[dictionaryExampleBucket(term)],key=`base:${descriptor.sha256}`;
    return cached(key,async()=>{const raw=await download(new URL(descriptor.file,EXAMPLES),descriptor.bytes,key,{sha256:descriptor.sha256,size:descriptor.bytes});return parseDictionaryExamplesShard(json(raw),manifest,descriptor);});}
  function delta(catalogue,index){const descriptor=catalogue.deltas[index],key=`delta:${descriptor.sha256}`;
    return cached(key,async()=>{const raw=await download(new URL(descriptor.file,EXAMPLES),descriptor.bytes,key,{sha256:descriptor.sha256,size:descriptor.bytes});return parseAdditiveDelta(await decodeGzipArtifact(raw,descriptor,{delta:true}),catalogue,index);});}
  function sourceManifest(){return cached('source',async()=>{
    const raw=await download(new URL('manifest.json',SOURCES),524288,'source',{sha256:pinned.source.manifestSha256}),value=json(raw);
    if(value.schemaVersion!==2||value.version!==pinned.source.version||value.english?.buckets!==128||!Array.isArray(value.english.shards)||value.english.shards.length!==128)throw invalid();
    return value;
  });}
  function canonicalSource(manifest,term){const bucket=sourceBucket(term),descriptor=manifest.english.shards[bucket];
    if(!descriptor||descriptor.bucket!==bucket||descriptor.file!==`${manifest.version}/en-${String(bucket).padStart(3,'0')}.json`
      ||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>8*1024*1024||!isHash(descriptor.sha256))throw invalid();
    const key=`source:${descriptor.sha256}`;
    return cached(key,async()=>{
      const raw=await download(new URL(descriptor.file,SOURCES),descriptor.bytes,key,{sha256:descriptor.sha256,size:descriptor.bytes}),value=json(raw);
      if(value.schemaVersion!==2||value.kind!=='en'||value.bucket!==bucket||!Array.isArray(value.records)||!Array.isArray(value.keys))throw invalid();
      // The authenticated raw body is private to this closure. Its records and
      // exact key tuples are not reconstructed from lossy UI display strings.
      return value;
    });
  }
  async function load(term,{lookupQuery,signal,timeoutMs=5500}={}){
    termText(term);if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>60000||closed)throw invalid();
    if(signal?.aborted)throw aborted();let waiting=true;const alive=()=>{if(!waiting||signal?.aborted||closed)throw aborted();};
    try{return await wait((async()=>{
      const manifest=await baseManifest();alive();const old=await baseBucket(manifest,term);alive();if(old.has(term))return old.get(term);
      // A legacy card/caller with no current canonical query keeps base-only
      // behavior; a display marker cannot silently opt into new evidence.
      if(typeof lookupQuery!=='string')return null;termText(lookupQuery);if(fold(lookupQuery)!==fold(term))return null;
      const directory=await catalogue();alive();const index=deltaIndex(directory,term);if(index===null)return null;
      const rows=await delta(directory,index);alive();const row=rows.get(term);if(!row)throw invalid();
      const source=await sourceManifest();alive();const raw=await canonicalSource(source,term);alive();
      const matches=raw.records.filter(value=>value.term===term),tuples=raw.keys.filter(value=>Array.isArray(value)&&value[0]===fold(term));
      if(matches.length!==1||tuples.length!==1||!Array.isArray(tuples[0][1])||matches[0].id!==row.canonicalId
        ||await digest(new TextEncoder().encode(JSON.stringify(matches[0])))!==row.canonicalSourceSha256)throw invalid();
      alive();const refs=tuples[0][1].filter(ref=>ref.kind==='canonical'&&ref.id===row.canonicalId);
      if(refs.length!==1||!Number.isSafeInteger(row.canonicalId)||row.canonicalId%128!==sourceBucket(term))throw invalid();
      return row.example;
    })(),signal,timeoutMs);}finally{waiting=false;}
  }
  return Object.freeze({load,close(){if(closed)return;closed=true;for(const controller of active)controller.abort();active.clear();cache.clear();pending.clear();}});
}
