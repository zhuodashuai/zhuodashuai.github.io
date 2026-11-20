import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chineseVariantRank,chineseVariantEvidence} from '../js/chinese-ranking.js';
import {chineseSearchPlan,requiresWholeChineseSourceAtom,matchesWholeChineseSourceAtom} from '../js/chinese-search.js';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';

test('modified excluded nouns cannot become translations, including a second exclusion after contrast',()=>{
 for(const [meaning,query]of [
  ['不是普通手洗洗洁精','洗洁精'],['不特指给手机充电的充电宝','充电宝'],
  ['不是航班值机','值机'],['不是海鲜但也不是普通蔬菜','蔬菜'],
  ['不过于自信','自信'],['不过分自信','自信'],['不过度紧张','紧张'],
 ])assert.equal(chineseVariantRank(meaning,query,'noun phrase'),null,meaning);
 for(const [meaning,query]of [
  ['不是普通清洁剂而是洗洁精','洗洁精'],['不是手洗洗洁精；洗洁精可单独购买','洗洁精'],
  ['不是海鲜但这里指普通蔬菜','蔬菜'],
  ['把钱转到了并非原本打算收款的账户','账户'],
  ['把钱转到了不是原本打算收款的账户','账户'],
 ])assert.notEqual(chineseVariantRank(meaning,query,'noun phrase'),null,meaning);
 for(const query of ['不开心','不高兴','无糖'])assert.equal(chineseVariantRank(query,query,'adjective'),0);
});

test('source match kind is lexical evidence before domain and grammatical penalties',()=>{
 for(const [meaning,query,pos,expectedKind]of [
  ['[化] n. 方差','方差','noun','literal'],
  ['adj. 凉爽的','凉爽','adjective','literal'],
  ['4. noun：（主要为美式）体检，可数。','体检','adjective · noun','literal'],
  ['n. 机器人吸尘器','吸尘器','noun','compound'],
  ['手机充电器；单独的充电线不一定包含充电器','充电线','noun phrase','mention'],
 ]){
  const match=chineseVariantEvidence(meaning,query,pos);
  assert.equal(match.kind,expectedKind,meaning);
  assert.equal(match.rank,chineseVariantRank(meaning,query,pos));
 }
 assert.equal(chineseVariantEvidence('[化] n. 方差','方差','noun').rank,3);
 assert.equal(chineseVariantEvidence('adj. 不开心的','开心','adjective'),null);
});

test('reviewed cross-word source atoms cannot lend 转机 while independent affirmative senses survive',()=>{
 for(const atom of ['旋转机构','倒转机构','倒转机构换向开关']){
  assert.equal(chineseVariantRank(`n. ${atom}`,'转机','noun'),null);
  assert.equal(chineseVariantRank(`① n. ${atom}\n② n. 转机`,'转机','noun'),0.01);
  assert.equal(chineseVariantEvidence(`${atom}；转机服务`,'转机','noun').kind,'compound');
  for(const query of ['机构',atom.slice(0,2),atom])assert.notEqual(chineseVariantRank(atom,query,'noun'),null,atom+': '+query);
 }
 for(const atom of ['转机','转机服务','转机时间','出现转机','等待转机'])assert.notEqual(chineseVariantRank(atom,'转机','noun'),null,atom);
 // No speculative cross-word parser: legitimate compounds elsewhere survive.
 for(const [atom,query]of [['缴纳税款','纳税'],['豁免税款','免税'],['增加热量','加热'],['化学分析','分析']])assert.notEqual(chineseVariantRank(atom,query,'noun'),null,atom);
});

test('single-character suffixes remain compounds instead of creating near-literal synonyms',()=>{
 for(const [meaning,query]of [['荒凉的','凉'],['傲慢的','慢'],['走开的','开'],['清白的','白'],['火红的','红'],['冰冷的','冷'],['炎热的','热']]){
  assert.equal(chineseVariantEvidence(meaning,query,'adjective').kind,'compound');
  assert.equal(chineseVariantRank(meaning,query,'adjective'),2,'metadata correction preserves numeric ranking and source choice');
 }
 for(const query of ['慢','高','开','凉','白','红','热','冷','好','坏'])assert.equal(chineseVariantRank(`${query}的`,query,'adjective'),0);
 for(const query of ['自信','高兴','难过'])assert.equal(chineseVariantEvidence(`很${query}的`,query,'adjective').kind,'literal');
});

test('finite exact-query families carry complete aliases, source roles and no English head shortlists',()=>{
 for(const terms of [['体检','体格检查','健康检查'],['凉快','凉爽'],['会员卡','会员证']]){
  for(const term of terms){const plan=chineseSearchPlan(term);assert.deepEqual(plan,{term,aliases:terms.filter(x=>x!==term)});assert(Object.isFrozen(plan));assert(Object.isFrozen(plan.aliases));assert(requiresWholeChineseSourceAtom(term));}
 }
 for(const term of ['体检','体格检查','健康检查'])assert(requiresWholeChineseSourceAtom(term,{literal:true}));
 for(const term of ['凉快','凉爽','会员卡','会员证'])assert(!requiresWholeChineseSourceAtom(term,{literal:true}));
 assert.equal(chineseSearchPlan('身体健康检查仪'),null);
 assert(matchesWholeChineseSourceAtom('n. 体格检查','体格检查','noun'));
 assert(matchesWholeChineseSourceAtom('n. [网络] 体检','体检','noun'));
 assert(!matchesWholeChineseSourceAtom('n. 尸体检查','体检','noun'));
 assert(!matchesWholeChineseSourceAtom('n. 晶体检波器','体检','noun'));
 assert(!matchesWholeChineseSourceAtom('adj. 健康检查的','健康检查','adjective'));
 assert(matchesWholeChineseSourceAtom('4. noun：（主要为美式）体检，可数。','体检','adjective · noun'));
 assert(!matchesWholeChineseSourceAtom('adj.（主要为美式）体检的','体检','adjective'));
 assert(!matchesWholeChineseSourceAtom('n.（使）体检','体检','noun'));
 assert(matchesWholeChineseSourceAtom('n. 凉爽；adj. 凉爽的','凉爽','noun · adjective'));
 assert(matchesWholeChineseSourceAtom('adj. 凉快的','凉快','adjective'));
 assert(!matchesWholeChineseSourceAtom('n. [网络] 凉爽','凉爽','noun'));
 assert(!matchesWholeChineseSourceAtom('v. 使人感觉凉爽','凉爽','verb'));
 assert(matchesWholeChineseSourceAtom('[法] 会员证','会员证','noun'));
 assert(!matchesWholeChineseSourceAtom('会员证的','会员证','adjective'));
 assert(!matchesWholeChineseSourceAtom('① 俱乐部会员卡的申请表','会员卡','noun phrase'));
});

test('real family recall preserves source DTOs and existing compounds or affirmative relative noun phrases',async()=>{
 const requests=[],fetchImpl=async(url,options)=>{assert.equal(new URL(url).protocol,'file:');assert.equal(options.credentials,'omit');requests.push(String(url));return new Response(await readFile(url));};
 for(const [query,term]of [['凉快','cool'],['会员卡','membership card'],['凉爽','fresh'],['会员证','union card'],['账户','transfer money to the wrong account'],['体检','physical']]){
  const first=await searchExpandedDictionary(query,{fetchImpl,useChineseQueryCache:false,limit:7}),rows=[...first.results];let page=first;
  while(page.hasMore){page=await searchExpandedDictionary(query,{fetchImpl,useChineseQueryCache:false,limit:7,offset:page.nextOffset});rows.push(...page.results);}
  assert.equal(rows.length,first.total);assert.equal(new Set(rows.map(x=>x.term)).size,rows.length);
  const actual=rows.find(x=>x.term===term);assert.ok(actual,query);
  const literal=(await searchExpandedDictionary(term,{fetchImpl})).results[0];
  if(['cool','membership card'].includes(term)){
   for(const field of ['term','partOfSpeech','meaning','source','license','url','alternatives'])assert.deepEqual(actual[field],literal[field],term+': '+field);
  }else{
   const variants=[literal,...(literal.alternatives||[])];
   assert(variants.some(row=>['partOfSpeech','meaning','source','license','url'].every(field=>row[field]===actual[field])),term+': one intact English source variant');
  }
 }
 assert.equal(requests.filter(x=>x.endsWith('.bin')).length,1);
});
