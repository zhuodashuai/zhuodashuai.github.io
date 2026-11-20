import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REVIEWED_SENSE_ENTRIES} from '../../vocab/js/reviewed-senses-data.js';
import {validateReviewedSensePack,validateReviewedExampleSenses,validateSourceCorrectionPolicy} from '../scripts/build-reviewed-dictionary-senses.mjs';
import {searchEverydayDictionary,isSupersededChineseSenseHead,isRejectedReviewedCanonicalVariant,
  rejectsReviewedCanonicalDisplay,matchesSourceCorrectionOwnContent,sanitizeRetainedCanonicalResult,
  guardLegacySupplementaryResult,loadEverydayExamples,loadSourceCorrectionExamples,
  sourceCorrectionLegacyExampleContext,matchesSourceCorrectionLegacyDTO} from '../../vocab/js/everyday-lookup.js';
import {loadDictionaryExamples} from '../../vocab/js/dictionary-examples-current-v4.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {historicalSelected210} from './helpers/life-coverage-history.mjs';
const base=new URL('../dictionary/reviewed-senses/',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,base),'utf8'));
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const pack=await read('source/batch-0017.json'),review=await read('reviews/batch-0017.json'),before=await read('source-corrections-0017-canonical-before.json');
const policy=await read('source-corrections-0017-accuracy-policy.json'),legacy=await read('source-corrections-0017-legacy-examples.json');
const policyEvidence={file:'source-corrections-0017-accuracy-policy.json',bytes:await readFile(new URL('source-corrections-0017-accuracy-policy.json',base))};
const manifestBytes=await readFile(new URL('../../vocab/data/expanded-dictionary/manifest.json',import.meta.url)),manifest=JSON.parse(manifestBytes);
const records=new Map(before.records.map(p=>[p.term,p.record])),compiled=new Map(REVIEWED_SENSE_ENTRIES.map(r=>[r.term,r]));
const prior210=historicalSelected210(REVIEWED_SENSE_ENTRIES);
const originals=new Map(legacy.entries.map(p=>[p.term,p.expectedEntry]));
const context={version:manifest.version,integritySha256:hash(manifestBytes)};
const local=async input=>{const url=new URL(input);assert.equal(url.protocol,'file:');return new Response(await readFile(url));};
const nounProjection=()=>{const row=compiled.get('mortuary'),p=row.formProjections[0];return{term:row.term,partOfSpeech:p.partOfSpeech,meaning:p.meaning,source:row.dictionarySource,license:'Original composition',url:'https://zhuodashuai.github.io/vocab/',matchedForm:'mortuaries'};};

test('the prior207 rows,16source/review packs and every historical retention policy remain exact',async()=>{
  const baseline=await read('source-corrections-0017-baseline.json'),heads=new Set(baseline.historicalReviewedHeads);
  assert.equal(heads.size,207);assert.equal(hash(prior210.filter(r=>heads.has(r.term))),baseline.historicalReviewedRowsSha256);
  assert.deepEqual(prior210.filter(r=>!heads.has(r.term)).map(r=>r.term).sort(),['disastrous','disconcerting','mortuary']);
  for(const [file,pin]of Object.entries(baseline.immutableFiles))assert.equal(hash(await readFile(new URL(file,base))),pin,file);
  const index=await read('index.json');assert.deepEqual(index.batches.slice(0,16),baseline.priorBatches);
  assert.equal(index.retainedAlternativesPolicy,baseline.priorRetainedPolicy);
});

test('actual raw canonical IDs, records, allfour indivisible tuples and manifestbytes are preserved',async()=>{
  assert.equal(hash(manifestBytes),before.manifestByteSha256);
  let tuples=0;for(const proof of before.records){const d=manifest.english.shards.find(d=>d.bucket===proof.shard.bucket);
    assert.deepEqual(d,proof.shard);const bytes=await readFile(new URL('../../vocab/data/expanded-dictionary/'+d.file,import.meta.url));
    assert.equal(bytes.length,d.bytes);assert.equal(hash(bytes),d.sha256);
    const actual=JSON.parse(bytes).records.find(r=>r.id===proof.record.id&&r.term===proof.term);
    assert.deepEqual(actual,proof.record);assert.equal(hash(actual),proof.canonicalSourceSha256);
    for(const t of proof.tuples){assert.equal(hash(t.tuple),t.sha256);tuples++;}
  }assert.equal(tuples,4);
});

test('actual independent source and exacttuple policy approvals admit onlythree corrected heads and sevenpairs',()=>{
  assert.notEqual(review.reviewer,pack.author);assert.equal(review.independentOfAuthor,true);assert.equal(review.sourceSha256,hash(pack));
  const rows=validateReviewedSensePack(pack,review,records);assert.equal(rows.length,3);
  assert.equal(rows.flatMap(r=>r.exampleSenses.flatMap(s=>s.examples)).length,7);
  const projected=validateSourceCorrectionPolicy(policy,pack,review,records,manifest,hash(manifestBytes),legacy,originals,policyEvidence);
  assert.equal(projected.size,3);
  for(const row of rows){assert.deepEqual(row.chineseAliases,[]);assert.deepEqual(row.englishForms,[]);
    const saved=compiled.get(row.term);assert.deepEqual(saved.exampleSenses,row.exampleSenses);
    assert.equal(saved.sourceCorrection.rejected.length,before.records.find(p=>p.term===row.term).tuples.length);
    assert(!saved.retainedCanonicalAlternatives);assert.equal(isSupersededChineseSenseHead(row.term),false);
  }
});

test('raw rejection requires exactID/term/fulltuple/currentmanifest and preserves other variants',()=>{
  for(const proof of before.records)for(const {tuple}of proof.tuples){
    assert.equal(isRejectedReviewedCanonicalVariant(proof.record,tuple,context),true);
    for(const altered of [{...tuple,meaning:tuple.meaning+' 新义项'},{...tuple,source:'different'},
      {...tuple,partOfSpeech:'noun'}].filter(v=>JSON.stringify(v)!==JSON.stringify(tuple)))assert.equal(isRejectedReviewedCanonicalVariant(proof.record,altered,context),false);
    assert.equal(isRejectedReviewedCanonicalVariant({...proof.record,id:proof.record.id+128},tuple,context),false);
    assert.equal(isRejectedReviewedCanonicalVariant({...proof.record,term:proof.term.toUpperCase()},tuple,context),false);
    assert.equal(isRejectedReviewedCanonicalVariant(proof.record,tuple,{...context,integritySha256:'0'.repeat(64)}),false);
    assert.equal(isRejectedReviewedCanonicalVariant(proof.record,tuple,{...context,version:'0'.repeat(64)}),false);
  }
});

test('displayed badtuples are rejected on exact provenance while unrelated/new tuples are not dropped',()=>{
  for(const row of compiled.values())if(row.sourceCorrection)for(const old of row.sourceCorrection.rejected){
    const dto={term:row.term,...old.display};assert.equal(rejectsReviewedCanonicalDisplay(dto),true);
    assert.equal(sanitizeRetainedCanonicalResult(dto),null);
    assert.equal(rejectsReviewedCanonicalDisplay({term:row.term,partOfSpeech:dto.partOfSpeech,meaning:dto.meaning,source:dto.source}),true);
    for(const altered of [{...dto,meaning:dto.meaning+' 新语境'},{...dto,source:'Another source'},{...dto,license:'Another licence'}]){
      assert.equal(rejectsReviewedCanonicalDisplay(altered),false);assert.deepEqual(sanitizeRetainedCanonicalResult(altered),altered);
    }
    assert.throws(()=>guardLegacySupplementaryResult({results:[dto]}),e=>e.code==='unreviewed_dictionary_form');
  }
});

test('literal/full and privatelyconstructed nounform content is idempotent but never a public origin authority',()=>{
  for(const term of pack.entries.map(r=>r.term)){
    const result=searchEverydayDictionary(term);assert.equal(matchesSourceCorrectionOwnContent(result.results[0]),true);
    assert.equal(guardLegacySupplementaryResult(guardLegacySupplementaryResult(result)),result);
  }
  const dto=nounProjection();assert.equal(matchesSourceCorrectionOwnContent(dto),true);
  assert.equal(guardLegacySupplementaryResult({results:[dto]}).results[0],dto);
  for(const altered of [Object.fromEntries(Object.entries(dto).filter(([k])=>k!=='matchedForm')),
    {...dto,matchedForm:'mortuariez'},{...dto,matchedForm:'other mortuaries'},{...dto,partOfSpeech:'noun · adjective'},
    {...dto,meaning:compiled.get('mortuary').meaning},{...dto,source:'ECDICT'},{...dto,license:'MIT'},
    {...dto,url:'https://example.org/'},{...dto,term:'MORTUARY'},{...dto,alternatives:[]},{...dto,authority:true}]){
    assert.equal(matchesSourceCorrectionOwnContent(altered),false);assert.throws(()=>guardLegacySupplementaryResult({results:[altered]}),e=>e.code==='unreviewed_dictionary_form');
  }
});

test('only existing safe wholeform decoration is recognised and raw matchedForm staysunchanged',()=>{
  for(const spelling of ['mortuaries','MORTUARIES!','“mortuaries”','ｍｏｒｔｕａｒｉｅｓ','\t mortuaries\n','mor\u200btuaries']){
    const dto={...nounProjection(),matchedForm:spelling};assert.equal(matchesSourceCorrectionOwnContent(dto),true,spelling);
    assert.equal(guardLegacySupplementaryResult({results:[dto]}).results[0].matchedForm,spelling);
  }
  for(const spelling of ['mortuaries\u202e','<mortuaries>','mortuaries\u0001','mortuarys'])assert.equal(matchesSourceCorrectionOwnContent({...nounProjection(),matchedForm:spelling}),false);
});

test('allseven newpairs are active at exactPOS/sense and nounformcontext selects onlytwo nounpairs',async()=>{
  let total=0;const fail=()=>{throw Error('Own reviewed examples must not fetch');};
  for(const row of pack.entries){const entry=loadEverydayExamples(row.term);assert.equal(entry.senses.length,row.exampleSenses.length);
    assert.deepEqual(entry.senses.map(s=>[s.id,s.partOfSpeech,s.meaningZh,s.examples]),row.exampleSenses.map(s=>[s.id,s.partOfSpeech,s.meaningZh,s.examples]));
    total+=entry.senses.reduce((n,s)=>n+s.examples.length,0);
    assert.deepEqual(await loadDictionaryExamples(row.term,{fetchImpl:fail,savedEntry:searchEverydayDictionary(row.term).results[0]}),entry);
  }assert.equal(total,7);
  const dto=nounProjection(),entry=await loadDictionaryExamples('mortuary',{fetchImpl:fail,savedEntry:dto});
  assert.equal(entry.senses.length,2);assert(entry.senses.every(s=>s.partOfSpeech==='noun'));
  assert.deepEqual(entry.senses.map(s=>s.id),compiled.get('mortuary').formProjections[0].exampleSenseIds);
  assert.equal(await loadDictionaryExamples('mortuary',{fetchImpl:fail,savedEntry:{...dto,meaning:dto.meaning+' changed'}}),null);
});

test('exact oldsavedcontexts retain only authenticated oldDTOs; forged binding or changedDTO never upgrades',async()=>{
  for(const old of legacy.entries)for(const saved of old.contexts){
    const binding=sourceCorrectionLegacyExampleContext(old.term,saved,dictionaryExamplesRelease.source);assert(binding);
    assert.equal(matchesSourceCorrectionLegacyDTO(binding,old.expectedEntry),true);
    assert.equal(matchesSourceCorrectionLegacyDTO({...binding},old.expectedEntry),false);
    assert.equal(matchesSourceCorrectionLegacyDTO(binding,{...old.expectedEntry,term:'other'}),false);
    assert.deepEqual(await loadDictionaryExamples(old.term,{fetchImpl:local,savedEntry:saved}),old.expectedEntry);
    assert.equal(sourceCorrectionLegacyExampleContext(old.term,saved,{...dictionaryExamplesRelease.source,manifestSha256:'0'.repeat(64)}),null);
  }
});

test('savedcontext/getter mutation and cancellation cannot borrow newly selected examples',async()=>{
  const dto=searchEverydayDictionary('mortuary').results[0],pending=loadDictionaryExamples('mortuary',{savedEntry:dto,fetchImpl:local});dto.meaning+=' changed';assert.equal(await pending,null);
  let accessed=0;const bad={term:'mortuary',partOfSpeech:'noun',get meaning(){accessed++;return 'wrong';}};
  assert.equal(await loadDictionaryExamples('mortuary',{savedEntry:bad,fetchImpl:local}),null);assert.equal(accessed,0);
  const controller=new AbortController();controller.abort();await assert.rejects(loadDictionaryExamples('mortuary',{signal:controller.signal,fetchImpl:local}),{name:'AbortError'});
});

test('optional schema fails closed on crosssense IDs/POS/meaning, unlisted forms and duplicated pairs',()=>{
  const original=pack.entries.find(r=>r.term==='mortuary');
  for(const change of [r=>r.exampleSenses[0].meaningZh+=' changed',r=>r.exampleSenses[0].partOfSpeech='adjective',
    r=>r.exampleContexts[0].senseIds=['missing'],r=>r.formProjections[0].form='mortuarys',
    r=>r.formProjections[0].exampleSenseIds.push(r.exampleSenses[2].id),r=>r.exampleSenses[1].examples=r.exampleSenses[0].examples]){
    const row=structuredClone(original);change(row);assert.throws(()=>validateReviewedExampleSenses(row,records.get(row.term)));
  }
});

test('policy cannot borrow a different source record, partial tuple, descriptor, row, reviewer or originalexample',()=>{
  for(const change of [p=>p.entries[0].canonicalId++,p=>p.entries[0].selectedRowSha256='0'.repeat(64),
    p=>p.entries[0].excludedWholeRawAlternatives[0].tuple.meaning='不安的',p=>p.entries[0].reviewer=pack.author,
    p=>p.manifestByteSha256='0'.repeat(64),p=>p.entries[0].excludedWholeRawAlternatives[0].sourceDescriptor.name='Other']){
    const altered=structuredClone(policy);change(altered);assert.throws(()=>validateSourceCorrectionPolicy(altered,pack,review,records,manifest,hash(manifestBytes),legacy,originals,policyEvidence));
  }
});

test('an unsigned policy subset, missing byteproof or a counterfeit independent review cannot change exclusion authority',()=>{
  const subset=structuredClone(policy);subset.entries.find(e=>e.term==='disastrous').excludedWholeRawAlternatives.pop();
  for(const evidence of[undefined,policyEvidence,{...policyEvidence,bytes:Buffer.from(JSON.stringify(subset))}])
    assert.throws(()=>validateSourceCorrectionPolicy(subset,pack,review,records,manifest,hash(manifestBytes),legacy,originals,evidence));
  const extra=structuredClone(policy);extra.entries[0].excludedWholeRawAlternatives.push(structuredClone(extra.entries[0].excludedWholeRawAlternatives[0]));
  assert.throws(()=>validateSourceCorrectionPolicy(extra,pack,review,records,manifest,hash(manifestBytes),legacy,originals,policyEvidence));
  for(const changed of[{...review,independentOfAuthor:false},{...review,sourceSha256:'0'.repeat(64)},{...review,exactEvidence:{}}])
    assert.throws(()=>validateSourceCorrectionPolicy(policy,pack,changed,records,manifest,hash(manifestBytes),legacy,originals,policyEvidence));
});

test('a toJSON or accessor facade cannot authenticate the complete policy then consume an unsigned subset',()=>{
  let calls=0;const subset=structuredClone(policy);subset.entries.find(e=>e.term==='disastrous').excludedWholeRawAlternatives.pop();
  subset.toJSON=()=>{calls++;return policy;};
  assert.throws(()=>validateSourceCorrectionPolicy(subset,pack,review,records,manifest,hash(manifestBytes),legacy,originals,policyEvidence));
  const accessor=structuredClone(policy);Object.defineProperty(accessor,'entries',{enumerable:true,get(){calls++;return subset.entries;}});
  assert.throws(()=>validateSourceCorrectionPolicy(accessor,pack,review,records,manifest,hash(manifestBytes),legacy,originals,policyEvidence));
  assert.equal(calls,0);
});

test('complete original Chinese controls use correctedcausative/harm/death meanings and no badoldalternatives',async()=>{
  for(const [query,term]of [['令人不安','disconcerting'],['灾难性','disastrous'],['停尸房','mortuary'],['殡仪馆','mortuary']]){
    const all=[];let offset=0;while(true){const page=await searchExpandedDictionary(query,{fetchImpl:local,useChineseQueryCache:false,limit:50,offset});all.push(...page.results);if(!page.hasMore)break;assert(page.nextOffset>offset);offset=page.nextOffset;}
    const found=all.find(r=>r.term===term);assert(found,query);assert.equal(found.meaning,compiled.get(term).meaning);assert.equal(found.source,'卓式词典·义项补充');assert(!found.alternatives?.length);
  }
  for(const query of ['伤心','悲伤','悲哀']){const all=[];let offset=0;while(true){const page=await searchExpandedDictionary(query,{fetchImpl:local,useChineseQueryCache:false,limit:50,offset});all.push(...page.results);if(!page.hasMore)break;offset=page.nextOffset;}
    assert(!all.some(r=>r.term==='disastrous'||r.term==='mortuary'),query);}
});
