// Queries travel in a fragment, never in a server request or authentication URL.
export function safeDictionaryQuery(value) {
  if (typeof value !== "string" || value.length > 400) return "";
  const query = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim();
  return query.length <= 200 ? query : "";
}

export function dictionaryQueryFromHash(hash, key = "lookup") {
  if (typeof hash !== "string" || hash.length > 2000) return "";
  return safeDictionaryQuery(new URLSearchParams(hash.replace(/^#/, "")).get(key));
}

export function dictionarySearchUrl(query, locationHref = globalThis.location?.href) {
  const url = new URL("dictionary.html", locationHref || "https://zhuodashuai.github.io/vocab/");
  const cleaned = safeDictionaryQuery(query);
  if (cleaned) url.hash = new URLSearchParams({ q: cleaned }).toString();
  return url.href;
}

// A login continuation may prefill once, but must not replace user input, run
// a search, modify an editor or replay after switching accounts.
export function createDictionaryPrefill(hash) {
  let pending = dictionaryQueryFromHash(hash);
  return (ready, currentValue = "") => {
    if (!ready || !pending) return "";
    const query = pending;
    pending = "";
    return currentValue.trim() ? "" : query;
  };
}
