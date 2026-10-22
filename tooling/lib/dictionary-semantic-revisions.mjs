// Pure, separate semantic family. No filesystem, network, old finite-family
// mutation, namespace generation, example admission or publication on import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {getSemanticAuthority,SEMANTIC_AUTHORITY_IDS,SEMANTIC_RUNTIME_SOURCE,SEMANTIC_RUNTIME_SOURCE_KEY,SEMANTIC_BUNDLE_PROOF_PATHS,SEMANTIC_REVISION_PROOF_FILES,SEMANTIC_SOURCE_REVISION_ID,SEMANTIC_BASE_VERSION} from './dictionary-semantic-authorities.mjs';
export {SEMANTIC_AUTHORITY_IDS,SEMANTIC_RUNTIME_SOURCE,SEMANTIC_RUNTIME_SOURCE_KEY,SEMANTIC_BUNDLE_PROOF_PATHS,SEMANTIC_REVISION_PROOF_FILES,SEMANTIC_SOURCE_REVISION_ID,SEMANTIC_BASE_VERSION};
const brands=new WeakMap(),used=new WeakSet();
const hash=value=>createHash('sha256').update(value).digest('hex');
const semantic=value=>hash(JSON.stringify(value));
const compare=(a,b)=>a<b?-1:a>b?1:0;
const freeze=value=>{if(value&&typeof value==='object'){for(const key of Object.keys(value))freeze(value[key]);Object.freeze(value);}return value;};
const fields=(value,names)=>assert.deepEqual(Object.keys(value).sort(),[...names].sort(),'Exact field set required');

/** Descriptor-first defensive JSON snapshot. No input getter, Proxy trap,
 * iterator, toJSON, coercion or caller map() is invoked. Outputs share no input
 * object. Limits cover the actual full canonical/English-key dataset. */
export function snapshotSemanticJSON(input){
 const ancestors=new WeakSet();let nodes=0,characters=0;
 function copy(value,depth){
  assert(!types.isProxy(value),'Proxy is not JSON evidence');assert(depth<=48,'JSON nesting bound');assert(++nodes<=8000000,'JSON node bound');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='string'){characters+=value.length;assert(characters<=160000000,'JSON string budget');return value;}
  if(typeof value==='number'){assert(Number.isFinite(value)&&!Object.is(value,-0),'Finite JSON number required');return value;}
  assert.equal(typeof value,'object','Only JSON values are accepted');assert(!ancestors.has(value),'Cyclic JSON evidence');
  const array=Array.isArray(value);assert.equal(Object.getPrototypeOf(value),array?Array.prototype:Object.prototype,'Plain JSON containers only');
  const keys=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);assert(keys.every(key=>typeof key==='string'),'Symbol properties are not JSON');
  for(const key of keys){const descriptor=descriptors[key];assert(Object.hasOwn(descriptor,'value'),'Accessors are not JSON evidence');assert(descriptor.enumerable||array&&key==='length','Nonenumerable JSON property');assert(!['__proto__','constructor','prototype'].includes(key),'Reserved JSON key');}
  ancestors.add(value);let result;
  if(array){const length=descriptors.length.value;assert(Number.isSafeInteger(length)&&length>=0&&length<=200000,'Array bound');assert.equal(keys.length,length+1,'Dense, undecorated array required');result=[];
   for(let index=0;index<length;index++){assert(Object.hasOwn(descriptors,String(index)),'Sparse arrays are not JSON evidence');result.push(copy(descriptors[index].value,depth+1));}
  }else{result={};for(const key of keys)Object.defineProperty(result,key,{value:copy(descriptors[key].value,depth+1),enumerable:true,writable:true,configurable:true});}
  ancestors.delete(value);return result;
 }
 return copy(input,0);
}
function checkedRawText(text,pin,label){assert.equal(typeof text,'string',label+' must be exact UTF8 text, not a coercible object');assert.equal(Buffer.byteLength(text,'utf8'),pin.bytes,label+' byte count');assert.equal(hash(text),pin.sha256,label+' raw checksum');return text;}
function checkedText(text,pin,label){return snapshotSemanticJSON(JSON.parse(checkedRawText(text,pin,label)));}
function exactPair(row,target){assert(Array.isArray(row.pair)&&row.pair.length===5&&row.pair.every(value=>typeof value==='string'&&value.trim()));assert.equal(row.pair[0],target.term);assert.equal(hash(row.pair.join('\t')),target.pairSha256,'Exact whole pair');assert.equal(row.pairSha256,target.pairSha256);}

function checkedRuntimeMapping(proofs,authority){
 const proposal=checkedText(proofs.runtimeProposalText,authority.runtime.proposal,'Independent runtime proposal');
 const review=checkedText(proofs.runtimeReviewText,authority.runtime.review,'Independent runtime mapping receipt');
 const notice=checkedRawText(proofs.runtimeNoticeText,authority.runtime.notice,'Exact historical notice draft');
 assert.equal(proposal.stage,'external-draft-awaiting-distinct-principal-review-not-a-runtime-authority-or-publication');
 assert.equal(proposal.authorPrincipal,authority.runtime.author);assert.equal(proposal.sourceKey,SEMANTIC_RUNTIME_SOURCE_KEY);
 fields(proposal.runtimeDescriptor,['name','license','url']);assert.deepEqual(proposal.runtimeDescriptor,SEMANTIC_RUNTIME_SOURCE);
 assert(proposal.runtimeDescriptor.name.length<=100&&proposal.runtimeDescriptor.license.length<=200&&proposal.runtimeDescriptor.url.length<=500);
 assert.equal(review.authorPrincipal,authority.runtime.author);assert.equal(review.reviewerPrincipal,authority.runtime.reviewer);assert.notEqual(review.authorPrincipal,review.reviewerPrincipal);
 assert.equal(review.complete,true);assert.equal(review.stage,'future-exact-five-short-runtime-mapping-and-notice-conditionally-supported');
 assert.equal(review.productionPass,false);assert.equal(review.scope.sourceApplied,0);assert.equal(review.scope.exampleAdmitted,0);assert.equal(review.scope.coverageAdded,0);
 assert.equal(review.scope.descriptorInstalled,false);assert.equal(review.scope.noticePublished,false);assert.equal(review.scope.published,false);
 assert.equal(review.descriptor.sourceKey,SEMANTIC_RUNTIME_SOURCE_KEY);assert.deepEqual(review.descriptor.value,SEMANTIC_RUNTIME_SOURCE);
 assert.deepEqual(review.descriptor.runtimeFields,['name','license','url']);
 for(const pin of [authority.runtime.proposal,authority.runtime.notice,authority.candidate,authority.review]){
  assert.equal(review.inputs.filter(row=>row.sha256===pin.sha256&&row.bytes===pin.bytes).length,1,'Exact reviewed runtime input binding');
 }
 assert.equal(proposal.scope.candidate.sha256,authority.candidate.sha256);assert.equal(proposal.scope.candidate.bytes,authority.candidate.bytes);
 assert.equal(proposal.scope.originalConditionalLanguageReview.sha256,authority.review.sha256);assert.equal(proposal.scope.originalConditionalLanguageReview.bytes,authority.review.bytes);
 assert.equal(proposal.draftStatus.noticeCreatedInActualRepository,false);assert.equal(proposal.draftStatus.noticePublished,false);assert.equal(proposal.draftStatus.descriptorInstalled,false);
 assert.equal(proposal.draftStatus.sourceApplied,0);assert.equal(proposal.draftStatus.exampleAdmitted,0);assert.equal(proposal.draftStatus.coverageAdded,0);
 return {proposal,review,notice};
}

/** Only IDs in the separately reviewed static authority registry can verify.
 * Exact raw proof strings prevent invented reviewer strings/altered decisions.
 * The private brand is a single-use in-memory capability, not source admission. */
export function verifySemanticRevisionBundle(authorityId,untrustedProofs){
 const authority=getSemanticAuthority(authorityId),proofs=snapshotSemanticJSON(untrustedProofs);fields(proofs,['candidateText','reviewText','sourceManifestText','runtimeProposalText','runtimeReviewText','runtimeNoticeText']);
 const runtime=checkedRuntimeMapping(proofs,authority);
 const candidate=checkedText(proofs.candidateText,authority.candidate,'Candidate'),review=checkedText(proofs.reviewText,authority.review,'Independent language receipt');
 const manifest=checkedText(proofs.sourceManifestText,{bytes:authority.dictionary.manifestBytes,sha256:authority.dictionary.manifestSha256},'Current source manifest');
 assert.equal(manifest.version,authority.dictionary.version);assert.equal(manifest.counts.records,authority.dictionary.canonicalRecords);assert.equal(manifest.counts.englishKeys,authority.dictionary.englishKeyRows);
 assert.equal(candidate.id,authority.candidateId);assert.equal(candidate.authorPrincipal,authority.candidateAuthor);assert.equal(candidate.currentDictionaryVersion,authority.dictionary.version);assert.equal(candidate.currentExamplesVersion,authority.examplesVersion);
 assert.equal(review.authorPrincipal,authority.candidateAuthor);assert.equal(review.reviewerPrincipal,authority.reviewer);assert.notEqual(review.authorPrincipal,review.reviewerPrincipal);
 assert.equal(review.complete,true);assert.equal(review.stage,'future-exact-five-candidate-source-and-whole-pair-independent-language-review-not-implementation-or-reentry');
 assert.equal(review.input.sha256,authority.candidate.sha256);assert.equal(review.input.bytes,authority.candidate.bytes);
 assert.equal(candidate.sourceChangesApplied,0);assert.equal(candidate.exampleCoverageAdded,0);assert.equal(candidate.published,false);assert.equal(candidate.goalComplete,false);
 assert.equal(candidate.proposedSourceDescriptor.id,'semantic-editorial');assert.equal(candidate.proposedSourceDescriptor.noticeNotCreatedOrPublishedYet,true);
 assert.equal(candidate.entries.length,authority.targets.length);assert.equal(review.entries.length,authority.targets.length);
 assert.equal(review.scopeConclusions.sourceApplied,0);assert.equal(review.scopeConclusions.admissionAdded,0);assert.equal(review.scopeConclusions.coverageAdded,0);assert.equal(review.scopeConclusions.published,false);assert.equal(review.scopeConclusions.newLanguageHolds,0);
 let holds=0,quarantined=0,retired=0;const entries=[];
 for(let index=0;index<authority.targets.length;index++){
  const target=authority.targets[index],row=candidate.entries[index],decision=review.entries[index];
  assert.equal(row.term,target.term);assert.equal(row.id,target.id);assert.equal(semantic(row.before),target.beforeSha256);assert.equal(row.beforeSha256,target.beforeSha256);assert.equal(semantic(row.afterCandidate),target.afterSha256);assert.equal(row.afterCandidateSha256,target.afterSha256);
  assert.deepEqual(Object.keys(row.afterCandidate).sort(),Object.keys(row.before).sort(),'Original source key set');
  for(const key of Object.keys(row.before))if(!authority.allowedChangedFields.includes(key))assert.deepEqual(row.afterCandidate[key],row.before[key],'Protected source field '+key);
  assert.equal(row.afterCandidate.id,target.id);assert.equal(row.afterCandidate.term,target.term);assert.equal(row.afterCandidate.source,candidate.proposedSourceDescriptor.id);
  exactPair(row,target);assert.equal(row.pair[1],row.afterCandidate.partOfSpeech);assert.equal(row.pair[2],row.afterCandidate.meaning);
  assert.equal(decision.term,target.term);assert.equal(decision.beforeSha256,target.beforeSha256);assert.equal(decision.afterCandidateSha256,target.afterSha256);assert.equal(decision.pairSha256,target.pairSha256);assert.deepEqual(decision.wholeFiveCellPair,row.pair);
  assert.equal(decision.decision,'conditionally-support-exact-future-whole-source-and-pair');assert.equal(decision.actualSourceApplied,false);assert.equal(decision.exampleAdmitted,false);
  assert.equal(row.completeAfterSourceRecordIndependentlyReviewed,false,'Do not relabel the historical author draft');assert.equal(row.pairAdmitted,false);assert.equal(row.sourceApplied,false);
  const oldVariants=row.before.variants||[],partition=[...row.retiredActiveVariants,...row.quarantinedActiveVariants,...row.preservedTechnicalVariants];
  assert.equal(partition.length,oldVariants.length,'No lost raw legacy variant');assert.equal(new Set(partition.map(semantic)).size,partition.length,'No duplicate variant disposition');
  assert.deepEqual(partition.map(semantic).sort(),oldVariants.map(semantic).sort(),'Exact legacy variant partition');assert.deepEqual(row.afterCandidate.variants,row.preservedTechnicalVariants,'No quarantined/retired tuple remains active');
  assert.equal(row.retainedHolds.length,decision.historicalHoldsStillUnchanged);for(const hold of row.retainedHolds)assert.equal(hold.raw.term,target.term);
  holds+=row.retainedHolds.length;quarantined+=row.quarantinedActiveVariants.length;retired+=row.retiredActiveVariants.length;
  entries.push({term:target.term,id:target.id,beforeSha256:target.beforeSha256,afterSha256:target.afterSha256,before:row.before,after:row.afterCandidate,pair:row.pair,pairSha256:target.pairSha256,retainedHolds:row.retainedHolds,
   quarantine:row.quarantinedActiveVariants,retired:row.retiredActiveVariants,preserved:row.preservedTechnicalVariants});
 }
 assert.equal(holds,authority.historicalHolds);assert.equal(quarantined,authority.quarantinedTuples);assert.equal(retired,authority.retiredTuples);
 const verified=freeze({kind:'verified-finite-future-semantic-candidate-not-admission',authorityId:authority.id,dictionaryVersion:authority.dictionary.version,
  candidateSha256:authority.candidate.sha256,reviewSha256:authority.review.sha256,sourceKey:SEMANTIC_RUNTIME_SOURCE_KEY,source:cloneInternal(SEMANTIC_RUNTIME_SOURCE),entries:cloneInternal(entries),
  runtimeProposalSha256:authority.runtime.proposal.sha256,runtimeReviewSha256:authority.runtime.review.sha256,runtimeNoticeDraftSha256:authority.runtime.notice.sha256,
  originalCandidate:cloneInternal(candidate),originalIndependentLanguageReceipt:cloneInternal(review),originalRuntimeProposal:cloneInternal(runtime.proposal),originalIndependentRuntimeReview:cloneInternal(runtime.review),originalNoticeDraftText:runtime.notice,
  scope:{actualSourceMaterialized:false,languageOpinionStillConditional:true,noticeCreated:false,examplesAdmitted:0,coverageAdded:0,published:false}});
 brands.set(verified,{authority,entries:verified.entries});return verified;
}
function cloneInternal(value){return snapshotSemanticJSON(value);}

/** Full baseline records and English references are hash-bound to the actual
 *5c82 source. One capability is consumed even on a failed attempt. This does
 *not build Chinese postings, a namespace or an example-source pack. */
export function applySemanticRevisionInMemory(untrustedDataset,verified){
 const trusted=brands.get(verified);assert(trusted,'A genuine private verified capability is required');assert(!used.has(verified),'Semantic capability is single-use');used.add(verified);
 const {authority,entries}=trusted,dataset=snapshotSemanticJSON(untrustedDataset);fields(dataset,['dictionaryVersion','records','englishKeys']);
 assert.equal(dataset.dictionaryVersion,authority.dictionary.version);assert(Array.isArray(dataset.records)&&Array.isArray(dataset.englishKeys));assert.equal(dataset.records.length,authority.dictionary.canonicalRecords);assert.equal(dataset.englishKeys.length,authority.dictionary.englishKeyRows);
 const ids=new Set(),terms=new Set();for(const row of dataset.records){assert(Number.isSafeInteger(row.id)&&typeof row.term==='string');assert(!ids.has(row.id)&&!terms.has(row.term),'Unique actual canonical identity required');ids.add(row.id);terms.add(row.term);}
 const sortedRecords=[...dataset.records].sort((a,b)=>a.id-b.id);assert.equal(semantic(sortedRecords),authority.dictionary.canonicalRecordsSha256,'Entire canonical source must match actual reviewed baseline');
 const keyNames=new Set();for(const row of dataset.englishKeys){assert(Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&Array.isArray(row[1])&&row[1].length>0);assert(!keyNames.has(row[0]),'Duplicate English key');keyNames.add(row[0]);}
 const sortedKeys=[...dataset.englishKeys].sort(([a],[b])=>compare(a,b));assert.equal(semantic(sortedKeys),authority.dictionary.englishKeysSha256,'Entire English-reference source must match actual baseline');
 const planned=new Map(entries.map(row=>[row.term,row]));let unchanged=0;const changes=[];
 const records=dataset.records.map(before=>{
  const edit=planned.get(before.term);if(!edit){unchanged++;return before;}
  assert.equal(before.id,edit.id);assert.equal(semantic(before),edit.beforeSha256);const after=cloneInternal(edit.after);assert.equal(semantic(after),edit.afterSha256);
  const changedFields=Object.keys(before).filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));assert(changedFields.every(key=>authority.allowedChangedFields.includes(key)));
  changes.push({term:edit.term,id:edit.id,beforeSha256:edit.beforeSha256,afterSha256:edit.afterSha256,pairSha256:edit.pairSha256,changedFields});return after;
 });
 assert.equal(changes.length,entries.length);assert.equal(unchanged,authority.dictionary.canonicalRecords-entries.length);for(const row of entries)assert(changes.some(change=>change.term===row.term));
 const englishKeys=dataset.englishKeys;assert.equal(semantic([...englishKeys].sort(([a],[b])=>compare(a,b))),authority.dictionary.englishKeysSha256);
 const report={kind:'pure-future-semantic-in-memory-result-not-materialization-or-admission',authorityId:authority.id,candidateSha256:authority.candidate.sha256,reviewSha256:authority.review.sha256,
  beforeDictionaryVersion:authority.dictionary.version,canonicalRecords:records.length,changedRecords:changes.length,unchangedRecords:unchanged,changes,
  allEnglishReferencesPreserved:true,englishKeyRows:englishKeys.length,englishKeysSha256:authority.dictionary.englishKeysSha256,fullBaselineCanonicalSha256:authority.dictionary.canonicalRecordsSha256,
  changedCanonicalAggregateSha256:semantic([...records].sort((a,b)=>a.id-b.id)),historicalHoldsPreserved:authority.historicalHolds,quarantinedTuples:authority.quarantinedTuples,retiredTuples:authority.retiredTuples,
  runtimeSource:{key:SEMANTIC_RUNTIME_SOURCE_KEY,descriptor:cloneInternal(SEMANTIC_RUNTIME_SOURCE),proposalSha256:authority.runtime.proposal.sha256,reviewSha256:authority.runtime.review.sha256,noticeDraftSha256:authority.runtime.notice.sha256,noticePublishedClaim:false},
  chinesePostings:{rebuilt:false,requiredTargetIds:entries.map(row=>row.id),requireAllNonTargetPostingsUnchanged:true,requireOnlyReviewedActiveSensesForTargetIds:true,allChinesePostingsUnchangedClaim:false},
  stillRequired:['Different-principal implementation review of this separate semantic family','Honest source notice and licence/primary provenance','Actual reviewed finite source materialization and new content-addressed dictionary root','Fresh exact disk-source/pair historical-hold reentry','Separate example admission/build and full local/live verification'],
  originalLanguageOpinionRemainsConditional:true,actualNamespaceGenerated:false,actualSourceFilesWritten:0,newExampleAdmissions:0,coverageAdded:0,published:false};
 return freeze({records,englishKeys,report});
}
