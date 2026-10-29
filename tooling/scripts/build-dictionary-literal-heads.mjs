import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {searchEverydayDictionary} from '../../vocab/js/everyday-lookup.js';
import {canonicalFold,canonicalSourceBucket} from '../../vocab/js/canonical-example-repair-source.js';

const ROOT=path.resolve(import.meta.dirname,'../..');
const HASH=/^[a-f0-9]{64}$/u;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const bytes=value=>{assert(value instanceof Uint8Array,'Literal source must be bytes');return value;};
const json=value=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(value));

/** Build routing metadata only, never meaning, POS, examples or source approval.
 * Every candidate must own an actual canonical key in the authenticated source.
 * Form/context aliases and incidental copies in other buckets grant nothing. */
export async function buildDictionaryLiteralHeads({manifestBytes,sourcePins,readShard,
  searchEveryday=searchEverydayDictionary}){
  const body=bytes(manifestBytes);
  assert(body.length>0&&body.length<=524288,'Invalid literal source manifest bytes');
  assert(sourcePins&&HASH.test(sourcePins.version)&&HASH.test(sourcePins.manifestSha256),'Invalid literal source pins');
  assert.equal(sha(body),sourcePins.manifestSha256,'Literal source manifest hash mismatch');
  const manifest=json(body);
  assert.equal(manifest.schemaVersion,2,'Invalid literal source schema');
  assert.equal(manifest.version,sourcePins.version,'Literal source version mismatch');
  assert(integer(manifest.counts?.records,0,300000),'Invalid literal source record count');
  assert(integer(manifest.counts?.englishKeys,0,1000000),'Invalid literal source key count');
  assert.equal(manifest.english?.buckets,128,'Literal source requires 128 buckets');
  assert(Array.isArray(manifest.english.shards)&&manifest.english.shards.length===128,'Incomplete literal source shards');
  assert(manifest.sources&&typeof manifest.sources==='object'&&!Array.isArray(manifest.sources),'Missing literal source attribution');
  assert.equal(typeof readShard,'function');assert.equal(typeof searchEveryday,'function');
  const ids=new Set(),terms=new Set(),collisions=[],sourceFiles=[];
  let englishKeys=0,dottedHeads=0;
  for(const [bucket,d]of manifest.english.shards.entries()){
    assert(d&&Object.keys(d).sort().join('|')==='bucket|bytes|count|file|sha256','Invalid literal shard descriptor');
    assert.equal(d.bucket,bucket,'Literal shard bucket mismatch');
    assert.equal(d.file,`${manifest.version}/en-${String(bucket).padStart(3,'0')}.json`,'Invalid literal shard path');
    assert(HASH.test(d.sha256)&&integer(d.bytes,1,8388608)&&integer(d.count,0,200000),'Invalid literal shard bounds');
    const shardBytes=bytes(await readShard(d.file));
    assert.equal(shardBytes.length,d.bytes,'Literal shard byte count mismatch');
    assert.equal(sha(shardBytes),d.sha256,'Literal shard hash mismatch');
    const shard=json(shardBytes);
    assert.equal(shard.schemaVersion,2);assert.equal(shard.kind,'en');assert.equal(shard.bucket,bucket);
    assert(Array.isArray(shard.records)&&Array.isArray(shard.keys),'Invalid literal shard body');
    assert.equal(shard.keys.length,d.count,'Literal shard key count mismatch');
    englishKeys+=shard.keys.length;sourceFiles.push({...d});
    const records=new Map();
    for(const r of shard.records){
      assert(r&&integer(r.id,0,30000000)&&typeof r.term==='string'&&r.term.trim()&&r.term.length<=200,'Invalid literal source record');
      assert(!records.has(r.id),'Duplicate literal shard record ID');records.set(r.id,r);
    }
    const keys=new Set();
    for(const key of shard.keys){
      assert(Array.isArray(key)&&key.length===2&&typeof key[0]==='string'&&Array.isArray(key[1]),'Invalid literal source key');
      assert(!keys.has(key[0]),'Duplicate literal source key');keys.add(key[0]);
      for(const ref of key[1]){
        if(ref?.kind!=='canonical')continue;
        assert.deepEqual(Object.keys(ref).sort(),['id','kind'],'Unexpected canonical reference fields');
        const r=records.get(ref.id);assert(r,'Missing canonical literal owner');
        assert.equal(canonicalFold(r.term),key[0],'Canonical literal key mismatch');
        assert.equal(canonicalSourceBucket(r.term),bucket,'Canonical literal owner bucket mismatch');
        assert.equal(r.id%128,bucket,'Canonical literal ID bucket mismatch');
        assert(Object.hasOwn(manifest.sources,r.source),'Unknown canonical literal source');
        assert(!ids.has(r.id)&&!terms.has(r.term),'Repeated canonical literal ownership');ids.add(r.id);terms.add(r.term);
        if(!r.term.includes('.'))continue;
        dottedHeads++;
        // Bypass the generated defer index while measuring the pre-existing
        // decorated fast match; otherwise a rebuild could erase its own input.
        const fast=await searchEveryday(r.term,{allowDottedFallback:true});
        if(fast==null)continue;
        assert(Array.isArray(fast.results),'Invalid everyday literal probe');
        const chosen=fast.results[0];if(!chosen)continue;
        assert(typeof chosen.term==='string'&&chosen.term.trim(),'Invalid everyday literal head');
        if(canonicalFold(chosen.term)!==canonicalFold(r.term))collisions.push(r.term);
      }
    }
  }
  assert.equal(ids.size,manifest.counts.records,'Incomplete canonical literal inventory');
  assert.equal(englishKeys,manifest.counts.englishKeys,'Incomplete English literal key inventory');
  const heads=Object.freeze(collisions.sort());
  return{heads,canonicalHeads:ids.size,dottedHeads,sourcePins:{version:manifest.version,manifestSha256:sha(body)},sourceFiles};
}

export const renderDictionaryLiteralHeads=heads=>
  '// Generated literal lookup precedence only; this grants no meaning or example permission.\n'
  +'export const LITERAL_DICTIONARY_HEADS = Object.freeze('+JSON.stringify(heads)+');\n';
export const dictionaryLiteralHeadsOutputMatches=(actual,expected)=>
  actual===expected||actual===expected.replaceAll('\n','\r\n');

export async function loadDictionaryLiteralHeadsBuild(){
  const base=path.join(ROOT,'vocab/data/expanded-dictionary');
  const result=await buildDictionaryLiteralHeads({manifestBytes:await fs.readFile(path.join(base,'manifest.json')),
    sourcePins:dictionaryExamplesRelease.source,readShard:file=>fs.readFile(path.join(base,file))});
  return{...result,source:renderDictionaryLiteralHeads(result.heads)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const result=await loadDictionaryLiteralHeadsBuild(),file=path.join(ROOT,'vocab/js/dictionary-literal-heads-data.js');
  if(process.argv.includes('--check'))assert(dictionaryLiteralHeadsOutputMatches(await fs.readFile(file,'utf8'),result.source),'Stale literal lookup precedence data');
  else await fs.writeFile(file,result.source);
  console.log(JSON.stringify({canonicalHeads:result.canonicalHeads,dottedHeads:result.dottedHeads,literalCollisionHeads:result.heads.length,heads:result.heads,sourceShards:result.sourceFiles.length,meaningOrExampleChanges:false,check:process.argv.includes('--check')}));
}
