/** Historical example evidence stays bound to its genuine archived dictionary. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {applyDictionarySourceRevisions,verifyDictionarySourceRevisions} from './dictionary-source-revisions.mjs';
import {applyDictionaryPosNotationRevisions,verifyDictionaryPosNotationRevisions} from './dictionary-pos-notation-revisions.mjs';
import {applySemanticRevisionInMemory,verifySemanticRevisionBundle,SEMANTIC_REVISION_PROOF_FILES,SEMANTIC_SOURCE_REVISION_ID} from './dictionary-semantic-revisions.mjs';

export const SOURCE_LINEAGE_BASE_VERSION='474e8115824074012f7a918453f977f3a8d21c6ae25016c8a44a1fc8c2d264cc';
const BASE_MANIFEST_SHA='fb729e8f3334658e5f82df311390710dc3f05d278c125197e95de5ed1f96dd30';
export const SOURCE_LINEAGE_NOTATION_BASE_VERSION='9f27bbc2f083007095b2e6830a87b2d0a7e18353f91a2e962b82443b2480339b';
const NOTATION_BASE_MANIFEST_SHA='c609196db70d0563c9ea92136cf6e4bd2d958359c954058f88862f1839d207b7';
export const SOURCE_LINEAGE_SEMANTIC_BASE_VERSION='5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432';
const SEMANTIC_BASE_MANIFEST_SHA='da424df6edf245db2da69925a1c6e5e2d0936f3458709aa0ded1dde82983a82b';
const ROOT=path.resolve(import.meta.dirname,'../..');
const SHA=/^[a-f0-9]{64}$/u;
const hash=value=>createHash('sha256').update(value).digest('hex');
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const fold=value=>value.normalize('NFKC').replace(/[‘’‛ʼ]/gu,"'").replace(/[“”„‟]/gu,'"').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US');
function bucket(value){let result=2166136261;for(const char of fold(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619)>>>0;}return result%128;}
const json=async file=>JSON.parse(await readFile(file,'utf8'));
function exactKeys(value,fields){assert(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...fields].sort());}

export function dictionaryNamespaceVersion(namespace){
  const records=[...namespace.records.values()].sort((a,b)=>a.id-b.id);
  const keyRows=[...namespace.keys].sort(([a],[b])=>cmp(a,b));
  const tokenRows=[...namespace.tokens].sort(([a],[b])=>cmp(a,b));
  return hash(JSON.stringify({records,keyRows,tokenRows,sources:namespace.manifest.sources,counts:namespace.manifest.counts}));
}

/** Load every descriptor/physical copy and rederive the content-addressed root. */
export async function readDictionaryNamespace(manifest,directory){
  exactKeys(manifest,['schemaVersion','version','counts','sources','english','chinese']);
  assert.equal(manifest.schemaVersion,2);assert.match(manifest.version,SHA);
  exactKeys(manifest.counts,['records','englishKeys','chineseTokens']);
  const records=new Map(),ids=new Map(),keys=new Map(),tokens=new Map();
  const namespace={manifest,records,keys,tokens};
  for(const[kind,part]of[['en',manifest.english],['zh',manifest.chinese]]){
    exactKeys(part,['buckets','shards']);assert.equal(part.buckets,128);assert.equal(part.shards.length,128);
    for(const[index,descriptor]of part.shards.entries()){
      exactKeys(descriptor,['bucket','file','sha256','bytes','count']);assert.equal(descriptor.bucket,index);
      assert.equal(descriptor.file,manifest.version+'/'+kind+'-'+String(index).padStart(3,'0')+'.json');
      assert.match(descriptor.sha256,SHA);
      const bytes=await readFile(path.join(directory,descriptor.file));
      assert.equal(bytes.length,descriptor.bytes);assert.equal(hash(bytes),descriptor.sha256);
      const shard=JSON.parse(bytes);
      exactKeys(shard,kind==='en'?['schemaVersion','kind','bucket','records','keys']:['schemaVersion','kind','bucket','postings']);
      assert.equal(shard.schemaVersion,2);assert.equal(shard.kind,kind);assert.equal(shard.bucket,index);
      if(kind==='en'){
        const localIds=new Set();
        for(const row of shard.records){
          assert(Number.isSafeInteger(row.id)&&row.id>=0&&typeof row.term==='string');
          assert(!localIds.has(row.id),'Duplicate physical record in one English shard');localIds.add(row.id);
          if(records.has(row.term))assert.deepEqual(row,records.get(row.term),'Conflicting physical record '+row.term);
          else{assert(!ids.has(row.id),'Duplicate canonical ID');records.set(row.term,row);ids.set(row.id,row.term);}
        }
        assert.equal(shard.keys.length,descriptor.count);
        for(const[key,refs]of shard.keys){
          assert.equal(bucket(key),index,'Wrong English key bucket');assert(!keys.has(key),'Duplicate lookup key');assert(refs.length>0);
          for(const ref of refs)assert(localIds.has(ref.id),'Reference must resolve within its physical English shard');
          keys.set(key,refs);
        }
      }else{
        assert.equal(shard.postings.length,descriptor.count);
        for(const[token,postings]of shard.postings){assert.equal(bucket(token),index,'Wrong Chinese token bucket');assert(!tokens.has(token),'Duplicate Chinese token');tokens.set(token,postings);}
      }
    }
  }
  assert.equal(records.size,manifest.counts.records);assert.equal(keys.size,manifest.counts.englishKeys);assert.equal(tokens.size,manifest.counts.chineseTokens);
  for(const[key,refs]of keys)for(const ref of refs){
    const target=records.get(ids.get(ref.id));assert(target,'Dangling dictionary reference');
    if(ref.kind==='canonical')assert.equal(fold(target.term),key);
    else if(ref.kind==='form')assert(target.forms.some(form=>fold(form)===key),'Stale active form reference');
    else assert.equal(ref.kind,'context');
  }
  assert.equal(dictionaryNamespaceVersion(namespace),manifest.version,'Dictionary content-addressed root mismatch');
  return namespace;
}

/** Generic pure comparison; production authority comes from the pinned baseline and branded finite pack. */
export function assertExactRevisionNamespace(before,after,verifiedPack){
  assert.equal(dictionaryNamespaceVersion(before),before.manifest.version);
  assert.equal(dictionaryNamespaceVersion(after),after.manifest.version);
  const applied=applyDictionarySourceRevisions([...before.records.values()],verifiedPack);
  assert.equal(after.records.size,before.records.size);
  const expected=new Map(applied.records.map(row=>[row.term,row]));
  for(const[term,row]of expected)assert.deepEqual(after.records.get(term),row,'Unapproved source change '+term);
  const expectedSources={...before.manifest.sources,'grammar-reviewed':verifiedPack.source};
  assert(!Object.hasOwn(before.manifest.sources,'grammar-reviewed'),'Source revision must start from its real pre-revision namespace');
  assert.deepEqual(after.manifest.sources,expectedSources,'Unapproved source attribution change');
  const expectedKeys=new Map([...before.keys].map(([key,refs])=>[key,structuredClone(refs)]));
  const removed=[];
  for(const entry of verifiedPack.pack.entries)for(const form of entry.before.forms){
    const key=fold(form),refs=expectedKeys.get(key);assert(refs,'Missing original form reference');
    const bad={id:entry.id,kind:'form',term:form};
    assert.equal(refs.filter(ref=>isDeepStrictEqual(ref,bad)).length,1,'Ambiguous/missing exact stale reference');
    const retained=refs.filter(ref=>!isDeepStrictEqual(ref,bad));
    if(retained.length)expectedKeys.set(key,retained);else expectedKeys.delete(key);
    removed.push({key,reference:bad});
  }
  assert.equal(removed.length,4);
  assert.deepEqual([...after.keys].sort(([a],[b])=>cmp(a,b)),[...expectedKeys].sort(([a],[b])=>cmp(a,b)),
    'Only the four exact stale form-to-ID pairs may disappear; canonical/context/parent refs must survive');
  assert.deepEqual([...after.tokens].sort(([a],[b])=>cmp(a,b)),[...before.tokens].sort(([a],[b])=>cmp(a,b)),
    'Chinese postings must remain unchanged');
  assert.deepEqual(after.manifest.counts,{...before.manifest.counts,englishKeys:expectedKeys.size});
  return {historicalVersion:before.manifest.version,currentVersion:after.manifest.version,
    changedTerms:applied.report.changedTerms,unchangedRecords:before.records.size-4,removedExactFormRefs:removed,
    ledgerSha256:applied.report.ledgerSha256,reviewSha256:applied.report.reviewSha256};
}

/** The new finite POS/notation step does not inherit the four-grammar authority. */
export function assertExactPosNotationNamespace(before,after,verifiedPack){
  assert.equal(dictionaryNamespaceVersion(before),before.manifest.version);
  assert.equal(dictionaryNamespaceVersion(after),after.manifest.version);
  const applied=applyDictionaryPosNotationRevisions([...before.records.values()],verifiedPack);
  assert.equal(after.records.size,before.records.size);
  for(const row of applied.records)assert.deepEqual(after.records.get(row.term),row,'Unapproved POS/notation source change '+row.term);
  assert(!Object.hasOwn(before.manifest.sources,'pos-notation-reviewed'),'Notation step must start before its source existed');
  assert.deepEqual(after.manifest.sources,{...before.manifest.sources,'pos-notation-reviewed':verifiedPack.source},'Only the exact reviewed notation attribution may be added');
  const sorted=map=>[...map].sort(([a],[b])=>cmp(a,b));
  assert.deepEqual(sorted(after.keys),sorted(before.keys),'POS notation does not change any canonical, valid form, parent or context reference');
  assert.deepEqual(sorted(after.tokens),sorted(before.tokens),'Only ASCII POS notation changed: all Chinese postings must be identical');
  assert.deepEqual(after.manifest.counts,before.manifest.counts);
  return {historicalVersion:before.manifest.version,currentVersion:after.manifest.version,
    changedTerms:applied.report.changedTerms,unchangedRecords:before.records.size-3,
    englishReferencesUnchanged:true,chinesePostingsUnchanged:true,
    ledgerSha256:applied.report.ledgerSha256,reviewSha256:applied.report.reviewSha256};
}

/** A fresh single-use capability is required by each build/chain comparison. */
export async function loadVerifiedSemanticRevision({root=ROOT}={}){
  const directory=path.join(root,'tooling/dictionary/source-revisions');
  const proofs=Object.fromEntries(await Promise.all(Object.entries(SEMANTIC_REVISION_PROOF_FILES).map(async([key,file])=>[key,await readFile(path.join(directory,file),'utf8')])));
  return verifySemanticRevisionBundle(SEMANTIC_SOURCE_REVISION_ID,proofs);
}

function semanticChineseTokens(value){
  const tokens=new Set();
  for(const run of fold(value).match(/\p{Script=Han}+/gu)||[]){const characters=[...run];for(let i=0;i<characters.length;i++){
    tokens.add(characters[i]);if(i+1<characters.length)tokens.add(characters[i]+characters[i+1]);}}
  return tokens;
}

/** Exact reviewed five-source delta; never a generic source/version waiver. */
export function assertExactSemanticNamespace(before,after,verifiedPack){
  for(const[name,namespace]of[['before',before],['after',after]]){
    assert(namespace.records instanceof Map,'Canonical records must be a Map');
    for(const[term,row]of namespace.records)assert.equal(term,row.term,'Canonical Map key must match its complete record: '+name);
  }
  assert.equal(before.manifest.version,SOURCE_LINEAGE_SEMANTIC_BASE_VERSION);
  assert.equal(dictionaryNamespaceVersion(before),before.manifest.version);
  assert.equal(dictionaryNamespaceVersion(after),after.manifest.version);
  const applied=applySemanticRevisionInMemory({dictionaryVersion:before.manifest.version,records:[...before.records.values()],englishKeys:[...before.keys]},verifiedPack);
  const sortedRecords=[...after.records.values()].sort((a,b)=>a.id-b.id),sorted=map=>[...map].sort(([a],[b])=>cmp(a,b));
  assert.equal(after.records.size,before.records.size);
  assert.equal(hash(JSON.stringify(sortedRecords)),applied.report.changedCanonicalAggregateSha256,'Every complete after-source must equal the exact reviewed result');
  assert.equal(hash(JSON.stringify(sorted(after.keys))),applied.report.englishKeysSha256,'Every canonical/form/context English reference must remain exact');
  assert(!Object.hasOwn(before.manifest.sources,'semantic-editorial'),'Semantic step starts before this source existed');
  const source={...verifiedPack.source,sha256:verifiedPack.candidateSha256};
  assert.equal(JSON.stringify(after.manifest.sources),JSON.stringify({...before.manifest.sources,'semantic-editorial':source}),'Only the exact short reviewed semantic source may be appended');
  const targetIds=new Set(applied.report.changes.map(row=>row.id)),allIds=new Set(sortedRecords.map(row=>row.id));
  const expectedTargetTokens=new Map(sortedRecords.filter(row=>targetIds.has(row.id)).map(row=>[row.id,
    new Set([row,...(row.variants||[])].flatMap(variant=>[...semanticChineseTokens(variant.meaning)]))]));
  let changedTokens=0;
  for(const token of new Set([...before.tokens.keys(),...after.tokens.keys()])){
    const oldIds=before.tokens.get(token)||[],newIds=after.tokens.get(token)||[];
    if(after.tokens.has(token))assert(Array.isArray(newIds)&&newIds.length>0,'Empty invented Chinese postings are not part of the reviewed delta');
    assert(newIds.every((id,index)=>allIds.has(id)&&(index===0||newIds[index-1]<id)),'Chinese postings must contain unique ordered real IDs');
    assert.deepEqual(newIds.filter(id=>!targetIds.has(id)),oldIds.filter(id=>!targetIds.has(id)),'Non-target Chinese posting changed: '+token);
    for(const[id,tokens]of expectedTargetTokens)assert.equal(newIds.includes(id),tokens.has(token),'Target Chinese posting must derive only from final active senses: '+token);
    if(!isDeepStrictEqual(oldIds,newIds))changedTokens++;
  }
  for(const[id,tokens]of expectedTargetTokens)for(const token of tokens)assert(after.tokens.get(token)?.includes(id),'Missing final target Chinese token '+token);
  assert.deepEqual(after.manifest.counts,{records:before.records.size,englishKeys:before.keys.size,chineseTokens:after.tokens.size});
  return{historicalVersion:before.manifest.version,currentVersion:after.manifest.version,changedTerms:applied.report.changes.map(row=>row.term),
    unchangedRecords:applied.report.unchangedRecords,englishReferencesUnchanged:true,nonTargetChinesePostingsUnchanged:true,
    exactTargetChinesePostingsVerified:true,changedChineseTokens:changedTokens,candidateSha256:applied.report.candidateSha256,reviewSha256:applied.report.reviewSha256};
}

/** Only named byte-pinned archives are a source of historical evidence. */
export async function readHistoricalDictionaryNamespace(version,{root=ROOT}={}){
  const expected=version===SOURCE_LINEAGE_BASE_VERSION?BASE_MANIFEST_SHA:
    version===SOURCE_LINEAGE_NOTATION_BASE_VERSION?NOTATION_BASE_MANIFEST_SHA:
    version===SOURCE_LINEAGE_SEMANTIC_BASE_VERSION?SEMANTIC_BASE_MANIFEST_SHA:null;
  assert(expected,'No reviewed transition for this historical version');
  const file=path.join(root,'tooling/dictionary/source-revisions','baseline-'+version+'.manifest.json');
  const bytes=await readFile(file);assert.equal(hash(bytes),expected,'Historical manifest archive changed');
  const manifest=JSON.parse(bytes);assert.equal(manifest.version,version);
  const namespace=await readDictionaryNamespace(manifest,path.join(root,'vocab/data/expanded-dictionary'));
  assert.equal(namespace.records.size,102609);return namespace;
}

/** Check the exact registered chain; never rebase a frozen source onto today. */
export async function assertHistoricalDictionaryLineage(historicalVersion,currentManifest,currentCanonical,{root=ROOT}={}){
  assert([SOURCE_LINEAGE_BASE_VERSION,SOURCE_LINEAGE_NOTATION_BASE_VERSION,SOURCE_LINEAGE_SEMANTIC_BASE_VERSION].includes(historicalVersion),'No reviewed transition for this historical version');
  const directory=path.join(root,'vocab/data/expanded-dictionary'),revisionDirectory=path.join(root,'tooling/dictionary/source-revisions');
  const actualManifest=await json(path.join(directory,'manifest.json'));
  assert.deepEqual(currentManifest,actualManifest,'Historical assertion must refer to the actual current manifest');
  const after=await readDictionaryNamespace(actualManifest,directory);
  assert.equal(after.records.size,102609);assert(currentCanonical instanceof Map);assert.equal(currentCanonical.size,after.records.size);
  for(const[term,row]of after.records)assert.deepEqual(currentCanonical.get(term),row);
  const original=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_BASE_VERSION,{root});
  const identity=()=>({historicalVersion,currentVersion:actualManifest.version,changedTerms:[],unchangedRecords:102609});
  if(actualManifest.version===SOURCE_LINEAGE_BASE_VERSION){
    assert.equal(historicalVersion,SOURCE_LINEAGE_BASE_VERSION,'A later historical source cannot regress to an earlier current namespace');
    assert.deepEqual(after.records,original.records);assert.deepEqual(after.keys,original.keys);assert.deepEqual(after.tokens,original.tokens);return identity();
  }
  const [grammarPack,grammarIntegrity,grammarReview]=await Promise.all(['finite-grammar-0001.json','finite-grammar-0001.integrity.json',
    'finite-grammar-0001.review.json'].map(file=>json(path.join(revisionDirectory,file))));
  const grammar=verifyDictionarySourceRevisions(grammarPack,grammarIntegrity,grammarReview);
  const bridge=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_NOTATION_BASE_VERSION,{root});
  // The earlier comparison stays unchanged: exactly four stale form references,
  // unchanged meanings/variants/Chinese postings and no arbitrary source delta.
  const grammarTransition=assertExactRevisionNamespace(original,bridge,grammar);
  if(actualManifest.version===SOURCE_LINEAGE_NOTATION_BASE_VERSION){
    assert.notEqual(historicalVersion,SOURCE_LINEAGE_SEMANTIC_BASE_VERSION,'A later source cannot regress to the grammar bridge');
    assert.deepEqual(after.manifest,bridge.manifest,'Identity at the D22 source must still match its byte-pinned historical manifest');
    return historicalVersion===SOURCE_LINEAGE_BASE_VERSION?grammarTransition:identity();
  }
  const [pack,integrity,review]=await Promise.all(['finite-pos-notation-0001.json','finite-pos-notation-0001.integrity.json',
    'finite-pos-notation-0001.review.json'].map(file=>json(path.join(revisionDirectory,file))));
  const notation=verifyDictionaryPosNotationRevisions(pack,integrity,review);
  const semanticBase=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_SEMANTIC_BASE_VERSION,{root});
  const notationTransition=assertExactPosNotationNamespace(bridge,semanticBase,notation);
  if(actualManifest.version===SOURCE_LINEAGE_SEMANTIC_BASE_VERSION){
    assert.deepEqual(after.manifest,semanticBase.manifest,'The pre-semantic source must equal its byte-pinned archive');
    if(historicalVersion===SOURCE_LINEAGE_SEMANTIC_BASE_VERSION)return identity();
    if(historicalVersion===SOURCE_LINEAGE_NOTATION_BASE_VERSION)return notationTransition;
    return{historicalVersion,currentVersion:actualManifest.version,changedTerms:[...grammarTransition.changedTerms,...notationTransition.changedTerms],unchangedRecords:102602,
      transitions:[grammarTransition,notationTransition],scope:'Both separate finite transitions, not a generic version mismatch waiver'};
  }
  const semanticTransition=assertExactSemanticNamespace(semanticBase,after,await loadVerifiedSemanticRevision({root}));
  if(historicalVersion===SOURCE_LINEAGE_SEMANTIC_BASE_VERSION)return semanticTransition;
  const transitions=historicalVersion===SOURCE_LINEAGE_NOTATION_BASE_VERSION?[notationTransition,semanticTransition]:[grammarTransition,notationTransition,semanticTransition];
  const changedTerms=[...new Set(transitions.flatMap(row=>row.changedTerms))];
  return{historicalVersion,currentVersion:actualManifest.version,changedTerms,unchangedRecords:after.records.size-changedTerms.length,
    transitions,scope:'Separate fixed grammar, POS-notation and five-source semantic contracts; no arbitrary source/version bypass'};
}
