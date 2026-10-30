import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { chineseDefinitionAtoms } from "../js/chinese-search.js";
import { normalizeChineseRankingQuery, createChineseRankingContext, chineseRankingAnchorMatch,
  chineseVariantRank, parseChineseRanking } from "../js/chinese-ranking.js";
import { CHINESE_RANKING_RELEASE } from "../js/chinese-ranking-release.js";

const fake = entries => new Map(entries.map((row, id) => [id, { id, term: `source-${id}`, variants: [], ...row }]));

test("ranking atoms retain their own POS and domain without borrowing another source line", () => {
  const atoms = chineseDefinitionAtoms("n. 亮度, 光\nadj. 明亮的, 光明的\n[医] n. 热, 热病\nadj. 热情的", "noun · adjective");
  assert.deepEqual(atoms.map(atom => [atom.lexical, atom.partOfSpeech, atom.domain]), [
    ["亮度", "noun", null], ["光", "noun", null], ["明亮的", "adjective", null], ["光明的", "adjective", null],
    ["热", "noun", "医"], ["热病", "noun", "医"], ["热情的", "adjective", null],
  ]);
  const inline = chineseDefinitionAtoms("[计] n. 热, 热量; adj. 热的; [医] adj. 冷的; 2. noun：亮度", "noun");
  assert.deepEqual(inline.map(atom => [atom.lexical, atom.domain]), [["热", "计"], ["热量", "计"], ["热的", null], ["冷的", "医"], ["亮度", null]]);
});

test("grammatical suffix normalisation requires complete source evidence and preserves independent words", () => {
  const records = fake([
    { partOfSpeech: "adjective", meaning: "adj. 温暖的, 安静的, 慢的, 快速的" },
    { partOfSpeech: "adverb", meaning: "adv. 快速地, 慢慢地" },
    { partOfSpeech: "noun", meaning: "n. 目的地, 土地, 目的, 标的, 平地" },
    { partOfSpeech: "verb", meaning: "v. 打的, 打" },
    { partOfSpeech: "adverb", meaning: "adv. 的确" },
    { partOfSpeech: "pronoun", meaning: "pron. 我的, 你的, 他的" },
    { partOfSpeech: "determiner", meaning: "det. 我们的" },
    { partOfSpeech: "adjective", meaning: "a. 本地的, 当地的, 我, 当, 本" },
  ]);
  for (const [query, term, hint] of [["温暖的", "温暖", "adjective"], ["安静地", "安静", "adverb"],
    ["快速地", "快速", "adverb"], ["慢慢地", "慢慢", "adverb"]]) {
    assert.deepEqual(normalizeChineseRankingQuery(query, records), { query, term, partOfSpeechHint: hint });
  }
  for (const query of ["目的地", "土地", "目的", "标的", "平地", "打的", "的确", "我的", "你的", "他的", "我们的", "当地", "本地", "USB充电头"]) {
    assert.deepEqual(normalizeChineseRankingQuery(query, records), { query, term: query });
  }
  const verbOnly = fake([{ partOfSpeech: "verb", meaning: "v. 打" }, { partOfSpeech: "adjective", meaning: "a. 一打的, 可打的" }]);
  assert.equal(normalizeChineseRankingQuery("打的", verbOnly).term, "打的", "a longer adjective cannot license deleting a verb query suffix");
  const circularAdverbs = fake([{ partOfSpeech: "adverb", meaning: "adv. 当地, 本地, 快速地" }]);
  for (const query of ["当地", "本地", "快速地"]) assert.equal(normalizeChineseRankingQuery(query, circularAdverbs).term, query, "a full adverb cannot prove its own suffix is detachable");
  const noisyEnglishPos = fake([
    { term: "adjective-a", partOfSpeech: "adjective", meaning: "a. 忧郁的, 沉思的" },
    { term: "adjective-b", partOfSpeech: "adjective", meaning: "a. 阴沉的, 忧郁的" },
    { term: "legacy-noun", partOfSpeech: "noun", meaning: "n. 忧郁的" },
  ]);
  assert.equal(normalizeChineseRankingQuery("忧郁的", noisyEnglishPos).term, "忧郁", "an isolated old English POS label cannot override independent grammatical evidence");
  const approvedAliases = fake([
    { partOfSpeech: "adjective", meaning: "a. 富裕的, 友好的, 不高兴的" },
    { partOfSpeech: "verb", meaning: "v. 等待, 到达" },
  ]);
  for (const query of ["富足的", "亲善的", "不开心的"]) assert.equal(normalizeChineseRankingQuery(query, approvedAliases).term, query.slice(0, -1));
  for (const query of ["等待的", "到达的"]) assert.equal(normalizeChineseRankingQuery(query, approvedAliases).term, query, "a verb-only alias cannot establish an adjective suffix");
});

test("source-supported grammar rules generalise across roots without word or English-head exceptions", () => {
  for (const [query, lexical, compound] of [["快", "飞快的", "快乐的"], ["冷", "寒冷的", "冷漠的"],
    ["亮", "明亮的", "亮氨酸"], ["硬", "坚硬的", "硬币"], ["重", "沉重的", "重复"],
    ["软", "柔软的", "软件"], ["慢", "缓慢的", "慢性病"], ["忙", "繁忙的", "忙音"]]) {
    assert.ok(chineseVariantRank(`adj. ${lexical}`, query) < chineseVariantRank(`n. ${compound}`, query), query);
  }
  for (const [query, meaning] of [["高", "adj. 很高的"], ["轻", "adj. 很轻的"], ["酸", "adj. 极酸的"]]) {
    assert.equal(chineseVariantRank(meaning, query), 1);
  }
  assert.equal(chineseVariantRank("adj. 不快的", "快"), null);
  assert.equal(chineseVariantRank("adj. 不开心的", "不开心"), 0);
});

test("domain and explanatory unit mentions rank below complete ordinary lexical senses", () => {
  assert.equal(chineseVariantRank("adj. 明亮的", "明亮"), 0);
  assert.ok(chineseVariantRank("[化] n. 亮氨酸", "亮") > chineseVariantRank("adj. 明亮的", "亮"));
  assert.ok(chineseVariantRank("pron. 我的\n[医] 迈尔(热容单位)", "热") > chineseVariantRank("adj. 热得难受的", "热"));
  assert.ok(chineseVariantRank("n. 有关声音的装置说明", "声音") > chineseVariantRank("n. 声音", "声音"));
  assert.ok(chineseVariantRank("冷（汉语拼音）", "冷") > chineseVariantRank("adj. 寒冷的", "冷"), "explicit transliteration notes are not ordinary adjective senses");
  assert.equal(chineseVariantRank("adj. 冷的（口语）", "冷"), 0, "ordinary usage notes keep their lexical priority");
});

test("negated-only atoms cannot masquerade as positive meanings and a query keeps its own negation", () => {
  for (const [query, meaning] of [["稳定", "adj. 不稳定的"], ["稳定", "adj. 不太稳定的"],
    ["稳定", "v. 使系统不稳定"], ["可靠", "adj. 不够可靠的"], ["开心", "adj. 不开心的"],
    ["担心", "v. 别担心"], ["担心", "adj. 不必担心的"], ["担心", "adj. 无需担心的"],
    ["担心", "v. 不用特别担心"], ["触碰", "v. 切勿触碰"]]) {
    assert.equal(chineseVariantRank(meaning, query), null, `${query}/${meaning}`);
  }
  assert.equal(chineseVariantRank("adj. 稳定的, 不稳定的", "稳定"), 0, "an independently positive source atom survives");
  assert.ok(chineseVariantRank("n. 稳定装置", "稳定") > chineseVariantRank("adj. 稳定的", "稳定"));
  assert.equal(chineseVariantRank("adj. 不开心的", "不开心"), 0);
  assert.equal(chineseVariantRank("adj. 开心的", "不开心"), null);
  assert.equal(chineseVariantRank("adv. 不", "不"), 0);
  assert.equal(chineseVariantRank("v. 没有", "没有"), 0);
  assert.equal(chineseVariantRank("adj. 并非不稳定的", "不稳定"), null);
  assert.equal(chineseVariantRank("v. 别担心", "别担心"), 0);
  assert.equal(chineseVariantRank("v. 无需", "无需"), 0);
  assert.notEqual(chineseVariantRank("adj. 特别担心的", "担心"), null);
  assert.notEqual(chineseVariantRank("v. 分别担心", "担心"), null);
  for (const [query, meaning] of [["垃圾袋", "食品小袋。本例不指垃圾袋。"], ["光盘驱动器", "只读光盘，不等于光盘驱动器。"],
    ["聊天机器人", "真人工作人员，区别于聊天机器人。"], ["创可贴", "胶带，不等同于自带敷垫的创可贴。"],
    ["热饮", "不等于要求热饮或常温饮品。"], ["常温饮品", "不等于要求热饮或常温饮品。"],
    ["酒精", "不含酒精的"], ["糖分", "不添加糖分的"], ["酒精", "不加酒精的"]]) {
    assert.equal(chineseVariantRank(meaning, query, "noun"), null, query);
  }
  assert.notEqual(chineseVariantRank("不指垃圾袋而是食品袋", "食品袋", "noun"), null, "an explicit affirmative contrast ends the exclusion scope");
  assert.notEqual(chineseVariantRank("含酒精的", "酒精", "adjective"), null);
  assert.notEqual(chineseVariantRank("添加糖分的", "糖分", "adjective"), null);
  assert.equal(chineseVariantRank("不含", "不含", "verb"), 0);
});

test("only explicitly numbered source senses receive a small bounded tie penalty", () => {
  const original = "1. verb：去；移动。\n2. verb：离开。\n5. verb：运转；工作；尤指机器运行。";
  assert.equal(chineseVariantRank(original, "去", "verb"), 0);
  assert.equal(chineseVariantRank(original, "工作", "verb"), 0.04);
  assert.equal(chineseVariantRank("n. 某项, 另一项, 工作", "工作"), 0, "commas are not evidence of sense order");
  assert.ok(chineseVariantRank("99. noun：工作", "工作") < 0.25);
});

test("co-definition anchors need independent heads and distinct same-role evidence, never a second hop", () => {
  const records = fake([
    { term: "fast-a", partOfSpeech: "adjective", meaning: "adj. 快的, 迅速的" },
    { term: "fast-b", partOfSpeech: "adjective", meaning: "adj. 快的, 迅速的, 敏捷的" },
    { term: "next-hop", partOfSpeech: "adjective", meaning: "adj. 迅速的, 急促的" },
    { term: "different-role", partOfSpeech: "noun · adjective", meaning: "n. 速度\nadj. 快的" },
  ]);
  const context = createChineseRankingContext("快", records);
  assert.equal(context.rankingOnly, true);
  assert.ok(context.anchors.some(anchor => anchor.term === "迅速" && anchor.supportingHeads.length === 2));
  assert.ok(!context.anchors.some(anchor => ["速度", "急促"].includes(anchor.term)));
  assert.deepEqual(chineseRankingAnchorMatch("adj. 迅速的", context), { matchedChinese: "迅速的", anchor: "迅速", rankingOnly: true, rank: 0 });
  assert.equal(chineseRankingAnchorMatch("n. 迅速", context), null, "a different grammatical role cannot borrow the anchor");
  const duplicateDefinitions = fake([
    { term: "variant-a", partOfSpeech: "adjective", meaning: "a. 快的, 迅速的" },
    { term: "variant-b", partOfSpeech: "adjective", meaning: "a. 快的, 迅速的" },
  ]);
  assert.deepEqual(createChineseRankingContext("快", duplicateDefinitions).anchors, []);
  const polysemousNouns = fake([
    { term: "destination-a", partOfSpeech: "noun", meaning: "n. 目的地, 小溪, 边界" },
    { term: "destination-b", partOfSpeech: "noun", meaning: "n. 小溪, 目的地, 终点" },
  ]);
  assert.deepEqual(createChineseRankingContext("目的地", polysemousNouns).anchors, []);
});

test("a corpus-normalised query is not reinterpreted from a single unrelated source variant", () => {
  const records = fake([{ partOfSpeech: "noun", meaning: "n. 目的地" }, { partOfSpeech: "adjective", meaning: "a. 有目的的" }]);
  const norm = normalizeChineseRankingQuery("目的地", records), context = createChineseRankingContext(norm.term, records);
  assert.equal(norm.term, "目的地");
  assert.equal(chineseVariantRank("n. 目的地", norm.term, "noun", { context }), 0);
  assert.ok(chineseVariantRank("adv. 有目的地", norm.term, "adverb", { context }) > 0);
  assert.equal(chineseVariantRank("adj. 目的的", "目的地"), null, "a two-argument call cannot invent query normalisation from a candidate");
  assert.equal(chineseVariantRank("adj. 安静的", "安静的"), 0, "the complete literal atom remains valid without a normaliser");
});

test("holdout roots prefer existing literal source meanings over unrelated compounds in the real corpus", async () => {
  const root = new URL("../data/", import.meta.url), manifest = JSON.parse(await readFile(new URL("expanded-dictionary/manifest.json", root)));
  const payload = JSON.parse(gunzipSync(await readFile(new URL(`chinese-search-ranking/${CHINESE_RANKING_RELEASE.file}`, root))));
  const records = parseChineseRanking(payload, { ...manifest, sources: new Map(Object.entries(manifest.sources)) });
  const heads = new Map([...records.values()].map(row => [row.term, row]));
  function best(head, query) {
    const row = heads.get(head); assert.ok(row, head);
    const ranks = [row, ...row.variants].map(item => chineseVariantRank(item.meaning, query, item.partOfSpeech)).filter(rank => rank !== null);
    assert.ok(ranks.length, `${query}/${head}`); return Math.min(...ranks);
  }
  for (const [query, lexical, compound] of [["重", "heavy", "repeat"], ["轻", "light", "light industry"],
    ["高", "high", "sorghum"], ["软", "soft", "software"], ["慢", "slow", "chronic"],
    ["酸", "sour", "acid rain"], ["忙", "busy", "ado"]]) {
    assert.ok(best(lexical, query) < best(compound, query), `${query}: ${lexical} before ${compound}`);
  }
  for (const query of ["目的地", "土地", "目的", "标的", "打的", "的确", "我的", "你的", "他的", "我们的", "当地", "本地"]) assert.equal(normalizeChineseRankingQuery(query, records).term, query);
  for (const query of ["忧郁的", "滑稽的", "最低的", "富足的", "亲善的", "不开心的"]) assert.equal(normalizeChineseRankingQuery(query, records).term, query.slice(0, -1));
  const context = createChineseRankingContext("快", records);
  const scoreWithContext = head => {
    const row = heads.get(head); assert.ok(row, head);
    return Math.min(...[row, ...row.variants].map(item => chineseVariantRank(item.meaning, "快", item.partOfSpeech, { context })).filter(rank => rank !== null));
  };
  assert.ok(scoreWithContext("rapid") < scoreWithContext("happy"), "shared source evidence supports a speed sense without a headword exception");
  const rapid = heads.get("rapid"); assert.ok([rapid, ...rapid.variants].some(row => row.meaning.includes("快")), "the candidate must already have literal source evidence");
  assert.equal(chineseVariantRank("adj. 迅速的", "快", "adjective", { context }), null, "an anchor cannot create recall when the source lacks the query");
  assert.ok(best("bright", "亮") < best("leucine", "亮"));
  assert.ok(best("luminous", "亮") < best("leucine", "亮"));
  assert.ok(best("work", "工作") < best("go", "工作"));
  assert.ok(best("job", "工作") < best("go", "工作"));
  assert.equal(best("go", "去"), 0);
});
