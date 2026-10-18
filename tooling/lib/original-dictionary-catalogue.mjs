import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { normalizeOriginalHeadword, parseOriginalDictionary } from "./original-dictionary.mjs";

const DEFAULT_INDEX = resolve(import.meta.dirname, "../dictionary/source/index.json");
const DEFAULT_REVIEWS = resolve(import.meta.dirname, "../dictionary/reviews");

/** Stable across pretty-printing/CRLF and review-status updates. Not a signature. */
export function originalContentHash(pack) {
  const parsed = parseOriginalDictionary(pack);
  const records = parsed.entries.map(({ review: _review, ...content }) => content)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

export function validateOriginalReview(review, pack, sourceFile) {
  const allowed = ["schemaVersion", "sourceFile", "sourceContentSha256", "reviewer", "reviewerKind", "independentOfAuthor", "approvedEntryIds", "issues", "scope", "note"];
  if (!review || typeof review !== "object" || Array.isArray(review) || Object.keys(review).length !== allowed.length
    || Object.keys(review).some(key => !allowed.includes(key)) || review.schemaVersion !== 1
    || review.sourceFile !== sourceFile || review.sourceContentSha256 !== originalContentHash(pack)
    || typeof review.reviewer !== "string" || !/^AI\/[a-z0-9_-]{1,100}$/u.test(review.reviewer)
    || review.reviewerKind !== "AI" || review.independentOfAuthor !== true
    || review.scope !== "selected-common-senses-only"
    || typeof review.note !== "string" || review.note.length > 2000
    || !Array.isArray(review.approvedEntryIds) || !Array.isArray(review.issues)) {
    throw new Error(`Invalid or stale independent review: ${sourceFile}`);
  }
  const parsed = parseOriginalDictionary(pack);
  const ids = new Set(parsed.entries.map(entry => entry.id));
  const approved = new Set();
  for (const id of review.approvedEntryIds) {
    if (typeof id !== "string" || !ids.has(id) || approved.has(id)) throw new Error(`Invalid/duplicate reviewed ID in ${sourceFile}`);
    approved.add(id);
  }
  for (const issue of review.issues) {
    if (!issue || typeof issue !== "object" || Object.keys(issue).length !== 4
      || Object.keys(issue).some(key => !["entryId", "severity", "problem", "resolution"].includes(key))
      || !ids.has(issue.entryId) || !["blocking", "advisory"].includes(issue.severity)
      || typeof issue.problem !== "string" || !issue.problem.trim() || issue.problem.length > 2000
      || typeof issue.resolution !== "string" || issue.resolution.length > 2000) throw new Error(`Malformed review issue in ${sourceFile}`);
    if (issue.severity === "blocking" && !issue.resolution.trim() && approved.has(issue.entryId)) {
      throw new Error(`Unresolved blocking issue cannot approve ${issue.entryId}`);
    }
  }
  return { parsed, approved, review };
}

/** Merge real original writing only; a headword queue cannot enter this catalogue. */
export function mergeOriginalPacks(packs) {
  if (!Array.isArray(packs) || !packs.length || packs.length > 1000) throw new Error("Provide 1–1000 original source packs.");
  const entries = [], heads = new Set();
  for (const pack of packs) {
    const parsed = parseOriginalDictionary(pack);
    for (const entry of parsed.entries) {
      const key = normalizeOriginalHeadword(entry.headword);
      if (heads.has(key)) throw new Error(`Repeated canonical headword: ${key}. Merge its senses explicitly, not silently.`);
      heads.add(key); entries.push(entry);
    }
  }
  return parseOriginalDictionary({ schemaVersion: 1, name: "卓式词典", entries });
}

export async function loadOriginalCatalogue({ indexPath = DEFAULT_INDEX, reviewDirectory = DEFAULT_REVIEWS } = {}) {
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  if (!index || index.schemaVersion !== 1 || index.name !== "卓式词典"
    || Object.keys(index).some(key => !["schemaVersion", "name", "sourceFiles"].includes(key))
    || !Array.isArray(index.sourceFiles) || !index.sourceFiles.length || index.sourceFiles.length > 1000
    || new Set(index.sourceFiles).size !== index.sourceFiles.length
    || index.sourceFiles.some(file => typeof file !== "string" || !/^[a-z0-9-]+\.json$/u.test(file) || file === basename(indexPath))) {
    throw new Error("Invalid original source index.");
  }
  const packs = [], reviewSummary = [];
  for (const file of index.sourceFiles) {
    const pack = parseOriginalDictionary(JSON.parse(await readFile(resolve(dirname(indexPath), file), "utf8")));
    let review;
    try { if (reviewDirectory) review = JSON.parse(await readFile(resolve(reviewDirectory, file), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!review) {
      // Draft flags from an author are not independent review evidence.
      const entries = pack.entries.map(entry => ({ ...entry, review: { status: "draft", reviewer: "", note: "No hash-bound independent review is recorded." } }));
      packs.push({ ...pack, entries });
      reviewSummary.push({ sourceFile: file, entries: entries.length, approved: 0, state: "review-missing" });
      continue;
    }
    const checked = validateOriginalReview(review, pack, file);
    const entries = pack.entries.map(entry => ({ ...entry,
      review: checked.approved.has(entry.id)
        ? { status: "checked", reviewer: review.reviewer, note: "AI 交叉复核：仅本条列出的常用义项；非人工审定，非全部义项。" }
        : { status: "draft", reviewer: "", note: "Independent review has not approved this entry." }
    }));
    packs.push({ ...pack, entries });
    reviewSummary.push({ sourceFile: file, entries: entries.length, approved: checked.approved.size, reviewer: review.reviewer, state: "ai-review-recorded" });
  }
  return { pack: mergeOriginalPacks(packs), reviewSummary };
}
