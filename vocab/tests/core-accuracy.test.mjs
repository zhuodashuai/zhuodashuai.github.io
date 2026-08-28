import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { lookupParsedCoreEntry, parseCoreDictionary } from "../js/core-dictionary.js";
import { enrichResolved, resolveSpelling } from "../js/services.js";

const dataset = JSON.parse(await readFile(new URL("../quality/datasets/vocab-100.json", import.meta.url), "utf8"));
const corePayload = JSON.parse(await readFile(new URL("../data/ecdict-core.json", import.meta.url), "utf8"));
const dictionary = parseCoreDictionary(corePayload);

function assertRequiredMeanings(item, meaning) {
  for (const alternatives of item.requiredMeaningGroups) {
    assert.ok(
      alternatives.some((alternative) => meaning.includes(alternative)),
      `${item.input}: expected one of [${alternatives.join(", ")}] in ${meaning}`
    );
  }
  for (const forbidden of dataset.forbiddenText) {
    assert.equal(meaning.toLocaleLowerCase("en-US").includes(forbidden.toLocaleLowerCase("en-US")), false, `${item.input}: forbidden ${forbidden}`);
  }
}

test("the local core contains all 100 gold canonical terms and required Chinese senses", () => {
  assert.equal(dictionary.entries.size, corePayload.count);
  for (const item of dataset.entries) {
    const core = lookupParsedCoreEntry(dictionary, item.canonicalTerm);
    assert.ok(core, `${item.input}: missing core entry ${item.canonicalTerm}`);
    assertRequiredMeanings(item, core.meaning);
  }
});

test("the real offline resolution/enrichment pipeline passes all 100 gold cases", async () => {
  let externalRequests = 0;
  const fetchImpl = async () => {
    externalRequests += 1;
    throw new Error("offline accuracy test must not call a provider");
  };
  for (const item of dataset.entries) {
    const resolution = await resolveSpelling(item.input, {
      coreDictionary: dictionary,
      offline: true,
      fetchImpl
    });
    assert.equal(resolution.chosen, item.canonicalTerm, `${item.input}: canonical term`);
    const draft = await enrichResolved(resolution, {
      coreDictionary: dictionary,
      offline: true,
      fetchImpl,
      forceEntryType: item.expectedType
    });
    assert.equal(draft.term, item.canonicalTerm, `${item.input}: draft term`);
    assert.equal(draft.entryType, item.expectedType, `${item.input}: type`);
    assert.equal(draft.quality?.status, "trusted", `${item.input}: quality`);
    assert.equal(draft.needsAttention, false, `${item.input}: attention`);
    assertRequiredMeanings(item, draft.meaning);
    if (item.correctionPolicy === "correct") assert.equal(draft.correction?.status, "autocorrected", item.input);
    else assert.notEqual(draft.correction?.status, "autocorrected", item.input);
  }
  assert.equal(externalRequests, 0);
});

test("the reported hip regression is fixed at the trusted local layer", async () => {
  const resolution = await resolveSpelling("hip", { coreDictionary: dictionary, offline: true });
  const draft = await enrichResolved(resolution, { coreDictionary: dictionary, offline: true });
  assert.match(draft.meaning, /髋|臀/);
  assert.doesNotMatch(draft.meaning, /kamus|ke bi/i);
  assert.equal(draft.quality.status, "trusted");
});
