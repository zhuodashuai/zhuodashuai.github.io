import { getPublicCache, getReviewState, listReviewStates, putPublicCache, putReviewState, ReviewStateConflictError, subscribeStorageChanges } from "./owner-storage.js?v=82";
import { createEntryDetailController } from "./entry-detail.js?v=82";
import { ownerAdminUrl, personalWordbookUrl, publicSnapshotUrl } from "./runtime-config.js?v=77";
import { contextualizeReadingEntry, formatMeaningForDisplay, normalizePublicSearchQuery, parsePublicSnapshot, publicEntryMatchesQuery, rankExactEntryMatches } from "./wordbook-schema.js?v=82";
import { setupPwa } from "./pwa.js?v=77";
import { buildCollectionCatalog, collectionContextForEntry, filterEntriesByCollection, splitChineseMeaningPoints, visibleEntryTags } from "./collections.js?v=82";
import { applyReviewRating, buildDueQueue, buildStudySummary } from "./study.js";
import { buildSynonymGroups } from "./synonym-groups.js?v=82";
import { sameSynonymSenseView, SYNONYM_FEATURE_ENABLED } from "./synonym-evidence.js?v=77";
import { renderSynonymGroups } from "./synonym-view.js?v=82";
import { setupChapterQuiz } from "./chapter-quiz-ui.js?v=82";
import { setupPronunciationUI } from "./pronunciation-ui.js";
import { fetchPublicSnapshot, readPublicCacheWithDeadline } from "./public-snapshot.js?v=82";
import { setupLearningBackup } from "./learning-backup-ui.js?v=82";
import { createBookPassagesView } from "./book-passages-ui.js?v=82";
import { dictionarySearchUrl } from "./dictionary-navigation.js?v=80";

const refs = Object.fromEntries([
  "owner-link", "library-heading", "library-search", "filter-row", "collection-tabs", "chapter-tabs", "entry-grid", "entry-count", "data-status", "load-error",
  "load-error-message", "retry-load", "empty-message", "search-empty", "search-empty-title", "export-public", "entry-dialog", "dialog-type", "dialog-term",
  "dialog-speak", "dialog-copy", "dialog-phonetic", "dialog-meaning", "dialog-definition-section", "dialog-definition", "dialog-example-section",
  "dialog-example-en", "dialog-example-zh", "dialog-usage-section", "dialog-usage", "dialog-extra-section", "dialog-extra", "dialog-source-section", "dialog-source-status",
  "dialog-source-link", "dialog-source-list", "dialog-tags", "dialog-review-section", "dialog-review-status", "dialog-review-actions", "study-button", "due-count",
  "install-button", "update-banner", "apply-update", "view-controls", "synonym-panel", "synonym-intro", "synonym-empty", "synonym-count",
  "compact-navigation", "book-select", "chapter-select", "chapter-previous", "chapter-next", "chapter-stepper", "study-summary", "recall-controls", "recall-reveal", "search-whole-book", "search-empty-message", "search-dictionary-link", "library-options"
].map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));

const initialParameters = new URLSearchParams(window.location.search);
const state = {
  snapshot: null,
  filter: "all",
  query: "",
  liveEtag: "",
  collectionId: initialParameters.get("book") || "all",
  chapterId: initialParameters.get("chapter") || "all",
  view: initialParameters.get("view") === "passages" ? "passages"
    : SYNONYM_FEATURE_ENABLED && initialParameters.get("view") === "synonyms" ? "synonyms" : "cards",
  studyScopeEntries: [],
  studyQueue: [],
  studyQueueTotal: 0,
  selectedEntry: null,
  studyRefreshToken: 0,
  recallMode: false,
  answerRevealed: true,
  entryViewToken: 0,
  reviewBusy: false
};
// A cached or still-propagating snapshot may not contain a newly shared chapter.
// Keep that initial intent until it appears, unless the reader navigates away.
let requestedCollectionScope = state.collectionId === "all" ? null : {
  collectionId: state.collectionId, chapterId: state.chapterId
};
const FOREGROUND_REFRESH_MS = 30_000;
if (!SYNONYM_FEATURE_ENABLED && initialParameters.get("view") === "synonyms") {
  const url = new URL(window.location.href);
  url.searchParams.delete("view");
  window.history.replaceState(null, "", url);
}
const MIN_REFRESH_GAP_MS = 3_000;
const TYPE_LABELS = {
  word: "单词", phrase: "短语", "phrasal-verb": "Phrasal verb", idiom: "Idiom", collocation: "Collocation",
  sentence: "句子", quote: "名言", proverb: "谚语"
};
const ATTRIBUTION_LABELS = { verified: "出处已核验", candidate: "候选出处，尚未核验", unverified: "出处未核验", disputed: "出处存在争议" };
const adminUrl = ownerAdminUrl();
const personalLink = document.getElementById("personal-link");
if (personalLink) personalLink.href = personalWordbookUrl();
const liveSnapshotUrl = publicSnapshotUrl();
const pronunciation = setupPronunciationUI();
const libraryAudioSettings = pronunciation.settings("library-audio-settings");
refs.libraryOptions.append(libraryAudioSettings);
// Keep the one existing live status outside the mobile-only disclosure. A
// playback failure must remain visible without expanding unrelated filters.
const libraryAudioStatus = libraryAudioSettings.querySelector("[data-audio-status]");
libraryAudioStatus.id = "library-audio-status";
refs.libraryOptions.closest(".toolbar").after(libraryAudioStatus);
const compactMedia = window.matchMedia("(max-width: 720px)");
const adjustOptions = () => { refs.libraryOptions.open = !compactMedia.matches; };
adjustOptions();
compactMedia.addEventListener("change", adjustOptions);
const entryDetail = createEntryDetailController({
  getEntries: () => state.snapshot?.entries || [],
  contextualizeEntry: (entry) => contextualizeReadingEntry(entry, state.collectionId, state.chapterId),
  onNavigate: (entry, invoker) => openEntry(contextualizeReadingEntry(entry, state.collectionId, state.chapterId), invoker)
});
const bookPassagesView = createBookPassagesView();
let loadTask = null;
let lastLoadStartedAt = 0;
let cacheChecked = false;
let navigationKey = "";
let pendingReviewSave = null;
const chapterQuiz = setupChapterQuiz({
  launchButton: document.getElementById("chapter-quiz-button"),
  dialog: document.getElementById("chapter-quiz-dialog"),
  onOpenEntry: (entry, invoker) => openEntry(contextualizeReadingEntry(entry, state.collectionId, state.chapterId), invoker),
  getScope: () => {
    if (!state.snapshot || state.collectionId === "all" || state.chapterId === "all") return null;
    const collection = buildCollectionCatalog(state.snapshot.entries).find((item) => item.id === state.collectionId);
    const chapter = collection?.chapters.find((item) => item.id === state.chapterId);
    return chapter ? {
      bookId: collection.id, bookTitle: collection.title,
      chapterId: chapter.id, chapterTitle: chapter.title,
      entries: state.studyScopeEntries
    } : null;
  }
});
const learningBackup = setupLearningBackup({ container: document.getElementById("learning-backup"), onRestored: async () => {
  await refreshStudySummary();
  if (state.selectedEntry) await renderSelectedReviewState(state.selectedEntry);
} });
document.getElementById("chapter-quiz-button")?.addEventListener("click", () => pronunciation.stop());

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
  if (["synonyms", "passages"].includes(state.view)) url.searchParams.set("view", state.view);
  else url.searchParams.delete("view");
  window.history.replaceState(null, "", url);
}

function restoreNavigationFocus(container, value) {
  [...container.querySelectorAll("button[data-value]")]
    .find((control) => control.dataset.value === value)
    ?.focus({ preventScroll: true });
}

function revealSelectedTab(container) {
  const selected = container.querySelector('[aria-pressed="true"]');
  if (!selected || !container.clientWidth) return;
  const bounds = container.getBoundingClientRect();
  const item = selected.getBoundingClientRect();
  if (item.left < bounds.left) container.scrollLeft -= bounds.left - item.left;
  else if (item.right > bounds.right) container.scrollLeft += item.right - bounds.right;
}

function navigationOption(value, label, selected) {
  const option = document.createElement("option");
  option.value = value; option.textContent = label; option.selected = selected;
  return option;
}

function renderCollectionNavigation(entries) {
  const key = `${state.snapshot?.revisionId || ""}:${state.collectionId}:${state.chapterId}`;
  if (key === navigationKey) return;
  const catalog = buildCollectionCatalog(entries);
  const available = new Map(catalog.map((collection) => [collection.id, collection]));
  if (requestedCollectionScope) {
    const requestedCollection = available.get(requestedCollectionScope.collectionId);
    if (requestedCollection && (requestedCollectionScope.chapterId === "all"
      || requestedCollection.chapters.some((chapter) => chapter.id === requestedCollectionScope.chapterId))) {
      state.collectionId = requestedCollectionScope.collectionId;
      state.chapterId = requestedCollectionScope.chapterId;
      requestedCollectionScope = null;
      updateCollectionUrl();
    }
  }
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
  refs.compactNavigation.hidden = !entries.length;
  refs.bookSelect.replaceChildren(
    navigationOption("all", `全部词本 · ${entries.length}`, state.collectionId === "all"),
    ...catalog.map((collection) => navigationOption(collection.id, `${collection.title} · ${collection.count}`, state.collectionId === collection.id))
  );
  refs.chapterStepper.hidden = !chapters.length;
  refs.chapterSelect.replaceChildren(
    navigationOption("all", `全书 · ${selectedCollection?.count || 0}`, state.chapterId === "all"),
    ...chapters.map((chapter) => navigationOption(chapter.id, `${chapter.title} · ${chapter.count}`, state.chapterId === chapter.id))
  );
  const chapterIndex = chapters.findIndex((chapter) => chapter.id === state.chapterId);
  refs.chapterPrevious.disabled = chapterIndex <= 0;
  refs.chapterNext.disabled = !chapters.length || chapterIndex === chapters.length - 1;
  refs.chapterPrevious.dataset.target = chapters[chapterIndex - 1]?.id || "";
  refs.chapterNext.dataset.target = chapters[chapterIndex + 1]?.id || "";
  navigationKey = `${state.snapshot?.revisionId || ""}:${state.collectionId}:${state.chapterId}`;
  requestAnimationFrame(() => { revealSelectedTab(refs.collectionTabs); revealSelectedTab(refs.chapterTabs); });
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
    usageItem.className = "card-context";
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
    refs.studySummary.textContent = `新词 ${summary.newCount} · 待复习 ${summary.dueReviewCount} · 已学习 ${summary.reviewedCount}/${summary.totalEntries}`;
  } catch {
    if (token !== state.studyRefreshToken) return;
    refs.dueCount.textContent = "—";
    refs.studyButton.disabled = true;
    refs.studyButton.title = "本机复习记录暂不可用";
    refs.studySummary.textContent = "本机学习记录暂不可用";
  }
}

async function renderSelectedReviewState(entry) {
  if (!entry || state.selectedEntry?.id !== entry.id) return;
  const viewToken = state.entryViewToken;
  setReviewButtonsDisabled(true);
  try {
    const reviewState = await getReviewState(entry.id);
    if (state.selectedEntry?.id !== entry.id || viewToken !== state.entryViewToken) return;
    const queuePosition = state.studyQueueTotal && state.studyQueue.length
      ? `本轮 ${state.studyQueueTotal - state.studyQueue.length + 1}/${state.studyQueueTotal} · `
      : "";
    const announcedTerm = queuePosition ? `“${entry.term}” · ` : "";
    refs.dialogReviewStatus.textContent = reviewState
      ? `${queuePosition}${announcedTerm}已复习 ${reviewState.reviewCount} 次 · 下次 ${reviewDateLabel(reviewState.dueAt)}`
      : `${queuePosition}${announcedTerm}新词 · 选择下面一项记录本次学习结果。`;
    setReviewButtonsDisabled(state.reviewBusy || (state.recallMode && !state.answerRevealed));
  } catch {
    if (state.selectedEntry?.id !== entry.id || viewToken !== state.entryViewToken) return;
    refs.dialogReviewStatus.textContent = "本机复习记录暂不可用；词条内容仍可正常查看。";
  }
}

function openEntry(entry, invoker, { fromStudy = false } = {}) {
  state.entryViewToken += 1;
  state.selectedEntry = entry;
  state.recallMode = fromStudy;
  state.answerRevealed = !fromStudy;
  refs.entryDialog.classList.toggle("recall-concealed", fromStudy);
  refs.recallControls.hidden = !fromStudy;
  refs.recallReveal.hidden = !fromStudy;
  refs.dialogCopy.disabled = fromStudy;
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
  chapterQuiz.updateScope();
  // Filter the current chapter, not the current search result. Empty categories
  // add clutter; a filter left over from another chapter must not hide its words.
  const availableTypes = new Set(collectionEntries.map((entry) => entry.entryType));
  if (state.filter !== "all" && !availableTypes.has(state.filter)) state.filter = "all";
  refs.filterRow.querySelectorAll("button[data-filter]").forEach((control) => {
    control.hidden = control.dataset.filter !== "all" && !availableTypes.has(control.dataset.filter);
    control.setAttribute("aria-pressed", String(control.dataset.filter === state.filter));
  });
  const query = normalizePublicSearchQuery(state.query);
  const queryMatches = rankExactEntryMatches(
    collectionEntries.filter((entry) => publicEntryMatchesQuery(entry, query)),
    query
  );
  const filtered = queryMatches.filter((entry) => state.filter === "all" || entry.entryType === state.filter);
  const allGroups = SYNONYM_FEATURE_ENABLED ? buildSynonymGroups(entries) : [];
  const scopeIds = new Set(collectionEntries.map((entry) => entry.id));
  const matchesType = (entry) => state.filter === "all" || entry.entryType === state.filter;
  const visibleGroups = allGroups.filter((group) => {
    const scopedMembers = group.members.filter(({ entry }) => scopeIds.has(entry.id) && matchesType(entry)
      && (!group.id.startsWith("auto:") || sameSynonymSenseView(entry, collectionEntries.find((candidate) => candidate.id === entry.id))));
    if (!scopedMembers.length) return false;
    return !query || normalizePublicSearchQuery(`${group.title} ${group.note}`).includes(query)
      || group.members.some(({ entry }) => publicEntryMatchesQuery(entry, query));
  });
  const groupedView = SYNONYM_FEATURE_ENABLED && state.view === "synonyms";
  const passagesView = state.view === "passages";
  // Reading quotations should not be covered by the chapter's floating quiz
  // launcher. updateScope above restores it when returning to vocabulary.
  if (passagesView) document.getElementById("chapter-quiz-button").hidden = true;
  const searchLabel = refs.librarySearch.closest("label");
  searchLabel.querySelector("span").textContent = passagesView ? "搜索摘句" : "搜索已收录词卡";
  searchLabel.querySelector(".field-hint").textContent = passagesView ? "搜索原句、参考译意或阅读笔记" : "搜索英文、中文或原文形式 · 查新词请用上方“中英查词”";
  refs.librarySearch.placeholder = passagesView ? "搜索当前章节或词本的摘句" : "搜索本章或词本已有的词";
  refs.viewControls.querySelectorAll("button[data-view]").forEach((control) => {
    if (control.dataset.view === "synonyms") control.hidden = !SYNONYM_FEATURE_ENABLED;
    control.setAttribute("aria-pressed", String(control.dataset.view === state.view));
  });
  refs.entryGrid.hidden = groupedView || passagesView;
  refs.filterRow.hidden = passagesView;
  void bookPassagesView.update({
    bookId: state.collectionId, chapterId: state.chapterId,
    query: state.query, visible: passagesView
  });
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
    const titleRow = document.createElement("div");
    titleRow.className = "card-title-row";
    titleRow.append(title, pronunciation.button(entry.term, entry.id));
    const phonetic = document.createElement("p");
    phonetic.className = "phonetic";
    phonetic.textContent = entry.phonetic;
    phonetic.hidden = !entry.phonetic;
    const meaning = document.createElement("div");
    meaning.className = "card-meaning";
    renderLearningPoints(meaning, entry);
    const synonyms = document.createElement("p");
    synonyms.className = "card-synonyms";
    const linkedTerms = SYNONYM_FEATURE_ENABLED ? [...new Set(allGroups.filter((group) => group.members.some((member) => member.entry.id === entry.id
      && (!group.id.startsWith("auto:") || sameSynonymSenseView(member.entry, entry))))
      .flatMap((group) => group.members.filter((member) => member.entry.id !== entry.id).map((member) => member.entry.term)))] : [];
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
    button.dataset.entryId = entry.id;
    button.dataset.entryAction = "detail";
    button.setAttribute("aria-label", `查看 ${entry.term} 的完整词条`);
    button.addEventListener("click", () => openEntry(entry, button));
    article.append(kicker, titleRow, phonetic, meaning, synonyms, tags, button);
    return article;
  });
  refs.entryGrid.replaceChildren(...cards);
  const activeAudio = pronunciation.controller.getState();
  const activeAudioEntry = entries.find((entry) => entry.id === activeAudio.activeKey);
  if (activeAudio.activeKey && (!activeAudioEntry || activeAudioEntry.term.replace(/\s+/gu, " ").trim() !== activeAudio.text)) pronunciation.stop();
  pronunciation.refresh();
  refs.entryGrid.setAttribute("aria-busy", "false");
  refs.entryCount.textContent = String(collectionEntries.length);
  const searchMiss = Boolean(query) && queryMatches.length === 0;
  refs.searchEmpty.hidden = groupedView || passagesView || !searchMiss;
  if (searchMiss) {
    refs.searchDictionaryLink.href = dictionarySearchUrl(state.query);
    const displayQuery = state.query.replace(/\s+/g, " ").trim().slice(0, 120);
    const limited = state.collectionId !== "all";
    refs.searchEmptyTitle.textContent = `${state.chapterId !== "all" ? "本章" : limited ? "本词本" : "已发布词库"}未找到“${displayQuery}”。`;
    const outside = entries.filter((entry) => !scopeIds.has(entry.id) && publicEntryMatchesQuery(entry, query)).length;
    refs.searchEmptyMessage.textContent = outside ? `其他章节或词本中找到 ${outside} 个相关词条。` : "可以检查拼写，或扩大搜索范围。";
    refs.searchWholeBook.hidden = !limited;
    refs.searchWholeBook.textContent = state.chapterId !== "all" ? "搜索全书" : "搜索全部词本";
  }
  refs.emptyMessage.hidden = groupedView || passagesView || filtered.length > 0 || searchMiss || collectionEntries.length === 0;
  void refreshStudySummary(collectionEntries);
}

async function fetchLatestSnapshot() {
  const candidates = [
    { url: liveSnapshotUrl, source: "live" },
    { url: new URL("data/owner-wordbook.json", window.location.href).href, source: "pages" }
  ];
  return fetchPublicSnapshot({ candidates, snapshot: state.snapshot, etag: state.liveEtag });
}

async function performLoad({ background = false } = {}) {
  if (!background) refs.entryGrid.setAttribute("aria-busy", "true");
  refs.loadError.hidden = true;
  if (!cacheChecked) {
    cacheChecked = true;
    await readPublicCacheWithDeadline(getPublicCache, (cached) => {
      if (cached?.snapshot && !state.snapshot) {
        state.snapshot = cached.snapshot;
        state.liveEtag = cached.sourceUrl?.startsWith(liveSnapshotUrl) ? cached.etag || "" : "";
        refs.exportPublic.disabled = false;
        refs.loadError.hidden = true;
        refs.dataStatus.textContent = navigator.onLine === false ? "离线 · 已显示本机保存的词库" : "本机词库 · 已显示保存的内容";
        render();
      }
    });
  }
  if (navigator.onLine === false && state.snapshot) {
    refs.entryGrid.setAttribute("aria-busy", "false");
    refs.dataStatus.textContent = "离线 · 已显示本机保存的词库";
    return;
  }
  try {
    const { snapshot, response, source } = await fetchLatestSnapshot();
    if (source === "live") state.liveEtag = response.headers.get("etag") || state.liveEtag;
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
    refs.dataStatus.textContent = source === "live"
      ? `更新于 ${new Date(snapshot.exportedAt).toLocaleDateString("zh-CN")}`
      : `更新于 ${new Date(snapshot.exportedAt).toLocaleDateString("zh-CN")} · 备用快照`;
    refs.exportPublic.disabled = false;
    render();
    if (state.selectedEntry) {
      state.selectedEntry = entryDetail.refresh();
      if (state.selectedEntry) void renderSelectedReviewState(state.selectedEntry);
    }
    void putPublicCache(snapshot, "", response.url, { etag: source === "live" ? state.liveEtag : "" }).catch(() => {
      if (state.snapshot?.revisionId === snapshot.revisionId) refs.dataStatus.textContent += " · 本机缓存暂不可用";
    });
  } catch (networkError) {
    if (state.snapshot) {
      refs.entryGrid.setAttribute("aria-busy", "false");
      refs.dataStatus.textContent = `自动刷新暂时失败，继续显示 ${new Date(state.snapshot.exportedAt).toLocaleString("zh-CN")} 的已验证词库。`;
      return;
    }
    {
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
  pronunciation.stop();
  state.filter = button.dataset.filter;
  refs.filterRow.querySelectorAll("button").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
  render();
});
refs.collectionTabs.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-value]");
  if (!control) return;
  pronunciation.stop();
  requestedCollectionScope = null;
  state.collectionId = control.dataset.value || "all";
  state.chapterId = "all";
  updateCollectionUrl();
  render();
  restoreNavigationFocus(refs.collectionTabs, state.collectionId);
});
refs.chapterTabs.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-value]");
  if (!control) return;
  pronunciation.stop();
  requestedCollectionScope = null;
  state.chapterId = control.dataset.value || "all";
  updateCollectionUrl();
  render();
  restoreNavigationFocus(refs.chapterTabs, state.chapterId);
});
refs.bookSelect.addEventListener("change", () => {
  pronunciation.stop(); requestedCollectionScope = null;
  state.collectionId = refs.bookSelect.value; state.chapterId = "all";
  updateCollectionUrl(); render();
});
function selectChapter(chapterId) {
  if (!chapterId) return;
  pronunciation.stop(); requestedCollectionScope = null;
  state.chapterId = chapterId;
  updateCollectionUrl(); render();
}
refs.chapterSelect.addEventListener("change", () => selectChapter(refs.chapterSelect.value));
refs.chapterPrevious.addEventListener("click", () => selectChapter(refs.chapterPrevious.dataset.target));
refs.chapterNext.addEventListener("click", () => selectChapter(refs.chapterNext.dataset.target));
refs.searchWholeBook.addEventListener("click", () => {
  pronunciation.stop(); requestedCollectionScope = null;
  if (state.chapterId !== "all") state.chapterId = "all";
  else state.collectionId = "all";
  state.filter = "all";
  refs.filterRow.querySelectorAll("button").forEach((control) => control.setAttribute("aria-pressed", String(control.dataset.filter === "all")));
  updateCollectionUrl(); render();
  refs.librarySearch.focus({ preventScroll: true });
});
refs.recallReveal.addEventListener("click", () => {
  if (!state.selectedEntry || !state.recallMode) return;
  state.answerRevealed = true;
  refs.entryDialog.classList.remove("recall-concealed");
  refs.recallControls.hidden = true;
  refs.dialogCopy.disabled = false;
  void renderSelectedReviewState(state.selectedEntry);
  // The reveal button is now hidden. Hand keyboard and screen-reader focus
  // to the answer rather than leaving it on an invisible control.
  refs.dialogMeaning.tabIndex = -1;
  refs.dialogMeaning.focus({ preventScroll: true });
});
refs.librarySearch.addEventListener("input", () => { pronunciation.stop(); state.query = refs.librarySearch.value; render(); });
refs.viewControls.addEventListener("click", (event) => {
  const control = event.target.closest("button[data-view]");
  if (!control) return;
  pronunciation.stop();
  state.view = control.dataset.view === "passages" ? "passages"
    : SYNONYM_FEATURE_ENABLED && control.dataset.view === "synonyms" ? "synonyms" : "cards";
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
  if (!control || !entry || state.reviewBusy || (state.recallMode && !state.answerRevealed)) return;
  const viewToken = state.entryViewToken;
  state.reviewBusy = true;
  setReviewButtonsDisabled(true);
  refs.dialogReviewStatus.textContent = "正在保存本次复习…";
  try {
    pendingReviewSave = saveReviewRating(entry.id, control.dataset.rating);
    const updated = await pendingReviewSave;
    if (viewToken !== state.entryViewToken) { await refreshStudySummary(); return; }
    const inStudyQueue = state.studyQueue[0]?.entry?.id === entry.id;
    if (inStudyQueue) state.studyQueue.shift();
    await refreshStudySummary();
    if (viewToken !== state.entryViewToken) return;
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
    if (viewToken !== state.entryViewToken) return;
    refs.dialogReviewStatus.textContent = "这次复习没有保存成功，请重试。";
    setReviewButtonsDisabled(false);
  } finally {
    pendingReviewSave = null;
    state.reviewBusy = false;
    if (viewToken !== state.entryViewToken && state.selectedEntry) void renderSelectedReviewState(state.selectedEntry);
  }
});
refs.entryDialog.addEventListener("close", () => {
  if (refs.entryDialog.open) return;
  state.selectedEntry = null;
  state.entryViewToken += 1;
  state.recallMode = false;
  state.answerRevealed = true;
  refs.entryDialog.classList.remove("recall-concealed");
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
setupPwa({ installButton: refs.installButton, updateBanner: refs.updateBanner, applyUpdateButton: refs.applyUpdate, autoApplyUpdate: true, beforeApplyUpdate: async () => {
  await chapterQuiz.flushPendingSave();
  await learningBackup.flushPendingSave();
  if (pendingReviewSave) await pendingReviewSave;
} });
const refreshWhileVisible = () => {
  if (document.visibilityState === "hidden") return;
  void refreshStudySummary();
  if (navigator.onLine === false) return;
  void loadWordbook({ background: true });
};
window.addEventListener("focus", refreshWhileVisible);
document.addEventListener("visibilitychange", refreshWhileVisible);
window.addEventListener("online", () => { void refreshStudySummary(); void loadWordbook({ background: Boolean(state.snapshot), force: true }); });
subscribeStorageChanges((change) => {
  if (change?.stores?.includes("reviewStates")) {
    void refreshStudySummary();
    if (state.selectedEntry && !state.reviewBusy) void renderSelectedReviewState(state.selectedEntry);
  }
});
window.setInterval(refreshWhileVisible, FOREGROUND_REFRESH_MS);
void loadWordbook({ force: true });
