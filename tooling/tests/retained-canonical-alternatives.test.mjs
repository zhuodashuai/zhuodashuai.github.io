import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { validateRetainedCanonicalAlternatives, retainedCanonicalDisplay, readRetainedAlternativesPolicy,
  renderReviewedSenseModule, PRE_RETENTION_HEADS_SHA256, legacyChineseRetentionHeads,
  validateReviewedSensePack, reviewedSensePackHash } from '../scripts/build-reviewed-dictionary-senses.mjs';
import { personalDictionaryResult } from '../../vocab/js/personal-dictionary.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sources = {
  core: { name: 'ECDICT · 已上线核心整理', license: 'MIT and project editorial additions', url: 'https://github.com/skywind3000/ECDICT' },
  mit: { name: 'ECDICT', license: 'MIT', url: 'https://github.com/skywind3000/ECDICT' },
};
function fixture(term = 'VAT') {
  const canonical = { term, id: 90001, partOfSpeech: 'noun · verb', meaning: 'n. 大桶\nvt. 装入大桶', source: 'core',
    forms: ['vats'], variants: [{ partOfSpeech: 'noun · verb', meaning: 'n. 大桶\nvt. 装入大桶', source: 'mit' }] };
  const row = { term, partOfSpeech: 'abbreviation', meaning: '① 增值税。', chineseAliases: ['增值税'], englishForms: [],
    en: 'The quotation excludes VAT.', zh: '该报价不含增值税。', references: ['https://example.org/tax'],
    canonicalId: canonical.id, canonicalSourceSha256: digest(canonical) };
  const entry = { term, canonicalSourceSha256: digest(canonical), selectedRowSha256: digest(row), author: 'AI/test-author',
    reviewer: 'AI/test-independent-reader', independentOfAuthor: true,
    alternatives: [{ partOfSpeech: canonical.partOfSpeech, meaning: canonical.meaning, source: canonical.source }],
    reason: 'Fixture: the complete old vessel tuple remains a separate meaning.', references: ['https://example.org/vessel'] };
  return { canonical, row, entry, policy: { schemaVersion: 1, entries: [entry] },
    selections: new Map([[term, { author: entry.author, row }]]), records: new Map([[term, canonical]]) };
}
const validate = f => validateRetainedCanonicalAlternatives(f.policy, f.selections, f.records, sources);

test('retention binds complete raw tuple then uses the same licensed display formatter without changing source metadata', () => {
  const f = fixture(), before = JSON.stringify(f);
  const alternative = validate(f).get('VAT')[0];
  const formatted = personalDictionaryResult({ word: 'VAT', partOfSpeech: f.canonical.partOfSpeech, meaning: f.canonical.meaning });
  assert.deepEqual(alternative, { partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning,
    source: sources.core.name, license: sources.core.license, url: sources.core.url });
  assert.notEqual(alternative.meaning, f.canonical.meaning, 'The actual compact licensed gloss is formatted');
  assert.equal(JSON.stringify(f), before);
  assert.deepEqual(Object.keys(alternative), ['partOfSpeech','meaning','source','license','url']);
});

test('source IDs remain distinct and already numbered definitions are preserved exactly', () => {
  const f = fixture(); f.entry.alternatives.push({ ...f.canonical.variants[0] });
  const alternatives = validate(f).get('VAT');
  assert.deepEqual(alternatives.map(row => row.source), [sources.core.name, sources.mit.name]);
  assert.deepEqual(alternatives.map(row => row.license), [sources.core.license, sources.mit.license]);
  const numbered = { partOfSpeech: 'noun', meaning: '① 一个编号义项。', source: 'mit' };
  assert.equal(retainedCanonicalDisplay(f.canonical, numbered, sources.mit).meaning, numbered.meaning);
});

test('unknown heads, wrong canonical/new-row hashes, fake authors and self approval cannot retain a meaning', () => {
  for (const change of [
    e => e.term = 'not-approved', e => e.term = 'vat',
    e => e.canonicalSourceSha256 = 'a'.repeat(64), e => e.selectedRowSha256 = 'b'.repeat(64),
    e => e.author = 'AI/different-author', e => e.reviewer = e.author,
    e => e.independentOfAuthor = false, e => e.reviewer = 'human-looking-unbound-name',
  ]) { const f = fixture(); change(f.entry); assert.throws(() => validate(f)); }
  const f = fixture(); f.selections.get('VAT').row.meaning += ' changed'; assert.throws(() => validate(f));
});

test('partly pruned glosses, empty POS, unlisted source IDs and extra provenance substitutions fail closed', () => {
  for (const change of [
    a => a.meaning = '大桶', a => a.partOfSpeech = '', a => a.partOfSpeech = 'noun',
    a => a.source = 'unknown', a => a.license = 'Public domain', a => a.url = 'https://example.org/substitute',
  ]) { const f = fixture(); change(f.entry.alternatives[0]); assert.throws(() => validate(f)); }
  const f = fixture(); delete f.entry.reason; assert.throws(() => validate(f));
  for (const refs of [[], ['http://example.org'], ['https://example.org','https://example.org'], ['javascript:alert(1)']]) {
    const p = fixture(); p.entry.references = refs; assert.throws(() => validate(p));
  }
  for (const note of ['', null, undefined, 3, 'Unapproved English-only note', '汉'.repeat(401)]) {
    const p = fixture(); p.entry.usageNote = note; assert.throws(() => validate(p));
  }
});

test('duplicate policy heads and duplicate raw tuples with reordered JSON keys are rejected', () => {
  const f = fixture(); f.policy.entries.push(structuredClone(f.entry)); assert.throws(() => validate(f));
  const g = fixture(), old = g.entry.alternatives[0];
  g.entry.alternatives.push({ source: old.source, meaning: old.meaning, partOfSpeech: old.partOfSpeech });
  assert.throws(() => validate(g));
  const h = fixture(); h.policy.extraApproval = true; assert.throws(() => validate(h));
});

test('fixed pre-retention head authority stays exactly the original31 and cannot grow on later rebuilds', async () => {
  const packs = await Promise.all(['0001','0002'].map(async id => JSON.parse(await readFile(
    new URL(`../dictionary/reviewed-senses/source/batch-${id}.json`, import.meta.url), 'utf8'))));
  const heads = packs.flatMap(pack => pack.entries.map(row => row.term)).sort();
  assert.equal(heads.length, 31); assert.equal(digest(heads), PRE_RETENTION_HEADS_SHA256);
  for (const head of heads) assert.throws(() => validate(fixture(head)), /Missing independent exact retained-alternative approval/u);
  assert(validate(fixture('future-new-head')).has('future-new-head'));
});

test('the legacy Chinese compatibility list cannot bypass exact new-head policies at the load boundary or direct pack validation', () => {
  assert.deepEqual([...legacyChineseRetentionHeads({})], []);
  assert.deepEqual([...legacyChineseRetentionHeads({ retainLegacyChineseHeads: ['bin liner'] })], ['bin liner']);
  for (const values of [['BOT'], ['bin liner','BOT'], ['bin liner','bin liner'], ['Bin liner'], 'bin liner', null, undefined]) {
    assert.throws(() => legacyChineseRetentionHeads({ retainLegacyChineseHeads: values }), /exact retained-alternative policy/u);
  }
  for (const term of ['BOT','bin liner']) {
    const f = fixture(term), pack = { schemaVersion: 1, author: f.entry.author, entries: [f.row] };
    const review = { schemaVersion: 1, sourceSha256: reviewedSensePackHash(pack), reviewer: f.entry.reviewer,
      independentOfAuthor: true, approvedTerms: [term], issues: [] };
    if (term === 'BOT') {
      assert.throws(() => validateReviewedSensePack(pack, review, f.records, new Map(), new Set(['BOT'])), /exact retained-alternative policy/u);
      const ordinary = validateReviewedSensePack(pack, review, f.records);
      assert.equal(ordinary[0].retainLegacyChinese, false);
    } else {
      const compatible = validateReviewedSensePack(pack, review, f.records, new Map(), new Set(['bin liner']));
      assert.equal(compatible[0].retainLegacyChinese, true);
    }
    assert.throws(() => validateReviewedSensePack(pack, review, f.records, new Map(), ['bin liner']), /exact retained-alternative policy/u);
  }
});

test('a declared policy file is mandatory and invalid paths cannot silently fall back to the legacy empty policy', async () => {
  const prefix = resolve(join(tmpdir(), 'retained-alternative-policy-'));
  const dir = await mkdtemp(prefix);
  try {
    assert.equal(await readRetainedAlternativesPolicy({}, dir), undefined);
    await assert.rejects(readRetainedAlternativesPolicy({ retainedAlternativesPolicy: 'retained-alternatives.json' }, dir), { code: 'ENOENT' });
    for (const name of ['../outside.json','/tmp/anything.json','',null,undefined]) {
      await assert.rejects(readRetainedAlternativesPolicy({ retainedAlternativesPolicy: name }, dir));
    }
    await writeFile(join(dir, 'retained-alternatives.json'), '{bad JSON');
    await assert.rejects(readRetainedAlternativesPolicy({ retainedAlternativesPolicy: 'retained-alternatives.json' }, dir), SyntaxError);
    const policy = fixture().policy; await writeFile(join(dir, 'retained-alternatives.json'), JSON.stringify(policy));
    assert.deepEqual(await readRetainedAlternativesPolicy({ retainedAlternativesPolicy: 'retained-alternatives.json' }, dir), policy);
  } finally {
    assert(resolve(dir).startsWith(prefix) && resolve(dir).startsWith(resolve(tmpdir()) + sep));
    await rm(dir, { recursive: true, force: true });
  }
});

test('the actual generated module deeply freezes alternatives without adding fields to existing rows', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const old = { term: 'bin liner', chineseAliases: ['垃圾袋'], englishForms: [], references: [], retainLegacyChinese: true };
  const next = { ...f.row, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const module = await import('data:text/javascript,' + encodeURIComponent(renderReviewedSenseModule([old,next])));
  assert.deepEqual(module.REVIEWED_SENSE_ENTRIES[0], old);
  const compiled = module.REVIEWED_SENSE_ENTRIES[1];
  assert(Object.isFrozen(compiled.retainedCanonicalAlternatives));
  assert(Object.isFrozen(compiled.retainedCanonicalAlternatives[0]));
  assert.throws(() => compiled.retainedCanonicalAlternatives[0].meaning = 'mutated', TypeError);
});

test('runtime retains separate choice DTOs, genuine old-form tuples and exact new examples without leaking policy identity', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const next = { ...f.row, dictionarySource: '卓式词典·义项补充', reviewedCanonicalSense: true,
    retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const unretained = { ...f.row, term: 'other-reviewed-head', reviewedCanonicalSense: true };
  const data = 'data:text/javascript,' + encodeURIComponent('export const EVERYDAY_LOOKUP_ENTRIES = ' + JSON.stringify([next,unretained]) + ';');
  const code = (await readFile(new URL('../../vocab/js/everyday-lookup.js', import.meta.url), 'utf8'))
    .replace('"./everyday-lookup-data.js"', JSON.stringify(data));
  const runtime = await import('data:text/javascript,' + encodeURIComponent(code));
  const found = runtime.searchEverydayDictionary('VAT').results[0];
  assert.equal(found.meaning, f.row.meaning); assert.deepEqual(found.alternatives, alternatives);
  assert.deepEqual(Object.keys(found.alternatives[0]).sort(), ['license','meaning','partOfSpeech','source','url']);
  assert.equal(runtime.isSupersededChineseSenseHead('VAT'), false);
  assert.equal(runtime.isSupersededChineseSenseHead('other-reviewed-head'), true);
  assert.equal(runtime.loadEverydayExamples('VAT').senses[0].examples[0].en, f.row.en);
  const legacy = { results: [{ term: 'VAT', ...alternatives[0], matchedForm: 'vats' }], hasMore: false };
  assert.deepEqual(runtime.guardLegacySupplementaryResult(legacy), legacy);
  for (const key of ['partOfSpeech','meaning','source','license','url']) {
    const forged = structuredClone(legacy); forged.results[0][key] += ' changed';
    assert.throws(() => runtime.guardLegacySupplementaryResult(forged), { code: 'unreviewed_dictionary_form' });
  }
  const wrongHead = structuredClone(legacy); wrongHead.results[0].term = 'other-reviewed-head';
  assert.throws(() => runtime.guardLegacySupplementaryResult(wrongHead), { code: 'unreviewed_dictionary_form' });
  const mitOnly = { ...legacy.results[0], source: sources.mit.name, license: sources.mit.license };
  assert.throws(() => runtime.guardLegacySupplementaryResult({ results: [mitOnly] }), { code: 'unreviewed_dictionary_form' });
  found.alternatives[0].meaning = 'caller mutation'; found.alternatives.push({});
  assert.deepEqual(runtime.searchEverydayDictionary('VAT').results[0].alternatives, alternatives);
  assert.deepEqual(Object.keys(runtime.loadEverydayExamples('VAT')).sort(), ['senses','term']);
});

async function injectedRuntime(rows) {
  const data = 'data:text/javascript,' + encodeURIComponent('export const EVERYDAY_LOOKUP_ENTRIES = ' + JSON.stringify(rows) + ';');
  const code = (await readFile(new URL('../../vocab/js/everyday-lookup.js', import.meta.url), 'utf8'))
    .replace('"./everyday-lookup-data.js"', JSON.stringify(data));
  const url = 'data:text/javascript,' + encodeURIComponent(code);
  return { url, runtime: await import(url) };
}

async function injectedConsumer(relative, runtimeUrl) {
  const original = new URL(relative, import.meta.url);
  const code = (await readFile(original, 'utf8')).replace(/from (["'])(\.{1,2}\/[^"']+)\1/gu, (match, quote, specifier) =>
    'from ' + JSON.stringify(['./everyday-lookup.js', './everyday-lookup.js?v=111'].includes(specifier)
      ? runtimeUrl : new URL(specifier, original).href))
    .replaceAll('import.meta.url', JSON.stringify(original.href));
  return import('data:text/javascript,' + encodeURIComponent(code));
}

test('approved usage annotations are finite, non-transitive and immutable across a double guard', async () => {
  const f = fixture(); f.entry.usageNote = '这里的大桶义不同于增值税缩写。';
  const alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { runtime } = await injectedRuntime([row]);
  const base = { ...alternatives[0] }; delete base.usageNote;
  const rogue = { ...base, meaning: '这个含义没有获得保留批准。' };
  const original = { results: [{ term: 'VAT', ...base, matchedForm: 'vats',
    alternatives: [{ ...base, canonicalId: 123, policyReviewer: 'must not leak' }, rogue] }], hasMore: false };
  const snapshot = structuredClone(original), once = runtime.guardLegacySupplementaryResult(original);
  const projected = { ...base, meaning: base.meaning + '\n用法：' + f.entry.usageNote };
  assert.equal(once.results[0].meaning, projected.meaning);
  assert.deepEqual(once.results[0].alternatives, [projected]);
  assert.deepEqual(runtime.guardLegacySupplementaryResult(once), once);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(Object.keys(once.results[0].alternatives[0]).sort(), ['license','meaning','partOfSpeech','source','url']);
  const changedNote = structuredClone(once); changedNote.results[0].meaning += ' 伪造注记';
  assert.throws(() => runtime.guardLegacySupplementaryResult(changedNote), { code: 'unreviewed_dictionary_form' });
  once.results[0].alternatives[0].meaning = 'caller mutation';
  assert.deepEqual(runtime.searchEverydayDictionary('VAT').results[0].alternatives, [projected]);
  assert.equal(runtime.searchEverydayDictionary(f.entry.usageNote), null, 'A usage note cannot become a Chinese alias');
});

test('actual Chinese search excludes an unapproved-only canonical variant and strips unapproved choices', async () => {
  const root = new URL('../../vocab/data/expanded-dictionary/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  let canonical;
  for (const shard of manifest.english.shards) {
    const raw = await readFile(new URL(shard.file, root));
    assert.equal(raw.length, shard.bytes);
    assert.equal(createHash('sha256').update(raw).digest('hex'), shard.sha256);
    canonical = JSON.parse(raw).records.find(row => row.term === 'spare');
    if (canonical) break;
  }
  assert(canonical);
  const f = fixture('spare');
  f.canonical = canonical; f.records = new Map([['spare',canonical]]);
  f.row.canonicalId = canonical.id; f.row.canonicalSourceSha256 = digest(canonical);
  f.entry.canonicalSourceSha256 = digest(canonical); f.entry.selectedRowSha256 = digest(f.row);
  f.entry.alternatives = [{ partOfSpeech: canonical.partOfSpeech, meaning: canonical.meaning, source: canonical.source }];
  const alternatives = validate(f).get('spare');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const unfiltered = await injectedRuntime([]), filtered = await injectedRuntime([row]);
  const before = await injectedConsumer('../../vocab/js/expanded-dictionary.js', unfiltered.url);
  const after = await injectedConsumer('../../vocab/js/expanded-dictionary.js', filtered.url);
  let requests = 0;
  const fetchImpl = async input => { const url = new URL(input); assert.equal(url.protocol, 'file:'); requests++; return new Response(await readFile(url)); };
  const oldOnlyQuery = '没有多余装饰或细节';
  assert((await before.searchExpandedDictionary(oldOnlyQuery, { fetchImpl })).results.some(item => item.term === 'spare'),
    'The baseline must demonstrate a real old source-variant hit');
  assert(!(await after.searchExpandedDictionary(oldOnlyQuery, { fetchImpl })).results.some(item => item.term === 'spare'));
  const kept = (await after.searchExpandedDictionary('备用零件', { fetchImpl })).results.find(item => item.term === 'spare');
  assert(kept); assert.equal(kept.source, manifest.sources[canonical.source].name);
  assert(!kept.alternatives, 'MIT and project-original variants were not independently retained by this finite policy');
  assert(requests > 0);
  before.resetExpandedDictionaryCacheForTests(); after.resetExpandedDictionaryCacheForTests();
});

test('a hot Chinese DTO with unapproved provenance falls back to the verified full result without leaking its alternatives', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { url } = await injectedRuntime([row]);
  const flow = await injectedConsumer('../../vocab/js/personal-lookup-flow.js', url);
  const approved = { term: 'VAT', ...alternatives[0] }, hot = { results: [{ ...approved, source: 'loose compact provenance' }], hasMore: false };
  const original = structuredClone(hot); let fullRequests = 0;
  const found = await flow.lookupPersonalDictionaryFast('大桶', {
    hotReverse: async () => hot,
    fullSearch: async () => { fullRequests++; return { results: [approved], hasMore: false }; },
    hotLookup: () => { throw Error('A Chinese search must not use English lookup'); },
  });
  assert.equal(fullRequests, 1); assert.deepEqual(found.results, [approved]); assert.deepEqual(hot, original);
  const rogue = { ...approved, meaning: '未批准含义' }, withRogue = { results: [{ ...approved, alternatives: [rogue] }], hasMore: false };
  const hotFound = await flow.lookupPersonalDictionaryFast('大桶', {
    hotReverse: async () => withRogue, fullSearch: () => { throw Error('The exact approved hot tuple can stay fast'); },
  });
  assert(!hotFound.results[0].alternatives); assert.equal(withRogue.results[0].alternatives.length, 1);
});

test('mixed ordinary and mismatched retained Chinese hits still attempt the verified source once', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { url } = await injectedRuntime([row]);
  const flow = await injectedConsumer('../../vocab/js/personal-lookup-flow.js', url);
  const ordinary = { term: 'barrel', partOfSpeech: 'noun', meaning: '桶', source: 'ordinary source' };
  const approved = { term: 'VAT', ...alternatives[0] };
  const hot = { results: [ordinary, { ...approved, source: 'different compact projection' }], hasMore: false };
  const snapshot = structuredClone(hot); let calls = 0;
  const result = await flow.lookupPersonalDictionaryFast('大桶', {
    hotReverse: async () => hot,
    fullSearch: async () => { calls++; return { results: [ordinary, approved], hasMore: false }; },
  });
  assert.equal(calls, 1); assert.deepEqual(result.results, [ordinary, approved]);
  assert.notEqual(result.coverage, 'basic'); assert.deepEqual(hot, snapshot);
});

test('failed retained Chinese full search preserves only ordinary basic hits and does not slow ordinary-only queries', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { url } = await injectedRuntime([row]);
  const flow = await injectedConsumer('../../vocab/js/personal-lookup-flow.js', url);
  const ordinary = { term: 'barrel', partOfSpeech: 'noun', meaning: '桶', source: 'ordinary source' };
  const rogue = { term: 'VAT', ...alternatives[0], meaning: 'unapproved old gloss' };
  const hot = { results: [ordinary, rogue], hasMore: false }; let calls = 0;
  const result = await flow.lookupPersonalDictionaryFast('大桶', {
    hotReverse: async () => hot,
    fullSearch: async () => { calls++; throw new Error('verified source offline'); },
  });
  assert.equal(calls, 1); assert.deepEqual(result, { results: [ordinary], hasMore: false, coverage: 'basic' });
  assert.equal(hot.results.length, 2);
  const fast = await flow.lookupPersonalDictionaryFast('桶', {
    hotReverse: async () => ({ results: [ordinary], hasMore: false }),
    fullSearch: () => { throw new Error('An ordinary-only hot hit must remain fast'); },
  });
  assert.deepEqual(fast.results, [ordinary]); assert.equal(fast.coverage, 'basic');
});

test('successful empty retained Chinese verification preserves known ordinary hot hits', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { url } = await injectedRuntime([row]);
  const flow = await injectedConsumer('../../vocab/js/personal-lookup-flow.js', url);
  const ordinary = { term: 'barrel', partOfSpeech: 'noun', meaning: '桶', source: 'ordinary source' };
  const hot = { results: [ordinary, { term: 'VAT', ...alternatives[0], source: 'unapproved source' }], hasMore: false };
  const full = { results: [], hasMore: false }, snapshot = structuredClone({ hot, full });
  const result = await flow.lookupPersonalDictionaryFast('大桶', { hotReverse: async () => hot, fullSearch: async () => full });
  assert.deepEqual(result, { results: [ordinary], hasMore: false, coverage: 'basic' });
  assert.deepEqual({ hot, full }, snapshot);
});

test('scoped retained Chinese merge prefers verified duplicates, appends unique safe hot rows and preserves callers', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { url } = await injectedRuntime([row]);
  const flow = await injectedConsumer('../../vocab/js/personal-lookup-flow.js', url);
  const approved = { term: 'VAT', ...alternatives[0] };
  const duplicate = { term: 'BARREL', partOfSpeech: 'noun', meaning: '旧来源的桶', source: 'ordinary hot source' };
  const hotOnly = { term: 'new public vessel', partOfSpeech: 'noun phrase', meaning: '新公开词条', source: 'public hot source' };
  const verified = { term: 'barrel', partOfSpeech: 'noun', meaning: '完整来源的桶', source: 'verified source' };
  const hot = { results: [duplicate, hotOnly, { ...approved, source: 'unapproved source' }], hasMore: false };
  const full = { results: [verified, approved], hasMore: false }, snapshot = structuredClone({ hot, full });
  const result = await flow.lookupPersonalDictionaryFast('大桶', { hotReverse: async () => hot, fullSearch: async () => full });
  assert.deepEqual(result.results, [verified, approved, hotOnly]); assert.equal(result.coverage, 'basic');
  assert.equal(result.hasMore, false); assert.deepEqual({ hot, full }, snapshot);
  assert(!result.results.includes(duplicate));
});

test('scoped retained Chinese merge respects the20-result cap and both source truncation indicators', async () => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { url } = await injectedRuntime([row]);
  const flow = await injectedConsumer('../../vocab/js/personal-lookup-flow.js', url);
  const ordinary = index => ({ term: `vessel-${index}`, partOfSpeech: 'noun', meaning: '桶', source: 'ordinary source' });
  const rogue = { term: 'VAT', ...alternatives[0], source: 'unapproved source' };
  for (const [fullCount, hotMore, fullMore, expectedMore] of [[19, false, false, true], [1, true, false, true], [1, false, true, true], [1, false, false, false], [21, false, false, true]]) {
    const hot = { results: [ordinary(30), ordinary(31), rogue], hasMore: hotMore };
    const full = { results: Array.from({ length: fullCount }, (_, index) => ordinary(index)), hasMore: fullMore };
    const snapshot = structuredClone({ hot, full });
    const result = await flow.lookupPersonalDictionaryFast('大桶', { hotReverse: async () => hot, fullSearch: async () => full });
    assert.equal(result.results.length, Math.min(20, fullCount + 2)); assert.equal(result.hasMore, expectedMore);
    assert.deepEqual(result.results.slice(0, Math.min(fullCount, 20)), full.results.slice(0, 20));
    assert(!result.results.some(item => item.term === 'VAT')); assert.deepEqual({ hot, full }, snapshot);
    if (fullCount < 20) assert.equal(result.coverage, 'basic');
  }
});

test('retained Chinese verification has a finite timeout and cancellation cannot become partial success', async t => {
  const f = fixture(), alternatives = validate(f).get('VAT');
  const row = { ...f.row, reviewedCanonicalSense: true, retainLegacyChinese: true, retainedCanonicalAlternatives: alternatives };
  const { url } = await injectedRuntime([row]);
  const flow = await injectedConsumer('../../vocab/js/personal-lookup-flow.js', url);
  const ordinary = { term: 'barrel', partOfSpeech: 'noun', meaning: '桶', source: 'ordinary source' };
  const rogue = { term: 'VAT', ...alternatives[0], source: 'unapproved source' };
  const hotReverse = async () => ({ results: [ordinary, rogue], hasMore: false });
  const never = () => new Promise(() => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fullSignal, start;
  const started = new Promise(resolve => { start = resolve; });
  const pending = flow.lookupPersonalDictionaryFast('大桶', {
    hotReverse, fullSearch: (_input, { signal }) => { fullSignal = signal; start(); return never(); },
  });
  await started;
  // Let bounded() register its timeout after the settled source starts.
  for (let index = 0; index < 5; index++) await Promise.resolve();
  t.mock.timers.tick(15_000);
  const partial = await pending;
  assert.deepEqual(partial.results, [ordinary]); assert.equal(partial.coverage, 'basic'); assert(fullSignal.aborted);
  t.mock.timers.reset();
  const controller = new AbortController(); let cancelStart;
  const cancelStarted = new Promise(resolve => { cancelStart = resolve; });
  const cancelled = flow.lookupPersonalDictionaryFast('大桶', {
    signal: controller.signal, hotReverse,
    fullSearch: () => { cancelStart(); return never(); },
  });
  await cancelStarted; controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
});
