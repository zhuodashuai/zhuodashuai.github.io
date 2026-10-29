import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { EVERYDAY_LOOKUP_ENTRIES, EVERYDAY_CHINESE_ALIASES } from '../js/everyday-lookup-data.js';
import { searchEverydayDictionary, loadEverydayExamples } from '../js/everyday-lookup.js';
import { searchExpandedDictionary } from '../js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../js/personal-lookup-flow.js';

const noNetwork = () => { throw Error('An exact daily result must not fetch a shard or provider'); };
const heads = query => searchEverydayDictionary(query)?.results.map(row => row.term) || [];

test('common daily meanings take priority over technical mentions and different actions at both entry points', async () => {
  const cases = [
    ['后背', 'back', ['back porch']],
    ['磨牙', "grind one's teeth", ['molar', 'airbrasive']],
    ['中火', 'medium heat', ['zero in on', 'concentrated fire']],
    ['香油', 'sesame oil', ['ointment', 'peppermint oil']],
    ['焯水', 'blanch', ['bleach']],
    ['接机', 'pick someone up at the airport', ['riveting machine']],
    ['送机', 'take someone to the airport', ['conveyor']],
    ['压缩文件', 'compress files', ['expand', 'decompress']],
    ['清除缓存', 'clear the cache', ['clear browsing history']],
    ['开户', 'open a bank account', ['account holder']],
    ['销户', 'close a bank account', ['open a bank account']],
    ['候诊室', 'waiting room', ['receptionist']],
    ['深蹲', 'squat', ['squatter']],
    ['体感温度', 'feels-like temperature', ['humidity']],
    ['倒时差', 'get over jet lag', ['time difference']],
    ['秋裤', 'long johns', ['jeans']],
    ['卸妆水', 'cleansing water', ['liquid makeup remover', 'shower gel']],
    ['护发素', 'hair conditioner', ['shampoo']],
    ['小票', 'receipt', ['paper invoice']],
    ['连帽衫', 'hoodie', ['jacket']],
    ['洗面液', 'facial cleanser', ['shower gel']],
    ['断货', 'out of stock', ['discontinued']],
  ];
  for (const [query, expected, excluded] of cases) {
    const direct = await searchExpandedDictionary(query, { fetchImpl: noNetwork });
    assert.equal(direct.results[0].term, expected, query);
    for (const other of excluded) assert(!heads(query).includes(other), `${query}: ${other}`);
    assert.deepEqual(await lookupPersonalDictionaryFast(query, {
      hotLookup: noNetwork, hotReverse: noNetwork, fullSearch: noNetwork
    }), direct, query);
    assert.equal(heads(`请问${query}的英文是什么？`)[0], expected, query);
  }
});

test('new Chinese names retain the exact old entry and its example identity', () => {
  assert(EVERYDAY_CHINESE_ALIASES.length);
  const targets = new Set();
  for (const record of EVERYDAY_CHINESE_ALIASES) {
    const row = EVERYDAY_LOOKUP_ENTRIES.find(item => item.term === record.term);
    assert(row, record.term); assert(!targets.has(record.term)); targets.add(record.term);
    assert.equal(createHash('sha256').update(JSON.stringify(row)).digest('hex'), record.targetEntrySha256, record.term);
    const example = loadEverydayExamples(row.term);
    for (const alias of record.aliases) {
      assert(searchEverydayDictionary(alias).results.some(result => result.term === row.term), alias);
      assert.deepEqual(loadEverydayExamples(searchEverydayDictionary(alias).results.find(result => result.term === row.term).term), example);
      assert.equal(searchEverydayDictionary(`不是${alias}`), null);
      assert.equal(searchEverydayDictionary(`${alias}和其他东西`), null);
    }
  }
});

test('a partial shell refresh can read old data without the extra-alias export', async () => {
  const oldRow = EVERYDAY_LOOKUP_ENTRIES.find(row => row.term === 'live agent');
  const oldData = 'data:text/javascript,' + encodeURIComponent('export const EVERYDAY_LOOKUP_ENTRIES = ' + JSON.stringify([oldRow]) + ';');
  const currentCode = await readFile(new URL('../js/everyday-lookup.js', import.meta.url), 'utf8');
  const legacyCompatible = currentCode.replace('"./everyday-lookup-data.js"', JSON.stringify(oldData))
    .replace('"./dictionary-literal-heads-data.js"', JSON.stringify(new URL('../js/dictionary-literal-heads-data.js', import.meta.url).href));
  const module = await import('data:text/javascript,' + encodeURIComponent(legacyCompatible));
  assert.equal(module.searchEverydayDictionary('人工客服').results[0].term, 'live agent');
  assert.deepEqual(module.loadEverydayExamples('live agent'), loadEverydayExamples('live agent'));
});

test('a new form does not steal an independent lexical head or discard a qualifier', async () => {
  const fetchImpl = async input => new Response(await readFile(new URL(input)));
  for (const term of ['lay in', 'blistering', 'muted']) {
    assert.equal(searchEverydayDictionary(term), null, term);
    assert.equal((await searchExpandedDictionary(term, { fetchImpl })).results[0].term, term);
  }
  for (const query of ['不是后背', '不要注销账户', '非处方药的反义词', '磨牙的反义词',
    '接机和送机', '取消压缩文件', '无糖芝麻酱', '液体卸妆产品', '你方便吗']) {
    assert.equal(searchEverydayDictionary(query), null, query);
  }
});
