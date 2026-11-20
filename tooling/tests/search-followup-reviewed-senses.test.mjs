import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateReviewedSensePack, reviewedSensePackHash,
  validateRetainedCanonicalAlternatives, retainedCanonicalDisplay, validateSourceCorrectionPolicy} from '../scripts/build-reviewed-dictionary-senses.mjs';
import {REVIEWED_SENSE_ENTRIES} from '../../vocab/js/reviewed-senses-data.js';
import {SEARCH_EXPERIENCE_ENTRIES} from '../../vocab/js/search-experience-data.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {historicalSelected207, historicalSearch20} from './helpers/search-common-terms-history.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const bytes=path=>readFile(new URL(path,import.meta.url));
const read=async path=>JSON.parse(await bytes(path));
const base='../dictionary/reviewed-senses/';
const targets=['transit','warranty','progress'];
const prior207=historicalSelected207(REVIEWED_SENSE_ENTRIES);

test('the follow-up names exactly three authored noun senses and only the five-case query aliases',async()=>{
  const pack=await read(base+'source/batch-0016.json');
  assert.equal(pack.author,'AI/chinese_search_followup_author');
  assert.equal(pack.exampleSource,'原创学习例句');
  assert.deepEqual(pack.entries.map(row=>row.term),targets);
  assert.deepEqual(pack.entries.map(row=>row.chineseAliases),[['过境'],['质保'],['进度']]);
  for(const row of pack.entries){
    assert.equal(row.partOfSpeech,'noun');assert(row.meaning.startsWith('① '));
    assert.deepEqual(row.englishForms,row.term==='warranty'?['warranties']:[],
      'Only the independently reviewed warranty plural gains the corrected noun senses');
    assert(/[A-Za-z]/u.test(row.en));assert(/\p{Script=Han}/u.test(row.zh));
    assert(row.references.length&&row.references.every(url=>new URL(url).protocol==='https:'));
  }
});

test('the current canonical evidence authenticates complete unmodified records and all five old tuples',async()=>{
  const evidence=await read(base+'followup-0016-canonical-before.json');
  const manifestBytes=await bytes('../../vocab/data/expanded-dictionary/manifest.json'),manifest=JSON.parse(manifestBytes);
  assert.equal(hash(manifestBytes),evidence.manifestByteSha256);assert.equal(manifest.version,evidence.manifestVersion);
  assert.deepEqual(evidence.records.map(row=>row.term),targets);
  assert.deepEqual(evidence.records.map(row=>1+(row.variants?.length||0)),[2,1,2]);
  for(const proof of evidence.proof){
    const descriptor=manifest.english.shards.find(item=>item.bucket===proof.shard.bucket);
    assert.deepEqual(proof.shard,descriptor);
    const source=await bytes('../../vocab/data/expanded-dictionary/'+descriptor.file);
    assert.equal(source.length,descriptor.bytes);assert.equal(hash(source),descriptor.sha256);
    const canonical=JSON.parse(source).records.find(row=>row.id===proof.canonicalId&&row.term===proof.term);
    assert.deepEqual(canonical,evidence.records.find(row=>row.term===proof.term));
    assert.equal(hash(canonical),proof.canonicalSourceSha256);
  }
});

test('the new retention policy preserves every prior approval object and the four approved old source tuples',async()=>{
  const baseline=await read(base+'followup-0016-baseline.json');
  const oldBytes=await bytes(base+baseline.priorRetentionPolicy),old=JSON.parse(oldBytes);
  assert.equal(hash(oldBytes),baseline.priorRetentionPolicyByteSha256);
  assert.equal(hash(old.entries),baseline.priorRetentionEntriesSha256);
  const policy=await read(base+'retained-alternatives-search-followup-0016.json');
  assert.equal(baseline.priorRetentionEntryCount,49);assert.equal(policy.entries.length,51);
  assert.deepEqual(policy.entries.slice(0,49),old.entries);
  const pack=await read(base+'source/batch-0016.json'),evidence=await read(base+'followup-0016-canonical-before.json');
  const added=policy.entries.slice(49);assert.deepEqual(added.map(row=>row.term),['transit','progress']);
  for(const decision of added){
    const canonical=evidence.records.find(row=>row.term===decision.term),selected=pack.entries.find(row=>row.term===decision.term);
    assert.equal(decision.canonicalSourceSha256,hash(canonical));
    assert.equal(decision.selectedRowSha256,hash(selected));assert.equal(decision.author,pack.author);
    assert.deepEqual(decision.alternatives,[canonical,...(canonical.variants||[])].map(({partOfSpeech,meaning,source})=>({partOfSpeech,meaning,source})));
    assert(!Object.hasOwn(decision,'usageNote'),'An additive release must not rewrite the prior displayed meaning');
  }
});

test('warranty documents its precise accuracy exception while preserving supported formal senses',async()=>{
  const pack=await read(base+'source/batch-0016.json'),warranty=pack.entries.find(row=>row.term==='warranty');
  const evidence=await read(base+'followup-0016-canonical-before.json'),canonical=evidence.records.find(row=>row.term==='warranty');
  const exceptions=await read(base+'followup-0016-accuracy-exceptions.json');
  assert.equal(exceptions.author,pack.author);assert.equal(exceptions.entries.length,1);
  const exception=exceptions.entries[0],rawTuple={partOfSpeech:canonical.partOfSpeech,meaning:canonical.meaning,source:canonical.source};
  assert.equal(exception.term,'warranty');assert.equal(exception.canonicalId,canonical.id);
  assert.deepEqual(exception.rawTuple,rawTuple);assert.equal(exception.rawTupleSha256,hash(rawTuple));
  assert.equal(exception.canonicalSourceSha256,hash(canonical));assert.equal(exception.authoredRowSha256,hash(warranty));
  assert.equal(exception.authoredMeaning,warranty.meaning);assert.deepEqual(exception.englishForms,['warranties']);
  assert.deepEqual(exception.excludedEquivalences,['保单','保险保单']);
  assert.equal(warranty.meaning.split('\n').length,3);
  assert(warranty.meaning.includes('① 质保；商品保修承诺。'));
  assert(warranty.meaning.includes('②（合同等法律语境）'));
  assert(warranty.meaning.includes('保证书'));assert(warranty.meaning.includes('③（美式用法）授权；正当理由或根据。'));
  assert(!warranty.meaning.includes('保单'));
  assert(warranty.references.includes('https://www.collinsdictionary.com/dictionary/english/warranty'));
});

test('actual independent approvals admit the new senses and preserve exact licensed display fields',async()=>{
  const pack=await read(base+'source/batch-0016.json'),review=await read(base+'reviews/batch-0016.json');
  assert.equal(review.sourceSha256,reviewedSensePackHash(pack));
  assert.notEqual(review.reviewer,pack.author);assert.equal(review.independentOfAuthor,true);
  const evidence=await read(base+'followup-0016-canonical-before.json'),canonical=new Map(evidence.records.map(row=>[row.term,row]));
  const rows=validateReviewedSensePack(pack,review,canonical);assert.deepEqual(rows.map(row=>row.term),targets);
  const policy=await read(base+'retained-alternatives-search-followup-0016.json');
  const selections=new Map(pack.entries.map(row=>[row.term,{author:pack.author,row}]));
  const manifest=await read('../../vocab/data/expanded-dictionary/manifest.json');
  const retained=validateRetainedCanonicalAlternatives({schemaVersion:1,entries:policy.entries.slice(49)},selections,canonical,manifest.sources);
  assert(!retained.has('warranty'),'The misleading indivisible raw warranty tuple is not an active alternative');
  for(const term of ['transit','progress']){
    const record=canonical.get(term);
    const expected=[record,...(record.variants||[])].map(old=>retainedCanonicalDisplay(record,old,manifest.sources[old.source]));
    assert.deepEqual(retained.get(term),expected);
    assert.deepEqual(retained.get(term).map(row=>Object.keys(row)),expected.map(()=>['partOfSpeech','meaning','source','license','url']));
  }
  const exceptions=await read(base+'followup-0016-accuracy-exceptions.json'),exception=exceptions.entries[0];
  assert.notEqual(exception.reviewer,pack.author);assert.equal(exception.independentOfAuthor,true);
});

test('the compiled release preserves all 204 prior selected objects and the original 16-row prefix',async()=>{
  const baseline=await read(base+'followup-0016-baseline.json'),heads=new Set(baseline.historicalReviewedHeads);
  assert.equal(heads.size,204);
  const old=prior207.filter(row=>heads.has(row.term));
  assert.equal(old.length,204);assert.equal(hash(old),baseline.historicalReviewedRowsSha256);
  assert.deepEqual(prior207.filter(row=>!heads.has(row.term)).map(row=>row.term).sort(),[...targets].sort());
  assert.equal(hash(SEARCH_EXPERIENCE_ENTRIES.slice(0,16)),baseline.historicalSearchRowsSha256);
  assert.equal(historicalSearch20(SEARCH_EXPERIENCE_ENTRIES).length,20);
  assert.equal(hash(await bytes('../dictionary/everyday-expansions/2026-11-19-search-experience/source.json')),baseline.originalSearchSourceByteSha256);
  assert.equal(hash(await bytes('../dictionary/everyday-expansions/2026-11-19-search-experience/review.json')),baseline.originalSearchReviewByteSha256);
});

test('only the exact signed three-row correction cohort extends the complete unchanged207 objects',async()=>{
  assert.equal(prior207.length,207);
  assert.equal(hash(prior207),'bf838a08a9d7e6d0b8f0fd0bf257384444124815f46839460268f2bb5975e7aa');
  const sourceBytes=await bytes(base+'source/batch-0017.json'),pack=JSON.parse(sourceBytes);
  const review=await read(base+'reviews/batch-0017.json');
  assert.equal(hash(sourceBytes),'fc994f62c92a4653714bc9ecbab2d7633f970751e56aec67c5a23b9ac877a2f4');
  assert.equal(hash(sourceBytes),review.sourceByteSha256);
  assert.equal(hash(pack),review.sourceSha256);assert.notEqual(review.reviewer,pack.author);
  assert.equal(review.independentOfAuthor,true);assert.deepEqual(review.issues,[]);
  assert.deepEqual(pack.entries.map(row=>row.term),['disconcerting','disastrous','mortuary']);
  const before=await read(base+'source-corrections-0017-canonical-before.json');
  const manifestBytes=await bytes('../../vocab/data/expanded-dictionary/manifest.json'),manifest=JSON.parse(manifestBytes);
  assert.equal(hash(manifestBytes),before.manifestByteSha256);
  const records=new Map();
  for(const proof of before.records){
    const descriptor=manifest.english.shards.find(row=>row.bucket===proof.shard.bucket);
    assert.deepEqual(descriptor,proof.shard);
    const shardBytes=await bytes('../../vocab/data/expanded-dictionary/'+descriptor.file);
    assert.equal(shardBytes.length,descriptor.bytes);assert.equal(hash(shardBytes),descriptor.sha256);
    const raw=JSON.parse(shardBytes).records.find(row=>row.term===proof.term&&row.id===proof.record.id);
    assert.deepEqual(raw,proof.record);assert.equal(hash(raw),proof.canonicalSourceSha256);
    records.set(proof.term,raw);
  }
  const expected=validateReviewedSensePack(pack,review,records);
  const policyFile='source-corrections-0017-accuracy-policy.json',policyBytes=await bytes(base+policyFile);
  const legacy=await read(base+'source-corrections-0017-legacy-examples.json');
  const projections=validateSourceCorrectionPolicy(JSON.parse(policyBytes),pack,review,records,manifest,hash(manifestBytes),legacy,
    new Map(legacy.entries.map(row=>[row.term,row.expectedEntry])),{file:policyFile,bytes:policyBytes});
  for(const row of expected)Object.assign(row,projections.get(row.term));
  const oldHeads=new Set(prior207.map(row=>row.term));
  const added=REVIEWED_SENSE_ENTRIES.filter(row=>!oldHeads.has(row.term));
  assert.equal(REVIEWED_SENSE_ENTRIES.length,210);
  assert.deepEqual(added,expected.toSorted((a,b)=>a.term.localeCompare(b.term,'en')));
  for(const row of added){
    const authored=pack.entries.find(source=>source.term===row.term);
    assert.deepEqual(row.chineseAliases,[]);assert.deepEqual(row.englishForms,[]);
    assert.deepEqual(row.exampleSenses,authored.exampleSenses);
    assert.deepEqual(row.exampleContexts,authored.exampleContexts);
    if(Object.hasOwn(authored,'formProjections'))assert.deepEqual(row.formProjections,authored.formProjections);
  }
  assert.equal(added.reduce((count,row)=>count+row.exampleSenses.reduce((sum,sense)=>sum+sense.examples.length,0),0),7);
});

test('warranty and its approved plural use the authored source without an insurance-policy reverse match',async()=>{
  const pack=await read(base+'source/batch-0016.json'),warranty=pack.entries.find(row=>row.term==='warranty');
  const forbidden=()=>{throw Error('The exact authored warranty lookup must not request a shard or provider');};
  for(const query of ['warranty','warranties']){
    const found=await searchExpandedDictionary(query,{fetchImpl:forbidden});
    assert.equal(found.results.length,1);const result=found.results[0];
    assert.equal(result.term,'warranty');assert.equal(result.partOfSpeech,'noun');
    assert.equal(result.meaning,warranty.meaning);assert.equal(result.source,'卓式词典·义项补充');
    assert.equal(result.license,'Original composition');assert.equal(result.url,'https://zhuodashuai.github.io/vocab/');
    assert(!result.alternatives?.length);assert(!result.meaning.includes('保单'));
    if(query==='warranties')assert.equal(result.matchedForm,'warranties');
  }
  const local={fetchImpl:async url=>{assert.equal(new URL(url).protocol,'file:');return new Response(await readFile(url));}};
  for(const query of ['保单','保险保单']){
    let offset=0,pages=0;
    while(true){
      const found=await searchExpandedDictionary(query,{...local,limit:50,offset});
      assert(!found.results.some(row=>row.term==='warranty'),query+' must not inherit the rejected old equivalence');
      if(!found.hasMore)break;
      assert(Number.isSafeInteger(found.nextOffset)&&found.nextOffset>offset);
      offset=found.nextOffset;assert(++pages<1000,'Reverse search pagination must terminate');
    }
  }
});
