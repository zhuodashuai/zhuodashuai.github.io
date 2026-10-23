import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'fflate';
import { loadExampleBuild, validateExampleReview, validateExampleSourceIndex } from './build-dictionary-examples.mjs';
import { rawJson, catalogueVersion, parseArtifactReference, parseAdditiveCatalogue,
  parseAdditiveDelta, decodeGzipArtifact, LIMITS } from '../../vocab/js/dictionary-examples-additive-codec.js';

const ROOT=resolve(import.meta.dirname,'../..');
const sha=value=>createHash('sha256').update(value).digest('hex');
const order=(a,b)=>a<b?-1:a>b?1:0;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
function homeBucket(term){const key=term.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US');let hash=2166136261;for(const ch of key){hash^=ch.codePointAt(0);hash=Math.imul(hash,16777619)>>>0;}return hash%128;}
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==[...keys].sort().join())throw Error('Invalid additive build input');}

// Pure JS, exact pinned version and fixed timestamp: no OS/zlib-version-dependent
// recompression of immutable deltas. The browser does not import this dependency.
export function compressExampleArtifact(payload,{delta=false,heads=0,examples=0}={}){
  const raw=rawJson(payload),encoded=gzipSync(raw,{level:9,mem:8,mtime:0});
  const sha256=sha(encoded), descriptor={file:`${delta?'delta-v4':'catalogue-v4'}/${sha256}.bin`,codec:'gzip',
    bytes:encoded.byteLength,sha256,decodedBytes:raw.byteLength,decodedSha256:sha(raw),...(delta?{heads,examples}:{})};
  return {descriptor:parseArtifactReference(descriptor,{delta}),bytes:Buffer.from(encoded),raw};
}

export function validateAdditiveIndex(index){
  exact(index,['schemaVersion','base','source','previousCatalogue','releases']);if(index.schemaVersion!==1||!Array.isArray(index.releases)||!index.releases.length||index.releases.length>128)throw Error('Invalid additive index');
  exact(index.base,['file','bytes','sha256','version','counts']);exact(index.source,['version','manifestSha256']);
  if(index.base.file!=='manifest-v2.json'||!hash(index.base.sha256)||!hash(index.base.version)||!hash(index.source.version)||!hash(index.source.manifestSha256))throw Error('Invalid additive base/source pin');
  if(index.previousCatalogue!==null)parseArtifactReference(index.previousCatalogue);
  if(index.releases.length>1&&index.previousCatalogue===null)throw Error('An append requires the previous immutable catalogue pin');
  const names=new Set(),files=new Set();
  for(const release of index.releases){
    exact(release,['id','sourceFiles']);if(typeof release.id!=='string'||!/^examples-\d{4}$/u.test(release.id)||names.has(release.id))throw Error('Repeated or invalid additive release');names.add(release.id);
    validateExampleSourceIndex({schemaVersion:1,sourceFiles:release.sourceFiles});
    for(const file of release.sourceFiles){if(files.has(file))throw Error('Repeated additive source file');files.add(file);}
  }
  return structuredClone(index);
}

/** Build only additions, while comparing against the ordinary complete build.
 * Neither a caller's existing Map nor a synthetic coverage count is authority.
 * canonicalRecords and referenceBuild are constructed by the normal CLI below.
 */
export async function buildAdditiveExamples({index,baseManifestBytes,sourceManifestBytes,baseBuild,referenceBuild,canonicalRecords,groups,previousCatalogue=null}){
  index=validateAdditiveIndex(index);
  if(index.previousCatalogue===null&&previousCatalogue!==null||index.previousCatalogue!==null&&(!previousCatalogue||sha(rawJson(previousCatalogue))!==index.previousCatalogue.decodedSha256))throw Error('Missing or changed previous catalogue pin');
  if(sha(baseManifestBytes)!==index.base.sha256||baseManifestBytes.byteLength!==index.base.bytes||sha(sourceManifestBytes)!==index.source.manifestSha256)throw Error('Changed additive base/source manifest');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const base=JSON.parse(decoder.decode(baseManifestBytes)),source=JSON.parse(decoder.decode(sourceManifestBytes));
  if(base.version!==index.base.version||source.version!==index.source.version||JSON.stringify(base.counts)!==JSON.stringify(index.base.counts)
    ||JSON.stringify(baseBuild.manifest)!==JSON.stringify(base)||!baseBuild.files.get('manifest-v2.json').equals(Buffer.from(baseManifestBytes)))throw Error('Additive baseline differs from ordinary build');
  if(groups.length!==index.releases.length||groups.some((group,i)=>group.id!==index.releases[i].id))throw Error('Additive release order changed');
  const old=new Map(baseBuild.entries.map(entry=>[entry.term,entry])),expected=new Map(referenceBuild.entries.map(entry=>[entry.term,entry])),seen=new Set(),files=new Map(),deltas=[],keys=[];
  for(const [term,entry]of old){if(JSON.stringify(expected.get(term))!==JSON.stringify(entry))throw Error(`Existing whole example entry changed: ${term}`);}
  for(const group of groups){
    const sorted=[...group.rows].sort((a,b)=>order(a.term,b.term));
    if(!sorted.length)throw Error('Empty additive release');
    for(let offset=0;offset<sorted.length;offset+=500){
      const chunk=sorted.slice(offset,offset+500),entries=[];let pairs=0;
      for(const row of chunk){
        if(old.has(row.term)||seen.has(row.term))throw Error(`Additive overwrite or duplicate: ${row.term}`);
        const canonical=canonicalRecords.get(row.term),entry=expected.get(row.term);
        if(!canonical||!entry||entry.term!==canonical.term||!Number.isSafeInteger(canonical.id))throw Error(`Missing canonical/reference entry: ${row.term}`);
        if(entry.senses.length!==1||entry.senses[0].partOfSpeech!==row.partOfSpeech||entry.senses[0].meaningZh!==row.meaningZh
          ||JSON.stringify(entry.senses[0].examples)!==JSON.stringify([{en:row.en,zh:row.zh}])||entry.senses[0].reviewer!==row.reviewer)throw Error(`Reference example differs from reviewed pair: ${row.term}`);
        seen.add(row.term);entries.push({term:row.term,canonicalId:canonical.id,canonicalSourceSha256:sha(JSON.stringify(canonical)),example:entry});
        pairs+=entry.senses.reduce((n,sense)=>n+sense.examples.length,0);
      }
      const payload={schemaVersion:4,entries},artifact=compressExampleArtifact(payload,{delta:true,heads:entries.length,examples:pairs});
      const number=deltas.length;deltas.push(artifact.descriptor);files.set(artifact.descriptor.file,artifact.bytes);
      for(const entry of entries)keys.push([entry.term,number]);
    }
  }
  if(expected.size!==old.size+seen.size||[...expected.keys()].some(term=>!old.has(term)&&!seen.has(term)))throw Error('Additive release misses a normal-build head');
  keys.sort((a,b)=>order(a[0],b[0]));
  const catalogue={schemaVersion:4,format:'immutable-gzip-base-plus-deltas-v1',version:'0'.repeat(64),base:index.base,source:index.source,
    counts:referenceBuild.manifest.counts,deltas,keys};
  catalogue.version=await catalogueVersion(catalogue);const parsed=await parseAdditiveCatalogue(catalogue);
  for(let i=0;i<deltas.length;i++){
    // Validate exact logical data again through the browser's strict schema.
    const raw=files.get(deltas[i].file);if(raw.length>LIMITS.deltaEncoded)throw Error('Oversized additive delta');
    // fflate's decoded bytes are not used as the reference: reconstruct from
    // the exact reviewed union and directory, independently of compression.
    const entries=keys.filter(([,index])=>index===i).map(([term])=>({term,canonicalId:canonicalRecords.get(term).id,
      canonicalSourceSha256:sha(JSON.stringify(canonicalRecords.get(term))),example:expected.get(term)}));
    parseAdditiveDelta({schemaVersion:4,entries},parsed,i);
  }
  if(previousCatalogue){
    const prior=await parseAdditiveCatalogue(previousCatalogue);
    if(JSON.stringify(prior.base)!==JSON.stringify(parsed.base)||JSON.stringify(prior.source)!==JSON.stringify(parsed.source)
      ||prior.deltas.length>parsed.deltas.length||prior.deltas.some((value,i)=>JSON.stringify(value)!==JSON.stringify(parsed.deltas[i])))throw Error('Previous immutable delta prefix changed');
    const directory=new Map(parsed.keys);if(prior.keys.some(([term,index])=>directory.get(term)!==index))throw Error('Previous additive head changed');
  }
  const artifact=compressExampleArtifact(catalogue);files.set(artifact.descriptor.file,artifact.bytes);
  const audit={schemaVersion:4,version:catalogue.version,baseVersion:base.version,counts:catalogue.counts,addedHeads:seen.size,
    addedExamples:catalogue.counts.examples-base.counts.examples,retainedWholeBaseEntries:old.size,fullReferenceBuildVersion:referenceBuild.manifest.version,
    licensedMeaningsChanged:false,commercialExamplesUsed:false,bookQuotesReusedAsOriginal:false,
    reviewScope:'AI cross-reviewed selected-sense examples, not human certification or complete dictionary coverage',catalogue:artifact.descriptor};
  files.set(`audit-v4/${catalogue.version}.json`,Buffer.from(JSON.stringify(audit,null,2)+'\n'));
  // In particular, do not emit manifest-v2 or another 31 MB full snapshot.
  if([...files.keys()].some(file=>!(/^(?:catalogue-v4|delta-v4)\/[a-f0-9]{64}\.bin$/u.test(file)||/^audit-v4\/[a-f0-9]{64}\.json$/u.test(file))))throw Error('Forbidden full-snapshot output');
  return {files,catalogue,descriptor:artifact.descriptor,audit};
}

export async function loadCanonicalExampleSources({directory=join(ROOT,'vocab/data/expanded-dictionary')}={}){
  const sourceManifestBytes=await readFile(join(directory,'manifest.json')),source=JSON.parse(sourceManifestBytes),canonicalRecords=new Map(),physicalIds=new Map();
  for(const descriptor of source.english.shards){const raw=await readFile(join(directory,descriptor.file));
    if(raw.length!==descriptor.bytes||sha(raw)!==descriptor.sha256)throw Error('Changed canonical source body');
    for(const record of JSON.parse(raw).records){
      // Form/context buckets legitimately repeat complete canonical records.
      // Authenticate those copies, but install each head only from its home.
      const recordHash=sha(JSON.stringify(record));
      if(physicalIds.has(record.id)&&physicalIds.get(record.id)!==recordHash)throw Error('Conflicting physical canonical source copies');
      physicalIds.set(record.id,recordHash);
      if(record.id%128!==homeBucket(record.term))throw Error('Invalid canonical home bucket');
      if(descriptor.bucket!==record.id%128)continue;
      if(canonicalRecords.has(record.term))throw Error('Ambiguous canonical head');canonicalRecords.set(record.term,record);
    }}
  if(canonicalRecords.size!==source.counts.records||physicalIds.size!==canonicalRecords.size)throw Error('Canonical source home coverage mismatch');
  return {sourceManifestBytes,canonicalRecords};
}

export async function loadAdditiveExampleBuild(){
  const index=validateAdditiveIndex(JSON.parse(await readFile(join(ROOT,'tooling/dictionary/examples/additive-index-v4.json'),'utf8')));
  const groups=[];
  for(const release of index.releases){
    const rows=[];
    for(const file of release.sourceFiles){
      const pack=JSON.parse(await readFile(join(ROOT,'tooling/dictionary/examples/source',file),'utf8'));
      const review=JSON.parse(await readFile(join(ROOT,'tooling/dictionary/examples/reviews',file),'utf8'));
      rows.push(...validateExampleReview(pack,review));
    }
    groups.push({id:release.id,rows});
  }
  const baseBuild=await loadExampleBuild(),referenceBuild=await loadExampleBuild({additionalAuthored:groups.flatMap(group=>group.rows)});
  const baseManifestBytes=await readFile(join(ROOT,'vocab/data/dictionary-examples/manifest-v2.json'));
  // Authenticate all existing bodies against both current disk and normal build.
  for(const descriptor of baseBuild.manifest.shards){const raw=await readFile(join(ROOT,'vocab/data/dictionary-examples',descriptor.file));
    if(!raw.equals(baseBuild.files.get(descriptor.file)))throw Error(`Changed frozen example body: ${descriptor.file}`);}
  const {sourceManifestBytes,canonicalRecords}=await loadCanonicalExampleSources();
  let previousCatalogue=null;
  if(index.previousCatalogue!==null){
    const raw=await readFile(join(ROOT,'vocab/data/dictionary-examples',index.previousCatalogue.file));
    previousCatalogue=await decodeGzipArtifact(raw,index.previousCatalogue);
  }
  return buildAdditiveExamples({index,baseManifestBytes,sourceManifestBytes,baseBuild,referenceBuild,canonicalRecords,groups,previousCatalogue});
}

export function additiveBuildMode(args){
  if(!Array.isArray(args)||args.length>1||args.some(value=>!['--check','--write'].includes(value)))throw Error('Use --check (default) or explicit --write, alone');
  return args[0]==='--write'?'write':'check';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const checking=additiveBuildMode(process.argv.slice(2))==='check',build=await loadAdditiveExampleBuild();
  for(const [file,bytes]of build.files){const path=join(ROOT,'vocab/data/dictionary-examples',file);
    if(checking){if(!(await readFile(path)).equals(bytes))throw Error(`Stale additive example asset: ${file}`);}
    else{
      let existing;try{existing=await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(existing&&!existing.equals(bytes))throw Error(`Refusing to replace immutable example bytes: ${file}`);
      if(!existing){await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes,{flag:'wx'});}
    }}
  console.log(JSON.stringify({...build.audit,checked:checking},null,2));
}
