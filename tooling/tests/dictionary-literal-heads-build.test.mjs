import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildDictionaryLiteralHeads,loadDictionaryLiteralHeadsBuild,renderDictionaryLiteralHeads,
  dictionaryLiteralHeadsOutputMatches} from '../scripts/build-dictionary-literal-heads.mjs';
import {canonicalFold,canonicalSourceBucket} from '../../vocab/js/canonical-example-repair-source.js';
import {LITERAL_DICTIONARY_HEADS} from '../../vocab/js/dictionary-literal-heads-data.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value));
function fixture({terms=['Foo.','Bar.','plain'],mutate}={}){
  const version='a'.repeat(64),shards=Array.from({length:128},(_,bucket)=>({schemaVersion:2,kind:'en',bucket,records:[],keys:[]}));
  for(const [i,term]of terms.entries()){
    const bucket=canonicalSourceBucket(term),record={id:(i+1)*128+bucket,term,partOfSpeech:'noun',meaning:'fixture only',forms:[],source:'test'};
    shards[bucket].records.push(record);shards[bucket].keys.push([canonicalFold(term),[{id:record.id,kind:'canonical'}]]);
  }
  if(mutate)mutate(shards);
  const files=new Map(),descriptors=shards.map((s,bucket)=>{const file=`${version}/en-${String(bucket).padStart(3,'0')}.json`,b=encode(s);files.set(file,b);return{bucket,file,sha256:sha(b),bytes:b.length,count:s.keys.length};});
  const manifest={schemaVersion:2,version,counts:{records:terms.length,englishKeys:shards.reduce((n,s)=>n+s.keys.length,0)},sources:{test:{name:'Fixture'}},english:{buckets:128,shards:descriptors}},manifestBytes=encode(manifest);
  return{manifest,manifestBytes,sourcePins:{version,manifestSha256:sha(manifestBytes)},files,
    readShard:async file=>{assert(files.has(file));return files.get(file);}};
}
const build=(f,searchEveryday)=>buildDictionaryLiteralHeads({...f,searchEveryday});
const none=()=>null;

test('literal precedence builder detects a generic decorated collision, not a hardcoded month',async()=>{
  const f=fixture(),calls=[];
  const result=await build(f,(term,options)=>{calls.push([term,options]);return{results:[{term:term==='Foo.'?'FOO':'BAR.'}]};});
  assert.deepEqual(result.heads,['Foo.']);assert(Object.isFrozen(result.heads));
  assert.deepEqual(calls.map(([term])=>term).sort(),['Bar.','Foo.']);
  assert(calls.every(([,options])=>options.allowDottedFallback===true));
  assert.equal(result.canonicalHeads,3);assert.equal(result.sourceFiles.length,128);
});

test('only actual canonical dotted ownership counts; form aliases and incidental copies do not',async()=>{
  const f=fixture({terms:['Base'],mutate:shards=>{
    const owner=shards.find(s=>s.records.length).records[0],bucket=canonicalSourceBucket('Alias.');
    if(!shards[bucket].records.some(r=>r.id===owner.id))shards[bucket].records.push({...owner});
    shards[bucket].keys.push(['alias.',[{id:owner.id,kind:'form'}]]);
  }});
  let called=0;const result=await build(f,()=>{called++;return{results:[{term:'other'}]};});
  assert.deepEqual(result.heads,[]);assert.equal(called,0);assert.equal(result.canonicalHeads,1);
});

test('same folded dotted head, absent fast match and ordinary undotted heads are not deferred',async()=>{
  const f=fixture({terms:['Same.','None.','past','data']});
  const result=await build(f,term=>term==='Same.'?{results:[{term:'SAME.'}]}:null);
  assert.deepEqual(result.heads,[]);assert.equal(result.dottedHeads,2);
});

test('literal collision inventory is deterministic and measures the allow-fallback path on rebuild',async()=>{
  const f=fixture({terms:['Zulu.','Alpha.']});
  const search=(term,{allowDottedFallback})=>allowDottedFallback?{results:[{term:term.slice(0,-1)}]}:null;
  const first=await build(f,search),second=await build(f,search);
  assert.deepEqual(first.heads,['Alpha.','Zulu.']);assert.equal(renderDictionaryLiteralHeads(first.heads),renderDictionaryLiteralHeads(second.heads));
});

test('literal builder rejects changed manifest bytes before reading any source shard',async()=>{
  const f=fixture();let reads=0;
  await assert.rejects(buildDictionaryLiteralHeads({...f,manifestBytes:Buffer.concat([f.manifestBytes,Buffer.from(' ')]),readShard:()=>{reads++;throw Error('must not read');},searchEveryday:none}),/manifest hash/);
  assert.equal(reads,0);
});

test('literal builder rejects changed shard bytes and same-size corrupt shard hashes',async()=>{
  for(const sameSize of [false,true]){
    const f=fixture(),file=f.manifest.english.shards[0].file,b=f.files.get(file);
    f.files.set(file,sameSize?Buffer.from(b.toString().replace('"en"','"xx"')):Buffer.concat([b,Buffer.from(' ')]));
    await assert.rejects(build(f,none),sameSize?/shard hash/:/byte count/);
  }
});

test('literal builder rejects missing canonical owners and malformed canonical ownership',async()=>{
  for(const mutate of [
    shards=>{const s=shards.find(s=>s.records.length);s.keys[0][1][0].id=999999;},
    shards=>{const s=shards.find(s=>s.records.length);s.keys[0][0]='not-the-owner';},
    shards=>{const s=shards.find(s=>s.records.length);s.keys[0][1].push({...s.keys[0][1][0]});},
    shards=>{const s=shards.find(s=>s.records.length);s.keys[0][1][0].extra='not-authenticated-owner';},
  ])await assert.rejects(build(fixture({mutate}),none));
});

test('literal builder rejects source path, bucket, count and unknown-source inconsistencies',async()=>{
  for(const change of [
    f=>{f.manifest.english.shards[0].file='../outside.json';},
    f=>{f.manifest.english.shards[0].bucket=1;},
    f=>{f.manifest.counts.records++;},
    f=>{f.manifest.counts.englishKeys++;},
    f=>{delete f.manifest.sources.test;},
  ]){
    const f=fixture();change(f);f.manifestBytes=encode(f.manifest);f.sourcePins.manifestSha256=sha(f.manifestBytes);
    await assert.rejects(build(f,none));
  }
});

test('literal builder does not silently ignore malformed decorated matcher output',async()=>{
  await assert.rejects(build(fixture(),()=>({results:'not-a-list'})),/everyday literal probe/);
  await assert.rejects(build(fixture(),()=>({results:[{meaning:'missing head'}]})),/everyday literal head/);
});

test('generated literal routing module has no meaning grants and accepts only complete LF/CRLF transports',()=>{
  const source=renderDictionaryLiteralHeads(['Foo.']);assert.match(source,/LITERAL_DICTIONARY_HEADS/);
  assert.doesNotMatch(source,/partOfSpeech|meaningZh|canonicalId|reviewer|examples/);
  assert(dictionaryLiteralHeadsOutputMatches(source,source));assert(dictionaryLiteralHeadsOutputMatches(source.replaceAll('\n','\r\n'),source));
  assert(!dictionaryLiteralHeadsOutputMatches(source+' ',source));assert(!dictionaryLiteralHeadsOutputMatches(source.replace('\n','\r\n'),source));
});

test('released 102609-head source rebuilds exactly the finite Apr. collision index',async()=>{
  const result=await loadDictionaryLiteralHeadsBuild();assert.equal(result.canonicalHeads,102609);assert.equal(result.sourceFiles.length,128);
  assert.deepEqual(result.heads,['Apr.']);assert.deepEqual(LITERAL_DICTIONARY_HEADS,result.heads);assert(Object.isFrozen(LITERAL_DICTIONARY_HEADS));
  const actual=await readFile(new URL('../../vocab/js/dictionary-literal-heads-data.js',import.meta.url),'utf8');
  assert(dictionaryLiteralHeadsOutputMatches(actual,result.source));
});
