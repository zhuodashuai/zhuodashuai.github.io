import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateReviewedSensePack,validateSourceCorrectionPolicy,sourceCorrectionRegistrations} from '../scripts/build-reviewed-dictionary-senses.mjs';
import {REVIEWED_SENSE_ENTRIES} from '../../vocab/js/reviewed-senses-data.js';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../vocab/js/everyday-lookup-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {isRejectedReviewedCanonicalVariant,sourceCorrectionLegacyExampleContext} from '../../vocab/js/everyday-lookup.js';
import {exactAeroCorrections,historicalAeroReviewed213,historicalAeroEveryday1290,historicalAeroReviewedModule,historicalAeroIndex18} from './helpers/aero-source-history.mjs';

const folder=new URL('../dictionary/reviewed-senses/',import.meta.url),bytes=file=>readFile(new URL(file,folder)),read=async file=>JSON.parse(await bytes(file));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const pack=await read('source/batch-0019.json'),review=await read('reviews/batch-0019.json'),before=await read('source-corrections-0019-canonical-before.json');
const policyFile='source-corrections-0019-accuracy-policy.json',policyBytes=await bytes(policyFile),policy=JSON.parse(policyBytes);
const legacyFile='source-corrections-0019-legacy-examples.json',legacyBytes=await bytes(legacyFile),legacy=JSON.parse(legacyBytes);
const manifestBytes=await readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url)),manifest=JSON.parse(manifestBytes);
const records=new Map(before.records.map(row=>[row.term,row.record])),originals=new Map(legacy.entries.map(row=>[row.term,row.expectedEntry]));
const evidence={file:policyFile,bytes:policyBytes,legacyFile,legacyBytes};
const validate=(selectedLegacy=legacy,selectedReview=review,selectedEvidence=evidence,selectedPolicy=policy)=>
  validateSourceCorrectionPolicy(selectedPolicy,pack,selectedReview,records,manifest,hash(manifestBytes),selectedLegacy,originals,selectedEvidence);
const local=async(url,options)=>{assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');return new Response(await readFile(new URL(url)));};
const forbidden=()=>{throw Error('Corrected exact packaged heads must not query a provider or legacy dictionary');};

test('0019 admits only the two unchanged literal identities, supported substance aliases and original fresh pairs',async()=>{
  assert.equal(hash(await bytes('source/batch-0019.json')),'85bc0125dd69bb5376fb116651d1f0d4c2baba3c79bdef02b0b881d72626d0fb');
  assert.equal(hash(await bytes('reviews/batch-0019.json')),'3cce683493dfec39c8d42db21b748598512f16fc432d4f7f945ca3144969efaf');
  assert.deepEqual(pack.entries.map(row=>[row.term,row.canonicalId]),[['aeroallergen',7215910],['aeroallergens',7216079]]);
  assert.equal(review.sourceSha256,hash(pack));assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,pack.author);
  assert.deepEqual(review.issues,[]);assert.equal(validateReviewedSensePack(pack,review,records).length,2);
  for(const row of pack.entries){assert.equal(row.partOfSpeech,'noun');assert.deepEqual(row.englishForms,[]);
    assert.deepEqual(row.chineseAliases,['气传过敏原','空气传播过敏原','气源性致敏原']);
    assert(!row.meaning.includes('高空'));assert.equal(row.canonicalSourceSha256,hash(records.get(row.term)));
    assert.deepEqual(row.exampleSenses[0].examples,[{en:row.en,zh:row.zh}]);}
  const index=await read('index.json');assert.equal(sourceCorrectionRegistrations(index).length,3);
  assert.equal(sourceCorrectionRegistrations(historicalAeroIndex18(index)).length,2);
});

test('optional raw contexts require exact independently pinned legacy bytes and preserve both full source-derived identities',()=>{
  const output=validate();assert.equal(output.size,2);
  for(const old of legacy.entries){const binding=output.get(old.term).legacyExampleBinding;
    assert.deepEqual(binding.contexts,[...old.contexts,...old.rawContexts]);assert.equal(binding.contexts.length,2);
    assert.equal(new Set(binding.contexts.map(row=>JSON.stringify(row))).size,2);
    assert.equal(binding.expectedEntryJSON,JSON.stringify(old.expectedEntry));}
  for(const proof of[{file:policyFile,bytes:policyBytes},{...evidence,legacyBytes:Buffer.concat([legacyBytes,Buffer.from('\n')])},
    {...evidence,legacyFile:'../escape.json'},{...evidence,legacyFile:policyFile},{...evidence,extra:true}])assert.throws(()=>validate(legacy,review,proof));
  const missing=structuredClone(legacy);for(const row of missing.entries)delete row.rawContexts;
  assert.throws(()=>validate(missing,review,{file:policyFile,bytes:policyBytes}),'A new declared raw-context policy cannot downgrade to the old proof shape');
});

test('even a freshly hashed legacy envelope cannot approve partial, duplicate, wrong POS/source or invented raw contexts',()=>{
  for(const [index,mutate]of[
    value=>{value.entries[0].rawContexts[0].meaning='气源性致敏原';},
    value=>{value.entries[0].rawContexts[0].partOfSpeech='adjective';},
    value=>{value.entries[0].rawContexts[0].source='mit';},
    value=>{value.entries[0].rawContexts[0].term='aeroallergens';},
    value=>{value.entries[0].rawContexts.push(structuredClone(value.entries[0].rawContexts[0]));},
    value=>{value.entries[0].rawContexts.push(structuredClone(value.entries[0].contexts[0]));},
    value=>{[value.entries[0].contexts,value.entries[0].rawContexts]=[value.entries[0].rawContexts,value.entries[0].contexts];},
    value=>{value.entries[0].rawContexts=[];},
    value=>{delete value.entries[0].rawContexts;},
    value=>{value.entries[0].unknown='not admitted';},
    value=>{value.entries.push(structuredClone(value.entries[0]));}
  ].entries()){
    const altered=structuredClone(legacy);mutate(altered);const alteredBytes=Buffer.from(JSON.stringify(altered));
    const approval={...review,exactEvidence:{...review.exactEvidence,[legacyFile]:hash(alteredBytes)}};
    assert.throws(()=>validate(altered,approval,{...evidence,legacyBytes:alteredBytes}),'raw-context mutation '+index);
  }
});

test('raw-context arrays and proof objects cannot execute getters, toJSON or prototype facades',()=>{
  let calls=0;const accessor=structuredClone(legacy);
  Object.defineProperty(accessor.entries[0].rawContexts[0],'meaning',{enumerable:true,get(){calls++;return legacy.entries[0].rawContexts[0].meaning;}});
  assert.throws(()=>validate(accessor));
  const facade=structuredClone(legacy);facade.entries[0].rawContexts[0].toJSON=()=>{calls++;return legacy.entries[0].rawContexts[0];};assert.throws(()=>validate(facade));
  const inherited=structuredClone(legacy);Object.setPrototypeOf(inherited.entries[0].rawContexts,Object.create(Array.prototype));assert.throws(()=>validate(inherited));
  const proof={file:policyFile,bytes:policyBytes,legacyFile,get legacyBytes(){calls++;return legacyBytes;}};assert.throws(()=>validate(legacy,review,proof));
  const pathFacade={...evidence,legacyFile:{toString(){calls++;return legacyFile;}}};assert.throws(()=>validate(legacy,review,pathFacade));
  assert.equal(calls,0);
});

test('the complete wrong raw tuple is rejected only under its exact actual canonical/source identity',()=>{
  const origin={version:manifest.version,integritySha256:hash(manifestBytes)};
  for(const proof of before.records){const tuple=proof.tuples[0].tuple;
    assert.equal(isRejectedReviewedCanonicalVariant(proof.record,tuple,origin),true);
    for(const candidate of[{...tuple,meaning:'气源性致敏原'},{...tuple,source:'another-source'},{...tuple,partOfSpeech:'adjective'}])assert.equal(isRejectedReviewedCanonicalVariant(proof.record,candidate,origin),false);
    assert.equal(isRejectedReviewedCanonicalVariant({...proof.record,id:proof.record.id+1},tuple,origin),false);
    assert.equal(isRejectedReviewedCanonicalVariant(proof.record,tuple,{...origin,integritySha256:'0'.repeat(64)}),false);
    assert.equal(records.get(proof.term).meaning,tuple.meaning);assert(records.get(proof.term).meaning.includes('高空过敏症'));
  }
  assert(!exactAeroCorrections.some(row=>['nervousness','neuron'].includes(row.term)));
});

test('English literal results keep both canonical heads distinct and bind only the new correct source/POS/pair',async()=>{
  for(const row of pack.entries){const direct=await searchExpandedDictionary(row.term,{fetchImpl:forbidden,useChineseQueryCache:false});
    const personal=await lookupPersonalDictionaryFast(row.term,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden});assert.deepEqual(personal,direct);
    assert.equal(direct.results.length,1);const dto=direct.results[0];assert.equal(dto.term,row.term);assert.equal(dto.partOfSpeech,row.partOfSpeech);assert.equal(dto.meaning,row.meaning);
    assert.equal(dto.source,'卓式词典·义项补充');assert.equal(dto.license,'Original composition');assert(!dto.alternatives?.length);
    const examples=await loadDictionaryExamples(row.term,{fetchImpl:forbidden,savedEntry:dto});assert.equal(examples.senses.length,1);
    assert.equal(examples.senses[0].id,`reviewed-source-correction:${row.term}:1`);assert.equal(examples.senses[0].meaningZh,row.meaning);
    assert.deepEqual(examples.senses[0].examples,[{en:row.en,zh:row.zh}]);assert.equal(examples.senses[0].source,'原创学习例句');
    for(const key of['canonicalId','sourceCorrection','legacyExampleBinding','exampleSenses'])assert(!Object.hasOwn(dto,key));}
});

async function all(query){const results=[];let offset=0,total;
  for(;;){const page=await searchExpandedDictionary(query,{fetchImpl:local,useChineseQueryCache:false,offset,limit:2});
    assert.equal(page.ranking,'global');assert.equal(page.relatedIntegrated,true);total??=page.total;assert.equal(page.total,total);results.push(...page.results);
    if(!page.hasMore)break;assert(page.nextOffset>offset);offset=page.nextOffset;}
  assert.equal(results.length,total);return results;
}
test('all three precise Chinese substance names retain both correct heads and the disease mistranslation returns neither',async()=>{
  for(const query of['气传过敏原','空气传播过敏原','气源性致敏原']){const results=await all(query);
    for(const row of pack.entries){const found=results.find(dto=>dto.term===row.term);assert(found,query+row.term);
      assert.equal(found.partOfSpeech,'noun');assert.equal(found.meaning,row.meaning);assert.equal(found.source,'卓式词典·义项补充');assert(!found.alternatives?.length);}}
  for(const query of['高空过敏症','高空过敏'])assert(!(await all(query)).some(row=>pack.entries.some(source=>source.term===row.term)),query);
  for(const query of['过敏反应','空气污染'])for(const row of(await all(query)).filter(row=>pack.entries.some(source=>source.term===row.term)))assert(['mention','compound','related'].includes(row.matchType),query);
});

test('both correct original pairs remain usable for all four raw/formatted old saves without changing private fields',async()=>{
  let contexts=0;
  for(const old of legacy.entries)for(const context of[...old.contexts,...old.rawContexts]){
    const savedEntry={...context,note:'Keep my note.',example:'Keep my original English.',exampleTranslation:'保留我的原文译文。',folderIds:['reading'],study:{correct:8,wrong:2}};
    const original=JSON.stringify(savedEntry),actual=await loadDictionaryExamples(old.term,{savedEntry,fetchImpl:local});
    assert.deepEqual(actual,old.expectedEntry);assert.equal(JSON.stringify(savedEntry),original);contexts++;
    assert.equal(await loadDictionaryExamples(old.term,{savedEntry:{...savedEntry,meaning:context.meaning+' changed'},fetchImpl:local}),null);
    assert.equal(sourceCorrectionLegacyExampleContext(old.term,context,{...dictionaryExamplesRelease.source,manifestSha256:'0'.repeat(64)}),null);
  }assert.equal(contexts,4);
  const saved={...legacy.entries[0].rawContexts[0],note:'Keep my note.'},pending=loadDictionaryExamples(saved.term,{savedEntry:saved,fetchImpl:local});saved.meaning+=' user edit';assert.equal(await pending,null);assert.equal(saved.note,'Keep my note.');
});

test('only the complete two correction objects cross the historical213/1290 boundaries; old module and source approvals stay exact',async()=>{
  assert.equal(REVIEWED_SENSE_ENTRIES.length,215);assert.equal(EVERYDAY_LOOKUP_ENTRIES.length,1292);
  assert.equal(historicalAeroReviewed213(REVIEWED_SENSE_ENTRIES).length,213);assert.equal(historicalAeroEveryday1290(EVERYDAY_LOOKUP_ENTRIES).length,1290);
  historicalAeroReviewedModule(await readFile(new URL('../../vocab/js/reviewed-senses-data.js',import.meta.url),'utf8'),REVIEWED_SENSE_ENTRIES);
  for(const row of exactAeroCorrections)for(const field of Object.keys(row)){
    const altered=structuredClone(REVIEWED_SENSE_ENTRIES);delete altered.find(item=>item.term===row.term)[field];assert.throws(()=>historicalAeroReviewed213(altered),row.term+field);
  }
  const changed=structuredClone(REVIEWED_SENSE_ENTRIES);changed.find(row=>row.term==='anaphylaxis').meaning+=' changed';assert.throws(()=>historicalAeroReviewed213(changed));
  assert.throws(()=>historicalAeroEveryday1290(EVERYDAY_LOOKUP_ENTRIES.slice(1)));
});
