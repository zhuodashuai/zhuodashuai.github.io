import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleSourceHash } from '../scripts/build-dictionary-examples.mjs';
import { examplePairDigest, validateIndependentPairAudit, summarizePairAudits,
  loadIndependentPairAudits } from '../scripts/audit-dictionary-example-reviews.mjs';

const row = { term: 'review', partOfSpeech: 'verb', meaningZh: '重新检查、复核。',
  en: 'Please review the figures before you send the report.', zh: '发送报告前，请复核这些数字。' };
const pack = { schemaVersion: 1, batchId: 'batch-0000', authorship: 'independent-composition',
  author: 'AI/author', entries: [row, { ...row, term: 'other' }] };
const canonical = { term: 'review', id: 1, partOfSpeech: 'verb', meaning: '重新检查、复核。' };
const context = { canonicalRecords: new Map([['review', canonical]]) };
const audit = () => ({ schemaVersion: 1, sourceFile: 'batch-0000-test.json', sourceSha256: exampleSourceHash(pack),
  reviewer: 'AI/independent-reader', independentOfAuthor: true, entries: [{ term: row.term,
    pairDigest: examplePairDigest(row), canonicalId: canonical.id, canonicalSourceSha256: examplePairDigest(canonical),
    verdict: 'approved', notes: 'Checked the verb sense and EN/ZH pair.', references: [] }] });

test('an independent partial audit approves only the exact pair actually read', () => {
  const result = validateIndependentPairAudit(pack, audit(), context);
  assert.deepEqual(result.map(item => item.term), ['review']);
  assert.deepEqual(summarizePairAudits(result), { auditedPairs: 1, approved: 1, needsFix: 0, unverified: 0 });
});

test('changed source, selected sense, POS or translation makes an old approval stale', () => {
  assert.throws(() => validateIndependentPairAudit({ ...pack, entries: [{ ...row, zh: '不同的译文。' }] }, audit(), context));
  for (const field of ['en', 'zh', 'meaningZh', 'partOfSpeech']) {
    const changed = structuredClone(pack); changed.entries[0][field] += ' changed';
    const forged = audit(); forged.sourceSha256 = exampleSourceHash(changed);
    assert.throws(() => validateIndependentPairAudit(changed, forged, context));
  }
  assert.throws(() => validateIndependentPairAudit(pack, audit(), {
    canonicalRecords: new Map([['review', { ...canonical, meaning: '不同义项。' }]])
  }));
});

test('self-checks, absent terms, repeated decisions and unsupported verdicts cannot grant approval', () => {
  for (const change of [a => { a.reviewer = 'AI/author'; }, a => { a.independentOfAuthor = false; },
    a => { a.entries[0].term = 'absent'; }, a => { a.entries.push(a.entries[0]); },
    a => { a.entries[0].verdict = 'looks-fine'; }]) {
    const invalid = audit(); change(invalid); assert.throws(() => validateIndependentPairAudit(pack, invalid, context));
  }
});

test('an approval cannot hide an independently reported problem or uncertainty for the same current pair', () => {
  const [decision] = validateIndependentPairAudit(pack, audit(), context);
  assert.deepEqual(summarizePairAudits([decision, { ...decision, verdict: 'needs-fix' }]),
    { auditedPairs: 1, approved: 0, needsFix: 1, unverified: 0 });
  assert.deepEqual(summarizePairAudits([decision, { ...decision, verdict: 'unverified' }]),
    { auditedPairs: 1, approved: 0, needsFix: 0, unverified: 1 });
});

test('every checked-in independent decision authenticates against its active source and exact bilingual pair', async () => {
  const report = await loadIndependentPairAudits();
  assert(report.auditFiles > 0); assert(report.counts.auditedPairs > 0);
  assert.equal(report.counts.approved + report.counts.needsFix + report.counts.unverified, report.counts.auditedPairs);
});
