/** Exact three project POS/notation corrections; not a general lexical override. */
import {createHash} from 'node:crypto';
import {isDeepStrictEqual,types} from 'node:util';

export const DICTIONARY_POS_NOTATION_REVISION_ID = 'future-pos-notation-three-0001';
export const DICTIONARY_POS_NOTATION_REVISION_SOURCE = Object.freeze({
  name: '原有释义＋词性标记校订',
  license: 'Lexical Chinese retains ECDICT MIT licensing; POS and inline labels are project editorial corrections. Princeton WordNet 3.1 is reference evidence under its own licence.',
  url: 'https://zhuodashuai.github.io/vocab/dictionary-pos-notation-revisions.html'
});
const SOURCE_ID = 'pos-notation-reviewed';
const ORIGINAL_VERSION = '9f27bbc2f083007095b2e6830a87b2d0a7e18353f91a2e962b82443b2480339b';
const LEDGER_SHA = '3a5409dad7b45fd84d3644886ab89fa03ab0ea85d96c6f61b4ebf78263a86c19';
// Actual E exact-source/whole-pair opinion, not approval of this implementation.
const REVIEW_SHA = '78171150bcebbdc72ab5380d17a9ab9f6fd23d27eb1ed99b40ed70d85c4b2dc8';
const EXPECTED = Object.freeze([
  Object.freeze(['headdress',2636670,'noun','a.','n.',
    '06cdffb56af1b77e87193c97755bcffc95c962e6ee9d2ceba65c8816cd2a7712',
    '54cb94e85187ae7cdfa317d978c2bcad9b05dbda35acc2686ffe7f01b5108a14']),
  Object.freeze(['longingly',3253174,'adverb','a.','adv.',
    '2367e2af3bf507dd2386beed707e38c8e041f7d6d41879b36ce8119a73927cf8',
    '2ada0a55be37d2f49cbb5739e7b3af3146e34bf6dcaa34320e8634583a706485']),
  Object.freeze(['moonless',3431945,'adjective','n.','a.',
    '221719398506406c1f63af63c6181638e131aaa41c6f452e18a62e5f4e6e861b',
    '8e93f93be43b1b8bc857fc778853734a0fc535aa5197513a0ebb987eea318695'])
]);
const verifiedPacks = new WeakSet();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pairHash = cells => createHash('sha256').update(cells.join('\t')).digest('hex');
const invalid = message => {throw new Error(`Invalid dictionary POS notation revision: ${message}.`);};
const copy = value => JSON.parse(JSON.stringify(value));

function fields(value,expected,label) {
  if(!value || typeof value!=='object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length!==expected.length
    || expected.some(key=>!Object.hasOwn(value,key))) invalid(`${label} fields`);
}

/** Read descriptor values only: getters, symbols, decorated/sparse arrays cannot hide changes. */
function json(value,ancestors=new Set(),depth=0) {
  if(types.isProxy(value)) invalid('Proxy is not plain JSON');
  if(depth>64) invalid('JSON depth');
  if(value===null || typeof value==='boolean') return;
  if(typeof value==='string') {
    if(!value.isWellFormed()) invalid('JSON Unicode');
    return;
  }
  if(typeof value==='number') {
    if(!Number.isFinite(value) || Object.is(value,-0)) invalid('JSON number');
    return;
  }
  if(!value || typeof value!=='object' || ancestors.has(value)) invalid('non-JSON or cyclic value');
  const isArray=Array.isArray(value),prototype=Object.getPrototypeOf(value);
  if(isArray ? prototype!==Array.prototype : ![Object.prototype,null].includes(prototype)) invalid('JSON prototype');
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
  if(isArray) {
    const length=descriptors.length;
    if(!length || !('value' in length) || !Number.isSafeInteger(length.value)
      || length.value>200000 || keys.length!==length.value+1) invalid('dense JSON array');
    for(let index=0;index<length.value;index++) if(!Object.hasOwn(descriptors,String(index))) invalid('sparse JSON array');
  }
  ancestors.add(value);
  for(const key of keys) {
    const descriptor=descriptors[key];
    if(typeof key!=='string' || !key.isWellFormed() || !('value' in descriptor)
      || (!descriptor.enumerable && !(isArray && key==='length'))) invalid('JSON property');
    if(isArray && key==='length') continue;
    json(descriptor.value,ancestors,depth+1);
  }
  ancestors.delete(value);
}

function freeze(value) {
  if(value && typeof value==='object') {
    for(const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function record(value,label) {
  fields(value,['id','term','partOfSpeech','meaning','forms','source','seed'],label);
  fields(value.seed,['rank','forms','workbook'],`${label} seed`);
  if(!Array.isArray(value.forms) || !Array.isArray(value.seed.forms)) invalid(`${label} forms`);
}

/** The unchanged complete original ledger includes its historical holds and conditional pairs. */
export function validateDictionaryPosNotationRevisions(pack) {
  json(pack);
  fields(pack,['schemaVersion','id','authorPrincipal','baselineSourceVersion','sourceDescriptorProposal','entries'],'pack');
  if(pack.schemaVersion!==1 || pack.id!==DICTIONARY_POS_NOTATION_REVISION_ID
    || pack.authorPrincipal!=='c' || pack.baselineSourceVersion!==ORIGINAL_VERSION) invalid('pack identity or author');
  fields(pack.sourceDescriptorProposal,['id','name','license','url'],'source');
  if(!isDeepStrictEqual(pack.sourceDescriptorProposal,{id:SOURCE_ID,...DICTIONARY_POS_NOTATION_REVISION_SOURCE})) invalid('source descriptor');
  if(!Array.isArray(pack.entries) || pack.entries.length!==3) invalid('exact three entries');
  for(let index=0;index<EXPECTED.length;index++) {
    const entry=pack.entries[index];
    fields(entry,['term','id','beforeSha256','afterSha256','before','after','allowedFieldChanges',
      'notationOnly','activeVariantDisposition','history','ownPrimaryReading','unchangedConditionalRootPair',
      'independentlyApproved','implemented','admitted'],'entry');
    const [term,id,pos,oldMarker,newMarker,beforeSha,afterSha]=EXPECTED[index];
    if(entry.term!==term || entry.id!==id || entry.beforeSha256!==beforeSha
      || entry.afterSha256!==afterSha) invalid('unexpected, duplicate, reordered or stale target');
    record(entry.before,`${term} before`);record(entry.after,`${term} after`);
    if(hash(entry.before)!==beforeSha || hash(entry.after)!==afterSha) invalid(`${term} whole source hash`);
    if(entry.before.term!==term || entry.after.term!==term || entry.before.id!==id || entry.after.id!==id) invalid('record identity');
    if(typeof entry.before.meaning!=='string' || !entry.before.meaning.startsWith(oldMarker)
      || entry.after.meaning!==newMarker+entry.before.meaning.slice(oldMarker.length)) invalid('exact leading notation only');
    const expectedAfter={...entry.before,partOfSpeech:pos,meaning:entry.after.meaning,source:SOURCE_ID};
    if(!isDeepStrictEqual(entry.after,expectedAfter)) invalid('unapproved source fields');
    fields(entry.history,['fullRawBeforeRecord','supersededRawPrimaryTriple','priorHolds','oldHoldClosed'],'source history');
    if(!isDeepStrictEqual(entry.allowedFieldChanges,['partOfSpeech','meaning','source'])
      || !isDeepStrictEqual(entry.history.fullRawBeforeRecord,entry.before)
      || entry.history.oldHoldClosed!==false || entry.independentlyApproved!==false
      || entry.implemented!==false || entry.admitted!==false) invalid('historical source opinion scope');
    const pair=entry.unchangedConditionalRootPair;
    fields(pair,['pair','pairSha256','authorPrincipal','existingReviewerPrincipal','reviewFile','reviewSha256',
      'decision','exactAfterSourceIndependentlyReviewed'],'conditional Root pair');
    if(pair.authorPrincipal!=='root' || pair.existingReviewerPrincipal!=='e'
      || pair.exactAfterSourceIndependentlyReviewed!==false || !Array.isArray(pair.pair)
      || pair.pair.length!==5 || pair.pair[0]!==term || pair.pair[1]!==pos
      || pairHash(pair.pair)!==pair.pairSha256) invalid('conditional Root pair lineage');
  }
  if(hash(pack)!==LEDGER_SHA) invalid('complete original ledger root');
  return pack;
}

/** Semantic root excludes separate approval, so review never participates in a circular ledger hash. */
export function dictionaryPosNotationRevisionIntegrity(pack) {
  validateDictionaryPosNotationRevisions(pack);
  return {schemaVersion:1,id:pack.id,rows:3,semanticSha256:LEDGER_SHA,reviewSemanticSha256:REVIEW_SHA};
}

/** Authenticate exact source opinions; these are not code or example-admission approvals. */
export function verifyDictionaryPosNotationRevisions(pack,integrity,review) {
  validateDictionaryPosNotationRevisions(pack);
  json(integrity);json(review);
  fields(integrity,['schemaVersion','id','rows','semanticSha256','reviewSemanticSha256'],'integrity');
  if(!isDeepStrictEqual(integrity,dictionaryPosNotationRevisionIntegrity(pack))) invalid('integrity root');
  fields(review,['schemaVersion','kind','authorPrincipal','pairAuthorPrincipal','reviewerPrincipal','complete',
    'completeScope','candidateFileSha256','ledgerSemanticSha256','sourceDescriptor','sourceVersionObserved',
    'examplesVersionObserved','inputs','primaryFileHashes','actualReading','perTerm','conditions','scope','result'],'review');
  if(review.authorPrincipal!==pack.authorPrincipal || review.pairAuthorPrincipal!=='root'
    || review.reviewerPrincipal!=='e' || review.reviewerPrincipal===pack.authorPrincipal
    || review.reviewerPrincipal===review.pairAuthorPrincipal) invalid('review principal independence');
  if(review.schemaVersion!==1 || review.complete!==true
    || review.kind!=='independent-exact-POS-notation-source-and-whole-pair-review-conditional-not-applied'
    || review.ledgerSemanticSha256!==LEDGER_SHA || review.sourceVersionObserved!==ORIGINAL_VERSION
    || !isDeepStrictEqual(review.sourceDescriptor,pack.sourceDescriptorProposal)) invalid('exact source review identity');
  fields(review.scope,['repositoryWrites','sourceChangesApplied','historyHoldsDeleted','newLanguageDecisions',
    'codeApproval','admitted','coverageAdded','published'],'review scope');
  if(!isDeepStrictEqual(review.scope,{repositoryWrites:0,sourceChangesApplied:0,historyHoldsDeleted:0,
    newLanguageDecisions:3,codeApproval:false,admitted:0,coverageAdded:0,published:false})) invalid('review scope');
  if(!Array.isArray(review.perTerm) || review.perTerm.length!==3) invalid('three independent opinions');
  for(let index=0;index<pack.entries.length;index++) {
    const entry=pack.entries[index],opinion=review.perTerm[index];
    fields(opinion,['term','id','decision','exactAfterSourceIndependentlyReviewed','exactSourceAndPairApproved',
      'beforeSha256','afterSha256','before','after','pair','pairSha256','wordCount',
      'currentChineseMeaningSupportsSelectedSense','sourceRationale','actualSentenceRole','wholePairFidelityRationale',
      'primaryRows','priorHolds','historicalHoldClosed','sourceApplied','admitted','coverageAdded'],'source opinion');
    if(opinion.term!==entry.term || opinion.id!==entry.id || opinion.beforeSha256!==entry.beforeSha256
      || opinion.afterSha256!==entry.afterSha256 || !isDeepStrictEqual(opinion.before,entry.before)
      || !isDeepStrictEqual(opinion.after,entry.after) || !isDeepStrictEqual(opinion.pair,entry.unchangedConditionalRootPair.pair)
      || opinion.pairSha256!==entry.unchangedConditionalRootPair.pairSha256
      || !isDeepStrictEqual(opinion.priorHolds,entry.history.priorHolds)
      || !isDeepStrictEqual(opinion.primaryRows,entry.ownPrimaryReading.allExactPrimaryRows)
      || opinion.decision!=='approve-conditionally-for-exact-finite-source-and-pair-reentry'
      || opinion.exactAfterSourceIndependentlyReviewed!==true || opinion.exactSourceAndPairApproved!==true
      || opinion.currentChineseMeaningSupportsSelectedSense!==true || opinion.historicalHoldClosed!==false
      || opinion.sourceApplied!==false || opinion.admitted!==false || opinion.coverageAdded!==0) invalid('exact independent source/pair/hold binding');
  }
  if(hash(review)!==REVIEW_SHA) invalid('original independent review semantic root');
  const verified=freeze({pack:copy(pack),integrity:copy(integrity),review:copy(review),
    source:{...DICTIONARY_POS_NOTATION_REVISION_SOURCE,sha256:LEDGER_SHA}});
  verifiedPacks.add(verified);
  return verified;
}

/** Validate the entire canonical input first; neither failure nor success mutates caller data. */
export function applyDictionaryPosNotationRevisions(records,verifiedPack) {
  if(!verifiedPack || !verifiedPacks.has(verifiedPack)) invalid('unverified pack');
  json(records);
  if(!Array.isArray(records) || records.length<3) invalid('canonical records');
  const entries=verifiedPack.pack.entries,byTerm=new Map(),byId=new Map();
  for(const entry of entries) {byTerm.set(entry.term,entry);byId.set(entry.id,entry);}
  const seenTerms=new Set(),seenIds=new Set(),found=new Set();
  for(let index=0;index<records.length;index++) {
    const item=records[index];
    if(!item || typeof item!=='object' || Array.isArray(item)
      || !Object.hasOwn(item,'id') || !Object.hasOwn(item,'term')
      || !Number.isSafeInteger(item.id) || item.id<0 || item.id>30000000
      || typeof item.term!=='string' || !item.term) invalid('canonical identity');
    if(seenTerms.has(item.term) || seenIds.has(item.id)) invalid('duplicate canonical term or id');
    seenTerms.add(item.term);seenIds.add(item.id);
    const entry=byTerm.get(item.term),idEntry=byId.get(item.id);
    if(idEntry && idEntry!==entry) invalid('target id under another term');
    if(!entry) continue;
    if(item.id!==entry.id || hash(item)!==entry.beforeSha256
      || !isDeepStrictEqual(item,entry.before)) invalid(`stale or changed ${item.term}`);
    found.add(item.term);
  }
  if(found.size!==3) invalid('missing target');
  const result=[];
  for(let index=0;index<records.length;index++) {
    const item=records[index];result.push(byTerm.has(item.term)?copy(byTerm.get(item.term).after):item);
  }
  return {records:result,report:{id:verifiedPack.pack.id,applied:3,changedTerms:entries.map(entry=>entry.term),
    originalDictionaryVersion:ORIGINAL_VERSION,sourceId:SOURCE_ID,ledgerSha256:LEDGER_SHA,
    reviewSha256:REVIEW_SHA,scope:'Exact POS and leading notation only; lexical remainder, IDs, forms and immutable seed preserved; no active historical variants or admission approval',
    transitions:entries.map(({term,id,beforeSha256,afterSha256})=>({term,id,beforeSha256,afterSha256}))}};
}
