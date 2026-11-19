import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {literalModuleSpecifiers, zeroEngineMarker, fingerprintChineseQueryEngine, selectCoreChineseAtoms,
  collectCompleteChineseQuery, validateRelatedChineseProjection, compileChineseQueryBundles, renderChineseQueryCacheRelease,
  writeOrCheckChineseQueryArtifacts, ZERO_ENGINE_BINDING} from '../scripts/build-chinese-query-cache.mjs';
import {normalizeChineseQueryCacheQuery, chineseQueryCacheBucket} from '../../vocab/js/chinese-query-cache-format.js';
import {registeredChineseQueryCatalogue, chineseSearchPlan, chineseDefinitionAtoms} from '../../vocab/js/chinese-search.js';
import {parseCoreDictionary} from '../../vocab/js/core-dictionary.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const binding={dictionaryVersion:'a'.repeat(64),sourceManifestSha256:'b'.repeat(64),engineBinding:'c'.repeat(64),
  selectionSources:[{file:'vocab/data/ecdict-core.json',sha256:'d'.repeat(64),bytes:1963099,entries:7502,license:'MIT'}]};
const dto=(term='test')=>({term,partOfSpeech:'noun',meaning:'① 完整的中文释义。',source:'ECDICT',license:'MIT',url:'https://github.com/skywind3000/ECDICT',
  alternatives:[{partOfSpeech:'noun',meaning:'① 另一个原有义项。',source:'原有来源',license:'Original licence',url:'https://example.org/source'}],
  matchType:'related',matchedChinese:'测试',matchedPartOfSpeech:'noun',matchedSense:'原有义项',matchedExampleSenseIds:['sense:1'],
  matchedExampleSenseEvidence:[{id:'sense:1',partOfSpeech:'noun',meaningZh:'完整的中文释义',examples:[{en:'An original complete example.',zh:'一个完整的原有例句。'}]}]});
const packet=(query,results=[dto()])=>({query,metadata:{query,total:results.length,ranking:'global',relatedIntegrated:true},results});
const sameBucketQueries=(count,bucket=0)=>{const found=[];for(let i=0;found.length<count;i++){const q='缓存'+String.fromCodePoint(0x4e00+i);if(chineseQueryCacheBucket(q)===bucket)found.push(q);}return found;};
async function temporary(run){const parent=path.resolve(tmpdir()),directory=await mkdtemp(path.join(parent,'chinese-query-build-'));try{return await run(directory);}finally{assert(path.relative(parent,directory).startsWith('chinese-query-build-'));await rm(directory,{recursive:true,force:true});}}

test('the catalogue exposes only exact runtime-accepted plans as an immutable fresh list',()=>{
  const catalogue=registeredChineseQueryCatalogue();assert(Object.isFrozen(catalogue));assert(catalogue.length>1000);
  assert.equal(new Set(catalogue).size,catalogue.length);assert.deepEqual(catalogue,[...catalogue].sort());
  for(const query of catalogue)assert.equal(chineseSearchPlan(query)?.term,query);
  for(const query of ['开心','体检','凉爽','会员卡'])assert(catalogue.includes(query));
  assert.notEqual(registeredChineseQueryCatalogue(),catalogue);
});

test('literal imports include multiline, re-export and dynamic literals without scanning comments or regex/string bodies',()=>{
  const source=`// import './wrong-comment.js';\nconst text="import('./wrong-string.js')";\nconst regex=/['"]import\\(/;\nimport {\n x\n} from './one.js?v=2'; export * from './two.js';\nexport { x } from './three.js';\nconst result=import('./four.js');const directory=import.meta.url;`;
  assert.deepEqual(literalModuleSpecifiers(source),['./four.js','./one.js?v=2','./three.js','./two.js']);
  for(const code of ["import(name)","import('./'+name)",'import(`./${name}.js`)',"import('./esc\\u0061ped.js')"])
    assert.throws(()=>literalModuleSpecifiers(code));
  assert.throws(()=>literalModuleSpecifiers('const loaded = `value: ${import /* gap */ ("./missed-overlay.js")}`;'),/template expressions/u);
});

test('only the exact engine marker is zeroed and missing/duplicate markers fail closed',()=>{
  const source="const other='"+'f'.repeat(64)+"';\nexport const CHINESE_QUERY_ENGINE_BINDING = '"+'e'.repeat(64)+"';\n";
  const result=zeroEngineMarker(source);assert.equal(result.value,'e'.repeat(64));assert(result.source.includes("other='"+'f'.repeat(64)));
  assert(result.source.includes("CHINESE_QUERY_ENGINE_BINDING = '"+ZERO_ENGINE_BINDING));
  assert.throws(()=>zeroEngineMarker('export const CHINESE_QUERY_ENGINE_BINDING="wrong";'));
  assert.throws(()=>zeroEngineMarker(source+source));
});

test('the actual transitive closure binds overlays, selector, manifest and core bytes while excluding only generated release',async()=>temporary(async root=>{
  const directory=path.join(root,'vocab/js');await mkdir(directory,{recursive:true});
  const put=(name,text)=>writeFile(path.join(directory,name),text);
  await put('expanded-dictionary.js',"import './overlay.js?v=1';\nimport './chinese-query-cache-release.js';\nexport const CHINESE_QUERY_ENGINE_BINDING = '"+ZERO_ENGINE_BINDING+"';\n");
  await put('overlay.js',"export { value } from './nested.js';\n");await put('nested.js','export const value=1;\n');
  await put('core-dictionary.js','export const parser=1;\n');await put('chinese-query-cache-release.js','export const output=1;\n');
  const options={root,sourceManifestSha256:binding.sourceManifestSha256,selectionSources:binding.selectionSources};
  const first=await fingerprintChineseQueryEngine(options);assert.equal(Object.keys(first.sourceFiles).length,4);
  await put('chinese-query-cache-release.js','export const output=2;\n');assert.equal((await fingerprintChineseQueryEngine(options)).engineBinding,first.engineBinding);
  const source=await readFile(path.join(directory,'expanded-dictionary.js'),'utf8');await put('expanded-dictionary.js',source.replace(ZERO_ENGINE_BINDING,first.engineBinding));
  assert.equal((await fingerprintChineseQueryEngine(options)).engineBinding,first.engineBinding);
  await put('nested.js','export const value=2;\n');assert.notEqual((await fingerprintChineseQueryEngine(options)).engineBinding,first.engineBinding);
  assert.notEqual((await fingerprintChineseQueryEngine({...options,sourceManifestSha256:'9'.repeat(64)})).engineBinding,(await fingerprintChineseQueryEngine(options)).engineBinding);
  assert.notEqual((await fingerprintChineseQueryEngine({...options,selectionSources:[{...binding.selectionSources[0],sha256:'8'.repeat(64)}]})).engineBinding,(await fingerprintChineseQueryEngine(options)).engineBinding);
  await put('overlay.js',"import '../../private.js';\n");await assert.rejects(fingerprintChineseQueryEngine(options),/leaves public module root/u);
}));

function coreFixture(){
  const columns=['key','word','phonetic','partOfSpeech','meaning','definition','collins','oxford','bnc','frq','tags','forms'];
  const entries=Array.from({length:7502},(_,i)=>['word'+i,'word'+i,'','noun','n. 苹果','',1,1,1,1,'',[]]);
  entries[0][4]='n. 苹果, 一, 十三个汉字过长所以不加入目录\nvt. 修理\na. 凉爽的';
  entries[1][4]='n. '+('甲'.repeat(1201))+'\nvt. 补充';
  return {schemaVersion:1,source:{name:'ECDICT',license:'MIT',url:'https://github.com/skywind3000/ECDICT',sha256:'a'.repeat(64)},columns,count:7502,requiredMissing:[],entries};
}
test('all 7502 core rows contribute only complete source atoms, retaining POS and full untruncated meaning',()=>{
  const source=coreFixture(),before=JSON.stringify(source),queries=selectCoreChineseAtoms(source,parseCoreDictionary,chineseDefinitionAtoms);
  for(const term of ['苹果','修理','凉爽的','补充'])assert(queries.includes(term),term);
  assert(!queries.includes('一'));assert(!queries.includes('十三个汉字过长所以不加入目录'));
  assert(queries.every(term=>/^\p{Script=Han}{2,12}$/u.test(term)));assert.equal(JSON.stringify(source),before);
  const invalid=coreFixture();invalid.source.license='unknown';assert.throws(()=>selectCoreChineseAtoms(invalid,parseCoreDictionary,chineseDefinitionAtoms));
  const count=coreFixture();count.count=7501;assert.throws(()=>selectCoreChineseAtoms(count,parseCoreDictionary,chineseDefinitionAtoms));
  const metadata=coreFixture();metadata.entries[7][9]=-1;assert.throws(()=>selectCoreChineseAtoms(metadata,parseCoreDictionary,chineseDefinitionAtoms));
});

test('full pagination retains every nested lexical/source field and explicitly disables query cache use',async()=>{
  const results=Array.from({length:5},(_,i)=>dto('term'+i)),calls=[];
  const search=async(query,options)=>{calls.push(options);assert.equal(options.useChineseQueryCache,false);const {offset,limit}=options;
    return {query,results:results.slice(offset,offset+limit),offset,total:results.length,nextOffset:Math.min(offset+limit,results.length),hasMore:offset+limit<results.length,ranking:'global',relatedIntegrated:true};};
  const found=await collectCompleteChineseQuery('测试',{search,fetchImpl:()=>{},pageSize:2});
  assert.deepEqual(found.results,results);assert.deepEqual(calls.map(call=>call.offset),[0,2,4]);
  assert.deepEqual(found.metadata,{query:'测试',total:5,ranking:'global',relatedIntegrated:true});
});

test('partial, changing, duplicate or corrupt pagination is rejected instead of cached',async()=>{
  const normal={query:'测试',results:[dto()],offset:0,total:1,nextOffset:1,hasMore:false,ranking:'global',relatedIntegrated:true};
  for(const change of [{coverage:'basic'},{coverage:'complete'},{total:2},{nextOffset:0},{results:[dto(),dto()],total:2,nextOffset:2},{results:[{...dto(),extra:undefined}]}])
    await assert.rejects(collectCompleteChineseQuery('测试',{search:async()=>({...normal,...change})}));
  await assert.rejects(collectCompleteChineseQuery('测试',{search:async()=>{throw new Error('source corruption');}}),/source corruption/u);
  await assert.rejects(collectCompleteChineseQuery('测试',{pageSize:1,search:async(query,{offset})=>({...normal,offset,total:offset?3:2,nextOffset:offset+1,hasMore:offset===0,results:[dto('term'+offset)]})}));
});

test('every complete primary packet proves its full paginated related projection against the original helper',async()=>{
  const original=packet('测试',[{...dto('direct'),matchType:'compound'},dto('related-one'),dto('related-two'),{...dto('literal'),matchType:undefined}]);
  delete original.results[3].matchType;
  const results=original.results.filter(row=>row.matchType==='related'),before=JSON.stringify(original),calls=[];
  const searchRelated=async(query,options)=>{calls.push(options);assert.equal(options.useChineseQueryCache,false);const {offset,limit}=options;
    return {...original.metadata,total:results.length,results:results.slice(offset,offset+limit),offset,
      nextOffset:Math.min(offset+limit,results.length),hasMore:offset+limit<results.length};};
  assert.equal(await validateRelatedChineseProjection(original,{searchRelated,pageSize:1}),2);
  assert.deepEqual(calls.map(call=>call.offset),[0,1]);assert.equal(JSON.stringify(original),before);
  const empty=packet('测试',[{...dto('direct'),matchType:'compound'}]);
  assert.equal(await validateRelatedChineseProjection(empty,{searchRelated:async()=>({...empty.metadata,total:0,results:[],offset:0,nextOffset:0,hasMore:false})}),0);
});

test('related reuse fails closed on mismatched flags, source evidence, metadata, order or a missing original export',async()=>{
  const original=packet('测试',[dto('first'),dto('second')]);
  const page=results=>({...original.metadata,results,offset:0,nextOffset:results.length,hasMore:false});
  for(const results of [original.results.map((row,i)=>i?row:{...row,matchType:'compound'}),
    original.results.map((row,i)=>i?row:{...row,source:'A different source'}),[...original.results].reverse()]){
    await assert.rejects(validateRelatedChineseProjection(original,{searchRelated:async()=>page(results)}),/original related view differs/u);
  }
  await assert.rejects(validateRelatedChineseProjection(original,{searchRelated:async()=>({...page(original.results),normalizedQuery:'不同'})}),/original related view differs/u);
  await assert.rejects(validateRelatedChineseProjection(original,{searchRelated:async()=>({...page(original.results),relatedIntegrated:false})}));
  await assert.rejects(validateRelatedChineseProjection(original,{}),/original related-query export is required/u);
});

test('deterministic bundles share one file for at most16 exact sorted queries and preserve full DTOs',()=>{
  const queries=sameBucketQueries(17),packets=queries.map((q,i)=>packet(q,[dto('term'+i)]));
  const first=compileChineseQueryBundles({...binding,packets}),again=compileChineseQueryBundles({...binding,packets:[...packets].reverse()});
  assert.equal(first.bundles,2);assert.equal(first.files.size,66);assert.deepEqual(first.release,again.release);
  for(const [file,bytes]of first.files){assert.equal(bytes[9],255);assert(bytes.equals(again.files.get(file)));assert(file.endsWith('/'+hash(bytes)+'.bin'));}
  const bucket=JSON.parse(gunzipSync(first.files.get(first.release.buckets[0].file)));
  assert.equal(bucket.entries.length,17);assert.equal(new Set(bucket.entries.map(row=>row.file)).size,2);
  for(const file of new Set(bucket.entries.map(row=>row.file))){const envelope=JSON.parse(gunzipSync(first.files.get(file)));
    assert(envelope.packets.length<=16);assert.deepEqual(envelope.packets.map(row=>row.query),envelope.packets.map(row=>row.query).sort());
    for(const inner of envelope.packets)assert.deepEqual(inner,packets.find(row=>row.query===inner.query));}
});

test('bundle byte limits split whole answers and oversized single queries remain eligible for original fallback only',()=>{
  const q=sameBucketQueries(3),packets=q.map((query,i)=>packet(query,[{...dto('term'+i),meaning:'长'.repeat(i===2?4000:30)}]));
  const result=compileChineseQueryBundles({...binding,packets,limits:{queries:16,bytes:256*1024,uncompressedBytes:2000}});
  assert.deepEqual(result.excluded.map(row=>row.query),[q[2]]);assert(!result.release.members.includes(q[2]));
  assert.equal(result.release.members.length,2);assert.equal(packets[2].results[0].meaning.length,4000);
  for(const descriptor of result.release.buckets){const bucket=JSON.parse(gunzipSync(result.files.get(descriptor.file)));
    for(const entry of bucket.entries){assert(entry.uncompressedBytes<=2000);assert(entry.bytes<=256*1024);}}
});

test('duplicate queries/heads, unknown metadata and imaginary complete-coverage labels are rejected',()=>{
  const p=packet('测试');assert.throws(()=>compileChineseQueryBundles({...binding,packets:[p,p]}));
  assert.throws(()=>compileChineseQueryBundles({...binding,packets:[packet('测试',[dto(),dto()])]}));
  assert.throws(()=>compileChineseQueryBundles({...binding,packets:[packet('测试',[dto('test'),dto('ｔｅｓｔ')])]}));
  for(const change of [{coverage:'complete'},{coverage:'expanded'},{privateNote:'not public metadata'}])
    assert.throws(()=>compileChineseQueryBundles({...binding,packets:[{...p,metadata:{...p.metadata,...change}}]}));
});

test('generated release is deeply frozen and empty bootstrap has64 valid buckets with no members',async()=>{
  const compiled=compileChineseQueryBundles({...binding,engineBinding:ZERO_ENGINE_BINDING,packets:[]});
  assert.equal(compiled.files.size,64);assert.equal(compiled.release.members.length,0);
  const text=renderChineseQueryCacheRelease(compiled.release,{bootstrap:true});assert(text.includes('Bootstrap only:'));
  const {CHINESE_QUERY_CACHE_RELEASE:release}=await import('data:text/javascript,'+encodeURIComponent(text));
  assert(Object.isFrozen(release));assert(Object.isFrozen(release.members));assert(Object.isFrozen(release.buckets));
  assert(Object.isFrozen(release.buckets[0]));assert(Object.isFrozen(release.selectionSources[0]));
  assert.throws(()=>release.buckets[0].bytes++,TypeError);
});

test('the same production writer/checker detects missing/corrupt artifacts or changed release without rewriting check inputs',async()=>temporary(async root=>{
  await mkdir(path.join(root,'vocab/js'),{recursive:true});
  const compiled=compileChineseQueryBundles({...binding,packets:[packet('测试')]});
  await writeOrCheckChineseQueryArtifacts(root,compiled);await writeOrCheckChineseQueryArtifacts(root,compiled,{check:true});
  const first=[...compiled.files.keys()][0],target=path.join(root,'vocab/data/chinese-query-cache',first);
  const original=await readFile(target);await writeFile(target,Buffer.concat([original,Buffer.from('wrong')]));
  await assert.rejects(writeOrCheckChineseQueryArtifacts(root,compiled,{check:true}),/Stale or corrupt/u);
  assert.equal((await readFile(target)).length,original.length+5);await writeFile(target,original);
  const release=path.join(root,'vocab/js/chinese-query-cache-release.js');await writeFile(release,(await readFile(release,'utf8'))+'// stale\n');
  await assert.rejects(writeOrCheckChineseQueryArtifacts(root,compiled,{check:true}),/Stale Chinese/u);
  await rm(target);await assert.rejects(writeOrCheckChineseQueryArtifacts(root,compiled,{check:true}),{code:'ENOENT'});
}));

test('shared spelling normalizer preserves interior spaces, qualifiers and negation without inventing semantic equivalence',()=>{
  assert.equal(normalizeChineseQueryCacheQuery(' “开心”！ '),'开心');
  assert.equal(normalizeChineseQueryCacheQuery('ＵＳＢ充电头'),'usb充电头');
  assert.equal(normalizeChineseQueryCacheQuery('开  心'),'开 心');
  assert.notEqual(normalizeChineseQueryCacheQuery('不开心'),normalizeChineseQueryCacheQuery('开心'));
  assert.notEqual(normalizeChineseQueryCacheQuery('开 心'),normalizeChineseQueryCacheQuery('开心'));
});
