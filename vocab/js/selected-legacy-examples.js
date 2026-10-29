import { SELECTED_LEGACY_EXAMPLE_BINDINGS } from './selected-legacy-examples-data.js';
import { REVIEWED_SENSE_ENTRIES } from './reviewed-senses-data.js';
import { canonicalSnapshot, canonicalKeys } from './canonical-example-repair-source.js';

function active(binding) {
  const current = REVIEWED_SENSE_ENTRIES.find(row => row.term === binding.term);
  return current?.canonicalId === binding.canonicalId
    && current.canonicalSourceSha256 === binding.canonicalSourceSha256
    && JSON.stringify(current) === binding.selectedEntryJSON;
}
export function hasSelectedLegacyExampleHead(term) {
  return SELECTED_LEGACY_EXAMPLE_BINDINGS.some(binding => binding.term === term && active(binding));
}
export function selectedLegacyOriginalContext(term, context) {
  try {
    const snapshot = canonicalSnapshot(context); canonicalKeys(snapshot, ['term', 'partOfSpeech', 'meaning']);
    if (snapshot.term !== term) return null;
    return SELECTED_LEGACY_EXAMPLE_BINDINGS.find(binding => binding.term === term && active(binding)
      && binding.contexts.some(old => JSON.stringify(old) === JSON.stringify(snapshot))) ?? null;
  } catch { return null; }
}
export function matchesSelectedLegacyOriginalDTO(binding, entry) {
  if (!SELECTED_LEGACY_EXAMPLE_BINDINGS.includes(binding) || !active(binding)) return false;
  try { return JSON.stringify(canonicalSnapshot(entry)) === binding.originalDTOJSON; }
  catch { return false; }
}
