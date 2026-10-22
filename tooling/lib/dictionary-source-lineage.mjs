/** Historical example evidence stays bound to its genuine archived dictionary. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {applyDictionarySourceRevisions,verifyDictionarySourceRevisions} from './dictionary-source-revisions.mjs';

export const SOURCE_LINEAGE_BASE_VERSION='474e8115824074012f7a918453f977f3a8d21c6ae25016c8a44a1fc8c2d264cc';
const BASE_MANIFEST_SHA='fb729e8f3334658e5f82df311390710dc3f05d278c125197e95de5ed1f96dd30';
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

/** Never silently replace a frozen source version with today's version or accept arbitrary mismatch. */
export async function assertHistoricalDictionaryLineage(historicalVersion,currentManifest,currentCanonical,{root=ROOT}={}){
  assert.equal(historicalVersion,SOURCE_LINEAGE_BASE_VERSION,'No reviewed transition for this historical version');
  const revisionDirectory=path.join(root,'tooling/dictionary/source-revisions');
  const archivedBytes=await readFile(path.join(revisionDirectory,'baseline-'+SOURCE_LINEAGE_BASE_VERSION+'.manifest.json'));
  assert.equal(hash(archivedBytes),BASE_MANIFEST_SHA,'Historical manifest archive changed');
  const historicalManifest=JSON.parse(archivedBytes);assert.equal(historicalManifest.version,historicalVersion);
  const directory=path.join(root,'vocab/data/expanded-dictionary');
  const actualManifest=await json(path.join(directory,'manifest.json'));
  assert.deepEqual(currentManifest,actualManifest,'Historical assertion must refer to the actual current manifest');
  const before=await readDictionaryNamespace(historicalManifest,directory);
  const after=await readDictionaryNamespace(actualManifest,directory);
  assert.equal(before.records.size,102609);assert.equal(after.records.size,102609);
  assert(currentCanonical instanceof Map);assert.equal(currentCanonical.size,after.records.size);
  for(const[term,row]of after.records)assert.deepEqual(currentCanonical.get(term),row);
  if(historicalVersion===actualManifest.version){
    assert.deepEqual(after.records,before.records);assert.deepEqual(after.keys,before.keys);assert.deepEqual(after.tokens,before.tokens);
    return {historicalVersion,currentVersion:actualManifest.version,changedTerms:[],unchangedRecords:102609};
  }
  const [pack,integrity,review]=await Promise.all(['finite-grammar-0001.json','finite-grammar-0001.integrity.json',
    'finite-grammar-0001.review.json'].map(file=>json(path.join(revisionDirectory,file))));
  const verified=verifyDictionarySourceRevisions(pack,integrity,review);
  assert.equal(verified.pack.originalDictionaryVersion,historicalVersion);
  return assertExactRevisionNamespace(before,after,verified);
}
