/** Exact project-editorial metadata corrections, never a rewrite of MIT seed history. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const DICTIONARY_SOURCE_REVISION_ID = 'finite-grammar-0001';
export const DICTIONARY_SOURCE_REVISION_SOURCE = Object.freeze({
  name: '原有释义＋语法形态校订',
  license: 'Meanings retain their source licences; active grammar metadata is project editorial correction, not MIT source text',
  url: 'https://zhuodashuai.github.io/vocab/dictionary-source-revisions.html'
});
const ORIGINAL_VERSION = '474e8115824074012f7a918453f977f3a8d21c6ae25016c8a44a1fc8c2d264cc';
const LEDGER_SHA = 'cdf8077a3337d7a9618fae69b5f9b05af6a6a65dd99e409b284307721e1120e1';
const REVIEW_SHA = 'a4dccc2531ebe53c4ed6da70ff2c9737b204ec8b4faf542f901d641f57b1f5eb';
const REVIEW_STAGE = 'independent-exact-future-source-and-pair-review-not-implemented-not-admitted-not-published';
const EXPECTED = Object.freeze([
  Object.freeze(['are',1734477,'e828935cad697619a4cb1eaf2c97c5994241c73b9e056d2737e72ec90c9aeac3','bfddf568c202ae14f6f89bb0305de47f624721d8718d7b47d5feb99e35078dec']),
  Object.freeze(['did',9346366,'44f918b9913e0c3666b33908f6d0fd54fb5f72219a39404bacbacb6ffdacacc3','e5681a63b84992d3d86f48ee162bed0fa5707078cb53cadab819a70dea2c741b']),
  Object.freeze(['had',9580946,'5fe060dfb509c5c0bc6e77ab921a1a5f7412196ad78d40495b80ef3a373d86f4','fbff1820898bd346fee8844faccccc1ff62e89678045a751f7e63b1f2b430b63']),
  Object.freeze(['been',9097027,'4030727ee7158361c13f84ba0496def845fa6b294949ed380202da9965f5bdd2','771941a3ded55caa4964753774da3560ad86508c66d6276fc404d601bbcc5ed8'])
]);
const verifiedPacks = new WeakSet();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = message => {throw new Error(`Invalid dictionary source revision: ${message}.`);};

function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some(field => {
      const descriptor=Object.getOwnPropertyDescriptor(value,field);
      return !descriptor || !('value' in descriptor) || !descriptor.enumerable;
    })) invalid(`${label} fields`);
}
function array(value, maximum, label, minimum=0) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype
    || value.length<minimum || value.length>maximum || Reflect.ownKeys(value).length!==value.length+1) invalid(label);
  for(let i=0;i<value.length;i++) {
    const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
    if(!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid(label);
  }
}
/** Reject getters, symbols, cycles and values silently lost by JSON before hashing. */
function jsonValue(value, ancestors=new Set(), depth=0) {
  if(depth>64) invalid('JSON depth');
  if(value===null || typeof value==='boolean') return;
  if(typeof value==='string') {
    if(typeof value.isWellFormed==='function' && !value.isWellFormed()) invalid('JSON Unicode');
    return;
  }
  if(typeof value==='number') {if(!Number.isFinite(value)) invalid('JSON number');return;}
  if(!value || typeof value!=='object' || ancestors.has(value)) invalid('non-JSON or cyclic value');
  if(Array.isArray(value)) array(value,200000,'JSON array');
  else {
    if(![Object.prototype,null].includes(Object.getPrototypeOf(value))) invalid('JSON object prototype');
    for(const key of Reflect.ownKeys(value)) {
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(typeof key!=='string' || !descriptor.enumerable || !('value' in descriptor)) invalid('JSON property');
    }
  }
  ancestors.add(value);
  for(const child of Object.values(value)) jsonValue(child,ancestors,depth+1);
  ancestors.delete(value);
}
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if(value && typeof value==='object') {for(const child of Object.values(value)) freeze(child);Object.freeze(value);}
  return value;
}
function sourceRecord(record,label) {
  object(record,['id','term','partOfSpeech','meaning','forms','source','seed','variants'],label);
  object(record.seed,['rank','forms','workbook'],`${label} seed`);
  array(record.forms,64,`${label} forms`);array(record.seed.forms,64,`${label} seed forms`);
  array(record.variants,8,`${label} variants`,1);
  for(const variant of record.variants) object(variant,['partOfSpeech','meaning','source'],`${label} variant`);
}

/** This finite contract has four immutable targets, not a general-purpose source override. */
export function validateDictionarySourceRevisions(pack) {
  jsonValue(pack);
  object(pack,['schemaVersion','id','originalDictionaryVersion','authorPrincipal','source','entries'],'pack');
  if(pack.schemaVersion!==1 || pack.id!==DICTIONARY_SOURCE_REVISION_ID
    || pack.originalDictionaryVersion!==ORIGINAL_VERSION || pack.authorPrincipal!=='c') invalid('pack identity or author');
  object(pack.source,['name','license','url'],'source');
  if(!isDeepStrictEqual(pack.source,DICTIONARY_SOURCE_REVISION_SOURCE)) invalid('project editorial source descriptor');
  array(pack.entries,4,'exact four entries',4);
  const terms=new Set(),ids=new Set();
  pack.entries.forEach((entry,index)=>{
    object(entry,['term','id','beforeSha256','afterSha256','before','after'],'entry');
    const [term,id,beforeSha,afterSha]=EXPECTED[index];
    if(terms.has(entry.term) || ids.has(entry.id)) invalid('duplicate target');
    terms.add(entry.term);ids.add(entry.id);
    if(entry.term!==term || entry.id!==id || entry.beforeSha256!==beforeSha || entry.afterSha256!==afterSha) invalid('unexpected target or source hashes');
    sourceRecord(entry.before,`${term} before`);sourceRecord(entry.after,`${term} after`);
    if(hash(entry.before)!==beforeSha || hash(entry.after)!==afterSha) invalid(`${term} complete record hash`);
    if(entry.before.term!==term || entry.after.term!==term || entry.before.id!==id || entry.after.id!==id) invalid('target record identity');
    for(const field of ['id','term','meaning','seed','variants']) if(!isDeepStrictEqual(entry.before[field],entry.after[field])) invalid(`${term} immutable ${field}`);
    if(entry.after.source!=='grammar-reviewed' || entry.after.partOfSpeech!=='verb' || entry.after.forms.length) invalid('active correction fields');
    if(!isDeepStrictEqual(entry.after,{...entry.before,partOfSpeech:'verb',forms:[],source:'grammar-reviewed'})) invalid('unapproved changed fields');
  });
  if(hash(pack)!==LEDGER_SHA) invalid('finite ledger semantic root');
  return pack;
}

/** The ledger hash excludes the separate prior review; original and revised records stay in it. */
export function dictionarySourceRevisionIntegrity(pack) {
  validateDictionarySourceRevisions(pack);
  return {schemaVersion:1,id:pack.id,rows:4,semanticSha256:hash(pack),reviewSemanticSha256:REVIEW_SHA};
}

/** Original E2 source opinions are authenticated, not relabelled as approval of this implementation. */
export function verifyDictionarySourceRevisions(pack,integrity,review) {
  validateDictionarySourceRevisions(pack);
  object(integrity,['schemaVersion','id','rows','semanticSha256','reviewSemanticSha256'],'integrity');
  if(!isDeepStrictEqual(integrity,dictionarySourceRevisionIntegrity(pack))) invalid('independent integrity root mismatch');
  jsonValue(review);
  if(!review || typeof review!=='object' || Array.isArray(review)) invalid('review object');
  if(review.sourceCandidateAuthorPrincipal!==pack.authorPrincipal || review.pairAuthorPrincipal!=='root'
    || review.reviewerPrincipal!=='e2' || review.reviewerPrincipal===pack.authorPrincipal
    || review.reviewerPrincipal===review.pairAuthorPrincipal) invalid('review author/reviewer independence');
  if(review.schemaVersion!==1 || review.stage!==REVIEW_STAGE || review.formalAdmissions!==0
    || review.sourceRepairsApplied!==0 || review.coverageAdded!==0 || review.published!==false) invalid('prior review scope');
  array(review.perTerm,4,'review four targets',4);
  for(const [index,entry] of pack.entries.entries()) {
    const decision=review.perTerm[index];
    if(!decision || typeof decision!=='object' || Array.isArray(decision)
      || decision.term!==entry.term || decision.beforeSourceSha256!==entry.beforeSha256
      || decision.proposedSourceSha256!==entry.afterSha256
      || !isDeepStrictEqual(decision.beforeSource,entry.before) || !isDeepStrictEqual(decision.proposedSource,entry.after)
      || decision.candidateSourceDecision!=='conditionally-suitable-exact-source-transition') invalid('exact prior source review binding');
  }
  if(hash(review)!==REVIEW_SHA) invalid('prior independent review semantic root');
  const verified=freeze({pack:clone(pack),integrity:clone(integrity),review:clone(review),
    source:{...pack.source,sha256:integrity.semanticSha256}});
  verifiedPacks.add(verified);
  return verified;
}

/** Validate every target first, then return replacements; failure never partially mutates input. */
export function applyDictionarySourceRevisions(records,verifiedPack) {
  if(!verifiedPack || !verifiedPacks.has(verifiedPack)) invalid('unverified pack');
  array(records,200000,'canonical records',4);
  const entries=verifiedPack.pack.entries,byTerm=new Map(entries.map(entry=>[entry.term,entry]));
  const byId=new Map(entries.map(entry=>[entry.id,entry]));
  const terms=new Set(),ids=new Set(),found=new Set();
  for(const record of records) {
    jsonValue(record);
    if(!record || typeof record!=='object' || Array.isArray(record)
      || !Number.isSafeInteger(record.id) || record.id<0 || record.id>30000000 || typeof record.term!=='string' || !record.term) invalid('canonical record identity');
    if(terms.has(record.term) || ids.has(record.id)) invalid('duplicate canonical target or record');
    terms.add(record.term);ids.add(record.id);
    const entry=byTerm.get(record.term),idEntry=byId.get(record.id);
    if(idEntry && idEntry!==entry) invalid('target id under unknown term');
    if(!entry) continue;
    if(record.id!==entry.id || hash(record)!==entry.beforeSha256 || !isDeepStrictEqual(record,entry.before)) invalid(`stale or altered target ${record.term}`);
    found.add(record.term);
  }
  if(found.size!==4) invalid('missing target');
  const result=records.map(record=>byTerm.has(record.term)?clone(byTerm.get(record.term).after):record);
  const report={id:verifiedPack.pack.id,applied:4,supersededPosReviewed:4,changedTerms:entries.map(entry=>entry.term),
    originalDictionaryVersion:verifiedPack.pack.originalDictionaryVersion,ledgerSha256:verifiedPack.integrity.semanticSha256,
    reviewSha256:verifiedPack.integrity.reviewSemanticSha256,
    scope:'Exact active metadata only; immutable MIT seed/variants retained; prior source opinion is not code or example-admission approval',
    transitions:entries.map(({term,id,beforeSha256,afterSha256})=>({term,id,beforeSha256,afterSha256}))};
  return {records:result,report};
}
