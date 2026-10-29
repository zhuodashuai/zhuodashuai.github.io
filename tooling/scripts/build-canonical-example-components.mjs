import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {exampleSourceHash,validateExampleReview} from './build-dictionary-examples.mjs';
import {authenticateCanonicalRepairRecord,canonicalRepairSnapshot} from './build-canonical-example-repairs.mjs';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {COMPONENT_KIND,COMPONENT_HEADS,canonicalComponentContexts,validateCanonicalComponentTable} from '../../vocab/js/canonical-example-components.js';
const ROOT=path.resolve(import.meta.dirname,'../..'),sha=v=>createHash('sha256').update(v).digest('hex'),hash=v=>sha(JSON.stringify(v)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const POLICY='literal-unscoped-and-canonical-merge-old-selected-preserve-new-selected-only-v1';
const APPROVED_SOURCE='f71cabbeff614fab47dae406df336baa599cd1fae1d590c5eee07ef6ec5b326f';
const APPROVED_REVIEW='cfa370458f3409b50b6b61784bad7f4cae73f7a906ea97b89958110380117e53';
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Object.keys(v).sort().join()!==[...keys].sort().join())throw Error('Invalid closed component admission');};
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export async function compileCanonicalExampleComponents(inputs,{pins,readPublicAsset,loadOriginalEntry,reservedPairs=[]}={}){
  const frozen=canonicalRepairSnapshot(inputs),{source,languageReview,bindings,admission}=frozen;
  exact(frozen,['source','languageReview','bindings','admission']);
  const accepted=validateExampleReview(source,languageReview);
  exact(admission,['schemaVersion','kind','sourceSha256','languageReviewSha256','policy','authorization','wholeRawSourceApproved','rows']);
  if(accepted.length!==8||!equal([...accepted.map(r=>r.term)].sort(),[...COMPONENT_HEADS].sort())
    ||admission.schemaVersion!==1||admission.kind!=='canonical-component-display-policy-v1'||admission.policy!==POLICY
    ||admission.wholeRawSourceApproved!==false||admission.sourceSha256!==APPROVED_SOURCE||exampleSourceHash(source)!==APPROVED_SOURCE
    ||admission.languageReviewSha256!==APPROVED_REVIEW
    ||admission.languageReviewSha256!==sha(JSON.stringify(languageReview,null,2)+'\n')
    ||typeof admission.authorization!=='string'||!admission.authorization.trim()
    ||bindings.schemaVersion!==1||bindings.rows.length!==8||admission.rows.length!==8)throw Error('Missing exact eight-role language/display admission');
  const key=v=>v.normalize('NFKC').replace(/[‘’]/gu,"'").replace(/[“”]/gu,'"').replace(/\s+/gu,' ').trim().toLowerCase();
  const english=new Set(reservedPairs.map(p=>key(p.en))),chinese=new Set(reservedPairs.map(p=>key(p.zh))),rows=[],seen=new Set();
  for(const pair of source.entries){
    const b=bindings.rows.find(r=>r.term===pair.term),a=admission.rows.find(r=>r.term===pair.term);
    if(!b||!a||seen.has(pair.term))throw Error('Missing/duplicate component binding');seen.add(pair.term);
    exact(a,['term','canonicalId','canonicalSourceSha256','originalDTOSha256','pairSha256','canonicalContexts','legacyContexts','componentContexts','sourceQualification','wholeRawSourceApproved']);
    const boundPair={...b.ownNewPair};delete boundPair.reference;
    if(!equal(boundPair,pair)||b.wholeRawSourceApproved!==false||b.originalSourceRetained!==true
      ||a.canonicalId!==b.canonicalId||a.canonicalSourceSha256!==b.canonicalSourceSha256||a.originalDTOSha256!==b.originalDTOSha256
      ||a.pairSha256!==hash(pair)||a.wholeRawSourceApproved!==false)throw Error('Changed exact selected pair/source policy');
    const binding={term:b.term,canonicalId:b.canonicalId,canonicalManifestSha256:b.canonicalManifestSha256,
      canonicalSourceSha256:b.canonicalSourceSha256,exactCanonicalRecord:b.exactCanonicalRecord,
      canonicalSourceDescriptor:b.sourceDescriptors[b.exactCanonicalRecord.source]};
    const canonical=await authenticateCanonicalRepairRecord(binding,pins,{readPublicAsset});
    const originalInput=await loadOriginalEntry(pair.term,{lookupQuery:pair.term}),old=canonicalRepairSnapshot(originalInput);
    if(!equal(old,b.originalDTO)||hash(old)!==b.originalDTOSha256)throw Error('Changed complete original component DTO');
    const contexts=canonicalComponentContexts(canonical,old,pair);
    if(Object.keys(contexts).some(k=>!equal(contexts[k],a[k])))throw Error('Changed finite component display policy');
    if(english.has(key(pair.en))||chinese.has(key(pair.zh)))throw Error('Duplicate active component EN/ZH');
    english.add(key(pair.en));chinese.add(key(pair.zh));
    rows.push({term:pair.term,canonicalId:b.canonicalId,canonicalSourceSha256:b.canonicalSourceSha256,
      exactCanonicalRecord:canonical,canonicalSourceDescriptor:binding.canonicalSourceDescriptor,
      expectedOriginalEntry:old,expectedOriginalEntrySha256:b.originalDTOSha256,...contexts,
      componentPair:pair,componentPairSha256:hash(pair),componentId:`canonical-component:${hash([b.canonicalId,b.canonicalSourceSha256,hash(pair)])}`,
      reviewer:languageReview.reviewer,sourceQualification:a.sourceQualification,wholeRawSourceApproved:false});
    if(!equal(canonicalRepairSnapshot(originalInput),old))throw Error('Async original DTO mutation');
  }
  if(!equal(canonicalRepairSnapshot(inputs),frozen))throw Error('Async component inputs mutation');
  return validateCanonicalComponentTable({schemaVersion:1,kind:COMPONENT_KIND,pins,sourceSha256:exampleSourceHash(source),reviewSha256:hash(languageReview),admissionSha256:hash(admission),rows});
}
export const renderCanonicalExampleComponents=table=>'// Generated selected example components; canonical definitions and complete old DTOs remain unchanged.\nconst freeze=value=>{if(value&&typeof value===\'object\'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};\nexport const CANONICAL_EXAMPLE_COMPONENTS=freeze('+JSON.stringify(table,null,2)+');\n';
// The new JS module is not a byte-hashed source asset. Accept only the two
// complete Git checkout transports of its exact deterministic source.
export const canonicalComponentOutputMatches=(actual,expected)=>actual===expected||actual===expected.replaceAll('\n','\r\n');
export async function loadCanonicalExampleComponentBuild(){
  const dir=path.join(ROOT,'tooling/dictionary/examples/evidence/classroom-components-0012'),inputs={};
  for(const [key,file]of [['source','source.json'],['languageReview','language-review.json'],['bindings','bindings.json'],['admission','admission.json']])inputs[key]=await json(path.join(dir,file));
  const loader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:async url=>new Response(await fs.readFile(new URL(url)))});
  // Only read authenticated released data; no normal dictionary/example compiler runs.
  const reservedPairs=[];
  const walk=v=>{if(!v||typeof v!=='object')return;if(typeof v.en==='string'&&typeof v.zh==='string')reservedPairs.push({en:v.en,zh:v.zh});for(const x of Object.values(v))if(x&&typeof x==='object')walk(x);};
  const {gunzipSync}=await import('node:zlib'),base=path.join(ROOT,'vocab/data/dictionary-examples');
  const catalogueBytes=await fs.readFile(path.join(base,dictionaryExamplesRelease.catalogue.file));
  if(sha(catalogueBytes)!==dictionaryExamplesRelease.catalogue.sha256)throw Error('Original catalogue drift');
  const cat=JSON.parse(gunzipSync(catalogueBytes)),manifestBytes=await fs.readFile(path.join(base,cat.base.file));
  if(sha(manifestBytes)!==cat.base.sha256)throw Error('Original example manifest drift');
  const manifest=JSON.parse(manifestBytes);
  for(const s of manifest.shards){const bytes=await fs.readFile(path.join(base,s.file));if(sha(bytes)!==s.sha256)throw Error('Original example shard drift');walk(JSON.parse(bytes));}
  for(const d of cat.deltas){const bytes=await fs.readFile(path.join(base,d.file));if(sha(bytes)!==d.sha256)throw Error('Original example delta drift');walk(JSON.parse(gunzipSync(bytes)));}
  for(const file of ['canonical-example-repairs-data.js','dictionary-example-corrections-data.js','reviewed-senses-data.js','everyday-lookup-data.js'])for(const value of Object.values(await import(pathToFileURL(path.join(ROOT,'vocab/js',file)))))walk(value);
  try{const table=await compileCanonicalExampleComponents(inputs,{pins:dictionaryExamplesRelease.source,
    readPublicAsset:rel=>fs.readFile(path.join(ROOT,'vocab/data',rel)),loadOriginalEntry:(term,options)=>loader.load(term,options),reservedPairs});
    return {table,source:renderCanonicalExampleComponents(table)};
  }finally{loader.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const result=await loadCanonicalExampleComponentBuild(),file=path.join(ROOT,'vocab/js/canonical-example-components-data.js');
  if(process.argv.includes('--check')){if(!canonicalComponentOutputMatches(await fs.readFile(file,'utf8'),result.source))throw Error('Stale component data');}
  else await fs.writeFile(file,result.source);
  console.log(JSON.stringify({componentHeads:result.table.rows.length,originalDefinitionsAndDTOsChanged:false,check:process.argv.includes('--check')}));
}
