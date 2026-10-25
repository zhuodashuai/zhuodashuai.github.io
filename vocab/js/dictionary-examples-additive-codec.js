// Strict additive transport with explicit reviewed and author-selfcheck sources.
// Imported only by the new reader/build, never by the legacy v96 reader.
const HASH=/^[a-f0-9]{64}$/u;
const isHash=value=>typeof value==='string'&&HASH.test(value);
const CONTROL=/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const BODY=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const HAN=/\p{Script=Han}/u;
const FORMAT='immutable-gzip-base-plus-deltas-v1';
const SOURCE='原创例句·AI复核（精选义项）';
const SELF_CHECK_SOURCE='原创例句·作者自查（精选义项）';
const MAX_HEADS=200000,MAX_PAIRS=400000,MAX_DELTAS=1024;
const owned=new WeakMap();
export const LIMITS=Object.freeze({catalogueEncoded:524288,catalogueDecoded:2097152,deltaEncoded:262144,deltaDecoded:1048576,deltaHeads:2000});
const compare=(a,b)=>a<b?-1:a>b?1:0;
function invalid(){const e=new Error('例句增量数据校验失败。');e.code='invalid_dictionary_examples_additive';return e;}
function stop(){const e=new Error('已停止读取例句。');e.name='AbortError';return e;}
function object(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw invalid();}
function text(value,max,{han=false,multiline=false,latin=false}={}){if(typeof value!=='string'||!value.trim()||value.length>max||(multiline?BODY:CONTROL).test(value)||han&&!HAN.test(value)||latin&&!/\p{Script=Latin}/u.test(value))throw invalid();return value;}
function lexical(value){text(value,200);if(value!=='24/7'&&!/\p{Script=Latin}/u.test(value)||HAN.test(value)||/[<>]|javascript\s*:/iu.test(value))throw invalid();return value;}
function integer(value,max,min=0){if(!Number.isSafeInteger(value)||value<min||value>max)throw invalid();}
function list(value,max,min=0){if(!Array.isArray(value)||value.length<min||value.length>max)throw invalid();return value;}
function counts(value){object(value,['heads','examples']);integer(value.heads,MAX_HEADS);integer(value.examples,MAX_PAIRS);if(value.examples<value.heads||(value.heads===0)!==(value.examples===0))throw invalid();}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const rawJson=value=>new TextEncoder().encode(JSON.stringify(value)+'\n');
export async function digest(value){return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',value))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function catalogueBody(value){return {schemaVersion:4,format:FORMAT,base:value.base,source:value.source,counts:value.counts,deltas:value.deltas,keys:value.keys};}
export async function catalogueVersion(value){return digest(new TextEncoder().encode(JSON.stringify(catalogueBody(value))));}
function reference(value,{delta=false}={}){
  object(value,['file','codec','bytes','sha256','decodedBytes','decodedSha256',...(delta?['heads','examples']:[])]);
  if(value.codec!=='gzip'||!isHash(value.sha256)||!isHash(value.decodedSha256)||value.file!==`${delta?'delta-v4':'catalogue-v4'}/${value.sha256}.bin`)throw invalid();
  integer(value.bytes,delta?LIMITS.deltaEncoded:LIMITS.catalogueEncoded,1);integer(value.decodedBytes,delta?LIMITS.deltaDecoded:LIMITS.catalogueDecoded,1);
  if(delta){counts({heads:value.heads,examples:value.examples});integer(value.heads,LIMITS.deltaHeads,1);}
}
export function parseArtifactReference(value,{delta=false}={}){let copy;try{copy=structuredClone(value);}catch{throw invalid();}reference(copy,{delta});return freeze(copy);}
function baseReference(value){
  object(value,['file','bytes','sha256','version','counts']);
  if(value.file!=='manifest-v2.json'||!isHash(value.sha256)||!isHash(value.version))throw invalid();
  integer(value.bytes,524288,1);counts(value.counts);
}
function sourceReference(value){object(value,['version','manifestSha256']);if(!isHash(value.version)||!isHash(value.manifestSha256))throw invalid();}
export async function parseAdditiveCatalogue(payload){
  let value;try{value=structuredClone(payload);}catch{throw invalid();}
  object(value,['schemaVersion','format','version','base','source','counts','deltas','keys']);
  if(value.schemaVersion!==4||value.format!==FORMAT||!isHash(value.version))throw invalid();
  baseReference(value.base);sourceReference(value.source);counts(value.counts);
  list(value.deltas,MAX_DELTAS);
  const paths=new Set(),perDelta=Array(value.deltas.length).fill(0),directory=new Map();let heads=0,examples=0,prior=null;
  for(const delta of value.deltas){reference(delta,{delta:true});if(paths.has(delta.file))throw invalid();paths.add(delta.file);heads+=delta.heads;examples+=delta.examples;}
  for(const tuple of list(value.keys,MAX_HEADS)){
    if(!Array.isArray(tuple)||tuple.length!==2)throw invalid();const[term,index]=tuple;lexical(term);integer(index,MAX_DELTAS-1);
    if(index>=value.deltas.length||prior!==null&&compare(prior,term)>=0)throw invalid();
    directory.set(term,index);perDelta[index]++;prior=term;
  }
  if(directory.size!==heads||perDelta.some((n,i)=>n!==value.deltas[i].heads)||value.counts.heads!==value.base.counts.heads+heads||value.counts.examples!==value.base.counts.examples+examples)throw invalid();
  if(rawJson(value).length>LIMITS.catalogueDecoded||await catalogueVersion(value)!==value.version)throw invalid();
  freeze(value);owned.set(value,{directory});return value;
}
function state(catalogue){const value=owned.get(catalogue);if(!value)throw invalid();return value;}
export function deltaIndex(catalogue,term){lexical(term);return state(catalogue).directory.get(term)??null;}
function learningEntry(row){
  object(row,['term','senses']);lexical(row.term);const ids=new Set();let pairs=0;
  for(const sense of list(row.senses,24,1)){
    object(sense,['id','partOfSpeech','meaningZh','examples','source','reviewer']);
    text(sense.id,120);if(!/^[a-zA-Z0-9:_-]+$/u.test(sense.id)||ids.has(sense.id))throw invalid();ids.add(sense.id);
    text(sense.partOfSpeech,80,{latin:true});text(sense.meaningZh,2000,{han:true,multiline:true});
    if(![SOURCE,SELF_CHECK_SOURCE].includes(sense.source)||!/^AI\/[a-zA-Z0-9_-]{1,100}$/u.test(sense.reviewer))throw invalid();
    for(const pair of list(sense.examples,8,1)){object(pair,['en','zh']);text(pair.en,1200,{latin:true,multiline:true});text(pair.zh,1200,{han:true,multiline:true});pairs++;}
  }
  return pairs;
}
export function parseAdditiveDelta(payload,catalogue,index){
  const ownedState=state(catalogue);integer(index,MAX_DELTAS-1);const descriptor=catalogue.deltas[index];if(!descriptor)throw invalid();
  let value;try{value=structuredClone(payload);}catch{throw invalid();}
  object(value,['schemaVersion','entries']);if(value.schemaVersion!==4)throw invalid();list(value.entries,descriptor.heads,descriptor.heads);
  const rows=new Map();let pairs=0,prior=null;
  for(const row of value.entries){
    object(row,['term','canonicalId','canonicalSourceSha256','example']);lexical(row.term);integer(row.canonicalId,30000000,1);
    if(!isHash(row.canonicalSourceSha256)||row.example?.term!==row.term||prior!==null&&compare(prior,row.term)>=0||ownedState.directory.get(row.term)!==index)throw invalid();
    pairs+=learningEntry(row.example);rows.set(row.term,freeze(row));prior=row.term;
  }
  if(rows.size!==descriptor.heads||pairs!==descriptor.examples)throw invalid();
  // Return an owned getter, never a mutable caller Map used as validation authority.
  return Object.freeze({get(term){lexical(term);return rows.get(term)??null;},heads:rows.size,examples:pairs});
}
async function boundedStream(stream,maximum,signal){
  if(signal?.aborted)throw stop();const reader=stream.getReader(),chunks=[];let bytes=0,complete=false;
  const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',cancel,{once:true});
  try{
    while(true){if(signal?.aborted)throw stop();const {done,value}=await reader.read();if(done){complete=true;break;}if(!(value instanceof Uint8Array))throw invalid();bytes+=value.byteLength;if(bytes>maximum)throw invalid();chunks.push(value);}
  }finally{signal?.removeEventListener('abort',cancel);if(!complete)cancel();reader.releaseLock();}
  if(signal?.aborted)throw stop();const output=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
}
export async function decodeGzipArtifact(raw,descriptor,{delta=false,signal}={}){
  if(signal?.aborted)throw stop();
  // Pin both caller-owned inputs before the first await. Async hashing must not
  // authenticate one byte sequence and subsequently decode a mutated one.
  descriptor=parseArtifactReference(descriptor,{delta});
  if(!(raw instanceof Uint8Array)||raw.byteLength!==descriptor.bytes)throw invalid();
  raw=new Uint8Array(raw);if(await digest(raw)!==descriptor.sha256)throw invalid();
  if(signal?.aborted)throw stop();if(typeof globalThis.DecompressionStream!=='function'){const e=new Error('当前浏览器不支持新的压缩例句资源。');e.code='dictionary_examples_compression_unavailable';throw e;}
  let offset=0;
  const input=new ReadableStream({pull(controller){if(signal?.aborted){controller.error(stop());return;}if(offset===raw.length){controller.close();return;}const next=Math.min(offset+256,raw.length);controller.enqueue(raw.subarray(offset,next));offset=next;}});
  let decoded;
  try{decoded=await boundedStream(input.pipeThrough(new DecompressionStream('gzip')),descriptor.decodedBytes,signal);}catch(error){if(error.name==='AbortError')throw error;throw invalid();}
  if(decoded.length!==descriptor.decodedBytes||await digest(decoded)!==descriptor.decodedSha256)throw invalid();
  if(signal?.aborted)throw stop();
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));}catch{throw invalid();}
}
export const codecInternalsForTests=Object.freeze({learningEntry,FORMAT});
