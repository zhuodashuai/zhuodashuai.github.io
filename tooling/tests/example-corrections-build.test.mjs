import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exampleSourceHash } from '../scripts/build-dictionary-examples.mjs';
import { examplePairDigest } from '../scripts/audit-dictionary-example-reviews.mjs';
import { correctionFromReviewedPair, independentlyReviewedCorrections,
  loadExampleCorrectionBuild, parseCorrectionSourceManifest, reserveCorrectionSentence } from '../scripts/build-dictionary-example-corrections.mjs';
import { EVERYDAY_LOOKUP_ENTRIES } from '../../vocab/js/everyday-lookup-data.js';

const original = { term: 'test', partOfSpeech: 'noun', meaningZh: '检验、测验。',
  en: 'The glossary explains the word test.', zh: '词汇表解释了测验这个词。' };
const row = { ...original, en: 'The students completed the test before lunch.', zh: '学生们在午饭前完成了测验。', reviewer: 'AI/reader' };
const canonical = { term: 'test', id: 42, meaning: '测验', partOfSpeech: 'noun' };
const previous = { term: 'test', senses: [{ id: 'test-noun', partOfSpeech: original.partOfSpeech,
  meaningZh: original.meaningZh, examples: [{ en: original.en, zh: original.zh }], reviewer: 'AI/author', source: 'old' }] };

test('canonical correction identity cannot be rebound to an unpinned manifest or version', () => {
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 2, version: 'fixture-version', english: { buckets: 128 } }));
  const release = { source: { manifestSha256: examplePairDigest(JSON.parse(bytes)), version: 'fixture-version' } };
  assert.equal(parseCorrectionSourceManifest(bytes, release).version, 'fixture-version');
  assert.throws(() => parseCorrectionSourceManifest(Buffer.concat([bytes, Buffer.from(' ')]), release));
  assert.throws(() => parseCorrectionSourceManifest(bytes, { source: { ...release.source, version: 'changed-version' } }));
});

test('a reviewed replacement binds the complete old entry, literal canonical ID/source and original selected sense', () => {
  const result = correctionFromReviewedPair({ row, original, previous, canonical });
  assert.equal(result.expectedEntrySha256, examplePairDigest(previous));
  assert.equal(result.canonicalSourceSha256, examplePairDigest(canonical));
  assert.equal(result.senseId, 'test-noun'); assert.equal(result.en, row.en);
  assert.equal(result.exampleIndex, 0);
  const multi = { ...previous, senses: [{ ...previous.senses[0], examples: [{ en: 'An earlier good example.', zh: '一条应保留的好例句。' }, ...previous.senses[0].examples] }] };
  assert.equal(correctionFromReviewedPair({ row, original, previous: multi, canonical }).exampleIndex, 1);
  assert.equal(correctionFromReviewedPair({ row: { ...original, zh: '更准确的译文。', reviewer: row.reviewer }, original, previous, canonical }).exampleIndex, 0);
});

test('replacement generation refuses invented origins, changed grammatical roles and unrelated senses', () => {
  for (const change of [{ partOfSpeech: 'verb' }, { meaningZh: '品尝。' }, { term: 'other' }]) {
    assert.throws(() => correctionFromReviewedPair({ row: { ...row, ...change }, original, previous, canonical }));
  }
  assert.throws(() => correctionFromReviewedPair({ row, original, previous: { ...previous, senses: [] }, canonical }));
  assert.throws(() => correctionFromReviewedPair({ row: { ...original, reviewer: 'AI/reader' }, original, previous, canonical }));
});

test('only independent approved pairs qualify; a source self-check cannot approve the correction layer', () => {
  const pack = { schemaVersion: 1, batchId: 'quality-test', authorship: 'independent-composition',
    author: 'AI/author', entries: [original] };
  const review = { schemaVersion: 1, sourceSha256: exampleSourceHash(pack), reviewer: 'AI/reader',
    independentOfAuthor: true, approvedTerms: ['test'], issues: [] };
  assert.equal(independentlyReviewedCorrections(pack, review).length, 1);
  assert.equal(independentlyReviewedCorrections(pack, { ...review, approvedTerms: [] }).length, 0);
  assert.throws(() => independentlyReviewedCorrections(pack, { ...review, reviewer: 'AI/author', independentOfAuthor: false, mode: 'author-selfcheck' }));
});

test('correction deduplication includes real daily and selected-sense examples while allowing own translation repairs', () => {
  for (const existing of [EVERYDAY_LOOKUP_ENTRIES.find(row => !row.reviewedCanonicalSense),
    EVERYDAY_LOOKUP_ENTRIES.find(row => row.reviewedCanonicalSense)]) {
    assert(existing);
    const key = existing.en.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
    const sentences = new Map([[key, existing.term]]);
    assert.throws(() => reserveCorrectionSentence({ ...row, en: existing.en }, original, sentences), /Duplicate English/u);
    assert.throws(() => reserveCorrectionSentence({ ...row, en: `  ${existing.en.toUpperCase()}  ` }, original, sentences), /Duplicate English/u);
    assert.equal(sentences.get(key), existing.term);
  }
  const own = new Map([[original.en.toLowerCase(), original.term]]);
  reserveCorrectionSentence({ ...original, zh: '准确的新译文。' }, original, own);
  assert.equal(own.size, 1);
  reserveCorrectionSentence(row, original, own);
  assert.equal(own.get(row.en.toLowerCase()), row.term);
});

test('checked-in corrections rebuild from exact active legacy pairs and independent approvals, with global English deduplication', async () => {
  const build = await loadExampleCorrectionBuild();
  assert(build.corrections.length > 0);
  assert.equal(await readFile(new URL('../../vocab/js/dictionary-example-corrections-data.js', import.meta.url), 'utf8'), build.source);
});
