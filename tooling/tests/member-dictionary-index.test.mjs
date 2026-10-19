import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildMemberDictionary, generateMemberDictionary } from "../scripts/build-member-dictionary.mjs";
import { parseCoreDictionary } from "../../vocab/js/core-dictionary.js";
import { parsePublicSnapshot } from "../../vocab/js/wordbook-schema.js";
import { applyCorePosCorrection, lookupPersonalDictionary, parsePersonalDictionary, personalDictionaryResult } from "../../vocab/js/personal-dictionary.js";
import { MEMBER_DICTIONARY_MANIFEST } from "../../vocab/js/member-dictionary-manifest.js";

const coreBytes = await readFile(new URL("../../vocab/data/ecdict-core.json", import.meta.url));
const publicBytes = await readFile(new URL("../../vocab/data/owner-wordbook.json", import.meta.url));
const dataBytes = await readFile(new URL("../../vocab/data/member-dictionary.json", import.meta.url));
const core = JSON.parse(coreBytes), published = JSON.parse(publicBytes), payload = JSON.parse(dataBytes);
const parsed = parsePersonalDictionary(payload);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

test("member projection and manifest are deterministically reproducible from shipped data", async () => {
  const generated = buildMemberDictionary(core, published, { coreFileSha256: hash(coreBytes), publicFileSha256: hash(publicBytes) });
  assert.deepEqual(generated, payload);
  assert.equal(hash(dataBytes), MEMBER_DICTIONARY_MANIFEST.sha256);
  assert.deepEqual(payload.counts, MEMBER_DICTIONARY_MANIFEST.counts);
  await generateMemberDictionary({ check: true });
  assert.ok(dataBytes.length < coreBytes.length / 2, "member payload removes unused owner fields");
});

test("projection retains existing Chinese core rows and all canonical published glosses without rewriting", async () => {
  const original = parseCoreDictionary(core);
  const snapshot = parsePublicSnapshot(published, { allowLegacy: false });
  const usable = [...original.entries.values()].filter(row => /\p{Script=Han}/u.test(row.meaning));
  assert.equal(payload.counts.core, usable.length);
  assert.equal(payload.counts.omittedWithoutChinese, original.entries.size - usable.length);
  let recoveredOwnLabels = 0;
  for (const [term, pos, meaning] of payload.core) {
    const old = [...original.entries.values()].find(row => row.word === term);
    assert.ok(old, term);
    const ownLabel = old.partOfSpeech.trim() ? old.partOfSpeech : personalDictionaryResult(old)?.partOfSpeech || "";
    assert.equal(pos, ownLabel, term); assert.equal(meaning, old.meaning);
    if (!old.partOfSpeech.trim() && pos) {
      assert.match(old.meaning, /(?:^|\n)\s*(?:noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|numeral|article|abbreviation|interj|pron|prep|conj|modal|abbr|adj|adv|aux|det|num|art|int|vt|vi|ad|n|v|a)\.\s*/iu,
        `${term}: a recovered compact POS must come from a label in the original Chinese, not an external review`);
      recoveredOwnLabels++;
    }
  }
  assert.ok(recoveredOwnLabels > 0, "recover the original source's explicit labels without copying external POS into the MIT-only payload");
  assert.equal(payload.counts.published, snapshot.entries.length);
  for (const row of snapshot.entries) {
    const projected = payload.published.find(item => item[0] === row.term);
    assert.ok(projected, row.term);
    assert.deepEqual(projected.slice(0, 3), [row.term, row.partOfSpeech, row.meaning]);
    const result = await lookupPersonalDictionary(row.term, { dictionary: parsed });
    const coreRow = [...original.entries.values()].find(item => item.word.toLocaleLowerCase("en-US") === row.term.toLocaleLowerCase("en-US"));
    if (coreRow && /\p{Script=Han}/u.test(coreRow.meaning)) assert.deepEqual(result,
      applyCorePosCorrection(coreRow, personalDictionaryResult(coreRow)), row.term);
    else {
      assert.equal(result.source, "卓的公开词库", row.term);
      assert.equal(result.term, row.term); assert.equal(result.partOfSpeech, row.partOfSpeech);
      assert.equal(result.meaning, row.meaning);
    }
  }
});

test("index contains only POS/glosses/forms and public labels, never full records or original-dictionary batches", () => {
  assert.deepEqual(Object.keys(payload).sort(), ["core", "counts", "published", "schemaVersion", "source"]);
  assert.ok(payload.core.every(row => row.length === 4 && row[3].every(item => typeof item === "string")));
  assert.ok(payload.published.every(row => row.length === 4 && row[3].every(item => item.length === 3)));
  const text = dataBytes.toString("utf8");
  assert.doesNotMatch(text, /"(?:readingContexts|definition|definitionEn|exampleEn|exampleZh|authorship|csrfToken|password|lastMutationId|organizationMethod|createdAt|updatedAt|id|note)"\s*:/u);
  assert.doesNotMatch(text, /original-pilot|batch-000[2-5]|independent-composition/u);
  assert.equal(payload.source.core.license, "MIT");
});

test("legal public long/no-Chinese glosses are explicitly omitted, never truncated or fatal", async () => {
  const provenance = { coreFileSha256: hash(coreBytes), publicFileSha256: hash(publicBytes) };
  for (const meaning of ["中".repeat(2450), "not a Chinese gloss"]) {
    const wider = structuredClone(published); wider.entries[0].meaning = meaning;
    assert.doesNotThrow(() => parsePublicSnapshot(wider, { allowLegacy: false }));
    const result = buildMemberDictionary(core, wider, provenance);
    assert.equal(result.counts.publishedInput, published.entries.length);
    assert.equal(result.counts.published, published.entries.length - 1);
    assert.equal(result.counts.omittedPublishedEntries, 1);
    assert.equal(result.published.some(row => row[0] === wider.entries[0].term), false);
    assert.ok(result.published.every(row => [...row[2]].length <= 2000));
    const index = parsePersonalDictionary(result);
    assert.equal((await lookupPersonalDictionary("perspicacious", { dictionary: index })).term, "perspicacious");
    assert.equal((await lookupPersonalDictionary("apple", { dictionary: index })).term, "apple");
  }
});

test("legal public long terms and original aliases are omitted with balanced counts", () => {
  const provenance = { coreFileSha256: hash(coreBytes), publicFileSha256: hash(publicBytes) };
  const longer = structuredClone(published);
  const entry = longer.entries[0];
  const longTerm = `${"example ".repeat(40)}entry`.trim();
  entry.term = entry.normalized = entry.standardForm = entry.originalInput = longTerm;
  entry.correction.original = entry.correction.chosen = longTerm;
  assert.doesNotThrow(() => parsePublicSnapshot(longer, { allowLegacy: false }));
  const omittedTerm = buildMemberDictionary(core, longer, provenance);
  assert.equal(omittedTerm.counts.omittedPublishedEntries, 1);
  assert.equal(omittedTerm.published.some(row => row[0] === longTerm), false);
  parsePersonalDictionary(omittedTerm);

  const badAlias = structuredClone(published);
  const carer = badAlias.entries.find(item => item.term === "carer");
  carer.readingContexts[0].originalInput = longTerm;
  assert.doesNotThrow(() => parsePublicSnapshot(badAlias, { allowLegacy: false }));
  const omittedAlias = buildMemberDictionary(core, badAlias, provenance);
  assert.equal(omittedAlias.counts.omittedPublishedEntries, 0);
  assert.equal(omittedAlias.counts.omittedPublicAliases, 1);
  assert.equal(omittedAlias.counts.publicAliasesInput, omittedAlias.counts.publicAliases + 1);
  assert.equal(omittedAlias.published.find(row => row[0] === "carer")[3].some(row => row[0] === longTerm), false);
  parsePersonalDictionary(omittedAlias);
});

test("an invalid source still fails strict validation rather than being counted as an omission", () => {
  const provenance = { coreFileSha256: hash(coreBytes), publicFileSha256: hash(publicBytes) };
  const invalid = structuredClone(published); invalid.entries[0].unrecognizedField = "not public schema";
  assert.throws(() => buildMemberDictionary(core, invalid, provenance));
  const badLicense = structuredClone(core); badLicense.source.license = "not-MIT";
  assert.throws(() => buildMemberDictionary(badLicense, published, provenance), /provenance/u);
});

test("legal non-English reading aliases are omitted instead of breaking the whole member index", async () => {
  const provenance = { coreFileSha256: hash(coreBytes), publicFileSha256: hash(publicBytes) };
  for (const alias of ["原文", "123"]) {
    const wider = structuredClone(published);
    wider.entries.find(entry => entry.term === "carer").readingContexts[0].originalInput = alias;
    assert.doesNotThrow(() => parsePublicSnapshot(wider, { allowLegacy: false }));
    const result = buildMemberDictionary(core, wider, provenance);
    assert.equal(result.counts.omittedPublishedEntries, 0);
    assert.equal(result.counts.omittedPublicAliases, 1);
    assert.equal(result.counts.publicAliasesInput, result.counts.publicAliases + 1);
    assert.equal(result.published.find(row => row[0] === "carer")[3].some(row => row[0] === alias), false);
    const index = parsePersonalDictionary(result);
    assert.equal((await lookupPersonalDictionary("carer", { dictionary: index })).term, "carer");
    assert.equal((await lookupPersonalDictionary("24/7", { dictionary: index })).term, "24/7");
  }
});

test("reading aliases preserve one actual context and never accept the old typo as a headword", async () => {
  assert.equal((await lookupPersonalDictionary("carers", { dictionary: parsed })).term, "carer");
  assert.equal(await lookupPersonalDictionary("surveilance", { dictionary: parsed }), null);
  for (const row of payload.published) {
    assert.ok(row[3].every(alias => alias[0].toLowerCase() !== "surveilance"));
  }
});
