import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { loadAdditiveExampleBuild } from '../scripts/build-dictionary-examples-additive.mjs';
import { validateExampleReview } from '../scripts/build-dictionary-examples.mjs';
import { createAdditiveExamplesLoader } from '../../vocab/js/dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from '../../vocab/js/dictionary-examples-release-v4.js';

const build = await loadAdditiveExampleBuild();
const read = file => readFile(new URL('../../' + file, import.meta.url));
const index = JSON.parse(await read('tooling/dictionary/examples/additive-index-v4.json'));
const reviewed = [];
for (const [id, heads, packs] of [['examples-0033', 288, 17], ['examples-0034', 274, 18]]) {
  const release = index.releases.find(row => row.id === id);
  assert(release); assert.equal(release.sourceFiles.length, packs);
  let count = 0;
  for (const file of release.sourceFiles) {
    const source = JSON.parse(await read('tooling/dictionary/examples/source/' + file));
    const review = JSON.parse(await read('tooling/dictionary/examples/reviews/' + file));
    const rows = validateExampleReview(source, review);
    reviewed.push(...rows); count += rows.length;
  }
  assert.equal(count, heads);
}

test('D33/D34 all562 independently reviewed five-cell rows survive the actual normal additive build', async () => {
  assert.equal(reviewed.length, 562); assert.equal(new Set(reviewed.map(row => row.term)).size, 562);
  assert(build.catalogue.counts.heads >= 87262); assert(build.catalogue.counts.examples >= 88651);
  assert.equal(build.audit.retainedWholeBaseEntries, 86415);
  assert.deepEqual(build.descriptor, dictionaryExamplesRelease.catalogue);
  const installed = new Map();
  for (const descriptor of build.catalogue.deltas) {
    const bytes = await read('vocab/data/dictionary-examples/' + descriptor.file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256);
    for (const row of JSON.parse(gunzipSync(bytes)).entries) installed.set(row.term, row);
  }
  for (const row of reviewed) {
    const entry = installed.get(row.term); assert(entry, row.term);
    const sense = entry.example.senses[0], pair = sense.examples[0];
    assert.deepEqual([entry.term, sense.partOfSpeech, sense.meaningZh, pair.en, pair.zh],
      [row.term, row.partOfSpeech, row.meaningZh, row.en, row.zh]);
  }
});

test('the actual strict client returns all562 reviewed bilingual examples only for matching literal queries', async () => {
  const root = new URL('../../vocab/data/', import.meta.url), files = new Map(), requests = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url); assert(target.href.startsWith(root.href));
    assert.equal(target.search, ''); assert.equal(target.hash, ''); assert.equal(options.credentials, 'omit');
    assert(['GET', undefined].includes(options.method));
    if (!files.has(target.href)) files.set(target.href, await readFile(target));
    const bytes = files.get(target.href); requests.push(target.href);
    return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
  };
  const client = createAdditiveExamplesLoader(dictionaryExamplesRelease, { fetchImpl });
  try {
    for (const row of reviewed) {
      const result = await client.load(row.term, { lookupQuery: row.term });
      assert(result, row.term);
      const sense = result.senses[0], pair = sense.examples[0];
      assert.deepEqual([result.term, sense.partOfSpeech, sense.meaningZh, pair.en, pair.zh],
        [row.term, row.partOfSpeech, row.meaningZh, row.en, row.zh]);
      assert.equal(await client.load(row.term), null);
      assert.equal(await client.load(row.term, { lookupQuery: 'different unrelated head' }), null);
    }
    assert(requests.some(url => url.includes('/expanded-dictionary/')));
    assert(requests.some(url => url.includes('/delta-v4/')));
  } finally { client.close(); }
});
