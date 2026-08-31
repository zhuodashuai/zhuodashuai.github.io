import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCoreDictionary } from "../../../vocab/js/core-dictionary.js";
import {
  fetchDictionaryEntry,
  resolveSpelling,
  validateMyMemoryPayload
} from "../../../vocab/js/services.js";

const corePayload = JSON.parse(await readFile(new URL("../../../vocab/data/ecdict-core.json", import.meta.url), "utf8"));
const coreDictionary = parseCoreDictionary(corePayload);

test("live FreeDictionary keeps hip noun-first and anatomical", async () => {
  const entry = await fetchDictionaryEntry("hip");
  assert.equal(entry.headword.toLocaleLowerCase("en-US"), "hip");
  assert.equal(entry.partOfSpeech, "noun");
  assert.ok(entry.definitions.some((definition) => /pelvis|femur|thigh|anatom/i.test(definition)));
});

test("live FreeDictionary receives and resolves the whole look after phrase", async () => {
  const entry = await fetchDictionaryEntry("look after");
  assert.equal(entry.headword.toLocaleLowerCase("en-US"), "look after");
  assert.equal(entry.partOfSpeech, "verb");
  assert.ok(entry.definitions.some((definition) => /care for|keep safe/i.test(definition)));
});

test("live MyMemory output for a bare word is never trusted as a dictionary meaning", async () => {
  const response = await fetch("https://api.mymemory.translated.net/get?q=hip&langpair=en%7Czh-CN&mt=1");
  assert.equal(response.ok, true);
  const payload = await response.json();
  const validated = validateMyMemoryPayload(payload, "hip");
  assert.equal(validated.ok, false);
  assert.equal(validated.text, "");
  assert.equal(validated.reason, "bare-vocabulary");
});

test("live LanguageTool en-GB fallback corrects and verifies an unknown misspelling", async () => {
  const resolution = await resolveSpelling("helllo", { coreDictionary, offline: false });
  assert.equal(resolution.chosen, "hello");
  assert.equal(resolution.correction.status, "autocorrected");
  assert.match(resolution.correction.source, /LanguageTool/);
});
