// E tests Root's builder/lineage/suggestions integration. E authored the pure
// semantic engine: these are NOT an independent approval of that engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {loadOriginalCatalogue} from '../lib/original-dictionary-catalogue.mjs';
import {verifyDictionarySupplement} from '../lib/dictionary-supplement.mjs';
import {verifyDictionaryPos} from '../lib/dictionary-pos.mjs';
import {verifyDictionarySourceRevisions} from '../lib/dictionary-source-revisions.mjs';
import {verifyDictionaryPosNotationRevisions} from '../lib/dictionary-pos-notation-revisions.mjs';
import {getSemanticAuthority} from '../lib/dictionary-semantic-authorities.mjs';
import {SEMANTIC_RUNTIME_SOURCE,SEMANTIC_BASE_VERSION} from '../lib/dictionary-semantic-revisions.mjs';
import {readHistoricalDictionaryNamespace,loadVerifiedSemanticRevision,assertExactSemanticNamespace,dictionaryNamespaceVersion} from '../lib/dictionary-source-lineage.mjs';
import {generateExpandedDictionary,recoverPinnedExpandedSeedArchive,buildExpandedDictionary,validateExpandedBuild,expandedSha256,expandedBucket,expandedKey,expandedChineseTokens} from '../scripts/build-expanded-dictionary.mjs';
import {buildDictionarySuggestions,dictionarySuggestionPriority} from '../scripts/build-dictionary-suggestions.mjs';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
const ROOT=path.resolve(import.meta.dirname,'../..'),cmp=(a,b)=>a<b?-1:a>b?1:0;
const json=async file=>JSON.parse(await readFile(path.join(ROOT,file),'utf8'));
const revision=async name=>Promise.all(['.json','.integrity.json','.review.json'].map(s=>json('tooling/dictionary/source-revisions/'+name+s)));
const authority=getSemanticAuthority('semantic-common-five-0001'),targets=new Map(authority.targets.map(r=>[r.term,r])),targetIds=new Set(authority.targets.map(r=>r.id));
const namespace=build=>({manifest:build.manifest,records:new Map(build.records.map(r=>[r.term,r])),keys:new Map(build.manifest.english.shards.flatMap(d=>JSON.parse(build.files.get(d.file)).keys)),tokens:new Map(build.manifest.chinese.shards.flatMap(d=>JSON.parse(build.files.get(d.file)).postings))});
const englishShards=build=>new Map(build.manifest.english.shards.map(d=>[d.file,build.files.get(d.file)]));
const clone=value=>structuredClone(value);
// Fully rederive root, all256 file bodies/descriptors and lookup copies. No
// generated files are written, even for the adversarial self-consistent data.
function reseal(n){
 const records=[...n.records.values()].sort((a,b)=>a.id-b.id),keyRows=[...n.keys].sort(([a],[b])=>cmp(a,b)),tokenRows=[...n.tokens].sort(([a],[b])=>cmp(a,b));
 const sources=clone(n.manifest.sources),counts={records:records.length,englishKeys:keyRows.length,chineseTokens:tokenRows.length};
 const version=expandedSha256(JSON.stringify({records,keyRows,tokenRows,sources,counts})),byId=new Map(records.map(r=>[r.id,r]));
 const en=Array.from({length:128},()=>[]),zh=Array.from({length:128},()=>[]);for(const row of keyRows)en[expandedBucket(row[0])].push(row);for(const row of tokenRows)zh[expandedBucket(row[0])].push(row);
 const files=new Map(),english={buckets:128,shards:[]},chinese={buckets:128,shards:[]};
 for(let bucket=0;bucket<128;bucket++){
  const ids=[...new Set(en[bucket].flatMap(([,refs])=>refs.map(r=>r.id)))].sort((a,b)=>a-b);
  for(const[kind,payload,part,count]of[['en',{schemaVersion:2,kind:'en',bucket,records:ids.map(id=>byId.get(id)),keys:en[bucket]},english,en[bucket].length],['zh',{schemaVersion:2,kind:'zh',bucket,postings:zh[bucket]},chinese,zh[bucket].length]]){
   const file=version+'/'+kind+'-'+String(bucket).padStart(3,'0')+'.json',bytes=JSON.stringify(payload)+'\n';files.set(file,bytes);part.shards.push({bucket,file,sha256:expandedSha256(bytes),bytes:Buffer.byteLength(bytes),count});
  }
 }
 const manifest={schemaVersion:2,version,counts,sources,english,chinese};
 const result={manifest,records,files};assert.equal(dictionaryNamespaceVersion(namespace(result)),version);
 for(const d of [...english.shards,...chinese.shards]){assert.equal(expandedSha256(files.get(d.file)),d.sha256);assert.equal(Buffer.byteLength(files.get(d.file)),d.bytes);}
 return result;
}
async function outputSnapshot(){
 const paths=new Set(['vocab/data/owner-wordbook.json','vocab/data/book-passages.json','vocab/data/ecdict-core.json','vocab/data/member-dictionary.json','tooling/dictionary/examples/index.json']);
 for(const directory of ['vocab/data/expanded-dictionary','vocab/data/dictionary-examples','vocab/data/dictionary-suggestions']){
  async function walk(relative){for(const entry of await readdir(path.join(ROOT,relative),{withFileTypes:true})){const file=relative+'/'+entry.name;if(entry.isDirectory())await walk(file);else paths.add(file);}}
  await walk(directory);
 }
 const rows=[];for(const file of [...paths].sort()){try{const b=await readFile(path.join(ROOT,file));rows.push([file,b.length,expandedSha256(b)]);}catch(error){if(error.code!=='ENOENT')throw error;rows.push([file,'absent']);}}
 return rows;
}
let shared;
async function fixture(){return shared??= (async()=>{
 const beforeFiles=await outputSnapshot();let networkCalls=0;const originalFetch=globalThis.fetch;
 let preview;try{globalThis.fetch=async()=>{networkCalls++;throw Error('No online lookup is allowed in this local preview');};preview=await generateExpandedDictionary({root:ROOT,preview:true});}finally{globalThis.fetch=originalFetch;}
 assert.equal(networkCalls,0);assert.deepEqual(await outputSnapshot(),beforeFiles,'Preview must not write a namespace, pointers, examples, suggestions or public sidecars');
 const baseline=await readHistoricalDictionaryNamespace(SEMANTIC_BASE_VERSION,{root:ROOT});
 const seedIntegrity=await json('tooling/dictionary/expanded-source-integrity.json'),prepared=await recoverPinnedExpandedSeedArchive({root:ROOT,integrity:seedIntegrity});
 const catalogue=await loadOriginalCatalogue({indexPath:path.join(ROOT,'tooling/dictionary/source/index.json'),reviewDirectory:path.join(ROOT,'tooling/dictionary/reviews')});
 const inputs={prepared,corePayload:await json('vocab/data/ecdict-core.json'),publicPayload:await json('vocab/data/owner-wordbook.json'),originalPack:catalogue.pack,
  supplementPack:verifyDictionarySupplement(await json('tooling/dictionary/supplements/import-2026-10-19.json'),await json('tooling/dictionary/supplements/integrity.json')),
  posPack:verifyDictionaryPos(await json('tooling/dictionary/pos/pos-completion-2026-10-19.json'),await json('tooling/dictionary/pos/integrity.json')),
  sourceRevisionPack:verifyDictionarySourceRevisions(...await revision('finite-grammar-0001')),posNotationRevisionPack:verifyDictionaryPosNotationRevisions(...await revision('finite-pos-notation-0001'))};
 const oldBuild=buildExpandedDictionary(inputs);assert.deepEqual(await outputSnapshot(),beforeFiles);
 return{preview,baseline,oldBuild,proposed:namespace(preview.build),beforeFiles};
 })();}

test('actual read-only production preview and no-semantic build preserve raw archive and all disk assets',async t=>{
 const f=await fixture();assert.equal(f.preview.kind,'in-memory-only-preview-not-written-or-admitted');
 assert.equal(f.oldBuild.manifest.version,SEMANTIC_BASE_VERSION);assert.deepEqual(f.oldBuild.manifest,f.baseline.manifest);assert.equal(validateExpandedBuild(f.oldBuild).canonicalRecords,102609);
 for(const d of [...f.baseline.manifest.english.shards,...f.baseline.manifest.chinese.shards])assert.equal(f.oldBuild.files.get(d.file),await readFile(path.join(ROOT,'vocab/data/expanded-dictionary',d.file),'utf8'));
 assert.equal(f.preview.verification.canonicalRecords,102609);assert.equal(f.preview.verification.allHanPostingsVerified,true);
 assert.deepEqual([...f.preview.sourceTransition.changedTerms].sort(),[...targets.keys()].sort());assert.equal(f.preview.sourceTransition.unchangedRecords,102604);
 assert.deepEqual(f.preview.predecessorNotationTransition.changedTerms,['headdress','longingly','moonless']);assert.equal(f.preview.predecessorNotationTransition.unchangedRecords,102606);
 t.diagnostic('eSemanticPreview '+JSON.stringify({version:f.preview.build.manifest.version,counts:f.preview.build.manifest.counts,transition:f.preview.sourceTransition,diskPathsCompared:f.beforeFiles.length,existingFilesCompared:f.beforeFiles.filter(r=>r[1]!=='absent').length,absentPathsPreserved:f.beforeFiles.filter(r=>r[1]==='absent').map(r=>r[0]),networkCalls:0,materialized:false,coverageAdded:0}));
});
test('complete five after-records match authority, protected fields/seeds and all140858 English rows are exact',async()=>{
 const f=await fixture(),cap=await loadVerifiedSemanticRevision({root:ROOT});let changed=0,unchanged=0;
 for(const[term,old]of f.baseline.records){const actual=f.proposed.records.get(term),expected=cap.entries.find(r=>r.term===term);if(expected){changed++;assert.deepEqual(actual,expected.after);for(const key of Object.keys(old))if(!authority.allowedChangedFields.includes(key))assert.deepEqual(actual[key],old[key]);}else{unchanged++;assert.deepEqual(actual,old);}}
 assert.equal(changed,5);assert.equal(unchanged,102604);assert.equal(f.proposed.records.size,102609);assert.equal(f.proposed.keys.size,140858);assert.deepEqual(f.proposed.keys,f.baseline.keys);
 assert.deepEqual(f.proposed.manifest.sources,{...f.baseline.manifest.sources,'semantic-editorial':{...SEMANTIC_RUNTIME_SOURCE,sha256:authority.candidate.sha256}});
 assert.equal(f.proposed.manifest.sources['semantic-editorial'].license.length,66);
});
test('POS audit separates historical grammar count from later notation/semantic counts and actual final source count',async()=>{
 const f=await fixture(),p=f.preview.build.report.posReview;
 const grammar=(await revision('finite-grammar-0001'))[0],notation=(await revision('finite-pos-notation-0001'))[0],semantic=await loadVerifiedSemanticRevision({root:ROOT});
 const byStage=[{id:grammar.id,count:grammar.entries.filter(r=>r.before.source==='pos-reviewed').length},{id:notation.id,count:notation.entries.filter(r=>r.before.source==='pos-reviewed').length},{id:semantic.authorityId,count:semantic.entries.filter(r=>r.before.source==='pos-reviewed').length}];
 assert.deepEqual(p.supersededPosReviewedByStage,byStage);assert.deepEqual(byStage.map(r=>r.count),[4,0,5]);
 assert.equal(p.subsequentlyRevised,4);assert.match(p.subsequentlyRevisedScope,/Historical grammar-stage count only/u);
 assert.equal(p.finalPosReviewed,f.preview.build.records.filter(r=>r.source==='pos-reviewed').length);
 assert.equal(p.applied,p.finalPosReviewed+byStage.reduce((sum,r)=>sum+r.count,0));assert.match(p.finalPosReviewedScope,/not new POS approval/u);
});
test('every Chinese add/removal is limited to five IDs and derives only from final active meanings',async t=>{
 const f=await fixture();let changedRows=0;const additions=[],removals=[];
 for(const token of new Set([...f.baseline.tokens.keys(),...f.proposed.tokens.keys()])){
  const old=f.baseline.tokens.get(token)||[],now=f.proposed.tokens.get(token)||[];
  assert.deepEqual(now.filter(id=>!targetIds.has(id)),old.filter(id=>!targetIds.has(id)));
  if(JSON.stringify(old)!==JSON.stringify(now))changedRows++;
  for(const id of now.filter(id=>!old.includes(id))){assert(targetIds.has(id));additions.push([token,id]);}
  for(const id of old.filter(id=>!now.includes(id))){assert(targetIds.has(id));removals.push([token,id]);}
 }
 for(const id of targetIds){const row=[...f.proposed.records.values()].find(r=>r.id===id),wanted=new Set([row,...(row.variants||[])].flatMap(r=>expandedChineseTokens(r.meaning)));
  for(const[token,ids]of f.proposed.tokens)assert.equal(ids.includes(id),wanted.has(token));for(const token of wanted)assert(f.proposed.tokens.get(token)?.includes(id));}
 assert.equal(changedRows,f.preview.sourceTransition.changedChineseTokens);assert(additions.length>0&&removals.length>0);
 t.diagnostic('eSemanticChineseDelta '+JSON.stringify({changedRows,addedPostingPairs:additions.length,removedPostingPairs:removals.length,targetIds:[...targetIds].sort((a,b)=>a-b)}));
});
test('independent full resealing reproduces every byte of Root in-memory output',async()=>{
 const f=await fixture(),sealed=reseal(clone(f.proposed));assert.deepEqual(sealed.manifest,f.preview.build.manifest);assert.deepEqual(sealed.files,f.preview.build.files);
 assert.equal(validateExpandedBuild(sealed).canonicalRecords,102609);
 assert.equal(assertExactSemanticNamespace(f.baseline,namespace(sealed),await loadVerifiedSemanticRevision({root:ROOT})).unchangedRecords,102604);
});

const namespaceMutations=[
 ['reactivated old technical variants',n=>{n.records.get('affordable').variants=[{partOfSpeech:'',meaning:'[计] 普及型',source:'mit'}];}],
 ['stale target Chinese posting',n=>{const id=targets.get('download').id,ids=n.tokens.get('卸载')||[];n.tokens.set('卸载',[...new Set([...ids,id])].sort((a,b)=>a-b));}],
 ['non-target posting removed',n=>{const[token,ids]=[...n.tokens].find(([,ids])=>ids.some(id=>!targetIds.has(id))),removed=ids.find(id=>!targetIds.has(id));const next=ids.filter(id=>id!==removed);if(next.length)n.tokens.set(token,next);else n.tokens.delete(token);}],
 ['target active posting removed',n=>{const id=targets.get('affordable').id,token=expandedChineseTokens(n.records.get('affordable').meaning)[0],ids=n.tokens.get(token).filter(x=>x!==id);if(ids.length)n.tokens.set(token,ids);else n.tokens.delete(token);}],
 ['canonical reference dropped',n=>{const key='download';const refs=n.keys.get(key).filter(r=>!(r.id===targets.get(key).id&&r.kind==='canonical'));if(refs.length)n.keys.set(key,refs);else n.keys.delete(key);}],
 ['legitimate download form dropped',n=>{n.keys.delete('downloading');}],
 ['unrelated full record changed',n=>{n.records.get('happy').meaning+=' 非授权新义';}],
 ['extra canonical head',n=>{const term='e-negative-extra-head',id=20000000+expandedBucket(expandedKey(term));n.records.set(term,{id,term,partOfSpeech:'noun',meaning:'额外词头',forms:[],source:'mit'});n.keys.set(term,[{id,kind:'canonical'}]);}],
 ['source licensing claim changed',n=>{n.manifest.sources['semantic-editorial'].license='MIT';}],
 ['invented empty Chinese token',n=>{n.tokens.set('虚构空项',[]);}]
];
for(const[label,mutate]of namespaceMutations)test('fresh finite lineage gate rejects fully resealed '+label,async()=>{
 const f=await fixture(),bad=clone(f.proposed);mutate(bad);const sealed=reseal(bad);assert.notEqual(sealed.manifest.version,f.preview.build.manifest.version);
 const fresh=await loadVerifiedSemanticRevision({root:ROOT});assert.throws(()=>assertExactSemanticNamespace(f.baseline,namespace(sealed),fresh));
});

test('all suggestion canonical rows/tiers stay exact, new dictionary root is the only selection input version change',async()=>{
 const f=await fixture(),old=buildDictionarySuggestions({manifest:f.oldBuild.manifest,shards:englishShards(f.oldBuild)}),now=buildDictionarySuggestions({manifest:f.preview.build.manifest,shards:englishShards(f.preview.build)});
 assert.deepEqual(now.rows,old.rows);assert.deepEqual(now.manifest.counts,old.manifest.counts);assert.equal(now.manifest.counts.canonicalHeads,102609);
 assert.equal(now.manifest.dictionaryVersion,f.preview.build.manifest.version);assert.notEqual(now.manifest.version,old.manifest.version);
 for(const term of targets.keys()){assert.equal(dictionarySuggestionPriority(f.proposed.records.get(term)),dictionarySuggestionPriority(f.baseline.records.get(term)));assert.equal(now.rows.find(r=>r[0]===term)?.[1],2);}
});
for(const[label,mutate]of[
 ['over200 long licence',n=>{n.manifest.sources['semantic-editorial'].license='x'.repeat(201);}],
 ['wrong descriptor source hash',n=>{n.manifest.sources['semantic-editorial'].sha256='0'.repeat(64);}],
 ['extra runtime descriptor ID',n=>{n.manifest.sources['semantic-editorial'].id='semantic-editorial';}],
 ['proper descriptor unrelated record relabelled',n=>{n.records.get('happy').source='semantic-editorial';}],
 ['proper descriptor changed reviewed record',n=>{n.records.get('affordable').meaning='免费的';}],
 ['proper descriptor one of five no longer semantic',n=>{n.records.get('affordable').source='mit';}],
 ['proper descriptor semantic alternative tuple',n=>{const r=n.records.get('happy');r.variants=[...(r.variants||[]),{partOfSpeech:'adjective',meaning:'伪造义项',source:'semantic-editorial'}];}]
])test('suggestions reject fully resealed '+label,async()=>{
 const f=await fixture(),bad=clone(f.proposed);mutate(bad);const sealed=reseal(bad);assert.throws(()=>buildDictionarySuggestions({manifest:sealed.manifest,shards:englishShards(sealed)}),/semantic|provenance/u);
});
function assetFetch(build,calls){return async(url,options)=>{const parsed=new URL(url),suffix=parsed.pathname.split('/expanded-dictionary/')[1];calls.push({url:parsed.href,credentials:options?.credentials});assert(suffix&&!parsed.pathname.includes('/api/'));assert.equal(options?.credentials,'omit');return suffix==='manifest.json'?new Response(JSON.stringify(build.manifest)):build.files.has(suffix)?new Response(build.files.get(suffix)):new Response('',{status:404});};}
for(const side of ['before','after'])test('finite lineage refuses '+side+' Map keys swapped around identical fully hashed record values',async()=>{
 const f=await fixture(),bad=clone(side==='before'?f.baseline:f.proposed),[[a,ra],[b,rb]]=[...bad.records].slice(0,2);
 bad.records.set(a,rb);bad.records.set(b,ra);
 assert.equal(dictionaryNamespaceVersion(bad),side==='before'?f.baseline.manifest.version:f.proposed.manifest.version,'This malformed wrapper is not rejected by merely changing a content root');
 const fresh=await loadVerifiedSemanticRevision({root:ROOT});assert.throws(()=>assertExactSemanticNamespace(side==='before'?bad:f.baseline,side==='after'?bad:f.proposed,fresh),/key|identity|term/u);
});
test('actual formatter reads five selected sources and all legitimate download forms without API/cookie access',async()=>{
 const f=await fixture(),calls=[],fetchImpl=assetFetch(f.preview.build,calls);
 for(const term of [...targets.keys(),'downloaded','downloading','downloads']){const response=await searchExpandedDictionary(term,{fetchImpl});assert.equal(response.results.length,1);const result=response.results[0],canonical=targets.has(term)?term:'download';assert.equal(result.term,canonical);assert.equal(result.partOfSpeech,f.proposed.records.get(canonical).partOfSpeech);assert.equal(result.source,SEMANTIC_RUNTIME_SOURCE.name);assert.equal(result.license,SEMANTIC_RUNTIME_SOURCE.license);assert.equal(result.url,SEMANTIC_RUNTIME_SOURCE.url);assert.equal(result.alternatives,undefined);}
 assert(calls.length>0);assert(calls.every(r=>!r.url.includes('/api/')&&r.credentials==='omit'));
});
test('actual client200 metadata boundary rejects an overlong semantic licence even with fully resealed bytes',async()=>{
 const f=await fixture(),bad=clone(f.proposed);bad.manifest.sources['semantic-editorial'].license='x'.repeat(201);const sealed=reseal(bad),calls=[];
 await assert.rejects(searchExpandedDictionary('download',{fetchImpl:assetFetch(sealed,calls)}),/格式/u);assert.equal(calls.length,1);
});
