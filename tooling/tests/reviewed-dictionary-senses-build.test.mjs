import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { reviewedSensePackHash, validateReviewedSensePack, loadReviewedSenseBuild } from '../scripts/build-reviewed-dictionary-senses.mjs';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = { term: 'hoodie', id: 123, partOfSpeech: 'noun', meaning: '有冠乌鸦' };
const row = { term: 'hoodie', partOfSpeech: 'noun', meaning: '① 连帽卫衣。', chineseAliases: ['连帽卫衣'],
  englishForms: ['hoodies'], en: 'He put on a dry hoodie before leaving.', zh: '出门前，他穿上了一件干的连帽卫衣。',
  references: ['https://dictionary.cambridge.org/dictionary/english/hoodie'], canonicalId: canonical.id, canonicalSourceSha256: digest(canonical) };
const pack = () => ({ schemaVersion: 1, author: 'AI/sense-author', entries: [{ ...row }] });
const review = p => ({ schemaVersion: 1, sourceSha256: reviewedSensePackHash(p), reviewer: 'AI/independent-reader', independentOfAuthor: true,
  approvedTerms: ['hoodie'], issues: [] });
const records = new Map([['hoodie', canonical]]);

test('an explicit independently reviewed sense can correct an old source without relabelling it as third-party content', () => {
  const p = pack(), [result] = validateReviewedSensePack(p, review(p), records);
  assert.equal(result.meaning, row.meaning); assert.equal(result.dictionarySource, '卓式词典·义项补充');
  assert.equal(result.canonicalId, canonical.id); assert.equal(result.canonicalSourceSha256, digest(canonical));
  assert.equal(result.retainLegacyChinese, false); assert.equal(result.exampleReviewer, 'AI/independent-reader');
  assert.equal(canonical.meaning, '有冠乌鸦');
});

test('unapproved rows, author checks and unresolved objections cannot grant a supplementary sense', () => {
  const p = pack(), r = review(p);
  assert.deepEqual(validateReviewedSensePack(p, { ...r, approvedTerms: [] }, records), []);
  for (const changed of [{ independentOfAuthor: false }, { reviewer: p.author }, { sourceSha256: 'a'.repeat(64) },
    { issues: [{ term: 'hoodie', blocking: true, resolution: '' }] }]) {
    assert.throws(() => validateReviewedSensePack(p, { ...r, ...changed }, records));
  }
});

test('changing canonical identity, selected meaning, translation or original example invalidates the prior review', () => {
  for (const change of [{ canonicalId: 999 }, { canonicalSourceSha256: 'a'.repeat(64) }, { term: 'another head' }]) {
    const p = pack(); p.entries[0] = { ...p.entries[0], ...change };
    assert.throws(() => validateReviewedSensePack(p, review(p), records));
  }
  for (const field of ['meaning', 'en', 'zh', 'partOfSpeech']) {
    const p = pack(), r = review(p); p.entries[0][field] += ' changed';
    assert.throws(() => validateReviewedSensePack(p, r, records));
  }
});

test('English sentence reuse across the full library is rejected and legacy reverse matches require explicit retention policy', () => {
  const p = pack(), existing = new Map([[row.en.toLowerCase(), 'different word']]);
  assert.throws(() => validateReviewedSensePack(p, review(p), records, existing));
  const [retained] = validateReviewedSensePack(p, review(p), records, new Map(), new Set(['hoodie']));
  assert.equal(retained.retainLegacyChinese, true);
});

test('the published supplementary source rebuilds from pinned canonical records, full-library deduplication and real independent approvals', async () => {
  const build = await loadReviewedSenseBuild();
  assert(build.rows.length > 0);
  assert.equal(await readFile(new URL('../../vocab/js/reviewed-senses-data.js', import.meta.url), 'utf8'), build.source);
});
