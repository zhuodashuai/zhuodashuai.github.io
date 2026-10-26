import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createExampleCorrections, applyExampleCorrections } from '../js/dictionary-example-corrections.js';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture() {
  const entry = { term: 'sample', senses: [
    { id: 'sample:noun:1', partOfSpeech: 'noun', meaningZh: '样本', examples: [{ en: 'The glossary explains sample.', zh: '词汇表解释了样本。' }], source: '原创例句·作者自查（精选义项）', reviewer: 'AI/original-author' },
    { id: 'sample:verb:2', partOfSpeech: 'verb', meaningZh: '取样', examples: [{ en: 'They sample the water each week.', zh: '他们每周对水取样。' }], source: '原创例句·AI复核（精选义项）', reviewer: 'AI/previous-reviewer' },
  ] };
  const row = { term: 'sample', expectedEntrySha256: sha(entry), canonicalId: 257,
    canonicalSourceSha256: 'a'.repeat(64), senseId: 'sample:noun:1', exampleIndex: 0, partOfSpeech: 'noun',
    meaningZh: '样本；供检验的一小部分', en: 'The technician sealed the water sample in a clean bottle.',
    zh: '技术人员把水样密封在一个干净的瓶子里。', reviewer: 'AI/independent-quality-review' };
  return { entry, row };
}

test('a full old-entry digest and exact sense identity admit only the reviewed replacement', async () => {
  const { entry, row } = fixture(), before = JSON.stringify(entry), apply = createExampleCorrections([row]);
  const result = await apply('sample', entry);
  assert.notEqual(result, entry); assert.notEqual(result.senses, entry.senses);
  assert.equal(result.term, 'sample'); assert.equal(result.senses[0].id, entry.senses[0].id);
  assert.equal(result.senses[0].partOfSpeech, row.partOfSpeech); assert.equal(result.senses[0].meaningZh, row.meaningZh);
  assert.deepEqual(result.senses[0].examples, [{ en: row.en, zh: row.zh }]);
  assert.equal(result.senses[0].reviewer, row.reviewer); assert.equal(result.senses[0].source, '原创例句·AI复核（精选义项）');
  assert.equal(result.senses[1], entry.senses[1]); assert.equal(JSON.stringify(entry), before);
  assert.deepEqual(Object.keys(result).sort(), ['senses','term']);
  assert.deepEqual(Object.keys(result.senses[0]).sort(), ['examples','id','meaningZh','partOfSpeech','reviewer','source']);
  for (const internal of ['canonicalId','canonicalSourceSha256','expectedEntrySha256','senseId','exampleIndex']) assert(!JSON.stringify(result).includes(internal));
});

test('only the pinned pair index changes while every other pair and sense keeps its original reference', async () => {
  const { entry, row } = fixture();
  entry.senses[0].examples.push({ en: 'Keep the second water sample chilled.', zh: '把第二份水样保持冷藏。' });
  entry.senses[0].examples.push({ en: 'Each sample has a separate label.', zh: '每份样本都有单独的标签。' });
  const before = JSON.stringify(entry);
  const result = await createExampleCorrections([{ ...row, exampleIndex: 1, expectedEntrySha256: sha(entry) }])('sample', entry);
  assert.equal(result.senses[0].examples.length, 3);
  assert.equal(result.senses[0].examples[0], entry.senses[0].examples[0]);
  assert.deepEqual(result.senses[0].examples[1], { en: row.en, zh: row.zh });
  assert.notEqual(result.senses[0].examples[1], entry.senses[0].examples[1]);
  assert.equal(result.senses[0].examples[2], entry.senses[0].examples[2]);
  assert.equal(result.senses[0].source, entry.senses[0].source);
  assert.equal(result.senses[0].reviewer, entry.senses[0].reviewer);
  assert.equal(result.senses[1], entry.senses[1]); assert.equal(JSON.stringify(entry), before);
});

test('an out-of-range example index leaves an otherwise matching authenticated entry unchanged', async () => {
  const { entry, row } = fixture();
  for (const exampleIndex of [entry.senses[0].examples.length, 1000]) {
    assert.equal(await createExampleCorrections([{ ...row, exampleIndex }])('sample', entry), entry);
  }
});

test('unknown terms, absent entries and case/form aliases retain the original reference', async () => {
  const { entry, row } = fixture(), apply = createExampleCorrections([row]);
  for (const term of ['unknown','SAMPLE','samples',' sample ',null,{}]) assert.equal(await apply(term, entry), entry);
  for (const value of [null,undefined,{},[],{ term: 'sample', senses: [] }]) assert.equal(await apply('sample', value), value);
  assert.equal(await createExampleCorrections([])('sample', entry), entry);
  assert.equal(await applyExampleCorrections('not-a-shipped-correction', entry), entry);
});

test('a changed meaning, POS, source, example or object key order invalidates the exact snapshot', async () => {
  const { entry, row } = fixture(), apply = createExampleCorrections([row]);
  for (const change of [value => { value.senses[0].meaningZh = '另一个义项'; },
    value => { value.senses[0].partOfSpeech = 'verb'; }, value => { value.senses[0].source = 'another source'; },
    value => { value.senses[0].examples[0].en += ' Changed.'; }, value => { value.term = 'other'; }]) {
    const changed = structuredClone(entry); change(changed); assert.equal(await apply('sample', changed), changed);
  }
  const reordered = { senses: entry.senses, term: entry.term };
  assert.equal(await apply('sample', reordered), reordered);
});

test('matching bytes cannot select an absent or duplicated sense or another literal head', async () => {
  const { entry, row } = fixture();
  assert.equal(await createExampleCorrections([{ ...row, senseId: 'missing' }])('sample', entry), entry);
  const duplicated = structuredClone(entry); duplicated.senses.push(structuredClone(duplicated.senses[0]));
  assert.equal(await createExampleCorrections([{ ...row, expectedEntrySha256: sha(duplicated) }])('sample', duplicated), duplicated);
  const other = { ...entry, term: 'other' };
  assert.equal(await createExampleCorrections([{ ...row, expectedEntrySha256: sha(other) }])('sample', other), other);
});

test('a caller cannot mutate captured review rows or reuse a previous mutable result', async () => {
  const { entry, row } = fixture(), approved = row.en, rows = [row], apply = createExampleCorrections(rows);
  row.en = 'Unreviewed input.'; rows.length = 0;
  const first = await apply('sample', entry); assert.equal(first.senses[0].examples[0].en, approved);
  first.senses[0].examples[0].en = 'Changed output.';
  assert.equal((await apply('sample', entry)).senses[0].examples[0].en, approved);
  assert.equal(await apply('sample', first), first, 'a corrected or changed snapshot is never repatched');
});

test('accessors, toJSON facades and extra DTO fields cannot borrow a trusted digest', async () => {
  const { entry, row } = fixture(), apply = createExampleCorrections([row]);
  const facade = { ...entry, toJSON() { return entry; } };
  assert.equal(await apply('sample', facade), facade);
  const getter = { senses: entry.senses }; Object.defineProperty(getter, 'term', { enumerable: true, get: () => 'sample' });
  assert.equal(await apply('sample', getter), getter);
  const extra = { ...entry, canonicalId: 257 };
  assert.equal(await createExampleCorrections([{ ...row, expectedEntrySha256: sha(extra) }])('sample', extra), extra);
  const arrayFacade = structuredClone(entry);
  arrayFacade.senses.map = () => [{ examples: [{ en: 'Unreviewed input.', zh: '未审核内容。' }] }];
  assert.equal(sha(arrayFacade), row.expectedEntrySha256, 'array properties are absent from JSON bytes');
  assert.equal(await apply('sample', arrayFacade), arrayFacade);
});

test('input mutation during digest cannot acquire a correction authorised for earlier bytes', async () => {
  const { entry, row } = fixture(), apply = createExampleCorrections([row]);
  const pending = apply('sample', entry); entry.senses[0].meaningZh = '异步时更换义项';
  assert.equal(await pending, entry); assert.equal(entry.senses[0].examples[0].en, 'The glossary explains sample.');
});

test('cancellation before and during the async digest remains AbortError even for unknown/null inputs', async () => {
  const { entry, row } = fixture(), apply = createExampleCorrections([row]);
  const first = new AbortController(); first.abort();
  await assert.rejects(apply('sample', entry, { signal: first.signal }), { name: 'AbortError' });
  await assert.rejects(apply('unknown', null, { signal: first.signal }), { name: 'AbortError' });
  const second = new AbortController(), pending = apply('sample', entry, { signal: second.signal }); second.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('the optional layer makes no network requests and retains the old entry when crypto is unavailable', async () => {
  const { entry, row } = fixture(), apply = createExampleCorrections([row]);
  const oldFetch = globalThis.fetch, cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let calls = 0; globalThis.fetch = () => { calls++; throw Error('Unexpected network'); };
  try {
    assert.notEqual(await apply('sample', entry), entry); assert.equal(calls, 0);
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    assert.equal(await apply('sample', entry), entry); assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); else delete globalThis.crypto;
  }
});

test('malformed or ambiguous shipped rows are rejected at table construction', () => {
  const { row } = fixture();
  for (const rows of [null,{},[row,row],[{ ...row, expectedEntrySha256: 'not-a-hash' }],
    [{ ...row, expectedEntrySha256: { toString: () => row.expectedEntrySha256 } }],
    [{ ...row, canonicalSourceSha256: 'A'.repeat(64) }],[{ ...row, canonicalId: -1 }],
    [{ ...row, exampleIndex: -1 }],[{ ...row, exampleIndex: 0.5 }],[{ ...row, exampleIndex: NaN }],
    [{ ...row, meaningZh: 'English only' }],[{ ...row, zh: '' }],
    [{ ...row, reviewer: 'unreviewed' }],[{ ...row, unreviewed: true }]]) {
    assert.throws(() => createExampleCorrections(rows), /Invalid example correction/u);
  }
});
