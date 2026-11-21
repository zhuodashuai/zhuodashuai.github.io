import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parseReviewedChineseQueryOrigin,loadReviewedChineseQueryOrigin,replayChineseQueryInputs,compileChineseQueryReuse,chineseQueryPacketDigest} from '../scripts/build-chinese-query-cache-reuse.mjs';
import {fingerprintChineseQueryEngine,zeroEngineMarker,ZERO_ENGINE_BINDING} from '../scripts/build-chinese-query-cache.mjs';

const root=path.resolve(import.meta.dirname,'../..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const originalReleaseBytes=await readFile(path.join(root,'tooling/dictionary/query-cache-origins/941690147b97bfd319bda06acf260e0d2c68968f96d44e67d68c43926ef7e8b4/release.js'));
const original=parseReviewedChineseQueryOrigin(originalReleaseBytes),dataRoot=path.join(root,'vocab/data/chinese-query-cache');
const temp=await mkdtemp(path.join(tmpdir(),'query-reuse-real-source-'));
after(async()=>{assert(path.relative(path.resolve(tmpdir()),temp).startsWith('query-reuse-real-source-'));await rm(temp,{recursive:true,force:true});});
const originalToken=await loadReviewedChineseQueryOrigin({root});
const groups=[];
for(const bucket of original.release.buckets){
  const value=JSON.parse(gunzipSync(await readFile(path.join(dataRoot,bucket.file))));
  const seen=new Set();for(const entry of value.entries){if(seen.has(entry.file))continue;seen.add(entry.file);if(entry.bytes>12000)continue;
    const bundle=JSON.parse(gunzipSync(await readFile(path.join(dataRoot,entry.file))));if(bundle.packets.length!==16||!bundle.packets.every(packet=>packet.results.length>0))continue;
    groups.push(bundle);if(groups.length===2)break;}if(groups.length===2)break;
}
assert.equal(groups.length,2);const oldPackets=groups.flatMap(group=>group.packets),inputs=oldPackets.map(packet=>packet.query),changedQuery=groups[1].packets[0].query;
let fixtureRoot,latestBinding;
async function fixture(mode='ordinary'){
  if(!fixtureRoot){fixtureRoot=path.join(temp,'actual-engine');await mkdir(path.join(fixtureRoot,'vocab'),{recursive:true});
    await cp(path.join(root,'vocab/js'),path.join(fixtureRoot,'vocab/js'),{recursive:true});
    await writeFile(path.join(fixtureRoot,'package.json'),'{"type":"module"}\n');
    await symlink(path.join(root,'vocab/data'),path.join(fixtureRoot,'vocab/data'),'junction');
    await cp(path.join(fixtureRoot,'vocab/js/expanded-dictionary.js'),path.join(fixtureRoot,'vocab/js/original-expanded.js'));
  }
  // A controlled source fixture wraps the real unchanged production engine.
  // Only its own temporary, content-bound graph is altered; repository modules,
  // production marker/release and all data assets are never written.
  const source=`import {searchExpandedDictionary as ordinary,searchRelatedChineseDictionary as related} from './original-expanded.js';
export const CHINESE_QUERY_ENGINE_BINDING = '${ZERO_ENGINE_BINDING}';
export const calls=[];
const change=(query,page)=>${JSON.stringify(mode)}==='changed'&&query===${JSON.stringify(changedQuery)}?{...page,results:page.results.map(row=>({...row,meaning:row.meaning+'（测试源新义项）'}))}:page;
export async function searchExpandedDictionary(query,options){calls.push({kind:'ordinary',query,cache:options.useChineseQueryCache});return change(query,await ordinary(query,options));}
export async function searchRelatedChineseDictionary(query,options){calls.push({kind:'related',query,cache:options.useChineseQueryCache});const page=await related(query,options);return ${JSON.stringify(mode)}==='invalid-related'?{...page,coverage:'basic'}:change(query,page);}
`;
  const file=path.join(fixtureRoot,'vocab/js/expanded-dictionary.js');await writeFile(file,source);
  const manifestBytes=await readFile(path.join(root,'vocab/data/expanded-dictionary/manifest.json'));
  const binding=await fingerprintChineseQueryEngine({root:fixtureRoot,sourceManifestSha256:sha(manifestBytes),selectionSources:original.release.selectionSources});
  assert.equal(zeroEngineMarker(source).value,ZERO_ENGINE_BINDING);await writeFile(file,source.replace(ZERO_ENGINE_BINDING,binding.engineBinding));latestBinding=binding.engineBinding;
  return fixtureRoot;
}
async function actualReader(compiled){
  let source=await readFile(path.join(root,'vocab/js/chinese-query-cache.js'),'utf8');const assetRoot=pathToFileURL(dataRoot+path.sep);
  for(const [before,after]of [
    ["import { CHINESE_QUERY_CACHE_RELEASE } from './chinese-query-cache-release.js?v=125';",'const CHINESE_QUERY_CACHE_RELEASE = '+JSON.stringify(compiled.release)+';'],
    ["'./chinese-query-cache-format.js?v=118'",JSON.stringify(pathToFileURL(path.join(root,'vocab/js/chinese-query-cache-format.js')).href)],
    ["new URL('../data/chinese-query-cache/', import.meta.url)",'new URL('+JSON.stringify(assetRoot.href)+')']]){assert.equal(source.split(before).length,2);source=source.replace(before,after);}
  const reader=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+Math.random()),requests=[];
  const fetchImpl=async(input,options)=>{const url=new URL(input);assert.equal(url.protocol,'file:');assert(url.href.startsWith(assetRoot.href));assert.equal(options.credentials,'omit');
    const file=url.href.slice(assetRoot.href.length);assert.match(file,/^[a-f0-9]{64}\/[a-f0-9]{64}\.bin$/u);requests.push(file);
    return new Response(compiled.files.get(file)??await readFile(path.join(dataRoot,file)));};
  return {reader,requests,fetchImpl};
}

test('only original reviewed941 raw release and exact wrapper parse; no namespace scanning or eval',()=>{
  assert.equal(sha(originalReleaseBytes),'ac57572f62c413787165ba041a69e14ee517e19db854adea45cbe10ab64c80ef');assert.equal(originalReleaseBytes.length,449739);
  for(const bytes of [Buffer.concat([originalReleaseBytes,Buffer.from('\n')]),Buffer.from(originalReleaseBytes.toString().replace('schemaVersion','otherVersion')),Buffer.from('throw Error("not a release")')])assert.throws(()=>parseReviewedChineseQueryOrigin(bytes));
  assert.equal(original.origin.releaseFileSha256,sha(originalReleaseBytes));assert.deepEqual(original.origin.selectionSources,original.release.selectionSources);
});
test('private replay/origin capabilities reject invented metadata, copied proof and claimed stdout hash',()=>{
  for(const proof of [{},{authorization:{fullSourceAndRelatedCheckLogSha256:'f'.repeat(64)}},Object.freeze({})])assert.throws(()=>compileChineseQueryReuse({proof,origin:originalToken}),/Actual source replay/u);
  assert.throws(()=>compileChineseQueryReuse({proof:originalToken,origin:originalToken}));
});
test('real complete source + actual related APIs authorize unchanged whole941 bundles and reader full DTO parity',async()=>{
  const newQuery='不存在的独立测试短语';assert(!original.release.members.includes(newQuery));
  const fixturePath=await fixture(),proof=await replayChineseQueryInputs({root:fixturePath,inputs:[...inputs,newQuery]}),compiled=compileChineseQueryReuse({proof,origin:originalToken});
  assert.equal(compiled.release.schemaVersion,2);assert.equal(compiled.release.engineBinding,latestBinding);assert.deepEqual(compiled.reuse,{legacyBundles:2,legacyQueries:32,deltaBundles:1,deltaQueries:1});
  assert.equal(compiled.files.size,65);assert.equal(compiled.release.legacyOrigins[0].buildVersion,original.release.buildVersion);
  assert.deepEqual(compiled.release.legacyOrigins[0],original.origin);assert.equal(compiled.release.authorization.kind,'complete-source-and-related-replay');
  const module=await import(pathToFileURL(path.join(fixturePath,'vocab/js/expanded-dictionary.js')).href+'?queryCacheReplay='+latestBinding);
  for(const input of inputs){assert(module.calls.some(call=>call.kind==='ordinary'&&call.query===input&&call.cache===false));assert(module.calls.some(call=>call.kind==='related'&&call.query===input&&call.cache===false));}
  const {reader,fetchImpl,requests}=await actualReader(compiled);
  try{for(const expected of oldPackets){const actual=await reader.readChineseQueryPacket(expected.query,{manifest:{version:compiled.release.dictionaryVersion,integritySha256:compiled.release.sourceManifestSha256},engineBinding:latestBinding,fetchImpl});
    assert.deepEqual(actual,{metadata:expected.metadata,results:expected.results});}
    assert.equal(requests.filter(file=>file.startsWith(original.release.buildVersion+'/')).length,2);
    const actual=await reader.readChineseQueryPacket(newQuery,{manifest:{version:compiled.release.dictionaryVersion,integritySha256:compiled.release.sourceManifestSha256},engineBinding:latestBinding,fetchImpl});
    assert.deepEqual(actual,{metadata:{query:newQuery,total:0,ranking:'global',relatedIntegrated:true},results:[]});
  }finally{reader.resetChineseQueryPacketCacheForTests();}
  assert.throws(()=>compileChineseQueryReuse({proof:{...proof},origin:originalToken}));assert.throws(()=>compileChineseQueryReuse({proof,origin:{...originalToken}}));
  const expected=structuredClone(compiled.release);compiled.release.authorization.kind='forged';compiled.release.selectionSources[0].sha256='f'.repeat(64);
  compiled.release.legacyOrigins[0].selectionSources[0].sha256='f'.repeat(64);compiled.release.members.length=0;
  const second=compileChineseQueryReuse({proof,origin:originalToken});assert.deepEqual(second.release,expected);assert.deepEqual(second.files,compiled.files);
});
test('one changed full-source sibling excludes its WHOLE legacy bundle; unchanged neighbours are repacked as current delta',async()=>{
  const fixturePath=await fixture('changed'),proof=await replayChineseQueryInputs({root:fixturePath,inputs}),compiled=compileChineseQueryReuse({proof,origin:originalToken});
  assert.deepEqual(compiled.reuse,{legacyBundles:1,legacyQueries:16,deltaBundles:1,deltaQueries:16});assert.equal(compiled.files.size,65);
  const descriptors=[];for(const desc of compiled.release.buckets){const bucket=JSON.parse(gunzipSync(compiled.files.get(desc.file)));assert.equal(bucket.schemaVersion,2);descriptors.push(...bucket.entries);}
  for(const old of groups[1].packets){const entry=descriptors.find(row=>row.query===old.query);assert(entry.file.startsWith(compiled.release.buildVersion+'/'));assert.equal(entry.packetSha256===chineseQueryPacketDigest(old),old.query!==changedQuery);}
  for(const old of groups[0].packets)assert(descriptors.find(row=>row.query===old.query).file.startsWith(original.release.buildVersion+'/'));
  const {reader,fetchImpl}=await actualReader(compiled);
  try{const actual=await reader.readChineseQueryPacket(changedQuery,{manifest:{version:compiled.release.dictionaryVersion,integritySha256:compiled.release.sourceManifestSha256},engineBinding:latestBinding,fetchImpl});
    const expected=groups[1].packets[0];assert.deepEqual(actual.results,expected.results.map(row=>({...row,meaning:row.meaning+'（测试源新义项）'})));
  }finally{reader.resetChineseQueryPacketCacheForTests();}
});
test('actual related helper failure cannot issue a proof or authorize reuse; stale graph marker also rejects',async()=>{
  const fixturePath=await fixture('invalid-related');await assert.rejects(replayChineseQueryInputs({root:fixturePath,inputs:[inputs[0]]}),/Partial results/u);
  const file=path.join(fixturePath,'vocab/js/expanded-dictionary.js'),source=await readFile(file,'utf8');await writeFile(file,source.replace(latestBinding,ZERO_ENGINE_BINDING));
  await assert.rejects(replayChineseQueryInputs({root:fixturePath,inputs:[inputs[0]]}),/frozen current engine marker/u);
});
