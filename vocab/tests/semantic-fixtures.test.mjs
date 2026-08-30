import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const datasetUrl = new URL("../quality/datasets/semantic-qa.json", import.meta.url);
const rawDataset = await readFile(datasetUrl, "utf8");
const dataset = JSON.parse(rawDataset);
const executionMatrix = await readFile(new URL("../../tests/fixtures/semantic-test-cases.md", import.meta.url), "utf8");

const EXPECTED_CATEGORY_INPUTS = {
  polysemy: ["hip", "bank", "charge", "fair", "fine", "light", "mean", "issue", "scale", "pitch", "draft", "record"],
  multiword: ["jab at", "look up", "take off", "break down", "come across", "account for", "figure out", "put up with"],
  misspelling: ["recieve", "accomodate", "enviroment", "definately", "seperate", "occured"],
  regional_spelling: ["colour", "organise", "learnt", "travelling", "enrolment", "judgement", "programme"],
  inflection: ["hips", "went", "better", "children", "mice", "studying", "written"],
  idiom: ["spill the beans", "a blessing in disguise", "take it with a grain of salt", "hit the nail on the head", "under the weather"],
  quote: [
    "The only thing we have to fear is fear itself.",
    "Be the change you wish to see in the world.",
    "Courage grows quietly before anyone notices.",
    "When violet clocks forgive the rain, the silent compass wakes."
  ],
  normalization: ["hip", "Hip", "HIP", "hip", "hip!", "\"hip\"", "hip", "hip"],
  adversarial: [
    "",
    "   ",
    "a",
    "<generated-overlong-text>",
    "12345",
    "🧠✨",
    "学习",
    "hello世界",
    "<script>alert(1)</script>",
    "<b>hip</b>",
    "javascript:alert(1)",
    "{\"entries\":[",
    "hip",
    "hip"
  ]
};

const EXPECTED_CORRECTIONS = new Map([
  ["recieve", "receive"],
  ["accomodate", "accommodate"],
  ["enviroment", "environment"],
  ["definately", "definitely"],
  ["seperate", "separate"],
  ["occured", "occurred"]
]);

const EXPECTED_LEMMAS = new Map([
  ["hips", ["hip"]],
  ["went", ["go"]],
  ["better", ["good", "well"]],
  ["children", ["child"]],
  ["mice", ["mouse"]],
  ["studying", ["study"]],
  ["written", ["write"]]
]);

const severityLevels = new Set(["Critical", "High", "Medium", "Low"]);

function caseById(id) {
  const found = dataset.cases.find((entry) => entry.id === id);
  assert.ok(found, `missing fixture ${id}`);
  return found;
}

function senseById(entry, conceptId) {
  const found = entry.expected.senses?.find((sense) => sense.conceptId === conceptId);
  assert.ok(found, `${entry.id} is missing sense ${conceptId}`);
  return found;
}

test("the semantic fixture is public, parseable, and contains the exact 71-case matrix", () => {
  assert.equal(dataset.schemaVersion, 1);
  assert.match(dataset.description, /Public, synthetic/);
  assert.equal(dataset.cases.length, 71);
  assert.deepEqual(dataset.expectedCategoryCounts, Object.fromEntries(
    Object.entries(EXPECTED_CATEGORY_INPUTS).map(([category, inputs]) => [category, inputs.length])
  ));

  for (const [category, expectedInputs] of Object.entries(EXPECTED_CATEGORY_INPUTS)) {
    const actualInputs = dataset.cases.filter((entry) => entry.category === category).map((entry) => entry.input);
    assert.deepEqual(actualInputs, expectedInputs, `${category} inputs changed or lost their agreed order`);
  }
});

test("case, rubric, source, and per-case sense identities are unique", () => {
  const caseIds = dataset.cases.map((entry) => entry.id);
  const rubricIds = dataset.rubric.dimensions.map((dimension) => dimension.id);
  const sourceIds = dataset.sources.map((source) => source.id);

  assert.equal(new Set(caseIds).size, caseIds.length, "case ids must be unique");
  assert.equal(new Set(rubricIds).size, rubricIds.length, "rubric ids must be unique");
  assert.equal(new Set(sourceIds).size, sourceIds.length, "source ids must be unique");

  for (const entry of dataset.cases) {
    const conceptIds = (entry.expected.senses ?? []).map((sense) => sense.conceptId);
    assert.equal(new Set(conceptIds).size, conceptIds.length, `${entry.id} repeats a sense concept id`);
  }
});

test("the reusable rubric has exactly 16 scored dimensions and strict failure gates", () => {
  assert.equal(dataset.rubric.id, "semantic-16-v1");
  assert.deepEqual(Object.keys(dataset.rubric.scale).sort(), ["0", "1", "2"]);
  assert.equal(dataset.rubric.dimensions.length, 16);
  assert.equal(dataset.rubric.passThreshold, 28);
  assert.match(dataset.rubric.hardFailRule, /fabricated source/i);
  assert.match(dataset.rubric.hardFailRule, /incorrect core meaning/i);
  assert.ok(dataset.rubric.dimensions.filter((dimension) => dimension.critical).length >= 10);

  for (const dimension of dataset.rubric.dimensions) {
    assert.match(dimension.id, /^[a-z][a-z0-9_]+$/);
    assert.equal(typeof dimension.label, "string");
    assert.ok(dimension.label.length > 8);
    assert.equal(typeof dimension.critical, "boolean");
  }
});

test("every case defines severity, classification, and an explicit canonical-key decision", () => {
  for (const entry of dataset.cases) {
    assert.match(entry.id, /^(polysemy|multiword|misspelling|regional|inflection|idiom|quote|normalization|adversarial)-[a-z0-9-]+$/);
    assert.ok(severityLevels.has(entry.severity), `${entry.id} has an unsupported severity`);
    assert.ok(Object.hasOwn(entry.expected, "canonicalKey"), `${entry.id} lacks canonicalKey`);
    assert.ok(entry.expected.canonicalKey === null || typeof entry.expected.canonicalKey === "string", `${entry.id} has an invalid canonicalKey`);
    assert.equal(typeof entry.expected.classification, "string", `${entry.id} lacks classification`);
    assert.ok(entry.expected.classification.length > 0);
  }
});

test("spelling corrections are exact, preserve the original, and require a decision", () => {
  const cases = dataset.cases.filter((entry) => entry.category === "misspelling");
  assert.equal(cases.length, EXPECTED_CORRECTIONS.size);

  for (const entry of cases) {
    const expectedCorrection = EXPECTED_CORRECTIONS.get(entry.input);
    assert.equal(entry.expected.canonicalKey, expectedCorrection);
    assert.deepEqual(entry.expected.correction.suggestions, [expectedCorrection]);
    assert.equal(entry.expected.correction.status, "suggestion_required");
    assert.equal(entry.expected.correction.confidenceBand, "high");
    assert.equal(entry.expected.correction.mustPreserveOriginal, true);
    assert.equal(entry.expected.correction.mustRequireConfirmation, true);
    assert.equal(entry.expected.correction.mustAutoApply, false);
  }
});

test("all listed British and Australian forms are valid regional variants, never spelling errors", () => {
  const cases = dataset.cases.filter((entry) => entry.category === "regional_spelling");
  assert.equal(cases.length, 7);

  for (const entry of cases) {
    assert.equal(entry.expected.canonicalKey, entry.input.toLocaleLowerCase("en-US"));
    assert.equal(entry.expected.correction.status, "valid");
    assert.equal(entry.expected.correction.mustAutoApply, false);
    assert.equal(entry.expected.variant.status, "valid_regional");
    assert.equal(entry.expected.variant.mustNotMarkMisspelled, true);
    assert.ok(entry.expected.variant.regions.length >= 1);
    assert.ok(entry.expected.variant.relatedForms.length >= 1);
  }

  const programme = caseById("regional-programme");
  assert.deepEqual(programme.expected.variant.regions, ["British"]);
  assert.match(programme.expected.variant.note, /Australian English usually prefers program/);
});

test("all inflection cases preserve their surface key and expose the agreed lemma relationships", () => {
  for (const entry of dataset.cases.filter((candidate) => candidate.category === "inflection")) {
    const expectedLemmas = EXPECTED_LEMMAS.get(entry.input);
    const actualLemmas = entry.expected.lemma.terms ?? [entry.expected.lemma.term];
    assert.deepEqual(actualLemmas, expectedLemmas, `${entry.id} lemma changed`);
    assert.equal(entry.expected.canonicalKey, entry.input.toLocaleLowerCase("en-US"));
    assert.equal(entry.expected.correction.status, "valid");
    assert.match(entry.expected.lemma.relation, /./);
  }
});

test("hip encodes every non-negotiable pronunciation, POS, priority, and Chinese-meaning rule", () => {
  const hip = caseById("polysemy-hip");
  assert.equal(hip.expected.canonicalKey, "hip");
  assert.equal(hip.expected.classification, "word");
  assert.equal(hip.expected.correction.status, "valid");
  assert.equal(hip.expected.correction.mustAutoApply, false);
  assert.deepEqual(hip.expected.corePos, ["noun", "adjective"]);
  assert.ok(hip.expected.ipaAllowed.includes("/hɪp/"));

  const body = senseById(hip, "body-or-hip-joint");
  const fashionable = senseById(hip, "fashionable-or-current");
  const rose = senseById(hip, "rose-fruit");
  assert.equal(body.pos, "noun");
  assert.equal(body.priority, 1);
  assert.ok(body.chineseConcepts.includes("髋部"));
  assert.ok(body.chineseConcepts.includes("髋关节"));
  assert.equal(fashionable.pos, "adjective");
  assert.equal(fashionable.priority, 2);
  assert.equal(fashionable.register, "informal");
  assert.equal(rose.optional, true);
  assert.equal(rose.priority, 3);
  assert.match(hip.expected.forbidden.join("\n"), /只.*屁股|only as 屁股/);
  assert.match(hip.expected.forbidden.join("\n"), /rose-fruit first/);

  const citedPublishers = new Set(hip.sourceIds.map((id) => dataset.sources.find((source) => source.id === id)?.publisher));
  assert.ok(citedPublishers.has("Cambridge University Press"));
  assert.ok(citedPublishers.has("Oxford University Press"));
  assert.ok(citedPublishers.has("Merriam-Webster"));
  assert.ok(citedPublishers.size >= 3, "hip must be cross-checked against multiple authoritative dictionaries");
});

test("multiword cases preserve the whole expression and keep jab at distinct from take a jab at", () => {
  for (const entry of dataset.cases.filter((candidate) => candidate.category === "multiword")) {
    assert.equal(entry.expected.canonicalKey, entry.input);
    assert.equal(entry.expected.classification, "multiword_expression");
    assert.ok(entry.expected.senses.length >= 1);
  }

  const jab = caseById("multiword-jab-at");
  assert.equal(senseById(jab, "quick-poke-prod-or-boxing-jab-toward").priority, 1);
  assert.match(jab.expected.forbidden.join("\n"), /take a jab at/);
  assert.match(jab.expected.forbidden.join("\n"), /criticize/);
});

test("quote fixtures distinguish verified, disputed, unsourced, and deliberately fabricated text", () => {
  const verified = caseById("quote-verified-fdr");
  assert.equal(verified.expected.attribution.status, "verified");
  assert.equal(verified.expected.attribution.author, "Franklin D. Roosevelt");
  assert.equal(verified.expected.attribution.requiredSourceHost, "www.archives.gov");
  assert.match(verified.expected.attribution.sourceUrl, /^https:\/\/www\.archives\.gov\//);

  const disputed = caseById("quote-misattributed-gandhi");
  assert.deepEqual(disputed.expected.attribution.allowedStatuses, ["candidate", "unverified"]);
  assert.deepEqual(disputed.expected.attribution.forbiddenVerifiedAuthors, ["Mahatma Gandhi"]);

  for (const id of ["quote-no-reliable-source", "quote-deliberately-fabricated"]) {
    const entry = caseById(id);
    assert.equal(entry.expected.attribution.status, "unverified");
    assert.deepEqual(entry.expected.attribution.mustLeaveBlank, ["author", "work", "date", "sourceUrl"]);
  }
});

test("normalization variants deduplicate to hip while retaining the submitted display form", () => {
  const cases = dataset.cases.filter((entry) => entry.category === "normalization");
  assert.equal(cases.length, 8);
  for (const entry of cases) {
    assert.equal(entry.expected.canonicalKey, "hip");
    assert.equal(entry.expected.normalization.dedupeTarget, "hip");
    assert.equal(entry.expected.normalization.mustCreateNewEntry, false);
  }
  assert.equal(caseById("normalization-rapid-double").expected.normalization.expectedUniqueEntries, 1);
  assert.equal(caseById("normalization-after-save").expected.normalization.expectedUniqueEntries, 1);
});

test("adversarial fixtures cover validation, XSS, unsafe URLs, atomic imports, and races", () => {
  assert.deepEqual(caseById("adversarial-overlong").inputGenerator, { unit: "a", repeat: 4097 });
  assert.equal(caseById("adversarial-script").severity, "Critical");
  assert.equal(caseById("adversarial-html").severity, "Critical");
  assert.equal(caseById("adversarial-javascript-url").severity, "Critical");
  assert.match(caseById("adversarial-corrupt-json").expected.forbidden.join("\n"), /partial import/);
  assert.match(caseById("adversarial-double-save").expected.behavior.join("\n"), /idempotency/i);
  assert.deepEqual(caseById("adversarial-ai-race").inputSequence, ["hip", "bank"]);
  assert.match(caseById("adversarial-ai-race").expected.forbidden.join("\n"), /overwrites bank/);
});

test("all cited sources are HTTPS, resolvable by id, and the fixture contains no personal identifiers", () => {
  const sourceIds = new Set(dataset.sources.map((source) => source.id));
  for (const source of dataset.sources) {
    assert.match(source.url, /^https:\/\//, `${source.id} is not HTTPS`);
    assert.doesNotThrow(() => new URL(source.url));
  }
  for (const entry of dataset.cases) {
    for (const sourceId of entry.sourceIds ?? []) assert.ok(sourceIds.has(sourceId), `${entry.id} cites unknown source ${sourceId}`);
  }

  const personalFragments = ["zhuo" + "dashuai", "156" + "042078", "C:" + "\\Users\\", "@gmail.com"];
  for (const fragment of personalFragments) {
    assert.ok(!rawDataset.toLocaleLowerCase("en-US").includes(fragment.toLocaleLowerCase("en-US")), `fixture contains personal fragment ${fragment}`);
  }
});

test("the human execution matrix stays synchronized with the machine-readable fixture", () => {
  for (const entry of dataset.cases) {
    assert.match(executionMatrix, new RegExp(`\\| ${entry.id} \\|`), `${entry.id} is absent from the semantic test matrix`);
  }

  const rubricRows = [...executionMatrix.matchAll(/^\|\s*(\d+)\s*\|\s*[^|]+\|\s*(?:Yes|No)\s*\|/gm)];
  assert.deepEqual(rubricRows.map((match) => Number(match[1])), Array.from({ length: dataset.rubric.dimensions.length }, (_, index) => index + 1));

  for (const source of dataset.sources) {
    assert.ok(executionMatrix.includes(`](${source.url})`), `${source.id} is absent from the semantic test matrix`);
  }
});
