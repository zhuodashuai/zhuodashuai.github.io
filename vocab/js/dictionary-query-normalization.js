// Query-only typography cleanup shared by the cheap UI guard and the lazy
// spelling sidecar. No dictionary data or network work belongs in this module.
const WORD = /^[a-z]+(?:[ '-][a-z]+)*$/u;
const CONTROL = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

export function normalizeSuggestionQuery(input) {
  if (typeof input !== "string" || input.length > 200 || CONTROL.test(input.replace(/[\t\r\n]/gu, ""))) return "";
  // Source rows keep their stricter parser. These changes apply only to a
  // user's pasted query, and never write a correction into a wordbook.
  const value = input.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"')
    .replace(/\s+/gu, " ").trim().toLowerCase().replace(/[\u2010\u2011]/gu, "-")
    .replace(/[\u201b\u02bc]/gu, "'").replace(/[\u00ad\u200b\u2060\ufeff]/gu, "")
    .replace(/^["']+|["',.!?;:，。！？；：]+$/gu, "").trim();
  return value.length >= 3 && value.length <= 64 && WORD.test(value)
    && value.replace(/[^a-z]/gu, "").length >= 3 && value.split(" ").length <= 8 ? value : "";
}
