const CORE_DICTIONARY_URL = new URL("../data/ecdict-core.json", import.meta.url);
if (typeof location !== "undefined"
  && ["localhost", "127.0.0.1"].includes(location.hostname)
  && new URLSearchParams(location.search).get("e2e") === "1") {
  // A previously registered local service worker may still control an e2e
  // page.  Give every isolated test run its own dictionary URL so stale
  // cache entries can never make browser QA disagree with the checked-in file.
  CORE_DICTIONARY_URL.searchParams.set(
    "testRun",
    new URLSearchParams(location.search).get("testRun") || "e2e"
  );
}
const EXPECTED_SCHEMA_VERSION = 1;

let cachedDictionaryPromise = null;
let cancelDictionaryLoad = null;

export function normalizeCoreKey(value) {
  return String(value || "")
    .trim()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

function cleanText(value, maximum = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function cleanInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function cleanList(value, maximum = 20) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(String(item), 120)).filter(Boolean))].slice(0, maximum);
}

function parseRow(row, indexes) {
  if (!Array.isArray(row)) return null;
  const key = normalizeCoreKey(row[indexes.key]);
  const word = cleanText(row[indexes.word], 100);
  const meaning = cleanText(row[indexes.meaning], 1200);
  if (!key || !word || !meaning) return null;
  return Object.freeze({
    key,
    word,
    phonetic: cleanText(row[indexes.phonetic], 160),
    partOfSpeech: cleanText(row[indexes.partOfSpeech], 80),
    meaning,
    definition: cleanText(row[indexes.definition], 1400),
    collins: cleanInteger(row[indexes.collins]),
    oxford: Boolean(cleanInteger(row[indexes.oxford])),
    bnc: cleanInteger(row[indexes.bnc]),
    frq: cleanInteger(row[indexes.frq]),
    tags: cleanText(row[indexes.tags], 160).split(/\s+/).filter(Boolean),
    forms: cleanList(row[indexes.forms], 12),
    source: "ECDICT"
  });
}

export function parseCoreDictionary(payload) {
  if (!payload || typeof payload !== "object") throw new Error("本地词典格式不正确。");
  if (Number(payload.schemaVersion) !== EXPECTED_SCHEMA_VERSION) {
    throw new Error("本地词典版本不受支持，请刷新页面后重试。");
  }
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const required = [
    "key", "word", "phonetic", "partOfSpeech", "meaning", "definition",
    "collins", "oxford", "bnc", "frq", "tags", "forms"
  ];
  const indexes = Object.fromEntries(required.map((name) => [name, columns.indexOf(name)]));
  if (required.some((name) => indexes[name] < 0)) throw new Error("本地词典缺少必要字段。");

  const entries = new Map();
  for (const row of Array.isArray(payload.entries) ? payload.entries : []) {
    const entry = parseRow(row, indexes);
    if (entry && !entries.has(entry.key)) entries.set(entry.key, entry);
  }
  if (!entries.size) throw new Error("本地词典没有可用词条。");
  if (Number(payload.count) !== entries.size) throw new Error("本地词典词条计数不一致。");
  return Object.freeze({
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    source: Object.freeze({
      name: cleanText(payload.source?.name, 80) || "ECDICT",
      url: cleanText(payload.source?.url, 500),
      license: cleanText(payload.source?.license, 80),
      sha256: cleanText(payload.source?.sha256, 128)
    }),
    entries
  });
}

export async function loadCoreDictionary({ fetchImpl = globalThis.fetch, url = CORE_DICTIONARY_URL, force = false, timeoutMs = 20_000 } = {}) {
  if (force) resetCoreDictionaryCacheForTests();
  if (!cachedDictionaryPromise) {
    const controller = new AbortController();
    let rejectDeadline;
    const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
    const cancel = () => { controller.abort(); rejectDeadline(new Error("本地词典读取已停止，请重试。")); };
    const timer = setTimeout(() => { controller.abort(); rejectDeadline(new Error("本地词典读取超时，请重试。")); }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20_000);
    const download = (async () => {
      if (typeof fetchImpl !== "function") throw new Error("当前环境无法读取本地词典。");
      const response = await fetchImpl(url, { cache: "force-cache", credentials: "omit", signal: controller.signal });
      if (!response?.ok) throw new Error(`本地词典读取失败：${response?.status || "network"}`);
      return parseCoreDictionary(await response.json());
    })();
    const loading = Promise.race([download, deadline]).catch((error) => {
      // An older failed/forced load must never invalidate a newer shared load.
      if (cachedDictionaryPromise === loading) cachedDictionaryPromise = null;
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      if (cancelDictionaryLoad === cancel) cancelDictionaryLoad = null;
    });
    cachedDictionaryPromise = loading;
    cancelDictionaryLoad = cancel;
  }
  return cachedDictionaryPromise;
}

export async function lookupCoreEntry(term, options = {}) {
  const key = normalizeCoreKey(term);
  if (!key) return null;
  const dictionary = options.dictionary || await loadCoreDictionary(options);
  return dictionary.entries.get(key) || null;
}

export function lookupParsedCoreEntry(dictionary, term) {
  return dictionary?.entries?.get(normalizeCoreKey(term)) || null;
}

export function resetCoreDictionaryCacheForTests() {
  cancelDictionaryLoad?.();
  cancelDictionaryLoad = null;
  cachedDictionaryPromise = null;
}
