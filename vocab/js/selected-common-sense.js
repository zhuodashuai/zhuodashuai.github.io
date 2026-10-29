import { COMMON_CHINESE_GROUPS } from './chinese-related-common.js?v=95';
import { REVIEWED_SENSE_ENTRIES } from './reviewed-senses-data.js';
import { SELECTED_COMMON_SENSE_BINDINGS } from './selected-common-sense-data.js';

// These are finite build-authenticated identities. No caller flag, text overlap
// or source label can add a new relation or authorize a saved-card example.
const selectedKeys = ['term','partOfSpeech','meaning','chineseAliases','englishForms','en','zh','references','canonicalId','canonicalSourceSha256'];
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function active(binding) {
  const group = COMMON_CHINESE_GROUPS.find(row => row.id === binding.groupId);
  const selected = REVIEWED_SENSE_ENTRIES.find(row => row.term === binding.head);
  return group && selected && equal(group, binding.runtimeGroup)
    && selectedKeys.every(key => equal(selected[key], binding.selectedRow[key]))
    && selected.reviewedCanonicalSense === true ? { group, selected } : null;
}
function activeBindingsForTerm(term) {
  return SELECTED_COMMON_SENSE_BINDINGS.filter(row => row.groupTerms.includes(term)).flatMap(binding => {
    const current = active(binding);
    return current ? [{ binding, ...current }] : [];
  });
}

/** Used only to keep a bound group complete if a literal selected alias exists. */
export function hasSelectedCommonSensePlan(term) { return activeBindingsForTerm(term).length > 0; }
export function hasSelectedCommonSenseHead(term) {
  const binding=SELECTED_COMMON_SENSE_BINDINGS.find(row=>row.head===term);
  return Boolean(binding && active(binding));
}

// A storage hint only; the complete private origin is still checked below.
export function isSelectedCommonSenseCanonicalCandidate(id, term) {
  return SELECTED_COMMON_SENSE_BINDINGS.some(row => row.canonicalId === id && row.head === term);
}

/** The origin comes from expanded-dictionary's private SHA-verified parser map.
 * Compare the complete original raw record, including variants and seed, before
 * using the separately approved selected primary. Never project the old gloss. */
export function selectedCommonSenseCandidate(record, origin, term) {
  if (!record || !origin) return null;
  const current = activeBindingsForTerm(term).find(({ binding }) =>
    binding.canonicalId === record.id && binding.head === record.term);
  if (!current) return null;
  const { binding, group, selected } = current;
  if (record.id !== binding.canonicalId || record.term !== binding.head
    || origin.manifestVersion !== binding.canonicalManifestVersion
    || origin.bucket !== binding.canonicalShard.bucket || origin.file !== binding.canonicalShard.file
    || origin.sha256 !== binding.canonicalShard.sha256 || origin.bytes !== binding.canonicalShard.bytes
    || origin.rawRecordJSON !== binding.canonicalRecordJSON) return null;
  return {
    directTerms: binding.directTerms,
    result: {
      term: selected.term, partOfSpeech: selected.partOfSpeech, meaning: selected.meaning,
      source: selected.dictionarySource, license: 'Original composition', url: 'https://zhuodashuai.github.io/vocab/',
      matchedPartOfSpeech: group.pos, matchedSense: group.sense,
      matchedExampleSenseIds: [binding.selectedExampleProof.id],
      matchedExampleSenseEvidence: [binding.selectedExampleProof],
      matchedSourceEvidence: {
        kind: 'reviewed-canonical-primary', groupId: binding.groupId, sourceId: binding.sourceId,
        canonicalId: binding.canonicalId, canonicalSourceSha256: binding.canonicalSourceSha256,
        selectedSourceSha256: binding.selectedSourceSha256, selectedRowSha256: binding.selectedRowSha256,
      },
    },
  };
}

/** A finite old complete saved context can keep its original valid example.
 * This does not approve that raw gloss for new search or attach the new pair. */
export function selectedGroupOriginalContext(term, card) {
  if (!card || card.term !== term) return null;
  const binding = SELECTED_COMMON_SENSE_BINDINGS.find(row => row.head === term);
  if (!binding || !active(binding)) return null;
  return binding.legacySavedContexts.some(old => equal(old, card)) ? binding : null;
}

export function matchesSelectedGroupOriginalDTO(binding, entry) {
  return SELECTED_COMMON_SENSE_BINDINGS.includes(binding) && Boolean(active(binding))
    && entry?.term === binding.head && JSON.stringify(entry) === binding.originalDTOJSON;
}
