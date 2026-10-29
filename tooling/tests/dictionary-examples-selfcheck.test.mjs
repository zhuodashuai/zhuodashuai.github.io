import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exampleSourceHash, validateExampleReview, buildDictionaryExamples, exampleReviewAudit } from '../scripts/build-dictionary-examples.mjs';
import { buildAdditiveExamples } from '../scripts/build-dictionary-examples-additive.mjs';
import { parseDictionaryExamplesManifest, parseDictionaryExamplesShard, createDictionaryExamplesController } from '../../vocab/js/dictionary-examples.js';
import { rawJson, parseAdditiveCatalogue, parseAdditiveDelta, decodeGzipArtifact } from '../../vocab/js/dictionary-examples-additive-codec.js';
import { createDictionaryExamplesSection as legacySection } from '../../vocab/js/dictionary-examples-ui.js';
import { createDictionaryExamplesSection as currentSection } from '../../vocab/js/dictionary-examples-ui-v108.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const reviewedSource = '原创例句·AI复核（精选义项）', selfSource = '原创例句·作者自查（精选义项）';
const row = { term: 'sample', partOfSpeech: 'noun', meaningZh: '样本', en: 'The sample arrived in a small wooden box.', zh: '样本装在一个小木盒里送到了。' };
const oldPack = () => ({ schemaVersion: 1, batchId: 'fixture', authorship: 'independent-composition', entries: [row] });
const selfPack = () => ({ ...oldPack(), author: 'AI/selfcheck_author', entries: [{ ...row, term: 'other',
  en: 'The other sample remained on the shelf.', zh: '另一个样本仍放在架子上。' }] });
const independent = pack => ({ schemaVersion: 1, sourceSha256: exampleSourceHash(pack), reviewer: 'AI/independent_reader', independentOfAuthor: true, approvedTerms: pack.entries.map(row => row.term), issues: [] });
const selfReview = pack => ({ schemaVersion: 1, mode: 'author-selfcheck', sourceSha256: exampleSourceHash(pack), reviewer: pack.author, independentOfAuthor: false, checkedTerms: pack.entries.map(row => row.term), issues: [] });
const originalPack = { entries: [{ headword: 'test', review: { status: 'checked', reviewer: 'AI/previous' }, senses: [{ id: 'test:noun', partOfSpeech: 'noun', definitionZh: '测试', examples: [{ en: 'This test checks only a small fixture.', zh: '这项测试只检查一个小型固定样本。' }] }] }] };
const ordinary = authored => buildDictionaryExamples({ originalPack, authored, knownTerms: ['test', 'sample', 'other'] });

test('author-selfcheck is explicit, author-bound and cannot masquerade as an independent review', () => {
  const pack = selfPack(), review = selfReview(pack), selected = validateExampleReview(pack, review);
  assert.equal(selected[0].source, selfSource); assert.equal(selected[0].reviewer, pack.author);
  for (const change of [r => r.independentOfAuthor = true, r => r.reviewer = 'AI/someone_else', r => delete r.mode,
    r => r.approvedTerms = ['other'], r => r.checkedTerms = ['missing'], r => r.checkedTerms.push('other'),
    r => r.issues.push({ term: 'other', blocking: true })]) {
    const bad = structuredClone(review); change(bad); assert.throws(() => validateExampleReview(pack, bad));
  }
  assert.throws(() => validateExampleReview({ ...pack, author: 'AI/changed_author' }, review), /stale/);
  assert.throws(() => validateExampleReview(oldPack(), { ...independent(oldPack()), independentOfAuthor: false }));
  assert.throws(() => validateExampleReview(pack, { ...independent(pack), reviewer: pack.author }));
});

test('legacy source hash, labels, runtime objects and audit shape remain unchanged without self-check rows', () => {
  const pack = oldPack(), admitted = validateExampleReview(pack, independent(pack));
  assert.equal(exampleSourceHash(pack), sha(JSON.stringify({ schemaVersion: 1, batchId: 'fixture', authorship: 'independent-composition', entries: [row] })));
  assert.deepEqual(admitted, [{ ...row, reviewer: 'AI/independent_reader' }]);
  const result = ordinary(admitted), sense = result.entries.find(entry => entry.term === 'sample').senses[0];
  assert.deepEqual(sense, { id: 'example:sample', partOfSpeech: row.partOfSpeech, meaningZh: row.meaningZh,
    examples: [{ en: row.en, zh: row.zh }], reviewer: 'AI/independent_reader', source: reviewedSource });
  const audit = JSON.parse(result.files.get('source-audit-v2.json'));
  assert.equal(audit.reviewScope, 'AI cross-reviewed selected-sense examples, not human certification or complete dictionary coverage');
  assert(!Object.hasOwn(audit, 'reviewModes'));
});

test('legacy shard parser accepts the explicit self-check label and rejects unknown provenance', () => {
  const pack = selfPack(), result = ordinary(validateExampleReview(pack, selfReview(pack)));
  const manifest = parseDictionaryExamplesManifest(result.manifest);
  const descriptor = manifest.shards.find(shard => JSON.parse(result.files.get(shard.file)).entries.some(row => row.term === 'other'));
  const payload = JSON.parse(result.files.get(descriptor.file));
  const parsed = parseDictionaryExamplesShard(payload, manifest, descriptor);
  assert.equal(parsed.get('other').senses[0].source, selfSource);
  payload.entries.find(row => row.term === 'other').senses[0].source = 'uncorroborated independent approval';
  assert.throws(() => parseDictionaryExamplesShard(payload, manifest, descriptor));
});

test('appending self-check examples preserves an earlier delta byte-for-byte and separates audit counts', async () => {
  const reviewed = validateExampleReview(oldPack(), independent(oldPack()));
  const checked = validateExampleReview(selfPack(), selfReview(selfPack()));
  const baseBuild = ordinary([]), baseManifestBytes = baseBuild.files.get('manifest-v2.json'), sourceManifestBytes = rawJson({ version: 'a'.repeat(64) });
  const index = { schemaVersion: 1, base: { file: 'manifest-v2.json', bytes: baseManifestBytes.length, sha256: sha(baseManifestBytes), version: baseBuild.manifest.version, counts: baseBuild.manifest.counts },
    source: { version: 'a'.repeat(64), manifestSha256: sha(sourceManifestBytes) }, previousCatalogue: null,
    releases: [{ id: 'examples-0041', sourceFiles: ['batch-0041-fixture.json'] }] };
  const canonicalRecords = new Map([...reviewed, ...checked].map((row, i) => [row.term, { id: i + 1, term: row.term }]));
  const common = { baseBuild, baseManifestBytes, sourceManifestBytes, canonicalRecords };
  const prior = await buildAdditiveExamples({ ...common, index, referenceBuild: ordinary(reviewed), groups: [{ id: 'examples-0041', rows: reviewed }] });
  const next = await buildAdditiveExamples({ ...common, index: { ...index, previousCatalogue: prior.descriptor,
    releases: [...index.releases, { id: 'examples-0042', sourceFiles: ['batch-0042-fixture.json'] }] },
    referenceBuild: ordinary([...reviewed, ...checked]), previousCatalogue: prior.catalogue,
    groups: [{ id: 'examples-0041', rows: reviewed }, { id: 'examples-0042', rows: checked }] });
  assert.deepEqual(next.catalogue.deltas[0], prior.catalogue.deltas[0]);
  assert(next.files.get(prior.catalogue.deltas[0].file).equals(prior.files.get(prior.catalogue.deltas[0].file)));
  assert.deepEqual(next.audit.reviewModes, { independentlyReviewed: { senses: 2, examples: 2 }, authorSelfcheck: { senses: 1, examples: 1 } });
  assert(!Object.hasOwn(prior.audit, 'reviewModes'));
  const catalogue = await parseAdditiveCatalogue(next.catalogue), descriptor = catalogue.deltas[1];
  const payload = await decodeGzipArtifact(next.files.get(descriptor.file), descriptor, { delta: true });
  assert.equal(parseAdditiveDelta(payload, catalogue, 1).get('other').example.senses[0].source, selfSource);
  payload.entries[0].example.senses[0].source = 'unknown source';
  assert.throws(() => parseAdditiveDelta(payload, catalogue, 1));
});

class Element {
  children = []; dataset = {}; attributes = {}; listeners = new Map(); hidden = false; textContent = '';
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
}
for (const [name, createSection] of [['legacy', legacySection], ['current', currentSection]]) test(`${name} card UI uses concise labels while preserving source metadata for both modes`, async () => {
  const root = { createElement: () => new Element() };
  for (const source of [reviewedSource, selfSource]) {
    const entry = { term: 'sample', senses: [{ partOfSpeech: 'noun', meaningZh: '样本', source, examples: [{ en: row.en, zh: row.zh }] }] };
    const view = createSection({ root, loadModule: async () => ({ createDictionaryExamplesController: options => createDictionaryExamplesController({ ...options, load: async () => entry }) }) });
    assert.equal(await view.show({ term: 'sample' }), true);
    assert.equal(view.section.children[1].textContent, '原创学习例句');
    assert.equal(entry.senses[0].source, source);
  }
});
