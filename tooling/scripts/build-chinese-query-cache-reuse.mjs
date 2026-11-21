/** Whole-envelope reuse authorized by a fresh complete ordinary+related replay.
 * This is compiler machinery, not a second runtime source or a cache importer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {compileChineseQueryBundles, renderChineseQueryCacheRelease, deterministicQueryGzip,
  collectCompleteChineseQuery, boundedLocalQueryTransport, fingerprintChineseQueryEngine, selectionSource} from './build-chinese-query-cache.mjs';
import {normalizeChineseQueryCacheQuery, chineseQueryCacheBucket} from '../../vocab/js/chinese-query-cache-format.js';

const HASH=/^[a-f0-9]{64}$/u;
const ORIGIN='941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4';
const ARCHIVE='tooling/dictionary/query-cache-origins/'+ORIGIN+'/release.js';
const ARCHIVE_SHA='ac57572f62c413787165ba041a69e14ee517e19db854adea45cbe10ab64c80ef';
const ARCHIVE_BYTES=449739;
const proofs=new WeakMap(),origins=new WeakMap();
const sha=value=>createHash('sha256').update(value).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const clone=value=>JSON.parse(JSON.stringify(value));
function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
export const chineseQueryPacketDigest=packet=>sha(stable(packet));
const objectSHA=value=>sha(stable(value));
function exact(value,keys){assert(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...keys].sort());}
function limits(value,maximum){assert(Number.isSafeInteger(value)&&value>0&&value<=maximum);}
function descriptor(value,namespace,bucket=false){
  exact(value,bucket?['bucket','file','sha256','bytes','uncompressedBytes']:['query','file','sha256','bytes','uncompressedBytes','total']);
  assert(HASH.test(value.sha256)&&value.file===namespace+'/'+value.sha256+'.bin');
  limits(value.bytes,bucket?1024*1024:256*1024);limits(value.uncompressedBytes,bucket?8*1024*1024:4*1024*1024);
  if(bucket)assert(Number.isInteger(value.bucket)&&value.bucket>=0&&value.bucket<64);
  else assert(Number.isSafeInteger(value.total)&&value.total>=0&&value.total<=200000);
}

/** No eval/import of the archived authoring module. Its original complete raw
 * bytes are fixed; only the exact generated JSON wrapper is parsed. */
export function parseReviewedChineseQueryOrigin(bytes){
  assert(Buffer.isBuffer(bytes)&&bytes.length===ARCHIVE_BYTES&&sha(bytes)===ARCHIVE_SHA,'Unreviewed legacy release bytes');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),marker='export const CHINESE_QUERY_CACHE_RELEASE = freeze(';
  assert.equal(text.split(marker).length,2);assert(text.endsWith(');\n'));
  const release=JSON.parse(text.slice(text.indexOf(marker)+marker.length,-3));
  assert.equal(renderChineseQueryCacheRelease(release),text,'Unreviewed generated release wrapper');
  exact(release,['schemaVersion','dictionaryVersion','sourceManifestSha256','engineBinding','buildVersion','members','buckets','selectionSources']);
  assert.equal(release.schemaVersion,1);assert.equal(release.buildVersion,ORIGIN);
  const origin={buildVersion:release.buildVersion,dictionaryVersion:release.dictionaryVersion,sourceManifestSha256:release.sourceManifestSha256,
    engineBinding:release.engineBinding,releaseFileSha256:sha(bytes),selectionSources:release.selectionSources};
  return {release,origin};
}

/** Every read is bounded, hashed and rooted under the public cache directory;
 * no namespace discovery or unreviewed release fallback is allowed. */
export async function loadReviewedChineseQueryOrigin({root}={}){
  const sourceRoot=await realpath(path.join(root,'tooling/dictionary/query-cache-origins'));
  const sourceFile=path.join(root,ARCHIVE),resolved=await realpath(sourceFile);
  assert.equal(resolved,path.resolve(sourceFile));assert(path.relative(sourceRoot,resolved).startsWith(ORIGIN+path.sep));
  assert.equal((await stat(sourceFile)).size,ARCHIVE_BYTES);
  const parsed=parseReviewedChineseQueryOrigin(await readFile(sourceFile));
  const registry=JSON.parse(await readFile(path.join(sourceRoot,'registry.json'),'utf8'));
  assert.deepEqual(registry,{schemaVersion:1,file:ARCHIVE,sha256:ARCHIVE_SHA,bytes:ARCHIVE_BYTES,origin:parsed.origin},'Unreviewed legacy registry');
  const dataRoot=await realpath(path.join(root,'vocab/data/chinese-query-cache'));
  const read=async desc=>{
    const file=path.resolve(dataRoot,desc.file),actual=await realpath(file);assert.equal(actual,file);
    assert(path.relative(dataRoot,actual).startsWith(ORIGIN+path.sep));
    assert.equal((await stat(file)).size,desc.bytes);
    const bytes=await readFile(file);assert.equal(bytes.length,desc.bytes);assert.equal(sha(bytes),desc.sha256);
    const decoded=gunzipSync(bytes,{maxOutputLength:desc.uncompressedBytes});assert.equal(decoded.length,desc.uncompressedBytes);
    const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));return {bytes,payload};
  };
  const members=new Set(parsed.release.members),entries=new Map(),groups=new Map();
  assert.equal(members.size,parsed.release.members.length);assert.equal(parsed.release.buckets.length,64);
  for(const [bucket,desc]of parsed.release.buckets.entries()){
    descriptor(desc,ORIGIN,true);assert.equal(desc.bucket,bucket);
    const {payload}=await read(desc);exact(payload,['schemaVersion','dictionaryVersion','engineBinding','bucket','entries']);
    assert.equal(payload.schemaVersion,1);assert.equal(payload.dictionaryVersion,parsed.origin.dictionaryVersion);assert.equal(payload.engineBinding,parsed.origin.engineBinding);assert.equal(payload.bucket,bucket);
    assert(Array.isArray(payload.entries)&&payload.entries.length<=50000);
    for(const entry of payload.entries){
      descriptor(entry,ORIGIN);assert.equal(normalizeChineseQueryCacheQuery(entry.query),entry.query);
      assert(members.has(entry.query)&&chineseQueryCacheBucket(entry.query)===bucket&&!entries.has(entry.query));entries.set(entry.query,entry);
      const group=groups.get(entry.file);if(group){assert.equal(group.bucket,bucket);assert.deepEqual({...entry,query:'',total:0},{...group.desc,query:'',total:0});group.queries.add(entry.query);}
      else groups.set(entry.file,{bucket,desc:entry,queries:new Set([entry.query])});
    }
  }
  assert.equal(entries.size,members.size);for(const member of members)assert(entries.has(member));
  const bundles=[];
  for(const group of groups.values()){
    const {bytes,payload}=await read(group.desc);exact(payload,['schemaVersion','dictionaryVersion','engineBinding','packets']);
    assert.equal(payload.schemaVersion,1);assert.equal(payload.dictionaryVersion,parsed.origin.dictionaryVersion);assert.equal(payload.engineBinding,parsed.origin.engineBinding);
    assert(Array.isArray(payload.packets)&&payload.packets.length>0&&payload.packets.length<=16);
    let previous;const siblingSet=new Set();
    for(const packet of payload.packets){
      assert(group.queries.has(packet.query)&&!siblingSet.has(packet.query)&&(!previous||previous<packet.query));
      assert.equal(packet.metadata?.total,entries.get(packet.query).total);assert.equal(packet.results?.length,packet.metadata.total);
      siblingSet.add(packet.query);previous=packet.query;
    }
    assert.deepEqual(siblingSet,group.queries);bundles.push({bucket:group.bucket,desc:clone(group.desc),packets:clone(payload.packets),bytes:Buffer.from(bytes)});
  }
  const token=Object.freeze({});origins.set(token,{origin:clone(parsed.origin),bundles});return token;
}

/** Process-local proof: load the actual root's two exports, never caller-supplied
 * result functions or prospective hashes. The complete source graph and both
 * primary/related full streams are verified before authority is issued. */
export async function replayChineseQueryInputs({root,inputs,onProgress=()=>{}}={}){
  assert(Array.isArray(inputs)&&inputs.length<=100000&&new Set(inputs).size===inputs.length);
  inputs=[...inputs];
  for(const input of inputs)assert(normalizeChineseQueryCacheQuery(input)!==null);
  const manifestFile=path.join(root,'vocab/data/expanded-dictionary/manifest.json'),manifestBytes=await readFile(manifestFile),manifest=JSON.parse(manifestBytes);
  const selected=await selectionSource(root),sourceManifestSha256=sha(manifestBytes);
  assert.equal(selected.payload.source.sha256,manifest.sources.mit.sha256);
  const before=await fingerprintChineseQueryEngine({root,sourceManifestSha256,selectionSources:selected.selectionSources});
  assert.equal(before.markerValue,before.engineBinding,'Replay requires the frozen current engine marker');
  const module=await import(pathToFileURL(path.join(root,'vocab/js/expanded-dictionary.js')).href+'?queryCacheReplay='+before.engineBinding);
  assert.equal(typeof module.searchExpandedDictionary,'function');assert.equal(typeof module.searchRelatedChineseDictionary,'function');
  const transport=await boundedLocalQueryTransport(root),packets=new Map(),proofHash=createHash('sha256');
  let completed=0;
  for(const query of inputs){
    const packet=await collectCompleteChineseQuery(query,{search:module.searchExpandedDictionary,fetchImpl:transport.fetchImpl});
    const related=await collectCompleteChineseQuery(query,{search:module.searchRelatedChineseDictionary,fetchImpl:transport.fetchImpl});
    assert.deepEqual(related,{query:packet.query,metadata:{...packet.metadata,total:packet.results.filter(row=>row.matchType==='related').length},results:packet.results.filter(row=>row.matchType==='related')},'Original related API disagrees: '+query);
    // This digest is generated only AFTER actual ordinary and related responses
    // passed complete pagination and equality. It does not hash stdout or a
    // caller's declared expected projection in lieu of executing that API.
    proofHash.update(stable({input:query,ordinary:packet,related})+'\n');
    const previous=packets.get(packet.query);if(previous)assert.deepEqual(previous,packet);else packets.set(packet.query,clone(packet));
    if(++completed%250===0)onProgress({completed,inputs:inputs.length,queries:packets.size});
  }
  const after=await fingerprintChineseQueryEngine({root,sourceManifestSha256,selectionSources:selected.selectionSources});
  assert.deepEqual(after,before,'Engine changed during actual source replay');assert((await readFile(manifestFile)).equals(manifestBytes));
  assert.equal(sha(await readFile(path.join(root,'vocab/data/ecdict-core.json'))),selected.selectionSources[0].sha256);
  const context={dictionaryVersion:manifest.version,sourceManifestSha256,engineBinding:before.engineBinding,selectionSources:selected.selectionSources};
  const sourceCompiled=compileChineseQueryBundles({...context,packets:[...packets.values()]});
  const authorization={kind:'complete-source-and-related-replay',currentSourceCompileBuildVersion:sourceCompiled.release.buildVersion,
    currentSourceCompileEngineBinding:before.engineBinding,currentSourceCompileReleaseSha256:sha(renderChineseQueryCacheRelease(sourceCompiled.release)),
    fullSourceAndRelatedCheckLogSha256:proofHash.digest('hex')};
  // The v1 namespace/release is compilation evidence only. Do not retain or
  // publish its otherwise unused complete gzip generation for schema2.
  const token=Object.freeze({});proofs.set(token,{context,packets,sourceCompiled:{release:sourceCompiled.release,excluded:sourceCompiled.excluded},authorization});return token;
}

/** Only whole old bundles whose EVERY sibling equals the newly replayed packet
 * may survive. Changed siblings force all unchanged neighbours into the delta. */
export function compileChineseQueryReuse({proof,origin}={}){
  const verified=proofs.get(proof),legacy=origins.get(origin);
  assert(verified&&legacy,'Actual source replay and reviewed legacy provenance are required');
  const {context,packets,sourceCompiled,authorization}=verified,members=new Set(sourceCompiled.release.members),reused=new Map(),groups=[];
  for(const bundle of legacy.bundles){
    if(!bundle.packets.every(packet=>members.has(packet.query)&&isDeepStrictEqual(packets.get(packet.query),packet)))continue;
    groups.push(bundle);for(const packet of bundle.packets){assert(!reused.has(packet.query));reused.set(packet.query,bundle);}
  }
  const delta=compileChineseQueryBundles({...context,packets:[...packets.values()].filter(packet=>members.has(packet.query)&&!reused.has(packet.query))});
  assert.equal(delta.excluded.length,0,'Repacking a source-admitted singleton must not lose coverage');
  const catalogue=[];
  for(const group of groups)for(const packet of group.packets)catalogue.push({query:packet.query,origin:legacy.origin.buildVersion,sha256:group.desc.sha256,
    bytes:group.desc.bytes,uncompressedBytes:group.desc.uncompressedBytes,total:packet.results.length,packetSha256:chineseQueryPacketDigest(packet)});
  const deltaBundles=new Map();
  for(const [file,bytes]of delta.files){
    const payload=JSON.parse(gunzipSync(bytes));if(!payload.packets)continue;
    const sha256=sha(bytes),uncompressedBytes=gunzipSync(bytes).length;
    deltaBundles.set(sha256,bytes);
    for(const packet of payload.packets)catalogue.push({query:packet.query,origin:'current',sha256,bytes:bytes.length,uncompressedBytes,total:packet.results.length,packetSha256:chineseQueryPacketDigest(packet)});
  }
  catalogue.sort((a,b)=>compare(a.query,b.query));assert.deepEqual(catalogue.map(row=>row.query),sourceCompiled.release.members);
  const legacyOrigins=[clone(legacy.origin)];
  const buildVersion=objectSHA({schemaVersion:2,...context,legacyOrigins,authorization,catalogue});
  const files=new Map(),entries=Array.from({length:64},()=>[]);
  for(const [sha256,bytes]of deltaBundles)files.set(buildVersion+'/'+sha256+'.bin',bytes);
  for(const row of catalogue){const {origin:namespace,...desc}=row;entries[chineseQueryCacheBucket(row.query)].push({...desc,file:(namespace==='current'?buildVersion:namespace)+'/'+desc.sha256+'.bin'});}
  const buckets=entries.map((items,bucket)=>{
    const compressed=deterministicQueryGzip({schemaVersion:2,dictionaryVersion:context.dictionaryVersion,engineBinding:context.engineBinding,bucket,entries:items});
    assert(compressed.bytes.length<=1024*1024&&compressed.uncompressedBytes<=8*1024*1024);
    const file=buildVersion+'/'+compressed.sha256+'.bin';files.set(file,compressed.bytes);
    return {bucket,file,sha256:compressed.sha256,bytes:compressed.bytes.length,uncompressedBytes:compressed.uncompressedBytes};
  });
  // Never expose the private replay context/proof through a mutable build DTO.
  const release=clone({schemaVersion:2,...context,buildVersion,members:sourceCompiled.release.members,buckets,legacyOrigins,authorization});
  return {release,files,excluded:clone(sourceCompiled.excluded),bundles:groups.length+deltaBundles.size,
    reuse:{legacyBundles:groups.length,legacyQueries:reused.size,deltaBundles:deltaBundles.size,deltaQueries:delta.release.members.length}};
}
