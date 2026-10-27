import test from 'node:test';
import assert from 'node:assert/strict';
import { EVERYDAY_LOOKUP_ENTRIES } from '../js/everyday-lookup-data.js';
import { searchEverydayDictionary, loadEverydayExamples, isReviewedCanonicalSenseHead, isSupersededChineseSenseHead } from '../js/everyday-lookup.js';
import { searchExpandedDictionary } from '../js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../js/personal-lookup-flow.js';
import { readFile } from 'node:fs/promises';

const reviewed = EVERYDAY_LOOKUP_ENTRIES.filter(row => row.reviewedCanonicalSense === true);
const oldSource = '卓的日常词组';
const oldExampleSource = '原创例句·作者自查（精选义项）';

test('independently reviewed canonical sense rows expose their own dictionary source and exact EN/ZH example', () => {
  assert(reviewed.length > 0, 'Generate independently approved sense data before accepting this integration');
  for (const row of reviewed) {
    assert.equal(row.dictionarySource, '卓式词典·义项补充');
    assert.match(row.exampleReviewer, /^AI\/[a-z0-9_-]{1,100}$/u);
    assert.equal(row.exampleSource, '原创例句·AI复核（精选义项）');
    const result = searchEverydayDictionary(row.term).results[0];
    assert.equal(result.term, row.term);
    assert.equal(result.source, row.dictionarySource);
    assert.equal(result.partOfSpeech, row.partOfSpeech);
    assert.equal(result.meaning, row.meaning);
    const example = loadEverydayExamples(row.term);
    assert.equal(example.term, row.term);
    assert.equal(example.senses.length, 1);
    const sense = example.senses[0];
    assert.match(sense.id, /^reviewed-sense:[a-f0-9]{16}$/u);
    assert.equal(sense.partOfSpeech, row.partOfSpeech);
    assert.equal(sense.meaningZh, row.meaning);
    assert.equal(sense.reviewer, row.exampleReviewer);
    assert.equal(sense.source, row.exampleSource);
    assert.deepEqual(sense.examples, [{ en: row.en, zh: row.zh }]);
    assert.equal(loadEverydayExamples(row.term.toUpperCase()).senses[0].id, sense.id);
    for (const alias of row.chineseAliases) {
      const answer = searchEverydayDictionary(alias)?.results.find(item => item.term === row.term);
      assert(answer, `${alias}: ${row.term}`);
      assert.equal(answer.source, row.dictionarySource);
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
    ['多才多艺的','multitalented'], ['核欧沃豪斯效应','NOE']];
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
});

test('undeclared legacy forms cannot borrow an approved head meaning or leak back through the compact fallback', async () => {
  const fetchImpl = async input => new Response(await readFile(new URL(typeof input === 'string' || input instanceof URL ? input : input.url)));
  for (const [form, head] of [['noes','NOE'], ['communitarians','communitarian']]) {
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
    assert.deepEqual(Object.keys(result).sort(), ['license','meaning','partOfSpeech','source','term','url']);
    const example = loadEverydayExamples(row.term);
    assert.deepEqual(Object.keys(example).sort(), ['senses','term']);
    assert.deepEqual(Object.keys(example.senses[0]).sort(), ['examples','id','meaningZh','partOfSpeech','reviewer','source']);
    assert.deepEqual(Object.keys(example.senses[0].examples[0]).sort(), ['en','zh']);
    result.meaning = 'changed locally'; example.senses[0].examples[0].en = 'Changed locally.';
    assert.equal(searchEverydayDictionary(row.term).results[0].meaning, row.meaning);
    assert.equal(loadEverydayExamples(row.term).senses[0].examples[0].en, row.en);
  }
});
