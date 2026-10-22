/** Three exact source-bound admissions only. Default mode is read-only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {verifyDictionaryPosNotationRevisions} from '../lib/dictionary-pos-notation-revisions.mjs';
import {readDictionaryNamespace,assertHistoricalDictionaryLineage,SOURCE_LINEAGE_NOTATION_BASE_VERSION} from '../lib/dictionary-source-lineage.mjs';
import {exampleSourceHash,validateExampleReview,validateExampleSourceIndex,loadExampleBuild} from './build-dictionary-examples.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';

const ROOT=path.resolve(import.meta.dirname,'../..');
const SOURCE_VERSION='5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432';
const EXAMPLE_VERSION='e929d35b959c01772ab80d36db38775c7ecf8d4490c28c6928a3d29674f30ebc';
const EXAMPLE_MANIFEST_SHA='27ec47fe51962cacf4a1829eb8c3bf71d4d2ea4bcd9eea39f92cba43863c86e1';
const INDEX_FILE='tooling/dictionary/examples/index.json';
const INDEX_SHA='69e2f317cb0c2ebb52d59ffcb5be539e835d7ec930eb0d3ad0bf402a0feea58a';
const AUTHORITY_FILE='tooling/dictionary/source-revisions/finite-pos-notation-0001.admission-review.json';
const AUTHORITY_SHA='7b5b3cb13e10be6d1e9989bc0585e838a860a16ff479d71cb54dc9b12b4f11b1';
const UPSTREAM_CODE_PINS=Object.freeze([
 {file:'tooling/lib/dictionary-pos-notation-revisions.mjs',bytes:14210,sha256:'5d9bdb235624a8251b8df09e3eccf81bae44715e6b2bdeb7d1f17a35f9370c7f'},
 {file:'tooling/scripts/build-expanded-dictionary.mjs',bytes:40543,sha256:'dc4fff2b8f512d2b66568863e13a4889ea40ce3e3078c26ab61488ac7642c43f'},
 {file:'tooling/scripts/build-dictionary-suggestions.mjs',bytes:11996,sha256:'2fc7ccc2710d2169b10c5a6eb3cb78ff2f23368d618ce73f022884e62d9d2b51'},
 {file:'tooling/lib/dictionary-seed-archive.mjs',bytes:3052,sha256:'244d08a47c10828efb9324e836131017322e3edbda1c4fc51477908ab8aad51b'},
 {file:'vocab/js/expanded-dictionary.js',bytes:30806,sha256:'36ed1861693ef23bc4d0d82a361725a9fcd14db3d4faadb216bda5ce1b18b804'},
 {file:'vocab/dictionary-pos-notation-revisions.html',bytes:3725,sha256:'62c9a3e6075c6ae8a1a84ce2110a7a93594253191b4c00a7f4bf7198a85ed87a'}
]);
// Importer dependency pins, not a claim that E's language receipt audited them.
const TRUSTED_MODULE_PINS=Object.freeze([
 {file:'tooling/lib/dictionary-source-lineage.mjs',bytes:13710,sha256:'7083fd8b5c707264d15f73e60ac244d0d77deb067e6aded871c62e6dadaacf43'},
 {file:'tooling/scripts/build-dictionary-examples.mjs',bytes:9669,sha256:'04a53f1ba02a97a273171245b6e66e266a62733479b91f50819281c7223b2227'},
 {file:'vocab/js/dictionary-examples.js',bytes:14335,sha256:'4698ca47988159d9f07286c79db8861c2ce2263038669b83cb5967912689a474'},
 {file:'tooling/lib/original-dictionary-catalogue.mjs',bytes:6047,sha256:'b5aa801d990c0337bb128faacf1b1e883c4f6b519ce3b3631b7437c714469ebe'},
 {file:'tooling/lib/original-dictionary.mjs',bytes:9971,sha256:'3a96afe9ffcd5c7e8615f91842569913590fd0446c4d40d491acb25e09b83be9'},
 {file:'tooling/lib/dictionary-source-revisions.mjs',bytes:11077,sha256:'777663ee1a0e9be1ddcd99f548c92106dbb0eaeb4d843b8964f1fc52f7f811a1'}
]);
const UPSTREAM_AUDIT_SHAS=Object.freeze([
 '52500062952768679341c4b6dd35bfaf59345b1a69e742915d08a8e50d116822',
 'b390bf2ff524f5d351d1fd1a23105618e1472b7bf7faf47afa02a3324917ff46',
 '70a122cda7c175f44c09eca491316247309d7a8256f423702c2cee6aa671d68c',
 '094348ddabdba0939abbe4b8abc872b60a123db0382dc9a05878e8b138a5080d'
]);
const TERMS=Object.freeze(['headdress','longingly','moonless']);
const NEW_FILE='batch-0023-p001.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const semantic=value=>sha(JSON.stringify(value));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const pairSha=cells=>sha(cells.join('\t'));
const normalizedSentence=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const plans=new WeakMap();
const fail=message=>{throw new Error(`POS3 admission not ready: ${message}.`);};
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
async function absent(file){try{await lstat(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}

/** Pure adaptation of existing C-source/Root-pair/E-reader opinions, not new approval. */
export function composePosNotationExampleSource(pack,integrity,review){
 const verified=verifyDictionaryPosNotationRevisions(pack,integrity,review);
 const entries=verified.pack.entries.map(entry=>{
  const[term,partOfSpeech,meaningZh,en,zh]=entry.unchangedConditionalRootPair.pair;
  return{term,partOfSpeech,meaningZh,en,zh};
 });
 const source={schemaVersion:1,batchId:'examples-0023-p001',authorship:'independent-composition',entries};
 const mappedReview={schemaVersion:1,sourceSha256:exampleSourceHash(source),reviewer:'AI/examples23_reviewer_e',
  independentOfAuthor:true,approvedTerms:[...TERMS],issues:[],
  reviewMethod:'Mechanical exact mapping of Root whole pairs and E exact source/pair opinions; no new language decision, human certification, source installation or publication approval. The separate actual-disk 5c82 admission receipt must be authenticated before writing these files.'};
 assert.equal(validateExampleReview(source,mappedReview).length,3);
 return{source,review:mappedReview};
}

export function parsePosNotationAdmissionArgs(args){
 if(types.isProxy(args)||!Array.isArray(args)||Object.getPrototypeOf(args)!==Array.prototype||args.length>1
  ||Reflect.ownKeys(args).length!==args.length+1)fail('only one --check or --write flag is supported');
 const descriptor=args.length?Object.getOwnPropertyDescriptor(args,'0'):null;
 if(args.length&&(!descriptor||!('value' in descriptor)||!descriptor.enumerable
  ||!['--check','--write'].includes(descriptor.value)))fail('only one --check or --write flag is supported');
 return{write:descriptor?.value==='--write'};
}

/** Raw-pinned actual-source opinion; its complete:true is language-only, not importer approval. */
export function verifyPosNotationAdmissionReceipt(bytes,manifestBytes,pack,integrity,originalReview){
 if(types.isProxy(bytes)||!Buffer.isBuffer(bytes)||types.isProxy(manifestBytes)||!Buffer.isBuffer(manifestBytes))fail('receipt and manifest must be physical byte buffers');
 assert.equal(sha(bytes),AUTHORITY_SHA,'Actual disk-source admission receipt changed');
 const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
 const receipt=JSON.parse(decoder.decode(bytes)),manifest=JSON.parse(decoder.decode(manifestBytes));
 const verified=verifyDictionaryPosNotationRevisions(pack,integrity,originalReview);
 assert.equal(receipt.schemaVersion,1);assert.equal(receipt.complete,true);
 assert.equal(receipt.kind,'independent-exact-three-materialized-source-whole-pair-reentry-review-not-importer-or-publication-approval');
 assert.equal(receipt.actualDictionaryVersion,SOURCE_VERSION);
 assert.equal(receipt.actualSourceManifest.sha256,sha(manifestBytes));assert.equal(receipt.actualSourceManifest.bytes,manifestBytes.length);
 assert.equal(manifest.version,SOURCE_VERSION);assert.deepEqual(receipt.actualSourceManifest.counts,manifest.counts);
 assert.equal(receipt.authorPrincipal,'c');assert.equal(receipt.pairAuthorPrincipal,'root');assert.equal(receipt.reviewerPrincipal,'e');
 assert.equal(receipt.sourceGeneratorPrincipal,'root');assert.equal(receipt.physicalSourceProof.sourceShards,256);
 assert.equal(receipt.physicalSourceProof.contentAddressedRootRecalculated,SOURCE_VERSION);
 assert.deepEqual(receipt.upstreamCodeBindings,UPSTREAM_CODE_PINS);
 assert.deepEqual(receipt.upstreamAudits.map(row=>row.sha256),UPSTREAM_AUDIT_SHAS);
 assert.equal(receipt.perTerm.length,3);
 for(let index=0;index<3;index++){
  const entry=verified.pack.entries[index],opinion=receipt.perTerm[index];
  assert.equal(opinion.term,entry.term);assert.equal(opinion.id,entry.id);assert.equal(opinion.authorPrincipal,'root');assert.equal(opinion.reviewerPrincipal,'e');
  assert.equal(opinion.beforeSha256,entry.beforeSha256);assert.equal(opinion.afterSha256,entry.afterSha256);
  assert.deepEqual(opinion.before,entry.before);assert.deepEqual(opinion.actualSource,entry.after);
  assert.deepEqual(opinion.pair,entry.unchangedConditionalRootPair.pair);assert.equal(opinion.pairSha256,pairSha(opinion.pair));
  assert.deepEqual(opinion.priorHolds,entry.history.priorHolds);
  assert.deepEqual(opinion.canonicalDescriptor,manifest.english.shards[entry.id%128]);
  assert.equal(opinion.decision,'approve-exact-whole-pair-reentry-against-materialized-source');
  assert.equal(opinion.languageReentryOpinionOnly,true);assert.equal(opinion.historicalHoldsEdited,false);
  assert.equal(opinion.exampleAdmitted,false);assert.equal(opinion.coverageAdded,0);assert.equal(opinion.published,false);
 }
 assert.equal(receipt.scope.importerCodeApproval,false);assert.equal(receipt.scope.exampleAdmission,0);
 assert.equal(receipt.scope.coverageAdded,0);assert.equal(receipt.scope.oldReviewOrHoldEdits,0);assert.equal(receipt.scope.published,false);
 return freeze(receipt);
}

/** Exhaustive read-only preparation. No output directory, index or namespace is written. */
export async function preparePosNotationExampleAdmission({root=ROOT}={}){
 root=path.resolve(root);
 const bindings=new Map();
 const read=async file=>{const absolute=path.resolve(root,file);assert(absolute.startsWith(root+path.sep));
  const bytes=await readFile(absolute),binding={file,bytes:bytes.length,sha256:sha(bytes)};
  if(bindings.has(file))assert.deepEqual(bindings.get(file),binding,'Input changed while preparing');else bindings.set(file,binding);
  return bytes;};
 const sourceManifestFile='vocab/data/expanded-dictionary/manifest.json';
 const sourceManifestBytes=await read(sourceManifestFile),manifest=JSON.parse(sourceManifestBytes);
 if(manifest.version!==SOURCE_VERSION)fail('actual corrected source namespace has not been installed');
 const namespace=await readDictionaryNamespace(manifest,path.join(root,'vocab/data/expanded-dictionary'));
 assert.equal(namespace.records.size,102609);
 for(const descriptor of [...manifest.english.shards,...manifest.chinese.shards]){
  const bytes=await read('vocab/data/expanded-dictionary/'+descriptor.file);assert.equal(bytes.length,descriptor.bytes);assert.equal(sha(bytes),descriptor.sha256);
 }
 const sourceLineage=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_NOTATION_BASE_VERSION,manifest,namespace.records,{root});
 assert.deepEqual(sourceLineage.changedTerms,TERMS);assert.equal(sourceLineage.unchangedRecords,102606);
 const prefix='tooling/dictionary/source-revisions/finite-pos-notation-0001';
 const pack=JSON.parse(await read(prefix+'.json')),integrity=JSON.parse(await read(prefix+'.integrity.json')),
  originalReview=JSON.parse(await read(prefix+'.review.json'));
 const verified=verifyDictionaryPosNotationRevisions(pack,integrity,originalReview);
 for(const entry of verified.pack.entries){assert.deepEqual(namespace.records.get(entry.term),entry.after);assert.equal(semantic(namespace.records.get(entry.term)),entry.afterSha256);
  for(const hold of entry.history.priorHolds){const bytes=await read('tooling/dictionary/examples/queues/'+hold.outcomeFile);assert.equal(sha(bytes),hold.outcomeFileSha256);
   const old=hold.pointer.split('/').slice(1).reduce((value,key)=>value[key],JSON.parse(bytes));assert.deepEqual(old,hold.raw);}}
 const indexBytes=await read(INDEX_FILE);assert.equal(sha(indexBytes),INDEX_SHA,'Existing source index drift');
 const index=JSON.parse(indexBytes),sourceFiles=validateExampleSourceIndex(index);assert.equal(sourceFiles.length,531);
 assert.equal(sourceFiles.at(-1),'batch-0022-p003.json');assert(!sourceFiles.includes(NEW_FILE));
 // Bind every existing source/review too; index stability alone is not content stability.
 for(const file of sourceFiles){await read('tooling/dictionary/examples/source/'+file);await read('tooling/dictionary/examples/reviews/'+file);}
 // These are the exact additional paths read by loadOriginalCatalogue, including missing reviews.
 const originalIndexFile='tooling/dictionary/source/index.json',originalIndex=JSON.parse(await read(originalIndexFile));
 assert.equal(originalIndex.schemaVersion,1);assert.equal(originalIndex.name,'卓式词典');assert(Array.isArray(originalIndex.sourceFiles));
 for(const file of originalIndex.sourceFiles){assert(/^[a-z0-9-]+\.json$/u.test(file)&&file!=='index.json');
  await read('tooling/dictionary/source/'+file);
  const reviewFile='tooling/dictionary/reviews/'+file;
  try{await read(reviewFile);}catch(error){if(error.code!=='ENOENT')throw error;bindings.set(reviewFile,{file:reviewFile,absent:true});}
 }
 for(const file of ['finite-grammar-0001.json','finite-grammar-0001.integrity.json','finite-grammar-0001.review.json'])
  await read('tooling/dictionary/source-revisions/'+file);
 const exampleManifestBytes=await read('vocab/data/dictionary-examples/manifest-v2.json');
 assert.equal(sha(exampleManifestBytes),EXAMPLE_MANIFEST_SHA);assert.equal(exampleManifestBytes.length,57577);
 const exampleManifest=parseDictionaryExamplesManifest(JSON.parse(exampleManifestBytes));assert.equal(exampleManifest.version,EXAMPLE_VERSION);
 assert.deepEqual(exampleManifest.counts,{heads:85259,examples:86648});assert.equal(exampleManifest.shards.length,256);
 const oldEntries=new Map(),sentences=new Set();let pairs=0;
 for(const descriptor of exampleManifest.shards){const bytes=await read('vocab/data/dictionary-examples/'+descriptor.file);
  assert.equal(bytes.length,descriptor.bytes);assert.equal(sha(bytes),descriptor.sha256);
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(bytes),exampleManifest,descriptor)){
   assert(!oldEntries.has(term));oldEntries.set(term,row);
   for(const sense of row.senses)for(const pair of sense.examples){pairs++;sentences.add(normalizedSentence(pair.en));}
  }}
 assert.equal(oldEntries.size,85259);assert.equal(pairs,86648);
 const sorted=[...oldEntries.values()].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0);
 assert.equal(semantic({schemaVersion:2,bucketCount:256,entries:sorted}),EXAMPLE_VERSION);
 // The real catalogue/index build must also reproduce the archived example corpus.
 if(root!==ROOT)fail('positive preparation requires this repository root; synthetic fixtures are negative-only');
 const currentBuild=await loadExampleBuild();assert.equal(currentBuild.manifest.version,EXAMPLE_VERSION);
 assert.deepEqual(currentBuild.files.get('manifest-v2.json'),exampleManifestBytes);
 const composed=composePosNotationExampleSource(pack,integrity,originalReview);
 for(const row of composed.source.entries){assert(!oldEntries.has(row.term),'A target already has examples');
  const key=normalizedSentence(row.en);assert(!sentences.has(key),'Duplicate English across the complete corpus');sentences.add(key);}
 const authorityBytes=await read(AUTHORITY_FILE),authority=verifyPosNotationAdmissionReceipt(authorityBytes,sourceManifestBytes,pack,integrity,originalReview);
 for(const pin of [...UPSTREAM_CODE_PINS,...TRUSTED_MODULE_PINS]){const bytes=await read(pin.file);assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256,'Upstream reviewed code or importer dependency drift');}
 const sourceQueues=verified.pack.entries.map(entry=>({term:entry.term,source:entry.after,sourceSha256:entry.afterSha256,
  pair:entry.unchangedConditionalRootPair.pair,pairSha256:pairSha(entry.unchangedConditionalRootPair.pair),
  sourceAuthorPrincipal:'c',authorPrincipal:'root',reviewerPrincipal:'e',historicalHolds:entry.history.priorHolds}));
 const stage='three-exact-reviewed-example-sources-admitted-not-built-not-published';
 const queue={schemaVersion:1,batchId:'examples-0023',sourceDictionaryVersion:SOURCE_VERSION,
  baselineExampleVersion:EXAMPLE_VERSION,queuedHeads:3,entries:sourceQueues,oldHoldsRetained:true};
 const provenance={schemaVersion:1,batchId:'examples-0023',stage,sourceDictionaryVersion:SOURCE_VERSION,
  sourceManifestSha256:sha(sourceManifestBytes),sourceLineage,baselineManifest:JSON.parse(exampleManifestBytes),
  baselineSourceFiles:sourceFiles,sourceQueues,originalSourceOpinionSha256:integrity.reviewSemanticSha256,
  diskAdmissionReview:{file:AUTHORITY_FILE,sha256:sha(authorityBytes)},upstreamCodePins:UPSTREAM_CODE_PINS,
  upstreamAudits:authority.upstreamAudits,trustedImporterDependencies:TRUSTED_MODULE_PINS,
  inputs:[...bindings.values()],newLanguageDecisions:0,coverageAdded:0,examplesBuilt:false,published:false};
 const outcome={schemaVersion:1,batchId:'examples-0023',stage,queuedHeads:3,retainedIndependentOpinions:3,deferred:[],
  beforeHeads:85259,beforeExamples:86648,plannedAfterHeads:85262,plannedAfterExamples:86651,plannedRemainingHeads:17347,
  actualCoverageAdded:0,complete:false,examplesBuilt:false,published:false};
 const outputValues=[['tooling/dictionary/examples/source/'+NEW_FILE,composed.source],
  ['tooling/dictionary/examples/reviews/'+NEW_FILE,composed.review],
  ['tooling/dictionary/examples/queues/batch-0023.json',queue],
  ['tooling/dictionary/examples/queues/batch-0023-provenance.json',provenance],
  ['tooling/dictionary/examples/queues/batch-0023-outcome.json',outcome]];
 const outputs=outputValues.map(([file,value])=>({file,bytes:encode(value)}));
 for(const output of outputs)assert(await absent(path.join(root,output.file)),'Admission output already exists: '+output.file);
 for(const binding of bindings.values()){
  if(binding.absent){assert(await absent(path.join(root,binding.file)),'Missing catalogue review appeared during preparation');continue;}
  const bytes=await readFile(path.join(root,binding.file));assert.equal(bytes.length,binding.bytes);assert.equal(sha(bytes),binding.sha256,'Input changed during preparation');}
 const nextIndex=encode({...index,sourceFiles:[...sourceFiles,NEW_FILE]});
 const summary=freeze({kind:'exact-pos3-admission-plan',ready:true,sourceDictionaryVersion:SOURCE_VERSION,
  baselineExampleVersion:EXAMPLE_VERSION,entries:3,coverageAdded:0,examplesBuilt:false,published:false,
  outputs:outputs.map(output=>({file:output.file,bytes:output.bytes.length,sha256:sha(output.bytes)})),
  nextIndex:{file:INDEX_FILE,bytes:nextIndex.length,sha256:sha(nextIndex)}});
 plans.set(summary,{root,bindings:[...bindings.values()].map(value=>({...value})),
  outputs:outputs.map(output=>({file:output.file,bytes:Buffer.from(output.bytes)})),nextIndex:Buffer.from(nextIndex),authority});
 return summary;
}

/** Only a private prepared snapshot can write; all preflight checks precede the first write. */
export async function commitPosNotationExampleAdmission(plan){
 if(!plan||!plans.has(plan))fail('unverified or copied plan');
 const snapshot=plans.get(plan);plans.delete(plan); // consume before any await: no concurrent or repeated commit
 if(snapshot.root!==ROOT)fail('writes are limited to the actual repository root');
 for(const binding of snapshot.bindings){
  if(binding.absent){assert(await absent(path.join(snapshot.root,binding.file)),'Missing catalogue review appeared before admission');continue;}
  const bytes=await readFile(path.join(snapshot.root,binding.file));
  assert.equal(bytes.length,binding.bytes);assert.equal(sha(bytes),binding.sha256,'Old input changed before admission');}
 for(const output of snapshot.outputs)assert(await absent(path.join(snapshot.root,output.file)),'Output collision before admission');
 const temporaryIndex=path.join(snapshot.root,INDEX_FILE+'.pos3-'+sha(snapshot.nextIndex)+'.tmp');
 assert(await absent(temporaryIndex),'Index temporary output collision');
 // Immutable files first, only then the single mutable source-index pointer.
 for(const output of snapshot.outputs)await writeFile(path.join(snapshot.root,output.file),output.bytes,{flag:'wx'});
 // If another process changes a validated input during the immutable writes,
 // do not make those now-stale sources active by replacing the index pointer.
 for(const binding of snapshot.bindings){
  if(binding.absent){assert(await absent(path.join(snapshot.root,binding.file)),'Missing review appeared before last-pointer update');continue;}
  const bytes=await readFile(path.join(snapshot.root,binding.file));assert.equal(bytes.length,binding.bytes);assert.equal(sha(bytes),binding.sha256,'Old input changed before last-pointer update');}
 const indexBytes=await readFile(path.join(snapshot.root,INDEX_FILE));assert.equal(sha(indexBytes),INDEX_SHA,'Index changed before last-pointer update');
 await writeFile(temporaryIndex,snapshot.nextIndex,{flag:'wx'});
 await rename(temporaryIndex,path.join(snapshot.root,INDEX_FILE));
 return{sourceFilesWritten:snapshot.outputs.length,indexUpdated:true,examplesBuilt:false,coverageAdded:0,published:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=parsePosNotationAdmissionArgs(process.argv.slice(2)),plan=await preparePosNotationExampleAdmission();
  console.log(JSON.stringify(args.write?await commitPosNotationExampleAdmission(plan):{...plan,mode:'check',writes:0},null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
