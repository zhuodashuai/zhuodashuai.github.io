/** Exact five-source example admission. Default mode is read-only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {composeSemanticExampleSource} from '../lib/semantic-example-composition.mjs';
import {SEMANTIC_REVISION_PROOF_FILES} from '../lib/dictionary-semantic-revisions.mjs';
import {getSemanticAuthority} from '../lib/dictionary-semantic-authorities.mjs';
import {readDictionaryNamespace,assertHistoricalDictionaryLineage,SOURCE_LINEAGE_SEMANTIC_BASE_VERSION} from '../lib/dictionary-source-lineage.mjs';
import {validateExampleSourceIndex,loadExampleBuild} from './build-dictionary-examples.mjs';
import {parseDictionaryExamplesManifest,parseDictionaryExamplesShard} from '../../vocab/js/dictionary-examples.js';

const ROOT=path.resolve(import.meta.dirname,'../..');
const SOURCE_VERSION='cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644';
const SOURCE_MANIFEST_SHA='2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f';
const EXAMPLE_VERSION='4506265fab099d7b70a59bb3667ab8276c083f14c66f4d149cacf73c5c7e8f92';
const EXAMPLE_MANIFEST_SHA='f363840f5fcce67f80a0949fd0567383ebf08a00873e69e3543bc2ad7411621b';
const INDEX='tooling/dictionary/examples/index.json';
const INDEX_SHA='9f6d3926d2387add0f8273c34324e55fba7f8c720f0e99b7dcc1329fbd3a6d07';
const ADMISSION_FILE='tooling/dictionary/source-revisions/semantic-common-five-0001.admission-review.json';
// Genuine C actual-disk reentry receipt: Root read all complete40,695 bytes
// before making an exact raw copy. It is NOT an importer-code endorsement.
const ADMISSION_SHA='884e97084b914d8259f951efb0040e716828e6de4e66d06326256182b6b43638';
const NEW_FILE='batch-0024-p001.json';
// Named executable/static-page inputs ONLY: CRLF-to-LF transport equivalence
// lets Windows and Linux checkouts authenticate the same reviewed code. Every
// proof JSON, namespace and example file remains exact raw bytes; no waiver.
const CODE_PINS={
 'tooling/lib/dictionary-semantic-authorities.mjs':'6dbc40870a0ad3c03e2cdb0f3edf667349dfeeceb0f32b22492d8ceedf5c08d5',
 'tooling/lib/dictionary-semantic-revisions.mjs':'c94153841d16cd36601f0fc65528c0d15ad8f343f56b24b3017c01c56636aa84',
 'tooling/lib/semantic-example-composition.mjs':'53f87fe26ac2e8ea139f422884d2ef3aedc8bfd27c57203bd9c7bd0a2234c645',
 'tooling/lib/dictionary-source-lineage.mjs':'87ce477791f6cb3ce57d645b9651f04e6f32c2b5362fa6ad54a9ed3cbc494492',
 'tooling/lib/dictionary-source-revisions.mjs':'777663ee1a0e9be1ddcd99f548c92106dbb0eaeb4d843b8964f1fc52f7f811a1',
 'tooling/lib/dictionary-pos-notation-revisions.mjs':'5d9bdb235624a8251b8df09e3eccf81bae44715e6b2bdeb7d1f17a35f9370c7f',
 'tooling/lib/dictionary-seed-archive.mjs':'244d08a47c10828efb9324e836131017322e3edbda1c4fc51477908ab8aad51b',
 'tooling/lib/original-dictionary.mjs':'11dd7d45925d2c956a143afe44fcc3e5c79691c6cf42c30e45f9f358af58a285',
 'tooling/lib/original-dictionary-catalogue.mjs':'80822d379bf9707d0ddf6e391b003e12b8c0e08e6302448a01302ccb5bf50ffa',
 'tooling/scripts/build-expanded-dictionary.mjs':'f2dd1259a7a49713ca40d142413b5c5cd8b2dcb24971c5a3c24d28a202aaa154',
 'tooling/scripts/build-dictionary-suggestions.mjs':'b7a6839748e2590de2b7beb6fd5626edc8fdeadf74c0a4b3de8796fc3521f619',
 'tooling/scripts/build-dictionary-examples.mjs':'f07b49dcd23a9658dd03ccd74e12c75ecddc38dcce263adb7ca74107dbd49341',
 'vocab/js/expanded-dictionary.js':'fb9cf7be9aab756cc7264376d63e74ec7ea6793beb59b71648d1dcd3df246cb5',
 'vocab/js/dictionary-examples.js':'600040f32fd5c6ceb994d738666f461acab3a8b832d60ad5ffe42fd180f51f41',
 'vocab/dictionary-semantic-revisions.html':'6327a17d8765c9ffd66f5e86d5126114b84ad899f658990cc9edcab9a0b0a5ca'};
const sha=value=>createHash('sha256').update(value).digest('hex');
const semantic=value=>sha(JSON.stringify(value));
const encode=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
const sentence=value=>value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const plans=new WeakMap();
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
async function absent(file){try{await lstat(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}
const fail=message=>{throw Error('Semantic-five admission not ready: '+message);};

export function parseSemanticAdmissionArgs(args){
 if(types.isProxy(args)||!Array.isArray(args)||Object.getPrototypeOf(args)!==Array.prototype||args.length>1
  ||Reflect.ownKeys(args).length!==args.length+1)fail('only one --check or --write flag is supported');
 const d=args.length?Object.getOwnPropertyDescriptor(args,'0'):null;
 if(args.length&&(!d||!('value'in d)||!d.enumerable||!['--check','--write'].includes(d.value)))fail('only one --check or --write flag is supported');
 return{write:d?.value==='--write'};
}

export function verifySemanticAdmissionReceipt(bytes,manifestBytes){
 if(types.isProxy(bytes)||!Buffer.isBuffer(bytes)||types.isProxy(manifestBytes)||!Buffer.isBuffer(manifestBytes))fail('physical receipt and manifest bytes required');
 assert.match(ADMISSION_SHA||'',/^[a-f0-9]{64}$/u,'Actual independent disk-source receipt is not registered');
 assert.equal(sha(bytes),ADMISSION_SHA,'Actual independent source receipt changed');
 assert.equal(bytes.length,40695);
 assert.equal(sha(manifestBytes),SOURCE_MANIFEST_SHA);assert.equal(manifestBytes.length,55060);
 const receipt=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));
 // Raw byte identity is the authority, never caller-provided reviewer strings.
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(manifestBytes));
 assert.equal(receipt.kind,'independent-exact-five-actual-materialized-source-whole-pair-historical-reentry-review-not-importer-or-publication-approval');
 assert.equal(receipt.complete,true);assert.equal(receipt.actualDictionaryVersion,SOURCE_VERSION);
 assert.equal(receipt.authorPrincipal,'root');assert.equal(receipt.sourceAuthorPrincipal,'root');
 assert.equal(receipt.pairAuthorPrincipal,'root');assert.equal(receipt.sourceGeneratorPrincipal,'root');
 assert.equal(receipt.runtimeProposalAuthorPrincipal,'e');assert.equal(receipt.reviewerPrincipal,'c');
 assert.equal(receipt.actualSourceManifest.sha256,SOURCE_MANIFEST_SHA);assert.equal(receipt.actualSourceManifest.bytes,manifestBytes.length);
 assert.equal(receipt.physicalSourceProof.shardsChecked,256);assert.equal(receipt.physicalSourceProof.contentRootRecomputed,true);
 assert.equal(receipt.conservation.canonicalRecords,102609);assert.equal(receipt.conservation.unchangedRecords,102604);
 assert.equal(receipt.baselineExamples.version,EXAMPLE_VERSION);assert.equal(receipt.baselineExamples.heads,85262);assert.equal(receipt.baselineExamples.pairs,86651);
 const authority=getSemanticAuthority('semantic-common-five-0001');assert.equal(receipt.perTerm.length,5);let holds=0;
 for(let index=0;index<5;index++){
  const row=receipt.perTerm[index],target=authority.targets[index];assert.equal(row.term,target.term);assert.equal(row.id,target.id);
  assert.equal(semantic(row.before),target.beforeSha256);assert.equal(semantic(row.actualSource),target.afterSha256);
  assert.equal(row.beforeSha256,target.beforeSha256);assert.equal(row.actualSourceSha256,target.afterSha256);
  assert.equal(sha(row.pair.join('\t')),target.pairSha256);assert.equal(row.pairTSVSha256,target.pairSha256);
  const{recordPointer,...descriptor}=row.canonicalPhysicalProof;
  assert.deepEqual(descriptor,manifest.english.shards[target.id%128]);assert.match(recordPointer,/^\/records\/\d+$/u);
  assert.equal(row.decision,'approve-exact-actual-materialized-source-and-five-cell-pair-for-finite-historical-reentry');
  assert.equal(row.reviewerPrincipal,'c');assert.equal(row.newImporterCodeApproval,false);assert.equal(row.exampleAdmitted,false);
  for(const hold of row.priorHolds){holds++;assert.equal(hold.raw.term,row.term);assert.equal(semantic(hold.raw),hold.rawSemanticSha256);assert.match(hold.pointer,/^\/deferred\/\d+$/u);}
 }
 assert.equal(holds,9);assert.equal(receipt.oldHoldsRewritten,false);
 assert.equal(receipt.scope.approvedExactSourcesAndPairs,5);assert.equal(receipt.scope.importerCodeApproval,false);
 assert.equal(receipt.scope.exampleAdmission,0);assert.equal(receipt.scope.coverageAdded,0);assert.equal(receipt.scope.published,false);
 return freeze(receipt);
}

/** Bind all immutable inputs before returning a private, detached write plan. */
export async function prepareSemanticExampleAdmission({root=ROOT}={}){
 root=path.resolve(root);const bindings=new Map();
 const read=async file=>{
  const absolute=path.resolve(root,file);assert(absolute.startsWith(root+path.sep));
  const bytes=await readFile(absolute),pin={file,bytes:bytes.length,sha256:sha(bytes)};
  if(bindings.has(file))assert.deepEqual(bindings.get(file),pin,'Input changed during preparation');else bindings.set(file,pin);
  return bytes;
 };
 const manifestBytes=await read('vocab/data/expanded-dictionary/manifest.json');
 assert.equal(sha(manifestBytes),SOURCE_MANIFEST_SHA);const manifest=JSON.parse(manifestBytes);assert.equal(manifest.version,SOURCE_VERSION);
 const ns=await readDictionaryNamespace(manifest,path.join(root,'vocab/data/expanded-dictionary'));
 for(const d of [...manifest.english.shards,...manifest.chinese.shards]){
  const b=await read('vocab/data/expanded-dictionary/'+d.file);assert.equal(b.length,d.bytes);assert.equal(sha(b),d.sha256);
 }
 const proofs=Object.fromEntries(await Promise.all(Object.entries(SEMANTIC_REVISION_PROOF_FILES).map(async([key,file])=>[key,(await read('tooling/dictionary/source-revisions/'+file)).toString('utf8')])));
 const composed=composeSemanticExampleSource(proofs),candidate=JSON.parse(proofs.candidateText);
 const lineage=await assertHistoricalDictionaryLineage(SOURCE_LINEAGE_SEMANTIC_BASE_VERSION,manifest,ns.records,{root});
 assert.equal(lineage.unchangedRecords,102604);assert.equal(lineage.changedChineseTokens,131);
 assert.deepEqual([...lineage.changedTerms].sort(),composed.source.entries.map(r=>r.term).sort());
 for(const e of candidate.entries){
  assert.deepEqual(ns.records.get(e.term),e.afterCandidate);assert.equal(semantic(ns.records.get(e.term)),e.afterCandidateSha256);
  for(const hold of e.retainedHolds){
   const b=await read('tooling/dictionary/examples/queues/'+hold.outcomeFile);assert.equal(sha(b),hold.outcomeFileSha256);
   // The genuine reentry receipt records the precise discovered pointers;
   // here verify the original entire raw hold still occurs exactly once.
   let matches=0;const visit=value=>{if(value&&typeof value==='object'){if(semantic(value)===semantic(hold.raw))matches++;for(const child of Object.values(value))visit(child);}};
   visit(JSON.parse(b));assert.equal(matches,1,'Historical raw hold absent or ambiguous');
  }
 }
 for(const version of ['474e8115824074012f7a918453f977f3a8d21c6ae25016c8a44a1fc8c2d264cc','9f27bbc2f083007095b2e6830a87b2d0a7e18353f91a2e962b82443b2480339b',SOURCE_LINEAGE_SEMANTIC_BASE_VERSION]){
  const m=JSON.parse(await read('tooling/dictionary/source-revisions/baseline-'+version+'.manifest.json'));
  for(const d of [...m.english.shards,...m.chinese.shards]){const b=await read('vocab/data/expanded-dictionary/'+d.file);assert.equal(b.length,d.bytes);assert.equal(sha(b),d.sha256);}
 }
 for(const name of ['finite-grammar-0001','finite-pos-notation-0001'])for(const suffix of ['.json','.integrity.json','.review.json'])await read('tooling/dictionary/source-revisions/'+name+suffix);
 const authorityBytes=await read(ADMISSION_FILE),authority=verifySemanticAdmissionReceipt(authorityBytes,manifestBytes);
 const indexBytes=await read(INDEX);assert.equal(sha(indexBytes),INDEX_SHA);const index=JSON.parse(indexBytes),files=validateExampleSourceIndex(index);
 assert.equal(files.length,532);assert.equal(files.at(-1),'batch-0023-p001.json');assert(!files.includes(NEW_FILE));
 for(const file of files){await read('tooling/dictionary/examples/source/'+file);await read('tooling/dictionary/examples/reviews/'+file);}
 const original=JSON.parse(await read('tooling/dictionary/source/index.json'));
 assert.equal(original.schemaVersion,1);assert.equal(original.name,'卓式词典');assert(Array.isArray(original.sourceFiles));
 for(const file of original.sourceFiles){
  assert(/^[a-z0-9-]+\.json$/u.test(file)&&file!=='index.json');await read('tooling/dictionary/source/'+file);
  const review='tooling/dictionary/reviews/'+file;
  try{await read(review);}catch(error){if(error.code!=='ENOENT')throw error;bindings.set(review,{file:review,absent:true});}
 }
 const oldManifestBytes=await read('vocab/data/dictionary-examples/manifest-v2.json');assert.equal(sha(oldManifestBytes),EXAMPLE_MANIFEST_SHA);assert.equal(oldManifestBytes.length,57577);
 const oldManifest=parseDictionaryExamplesManifest(JSON.parse(oldManifestBytes));assert.equal(oldManifest.version,EXAMPLE_VERSION);assert.deepEqual(oldManifest.counts,{heads:85262,examples:86651});
 const old=new Map(),sentences=new Set();let pairs=0;
 for(const d of oldManifest.shards){const b=await read('vocab/data/dictionary-examples/'+d.file);assert.equal(b.length,d.bytes);assert.equal(sha(b),d.sha256);
  for(const[term,row]of parseDictionaryExamplesShard(JSON.parse(b),oldManifest,d)){assert(!old.has(term));old.set(term,row);for(const s of row.senses)for(const p of s.examples){pairs++;sentences.add(sentence(p.en));}}
 }
 assert.equal(old.size,85262);assert.equal(pairs,86651);
 assert.equal(semantic({schemaVersion:2,bucketCount:256,entries:[...old.values()].sort((a,b)=>a.term<b.term?-1:a.term>b.term?1:0)}),EXAMPLE_VERSION);
 for(const row of composed.source.entries){assert(!old.has(row.term),'Target already has examples');const key=sentence(row.en);assert(!sentences.has(key),'Duplicate sentence across corpus');sentences.add(key);}
 if(root!==ROOT)fail('positive preparation requires the actual repository; synthetic roots are negative-only');
 const rebuilt=await loadExampleBuild();assert.equal(rebuilt.manifest.version,EXAMPLE_VERSION);assert(rebuilt.files.get('manifest-v2.json').equals(oldManifestBytes));
 for(const[file,pin]of Object.entries(CODE_PINS))assert.equal(sha((await read(file)).toString('utf8').replaceAll('\r\n','\n')),pin,'Named upstream code changed: '+file);
 await read('tooling/scripts/admit-semantic-examples.mjs');
 const sourceQueues=candidate.entries.map(e=>({term:e.term,source:e.afterCandidate,sourceSha256:e.afterCandidateSha256,pair:e.pair,pairSha256:e.pairSha256,
  sourceAuthorPrincipal:'root',authorPrincipal:'root',reviewerPrincipal:'c',historicalHolds:e.retainedHolds}));
 const stage='five-exact-reviewed-example-sources-admitted-not-built-not-published';
 const queue={schemaVersion:1,batchId:'examples-0024',sourceDictionaryVersion:SOURCE_VERSION,baselineExampleVersion:EXAMPLE_VERSION,queuedHeads:5,entries:sourceQueues,oldHoldsRetained:true};
 const provenance={schemaVersion:1,batchId:'examples-0024',stage,sourceDictionaryVersion:SOURCE_VERSION,sourceManifestSha256:sha(manifestBytes),sourceLineage:lineage,
  baselineExampleVersion:EXAMPLE_VERSION,baselineSourceFiles:files,sourceQueues,diskAdmissionReview:{file:ADMISSION_FILE,sha256:sha(authorityBytes)},
  upstreamCodeLfPins:CODE_PINS,codeEolScope:'Only named executable/static-page code accepts CRLF-to-LF equivalence; all JSON authority/source/example bytes stay raw-pinned',
  inputs:[...bindings.values()],newLanguageDecisions:0,coverageAdded:0,examplesBuilt:false,published:false};
 const outcome={schemaVersion:1,batchId:'examples-0024',stage,queuedHeads:5,retainedIndependentOpinions:5,deferred:[],beforeHeads:85262,beforeExamples:86651,
  plannedAfterHeads:85267,plannedAfterExamples:86656,plannedRemainingHeads:17342,actualCoverageAdded:0,complete:false,examplesBuilt:false,published:false};
 const outputs=[['tooling/dictionary/examples/source/'+NEW_FILE,composed.source],['tooling/dictionary/examples/reviews/'+NEW_FILE,composed.review],
  ['tooling/dictionary/examples/queues/batch-0024.json',queue],['tooling/dictionary/examples/queues/batch-0024-provenance.json',provenance],['tooling/dictionary/examples/queues/batch-0024-outcome.json',outcome]]
  .map(([file,value])=>({file,bytes:encode(value)}));
 for(const output of outputs)assert(await absent(path.join(root,output.file)),'Output collision: '+output.file);
 for(const pin of bindings.values()){if(pin.absent){assert(await absent(path.join(root,pin.file)));continue;}const b=await readFile(path.join(root,pin.file));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
 const nextIndex=encode({...index,sourceFiles:[...files,NEW_FILE]});
 const plan=freeze({kind:'exact-semantic-five-admission-plan',ready:true,sourceDictionaryVersion:SOURCE_VERSION,baselineExampleVersion:EXAMPLE_VERSION,
  entries:5,coverageAdded:0,examplesBuilt:false,published:false,outputs:outputs.map(o=>({file:o.file,bytes:o.bytes.length,sha256:sha(o.bytes)})),nextIndex:{file:INDEX,bytes:nextIndex.length,sha256:sha(nextIndex)}});
 plans.set(plan,{root,bindings:[...bindings.values()].map(p=>({...p})),outputs:outputs.map(o=>({file:o.file,bytes:Buffer.from(o.bytes)})),nextIndex:Buffer.from(nextIndex),authority});return plan;
}

export async function commitSemanticExampleAdmission(plan){
 if(!plan||!plans.has(plan))fail('unverified or copied plan');const state=plans.get(plan);plans.delete(plan);
 if(state.root!==ROOT)fail('writes require the actual repository');
 const unchanged=async()=>{for(const pin of state.bindings){if(pin.absent){assert(await absent(path.join(state.root,pin.file)));continue;}const b=await readFile(path.join(state.root,pin.file));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256,'Bound input changed: '+pin.file);}};
 await unchanged();for(const o of state.outputs)assert(await absent(path.join(state.root,o.file)),'Output collision');
 const temporary=path.join(state.root,INDEX+'.semantic5-'+sha(state.nextIndex)+'.tmp');assert(await absent(temporary),'Temporary index collision');
 for(const o of state.outputs)await writeFile(path.join(state.root,o.file),o.bytes,{flag:'wx'});
 await unchanged();assert.equal(sha(await readFile(path.join(state.root,INDEX))),INDEX_SHA);
 await writeFile(temporary,state.nextIndex,{flag:'wx'});
 const temporaryBytes=await readFile(temporary);assert(temporaryBytes.equals(state.nextIndex),'Temporary index differs from the private plan');
 // Temporary-file creation is asynchronous too: do not overwrite an index or
 // activate stale sources changed during that write. This is optimistic local
 // preflight, not a claimed cross-process atomic compare-and-swap transaction.
 await unchanged();assert.equal(sha(await readFile(path.join(state.root,INDEX))),INDEX_SHA,'Index changed during temporary write');
 await rename(temporary,path.join(state.root,INDEX));
 return{sourceFilesWritten:state.outputs.length,indexUpdated:true,examplesBuilt:false,coverageAdded:0,published:false};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=parseSemanticAdmissionArgs(process.argv.slice(2)),plan=await prepareSemanticExampleAdmission();
  console.log(JSON.stringify(args.write?await commitSemanticExampleAdmission(plan):{...plan,mode:'check',writes:0},null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
