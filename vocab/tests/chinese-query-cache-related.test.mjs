import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { searchExpandedDictionary, searchRelatedChineseDictionary, resetExpandedDictionaryCacheForTests } from '../js/expanded-dictionary.js';
import { CHINESE_QUERY_CACHE_RELEASE as release } from '../js/chinese-query-cache-release.js';
import { chineseQueryCacheBucket } from '../js/chinese-query-cache-format.js';

const ROOT = new URL('../data/chinese-query-cache/', import.meta.url);
const isPacket = url => new URL(url).href.startsWith(ROOT.href);
const isRanking = url => new URL(url).pathname.includes('/data/chinese-search-ranking/');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
afterEach(() => resetExpandedDictionaryCacheForTests());
async function decoded(desc) {
  const bytes = await readFile(new URL(desc.file, ROOT)); assert.equal(bytes.length, desc.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), desc.sha256);
  const raw = gunzipSync(bytes, { maxOutputLength: desc.uncompressedBytes }); assert.equal(raw.length, desc.uncompressedBytes); return JSON.parse(raw);
}
async function expected(query) {
  assert(release.members.includes(query)); const bucket = await decoded(release.buckets[chineseQueryCacheBucket(query)]);
  const descriptor = bucket.entries.find(row => row.query === query); assert(descriptor);
  const packet = (await decoded(descriptor)).packets.find(row => row.query === query); assert(packet);
  return { packet, descriptor };
}
function transport(change) {
  const requests = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input); assert.equal(url.protocol, 'file:'); assert.equal(options.credentials, 'omit');
    assert(!options.method || options.method === 'GET'); assert(!('body' in options)); requests.push({ url: url.href, options });
    return await change?.(url, options, requests.length) ?? new Response(await readFile(url));
  }; return { requests, fetchImpl };
}
async function pages(search, query, options) {
  const rows = []; let offset = 0, metadata;
  for (let page = 0; page < 10_000; page++) {
    const result = await search(query, { ...options, limit: 7, offset });
    const { results, hasMore, nextOffset, offset: actualOffset, ...current } = result;
    assert.equal(actualOffset, offset); assert.equal(nextOffset, offset + results.length);
    metadata ??= current; assert.deepEqual(current, metadata); rows.push(...results);
    if (!hasMore) { assert.equal(rows.length, metadata.total); return { metadata, results: rows }; }
    assert(results.length > 0); offset = nextOffset;
  } throw Error('Unbounded pagination');
}
const relatedPacket = packet => ({ metadata: { ...packet.metadata, total: packet.results.filter(row => row.matchType === 'related').length },
  results: packet.results.filter(row => row.matchType === 'related') });

test('cold related lookup uses the complete packet and every related DTO/page stays exact', async () => {
  const { packet } = await expected('开心'), data = transport(url => { assert(!isRanking(url), 'A known related query must not load the complete ranking.'); });
  const result = await pages(searchRelatedChineseDictionary, '开心', data);
  assert.deepEqual(result, relatedPacket(packet)); assert(result.results.length > 7);
  assert.equal(data.requests.filter(row => isPacket(row.url)).length, 2);
});
test('ordinary then related lookup reuses authenticated packet with zero additional GETs', async () => {
  const { packet } = await expected('开心'), data = transport();
  assert.deepEqual(await pages(searchExpandedDictionary, '开心', data), { metadata: packet.metadata, results: packet.results });
  const count = data.requests.length; assert.deepEqual(await pages(searchRelatedChineseDictionary, '开心', data), relatedPacket(packet));
  assert.equal(data.requests.length, count); assert(!data.requests.some(row => isRanking(row.url)));
});
test('primary and related callers share one genuinely pending complete packet', async () => {
  const { packet, descriptor } = await expected('开心'), seen = deferred(), gate = deferred();
  const data = transport(async url => { assert(!isRanking(url)); if (url.href === new URL(descriptor.file, ROOT).href) { seen.resolve(); await gate.promise; } });
  const primary = pages(searchExpandedDictionary, '开心', data); await seen.promise;
  const related = pages(searchRelatedChineseDictionary, '开心', data);
  try { gate.resolve(); const [all, associations] = await Promise.all([primary, related]);
    assert.deepEqual(all, { metadata: packet.metadata, results: packet.results }); assert.deepEqual(associations, relatedPacket(packet));
    assert.equal(data.requests.filter(row => row.url === new URL(descriptor.file, ROOT).href).length, 1);
  } finally { gate.resolve(); }
});
test('a known related packet does not wait behind an unrelated full ranking in flight', async () => {
  const { packet } = await expected('开心'), seen = deferred(), gate = deferred();
  const data = transport(async url => { if (isRanking(url)) { seen.resolve(); await gate.promise; } });
  const full = searchExpandedDictionary('热', data); await seen.promise;
  try { assert.deepEqual(await pages(searchRelatedChineseDictionary, '开心', { ...data, timeoutMs: 2000 }), relatedPacket(packet)); }
  finally { gate.resolve(); await full; }
});
test('an empty related view has exact total/paging without returning direct results', async () => {
  const { packet } = await expected('充电宝'); assert(packet.results.length > 0); assert.equal(relatedPacket(packet).results.length, 0);
  const data = transport(url => { assert(!isRanking(url)); }); const related = await searchRelatedChineseDictionary('充电宝', data);
  assert.deepEqual(related, { ...packet.metadata, total: 0, results: [], hasMore: false, nextOffset: 0, offset: 0 });
});
test('explicit cache bypass preserves the independent related oracle and ready corpus stays on its full source', async () => {
  const { packet } = await expected('开心'), data = transport(url => { assert(!isPacket(url)); });
  assert.deepEqual(await pages(searchRelatedChineseDictionary, '开心', { ...data, useChineseQueryCache: false }), relatedPacket(packet));
  const count = data.requests.length; assert.deepEqual(await pages(searchRelatedChineseDictionary, '开心', data), relatedPacket(packet));
  assert.equal(data.requests.length, count); assert.equal(data.requests.filter(row => isRanking(row.url)).length, 1);
});
test('aborting one related caller cannot cancel a primary caller sharing its packet', async () => {
  const { packet, descriptor } = await expected('开心'), seen = deferred(), gate = deferred();
  const data = transport(async (url, opts) => { if (url.href === new URL(descriptor.file, ROOT).href) { seen.resolve(opts.signal); await gate.promise; } });
  const controller = new AbortController(), related = pages(searchRelatedChineseDictionary, '开心', { ...data, signal: controller.signal });
  const rejected = assert.rejects(related, { name: 'AbortError' }), sharedSignal = await seen.promise;
  const primary = pages(searchExpandedDictionary, '开心', data); controller.abort(); await rejected; assert.equal(sharedSignal.aborted, false);
  try { gate.resolve(); assert.deepEqual(await primary, { metadata: packet.metadata, results: packet.results }); } finally { gate.resolve(); }
});
test('corrupt packet plus unavailable source retains integrity failure for related lookup', async () => {
  const { descriptor } = await expected('人工客服'); const data = transport(url => {
    if (url.href === new URL(descriptor.file, ROOT).href) return new Response(new Uint8Array(descriptor.bytes));
    if (isRanking(url)) return new Response('unavailable', { status: 503 });
  });
  await assert.rejects(searchRelatedChineseDictionary('人工客服', data), { code: 'invalid_dictionary_data' });
  assert(data.requests.some(row => row.url === new URL(descriptor.file, ROOT).href)); assert(data.requests.some(row => isRanking(row.url)));
});
