import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateReviewedSensePack, reviewedSensePackHash, loadReviewedSenseBuild } from './build-reviewed-dictionary-senses.mjs';
import { createAdditiveExamplesLoader } from '../../vocab/js/dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from '../../vocab/js/dictionary-examples-release-v4.js';
import { canonicalDisplayContexts, canonicalSourceBucket } from '../../vocab/js/canonical-example-repair-source.js';
import { COMMON_CHINESE_GROUPS } from '../../vocab/js/chinese-related-common.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const selectedGroupSourceHash = value => sha(JSON.stringify(value));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const read = async file => JSON.parse(await fs.readFile(file));
const HASH = /^[a-f0-9]{64}$/u, AUTHOR = /^AI\/[a-z0-9_-]{1,100}$/u, BATCH = /^batch-\d{4}\.json$/u;
const text = (x,max=2000) => typeof x === 'string' && Boolean(x.trim()) && x.length <= max
  && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(x);
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) return false;
  const own=Reflect.ownKeys(value);
  return own.length === keys.length && keys.every(key => Object.hasOwn(value,key))
    && own.every(key => typeof key === 'string' && keys.includes(key)
      && Object.getOwnPropertyDescriptor(value,key)?.enumerable === true
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
}
function list(value, empty=false) {
  return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && (empty || value.length > 0) && Reflect.ownKeys(value).length === value.length+1
    && Reflect.ownKeys(value).every(key => key === 'length' || typeof key === 'string'
      && /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < value.length
      && Object.getOwnPropertyDescriptor(value,key)?.enumerable === true
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
}
function proof(sense) {
  return { id:sense.id, partOfSpeech:sense.partOfSpeech, meaningZh:sense.meaningZh, examples:sense.examples };
}
function selectedProof(row) {
  let hash = 0xcbf29ce484222325n;
  for (const character of row.term.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase()) {
    hash ^= BigInt(character.codePointAt(0)); hash=BigInt.asUintN(64,hash*0x100000001b3n);
  }
  return { id:`reviewed-sense:${hash.toString(16).padStart(16,'0')}`, partOfSpeech:row.partOfSpeech,
    meaningZh:row.meaning, examples:[{en:row.en,zh:row.zh}] };
}

/** A separate reader approves a complete group/source/example linkage. This
 * never approves the original full raw definition or a caller's claimed flag. */
export function validateSelectedCommonSenseBindings(source, review, {
  groups, runtimeGroups, groupExampleScopes, canonicalRecords, canonicalLocations, manifestVersion,
  selections, originalDTOs,
} = {}) {
  if (!object(source,['schemaVersion','author','entries']) || source.schemaVersion !== 1
    || !AUTHOR.test(source.author || '') || !list(source.entries)
    || !object(review,['schemaVersion','sourceSha256','reviewer','independentOfAuthor','approvedHeads','issues'])
    || review.schemaVersion !== 1 || review.sourceSha256 !== selectedGroupSourceHash(source)
    || !AUTHOR.test(review.reviewer || '') || review.reviewer === source.author
    || review.independentOfAuthor !== true || !list(review.approvedHeads) || !list(review.issues,true)
    || new Set(review.approvedHeads).size !== review.approvedHeads.length
    || ![groups,runtimeGroups,groupExampleScopes,canonicalRecords,canonicalLocations,selections,originalDTOs].every(x=>x instanceof Map)
    || !HASH.test(manifestVersion || '')) throw Error('Missing independent selected common-sense source approval');
  const required=['groupId','sourceId','groupSha256','groupPos','groupSense','groupHeads','groupTerms','head',
    'canonicalId','canonicalSourceSha256','canonicalManifestVersion','canonicalShard','canonicalRecord',
    'selectedBatch','selectedSourceSha256','selectedRowSha256','selectedRow','directTerms','selectedExampleProof',
    'originalGroupExampleProofs','originalDTO','originalDTOSha256','legacySavedContexts','reason','references'];
  const seen=new Set(), approved=new Set(review.approvedHeads), rows=[];
  for (const entry of source.entries) {
    if (!object(entry,required) || !text(entry.head,200) || seen.has(entry.head)
      || !text(entry.reason) || !list(entry.references) || entry.references.some(url=>{
        try { const parsed=new URL(url); return parsed.protocol !== 'https:' || Boolean(parsed.username || parsed.password); } catch { return true; }
      }) || !['groupSha256','canonicalSourceSha256','canonicalManifestVersion','selectedSourceSha256','selectedRowSha256','originalDTOSha256'].every(key=>HASH.test(entry[key] || ''))
      || !BATCH.test(entry.selectedBatch || '') || !Number.isSafeInteger(entry.canonicalId)) throw Error('Invalid finite selected common-sense binding');
    seen.add(entry.head);
    if (!approved.has(entry.head)) continue;
    if (review.issues.some(issue=>issue.term===entry.head && issue.blocking===true && !issue.resolution?.trim())) throw Error('Unresolved selected common-sense mapping issue');
    const group=groups.get(entry.groupId),runtimeGroup=runtimeGroups.get(entry.groupId),canonical=canonicalRecords.get(entry.head),location=canonicalLocations.get(entry.head),selection=selections.get(entry.head),originalDTO=originalDTOs.get(entry.head);
    if (!group || !runtimeGroup || selectedGroupSourceHash(group) !== entry.groupSha256
      || group.sourceId !== entry.sourceId || group.pos !== entry.groupPos || group.sense !== entry.groupSense
      || !equal(group.heads,entry.groupHeads) || !equal(group.terms,entry.groupTerms)
      || !group.heads.includes(entry.head) || !group.sourceMembers.map(x=>x.replace(/_/gu,' ')).includes(entry.head)
      || !/^pwn30:\d{8}-[nvar]$/u.test(entry.sourceId)) throw Error('Selected mapping changed the exact reviewed WordNet group');
    const runtimeKeys=['id','number','sourceId','pos','sense','terms','heads','note','forbidden','evidence','exampleSenses'];
    if (!object(runtimeGroup,runtimeKeys)
      || runtimeKeys.filter(key=>key!=='exampleSenses').some(key=>!equal(runtimeGroup[key],group[key]))
      || !equal(runtimeGroup.exampleSenses,groupExampleScopes.get(group.id))) throw Error('Existing runtime group or complete original example scope drifted');
    if (!canonical || canonical.id !== entry.canonicalId || !equal(canonical,entry.canonicalRecord)
      || selectedGroupSourceHash(canonical) !== entry.canonicalSourceSha256 || manifestVersion !== entry.canonicalManifestVersion
      || !location || !object(entry.canonicalShard,['bucket','file','sha256','bytes'])
      || !equal({bucket:location.bucket,file:location.file,sha256:location.sha256,bytes:location.bytes},entry.canonicalShard)) throw Error('Selected mapping lacks the complete authenticated canonical source');
    if (!selection || selection.batch !== entry.selectedBatch
      || reviewedSensePackHash(selection.pack) !== entry.selectedSourceSha256
      || !equal(selection.row,entry.selectedRow) || selectedGroupSourceHash(selection.row) !== entry.selectedRowSha256
      || selection.row.canonicalId !== canonical.id || selection.row.canonicalSourceSha256 !== entry.canonicalSourceSha256
      || selection.row.partOfSpeech !== group.pos) throw Error('Selected mapping lacks an exact independently approved selected row');
    const direct=[...new Set(group.evidence.filter(row=>row.head===entry.head).flatMap(row=>row.terms))];
    if (!list(entry.directTerms) || new Set(entry.directTerms).size !== entry.directTerms.length
      || !equal(direct,entry.directTerms) || !entry.directTerms.every(term=>group.terms.includes(term))) throw Error('Selected mapping changed the established direct/related partition');
    if (!equal(selectedProof(selection.row),entry.selectedExampleProof)
      || !originalDTO || !equal(originalDTO,entry.originalDTO) || selectedGroupSourceHash(originalDTO) !== entry.originalDTOSha256
      || !equal(runtimeGroup.exampleSenses[entry.head],entry.originalGroupExampleProofs)
      || !entry.originalGroupExampleProofs.every(p=>originalDTO.senses.some(s=>equal(proof(s),p)))
      || !equal(canonicalDisplayContexts(canonical),entry.legacySavedContexts)) throw Error('Selected mapping lacks exact new/old example or legacy saved-context proof');
    rows.push({groupId:entry.groupId,sourceId:entry.sourceId,groupTerms:entry.groupTerms,
      runtimeGroup,head:entry.head,canonicalId:entry.canonicalId,canonicalSourceSha256:entry.canonicalSourceSha256,
      canonicalManifestVersion:entry.canonicalManifestVersion,canonicalShard:entry.canonicalShard,
      canonicalRecordJSON:JSON.stringify(canonical),selectedSourceSha256:entry.selectedSourceSha256,
      selectedRowSha256:entry.selectedRowSha256,selectedRow:entry.selectedRow,directTerms:entry.directTerms,
      selectedExampleProof:entry.selectedExampleProof,originalDTOJSON:JSON.stringify(originalDTO),
      originalDTOSha256:entry.originalDTOSha256,legacySavedContexts:entry.legacySavedContexts});
  }
  if ([...approved].some(head=>!seen.has(head))) throw Error('Mapping approval names an absent head');
  return rows;
}

export function renderSelectedCommonSenseModule(rows) {
  return '// Generated independently reviewed canonical selected-sense group bindings; raw source and old group evidence remain unchanged.\n'
    + 'const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };\n'
    + `export const SELECTED_COMMON_SENSE_BINDINGS = freeze(${JSON.stringify(rows,null,2)});\n`;
}

export async function loadSelectedCommonSenseBuild({root=ROOT}={}) {
  const at=p=>path.join(root,p),dir=at('tooling/dictionary/selected-common-senses');
  const index=await read(path.join(dir,'index.json'));
  if (!object(index,['schemaVersion','batches']) || index.schemaVersion!==1 || !list(index.batches)) throw Error('Invalid selected common-sense index');
  const manifest=await read(at('vocab/data/expanded-dictionary/manifest.json')),canonicalRecords=new Map(),canonicalLocations=new Map();
  for (const descriptor of manifest.english.shards) {
    const bytes=await fs.readFile(at('vocab/data/expanded-dictionary/'+descriptor.file));
    if (bytes.length!==descriptor.bytes || sha(bytes)!==descriptor.sha256) throw Error('Canonical source changed');
    for (const record of JSON.parse(bytes).records) {
      const previous=canonicalRecords.get(record.term);
      if (previous && !equal(previous,record)) throw Error('Conflicting complete canonical record copies');
      canonicalRecords.set(record.term,record);
      // Form shards contain authenticated copies of another bucket's head.
      // Provenance names the head's own canonical bucket, never the last copy.
      if (descriptor.bucket===canonicalSourceBucket(record.term)) canonicalLocations.set(record.term,descriptor);
    }
  }
  // This full existing builder authenticates global source reviews and duplicate
  // boundaries before this new optional linkage may consume any selected row.
  if (root!==ROOT) throw Error('Use the build in its own checkout for selected-group admission');
  const selectedBuild=await loadReviewedSenseBuild(),builtByTerm=new Map(selectedBuild.rows.map(r=>[r.term,r]));
  const selectedIndex=await read(at('tooling/dictionary/reviewed-senses/index.json')),selections=new Map();
  for (const batch of selectedIndex.batches) {
    const pack=await read(at('tooling/dictionary/reviewed-senses/source/'+batch.source)),review=await read(at('tooling/dictionary/reviewed-senses/reviews/'+batch.review));
    const approved=validateReviewedSensePack(pack,review,canonicalRecords);
    for (const row of approved) { assert(builtByTerm.has(row.term)); selections.set(row.term,{batch:batch.source,pack,row:pack.entries.find(e=>e.term===row.term)}); }
  }
  const groups=new Map((await read(at('tooling/dictionary/chinese-related-common.json'))).groups.map(g=>[g.id,g])),runtimeGroups=new Map(COMMON_CHINESE_GROUPS.map(g=>[g.id,g])),groupExampleScopes=new Map((await read(at('tooling/dictionary/chinese-related-common-examples.json'))).groups.map(g=>[g.id,g.heads])),originalDTOs=new Map();
  const loader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:async input=>{
    const url=new URL(input);if(url.protocol!=='file:' || !url.href.startsWith(pathToFileURL(at('vocab')+'/').href)) throw Error('Group build only reads local packaged original examples');return new Response(await fs.readFile(url));
  }});
  const rows=[],heads=new Set();
  try {
    for (const batch of index.batches) {
      if (!object(batch,['source','review']) || !BATCH.test(batch.source) || !BATCH.test(batch.review)) throw Error('Invalid selected-group batch path');
      const source=await read(path.join(dir,'source',batch.source)),review=await read(path.join(dir,'reviews',batch.review));
      for (const entry of source.entries || []) if (typeof entry.head==='string' && !originalDTOs.has(entry.head)) originalDTOs.set(entry.head,await loader.load(entry.head,{lookupQuery:entry.head}));
      const built=validateSelectedCommonSenseBindings(source,review,{groups,runtimeGroups,groupExampleScopes,canonicalRecords,canonicalLocations,manifestVersion:manifest.version,selections,originalDTOs});
      for (const row of built) { if(heads.has(row.head)) throw Error('Repeated selected-group head');heads.add(row.head);rows.push(row); }
    }
  } finally { loader.close(); }
  rows.sort((a,b)=>a.head<b.head?-1:a.head>b.head?1:0);
  return {rows,source:renderSelectedCommonSenseModule(rows)};
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const result=await loadSelectedCommonSenseBuild(),file=path.join(ROOT,'vocab/js/selected-common-sense-data.js');
  if(process.argv.includes('--check')) assert.equal(await fs.readFile(file,'utf8'),result.source,'Stale independently reviewed selected group bindings');
  else await fs.writeFile(file,result.source);
  console.log(JSON.stringify({reviewedSelectedGroupHeads:result.rows.length,oldGroupSourceChanged:false}));
}
