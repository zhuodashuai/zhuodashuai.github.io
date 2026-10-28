import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exampleSourceHash, validateExampleReview, validateExampleSourceIndex } from './build-dictionary-examples.mjs';
import { loadOriginalCatalogue } from '../lib/original-dictionary-catalogue.mjs';
import { independentlyReviewedCorrections } from './build-dictionary-example-corrections.mjs';
import { createAdditiveExamplesLoader } from '../../vocab/js/dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from '../../vocab/js/dictionary-examples-release-v4.js';
import { canonicalDisplayContexts, canonicalFold, canonicalSourceBucket } from '../../vocab/js/canonical-example-repair-source.js';

const ROOT = resolve(import.meta.dirname, '../..');
export const CANONICAL_REPAIR_KIND = 'canonical-same-sense-example-only-v1';
// Keep this release within the shipped resolver's bounded table capacity.
// A future larger table requires a deliberate runtime/build format update.
const MAX_COMPILED_REPAIRS = 128;
const ROW_KEYS = ['kind', 'term', 'canonicalManifestSha256', 'canonicalId', 'canonicalSourceSha256',
  'exactCanonicalRecord', 'canonicalSourceDescriptor', 'origin', 'expectedOriginalEntry', 'expectedOriginalEntrySha256',
  'retiredOriginalPair', 'retiredOriginalPairSha256', 'acceptedDisplayContexts', 'replacementPair', 'replacementPairSha256', 'references'];
const PAIR_KEYS = ['term', 'partOfSpeech', 'meaningZh', 'en', 'zh'];
const HASH = /^[a-f0-9]{64}$/u, FILE = /^[a-z0-9-]+\.json$/u;
const hash = value => createHash('sha256').update(value).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = message => { throw Error(`Invalid canonical example repair: ${message}`); };
export const canonicalRepairFold = canonicalFold;
const sentenceKey = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) fail('closed keys');
}
function text(value, max = 2000) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max) fail('required bounded text');
}
function digest(value) { if (typeof value !== 'string' || !HASH.test(value)) fail('SHA-256'); }
function principal(value) { if (typeof value !== 'string' || !/^AI\/[A-Za-z0-9_-]{1,100}$/u.test(value)) fail('explicit reviewer/author principal'); }
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }

/** Reject JSON facades/accessors/hidden fields before serializing any proof. */
export function canonicalRepairSnapshot(input) {
  let nodes = 0;
  function copy(value, depth) {
    if (++nodes > 300000 || depth > 20) fail('JSON bounds');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('number'); return value; }
    if (typeof value === 'string') {
      if (value.length > 16384 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail('JSON text');
      return value;
    }
    if (!value || typeof value !== 'object') fail('JSON value');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (proto !== (array ? Array.prototype : Object.prototype) && !(proto === null && !array)) fail('plain JSON object');
    const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
    if (keys.some(key => typeof key !== 'string' || key === 'toJSON' || key === '__proto__')) fail('JSON facade');
    if (array) {
      if (value.length > 200000 || keys.length !== value.length + 1 || keys.at(-1) !== 'length') fail('dense JSON array');
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = descriptors[index];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('array accessor');
        return copy(descriptor.value, depth + 1);
      });
    }
    const result = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('hidden/accessor value');
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  }
  return copy(input, 0);
}
export const canonicalRepairSourceHash = value => hash(JSON.stringify(canonicalRepairSnapshot(value)));
function pins(value) { const copy = canonicalRepairSnapshot(value); exact(copy, ['version', 'manifestSha256']); digest(copy.version); digest(copy.manifestSha256); return copy; }
function pair(value) {
  exact(value, PAIR_KEYS);
  text(value.term, 200); text(value.partOfSpeech, 80); text(value.meaningZh); text(value.en, 1200); text(value.zh, 1200);
  if (!/[A-Za-z]/u.test(value.en) || !/\p{Script=Han}/u.test(value.zh) || !/\p{Script=Han}/u.test(value.meaningZh)) fail('English/Chinese example languages');
}
function oldEntry(value) {
  exact(value, ['term', 'senses']); text(value.term, 200);
  if (!Array.isArray(value.senses) || value.senses.length !== 1) fail('exact one old sense');
  const sense = value.senses[0]; exact(sense, ['id', 'partOfSpeech', 'meaningZh', 'examples', 'reviewer', 'source']);
  for (const key of ['id', 'partOfSpeech', 'meaningZh', 'reviewer', 'source']) text(sense[key]);
  if (!Array.isArray(sense.examples) || sense.examples.length !== 1) fail('exact one old pair');
  exact(sense.examples[0], ['en', 'zh']); text(sense.examples[0].en, 1200); text(sense.examples[0].zh, 1200);
}
export function canonicalRepairBucket(term) {
  return canonicalSourceBucket(term);
}
export function canonicalRepairDisplayContexts(record) {
  return canonicalDisplayContexts(record);
}
async function publicBytes(readPublicAsset, path, maximum) {
  const input = await readPublicAsset(path);
  if (!(input instanceof Uint8Array) || input.byteLength < 1 || input.byteLength > maximum) fail('bounded public bytes');
  return Buffer.from(input);
}
export async function authenticateCanonicalRepairRecord(binding, releasePins, { readPublicAsset }) {
  const row = canonicalRepairSnapshot(binding), pinned = pins(releasePins);
  if (row.canonicalManifestSha256 !== pinned.manifestSha256 || typeof readPublicAsset !== 'function') fail('release authority');
  const manifestBytes = await publicBytes(readPublicAsset, 'expanded-dictionary/manifest.json', 524288);
  if (hash(manifestBytes) !== pinned.manifestSha256) fail('manifest bytes');
  const parse = bytes => canonicalRepairSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  const manifest = parse(manifestBytes);
  if (manifest.schemaVersion !== 2 || manifest.version !== pinned.version || manifest.english?.buckets !== 128
    || !Array.isArray(manifest.english.shards) || manifest.english.shards.length !== 128) fail('manifest version/shape');
  const bucket = canonicalRepairBucket(row.term), descriptor = manifest.english.shards[bucket];
  exact(descriptor, ['bucket', 'file', 'sha256', 'bytes', 'count']); digest(descriptor.sha256);
  if (descriptor.bucket !== bucket || descriptor.file !== `${pinned.version}/en-${String(bucket).padStart(3, '0')}.json`
    || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > 8388608
    || !Number.isSafeInteger(descriptor.count) || descriptor.count < 1) fail('source shard descriptor');
  const bytes = await publicBytes(readPublicAsset, `expanded-dictionary/${descriptor.file}`, 8388608);
  if (bytes.byteLength !== descriptor.bytes || hash(bytes) !== descriptor.sha256) fail('source shard bytes');
  const shard = parse(bytes); exact(shard, ['schemaVersion', 'kind', 'bucket', 'records', 'keys']);
  if (shard.schemaVersion !== 2 || shard.kind !== 'en' || shard.bucket !== bucket || !Array.isArray(shard.records)
    || !Array.isArray(shard.keys) || shard.keys.length !== descriptor.count) fail('source shard shape');
  const matches = shard.records.filter(record => record.term === row.term);
  const owners = shard.records.filter(record => typeof record.term === 'string' && canonicalRepairFold(record.term) === canonicalRepairFold(row.term));
  const tuples = shard.keys.filter(tuple => Array.isArray(tuple) && tuple[0] === canonicalRepairFold(row.term));
  if (matches.length !== 1 || owners.length !== 1 || tuples.length !== 1 || tuples[0].length !== 2
    || !Array.isArray(tuples[0][1]) || tuples[0][1].length !== 1) fail('unique literal/NFKC canonical owner');
  const record = matches[0], ref = tuples[0][1][0]; exact(ref, ['id', 'kind']);
  if (!Number.isSafeInteger(row.canonicalId) || row.canonicalId < 1 || row.canonicalId % 128 !== bucket
    || ref.id !== row.canonicalId || ref.kind !== 'canonical' || record.id !== row.canonicalId) fail('canonical ID/key');
  if (!equal(record, row.exactCanonicalRecord) || hash(JSON.stringify(record)) !== row.canonicalSourceSha256) fail('complete canonical record');
  if (!Object.hasOwn(manifest.sources ?? {}, record.source) || !equal(manifest.sources[record.source], row.canonicalSourceDescriptor)) fail('pinned source descriptor');
  text(record.term, 200); text(record.partOfSpeech, 80); text(record.meaning);
  return frozen(record);
}

/** Every head and grammatical role requires its own complete, hash-bound approval. */
export async function compileCanonicalRepairPack(inputPack, inputReview, dependencies) {
  const { releasePins, readPublicAsset, readOriginalSource, loadOriginalEntry, reservedEnglish, occupiedHeads } = dependencies ?? {};
  if (!(reservedEnglish instanceof Set) || !(occupiedHeads instanceof Set) || typeof readOriginalSource !== 'function' || typeof loadOriginalEntry !== 'function') fail('complete build inventories/readers');
  const reserved = new Set([...reservedEnglish].map(value => { text(value); return sentenceKey(value); }));
  const occupied = new Set([...occupiedHeads].map(value => { text(value, 200); return canonicalRepairFold(value); }));
  const pinned = pins(releasePins), pack = canonicalRepairSnapshot(inputPack), review = canonicalRepairSnapshot(inputReview);
  exact(pack, ['schemaVersion', 'kind', 'author', 'entries']);
  exact(review, ['schemaVersion', 'sourceSha256', 'reviewer', 'independentOfAuthor', 'decisions', 'issues']);
  principal(pack.author); principal(review.reviewer);
  if (pack.schemaVersion !== 1 || pack.kind !== CANONICAL_REPAIR_KIND || review.schemaVersion !== 1
    || review.independentOfAuthor !== true || pack.author.toLowerCase() === review.reviewer.toLowerCase()
    || review.sourceSha256 !== hash(JSON.stringify(pack)) || !Array.isArray(pack.entries) || !pack.entries.length || pack.entries.length > 100
    || !Array.isArray(review.decisions) || review.decisions.length !== pack.entries.length || !Array.isArray(review.issues) || review.issues.length) fail('exact independent pack approval');
  const decisions = new Map();
  for (const decision of review.decisions) {
    exact(decision, ['term', 'rowSha256', 'decision']); text(decision.term, 200); digest(decision.rowSha256);
    if (decisions.has(decision.term) || decision.decision !== 'approve-canonical-example-repair') fail('duplicate/unsupported decision');
    decisions.set(decision.term, decision);
  }
  const rows = [], seen = new Set();
  for (const row of pack.entries) {
    exact(row, [...ROW_KEYS, ...(Object.hasOwn(row, 'additionalMatchedPairs') ? ['additionalMatchedPairs'] : [])]); text(row.term, 200);
    if (row.kind !== CANONICAL_REPAIR_KIND || seen.has(canonicalRepairFold(row.term)) || occupied.has(canonicalRepairFold(row.term))) fail('duplicate/competing head');
    seen.add(canonicalRepairFold(row.term));
    for (const field of ['canonicalManifestSha256', 'canonicalSourceSha256', 'expectedOriginalEntrySha256', 'retiredOriginalPairSha256', 'replacementPairSha256']) digest(row[field]);
    if (decisions.get(row.term)?.rowSha256 !== hash(JSON.stringify(row))) fail('exact row approval');
    pair(row.replacementPair); pair(row.retiredOriginalPair); oldEntry(row.expectedOriginalEntry);
    if (Object.hasOwn(row, 'additionalMatchedPairs') && (!Array.isArray(row.additionalMatchedPairs)
      || !row.additionalMatchedPairs.length || row.additionalMatchedPairs.length > 7)) fail('bounded nonempty additional pairs');
    const replacements = [row.replacementPair, ...(row.additionalMatchedPairs ?? [])];
    replacements.forEach(pair);
    if (row.retiredOriginalPair.term !== row.term || row.expectedOriginalEntry.term !== row.term || row.replacementPair.term !== row.term) fail('same literal origin/head chain');
    if (!Array.isArray(row.references) || !row.references.length || row.references.length > 10 || new Set(row.references).size !== row.references.length) fail('primary references');
    for (const reference of row.references) { text(reference, 1000); const url = new URL(reference); if (url.protocol !== 'https:' || url.username || url.password) fail('HTTPS reference'); }
    const canonical = await authenticateCanonicalRepairRecord(row, pinned, { readPublicAsset });
    for (const replacement of replacements) if (replacement.term !== row.term || replacement.partOfSpeech !== canonical.partOfSpeech
      || replacement.meaningZh !== canonical.meaning) fail('canonical POS/full meaning');
    if (!equal(row.acceptedDisplayContexts, canonicalRepairDisplayContexts(canonical))) fail('actual raw/formatted contexts');
    exact(row.origin, ['file', 'sourceSha256', 'index']); digest(row.origin.sourceSha256); text(row.origin.file, 200);
    if (!/^batch-\d{4}-[a-z0-9-]+\.json$/u.test(row.origin.file) || !Number.isSafeInteger(row.origin.index) || row.origin.index < 0) fail('origin file/index');
    const originalInput = await readOriginalSource(row.origin.file), original = canonicalRepairSnapshot(originalInput);
    exact(original, ['schemaVersion', 'batchId', 'authorship', 'entries', ...(Object.hasOwn(original, 'author') ? ['author'] : [])]);
    if (exampleSourceHash(original) !== row.origin.sourceSha256 || !equal(original.entries[row.origin.index], row.retiredOriginalPair)) fail('full original source/pair');
    if (!equal(canonicalRepairSnapshot(originalInput), original)) fail('original source mutation');
    const oldInput = await loadOriginalEntry(row.term), old = canonicalRepairSnapshot(oldInput); oldEntry(old);
    if (!equal(canonicalRepairSnapshot(originalInput), original)) fail('original source mutation');
    if (!equal(old, row.expectedOriginalEntry) || hash(JSON.stringify(old)) !== row.expectedOriginalEntrySha256) fail('full original DTO');
    const sense = old.senses[0], retired = { term: old.term, partOfSpeech: sense.partOfSpeech, meaningZh: sense.meaningZh, ...sense.examples[0] };
    if (!equal(retired, row.retiredOriginalPair) || hash(JSON.stringify(retired)) !== row.retiredOriginalPairSha256
      || hash(JSON.stringify(row.replacementPair)) !== row.replacementPairSha256) fail('exact original/replacement pair digest');
    for (const replacement of replacements) {
      if (sentenceKey(replacement.en) === sentenceKey(retired.en) || reserved.has(sentenceKey(replacement.en))) fail('duplicate active English sentence');
      reserved.add(sentenceKey(replacement.en));
    }
    const senseId = `canonical-example:${row.canonicalId}:${row.canonicalSourceSha256}`;
    if (sense.id === senseId) fail('retired sense ID reused');
    rows.push({ term: row.term, canonicalId: row.canonicalId, canonicalSourceSha256: row.canonicalSourceSha256,
      exactCanonicalRecord: canonical, canonicalSourceDescriptor: row.canonicalSourceDescriptor,
      expectedOriginalEntry: old, expectedOriginalEntrySha256: row.expectedOriginalEntrySha256,
      acceptedDisplayContexts: row.acceptedDisplayContexts, replacementPair: row.replacementPair, senseId, reviewer: review.reviewer,
      ...(row.additionalMatchedPairs ? { additionalExamples: row.additionalMatchedPairs.map(({ en, zh }) => ({ en, zh })) } : {}) });
  }
  if (!equal(canonicalRepairSnapshot(inputPack), pack) || !equal(canonicalRepairSnapshot(inputReview), review)) fail('async source/review mutation');
  return frozen(rows);
}

export async function collectCanonicalRepairInventory(root = ROOT) {
  const base = join(root, 'tooling/dictionary/examples'), sentences = new Set(), heads = new Set();
  const reserve = value => { text(value, 1200); sentences.add(sentenceKey(value)); };
  const catalogue = await loadOriginalCatalogue({ indexPath: join(root, 'tooling/dictionary/source/index.json'), reviewDirectory: join(root, 'tooling/dictionary/reviews') });
  for (const entry of catalogue.pack.entries) if (entry.review.status === 'checked') for (const sense of entry.senses) for (const pair of sense.examples) reserve(pair.en);
  const sourceFiles = validateExampleSourceIndex(await json(join(base, 'index.json')));
  const additive = await json(join(base, 'additive-index-v4.json'));
  for (const release of additive.releases) for (const file of release.sourceFiles) {
    if (!/^batch-\d{4}-[a-z0-9-]+\.json$/u.test(file) || sourceFiles.includes(file)) fail('duplicate/unsafe active source file'); sourceFiles.push(file);
  }
  for (const file of sourceFiles) for (const row of validateExampleReview(await json(join(base, 'source', file)), await json(join(base, 'reviews', file)))) reserve(row.en);
  const { EVERYDAY_LOOKUP_ENTRIES } = await import(pathToFileURL(join(root, 'vocab/js/everyday-lookup-data.js')));
  for (const row of EVERYDAY_LOOKUP_ENTRIES) { heads.add(row.term); for (const form of row.forms ?? []) heads.add(form); reserve(row.en); }
  const corrections = await json(join(base, 'corrections/index.json'));
  for (const batch of corrections.batches) {
    if (!FILE.test(batch.sourceFile) || !FILE.test(batch.reviewFile)) fail('unsafe correction source');
    for (const row of independentlyReviewedCorrections(await json(join(base, 'corrections/source', batch.sourceFile)), await json(join(base, 'corrections/reviews', batch.reviewFile)))) { heads.add(row.term); reserve(row.en); }
  }
  return { reservedEnglish: sentences, occupiedHeads: heads };
}
export function serializeCanonicalRepairs(table) {
  if (!Array.isArray(table?.rows) || table.rows.length > MAX_COMPILED_REPAIRS) fail('runtime table capacity (128 heads)');
  return '// Generated from exact independent canonical-example approvals; immutable source assets remain unchanged.\n'
    + 'const deepFreeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };\n'
    + 'export const CANONICAL_EXAMPLE_REPAIRS = deepFreeze(' + JSON.stringify(table, null, 2) + ');\n';
}
export function validateCanonicalRepairIndex(input, releasePins = dictionaryExamplesRelease.source) {
  const index = canonicalRepairSnapshot(input); exact(index, ['schemaVersion', 'kind', 'pins', 'batches']);
  if (index.schemaVersion !== 1 || index.kind !== CANONICAL_REPAIR_KIND || !Array.isArray(index.batches) || index.batches.length > 100) fail('index');
  const pinned = pins(index.pins), expected = pins(releasePins);
  if (pinned.version !== expected.version || pinned.manifestSha256 !== expected.manifestSha256) fail('current pinned release');
  const sources = new Set(), reviews = new Set();
  for (const batch of index.batches) {
    exact(batch, ['sourceFile', 'reviewFile']); text(batch.sourceFile, 200); text(batch.reviewFile, 200);
    if (!FILE.test(batch.sourceFile) || !FILE.test(batch.reviewFile) || sources.has(batch.sourceFile) || reviews.has(batch.reviewFile)) fail('unique safe source/review files');
    sources.add(batch.sourceFile); reviews.add(batch.reviewFile);
  }
  return frozen(index);
}
export async function loadCanonicalExampleRepairBuild({ root = ROOT } = {}) {
  const base = join(root, 'tooling/dictionary/examples/canonical-repairs'), index = validateCanonicalRepairIndex(await json(join(base, 'index.json')));
  const pinned = pins(index.pins);
  if (!equal(pinned, dictionaryExamplesRelease.source)) fail('current pinned release');
  const inventory = await collectCanonicalRepairInventory(root), assets = join(root, 'vocab'), compiled = [], seenFiles = new Set();
  const reader = createAdditiveExamplesLoader(dictionaryExamplesRelease, { fetchImpl: async input => {
    const url = new URL(input), prefix = pathToFileURL(assets + '/').href;
    if (url.protocol !== 'file:' || !url.href.startsWith(prefix)) fail('outside packaged assets');
    return new Response(await readFile(url));
  } });
  try {
    for (const batch of index.batches) {
      exact(batch, ['sourceFile', 'reviewFile']);
      if (!FILE.test(batch.sourceFile) || !FILE.test(batch.reviewFile) || seenFiles.has(batch.sourceFile) || seenFiles.has(`review:${batch.reviewFile}`)) fail('source/review file');
      seenFiles.add(batch.sourceFile); seenFiles.add(`review:${batch.reviewFile}`);
      const rows = await compileCanonicalRepairPack(await json(join(base, 'source', batch.sourceFile)), await json(join(base, 'reviews', batch.reviewFile)), {
        releasePins: pinned, ...inventory,
        readPublicAsset: async path => { if (!/^expanded-dictionary\/(?:manifest\.json|[a-f0-9]{64}\/en-\d{3}\.json)$/u.test(path)) fail('public source path'); return readFile(join(assets, 'data', path)); },
        readOriginalSource: file => json(join(root, 'tooling/dictionary/examples/source', file)),
        loadOriginalEntry: term => reader.load(term, { lookupQuery: term })
      });
      if (compiled.length + rows.length > MAX_COMPILED_REPAIRS) fail('runtime table capacity (128 heads)');
      for (const row of rows) {
        inventory.occupiedHeads.add(row.term); inventory.reservedEnglish.add(sentenceKey(row.replacementPair.en));
        for (const pair of row.additionalExamples ?? []) inventory.reservedEnglish.add(sentenceKey(pair.en)); compiled.push(row);
      }
    }
  } finally { reader.close(); }
  compiled.sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  const table = frozen({ schemaVersion: 1, kind: CANONICAL_REPAIR_KIND, pins: pinned, rows: compiled });
  return { table, source: serializeCanonicalRepairs(table), newExamples: compiled.reduce((sum, row) => sum + 1 + (row.additionalExamples?.length ?? 0), 0),
    inventory: { englishSentences: inventory.reservedEnglish.size, occupiedHeads: inventory.occupiedHeads.size } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await loadCanonicalExampleRepairBuild(), file = join(ROOT, 'vocab/js/canonical-example-repairs-data.js');
  if (process.argv.includes('--check')) { if (await readFile(file, 'utf8') !== result.source) fail('stale generated table'); }
  else await writeFile(file, result.source);
  process.stdout.write(JSON.stringify({ repairs: result.table.rows.length, newExamples: result.newExamples, inventory: result.inventory, check: process.argv.includes('--check') }) + '\n');
}
