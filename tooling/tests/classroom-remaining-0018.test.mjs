import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REVIEWED_SENSE_ENTRIES as allSelected} from '../../vocab/js/reviewed-senses-data.js';
import {historicalSelected183,historicalLegacy26} from './helpers/classroom-history-0183.mjs';
const selected=historicalSelected183(allSelected);
import {EVERYDAY_LOOKUP_ENTRIES as all,EVERYDAY_CHINESE_ALIASES as aliases} from '../../vocab/js/everyday-lookup-data.js';
import {DICTIONARY_EXAMPLE_CORRECTIONS as allCorrections} from '../../vocab/js/dictionary-example-corrections-data.js';
import {historicalCorrections79} from './helpers/correction-history-0079.mjs';
const corrections=historicalCorrections79(allCorrections);
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {historicalSelected177} from './helpers/selected-history-0177.mjs';
import {SELECTED_LEGACY_EXAMPLE_BINDINGS as allLegacyBindings} from '../../vocab/js/selected-legacy-examples-data.js';
const legacyBindings=historicalLegacy26(allLegacyBindings);
import {selectedLegacyOriginalContext,matchesSelectedLegacyOriginalDTO} from '../../vocab/js/selected-legacy-examples.js';
import {validateClassroomLegacySource0018,selectedLegacySourceHash} from '../scripts/build-selected-legacy-examples.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(new URL('../dictionary/reviewed-senses/'+file,import.meta.url)));
const fixtureBytes=await fs.readFile(new URL('../dictionary/reviewed-senses/classroom-remaining-fixture-0018.json',import.meta.url));
assert.equal(sha(fixtureBytes),'05fc65bc9356c308305da6631342aa1eadc53d4ec8693b841c9be2b049a6c4b9');
const fixture=JSON.parse(fixtureBytes),source=await read('source/batch-0012.json'),review=await read('reviews/batch-0012.json');
const fileFetch=async input=>{const u=new URL(input);assert.equal(u.protocol,'file:');return new Response(await fs.readFile(u));};
const forbidden=()=>{throw Error('Selected classroom meaning unexpectedly reached a fallback service');};

test('six independently read classroom heads add24roles and preserve the complete177 old selections and79 corrections',()=>{
 assert.equal(hash(source),'150109ae48567ca50221570b16b14f99c0d907b773007952fe4aa16bae587a1f');
 assert.equal(review.sourceSha256,hash(source));assert(review.independentOfAuthor);assert.notEqual(review.reviewer,source.author);assert.deepEqual(review.issues,[]);assert.deepEqual(review.approvedTerms,source.entries.map(r=>r.term));
 assert.deepEqual(source.entries.map(r=>r.term),['party','institution','column','in the picture','precipitously','dissolve']);
 assert.equal(source.entries.reduce((n,r)=>n+r.meaning.split('\n').length,0),24);assert.equal(selected.length,183);assert.equal(new Set(selected.map(r=>r.term)).size,183);historicalSelected177(selected);
 // Retain the complete original prefix when new reviewed phrases are appended.
 assert(all.filter(r=>!r.reviewedCanonicalSense).length>=1025);assert.equal(hash(all.filter(r=>!r.reviewedCanonicalSense).slice(0,1025)),fixture.baseline.ordinarySha256);assert.equal(hash(aliases),fixture.baseline.aliasesSha256);assert.equal(corrections.length,79);assert.equal(hash(corrections),fixture.baseline.correctionsSha256);
 for(const row of source.entries){const actual=selected.find(r=>r.term===row.term);for(const [key,value] of Object.entries(row))assert.deepEqual(actual[key],value);}
});

test('all26 exact English, unambiguous forms and finite Chinese names return their full selected meaning and pair',async()=>{
 let count=0;
 for(const row of source.entries)for(const query of [row.term,...row.englishForms,...row.chineseAliases]){
  const result=await searchExpandedDictionary(query,{fetchImpl:forbidden}),first=result.results[0];
  assert.equal(first.term,row.term,query);assert.equal(first.partOfSpeech,row.partOfSpeech);assert.equal(first.meaning,row.meaning);
  assert.deepEqual(await lookupPersonalDictionaryFast(query,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden}),result);
  const dto=await loadDictionaryExamples(row.term,{savedEntry:first,fetchImpl:forbidden});assert.deepEqual(dto.senses[0].examples,[{en:row.en,zh:row.zh}]);count++;
 }
 assert.equal(count,26);
});

test('all128 canonical shard bytes and six complete immutable original DTOs survive unchanged',async()=>{
 assert.equal(sha(await fs.readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url))),fixture.pins.canonicalManifestSha256);
 for(const p of fixture.pins.assets){const b=await fs.readFile(new URL('../../vocab/data/expanded-dictionary/'+p.file,import.meta.url));assert.equal(b.length,p.bytes);assert.equal(sha(b),p.sha256);}
 const loader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:fileFetch});
 try{for(const row of fixture.bindings){const original=await loader.load(row.term,{lookupQuery:row.term});assert.equal(hash(original),row.originalDTOSha256);assert.deepEqual(original,row.originalDTO);}}
 finally{loader.close();resetDictionaryExamplesCacheForTests();}
});

test('old saved meanings and personal, book and study fields never receive a different selected pair',async()=>{
 for(const row of fixture.bindings){const fresh=source.entries.find(s=>s.term===row.term),contexts=[row.currentPrimary,row.canonicalRecord,...row.originalDTO.senses.map(s=>({partOfSpeech:s.partOfSpeech,meaning:s.meaningZh})),{partOfSpeech:'interjection',meaning:fresh.meaning},{partOfSpeech:fresh.partOfSpeech,meaning:'My unrelated personal meaning.'}];
  for(const context of contexts)for(const nested of [false,true]){
   const card={id:'saved-'+row.term,term:row.term,partOfSpeech:context.partOfSpeech,meaning:nested?{zh:context.meaning}:context.meaning,example:'My own English sentence.',exampleZh:'我的原有译文。',bookPassage:'My original book quotation.',note:'My private note.',study:{box:4,correct:7,incorrect:2},review:{dueAt:'2026-11-01T12:00:00.000Z'},progress:{streak:3}},before=JSON.stringify(card);
   const dto=await loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:fileFetch});assert.equal(JSON.stringify(card),before);assert(!(dto?.senses.flatMap(s=>s.examples)??[]).some(p=>p.en===fresh.en||p.zh===fresh.zh));
   if(context===row.currentPrimary||context===row.canonicalRecord)assert.deepEqual(dto,row.originalDTO,row.term+' must retain its entire exact old-card DTO');
  }
 }
 resetDictionaryExamplesCacheForTests();
});

test('only three independently read whole source tuples are retained; unqualified tails stay unadmitted',async()=>{
 const additions=await read('retained-alternatives-classroom-0018-additions.json');assert.equal(additions.entries.length,3);assert.equal(additions.entries.reduce((n,r)=>n+r.alternatives.length,0),6);
 for(const row of additions.entries){const actual=selected.find(r=>r.term===row.term);assert.equal(row.selectedRowSha256,hash(source.entries.find(s=>s.term===row.term)));assert(row.independentOfAuthor);assert.notEqual(row.reviewer,row.author);assert.equal(actual.retainedCanonicalAlternatives.length,2);}
 for(const term of ['column','precipitously','in the picture']){assert(!selected.find(r=>r.term===term).retainedCanonicalAlternatives);assert(fixture.heldWholeTuples.some(r=>r.term===term));}
});

test('independent literal partying and noun dissolution of marriage keep their original first hits',async()=>{
 for(const {query,term} of fixture.preservedFirstHits)assert.equal((await searchExpandedDictionary(query,{fetchImpl:fileFetch})).results[0]?.term,term,query);
});

test('the closed six-head preservation cohort retains all20 old bindings and authenticates twelve exact saved contexts',async()=>{
 const pack=await read('legacy-examples/source/classroom-remaining-0018.json'),approval=await read('legacy-examples/reviews/classroom-remaining-0018.json');
 assert.equal(selectedLegacySourceHash(pack),'680ad53861a0164a0c766070381e80b59dd84497d1322321135a2052b2de3ff7');
 assert.equal(approval.sourceSha256,selectedLegacySourceHash(pack));assert(approval.independentOfAuthor);assert.notEqual(approval.reviewer,pack.author);assert.deepEqual(approval.issues,[]);
 assert.equal(legacyBindings.length,26);assert.equal(hash(legacyBindings.slice(0,20)),'169c498011a98f2cde5ecae304a95b03bee4b1dafb44080caf153b7c2925d7c8');
 assert.deepEqual(legacyBindings.slice(20).map(r=>r.term),source.entries.map(r=>r.term));assert.equal(pack.entries.reduce((n,r)=>n+r.acceptedSavedContexts.length,0),12);
 const context={selectedRows:selected,canonicalByTerm:new Map(pack.entries.map(r=>[r.term,r.exactCanonicalRecord])),originalByTerm:new Map(pack.entries.map(r=>[r.term,r.originalDTO])),rawPacks:new Map([['batch-0012.json',source]])};
 assert.deepEqual(validateClassroomLegacySource0018(pack,approval,context),legacyBindings.slice(20));
 for(const row of pack.entries){for(const identity of row.acceptedSavedContexts){const binding=selectedLegacyOriginalContext(row.term,identity);assert(binding);assert(matchesSelectedLegacyOriginalDTO(binding,row.originalDTO));assert.equal(selectedLegacyOriginalContext(row.term,{...identity,meaning:identity.meaning+' [edited]'}),null);assert.equal(selectedLegacyOriginalContext(row.term,{...identity,partOfSpeech:'interjection'}),null);assert(!matchesSelectedLegacyOriginalDTO({...binding},row.originalDTO));}}
 for(const mutate of [p=>{p.entries[0].term='different head';},p=>{p.entries[0].canonicalId++;},p=>{p.entries[0].acceptedSavedContexts[0].meaning+=' edited';},p=>{p.entries[0].originalDTO.senses[0].examples[0].zh+='改';},p=>{p.entries[0].selectedEntry.meaning+='改';},p=>{p.entries.reverse();},p=>{p.entries.push(p.entries[0]);}]){
  const changed=structuredClone(pack);mutate(changed);assert.throws(()=>validateClassroomLegacySource0018(changed,{...approval,sourceSha256:hash(changed)},context));
 }
});
