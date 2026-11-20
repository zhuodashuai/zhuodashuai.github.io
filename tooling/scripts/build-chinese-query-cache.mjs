/** Compile complete existing Chinese searches; never author a search result. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import {isDeepStrictEqual} from 'node:util';
import {buildChineseSearchRanking} from './build-chinese-search-ranking.mjs';
import {normalizeChineseQueryCacheQuery, chineseQueryCacheBucket} from '../../vocab/js/chinese-query-cache-format.js';
import {replayChineseQueryInputs, loadReviewedChineseQueryOrigin, compileChineseQueryReuse} from './build-chinese-query-cache-reuse.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..');
export const ZERO_ENGINE_BINDING='0'.repeat(64);
const HASH=/^[a-f0-9]{64}$/u;
const ENGINE='vocab/js/expanded-dictionary.js';
const CORE='vocab/data/ecdict-core.json';
const RELEASE='vocab/js/chinese-query-cache-release.js';
const DATA='vocab/data/chinese-query-cache';
const MARKER=/^export const CHINESE_QUERY_ENGINE_BINDING = (['"])([a-f0-9]{64})\1;(?=\r?$)/gmu;
export const QUERY_BUNDLE_LIMITS=Object.freeze({queries:16,bytes:256*1024,uncompressedBytes:4*1024*1024});
const compare=(a,b)=>a<b?-1:a>b?1:0;
const headKey=value=>value.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/gu,' ').trim();
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));

/** Only literal imports may enter the reproducible graph. Comments, ordinary
 * strings and regexp bodies are skipped; computed imports fail closed. */
export function literalModuleSpecifiers(source){
  const tokens=[];let i=0;
  const expression=/^[({[=,:;!?|&+*\-~%^<>]$/u;
  while(i<source.length){
    const c=source[i],next=source[i+1];
    if(/\s/u.test(c)){i++;continue;}
    if(c==='/'&&next==='/'){i=source.indexOf('\n',i+2);if(i<0)break;continue;}
    if(c==='/'&&next==='*'){const end=source.indexOf('*/',i+2);assert(end>=0,'Unterminated source comment');i=end+2;continue;}
    if(c==='"'||c==="'"||c==='`'){
      const quote=c,start=++i;let escaped=false;
      while(i<source.length){if(source[i]==='\\'){escaped=true;i+=2;continue;}if(source[i]===quote)break;i++;}
      assert(i<source.length,'Unterminated source string');const value=source.slice(start,i++);
      if(quote==='`'&&value.includes('${'))assert(!/\bimport\b/u.test(value),'Imports inside template expressions require an explicit graph reader');
      tokens.push({type:quote==='`'?'template':'string',value,escaped});continue;
    }
    const previous=tokens.at(-1);
    if(c==='/'&&(!previous||expression.test(previous.value)||['return','throw','case','yield','await'].includes(previous.value))){
      i++;let bracket=false,closed=false;
      while(i<source.length){const r=source[i++];if(r==='\\'){i++;continue;}if(r==='[')bracket=true;else if(r===']')bracket=false;else if(r==='/'&&!bracket){closed=true;break;}assert(r!=='\n','Unterminated source regexp');}
      assert(closed,'Unterminated source regexp');while(/[a-z]/iu.test(source[i]||'0'))i++;tokens.push({type:'regexp',value:'regexp'});continue;
    }
    const word=source.slice(i).match(/^[A-Za-z_$][\w$]*/u);
    if(word){tokens.push({type:'word',value:word[0]});i+=word[0].length;}else{tokens.push({type:'punctuation',value:c});i++;}
  }
  const found=[];
  const add=token=>{assert(token&&['string','template'].includes(token.type)&&!token.escaped&&!token.value.includes('${'),'Only unescaped literal module imports are supported');found.push(token.value);};
  for(let at=0;at<tokens.length;at++){
    const token=tokens[at];if(token.type!=='word'||tokens[at-1]?.value==='.')continue;
    if(token.value==='import'){
      const following=tokens[at+1];if(following?.value==='.')continue;
      if(following?.value==='('){add(tokens[at+2]);assert([',',')'].includes(tokens[at+3]?.value),'Computed module imports are not fingerprintable');continue;}
      if(following?.type==='string'){add(following);continue;}
      let end=at+1;while(end<tokens.length&&!['from',';'].includes(tokens[end].value))end++;
      assert(tokens[end]?.value==='from','Unsupported import declaration');add(tokens[end+1]);
    }else if(token.value==='export'&&['*','{'].includes(tokens[at+1]?.value)){
      let end=at+1;while(end<tokens.length&&!['from',';'].includes(tokens[end].value))end++;
      if(tokens[end]?.value==='from')add(tokens[end+1]);
    }
  }
  return [...new Set(found)].sort(compare);
}

export function zeroEngineMarker(source){
  const matches=[...source.matchAll(MARKER)];assert.equal(matches.length,1,'Expected exactly one generated engine-binding marker');
  return {value:matches[0][2],source:source.replace(MARKER,line=>line.replace(matches[0][2],ZERO_ENGINE_BINDING))};
}

export async function fingerprintChineseQueryEngine({root=ROOT,sourceManifestSha256,selectionSources}={}){
  assert(HASH.test(sourceManifestSha256));const modules={},pending=[ENGINE,'vocab/js/core-dictionary.js'];
  const moduleRoot=await realpath(path.resolve(root,'vocab/js'));
  let markerValue;
  while(pending.length){
    const relative=pending.pop();if(relative===RELEASE||Object.hasOwn(modules,relative))continue;
    const file=path.resolve(root,relative);assert(inside(path.resolve(root,'vocab/js'),file),'Engine import leaves public module root');
    const resolved=await realpath(file);assert(inside(moduleRoot,resolved)&&path.relative(file,resolved)==='','Engine imports must not escape or alias the public module root');
    const bytes=await readFile(file);let source=bytes.toString('utf8');assert(Buffer.from(source).equals(bytes),'Engine modules must be UTF-8');
    if(relative===ENGINE){const normalized=zeroEngineMarker(source);markerValue=normalized.value;source=normalized.source;}
    modules[relative]=sha(source);
    for(const specifier of literalModuleSpecifiers(source)){
      assert(/^\.\.?\//u.test(specifier),'Engine closure may contain only local relative modules');
      const target=new URL(specifier,pathToFileURL(file));assert.equal(target.protocol,'file:');assert(!target.hash,'Import hash fragments are unsupported');
      const imported=fileURLToPath(target);assert(imported.endsWith('.js'),'Non-JavaScript imports require an explicit source binding');
      const next=path.relative(root,imported).split(path.sep).join('/');
      if(next!==RELEASE)pending.push(next);
    }
  }
  const sourceFiles=Object.fromEntries(Object.entries(modules).sort(([a],[b])=>compare(a,b)));
  const engineBinding=sha({schemaVersion:1,sourceManifestSha256,selectionSources,sourceFiles});
  return {engineBinding,markerValue,sourceFiles};
}

export function selectCoreChineseAtoms(payload,parseCoreDictionary,chineseDefinitionAtoms){
  const dictionary=parseCoreDictionary(payload);
  assert.equal(dictionary.source.name,'ECDICT');assert.equal(dictionary.source.license,'MIT');
  assert.equal(dictionary.source.url,'https://github.com/skywind3000/ECDICT');assert(HASH.test(dictionary.source.sha256));
  assert.equal(payload.count,7502);assert.equal(payload.entries.length,7502);assert.equal(dictionary.entries.size,7502);
  assert(Array.isArray(payload.requiredMissing)&&payload.requiredMissing.length===0,'Core selection has missing required entries');
  const indexes=Object.fromEntries(['key','word','partOfSpeech','meaning','collins','oxford','bnc','frq','forms'].map(key=>[key,payload.columns.indexOf(key)]));
  assert(Object.values(indexes).every(index=>index>=0));const atoms=new Set();
  for(const raw of payload.entries){
    assert(Array.isArray(raw)&&raw.length===payload.columns.length,'Invalid complete core row');
    assert(typeof raw[indexes.word]==='string'&&typeof raw[indexes.partOfSpeech]==='string'&&typeof raw[indexes.meaning]==='string');
    assert(raw[indexes.meaning].length<=20000,'Core meaning exceeds atom parser bound');
    for(const key of ['collins','oxford','bnc','frq'])assert(Number.isSafeInteger(raw[indexes[key]])&&raw[indexes[key]]>=0,'Invalid common-word metadata');
    // Read the complete raw meaning, not the browser parser's display truncation.
    for(const atom of chineseDefinitionAtoms(raw[indexes.meaning],raw[indexes.partOfSpeech])){
      if(typeof atom.lexical==='string'&&/^\p{Script=Han}{2,12}$/u.test(atom.lexical))atoms.add(atom.lexical);
    }
  }
  return [...atoms].sort(compare);
}

export async function collectCompleteChineseQuery(query,{search,fetchImpl,pageSize=50}={}){
  const results=[],heads=new Set();let offset=0,total,metadata;
  for(let pageNumber=0;pageNumber<10000;pageNumber++){
    const page=await search(query,{fetchImpl,limit:pageSize,offset,useChineseQueryCache:false});
    assert.equal(page.coverage??'full','full','Partial results cannot enter a complete cache');assert.equal(page.ranking,'global');assert.equal(page.relatedIntegrated,true);
    assert.equal(page.offset,offset);assert(Number.isSafeInteger(page.total)&&page.total>=0&&page.total<=200000);
    total??=page.total;assert.equal(page.total,total);assert(Array.isArray(page.results));assert.equal(page.nextOffset,offset+page.results.length);
    const {results:ignored,hasMore,nextOffset,offset:ignoredOffset,...rest}=page;
    if(!metadata)metadata=rest;else assert.deepEqual(rest,metadata,'Result metadata changed between pages');
    for(const result of page.results){assert(result&&typeof result.term==='string'&&!heads.has(headKey(result.term)),'Duplicate or invalid result head');heads.add(headKey(result.term));results.push(result);}
    if(!page.hasMore){assert.equal(results.length,total);assert.equal(page.nextOffset,total);const packet={query:page.query,metadata,results};
      assert.equal(normalizeChineseQueryCacheQuery(page.query),page.query,'Engine returned a noncanonical query key');
      assert(isDeepStrictEqual(JSON.parse(JSON.stringify(packet)),packet),'JSON transport would alter a complete public DTO');return packet;}
    assert(page.nextOffset>offset,'Non-advancing complete pagination');offset=page.nextOffset;
  }
  throw Error('Complete pagination exceeded its finite bound');
}

/** The related view may reuse this complete stream only when the real original
 * helper proves the exact filtered DTOs, order and metadata on every query. */
export async function validateRelatedChineseProjection(packet,{searchRelated,fetchImpl,pageSize=50}={}){
  assert.equal(typeof searchRelated,'function','The original related-query export is required');
  const related=await collectCompleteChineseQuery(packet.query,{search:searchRelated,fetchImpl,pageSize});
  const results=packet.results.filter(row=>row.matchType==='related');
  assert.deepEqual(related,{query:packet.query,metadata:{...packet.metadata,total:results.length},results},
    'The original related view differs from the complete primary packet projection: '+packet.query);
  return related.results.length;
}

export function deterministicQueryGzip(value){
  const uncompressed=Buffer.from(JSON.stringify(value)+'\n'),bytes=gzipSync(uncompressed,{level:9});bytes[9]=255;
  assert(gunzipSync(bytes).equals(uncompressed));return {bytes,uncompressedBytes:uncompressed.length,sha256:sha(bytes)};
}

/** Content-addressed grouped envelopes. A large single answer is omitted from
 * membership and still uses the original engine, never a truncated packet. */
export function compileChineseQueryBundles({dictionaryVersion,sourceManifestSha256,engineBinding,selectionSources,packets,limits=QUERY_BUNDLE_LIMITS}){
  assert(HASH.test(dictionaryVersion)&&HASH.test(sourceManifestSha256)&&HASH.test(engineBinding));
  assert(Number.isSafeInteger(limits.queries)&&limits.queries>0&&limits.queries<=16);
  const sorted=[...packets].sort((a,b)=>compare(a.query,b.query)),seen=new Set(),groups=[],excluded=[];
  const envelope=items=>({schemaVersion:1,dictionaryVersion,engineBinding,packets:items});
  const fits=value=>value.bytes.length<=limits.bytes&&value.uncompressedBytes<=limits.uncompressedBytes;
  for(let bucket=0;bucket<64;bucket++){
    let group=[];
    for(const packet of sorted.filter(item=>chineseQueryCacheBucket(item.query)===bucket)){
      assert.equal(normalizeChineseQueryCacheQuery(packet.query),packet.query);assert(!seen.has(packet.query),'Duplicate query packet');seen.add(packet.query);
      assert.equal(packet.metadata.query,packet.query);assert.equal(packet.metadata.total,packet.results.length);
      assert.equal(packet.metadata.ranking,'global');assert.equal(packet.metadata.relatedIntegrated,true);
      assert.equal(packet.metadata.coverage??'full','full');
      if(packet.metadata.normalizedQuery!==undefined)assert.equal(normalizeChineseQueryCacheQuery(packet.metadata.normalizedQuery),packet.metadata.normalizedQuery);
      assert(Object.keys(packet.metadata).every(key=>['query','total','ranking','relatedIntegrated','normalizedQuery','coverage'].includes(key)),'Unknown query packet metadata');
      const heads=new Set();for(const row of packet.results){assert(row&&typeof row.term==='string'&&!heads.has(headKey(row.term)),'Duplicate or invalid result head');heads.add(headKey(row.term));}
      assert(isDeepStrictEqual(JSON.parse(JSON.stringify(packet)),packet),'JSON transport would alter a full packet');
      const candidate=[...group,packet],compressed=deterministicQueryGzip(envelope(candidate));
      if(candidate.length<=limits.queries&&fits(compressed)){group=candidate;continue;}
      if(group.length)groups.push({bucket,packets:group,...deterministicQueryGzip(envelope(group))});
      const single=deterministicQueryGzip(envelope([packet]));
      if(fits(single))group=[packet];else{excluded.push({query:packet.query,reason:'single-query-bundle-exceeds-bound',bytes:single.bytes.length,uncompressedBytes:single.uncompressedBytes});group=[];}
    }
    if(group.length)groups.push({bucket,packets:group,...deterministicQueryGzip(envelope(group))});
  }
  const catalogue=groups.flatMap(group=>group.packets.map(packet=>({query:packet.query,sha256:group.sha256,bytes:group.bytes.length,uncompressedBytes:group.uncompressedBytes,total:packet.results.length}))).sort((a,b)=>compare(a.query,b.query));
  const buildVersion=sha({schemaVersion:1,dictionaryVersion,sourceManifestSha256,engineBinding,selectionSources,catalogue});
  const files=new Map(),entries=Array.from({length:64},()=>[]);
  for(const group of groups){const file=buildVersion+'/'+group.sha256+'.bin';if(files.has(file))assert(files.get(file).equals(group.bytes));files.set(file,group.bytes);
    for(const packet of group.packets)entries[group.bucket].push({query:packet.query,file,sha256:group.sha256,bytes:group.bytes.length,uncompressedBytes:group.uncompressedBytes,total:packet.results.length});}
  const buckets=entries.map((items,bucket)=>{items.sort((a,b)=>compare(a.query,b.query));const compressed=deterministicQueryGzip({schemaVersion:1,dictionaryVersion,engineBinding,bucket,entries:items});
    assert(compressed.bytes.length<=1024*1024&&compressed.uncompressedBytes<=8*1024*1024,'Bucket exceeds reader bounds');
    const file=buildVersion+'/'+compressed.sha256+'.bin';files.set(file,compressed.bytes);return {bucket,file,sha256:compressed.sha256,bytes:compressed.bytes.length,uncompressedBytes:compressed.uncompressedBytes};});
  const members=catalogue.map(item=>item.query);
  const release={schemaVersion:1,dictionaryVersion,sourceManifestSha256,engineBinding,buildVersion,members,buckets,selectionSources};
  return {release,files,excluded,bundles:groups.length};
}

export function renderChineseQueryCacheRelease(release,{bootstrap=false}={}){
  return '// Generated by tooling/scripts/build-chinese-query-cache.mjs.\n'
    +(bootstrap?'// Bootstrap only: no cached queries; every search uses the original complete index.\n':'// Complete source-bound results; unknown/invalid cache reads use the original index.\n')
    +'const freeze = value => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };\n'
    +'export const CHINESE_QUERY_CACHE_RELEASE = freeze('+JSON.stringify(release,null,2)+');\n';
}

export async function boundedLocalQueryTransport(root){
  const dataRoot=await realpath(path.join(root,'vocab/data')),cache=new Map();let cachedBytes=0;
  const reads=new Map();
  const fetchImpl=async(input,options)=>{
    const url=new URL(input);assert.equal(url.protocol,'file:');assert(!url.search&&!url.hash&&!url.username&&!url.password);
    assert.equal(options?.credentials,'omit','Only credential-free public reads are allowed');
    const file=await realpath(fileURLToPath(url));assert(inside(dataRoot,file),'Query compiler attempted a read outside public data');
    assert(!path.relative(dataRoot,file).split(path.sep).includes('chinese-query-cache'),'Full-engine compilation may not read its generated cache');
    if(options.signal?.aborted)throw Object.assign(new Error('Build read aborted'),{name:'AbortError'});
    let bytes=cache.get(file);if(!bytes){bytes=await readFile(file);assert(bytes.length<=8*1024*1024,'Public source read exceeds bound');
      while(cachedBytes+bytes.length>32*1024*1024&&cache.size){const first=cache.keys().next().value;cachedBytes-=cache.get(first).length;cache.delete(first);}
      cache.set(file,bytes);cachedBytes+=bytes.length;reads.set(path.relative(root,file).split(path.sep).join('/'),{bytes:bytes.length,sha256:sha(bytes)});}
    return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});
  };
  return {fetchImpl,reads};
}

export async function selectionSource(root){
  const bytes=await readFile(path.join(root,CORE)),payload=JSON.parse(bytes);
  const {parseCoreDictionary}=await import(pathToFileURL(path.join(root,'vocab/js/core-dictionary.js')));
  const {chineseDefinitionAtoms}=await import(pathToFileURL(path.join(root,'vocab/js/chinese-search.js')));
  const atoms=selectCoreChineseAtoms(payload,parseCoreDictionary,chineseDefinitionAtoms);
  return {payload,atoms,selectionSources:[{file:CORE,sha256:sha(bytes),bytes:bytes.length,entries:7502,license:'MIT'}]};
}

export async function writeOrCheckChineseQueryArtifacts(root,compiled,{check=false,bootstrap=false}={}){
  for(const [file,bytes]of compiled.files){const target=path.join(root,DATA,file);
    if(check)assert((await readFile(target)).equals(bytes),'Stale or corrupt query-cache object: '+file);
    else{await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);}}
  const text=renderChineseQueryCacheRelease(compiled.release,{bootstrap}),releaseFile=path.join(root,RELEASE);
  if(check)assert.equal(await readFile(releaseFile,'utf8'),text,'Stale Chinese query-cache release');else await writeFile(releaseFile,text);
}

export async function buildChineseQueryCache({root=ROOT,check=false,bootstrap=false,updateEngineBinding=false,reuse941=false,onProgress=()=>{}}={}){
  assert(!(check&&(bootstrap||updateEngineBinding)),'Check mode never mutates or bootstraps');
  assert(!(bootstrap&&reuse941),'Bootstrap cannot authorize legacy reuse');
  const manifestBytes=await readFile(path.join(root,'vocab/data/expanded-dictionary/manifest.json')),manifest=JSON.parse(manifestBytes),sourceManifestSha256=sha(manifestBytes);
  const selected=await selectionSource(root);assert.equal(selected.payload.source.sha256,manifest.sources.mit.sha256,'Core selection MIT root differs from the canonical source');
  // Rebuild in memory and compare the canonical sidecar before any compilation.
  await buildChineseSearchRanking({root,check:true});
  if(bootstrap){
    try{const previous=await readFile(path.join(root,RELEASE),'utf8');assert(/Bootstrap only:/u.test(previous),'Bootstrap cannot replace a produced release');}catch(error){if(error.code!=='ENOENT')throw error;}
    const compiled=compileChineseQueryBundles({dictionaryVersion:manifest.version,sourceManifestSha256,engineBinding:ZERO_ENGINE_BINDING,selectionSources:selected.selectionSources,packets:[]});
    await writeOrCheckChineseQueryArtifacts(root,compiled,{bootstrap:true});return {bootstrap:true,release:compiled.release,files:compiled.files.size};
  }
  const binding=await fingerprintChineseQueryEngine({root,sourceManifestSha256,selectionSources:selected.selectionSources});
  if(binding.markerValue!==binding.engineBinding){
    assert(updateEngineBinding&&!check,'Stale engine-binding marker; explicitly prepare it after the engine graph is frozen');
    const file=path.join(root,ENGINE),source=await readFile(file,'utf8');zeroEngineMarker(source);
    await writeFile(file,source.replace(MARKER,line=>line.replace(binding.markerValue,binding.engineBinding)));
  }
  const load=file=>import(pathToFileURL(path.join(root,file)).href+'?queryCacheBuild='+binding.engineBinding);
  const [{searchExpandedDictionary,searchRelatedChineseDictionary},{EVERYDAY_LOOKUP_ENTRIES,EVERYDAY_CHINESE_ALIASES},{registeredChineseQueryCatalogue}]=await Promise.all([load(ENGINE),load('vocab/js/everyday-lookup-data.js'),load('vocab/js/chinese-search.js')]);
  assert.equal(typeof searchRelatedChineseDictionary,'function','The original related-query export is required');
  const inputs=[...new Set([...EVERYDAY_LOOKUP_ENTRIES.flatMap(row=>row.chineseAliases),...EVERYDAY_CHINESE_ALIASES.flatMap(row=>row.aliases),...registeredChineseQueryCatalogue(),...selected.atoms].filter(value=>normalizeChineseQueryCacheQuery(value)!==null))].sort(compare);
  if(reuse941){
    // The proof issuer independently reads the frozen graph/core/manifest and
    // actually runs both uncached production exports. A supplied digest is not
    // a substitute for the replay or its private, process-local authority.
    const proof=await replayChineseQueryInputs({root,inputs,onProgress});
    const origin=await loadReviewedChineseQueryOrigin({root});
    const compiled=compileChineseQueryReuse({proof,origin});
    const final=await fingerprintChineseQueryEngine({root,sourceManifestSha256,selectionSources:selected.selectionSources});
    assert.equal(final.engineBinding,binding.engineBinding);assert.equal(final.markerValue,binding.engineBinding);
    assert((await readFile(path.join(root,'vocab/data/expanded-dictionary/manifest.json'))).equals(manifestBytes));
    assert.equal(sha(await readFile(path.join(root,CORE))),selected.selectionSources[0].sha256);
    await writeOrCheckChineseQueryArtifacts(root,compiled,{check});
    return {bootstrap:false,check,schemaVersion:2,engineBinding:binding.engineBinding,buildVersion:compiled.release.buildVersion,
      queryInputs:inputs.length,queries:compiled.release.members.length,bundles:compiled.bundles,files:compiled.files.size,
      gzipBytes:[...compiled.files.values()].reduce((sum,bytes)=>sum+bytes.length,0),excluded:compiled.excluded,
      reuse:compiled.reuse,authorization:compiled.release.authorization,selectionSources:selected.selectionSources,sourceFiles:binding.sourceFiles};
  }
  const transport=await boundedLocalQueryTransport(root),packets=new Map();let completed=0,relatedQueriesVerified=0;
  for(const query of inputs){const packet=await collectCompleteChineseQuery(query,{search:searchExpandedDictionary,fetchImpl:transport.fetchImpl});
    await validateRelatedChineseProjection(packet,{searchRelated:searchRelatedChineseDictionary,fetchImpl:transport.fetchImpl});relatedQueriesVerified++;
    const previous=packets.get(packet.query);if(previous)assert.deepEqual(previous,packet,'Normalizing query inputs disagree on complete output');else packets.set(packet.query,packet);
    if(++completed%250===0)onProgress({completed,inputs:inputs.length,queries:packets.size});}
  const finalBinding=await fingerprintChineseQueryEngine({root,sourceManifestSha256,selectionSources:selected.selectionSources});
  assert.equal(finalBinding.markerValue,binding.engineBinding);assert.equal(finalBinding.engineBinding,binding.engineBinding,'Engine graph changed while queries were compiling');
  assert((await readFile(path.join(root,'vocab/data/expanded-dictionary/manifest.json'))).equals(manifestBytes),'Dictionary manifest changed while compiling');
  assert.equal(sha(await readFile(path.join(root,CORE))),selected.selectionSources[0].sha256,'Core selection changed while compiling');
  const compiled=compileChineseQueryBundles({dictionaryVersion:manifest.version,sourceManifestSha256,engineBinding:binding.engineBinding,selectionSources:selected.selectionSources,packets:[...packets.values()]});
  await writeOrCheckChineseQueryArtifacts(root,compiled,{check});
  const members=new Set(compiled.release.members),candidateNonempty=[...packets.values()].filter(packet=>packet.results.length).length;
  return {bootstrap:false,check,engineBinding:binding.engineBinding,buildVersion:compiled.release.buildVersion,queryInputs:inputs.length,relatedQueriesVerified,candidateQueries:packets.size,candidateNonempty,queries:members.size,nonempty:[...packets.values()].filter(packet=>members.has(packet.query)&&packet.results.length).length,bundles:compiled.bundles,files:compiled.files.size,gzipBytes:[...compiled.files.values()].reduce((sum,bytes)=>sum+bytes.length,0),excluded:compiled.excluded,selectionSources:selected.selectionSources,sourceFiles:binding.sourceFiles,staticReads:Object.fromEntries(transport.reads)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert(args.every(arg=>['--check','--bootstrap','--update-engine-binding','--reuse-941'].includes(arg)),'Unknown query-cache builder argument');
  const report=await buildChineseQueryCache({check:args.includes('--check'),bootstrap:args.includes('--bootstrap'),updateEngineBinding:args.includes('--update-engine-binding'),reuse941:args.includes('--reuse-941'),onProgress:progress=>console.log(JSON.stringify(progress))});
  console.log(JSON.stringify(report));
}
