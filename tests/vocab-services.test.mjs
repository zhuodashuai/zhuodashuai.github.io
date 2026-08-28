import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { lookupParsedCoreEntry, parseCoreDictionary } from "../vocab/js/core-dictionary.js";
import {
  enrichResolved,
  fetchDictionaryEntry,
  lookupTerm,
  resolveSpelling,
  selectDictionaryData,
  validateLookupInput,
  validateMyMemoryPayload
} from "../vocab/js/services.js";

const payload = JSON.parse(await readFile(new URL("../vocab/data/ecdict-core.json", import.meta.url), "utf8"));
const coreDictionary = parseCoreDictionary(payload);

const emptyDictionary = (term) => ({
  headword: term,
  entries: [],
  selectedEntry: null,
  selectedSenses: [],
  partOfSpeech: "",
  phonetic: "",
  definitions: [],
  example: "",
  forms: [],
  translations: [],
  sourceUrl: "",
  hasUsableSenses: false
});

test("generated ECDICT core is internally consistent and locks at least 100 terms", () => {
  assert.equal(coreDictionary.entries.size, 7500);
  assert.deepEqual(payload.requiredMissing, []);
  const coverage = [
    "accept", "accommodate", "achieve", "advice", "affect", "allow", "answer", "appear", "apply", "argument",
    "arrive", "article", "available", "avoid", "bank", "bat", "bear", "become", "begin", "believe",
    "book", "break", "break down", "bring", "build", "business", "call", "carry", "carry on", "centre",
    "change", "charge", "choose", "colour", "come", "common", "complete", "consider", "continue", "correct",
    "create", "current", "date", "decide", "definitely", "describe", "develop", "different", "difficult", "education",
    "effect", "environment", "example", "experience", "explain", "fact", "fair", "feel", "file", "find",
    "follow", "form", "friend", "get", "give", "give up", "good", "government", "great", "happen",
    "help", "hip", "important", "include", "information", "issue", "jab", "keep", "know", "language",
    "learn", "leave", "life", "light", "look", "look after", "make", "match", "mean", "meaning",
    "necessary", "need", "number", "offer", "people", "place", "plant", "point", "possible", "problem",
    "provide", "public", "put", "put up with", "question", "realise", "receive", "remember", "research", "right"
  ];
  assert.equal(coverage.length, 110);
  for (const term of coverage) {
    const entry = lookupParsedCoreEntry(coreDictionary, term);
    assert.ok(entry?.meaning, `missing trusted core meaning for ${term}`);
  }
});

test("hip override is anatomical, noun-first and trusted", async () => {
  const entry = lookupParsedCoreEntry(coreDictionary, "hip");
  assert.equal(entry.partOfSpeech, "noun");
  assert.match(entry.meaning, /髋部/);
  assert.match(entry.meaning, /臀部/);
  const resolution = await resolveSpelling("hip", { coreDictionary, offline: true });
  const draft = await enrichResolved(resolution, { coreDictionary, offline: true });
  assert.equal(draft.partOfSpeech, "noun");
  assert.equal(draft.quality.status, "trusted");
  assert.equal(draft.quality.autoSave, true);
  assert.match(draft.meaning, /髋部/);
});

test("FreeDictionary keeps provider entry order and filters invalid Chinese text", () => {
  const result = selectDictionaryData({
    word: "hip",
    entries: [
      {
        partOfSpeech: "noun",
        pronunciations: [{ type: "ipa", text: "/hɪp/" }],
        forms: [{ word: "hips" }],
        senses: [{
          definition: "The part of the pelvis at the top of the thigh.",
          tags: ["anatomy"],
          examples: ["She put her hands on her hips."],
          translations: [
            { language: { code: "zh", name: "Chinese" }, word: "йинхон" },
            { language: { code: "cmn", name: "Chinese Mandarin" }, word: "髖部 /髋部" }
          ],
          subsenses: []
        }]
      },
      {
        partOfSpeech: "verb",
        senses: [{ definition: "To bump with one's hips.", tags: [], examples: [], translations: [], subsenses: [] }]
      }
    ],
    source: { url: "https://en.wiktionary.org/wiki/hip" }
  }, "hip");
  assert.equal(result.partOfSpeech, "noun");
  assert.equal(result.definitions.length, 1);
  assert.equal(result.hasUsableSenses, true);
  assert.deepEqual(result.translations, ["髋部"]);
});

test("unsafe-only dictionary entries do not block LanguageTool correction", async () => {
  const unsafe = selectDictionaryData({
    word: "occured",
    entries: [{
      partOfSpeech: "verb",
      pronunciations: [],
      forms: [],
      senses: [{
        definition: "Misspelling of occurred.",
        tags: ["alt of", "misspelling"],
        examples: [],
        translations: [],
        subsenses: []
      }]
    }],
    source: { url: "https://en.wiktionary.org/wiki/occured" }
  }, "occured");
  assert.equal(unsafe.hasUsableSenses, false);
  assert.deepEqual(unsafe.definitions, []);

  const unsafeDraft = await enrichResolved({
    chosen: "occured",
    original: "occured",
    core: null,
    dictionary: unsafe,
    correction: { status: "exact", original: "occured", chosen: "occured", confidence: 1, candidates: [], source: "unchecked" }
  }, { coreDictionary, offline: true });
  assert.equal(unsafeDraft.sourceUrl, "", "an unusable dictionary shell must not be presented as a validating source");
  assert.doesNotMatch(unsafeDraft.sources.join(" "), /Wiktionary|FreeDictionaryAPI/);

  let requestedLanguage = "";
  const occurred = selectDictionaryData({
    word: "occurred",
    entries: [{
      partOfSpeech: "verb",
      pronunciations: [],
      forms: [],
      senses: [{ definition: "Simple past tense and past participle of occur.", tags: [], examples: [], translations: [], subsenses: [] }]
    }],
    source: { url: "https://en.wiktionary.org/wiki/occurred" }
  }, "occurred");
  const resolution = await resolveSpelling("occured", {
    coreDictionary,
    offline: false,
    dictionaryLookup: async (term) => term === "occured" ? unsafe : (term === "occurred" ? occurred : emptyDictionary(term)),
    fetchImpl: async (_url, options) => {
      requestedLanguage = new URLSearchParams(options.body).get("language");
      return {
        ok: true,
        json: async () => ({
          matches: [{
            offset: 0,
            length: 7,
            rule: { issueType: "misspelling" },
            replacements: [{ value: "occurred" }]
          }]
        })
      };
    }
  });
  assert.equal(requestedLanguage, "en-GB");
  assert.equal(resolution.chosen, "occurred");
  assert.equal(resolution.correction.status, "autocorrected");
  assert.match(resolution.correction.source, /LanguageTool/);
});

test("whole phrases are sent to FreeDictionary without headword truncation", async () => {
  let requested = "";
  const fetchImpl = async (url) => {
    requested = String(url);
    return {
      ok: true,
      json: async () => ({
        word: "look after",
        entries: [{
          partOfSpeech: "verb",
          pronunciations: [],
          forms: [],
          senses: [{ definition: "To care for; to keep safe.", tags: [], examples: [], translations: [], subsenses: [] }]
        }],
        source: { url: "https://en.wiktionary.org/wiki/look_after" }
      })
    };
  };
  const entry = await fetchDictionaryEntry("look after", { fetchImpl });
  assert.match(requested, /look%20after\?translations=true$/);
  assert.doesNotMatch(requested, /entries\/en\/look\?/);
  assert.equal(entry.headword, "look after");
});

test("all 20 gold phrases have aligned editorial English definitions", async () => {
  const expected = new Map([
    ["look after", /care for|take care/i],
    ["give up", /stop trying/i],
    ["take off", /remove an item of clothing/i],
    ["run into", /meet someone unexpectedly/i],
    ["carry out", /perform or complete/i],
    ["account for", /explain the reason/i],
    ["put up with", /tolerate/i],
    ["get along with", /friendly or workable relationship/i],
    ["come across", /by chance/i],
    ["turn down", /refuse an offer/i],
    ["figure out", /understand something/i],
    ["break down", /stop working/i],
    ["bring about", /cause something to happen/i],
    ["point out", /draw attention/i],
    ["rely on", /depend on or trust/i],
    ["deal with", /handle, manage, or respond/i],
    ["set up", /establish or create/i],
    ["take part in", /participate/i],
    ["in charge of", /responsible for/i],
    ["by and large", /generally or on the whole/i]
  ]);
  for (const [phrase, pattern] of expected) {
    const core = lookupParsedCoreEntry(coreDictionary, phrase);
    assert.ok(core?.tags.includes("editorial"), `${phrase}: editorial provenance`);
    assert.match(core.definition, pattern, phrase);
    const resolution = await resolveSpelling(phrase, { coreDictionary, offline: true });
    const draft = await enrichResolved(resolution, { coreDictionary, offline: true });
    assert.match(draft.definition, pattern, `${phrase}: enriched definition`);
  }

  const phrase = "come across";
  const resolution = await resolveSpelling(phrase, { coreDictionary, offline: true });
  resolution.dictionary = {
    ...emptyDictionary(phrase),
    entries: [{}],
    hasUsableSenses: true,
    definitions: ["To change sides.", "To give a particular impression."],
    example: "He came across the street towards me."
  };
  const draft = await enrichResolved(resolution, { coreDictionary, offline: true });
  assert.match(draft.definition, /meet someone or find something by chance/i);
  assert.doesNotMatch(draft.definition, /change sides|cross/i, "homonymous live senses must not be appended to an editorial phrase");
  assert.equal(draft.exampleEn, "", "a literal crossing example must not appear beside the chance encounter sense");
});

test("lookupTerm routes quotations and explicit proverbs to attribution-safe drafts", async () => {
  const quote = await lookupTerm("The only way to do great work is to love what you do.", {
    coreDictionary,
    offline: true
  });
  assert.equal(quote.entryType, "quote");
  assert.equal(quote.attributionStatus, "unverified");
  assert.equal(quote.quality.autoSave, false);
  assert.match(quote.usage, /出处/);

  const proverb = await lookupTerm("A stitch in time saves nine.", {
    coreDictionary,
    offline: true,
    forceEntryType: "proverb"
  });
  assert.equal(proverb.entryType, "proverb");
  assert.equal(proverb.attributionStatus, "unverified");
  assert.match(proverb.usage, /作者通常未知/);
});

test("correct British, branded and technical spellings never reach LanguageTool", async () => {
  const spellings = ["colour", "centre", "realise", "Beijing", "iPhone", "COVID-19", "e.g.", "Ph.D.", "24/7", "U.S.", "can't", "C++"];
  let languageToolCalls = 0;
  for (const spelling of spellings) {
    assert.equal(validateLookupInput(spelling), spelling);
    const resolution = await resolveSpelling(spelling, {
      coreDictionary,
      offline: false,
      dictionaryLookup: emptyDictionary,
      languageToolLookup: async () => {
        languageToolCalls += 1;
        return { matches: [] };
      }
    });
    assert.equal(resolution.correction.status, "exact", spelling);
    assert.notEqual(resolution.correction.status, "autocorrected", spelling);
  }
  assert.equal(languageToolCalls, 0);
});

test("all reviewed local misspellings outrank descriptive dictionary rows", async () => {
  const cases = new Map([
    ["accomodate", "accommodate"],
    ["definately", "definitely"],
    ["enviroment", "environment"],
    ["neccessary", "necessary"],
    ["recieve", "receive"],
    ["seperate", "separate"],
    ["wierd", "weird"]
  ]);
  let exactMisspellingLookups = 0;
  for (const [misspelling, target] of cases) {
    const resolution = await resolveSpelling(misspelling, {
      coreDictionary,
      offline: false,
      dictionaryLookup: async (term) => {
        if (term === misspelling) exactMisspellingLookups += 1;
        return emptyDictionary(term);
      },
      languageToolLookup: async () => {
        throw new Error("LanguageTool should not be needed");
      }
    });
    assert.equal(resolution.chosen, target, misspelling);
    assert.equal(resolution.correction.status, "autocorrected", misspelling);
    assert.equal(resolution.correction.source, "local", misspelling);
    const draft = await enrichResolved(resolution, { coreDictionary, offline: true });
    assert.ok(draft.meaning, `${misspelling}: corrected target must enrich locally`);
    assert.equal(draft.quality.status, "trusted", misspelling);
  }
  assert.equal(exactMisspellingLookups, 0);
});

test("skipCorrection is the explicit opt-out for a reviewed misspelling", async () => {
  const resolution = await resolveSpelling("accomodate", {
    coreDictionary,
    offline: true,
    skipCorrection: true,
    dictionaryLookup: emptyDictionary
  });
  assert.equal(resolution.chosen, "accomodate");
  assert.notEqual(resolution.correction.status, "autocorrected");
});

test("MyMemory garbage is rejected even at match 1 and quality 100", () => {
  const garbage = {
    responseStatus: 200,
    quotaFinished: false,
    responseDetails: "",
    responseData: { translatedText: "kamus在线bm ke bi", match: .99 },
    matches: [{ quality: "100", match: .99 }]
  };
  assert.deepEqual(validateMyMemoryPayload(garbage, "hip"), {
    ok: false, text: "", reason: "bare-vocabulary"
  });
  assert.equal(validateMyMemoryPayload({
    responseStatus: 200,
    quotaFinished: false,
    responseDetails: "",
    responseData: { translatedText: "得分", match: 1 }
  }, "run").ok, false);
  assert.equal(validateMyMemoryPayload({
    responseStatus: 200,
    quotaFinished: false,
    responseDetails: "",
    responseData: { translatedText: "光污染", match: 1 }
  }, "light").ok, false);
});

test("long contextual machine translation can only become a candidate", () => {
  const result = validateMyMemoryPayload({
    responseStatus: 200,
    quotaFinished: false,
    responseDetails: "",
    responseData: { translatedText: "照顾某人或某事，并保证他们的安全。", match: .85 }
  }, "To care for someone and keep them safe.");
  assert.equal(result.ok, true);
  assert.equal(result.reason, "machine-candidate");
});

test("quota and warning payloads can never leak into a meaning", () => {
  const result = validateMyMemoryPayload({
    responseStatus: 403,
    quotaFinished: true,
    responseDetails: "Quota finished",
    responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY", match: 1 }
  }, "This is a sufficiently long sentence.");
  assert.equal(result.ok, false);
  assert.equal(result.text, "");
});
