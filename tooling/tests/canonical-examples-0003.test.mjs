import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANONICAL_EXAMPLE_REPAIRS as table} from '../../vocab/js/canonical-example-repairs-data.js';
import {EVERYDAY_LOOKUP_ENTRIES as rows,EVERYDAY_CHINESE_ALIASES as aliases} from '../../vocab/js/everyday-lookup-data.js';
import {searchEverydayDictionary,loadEverydayExamples} from '../../vocab/js/everyday-lookup.js';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {lookupPersonalDictionaryFast} from '../../vocab/js/personal-lookup-flow.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=async relative=>JSON.parse(await readFile(new URL('../dictionary/'+relative,import.meta.url),'utf8'));
const folder='everyday-expansions/2026-10-28-followup/';
const manifest=await read(folder+'manifest.json'),baseline=await read(folder+'baseline.json');
const source=await read('examples/canonical-repairs/source/canonical-quality-0003.json');
const review=await read('examples/canonical-repairs/reviews/canonical-quality-0003.json');
const aliasSource=await read(folder+'alias-source.json'),aliasReview=await read(folder+'alias-review.json');
const noNetwork=()=>{throw Error('Exact reviewed Chinese alias must be answered by packaged data');};

test('batch0003 contains only the13 exact independently approved canonical examples',()=>{
  assert.equal(hash(manifest),'444452213946d925a71db722e48ca11960427ec479e0c4867d3ed38b1c560726');
  assert.equal(hash(source),manifest.canonicalSourceSha256);assert.equal(hash(review),manifest.canonicalReviewSha256);
  assert.equal(review.sourceSha256,hash(source));assert.equal(review.independentOfAuthor,true);assert.notEqual(source.author,review.reviewer);
  assert.equal(source.entries.length,13);assert.deepEqual(review.issues,[]);
  assert.equal(table.rows.length,22);assert.equal(table.rows.reduce((n,row)=>n+1+(row.additionalExamples?.length??0),0),23);
  for(const row of source.entries){
    const approval=review.decisions.find(item=>item.term===row.term);assert.equal(approval?.decision,'approve-canonical-example-repair');assert.equal(approval.rowSha256,hash(row));
    const compiled=table.rows.find(item=>item.term===row.term);assert(compiled);
    for(const field of ['canonicalId','canonicalSourceSha256','exactCanonicalRecord','canonicalSourceDescriptor','expectedOriginalEntry','expectedOriginalEntrySha256','acceptedDisplayContexts','replacementPair'])assert.deepEqual(compiled[field],row[field],row.term+'/'+field);
    assert.equal(row.replacementPair.partOfSpeech,row.exactCanonicalRecord.partOfSpeech);assert.equal(row.replacementPair.meaningZh,row.exactCanonicalRecord.meaning);
    assert.notEqual(compiled.senseId,row.expectedOriginalEntry.senses[0].id);
  }
});

test('all old daily POS,meanings,examples and39 existing alias records remain exact',()=>{
  assert.equal(hash(baseline),'11b8a4bc2783eab9619b96e1127ca77591139f6f5197b4dcaebbe79ba5f5cb7b');
  assert.equal(baseline.head,'1446472ec3d7ba6cab25b2373ff0866d2b616520');assert.equal(baseline.rowsCount,1153);
  assert.equal(rows.length,baseline.rowsCount);assert.equal(hash(rows),baseline.rowsSha256);
  assert.equal(baseline.aliasCount,39);assert.equal(hash(baseline.aliases),baseline.aliasSha256);
  assert.equal(aliases.length,45);assert.deepEqual(aliases.slice(0,39),baseline.aliases);
});

test('six additional Chinese queries bind exact existing rows through independent alias-only approval',async()=>{
  assert.equal(hash(aliasSource),manifest.aliasSourceSha256);assert.equal(hash(aliasReview),manifest.aliasReviewSha256);
  assert.equal(aliasReview.sourceSha256,hash(aliasSource));assert.equal(aliasReview.independentOfAuthor,true);assert.notEqual(aliasReview.reviewer,aliasSource.author);
  assert.equal(aliasSource.entries.length,6);assert.equal(aliasSource.currentRegistrySha256,baseline.aliasSha256);
  for(const proposal of aliasSource.entries){
    const decision=aliasReview.decisions.find(item=>item.term===proposal.term);assert.equal(decision?.decision,'approve-alias-only');assert.equal(decision.rowSha256,hash(proposal));
    const target=rows.find(item=>item.term===proposal.term);assert.deepEqual(target,proposal.targetSnapshot);assert.equal(hash(target),proposal.targetEntrySha256);
    assert.deepEqual(aliases.find(item=>item.term===proposal.term),{term:proposal.term,aliases:proposal.aliases,targetEntrySha256:proposal.targetEntrySha256});
    for(const query of proposal.aliases){
      for(const input of [query,`请问${query}的英文是什么？`]){
        const found=await searchExpandedDictionary(input,{fetchImpl:noNetwork});const hit=found.results.find(item=>item.term===target.term);assert(hit,input);
        assert.equal(hit.partOfSpeech,target.partOfSpeech);assert.equal(hit.meaning,target.meaning);
        assert.deepEqual(await lookupPersonalDictionaryFast(input,{hotLookup:noNetwork,hotReverse:noNetwork,fullSearch:noNetwork}),found,input);
      }
      assert.equal(searchEverydayDictionary('不是'+query),null);assert.equal(searchEverydayDictionary(query+'和其他东西'),null);
    }
    assert.deepEqual(loadEverydayExamples(target.term).senses[0].examples,[{en:target.en,zh:target.zh}]);
  }
  for(const query of ['不把某事当回事','各有利弊','电子烟'])assert.equal(searchEverydayDictionary(query),null,query);
});

test('new canonical examples require the whole saved identity and preserve stored learning fields',async()=>{
  const fetchImpl=async url=>new Response(await readFile(new URL(url)));
  for(const row of source.entries){
    for(const identity of row.acceptedDisplayContexts){
      const card={term:row.term,partOfSpeech:identity.partOfSpeech,meaning:{zh:identity.meaning},example:'Stored sentence.',bookPassage:'Original book sentence.',study:{box:3}};
      const original=structuredClone(card),result=await loadDictionaryExamples(row.term,{fetchImpl,savedEntry:card});assert(result,row.term);
      assert.deepEqual(result.senses[0].examples,[{en:row.replacementPair.en,zh:row.replacementPair.zh}]);assert.deepEqual(card,original);
      const wrong={...card,meaning:{zh:'A different saved sense'}};let requests=0;
      assert.equal(await loadDictionaryExamples(row.term,{fetchImpl:async()=>{requests++;throw Error('Wrong sense must stop before fetching');},savedEntry:wrong}),null);assert.equal(requests,0);
    }
  }
  resetDictionaryExamplesCacheForTests();
});
