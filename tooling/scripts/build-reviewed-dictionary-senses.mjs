import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadExampleBuild, validateExampleReview } from './build-dictionary-examples.mjs';
import { parseCorrectionSourceManifest } from './build-dictionary-example-corrections.mjs';
import { EVERYDAY_LOOKUP_ENTRIES } from '../../vocab/js/everyday-lookup-data.js';
import { DICTIONARY_EXAMPLE_CORRECTIONS } from '../../vocab/js/dictionary-example-corrections-data.js';

const ROOT = resolve(import.meta.dirname, '../..');
const HASH = /^[a-f0-9]{64}$/u;
const NAME = /^batch-\d{4}\.json$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const hash = value => createHash('sha256').update(value).digest('hex');
export const reviewedSensePackHash = pack => hash(JSON.stringify(pack));
const sentenceKey = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
const json = async file => JSON.parse(await readFile(file, 'utf8'));

function text(value, max, han = false) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max
    && !CONTROL.test(value) && (!han || /\p{Script=Han}/u.test(value));
}

/** These are explicitly authored supplementary senses, not claims that a
 * frozen third-party record already contained a modern meaning or correct POS. */
export function validateReviewedSensePack(pack, review, canonicalRecords, existingSentences = new Map(), retainedChineseHeads = new Set()) {
  if (!pack || pack.schemaVersion !== 1 || !/^AI\/[a-z0-9_-]{1,100}$/u.test(pack.author)
    || !Array.isArray(pack.entries) || !pack.entries.length
    || !review || review.schemaVersion !== 1 || review.sourceSha256 !== reviewedSensePackHash(pack)
    || review.independentOfAuthor !== true || !/^AI\/[a-z0-9_-]{1,100}$/u.test(review.reviewer)
    || review.reviewer === pack.author || !Array.isArray(review.approvedTerms) || !Array.isArray(review.issues)
    || !(canonicalRecords instanceof Map)) throw Error('Missing independent selected-sense approval');
  const approved = new Set(review.approvedTerms), seen = new Set(), output = [];
  if (approved.size !== review.approvedTerms.length) throw Error('Repeated selected-sense approval');
  for (const row of pack.entries) {
    const canonical = canonicalRecords.get(row.term);
    if (!text(row.term, 200) || seen.has(row.term) || /[<>]|\p{Script=Han}/u.test(row.term)
      || !canonical || row.canonicalId !== canonical.id || !Number.isSafeInteger(row.canonicalId)
      || !HASH.test(row.canonicalSourceSha256 || '') || row.canonicalSourceSha256 !== hash(JSON.stringify(canonical))
      || !text(row.partOfSpeech, 80) || !/^[a-z ()·/.-]+$/u.test(row.partOfSpeech)
      || !text(row.meaning, 2000, true) || !row.meaning.startsWith('①')
      || !text(row.en, 1200) || !/[A-Za-z]/u.test(row.en) || !text(row.zh, 1200, true)
      || !Array.isArray(row.chineseAliases) || !row.chineseAliases.length || row.chineseAliases.length > 20
      || new Set(row.chineseAliases).size !== row.chineseAliases.length
      || row.chineseAliases.some(alias => !text(alias, 50, true))
      || !Array.isArray(row.englishForms) || row.englishForms.length > 30
      || new Set(row.englishForms).size !== row.englishForms.length
      || row.englishForms.some(form => !text(form, 200) || /[<>]|\p{Script=Han}/u.test(form))
      || !Array.isArray(row.references) || !row.references.length || row.references.some(url => {
        try { return new URL(url).protocol !== 'https:'; } catch { return true; }
      })) throw Error(`Invalid selected-sense row: ${row.term}`);
    seen.add(row.term);
    if (!approved.has(row.term)) continue;
    if (review.issues.some(issue => issue.term === row.term && issue.blocking === true && !issue.resolution?.trim())) {
      throw Error(`Unresolved selected-sense issue: ${row.term}`);
    }
    const owner = existingSentences.get(sentenceKey(row.en));
    if (owner) throw Error(`Duplicate selected-sense English example: ${row.term} / ${owner}`);
    existingSentences.set(sentenceKey(row.en), row.term);
    output.push({ term: row.term, partOfSpeech: row.partOfSpeech, meaning: row.meaning,
      chineseAliases: [...row.chineseAliases], englishForms: [...row.englishForms], en: row.en, zh: row.zh,
      references: [...row.references], dictionarySource: '卓式词典·义项补充',
      exampleSource: '原创例句·AI复核（精选义项）', exampleReviewer: review.reviewer,
      reviewedCanonicalSense: true, retainLegacyChinese: retainedChineseHeads.has(row.term), canonicalId: row.canonicalId, canonicalSourceSha256: row.canonicalSourceSha256 });
  }
  if ([...approved].some(term => !seen.has(term))) throw Error('Approval names an absent selected-sense row');
  return output;
}

export async function loadReviewedSenseBuild() {
  const base = join(ROOT, 'tooling/dictionary');
  const index = await json(join(base, 'reviewed-senses/index.json'));
  if (index.schemaVersion !== 1 || !Array.isArray(index.batches) || !index.batches.length) throw Error('Invalid reviewed-sense index');
  const retainedChineseHeads = new Set(index.retainLegacyChineseHeads || []);
  const manifest = parseCorrectionSourceManifest(await readFile(join(ROOT, 'vocab/data/expanded-dictionary/manifest.json')));
  const records = new Map();
  for (const descriptor of manifest.english.shards) {
    const bytes = await readFile(join(ROOT, 'vocab/data/expanded-dictionary', descriptor.file));
    if (bytes.length !== descriptor.bytes || hash(bytes) !== descriptor.sha256) throw Error('Canonical source changed');
    for (const row of JSON.parse(bytes).records) {
      if (records.has(row.term) && JSON.stringify(records.get(row.term)) !== JSON.stringify(row)) throw Error('Conflicting canonical identity');
      records.set(row.term, row);
    }
  }
  const additive = await json(join(base, 'examples/additive-index-v4.json'));
  const additionalAuthored = [];
  for (const release of additive.releases) for (const file of release.sourceFiles) {
    const pack = await json(join(base, 'examples/source', file)), review = await json(join(base, 'examples/reviews', file));
    additionalAuthored.push(...validateExampleReview(pack, review));
  }
  const full = await loadExampleBuild({ additionalAuthored });
  const sentences = new Map();
  for (const entry of full.entries) for (const sense of entry.senses) for (const pair of sense.examples) sentences.set(sentenceKey(pair.en), entry.term);
  for (const row of [...EVERYDAY_LOOKUP_ENTRIES.filter(item => item.reviewedCanonicalSense !== true), ...DICTIONARY_EXAMPLE_CORRECTIONS]) sentences.set(sentenceKey(row.en), row.term);
  const rows = [], seen = new Set();
  for (const batch of index.batches) {
    if (!NAME.test(batch.source) || !NAME.test(batch.review)) throw Error('Invalid selected-sense source path');
    const pack = await json(join(base, 'reviewed-senses/source', batch.source));
    const review = await json(join(base, 'reviewed-senses/reviews', batch.review));
    for (const row of validateReviewedSensePack(pack, review, records, sentences, retainedChineseHeads)) {
      if (seen.has(row.term)) throw Error('Repeated reviewed canonical head');
      seen.add(row.term); rows.push(row);
    }
  }
  if ([...retainedChineseHeads].some(term => !seen.has(term))) throw Error('Legacy Chinese retention requires an approved literal head');
  rows.sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  // One JSON object per line keeps this mutable module readable without
  // duplicating indentation throughout every Pages/offline release.
  const source = '// Generated independent selected-sense supplements; original canonical records and IDs remain unchanged.\n'
    + 'export const REVIEWED_SENSE_ENTRIES = Object.freeze([\n' + rows.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]'
    + '.map(row => Object.freeze({ ...row, chineseAliases: Object.freeze(row.chineseAliases), englishForms: Object.freeze(row.englishForms), references: Object.freeze(row.references) })));\n';
  return { rows, source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await loadReviewedSenseBuild(), file = join(ROOT, 'vocab/js/reviewed-senses-data.js');
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== result.source) throw Error('Stale independently reviewed selected senses');
  } else await writeFile(file, result.source);
  console.log(JSON.stringify({ reviewedHeads: result.rows.length, canonicalSourceModified: false }));
}
