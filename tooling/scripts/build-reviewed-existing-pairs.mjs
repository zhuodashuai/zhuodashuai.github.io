// Authenticate only exact, independently approved same-head reuse.
// Ordinary new-composition duplicate checks remain a separate default route.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {canonicalDisplayContexts} from '../../vocab/js/canonical-example-repair-source.js';
import {canonicalRepairSnapshot} from './build-canonical-example-repairs.mjs';
const ROOT=path.resolve(import.meta.dirname,'../..');
const admissions=new WeakMap();
export const TERMS=Object.freeze(['scary','downside','loo','perk','derail','unwind','binge','spree','funky','nutty','orchestrate','showcase']);
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=v=>sha(JSON.stringify(v));
const fold=s=>s.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
// This is a source-bound association release, not an arbitrary duplicate
// allowlist. Only the complete reviewed source and exact graph below qualify.
const SOURCE_HASH='98549e8230b147b67cbebb874c1333c1b681f24eaf241694fa63ce3a60d75ffb';
const REVIEW_HASH='ff573b1a7b177d75535110e0b82d18ce6f2d22fe1332d37763d2b683e769a21e';
const BINDING_BYTES='e1e3fc68725112921bc6e1a306e8e342433f752e728f65666bbf250db1b02f6b';
async function authenticateExistingPairEvidence({repo,sourceFile,bundleFile,sourceOverride,bundleOverride,collisionOverride}={}){
 const imported=rel=>import(pathToFileURL(path.join(repo,rel)));
 const {canonicalRepairSnapshot:snapshot,authenticateCanonicalRepairRecord}=await imported('tooling/scripts/build-canonical-example-repairs.mjs');
 const {loadExampleBuild,validateExampleReview,exampleSourceHash}=await imported('tooling/scripts/build-dictionary-examples.mjs');
 const {createAdditiveExamplesLoader}=await imported('vocab/js/dictionary-examples-additive.js');
 const {dictionaryExamplesRelease:release}=await imported('vocab/js/dictionary-examples-release-v4.js');
 const sourceBytes=await fs.readFile(sourceFile),bundleBytes=await fs.readFile(bundleFile);
 const originalSource=sourceOverride??JSON.parse(sourceBytes),originalBundle=bundleOverride??JSON.parse(bundleBytes);
 const source=snapshot(originalSource),bundle=snapshot(originalBundle);
 assert.deepEqual(source,JSON.parse(sourceBytes),'new role fields must bind the actual frozen source bytes');
 assert.equal(bundle.author,source.author);assert(/^AI\/[a-z0-9_-]{1,100}$/u.test(source.author));
 assert.equal(bundle.schemaVersion,1);assert.equal(bundle.selectedFullSourceSha256,hash(source));
 assert.equal(bundle.selectedFullSourceByteSha256,sha(sourceBytes));
 assert.deepEqual(bundle.entries.map(r=>r.term),TERMS);assert.deepEqual(source.entries.map(r=>r.term),TERMS);
 const inputs=new Map(),read=async rel=>{
  assert(typeof rel==='string'&&!path.isAbsolute(rel)&&!rel.split('/').includes('..'));
  const file=path.resolve(repo,rel);assert(file.startsWith(path.resolve(repo)+path.sep));
  const b=await fs.readFile(file),pin={file:rel,bytes:b.length,sha256:sha(b)};
  if(inputs.has(rel))assert.deepEqual(inputs.get(rel),pin);else inputs.set(rel,pin);return b;
 };
 const json=async rel=>JSON.parse(await read(rel));
 const manifestBytes=await read('vocab/data/expanded-dictionary/manifest.json'),manifest=JSON.parse(manifestBytes);
 assert.equal(sha(manifestBytes),release.source.manifestSha256);
 const records=new Map(),keys=new Map();
 for(const p of manifest.english.shards){const b=await read('vocab/data/expanded-dictionary/'+p.file);assert.equal(b.length,p.bytes);assert.equal(sha(b),p.sha256);const shard=JSON.parse(b);for(const r of shard.records){if(records.has(r.id))assert.deepEqual(records.get(r.id),r);else records.set(r.id,r);}for(const [key,refs]of shard.keys)keys.set(key,refs);}
 assert.equal(records.size,102609);
 // Inventory every ordinary original pair and every pair exposed by the seven
 // current overlay tables, including complete JSON-bound legacy entries.
 const additionalAuthored=[];
 for(const delta of (await json('tooling/dictionary/examples/additive-index-v4.json')).releases)for(const file of delta.sourceFiles)additionalAuthored.push(...validateExampleReview(await json('tooling/dictionary/examples/source/'+file),await json('tooling/dictionary/examples/reviews/'+file)));
 const full=await loadExampleBuild({additionalAuthored}),owners=new Map();let originalPairs=0;
 const reserve=(en,term)=>{assert(typeof en==='string'&&typeof term==='string');const key=fold(en);if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(term);};
 for(const entry of full.entries)for(const sense of entry.senses)for(const pair of sense.examples){reserve(pair.en,entry.term);originalPairs++;}
 assert.equal(full.entries.length,102609);assert.equal(originalPairs,103998);
 const visit=(value,inherited)=>{if(!value||typeof value!=='object')return;const owner=typeof value.term==='string'?value.term:inherited;
  if(typeof value.en==='string'&&typeof value.zh==='string'&&owner)reserve(value.en,owner);
  if(typeof value.exampleEn==='string'&&typeof value.exampleZh==='string'&&owner)reserve(value.exampleEn,owner);
  for(const [key,child]of Object.entries(value)){if(['originalDTOJSON','selectedEntryJSON'].includes(key)&&typeof child==='string')visit(JSON.parse(child),owner);else if(child&&typeof child==='object')visit(child,owner);}
 };
 const tables=[['canonical-example-repairs-data.js','CANONICAL_EXAMPLE_REPAIRS'],['dictionary-example-corrections-data.js','DICTIONARY_EXAMPLE_CORRECTIONS'],['everyday-lookup-data.js','EVERYDAY_LOOKUP_ENTRIES'],['reviewed-senses-data.js','REVIEWED_SENSE_ENTRIES'],['canonical-example-components-data.js','CANONICAL_EXAMPLE_COMPONENTS'],['selected-common-sense-data.js','SELECTED_COMMON_SENSE_BINDINGS'],['selected-legacy-examples-data.js','SELECTED_LEGACY_EXAMPLE_BINDINGS']];
 for(const [file,key]of tables){await read('vocab/js/'+file);visit((await imported('vocab/js/'+file))[key],null);}
 if(collisionOverride)collisionOverride(owners);
 const checked=[];
 for(const row of bundle.entries){
  const next=source.entries.find(r=>r.term===row.term);assert.equal(hash(source),row.newFullPackSha256);assert.equal(sha(sourceBytes),row.newFullPackByteSha256);assert.deepEqual(next,row.newSourceRow);assert.equal(hash(next),row.newSourceRowSha256);
  assert.equal(row.independentFullGlossApproval,false);assert.equal(row.technicalIndependentReview,false);assert.equal(row.nativeAdmission,false);
  assert.equal(row.canonicalManifest.file,'vocab/data/expanded-dictionary/manifest.json');assert.equal(row.canonicalManifest.bytes,manifestBytes.length);assert.equal(row.canonicalManifest.sha256,sha(manifestBytes));assert.equal(row.canonicalManifest.sourceVersion,manifest.version);
  const canonical=await authenticateCanonicalRepairRecord({term:row.term,canonicalId:row.canonicalId,canonicalSourceSha256:row.canonicalSourceSha256,canonicalManifestSha256:row.canonicalManifest.sha256,exactCanonicalRecord:row.fullCanonicalRecord,canonicalSourceDescriptor:row.sourceDescriptor},{version:manifest.version,manifestSha256:sha(manifestBytes)},{readPublicAsset:rel=>read('vocab/data/'+rel)});
  assert.deepEqual(canonical,records.get(row.canonicalId));assert.equal(next.canonicalId,row.canonicalId);assert.equal(next.canonicalSourceSha256,row.canonicalSourceSha256);
  const pointer=row.canonicalSourcePointer,p=manifest.english.shards[pointer.bucket];assert.deepEqual({...p,recordIndex:pointer.recordIndex},pointer);assert.deepEqual(JSON.parse(await read('vocab/data/expanded-dictionary/'+p.file)).records[pointer.recordIndex],canonical);
  for(const form of next.englishForms){const refs=keys.get(fold(form));assert(refs?.length);assert(refs.every(r=>r.id===canonical.id&&r.kind!=='canonical'),row.term+' form ownership');}
  const origin=row.origin;assert(/^tooling\/dictionary\/examples\/source\/batch-\d{4}-[a-z0-9-]+\.json$/u.test(origin.sourceFile));assert.equal(origin.reviewFile,origin.sourceFile.replace('/source/','/reviews/'));
  const sb=await read(origin.sourceFile),rb=await read(origin.reviewFile);assert.equal(sha(sb),origin.sourceByteSha256);assert.equal(sha(rb),origin.reviewByteSha256);
  const oldSource=JSON.parse(sb),oldReview=JSON.parse(rb),approved=validateExampleReview(oldSource,oldReview);assert.equal(exampleSourceHash(oldSource),origin.sourceSemanticSha256);
 assert(Number.isSafeInteger(origin.entryIndex)&&origin.entryIndex>=0);
 const entry=oldSource.entries[origin.entryIndex];assert.deepEqual(entry,origin.completeSourceEntry);assert.equal(hash(entry),origin.sourceEntrySha256);
  const admitted=approved.find(p=>p.term===row.term);assert(admitted);const {reviewer:oldReviewer,...admittedPair}=admitted;assert.deepEqual(admittedPair,entry);assert.equal(oldReviewer,oldReview.reviewer);assert.equal(origin.historicalReviewer,oldReview.reviewer);assert.equal(origin.historicalAuthorPrincipal,oldSource.author??null);
  assert.deepEqual(row.oldFiveFieldPair,entry);assert.equal(hash(entry),row.oldFiveFieldPairSha256);assert.equal(entry.term,row.term);
  assert.equal(next.en,entry.en);assert.equal(next.zh,entry.zh);assert.equal(row.exactEnglishReused,true);assert.equal(row.exactChineseExampleReused,true);
  const pos=new Set(next.partOfSpeech.split(/\s*·\s*/u));assert(entry.partOfSpeech.split(/\s*·\s*/u).every(p=>pos.has(p)));
  const seenAssets=new Set(),loader=createAdditiveExamplesLoader(release,{fetchImpl:async input=>{const u=new URL(input);assert.equal(u.protocol,'file:');const rel=path.relative(repo,fileURLToPath(u)).replaceAll('\\','/');const b=await read(rel);seenAssets.add(rel);return new Response(b);}});
  let old;try{old=await loader.load(row.term,{lookupQuery:row.term});}finally{loader.close();}
  assert.deepEqual(old,row.completeOldDTO);assert.equal(hash(old),row.completeOldDTOSha256);assert.equal(old.term,row.term);assert.equal(old.senses.length,1);assert.equal(old.senses[0].examples.length,1);
  const sense=old.senses[0];assert.deepEqual({term:old.term,partOfSpeech:sense.partOfSpeech,meaningZh:sense.meaningZh,...sense.examples[0]},entry);
  const asset='vocab/data/dictionary-examples/'+row.oldExampleAsset.file;assert(seenAssets.has(asset),'claimed immutable asset was actually read');const ab=await read(asset);assert.equal(ab.length,row.oldExampleAsset.bytes);assert.equal(sha(ab),row.oldExampleAsset.sha256);
  const collisionOwners=owners.get(fold(entry.en));assert(collisionOwners);assert.deepEqual([...collisionOwners],[row.term],'only the original same head may own reused English');
  checked.push({term:row.term,canonicalId:canonical.id,canonicalSourceSha256:row.canonicalSourceSha256,oldDTOSha256:hash(old),oldPairSha256:hash(entry),newRoleRowSha256:hash(next),pairIsNewComposition:false,canonicalSourceChanged:false});
 }
 assert.deepEqual(snapshot(originalSource),source);assert.deepEqual(snapshot(originalBundle),bundle);
 assert.deepEqual(await fs.readFile(sourceFile),sourceBytes);assert.deepEqual(await fs.readFile(bundleFile),bundleBytes);
 for(const pin of inputs.values()){const b=await fs.readFile(path.join(repo,pin.file));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
 return {verifiedSource:source,verifiedBindings:bundle.entries,technicalSameHeadBindingsVerified:!collisionOverride,testOnlyCollisionOverrideUsed:Boolean(collisionOverride),checked,counts:{canonicalHeads:records.size,originalPairs,overlayTables:tables.length,normalizedEnglishKeys:owners.size},inputPins:[...inputs.values()],newExamplePairs:0,languageApproval:false,nativeAdmission:false,compiledRowsEmitted:0,productWrites:0};
}

/** Mint a non-serializable capability only after independent gloss approval,
 * exact original-pair authentication, canonical ownership and the complete
 * collision inventory have all passed. Caller booleans and cloned objects
 * cannot create or widen this capability. */
export async function createReviewedExistingPairAdmission(pack,review,{sourceFile,reviewFile,bindingFile}={}){
 assert.equal(sourceFile,'batch-0014.json');assert.equal(reviewFile,'batch-0014.json');
 assert.equal(bindingFile,'existing-pairs/source/common-use-0020.json');
 const sourcePath=path.join(ROOT,'tooling/dictionary/reviewed-senses/source',sourceFile);
 const reviewPath=path.join(ROOT,'tooling/dictionary/reviewed-senses/reviews',reviewFile);
 const bindingPath=path.join(ROOT,'tooling/dictionary/reviewed-senses',bindingFile);
 const {canonicalRepairSnapshot:snapshot}=await import('./build-canonical-example-repairs.mjs');
 const source=snapshot(pack),approval=snapshot(review);
 const sourceBytes=await fs.readFile(sourcePath),reviewBytes=await fs.readFile(reviewPath),bindingBytes=await fs.readFile(bindingPath);
 assert.deepEqual(source,JSON.parse(sourceBytes));assert.deepEqual(approval,JSON.parse(reviewBytes));
 assert.equal(hash(source),SOURCE_HASH);assert.equal(hash(approval),REVIEW_HASH);assert.equal(sha(bindingBytes),BINDING_BYTES);
 assert.equal(approval.sourceSha256,SOURCE_HASH);assert.equal(approval.independentOfAuthor,true);
 assert.notEqual(approval.reviewer,source.author);assert(/^AI\/[a-z0-9_-]{1,100}$/u.test(approval.reviewer));
 assert.deepEqual(approval.approvedTerms,TERMS);assert.deepEqual(approval.issues,[]);
 const evidence=await authenticateExistingPairEvidence({repo:ROOT,sourceFile:sourcePath,bundleFile:bindingPath});
 assert.equal(evidence.technicalSameHeadBindingsVerified,true);assert.equal(evidence.testOnlyCollisionOverrideUsed,false);
 assert.deepEqual(evidence.checked.map(row=>row.term),TERMS);assert.equal(evidence.newExamplePairs,0);
 for(const [file,bytes]of [[sourcePath,sourceBytes],[reviewPath,reviewBytes],[bindingPath,bindingBytes]])assert.deepEqual(await fs.readFile(file),bytes);
 const admission=Object.freeze({});
 admissions.set(admission,{sourceHash:SOURCE_HASH,reviewHash:REVIEW_HASH,
   bindings:new Map(evidence.verifiedBindings.map(row=>[row.term,row])),
   evidence:{checked:evidence.checked,counts:evidence.counts,inputPins:evidence.inputPins}});
 return admission;
}

/** Ordinary duplicate detection remains strict without this exact capability.
 * Even a genuine capability cannot approve another row, translation or owner. */
export function canReuseReviewedExistingPair(admission,pack,review,row,existingOwner){
 const value=admissions.get(admission);if(!value)return false;
 let source,approval,input;try{source=canonicalRepairSnapshot(pack);approval=canonicalRepairSnapshot(review);input=canonicalRepairSnapshot(row);}catch{return false;}
 const binding=value.bindings.get(input.term);
 return Boolean(binding&&existingOwner===input.term&&hash(source)===value.sourceHash&&hash(approval)===value.reviewHash
   &&hash(input)===binding.newSourceRowSha256&&input.canonicalId===binding.canonicalId
   &&input.canonicalSourceSha256===binding.canonicalSourceSha256
   &&input.en===binding.oldFiveFieldPair.en&&input.zh===binding.oldFiveFieldPair.zh);
}

/** Keep the old pair's complete identity and specific learning label. The main
 * card may have several richer meanings; its example does not acquire all of
 * those POS/senses simply because the English sentence is being reused. */
export function projectReviewedExistingPairRows(admission,pack,review,rows){
 const value=admissions.get(admission);assert(value,'Missing native existing-pair capability');
 pack=canonicalRepairSnapshot(pack);review=canonicalRepairSnapshot(review);rows=canonicalRepairSnapshot(rows);
 assert.equal(hash(pack),value.sourceHash);assert.equal(hash(review),value.reviewHash);
 assert.deepEqual(rows.map(row=>row.term),TERMS);
 return rows.map(row=>{
   const binding=value.bindings.get(row.term),source=pack.entries.find(entry=>entry.term===row.term);
   assert(canReuseReviewedExistingPair(admission,pack,review,source,row.term));
   const expected={term:source.term,partOfSpeech:source.partOfSpeech,meaning:source.meaning,
     chineseAliases:source.chineseAliases,englishForms:source.englishForms,en:source.en,zh:source.zh,references:source.references,
     dictionarySource:'卓式词典·义项补充',exampleSource:pack.exampleSource??'原创例句·AI复核（精选义项）',exampleReviewer:review.reviewer,
     reviewedCanonicalSense:true,retainLegacyChinese:false,canonicalId:source.canonicalId,canonicalSourceSha256:source.canonicalSourceSha256};
   assert.deepEqual(row,expected);
   const old=binding.completeOldDTO;
   const contexts=[...canonicalDisplayContexts(binding.fullCanonicalRecord),
     ...old.senses.map(sense=>({term:row.term,partOfSpeech:sense.partOfSpeech,meaning:sense.meaningZh})),
     {term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning}];
   return {...row,existingExampleDTOJSON:JSON.stringify(old),
     existingExampleContextsJSON:JSON.stringify([...new Map(contexts.map(context=>[JSON.stringify(context),context])).values()]),
     existingExampleSourceVersion:binding.canonicalManifest.sourceVersion,
     existingExampleManifestSha256:binding.canonicalManifest.sha256};
 });
}
