/** Independently composed dictionary drafts. No network, source-PDF or AI access. */
export const ORIGINAL_DICTIONARY_LIMITS = Object.freeze({
  entries: 100_000, formsPerEntry: 32, sensesPerEntry: 24, examplesPerSense: 8,
  totalSenses: 200_000, totalExamples: 400_000, totalCharacters: 256 * 1024 * 1024,
  id: 120, headword: 160, definition: 2000, example: 1200, reviewer: 120, note: 2000,
  rawLookup: 2048
});

const privateIndexes = new WeakMap();
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const HEADWORD = /^(?=.*[\p{Script=Latin}\d])[\p{Script=Latin}\p{M}\d'" .,+&/()!?%:@#_-]+$/u;

function fail(path, reason) { throw new TypeError(`${path}: ${reason}`); }
function plainRecord(value, path, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, "expected a plain object");
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (typeof key !== "string" || !fields.includes(key)) fail(path, "unknown field");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) fail(path, "accessor fields are not allowed");
  }
  for (const field of fields) if (!Object.hasOwn(value, field)) fail(`${path}.${field}`, "required field");
  return value;
}
function boundedArray(value, path, maximum, minimum = 0) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) fail(path, `expected ${minimum}–${maximum} items`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) fail(path, "sparse arrays or extra array fields are not allowed");
  for (const key of keys) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) fail(path, "extra array fields are not allowed");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) fail(path, "accessor array items are not allowed");
  }
  return value;
}
function rawString(value, path, maximum) {
  if (typeof value !== "string" || value.length > maximum || CONTROL.test(value)
    || typeof value.isWellFormed === "function" && !value.isWellFormed()) fail(path, `expected valid text up to ${maximum} characters`);
  return value;
}

/** Typographic normalization only: never lowercases, lemmatizes or repairs spelling. */
export function normalizeOriginalHeadword(value) {
  rawString(value, "headword", ORIGINAL_DICTIONARY_LIMITS.rawLookup);
  return value.normalize("NFKC").replace(/[‘’‛ʼ]/gu, "'").replace(/[“”„‟]/gu, '"').replace(/\s+/gu, " ").trim();
}

export function foldOriginalHeadword(value) {
  return normalizeOriginalHeadword(value).toLocaleLowerCase("en-US");
}

function parsedIndexes(parsed) {
  const indexes = parsed && typeof parsed === "object" ? privateIndexes.get(parsed) : null;
  if (!indexes) fail("dictionary", "call parseOriginalDictionary first");
  return indexes;
}
function addIndex(index, key, entry) {
  const matches = index.get(key) || [];
  if (!matches.some(value => value.id === entry.id)) matches.push(entry);
  index.set(key, matches);
}

export function parseOriginalDictionary(pack) {
  const limits = ORIGINAL_DICTIONARY_LIMITS;
  plainRecord(pack, "dictionary", ["schemaVersion", "name", "entries"]);
  if (pack.schemaVersion !== 1) fail("dictionary.schemaVersion", "unsupported schema version");
  if (pack.name !== "卓式词典") fail("dictionary.name", "expected 卓式词典");
  boundedArray(pack.entries, "dictionary.entries", limits.entries);
  const entryIds = new Set(), senseIds = new Set();
  let totalCharacters = 0, totalSenses = 0, totalExamples = 0;
  function text(value, path, maximum, { empty = false, language = null } = {}) {
    const result = rawString(value, path, maximum).trim();
    if (!empty && !result) fail(path, "text must not be empty");
    if (language === "zh" && !HAN.test(result)) fail(path, "Chinese text must contain Han characters");
    if (language === "en" && !LATIN.test(result)) fail(path, "English text must contain Latin letters");
    totalCharacters += value.length;
    if (totalCharacters > limits.totalCharacters) fail("dictionary", "aggregate text limit exceeded");
    return result;
  }
  function identifier(value, path, set) {
    const result = text(value, path, limits.id);
    if (!ID.test(result)) fail(path, "invalid identifier");
    if (set.has(result)) fail(path, "duplicate identifier");
    set.add(result); return result;
  }
  function headword(value, path) {
    text(value, path, limits.rawLookup);
    const result = normalizeOriginalHeadword(value);
    if (!result || result.length > limits.headword || !HEADWORD.test(result)) fail(path, "invalid English headword or phrase");
    return result;
  }
  const entries = pack.entries.map((raw, index) => {
    const path = `dictionary.entries[${index}]`;
    plainRecord(raw, path, ["id", "headword", "kind", "forms", "senses", "authorship", "review"]);
    const id = identifier(raw.id, `${path}.id`, entryIds);
    const normalizedHeadword = headword(raw.headword, `${path}.headword`);
    if (!["word", "phrase"].includes(raw.kind)) fail(`${path}.kind`, "expected word or phrase");
    const forms = boundedArray(raw.forms, `${path}.forms`, limits.formsPerEntry).map((form, formIndex) => headword(form, `${path}.forms[${formIndex}]`));
    if (new Set(forms).size !== forms.length) fail(`${path}.forms`, "duplicate normalized forms");
    boundedArray(raw.senses, `${path}.senses`, limits.sensesPerEntry, 1);
    totalSenses += raw.senses.length;
    if (totalSenses > limits.totalSenses) fail("dictionary", "aggregate sense limit exceeded");
    const senses = raw.senses.map((sense, senseIndex) => {
      const sensePath = `${path}.senses[${senseIndex}]`;
      plainRecord(sense, sensePath, ["id", "partOfSpeech", "definitionZh", "definitionEn", "examples"]);
      const senseId = identifier(sense.id, `${sensePath}.id`, senseIds);
      const partOfSpeech = text(sense.partOfSpeech, `${sensePath}.partOfSpeech`, 80, { language: "en" });
      const definitionZh = text(sense.definitionZh, `${sensePath}.definitionZh`, limits.definition, { language: "zh" });
      const definitionEn = text(sense.definitionEn, `${sensePath}.definitionEn`, limits.definition, { language: "en" });
      boundedArray(sense.examples, `${sensePath}.examples`, limits.examplesPerSense, 1);
      totalExamples += sense.examples.length;
      if (totalExamples > limits.totalExamples) fail("dictionary", "aggregate example limit exceeded");
      const examples = sense.examples.map((example, exampleIndex) => {
        const examplePath = `${sensePath}.examples[${exampleIndex}]`;
        plainRecord(example, examplePath, ["en", "zh"]);
        return Object.freeze({
          en: text(example.en, `${examplePath}.en`, limits.example, { language: "en" }),
          zh: text(example.zh, `${examplePath}.zh`, limits.example, { language: "zh" })
        });
      });
      return Object.freeze({ id: senseId, partOfSpeech, definitionZh, definitionEn, examples: Object.freeze(examples) });
    });
    plainRecord(raw.authorship, `${path}.authorship`, ["method", "agent", "referenceUse"]);
    if (raw.authorship.method !== "independent-composition" || raw.authorship.agent !== "AI-assisted draft" || raw.authorship.referenceUse !== "headwords-only") {
      fail(`${path}.authorship`, "expected independently composed AI-assisted drafts using headwords only");
    }
    plainRecord(raw.review, `${path}.review`, ["status", "reviewer", "note"]);
    if (!["draft", "checked"].includes(raw.review.status)) fail(`${path}.review.status`, "expected draft or checked");
    const review = Object.freeze({ status: raw.review.status,
      reviewer: text(raw.review.reviewer, `${path}.review.reviewer`, limits.reviewer, { empty: true }),
      note: text(raw.review.note, `${path}.review.note`, limits.note, { empty: true }) });
    return Object.freeze({ id, headword: normalizedHeadword, kind: raw.kind, forms: Object.freeze(forms), senses: Object.freeze(senses),
      authorship: Object.freeze({ method: "independent-composition", agent: "AI-assisted draft", referenceUse: "headwords-only" }), review });
  });
  const parsed = Object.freeze({ schemaVersion: 1, name: "卓式词典", entries: Object.freeze(entries) });
  const exact = new Map(), folded = new Map();
  for (const entry of entries) {
    addIndex(exact, entry.headword, entry);
    for (const alias of [entry.headword, ...entry.forms]) addIndex(folded, foldOriginalHeadword(alias), entry);
  }
  privateIndexes.set(parsed, { exact, folded });
  return parsed;
}

/** Return candidates, not a silently selected homograph or corrected spelling. */
export function lookupOriginalDictionary(parsed, input) {
  const indexes = parsedIndexes(parsed);
  const normalized = normalizeOriginalHeadword(input);
  if (normalized.length > ORIGINAL_DICTIONARY_LIMITS.headword) fail("input", "lookup text is too long");
  const entries = normalized ? indexes.exact.get(normalized) || indexes.folded.get(foldOriginalHeadword(normalized)) || [] : [];
  return { status: entries.length === 0 ? "missing" : entries.length === 1 ? "found" : "ambiguous", entries: [...entries] };
}

/** Named checking is a separate gate; parsing authorship metadata proves no originality. */
export function selectPublishableOriginalEntries(parsed) {
  parsedIndexes(parsed);
  return parsed.entries.filter(entry => entry.review.status === "checked" && entry.review.reviewer.trim().length > 0);
}
