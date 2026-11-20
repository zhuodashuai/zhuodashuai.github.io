import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REVIEWED_SENSE_ENTRIES} from '../../vocab/js/reviewed-senses-data.js';
import {validateReviewedSensePack,validateSourceCorrectionPolicy,sourceCorrectionRegistrations,
  assertHistoricalSourceCorrectionIdentity,mergeSourceCorrectionSets} from '../scripts/build-reviewed-dictionary-senses.mjs';
import {searchEverydayDictionary,isSupersededChineseSenseHead,isRejectedReviewedCanonicalVariant,
  rejectsReviewedCanonicalDisplay,guardLegacySupplementaryResult,loadSourceCorrectionExamples,
  sourceCorrectionLegacyExampleContext,matchesSourceCorrectionLegacyDTO} from '../../vocab/js/everyday-lookup.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {historicalAeroIndex18,historicalAeroReviewed213} from './helpers/aero-source-history.mjs';

const folder=new URL('../dictionary/reviewed-senses/',import.meta.url),bytes=file=>readFile(new URL(file,folder)),read=async file=>JSON.parse(await bytes(file));
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const pack=await read('source/batch-0018.json'),review=await read('reviews/batch-0018.json'),policyFile='source-corrections-0018-accuracy-policy.json';
const policyBytes=await bytes(policyFile),policy=JSON.parse(policyBytes),legacy=await read('source-corrections-0018-legacy-examples.json'),before=await read('source-corrections-0018-canonical-before.json');
const manifestBytes=await readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url)),manifest=JSON.parse(manifestBytes);
const records=new Map(before.records.map(row=>[row.term,row.record])),originals=new Map(legacy.entries.map(row=>[row.term,row.expectedEntry]));
const compiled=new Map(REVIEWED_SENSE_ENTRIES.map(row=>[row.term,row])),context={version:manifest.version,integritySha256:hash(manifestBytes)};
const evidence={file:policyFile,bytes:policyBytes},validate=(value=policy,decision=review,proof=evidence)=>validateSourceCorrectionPolicy(value,pack,decision,records,manifest,hash(manifestBytes),legacy,originals,proof);
const local=async(input,options)=>{const url=new URL(input);assert.equal(url.protocol,'file:');assert.equal(options?.credentials,'omit');return new Response(await readFile(url));};
async function all(query){const results=[];let offset=0,total;while(true){const page=await searchExpandedDictionary(query,{fetchImpl:local,useChineseQueryCache:false,limit:7,offset});assert(page.coverage===undefined||page.coverage==='full');
  if(/\p{Script=Han}/u.test(query)){assert.equal(page.ranking,'global');assert.equal(page.relatedIntegrated,true);total??=page.total;assert.equal(page.total,total);}results.push(...page.results);if(!page.hasMore)break;assert(page.nextOffset>offset);offset=page.nextOffset;}
  if(total!==undefined)assert.equal(results.length,total);assert.equal(new Set(results.map(row=>row.term)).size,results.length);return results;}

test('the old210 complete objects,17 packs and every prior policy/approval byte remain exact',async()=>{
  const baseline=await read('source-corrections-0018-baseline.json'),heads=new Set(baseline.historicalReviewedHeads);
  assert.equal(heads.size,210);const old=REVIEWED_SENSE_ENTRIES.filter(row=>heads.has(row.term));assert.equal(old.length,210);assert.equal(hash(old),baseline.historicalReviewedRowsSha256);
  assert.deepEqual(historicalAeroReviewed213(REVIEWED_SENSE_ENTRIES).filter(row=>!heads.has(row.term)).map(row=>row.term).sort(),pack.entries.map(row=>row.term).sort());
  for(const[file,pin]of Object.entries(baseline.immutableFiles))assert.equal(hash(await bytes(file)),pin,file);
  const index=await read('index.json');assert.deepEqual(index.batches.slice(0,17),baseline.priorBatches);
  assert.equal(index.retainedAlternativesPolicy,baseline.priorRetainedPolicy);assert.equal(index.sourceCorrectionPolicy,baseline.priorSourceCorrectionPolicy);
  assert.equal(index.sourceCorrectionLegacyExamples,baseline.priorSourceCorrectionLegacyExamples);assert.equal((await read(index.retainedAlternativesPolicy)).entries.length,51);
});

test('the three current full raw records and wrong indivisible tuples remain authenticated and unchanged',async()=>{
  assert.equal(hash(manifestBytes),before.manifestByteSha256);let count=0;
  for(const proof of before.records){const descriptor=manifest.english.shards.find(row=>row.bucket===proof.shard.bucket);assert.deepEqual(descriptor,proof.shard);
    const raw=await readFile(new URL('../../vocab/data/expanded-dictionary/'+descriptor.file,import.meta.url));assert.equal(raw.length,descriptor.bytes);assert.equal(hash(raw),descriptor.sha256);
    const record=JSON.parse(raw).records.find(row=>row.term===proof.term&&row.id===proof.record.id);assert.deepEqual(record,proof.record);assert.equal(hash(record),proof.canonicalSourceSha256);assert.deepEqual(record.forms,[]);
    for(const entry of proof.tuples){assert.equal(hash(entry.tuple),entry.sha256);assert.deepEqual(entry.sourceDescriptor,manifest.sources[entry.tuple.source]);count++;}}
  assert.equal(count,3);
});

test('independent final metadata approval admits the exact three original meanings and pairs with typed aliases',()=>{
  assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,pack.author);assert.equal(review.sourceSha256,hash(pack));
  assert.deepEqual(pack.entries.map(row=>row.term),['anaphylactic','anaphylactoid','anaphylaxis']);assert.deepEqual(pack.entries.map(row=>row.partOfSpeech),['adjective','adjective','noun']);
  const rows=validateReviewedSensePack(pack,review,records),projections=validate();assert.equal(rows.length,3);assert.equal(projections.size,3);
  for(const row of rows){const saved=compiled.get(row.term);assert.deepEqual(saved.exampleSenses,row.exampleSenses);assert.deepEqual(saved.exampleContexts,row.exampleContexts);
    assert.equal(row.exampleSenses.length,1);assert.deepEqual(row.exampleSenses[0].examples,[{en:row.en,zh:row.zh}]);assert.deepEqual(row.englishForms,[]);
    assert.equal(isSupersededChineseSenseHead(row.term),false);assert(!saved.retainedCanonicalAlternatives);assert.equal(saved.sourceCorrection.rejected.length,1);
    if(row.partOfSpeech==='adjective')assert(row.chineseAliases.every(alias=>alias.endsWith('的')));
    else assert(row.chineseAliases.every(alias=>alias.includes('严重')&&alias.includes('全身性')));
    for(const rejected of['过敏','过敏反应','过敏性休克','中毒反应','过敏原'])assert(!row.chineseAliases.includes(rejected));}
});

test('new policy registrations cannot replace shipped0017 files or overlap evidence paths',async()=>{
  const index=historicalAeroIndex18(await read('index.json')),registrations=sourceCorrectionRegistrations(index);
  assert.deepEqual(registrations,[{policy:'source-corrections-0017-accuracy-policy.json',legacyExamples:'source-corrections-0017-legacy-examples.json'},
    {policy:policyFile,legacyExamples:'source-corrections-0018-legacy-examples.json'}]);
  for(const change of[value=>delete value.sourceCorrectionPolicy,value=>value.sourceCorrectionPolicy=policyFile,
    value=>value.sourceCorrectionLegacyExamples='source-corrections-0018-legacy-examples.json',
    value=>value.additionalSourceCorrectionPolicies.push(registrations[0]),
    value=>value.additionalSourceCorrectionPolicies[0].legacyExamples=registrations[0].policy,
    value=>value.additionalSourceCorrectionPolicies[0].policy='../escape.json',
    value=>value.additionalSourceCorrectionPolicies[0].sourceFile='batch-0017.json']){const altered=structuredClone(index);change(altered);assert.throws(()=>sourceCorrectionRegistrations(altered));}
  let calls=0;const accessor=structuredClone(index);Object.defineProperty(accessor,'sourceCorrectionPolicy',{enumerable:true,get(){calls++;return index.sourceCorrectionPolicy;}});
  assert.throws(()=>sourceCorrectionRegistrations(accessor));assert.equal(calls,0);
});

test('historical0017 source/review/policy/legacy bytes cannot be reauthored or authorized by an added registration',async()=>{
  const index=await read('index.json'),[old,added]=sourceCorrectionRegistrations(index),identity={sourceFile:'batch-0017.json',reviewFile:'batch-0017.json'};
  const actual={policyBytes:await bytes(old.policy),sourceBytes:await bytes('source/batch-0017.json'),reviewBytes:await bytes('reviews/batch-0017.json'),legacyBytes:await bytes(old.legacyExamples)};
  assert.doesNotThrow(()=>assertHistoricalSourceCorrectionIdentity(old,identity,actual));
  for(const field of Object.keys(actual)){const altered={...actual,[field]:Buffer.concat([actual[field],Buffer.from('\n')])};assert.throws(()=>assertHistoricalSourceCorrectionIdentity(old,identity,altered));}
  assert.throws(()=>assertHistoricalSourceCorrectionIdentity(old,{...identity,reviewFile:'batch-0018.json'},actual));
  assert.throws(()=>assertHistoricalSourceCorrectionIdentity(added,identity));
  assert.doesNotThrow(()=>assertHistoricalSourceCorrectionIdentity(added,{sourceFile:'batch-0018.json',reviewFile:'batch-0018.json'}));
});

test('separately validated old and new policy maps compose without permitting any head replacement',async()=>{
  const oldPack=await read('source/batch-0017.json'),oldReview=await read('reviews/batch-0017.json'),oldPolicyFile='source-corrections-0017-accuracy-policy.json';
  const oldBytes=await bytes(oldPolicyFile),oldPolicy=JSON.parse(oldBytes),oldBefore=await read('source-corrections-0017-canonical-before.json'),oldLegacy=await read('source-corrections-0017-legacy-examples.json');
  const old=validateSourceCorrectionPolicy(oldPolicy,oldPack,oldReview,new Map(oldBefore.records.map(row=>[row.term,row.record])),manifest,hash(manifestBytes),oldLegacy,
    new Map(oldLegacy.entries.map(row=>[row.term,row.expectedEntry])),{file:oldPolicyFile,bytes:oldBytes});
  const medical=validate(),combined=mergeSourceCorrectionSets([old,medical]);assert.equal(combined.size,6);
  for(const[key,value]of old)assert.equal(combined.get(key),value);for(const[key,value]of medical)assert.equal(combined.get(key),value);
  const [name]=old.keys();assert.throws(()=>mergeSourceCorrectionSets([old,new Map([[name,medical.values().next().value]])]));assert.equal(old.size,3);
});

test('new exclusion authority requires complete signed bytes and rejects subsets, additions and accessor/toJSON facades',()=>{
  const subset=structuredClone(policy);subset.entries.pop();const extra=structuredClone(policy);extra.entries[0].excludedWholeRawAlternatives.push(structuredClone(extra.entries[0].excludedWholeRawAlternatives[0]));
  for(const candidate of[subset,extra])for(const proof of[undefined,evidence,{file:policyFile,bytes:Buffer.from(JSON.stringify(candidate))}])assert.throws(()=>validate(candidate,review,proof));
  for(const decision of[{...review,independentOfAuthor:false},{...review,sourceSha256:'0'.repeat(64)},{...review,exactEvidence:{}}])assert.throws(()=>validate(policy,decision));
  let calls=0;subset.toJSON=()=>{calls++;return policy;};assert.throws(()=>validate(subset));const accessor=structuredClone(policy);
  Object.defineProperty(accessor,'entries',{enumerable:true,get(){calls++;return subset.entries;}});assert.throws(()=>validate(accessor));assert.equal(calls,0);
});

test('the raw rejection is exact tuple/currentmanifest identity, never a medical-head or adjective blanket',()=>{
  for(const proof of before.records)for(const {tuple}of proof.tuples){assert.equal(isRejectedReviewedCanonicalVariant(proof.record,tuple,context),true);
    for(const variant of[{...tuple,meaning:tuple.meaning+' 另一个已核实义项'},{...tuple,source:'different'},{...tuple,partOfSpeech:'adverb'}])assert.equal(isRejectedReviewedCanonicalVariant(proof.record,variant,context),false);
    assert.equal(isRejectedReviewedCanonicalVariant({...proof.record,id:proof.record.id+1},tuple,context),false);
    assert.equal(isRejectedReviewedCanonicalVariant(proof.record,tuple,{...context,integritySha256:'0'.repeat(64)}),false);}
});

test('public and personal literal lookup return only authored meanings, source and one new example without legacy downloads',async()=>{
  const forbidden=()=>{throw Error('Exact local corrected heads must not fetch a dictionary/provider');};
  for(const row of pack.entries){const direct=await searchExpandedDictionary(row.term,{fetchImpl:forbidden,useChineseQueryCache:false});
    const personal=await lookupPersonalDictionaryFast(row.term,{hotLookup:forbidden,hotReverse:forbidden,fullSearch:forbidden});assert.deepEqual(personal,direct);
    assert.equal(direct.results.length,1);const dto=direct.results[0];assert.equal(dto.meaning,row.meaning);assert.equal(dto.partOfSpeech,row.partOfSpeech);
    assert.equal(dto.source,'卓式词典·义项补充');assert.equal(dto.license,'Original composition');assert(!dto.alternatives?.length);
    for(const key of['canonicalId','canonicalSourceSha256','sourceCorrection','legacyExampleBinding','exampleSenses','exampleContexts'])assert(!Object.hasOwn(dto,key));
    assert.equal(guardLegacySupplementaryResult(guardLegacySupplementaryResult(direct)),direct);
    const examples=await loadDictionaryExamples(row.term,{fetchImpl:forbidden,savedEntry:dto});assert.equal(examples.senses.length,1);const sense=examples.senses[0];
    assert.deepEqual(sense.examples,[{en:row.en,zh:row.zh}]);assert.deepEqual(Object.keys(sense).sort(),['examples','id','meaningZh','partOfSpeech','reviewer','source'].sort());
    sense.examples[0].zh+=' changed';assert.deepEqual((await loadDictionaryExamples(row.term,{fetchImpl:forbidden,savedEntry:dto})).senses[0].examples,[{en:row.en,zh:row.zh}]);}
});

test('exact old saved contexts preserve their own DTOs and unknown contexts cannot borrow any new example',async()=>{
  for(const old of legacy.entries){const binding=sourceCorrectionLegacyExampleContext(old.term,old.contexts[0],dictionaryExamplesRelease.source);assert(binding);
    assert.equal(matchesSourceCorrectionLegacyDTO(binding,old.expectedEntry),true);assert.equal(matchesSourceCorrectionLegacyDTO({...binding},old.expectedEntry),false);
    for(const savedEntry of old.contexts){assert.deepEqual(await loadDictionaryExamples(old.term,{fetchImpl:local,savedEntry}),old.expectedEntry);
      assert.equal(await loadDictionaryExamples(old.term,{fetchImpl:local,savedEntry:{...savedEntry,meaning:savedEntry.meaning+' changed'}}),null);
      assert.equal(sourceCorrectionLegacyExampleContext(old.term,savedEntry,{...dictionaryExamplesRelease.source,manifestSha256:'0'.repeat(64)}),null);}
    const dto=searchEverydayDictionary(old.term).results[0],pending=loadDictionaryExamples(old.term,{savedEntry:dto,fetchImpl:local});dto.meaning+=' changed';assert.equal(await pending,null);}
  let accessed=0;assert.equal(await loadDictionaryExamples('anaphylaxis',{fetchImpl:local,savedEntry:{term:'anaphylaxis',partOfSpeech:'noun',get meaning(){accessed++;return 'wrong';}}}),null);assert.equal(accessed,0);
  const controller=new AbortController();controller.abort();await assert.rejects(loadDictionaryExamples('anaphylaxis',{fetchImpl:local,signal:controller.signal}),{name:'AbortError'});
});

test('forged old clinical display tuples fail the compact/full double guard without creating new source authority',()=>{
  for(const row of pack.entries){const correction=compiled.get(row.term).sourceCorrection;for(const old of correction.rejected){const dto={term:row.term,...old.display};
    assert.equal(rejectsReviewedCanonicalDisplay(dto),true);assert.throws(()=>guardLegacySupplementaryResult({results:[dto]}),error=>error.code==='unreviewed_dictionary_form');
    assert.equal(rejectsReviewedCanonicalDisplay({...dto,meaning:dto.meaning+' 已核实的新义项'}),false);}}
});

test('the original14 medical diagnostic inputs preserve generic/severe/shock/cause/toxicity boundaries on full uncached streams',async()=>{
  const queries=['过敏反应','过敏','严重过敏反应','全身性过敏反应','过敏性休克','过敏原','不良反应','副作用','中毒反应','allergic reaction','anaphylactic','anaphylactoid','anaphylaxis','allergy'];
  const streams=new Map();for(const query of queries)streams.set(query,await all(query));
  assert.equal(streams.get('过敏反应')[0].term,'allergic reaction');assert.equal(streams.get('allergic reaction')[0].term,'allergic reaction');
  const allergy=streams.get('过敏反应').find(row=>row.term==='allergy');assert(allergy);assert.equal(allergy.matchType,'related');
  assert.equal(streams.get('过敏性休克')[0].term,'anaphylactic shock');assert(!streams.get('过敏性休克').some(row=>row.term==='anaphylaxis'));
  assert.equal(streams.get('过敏原')[0].term,'allergen');assert(!streams.get('中毒反应').some(row=>row.term==='anaphylactoid'));
  for(const query of['不良反应','副作用'])assert(!streams.get(query).some(row=>pack.entries.some(entry=>entry.term===row.term)),query);
  for(const stream of streams.values())for(const dto of stream)if(compiled.get(dto.term)?.sourceCorrection&&pack.entries.some(row=>row.term===dto.term)){
    assert.equal(dto.meaning,compiled.get(dto.term).meaning);assert.equal(dto.source,'卓式词典·义项补充');assert(!dto.alternatives?.length);}
  for(const query of['严重全身性过敏反应','全身性严重过敏反应'])assert((await all(query)).some(row=>row.term==='anaphylaxis'));
  assert(!(await all('严重全身反应')).some(row=>row.term==='anaphylaxis'),'A nonspecific serious systemic reaction is not an unconditional anaphylaxis alias');
});
