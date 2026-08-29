import { getPublicCache, putPublicCache } from "./owner-storage.js";
import { createEntryDetailController } from "./entry-detail.js";
import { ownerAdminUrl, publicSnapshotUrl } from "./runtime-config.js";
import { formatMeaningForDisplay, parsePublicSnapshot, rankExactEntryMatches } from "./wordbook-schema.js";
import { setupPwa } from "./pwa.js";

const refs = Object.fromEntries([
  "owner-link", "library-search", "filter-row", "entry-grid", "entry-count", "data-status", "load-error",
  "load-error-message", "retry-load", "empty-message", "search-empty", "search-empty-title", "search-owner-link", "export-public", "entry-dialog", "dialog-type", "dialog-term",
  "dialog-speak", "dialog-copy", "dialog-phonetic", "dialog-meaning", "dialog-definition-section", "dialog-definition", "dialog-example-section",
  "dialog-example-en", "dialog-example-zh", "dialog-usage-section", "dialog-usage", "dialog-extra-section", "dialog-extra", "dialog-source-section", "dialog-source-status",
  "dialog-source-link", "dialog-source-list", "dialog-tags", "install-button", "update-banner", "apply-update"
].map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));

const state = { snapshot: null, filter: "all", query: "" };
const FOREGROUND_REFRESH_MS = 30_000;
const MIN_REFRESH_GAP_MS = 3_000;
const TYPE_LABELS = {
  word: "单词", phrase: "短语", "phrasal-verb": "Phrasal verb", idiom: "Idiom", collocation: "Collocation",
  sentence: "句子", quote: "名言", proverb: "谚语"
};
const ATTRIBUTION_LABELS = { verified: "出处已核验", candidate: "候选出处，尚未核验", unverified: "出处未核验", disputed: "出处存在争议" };
const adminUrl = ownerAdminUrl();
const liveSnapshotUrl = publicSnapshotUrl();
const entryDetail = createEntryDetailController();
let loadTask = null;
let lastLoadStartedAt = 0;

function setText(element, value) {
  if (element) element.textContent = value || "";
}

function setMultilineText(element, value) {
  if (!element) return;
  const lines = String(value || "").split("\n");
  element.replaceChildren();
  lines.forEach((line, index) => {
    if (index) element.append(document.createElement("br"));
    element.append(line);
  });
}

function normalizedSearch(entry) {
  return [entry.term, entry.standardForm, entry.meaning, entry.definition, entry.author, entry.sourceTitle, ...entry.tags, ...entry.collocations, ...entry.synonyms]
    .join(" ").toLocaleLowerCase("zh-CN");
}

function ownerUrlForInput(input) {
  const target = new URL(adminUrl || "owner.html", window.location.href);
  const safeInput = String(input || "").replace(/\s+/g, " ").trim().slice(0, 240);
  if (safeInput) target.searchParams.set("input", safeInput);
  return target.href;
}

function tag(label, className = "") {
  const span = document.createElement("span");
  span.textContent = label;
  if (className) span.className = className;
  return span;
}

function render() {
  const entries = state.snapshot?.entries || [];
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  const queryMatches = rankExactEntryMatches(
    entries.filter((entry) => !query || normalizedSearch(entry).includes(query)),
    query
  );
  const filtered = queryMatches.filter((entry) => state.filter === "all" || entry.entryType === state.filter);
  const cards = filtered.map((entry) => {
    const article = document.createElement("article");
    article.className = "word-card";
    const kicker = document.createElement("div");
    kicker.className = "card-kicker";
    kicker.append(tag(TYPE_LABELS[entry.entryType] || entry.entryType), tag(entry.partOfSpeech || ""));
    const title = document.createElement("h3");
    title.lang = "en";
    title.textContent = entry.term;
    const phonetic = document.createElement("p");
    phonetic.className = "phonetic";
    phonetic.textContent = entry.phonetic;
    const meaning = document.createElement("p");
    meaning.className = "card-meaning";
    setMultilineText(meaning, formatMeaningForDisplay(entry) || "释义待完善");
    const synonyms = document.createElement("p");
    synonyms.className = "card-synonyms";
    synonyms.hidden = entry.synonyms.length === 0;
    synonyms.textContent = entry.synonyms.length ? `同义词：${entry.synonyms.join("；")}` : "";
    const tags = document.createElement("div");
    tags.className = "tag-list";
    const shownTags = entry.tags.slice(0, 3);
    if (["quote", "proverb"].includes(entry.entryType)) shownTags.unshift(ATTRIBUTION_LABELS[entry.attributionStatus]);
    tags.append(...shownTags.filter(Boolean).map((value, index) => tag(value, index === 0 && ["quote", "proverb"].includes(entry.entryType) ? `attribution-chip ${entry.attributionStatus}` : "")));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-open";
    button.setAttribute("aria-label", `查看 ${entry.term} 的完整词条`);
    button.addEventListener("click", () => entryDetail.show(entry, { invoker: button }));
    article.append(kicker, title, phonetic, meaning, synonyms, tags, button);
    return article;
  });
  refs.entryGrid.replaceChildren(...cards);
  refs.entryGrid.setAttribute("aria-busy", "false");
  refs.entryCount.textContent = String(entries.length);
  const searchMiss = Boolean(query) && queryMatches.length === 0;
  refs.searchEmpty.hidden = !searchMiss;
  if (searchMiss) {
    const displayQuery = state.query.replace(/\s+/g, " ").trim().slice(0, 120);
    refs.searchEmptyTitle.textContent = `这里只搜索已发布词库；${displayQuery} 尚未发布。`;
    refs.searchOwnerLink.textContent = `仅卓本人：去管理模式用 AI 整理 ${displayQuery}`;
    refs.searchOwnerLink.href = ownerUrlForInput(state.query);
  }
  refs.emptyMessage.hidden = filtered.length > 0 || searchMiss || entries.length === 0;
}

async function fetchLatestSnapshot() {
  const candidates = [
    { url: liveSnapshotUrl, source: "live" },
    { url: new URL("data/owner-wordbook.json", window.location.href).href, source: "pages" }
  ];
  let lastError = new Error("没有可用的公开词库来源");
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.url);
      if (candidate.source === "live") url.searchParams.set("sync", String(Date.now()));
      const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { snapshot: parsePublicSnapshot(await response.json()), response, source: candidate.source };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError;
}

async function performLoad({ background = false } = {}) {
  if (!background) refs.entryGrid.setAttribute("aria-busy", "true");
  refs.loadError.hidden = true;
  try {
    const { snapshot, response, source } = await fetchLatestSnapshot();
    if (state.snapshot && Date.parse(snapshot.exportedAt) < Date.parse(state.snapshot.exportedAt)) {
      refs.entryGrid.setAttribute("aria-busy", "false");
      refs.dataStatus.textContent = `即时刷新源暂不可用，已保留 ${new Date(state.snapshot.exportedAt).toLocaleString("zh-CN")} 的较新词库。`;
      return;
    }
    if (state.snapshot?.revisionId === snapshot.revisionId) {
      refs.entryGrid.setAttribute("aria-busy", "false");
      refs.dataStatus.textContent = source === "live"
        ? `已即时同步最新公开词库 · 数据更新于 ${new Date(snapshot.exportedAt).toLocaleString("zh-CN")}`
        : `即时源暂不可用，当前已是 GitHub Pages 最新备用快照 · 数据更新于 ${new Date(snapshot.exportedAt).toLocaleString("zh-CN")}`;
      return;
    }
    state.snapshot = snapshot;
    await putPublicCache(snapshot, "", response.url, { etag: response.headers.get("etag") || "" });
    refs.dataStatus.textContent = source === "live"
      ? `已即时同步最新公开词库 · 数据更新于 ${new Date(snapshot.exportedAt).toLocaleString("zh-CN")}`
      : `即时源暂不可用，已读取 GitHub Pages 备用快照 · 数据更新于 ${new Date(snapshot.exportedAt).toLocaleString("zh-CN")}`;
    refs.exportPublic.disabled = false;
    render();
  } catch (networkError) {
    if (state.snapshot) {
      refs.entryGrid.setAttribute("aria-busy", "false");
      refs.dataStatus.textContent = `自动刷新暂时失败，继续显示 ${new Date(state.snapshot.exportedAt).toLocaleString("zh-CN")} 的已验证词库。`;
      return;
    }
    try {
      const cache = await getPublicCache();
      if (!cache?.snapshot) throw new Error("No validated cache");
      state.snapshot = parsePublicSnapshot(cache.snapshot);
      refs.dataStatus.textContent = `当前离线，显示 ${new Date(cache.fetchedAt).toLocaleString("zh-CN")} 保存的已验证缓存。`;
      refs.exportPublic.disabled = false;
      render();
    } catch {
      state.snapshot = null;
      refs.entryGrid.replaceChildren();
      refs.entryGrid.setAttribute("aria-busy", "false");
      refs.dataStatus.textContent = "没有可验证的公开词库数据。";
      refs.loadErrorMessage.textContent = `读取失败：${networkError?.message || "未知错误"}。本页没有生成假词条。`;
      refs.loadError.hidden = false;
      refs.exportPublic.disabled = true;
    }
  }
}

function loadWordbook({ background = false, force = false } = {}) {
  if (loadTask) return loadTask;
  const now = Date.now();
  if (!force && state.snapshot && now - lastLoadStartedAt < MIN_REFRESH_GAP_MS) return Promise.resolve();
  lastLoadStartedAt = now;
  loadTask = performLoad({ background }).finally(() => { loadTask = null; });
  return loadTask;
}

refs.filterRow.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  refs.filterRow.querySelectorAll("button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
  render();
});
refs.librarySearch.addEventListener("input", () => { state.query = refs.librarySearch.value; render(); });
refs.retryLoad.addEventListener("click", () => { void loadWordbook({ force: true }); });
refs.exportPublic.addEventListener("click", () => {
  if (!state.snapshot) return;
  const blob = new Blob([`${JSON.stringify(state.snapshot, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zhuo-public-wordbook-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

if (adminUrl) refs.ownerLink.href = adminUrl;
else {
  refs.ownerLink.href = "owner.html";
  refs.ownerLink.title = "管理后端完成一次性部署后，这里会连接到安全管理域名";
}
setupPwa({ installButton: refs.installButton, updateBanner: refs.updateBanner, applyUpdateButton: refs.applyUpdate, autoApplyUpdate: true });
const refreshWhileVisible = () => {
  if (document.visibilityState === "hidden" || navigator.onLine === false) return;
  void loadWordbook({ background: true });
};
window.addEventListener("focus", refreshWhileVisible);
document.addEventListener("visibilitychange", refreshWhileVisible);
window.addEventListener("online", () => { void loadWordbook({ background: Boolean(state.snapshot), force: true }); });
window.setInterval(refreshWhileVisible, FOREGROUND_REFRESH_MS);
void loadWordbook({ force: true });
