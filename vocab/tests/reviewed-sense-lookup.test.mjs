import test from 'node:test';
import assert from 'node:assert/strict';
import { EVERYDAY_LOOKUP_ENTRIES } from '../js/everyday-lookup-data.js';
import { searchEverydayDictionary, loadEverydayExamples, loadSourceCorrectionExamples, isReviewedCanonicalSenseHead, isSupersededChineseSenseHead } from '../js/everyday-lookup.js';
import { searchExpandedDictionary } from '../js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../js/personal-lookup-flow.js';
import { readFile } from 'node:fs/promises';
import { historicalSelectedRows } from '../../tooling/tests/selected-sense-history-fixture.mjs';
import { historicalSelected207 } from '../../tooling/tests/helpers/search-common-terms-history.mjs';
import {exactMedicalCorrectionRows} from '../../tooling/tests/helpers/life-coverage-history.mjs';

const reviewed = EVERYDAY_LOOKUP_ENTRIES.filter(row => row.reviewedCanonicalSense === true);
const prior207 = historicalSelected207(reviewed);
const medicalCorrections=exactMedicalCorrectionRows(reviewed);
const historicalHeads = new Set(historicalSelectedRows(prior207).map(row=>row.term));
const correctionSource = JSON.parse(await readFile(new URL('../../tooling/dictionary/reviewed-senses/source/batch-0017.json',import.meta.url),'utf8'));
const corrections = correctionSource.entries.map(source => {
  const row=reviewed.find(row=>row.term===source.term);assert(row);
  assert(!prior207.some(old=>old.term===row.term));return row;
});
assert.deepEqual(corrections.map(row=>row.term),['disconcerting','disastrous','mortuary']);
const oldSource = '卓的日常词组';
const oldExampleSource = '原创例句·作者自查（精选义项）';

test('independently reviewed canonical sense rows expose their own dictionary source and exact EN/ZH example', () => {
  assert(reviewed.length > 0, 'Generate independently approved sense data before accepting this integration');
  assert.equal(prior207.length,207);
  for (const row of prior207) {
    assert.equal(row.dictionarySource, '卓式词典·义项补充');
    assert.match(row.exampleReviewer, /^AI\/[a-z0-9_-]{1,100}$/u);
    assert.equal(row.exampleSource, historicalHeads.has(row.term) ? '原创例句·AI复核（精选义项）' : '原创学习例句');
    const result = searchEverydayDictionary(row.term).results[0];
    assert.equal(result.term, row.term);
    assert.equal(result.source, row.dictionarySource);
    assert.equal(result.partOfSpeech, row.partOfSpeech);
    assert.equal(result.meaning, row.meaning);
    const example = loadEverydayExamples(row.term);
    assert.equal(example.term, row.term);
    assert.equal(example.senses.length, 1);
    const sense = example.senses[0];
    if (Object.hasOwn(row,'existingExampleDTOJSON')) assert.deepEqual(example,JSON.parse(row.existingExampleDTOJSON));
    else {
      assert.match(sense.id,/^reviewed-sense:[a-f0-9]{16}$/u);
      assert.equal(sense.partOfSpeech,row.partOfSpeech);assert.equal(sense.meaningZh,row.meaning);
      assert.equal(sense.reviewer,row.exampleReviewer);assert.equal(sense.source,row.exampleSource);
    }
    assert.deepEqual(sense.examples, [{ en: row.en, zh: row.zh }]);
    assert.equal(loadEverydayExamples(row.term.toUpperCase()).senses[0].id, sense.id);
    for (const alias of row.chineseAliases) {
      const answer = searchEverydayDictionary(alias)?.results.find(item => item.term === row.term);
      assert(answer, `${alias}: ${row.term}`);
      assert.equal(answer.source, row.dictionarySource);
    }
  }
});

test('the three exact approved corrections expose allseven POS-labelled examples and their complete context mappings',()=>{
  let pairs=0;
  for(const row of corrections){
    assert.equal(row.dictionarySource,'卓式词典·义项补充');
    assert.equal(row.exampleSource,'原创学习例句');
    const result=searchEverydayDictionary(row.term).results[0],entry=loadEverydayExamples(row.term);
    assert.equal(result.meaning,row.meaning);assert.equal(result.partOfSpeech,row.partOfSpeech);assert.equal(result.source,row.dictionarySource);
    const expected=row.exampleSenses.map(sense=>({...structuredClone(sense),reviewer:row.exampleReviewer,source:row.exampleSource}));
    assert.deepEqual(entry,{term:row.term,senses:expected});
    assert.deepEqual(loadEverydayExamples(row.term.toUpperCase()),entry);
    for(const sense of entry.senses){
      assert.match(sense.id,new RegExp('^reviewed-source-correction:'+row.term+':[1-3]$','u'));
      assert(row.partOfSpeech.split(' · ').includes(sense.partOfSpeech));
      pairs+=sense.examples.length;
    }
    for(const binding of row.exampleContexts){
      const context={term:row.term,partOfSpeech:binding.partOfSpeech,meaning:binding.meaning};
      const selected=loadSourceCorrectionExamples(row.term,{context});
      assert.deepEqual(selected,{term:row.term,senses:expected.filter(sense=>binding.senseIds.includes(sense.id))});
      assert.deepEqual(selected.senses.map(sense=>sense.id),binding.senseIds);
      assert.equal(loadSourceCorrectionExamples(row.term,{context:{...context,meaning:context.meaning+' changed'}}),null);
    }
    assert.deepEqual(row.englishForms,[],'The noun plural requires private canonical authentication, not a packaged form registration');
  }
  assert.equal(pairs,7);
  const mortuary=corrections.find(row=>row.term==='mortuary'),projection=mortuary.formProjections[0];
  assert.equal(projection.form,'mortuaries');assert.equal(projection.partOfSpeech,'noun');
  const noun=loadSourceCorrectionExamples('mortuary',{context:{term:'mortuary',partOfSpeech:projection.partOfSpeech,meaning:projection.meaning}});
  assert.equal(noun.senses.length,2);assert(noun.senses.every(sense=>sense.partOfSpeech==='noun'));
  assert.deepEqual(noun.senses.map(sense=>sense.id),projection.exampleSenseIds);
});

test('the distinct medical cohort exposes exactly three typed senses and context-bound fresh examples',()=>{
  assert.deepEqual(medicalCorrections.map(row=>row.term),['anaphylactic','anaphylactoid','anaphylaxis']);
  assert.deepEqual(medicalCorrections.map(row=>row.partOfSpeech),['adjective','adjective','noun']);
  assert.deepEqual(medicalCorrections.map(row=>row.chineseAliases),[
    ['严重全身性过敏反应的'],['类似严重过敏反应的','类过敏反应的'],['严重全身性过敏反应','全身性严重过敏反应']]);
  for(const row of medicalCorrections){
    const id=`reviewed-source-correction:${row.term}:1`;
    assert.deepEqual(row.exampleSenses,[{id,partOfSpeech:row.partOfSpeech,meaningZh:row.meaning,examples:[{en:row.en,zh:row.zh}]}]);
    assert.deepEqual(row.exampleContexts,[{partOfSpeech:row.partOfSpeech,meaning:row.meaning,senseIds:[id]}]);
    assert.deepEqual(row.englishForms,[]);assert(!Object.hasOwn(row,'formProjections'));
    const result=searchEverydayDictionary(row.term).results[0];
    assert.equal(result.partOfSpeech,row.partOfSpeech);assert.equal(result.meaning,row.meaning);assert.equal(result.source,row.dictionarySource);
    const expected={term:row.term,senses:row.exampleSenses.map(sense=>({...structuredClone(sense),reviewer:row.exampleReviewer,source:row.exampleSource}))};
    assert.deepEqual(loadEverydayExamples(row.term),expected);
    const context={term:row.term,partOfSpeech:row.partOfSpeech,meaning:row.meaning};
    assert.deepEqual(loadSourceCorrectionExamples(row.term,{context}),expected);
    for(const changed of[{...context,meaning:context.meaning+' changed'},{...context,partOfSpeech:'adverb'}]){
      assert.equal(loadSourceCorrectionExamples(row.term,{context:changed}),null);
    }
  }
});

test('only a literal reviewed head can identify the supplementary canonical source', () => {
  const exactHeads = new Set(reviewed.map(row => row.term));
  assert(exactHeads.size > 0);
  for (const row of reviewed) {
    assert.equal(isReviewedCanonicalSenseHead(row.term), true, row.term);
    for (const changed of [row.term.toUpperCase(), row.term.toLowerCase(), ` ${row.term}`, `${row.term} `,
      `"${row.term}"`, `${row.term}?`, `${row.term}\n`, ...row.englishForms, ...row.chineseAliases]) {
      if (!exactHeads.has(changed)) assert.equal(isReviewedCanonicalSenseHead(changed), false, changed);
    }
  }
  for (const row of EVERYDAY_LOOKUP_ENTRIES.filter(item => item.reviewedCanonicalSense !== true)) {
    assert.equal(isReviewedCanonicalSenseHead(row.term), false, row.term);
  }
  for (const invalid of [null, undefined, {}, [], 0, '', 'constructor', '<script>', 'not a real head']) {
    assert.equal(isReviewedCanonicalSenseHead(invalid), false);
  }
});

test('superseded Chinese hot-index errors are removed while compatible existing meanings stay available', async () => {
  assert.equal(isSupersededChineseSenseHead('baggie'), true);
  assert.equal(isSupersededChineseSenseHead('untypical'), true);
  assert.equal(isSupersededChineseSenseHead('bin liner'), false);
  assert.equal(isSupersededChineseSenseHead('BAGGIE'), false);
  const wrong = { term: 'baggie', meaning: '垃圾袋', partOfSpeech: 'noun' };
  const good = { term: 'bin liner', meaning: '套入垃圾桶内的塑料垃圾袋', partOfSpeech: 'noun' };
  const original = { results: [wrong, good], hasMore: false };
  let fullRequests = 0;
  const result = await lookupPersonalDictionaryFast('垃圾袋', {
    hotReverse: async () => original,
    fullSearch: async () => { fullRequests++; throw Error('A valid compact result should remain fast'); }
  });
  assert.deepEqual(result.results, [good]); assert.equal(fullRequests, 0);
  assert.deepEqual(original.results, [wrong, good]);
});

test('new English and Chinese senses use identical local meanings, POS and examples at both public and personal entry points', async () => {
  const cases = [['CD-ROM', 'CD-ROM'], ["that's", "that's"], ['不典型的','untypical'],
    ['连帽卫衣','hoodie'], ['食品小塑料袋','baggie'], ['单板滑雪者','snowboarder'],
    ['多才多艺的','multitalented'], ['核欧沃豪斯效应','NOE'],
    ['鬣狗','hyena'], ['冲动地','impulsively'], ['去皮玉米粒','hominy'],
    ['喜欢拥抱别人的人','hugger'], ['薄弱地','tenuously'],
    ['组织重组','restructuring'], ['国际空间站','ISS'], ['泰恩赛德人','geordie']];
  const fail = () => { throw Error('A local approved supplement should not download the large dictionary or call a provider'); };
  for (const [query, head] of cases) {
    const found = await searchExpandedDictionary(query, { fetchImpl: fail });
    const personal = await lookupPersonalDictionaryFast(query, { hotLookup: fail, hotReverse: fail, fullSearch: fail });
    assert.deepEqual(personal, found); assert(found.results.some(row => row.term === head));
    const result = found.results.find(row => row.term === head), example = loadEverydayExamples(head);
    assert.equal(result.meaning, example.senses[0].meaningZh);
    assert.equal(result.partOfSpeech, example.senses[0].partOfSpeech);
  }
});

test('the real legacy reverse index no longer offers a food bag for a garbage-bag query', async () => {
  const fetchImpl = async input => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.protocol, 'file:');
    return new Response(await readFile(url));
  };
  const found = await searchExpandedDictionary('垃圾袋', { fetchImpl });
  assert(found.results.some(row => row.term === 'bin liner'));
  assert(!found.results.some(row => row.term === 'baggie'));
  const animal = await searchExpandedDictionary('袋狼', { fetchImpl });
  assert(!animal.results.some(row => row.term === 'hyena'), 'A stale hyena definition cannot teach the wrong animal');
});

test('undeclared legacy forms cannot borrow an approved head meaning or leak back through the compact fallback', async () => {
  const fetchImpl = async input => new Response(await readFile(new URL(typeof input === 'string' || input instanceof URL ? input : input.url)));
  for (const [form, head] of [['noes','NOE'], ['communitarians','communitarian'],
    ['huggered','hugger'], ['issed','ISS']]) {
    await assert.rejects(searchExpandedDictionary(form, { fetchImpl }), error => {
      assert.equal(error.code, 'unreviewed_dictionary_form');
      assert.match(error.message, /^请输入英文原形查询/u); return true;
    });
    const old = { term: head, partOfSpeech: 'adjective', meaning: '旧索引中未获批准的含义。' };
    await assert.rejects(lookupPersonalDictionaryFast(form, {
      hotLookup: async () => old,
      fullSearch: async () => ({ results: [old], hasMore: false })
    }), { code: 'unreviewed_dictionary_form' });
  }
  const allowed = await searchExpandedDictionary('hoodies', { fetchImpl: () => { throw Error('Approved forms remain local'); } });
  assert.equal(allowed.results[0].term, 'hoodie'); assert.match(allowed.results[0].meaning, /连帽/u);
});

test('the original everyday records retain their source, example identity and author metadata', () => {
  const ordinary = EVERYDAY_LOOKUP_ENTRIES.filter(row => row.reviewedCanonicalSense !== true
    && !row.dictionarySource && !row.exampleReviewer && !row.exampleSource);
  assert(ordinary.length >= 248, 'The prior everyday supplement remains available');
  for (const row of ordinary) {
    const result = searchEverydayDictionary(row.term).results[0];
    assert.equal(result.source, oldSource);
    assert.equal(result.term, row.term);
    const sense = loadEverydayExamples(row.term).senses[0];
    assert.match(sense.id, /^everyday:[a-f0-9]{16}$/u);
    assert.equal(sense.source, oldExampleSource);
    assert.equal(sense.reviewer, 'AI/everyday-original');
    assert.deepEqual(sense.examples, [{ en: row.en, zh: row.zh }]);
  }
});

test('internal canonical tracking fields never leak through search or example DTOs', () => {
  assert(reviewed.length > 0);
  for (const row of reviewed) {
    const result = searchEverydayDictionary(row.term).results[0];
    assert.deepEqual(Object.keys(result).sort(), row.retainedCanonicalAlternatives?.length
      ? ['alternatives','license','meaning','partOfSpeech','source','term','url']
      : ['license','meaning','partOfSpeech','source','term','url']);
    const example = loadEverydayExamples(row.term);
    assert.deepEqual(Object.keys(example).sort(), ['senses','term']);
    for(const alternative of result.alternatives||[])assert.deepEqual(Object.keys(alternative).sort(),['license','meaning','partOfSpeech','source','url']);
    const before=structuredClone(example);
    for(const sense of example.senses){
      assert.deepEqual(Object.keys(sense).sort(), ['examples','id','meaningZh','partOfSpeech','reviewer','source']);
      for(const pair of sense.examples){
        assert.deepEqual(Object.keys(pair).sort(), ['en','zh']);
        pair.en='Changed locally.';pair.zh='本地修改。';
      }
      sense.id='changed';sense.meaningZh='本地修改。';sense.source='changed';sense.reviewer='changed';
    }
    result.meaning = 'changed locally';
    assert.equal(searchEverydayDictionary(row.term).results[0].meaning, row.meaning);
    assert.deepEqual(loadEverydayExamples(row.term),before,'Every sense/pair is a fresh clone; compiled approved data remains unchanged');
    assert.equal(loadEverydayExamples(row.term).senses[0].examples[0].en, row.en);
  }
});
