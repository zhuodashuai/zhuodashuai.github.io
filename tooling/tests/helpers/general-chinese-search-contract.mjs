import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { searchExpandedDictionary } from "../../../vocab/js/expanded-dictionary.js";
import { CHINESE_RANKING_RELEASE } from "../../../vocab/js/chinese-ranking-release.js";
import { normalizeChineseRankingQuery, createChineseRankingContext, chineseRankingAnchorMatch, chineseVariantRank } from "../../../vocab/js/chinese-ranking.js";
import { chineseSearchPlan, chineseSearchSense, matchesChineseSearchEntry, matchesChineseSearchMeaning } from "../../../vocab/js/chinese-search.js";
import { everydayChineseEntries, everydayChineseQuery, isSupersededChineseSenseHead, isRetainedCanonicalSenseHead,
  matchesRetainedCanonicalAlternative, sanitizeRetainedCanonicalResult } from "../../../vocab/js/everyday-lookup.js";
import { personalDictionaryResult } from "../../../vocab/js/personal-dictionary.js";
import { SELECTED_COMMON_SENSE_BINDINGS } from "../../../vocab/js/selected-common-sense-data.js";

const root = new URL("../../../", import.meta.url);
export const dictionaryManifest = JSON.parse(await readFile(new URL("vocab/data/expanded-dictionary/manifest.json", root)));
const manifestUrl = new URL("vocab/data/expanded-dictionary/manifest.json", root);
const rankingUrl = new URL(`vocab/data/chinese-search-ranking/${CHINESE_RANKING_RELEASE.file}`, root);
const allowed = new Set([manifestUrl.href, rankingUrl.href, ...[...dictionaryManifest.english.shards, ...dictionaryManifest.chinese.shards]
  .map(row => new URL(`vocab/data/expanded-dictionary/${row.file}`, root).href)]);
const bytes = new Map();
export const sharedChineseTransport = { requests: [], fetchImpl: async (input, options = {}) => {
  const url = new URL(input);
  assert.equal(url.protocol, "file:"); assert.equal(url.search, ""); assert.equal(url.hash, "");
  assert(allowed.has(url.href), `Only the exact published source/ranking descriptors may be read: ${url.href}`);
  assert.equal(options.credentials, "omit"); assert(!options.method || options.method === "GET", "Lookup must never write");
  sharedChineseTransport.requests.push(url.href);
  if (!bytes.has(url.href)) bytes.set(url.href, readFile(url));
  return new Response(await bytes.get(url.href));
} };

/** One validated runtime client is deliberately shared across the 600 groups.
 * Per-source corruption tests use separate custom transports and remain cold. */
export async function allChineseResults(query, { fetchImpl = sharedChineseTransport.fetchImpl, limit = 50 } = {}) {
  const results = []; let offset = 0, total, first;
  for (let page = 0; page < 5000; page++) {
    const next = await searchExpandedDictionary(query, { fetchImpl, limit, offset });
    first ||= next; total ??= next.total;
    assert.equal(next.relatedIntegrated, true, `${query}: associations must share the main result stream`);
    assert.equal(next.ranking, "global"); assert.equal(next.total, total);
    assert.equal(next.offset, offset); assert.equal(next.nextOffset, offset + next.results.length);
    results.push(...next.results);
    if (!next.hasMore) break;
    assert(next.nextOffset > offset, `${query}: each continuing page must advance`); offset = next.nextOffset;
    assert(page < 4999, `${query}: paging must terminate`);
  }
  assert.equal(results.length, total, `${query}: every counted match must be reachable`);
  assert.equal(new Set(results.map(row => row.term)).size, results.length, `${query}: canonical heads must not repeat`);
  const end = await searchExpandedDictionary(query, { fetchImpl, limit, offset: total });
  assert.equal(end.hasMore, false); assert.deepEqual(end.results, []); assert.equal(end.total, total);
  const short = await searchExpandedDictionary(query, { fetchImpl, limit: 20, offset: 0 });
  assert.deepEqual(short.results, results.slice(0, 20), `${query}: page size must not change ranking`);
  return { ...first, results, firstPage: first.results, total, hasMore: false };
}

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
let sourcePromise;
async function sources() {
  if (!sourcePromise) sourcePromise = (async () => {
    const compressed = await readFile(rankingUrl);
    assert.equal(compressed.length, CHINESE_RANKING_RELEASE.bytes); assert.equal(sha(compressed), CHINESE_RANKING_RELEASE.sha256);
    const payload = JSON.parse(gunzipSync(compressed)), corpus = new Map(), records = new Map();
    assert.equal(payload.dictionaryVersion, dictionaryManifest.version); assert.equal(payload.records.length, dictionaryManifest.counts.records);
    for (const [id, term, tuples] of payload.records) {
      const [primary, ...variants] = tuples.map(([partOfSpeech, source, meaning]) => ({ partOfSpeech, source, meaning }));
      const record = { id, term, ...primary, variants }; records.set(term, record);
      if (isSupersededChineseSenseHead(term)) continue;
      const kept = [record, ...record.variants].filter(item => !isRetainedCanonicalSenseHead(term)
        || matchesRetainedCanonicalAlternative(term, display(record, item)));
      if (kept.length) corpus.set(id, { id, term, ...kept[0], variants: kept.slice(1) });
    }
    const everyday = everydayChineseEntries();
    everyday.forEach((entry, index) => corpus.set(`everyday:${index}`, { ...entry.result, variants: [] }));
    return { records, corpus, everyday };
  })();
  return sourcePromise;
}

function display(record, selected) {
  let formatted = selected;
  if (["mit", "core", "pos-reviewed", "grammar-reviewed", "pos-notation-reviewed"].includes(selected.source)
    && !/^\s*(?:[①-⑳]|\d+[.、])/u.test(selected.meaning)) {
    const next = personalDictionaryResult({ word: record.term, partOfSpeech: selected.partOfSpeech, meaning: selected.meaning });
    if (next) formatted = { ...selected, partOfSpeech: next.partOfSpeech || selected.partOfSpeech,
      meaning: next.meaning.length <= 2000 ? next.meaning : selected.meaning };
  }
  const result = { term: record.term, partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning, ...dictionaryManifest.sources[selected.source] };
  result.source = result.name; delete result.name; delete result.commit; delete result.sha256;
  return sanitizeRetainedCanonicalResult(result) || result;
}
const tupleEqual = (a, b) => ["partOfSpeech", "meaning", "source", "license", "url"].every(key => a[key] === b[key]);
const contexts = new Map();
async function queryContext(query) {
  if (!contexts.has(query)) {
    const { corpus } = await sources();
    const normalized = normalizeChineseRankingQuery(everydayChineseQuery(query) || query, corpus);
    contexts.set(query, { normalized, context: createChineseRankingContext(normalized.term, corpus, { partOfSpeechHint: normalized.partOfSpeechHint }) });
    if (contexts.size > 32) contexts.delete(contexts.keys().next().value);
  }
  return contexts.get(query);
}

/** Broader rows need their own complete source tuple and literal/one-hop
 * evidence; a catalogue's POS or example approval never transfers to them. */
export async function assertAuditableChineseRow(query, row) {
  const { records, everyday } = await sources(), record = records.get(row.term);
  const sourceMatches = record ? [record, ...record.variants].filter(item => tupleEqual(display(record, item), row)) : [];
  const daily = everyday.filter(entry => entry.result.term === row.term && tupleEqual(entry.result, row));
  assert(sourceMatches.length || daily.length, `${query}/${row.term}: result must equal one intact public source variant`);
  const { normalized, context } = await queryContext(query), term = normalized.term;
  const plan = chineseSearchPlan(term), aliases = plan?.term === term ? plan.aliases : [];
  const declared = daily.flatMap(entry => entry.aliases);
  if (row.matchType === "related") {
    assert.equal(typeof row.matchedChinese, "string");
    const anchor = chineseRankingAnchorMatch(row.meaning, context, row.partOfSpeech);
    const literal = chineseVariantRank(row.meaning, term, row.partOfSpeech, { context, partOfSpeechHint: normalized.partOfSpeechHint });
    assert(declared.includes(row.matchedChinese) && [term, ...aliases].includes(row.matchedChinese)
      || aliases.includes(row.matchedChinese) && matchesChineseSearchMeaning(row.meaning, row.matchedChinese)
      || literal !== null && anchor?.matchedChinese === row.matchedChinese,
    `${query}/${row.term}: a relation needs literal source evidence or a declared whole alias; co-definition anchors cannot create candidates`);
  } else assert.notEqual(chineseVariantRank(row.meaning, term, row.partOfSpeech, { context, partOfSpeechHint: normalized.partOfSpeechHint }), null,
    `${query}/${row.term}: an unlabelled result must match its actual source definition`);
  if (row.matchedSourceEvidence) {
    const binding = SELECTED_COMMON_SENSE_BINDINGS.find(item => item.head === row.term && item.groupTerms.includes(row.matchedChinese || term));
    assert(binding, `${query}/${row.term}: source approval cannot be invented`);
    assert.equal(row.partOfSpeech, binding.selectedRow.partOfSpeech); assert.equal(row.meaning, binding.selectedRow.meaning);
    assert.deepEqual(row.matchedExampleSenseEvidence, [binding.selectedExampleProof]);
    assert.deepEqual(row.matchedExampleSenseIds, [binding.selectedExampleProof.id]);
    assert.deepEqual(row.matchedSourceEvidence, { kind: "reviewed-canonical-primary", groupId: binding.groupId, sourceId: binding.sourceId,
      canonicalId: binding.canonicalId, canonicalSourceSha256: binding.canonicalSourceSha256,
      selectedSourceSha256: binding.selectedSourceSha256, selectedRowSha256: binding.selectedRowSha256 });
  } else if (row.matchedSense || row.matchedPartOfSpeech || row.matchedExampleSenseEvidence || row.matchedExampleSenseIds) {
    const matched = row.matchedChinese || term, scope = chineseSearchSense(matched);
    assert(scope, `${query}/${row.term}: scope metadata requires an actual reviewed query sense`);
    assert(sourceMatches.some(item => matchesChineseSearchEntry(row.term, item.meaning, matched, item.partOfSpeech, item.source)),
      `${query}/${row.term}: exact source/POS approval must apply to the primary variant`);
    assert.equal(row.matchedSense, scope.sense); assert.equal(row.matchedPartOfSpeech, scope.pos);
    const proofs = scope.exampleSenses?.[row.term.toLocaleLowerCase("en-US")] || [];
    assert.deepEqual(row.matchedExampleSenseEvidence, proofs); assert.deepEqual(row.matchedExampleSenseIds, proofs.map(item => item.id));
  }
}
