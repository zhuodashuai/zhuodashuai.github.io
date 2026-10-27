import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadDictionaryExamples, createDictionaryExamplesController } from '../js/dictionary-examples-current-v4.js';
import { createAdditiveExamplesLoader } from '../js/dictionary-examples-additive.js';
import { dictionaryExamplesRelease } from '../js/dictionary-examples-release-v4.js';
import { loadEverydayExamples } from '../js/everyday-lookup.js';
import { DICTIONARY_EXAMPLE_CORRECTIONS } from '../js/dictionary-example-corrections-data.js';
import { createDictionaryExamplesSection } from '../js/dictionary-examples-ui-v108.js';

const localFetch = async url => new Response(await fs.readFile(new URL(url)));
const noFetch = () => { throw Error('An exact local sense should not fetch'); };
const card = sense => ({ partOfSpeech: sense.partOfSpeech, meaning: sense.meaningZh });

test('saved machine bench press keeps its original bilingual pair while an exact new sports card gets the sports pair', async () => {
  const saved = { term: 'bench press', partOfSpeech: 'noun', meaning: '台式压机', note: 'Keep my old note.' };
  const before = structuredClone(saved), requests = [];
  const fetchImpl = url => { requests.push(url); return localFetch(url); };
  const old = await loadDictionaryExamples(saved.term, { savedEntry: saved, fetchImpl });
  assert.equal(old.senses.length, 1);
  assert.equal(old.senses[0].partOfSpeech, 'noun');
  assert.equal(old.senses[0].meaningZh, '台式压机');
  assert.deepEqual(old.senses[0].examples, [{ en: 'The technician mounted a bench press beside the vise.', zh: '技术员在台钳旁安装了一台台式压机。' }]);
  assert.equal(requests.length, 2);
  assert.deepEqual(saved, before);
  const daily = loadEverydayExamples(saved.term);
  const current = await loadDictionaryExamples(saved.term, { savedEntry: card(daily.senses[0]), fetchImpl: noFetch });
  assert.deepEqual(current, daily);
  assert.notDeepEqual(current.senses[0].examples, old.senses[0].examples);
});

test('saved-sense guard accepts numbered formatting but never guesses from shared words or another POS', async () => {
  const everyday = loadEverydayExamples('bench press'), sense = everyday.senses[0];
  assert.deepEqual(await loadDictionaryExamples('bench press', { fetchImpl: noFetch,
    savedEntry: { partOfSpeech: sense.partOfSpeech, meaning: { zh: sense.meaningZh } } }), everyday);
  assert.deepEqual(await loadDictionaryExamples('bench press', { fetchImpl: noFetch,
    savedEntry: { partOfSpeech: sense.partOfSpeech, meaning: sense.meaningZh.replace(/^①\s*/u, '') } }), everyday);
  for (const savedEntry of [
    { partOfSpeech: 'adjective', meaning: sense.meaningZh },
    { partOfSpeech: sense.partOfSpeech, meaning: '不是卧推；另一种训练动作。' },
    { partOfSpeech: sense.partOfSpeech, meaning: '台式压机和卧推是否相同尚不清楚。' },
    { term: 'bench press' },
  ]) assert.equal(await loadDictionaryExamples('bench press', { savedEntry, fetchImpl: localFetch }), null);
});

test('ordinary search remains head-based and an exact saved everyday definition remains offline', async () => {
  for (const term of ['bench press', 'unsweetened', 'live agent']) {
    const everyday = loadEverydayExamples(term);
    assert.deepEqual(await loadDictionaryExamples(term, { fetchImpl: noFetch }), everyday);
    assert.deepEqual(await loadDictionaryExamples(term, { savedEntry: card(everyday.senses[0]), fetchImpl: noFetch }), everyday);
  }
});

test('saved original source meaning still receives its authenticated reviewed correction', async () => {
  const correction = DICTIONARY_EXAMPLE_CORRECTIONS.find(row => !loadEverydayExamples(row.term));
  assert(correction);
  const archive = createAdditiveExamplesLoader(dictionaryExamplesRelease, { fetchImpl: localFetch });
  const original = await archive.load(correction.term, { lookupQuery: correction.term });
  archive.close();
  const originalSense = original.senses.find(sense => sense.id === correction.senseId);
  const result = await loadDictionaryExamples(correction.term, { savedEntry: card(originalSense), fetchImpl: localFetch });
  const selected = result.senses.find(sense => sense.id === correction.senseId);
  assert.deepEqual(selected.examples[correction.exampleIndex], { en: correction.en, zh: correction.zh });
});

test('controller snapshots saved context, retries it, clears it for normal search and ignores late results', async () => {
  const calls = [], signals = [], pending = [];
  const controller = createDictionaryExamplesController({ load: (term, options) => {
    calls.push({ term, savedEntry: structuredClone(options.savedEntry) }); signals.push(options.signal);
    if (term === 'old') return new Promise(resolve => pending.push(resolve));
    return Promise.resolve(null);
  } });
  const source = { partOfSpeech: 'noun', meaning: '旧义项' };
  const first = controller.show('old', { savedEntry: source });
  source.meaning = '已修改';
  await controller.show('next', { savedEntry: { partOfSpeech: 'verb', meaning: '下一项' } });
  assert.equal(signals[0].aborted, true);
  pending[0]({ term: 'old', senses: [] }); await first;
  assert.equal(controller.getState().term, 'next');
  await controller.retry();
  assert.deepEqual(calls[2].savedEntry, { partOfSpeech: 'verb', meaning: '下一项' });
  assert.deepEqual(calls[0].savedEntry, { partOfSpeech: 'noun', meaning: '旧义项' });
  await controller.show('normal'); assert.equal(calls.at(-1).savedEntry, undefined);
  controller.clear(); assert.equal(controller.getState().phase, 'idle');
  assert.equal(await controller.retry(), false);
});

class Element {
  children = []; dataset = {}; hidden = false; textContent = '';
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener() {}
}
test('actual card UI hands the full saved identity to the optional current controller', async () => {
  let received;
  const saved = { term: 'bench press', partOfSpeech: 'noun', meaning: '台式压机' };
  const view = createDictionaryExamplesSection({ root: { createElement: () => new Element() }, loadModule: async () => ({
    createDictionaryExamplesController: () => ({ clear() {}, show: async (term, options) => { received = { term, options }; return true; } }),
  }) });
  await view.show(saved);
  assert.equal(received.term, saved.term);
  assert.equal(received.options.savedEntry, saved);
});
