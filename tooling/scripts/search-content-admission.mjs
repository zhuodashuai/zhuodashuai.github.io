import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';
import {parseAdditiveCatalogue,parseAdditiveDelta} from '../../vocab/js/dictionary-examples-additive-codec.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const normalize=value=>value.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/gu,' ').trim().toLowerCase();
const HEAD=/^[a-z]+(?:'[a-z]+)*(?:[ -][a-z]+(?:'[a-z]+)*)*$/u;
export const isSearchContentHead=value=>typeof value==='string'&&value.length<=200&&HEAD.test(value);

/** Whole surfaces have a single admitted owner. No suffix stripping or alias
 * inference can turn another canonical/form/context key into a new head. */
export function validateSearchContentSurfaces(entries,{canonicalRecords=[],canonicalKeys=[],packagedEntries=[]}={}){
  const proposed=new Map();
  for(const row of entries)for(const surface of[row.term,...row.englishForms]){
    assert(isSearchContentHead(surface),'Invalid complete English head/form: '+surface);
    const key=normalize(surface),owner=proposed.get(key);
    assert(!owner,'Duplicate proposed whole surface: '+surface);proposed.set(key,row.term);
  }
  const conflicts=[];
  for(const record of canonicalRecords)if(proposed.has(normalize(record.term)))conflicts.push({surface:record.term,owner:record.term,kind:'canonical'});
  for(const[key,refs]of canonicalKeys)if(proposed.has(normalize(key)))conflicts.push({surface:key,kind:'canonical/form/context key',refs});
  for(const row of packagedEntries)for(const surface of[row.term,...row.englishForms||[]])
    if(proposed.has(normalize(surface)))conflicts.push({surface,owner:row.term,kind:'packaged canonical/form'});
  assert.deepEqual(conflicts,[],'New source would shadow an existing complete literal/form/context surface');
  return{heads:entries.length,wholeSurfaces:proposed.size};
}

export function createSearchContentExampleCheck(entries){
  const proposed={en:new Map(),zh:new Map()},seen=new Set();let pairs=0;
  for(const row of entries)for(const language of['en','zh']){
    const key=normalize(row[language]);assert(!proposed[language].has(key),'Duplicate proposed '+language+' example');proposed[language].set(key,row.term);
  }
  const visit=(value,owner)=>{
    if(!value||typeof value!=='object')return;
    if(typeof value.term==='string')owner=value.term;
    if(typeof value.en==='string'&&typeof value.zh==='string'){
      const identity=JSON.stringify([owner,value.en,value.zh]);
      if(!seen.has(identity)){seen.add(identity);pairs++;}
      for(const language of['en','zh'])assert(!proposed[language].has(normalize(value[language])),
        'Example duplicates an existing '+language+' sentence: '+owner);
    }
    for(const child of Object.values(value))if(child&&typeof child==='object')visit(child,owner);
  };
  return{visit,get pairs(){return pairs;}};
}

/** Read every active immutable base/delta, including compressed-only examples.
 * This is a compiler-time local audit; no browser cache/provider is involved. */
export async function auditSearchContentAdmissions(root,entries){
  const imported=file=>import(pathToFileURL(join(root,file)).href);
  const [{EVERYDAY_LOOKUP_ENTRIES}, {dictionaryExamplesRelease:release},{SEARCH_EXPERIENCE_ENTRIES}]=await Promise.all([
    imported('vocab/js/everyday-lookup-data.js'),imported('vocab/js/dictionary-examples-release-v4.js'),imported('vocab/js/search-experience-data.js')]);
  const targets=new Set(entries.map(row=>normalize(row.term)));
  for(const row of EVERYDAY_LOOKUP_ENTRIES.filter(row=>targets.has(normalize(row.term)))){
    assert(SEARCH_EXPERIENCE_ENTRIES.some(compiled=>JSON.stringify(compiled)===JSON.stringify(row)),
      'A proposed head already belongs to a different packaged source: '+row.term);
    assert.deepEqual(row,entries.find(entry=>normalize(entry.term)===normalize(row.term)),
      'Current compiled head differs from the newly reviewed row: '+row.term);
  }
  const packaged=EVERYDAY_LOOKUP_ENTRIES.filter(row=>!targets.has(normalize(row.term)));
  const dictionaryRoot=join(root,'vocab/data/expanded-dictionary'),manifestBytes=await readFile(join(dictionaryRoot,'manifest.json'));
  const manifest=JSON.parse(manifestBytes),records=[],keys=[];
  assert.equal(manifest.version,release.source.version);assert.equal(hash(manifestBytes),release.source.manifestSha256);
  assert.equal(manifest.english.shards.length,128);const uniqueIds=new Set();
  for(const descriptor of manifest.english.shards){
    const bytes=await readFile(join(dictionaryRoot,descriptor.file));assert.equal(bytes.length,descriptor.bytes);assert.equal(hash(bytes),descriptor.sha256);
    const shard=JSON.parse(bytes);assert.equal(shard.kind,'en');assert.equal(shard.bucket,descriptor.bucket);
    records.push(...shard.records);keys.push(...shard.keys);for(const row of shard.records)uniqueIds.add(row.id);
  }
  const surfaces=validateSearchContentSurfaces(entries,{canonicalRecords:records,canonicalKeys:keys,packagedEntries:packaged});
  const examples=createSearchContentExampleCheck(entries);examples.visit(packaged);
  // These current overlays can be the only active location of a corrected pair.
  for(const file of['chinese-related-common.js','dictionary-example-corrections-data.js','canonical-example-components-data.js',
    'canonical-example-repairs-data.js','selected-common-sense-data.js','selected-legacy-examples-data.js']){
    examples.visit(await imported('vocab/js/'+file));
  }
  const exampleRoot=join(root,'vocab/data/dictionary-examples');
  const manifestRaw=await readFile(join(exampleRoot,release.base.file));
  assert.equal(manifestRaw.length,release.base.bytes);assert.equal(hash(manifestRaw),release.base.sha256);
  const base=parseDictionaryExamplesManifest(JSON.parse(manifestRaw));assert.equal(base.version,release.base.version);
  let baseHeads=0,basePairs=0;
  for(const descriptor of base.shards){
    const bytes=await readFile(join(exampleRoot,descriptor.file));assert.equal(bytes.length,descriptor.bytes);assert.equal(hash(bytes),descriptor.sha256);
    const parsed=parseDictionaryExamplesShard(JSON.parse(bytes),base,descriptor);
    for(const entry of parsed.values()){
      examples.visit(entry);baseHeads++;basePairs+=entry.senses.reduce((sum,sense)=>sum+sense.examples.length,0);
    }
  }
  assert.equal(baseHeads,release.base.counts.heads);assert.equal(basePairs,release.base.counts.examples);
  const compressed=async descriptor=>{
    const bytes=await readFile(join(exampleRoot,descriptor.file));assert.equal(bytes.length,descriptor.bytes);assert.equal(hash(bytes),descriptor.sha256);
    const decoded=gunzipSync(bytes,{maxOutputLength:descriptor.decodedBytes});
    assert.equal(decoded.length,descriptor.decodedBytes);assert.equal(hash(decoded),descriptor.decodedSha256);return JSON.parse(decoded);
  };
  const catalogue=await parseAdditiveCatalogue(await compressed(release.catalogue));
  assert.deepEqual(catalogue.base,release.base);assert.deepEqual(catalogue.source,release.source);
  let deltaHeads=0,deltaPairs=0;
  for(const[index,descriptor]of catalogue.deltas.entries()){
    const payload=await compressed(descriptor);parseAdditiveDelta(payload,catalogue,index);
    for(const row of payload.entries){examples.visit(row.example);deltaHeads++;deltaPairs+=row.example.senses.reduce((sum,sense)=>sum+sense.examples.length,0);}
  }
  assert.equal(baseHeads+deltaHeads,catalogue.counts.heads);assert.equal(basePairs+deltaPairs,catalogue.counts.examples);
  return{...surfaces,canonicalManifestSha256:hash(manifestBytes),canonicalEnglishShards:128,canonicalUniqueRecords:uniqueIds.size,
    canonicalRecordOccurrences:records.length,canonicalWholeKeys:keys.length,packagedRowsChecked:packaged.length,
    baseManifestSha256:release.base.sha256,baseShards:base.shards.length,baseHeads,basePairs,
    catalogueSha256:release.catalogue.sha256,compressedDeltas:catalogue.deltas.length,deltaHeads,deltaPairs,
    completeImmutableExampleHeads:baseHeads+deltaHeads,completeImmutableExamplePairs:basePairs+deltaPairs,
    distinctPublicExampleContextsChecked:examples.pairs,exampleCollisions:0,literalFormContextCollisions:0};
}
