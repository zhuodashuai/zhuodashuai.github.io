import { normalizePublicSearchQuery } from "./wordbook-schema.js?v=82";

function list(value) {
  return Array.isArray(value) ? value : [];
}

// Keep the existing public-card search fields. A non-whitespace separator is
// inserted below so a phrase cannot be manufactured across unrelated metadata.
function searchableFields(entry) {
  return [
    entry?.originalInput,
    entry?.term,
    entry?.standardForm,
    entry?.meaning,
    entry?.definition,
    entry?.author,
    entry?.sourceTitle,
    entry?.sourceWork,
    ...list(entry?.tags),
    ...list(entry?.collocations),
    ...list(entry?.forms),
    ...list(entry?.synonyms),
    ...list(entry?.readingContexts).filter(Boolean).flatMap(context => [
      context.originalInput,
      context.meaning,
      context.definition,
      context.usage,
      context.sourceTitle,
      context.sourceWork,
      context.sourceDate,
      ...list(context.collocations),
      ...list(context.forms)
    ])
  ].filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchableText(value) {
  // Same typography/case folding as the existing card text. Query-only edge
  // punctuation stripping is unnecessary here and costly on long definitions.
  return value.normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("zh-CN");
}

/** Compile once per query when filtering saved cards. This never changes data. */
export function createSavedCardQueryMatcher(query) {
  const wanted = normalizePublicSearchQuery(query);
  if (!wanted) return () => true;
  // NUL separates fields internally. No query can include that separator or
  // other non-whitespace ASCII controls; tabs/newlines normalize to spaces.
  if (/[\u0000-\u0008\u000e-\u001f\u007f]/u.test(wanted)) return () => false;

  // Latin text starts at a Latin-word boundary, while the last word may be a
  // prefix: "agita" finds "agitated", but "hip" does not find "leadership".
  // Chinese next to English is a boundary; accents, combining marks and digits
  // within a Latin word are not. Non-Latin queries retain substring matching.
  const prefix = /^\p{Script=Latin}/u.test(wanted)
    ? new RegExp(`(?:^|[^\\p{Script=Latin}\\p{M}\\p{N}])${escapeRegExp(wanted)}`, "u")
    : null;

  return entry => {
    // Normalize the whole record once rather than repeating Unicode and case
    // conversion for every field. NFKC and whitespace folding retain NUL.
    const text = normalizeSearchableText(searchableFields(entry).join("\u0000"));
    return prefix ? prefix.test(text) : text.includes(wanted);
  };
}

export function savedCardMatchesQuery(entry, query) {
  return createSavedCardQueryMatcher(query)(entry);
}
