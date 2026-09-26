// Semantic version stamps, not security/authentication hashes. Deliberately
// exclude dates, review progress and synonym metadata to prevent scan loops.
const LEXICAL = new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]);
export function isSynonymLexicalEntry(entry) { return LEXICAL.has(entry?.entryType); }

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() : value;
}

function stamp(value) {
  const text = JSON.stringify(canonical(value));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return `s1:${hash.toString(16).padStart(8, "0")}`;
}

export function entrySynonymFingerprint(entry) {
  return stamp(Object.fromEntries([
    "term", "standardForm", "entryType", "partOfSpeech", "meaning", "definition",
    "senses", "readingContexts", "forms", "confusedWith", "usage", "register"
  ].map((field) => [field, entry?.[field] ?? null])));
}

export function candidateSynonymFingerprint(entries) {
  return stamp(entries.filter(isSynonymLexicalEntry).map((entry) => [entry.id, entrySynonymFingerprint(entry)]).sort(([a], [b]) => a.localeCompare(b)));
}

// Chapter rendering reconstructs senses/examples, even for the same meaning.
// Do not mistake that presentation copy for a semantic edit. Different chapter
// meanings remain conservative: do not inherit a link from the primary sense.
export function sameSynonymSenseView(left, right) {
  return ["term", "entryType", "partOfSpeech", "meaning", "definition"].every((field) =>
    JSON.stringify(canonical(left?.[field] ?? null)) === JSON.stringify(canonical(right?.[field] ?? null)));
}

export function pendingSynonymScan(entry, candidates = [], checkedAt = new Date().toISOString(), reason = "import_pending") {
  const others = candidates.filter((candidate) => candidate.id !== entry.id && isSynonymLexicalEntry(candidate));
  return {
    version: 1, status: "pending", sourceFingerprint: entrySynonymFingerprint(entry),
    candidatesFingerprint: candidateSynonymFingerprint(others), checkedAt,
    candidateCount: others.length, matches: [], reason
  };
}
