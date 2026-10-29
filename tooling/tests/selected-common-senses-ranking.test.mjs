import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { searchExpandedDictionary } from '../../vocab/js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../../vocab/js/personal-lookup-flow.js';
import { SELECTED_COMMON_SENSE_BINDINGS } from '../../vocab/js/selected-common-sense-data.js';

const root = new URL('../../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root)));
const binding = SELECTED_COMMON_SENSE_BINDINGS.find(row => row.head === 'obligation');
const source = await read('tooling/dictionary/selected-common-senses/source/batch-0001.json');
const entry = source.entries.find(row => row.head === binding.head);
const manifest = await read('vocab/data/expanded-dictionary/manifest.json');
const canonical = new Map();
// The three immutable canonical buckets are evidence for ordering, rather than
// the former result-array order or a new priority assigned to the curated head.
for (const [head, bucket] of [['duty', 81], ['responsibility', 27], ['obligation', 41]]) {
  const descriptor = manifest.english.shards[bucket];
  const bytes = await readFile(new URL('vocab/data/expanded-dictionary/' + descriptor.file, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256);
  const row = JSON.parse(bytes).records.find(record => record.term === head);
  assert(row); canonical.set(head, row);
}
function transport(transform) {
  const requests = [];
  return { requests, fetchImpl: async (input, options) => {
    const url = new URL(input); assert.equal(url.protocol, 'file:');
    assert.equal(url.search, ''); assert(!options?.method || options.method === 'GET');
    requests.push(url.href); const bytes = await readFile(url);
    return new Response(transform ? transform(url, bytes) : bytes);
  } };
}
function directHeads(query) {
  return [...new Set(binding.runtimeGroup.evidence.filter(row => row.terms.includes(query)).map(row => row.head))]
    .sort((a, b) => canonical.get(a).id - canonical.get(b).id);
}

for (const query of binding.groupTerms) test(`global finite selected-group ${query} paginates exact source-ranked direct heads`, async () => {
  const data = transport(), expected = directHeads(query);
  const full = await searchExpandedDictionary(query, { ...data, limit: 50 });
  assert.equal(full.ranking, 'global'); assert.equal(full.total, expected.length);
  assert.deepEqual(full.results.map(row => row.term), expected);
  const pages = [];
  for (let offset = 0; offset <= expected.length; offset++) {
    const page = await searchExpandedDictionary(query, { ...data, limit: 1, offset });
    assert.equal(page.ranking, 'global'); assert.equal(page.offset, offset);
    assert.equal(page.total, expected.length);
    assert.equal(page.nextOffset, Math.min(offset + 1, expected.length));
    assert.equal(page.hasMore, offset + 1 < expected.length);
    assert.deepEqual(page.results, full.results.slice(offset, offset + 1));
    pages.push(...page.results);
  }
  assert.equal(new Set(pages.map(row => row.term)).size, expected.length);
  if (expected.includes(binding.head)) {
    const curated = pages.find(row => row.term === binding.head);
    assert.equal(curated.source, '卓式词典·义项补充');
    assert.equal(curated.meaning, entry.selectedRow.meaning);
    assert.equal(curated.matchedSourceEvidence.kind, 'reviewed-canonical-primary');
    assert.equal(curated.matchedSourceEvidence.canonicalId, canonical.get(binding.head).id);
    assert.deepEqual(curated.matchedExampleSenseEvidence, [entry.selectedExampleProof]);
    assert(!curated.alternatives); assert(!curated.meaning.includes('恩惠'));
  }
  assert.equal(data.requests.filter(url => /\/zh-\d{3}\.json$/u.test(url)).length, 0);
  assert.equal(data.requests.filter(url => /\.bin$/u.test(url)).length, 0);
  assert(data.requests.filter(url => /\/en-\d{3}\.json$/u.test(url)).length <= 6);
});

test('nearby free Chinese queries retain broad global ranking without activating finite source bindings', async () => {
  for (const query of ['义务的', '义务相关']) {
    const data = transport(), result = await searchExpandedDictionary(query, { ...data, limit: 50 });
    assert.equal(result.ranking, 'global');
    assert(result.results.every(row => !row.matchedSourceEvidence));
    assert(!result.results.some(row => row.term === binding.head && row.source === '卓式词典·义项补充'));
    assert.equal(data.requests.filter(url => /\.bin$/u.test(url)).length, 1);
    assert.equal(data.requests.filter(url => /\/en-\d{3}\.json$/u.test(url)).length, 0);
  }
});

test('global finite source projection cannot accept a modified complete English record', async () => {
  const data = transport((url, bytes) => {
    if (!url.pathname.endsWith('/' + entry.canonicalShard.file)) return bytes;
    const payload = JSON.parse(bytes), record = payload.records.find(row => row.id === entry.canonicalId);
    record.variants[0].meaning += ' changed';
    return Buffer.from(JSON.stringify(payload));
  });
  await assert.rejects(searchExpandedDictionary('责任', data), { code: 'invalid_dictionary_data' });
});

test('bound-group complete personal lookup preserves global pagination and never races an old compact group', async () => {
  const data = transport(); let hotCalls = 0;
  const forbiddenHot = () => { hotCalls++; throw Error('old compact group must not replace verified finite source'); };
  const first = await lookupPersonalDictionaryFast('责任', {
    hotLookup: forbiddenHot, hotReverse: forbiddenHot, preferCompleteChinese: true,
    fullSearch: (query, options) => searchExpandedDictionary(query, { ...options, ...data, limit: 1 })
  });
  assert.equal(hotCalls, 0); assert.equal(first.ranking, 'global');
  assert.equal(first.total, 3); assert.equal(first.offset, 0); assert.equal(first.nextOffset, 1);
  const second = await searchExpandedDictionary('责任', { ...data, limit: 1, offset: first.nextOffset });
  assert.equal(second.total, first.total); assert.notEqual(second.results[0].term, first.results[0].term);
});

test('0009 prospective hold remains historical and the new group route does not approve its bad whole raw tuple', async () => {
  const fixture = await read('tooling/dictionary/reviewed-senses/classroom-browser-fixture-0009.json');
  const historical = await read('tooling/dictionary/reviewed-senses/source/batch-0009.json');
  const held = fixture.prospectiveTechnicalHolds.find(row => row.term === binding.head);
  assert(held); assert(!historical.entries.some(row => row.term === binding.head));
  assert.deepEqual(entry.selectedRow, held.sourceEntry);
  assert.deepEqual(entry.canonicalRecord, held.canonicalRecord);
  assert.deepEqual(entry.originalDTO, held.originalDTO);
  assert(held.canonicalRecord.meaning.includes('恩惠'));
  assert(!binding.selectedRow.retainLegacyChinese); assert(!binding.selectedRow.retainedCanonicalAlternatives);
});
