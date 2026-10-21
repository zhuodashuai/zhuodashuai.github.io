const SORTS = new Set(["newest", "oldest", "az", "za", "source"]);
const alphabet = new Intl.Collator("en", { sensitivity: "base", numeric: true, ignorePunctuation: true });

export function normalizeEntrySort(value, fallback = "newest") {
  return SORTS.has(value) ? value : SORTS.has(fallback) ? fallback : "newest";
}

/** Display ordering only: never mutate stored cards or the separate review queue. */
export function sortWordbookEntries(entries, sort = "newest") {
  const order = normalizeEntrySort(sort);
  if (order === "source") return [...entries];
  const timestamp = (entry) => {
    const raw = entry?.createdAt;
    const value = typeof raw === "string" && raw.trim() ? Date.parse(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  };
  const term = (entry) => String(entry?.term || "").normalize("NFKC").trim();
  return entries.map((entry, index) => ({ entry, index, at: timestamp(entry) }))
    .sort((left, right) => {
      if (order === "az" || order === "za") {
        return (order === "za" ? -1 : 1) * alphabet.compare(term(left.entry), term(right.entry)) || left.index - right.index;
      }
      // A legacy card with no creation date belongs last in either direction;
      // its last edit must not masquerade as a new collection.
      if (left.at === null || right.at === null) {
        return left.at === right.at ? left.index - right.index : left.at === null ? 1 : -1;
      }
      return (order === "newest" ? right.at - left.at : left.at - right.at) || left.index - right.index;
    }).map(({ entry }) => entry);
}
