import{createHash}from'node:crypto';import{readFile,writeFile}from'node:fs/promises';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';
import{createAdditiveExamplesLoader}from'../../vocab/js/dictionary-examples-additive.js';import{dictionaryExamplesRelease}from'../../vocab/js/dictionary-examples-release-v4.js';
import{canonicalSnapshot,canonicalEqual,canonicalDisplayContexts}from'../../vocab/js/canonical-example-repair-source.js';import{parseCorrectionSourceManifest}from'./build-dictionary-example-corrections.mjs';
const ROOT=resolve(import.meta.dirname,'../..'),hash=x=>createHash('sha256').update(x).digest('hex'),jsonHash=x=>hash(JSON.stringify(x));
export const selectedLegacySourceHash=jsonHash;
const TERMS=['worrisome','feasible','preemptively','nominate','conceive','determinant','stigma','squabble','litigator','sustenance','forestall','disclose','antiquated','unsettling','palpitation','painkiller','allergy','toilet paper','pharmacy','hairdryer'];
const CLASSROOM_0018_TERMS=['party','institution','column','in the picture','precipitously','dissolve'];

function validateFiniteSelectedLegacySource(source,review,{selectedRows,canonicalByTerm,originalByTerm,rawPacks},terms){
 source=canonicalSnapshot(source);review=canonicalSnapshot(review);
 if(source.schemaVersion!==1||source.kind!=='literal-head-exact-old-card-example-preservation'
  ||!/^AI\/[a-z0-9_-]{1,100}$/u.test(source.author??'')||review.schemaVersion!==1
  ||review.sourceSha256!==jsonHash(source)||review.independentOfAuthor!==true||review.mode!==undefined
  ||!/^AI\/[a-z0-9_-]{1,100}$/u.test(review.reviewer??'')||review.reviewer===source.author
  ||!Array.isArray(review.issues)||review.issues.length||!Array.isArray(source.entries)
  ||source.entries.length!==terms.length||JSON.stringify(source.entries.map(r=>r.term))!==JSON.stringify(terms)
  ||JSON.stringify(review.approvedTerms)!==JSON.stringify(terms))throw Error('Missing finite'+terms.length+' different-reader legacy-example approval');
 const rows=[];
 for(const row of source.entries){const canonical=canonicalByTerm.get(row.term),current=selectedRows.find(r=>r.term===row.term),original=originalByTerm.get(row.term),pack=rawPacks.get(row.selectedBatch),raw=pack?.entries.find(r=>r.term===row.term);
  if(!canonical||canonical.term!==row.term||canonical.id!==row.canonicalId||jsonHash(canonical)!==row.canonicalSourceSha256
   ||!canonicalEqual(canonical,row.exactCanonicalRecord)||!current||current.canonicalId!==row.canonicalId
   ||current.canonicalSourceSha256!==row.canonicalSourceSha256||!canonicalEqual(current,row.selectedEntry)
   ||jsonHash(current)!==row.selectedEntrySha256||!pack||jsonHash(pack)!==row.selectedSourcePackSha256
   ||!raw||jsonHash(raw)!==row.selectedSourceRowSha256||raw.canonicalId!==row.canonicalId
   ||raw.canonicalSourceSha256!==row.canonicalSourceSha256||!canonicalEqual(original,row.originalDTO)
   ||jsonHash(original)!==row.originalDTOSha256||!canonicalEqual(canonicalDisplayContexts(canonical),row.acceptedSavedContexts))throw Error('Stale or rebound finite legacy-example row: '+row.term);
  rows.push({term:row.term,canonicalId:row.canonicalId,canonicalSourceSha256:row.canonicalSourceSha256,
   selectedEntryJSON:JSON.stringify(current),originalDTOJSON:JSON.stringify(original),
   contexts:row.acceptedSavedContexts,reviewer:review.reviewer});
 }
 return rows;
}
// Separate closed cohorts retain the exact earlier20 approvals. New terms never
// enter by a caller-supplied allowlist or by copying a current display meaning.
export function validateSelectedLegacySource(source,review,context){return validateFiniteSelectedLegacySource(source,review,context,TERMS);}
export function validateClassroomLegacySource0018(source,review,context){return validateFiniteSelectedLegacySource(source,review,context,CLASSROOM_0018_TERMS);}

export async function loadSelectedLegacyExampleBuild({root=ROOT}={}){
 const base=join(root,'tooling/dictionary/reviewed-senses/legacy-examples'),cohorts=await Promise.all([['intent-classroom-0011.json',validateSelectedLegacySource],['classroom-remaining-0018.json',validateClassroomLegacySource0018]].map(async([name,validate])=>({source:JSON.parse(await readFile(join(base,'source',name))),review:JSON.parse(await readFile(join(base,'reviews',name))),validate}))),manifest=parseCorrectionSourceManifest(await readFile(join(root,'vocab/data/expanded-dictionary/manifest.json'))),canonicalByTerm=new Map(),originalByTerm=new Map(),rawPacks=new Map(),memo=new Map();
 const reader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:async input=>{const url=new URL(input);if(url.protocol!=='file:')throw Error('Legacy build only reads packaged static files');return new Response(await readFile(url));}});
 try{for(const row of cohorts.flatMap(c=>c.source.entries)){const pointer=row.canonicalAsset,descriptor=manifest.english.shards.find(p=>p.file===pointer.file);if(!descriptor||descriptor.sha256!==pointer.sha256||descriptor.bytes!==pointer.bytes||!Number.isSafeInteger(pointer.recordIndex)||pointer.recordIndex<0)throw Error('Unpinned canonical asset');if(!memo.has(pointer.file)){const bytes=await readFile(join(root,'vocab/data/expanded-dictionary',pointer.file));if(bytes.length!==descriptor.bytes||hash(bytes)!==descriptor.sha256)throw Error('Canonical bytes changed');memo.set(pointer.file,JSON.parse(bytes));}const canonical=memo.get(pointer.file).records[pointer.recordIndex];if(canonical?.term!==row.term)throw Error('Wrong canonical record index');canonicalByTerm.set(row.term,canonical);originalByTerm.set(row.term,await reader.load(row.term,{lookupQuery:row.term}));if(!/^batch-\d{4}\.json$/u.test(row.selectedBatch))throw Error('Invalid source batch');if(!rawPacks.has(row.selectedBatch))rawPacks.set(row.selectedBatch,JSON.parse(await readFile(join(root,'tooling/dictionary/reviewed-senses/source',row.selectedBatch))));}
 }finally{reader.close();}
 const {REVIEWED_SENSE_ENTRIES:selectedRows}=await import(pathToFileURL(join(root,'vocab/js/reviewed-senses-data.js')));
 const rows=cohorts.flatMap(c=>c.validate(c.source,c.review,{selectedRows,canonicalByTerm,originalByTerm,rawPacks}));
 if(new Set(rows.map(r=>r.term)).size!==26)throw Error('Finite legacy cohorts must remain disjoint');
 const rendered='// Exact old-card example preservation, independently reviewed; no new-sense or whole-legacy-tuple permission.\nexport const SELECTED_LEGACY_EXAMPLE_BINDINGS = Object.freeze('+JSON.stringify(rows,null,2)+'.map(row => Object.freeze({ ...row, contexts: Object.freeze(row.contexts.map(context => Object.freeze(context))) })));\n';return{rows,source:rendered};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const build=await loadSelectedLegacyExampleBuild(),file=join(ROOT,'vocab/js/selected-legacy-examples-data.js');if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==build.source)throw Error('Stale finite legacy-example bindings');}else await writeFile(file,build.source);console.log(JSON.stringify({preservedHeads:build.rows.length,preservedContexts:build.rows.reduce((n,r)=>n+r.contexts.length,0),originalImmutableAssetsChanged:false}));}
