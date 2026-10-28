import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CANONICAL_REPAIR_KIND as KIND, canonicalRepairBucket, canonicalRepairDisplayContexts,
  canonicalRepairSourceHash as semantic, compileCanonicalRepairPack, serializeCanonicalRepairs,
  authenticateCanonicalRepairRecord, canonicalRepairSnapshot, validateCanonicalRepairIndex } from '../scripts/build-canonical-example-repairs.mjs';
import { exampleSourceHash } from '../scripts/build-dictionary-examples.mjs';

const clone = value => structuredClone(value), hash = value => createHash('sha256').update(value).digest('hex');
const reviewFor = pack => ({ schemaVersion: 1, sourceSha256: semantic(pack), reviewer: 'AI/fixture-reader', independentOfAuthor: true,
  decisions: pack.entries.map(row => ({ term: row.term, rowSha256: semantic(row), decision: 'approve-canonical-example-repair' })), issues: [] });
function fixture(heads = [{ term: 'hubble', partOfSpeech: 'noun', meaning: 'n. 合成测试凸起' }]) {
  const version = 'a'.repeat(64), descriptor = { name: 'Synthetic source', license: 'MIT', url: 'https://example.invalid/source', sha256: 'b'.repeat(64) };
  const shards = new Map(), canonical = new Map(), entries = new Map();
  const source = { schemaVersion: 1, batchId: 'batch-0000-fixture', authorship: 'independent-composition', author: 'AI/fixture-legacy', entries: [] };
  const pack = { schemaVersion: 1, kind: KIND, author: 'AI/fixture-author', entries: [] };
  for (const [index, head] of heads.entries()) {
    const bucket = canonicalRepairBucket(head.term), record = { id: 1280 + bucket + index * 128, ...head, forms: [], source: 'mit', seed: { rank: index + 1, forms: [], workbook: false } };
    canonical.set(head.term, record);
    const shard = shards.get(bucket) ?? { schemaVersion: 2, kind: 'en', bucket, records: [], keys: [] };
    shard.records.push(clone(record)); shard.keys.push([head.term, [{ id: record.id, kind: 'canonical' }]]); shards.set(bucket, shard);
    const retired = { term: head.term, partOfSpeech: 'proper noun', meaningZh: '原有合成测试专名', en: `The old fixture has a separate ${head.term} title.`, zh: '旧合成数据使用一个独立的专名。' };
    source.entries.push(retired);
    const old = { term: head.term, senses: [{ id: `example:${head.term}`, partOfSpeech: retired.partOfSpeech, meaningZh: retired.meaningZh,
      examples: [{ en: retired.en, zh: retired.zh }], source: 'Synthetic old source', reviewer: 'AI/fixture-legacy' }] };
    entries.set(head.term, old);
    const replacement = { term: head.term, partOfSpeech: head.partOfSpeech, meaningZh: head.meaning,
      en: `The new ${head.term} fixture has one reserved sentence.`, zh: '新的合成测试数据有一条例句。' };
    pack.entries.push({ kind: KIND, term: head.term, canonicalManifestSha256: '0'.repeat(64), canonicalId: record.id,
      canonicalSourceSha256: semantic(record), exactCanonicalRecord: clone(record), canonicalSourceDescriptor: clone(descriptor),
      origin: { file: 'batch-0000-fixture.json', sourceSha256: '0'.repeat(64), index }, expectedOriginalEntry: clone(old),
      expectedOriginalEntrySha256: semantic(old), retiredOriginalPair: clone(retired), retiredOriginalPairSha256: semantic(retired),
      acceptedDisplayContexts: canonicalRepairDisplayContexts(record), replacementPair: replacement, replacementPairSha256: semantic(replacement), references: ['https://example.invalid/evidence'] });
  }
  const manifest = { schemaVersion: 2, version, sources: { mit: descriptor }, english: { buckets: 128,
    shards: Array.from({ length: 128 }, (_, bucket) => ({ bucket, file: `${version}/en-${String(bucket).padStart(3, '0')}.json`, bytes: 1, sha256: '0'.repeat(64), count: 0 })) } };
  const assets = new Map(), requests = [];
  const deps = { releasePins: { version, manifestSha256: '' }, reservedEnglish: new Set(), occupiedHeads: new Set(),
    readPublicAsset: async path => { requests.push(path); return assets.get(path); }, readOriginalSource: async () => clone(source), loadOriginalEntry: async term => clone(entries.get(term)) };
  const f = { pack, manifest, shards, canonical, entries, source, assets, requests, deps };
  f.repin = () => {
    for (const [bucket, shard] of shards) {
      const bytes = Buffer.from(JSON.stringify(shard)), item = manifest.english.shards[bucket];
      Object.assign(item, { sha256: hash(bytes), bytes: bytes.length, count: shard.keys.length });
      assets.set(`expanded-dictionary/${item.file}`, bytes);
    }
    const bytes = Buffer.from(JSON.stringify(manifest)); assets.set('expanded-dictionary/manifest.json', bytes);
    deps.releasePins.manifestSha256 = hash(bytes);
    for (const row of pack.entries) { row.canonicalManifestSha256 = deps.releasePins.manifestSha256; row.origin.sourceSha256 = exampleSourceHash(source); }
    f.review = reviewFor(pack);
  };
  f.repin(); return f;
}
const compile = f => compileCanonicalRepairPack(f.pack, f.review, f.deps);
function resign(f) { f.review = reviewFor(f.pack); }

test('exact independent canonical example repair preserves full origin and uses a new ID', async () => {
  const f = fixture(), before = JSON.stringify({ pack: f.pack, source: f.source, entries: [...f.entries] });
  const rows = await compile(f), row = rows[0];
  assert.equal(row.term, 'hubble'); assert.deepEqual(row.exactCanonicalRecord, f.canonical.get('hubble'));
  assert.deepEqual(row.expectedOriginalEntry, f.entries.get('hubble'));
  assert.equal(row.replacementPair.meaningZh, f.canonical.get('hubble').meaning);
  assert.equal(row.senseId, `canonical-example:${row.canonicalId}:${row.canonicalSourceSha256}`);
  assert.notEqual(row.senseId, row.expectedOriginalEntry.senses[0].id);
  assert.ok(Object.isFrozen(rows)); assert.ok(Object.isFrozen(row.exactCanonicalRecord.seed)); assert.ok(Object.isFrozen(row.expectedOriginalEntry.senses[0].examples[0]));
  assert.equal(JSON.stringify({ pack: f.pack, source: f.source, entries: [...f.entries] }), before);
  assert.deepEqual(f.requests, ['expanded-dictionary/manifest.json', `expanded-dictionary/${f.manifest.english.shards[canonicalRepairBucket('hubble')].file}`]);
});
test('general explicit adjective heads use actual formatter without guessing or stripping existing numbering', async () => {
  const f = fixture([{ term: 'testable', partOfSpeech: 'adjective', meaning: '① 可检验的' }]);
  Object.assign(f.pack.entries[0].replacementPair, { en: 'The researchers turned the idea into a testable claim.', zh: '研究人员把这个想法转化为可检验的主张。' });
  f.pack.entries[0].replacementPairSha256 = semantic(f.pack.entries[0].replacementPair); resign(f);
  const [row] = await compile(f); assert.equal(row.replacementPair.partOfSpeech, 'adjective');
  assert.deepEqual(row.acceptedDisplayContexts, canonicalRepairDisplayContexts(f.canonical.get('testable')));
  assert.equal(row.acceptedDisplayContexts[0].meaning, '① 可检验的');
  assert.equal(row.acceptedDisplayContexts.length, 1);
  assert.equal(new Set(row.acceptedDisplayContexts.map(JSON.stringify)).size, row.acceptedDisplayContexts.length);
});
test('deterministic module output recursively freezes compiled data and excludes offline evidence', async () => {
  const f = fixture(), rows = await compile(f), table = { schemaVersion: 1, kind: KIND, pins: f.deps.releasePins, rows };
  const source = serializeCanonicalRepairs(table); assert.equal(source, serializeCanonicalRepairs(table));
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.deepEqual(module.CANONICAL_EXAMPLE_REPAIRS, table);
  assert.ok(Object.isFrozen(module.CANONICAL_EXAMPLE_REPAIRS.rows[0].replacementPair));
  for (const field of ['origin', 'references', 'retiredOriginalPair', 'retiredOriginalPairSha256', 'canonicalManifestSha256']) assert.equal(Object.hasOwn(rows[0], field), false);
});

test('serializer refuses an oversized cross-batch table before emitting an unloadable runtime module', async () => {
  const f = fixture(), [row] = await compile(f);
  // Capacity is independent of source admission: individual packs are bounded
  // to 100 heads, but an index can combine multiple approved packs.
  const table = { schemaVersion: 1, kind: KIND, pins: f.deps.releasePins,
    rows: Array.from({ length: 129 }, () => row) };
  assert.throws(() => serializeCanonicalRepairs(table), /runtime table capacity/);
  table.rows.pop();
  assert.doesNotThrow(() => serializeCanonicalRepairs(table));
  assert.throws(() => serializeCanonicalRepairs({ ...table, rows: {} }), /runtime table capacity/);
});

test('B1: mutually consistent different-head source/pair/entry hashes cannot rebind literal head', async () => {
  const f = fixture(), row = f.pack.entries[0];
  row.retiredOriginalPair.term = 'different-head'; row.expectedOriginalEntry.term = 'different-head';
  f.source.entries[0].term = 'different-head'; f.entries.get('hubble').term = 'different-head';
  row.retiredOriginalPairSha256 = semantic(row.retiredOriginalPair); row.expectedOriginalEntrySha256 = semantic(row.expectedOriginalEntry);
  row.origin.sourceSha256 = exampleSourceHash(f.source); resign(f);
  await assert.rejects(compile(f), /origin\/head chain/);
});
for (const [name, patch] of [['B2: numeric-only English', { en: '123456' }], ['B3: English-only Chinese', { zh: 'This is not a Chinese translation.' }]]) {
  test(name, async () => { const f = fixture(), row = f.pack.entries[0]; Object.assign(row.replacementPair, patch); row.replacementPairSha256 = semantic(row.replacementPair); resign(f); await assert.rejects(compile(f), /languages/); });
}
test('B4: NFKC-equivalent fullwidth canonical owner fails despite new pinned bytes and approval', async () => {
  const f = fixture(), shard = f.shards.get(canonicalRepairBucket('hubble'));
  shard.records.push({ ...clone(shard.records[0]), term: 'ｈｕｂｂｌｅ', id: shard.records[0].id + 128 }); f.repin();
  await assert.rejects(compile(f), /NFKC canonical owner/);
});
for (const [name, mutate] of [
  ['canonical ID', row => row.canonicalId++], ['canonical POS', row => row.exactCanonicalRecord.partOfSpeech = 'verb'],
  ['canonical meaning', row => row.exactCanonicalRecord.meaning += '；改动'], ['canonical forms', row => row.exactCanonicalRecord.forms.push('hubbles')],
  ['canonical seed', row => row.exactCanonicalRecord.seed.rank++], ['canonical variants', row => row.exactCanonicalRecord.variants = []],
  ['canonical source', row => row.exactCanonicalRecord.source = 'unknown'], ['source descriptor', row => row.canonicalSourceDescriptor.license = 'wrong'],
  ['manifest hash', row => row.canonicalManifestSha256 = 'b'.repeat(64)], ['canonical hash', row => row.canonicalSourceSha256 = 'b'.repeat(64)],
  ['entry hash', row => row.expectedOriginalEntrySha256 = 'b'.repeat(64)], ['extra old sense', row => row.expectedOriginalEntry.senses.push(clone(row.expectedOriginalEntry.senses[0]))],
  ['extra old pair', row => row.expectedOriginalEntry.senses[0].examples.push({ en: 'Extra sentence.', zh: '额外例句。' })], ['old sense ID', row => row.expectedOriginalEntry.senses[0].id += '-new'],
  ['old pair', row => row.retiredOriginalPair.zh = '改动'], ['old pair hash', row => row.retiredOriginalPairSha256 = 'b'.repeat(64)],
  ['origin index', row => row.origin.index++], ['origin source hash', row => row.origin.sourceSha256 = 'b'.repeat(64)],
  ['origin path traversal', row => row.origin.file = '../batch-0000-fixture.json'], ['array-coerced origin file', row => row.origin.file = ['batch-0000-fixture.json']], ['replacement POS', row => row.replacementPair.partOfSpeech = 'verb'],
  ['replacement meaning', row => row.replacementPair.meaningZh = '另一个意思'], ['replacement head', row => row.replacementPair.term = 'Hubble'],
  ['replacement hash', row => row.replacementPairSha256 = 'b'.repeat(64)], ['invented formatted context', row => row.acceptedDisplayContexts[1].meaning = '② 合成测试凸起'],
  ['unknown key', row => row.approved = true], ['non-HTTPS reference', row => row.references = ['http://example.invalid']], ['duplicate references', row => row.references.push(row.references[0])]
]) test(`fresh synthetic approval cannot bypass ${name}`, async () => {
  const f = fixture(); mutate(f.pack.entries[0]); resign(f); await assert.rejects(compile(f));
});
for (const [name, mutate] of [
  ['self review', (r, f) => r.reviewer = f.pack.author], ['case-equivalent self review', (r, f) => r.reviewer = f.pack.author.toUpperCase()],
  ['stale pack digest', r => r.sourceSha256 = 'b'.repeat(64)], ['stale row digest', r => r.decisions[0].rowSha256 = 'b'.repeat(64)],
  ['false independence', r => r.independentOfAuthor = false], ['unknown review flag', r => r.mode = 'author-selfcheck'],
  ['unresolved issue', r => r.issues.push({ term: 'hubble', blocking: true })], ['missing decision', r => r.decisions = []],
  ['duplicate decision', r => r.decisions.push(clone(r.decisions[0]))], ['wrong decision', r => r.decisions[0].decision = 'approve-new-row']
]) test(`reject ${name}`, async () => { const f = fixture(); mutate(f.review, f); await assert.rejects(compile(f)); });
test('duplicate heads, NFKC/case competing routes and normalized English collisions reject', async () => {
  const f = fixture(); f.pack.entries.push(clone(f.pack.entries[0])); resign(f); await assert.rejects(compile(f));
  for (const head of ['Hubble', 'ｈｕｂｂｌｅ']) { const g = fixture(); g.deps.occupiedHeads.add(head); await assert.rejects(compile(g), /competing head/); }
  const h = fixture(); h.deps.reservedEnglish.add(h.pack.entries[0].replacementPair.en.toUpperCase()); await assert.rejects(compile(h), /duplicate active English/);
  const i = fixture(); delete i.deps.reservedEnglish; await assert.rejects(compile(i), /inventories/);
});
test('a multi-head pack needs an independent exact decision for every row and rejects sentence reuse across its own rows', async () => {
  const f = fixture([{ term: 'hubble', partOfSpeech: 'noun', meaning: 'n. 合成凸起' }, { term: 'testable', partOfSpeech: 'adjective', meaning: 'a. 可检验的' }]);
  assert.equal((await compile(f)).length, 2);
  f.pack.entries[1].replacementPair.en = f.pack.entries[0].replacementPair.en;
  f.pack.entries[1].replacementPairSha256 = semantic(f.pack.entries[1].replacementPair); resign(f);
  await assert.rejects(compile(f), /duplicate active English/);
});
for (const [name, change] of [
  ['wrong shard bytes', f => f.assets.set(f.requests[1] ?? `expanded-dictionary/${f.manifest.english.shards[canonicalRepairBucket('hubble')].file}`, Buffer.from('{}'))],
  ['manifest changed', f => f.assets.set('expanded-dictionary/manifest.json', Buffer.from('{}'))],
  ['key is a form', f => { f.shards.get(canonicalRepairBucket('hubble')).keys[0][1][0].kind = 'form'; f.repin(); }],
  ['wrong key ID', f => { f.shards.get(canonicalRepairBucket('hubble')).keys[0][1][0].id++; f.repin(); }],
  ['duplicate literal owner', f => { const s = f.shards.get(canonicalRepairBucket('hubble')); s.records.push(clone(s.records[0])); f.repin(); }],
  ['duplicate canonical key', f => { const s = f.shards.get(canonicalRepairBucket('hubble')); s.keys.push(clone(s.keys[0])); f.repin(); }],
  ['wrong version', f => { f.manifest.version = 'b'.repeat(64); f.repin(); }],
  ['foreign path', f => { f.manifest.english.shards[canonicalRepairBucket('hubble')].file = 'https://example.invalid/data'; f.repin(); }],
  ['unknown source descriptor', f => { delete f.manifest.sources.mit; f.repin(); }]
]) test(`canonical proof rejects ${name}`, async () => { const f = fixture(); change(f); await assert.rejects(compile(f)); });
test('ID modulo bucket remains necessary even for a mutually rehashed canonical record/key pair', async () => {
  const f = fixture(), row = f.pack.entries[0], s = f.shards.get(canonicalRepairBucket('hubble'));
  row.canonicalId++; row.exactCanonicalRecord.id++; row.canonicalSourceSha256 = semantic(row.exactCanonicalRecord);
  s.records[0].id++; s.keys[0][1][0].id++; f.repin(); await assert.rejects(compile(f), /canonical ID/);
});
test('JSON snapshots reject getters without invocation, facades, hidden/symbol fields and sparse arrays', () => {
  let reads = 0; const getter = {}; Object.defineProperty(getter, 'x', { enumerable: true, get() { reads++; return 1; } });
  const hidden = {}; Object.defineProperty(hidden, 'x', { value: 1 });
  for (const value of [getter, hidden, { [Symbol('x')]: 1 }, new Array(2), { toJSON() { reads++; } }, Object.create({ x: 1 }), { x: '\u0000' }]) assert.throws(() => canonicalRepairSnapshot(value));
  assert.equal(reads, 0);
});
test('async source/review mutation and mutated complete old DTO reject without input mutation by builder', async () => {
  const f = fixture(), prior = f.deps.readPublicAsset;
  f.deps.readPublicAsset = async path => { f.review.reviewer = 'AI/changed'; return prior(path); };
  await assert.rejects(compile(f), /mutation/);
  const g = fixture(); g.deps.loadOriginalEntry = async () => { const entry = clone(g.entries.get('hubble')); entry.senses.push(clone(entry.senses[0])); return entry; };
  await assert.rejects(compile(g), /old sense/);
});
test('independent raw proof cannot substitute a new source release or missing reader', async () => {
  const f = fixture();
  await assert.rejects(authenticateCanonicalRepairRecord(f.pack.entries[0], { ...f.deps.releasePins, manifestSha256: 'b'.repeat(64) }, f.deps));
  await assert.rejects(authenticateCanonicalRepairRecord(f.pack.entries[0], f.deps.releasePins, {}));
});
test('index binds exact current release and unique safe source/review paths', () => {
  const f = fixture(), index = { schemaVersion: 1, kind: KIND, pins: f.deps.releasePins,
    batches: [{ sourceFile: 'quality-0001.json', reviewFile: 'quality-0001.json' }] };
  assert.deepEqual(validateCanonicalRepairIndex(index, f.deps.releasePins), index);
  for (const mutate of [value => value.pins.manifestSha256 = 'c'.repeat(64), value => value.kind = 'ordinary-correction',
    value => value.approved = true, value => value.batches.push(clone(value.batches[0])),
    value => value.batches[0].sourceFile = '../quality-0001.json', value => value.batches[0].reviewFile = 'https://example.invalid/review.json']) {
    const next = clone(index); mutate(next); assert.throws(() => validateCanonicalRepairIndex(next, f.deps.releasePins));
  }
});
test('mutating original source while awaiting the authenticated complete DTO fails closed', async () => {
  const f = fixture(), source = clone(f.source);
  f.deps.readOriginalSource = async () => source;
  f.deps.loadOriginalEntry = async term => { source.entries[0].zh = '在下一次 await 期间改动'; return clone(f.entries.get(term)); };
  await assert.rejects(compile(f), /original source mutation/);
});
function additionalPair(f) {
  return { ...f.pack.entries[0].replacementPair, en: 'A second original sentence illustrates the other matched component.', zh: '第二条原创例句说明另一个已匹配的含义部分。' };
}
test('independently approved additional matched pairs preserve one canonical identity and compile fresh EN/ZH only', async () => {
  const f = fixture(), row = f.pack.entries[0]; row.additionalMatchedPairs = [additionalPair(f)]; resign(f);
  const [result] = await compile(f);
  assert.deepEqual(result.additionalExamples, [{ en: row.additionalMatchedPairs[0].en, zh: row.additionalMatchedPairs[0].zh }]);
  assert.ok(Object.isFrozen(result.additionalExamples)); assert.ok(Object.isFrozen(result.additionalExamples[0]));
  assert.equal(Object.hasOwn((await compile(fixture()))[0], 'additionalExamples'), false);
});
for (const [name, mutate] of [['term', pair => pair.term = 'different-head'], ['POS', pair => pair.partOfSpeech = 'verb'],
  ['full Chinese meaning', pair => pair.meaningZh = '另一个未匹配的含义'], ['English language', pair => pair.en = '123456'],
  ['Chinese language', pair => pair.zh = 'Untranslated English only.'], ['unknown field', pair => pair.approved = true]]) {
  test(`additional pair rejects changed ${name} even with new complete-row approval`, async () => {
    const f = fixture(), row = f.pack.entries[0]; row.additionalMatchedPairs = [additionalPair(f)]; mutate(row.additionalMatchedPairs[0]); resign(f);
    await assert.rejects(compile(f));
  });
}
test('additional pair requires exact reviewed row hash, bounded list and normalized sentence deduplication', async () => {
  const f = fixture(); f.pack.entries[0].additionalMatchedPairs = [additionalPair(f)];
  await assert.rejects(compile(f), /approval/);
  for (const values of [[], Array.from({ length: 8 }, () => additionalPair(f))]) {
    const g = fixture(); g.pack.entries[0].additionalMatchedPairs = values; resign(g); await assert.rejects(compile(g), /additional pairs/);
  }
  const g = fixture(); g.pack.entries[0].additionalMatchedPairs = [{ ...additionalPair(g), en: g.pack.entries[0].replacementPair.en.toUpperCase() }]; resign(g);
  await assert.rejects(compile(g), /duplicate active English/);
  const h = fixture(), duplicate = additionalPair(h); h.pack.entries[0].additionalMatchedPairs = [duplicate, clone(duplicate)]; resign(h);
  await assert.rejects(compile(h), /duplicate active English/);
  const i = fixture(); i.pack.entries[0].additionalMatchedPairs = [additionalPair(i)]; resign(i); i.deps.reservedEnglish.add(additionalPair(i).en.toUpperCase());
  await assert.rejects(compile(i), /duplicate active English/);
});
test('Unicode casefold lookalikes cannot create a second author/reviewer principal', async () => {
  const f = fixture(); f.pack.author = 'AI/tester'; resign(f); f.review.reviewer = 'AI/teſter';
  await assert.rejects(compile(f), /principal/);
});
