import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { searchEverydayDictionary } from '../js/everyday-lookup.js';
import { searchExpandedDictionary } from '../js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../js/personal-lookup-flow.js';

const heads = query => searchEverydayDictionary(query)?.results.map(row => row.term) || [];
const noRequest = () => { throw Error('A packaged everyday result must not wait for an index or provider'); };

test('household objects, device functions and their different uses stay separate', async () => {
  const cases = [
    ['床笠', 'fitted sheet', '床垫', ['duvet', 'duvet cover']],
    ['枕芯', 'pillow insert', '内芯', ['pillowcase']],
    ['人字拖', 'flip-flop', '脚趾', ['slipper']],
    ['蓝牙配对', 'pair a Bluetooth device', '配对', ['unpair a Bluetooth device']],
    ['取消蓝牙配对', 'unpair a Bluetooth device', '取消', ['pair a Bluetooth device']],
    ['共享屏幕', 'screen sharing', '共享', ['screen mirroring']],
    ['烟雾报警器', 'smoke alarm', '烟雾', ['carbon monoxide alarm']],
    ['一氧化碳报警器', 'carbon monoxide alarm', '一氧化碳', ['smoke alarm']],
    ['鞋垫', 'insole', '鞋', ['sock']],
    ['漏水', 'water leak', '泄出', ['slack']],
    ['衣服缩水', 'shrink', '缩水', ['anhydrosynthesis']],
  ];
  for (const [query, head, definition, excluded] of cases) {
    const found = await searchExpandedDictionary(query, { fetchImpl: noRequest });
    assert.deepEqual(found.results.map(row => row.term), [head], query);
    assert(found.results[0].meaning.includes(definition), query);
    for (const wrong of excluded) assert(!heads(query).includes(wrong), `${query}: ${wrong}`);
    assert.deepEqual(await lookupPersonalDictionaryFast(query, {
      hotLookup: noRequest, hotReverse: noRequest, fullSearch: noRequest
    }), found, `personal: ${query}`);
  }
});

test('Latin case and fullwidth letters in a Chinese query do not change its entire meaning', () => {
  for (const query of ['wifi网络', 'WiFi网络', 'WIFI网络', 'ＷｉＦｉ网络', '请问wifi网络的英文是什么？']) {
    assert.deepEqual(heads(query), ['Wi-Fi network'], query);
  }
  for (const query of ['usb充电头', 'USB充电头', 'ＵＳＢ充电头', '请问usb充电头的英文怎么说？']) {
    assert.deepEqual(heads(query), ['USB power adapter'], query);
  }
  for (const query of ['不要usb充电头', 'usb充电头的反义词', '没有wifi网络',
    '取消蓝牙配对失败', '不是共享屏幕', '烟雾报警器和一氧化碳报警器']) {
    assert.equal(searchEverydayDictionary(query), null, query);
  }
});

test('food, transport, study and account phrases preserve the specific object, direction and participant', async () => {
  const cases = [
    ['全熟', 'well-done', ['braised']],
    ['选课', 'course registration', ['advisee']],
    ['先修课', 'prerequisite course', ['advanced-placement']],
    ['餐盘', 'dinner plate', ['patina', 'paten']],
    ['免费续杯', 'free refill', ['refill']],
    ['无乳糖牛奶', 'lactose-free milk', ['oat milk']],
    ['两人桌', 'table for two', ['restaurant waiting list']],
    ['注销账号', 'delete an account', ['sign out']],
    ['退出登录', 'sign out', ['delete an account']],
    ['退款被拒', 'be denied a refund', ['deny a refund']],
    ['拒绝退款', 'deny a refund', ['be denied a refund']],
    ['银行卡争议退单', 'chargeback', ['refund']],
    ['付款方式', 'payment method', ['installment plan']],
    ['快递柜', 'parcel locker', ['luggage locker']],
    ['行李寄存柜', 'luggage locker', ['parcel locker']],
    ['预约取件', 'schedule a parcel pickup', ['pickup order']],
    ['换大一码', 'exchange for the next size up', ['exchange for a larger size']],
    ['换小一码', 'exchange for the next size down', ['exchange for a smaller size']],
  ];
  for (const [query, head, excluded] of cases) {
    const result = await searchExpandedDictionary(query, { fetchImpl: noRequest });
    assert.deepEqual(result.results.map(row => row.term), [head], query);
    for (const wrong of excluded) assert(!heads(query).includes(wrong), `${query}: ${wrong}`);
    assert.deepEqual(await lookupPersonalDictionaryFast(query, {
      hotLookup: noRequest, hotReverse: noRequest, fullSearch: noRequest
    }), result, query);
  }
});

test('a declared verb form cannot shadow the separate canonical adjective muted', async () => {
  assert.equal(searchEverydayDictionary('muted'), null);
  const fetchImpl = async input => new Response(await readFile(new URL(typeof input === 'string' || input instanceof URL ? input : input.url)));
  const found = await searchExpandedDictionary('muted', { fetchImpl });
  assert.equal(found.results[0].term, 'muted');
  assert.match(found.results[0].partOfSpeech, /adjective/u);
  const personal = await lookupPersonalDictionaryFast('muted', {
    hotLookup: async () => null,
    fullSearch: (query, options) => searchExpandedDictionary(query, { ...options, fetchImpl })
  });
  assert.deepEqual(personal, found);
  assert.equal(heads('静音')[0], 'mute');
  assert.equal(heads('muting')[0], 'mute');
});
