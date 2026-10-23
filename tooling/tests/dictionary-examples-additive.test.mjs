import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildDictionaryExamples } from '../scripts/build-dictionary-examples.mjs';
import { buildAdditiveExamples, compressExampleArtifact, validateAdditiveIndex, loadCanonicalExampleSources, additiveBuildMode } from '../scripts/build-dictionary-examples-additive.mjs';
import { rawJson, catalogueVersion, parseArtifactReference, parseAdditiveCatalogue, deltaIndex, parseAdditiveDelta, decodeGzipArtifact } from '../../vocab/js/dictionary-examples-additive-codec.js';
import { createAdditiveExamplesLoader } from '../../vocab/js/dictionary-examples-additive.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const sample={term:'sample',partOfSpeech:'noun',meaningZh:'用于检测的样本',en:'The sample arrived safely at the laboratory this morning.',zh:'样本今天早上安全送达实验室。',reviewer:'AI/test-only'};
const other={...sample,term:'other',en:'We stored the other sample in a separate container.',zh:'我们将另一个样本放在单独的容器中。'};
const originalPack={entries:[{headword:'test',review:{status:'checked',reviewer:'AI/previous'},senses:[{id:'test:noun',partOfSpeech:'noun',definitionZh:'测试',examples:[{en:'This test uses no real learning record.',zh:'这项测试不使用真实学习记录。'}]}]}]};
function fixture(rows=[sample]){
  const baseBuild=buildDictionaryExamples({originalPack,knownTerms:['test','sample','other']}),referenceBuild=buildDictionaryExamples({originalPack,authored:rows,knownTerms:['test','sample','other']});
  const baseManifestBytes=baseBuild.files.get('manifest-v2.json'),sourceManifestBytes=rawJson({version:'a'.repeat(64)});
  const index={schemaVersion:1,base:{file:'manifest-v2.json',bytes:baseManifestBytes.length,sha256:sha(baseManifestBytes),version:baseBuild.manifest.version,counts:baseBuild.manifest.counts},
    source:{version:'a'.repeat(64),manifestSha256:sha(sourceManifestBytes)},previousCatalogue:null,releases:[{id:'examples-0032',sourceFiles:['batch-0032-test.json']}]};
  const canonicalRecords=new Map(rows.map((row,i)=>[row.term,{id:i+1,term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaningZh,forms:[],source:'test'}]));
  return {index,baseManifestBytes,sourceManifestBytes,baseBuild,referenceBuild,canonicalRecords,groups:[{id:'examples-0032',rows}]};
}
const build=await buildAdditiveExamples(fixture()),catalogue=await parseAdditiveCatalogue(build.catalogue);
const deltaDescriptor=build.catalogue.deltas[0],deltaBytes=build.files.get(deltaDescriptor.file);
const delta=await decodeGzipArtifact(deltaBytes,deltaDescriptor,{delta:true});

function sourceBucket(term){let hash=2166136261;for(const ch of term.toLowerCase()){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619)>>>0;}return hash%128;}
async function runtimeFixture({sourceChange,releaseChange}={}){
  const input=fixture(),record=input.canonicalRecords.get('sample');record.id=128+sourceBucket(record.term);
  const version='a'.repeat(64),sourceFiles=new Map(),shards=[];
  for(let bucket=0;bucket<128;bucket++){
    const present=bucket===sourceBucket('sample'),payload={schemaVersion:2,kind:'en',bucket,records:present?[structuredClone(record)]:[],keys:present?[['sample',[{id:record.id,kind:'canonical'}]]]:[]};
    if(present)sourceChange?.(payload);
    const raw=Buffer.from(rawJson(payload)),file=`${version}/en-${String(bucket).padStart(3,'0')}.json`;
    sourceFiles.set(file,raw);shards.push({bucket,file,sha256:sha(raw),bytes:raw.length,count:payload.keys.length});
  }
  input.sourceManifestBytes=Buffer.from(rawJson({schemaVersion:2,version,english:{buckets:128,shards}}));
  input.index.source.manifestSha256=sha(input.sourceManifestBytes);
  const build=await buildAdditiveExamples(input),release={catalogue:build.descriptor,base:build.catalogue.base,source:build.catalogue.source};releaseChange?.(release);
  const exampleFiles=new Map([...input.baseBuild.files,...build.files]),requests=[];
  async function fetchImpl(url,options){
    requests.push({url,options});const key=String(url).split('/data/')[1];
    const raw=key?.startsWith('dictionary-examples/')?exampleFiles.get(key.slice('dictionary-examples/'.length))
      :key==='expanded-dictionary/manifest.json'?input.sourceManifestBytes:key?.startsWith('expanded-dictionary/')?sourceFiles.get(key.slice('expanded-dictionary/'.length)):null;
    if(!raw)return new Response('missing',{status:404});return new Response(raw,{headers:{'content-length':String(raw.length)}});
  }
  return {input,build,release,requests,fetchImpl,exampleFiles,sourceFiles};
}

test('new build emits only immutable compressed additions and audit, never a new full snapshot',()=>{
  assert.deepEqual(build.catalogue.counts,{heads:2,examples:2});assert.equal(build.audit.retainedWholeBaseEntries,1);assert.equal(build.audit.addedHeads,1);
  assert.equal(build.files.size,3);assert.ok([...build.files.keys()].every(file=>/^(?:delta-v4|catalogue-v4|audit-v4)\//u.test(file)));
  assert.ok(!build.files.has('manifest-v2.json'));assert.ok(![...build.files.keys()].some(file=>/examples-\d+\.json/u.test(file)));
});
test('normal additive CLI defaults to read-only verification and requires explicit unambiguous write',()=>{
  assert.equal(additiveBuildMode([]),'check');assert.equal(additiveBuildMode(['--check']),'check');assert.equal(additiveBuildMode(['--write']),'write');
  for(const args of [['--check','--write'],['--write','--write'],['--unknown'],['--write=true'],[null]])assert.throws(()=>additiveBuildMode(args));
});
test('browser schema round-trip retains canonical ID, exact whole-source hash and all five reviewed cells',()=>{
  const reader=parseAdditiveDelta(delta,catalogue,0),entry=reader.get('sample');
  assert.equal(entry.canonicalId,1);assert.equal(entry.canonicalSourceSha256,sha(JSON.stringify(fixture().canonicalRecords.get('sample'))));
  assert.deepEqual(entry.example.senses[0].examples,[{en:sample.en,zh:sample.zh}]);assert.equal(deltaIndex(catalogue,'sample'),0);assert.equal(deltaIndex(catalogue,'test'),null);
  assert.ok(Object.isFrozen(entry.example.senses[0].examples[0]));assert.equal(reader.get('other'),null);
});
test('fixed pure-JS gzip output is stable and has a regression checksum',()=>{
  const value={fixture:'Deterministic gzip / 中文 / 2026'},a=compressExampleArtifact(value),b=compressExampleArtifact(value);
  assert.deepEqual(a,b);assert.equal(a.bytes.readUInt32LE(4),0);assert.equal(a.bytes[9],3);
  assert.equal(sha(a.bytes),'5590387f1de33804f7e85d9bd301984ada1d57b0bd527f1ca2ea1d3a11682754');
});
test('all old whole-entry fields must equal the ordinary full reference build',async()=>{
  const input=fixture();input.referenceBuild.entries.find(row=>row.term==='test').senses[0].meaningZh='篡改的释义';
  await assert.rejects(buildAdditiveExamples(input),/Existing whole example entry changed/u);
});
test('unreviewed reference edits, changed base/source, absent canonical source and repeated rows fail',async()=>{
  const changes=[v=>v.groups[0].rows.push({...sample}),v=>v.sourceManifestBytes=rawJson({version:'b'.repeat(64)}),
    v=>v.baseManifestBytes=Buffer.from('{}'),v=>v.canonicalRecords.delete('sample'),v=>v.referenceBuild.entries.find(x=>x.term==='sample').senses[0].examples[0].zh='未复核的内容'];
  for(const change of changes){const input=fixture();change(input);await assert.rejects(buildAdditiveExamples(input));}
});
test('an additive group cannot overwrite a frozen base term',async()=>{
  const input=fixture();input.groups[0].rows=[{...sample,term:'test'}];await assert.rejects(buildAdditiveExamples(input),/overwrite/u);
});
test('ordinary full-reference entries not represented in additions are rejected',async()=>{
  const input=fixture([sample,other]);input.groups[0].rows=[sample];await assert.rejects(buildAdditiveExamples(input),/misses/u);
});
test('unknown or repeated release/source input paths fail closed',()=>{
  for(const change of [v=>v.extra=true,v=>v.releases.push(v.releases[0]),v=>v.releases[0].sourceFiles=['../x.json'],
    v=>v.releases[0].sourceFiles.push(v.releases[0].sourceFiles[0]),v=>v.source.version=['a'.repeat(64)]]){
    const index=fixture().index;change(index);assert.throws(()=>validateAdditiveIndex(index));}
});
test('immutable previous deltas must stay an exact prefix after a new release',async()=>{
  const input=fixture([sample,other]);input.index.releases.push({id:'examples-0033',sourceFiles:['batch-0033-test.json']});
  input.index.previousCatalogue=build.descriptor;
  input.groups=[{id:'examples-0032',rows:[sample]},{id:'examples-0033',rows:[other]}];input.canonicalRecords.get('other').id=2;
  const next=await buildAdditiveExamples({...input,previousCatalogue:build.catalogue});assert.deepEqual(next.catalogue.deltas[0],build.catalogue.deltas[0]);
  const changed=structuredClone(build.catalogue);changed.deltas[0].decodedSha256='0'.repeat(64);changed.version=await catalogueVersion(changed);
  await assert.rejects(buildAdditiveExamples({...input,previousCatalogue:changed}),/previous catalogue pin/u);
  input.index.previousCatalogue=compressExampleArtifact(changed).descriptor;
  await assert.rejects(buildAdditiveExamples({...input,previousCatalogue:changed}),/prefix/u);
});
test('a subsequent release cannot omit its frozen previous catalogue dependency',async()=>{
  const input=fixture([sample,other]);input.index.releases.push({id:'examples-0033',sourceFiles:['batch-0033-test.json']});
  assert.throws(()=>validateAdditiveIndex(input.index),/previous immutable catalogue pin/u);
  input.index.previousCatalogue=build.descriptor;await assert.rejects(buildAdditiveExamples(input),/previous catalogue pin/u);
});
test('forged catalogue handles and caller mutations cannot replace private ownership',async()=>{
  assert.throws(()=>deltaIndex({...catalogue},'sample'));assert.throws(()=>parseAdditiveDelta(delta,structuredClone(catalogue),0));
  const input=structuredClone(build.catalogue),promise=parseAdditiveCatalogue(input);input.keys[0][0]='invented';const owned=await promise;
  assert.equal(deltaIndex(owned,'sample'),0);assert.equal(deltaIndex(owned,'invented'),null);
});
const invalidCatalogue={legacy:v=>v.schemaVersion=2,held:v=>v.schemaVersion=3,unknown:v=>v.extra=true,
  codec:v=>v.deltas[0].codec='deflate',absolute:v=>v.deltas[0].file='https://evil.invalid/x.bin',query:v=>v.deltas[0].file+='?x',
  traversal:v=>v.base.file='../manifest-v2.json',index:v=>v.keys[0][1]=1,missing:v=>v.keys=[],count:v=>v.counts.examples++,
  baseHashArray:v=>v.base.sha256=[v.base.sha256],sourceHashArray:v=>v.source.manifestSha256=[v.source.manifestSha256],
  versionArray:v=>v.source.version=[v.source.version],deltaHashArray:v=>v.deltas[0].sha256=[v.deltas[0].sha256]};
for(const [name,change]of Object.entries(invalidCatalogue))test(`catalogue rejects ${name}`,async()=>{const value=structuredClone(build.catalogue);change(value);await assert.rejects(parseAdditiveCatalogue(value));});
const invalidDelta={schema:v=>v.schemaVersion=2,unknown:v=>v.entries[0].extra=true,sourceHashArray:v=>v.entries[0].canonicalSourceSha256=[v.entries[0].canonicalSourceSha256],
  sourceId:v=>v.entries[0].canonicalId=0,wrongTerm:v=>v.entries[0].example.term='other',reviewer:v=>v.entries[0].example.senses[0].reviewer='unreviewed',
  missing:v=>v.entries=[],control:v=>v.entries[0].example.senses[0].examples[0].en+='\u202e',translation:v=>v.entries[0].example.senses[0].examples[0].zh='No Chinese'};
for(const [name,change]of Object.entries(invalidDelta))test(`delta rejects ${name}`,()=>{const value=structuredClone(delta);change(value);assert.throws(()=>parseAdditiveDelta(value,catalogue,0));});
test('gzip corruptions, truncated stream, bounded zip bomb, fatal UTF8 and non-JSON fail completely',async()=>{
  const damaged=Uint8Array.from(deltaBytes);damaged[15]^=128;await assert.rejects(decodeGzipArtifact(damaged,deltaDescriptor,{delta:true}));
  const truncated=deltaBytes.subarray(0,-1),truncatedHash=sha(truncated);
  await assert.rejects(decodeGzipArtifact(truncated,{...deltaDescriptor,bytes:truncated.length,sha256:truncatedHash,file:`delta-v4/${truncatedHash}.bin`},{delta:true}));
  for(const value of [{x:'A'.repeat(200000)},'not-json']){const artifact=compressExampleArtifact(value);await assert.rejects(decodeGzipArtifact(artifact.bytes,{...artifact.descriptor,decodedBytes:10}));}
  await assert.rejects(decodeGzipArtifact(deltaBytes,{...deltaDescriptor,decodedSha256:'0'.repeat(64)},{delta:true}));
});
test('Node Buffers, typed arrays and descriptor inputs are copied before async hashing',async()=>{
  for(const input of [Buffer.from(deltaBytes),Uint8Array.from(deltaBytes)]){
    const descriptor=structuredClone(deltaDescriptor),promise=decodeGzipArtifact(input,descriptor,{delta:true});input.fill(0);descriptor.decodedBytes=1;assert.deepEqual(await promise,delta);}
});
test('abort before inflate or during the last async hash never reports success',async()=>{
  const before=new AbortController();before.abort();await assert.rejects(decodeGzipArtifact(deltaBytes,deltaDescriptor,{delta:true,signal:before.signal}),{name:'AbortError'});
  const during=new AbortController(),original=globalThis.crypto.subtle.digest;
  globalThis.crypto.subtle.digest=async function(algorithm,input){const result=await original.call(this,algorithm,input);if(input.byteLength===deltaDescriptor.decodedBytes)during.abort();return result;};
  try{await assert.rejects(decodeGzipArtifact(deltaBytes,deltaDescriptor,{delta:true,signal:during.signal}),{name:'AbortError'});}finally{globalThis.crypto.subtle.digest=original;}
});
test('unsupported compression is explicit and artifact descriptors are frozen copies',async()=>{
  const original=globalThis.DecompressionStream;globalThis.DecompressionStream=undefined;
  try{await assert.rejects(decodeGzipArtifact(deltaBytes,deltaDescriptor,{delta:true}),{code:'dictionary_examples_compression_unavailable'});}finally{globalThis.DecompressionStream=original;}
  const input=structuredClone(deltaDescriptor),parsed=parseArtifactReference(input,{delta:true});input.bytes=1;assert.equal(parsed.bytes,deltaBytes.length);assert.ok(Object.isFrozen(parsed));
});
test('pre-additive published manifest and all old formats remain frozen',async()=>{
  const bytes=await readFile(new URL('../../vocab/data/dictionary-examples/manifest-v2.json',import.meta.url));
  assert.equal(sha(bytes),'23846f67b86c43bcd3b5b2e8b36fcf93ef19c63f2ac28ce982e989b3a13557e9');
  assert.equal(JSON.parse(bytes).counts.heads,86415);
});
test('real source loader authenticates repeated form/context records and retains exactly 102609 canonical homes',async()=>{
  const loaded=await loadCanonicalExampleSources();assert.equal(loaded.canonicalRecords.size,102609);
  assert.equal(sha(loaded.sourceManifestBytes),'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f');
  assert.equal(loaded.canonicalRecords.get('cover').id,58880);
});
test('runtime old head reads exactly one base bucket, without downloading a catalogue or scanning the old corpus',async()=>{
  const f=await runtimeFixture(),client=createAdditiveExamplesLoader(f.release,{fetchImpl:f.fetchImpl});
  const entry=await client.load('test');assert.equal(entry.term,'test');assert.equal(f.requests.length,2);
  assert.ok(f.requests.every(item=>!item.url.includes('-v4/')));client.close();
});
test('runtime new head requires exact canonical source ID/hash/key and keeps every selected example field',async()=>{
  const f=await runtimeFixture(),client=createAdditiveExamplesLoader(f.release,{fetchImpl:f.fetchImpl});
  assert.deepEqual(await client.load('sample',{lookupQuery:'sample'}),f.input.referenceBuild.entries.find(row=>row.term==='sample'));
  assert.equal(f.requests.length,6);assert.ok(f.requests.every(({url,options})=>!url.includes('/api/')&&options.credentials==='omit'&&options.redirect==='error'));
  await client.load('sample',{lookupQuery:'sample'});assert.equal(f.requests.length,6);client.close();
});
test('missing query, arbitrary form query or unrelated head never inherit a new canonical example',async()=>{
  for(const lookupQuery of [undefined,'samples','other']){
    const f=await runtimeFixture(),client=createAdditiveExamplesLoader(f.release,{fetchImpl:f.fetchImpl});
    assert.equal(await client.load('sample',{lookupQuery}),null);assert.equal(f.requests.length,2);client.close();}
});
test('runtime rejects wrong canonical source ID, changed full source, noncanonical key or duplicate canonical row',async()=>{
  for(const sourceChange of [v=>v.records[0].id++,v=>v.records[0].meaning+='更改',v=>v.keys[0][1][0].kind='form',v=>v.records.push(v.records[0])]){
    const f=await runtimeFixture({sourceChange}),client=createAdditiveExamplesLoader(f.release,{fetchImpl:f.fetchImpl});
    await assert.rejects(client.load('sample',{lookupQuery:'sample'}));client.close();}
});
test('runtime caller display markers and forged maps are not canonical source authority',async()=>{
  const f=await runtimeFixture({sourceChange:v=>v.keys[0][1][0].kind='form'}),client=createAdditiveExamplesLoader(f.release,{fetchImpl:f.fetchImpl});
  await assert.rejects(client.load('sample',{lookupQuery:'sample',canonical:true,records:new Map([['sample',{verified:true}]])}));client.close();
});
test('runtime exact base absence guard rejects damaged base bucket before any new delta is trusted',async()=>{
  const f=await runtimeFixture(),bucket=dictionaryBucket('sample'),file=f.input.baseBuild.manifest.shards[bucket].file;
  f.exampleFiles.set(file,Buffer.from('{}'));const client=createAdditiveExamplesLoader(f.release,{fetchImpl:f.fetchImpl});
  await assert.rejects(client.load('sample',{lookupQuery:'sample'}));assert.equal(f.requests.length,2);client.close();
});
function dictionaryBucket(term){let hash=2166136261;for(const ch of term){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619)>>>0;}return hash%256;}
test('a cancelled caller does not poison another caller sharing the same immutable read',async()=>{
  const f=await runtimeFixture();let release;const gate=new Promise(resolve=>release=resolve);
  const client=createAdditiveExamplesLoader(f.release,{fetchImpl:async(url,options)=>{if(url.endsWith('manifest-v2.json'))await gate;return f.fetchImpl(url,options);}});
  const controller=new AbortController(),first=client.load('sample',{lookupQuery:'sample',signal:controller.signal}),second=client.load('sample',{lookupQuery:'sample'});
  controller.abort();await assert.rejects(first,{name:'AbortError'});release();assert.equal((await second).term,'sample');assert.equal(f.requests.length,6);client.close();
});
test('an expired caller does not start more optional downloads after its delayed manifest',async()=>{
  const f=await runtimeFixture();let release;const gate=new Promise(resolve=>release=resolve);
  const client=createAdditiveExamplesLoader(f.release,{fetchImpl:async(url,options)=>{if(url.endsWith('manifest-v2.json'))await gate;return f.fetchImpl(url,options);}});
  await assert.rejects(client.load('sample',{lookupQuery:'sample',timeoutMs:1}),{code:'dictionary_examples_timeout'});release();
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.requests.length,1);client.close();
});
test('runtime corrupted cache retry requests reload rather than trusting the same stale bytes',async()=>{
  const f=await runtimeFixture();let damaged=true;
  const client=createAdditiveExamplesLoader(f.release,{fetchImpl:async(url,options)=>{
    if(url.includes('/delta-v4/')&&damaged){damaged=false;f.requests.push({url,options});return new Response('{}');}return f.fetchImpl(url,options);}});
  await assert.rejects(client.load('sample',{lookupQuery:'sample'}));assert.equal((await client.load('sample',{lookupQuery:'sample'})).term,'sample');
  assert.equal(f.requests.filter(item=>item.url.includes('/delta-v4/')).at(-1).options.cache,'reload');client.close();
});
test('runtime release pins cannot contain external URLs or nonstring source hashes',async()=>{
  const f=await runtimeFixture();for(const change of [v=>v.catalogue.file='https://evil.invalid/x.bin',v=>v.source.manifestSha256=[v.source.manifestSha256],v=>v.base.file='../manifest-v2.json']){
    const release=structuredClone(f.release);change(release);assert.throws(()=>createAdditiveExamplesLoader(release,{fetchImpl:f.fetchImpl}));}
  assert.equal(f.requests.length,0);
});
