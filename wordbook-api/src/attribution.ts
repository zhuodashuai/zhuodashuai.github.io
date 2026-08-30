import { PublicEntrySchema, classifyInput, normalizeEnglish, type PublicEntry, type SourceRecord } from "./schema";

const WIKIQUOTE_API = "https://en.wikiquote.org/w/api.php";
const WIKISOURCE_API = "https://en.wikisource.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const REQUEST_TIMEOUT_MS = 5_000;
const USER_AGENT = "ZhuoWordbook/2.3 (https://zhuodashuai.github.io/vocab/)";

interface SearchHit {
  title: string;
  snippet: string;
  index: number;
  namespace: number;
}

interface MediaWikiPage {
  title?: unknown;
  fullurl?: unknown;
  pageprops?: unknown;
}

interface WikidataEntity {
  id?: unknown;
  labels?: unknown;
  claims?: unknown;
}

interface QuoteCandidate {
  hit: SearchHit;
  pageUrl: string;
  itemId: string;
  work: string;
  authorIds: string[];
  isHuman: boolean;
  date: string;
  score: number;
}

export interface FreeAttributionEvidence {
  status: "candidate";
  author: string;
  sourceTitle: string;
  sourceWork: string;
  sourceDate: string;
  sourceUrl: string;
  attributionNote: string;
  sources: SourceRecord[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Wikimedia snippets are public, editable text, so a page may legitimately
 * contain a malformed numeric entity. String.fromCodePoint throws a RangeError
 * on anything above U+10FFFF or inside the surrogate range, which would abort
 * an otherwise successful attribution lookup; keep the raw entity instead.
 */
function codePointOrRaw(match: string, value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff
    || (value >= 0xd800 && value <= 0xdfff)) return match;
  return String.fromCodePoint(value);
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: "\"", nbsp: " " };
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot|nbsp);/gi, (match, entity: string) => {
      const key = entity.toLowerCase();
      if (key.startsWith("#x")) return codePointOrRaw(match, Number.parseInt(key.slice(2), 16));
      if (key.startsWith("#")) return codePointOrRaw(match, Number.parseInt(key.slice(1), 10));
      return named[key] || " ";
    });
}

function wordTokens(value: string): string[] {
  return decodeHtml(value)
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .toLocaleLowerCase("en-US")
    .match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) || [];
}

function containsTokenSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || haystack.length < needle.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

function searchTokens(input: string): string[] {
  // The complete submitted text is the evidence boundary. Truncating long
  // quotations would let a genuine prefix hide a fabricated or altered tail.
  return wordTokens(input);
}

function exactSnippetMatch(input: string, snippet: string): boolean {
  const expected = searchTokens(input);
  return expected.length >= 3 && containsTokenSequence(wordTokens(snippet), expected);
}

function apiUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

async function jsonRequest(url: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
      "Api-User-Agent": USER_AGENT,
      "User-Agent": USER_AGENT
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Wikimedia API returned ${response.status}`);
  return record(await response.json());
}

async function searchProject(base: string, input: string, limit: number, namespaces: string, fetcher: typeof fetch): Promise<SearchHit[]> {
  const tokens = searchTokens(input);
  if (tokens.length < 3) return [];
  const payload = await jsonRequest(apiUrl(base, {
    action: "query",
    list: "search",
    srsearch: `\"${tokens.join(" ")}\"`,
    srnamespace: namespaces,
    srlimit: String(limit),
    srprop: "snippet",
    format: "json",
    formatversion: "2",
    origin: "*"
  }), fetcher);
  const query = record(payload.query);
  const matches = Array.isArray(query.search) ? query.search : [];
  return matches.flatMap((value, index) => {
    const item = record(value);
    if (typeof item.title !== "string" || typeof item.snippet !== "string" || !exactSnippetMatch(input, item.snippet)) return [];
    return [{ title: item.title, snippet: item.snippet, index, namespace: Number(item.ns) || 0 }];
  });
}

function wikiPageUrl(host: string, title: string): string {
  const path = title.replace(/ /g, "_").split("/").map((part) => encodeURIComponent(part)).join("/");
  return `https://${host}/wiki/${path}`;
}

async function wikiquotePages(hits: SearchHit[], fetcher: typeof fetch): Promise<Map<string, MediaWikiPage>> {
  if (!hits.length) return new Map();
  const payload = await jsonRequest(apiUrl(WIKIQUOTE_API, {
    action: "query",
    prop: "info|pageprops",
    titles: hits.slice(0, 10).map((hit) => hit.title).join("|"),
    inprop: "url",
    format: "json",
    formatversion: "2",
    origin: "*"
  }), fetcher);
  const pages = Array.isArray(record(payload.query).pages) ? record(payload.query).pages as unknown[] : [];
  return new Map(pages.flatMap((value) => {
    const page = value as MediaWikiPage;
    return typeof page.title === "string" ? [[page.title, page] as const] : [];
  }));
}

async function wikidataEntities(ids: string[], props: string, fetcher: typeof fetch): Promise<Map<string, WikidataEntity>> {
  const unique = [...new Set(ids.filter((id) => /^Q\d+$/.test(id)))];
  if (!unique.length) return new Map();
  const payload = await jsonRequest(apiUrl(WIKIDATA_API, {
    action: "wbgetentities",
    ids: unique.join("|"),
    props,
    languages: "en",
    languagefallback: "1",
    format: "json",
    origin: "*"
  }), fetcher);
  const entities = record(payload.entities);
  return new Map(Object.entries(entities).flatMap(([id, value]) => {
    const entity = value as WikidataEntity;
    return record(value).missing === "" ? [] : [[id, entity] as const];
  }));
}

function entityLabel(entity: WikidataEntity | undefined): string {
  const label = record(record(entity?.labels).en);
  return typeof label.value === "string" ? label.value.trim().slice(0, 500) : "";
}

function claimEntityIds(entity: WikidataEntity | undefined, property: string): string[] {
  const claims = record(entity?.claims);
  const statements = Array.isArray(claims[property]) ? claims[property] as unknown[] : [];
  return [...new Set(statements.flatMap((value) => {
    const statement = record(value);
    if (statement.rank === "deprecated") return [];
    const dataValue = record(record(record(statement.mainsnak).datavalue).value);
    return typeof dataValue.id === "string" && /^Q\d+$/.test(dataValue.id) ? [dataValue.id] : [];
  }))];
}

function publicationDate(entity: WikidataEntity | undefined): string {
  const claims = record(entity?.claims);
  const statements = Array.isArray(claims.P577) ? claims.P577 as unknown[] : [];
  const preferred = statements.filter((value) => record(value).rank === "preferred");
  const chosen = preferred.length ? preferred : statements.filter((value) => record(value).rank !== "deprecated");
  const years = [...new Set(chosen.flatMap((value) => {
    const time = record(record(record(record(value).mainsnak).datavalue).value).time;
    const match = typeof time === "string" ? time.match(/^[+-](\d{4})-/) : null;
    return match ? [match[1]] : [];
  }))];
  return years.length === 1 ? years[0] : "";
}

function workTitleMatchesPage(work: string, pageTitle: string): boolean {
  const ignored = new Set(["a", "an", "and", "of", "the", "to"]);
  const workWords = wordTokens(work).filter((token) => !ignored.has(token));
  const pageWords = new Set(wordTokens(pageTitle));
  return workWords.length > 0 && workWords.every((token) => pageWords.has(token));
}

function dedupeSources(sources: SourceRecord[]): SourceRecord[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 20);
}

/**
 * A deliberately conservative, API-key-free attribution lookup.
 *
 * Wikiquote alone produces a candidate. An exact Wikiquote text hit, the linked
 * Wikidata work/author relationship, and an exact hit in a Wikisource page
 * whose title identifies the same work strengthen that candidate and select a
 * primary link. Punctuation is ignored, words are not. Automatic lookup never
 * returns verified: only the owner can do so after reading the source.
 */
export async function lookupFreeAttribution(input: string, fetcher: typeof fetch = fetch): Promise<FreeAttributionEvidence | null> {
  const tokens = searchTokens(input);
  if (tokens.length < 3) return null;
  const [quoteHits, sourceHits] = await Promise.all([
    searchProject(WIKIQUOTE_API, input, 10, "0", fetcher),
    // Namespace 0 contains transcluded reading editions; namespace 104 is the
    // scan-backed Page text. Both are searchable primary-text evidence.
    searchProject(WIKISOURCE_API, input, 20, "0|104", fetcher)
  ]);
  if (!quoteHits.length) return null;

  const pages = await wikiquotePages(quoteHits, fetcher);
  const itemIds = quoteHits.flatMap((hit) => {
    const props = record(pages.get(hit.title)?.pageprops);
    return typeof props.wikibase_item === "string" ? [props.wikibase_item] : [];
  });
  const workEntities = await wikidataEntities(itemIds, "claims|labels", fetcher);
  const mapped: QuoteCandidate[] = quoteHits.map((hit) => {
    const page = pages.get(hit.title);
    const props = record(page?.pageprops);
    const itemId = typeof props.wikibase_item === "string" ? props.wikibase_item : "";
    const entity = workEntities.get(itemId);
    const work = entityLabel(entity) || hit.title;
    const authorIds = claimEntityIds(entity, "P50");
    const isHuman = claimEntityIds(entity, "P31").includes("Q5");
    const sameTitle = normalizeEnglish(work) === normalizeEnglish(hit.title);
    return {
      hit,
      pageUrl: typeof page?.fullurl === "string" ? page.fullurl : wikiPageUrl("en.wikiquote.org", hit.title),
      itemId,
      work,
      authorIds,
      isHuman,
      date: publicationDate(entity),
      score: authorIds.length * 200 + (isHuman ? 100 : 0) + (sameTitle ? 25 : 0) - hit.index
    };
  }).sort((left, right) => right.score - left.score);

  const chosen = mapped[0];
  if (!chosen) return null;
  const authorEntities = await wikidataEntities(chosen.authorIds, "labels", fetcher);
  const workAuthorNames = chosen.authorIds.map((id) => entityLabel(authorEntities.get(id))).filter(Boolean);
  const author = workAuthorNames.join("; ") || (chosen.isHuman ? chosen.work : "");
  const sourceWork = chosen.authorIds.length ? chosen.work : "";
  const primaryHit = chosen.authorIds.length
    ? sourceHits
      .filter((hit) => workTitleMatchesPage(chosen.work, hit.title))
      .sort((left, right) => Number(right.namespace === 104) - Number(left.namespace === 104) || left.index - right.index)[0]
    : undefined;
  const retrievedAt = new Date().toISOString();
  const wikiquoteSource: SourceRecord = {
    title: `Wikiquote: ${chosen.hit.title}`,
    url: chosen.pageUrl,
    kind: "candidate",
    retrievedAt
  };
  const wikidataSource: SourceRecord | null = chosen.itemId ? {
    title: `Wikidata: ${chosen.work}`,
    url: `https://www.wikidata.org/wiki/${chosen.itemId}`,
    kind: "secondary",
    retrievedAt
  } : null;

  if (primaryHit && author && sourceWork) {
    const primaryUrl = wikiPageUrl("en.wikisource.org", primaryHit.title);
    const primarySource: SourceRecord = {
      title: `Wikisource: ${primaryHit.title}`,
      url: primaryUrl,
      kind: "primary",
      retrievedAt
    };
    return {
      status: "candidate",
      author,
      sourceTitle: primarySource.title,
      sourceWork,
      sourceDate: chosen.date,
      sourceUrl: primaryUrl,
      attributionNote: `Wikisource 原文页检索到与完整输入逐词匹配的文本；Wikiquote 命中同一作品，Wikidata 将作品作者列为 ${author}。自动检索仍只标为 candidate；请由卓打开来源复查后再决定是否核验。`,
      sources: dedupeSources([primarySource, wikiquoteSource, ...(wikidataSource ? [wikidataSource] : [])])
    };
  }

  return {
    status: "candidate",
    author,
    sourceTitle: wikiquoteSource.title,
    sourceWork,
    sourceDate: chosen.date,
    sourceUrl: chosen.pageUrl,
    attributionNote: author
      ? "Wikiquote 检索到与输入逐词匹配的候选条目，作者或作品来自相连的 Wikidata 元数据；尚未找到同作品的 Wikisource 原文页，不能升级为 verified。"
      : "Wikiquote 检索到与输入逐词匹配的候选条目，但缺少可交叉核对的作者和原始作品证据，不能升级为 verified。",
    sources: dedupeSources([wikiquoteSource, ...(wikidataSource ? [wikidataSource] : [])])
  };
}

export function applyFreeAttribution(entry: PublicEntry, evidence: FreeAttributionEvidence): PublicEntry {
  // Evidence lookup must never reclassify an ordinary phrase or sentence as a
  // quotation merely because the same words appear on a quotations website.
  if (!["quote", "proverb"].includes(entry.entryType)) return PublicEntrySchema.parse(entry);
  return PublicEntrySchema.parse({
    ...entry,
    synonyms: [],
    author: evidence.author,
    sourceTitle: evidence.sourceTitle,
    sourceWork: evidence.sourceWork,
    sourceDate: evidence.sourceDate,
    sourceUrl: evidence.sourceUrl,
    attributionStatus: evidence.status,
    attributionNote: evidence.attributionNote,
    sources: dedupeSources([...evidence.sources, ...entry.sources])
  });
}

export function mayNeedFreeAttributionLookup(input: string): boolean {
  return classifyInput(input) === "quote";
}
