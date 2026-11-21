import test from 'node:test';
import assert from 'node:assert/strict';
import { EVERYDAY_LOOKUP_ENTRIES } from '../js/everyday-lookup-data.js';
import { searchEverydayDictionary, loadEverydayExamples } from '../js/everyday-lookup.js';
import { searchExpandedDictionary } from '../js/expanded-dictionary.js';
import { lookupPersonalDictionaryFast } from '../js/personal-lookup-flow.js';
import { exactSourceCorrectionRows } from '../../tooling/tests/helpers/search-common-terms-history.mjs';
import {exactLifeCommonTermRows,exactMedicalCorrectionRows} from '../../tooling/tests/helpers/life-coverage-history.mjs';
import {historicalCommonEveryday1283} from '../../tooling/tests/helpers/common-followup-history.mjs';
const correctedRows=new Map(exactSourceCorrectionRows(EVERYDAY_LOOKUP_ENTRIES).map(row=>[row.term,row]));
const lifeRows=new Set(exactLifeCommonTermRows(EVERYDAY_LOOKUP_ENTRIES));
const medicalRows=new Map(exactMedicalCorrectionRows(EVERYDAY_LOOKUP_ENTRIES).map(row=>[row.term,row]));

const preciseCases = [
  ['人工客服',['live agent','human agent','customer service representative']],
  ['消毒酒精',['rubbing alcohol','surgical spirit']],
  ['堂食',['eat in']], ['打包带走',['to go']], ['打包剩菜',['box up the leftovers']],
  ['剩菜打包盒',['doggy bag']], ['自取',['pick up an order']], ['自取订单',['pickup order']],
  ['餐食配送',['food delivery']], ['一次性餐具',['disposable tableware']],
  ['一次性刀叉勺',['disposable cutlery']], ['无糖',['sugar-free']],
  ['各付各的',['pay separately']], ['分摊账单',['split the bill']],
  ['扫码支付',['QR code payment']], ['感应付款',['contactless payment']],
  ['购物小票',['receipt']], ['电子发票',['electronic invoice']],
  ['退货',['return an item']], ['部分退款',['partial refund']], ['退款到账',['receive a refund']],
  ['首付',['down payment']], ['押金',['deposit']], ['自动续费',['automatic renewal']],
  ['转机',['change planes']], ['托运行李',['checked baggage']], ['行李托运',['check in baggage']],
  ['值机',['check in for a flight']], ['机场接送',['airport transfer']],
  ['末班车',['last service']], ['末班公交车',['last bus']],
  ['课程表',['class schedule']], ['缺勤',['absence']], ['加班费',['overtime pay']],
  ['居家办公',['work from home']], ['紧急联系人',['emergency contact']],
  ['插线板',['power strip']], ['转换插头',['travel adapter']], ['充电宝',['power bank']],
  ['数据线',['data cable']], ['充电线',['charging cable']], ['网线',['Ethernet cable']],
  ['手机流量',['mobile data']], ['无线网络',['wireless network']], ['WiFi网络',['Wi-Fi network']],
  ['存储空间',['storage space']], ['被套',['duvet cover']],
  ['洗碗机洗涤剂',['dishwasher detergent']], ['抽纸',['facial tissue']],
  ['加湿器',['humidifier']], ['除湿机',['dehumidifier']],
  ['衣物烘干机',['clothes dryer']], ['滚筒烘干机',['tumble dryer']],
  ['说实话',['to be honest']], ['看情况',['it depends']], ['提前通知',['give advance notice']],
  ['我请客',["it's on me"]], ['说慢一点',['speak more slowly']],
  ['公共厕所',['public toilet']], ['无障碍厕所',['accessible toilet']],
  ['食物过敏',['food allergy']], ['润唇膏',['lip balm']],
  ['隐形眼镜',['contact lens']], ['非处方药',['over-the-counter medicine']],
  ['点单',['place an order']], ['结账',['pay the bill','check out']],
  ['银行卡挂失',['report a card as lost']], ['挂失',['report something as lost']],
  ['入住',['check in at a hotel']], ['退房',['check out of a hotel']], ['前台',['front desk']],
  ['租房押金',['security deposit','tenancy deposit']], ['改签',['change a booking']],
  ['充值',['top up an account']], ['电池充电',['charge a battery']], ['停车费',['parking fee']],
  ['护垫',['pantyliner']], ['漱口水',['mouthwash']], ['洗面奶',['facial cleanser']],
  ['钥匙扣',['key ring']], ['便利贴',['sticky note']], ['收纳盒',['storage box']],
  ['空调遥控器',['air conditioner remote control']], ['门禁卡',['access card']],
];

test('common Chinese queries return the intended person, action, product or sense rather than a related mention', async () => {
  const fail = () => { throw Error('A packaged everyday query must not download the large dictionary'); };
  for (const [query, expected] of preciseCases) {
    const result = await searchExpandedDictionary(query, { fetchImpl: fail });
    assert.deepEqual(result.results.map(row => row.term), expected, query);
    const personal = await lookupPersonalDictionaryFast(query, { hotLookup: fail, hotReverse: fail, fullSearch: fail });
    assert.deepEqual(personal, result, `personal: ${query}`);
    const question = searchEverydayDictionary(`请问${query}的英文是什么？`);
    assert.deepEqual(question.results.map(row => row.term), expected, `question: ${query}`);
  }
});

test('qualifiers and unrelated senses cannot be discarded while expanding everyday Chinese queries', () => {
  for (const query of ['不是人工客服','不需要转机','转机的反义词','不退款','无需充电线',
    '有糖','无热量','食物不耐受','处方药','无性别厕所','客房保洁',
    '双倍工资','内存','唇部磨砂','变压器','普通电炉','废品回收站']) {
    assert.equal(searchEverydayDictionary(query), null, query);
  }
  assert.deepEqual(searchEverydayDictionary('药物过敏').results.map(row=>row.term),['drug allergy']);
  // A newly covered neighbouring concept must keep its own meaning rather
  // than borrowing the older class-schedule alias.
  assert.deepEqual(searchEverydayDictionary('课程大纲').results.map(row => row.term), ['syllabus']);
});

test('every listed Chinese alias, English head and genuine form resolves with an original bilingual example', () => {
  const heads = new Set(), examples = new Set();
  let oldAliasChecks=0,exactCorrectionChecks=0,lifeAliasChecks=0,medicalAliasChecks=0;
  for (const row of historicalCommonEveryday1283(EVERYDAY_LOOKUP_ENTRIES)) {
    const key = row.term.toLowerCase();
    assert(!heads.has(key), `duplicate head: ${row.term}`); heads.add(key);
    assert(row.partOfSpeech.trim()); assert.match(row.meaning, /^①/u);
    if(correctedRows.get(row.term)===row){assert.deepEqual(row.chineseAliases,[]);exactCorrectionChecks++;}
    else {assert(row.chineseAliases.length);
      if(lifeRows.has(row)){assert(!row.reviewedCanonicalSense);lifeAliasChecks++;}
      else if(medicalRows.get(row.term)===row)medicalAliasChecks++;
      else oldAliasChecks++;}
    assert(row.en.trim()); assert.match(row.zh, /\p{Script=Han}/u);
    assert(!examples.has(row.en.toLowerCase()), `duplicate example: ${row.term}`); examples.add(row.en.toLowerCase());
    for (const alias of row.chineseAliases) {
      assert(searchEverydayDictionary(alias).results.some(item => item.term === row.term), `${alias}: ${row.term}`);
    }
    for (const form of [row.term, ...row.englishForms]) {
      assert(searchEverydayDictionary(form).results.some(item => item.term === row.term), form);
      const result = loadEverydayExamples(form);
      assert.equal(result.term, row.term, form);
      assert.deepEqual(result.senses[0].examples, [{ en: row.en, zh: row.zh }], form);
      if(correctedRows.get(row.term)===row||medicalRows.get(row.term)===row){
        assert.deepEqual(result.senses,row.exampleSenses.map(sense=>({...sense,reviewer:row.exampleReviewer,source:row.exampleSource})));
      }
    }
  }
  assert.equal(oldAliasChecks,1268);assert.equal(exactCorrectionChecks,3);
  assert.equal(lifeAliasChecks,9);assert.equal(medicalAliasChecks,3);assert.equal(heads.size,1283);
});

test('only the three exactly reviewed corrections have empty aliases and all seven explicit POS/sense/example contexts',()=>{
  assert.deepEqual([...correctedRows.keys()],['disastrous','disconcerting','mortuary']);
  const counts={disconcerting:2,disastrous:2,mortuary:3};let pairCount=0;
  for(const row of correctedRows.values()){
    assert.deepEqual(row.chineseAliases,[]);assert.deepEqual(row.englishForms,[]);
    assert.equal(row.exampleSenses.length,counts[row.term]);
    assert.deepEqual(row.exampleSenses.map(sense=>sense.meaningZh),row.meaning.split('\n'));
    for(const sense of row.exampleSenses){
      assert(row.partOfSpeech.split(' · ').includes(sense.partOfSpeech));assert.equal(sense.examples.length,1);pairCount++;
      assert(row.exampleContexts.some(context=>context.partOfSpeech===sense.partOfSpeech&&context.meaning===sense.meaningZh
        &&JSON.stringify(context.senseIds)===JSON.stringify([sense.id])));
    }
    assert(row.exampleContexts.some(context=>context.partOfSpeech===row.partOfSpeech&&context.meaning===row.meaning
      &&JSON.stringify(context.senseIds)===JSON.stringify(row.exampleSenses.map(sense=>sense.id))));
  }
  assert.equal(pairCount,7);
  const mortuary=correctedRows.get('mortuary'),projection=mortuary.formProjections;
  assert.deepEqual(projection,[{form:'mortuaries',partOfSpeech:'noun',meaning:mortuary.exampleSenses.slice(0,2).map(sense=>sense.meaningZh).join('\n'),
    exampleSenseIds:mortuary.exampleSenses.slice(0,2).map(sense=>sense.id)}]);
});

test('the separate three approved medical corrections retain typed aliases and their complete single-sense contexts',()=>{
  assert.deepEqual([...medicalRows.keys()],['anaphylactic','anaphylactoid','anaphylaxis']);
  assert.deepEqual([...medicalRows.values()].map(row=>row.partOfSpeech),['adjective','adjective','noun']);
  assert.deepEqual([...medicalRows.values()].map(row=>row.chineseAliases),[
    ['严重全身性过敏反应的'],['类似严重过敏反应的','类过敏反应的'],['严重全身性过敏反应','全身性严重过敏反应']]);
  for(const row of medicalRows.values()){
    assert.deepEqual(row.englishForms,[]);assert(!Object.hasOwn(row,'formProjections'));
    const id=`reviewed-source-correction:${row.term}:1`;
    assert.deepEqual(row.exampleSenses,[{id,partOfSpeech:row.partOfSpeech,meaningZh:row.meaning,examples:[{en:row.en,zh:row.zh}]}]);
    assert.deepEqual(row.exampleContexts,[{partOfSpeech:row.partOfSpeech,meaning:row.meaning,senseIds:[id]}]);
    for(const alias of ['过敏','过敏反应','过敏性休克','过敏原','中毒反应'])assert(!row.chineseAliases.includes(alias));
  }
});
