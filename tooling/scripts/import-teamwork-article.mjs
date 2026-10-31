/** Add a reviewed Teamwork article without replacing any existing lexical card. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createBlankEntry, entryLookupKeys, normalizeEnglish, parsePublicSnapshot,
  reconcileLexicalEntryForPublish, contextualizeReadingEntry } from "../../vocab/js/wordbook-schema.js";
import { pendingSynonymScan } from "../../vocab/js/synonym-evidence.js";

const ROOT = resolve(import.meta.dirname, "../..");
const MAX_BYTES = 5_000_000;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const unique = values => [...new Set(values)];
const text = value => typeof value === "string" && value.trim().length > 0;
const same = isDeepStrictEqual;
const lexicalFields = ["term", "normalized", "standardForm", "originalInput", "entryType", "correction",
  "phonetic", "partOfSpeech", "meaning", "definition", "senses", "collocations", "synonyms", "forms",
  "exampleEn", "exampleZh", "usage", "register", "confusedWith", "author", "sourceTitle", "sourceWork",
  "sourceDate", "sourceUrl", "attributionStatus", "attributionNote", "organizationMethod"];

export function teamworkArticleEntryId(chapterNumber, term) {
  const slug = normalizeEnglish(term).replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 110);
  assert(slug, "A new article term must have a nonempty stable ID slug.");
  return `public-teamwork-c${chapterNumber}-${slug}`;
}

function validateSource(source) {
  assert(source?.schemaVersion === 1 && source.format === "reviewed-article-collection-contexts", "Unsupported reviewed article packet.");
  assert(source.collection?.id === "teamwork" && source.collection.title === "Teamwork", "The article must target Teamwork.");
  assert(Number.isSafeInteger(source.chapter?.number) && source.chapter.number >= 1
    && source.chapter.id === `chapter-${source.chapter.number}`, "Invalid article chapter identity.");
  assert(text(source.articleTitle) && source.chapter.title === source.articleTitle
    && source.sourceTitle === `Teamwork — ${source.articleTitle}`, "Article titles must identify the same named chapter.");
  assert(text(source.authors) && text(source.issue), "Article authors and issue are required.");
  assert(typeof source.sourcePdfSha256 === "string" && /^[a-f0-9]{64}$/u.test(source.sourcePdfSha256), "The source PDF needs its SHA-256.");
  assert(source.originalInputKind === undefined || source.originalInputKind === "excerpt", "Only an explicitly marked excerpt can bypass spelling-alias interpretation.");
  let url; try { url = new URL(source.sourceUrl); } catch { /* checked below */ }
  assert(url?.protocol === "https:" && !url.username && !url.password, "Article provenance must use a valid HTTPS source URL.");
  assert(Number.isSafeInteger(source.expectedItemCount) && source.expectedItemCount > 0
    && Array.isArray(source.items) && source.items.length === source.expectedItemCount, "The reviewed article item count must be exact.");
  const excluded = source.curation?.excludedItems;
  assert(Array.isArray(excluded) && Number.isSafeInteger(source.curation.originalItemCount)
    && source.curation.originalItemCount === source.items.length + excluded.length, "Curation must account for retained and excluded items.");
  assert(excluded.every(row => text(row.term) && text(row.reason)), "Every excluded item needs a term and reason.");
  const seenTerms = new Set(), seenIds = new Set(), seenOrders = new Set();
  for (const item of source.items) {
    for (const field of ["term", "originalInput", "entryType", "partOfSpeech", "meaning", "definitionEn", "usage", "exampleEn", "exampleZh", "category", "reuseExistingEntryId"]) {
      assert(text(item[field]), `${item.term || "Article item"}: missing ${field}.`);
    }
    assert(["word", "phrase", "phrasal-verb", "idiom", "collocation"].includes(item.entryType), `${item.term}: unsupported lexical type.`);
    for (const field of ["forms", "collocations", "tags"]) assert(Array.isArray(item[field]) && item[field].every(text), `${item.term}: invalid ${field}.`);
    assert(item.confusedWith === undefined || Array.isArray(item.confusedWith) && item.confusedWith.every(text), `${item.term}: invalid confusedWith.`);
    assert(Number.isSafeInteger(item.pdfPage) && item.pdfPage > 0 && item.pdfPage < 10000, `${item.term}: invalid PDF page.`);
    assert(item.printedPage == null || item.printedPage === "" || /^(?:\d+)(?:[-–]\d+)?$/u.test(String(item.printedPage)), `${item.term}: invalid printed page.`);
    assert(Number.isSafeInteger(item.order) && item.order > 0 && item.order <= 100000, `${item.term}: invalid article order.`);
    const decision = item.duplicateDecision;
    assert(decision && ["new-card", "reuse-same-sense", "reuse-distinct-context"].includes(decision.action)
      && text(decision.reason), `${item.term}: an explicit duplicate/sense decision is required.`);
    const normalized = normalizeEnglish(item.term);
    assert(normalized && !seenTerms.has(normalized) && !seenIds.has(item.reuseExistingEntryId) && !seenOrders.has(item.order), `${item.term}: duplicate term, target ID or article order.`);
    seenTerms.add(normalized); seenIds.add(item.reuseExistingEntryId); seenOrders.add(item.order);
  }
  const excludedTerms = excluded.map(row => normalizeEnglish(row.term));
  assert(new Set(excludedTerms).size === excludedTerms.length && excludedTerms.every(term => !seenTerms.has(term)), "Excluded and retained terms must be distinct.");
}

function contextFor(item, source) {
  const page = `PDF p. ${item.pdfPage}${item.printedPage == null || item.printedPage === "" ? "" : ` · print p. ${item.printedPage}`}`;
  return {
    membership: `collection:teamwork:${source.chapter.id}`, order: item.order, page,
    originalInput: item.originalInput, entryType: item.entryType, partOfSpeech: item.partOfSpeech,
    meaning: item.meaning, definition: item.definitionEn, usage: item.usage, register: "business / teamwork",
    collocations: [...item.collocations], confusedWith: [...(item.confusedWith || [])], forms: [...item.forms],
    exampleEn: item.exampleEn, exampleZh: item.exampleZh, sourceTitle: source.sourceTitle,
    sourceWork: "Teamwork", sourceDate: `PDF p. ${item.pdfPage}`,
    attributionNote: `${source.authors}; ${source.issue}; ${page}. 词形按提供的文章核对；释义为学习整理，双语例句为自拟。`
  };
}

function primarySource(item, source, timestamp) {
  return { title: `${source.articleTitle} - supplied PDF p.${item.pdfPage}`,
    url: source.sourceUrl, kind: "primary", retrievedAt: timestamp };
}

function newEntry(item, source, timestamp) {
  const entry = createBlankEntry(item.term), context = contextFor(item, source);
  // A reviewed source excerpt is searchable context, never a spelling alias of
  // one word inside it. Inflected forms remain explicitly listed in forms.
  const correctionOriginal = source.originalInputKind === "excerpt" ? item.term : item.originalInput;
  const exact = normalizeEnglish(correctionOriginal) === normalizeEnglish(item.term);
  return { ...entry, id: item.reuseExistingEntryId, originalInput: item.originalInput,
    correction: exact ? { ...entry.correction, original: correctionOriginal } : { status: "accepted", original: correctionOriginal,
      suggestion: item.term, chosen: item.term, confidence: 1, source: "manual-lemma-normalization" },
    entryType: item.entryType, phonetic: item.phonetic || "", partOfSpeech: item.partOfSpeech,
    meaning: item.meaning, definition: item.definitionEn,
    senses: [{ partOfSpeech: item.partOfSpeech, meaningZh: item.meaning, definitionEn: item.definitionEn,
      usageNotes: item.usage, register: "business / teamwork", collocations: [...item.collocations],
      examples: [{ en: item.exampleEn, zh: item.exampleZh }], confusables: [...(item.confusedWith || [])] }],
    collocations: [...item.collocations], exampleEn: item.exampleEn, exampleZh: item.exampleZh,
    usage: item.usage, register: "business / teamwork", forms: [...item.forms],
    confusedWith: [...(item.confusedWith || [])],
    tags: unique([context.membership, "商务英语", "团队协作", source.articleTitle, ...item.tags]),
    author: "", sourceTitle: source.sourceTitle, sourceWork: "Teamwork", sourceDate: context.sourceDate,
    sourceUrl: source.sourceUrl, attributionStatus: "verified", attributionNote: context.attributionNote,
    sources: [primarySource(item, source, timestamp)], readingContexts: [context],
    createdAt: timestamp, updatedAt: timestamp };
}

export function serializeTeamworkSnapshot(snapshot) {
  const serialized = `${JSON.stringify(snapshot)}\n`;
  assert(Buffer.byteLength(serialized) <= MAX_BYTES, "The article snapshot exceeds the production 5,000,000-byte limit.");
  return serialized;
}

/** Pure plan: source and snapshot inputs are never mutated. Source occurrence is reviewed separately. */
export function planTeamworkArticleImport({ source, snapshot, timestamp = new Date().toISOString() }) {
  validateSource(source);
  parsePublicSnapshot(snapshot, { allowLegacy: false });
  assert(typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp)), "Invalid import timestamp.");
  timestamp = new Date(timestamp).toISOString();
  const entries = structuredClone(snapshot.entries), byId = new Map(entries.map(entry => [entry.id, entry]));
  const byTerm = new Map(entries.map(entry => [entry.normalized, entry]));
  const touched = new Set(), added = new Set(), actions = [];
  const membership = `collection:teamwork:${source.chapter.id}`;
  for (const item of [...source.items].sort((a, b) => a.order - b.order)) {
    const normalized = normalizeEnglish(item.term), action = item.duplicateDecision.action;
    const existing = byId.get(item.reuseExistingEntryId), sameTerm = byTerm.get(normalized);
    assert(!existing || existing.normalized === normalized, `${item.term}: target ID belongs to another canonical term.`);
    assert(!sameTerm || sameTerm.id === item.reuseExistingEntryId, `${item.term}: matching canonical term has a different target ID.`);
    const desired = newEntry(item, source, timestamp), context = desired.readingContexts[0];
    // Validate every chapter view's lexical completeness even when the canonical sense is different.
    reconcileLexicalEntryForPublish(desired);
    const prior = existing?.readingContexts.find(row => row.membership === membership);
    if (action === "new-card") {
      assert(item.reuseExistingEntryId === teamworkArticleEntryId(source.chapter.number, item.term), `${item.term}: new card requires its stable chapter ID.`);
      if (existing) {
        assert(prior && lexicalFields.every(field => same(existing[field], desired[field])), `${item.term}: new-card decision cannot replace an existing card.`);
      }
    } else assert(existing, `${item.term}: reuse decision needs an existing canonical ID.`);
    if (!existing) {
      assert(!sameTerm && !entries.some(row => entryLookupKeys(row).some(key => entryLookupKeys(desired).includes(key))), `${item.term}: a new lookup alias collides with an existing card.`);
      entries.push(desired); byId.set(desired.id, desired); byTerm.set(normalized, desired); added.add(desired.id);
      actions.push({ term: item.term, id: desired.id, action, changed: true }); continue;
    }
    assert(!prior || same(prior, context), `${item.term}: an existing article context differs; refusing to overwrite it.`);
    assert(Boolean(prior) === existing.tags.includes(membership), `${item.term}: existing chapter membership is incomplete.`);
    const sourceRow = primarySource(item, source, timestamp);
    const hasSource = existing.sources.some(row => row.title === sourceRow.title && row.url === sourceRow.url && row.kind === "primary");
    const next = { ...existing,
      tags: unique([...existing.tags, membership]),
      readingContexts: prior ? existing.readingContexts : [...existing.readingContexts, context],
      sources: hasSource ? existing.sources : [...existing.sources, sourceRow] };
    const changed = !same(next, existing);
    if (changed) {
      assert(Date.parse(timestamp) >= Date.parse(existing.updatedAt), `${item.term}: import time precedes the existing update.`);
      Object.assign(existing, next, { revision: existing.revision + 1, updatedAt: timestamp }); touched.add(existing.id);
    }
    actions.push({ term: item.term, id: existing.id, action, changed });
  }
  for (const entry of entries) if (touched.has(entry.id) && Object.hasOwn(entry, "synonymScan")) {
    entry.synonymScan = pendingSynonymScan(entry, entries, timestamp, "teamwork_article_context_added");
  }
  const changed = touched.size + added.size > 0;
  const result = changed ? { ...snapshot, exportedAt: timestamp, revisionId: randomUUID(),
    lastMutationId: `import-teamwork-${source.chapter.id}-${randomUUID()}`, entries } : structuredClone(snapshot);
  parsePublicSnapshot(result, { allowLegacy: false });
  for (const old of snapshot.entries) {
    const next = byId.get(old.id);
    assert(next, `${old.term}: original ID was removed.`);
    const allowed = new Set(["tags", "readingContexts", "sources", "revision", "updatedAt", "synonymScan"]);
    for (const key of Object.keys(old)) if (!allowed.has(key)) assert(same(next[key], old[key]), `${old.term}: original ${key} changed.`);
    assert(same(next.tags.slice(0, old.tags.length), old.tags) && same(next.readingContexts.slice(0, old.readingContexts.length), old.readingContexts)
      && same(next.sources.slice(0, old.sources.length), old.sources), `${old.term}: prior context, tags or sources changed.`);
  }
  for (const item of source.items) {
    const view = contextualizeReadingEntry(byId.get(item.reuseExistingEntryId), "teamwork", source.chapter.id);
    assert(view.sourceUrl === source.sourceUrl, `${item.term}: chapter provenance does not resolve to its article URL.`);
  }
  const bytes = Buffer.byteLength(serializeTeamworkSnapshot(result));
  return { snapshot: result, changed, report: { changed, baselineRevision: snapshot.revisionId,
    revisionId: result.revisionId, chapterId: source.chapter.id, articleTitle: source.articleTitle,
    sourcePdfSha256: source.sourcePdfSha256, selected: source.items.length, newCards: added.size,
    reusedCardsChanged: touched.size, totalCards: result.entries.length, snapshotBytes: bytes, actions } };
}

export async function importTeamworkArticle({ sourcePath, snapshotPath = resolve(ROOT, "vocab/data/owner-wordbook.json"),
  timestamp, write = false, expectedRevision, expectedSha256 } = {}) {
  const [sourceBytes, snapshotBytes] = await Promise.all([readFile(sourcePath), readFile(snapshotPath)]);
  const snapshot = JSON.parse(snapshotBytes), digest = sha256(snapshotBytes);
  if (expectedRevision !== undefined) assert(snapshot.revisionId === expectedRevision, "Snapshot revision changed; refresh the baseline.");
  if (expectedSha256 !== undefined) assert(digest === expectedSha256, "Snapshot byte hash changed; refresh the baseline.");
  if (write) assert(text(expectedRevision) && /^[a-f0-9]{64}$/u.test(expectedSha256 || ""), "Writing requires explicit expected revision and byte SHA-256.");
  const planned = planTeamworkArticleImport({ source: JSON.parse(sourceBytes), snapshot, timestamp });
  if (write && planned.changed) {
    const latest = await readFile(snapshotPath);
    assert(latest.equals(snapshotBytes), "Snapshot changed after planning; refusing to overwrite it.");
    const temporary = `${snapshotPath}.teamwork-${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serializeTeamworkSnapshot(planned.snapshot), { flag: "wx" });
      assert((await readFile(snapshotPath)).equals(snapshotBytes), "Snapshot changed before atomic save.");
      assert((await readFile(sourcePath)).equals(sourceBytes), "Article packet changed before atomic save.");
      await rename(temporary, snapshotPath);
    } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
  }
  return { ...planned, report: { ...planned.report, mode: write ? "write" : "dry-run", baselineSha256: digest } };
}

async function main(args) {
  const values = new Map(), allowed = new Set(["source", "snapshot", "timestamp", "expected-revision", "expected-sha256"]);
  let write = false;
  for (const arg of args) {
    if (arg === "--write") { assert(!write, "Duplicate --write."); write = true; continue; }
    const match = arg.match(/^--([^=]+)=(.+)$/u);
    assert(match && allowed.has(match[1]) && !values.has(match[1]), `Unknown, duplicate or empty option: ${arg}`);
    values.set(match[1], match[2]);
  }
  assert(values.has("source"), "Supply --source=/absolute/path/chapter-4.json; the default is dry-run.");
  const result = await importTeamworkArticle({ sourcePath: resolve(values.get("source")),
    snapshotPath: values.has("snapshot") ? resolve(values.get("snapshot")) : undefined,
    timestamp: values.get("timestamp"), write, expectedRevision: values.get("expected-revision"), expectedSha256: values.get("expected-sha256") });
  console.log(JSON.stringify(result.report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
