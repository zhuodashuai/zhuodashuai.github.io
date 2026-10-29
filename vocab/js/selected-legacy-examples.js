import { SELECTED_LEGACY_EXAMPLE_BINDINGS } from './selected-legacy-examples-data.js';
import { REVIEWED_SENSE_ENTRIES } from './reviewed-senses-data.js';

// Keep these pure identity checks local: ordinary examples must not depend on
// the separately optional canonical-repair transport graph being available.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const invalid = () => new Error('Invalid canonical example source');
function canonicalSnapshot(value) {
  let nodes = 0;
  function copy(input, depth) {
    if (++nodes > 300000 || depth > 20) throw invalid();
    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'number') { if (!Number.isFinite(input)) throw invalid(); return input; }
    if (typeof input === 'string') { if (input.length > 20000 || CONTROL.test(input)) throw invalid(); return input; }
    if (!input || typeof input !== 'object') throw invalid();
    const array = Array.isArray(input), proto = Object.getPrototypeOf(input);
    if (proto !== (array ? Array.prototype : Object.prototype) && !(proto === null && !array)) throw invalid();
    const keys = Reflect.ownKeys(input), descriptors = Object.getOwnPropertyDescriptors(input);
    if (keys.some(key => typeof key !== 'string' || key === '__proto__' || key === 'toJSON')) throw invalid();
    if (array) {
      if (input.length > 200000 || keys.length !== input.length + 1 || keys.at(-1) !== 'length') throw invalid();
      return Array.from({ length: input.length }, (_, index) => {
        const d = descriptors[index]; if (!d?.enumerable || !Object.hasOwn(d, 'value')) throw invalid();
        return copy(d.value, depth + 1);
      });
    }
    const result = {};
    for (const key of keys) {
      const d = descriptors[key]; if (!d.enumerable || !Object.hasOwn(d, 'value')) throw invalid();
      result[key] = copy(d.value, depth + 1);
    }
    return result;
  }
  return copy(value, 0);
}
function canonicalKeys(value, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== required.length || required.some(key => !Object.hasOwn(value, key))) throw invalid();
}

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
