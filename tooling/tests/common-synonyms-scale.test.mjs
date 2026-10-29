import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { COMMON_CHINESE_GROUPS } from "../../vocab/js/chinese-related-common.js";
import { chineseSearchPlan, chineseSearchHeads, chineseSearchSense, matchesChineseSearchEntry, matchesChineseSenseMeaning } from "../../vocab/js/chinese-search.js";
import { searchExpandedDictionary, searchRelatedChineseDictionary } from "../../vocab/js/expanded-dictionary.js";
import { personalDictionaryResult } from "../../vocab/js/personal-dictionary.js";
import { dictionaryExampleSensePlan } from "../../vocab/js/dictionary-app.js";
import { isPinnedChineseRankingFixture } from "./helpers/chinese-ranking-fixture-asset.mjs";
import { SELECTED_COMMON_SENSE_BINDINGS } from '../../vocab/js/selected-common-sense-data.js';

const manifest = JSON.parse(await readFile(new URL("../../vocab/data/expanded-dictionary/manifest.json", import.meta.url), "utf8"));
const reviewed = JSON.parse(await readFile(new URL("../dictionary/chinese-related-common.json", import.meta.url), "utf8"));
const bytes = new Map(), parsed = new Map();
const fold = value => value.normalize("NFKC").trim().toLowerCase();
const bucket = value => { let hash = 2166136261; for (const char of fold(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; } return hash % 128; };
const posKinds = ["noun", "verb", "adjective", "adverb"];
test("scoped examples require reviewed immutable sense identities, not overlapping Chinese labels", async () => {
  const review = JSON.parse(await readFile(new URL("../dictionary/chinese-related-common-examples.json", import.meta.url), "utf8"));
  const examples = JSON.parse(await readFile(new URL("../../vocab/data/dictionary-examples/manifest-v2.json", import.meta.url), "utf8"));
  const records = new Map();
  assert.equal(review.schemaVersion, 1);
  assert.equal(review.groups.length, COMMON_CHINESE_GROUPS.length);
  assert.equal(new Set(review.groups.map(row => row.id)).size, review.groups.length);
  for (const group of COMMON_CHINESE_GROUPS) {
    const source = review.groups.find(row => row.id === group.id);
    assert.deepEqual(group.exampleSenses, source.heads);
    assert.ok(Object.isFrozen(group.exampleSenses));
    assert.deepEqual(Object.keys(source.heads).sort(), [...group.heads].sort());
    assert.deepEqual(chineseSearchSense(group.terms[0]).exampleSenses, group.exampleSenses);
    for (const [head, proofs] of Object.entries(group.exampleSenses)) {
      assert.ok(Object.isFrozen(proofs));
      let hash = 2166136261;
      for (const char of head) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
      const descriptor = examples.shards[hash % 256];
      if (!records.has(descriptor.file)) records.set(descriptor.file, JSON.parse(await readFile(new URL(`../../vocab/data/dictionary-examples/${descriptor.file}`, import.meta.url), "utf8")));
      const original = records.get(descriptor.file).entries.find(row => row.term === head);
      const plan = dictionaryExampleSensePlan(original || { term: head, senses: [] }, {
        term: head, matchedPartOfSpeech: group.pos, matchedSense: group.sense,
        matchedExampleSenseIds: proofs.map(row => row.id), matchedExampleSenseEvidence: proofs,
      });
      assert.deepEqual(new Set(plan.items.filter(row => row.matched).map(row => row.sense.id)), new Set(proofs.map(row => row.id)), `${group.id}/${head}: UI must match precisely the reviewed example identities`);
      assert.equal(plan.items.filter(row => row.open).length, proofs.length ? 1 : 0);
      assert.equal(plan.items.length, original?.senses.length || 0, "retain every original example sense");
      for (const proof of proofs) {
        assert.ok(Object.isFrozen(proof));
        assert.deepEqual([...new Set(proof.partOfSpeech.match(/\b(?:noun|verb|adjective|adverb)\b/gu))], [group.pos]);
        const sense = original?.senses.find(row => row.id === proof.id);
        assert.ok(sense, `${group.id}/${head}/${proof.id}: real reviewed example identity`);
        assert.deepEqual(proof, { id: sense.id, partOfSpeech: sense.partOfSpeech, meaningZh: sense.meaningZh, examples: sense.examples });
        assert.ok(Object.isFrozen(proof.examples) && proof.examples.every(Object.isFrozen));
      }
    }
  }
  const physical = COMMON_CHINESE_GROUPS.find(row => row.terms.includes("地基"));
  assert.deepEqual(physical.exampleSenses.foundation.map(row => row.id), ["foundation-noun-building-base"]);
});
async function shardFor(head) {
  const descriptor = manifest.english.shards[bucket(head)];
  const target = new URL(`../../vocab/data/expanded-dictionary/${descriptor.file}`, import.meta.url);
  if (!bytes.has(String(target))) bytes.set(String(target), readFile(target));
  if (!parsed.has(String(target))) parsed.set(String(target), JSON.parse((await bytes.get(String(target))).toString("utf8")));
  return parsed.get(String(target));
}
function displayEvidence(evidence) {
  const source = manifest.sources[evidence.source];
  let formatted = evidence;
  if (["mit", "core", "pos-reviewed"].includes(evidence.source) && !/^\s*(?:[①-⑳]|\d+[.、])/u.test(evidence.meaning)) {
    const value = personalDictionaryResult({ word: evidence.head, partOfSpeech: evidence.partOfSpeech, meaning: evidence.meaning });
    if (value) formatted = { ...evidence, partOfSpeech: value.partOfSpeech || evidence.partOfSpeech, meaning: value.meaning.length <= 2000 ? value.meaning : evidence.meaning };
  }
  return { partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning, source: source.name, license: source.license, url: source.url };
}
function resultEvidence(group, result, terms) {
  const selected = SELECTED_COMMON_SENSE_BINDINGS.find(row => row.head === result.term && row.groupId === group.id);
  if (selected && result.matchedSourceEvidence?.kind === 'reviewed-canonical-primary') {
    // A separate exact reviewed source contract. Never impersonate the old raw
    // provenance, weaken its checks, or infer a link from shared Chinese text.
    assert.deepEqual(selected.runtimeGroup, group);
    assert.equal(result.partOfSpeech, selected.selectedRow.partOfSpeech);
    assert.equal(result.meaning, selected.selectedRow.meaning);
    assert.equal(result.source, '卓式词典·义项补充');
    assert.equal(result.license, 'Original composition');
    assert.equal(result.url, 'https://zhuodashuai.github.io/vocab/');
    assert.deepEqual(result.matchedSourceEvidence, {
      kind: 'reviewed-canonical-primary', groupId: selected.groupId, sourceId: selected.sourceId,
      canonicalId: selected.canonicalId, canonicalSourceSha256: selected.canonicalSourceSha256,
      selectedSourceSha256: selected.selectedSourceSha256, selectedRowSha256: selected.selectedRowSha256,
    });
    assert.ok(terms.some(term => selected.directTerms.includes(term)));
    return selected;
  }
  return group.evidence.filter(evidence => evidence.head === fold(result.term)
    && evidence.terms.some(term => terms.includes(term))).find(evidence => {
    const displayed = displayEvidence(evidence);
    return Object.entries(displayed).every(([key, value]) => result[key] === value);
  });
}

test("the common-sense catalogue is a substantial POS-specific set, not another thirty-group increment", () => {
  assert.ok(COMMON_CHINESE_GROUPS.length >= 100, `expected at least 100 independently reviewed groups, got ${COMMON_CHINESE_GROUPS.length}`);
  assert.ok(Object.isFrozen(COMMON_CHINESE_GROUPS));
  assert.equal(reviewed.groups.length, COMMON_CHINESE_GROUPS.length, "the reviewed source table and runtime must have the same independently counted rows");
  const ids = new Set(), senses = new Set(), aliases = new Set();
  for (const group of COMMON_CHINESE_GROUPS) {
    assert.ok(typeof group.id === "string" && group.id.trim());
    assert.ok(!ids.has(group.id), `${group.id}: duplicate group id`); ids.add(group.id);
    assert.match(group.sourceId, /^pwn30:\d{8}-[nvasr]$/u);
    assert.ok(!senses.has(group.sourceId), `${group.sourceId}: repeated sense inflated the group count`); senses.add(group.sourceId);
    assert.ok(posKinds.includes(group.pos), `${group.id}: one explicit target POS is required`);
    assert.ok(Array.isArray(group.terms) && group.terms.length >= 1 && group.terms.length <= 8);
    assert.ok(Array.isArray(group.heads) && group.heads.length >= 2 && group.heads.length <= 6);
    assert.equal(new Set(group.heads.map(fold)).size, group.heads.length, `${group.id}: repeated English word`);
    assert.ok(typeof group.note === "string" && group.note.trim(), `${group.id}: explain the particular sense boundary`);
    assert.ok(typeof group.sense === "string" && group.sense.trim(), `${group.id}: a visible particular Chinese meaning is required`);
    const original = reviewed.groups.find(row => row.id === group.id);
    assert.ok(original, `${group.id}: runtime group must appear in the reviewed source table`);
    for (const key of ["sourceId", "pos", "sense", "terms", "heads", "note", "evidence"]) assert.deepEqual(group[key], original[key], `${group.id}: source-table drift in ${key}`);
    assert.ok(typeof original.gloss === "string" && original.gloss.trim(), `${group.id}: retain the particular WordNet sense definition for review`);
    assert.ok(Array.isArray(original.sourceMembers) && original.sourceMembers.length >= 2);
    assert.ok(group.heads.every(head => original.sourceMembers.map(member => fold(member.replace(/_/gu, " "))).includes(head)), `${group.id}: never invent members outside the referenced source sense`);
    assert.ok(Object.isFrozen(group) && Object.isFrozen(group.terms) && Object.isFrozen(group.heads));
    for (const term of group.terms) {
      assert.match(term, /^\p{Script=Han}{1,20}$/u);
      assert.ok(!aliases.has(term), `${term}: a Chinese alias must not silently overwrite another target sense`); aliases.add(term);
      assert.deepEqual(chineseSearchPlan(term), { term, aliases: group.terms.filter(alias => alias !== term) });
      assert.deepEqual(chineseSearchHeads(term), group.heads);
      assert.ok(Object.isFrozen(chineseSearchHeads(term)));
    }
    assert.ok(Array.isArray(group.evidence) && group.evidence.length >= group.heads.length);
    assert.deepEqual(new Set(group.evidence.map(row => row.head)), new Set(group.heads), `${group.id}: every head must have independent evidence`);
    for (const evidence of group.evidence) {
      assert.ok(typeof evidence.partOfSpeech === "string" && evidence.partOfSpeech.trim());
      assert.ok(typeof evidence.meaning === "string" && evidence.meaning.trim());
      assert.ok(Object.hasOwn(manifest.sources, evidence.source), `${group.id}: real source id required`);
      assert.ok(Array.isArray(evidence.terms) && evidence.terms.length);
      assert.equal(new Set(evidence.terms).size, evidence.terms.length);
      assert.ok(evidence.terms.every(term => group.terms.includes(term)));
    }
  }
  for (const pos of posKinds) assert.ok(COMMON_CHINESE_GROUPS.some(group => group.pos === pos), `${pos}: common words must not be treated as one mixed POS`);
});

test("sense matching binds grammatical labels locally and does not manufacture nouns, compounds or negated meanings", () => {
  assert.equal(matchesChineseSenseMeaning("n. 飞行\nv. 飞翔", "飞行", "noun · verb", "verb"), false);
  assert.equal(matchesChineseSenseMeaning("n. 飞行\nv. 飞翔", "飞翔", "noun · verb", "verb"), true);
  assert.equal(matchesChineseSenseMeaning("a. 安全的\nn. 保险箱", "安全", "noun · adjective", "adjective"), true);
  assert.equal(matchesChineseSenseMeaning("a. 安全的\nn. 保险箱", "保险箱", "noun · adjective", "adjective"), false);
  assert.equal(matchesChineseSenseMeaning("n. 学校的", "学校", "noun", "noun"), false);
  assert.equal(matchesChineseSenseMeaning("n. 学校", "学校", "noun", "noun"), true);
  assert.equal(matchesChineseSenseMeaning("v. 支撑的", "支撑", "verb", "verb"), false);
  assert.equal(matchesChineseSenseMeaning("adv. 稳定地", "稳定", "adverb", "adverb"), true);
  assert.equal(matchesChineseSenseMeaning("adj. 稳定地", "稳定", "adjective", "adjective"), false);
  assert.equal(matchesChineseSenseMeaning("解释中提到稳定", "稳定", "adjective", "adjective"), false);
  assert.equal(matchesChineseSenseMeaning("不稳定的", "稳定", "adjective", "adjective"), false);
  assert.equal(matchesChineseSenseMeaning("稳定（使人）", "稳定", "adjective", "adjective"), false);
  assert.equal(matchesChineseSenseMeaning("稳定", "稳定", "noun · adjective", "adjective"), false);
});

for (const group of COMMON_CHINESE_GROUPS) test(`common sense ${group.id}: ${group.terms.join(" / ")} has exact local evidence and bounded complete lookup`, async () => {
  for (const head of group.forbidden || []) {
    assert.ok(!group.heads.includes(fold(head)), `${group.id}: a forbidden example cannot also be a permitted head`);
    const shard = await shardFor(head);
    assert.ok(shard.records.some(row => fold(row.term) === fold(head)), `${head}: a rejected example must exist in the real dictionary, not merely be an absent fixture`);
  }
  for (const evidence of group.evidence) {
    const shard = await shardFor(evidence.head), record = shard.records.find(row => fold(row.term) === evidence.head);
    assert.ok(record, `${evidence.head}: head must really exist in the hash-checked dictionary`);
    assert.ok([record, ...(record.variants || [])].some(row => row.partOfSpeech === evidence.partOfSpeech
      && row.meaning === evidence.meaning && row.source === evidence.source), `${evidence.head}: evidence must equal one intact actual source variant`);
    for (const term of evidence.terms) {
      assert.ok(matchesChineseSenseMeaning(evidence.meaning, term, evidence.partOfSpeech, group.pos), `${evidence.head}: source atom must have the target sense and POS`);
      assert.ok(matchesChineseSearchEntry(evidence.head, evidence.meaning, term, evidence.partOfSpeech, evidence.source));
      assert.equal(matchesChineseSearchEntry(evidence.head, evidence.meaning, term), false, "missing grammatical/source evidence must fail closed");
      assert.equal(matchesChineseSearchEntry(evidence.head, evidence.meaning, term, evidence.partOfSpeech, "unexpected-source"), false);
      assert.equal(matchesChineseSearchEntry(evidence.head, evidence.meaning, term, `${evidence.partOfSpeech} · pronoun`, evidence.source), false);
      assert.equal(matchesChineseSearchEntry(evidence.head, `${evidence.meaning}\n unrelated`, term, evidence.partOfSpeech, evidence.source), false);
      assert.equal(matchesChineseSearchEntry("not-a-reviewed-head", evidence.meaning, term, evidence.partOfSpeech, evidence.source), false);
    }
  }
  const requests = [];
  const fetchImpl = async (url, options) => {
    const target = new URL(url);
    assert.equal(target.protocol, "file:"); assert.equal(target.search, "");
    assert.ok(/\/vocab\/data\/expanded-dictionary\//u.test(target.pathname) || isPinnedChineseRankingFixture(target));
    assert.equal(options.credentials, "omit"); assert.ok(!options.method || options.method === "GET");
    requests.push(String(target));
    if (!bytes.has(String(target))) bytes.set(String(target), readFile(target));
    return new Response(await bytes.get(String(target)));
  };
  const suffix = group.pos === "adjective" ? "的" : group.pos === "adverb" ? "地" : "";
  for (const term of group.terms) {
    for (const input of suffix ? [term, term + suffix] : [term]) {
      const requestStart = requests.length;
      const direct = await searchExpandedDictionary(input, { fetchImpl });
      const related = await searchRelatedChineseDictionary(input, { fetchImpl });
      const found = [...direct.results, ...related.results], names = found.map(row => row.term);
      assert.equal(new Set(names).size, names.length, `${input}: repeated canonical card`);
      assert.deepEqual(new Set(names), new Set(group.heads), `${input}: reviewed English sense group must be complete, without unrelated extra heads`);
      assert.equal(direct.hasMore, false); assert.equal(related.hasMore, false);
      for (const item of found) {
        assert.equal(item.matchedPartOfSpeech, group.pos, `${input}/${item.term}: retain the reviewed target POS independently from the original record summary`);
        assert.equal(item.matchedSense, group.sense, `${input}/${item.term}: retain the reviewed sense boundary`);
        const selected = SELECTED_COMMON_SENSE_BINDINGS.find(row => row.groupId === group.id && row.head === item.term);
        const proofs = selected ? [selected.selectedExampleProof] : group.exampleSenses[item.term];
        assert.deepEqual(item.matchedExampleSenseEvidence, proofs);
        assert.deepEqual(item.matchedExampleSenseIds, proofs.map(row => row.id));
      }
      for (const item of direct.results) assert.ok(resultEvidence(group, item, [term]), `${input}/${item.term}: direct result must retain its exact evidence variant and provenance`);
      for (const item of related.results) {
        assert.equal(item.matchType, "related"); assert.ok(group.terms.includes(item.matchedChinese));
        assert.notEqual(item.matchedChinese, term);
        assert.ok(resultEvidence(group, item, [item.matchedChinese]), `${input}/${item.term}: related result must retain its exact evidence variant and provenance`);
      }
      for (const forbidden of group.forbidden || []) assert.ok(!names.includes(forbidden), `${input}: forbidden unrelated sense ${forbidden}`);
      const newRequests = requests.slice(requestStart);
      assert.ok(!newRequests.some(url => /\/zh-\d{3}\.json$/u.test(url)), `${input}: no broad Chinese-posting download`);
      assert.ok(newRequests.filter(url => /\/en-\d{3}\.json$/u.test(url)).length <= 6, `${input}: bounded English-shard budget`);
    }
    for (const rejectedSuffix of group.pos === "adjective" ? ["地"] : group.pos === "adverb" ? ["的"] : ["的", "地"]) {
      const input = term + rejectedSuffix;
      const literal = COMMON_CHINESE_GROUPS.find(row => row.terms.includes(input));
      if (literal) {
        // 地 can be part of a real noun (沼泽地), not a manner suffix.
        // Preserve an explicitly reviewed literal without inferring a new POS.
        assert.deepEqual(chineseSearchPlan(input), { term: input, aliases: literal.terms.filter(alias => alias !== input) });
        assert.equal(chineseSearchSense(input).pos, literal.pos);
      } else assert.equal(chineseSearchPlan(input), null, `${input}: do not infer an incompatible POS`);
    }
    for (const input of [`不${term}`, `${term}方面`, `非常${term}`, `${term}\u202e`]) {
      assert.notDeepEqual(chineseSearchPlan(input), chineseSearchPlan(term), `${input}: no negation stripping, tail matching, prefix matching or control bypass`);
    }
  }
  const english = requests.filter(url => /\/en-\d{3}\.json$/u.test(url));
  assert.equal(english.length, new Set(group.heads.map(bucket)).size, `${group.id}: reuse validated English shards across all aliases`);
  assert.equal(new Set(english).size, english.length);
  assert.equal(requests.filter(url => url.endsWith("/manifest.json")).length, 1);
});
