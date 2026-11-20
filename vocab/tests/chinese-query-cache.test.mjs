import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeChineseQueryCacheQuery, chineseQueryCacheBucket } from '../js/chinese-query-cache-format.js';

const moduleURL = new URL('../js/chinese-query-cache.js', import.meta.url);
const root = new URL('../data/chinese-query-cache/', import.meta.url);
const source = await readFile(moduleURL, 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const dictionaryVersion = '1'.repeat(64), sourceManifestSha256 = '2'.repeat(64), engineBinding = '3'.repeat(64), buildVersion = '4'.repeat(64);
const manifest = { version: dictionaryVersion, integritySha256: sourceManifestSha256 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const live = [];
afterEach(() => { for (const mod of live.splice(0)) mod.resetChineseQueryPacketCacheForTests(); });
function dto(term = 'happy') {
  return { term, partOfSpeech: 'adjective', meaning: '① 开心的。', source: '原创学习释义', license: 'Original composition', url: 'https://zhuodashuai.github.io/vocab/',
    alternatives: [{ partOfSpeech: 'adjective', meaning: '① 愉快的。', source: 'ECDICT', license: 'MIT', url: 'https://github.com/skywind3000/ECDICT' }],
    matchType: 'related', matchedChinese: '快乐', matchedPartOfSpeech: 'adjective', matchedSense: '开心／愉快',
    matchedExampleSenseIds: ['example:happy'], matchedExampleSenseEvidence: [{ id: 'example:happy', partOfSpeech: 'adjective', meaningZh: '感到开心的。', examples: [{ en: 'We were happy with the result.', zh: '我们对结果感到满意。' }] }],
    matchedSourceEvidence: { kind: 'reviewed-canonical-primary', groupId: 'common-1', sourceId: 'reviewed:happy', canonicalId: 42,
      canonicalSourceSha256: 'a'.repeat(64), selectedSourceSha256: 'b'.repeat(64), selectedRowSha256: 'c'.repeat(64) } };
}
function sameBucketQueries(count = 2) {
  const queries = ['开心']; for (let i = 0; queries.length < count; i++) {
    const query = `学习${i}`; if (chineseQueryCacheBucket(query) === chineseQueryCacheBucket('开心')) queries.push(query);
  } return queries.sort();
}
function fixture({ queries = ['开心'], packet, bundle, bucket, release, descriptor: changeDescriptor } = {}) {
  queries = [...queries].sort(); const assets = new Map(), expected = new Map();
  const zip = payload => { const decoded = Buffer.from(JSON.stringify(payload)); const bytes = gzipSync(decoded, { mtime: 0 }); return { decoded, bytes, sha256: sha(bytes) }; };
  const entryGroups = Array.from({ length: 64 }, () => []);
  for (let index = 0; index < 64; index++) {
    const matches = queries.filter(query => chineseQueryCacheBucket(query) === index);
    for (let start = 0; start < matches.length; start += 16) {
      const subset = matches.slice(start, start + 16), packets = subset.map(query => {
        const value = { query, metadata: { query, total: 1, ranking: 'global', relatedIntegrated: true }, results: [dto()] };
        packet?.(value, query); expected.set(query, structuredClone(value)); return value;
      });
      const payload = { schemaVersion: 1, dictionaryVersion, engineBinding, packets }; bundle?.(payload);
      const zipped = zip(payload), file = `${buildVersion}/${zipped.sha256}.bin`;
      assets.set(new URL(file, root).href, zipped.bytes);
      for (const query of subset) {
        const entry = { query, file, sha256: zipped.sha256, bytes: zipped.bytes.length, uncompressedBytes: zipped.decoded.length, total: expected.get(query).metadata.total };
        changeDescriptor?.(entry); entryGroups[index].push(entry);
      }
    }
  }
  const buckets = entryGroups.map((entries, index) => {
    const value = { schemaVersion: 1, dictionaryVersion, engineBinding, bucket: index, entries }; bucket?.(value, index);
    const zipped = zip(value), file = `${buildVersion}/${zipped.sha256}.bin`; assets.set(new URL(file, root).href, zipped.bytes);
    return { bucket: index, file, sha256: zipped.sha256, bytes: zipped.bytes.length, uncompressedBytes: zipped.decoded.length };
  });
  const value = { schemaVersion: 1, dictionaryVersion, sourceManifestSha256, engineBinding, buildVersion, members: queries, buckets,
    selectionSources: [{ file: 'vocab/data/ecdict-core.json', sha256: '9'.repeat(64), bytes: 1963099, entries: 7502, license: 'MIT' }] }; release?.(value);
  return { release: value, assets, expected };
}
async function reader(fx) {
  const replacements = [
    ["import { CHINESE_QUERY_CACHE_RELEASE } from './chinese-query-cache-release.js?v=117';", `const CHINESE_QUERY_CACHE_RELEASE = Object.freeze(${JSON.stringify(fx.release)});`],
    ["'./chinese-query-cache-format.js?v=117'", JSON.stringify(new URL('../js/chinese-query-cache-format.js?v=117', import.meta.url).href)],
    ["new URL('../data/chinese-query-cache/', import.meta.url)", `new URL(${JSON.stringify(root.href)})`],
  ];
  let transformed = source;
  for (const [before, after] of replacements) { assert.equal(transformed.split(before).length - 1, 1); transformed = transformed.replace(before, after); }
  transformed += '\nexport { CHINESE_QUERY_CACHE_RELEASE as fixtureRelease };\n';
  const mod = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}#${Math.random()}`); live.push(mod); return mod;
}
function transport(fx, override) {
  const requests = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input); assert.equal(url.protocol, 'file:'); assert(url.href.startsWith(root.href));
    assert.match(url.href.slice(root.href.length), /^[a-f0-9]{64}\/[a-f0-9]{64}\.bin$/u);
    assert.equal(options.credentials, 'omit'); assert(!options.method || options.method === 'GET'); assert(!('body' in options));
    requests.push({ url: url.href, options });
    const changed = await override?.(url, options, requests.length); if (changed !== undefined) return changed;
    assert(fx.assets.has(url.href)); return new Response(fx.assets.get(url.href));
  }; return { fetchImpl, requests };
}
const options = data => ({ manifest, engineBinding, ...data });

test('normalization keeps complete intent, interior spaces and negation', () => {
  assert.equal(normalizeChineseQueryCacheQuery(' “开心！” '), '开心');
  assert.equal(normalizeChineseQueryCacheQuery('ＵＳＢ\t充电头'), 'usb 充电头');
  assert.equal(normalizeChineseQueryCacheQuery('开 心'), '开 心');
  assert.equal(normalizeChineseQueryCacheQuery('不开心'), '不开心');
  for (const query of ['happy', '', '<开心>', 'javascript:开心', '开\u202e心', '心'.repeat(51)]) assert.equal(normalizeChineseQueryCacheQuery(query), null);
});
test('complete result/source/alternatives/sense evidence round-trip, fresh DTOs and deeply frozen release', async () => {
  const fx = fixture(), mod = await reader(fx), data = transport(fx);
  const result = await mod.readChineseQueryPacket(' “开心！” ', options(data));
  assert.deepEqual(result, { metadata: fx.expected.get('开心').metadata, results: fx.expected.get('开心').results });
  assert(Object.isFrozen(mod.fixtureRelease.members)); assert(Object.isFrozen(mod.fixtureRelease.buckets[0]));
  assert.throws(() => { mod.fixtureRelease.buckets[0].sha256 = '0'.repeat(64); }, TypeError);
  result.results[0].alternatives[0].meaning = 'changed'; result.results[0].matchedExampleSenseEvidence[0].examples[0].zh = 'changed'; result.metadata.total = 100;
  assert.deepEqual(await mod.readChineseQueryPacket('开心', options(data)), { metadata: fx.expected.get('开心').metadata, results: fx.expected.get('开心').results });
  assert.equal(data.requests.length, 2); assert(!Object.hasOwn(result.results[0], 'id'));
});
test('unknown/English/unbound queries issue no cache-asset requests, including warmed same-version manifest changes', async () => {
  const fx = fixture(), mod = await reader(fx), data = transport(fx);
  for (const query of ['unknown', '未知词语', '开 心']) assert.equal(await mod.readChineseQueryPacket(query, options(data)), null);
  assert.equal(data.requests.length, 0); await mod.readChineseQueryPacket('开心', options(data)); const start = data.requests.length;
  for (const changed of [{ manifest: { ...manifest, integritySha256: 'f'.repeat(64) } }, { engineBinding: 'e'.repeat(64) }, { manifest: { ...manifest, version: 'd'.repeat(64) } }]) {
    assert.equal(await mod.readChineseQueryPacket('开心', options({ ...data, ...changed })), null);
  }
  assert.equal(data.requests.length, start);
});
for (const [name, mutate] of [
  ['wrong query', value => { value.query = '快乐'; }],
  ['wrong metadata query', value => { value.metadata.query = '快乐'; }],
  ['wrong total', value => { value.metadata.total = 2; }],
  ['duplicate head', value => { value.results.push(structuredClone(value.results[0])); value.metadata.total = 2; }],
  ['partial ranking', value => { value.metadata.ranking = 'limited'; }],
  ['partial coverage', value => { value.metadata.coverage = 'basic'; }],
  ['unapproved complete coverage label', value => { value.metadata.coverage = 'complete'; }],
  ['unapproved expanded coverage label', value => { value.metadata.coverage = 'expanded'; }],
  ['injected public authority', value => { value.results[0].trusted = true; }],
  ['unsafe source URL', value => { value.results[0].url = 'https://user:secret@example.test/'; }],
  ['unsafe lexical head', value => { value.results[0].term = '<script>'; }],
  ['inconsistent example IDs', value => { value.results[0].matchedExampleSenseIds = ['other']; }],
  ['malformed source evidence', value => { value.results[0].matchedSourceEvidence.selectedRowSha256 = 'unknown'; }],
]) test('authenticated but invalid packet is rejected: ' + name, async () => {
  const fx = fixture({ packet: mutate }), mod = await reader(fx), data = transport(fx);
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
for (const [name, mutate] of [
  ['wrong dictionary', value => { value.dictionaryVersion = 'f'.repeat(64); }],
  ['wrong engine', value => { value.engineBinding = 'f'.repeat(64); }],
  ['missing query', value => { value.packets = []; }],
  ['duplicate inner query', value => { value.packets.push(structuredClone(value.packets[0])); }],
  ['unrecognized envelope field', value => { value.query = '开心'; }],
]) test('invalid or swapped bundle is rejected: ' + name, async () => {
  const fx = fixture({ bundle: mutate }), mod = await reader(fx), data = transport(fx);
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
for (const [name, mutate] of [
  ['wrong bucket', (value, index) => { if (index === chineseQueryCacheBucket('开心')) value.bucket = (index + 1) % 64; }],
  ['wrong engine', value => { value.engineBinding = 'e'.repeat(64); }],
  ['duplicate membership row', (value, index) => { if (index === chineseQueryCacheBucket('开心')) value.entries.push(structuredClone(value.entries[0])); }],
  ['missing declared query', value => { value.entries = []; }],
  ['unsafe relative asset path', value => { if (value.entries.length) value.entries[0].file = '../elsewhere.bin'; }],
]) test('invalid authenticated bucket is rejected: ' + name, async () => {
  const fx = fixture({ bucket: mutate }), mod = await reader(fx), data = transport(fx);
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
test('two queries share one complete bundle, retain their own full DTOs, and do not select its first packet', async () => {
  const queries = sameBucketQueries(), fx = fixture({ queries, packet(value, query) { value.results[0].term = query === '开心' ? 'happy' : 'study'; } }), mod = await reader(fx), data = transport(fx);
  const first = await mod.readChineseQueryPacket(queries[1], options(data)); assert.equal(first.metadata.query, queries[1]);
  const second = await mod.readChineseQueryPacket(queries[0], options(data)); assert.equal(second.metadata.query, queries[0]);
  assert.notEqual(first.results[0].term, second.results[0].term); assert.equal(data.requests.length, 2);
});
test('a missing sibling inside an otherwise authentic bundle cannot grant partial results', async () => {
  const fx = fixture({ queries: sameBucketQueries(), bundle(value) { value.packets.pop(); } }), mod = await reader(fx), data = transport(fx);
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
test('an invalid sibling in a shared bundle rejects every query, rather than ignoring it', async () => {
  const queries = sameBucketQueries(), fx = fixture({ queries, packet(value, query) { if (query !== '开心') value.results[0].source = ''; } }), mod = await reader(fx), data = transport(fx);
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
for (const kind of ['corrupt', 'truncated', 'swapped', 'wrong header']) test('actual compressed bytes fail closed: ' + kind, async () => {
  const fx = fixture(), mod = await reader(fx), data = transport(fx, (url, _, count) => {
    if (count !== 2) return;
    let bytes = Buffer.from(fx.assets.get(url.href));
    if (kind === 'corrupt') bytes[0] ^= 1;
    if (kind === 'truncated') bytes = bytes.subarray(0, -1);
    if (kind === 'swapped') bytes = Buffer.from(fx.assets.get(data.requests[0].url));
    return new Response(bytes, kind === 'wrong header' ? { headers: { 'content-length': String(bytes.length + 1) } } : undefined);
  });
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
test('a hash-valid gzip exceeding the exact decoded bound is rejected while streaming', async () => {
  const fx = fixture({ descriptor(value) { value.uncompressedBytes -= 1; } }), mod = await reader(fx), data = transport(fx);
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
test('bounded decompression rejects a gzip bomb even with an authentic compressed hash', async () => {
  const fx = fixture({ packet(value) { value.results[0].meaning = '心'.repeat(100_000); }, descriptor(value) { value.uncompressedBytes = 1024; } }), mod = await reader(fx), data = transport(fx);
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
});
test('bucket body streaming truncation and streamed excess are rejected independently of Content-Length', async () => {
  for (const extra of [false, true]) {
    const fx = fixture(), mod = await reader(fx), data = transport(fx, (url, _, count) => {
      if (count !== 1) return; const bytes = fx.assets.get(url.href);
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(extra ? Buffer.concat([bytes, Buffer.from([0])]) : bytes.subarray(0, -1)); controller.close(); } }));
    });
    await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'invalid_dictionary_data' });
  }
});
test('one caller abort does not cancel another caller sharing the real bundle read', async () => {
  const gate = deferred(), seen = deferred(), fx = fixture({ queries: sameBucketQueries() }), mod = await reader(fx);
  const data = transport(fx, async (_, signalOptions, count) => { if (count === 2) { seen.resolve(signalOptions.signal); await gate.promise; } });
  const one = new AbortController(); const a = mod.readChineseQueryPacket('开心', options({ ...data, signal: one.signal })); const rejected = assert.rejects(a, { name: 'AbortError' });
  const sharedSignal = await seen.promise, otherQuery = fx.release.members.find(query => query !== '开心');
  const b = mod.readChineseQueryPacket(otherQuery, options(data)); one.abort(); await rejected; assert.equal(sharedSignal.aborted, false);
  gate.resolve(); assert.equal((await b).metadata.query, otherQuery); assert.equal(data.requests.length, 2);
});
test('caller timeout does not cancel shared healthy transport and subsequent caller can reuse it', async () => {
  const gate = deferred(), seen = deferred(), fx = fixture(), mod = await reader(fx), data = transport(fx, async (_, opts, count) => { if (count === 1) { seen.resolve(opts.signal); await gate.promise; } });
  const a = mod.readChineseQueryPacket('开心', options({ ...data, timeoutMs: 10 })); const rejected = assert.rejects(a, { code: 'dictionary_timeout' });
  const signal = await seen.promise; await rejected; assert.equal(signal.aborted, false);
  const b = mod.readChineseQueryPacket('开心', options(data)); gate.resolve(); assert.equal((await b).metadata.total, 1); assert.equal(data.requests.length, 2);
});
test('network failure is tagged, retry requests reload and a later healthy result is complete', async () => {
  const fx = fixture(), mod = await reader(fx), data = transport(fx, (_, __, count) => { if (count === 1) throw new TypeError('offline'); });
  await assert.rejects(mod.readChineseQueryPacket('开心', options(data)), { code: 'dictionary_network' });
  const result = await mod.readChineseQueryPacket('开心', options(data)); assert.equal(result.metadata.total, 1); assert.equal(data.requests[1].options.cache, 'reload');
});
test('reset aborts outstanding work, prevents stale completion and permits a fresh read', async () => {
  const gate = deferred(), seen = deferred(), fx = fixture(), mod = await reader(fx), data = transport(fx, async (_, opts, count) => { if (count === 1) { seen.resolve(opts.signal); await gate.promise; } });
  const old = mod.readChineseQueryPacket('开心', options(data)); const rejected = assert.rejects(old, { name: 'AbortError' }); const signal = await seen.promise;
  mod.resetChineseQueryPacketCacheForTests(); await rejected; assert.equal(signal.aborted, true); gate.resolve(); await delay(1);
  assert.equal((await mod.readChineseQueryPacket('开心', options(data))).metadata.total, 1); assert.equal(data.requests.length, 3);
});
test('already aborted caller causes zero static requests', async () => {
  const fx = fixture(), mod = await reader(fx), data = transport(fx), controller = new AbortController(); controller.abort();
  await assert.rejects(mod.readChineseQueryPacket('开心', options({ ...data, signal: controller.signal })), { name: 'AbortError' }); assert.equal(data.requests.length, 0);
});
test('native Fetch HTTP outer compression preserves exact inner asset verification', async () => {
  const fx = fixture(), mod = await reader(fx), requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url); assert.equal(request.headers.cookie, undefined);
    const bytes = fx.assets.get(new URL(request.url.slice(1), root).href); assert(bytes);
    const encoded = gzipSync(bytes); response.writeHead(200, { 'content-encoding': 'gzip', 'content-length': encoded.length }); response.end(encoded);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const fetchImpl = (url, opts) => { assert.equal(opts.credentials, 'omit'); return fetch(`http://127.0.0.1:${server.address().port}/${new URL(url).href.slice(root.href.length)}`, opts); };
    assert.equal((await mod.readChineseQueryPacket('开心', options({ fetchImpl }))).metadata.total, 1); assert.equal(requests.length, 2);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('transport timeout cancels a genuinely stalled streaming body and permits a fresh retry', async () => {
  const fx = fixture(), mod = await reader(fx); let canceled = false;
  const data = transport(fx, (url, _, count) => {
    if (count !== 1) return;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(fx.assets.get(url.href).subarray(0, 1)); }, cancel() { canceled = true; } }));
  });
  await assert.rejects(mod.readChineseQueryPacket('开心', options({ ...data, timeoutMs: 20_000 })), { code: 'dictionary_timeout' });
  assert.equal(canceled, true);
  assert.equal((await mod.readChineseQueryPacket('开心', options(data))).metadata.total, 1);
  assert.equal(data.requests[1].options.cache, 'reload');
});
test('bounded LRU evicts old bundles and still returns a complete fresh packet', async () => {
  const distinctBuckets = new Map();
  for (let index = 0; distinctBuckets.size < 64; index++) {
    const query = `词语${index}`, bucket = chineseQueryCacheBucket(query); if (!distinctBuckets.has(bucket)) distinctBuckets.set(bucket, query);
  }
  const queries = [...distinctBuckets.values()], fx = fixture({ queries }), mod = await reader(fx), data = transport(fx);
  for (const query of queries) assert.equal((await mod.readChineseQueryPacket(query, options(data))).metadata.query, query);
  const before = data.requests.length; const result = await mod.readChineseQueryPacket(queries[0], options(data));
  assert.equal(result.metadata.total, 1); assert(data.requests.length > before, 'An old entry must be evicted rather than retaining all assets without a bound.');
});
