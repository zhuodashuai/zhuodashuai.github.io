import test from "node:test";
import assert from "node:assert/strict";
import { matchesChineseSenseMeaning } from "../js/chinese-search.js";

test("sense evidence binds the POS of the matching definition atom, not the record summary", () => {
  const match = (meaning, term, target) => matchesChineseSenseMeaning(meaning, term, "noun · verb · adjective · adverb", target);
  assert.equal(match("n. 学习\nvt. 研究", "学习", "verb"), false);
  assert.equal(match("vt. 学习\nn. 研究", "学习", "verb"), true);
  assert.equal(match("vt. 学习\nn. 研究", "研究", "verb"), false);
  assert.equal(match("n. 学习\nvt. 研究", "学习", "noun"), true);
  assert.equal(match("n. 学习\na. 学习的", "学习", "adjective"), true);
  assert.equal(match("adv. 确实地\na. 确实的", "确实", "adverb"), true);
});

test("explicit POS carries over genuine comma/semicolon definition atoms and changes at the next label", () => {
  for (const meaning of ["vt. 学习, 研习", "vt. 学习；研习", "vt. [口] 学习, 研习", "① 动词：学习；研习", "[语言学] v. 学习，研习"]) {
    assert.equal(matchesChineseSenseMeaning(meaning, "研习", "noun · verb", "v"), true, meaning);
  }
  assert.equal(matchesChineseSenseMeaning("n. 学习，研习\nadj. 研究的", "研习", "noun · verb", "verb"), false);
  assert.equal(matchesChineseSenseMeaning("n. 学习\nabbr. 研究, 研习", "研习", "noun", "noun"), false);
  assert.equal(matchesChineseSenseMeaning("n. 学习\npron. 研究, 研习", "研习", "noun", "noun"), false);
});

test("only a single known summary POS may support otherwise unlabelled definition atoms", () => {
  for (const summary of ["noun", "n.", "countable noun", "noun (countable)", "名词"]) {
    assert.equal(matchesChineseSenseMeaning("学校；学堂", "学堂", summary, "n"), true, summary);
  }
  for (const summary of ["noun · verb", "n./adj.", "word", "nounish", "noun (unknown)", "pronoun", "", undefined, null, {}, "noun\u202e"]) {
    assert.equal(matchesChineseSenseMeaning("学校；学堂", "学堂", summary, "noun"), false, String(summary));
  }
  assert.equal(matchesChineseSenseMeaning("vt. 学习, 研习", "研习", "noun", "verb"), true, "an explicit sense POS overrides the summary");
  assert.equal(matchesChineseSenseMeaning("n. 学堂", "学堂", "", "noun"), true);
  assert.equal(matchesChineseSenseMeaning("n. & v. 学堂", "学堂", "noun", "noun"), false);
});

test("grammatical particles are POS-specific rather than a generic string conversion", () => {
  for (const [meaning, term, summary, target, expected] of [
    ["n. 目的地", "目的", "noun", "noun", false],
    ["n. 学校的", "学校", "noun", "noun", false],
    ["n. 学校", "学校", "noun", "noun", true],
    ["v. 学习的", "学习", "verb", "verb", false],
    ["a. 牢固的", "牢固", "adjective", "a", true],
    ["a. 牢固地", "牢固", "adjective", "a", false],
    ["adv. 确实地", "确实", "adverb", "r", true],
    ["adv. 确实的", "确实", "adverb", "r", false],
  ]) assert.equal(matchesChineseSenseMeaning(meaning, term, summary, target), expected, `${meaning} / ${term} / ${target}`);
});

test("sense matching rejects negation, causatives, compound mentions and relational glosses", () => {
  for (const meaning of ["a. 不可靠的", "a. 非可靠的", "a. 可靠的人", "a. 令人可靠的", "a. 使可靠",
    "a. 可靠（使人）", "a. 可靠（不可靠）", "a. 很可靠的", "a. 满意而可靠的", "a. 谈论可靠这一概念", "a. 可靠性的"]) {
    assert.equal(matchesChineseSenseMeaning(meaning, "可靠", "adjective", "adjective"), false, meaning);
  }
  assert.equal(matchesChineseSenseMeaning("a. 可靠的（用于人或系统）", "可靠", "adjective", "adjective"), true);
  assert.equal(matchesChineseSenseMeaning("n. 目的；方向", "目的", "noun", "noun"), true);
});

test("unknown target POS and malformed sense input fail closed without exceptions", () => {
  for (const target of [null, {}, "", "pronoun", "noun · verb", "nounish", "n. unrelated"]) {
    assert.equal(matchesChineseSenseMeaning("n. 学校", "学校", "noun", target), false, String(target));
  }
  for (const meaning of [null, {}, "", "n. 学校\u0000", "n. 学校\u202e", "校".repeat(20_001), "n. 学校（使)"]) {
    assert.equal(matchesChineseSenseMeaning(meaning, "学校", "noun", "noun"), false, String(meaning).slice(0, 50));
  }
  for (const term of [null, {}, "", "school", "学 校", "学校.*", "校".repeat(51)]) {
    assert.equal(matchesChineseSenseMeaning("n. 学校", term, "noun", "noun"), false, String(term));
  }
});
