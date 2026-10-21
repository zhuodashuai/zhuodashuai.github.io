import { normalizePublicSearchQuery, publicEntryMatchesQuery } from "./wordbook-schema.js?v=82";
import { personalWordbookUrl } from "./runtime-config.js?v=77";

// These links identify an already-public card, never a private entry or a
// command to replay collection after authentication.
export function publicEntryUrl(id, locationHref = globalThis.location?.href) {
  const url = new URL("./", locationHref || "https://zhuodashuai.github.io/vocab/");
  if (typeof id === "string" && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(id)) url.searchParams.set("entry", id);
  return url.href;
}

export function ownerWordbookLink(location = globalThis.location) {
  const url = new URL(personalWordbookUrl(location));
  url.searchParams.set("auth", "owner");
  return url.href;
}

export function ownerLibraryLink(location = globalThis.location) {
  const url = new URL("./", personalWordbookUrl(location));
  url.searchParams.set("auth", "owner");
  const current = new URL(location?.href || url.href);
  for (const key of ["book", "chapter"]) {
    const value = current.searchParams.get(key);
    if (value && /^[a-z0-9-]{1,100}$/u.test(value)) url.searchParams.set(key, value);
  }
  url.hash = "library-lookup";
  return url.href;
}

export function publicEntryIdFromUrl(href) {
  const id = new URL(href).searchParams.get("entry");
  return typeof id === "string" && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(id) ? id : "";
}

const timestamp = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

// A GET begun before a successful write (or a deployed fallback) must not
// erase that API-confirmed card. A strictly newer public edit still wins.
export function ownerPublicEntries(snapshot, confirmations = [], query = "") {
  const entries = new Map((snapshot?.entries || []).map(entry => [entry.id, entry]));
  for (const { entry, absorbed } of confirmations) {
    if (absorbed) continue;
    const current = entries.get(entry.id);
    if (!current || timestamp(entry.updatedAt) >= timestamp(current.updatedAt)) entries.set(entry.id, entry);
  }
  const wanted = normalizePublicSearchQuery(query);
  return [...entries.values()].filter(entry => !wanted || publicEntryMatchesQuery(entry, wanted))
    .sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) || a.term.localeCompare(b.term, "en") || a.id.localeCompare(b.id));
}

// Once a real public snapshot has caught up, it becomes authoritative again,
// including subsequent deletions. A fallback or pre-write read cannot do this.
export function reconcileOwnerPublicConfirmations(snapshot, confirmations) {
  if (snapshot?.readSource === "deployed-fallback") return confirmations;
  const entries = new Map((snapshot?.entries || []).map(entry => [entry.id, entry]));
  return confirmations.map(item => {
    const current = entries.get(item.entry.id);
    const absorbed = item.absorbed || (current
      ? timestamp(current.updatedAt) >= timestamp(item.entry.updatedAt)
      : timestamp(snapshot?.exportedAt) > timestamp(item.entry.updatedAt));
    return absorbed ? { ...item, absorbed: true } : item;
  });
}
