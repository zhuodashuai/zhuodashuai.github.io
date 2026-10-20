import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chineseSearchPlan, chineseSearchHeads, matchesChineseSearchMeaning, matchesChineseSearchEntry } from "../js/chinese-search.js";
import { COMMON_CHINESE_GROUPS } from "../js/chinese-related-common.js";
const approvedCommonTerms = new Set(COMMON_CHINESE_GROUPS.flatMap(group => group.terms));

const batch003 = JSON.parse(readFileSync(new URL("../../tooling/dictionary/chinese-related-003.json", import.meta.url), "utf8"));
const batch004 = JSON.parse(readFileSync(new URL("../../tooling/dictionary/chinese-related-004.json", import.meta.url), "utf8"));
const groups = [
  ["开心", "高兴", "快乐", "愉快"], ["不开心", "不快乐", "不高兴"],
  ["难过", "伤心", "悲伤", "悲哀"], ["愤怒", "恼怒", "恼火"],
  ["害怕", "恐惧", "惧怕", "畏惧"], ["担心", "担忧", "忧虑", "发愁"],
  ["疲倦", "疲劳", "疲乏", "疲累"], ["困倦", "欲睡", "想睡"],
  ["聪明", "聪慧", "聪颖", "伶俐"], ["愚蠢", "愚笨"], ["勇敢", "英勇", "无畏"],
  ["有礼貌", "礼貌", "有礼", "客气"], ["美味", "好吃", "可口"],
  ["快速", "迅速", "飞快", "急速"], ["缓慢", "迟缓", "慢速"],
  ["干净", "清洁", "洁净"], ["肮脏", "污秽"], ["帮助", "帮忙", "协助", "援助"],
  ["开始", "起始", "开端"], ["结束", "终结", "终止"], ["喜欢", "喜爱"],
  ["讨厌", "厌恶", "嫌恶"], ["正确", "无误"], ["昂贵", "高价", "价高"],
  ["医生", "医师", "大夫"], ["教师", "教员", "老师"], ["儿童", "孩童", "小孩", "孩子"],
  ["婴儿", "婴孩", "宝宝"], ["朋友", "友人"], ["购买者", "买家", "买主"],
  ["寻找", "搜寻", "寻觅"], ["询问", "问询"], ["回答", "答复"], ["购买", "购置", "买"],
  ["出售", "卖出", "卖"], ["修理", "修缮", "维修"], ["巨大", "庞大"], ["微小", "细小"],
  ["困难", "艰难"], ["漂亮", "美丽", "秀丽"], ["惊讶", "惊奇", "诧异"], ["嫉妒", "妒忌"],
  ["谨慎", "慎重", "审慎"], ["准确", "精确", "确切"], ["相似", "类似", "相像"],
  ["不同", "相异", "有别"], ["理解", "领会", "领悟"], ["抱怨", "埋怨"], ["允许", "准许", "许可"],
  ["拒绝", "谢绝"], ["害羞", "羞怯", "腼腆"], ["著名", "有名", "知名"], ["错误", "差错"],
  ["安慰", "慰藉", "抚慰"],
  ...batch003.groups.map(group => group.terms),
  ...batch004.groups.map(group => group.terms),
];

test("all curated Chinese groups are unique, bounded, reciprocal and immutable", () => {
  assert.equal(groups.length, 114);
  const seen = new Set();
  for (const group of groups) {
    assert.ok(group.length >= 2 && group.length <= 4);
    for (const term of group) {
      assert.ok(!seen.has(term), term); seen.add(term);
      const plan = chineseSearchPlan(term);
      assert.deepEqual(plan, { term, aliases: group.filter(alias => alias !== term) });
      assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.aliases));
      assert.ok(plan.aliases.length <= 3); assert.ok(!plan.aliases.includes(term));
      assert.throws(() => plan.aliases.push("错误关联"), TypeError);
      assert.throws(() => { plan.term = "修改"; }, TypeError);
      assert.equal(chineseSearchPlan(` ${term} `), plan);
      assert.equal(chineseSearchPlan(`${term}的`), plan);
      assert.equal(chineseSearchPlan(`${term}地`), plan);
    }
  }
});

test("batch 003 table, reciprocal plans and immutable lexical shortlists stay in sync", () => {
  assert.equal(batch003.schemaVersion, 1);
  assert.equal(batch003.id, "chinese-related-003");
  assert.equal(batch003.start, 55);
  assert.equal(batch003.groups.length, 30);
  for (const [index, group] of batch003.groups.entries()) {
    assert.equal(group.number, 55 + index);
    assert.ok(group.terms.length >= 2 && group.terms.length <= 4);
    assert.ok(group.heads.length >= 2 && group.heads.length <= 5);
    assert.equal(new Set(group.heads).size, group.heads.length);
    assert.ok(group.forbidden.length >= 1);
    assert.ok(group.note.trim());
    const sharedHeads = chineseSearchHeads(group.terms[0]);
    assert.deepEqual(sharedHeads, group.heads);
    assert.ok(Object.isFrozen(sharedHeads));
    assert.throws(() => sharedHeads.push("unchecked"), TypeError);
    for (const term of group.terms) {
      assert.equal(chineseSearchHeads(term), sharedHeads);
      assert.deepEqual(chineseSearchPlan(term).aliases, group.terms.filter(alias => alias !== term));
      assert.equal(chineseSearchHeads(`${term}的`), null, "shortlist keys are exact canonical terms");
      for (const head of group.forbidden) {
        assert.ok(!group.heads.includes(head));
        assert.equal(matchesChineseSearchEntry(head, `a. ${term}的`, term), false, `${term}: ${head}`);
        assert.equal(matchesChineseSearchEntry(head, `n. ${term}`, term), false, `${term}: ${head}`);
      }
    }
  }
});

test("batch 003 shortlists never substitute for independent source evidence", () => {
  for (const group of batch003.groups) for (const term of group.terms) {
    for (const head of group.heads) {
      assert.equal(matchesChineseSearchEntry(head, "无关的原有释义", term), false, `${term}: ${head}`);
      assert.equal(matchesChineseSearchEntry(head, `a. 不${term}的`, term), false, `${term}: ${head}`);
      assert.equal(matchesChineseSearchEntry(head, `vt. 使${term}`, term), false, `${term}: ${head}`);
      assert.equal(matchesChineseSearchEntry(head, `用于讨论${term}这一概念`, term), false, `${term}: ${head}`);
      assert.ok(matchesChineseSearchEntry(head, term, term), `${term}: ${head}`);
    }
  }
  assert.equal(matchesChineseSearchEntry("condescend", "vi. 谦逊", "谦逊"), false);
  assert.equal(matchesChineseSearchEntry("autistic", "a. 孤独的", "孤独"), false);
  assert.equal(matchesChineseSearchEntry("promotion", "n. 创建", "创建"), false);
  assert.equal(matchesChineseSearchEntry("W", "n. 等待", "等待"), false);
  assert.equal(chineseSearchHeads("unconfigured"), null);
});

test("batch 004 table, reciprocal plans and immutable lexical shortlists stay in sync", () => {
  assert.equal(batch004.schemaVersion, 1);
  assert.equal(batch004.id, "chinese-related-004");
  assert.equal(batch004.start, 85);
  assert.equal(batch004.groups.length, 30);
  for (const [index, group] of batch004.groups.entries()) {
    assert.equal(group.number, 85 + index);
    assert.ok(group.terms.length >= 2 && group.terms.length <= 4);
    assert.ok(group.heads.length >= 2 && group.heads.length <= 5);
    assert.equal(new Set(group.heads).size, group.heads.length);
    assert.equal(group.forbidden.length, 2);
    assert.ok(group.note.trim());
    const sharedHeads = chineseSearchHeads(group.terms[0]);
    assert.deepEqual(sharedHeads, group.heads);
    assert.ok(Object.isFrozen(sharedHeads));
    assert.throws(() => sharedHeads.push("unchecked"), TypeError);
    for (const term of group.terms) {
      assert.equal(chineseSearchHeads(term), sharedHeads);
      assert.deepEqual(chineseSearchPlan(term).aliases, group.terms.filter(alias => alias !== term));
      assert.equal(chineseSearchHeads(`${term}的`), null, "shortlist keys are exact canonical terms");
      for (const head of group.forbidden) {
        assert.ok(!group.heads.includes(head));
        assert.equal(matchesChineseSearchEntry(head, `a. ${term}的`, term), false, `${term}: ${head}`);
        assert.equal(matchesChineseSearchEntry(head, `n. ${term}`, term), false, `${term}: ${head}`);
      }
    }
  }
});

test("batch 004 shortlists preserve source evidence, grammatical roles and separate senses", () => {
  for (const group of batch004.groups) for (const term of group.terms) for (const head of group.heads) {
    assert.equal(matchesChineseSearchEntry(head, "无关的原有释义", term), false, `${term}: ${head}`);
    assert.equal(matchesChineseSearchEntry(head, `a. 不${term}的`, term), false, `${term}: ${head}`);
    assert.equal(matchesChineseSearchEntry(head, `vt. 使${term}`, term), false, `${term}: ${head}`);
    assert.equal(matchesChineseSearchEntry(head, `用于讨论${term}这一概念`, term), false, `${term}: ${head}`);
    assert.ok(matchesChineseSearchEntry(head, term, term), `${term}: ${head}`);
  }
  assert.ok(matchesChineseSearchEntry("patient", "adjective：有耐心的；能平静等待的。", "有耐心"));
  assert.equal(matchesChineseSearchEntry("patient", "noun：病人", "耐心"), false);
  assert.equal(matchesChineseSearchEntry("cold", "adjective：寒冷的", "冷淡"), false);
  assert.equal(matchesChineseSearchEntry("content", "noun：内容", "满足"), false);
  assert.equal(matchesChineseSearchEntry("promise", "verb：预示", "诺言"), false);
  assert.equal(matchesChineseSearchEntry("incite", "vt. 激励", "激励"), false);
  for (const term of ["好问", "焦虑", "赞同", "认可", "提示"]) {
    if (approvedCommonTerms.has(term)) assert.equal(chineseSearchPlan(term)?.term, term);
    else assert.equal(chineseSearchPlan(term), null);
  }
});

test("only complete approved queries expand; related concepts do not form an uncontrolled graph", () => {
  for (const query of ["", null, {}, 1, "happy", "happy开心", "开 心", "开心果", "很开心", "开心一点",
    "使高兴", "令人愉快", "不太高兴", "未必快乐", "快乐主义", "不喜欢", "不安全", "安全", "可靠",
    "便宜", "吝啬", "生气", "好看", "难看", "安静", "简单", "回复", "大方", "关键", "记住", "开心的的", "\u202e开心", "开心\u0000",
    "开".repeat(51), "开心，", "“开心”"]) {
    if (approvedCommonTerms.has(query)) assert.equal(chineseSearchPlan(query)?.term, query);
    else assert.equal(chineseSearchPlan(query), null, String(query));
  }
  assert.deepEqual(chineseSearchPlan("喜欢").aliases, ["喜爱"]);
  assert.ok(!chineseSearchPlan("喜欢").aliases.includes("爱情"));
  assert.ok(!chineseSearchPlan("开心").aliases.includes("幸福"));
  assert.ok(!chineseSearchPlan("美味").aliases.includes("香味"));
});

test("reviewed medical heads are a bounded immutable shortlist, not hints for arbitrary queries", () => {
  const heads = chineseSearchHeads("医生");
  assert.deepEqual(heads, ["doctor", "physician", "medical man", "practitioner", "medic", "medico"]);
  assert.ok(Object.isFrozen(heads)); assert.equal(chineseSearchHeads("医师"), heads);
  assert.equal(chineseSearchHeads("大夫"), heads);
  for (const value of [null, {}, "", "医生的", "doctor", "外科医生", "教师", "护士"]) assert.equal(chineseSearchHeads(value), null);
});

test("single-character trade aliases use reviewed heads rather than an unbounded compound scan", () => {
  for (const term of ["购买", "购置", "买"]) {
    assert.deepEqual(chineseSearchHeads(term), ["buy", "purchase"]);
    assert.ok(Object.isFrozen(chineseSearchHeads(term)));
  }
  for (const term of ["出售", "卖出", "卖"]) assert.deepEqual(chineseSearchHeads(term), ["sell", "vend", "sale", "for sale"]);
  assert.ok(matchesChineseSearchEntry("sell", "v. 卖, 销售", "卖"));
  assert.ok(!matchesChineseSearchEntry("buyer", "n. 买主", "买"));
  assert.ok(!matchesChineseSearchEntry("seller", "n. 卖主", "卖"));
});

test("negative emotions have a separate exact family rather than losing their negation", () => {
  for (const negative of ["不开心", "不高兴", "不快乐"]) {
    const plan = chineseSearchPlan(negative);
    assert.ok(plan.aliases.every(alias => alias.startsWith("不")));
    assert.ok(!plan.aliases.includes("开心"));
    assert.ok(!plan.aliases.includes("悲伤"));
    assert.ok(matchesChineseSearchMeaning("a. 不快乐的, 不幸的, 不适当的", "不快乐"));
    assert.ok(!matchesChineseSearchMeaning("a. 快乐的, 愉快的", negative));
  }
  assert.ok(!matchesChineseSearchMeaning("a. 不快乐的, 不高兴的", "快乐"));
  assert.ok(!matchesChineseSearchMeaning("a. 不快乐的, 不高兴的", "高兴"));
});

test("whole definition atoms support POS labels, numbering, domains and genuine separators", () => {
  for (const [meaning, term] of [
    ["a. 快乐的, 幸福的", "快乐"], ["a. 快乐的，幸福的", "快乐"],
    ["1. adjective：高兴的；满足而愉快的。", "高兴"],
    ["① 高兴的；② 愉快的", "高兴"], ["① 高兴的；② 愉快的", "愉快"],
    ["(1) adj. 高兴的", "高兴"], ["二、adjective: 高兴的", "高兴"],
    ["[心理] adj. 高兴的", "高兴"], ["adj. [口语] 高兴的", "高兴"],
    ["n. & v. 帮忙", "帮忙"], ["adjective · noun: 愉快的", "愉快"],
    ["形容词：愉快的", "愉快"], ["愉快", "愉快"], ["愉快地", "愉快"],
    ["n. 别的意思\r\na. 愉快的", "愉快"], ["a. 别的意思。愉快的", "愉快"],
    ["v. 开始；起始", "起始"], ["a. 无误的", "无误"], ["a. 无畏的", "无畏"],
    ["a. 高兴的（口语）", "高兴"], ["快乐的（用于人的情绪，非技术术语）", "快乐"],
    ["快乐的 [口语]", "快乐"], ["愉快的【文学用语】", "愉快"],
    ["快乐的.", "快乐"], ["[医] 欲睡的", "欲睡"],
    ["noun (countable): 医生", "医生"], ["noun (uncountable)：疾病", "疾病"],
    ["noun (countable or uncountable)：疾病", "疾病"], ["noun (uncountable or countable): 教师", "教师"],
    ["noun (countable) · verb: 帮助", "帮助"],
  ]) assert.ok(matchesChineseSearchMeaning(meaning, term), `${term}: ${meaning}`);
});

test("Chinese emotion atoms cannot silently change polarity or grammatical roles", () => {
  const meanings = ["a. 不高兴的", "a. 不快乐的", "a. 不愉快的", "vt. 使高兴", "使人高兴的",
    "令人愉快的", "令人高兴的", "让人高兴的", "(使)高兴", "[使]高兴", "高兴（使某人）",
    "高兴（不开心）", "高兴起来", "感到高兴", "满足而愉快的", "愉快而幸福的", "不是快乐的"];
  for (const meaning of meanings) for (const term of ["高兴", "快乐", "愉快"]) {
    assert.ok(!matchesChineseSearchMeaning(meaning, term), `${term}: ${meaning}`);
  }
  // A word with an independent state sense remains eligible even if a later
  // sense is causative; excluding its entire record would lose delight/jolly.
  assert.ok(matchesChineseSearchMeaning("n. 高兴, 愉快\nvt. 使高兴\nvi. 感到高兴", "高兴"));
  assert.ok(matchesChineseSearchMeaning("a. 高兴的\nvt. 使高兴", "高兴"));
});

test("compound nouns, mentions in explanations, and loose overlaps are not synonym definitions", () => {
  for (const [meaning, term] of [
    ["n. 开心果/阿月浑子果", "开心"], ["n. 快乐主义者, 享乐主义者", "快乐"],
    ["因为高兴或紧张而不假思索地脱口而出", "高兴"],
    ["常用来谈喜爱、悲伤、善意或勇气等情感", "悲伤"],
    ["粉丝来信；喜爱、支持某位公众人物的人写给对方的信件。", "喜爱"],
    ["① 把不愉快的事放到一边，继续向前", "愉快"],
    ["n. 不高兴的人", "高兴"], ["n. 帮助者", "帮助"], ["n. 高价商品", "高价"],
    ["a. 很高兴的", "高兴"], ["a. 感到非常高兴的", "高兴"], ["a. 有礼貌而愉快的", "愉快"],
    ["n. 讨厌的人", "讨厌"], ["adj. 善于帮助他人的", "帮助"],
    ["安全的", "可靠"], ["可靠的", "安全"], ["吝啬的", "便宜"], ["便宜的", "吝啬"],
    ["爱情", "喜欢"], ["爱好的", "喜欢"], ["简单的", "容易"], ["困倦的", "疲倦"],
  ]) assert.ok(!matchesChineseSearchMeaning(meaning, term), `${term}: ${meaning}`);
});

test("malformed inputs and operator-like annotations fail closed without throwing", () => {
  for (const meaning of [null, {}, 1, "", "高兴\u202e", "高兴\u0000", "开".repeat(20_001),
    "高兴（口语", "高兴[口语", "高兴【口语", "高兴（令人）", "高兴[使人]", "高兴的的",
    "高兴（不）", "高兴（不愉快）", "高兴（未）", "高兴（无）", "高兴（非）"]) {
    assert.equal(matchesChineseSearchMeaning(meaning, "高兴"), false, String(meaning));
  }
  for (const term of [null, {}, "", "happy", "高兴.*", "高 兴", "开".repeat(51)]) {
    assert.equal(matchesChineseSearchMeaning("a. 高兴的", term), false, String(term));
  }
});

test("people are not their adjectival derivatives even when the query accepts a final particle", () => {
  for (const [term, meaning] of [
    ["教师", "a. 教师的, 教学法的, 适宜于教师的"], ["儿童", "[医] 儿童的, 幼稚的"],
    ["婴儿", "a. 婴儿的, 幼稚的"], ["朋友", "a. 朋友的"], ["医师", "a. 医师的"],
    ["医生", "医生地"], ["购买者", "购买者的"],
  ]) assert.equal(matchesChineseSearchMeaning(meaning, term), false, `${term}: ${meaning}`);
  for (const term of ["医生", "教师", "儿童", "婴儿", "朋友", "购买者"]) {
    assert.equal(chineseSearchPlan(term + "的").term, term);
    assert.equal(chineseSearchPlan(term + "地").term, term);
    assert.ok(matchesChineseSearchMeaning(`noun (countable): ${term}`, term));
  }
  assert.ok(matchesChineseSearchMeaning("a. 美丽的", "美丽"));
});

test("only explicit countability labels may be stripped, not arbitrary bracketed operators", () => {
  for (const meaning of ["noun (使): 高兴", "noun (使人): 高兴", "noun (not): 高兴",
    "noun (anything): 高兴", "noun (countable; 使): 高兴", "noun (countable) (使): 高兴",
    "noun (countable or uncountable) (不): 高兴", "noun (countable or uncountable): 高兴（使人）"]) {
    assert.equal(matchesChineseSearchMeaning(meaning, "高兴"), false, meaning);
  }
});

test("modern doctor suggestions reject wrong-source, specialist, other-profession and mythological shortcuts", () => {
  for (const [head, meaning] of [
    ["doctor", "n. 医生, 博士"], ["physician", "n. 医师, 内科医师"],
    ["medical man", "医生"], ["practitioner", "[医] 行医者, 医师"],
    ["medic", "n. 苜蓿属植物, 医师, 医科学生"], ["medico", "n. 医师, 医科学生"],
  ]) assert.ok(matchesChineseSearchEntry(head, meaning, meaning.includes("医师") ? "医师" : "医生"), head);
  for (const [head, meaning] of [
    ["medical", "n. 医生, 体格检查"], ["Aesculapian", "医神艾斯库累普的, 医生"],
    ["Aesculapius", "n. 医神埃斯科拉庇俄斯, 医师"], ["healer", "[医] 治病者, 医生, 江湖医"],
    ["medicine man", "医生, 开业医生, 巫医"], ["pill roller", "医生, 药剂师"],
    ["Dr", "n. 博士, 医生"], ["nurse", "n. 护士, 保姆"], ["pharmacist", "n. 药剂师"],
    ["Ph.D.", "哲学博士"], ["surgeon", "n. 外科医生"], ["appointment", "n. 预约医生的时间"],
    ["examination", "n. 医生进行的检查"], ["treatment", "n. 治疗"], ["quack", "n. 冒牌医生"],
  ]) for (const term of ["医生", "医师", "大夫"]) {
    assert.equal(matchesChineseSearchEntry(head, meaning, term), false, `${head}: ${term}`);
  }
  assert.ok(matchesChineseSearchEntry("DOCTOR", "n. 医生", "医生"));
  assert.equal(matchesChineseSearchEntry("doctor", "n. 博士", "医生"), false);
  assert.ok(matchesChineseSearchEntry("teacher", "n. 教师", "教师"));
  assert.ok(matchesChineseSearchEntry("happy", "a. 快乐的", "快乐"));
  for (const head of [null, {}, 1, "", "doctor\u0000", "x".repeat(201)]) {
    assert.equal(matchesChineseSearchEntry(head, "医生", "医生"), false);
  }
});
