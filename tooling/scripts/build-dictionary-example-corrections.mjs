import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadExampleBuild, validateExampleReview } from './build-dictionary-examples.mjs';
import { createAdditiveExamplesLoader } from '../../vocab/js/dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from '../../vocab/js/dictionary-examples-release-v4.js';
import { EVERYDAY_LOOKUP_ENTRIES } from '../../vocab/js/everyday-lookup-data.js';

const ROOT = resolve(import.meta.dirname, '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const ordered = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
const name = /^[a-z0-9-]+\.json$/u;

export function parseCorrectionSourceManifest(bytes, release = dictionaryExamplesRelease) {
  if (hash(bytes) !== release.source.manifestSha256) throw Error('Correction source manifest is not the pinned release');
  const manifest = JSON.parse(bytes);
  if (manifest.version !== release.source.version || manifest.schemaVersion !== 2 || manifest.english?.buckets !== 128) {
    throw Error('Correction source version changed');
  }
  return manifest;
}

export function independentlyReviewedCorrections(pack, review) {
  if (review?.independentOfAuthor !== true || review.mode !== undefined) throw Error('Corrections need independent cross-review');
  return validateExampleReview(pack, review);
}

/** A translation repair may retain its own original English. A new sentence
 * cannot borrow any other active word's example, including local supplements. */
export function reserveCorrectionSentence(row, original, sentences) {
  const key = ordered(row.en), owner = sentences.get(key);
  if (owner && !(owner === row.term && row.en === original.en)) {
    throw Error(`Duplicate English learning sentence: ${row.term} / ${owner}`);
  }
  sentences.set(key, row.term);
}

export function correctionFromReviewedPair({ row, original, previous, canonical }) {
  if (!canonical || canonical.term !== row.term || !Number.isSafeInteger(canonical.id)
    || previous?.term !== row.term || original?.term !== row.term
    || row.partOfSpeech !== original.partOfSpeech || row.meaningZh !== original.meaningZh) {
    throw Error('A correction cannot borrow a different head, POS or selected sense');
  }
  const senses = previous.senses.filter(sense => sense.partOfSpeech === original.partOfSpeech
    && sense.meaningZh === original.meaningZh && sense.examples.some(pair => pair.en === original.en && pair.zh === original.zh));
  if (senses.length !== 1 || row.en === original.en && row.zh === original.zh) throw Error('Correction origin is missing, ambiguous or unchanged');
  const matchingPairs = senses[0].examples.map((pair, index) => ({ pair, index })).filter(({ pair }) => pair.en === original.en && pair.zh === original.zh);
  if (matchingPairs.length !== 1) throw Error('Correction must identify exactly one original pair');
  return { term: row.term, expectedEntrySha256: hash(JSON.stringify(previous)), canonicalId: canonical.id,
    canonicalSourceSha256: hash(JSON.stringify(canonical)), senseId: senses[0].id, exampleIndex: matchingPairs[0].index,
    partOfSpeech: row.partOfSpeech, meaningZh: row.meaningZh, en: row.en, zh: row.zh, reviewer: row.reviewer };
}

export async function loadExampleCorrectionBuild({ root = ROOT } = {}) {
  const base = join(root, 'tooling/dictionary/examples');
  const index = await json(join(base, 'corrections/index.json'));
  if (index.schemaVersion !== 1 || !Array.isArray(index.batches) || !index.batches.length) throw Error('Invalid correction index');
  const additive = await json(join(base, 'additive-index-v4.json'));
  const additionalAuthored = [];
  for (const release of additive.releases) for (const file of release.sourceFiles) {
    const pack = await json(join(base, 'source', file));
    const review = await json(join(base, 'reviews', file));
    additionalAuthored.push(...validateExampleReview(pack, review));
  }
  const reference = await loadExampleBuild({ additionalAuthored });
  const sentences = new Map();
  for (const entry of reference.entries) for (const sense of entry.senses) for (const pair of sense.examples) {
    sentences.set(ordered(pair.en), entry.term);
  }
  // These active local rows include both daily phrases and reviewed selected
  // senses. They are outside the immutable example catalogue but still appear
  // in the same learning UI and must participate in its duplicate boundary.
  for (const row of EVERYDAY_LOOKUP_ENTRIES) sentences.set(ordered(row.en), row.term);
  const memo = new Map();
  const assets = join(root, 'vocab');
  async function localFetch(input) {
    const url = new URL(input);
    if (url.protocol !== 'file:') throw Error('Correction build only reads packaged assets');
    const file = fileURLToPath(url);
    if (!file.startsWith(assets + (process.platform === 'win32' ? '\\' : '/'))) throw Error('Outside packaged assets');
    if (!memo.has(file)) memo.set(file, readFile(file));
    return new Response(await memo.get(file));
  }
  const loader = createAdditiveExamplesLoader(dictionaryExamplesRelease, { fetchImpl: localFetch });
  const corrections = [], seen = new Set();
  const manifest = parseCorrectionSourceManifest(await readFile(join(assets, 'data/expanded-dictionary/manifest.json')));
  const canonical = new Map();
  for (const descriptor of manifest.english.shards) {
    const bytes = await readFile(join(assets, 'data/expanded-dictionary', descriptor.file));
    if (hash(bytes) !== descriptor.sha256 || bytes.length !== descriptor.bytes) throw Error('Canonical source changed');
    for (const record of JSON.parse(bytes).records) canonical.set(record.term, record);
  }
  try {
    for (const batch of index.batches) {
      if (!name.test(batch.sourceFile) || !name.test(batch.reviewFile) || !batch.origins || typeof batch.origins !== 'object') throw Error('Invalid correction batch');
      const pack = await json(join(base, 'corrections/source', batch.sourceFile));
      const review = await json(join(base, 'corrections/reviews', batch.reviewFile));
      // Author self-checks cannot qualify for this independent quality layer.
      for (const row of independentlyReviewedCorrections(pack, review)) {
        if (seen.has(row.term)) throw Error('Repeated corrected head');
        seen.add(row.term);
        const origin = batch.origins[row.term];
        if (!/^batch-\d{4}-[a-z0-9-]+\.json$/u.test(origin)) throw Error('Missing original source');
        const originalPack = await json(join(base, 'source', origin));
        const originals = originalPack.entries.filter(item => item.term === row.term);
        if (originals.length !== 1) throw Error('Ambiguous original example');
        reserveCorrectionSentence(row, originals[0], sentences);
        const previous = await loader.load(row.term, { lookupQuery: row.term });
        corrections.push(correctionFromReviewedPair({ row, original: originals[0], previous, canonical: canonical.get(row.term) }));
      }
    }
  } finally { loader.close(); }
  corrections.sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  const source = '// Generated from independently reviewed pairs; original immutable example assets remain intact.\n'
    + 'export const DICTIONARY_EXAMPLE_CORRECTIONS = Object.freeze('
    + JSON.stringify(corrections, null, 2) + '.map(row => Object.freeze(row)));\n';
  return { corrections, source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await loadExampleCorrectionBuild();
  const file = join(ROOT, 'vocab/js/dictionary-example-corrections-data.js');
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== result.source) throw Error('Stale independently reviewed corrections');
  } else await writeFile(file, result.source);
  console.log(JSON.stringify({ correctedHeads: result.corrections.length, originalImmutableAssetsChanged: false }));
}
