import assert from "node:assert/strict";
import test from "node:test";
import { buildCorePosCorrections, renderCorePosCorrections } from "../scripts/build-dictionary-pos.mjs";
import { dictionaryPosIntegrity, DICTIONARY_POS_ID, DICTIONARY_POS_SOURCE } from "../lib/dictionary-pos.mjs";
import { expandedSha256 } from "../scripts/build-expanded-dictionary.mjs";
import { applyCorePosCorrection, personalDictionaryResult } from "../../vocab/js/personal-dictionary.js";

const columns = ["key", "word", "phonetic", "partOfSpeech", "meaning", "definition", "collins", "oxford", "bnc", "frq", "tags", "forms"];
const core = entries => ({ schemaVersion: 1, count: entries.length, columns,
  source: { name: "ECDICT", license: "MIT", url: "https://github.com/skywind3000/ECDICT" },
  entries: entries.map(({ word, meaning, partOfSpeech = "" }) => [word.toLowerCase(), word, "", partOfSpeech, meaning, "", 0, 0, 0, 0, "", []]) });
const row = (word = "abacus", extra = {}) => ({ word, partOfSpeech: "", meaning: "算盘", ...extra });
const approval = (value = row(), extra = {}) => ({ term: value.word, baseSource: "core", meaningSha256: expandedSha256(value.meaning),
  partOfSpeech: "noun", evidence: [{ source: "wordnet", locator: `index.noun: ${value.word}` }], ...extra });
const pack = entries => ({ schemaVersion: 1, id: DICTIONARY_POS_ID,
  sources: { wordnet: { name: "Princeton WordNet", url: "https://wordnet.princeton.edu/", license: "WordNet licence", sha256: "b".repeat(64) } }, entries });
const projection = entries => ({ schemaVersion: 1, source: DICTIONARY_POS_SOURCE, entries });

test("compact projection uses reviewed raw core matches only, with independent provenance", () => {
  const rows = [row(), row("labelled", { meaning: "n. 标签" }), row("known", { partOfSpeech: "verb", meaning: "知道" }),
    row("special", { partOfSpeech: "count noun", meaning: "特殊名词" })];
  const value = pack(rows.map(item => approval(item)));
  const integrity = dictionaryPosIntegrity(value);
  const payload = core(rows);
  const actual = buildCorePosCorrections(payload, value, integrity);
  assert.deepEqual(actual.entries, [["abacus", "算盘", "noun"]]);
  assert.deepEqual(actual.source, DICTIONARY_POS_SOURCE);
  assert.deepEqual(actual.root, integrity);
  assert.equal(actual.coreSemanticSha256, expandedSha256(JSON.stringify(payload)));
  assert.deepEqual(Object.keys(actual), ["schemaVersion", "source", "root", "coreSemanticSha256", "entries"]);
});

test("compact projection rejects unapproved changes and excludes changed meanings, source scopes and case", () => {
  const value = pack([approval()]), integrity = dictionaryPosIntegrity(value);
  const changed = structuredClone(value); changed.entries[0].partOfSpeech = "adjective";
  assert.throws(() => buildCorePosCorrections(core([row()]), changed, integrity), /independent semantic root mismatch/u);
  assert.deepEqual(buildCorePosCorrections(core([row("abacus", { meaning: "另一个释义" })]), value, integrity).entries, []);
  assert.deepEqual(buildCorePosCorrections(core([row("ABACUS")]), value, integrity).entries, []);
  const wrongScope = pack([approval(row(), { baseSource: "mit" })]);
  assert.deepEqual(buildCorePosCorrections(core([row()]), wrongScope, dictionaryPosIntegrity(wrongScope)).entries, []);
  const wrongCore = core([row()]); wrongCore.source.license = "unverified";
  assert.throws(() => buildCorePosCorrections(wrongCore, value, integrity), /core provenance/u);
});

test("runtime correction keeps the formatter pure and credits external POS separately", () => {
  const original = row();
  const formatted = personalDictionaryResult(original);
  assert.equal(formatted.partOfSpeech, ""); assert.equal(formatted.source, "ECDICT");
  const actual = applyCorePosCorrection(original, formatted, projection([["abacus", "算盘", "noun"]]));
  assert.deepEqual(actual, { ...formatted, partOfSpeech: "noun", source: DICTIONARY_POS_SOURCE.name,
    license: DICTIONARY_POS_SOURCE.license, url: DICTIONARY_POS_SOURCE.url });
  assert.equal(actual.meaning, "① 算盘");
  assert.equal(formatted.partOfSpeech, ""); assert.equal(personalDictionaryResult(original).partOfSpeech, "");
});

test("runtime correction requires exact word and raw meaning, never replaces existing POS or user/context objects", () => {
  const value = personalDictionaryResult(row());
  const approved = projection([["abacus", "算盘", "noun"]]);
  for (const [original, formatted] of [
    [row("ABACUS"), personalDictionaryResult(row("ABACUS"))],
    [row("abacus", { meaning: "新义项" }), personalDictionaryResult(row("abacus", { meaning: "新义项" }))],
    [row(), { ...value, term: "different" }],
    [row(), { ...value, source: "卓的公开词库" }],
    [row(), { ...value, partOfSpeech: "adjective" }],
    [row("abacus", { partOfSpeech: "count noun" }), value]
  ]) assert.equal(applyCorePosCorrection(original, formatted, approved), formatted);
  assert.equal(applyCorePosCorrection(row(), null, approved), null);
});

test("complete grammatical labels survive fallback and old compact n-v notation still works", () => {
  for (const label of ["proper noun", "noun phrase", "verb phrase", "phrasal verb", "adjective phrase", "adverbial phrase",
    "prepositional phrase", "plural noun", "transitive verb", "intransitive verb", "auxiliary verb", "modal verb",
    "definite article", "indefinite article", "contraction", "particle", "prefix", "suffix", "symbol", "combining form", "nominative",
    "count noun", "proper adjective", "clausal idiom", "fixed phrase", "comparative phrase"])
    assert.equal(personalDictionaryResult(row("test", { partOfSpeech: label })).partOfSpeech, label, label);
  assert.equal(personalDictionaryResult(row("test", { partOfSpeech: "proper noun · noun phrase, adjective" })).partOfSpeech,
    "proper noun · noun phrase · adjective");
  assert.equal(personalDictionaryResult(row("test", { partOfSpeech: "n v" })).partOfSpeech, "noun · verb");
  assert.equal(personalDictionaryResult(row("test", { partOfSpeech: "unknown phrase" })).partOfSpeech, "");
  assert.equal(personalDictionaryResult(row("test", { partOfSpeech: "n/a" })).partOfSpeech, "");
  assert.equal(personalDictionaryResult(row("test", { partOfSpeech: "noun phrase", meaning: "v. 已有中文动词标签" })).partOfSpeech, "verb");
});

test("generated compact projection is deterministic and deeply frozen, with no network or private state", async () => {
  const value = pack([approval()]), integrity = dictionaryPosIntegrity(value);
  const actual = buildCorePosCorrections(core([row()]), value, integrity);
  const content = renderCorePosCorrections(actual);
  assert.equal(content, renderCorePosCorrections(actual));
  assert.doesNotMatch(content, /fetch\s*\(|localStorage|indexedDB|\/api\/|token|password/u);
  const imported = await import(`data:text/javascript;base64,${Buffer.from(content).toString("base64")}`);
  assert.deepEqual(imported.CORE_POS_CORRECTIONS, actual);
  assert.ok(Object.isFrozen(imported.CORE_POS_CORRECTIONS));
  assert.ok(Object.isFrozen(imported.CORE_POS_CORRECTIONS.source));
  assert.ok(Object.isFrozen(imported.CORE_POS_CORRECTIONS.root));
  assert.ok(Object.isFrozen(imported.CORE_POS_CORRECTIONS.entries));
  assert.ok(Object.isFrozen(imported.CORE_POS_CORRECTIONS.entries[0]));
});
