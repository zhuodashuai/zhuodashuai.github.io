import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DICTIONARY_EXAMPLE_CORRECTIONS as allCompiled } from '../../vocab/js/dictionary-example-corrections-data.js';
import { historicalCorrections75 } from './helpers/correction-history-0075.mjs';
const compiled = historicalCorrections75(allCompiled);
import { applyExampleCorrections } from '../../vocab/js/dictionary-example-corrections.js';
import { loadDictionaryExamples, resetDictionaryExamplesCacheForTests } from '../../vocab/js/dictionary-examples-current-v4.js';
import { createAdditiveExamplesLoader } from '../../vocab/js/dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from '../../vocab/js/dictionary-examples-release-v4.js';
import { exampleSourceHash } from '../scripts/build-dictionary-examples.mjs';
import { independentlyReviewedCorrections, correctionFromReviewedPair } from '../scripts/build-dictionary-example-corrections.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const hash = value => sha(JSON.stringify(value));
const root = new URL('../../', import.meta.url);
const bytes = file => fs.readFile(new URL(file, root));
const read = async file => JSON.parse(await bytes(file));
const fixturePath = 'tooling/dictionary/examples/evidence/translation-precision-0016-fixture.json';
const fixture = await read(fixturePath);
const [row] = fixture.rows;
const fetchImpl = async input => new Response(await fs.readFile(new URL(input)));

test('historical74 stays exact and dignify adds one independently reviewed Chinese-only correction to the historical75-row union', async () => {
  assert.equal(sha(await bytes(fixturePath)), '718151135297edd8a8cd644e182fa37fc8b5f91328d01b9a529aa56450b31ac0');
  assert.equal(fixture.rows.length, 1);
  const old = await read(fixture.baselineFixture);
  assert.equal(sha(await bytes(fixture.baselineFixture)), fixture.baselineFixtureSha256);
  assert.equal(fixture.baselineFixtureSha256, '51ea649ad7e9c52419b32c27d25b67742b46b9b84ca6d56712fe6486d6ed4951');
  const old74 = [...old.baselineCorrectionRows, ...old.rows.map(item => item.compiledCorrection)]
    .sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  assert.equal(old74.length, 74);
  assert.deepEqual(fixture.baselineCorrectionRows, old74);
  assert.equal(hash(old74), '62a1192657cfe012c02cd89a75e63d01c4367bf7079649d7656cd121aae49e18');
  assert.equal(fixture.baselineCorrectionRowsSha256, hash(old74));
  assert.deepEqual(compiled.filter(item => item.term !== 'dignify'), old74);
  assert.deepEqual(compiled, [...old74, row.compiledCorrection].sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
  assert.equal(compiled.length, 75);
  assert.equal(new Set(compiled.map(item => item.term)).size, 75);
  const source = await read(fixture.sourceFile), review = await read(fixture.reviewFile);
  assert.equal(sha(await bytes(fixture.sourceFile)), fixture.sourceByteSha256);
  assert.equal(sha(await bytes(fixture.reviewFile)), 'e619c1d556d7b7051b50e89b166513825b072750cb55be6717c7c8dbcab050ad');
  assert.equal(fixture.reviewByteSha256, sha(await bytes(fixture.reviewFile)));
  assert.equal(exampleSourceHash(source), '17c1682bd8e5b95b67d3c9dcaa9862d8216284f01482d59ecfbe1d5ccb294475');
  assert.equal(fixture.sourceBuildSha256, exampleSourceHash(source));
  assert.notEqual(source.author, review.reviewer);
  assert.deepEqual(review.issues, []);
  assert.deepEqual(source.entries, [row.approvedPair]);
  const [approved] = independentlyReviewedCorrections(source, review);
  assert.equal(independentlyReviewedCorrections(source, review).length, 1);
  assert.deepEqual(Object.keys(row.approvedPair).filter(key => row.approvedPair[key] !== row.originalSourceEntry[key]), ['zh']);
  assert.equal(row.onlyChangedPairField, 'zh');
  assert.equal(row.wholeSourceApproved, false);
  assert.equal(row.sourceAuthorActuallyRecorded, null);
  assert.deepEqual(correctionFromReviewedPair({ row: approved, original: row.originalSourceEntry, previous: row.originalDTO, canonical: row.canonicalRecord }), row.compiledCorrection);
});

test('dignify correction binds the entire unchanged original source, canonical record, immutable asset and original DTO', async () => {
  const originalSource = await bytes(row.originalSourceFile);
  assert.equal(sha(originalSource), row.originalSourceByteSha256);
  assert.equal(sha(originalSource), row.frozenHistoricalSourceBinding.sourcePhysicalAndGitBinding.gitSha256);
  assert.deepEqual(JSON.parse(originalSource).entries[row.frozenHistoricalSourceBinding.entryIndex], row.originalSourceEntry);
  assert.equal(hash(row.originalSourceEntry), row.oldFiveFieldPairSha256);
  assert.equal(hash(row.approvedPair), row.newFiveFieldPairSha256);
  const pointer = row.canonicalPointer, canonicalBytes = await bytes('vocab/data/expanded-dictionary/' + pointer.file);
  assert.equal(sha(canonicalBytes), pointer.sha256);
  assert.equal(canonicalBytes.length, pointer.bytes);
  // English descriptor.count authenticates lookup keys, not the records union.
  assert.equal(JSON.parse(canonicalBytes).keys.length, pointer.count);
  assert.deepEqual(JSON.parse(canonicalBytes).records[pointer.recordIndex], row.canonicalRecord);
  assert.equal(hash(row.canonicalRecord), row.canonicalRecordSha256);
  assert.equal(row.compiledCorrection.canonicalId, 1582671);
  assert.equal(row.compiledCorrection.canonicalSourceSha256, row.canonicalRecordSha256);
  const manifestBytes = await bytes('vocab/data/expanded-dictionary/manifest.json');
  assert.equal(sha(manifestBytes), row.canonicalManifestSha256);
  assert.deepEqual(JSON.parse(manifestBytes).sources[row.canonicalRecord.source], row.canonicalDescriptor);
  const asset = row.originalExampleAsset;
  assert.equal(sha(await bytes('vocab/data/dictionary-examples/' + asset.file)), asset.sha256);
  const reader = createAdditiveExamplesLoader(dictionaryExamplesRelease, { fetchImpl });
  try {
    const original = await reader.load(row.term, { lookupQuery: row.term });
    assert.deepEqual(original, row.originalDTO);
    assert.equal(hash(original), row.originalDTOSha256);
  } finally { reader.close(); }
});

test('dignify Chinese precision changes only its reviewed pair translation and independent reviewer, retaining all IDs English POS and labels', async () => {
  const original = structuredClone(row.originalDTO), before = JSON.stringify(original);
  const corrected = await applyExampleCorrections(row.term, original);
  assert.deepEqual(corrected, row.expectedCorrectedDTO);
  assert.equal(JSON.stringify(original), before);
  const expected = structuredClone(original);
  expected.senses[0].examples[0].zh = row.approvedPair.zh;
  expected.senses[0].reviewer = row.compiledCorrection.reviewer;
  assert.deepEqual(corrected, expected);
  assert.equal(corrected.senses[0].id, original.senses[0].id);
  assert.equal(corrected.senses[0].partOfSpeech, original.senses[0].partOfSpeech);
  assert.equal(corrected.senses[0].meaningZh, original.senses[0].meaningZh);
  assert.equal(corrected.senses[0].examples[0].en, original.senses[0].examples[0].en);
  try { assert.deepEqual(await loadDictionaryExamples(row.term, { fetchImpl }), corrected); }
  finally { resetDictionaryExamplesCacheForTests(); }
});

test('dignify precision rejects another literal head and every edited full-DTO identity without mutating it', async () => {
  for (const term of ['Dignify', 'defalcate', 'vengeful']) assert.equal(await applyExampleCorrections(term, row.originalDTO), row.originalDTO);
  for (const change of [
    dto => { dto.term = 'defalcate'; },
    dto => { dto.senses[0].id += '-other'; },
    dto => { dto.senses[0].partOfSpeech = 'noun'; },
    dto => { dto.senses[0].meaningZh = '另一种含义'; },
    dto => { dto.senses[0].examples[0].en = 'A different original English sentence.'; },
    dto => { dto.senses[0].examples[0].zh = '另一个原有中文句子。'; },
    dto => { dto.senses[0].reviewer = 'AI/different_reader'; },
    dto => { dto.senses[0].source = 'Different original source'; },
    dto => { dto.senses[0].examples.push({ en: 'An extra unrelated example.', zh: '一个无关的额外例句。' }); },
    dto => { dto.approved = true; },
  ]) {
    const dto = structuredClone(row.originalDTO); change(dto);
    const before = JSON.stringify(dto);
    assert.equal(await applyExampleCorrections(row.term, dto), dto);
    assert.equal(JSON.stringify(dto), before);
  }
});

test('dignify pending digest mutation and cancellation never apply a stale correction', async () => {
  const edited = structuredClone(row.originalDTO), pending = applyExampleCorrections(row.term, edited);
  edited.senses[0].meaningZh = '在异步摘要计算期间编辑过的含义';
  assert.equal(await pending, edited);
  for (const initiallyAborted of [true, false]) {
    const controller = new AbortController(), dto = structuredClone(row.originalDTO), before = JSON.stringify(dto);
    if (initiallyAborted) controller.abort();
    const work = applyExampleCorrections(row.term, dto, { signal: controller.signal });
    if (!initiallyAborted) controller.abort();
    await assert.rejects(work, { name: 'AbortError' });
    assert.equal(JSON.stringify(dto), before);
  }
});

test('dignify learning example remains separate from saved manual book study and private fields in either meaning shape', async () => {
  try {
    for (const context of [
      { partOfSpeech: row.approvedPair.partOfSpeech, meaning: row.approvedPair.meaningZh },
      { partOfSpeech: row.canonicalRecord.partOfSpeech, meaning: row.canonicalRecord.meaning },
      { partOfSpeech: 'noun', meaning: row.approvedPair.meaningZh },
      { partOfSpeech: row.approvedPair.partOfSpeech, meaning: 'An unrelated saved meaning.' },
    ]) for (const nested of [false, true]) {
      const card = { id: 'personal-dignify', term: row.term, partOfSpeech: context.partOfSpeech,
        meaning: nested ? { zh: context.meaning } : context.meaning,
        example: 'My own English.', exampleZh: '我的例句。', bookPassage: 'My original book quotation.',
        note: 'Private note.', folderIds: ['reading'], study: { box: 4, correct: 7 },
        review: { dueAt: '2026-11-01T12:00:00.000Z' }, progress: { streak: 3 } };
      const before = JSON.stringify(card);
      const result = await loadDictionaryExamples(row.term, { fetchImpl, savedEntry: card });
      assert.deepEqual(result, row.expectedCorrectedDTO);
      assert.equal(JSON.stringify(card), before);
      assert.equal(result.senses[0].partOfSpeech, row.originalDTO.senses[0].partOfSpeech);
      assert.equal(result.senses[0].meaningZh, row.originalDTO.senses[0].meaningZh);
    }
  } finally { resetDictionaryExamplesCacheForTests(); }
});
