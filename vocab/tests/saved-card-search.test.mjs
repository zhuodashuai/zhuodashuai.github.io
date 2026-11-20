import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createSavedCardQueryMatcher, savedCardMatchesQuery } from "../js/saved-card-search.js";
import { publicEntryMatchesQuery } from "../js/wordbook-schema.js";

const matches = (query, term, rest = {}) => savedCardMatchesQuery({ term, ...rest }, query);

test("a word prefix finds its own forms without matching an internal Latin fragment", () => {
  for (const value of ["hip", "hips", "hip joint", "hip-hop", "Hippo"]) assert(matches("hip", value), value);
  for (const value of ["leadership", "membership", "ownership", "whip", "blue-chip", "fellowship"]) {
    assert.equal(matches("hip", value), false, value);
    assert.equal(publicEntryMatchesQuery({ term: value }, "hip"), true, "reproduce the old false positive");
  }
  assert(matches("agita", "agitated"));
  assert.equal(matches("gita", "agitated"), false);
});

test("NFKC, typography, capitalization and spacing retain the current query behavior", () => {
  for (const query of [" HIP ", "ＨＩＰ", "“hip”", "hip,", "（hip）"]) assert(matches(query, "hip"), query);
  assert(matches("jab   at", "Jab\n at"));
  assert(matches("o’neill", "O'Neill"));
  assert(matches("o'neill", "O’Neill"));
  assert(matches("co–oper", "co-operate"));
  assert(matches("NEVER  LET ME GO", "another", { sourceTitle: "Never Let Me Go — Chapter 1" }));
  assert(matches("KATH", "another", { author: "Kathy" }));
});

test("literal punctuation is not a regular expression and punctuation can separate words", () => {
  assert(matches("c++", "C++ programming"));
  assert.equal(matches("c++", "cc programming"), false);
  assert(matches("a.b", "a.b example"));
  assert.equal(matches("a.b", "axb example"), false);
  assert(matches("get lost", "please get lost now"));
  assert(matches("neill", "O'Neill"));
  assert(matches("oper", "co-operate"));
  assert.equal(matches("oper", "cooperate"), false);
});

test("Chinese remains a substring search and mixed text has explicit Latin boundaries", () => {
  assert(matches("监视", "surveillance", { meaning: "持续监视某人" }));
  assert(matches("不平静", "agitated", { meaning: "情绪不平静的" }));
  assert(matches("hip", "other", { meaning: "髋部hip关节" }));
  assert(matches("hip髋", "other", { definition: "（hip髋部）" }));
  assert.equal(matches("hip髋", "other", { definition: "leadership髋部" }), false);
  assert(matches("髋hip", "other", { definition: "这叫髋hips" }));
  assert(matches("43", "other", { sourceTitle: "page 143" }));
  assert.equal(matches("hip", "other", { definition: "éhip 1hip e\u0301hip" }), false);
});

test("all existing public-card fields remain individually searchable", () => {
  const fields = ["originalInput", "term", "standardForm", "meaning", "definition", "author", "sourceTitle", "sourceWork"];
  for (const field of fields) {
    const entry = { [field]: "rarehipvalue" };
    assert(publicEntryMatchesQuery(entry, "rarehipvalue"));
    assert(savedCardMatchesQuery(entry, "rarehipvalue"), field);
  }
  for (const field of ["tags", "collocations", "forms", "synonyms"]) {
    const entry = { [field]: ["rarehipvalue"] };
    assert(publicEntryMatchesQuery(entry, "rarehipvalue"));
    assert(savedCardMatchesQuery(entry, "rarehipvalue"), field);
  }
  const contextFields = ["originalInput", "meaning", "definition", "usage", "sourceTitle", "sourceWork", "sourceDate"];
  for (const field of contextFields) {
    const entry = { readingContexts: [{ collocations: [], forms: [], [field]: "rarehipvalue" }] };
    assert(publicEntryMatchesQuery(entry, "rarehipvalue"));
    assert(savedCardMatchesQuery(entry, "rarehipvalue"), "readingContexts." + field);
  }
  for (const field of ["collocations", "forms"]) {
    const entry = { readingContexts: [{ collocations: [], forms: [], [field]: ["rarehipvalue"] }] };
    assert(publicEntryMatchesQuery(entry, "rarehipvalue"));
    assert(savedCardMatchesQuery(entry, "rarehipvalue"), "readingContexts." + field);
  }
});

test("phrases cannot be fabricated across independent fields or array members", () => {
  for (const entry of [
    { originalInput: "get", term: "lost" },
    { tags: ["get", "lost"] },
    { readingContexts: [{ collocations: ["get"], forms: ["lost"] }] },
    { originalInput: "监", term: "视" }
  ]) {
    const query = entry.originalInput === "监" ? "监 视" : "get lost";
    assert(publicEntryMatchesQuery(entry, query), "reproduce joining separate metadata");
    assert.equal(savedCardMatchesQuery(entry, query), false);
  }
  assert(savedCardMatchesQuery({ collocations: ["get lost"] }, "get lost"));
});

test("queries cannot search internal field separators or non-whitespace controls", () => {
  const entry = { originalInput: "get", term: "lost", meaning: "监视" };
  for (const query of ["get\u0000lost", "\u0000", "get\u001flost", "get\u007flost"]) {
    assert.equal(savedCardMatchesQuery(entry, query), false, JSON.stringify(query));
  }
  assert(savedCardMatchesQuery({ term: "get lost" }, "get\t\nlost"));
  assert(savedCardMatchesQuery({ term: "lost" }, "lost"));
  assert(savedCardMatchesQuery({ term: "get" }, "get"));
});

test("reusing a compiled matcher is stable and never changes cards or input", () => {
  const entry = {
    term: "hip", meaning: "髋部", tags: ["word"], forms: ["hips"],
    readingContexts: [{ meaning: "本章髋部", collocations: [], forms: [] }]
  };
  const before = structuredClone(entry);
  const matcher = createSavedCardQueryMatcher("ＨＩＰ");
  for (let i = 0; i < 3; i++) { assert(matcher(entry)); assert.equal(matcher({ term: "leadership" }), false); }
  assert.deepEqual(entry, before);
  assert(createSavedCardQueryMatcher("")(null));
  assert.equal(createSavedCardQueryMatcher("hip")(null), false);
});

test("real public snapshot keeps normalized queries, chapter text and useful prefixes", () => {
  const snapshot = JSON.parse(readFileSync(new URL("../data/owner-wordbook.json", import.meta.url), "utf8"));
  const terms = query => snapshot.entries.filter(createSavedCardQueryMatcher(query)).map(entry => entry.term);
  assert.deepEqual(terms("hip"), ["hip"]);
  assert.deepEqual(terms("ＨＩＰ"), terms("hip"));
  assert.deepEqual(terms("hip,"), terms("hip"));
  assert.deepEqual(terms("jab   at"), ["jab at"]);
  assert.deepEqual(terms("agita"), ["agitated"]);
  for (const query of ["Kathy", "Never Let Me Go", "监视"]) {
    assert.deepEqual(terms(query), snapshot.entries.filter(entry => publicEntryMatchesQuery(entry, query)).map(entry => entry.term));
  }
});
