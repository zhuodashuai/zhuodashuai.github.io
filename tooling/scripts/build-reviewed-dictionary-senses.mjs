import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadExampleBuild, validateExampleReview } from './build-dictionary-examples.mjs';
import { parseCorrectionSourceManifest } from './build-dictionary-example-corrections.mjs';
import { EVERYDAY_LOOKUP_ENTRIES } from '../../vocab/js/everyday-lookup-data.js';
import { DICTIONARY_EXAMPLE_CORRECTIONS } from '../../vocab/js/dictionary-example-corrections-data.js';
import { personalDictionaryResult } from '../../vocab/js/personal-dictionary.js';

const ROOT = resolve(import.meta.dirname, '../..');
const HASH = /^[a-f0-9]{64}$/u;
const NAME = /^batch-\d{4}\.json$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const hash = value => createHash('sha256').update(value).digest('hex');
export const reviewedSensePackHash = pack => hash(JSON.stringify(pack));
const sentenceKey = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
const json = async file => JSON.parse(await readFile(file, 'utf8'));
// These are the exact heads shipped before retained-alternative policy existed.
// Never derive this boundary from the growing current compiled module.
const PRE_RETENTION_HEADS = new Set(['CD-ROM','ISS','NOE','baggie','bin liner','casualness','communitarian','geordie','hominy','hoodie','hugger','hyena','impulsively','judgmental','legalistic','meritocracy','multitalented','oap','permissiveness','rabbinical','remediate','restructuring','shakeout','sixths','snowboarder','springer','tenuously',"that's",'tum','unrated','untypical']);
export const PRE_RETENTION_HEADS_SHA256 = '9391e01faab39b741e33eb760f05667f0bd354425f0f14281fb06a4e4f78c8c3';

function text(value, max, han = false) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max
    && !CONTROL.test(value) && (!han || /\p{Script=Han}/u.test(value));
}

function exactObject(value, keys, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const own = Reflect.ownKeys(value);
  return keys.every(key => Object.hasOwn(value, key))
    && own.every(key => typeof key === 'string' && [...keys, ...optional].includes(key)
    && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

function exactArray(value, nonempty = true) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || nonempty && !value.length) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === value.length + 1 && keys.every(key => key === 'length'
    || typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < value.length
      && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

/** Policy names exact old raw fields; display formatting is the same pure
 * licensed-source formatter used by expanded-dictionary's readable() path. */
export function retainedCanonicalDisplay(canonical, selected, descriptor) {
  let formatted = selected;
  if (['mit','core','pos-reviewed','grammar-reviewed','pos-notation-reviewed'].includes(selected.source)
    && !/^\s*(?:[①-⑳]|\d+[.、])/u.test(selected.meaning)) {
    const result = personalDictionaryResult({ word: canonical.term,
      partOfSpeech: selected.partOfSpeech, meaning: selected.meaning });
    if (result) formatted = { ...selected, partOfSpeech: result.partOfSpeech || selected.partOfSpeech,
      meaning: result.meaning.length <= 2000 ? result.meaning : selected.meaning };
  }
  return { partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning,
    source: descriptor.name, license: descriptor.license, url: descriptor.url };
}

/** This validates a separate reader's finite policy, not the linguistic
 * truth of the old gloss. Only already-approved new source rows are eligible. */
export function validateRetainedCanonicalAlternatives(policy, selections, canonicalRecords, descriptors) {
  if (!exactObject(policy, ['schemaVersion','entries']) || policy.schemaVersion !== 1
    || !exactArray(policy.entries, false) || !(selections instanceof Map)
    || !(canonicalRecords instanceof Map) || !descriptors || typeof descriptors !== 'object') {
    throw Error('Invalid exact retained-alternative policy');
  }
  const retained = new Map();
  const keys = ['term','canonicalSourceSha256','selectedRowSha256','author','reviewer','independentOfAuthor','alternatives','reason','references'];
  for (const entry of policy.entries) {
    if (!exactObject(entry, keys, ['usageNote']) || !text(entry.term, 200) || retained.has(entry.term)
      || PRE_RETENTION_HEADS.has(entry.term) || !HASH.test(entry.canonicalSourceSha256 || '')
      || !HASH.test(entry.selectedRowSha256 || '') || !/^AI\/[a-z0-9_-]{1,100}$/u.test(entry.author || '')
      || !/^AI\/[a-z0-9_-]{1,100}$/u.test(entry.reviewer || '') || entry.reviewer === entry.author
      || entry.independentOfAuthor !== true || !text(entry.reason, 2000)
      || !exactArray(entry.alternatives) || entry.alternatives.length > 20
      || !exactArray(entry.references) || new Set(entry.references).size !== entry.references.length
      || entry.references.some(url => !text(url, 2000) || (() => { try { return new URL(url).protocol !== 'https:'; } catch { return true; } })())
      || Object.hasOwn(entry, 'usageNote') && !text(entry.usageNote, 400, true)) {
      throw Error('Missing independent exact retained-alternative approval');
    }
    const selected = selections.get(entry.term), canonical = canonicalRecords.get(entry.term);
    if (!selected || selected.author !== entry.author || !canonical || canonical.term !== entry.term
      || selected.row?.term !== entry.term || selected.row.canonicalId !== canonical.id
      || hash(JSON.stringify(canonical)) !== entry.canonicalSourceSha256
      || selected.row.canonicalSourceSha256 !== entry.canonicalSourceSha256
      || hash(JSON.stringify(selected.row)) !== entry.selectedRowSha256) {
      throw Error(`Retained alternative lacks exact approved source identity: ${entry.term}`);
    }
    const variants = [canonical, ...(canonical.variants || [])], seen = new Set(), alternatives = [];
    for (const old of entry.alternatives) {
      if (!exactObject(old, ['partOfSpeech','meaning','source']) || !text(old.partOfSpeech, 80)
        || !text(old.meaning, 2000) || !text(old.source, 100)
        || !Object.hasOwn(descriptors, old.source)
        || !variants.some(item => item.partOfSpeech === old.partOfSpeech
          && item.meaning === old.meaning && item.source === old.source)) {
        throw Error(`Retained alternative must be a complete unchanged canonical tuple: ${entry.term}`);
      }
      const key = JSON.stringify([old.partOfSpeech, old.meaning, old.source]);
      if (seen.has(key)) throw Error(`Repeated retained canonical alternative: ${entry.term}`);
      seen.add(key);
      const descriptor = descriptors[old.source];
      if (!text(descriptor?.name, 200) || !text(descriptor?.license, 2000)
        || !text(descriptor?.url, 2000) || (() => { try { return new URL(descriptor.url).protocol !== 'https:'; } catch { return true; } })()) {
        throw Error(`Retained alternative has no pinned source descriptor: ${entry.term}`);
      }
      alternatives.push({ ...retainedCanonicalDisplay(canonical, old, descriptor),
        ...(Object.hasOwn(entry, 'usageNote') ? { usageNote: entry.usageNote } : {}) });
    }
    retained.set(entry.term, alternatives);
  }
  return retained;
}

export async function readRetainedAlternativesPolicy(index, directory) {
  if (!Object.hasOwn(index, 'retainedAlternativesPolicy')) return undefined;
  if (typeof index.retainedAlternativesPolicy !== 'string' || !/^[a-z0-9-]+\.json$/u.test(index.retainedAlternativesPolicy)) {
    throw Error('Invalid retained-alternative policy path');
  }
  return json(join(directory, index.retainedAlternativesPolicy));
}

export function renderReviewedSenseModule(rows) {
  return '// Generated independent selected-sense supplements; original canonical records and IDs remain unchanged.\n'
    + 'export const REVIEWED_SENSE_ENTRIES = Object.freeze([\n' + rows.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]'
    + '.map(row => Object.freeze({ ...row, chineseAliases: Object.freeze(row.chineseAliases), englishForms: Object.freeze(row.englishForms), references: Object.freeze(row.references), ...(row.retainedCanonicalAlternatives ? { retainedCanonicalAlternatives: Object.freeze(row.retainedCanonicalAlternatives.map(alternative => Object.freeze({ ...alternative }))) } : {}) })));\n';
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
  const rows = [], seen = new Set(), approvedSelections = new Map();
  for (const batch of index.batches) {
    if (!NAME.test(batch.source) || !NAME.test(batch.review)) throw Error('Invalid selected-sense source path');
    const pack = await json(join(base, 'reviewed-senses/source', batch.source));
    const review = await json(join(base, 'reviewed-senses/reviews', batch.review));
    for (const row of validateReviewedSensePack(pack, review, records, sentences, retainedChineseHeads)) {
      if (seen.has(row.term)) throw Error('Repeated reviewed canonical head');
      approvedSelections.set(row.term, { author: pack.author, row: pack.entries.find(item => item.term === row.term) });
      seen.add(row.term); rows.push(row);
    }
  }
  if ([...retainedChineseHeads].some(term => !seen.has(term))) throw Error('Legacy Chinese retention requires an approved literal head');
  const policy = await readRetainedAlternativesPolicy(index, join(base, 'reviewed-senses'));
  if (policy !== undefined) {
    // A declared policy is mandatory. Missing, malformed or stale data must not
    // silently delete previously retained meanings on a later build.
    const retained = validateRetainedCanonicalAlternatives(policy, approvedSelections, records, manifest.sources);
    for (const row of rows) if (retained.has(row.term)) {
      row.retainedCanonicalAlternatives = retained.get(row.term); row.retainLegacyChinese = true;
    }
  }
  rows.sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  // One JSON object per line keeps this mutable module readable without
  // duplicating indentation throughout every Pages/offline release.
  const source = renderReviewedSenseModule(rows);
  return { rows, source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await loadReviewedSenseBuild(), file = join(ROOT, 'vocab/js/reviewed-senses-data.js');
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== result.source) throw Error('Stale independently reviewed selected senses');
  } else await writeFile(file, result.source);
  console.log(JSON.stringify({ reviewedHeads: result.rows.length, canonicalSourceModified: false }));
}
