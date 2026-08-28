import {
  classifyInput,
  countEnglishTokens,
  normalizeEnglish,
  type AiOrganized
} from "./schema";

const LEXICAL_TYPES = new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]);

// A small defensive lexicon for legitimate UK/Australian forms that generic
// US-oriented spell checkers commonly mislabel. It protects regional spelling;
// it is not used to supply definitions or special-case individual meanings.
const PROTECTED_REGIONAL_FORMS = new Set([
  "analyse", "behaviour", "cancelled", "catalogue", "centre", "cheque", "colour", "defence", "dialogue",
  "enrol", "enrolled", "enrolment", "favour", "favourite", "fibre", "flavour", "grey", "honour",
  "judgement", "labour", "learnt", "licence", "litre", "metre", "neighbour", "offence", "organise",
  "organised", "organising", "programme", "realise", "recognise", "theatre", "travelled", "traveller",
  "travelling"
]);

export class SemanticQualityError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`AI semantic validation failed: ${issues.join("; ")}`);
    this.name = "SemanticQualityError";
    this.issues = issues;
  }
}

function compact(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function semanticKey(value: string): string {
  return compact(value).toLocaleLowerCase("en-US").replace(/[\p{P}\p{S}\s]+/gu, "");
}

function partOfSpeechKey(value: string): string {
  const raw = compact(value).toLocaleLowerCase("en-US").replace(/[._]/g, " ");
  const aliases: Array<[RegExp, string]> = [
    [/\b(phrasal\s+verb|verb\s+phrase)\b|^v(?:erb)?s?\b/, "verb"],
    [/\b(nouns?|noun\s+phrase)\b|^n\b/, "noun"],
    [/\b(adjectives?|adj)\b/, "adjective"],
    [/\b(adverbs?|adv)\b/, "adverb"],
    [/\b(pronouns?|pron)\b/, "pronoun"],
    [/\b(prepositions?|prep)\b/, "preposition"],
    [/\b(conjunctions?|conj)\b/, "conjunction"],
    [/\b(interjections?|interj)\b/, "interjection"],
    [/\b(determiners?|det)\b/, "determiner"],
    [/\b(auxiliary|modal)\b/, "auxiliary"],
    [/\b(idiom)\b/, "idiom"]
  ];
  return aliases.find(([pattern]) => pattern.test(raw))?.[1] || raw.replace(/\s+/g, " ");
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values.map(compact).filter(Boolean)) {
    const key = semanticKey(value);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

export function isPlausiblePhonetic(value: string): boolean {
  const phonetic = compact(value);
  if (!phonetic) return true;
  if (/<[^>]+>|\b(?:todo|unknown|error|invalid|n\/?a)\b/iu.test(phonetic) || /\d/u.test(phonetic)) return false;
  const slashSegments = phonetic.match(/\/[^/\r\n]+\//gu) || [];
  const bracketSegments = phonetic.match(/\[[^\]\r\n]+\]/gu) || [];
  const segments = [...slashSegments, ...bracketSegments];
  if (!segments.length) return false;
  return segments.every((segment) => {
    const content = segment.slice(1, -1).trim();
    return content.length > 0
      && content.length <= 160
      && /[A-Za-z\u00C0-\u024F\u0250-\u02AF\u1D00-\u1D7F\u1D80-\u1DBF]/u.test(content)
      && !/[{}<>]/u.test(content);
  });
}

function protectedRegionalInput(input: string): boolean {
  return countEnglishTokens(input) === 1 && PROTECTED_REGIONAL_FORMS.has(normalizeEnglish(input));
}

function harmonizeType(input: string, proposed: AiOrganized["entryType"]): AiOrganized["entryType"] {
  const inputType = classifyInput(input);
  const tokenCount = countEnglishTokens(input);
  if (tokenCount === 1) return "word";
  if (tokenCount > 1 && proposed === "word") return inputType === "quote" ? "quote" : "phrase";
  return proposed;
}

/**
 * Apply deterministic consistency checks to model output before it can become
 * a local draft. Shape validation alone cannot detect mixed POS, duplicate
 * senses or empty/mismatched examples.
 */
export function validateAndHarmonizeAiOutput(input: string, value: AiOrganized): AiOrganized {
  const issues: string[] = [];
  const organized: AiOrganized = {
    ...value,
    senses: value.senses.map((sense) => ({
      ...sense,
      collocations: uniqueStrings(sense.collocations),
      confusables: uniqueStrings(sense.confusables),
      examples: sense.examples.map((example) => ({ en: compact(example.en), zh: compact(example.zh) }))
    })),
    collocations: uniqueStrings(value.collocations),
    confusedWith: uniqueStrings(value.confusedWith),
    forms: uniqueStrings(value.forms),
    tags: uniqueStrings(value.tags)
  };

  organized.entryType = harmonizeType(input, organized.entryType);
  if (protectedRegionalInput(input) && normalizeEnglish(organized.suggestedTerm) !== normalizeEnglish(input)) {
    organized.suggestedTerm = input;
    organized.standardForm = input;
  }

  const inputTokenCount = countEnglishTokens(input);
  if (inputTokenCount > 1 && countEnglishTokens(organized.suggestedTerm) < 2) organized.suggestedTerm = input;
  if (inputTokenCount > 1 && countEnglishTokens(organized.standardForm) < 2) organized.standardForm = input;

  if (!compact(organized.meaning)) issues.push("top-level Chinese meaning is empty");
  if (!compact(organized.definition)) issues.push("top-level English definition is empty");
  if (!isPlausiblePhonetic(organized.phonetic)) issues.push("phonetic field is not plausible IPA notation");

  if (LEXICAL_TYPES.has(organized.entryType)) {
    if (!organized.senses.length) issues.push("lexical entry has no structured senses");
    const senseKeys = new Set<string>();
    const exampleKeys = new Set<string>();
    organized.senses.forEach((sense, index) => {
      const label = `sense ${index + 1}`;
      if (!compact(sense.partOfSpeech)) issues.push(`${label} part of speech is empty`);
      if (!compact(sense.meaningZh)) issues.push(`${label} Chinese meaning is empty`);
      if (!compact(sense.definitionEn)) issues.push(`${label} English definition is empty`);
      if (!sense.examples.length) issues.push(`${label} has no paired example`);
      sense.examples.forEach((example, exampleIndex) => {
        if (!example.en || !example.zh) issues.push(`${label} example ${exampleIndex + 1} is not bilingual`);
        const exampleKey = semanticKey(example.en);
        if (exampleKey && exampleKeys.has(exampleKey)) issues.push(`${label} repeats an example from another sense`);
        if (exampleKey) exampleKeys.add(exampleKey);
      });
      const key = [partOfSpeechKey(sense.partOfSpeech), semanticKey(sense.meaningZh), semanticKey(sense.definitionEn)].join("|");
      if (senseKeys.has(key)) issues.push(`${label} duplicates another sense`);
      senseKeys.add(key);
    });
  }

  if (issues.length) throw new SemanticQualityError([...new Set(issues)]);

  if (organized.senses.length) {
    const positions = uniqueStrings(organized.senses.map((sense) => partOfSpeechKey(sense.partOfSpeech)));
    organized.partOfSpeech = positions.join(" · ");
    organized.meaning = organized.senses
      .map((sense) => `${partOfSpeechKey(sense.partOfSpeech)}：${compact(sense.meaningZh)}`)
      .join("\n");
    organized.definition = organized.senses
      .map((sense) => `${partOfSpeechKey(sense.partOfSpeech)}: ${compact(sense.definitionEn)}`)
      .join("\n");
    const firstExample = organized.senses.flatMap((sense) => sense.examples)[0];
    if (firstExample) {
      organized.exampleEn = firstExample.en;
      organized.exampleZh = firstExample.zh;
    }
    if (!organized.usage) {
      organized.usage = uniqueStrings(organized.senses.map((sense) => sense.usageNotes)).join("\n");
    }
    if (!organized.register) {
      organized.register = uniqueStrings(organized.senses.map((sense) => sense.register)).join(" · ");
    }
    organized.collocations = uniqueStrings([
      ...organized.collocations,
      ...organized.senses.flatMap((sense) => sense.collocations)
    ]).slice(0, 20);
    organized.confusedWith = uniqueStrings([
      ...organized.confusedWith,
      ...organized.senses.flatMap((sense) => sense.confusables)
    ]).slice(0, 20);
  }

  return organized;
}

function levenshtein(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

export function estimateCorrectionConfidence(original: string, suggestion: string): number {
  const left = normalizeEnglish(original);
  const right = normalizeEnglish(suggestion);
  if (!right || left === right) return 1;
  const distance = levenshtein(left, right);
  const longest = Math.max(left.length, right.length, 1);
  if (distance === 1 && longest >= 5) return 0.88;
  if (distance <= 2 && distance / longest <= 0.25) return 0.74;
  return 0.55;
}

