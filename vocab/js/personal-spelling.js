import { normalizeSuggestionQuery } from "./dictionary-query-normalization.js?v=114";

/** Only a completed full first-page miss may start an optional public read. */
export function canSuggestPersonalDictionary(input, result) {
  return Boolean(normalizeSuggestionQuery(input)) && Array.isArray(result?.results) && !result.results.length
    && result.hasMore === false && (result.coverage === undefined || result.coverage === "full")
    && (result.total === undefined || result.total === 0) && (result.offset === undefined || result.offset === 0);
}

/** A read-only sidecar. It has no wordbook, account, input or saving authority. */
export function createPersonalSpellingSuggestions({ suggest, onChange }) {
  let active = null;
  function clear() {
    active?.controller.abort(); active = null;
    onChange({ phase: "idle", suggestions: [] });
  }
  function start(input, result, { isCurrent }) {
    clear();
    if (!canSuggestPersonalDictionary(input, result) || !isCurrent()) return false;
    const operation = { controller: new AbortController() }; active = operation;
    const current = () => active === operation && !operation.controller.signal.aborted && isCurrent();
    onChange({ phase: "loading", suggestions: [] }, current);
    // Never await this on the main query path or claim a candidate is a match.
    void Promise.resolve().then(() => {
      if (!current()) return null;
      return suggest(input, { signal: operation.controller.signal, limit: 5, timeoutMs: 3000, isCurrent: current });
    }).then(candidates => {
      if (!current()) return;
      const seen = new Set();
      const suggestions = (Array.isArray(candidates) ? candidates : []).filter(candidate => {
        if (typeof candidate?.term !== "string" || !candidate.term.trim() || candidate.term.length > 200
          || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(candidate.term) || seen.has(candidate.term)) return false;
        seen.add(candidate.term); return true;
      }).slice(0, 5).map(({ term }) => ({ term }));
      onChange({ phase: "ready", suggestions }, current);
    }).catch(() => {
      if (current()) onChange({ phase: "error", suggestions: [] }, current);
    });
    return true;
  }
  return { start, clear };
}
