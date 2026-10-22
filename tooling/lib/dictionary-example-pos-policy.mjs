// D19 preparation only. Pure POS relationship checks: no file/network access,
// lexical-evidence admission, source repair, queue selection or language approval.
export const SELECTED_POS_POLICY_VERSION = 'd19-selected-pos-phase-b-v1';

export const SELECTED_POS_LABELS = Object.freeze([
  'noun', 'verb', 'adjective', 'adverb', 'proper noun', 'plural noun',
  'article', 'pronoun', 'preposition', 'prepositional phrase'
]);

// These are the thirteen explicit phrase-role aliases present in D18, not an
// instruction to guess a grammatical role for every multiword source label.
// Deliberately excluded: D18's external override ledger and Chinese-name cue.
export const SOURCE_ROLE_ALIASES = Object.freeze({
  noun: Object.freeze(['noun phrase', 'countable noun', 'uncountable noun', 'mass noun']),
  verb: Object.freeze(['verb phrase', 'verbal phrase', 'phrasal verb', 'idiomatic verb phrase', 'verb + preposition']),
  adjective: Object.freeze(['adjective phrase', 'adjectival phrase']),
  adverb: Object.freeze(['adverb phrase', 'adverbial phrase'])
});

const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const TAG_SEPARATORS = /[·;,|/]/u;
const ordinarySelectedLabel = value => typeof value === 'string'
  && value.length > 0 && value.length <= 80 && /^[a-z]+(?: [a-z]+)*$/u.test(value);
const aliasesFor = label => typeof label === 'string' && Object.hasOwn(SOURCE_ROLE_ALIASES, label)
  ? SOURCE_ROLE_ALIASES[label] : [];

// Selected output tags are exact closed-contract labels. Unlike source metadata,
// they are not silently trimmed, lowercased or split into multiple selections.
export const isAllowedSelectedPos = value => SELECTED_POS_LABELS.includes(value);

export function publishedPosTags(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || !Object.hasOwn(record, 'partOfSpeech')) return Object.freeze([]);
  const raw = record.partOfSpeech;
  if (typeof raw !== 'string' || !raw.trim() || CONTROL.test(raw)) return Object.freeze([]);
  // Only POS-metadata casing/outer whitespace and explicit list separators are
  // normalized. No NFKC, substring lookup, phrase-word extraction or head edits.
  return Object.freeze([...new Set(raw.split(TAG_SEPARATORS)
    .map(label => label.trim().toLowerCase()).filter(Boolean))]);
}

// Source support is intentionally independent of whether the selected label is
// enabled by this version. E.g. conjunction/conjunction is an exact source
// match, but isAllowedSelectedPos('conjunction') is false in Phase B.
// A true result is source-tag support, not proof that a Chinese sense is sound.
export function publishedPosSupports(record, selectedPos) {
  if (!ordinarySelectedLabel(selectedPos)) return false;
  const tags = publishedPosTags(record);
  if (tags.includes(selectedPos)) return true;
  return aliasesFor(selectedPos).some(alias => tags.includes(alias));
}

export function assessSelectedPos(record, selectedPos) {
  const labelAllowed = isAllowedSelectedPos(selectedPos);
  const sourceSupported = publishedPosSupports(record, selectedPos);
  const sourceTags = publishedPosTags(record);
  const matchedSourceTags = sourceTags.filter(tag => tag === selectedPos
    || aliasesFor(selectedPos).includes(tag));
  return Object.freeze({
    policyVersion: SELECTED_POS_POLICY_VERSION,
    selectedPos,
    labelAllowed,
    sourceSupported,
    posLayerAccepted: labelAllowed && sourceSupported,
    reason: !labelAllowed ? 'selected-label-not-enabled'
      : !sourceTags.length ? 'missing-or-malformed-source-pos'
      : !sourceSupported ? 'source-does-not-support-selected-role'
      : sourceTags.includes(selectedPos) ? 'exact-source-tag' : 'listed-source-role-alias',
    matchedSourceTags: Object.freeze(matchedSourceTags),
    scope: 'pos-layer-only',
    lexicalEvidence: 'not-assessed',
    meaningOrExampleApproval: false
  });
}

export function sourceSupportedSelectedPoses(record) {
  return Object.freeze(SELECTED_POS_LABELS.filter(pos => publishedPosSupports(record, pos)));
}
