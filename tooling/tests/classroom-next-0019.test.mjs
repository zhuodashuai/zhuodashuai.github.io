import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REVIEWED_SENSE_ENTRIES as allSelected} from '../../vocab/js/reviewed-senses-data.js';
import {historicalSelected187} from './helpers/classroom-history-0187.mjs';
const selected=historicalSelected187(allSelected);
import {SELECTED_LEGACY_EXAMPLE_BINDINGS as legacy} from '../../vocab/js/selected-legacy-examples-data.js';
import {DICTIONARY_EXAMPLE_CORRECTIONS as corrections} from '../../vocab/js/dictionary-example-corrections-data.js';
import {EVERYDAY_LOOKUP_ENTRIES as all,EVERYDAY_CHINESE_ALIASES as aliases} from '../../vocab/js/everyday-lookup-data.js';
import {SELECTED_COMMON_SENSE_BINDINGS as common} from '../../vocab/js/selected-common-sense-data.js';
import {historicalSelected183,historicalLegacy26} from './helpers/classroom-history-0183.mjs';
import {searchExpandedDictionary,resetExpandedDictionaryCacheForTests} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {allChineseResults,assertAuditableChineseRow} from './helpers/general-chinese-search-contract.mjs';
import {validateClassroomLegacySource0019,selectedLegacySourceHash} from '../scripts/build-selected-legacy-examples.mjs';
import {validateReviewedSensePack} from '../scripts/build-reviewed-dictionary-senses.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),sha=x=>createHash('sha256').update(x).digest('hex'),root=new URL('../../',import.meta.url),read=async f=>JSON.parse(await fs.readFile(new URL(f,root)));
const bytes=await fs.readFile(new URL('tooling/dictionary/reviewed-senses/classroom-next-fixture-0019.json',root));assert.equal(sha(bytes),'f3f2bdf39e76b6341a8468e47cd5cf3d463b8dfab2582d5ebdb9e6f3c8e2e40c');
const fixture=JSON.parse(bytes),source=fixture.source,review=fixture.review,approved=source.entries.filter(r=>review.approvedTerms.includes(r.term)),fetchImpl=async input=>new Response(await fs.readFile(new URL(input))),forbidden=()=>{throw Error('Selected lookup unexpectedly reached a fallback');};

test('current187 is exactly unchanged historical183 plus four reviewed classroom rows; full26 legacy and83 corrections remain exact',()=>{
 assert.deepEqual(review.approvedTerms,['acquire','norm','shape','stall']);assert.equal(hash(source),'05f26d0d40b5dad8a38e8908918c1670f3dca6448b359ea17ccb3383bee96d1d');assert.notEqual(source.author,review.reviewer);assert(review.independentOfAuthor);
 assert.equal(selected.length,187);assert.equal(new Set(selected.map(r=>r.term)).size,187);assert.equal(hash(selected),fixture.expectedCurrent.selectedSha256);assert.equal(historicalSelected183(selected).length,183);assert.deepEqual(selected.filter(r=>!fixture.baseline.selectedHeads.includes(r.term)).map(r=>r.term),['acquire','norm','shape','stall']);
 assert.equal(legacy.length,30);historicalLegacy26(legacy);assert.deepEqual(legacy.slice(26).map(r=>r.term),review.approvedTerms);assert.equal(corrections.length,83);assert.equal(hash(corrections),fixture.baseline.corrections83Sha256);
 // This historical release binds its original 1,025 complete ordinary rows;
 // later independently reviewed append-only phrases have their own fixture.
 assert(all.filter(r=>!r.reviewedCanonicalSense).length>=1025);assert.equal(hash(all.filter(r=>!r.reviewedCanonicalSense).slice(0,1025)),fixture.baseline.ordinarySha256);assert.equal(hash(aliases),fixture.baseline.aliasesSha256);assert.equal(hash(common),fixture.baseline.commonSha256);
 assert.equal(approved.reduce((n,r)=>n+r.meaning.split('\n').length,0),22);assert.equal(approved.reduce((n,r)=>n+r.englishForms.length,0),9);assert.equal(approved.reduce((n,r)=>n+r.chineseAliases.length,0),8);
});

test('same five-row source admits only safe4 and cannot force cite past its unresolved quotation-group hold',()=>{
 const canonical=new Map(fixture.bindings.map(r=>[r.term,r.canonicalRecord]));assert.deepEqual(validateReviewedSensePack(source,review,canonical).map(r=>r.term),review.approvedTerms);
 assert.throws(()=>validateReviewedSensePack(source,{...review,approvedTerms:[...review.approvedTerms,'cite']},canonical),/Unresolved selected-sense issue/u);assert(!selected.some(r=>r.term==='cite'));
});

test('all21 exact heads owner-bound forms and finite Chinese names return complete selected meanings and pairs locally',async()=>{
 let count=0;for(const row of approved)for(const query of[row.term,...row.englishForms,...row.chineseAliases]){const result=await searchExpandedDictionary(query,{fetchImpl:forbidden}),first=result.results[0];assert.equal(first.term,row.term,query);assert.equal(first.partOfSpeech,row.partOfSpeech);assert.equal(first.meaning,row.meaning);assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden}),result);const dto=await loadDictionaryExamples(row.term,{savedEntry:first,fetchImpl:forbidden});assert.deepEqual(dto,fixture.bindings.find(b=>b.term===row.term).expectedSelectedDTO);count++;}assert.equal(count,21);
});

test('all30 exact raw formatted and original-selected saved contexts retain complete old DTOs and private fields',async()=>{
 let count=0;try{for(const row of fixture.bindings){for(const context of[...row.canonicalContexts,...row.originalDTO.senses.map(s=>({term:row.term,partOfSpeech:s.partOfSpeech,meaning:s.meaningZh}))])for(const nested of[false,true]){const card={...context,meaning:nested?{zh:context.meaning}:context.meaning,example:'My original English.',exampleZh:'我的原有译文。',bookPassage:'My original book quotation.',note:'Private note',folderIds:['reading'],study:{box:4,correct:7},review:{dueAt:'2026-11-01T12:00:00.000Z'},progress:{streak:3}},before=JSON.stringify(card);assert.deepEqual(await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl}),row.originalDTO,row.term+' old DTO must stay complete');assert.equal(JSON.stringify(card),before);count++;}}assert.equal(count,30);}finally{resetDictionaryExamplesCacheForTests();}
});

test('only acquire and shape add four exact whole old tuples while norm stall and cite tails remain unapproved',async()=>{
 const policy=await read('tooling/dictionary/reviewed-senses/retained-alternatives-classroom-0019.json');assert.equal(policy.entries.length,49);assert.equal(hash({...policy,entries:policy.entries.slice(0,47)}),fixture.baseline.policy47Sha256);assert.deepEqual(policy.entries.slice(47).map(r=>r.term),['acquire','shape']);
 for(const term of['acquire','shape'])assert.equal(selected.find(r=>r.term===term).retainedCanonicalAlternatives.length,2);for(const term of['norm','stall'])assert(!selected.find(r=>r.term===term).retainedCanonicalAlternatives);
});

test('all established Chinese heads and exact source tuples remain reachable in the complete ranked stream while shaped and cite stay exact',async()=>{
 const tuple=row=>Object.fromEntries(['partOfSpeech','meaning','source','license','url'].map(key=>[key,row[key]]));
 try{for(const historical of fixture.preservedGroupQueries){
  const current=await allChineseResults(historical.query);
  for(const row of current.results)await assertAuditableChineseRow(historical.query,row);
  for(const old of [...historical.direct.results,...historical.related.results]){
   const found=current.results.find(row=>row.term===old.term);assert(found,historical.query+' lost reviewed head '+old.term);
   assert([found,...(found.alternatives||[])].some(row=>hash(tuple(row))===hash(tuple(old))),historical.query+' lost exact approved historical source tuple for '+old.term);
   // A changed primary may retain an old choice, but must not acquire its
   // old POS/example permissions merely by sharing the English head.
   if(hash(tuple(found))===hash(tuple(old)))for(const key of ['matchedPartOfSpeech','matchedSense','matchedExampleSenseIds','matchedExampleSenseEvidence'])if(old[key]!==undefined)assert.deepEqual(found[key],old[key],historical.query+' '+old.term+' '+key);
  }
 }
 assert.deepEqual(await searchExpandedDictionary('shaped',{fetchImpl}),fixture.preservedShaped.primary);assert.deepEqual(await loadDictionaryExamples('shaped',{fetchImpl}),fixture.preservedShaped.dto);const cite=fixture.bindings.find(r=>r.term==='cite');assert.deepEqual((await searchExpandedDictionary('cite',{fetchImpl})).results[0],cite.currentPrimary);assert.deepEqual(await loadDictionaryExamples('cite',{fetchImpl}),cite.originalDTO);
 }finally{resetExpandedDictionaryCacheForTests();resetDictionaryExamplesCacheForTests();}
});

test('finite4 legacy approval binds exact new source old DTO and eight canonical contexts without widening old cohorts',async()=>{
 const pack=await read('tooling/dictionary/reviewed-senses/legacy-examples/source/classroom-next-0019.json'),approval=await read('tooling/dictionary/reviewed-senses/legacy-examples/reviews/classroom-next-0019.json');assert.equal(selectedLegacySourceHash(pack),'f782f4b009178438f008e2114b6e862729e71298237bfb6dc5593e87af3fdae3');assert.notEqual(pack.author,approval.reviewer);assert.deepEqual(approval.approvedTerms,review.approvedTerms);assert.deepEqual(approval.issues,[]);
 const context={selectedRows:selected,canonicalByTerm:new Map(pack.entries.map(r=>[r.term,r.exactCanonicalRecord])),originalByTerm:new Map(pack.entries.map(r=>[r.term,r.originalDTO])),rawPacks:new Map([['batch-0013.json',source]])};assert.deepEqual(validateClassroomLegacySource0019(pack,approval,context),legacy.slice(26));assert.equal(pack.entries.reduce((n,r)=>n+r.acceptedSavedContexts.length,0),8);
 for(const mutate of[p=>{p.entries[0].term='cite';},p=>{p.entries[0].canonicalId++;},p=>{p.entries[0].acceptedSavedContexts[0].meaning+=' edited';},p=>{p.entries[0].originalDTO.senses[0].examples[0].zh+='改';},p=>{p.entries[0].selectedEntry.meaning+='改';},p=>{p.entries.reverse();},p=>{p.entries.push(p.entries[0]);}]){const edited=structuredClone(pack);mutate(edited);assert.throws(()=>validateClassroomLegacySource0019(edited,{...approval,sourceSha256:hash(edited)},context));}
});

test('four saved-context permissions reject unrelated or in-flight changed identities and preserve the card on optional failure',async()=>{
 try{for(const row of fixture.bindings.filter(r=>r.integrated)){for(const context of[{term:row.term,partOfSpeech:'interjection',meaning:row.sourceEntry.meaning},{...row.canonicalContexts[0],meaning:row.canonicalContexts[0].meaning+' [edited]'}]){const before=JSON.stringify(context);assert.equal(await loadDictionaryExamples(row.term,{savedEntry:context,fetchImpl}),null);assert.equal(JSON.stringify(context),before);}
 let release,announce;const wait=new Promise(r=>{release=r;}),begun=new Promise(r=>{announce=r;});let first=true;const delayed=async input=>{if(first){first=false;announce();await wait;}return fetchImpl(input);},card=structuredClone(row.canonicalContexts[0]),task=loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:delayed});await begun;card.meaning+=' [edited while pending]';release();assert.equal(await task,null);resetDictionaryExamplesCacheForTests();const saved={...row.canonicalContexts[0],example:'Keep manual',bookPassage:'Keep book',note:'Keep private'},snapshot=JSON.stringify(saved);assert.equal(await loadDictionaryExamples(row.term,{savedEntry:saved,fetchImpl:async()=>new Response('',{status:503})}),null);assert.equal(JSON.stringify(saved),snapshot);resetDictionaryExamplesCacheForTests();}
 }finally{resetDictionaryExamplesCacheForTests();}
});

test('all five immutable original DTOs and canonical records remain byte-bound to their unchanged source assets',async()=>{
 const manifestBytes=await fs.readFile(new URL('vocab/data/expanded-dictionary/manifest.json',root));assert.equal(sha(manifestBytes),'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f');const loader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl});try{for(const row of fixture.bindings){const b=await fs.readFile(new URL('vocab/data/expanded-dictionary/'+row.canonicalPointer.file,root));assert.equal(sha(b),row.canonicalPointer.sha256);assert.deepEqual(JSON.parse(b).records[row.canonicalPointer.recordIndex],row.canonicalRecord);assert.equal(hash(row.canonicalRecord),row.canonicalRecordSha256);assert.deepEqual(await loader.load(row.term,{lookupQuery:row.term}),row.originalDTO);}}finally{loader.close();}
});
