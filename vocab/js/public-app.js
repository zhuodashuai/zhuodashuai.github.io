import { getPublicCache, getReviewState, listReviewStates, putPublicCache, putReviewState, ReviewStateConflictError } from "./owner-storage.js";
import { createEntryDetailController } from "./entry-detail.js";
import { ownerAdminUrl, publicSnapshotUrl } from "./runtime-config.js";
import { contextualizeReadingEntry, formatMeaningForDisplay, normalizePublicSearchQuery, parsePublicSnapshot, publicEntryMatchesQuery, rankExactEntryMatches } from "./wordbook-schema.js";
import { setupPwa } from "./pwa.js";
import { buildCollectionCatalog, collectionContextForEntry, filterEntriesByCollection, splitChineseMeaningPoints, visibleEntryTags } from "./collections.js";
import { applyReviewRating, buildDueQueue, buildStudySummary } from "./study.js";
import { buildSynonymGroups } from "./synonym-groups.js";
import { sameSynonymSenseView } from "./synonym-evidence.js";
import { renderSynonymGroups } from "./synonym-view.js";

const refs = Object.fromEntries([
  "owner-link", "library-heading", "library-search", "filter-row", "collection-tabs", "chapter-tabs", "entry-grid", "entry-count", "data-status", "load-error",
  "load-error-message", "retry-load", "empty-message", "search-empty", "search-empty-title", "export-public", "entry-dialog", "dialog-type", "dialog-term",
  "dialog-speak", "dialog-copy", "dialog-phonetic", "dialog-meaning", "dialog-definition-section", "dialog-definition", "dialog-example-section",
  "dialog-example-en", "dialog-example-zh", "dialog-usage-section", "dialog-usage", "dialog-extra-section", "dialog-extra", "dialog-source-section", "dialog-source-status",
  "dialog-source-link", "dialog-source-list", "dialog-tags", "dialog-review-section", "dialog-review-status", "dialog-review-actions", "study-button", "due-count",
  "install-button", "update-banner", "apply-update", "view-controls", "synonym-panel", "synonym-intro", "synonym-empty", "synonym-count"
].map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));

const initialParameters = new URLSearchParams(window.location.search);
const state = {
  snapshot: null,
  filter: "all",
  query: "",
  liveEtag: "",
  collectionId: initialParameters.get("book") || "all",
  chapterId: initialParameters.get("chapter") || "all",
  view: initialParameters.get("view") === "synonyms" ? "synonyms" : "cards",
  studyScopeEntries: [],
  studyQueue: [],
  studyQueueTotal: 0,
  selectedEntry: null,
  studyRefreshToken: 0
};
const FOREGROUND_REFRESH_MS = 30_000;
const MIN_REFRESH_GAP_MS = 3_000;
const TYPE_LABELS = {
  word: "单词", phrase: "短语", "phrasal-verb": "Phrasal verb", idiom: "Idiom", collocation: "Collocation",
  sentence: "句子", quote: "名言", proverb: "谚语"
};
const ATTRIBUTION_LABELS = { verified: "出处已核验", candidate: "候选出处，尚未核验", unverified: "出处未核验", disputed: "出处存在争议" };
const adminUrl = ownerAdminUrl();
const liveSnapshotUrl = publicSnapshotUrl();
const entryDetail = createEntryDetailController({
  getEntries: () => state.snapshot?.entries || [],
  contextualizeEntry: (entry) => contextualizeReadingEntry(entry, state.collectionId, state.chapterId),
  onNavigate: (entry, invoker) => openEntry(contextualizeReadingEntry(entry, state.collectionId, state.chapterId), invoker)
});
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

function tag(label, className = "") {
  const span = document.createElement("span");
  span.textContent = label;
  if (className) span.className = className;
  return span;
}

function button(label, { pressed = false, count = null, value = "" } = {}) {
  const control = document.createElement("button");
  control.type = "button";
  control.dataset.value = value;
  control.setAttribute("aria-pressed", String(pressed));
  const text = document.createElement("span");
  text.textContent = label;
  control.append(text);
  if (count !== null) {
    const total = document.createElement("small");
    total.textContent = String(count);
    control.append(total);
  }
  return control;
}

function updateCollectionUrl() {
  const url = new URL(window.location.href);
  if (state.collectionId === "all") url.searchParams.delete("book");
  else url.searchParams.set("book", state.collectionId);
  if (state.collectionId === "all" || state.chapterId === "all") url.searchParams.delete("chapter");
  else url.searchParams.set("chapter", state.chapterId);
  if (state.view === "synonyms") url.searchParams.set("view", "synonyms");
  else url.searchParams.delete("view");
  window.history.replaceState(null, "", url);
}

function restoreNavigationFocus(container, value) {
  [...container.querySelectorAll("button[data-value]")]
    .find((control) => control.dataset.value === value)
    ?.focus();
}

function renderCollectionNavigation(entries) {
  const catalog = buildCollectionCatalog(entries);
  const available = new Map(catalog.map((collection) => [collection.id, collection]));
  if (state.collectionId !== "all" && !available.has(state.collectionId)) {
    state.collectionId = "all";
    state.chapterId = "all";
    updateCollectionUrl();
  }
  const collectionButtons = [
    button("全部词本", { pressed: state.collectionId === "all", count: entries.length, value: "all" }),
    ...catalog.map((collection) => button(collection.title, {
      pressed: state.collectionId === collection.id,
      count: collection.count,
      value: collection.id
    }))
  ];
  refs.collectionTabs.replaceChildren(...collectionButtons);

  const selectedCollection = available.get(state.collectionId) || null;
  const chapters = selectedCollection?.chapters || [];
  if (chapters.length) {
    if (state.chapterId !== "all" && !chapters.some((chapter) => chapter.id === state.chapterId)) {
      state.chapterId = "all";
      updateCollectionUrl();
    }
    refs.chapterTabs.hidden = false;
    refs.chapterTabs.replaceChildren(
      button("全书", { pressed: state.chapterId === "all", count: selectedCollection.count, value: "all" }),
      ...chapters.map((chapter) => button(chapter.title, {
        pressed: state.chapterId === chapter.id,
        count: chapter.count,
        value: chapter.id
      }))
    );
  } else {
    state.chapterId = "all";
    refs.chapterTabs.hidden = true;
    refs.chapterTabs.replaceChildren();
  }
  refs.libraryHeading.textContent = state.collectionId === "all"
    ? "全部词本"
    : `${selectedCollection?.title || "词本"}${state.chapterId === "all" ? "" : ` · ${chapters.find((chapter) => chapter.id === state.chapterId)?.title || ""}`}`;
}

function renderLearningPoints(element, entry) {
  const meaning = formatMeaningForDisplay(entry) || "释义待完善";
  const context = collectionContextForEntry(entry, state.collectionId, state.chapterId);
  if (!context) {
    element.classList.remove("learning-points");
    setMultilineText(element, meaning);
    return;
  }
  element.classList.add("learning-points");
  const list = document.createElement("ul");
  for (const point of splitChineseMeaningPoints(meaning)) {
    const meaningItem = document.createElement("li");
    meaningItem.textContent = point;
    list.append(meaningItem);
  }
  if (entry.usage) {
    const usageItem = document.createElement("li");
    usageItem.textContent = entry.usage;
    list.append(usageItem);
  }
  element.replaceChildren(list);
}

function reviewDateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function setReviewButtonsDisabled(disabled) {
  refs.dialogReviewActions?.querySelectorAll("button[data-rating]").forEach((control) => { control.disabled = disabled; });
}

async function refreshStudySummary(entries = state.studyScopeEntries) {
  const token = ++state.studyRefreshToken;
  try {
    const reviewStates = await listReviewStates();
    if (token !== state.studyRefreshToken) return;
    const summary = buildStudySummary(entries, reviewStates);
    refs.dueCount.textContent = String(summary.dueCount);
    refs.studyButton.disabled = summary.totalEntries === 0 || summary.dueCount === 0;
    refs.studyButton.title = summary.dueCount
      ? `当前词本有 ${summary.dueCount} 条待学习或复习`
      : "当前词本今天已经复习完成";
  } catch {
    refs.dueCount.textContent = "—";
    refs.studyButton.disabled = true;
    refs.studyButton.title = "本机复习记录暂不可用";
  }
}

async function renderSelectedReviewState(entry) {
  if (!entry || state.selectedEntry?.id !== entry.id) return;
  setReviewButtonsDisabled(true);
  try {
    const reviewState = await getReviewState(entry.id);
    if (state.selectedEntry?.id !== entry.id) return;
    const queuePosition = state.studyQueueTotal && state.studyQueue.length
      ? `本轮 ${state.studyQueueTotal - state.studyQueue.length + 1}/${state.studyQueueTotal} · `
      : "";
    const announcedTerm = queuePosition ? `“${entry.term}” · ` : "";
    refs.dialogReviewStatus.textContent = reviewState
      ? `${queuePosition}${announcedTerm}已复习 ${reviewState.reviewCount} 次 · 下次 ${reviewDateLabel(reviewState.dueAt)}`
      : `${queuePosition}${announcedTerm}新词 · 选择下面一项记录本次学习结果。`;
    setReviewButtonsDisabled(false);
  } catch {
    refs.dialogReviewStatus.textContent = "本机复习记录暂不可用；词条内容仍可正常查看。";
  }
}

function openEntry(entry, invoker, { fromStudy = false } = {}) {
  state.selectedEntry = entry;
  if (!fromStudy) {
    state.studyQueue = [];
    state.studyQueueTotal = 0;
  }
  entryDetail.show(entry, { invoker });
  if (fromStudy) {
    refs.dialogTerm.tabIndex = -1;
    refs.dialogTerm.focus({ preventScroll: true });
  }
  void renderSelectedReviewState(entry);
}

async function saveReviewRating(entryId, rating) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getReviewState(entryId);
    const updated = applyReviewRating(entryId, current, rating);
    try {
      return await putReviewState(updated, { expected: current ?? null });
    } catch (error) {
      if (!(error instanceof ReviewStateConflictError) || attempt === 2) throw error;
    }
  }
  throw new ReviewStateConflictError();
}

function render() {
  const entries = state.snapshot?.entries || [];
  renderCollectionNavigation(entries);
  const collectionEntries = filterEntriesByCollection(entries, state.collectionId, state.chapterId)
    .map((entry) => contextualizeReadingEntry(entry, state.collectionId, state.chapterId));
  state.studyScopeEntries = collectionEntries;
  const query = normalizePublicSearchQuery(state.query);
  const queryMatches = rankExactEntryMatches(
    collectionEntries.filter((entry) => publicEntryMatchesQuery(entry, query)),
    query
  );
  const filtered = queryMatches.filter((entry) => state.filter === "all" || entry.entryType === state.filter);
  const allGroups = buildSynonymGroups(entries);
  const scopeIds = new Set(collectionEntries.map((entry) => entry.id));
  const matchesType = (entry) => state.filter === "all" || entry.entryType === state.filter;
  const visibleGroups = allGroups.filter((group) => {
    const scopedMembers = group.members.filter(({ entry }) => scopeIds.has(entry.id) && matchesType(entry)
      && (!group.id.startsWith("auto:") || sameSynonymSenseView(entry, collectionEntries.find((candidate) => candidate.id === entry.id))));
    if (!scopedMembers.length) return false;
    return !query || normalizePublicSearchQuery(`${group.title} ${group.note}`).includes(query)
      || group.members.some(({ entry }) => publicEntryMatchesQuery(entry, query));
  });
  const groupedView = state.view === "synonyms";
  refs.viewControls.querySelectorAll("button[data-view]").forEach((control) => {
    control.setAttribute("aria-pressed", String(control.dataset.view === state.view));
  });
  refs.entryGrid.hidden = groupedView;
  refs.synonymPanel.hidden = !groupedView;
  refs.synonymIntro.hidden = !groupedView;
  refs.synonymEmpty.hidden = !groupedView || visibleGroups.length > 0;
  refs.synonymCount.textContent = String(visibleGroups.length);
  renderSynonymGroups(refs.synonymPanel, visibleGroups, {
    isOutsideScope: (entry) => !scopeIds.has(entry.id),
    onOpen: (entry, invoker) => openEntry(contextualizeReadingEntry(entry, state.collectionId, state.chapterId), invoker)
  });
  const cards = filtered.map((entry) => {
    const article = document.createElement("article");
    article.className = "word-card";
    const kicker = document.createElement("div");
    kicker.className = "card-kicker";
    const context = collectionContextForEntry(entry, state.collectionId, state.chapterId);
    kicker.append(tag(TYPE_LABELS[entry.entryType] || entry.entryType), tag(entry.partOfSpeech || ""));
    if (context) kicker.append(tag(context.chapterTitle, "chapter-chip"));
    const title = document.createElement("h3");
    title.lang = "en";
    title.textContent = entry.term;
    const phonetic = document.createElement("p");
    phonetic.className = "phonetic";
    phonetic.textContent = entry.phonetic;
    const meaning = document.createElement("div");
    meaning.className = "card-meaning";
    renderLearningPoints(meaning, entry);
    const synonyms = document.createElement("p");
    synonyms.className = "card-synonyms";
    const linkedTerms = [...new Set(allGroups.filter((group) => group.members.some((member) => member.entry.id === entry.id
      && (!group.id.startsWith("auto:") || sameSynonymSenseView(member.entry, entry))))
      .flatMap((group) => group.members.filter((member) => member.entry.id !== entry.id).map((member) => member.entry.term)))];
    synonyms.hidden = linkedTerms.length === 0;
    synonyms.textContent = linkedTerms.length ? `已收录近义词：${linkedTerms.join("；")} · 点开查看辨析` : "";
    const tags = document.createElement("div");
    tags.className = "tag-list";
    const shownTags = visibleEntryTags(entry).slice(0, 3);
    if (["quote", "proverb"].includes(entry.entryType)) shownTags.unshift(ATTRIBUTION_LABELS[entry.attributionStatus]);
    tags.append(...shownTags.filter(Boolean).map((value, index) => tag(value, index === 0 && ["quote", "proverb"].includes(entry.entryType) ? `attribution-chip ${entry.attributionStatus}` : "")));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card-open";
    button.setAttribute("aria-label", `查看 ${entry.term} 的完整词条`);
    button.addEventListener("click", () => openEntry(entry, button));
    article.append(kicker, title, phonetic, meaning, synonyms, tags, button);
    return article;
  });
  refs.entryGrid.replaceChildren(...cards);
  refs.entryGrid.setAttribute("aria-busy", "false");
  refs.entryCount.textContent = String(collectionEntries.length);
  const searchMiss = Boolean(query) && queryMatches.length === 0;
  refs.searchEmpty.hidden = groupedView || !searchMiss;
  if (searchMiss) {
    const displayQuery = state.query.replace(/\s+/g, " ").trim().slice(0, 120);
    refs.searchEmptyTitle.textContent = `这里只搜索已发布词库；${displayQuery} 尚未发布。`;
  }
  refs.emptyMessage.hidden = groupedView || filtered.length > 0 || searchMiss || collectionEntries.length === 0;
  void refreshStudySummary(collectionEntries);
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
      const headers = { Accept: "application/json" };
      if (candidate.source === "live" && state.liveEtag) headers["If-None-Match"] = state.liveEtag;
      const response = await fetch(url, { cache: "no-cache", headers });
      if (response.status === 304 && candidate.source === "live" && state.snapshot) {
        return { snapshot: state.snapshot, response, source: candidate.source };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (candidate.source === "live") state.liveEtag = response.headers.get("etag") || "";
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
        ? `更新于 ${new Date(snapshot.exportedAt).toLocaleDateString("zh-CN")}`
        : `更新于 ${new Date(snapshot.exportedAt).toLocaleDateString("zh-CN")} · 备用快照`;
      return;
    }
    state.snapshot = snapshot;
    await putPublicCache(snapshot, "", response.url, { etag: response.headers.get("etag") || "" });
    refs.dataStatus.textContent = source === "live"
      ? `更新于 ${new Date(snapshot.exportedAt).toLocaleDateString("zh-CN")}`
      : `更新于 ${new Date(snapshot.exportedAt).toLocaleDateString("zh-CN")} · 备用快照`;
    refs.exportPublic.disabled = false;
    render();
    if (state.selectedEntry) {
      state.selectedEntry = entryDetail.refresh();
      if (state.selectedEntry) void renderSelectedReviewState(state.selectedEntry);
    }
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
      state.liveEtag = cache.etag || "";
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
refs.collectionTabs.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-value]");
  if (!control) return;
  state.collectionId = control.dataset.value || "all";
  state.chapterId = "all";
  updateCollectionUrl();
  render();
  restoreNavigationFocus(refs.collectionTabs, state.collectionId);
});
refs.chapterTabs.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-value]");
  if (!control) return;
  state.chapterId = control.dataset.value || "all";
  updateCollectionUrl();
  render();
  restoreNavigationFocus(refs.chapterTabs, state.chapterId);
});
refs.librarySearch.addEventListener("input", () => { state.query = refs.librarySearch.value; render(); });
refs.viewControls.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-view]");
  if (!control) return;
  state.view = control.dataset.view === "synonyms" ? "synonyms" : "cards";
  updateCollectionUrl();
  render();
});
refs.retryLoad.addEventListener("click", () => { void loadWordbook({ force: true }); });
refs.studyButton.addEventListener("click", async () => {
  try {
    const reviewStates = await listReviewStates();
    state.studyQueue = buildDueQueue(state.studyScopeEntries, reviewStates);
    state.studyQueueTotal = state.studyQueue.length;
    if (!state.studyQueue.length) {
      await refreshStudySummary();
      return;
    }
    openEntry(state.studyQueue[0].entry, refs.studyButton, { fromStudy: true });
  } catch {
    refs.studyButton.disabled = true;
    refs.studyButton.title = "本机复习记录暂不可用";
  }
});
refs.dialogReviewActions.addEventListener("click", async (event) => {
  const control = event.target.closest("button[data-rating]");
  const entry = state.selectedEntry;
  if (!control || !entry) return;
  setReviewButtonsDisabled(true);
  refs.dialogReviewStatus.textContent = "正在保存本次复习…";
  try {
    const updated = await saveReviewRating(entry.id, control.dataset.rating);
    const inStudyQueue = state.studyQueue[0]?.entry?.id === entry.id;
    if (inStudyQueue) state.studyQueue.shift();
    await refreshStudySummary();
    if (inStudyQueue && state.studyQueue.length) {
      openEntry(state.studyQueue[0].entry, refs.studyButton, { fromStudy: true });
      return;
    }
    if (inStudyQueue) {
      refs.dialogReviewStatus.textContent = `本轮完成 · 已记录“${control.textContent.trim()}”。`;
      state.studyQueueTotal = 0;
    } else {
      refs.dialogReviewStatus.textContent = `已记录 · 下次 ${reviewDateLabel(updated.dueAt)}`;
      setReviewButtonsDisabled(false);
    }
  } catch {
    refs.dialogReviewStatus.textContent = "这次复习没有保存成功，请重试。";
    setReviewButtonsDisabled(false);
  }
});
refs.entryDialog.addEventListener("close", () => {
  state.selectedEntry = null;
  state.studyQueue = [];
  state.studyQueueTotal = 0;
});
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
