import { REVIEW_INTERVALS, createSeedEntry } from "./data.js";
import {
  EntryConflictError,
  deleteEntry,
  getAllEntries,
  getEntryByNormalized,
  getMeta,
  importEntries,
  insertEntryIfAbsent,
  replaceEntries,
  setMeta,
  updateEntry
} from "./storage.js";
import { enrichResolved, lookupTerm, resolveSpelling } from "./services.js";
import { getSettingsState, saveSettings } from "./settings.js";
import {
  addTerm,
  createSyncDirtyTracker,
  invalidateEditingSession,
  preparePersonalEntry,
  qualityStatus
} from "./workflow.js";
import {
  buildSnapshot,
  classifyEntry,
  normalizeKey,
  parseSnapshot,
  sanitizeEntry,
  validateEntryInput
} from "./schema.js";
import {
  SyncConflictError,
  connectGitHub,
  disconnectGitHub,
  isGitHubConnected,
  isRetryableSyncError,
  readRemoteSnapshot,
  testGitHubConnection,
  validateSyncConfig,
  writeRemoteSnapshot
} from "./github-sync.js";

const refs = {
  collectionTabs: document.querySelector("#collection-tabs"),
  collectionNote: document.querySelector("#collection-note"),
  preferencesButton: document.querySelector("#preferences-button"),
  preferencesDialog: document.querySelector("#preferences-dialog"),
  preferencesClose: document.querySelector("#preferences-close"),
  preferencesForm: document.querySelector("#preferences-form"),
  preferencesTitle: document.querySelector("#preferences-title"),
  preferencesIntro: document.querySelector("#preferences-intro"),
  installButton: document.querySelector("#install-button"),
  installDialog: document.querySelector("#install-dialog"),
  heroEyebrow: document.querySelector("#hero-eyebrow"),
  pageTitle: document.querySelector("#page-title"),
  heroText: document.querySelector("#hero-text"),
  wordForm: document.querySelector("#word-form"),
  wordInput: document.querySelector("#word-input"),
  formHint: document.querySelector("#form-hint"),
  lookupPanel: document.querySelector("#lookup-panel"),
  lookupEyebrow: document.querySelector("#lookup-eyebrow"),
  lookupTitle: document.querySelector("#lookup-title"),
  lookupQuality: document.querySelector("#lookup-quality"),
  closeLookup: document.querySelector("#close-lookup"),
  correctionBanner: document.querySelector("#correction-banner"),
  originalSpelling: document.querySelector("#original-spelling"),
  correctedSpelling: document.querySelector("#corrected-spelling"),
  keepOriginal: document.querySelector("#keep-original"),
  draftForm: document.querySelector("#draft-form"),
  draftTerm: document.querySelector("#draft-term"),
  draftEntryType: document.querySelector("#draft-entry-type"),
  draftPos: document.querySelector("#draft-pos"),
  draftPhonetic: document.querySelector("#draft-phonetic"),
  draftTags: document.querySelector("#draft-tags"),
  draftMeaning: document.querySelector("#draft-meaning"),
  draftDefinition: document.querySelector("#draft-definition"),
  draftExampleEn: document.querySelector("#draft-example-en"),
  draftExampleZh: document.querySelector("#draft-example-zh"),
  draftUsage: document.querySelector("#draft-usage"),
  attributionFields: document.querySelector("#attribution-fields"),
  draftAuthor: document.querySelector("#draft-author"),
  draftSourceTitle: document.querySelector("#draft-source-title"),
  draftSourceLocator: document.querySelector("#draft-source-locator"),
  draftSourceUrl: document.querySelector("#draft-source-url"),
  draftAttributionStatus: document.querySelector("#draft-attribution-status"),
  sourceCandidates: document.querySelector("#source-candidates"),
  retryAttribution: document.querySelector("#retry-attribution"),
  lookupWarning: document.querySelector("#lookup-warning"),
  selectedCard: document.querySelector("#selected-card"),
  selectedKicker: document.querySelector("#selected-kicker"),
  selectedIndex: document.querySelector("#selected-index"),
  selectedType: document.querySelector("#selected-type"),
  selectedTerm: document.querySelector("#today-title"),
  selectedPhonetic: document.querySelector("#selected-phonetic"),
  selectedMeaning: document.querySelector("#selected-meaning"),
  selectedQuality: document.querySelector("#selected-quality"),
  selectedDefinitionBlock: document.querySelector("#selected-definition-block"),
  selectedDefinition: document.querySelector("#selected-definition"),
  selectedExampleBlock: document.querySelector("#selected-example-block"),
  selectedExampleEn: document.querySelector("#selected-example-en"),
  selectedExampleZh: document.querySelector("#selected-example-zh"),
  selectedUsage: document.querySelector("#selected-usage"),
  selectedSource: document.querySelector("#selected-source"),
  selectedTags: document.querySelector("#selected-tags"),
  soundButton: document.querySelector("#sound-button"),
  copySelected: document.querySelector("#copy-selected"),
  editSelected: document.querySelector("#edit-selected"),
  reviewSelected: document.querySelector("#review-selected"),
  deleteSelected: document.querySelector("#delete-selected"),
  libraryTitle: document.querySelector("#library-title"),
  entryCount: document.querySelector("#entry-count"),
  dueCount: document.querySelector("#due-count"),
  startReview: document.querySelector("#start-review"),
  filterGroup: document.querySelector("#filter-group"),
  librarySearch: document.querySelector("#library-search"),
  libraryList: document.querySelector("#library-list"),
  emptyGuidanceCopy: document.querySelector("#empty-guidance-copy"),
  personalFooterTools: document.querySelector("#personal-footer-tools"),
  exportButton: document.querySelector("#export-button"),
  importButton: document.querySelector("#import-button"),
  importFile: document.querySelector("#import-file"),
  syncPanel: document.querySelector("#sync-panel"),
  syncStatus: document.querySelector("#sync-status"),
  syncConnect: document.querySelector("#sync-connect"),
  syncPull: document.querySelector("#sync-pull"),
  syncPush: document.querySelector("#sync-push"),
  syncDisconnect: document.querySelector("#sync-disconnect"),
  syncDialog: document.querySelector("#sync-dialog"),
  syncForm: document.querySelector("#sync-form"),
  syncToken: document.querySelector("#sync-token"),
  syncOwner: document.querySelector("#sync-owner"),
  syncRepo: document.querySelector("#sync-repo"),
  syncBranch: document.querySelector("#sync-branch"),
  syncPath: document.querySelector("#sync-path"),
  syncAuto: document.querySelector("#sync-auto"),
  reviewDialog: document.querySelector("#review-dialog"),
  reviewTerm: document.querySelector("#review-term"),
  revealAnswer: document.querySelector("#reveal-answer"),
  reviewAnswer: document.querySelector("#review-answer"),
  reviewMeaning: document.querySelector("#review-meaning"),
  reviewExample: document.querySelector("#review-example"),
  ratingGrid: document.querySelector("#rating-grid"),
  toast: document.querySelector("#toast")
};

const requestedMode = new URLSearchParams(location.search).get("mode");
const localTestMode = new URLSearchParams(location.search).get("e2e") === "1"
  && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const syncDirtyTracker = createSyncDirtyTracker();
const state = {
  mode: requestedMode === "personal" ? "personal" : "public",
  entries: [],
  publicEntries: [],
  selectedId: null,
  filter: "all",
  search: "",
  draft: null,
  reviewQueue: [],
  currentReviewId: null,
  reviewBusy: false,
  personalReady: false,
  syncConfig: null,
  syncBusy: false,
  autoSyncTimer: null,
  syncDirty: false,
  attributionLookupId: 0,
  lookupRequestId: 0,
  saveMode: null,
  editingId: null,
  editingBaselineUpdatedAt: null,
  pendingPublicCopyId: null,
  installPrompt: null,
  toastTimer: null
};

const ATTRIBUTION_LABELS = {
  unverified: "来源未核验",
  candidate: "候选出处，未核验",
  "source-backed": "用户标记：有可靠来源支持",
  verified: "用户标记：已核对原始文本",
  disputed: "归属存在争议"
};

function isPersonal() {
  return state.mode === "personal";
}

function isDue(entry) {
  if (entry.needsAttention || !entry.meaning) return false;
  return new Date(entry.review?.dueAt || 0).getTime() <= Date.now();
}

function entryStatus(entry) {
  if (!isPersonal()) return { key: "public", label: "公开" };
  if (entry.needsAttention || !entry.meaning) return { key: "incomplete", label: "待完善" };
  const level = entry.review?.level || 0;
  if (level >= 6) return { key: "mastered", label: "已掌握" };
  if (level === 0) return { key: "new", label: "新词" };
  return { key: "learning", label: "学习中" };
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  refs.toast.textContent = message;
  refs.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    refs.toast.hidden = true;
  }, 3600);
}

function invalidateOpenEditor({ hidePanel = true } = {}) {
  const hadSession = invalidateEditingSession(state);
  if (!hadSession) return false;
  state.lookupRequestId += 1;
  state.attributionLookupId += 1;
  refs.retryAttribution.disabled = false;
  if (hidePanel) refs.lookupPanel.hidden = true;
  return true;
}

function formatCreated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function selectedEntry() {
  return state.entries.find((entry) => entry.id === state.selectedId) || state.entries[0] || null;
}

function renderSelectedSource(entry) {
  refs.selectedSource.replaceChildren();
  const hasSource = entry.author || entry.sourceTitle || entry.sourceUrl || ["quote", "proverb"].includes(entry.entryType);
  refs.selectedSource.hidden = !hasSource;
  if (!hasSource) return;
  if (!["quote", "proverb"].includes(entry.entryType)) {
    const editorial = Array.isArray(entry.tags) && entry.tags.includes("EDITORIAL");
    refs.selectedSource.append(document.createTextNode(editorial ? "核心中英文释义由本项目人工校订" : "英文补充来源"));
    if (entry.sourceUrl) {
      const link = document.createElement("a");
      link.href = entry.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = editorial ? "查看音标／词形补充来源" : "查看词典原页";
      refs.selectedSource.append(" · ", link);
    }
    return;
  }
  const label = ATTRIBUTION_LABELS[entry.attributionStatus] || ATTRIBUTION_LABELS.unverified;
  const parts = [entry.author, entry.sourceTitle, entry.sourceLocator].filter(Boolean).join(" · ");
  refs.selectedSource.append(document.createTextNode(`${label}${parts ? ` · ${parts}` : ""}`));
  if (entry.sourceUrl) {
    const link = document.createElement("a");
    link.href = entry.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = ({
      candidate: "查看候选页面",
      "source-backed": "查看支持来源",
      verified: "查看标记的原始来源",
      disputed: "查看争议来源",
      unverified: "查看所填来源"
    })[entry.attributionStatus] || "查看来源";
    refs.selectedSource.append(" · ", link);
  }
}

function renderSelected() {
  const entry = selectedEntry();
  document.body.classList.toggle("has-no-selection", !entry);
  refs.selectedCard.hidden = !entry;
  refs.copySelected.hidden = isPersonal() || !entry;
  refs.editSelected.hidden = !isPersonal() || !entry;
  refs.reviewSelected.hidden = !isPersonal() || !entry;
  refs.deleteSelected.hidden = !isPersonal() || !entry;
  if (!entry) return;
  const index = state.entries.findIndex((item) => item.id === entry.id) + 1;
  refs.selectedCard.classList.toggle("quote-card", entry.entryType === "quote" || entry.entryType === "proverb");
  refs.selectedKicker.textContent = entryStatus(entry).label.toUpperCase();
  refs.selectedIndex.textContent = String(index).padStart(2, "0");
  refs.selectedType.textContent = entry.partOfSpeech || entry.entryType || "word";
  refs.selectedTerm.textContent = entry.term;
  refs.selectedPhonetic.textContent = entry.phonetic || (entry.author
    ? (entry.attributionStatus === "verified" ? `— ${entry.author}` : `${ATTRIBUTION_LABELS[entry.attributionStatus] || "候选归属"}：${entry.author}`)
    : (["quote", "proverb"].includes(entry.entryType) ? "作者／出处尚未核验" : "暂无音标"));
  refs.selectedMeaning.textContent = entry.meaning || "中文释义尚未达到可信标准，暂时留空。";
  const status = entry.quality?.status;
  refs.selectedQuality.hidden = !status && !entry.needsAttention;
  refs.selectedQuality.className = `quality-note ${status === "machine-candidate" ? "candidate" : (status === "trusted" && !entry.needsAttention ? "" : "incomplete")}`.trim();
  refs.selectedQuality.textContent = status === "trusted" && !entry.needsAttention
    ? `可信释义${entry.quality?.source ? ` · ${entry.quality.source}` : ""}`
    : (status === "machine-candidate" ? "机器候选，尚未核验" : "待完善 · 未写入不可靠释义");
  refs.selectedDefinition.textContent = entry.definition || "";
  refs.selectedDefinitionBlock.hidden = !entry.definition;
  refs.selectedExampleEn.textContent = entry.exampleEn || "";
  refs.selectedExampleZh.textContent = entry.exampleZh || "";
  refs.selectedExampleBlock.hidden = !entry.exampleEn && !entry.exampleZh;
  refs.selectedUsage.textContent = entry.usage || "";
  refs.selectedUsage.hidden = !entry.usage;
  refs.soundButton.setAttribute("aria-label", `朗读 ${entry.term}`);
  renderSelectedSource(entry);
  refs.selectedTags.replaceChildren();
  const tags = entry.tags || [];
  refs.selectedTags.hidden = !tags.length;
  for (const tag of tags) {
    const span = document.createElement("span");
    span.textContent = tag;
    refs.selectedTags.append(span);
  }
}

function matchesFilter(entry) {
  const status = entryStatus(entry).key;
  if (["word", "phrase", "quote", "proverb"].includes(state.filter) && entry.entryType !== state.filter) return false;
  if (state.filter === "new" && status !== "new") return false;
  if (state.filter === "due" && !isDue(entry)) return false;
  if (state.filter === "mastered" && status !== "mastered") return false;
  if (state.search) {
    const haystack = `${entry.term} ${entry.meaning || ""} ${entry.author || ""} ${entry.sourceTitle || ""}`.toLowerCase();
    if (!haystack.includes(state.search)) return false;
  }
  return true;
}

function renderLibrary() {
  refs.libraryList.replaceChildren();
  const visible = state.entries.filter(matchesFilter);
  if (!visible.length) {
    const message = document.createElement("p");
    message.className = "library-empty";
    message.textContent = isPersonal() ? "这个筛选下还没有词条。" : "公开词库里暂时没有这个类型的词条。";
    refs.libraryList.append(message);
    return;
  }
  visible.forEach((entry) => {
    const article = document.createElement("article");
    article.className = "word-row";
    const button = document.createElement("button");
    button.className = "word-main";
    button.type = "button";
    button.setAttribute("aria-label", `打开 ${entry.term} 词条`);
    button.addEventListener("click", () => {
      state.selectedId = entry.id;
      renderSelected();
      refs.selectedCard?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const index = document.createElement("span");
    index.className = "word-index";
    index.textContent = String(state.entries.findIndex((item) => item.id === entry.id) + 1).padStart(3, "0");
    const copy = document.createElement("span");
    const term = document.createElement("strong");
    term.lang = "en";
    term.textContent = entry.term;
    const meaning = document.createElement("small");
    meaning.textContent = entry.meaning || "待补充中文释义";
    copy.append(term, meaning);
    button.append(index, copy);
    const statusInfo = entryStatus(entry);
    const status = document.createElement("span");
    status.className = `status ${statusInfo.key}`;
    status.textContent = isPersonal() && isDue(entry) && statusInfo.key !== "new" ? "待复习" : statusInfo.label;
    const time = document.createElement("time");
    time.dateTime = entry.updatedAt || entry.createdAt || "";
    time.textContent = formatCreated(entry.updatedAt || entry.createdAt);
    article.append(button, status, time);
    refs.libraryList.append(article);
  });
}

async function refreshEntries({ keepSelection = true } = {}) {
  const previous = keepSelection ? state.selectedId : null;
  state.entries = isPersonal() ? await getAllEntries() : state.publicEntries;
  state.selectedId = state.entries.some((entry) => entry.id === previous) ? previous : state.entries[0]?.id || null;
  refs.entryCount.textContent = String(state.entries.length);
  refs.dueCount.textContent = String(isPersonal() ? state.entries.filter(isDue).length : 0);
  renderSelected();
  renderLibrary();
}

async function loadPublicEntries() {
  try {
    const response = await fetch("data/owner-wordbook.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Public wordbook: ${response.status}`);
    state.publicEntries = parseSnapshot(await response.json(), { preserveIds: true, includeReview: false, strict: true }).entries;
  } catch {
    const fallback = sanitizeEntry(createSeedEntry(), { preserveId: true, includeReview: false });
    state.publicEntries = [{ ...fallback, id: "public-jab-at" }];
  }
}

async function ensurePersonalReady() {
  if (state.personalReady) return true;
  if (!("indexedDB" in window)) {
    showToast("当前浏览器不支持本地词库，请更换较新的浏览器。");
    return false;
  }
  try {
    state.syncConfig = await getMeta("githubSyncConfig");
    const preferencesState = await getSettingsState();
    state.saveMode = ["auto", "review"].includes(preferencesState.settings?.saveMode)
      ? preferencesState.settings.saveMode
      : null;
    state.personalReady = true;
    renderSyncState();
    if (preferencesState.invalid) {
      showToast("原入库设置无法读取，词库内容仍然安全；请重新选择入库方式。");
    }
    return true;
  } catch {
    showToast("无法打开本地词库；请检查浏览器的存储权限。");
    return false;
  }
}

function updateModeUrl() {
  const url = new URL(location.href);
  url.searchParams.set("mode", state.mode);
  history.replaceState({}, "", url);
}

function applyModeUi() {
  const personal = isPersonal();
  refs.collectionTabs.querySelectorAll("button[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  });
  refs.wordForm.hidden = !personal;
  refs.preferencesButton.hidden = !personal;
  if (!personal) refs.lookupPanel.hidden = true;
  refs.startReview.hidden = !personal;
  refs.personalFooterTools.hidden = !personal;
  refs.syncPanel.hidden = !personal;
  refs.filterGroup.querySelectorAll(".personal-filter").forEach((button) => {
    button.hidden = !personal;
  });
  if (personal) {
    refs.collectionNote.textContent = "这间小屋只属于当前浏览器；可安装到桌面，也可连接你自己的私有 GitHub 仓库。";
    refs.heroEyebrow.textContent = "Zhuo's private word cabinet";
    refs.pageTitle.innerHTML = "只管写下英文，<br><em>它会自己长成词条。</em>";
    refs.heroText.textContent = "先用本地中英词典锁定可信释义，再补充词性、音标与英文例句；短语不会被拆开，重复词不会覆盖旧记录。";
    refs.libraryTitle.textContent = "我的秘密词库";
    refs.emptyGuidanceCopy.textContent = "写下第一个英文。可靠结果会按你的入库设置保存，不确定内容宁可留空，也不会胡乱翻译。";
    refs.preferencesButton.textContent = state.saveMode === "auto" ? "直接入库" : (state.saveMode === "review" ? "逐条确认" : "设置入库方式");
  } else {
    refs.collectionNote.textContent = "公开浏览、搜索和朗读；复制后即可加入你自己的复习计划。";
    refs.heroEyebrow.textContent = "A public collection";
    refs.pageTitle.innerHTML = "看看他的词，<br><em>再建立你自己的。</em>";
    refs.heroText.textContent = "公开词库可以浏览、搜索与朗读；收藏后会生成一份只属于你的本地词库。";
    refs.libraryTitle.textContent = "卓同学的公开收藏";
    refs.emptyGuidanceCopy.textContent = "浏览公开词库，喜欢的词条可以一键复制到你自己的词库。";
  }
}

async function setMode(mode, { updateUrl = true, keepSelection = false } = {}) {
  const nextMode = mode === "personal" ? "personal" : "public";
  if (nextMode === "personal" && !(await ensurePersonalReady())) return;
  if (nextMode !== state.mode) invalidateOpenEditor();
  state.mode = nextMode;
  state.filter = "all";
  refs.filterGroup.querySelectorAll("button[data-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === "all"));
  });
  applyModeUi();
  if (updateUrl) updateModeUrl();
  await refreshEntries({ keepSelection });
  if (state.mode === "personal" && !state.saveMode) openPreferences({ required: true });
}

function openPreferences({ required = false } = {}) {
  refs.preferencesDialog.dataset.required = String(required);
  refs.preferencesClose.hidden = required;
  refs.preferencesTitle.textContent = required ? "新词怎样进屋？" : "更改入库方式";
  refs.preferencesIntro.textContent = required
    ? "先选一次，以后可以随时在右上角更改。"
    : "改动只影响以后输入的新词，不会重写已有词条。";
  const selected = refs.preferencesForm.querySelector(`input[value="${state.saveMode || "auto"}"]`);
  if (selected) selected.checked = true;
  if (!refs.preferencesDialog.open) refs.preferencesDialog.showModal();
  window.setTimeout(() => refs.preferencesForm.querySelector("input:checked")?.focus(), 0);
}

refs.preferencesButton.addEventListener("click", () => openPreferences());
refs.preferencesDialog.addEventListener("cancel", (event) => {
  if (!state.saveMode || refs.preferencesDialog.dataset.required === "true") event.preventDefault();
});
refs.preferencesForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveMode = new FormData(refs.preferencesForm).get("saveMode");
  if (!["auto", "review"].includes(saveMode)) return;
  try {
    await saveSettings(saveMode);
    state.saveMode = saveMode;
    refs.preferencesDialog.close();
    applyModeUi();
    refs.formHint.textContent = saveMode === "auto"
      ? "已选择直接入库：不会逐条确认；不可靠释义将留空并标记待完善。"
      : "已选择逐条确认：每次整理后都可以检查和编辑。";
    showToast(saveMode === "auto" ? "新词将直接加入；不可靠内容会留空。" : "新词会在保存前请你确认。");
    const pendingCopy = state.publicEntries.find((entry) => entry.id === state.pendingPublicCopyId);
    state.pendingPublicCopyId = null;
    if (pendingCopy) {
      try {
        await copyPublicEntryToPersonal(pendingCopy);
      } catch (error) {
        showToast(`入库方式已保存，但收藏失败：${error.message || "请稍后重试"}`);
      }
    } else refs.wordInput.focus();
  } catch {
    showToast("入库设置保存失败，请检查浏览器存储权限。");
  }
});

refs.collectionTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (button) setMode(button.dataset.mode);
});

function renderAttributionCandidates(candidates = []) {
  refs.sourceCandidates.replaceChildren();
  for (const candidate of candidates) {
    const item = document.createElement("span");
    item.className = "source-candidate";
    const link = document.createElement("a");
    link.href = candidate.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `候选：${candidate.title}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "采用";
    button.setAttribute("aria-label", `采用 Wikiquote 候选：${candidate.title}`);
    button.addEventListener("click", () => {
      refs.draftSourceTitle.value = `Wikiquote: ${candidate.title}`;
      refs.draftSourceUrl.value = candidate.url;
      refs.draftAttributionStatus.value = "candidate";
      refs.lookupWarning.textContent = "已填入候选页面；这不等于已确认作者，请继续核对原始文本。";
    });
    item.append(link, button);
    refs.sourceCandidates.append(item);
  }
}

function updateAttributionVisibility() {
  refs.attributionFields.hidden = !["quote", "proverb"].includes(refs.draftEntryType.value);
}

function fillDraft(draft, { editing = false } = {}) {
  state.attributionLookupId += 1;
  refs.retryAttribution.disabled = false;
  state.draft = draft;
  state.editingId = editing ? draft.id : null;
  state.editingBaselineUpdatedAt = editing
    ? (typeof draft.updatedAt === "string" ? draft.updatedAt : undefined)
    : null;
  refs.lookupEyebrow.textContent = editing ? "Edit the existing entry" : "Review before saving";
  refs.lookupTitle.textContent = editing ? "编辑这张词卡" : "确认新词条";
  refs.draftTerm.value = draft.term || "";
  refs.draftEntryType.value = draft.entryType || classifyEntry(draft.term || "");
  refs.draftPos.value = draft.partOfSpeech || "";
  refs.draftPhonetic.value = draft.phonetic || "";
  refs.draftTags.value = (draft.tags || []).join("，");
  refs.draftMeaning.value = draft.meaning || "";
  refs.draftDefinition.value = draft.definition || "";
  refs.draftExampleEn.value = draft.exampleEn || "";
  refs.draftExampleZh.value = draft.exampleZh || "";
  refs.draftUsage.value = draft.usage || "";
  refs.draftAuthor.value = draft.author || "";
  refs.draftSourceTitle.value = draft.sourceTitle || "";
  refs.draftSourceLocator.value = draft.sourceLocator || "";
  refs.draftSourceUrl.value = draft.sourceUrl || "";
  refs.draftAttributionStatus.value = draft.attributionStatus || "unverified";
  refs.lookupWarning.textContent = (draft.warnings || []).join(" ");
  const quality = qualityStatus(draft);
  refs.lookupQuality.hidden = false;
  refs.lookupQuality.className = `quality-note lookup-quality ${quality === "machine-candidate" ? "candidate" : (quality === "trusted" ? "" : "incomplete")}`.trim();
  refs.lookupQuality.textContent = quality === "trusted"
    ? `可信释义${draft.quality?.source ? ` · ${draft.quality.source}` : ""}`
    : (quality === "machine-candidate" ? "机器翻译或出处候选，保存前请核对" : "待完善：没有达到可信自动释义标准");
  renderAttributionCandidates(draft.attributionCandidates);
  updateAttributionVisibility();
  const corrected = draft.correction?.status === "autocorrected" && draft.correction.original !== draft.correction.chosen;
  refs.correctionBanner.hidden = !corrected;
  if (corrected) {
    refs.originalSpelling.textContent = draft.correction.original;
    refs.correctedSpelling.textContent = draft.correction.chosen;
  }
  refs.lookupPanel.hidden = false;
  refs.lookupPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => refs.lookupTitle.focus({ preventScroll: true }), 120);
}

async function runLookup(value, options = {}) {
  if (!isPersonal()) await setMode("personal");
  if (!state.saveMode) {
    openPreferences({ required: true });
    return;
  }
  const requestId = ++state.lookupRequestId;
  state.attributionLookupId += 1;
  refs.retryAttribution.disabled = false;
  const button = refs.wordForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "正在整理…";
  refs.formHint.textContent = "正在先查重复与本地中英词典，再按需补充英文词典…";
  try {
    const result = await addTerm({
      rawInput: value,
      saveMode: state.saveMode,
      findExisting: getEntryByNormalized,
      resolveSpelling,
      enrichResolved,
      lookupTerm,
      insertEntry: insertEntryIfAbsent,
      skipCorrection: Boolean(options.skipCorrection),
      forceEntryType: options.forceEntryType || ""
    });
    if (requestId !== state.lookupRequestId) return;
    if (result.status === "duplicate") {
      state.selectedId = result.entry.id;
      await refreshEntries();
      refs.lookupPanel.hidden = true;
      refs.wordInput.value = "";
      refs.formHint.textContent = `“${result.entry.term}” 已经住在词库里：没有重复加入，也没有覆盖原释义。`;
      showToast(`“${result.entry.term}” 已存在，没有重复加入。`);
      refs.selectedCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (result.status === "review") {
      fillDraft(result.draft);
      refs.formHint.textContent = result.draft.correction?.status === "autocorrected"
        ? `已更正：${result.draft.correction.original} → ${result.draft.correction.chosen}；请检查后保存。`
        : `“${result.draft.term}” 已整理，请检查后保存。`;
      return;
    }
    state.selectedId = result.entry.id;
    await refreshEntries();
    refs.lookupPanel.hidden = true;
    refs.wordInput.value = "";
    const incomplete = result.entry.needsAttention || !result.entry.meaning;
    const wasCorrected = result.entry.correction?.status === "autocorrected"
      && result.entry.correction.original !== result.entry.correction.chosen;
    const correctionCopy = wasCorrected
      ? `已纠正 ${result.entry.correction.original} → ${result.entry.correction.chosen}；`
      : "";
    refs.formHint.textContent = incomplete
      ? `${correctionCopy}已加入 “${result.entry.term}”，但没有写入不可靠中文；已标记待完善。`
      : `${correctionCopy}已准确整理并加入 “${result.entry.term}”。继续输入下一条英文。`;
    showToast(incomplete
      ? `${wasCorrected ? "拼写已纠正；" : ""}“${result.entry.term}” 已加入，释义待完善。`
      : `${wasCorrected ? "拼写已纠正 · " : "已加入 “"}${result.entry.term}${wasCorrected ? " 已加入" : "”"}`);
    scheduleAutoSync();
  } catch (error) {
    if (requestId === state.lookupRequestId) refs.formHint.textContent = error.message || "暂时无法整理这条内容，请稍后再试。";
  } finally {
    if (requestId === state.lookupRequestId) {
      button.disabled = false;
      button.innerHTML = "自动整理 <span aria-hidden='true'>→</span>";
    }
  }
}

refs.wordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runLookup(refs.wordInput.value);
});
refs.closeLookup.addEventListener("click", () => {
  invalidateOpenEditor();
});
refs.keepOriginal.addEventListener("click", () => {
  const original = state.draft?.correction?.original;
  if (original) runLookup(original, { skipCorrection: true });
});

function updateDraftTypeMetadata(nextType) {
  const previousType = state.draft?.entryType || "";
  const previousPos = state.draft?.partOfSpeech || "";
  if (!refs.draftPos.value.trim() || refs.draftPos.value === previousPos || refs.draftPos.value === previousType) {
    refs.draftPos.value = nextType;
  }
  const typeTags = new Set(["单词", "短语", "名言", "谚语", "出处待核验"]);
  const tags = refs.draftTags.value.split(/[，,]/).map((tag) => tag.trim()).filter((tag) => tag && !typeTags.has(tag));
  tags.push(({ word: "单词", phrase: "短语", quote: "名言", proverb: "谚语" })[nextType]);
  if (["quote", "proverb"].includes(nextType)) tags.push("出处待核验");
  refs.draftTags.value = tags.join("，");
  state.draft = { ...(state.draft || {}), entryType: nextType, partOfSpeech: refs.draftPos.value, tags };
}

async function refreshAttributionLookup() {
  const entryType = refs.draftEntryType.value;
  if (!["quote", "proverb"].includes(entryType)) return;
  const term = refs.draftTerm.value.trim();
  if (!term) return;
  const requestId = ++state.attributionLookupId;
  const previous = state.draft || {};
  refs.retryAttribution.disabled = true;
  refs.lookupWarning.textContent = "正在重新搜索中文翻译和出处候选…";
  try {
    const detail = await lookupTerm(term, { skipCorrection: true, forceEntryType: entryType });
    if (requestId !== state.attributionLookupId
      || refs.draftEntryType.value !== entryType
      || refs.draftTerm.value.trim() !== term) return;
    if (!refs.draftMeaning.value.trim() || refs.draftMeaning.value === previous.meaning || refs.draftMeaning.value.startsWith("（请补充")) {
      refs.draftMeaning.value = detail.meaning;
    }
    if (!refs.draftUsage.value.trim() || refs.draftUsage.value === previous.usage) refs.draftUsage.value = detail.usage;
    if (refs.draftDefinition.value === (previous.definition || "")) refs.draftDefinition.value = "";
    if (refs.draftExampleEn.value === (previous.exampleEn || "")) refs.draftExampleEn.value = "";
    if (refs.draftExampleZh.value === (previous.exampleZh || "")) refs.draftExampleZh.value = "";
    if (refs.draftPhonetic.value === (previous.phonetic || "")) refs.draftPhonetic.value = "";
    const hasManualSource = refs.draftAuthor.value.trim() || refs.draftSourceTitle.value.trim() || refs.draftSourceUrl.value.trim();
    if (!hasManualSource && ["candidate", "unverified"].includes(refs.draftAttributionStatus.value)) {
      refs.draftAttributionStatus.value = detail.attributionStatus;
    }
    state.draft = {
      ...previous,
      entryType,
      attributionCandidates: detail.attributionCandidates,
      attributionNote: detail.attributionNote,
      attributionStatus: refs.draftAttributionStatus.value,
      retrievedAt: detail.retrievedAt,
      sources: detail.sources,
      warnings: detail.warnings
    };
    renderAttributionCandidates(detail.attributionCandidates);
    refs.lookupWarning.textContent = detail.warnings.join(" ") || "出处候选已更新；保存前仍需人工核验。";
  } catch (error) {
    if (requestId !== state.attributionLookupId
      || refs.draftEntryType.value !== entryType
      || refs.draftTerm.value.trim() !== term) return;
    refs.lookupWarning.textContent = error.message || "出处搜索暂时不可用，请稍后重试。";
  } finally {
    if (requestId === state.attributionLookupId) refs.retryAttribution.disabled = false;
  }
}

refs.draftEntryType.addEventListener("change", () => {
  const previousType = state.draft?.entryType || "";
  const nextType = refs.draftEntryType.value;
  state.attributionLookupId += 1;
  refs.retryAttribution.disabled = false;
  if (["quote", "proverb"].includes(nextType) && !["quote", "proverb"].includes(previousType)) {
    refs.draftAuthor.value = "";
    refs.draftSourceTitle.value = "";
    refs.draftSourceLocator.value = "";
    refs.draftSourceUrl.value = "";
    refs.draftAttributionStatus.value = "unverified";
    renderAttributionCandidates([]);
    state.draft = {
      ...(state.draft || {}),
      author: "",
      sourceTitle: "",
      sourceLocator: "",
      sourceUrl: "",
      attributionStatus: "unverified",
      attributionCandidates: []
    };
  }
  updateDraftTypeMetadata(nextType);
  updateAttributionVisibility();
  if (["quote", "proverb"].includes(nextType) && nextType !== previousType) {
    refreshAttributionLookup();
  }
});
refs.draftTerm.addEventListener("input", () => {
  state.attributionLookupId += 1;
  refs.retryAttribution.disabled = false;
});
refs.retryAttribution.addEventListener("click", refreshAttributionLookup);

function validatedSourceUrl(value) {
  const source = value.trim();
  if (!source) return "";
  const url = new URL(source);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("来源链接必须以 http:// 或 https:// 开头。");
  return url.href;
}

refs.draftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isPersonal()) return;
  try {
    const term = validateEntryInput(refs.draftTerm.value);
    const normalized = normalizeKey(term);
    const editingBaselineUpdatedAt = state.editingBaselineUpdatedAt;
    const existing = state.editingId
      ? state.entries.find((entry) => entry.id === state.editingId) || null
      : null;
    const now = new Date().toISOString();
    const draft = state.draft || {};
    const sourceUrl = validatedSourceUrl(refs.draftSourceUrl.value);
    if (["verified", "source-backed"].includes(refs.draftAttributionStatus.value)
      && (!refs.draftSourceTitle.value.trim() || !sourceUrl)) {
      throw new Error("标记“已核对”或“有可靠来源支持”时，请填写来源名称和链接。");
    }
    if (["verified", "source-backed"].includes(refs.draftAttributionStatus.value)
      && new URL(sourceUrl).hostname.endsWith("wikiquote.org")) {
      throw new Error("Wikiquote 只能作为出处候选；请改用原始作品或可靠来源链接后再提升核验状态。");
    }
    const meaning = refs.draftMeaning.value.trim();
    const meaningChanged = meaning !== String(draft.meaning || "").trim();
    const quality = meaning
      ? (meaningChanged || !draft.quality
          ? { status: "trusted", autoSave: false, source: "用户确认", reason: "用户在保存前确认或编辑" }
          : draft.quality)
      : { status: "incomplete", autoSave: false, source: draft.quality?.source || "", reason: "中文释义为空" };
    const candidate = {
      ...draft,
      id: existing?.id || draft.id,
      rawInput: draft.rawInput || term,
      term,
      normalized,
      headword: draft.headword || term,
      entryType: refs.draftEntryType.value,
      phonetic: refs.draftPhonetic.value,
      partOfSpeech: refs.draftPos.value,
      meaning,
      definition: refs.draftDefinition.value,
      exampleEn: refs.draftExampleEn.value,
      exampleZh: refs.draftExampleZh.value,
      usage: refs.draftUsage.value,
      author: refs.draftAuthor.value,
      sourceTitle: refs.draftSourceTitle.value,
      sourceLocator: refs.draftSourceLocator.value,
      sourceUrl,
      attributionStatus: refs.draftAttributionStatus.value,
      tags: refs.draftTags.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      quality,
      needsAttention: !meaning,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      review: existing?.review || { level: 0, dueAt: now, reviewCount: 0, lapseCount: 0, lastRating: null },
      history: existing?.history || []
    };
    const entry = preparePersonalEntry(candidate, { now, existing });
    let saved;
    let wasDuplicate = false;
    if (existing) {
      saved = await updateEntry(entry, { expectedUpdatedAt: editingBaselineUpdatedAt });
    } else {
      const inserted = await insertEntryIfAbsent(entry);
      saved = inserted.entry;
      wasDuplicate = inserted.status === "duplicate";
    }
    state.selectedId = saved.id;
    invalidateOpenEditor();
    await refreshEntries();
    refs.wordInput.value = "";
    refs.formHint.textContent = wasDuplicate
      ? `“${saved.term}” 已存在，没有覆盖原词条。`
      : (saved.needsAttention ? "已保存在本地，并标记为待完善。" : "已保存在本地。继续输入下一条英文内容。");
    showToast(wasDuplicate ? `“${saved.term}” 已存在，没有重复加入。` : (existing ? `已更新 “${saved.term}”` : `已加入 “${saved.term}”`));
    if (!wasDuplicate) scheduleAutoSync();
  } catch (error) {
    if (error instanceof EntryConflictError) {
      invalidateOpenEditor();
      await refreshEntries();
      refs.formHint.textContent = error.message;
      showToast(error.message);
      return;
    }
    refs.lookupWarning.textContent = error.message || "保存失败，请检查词条内容。";
  }
});

async function copyPublicEntryToPersonal(entry) {
  const now = new Date().toISOString();
  const copy = preparePersonalEntry({
    ...entry,
    id: undefined,
    quality: entry.quality || { status: "trusted", autoSave: false, source: "卓同学公开收藏", reason: "从公开词库收藏" },
    needsAttention: !entry.meaning,
    createdAt: now,
    updatedAt: now,
    review: { level: 0, dueAt: now, reviewCount: 0, lapseCount: 0, lastRating: null },
    history: []
  }, { now });
  const result = await insertEntryIfAbsent(copy);
  const saved = result.entry;
  await setMode("personal");
  state.selectedId = saved.id;
  await refreshEntries();
  showToast(result.status === "duplicate" ? `“${saved.term}” 已在你的词库中，没有覆盖。` : `已收藏 “${saved.term}”`);
  if (result.status === "inserted") scheduleAutoSync();
}

refs.copySelected.addEventListener("click", async () => {
  const entry = selectedEntry();
  if (!entry || !(await ensurePersonalReady())) return;
  if (!state.saveMode) {
    state.pendingPublicCopyId = entry.id;
    openPreferences({ required: true });
    return;
  }
  try {
    await copyPublicEntryToPersonal(entry);
  } catch (error) {
    showToast(`收藏失败：${error.message || "请稍后重试"}`);
  }
});

refs.filterGroup.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button || button.hidden) return;
  state.filter = button.dataset.filter;
  refs.filterGroup.querySelectorAll("button[data-filter]").forEach((item) => {
    item.setAttribute("aria-pressed", String(item === button));
  });
  renderLibrary();
});
refs.librarySearch.addEventListener("input", () => {
  state.search = refs.librarySearch.value.trim().toLowerCase();
  renderLibrary();
});
refs.soundButton.addEventListener("click", () => {
  const entry = selectedEntry();
  if (!entry || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(entry.term);
  utterance.lang = "en-US";
  utterance.rate = entry.entryType === "quote" ? .88 : .82;
  speechSynthesis.speak(utterance);
});
refs.editSelected.addEventListener("click", () => {
  if (!isPersonal()) return;
  const entry = selectedEntry();
  if (!entry) return;
  fillDraft({ ...entry, warnings: [] }, { editing: true });
});
refs.deleteSelected.addEventListener("click", async () => {
  if (!isPersonal()) return;
  const entry = selectedEntry();
  if (!entry || !window.confirm(`确定从词库中删除 “${entry.term}” 吗？`)) return;
  await deleteEntry(entry.id);
  invalidateOpenEditor();
  state.selectedId = null;
  await refreshEntries({ keepSelection: false });
  showToast(`已删除 “${entry.term}”`);
  scheduleAutoSync();
});

function daysLabel(days) {
  if (days < 1) return `${Math.round(days * 24)} 小时后`;
  return `${Math.round(days)} 天后`;
}
function ratingDelays(entry) {
  const level = entry.review?.level || 0;
  return {
    again: "10 分钟后",
    hard: level === 0 ? "6 小时后" : daysLabel(Math.max(.25, REVIEW_INTERVALS[level] / 2)),
    good: daysLabel(REVIEW_INTERVALS[Math.min(7, level + 1)] || 1),
    easy: daysLabel(REVIEW_INTERVALS[Math.min(7, level + 2)] || 3)
  };
}
function showReviewEntry(entry) {
  state.currentReviewId = entry.id;
  refs.reviewTerm.textContent = entry.term;
  refs.reviewMeaning.textContent = entry.meaning || "暂无中文释义";
  refs.reviewExample.textContent = [entry.exampleEn, entry.exampleZh].filter(Boolean).join("\n");
  refs.revealAnswer.hidden = false;
  refs.reviewAnswer.hidden = true;
  const delays = ratingDelays(entry);
  refs.ratingGrid.querySelectorAll("button[data-rating]").forEach((button) => {
    button.disabled = false;
    button.querySelector("span").textContent = delays[button.dataset.rating];
  });
}
function openReview(entries) {
  if (!isPersonal()) return;
  if (!entries.length) {
    showToast("今天没有待复习词条。");
    return;
  }
  state.reviewQueue = [...entries];
  showReviewEntry(state.reviewQueue[0]);
  if (!refs.reviewDialog.open) refs.reviewDialog.showModal();
}
refs.startReview.addEventListener("click", () => openReview(state.entries.filter(isDue)));
refs.reviewSelected.addEventListener("click", () => {
  const entry = selectedEntry();
  if (entry) openReview([entry]);
});
refs.revealAnswer.addEventListener("click", () => {
  refs.revealAnswer.hidden = true;
  refs.reviewAnswer.hidden = false;
});

function schedule(entry, rating) {
  const now = Date.now();
  const current = entry.review || { level: 0, reviewCount: 0, lapseCount: 0 };
  let level = Math.min(7, Math.max(0, Math.trunc(Number(current.level) || 0)));
  let delayMs;
  if (rating === "again") {
    level = 0;
    delayMs = 10 * 60 * 1000;
  } else if (rating === "hard") {
    const days = level === 0 ? .25 : Math.max(.25, REVIEW_INTERVALS[level] / 2);
    delayMs = days * 24 * 60 * 60 * 1000;
  } else {
    level = Math.min(7, level + (rating === "easy" ? 2 : 1));
    delayMs = (REVIEW_INTERVALS[level] || 1) * 24 * 60 * 60 * 1000;
  }
  const event = { at: new Date(now).toISOString(), rating, fromLevel: current.level || 0, toLevel: level };
  return {
    ...entry,
    updatedAt: new Date(now).toISOString(),
    review: {
      level,
      dueAt: new Date(now + delayMs).toISOString(),
      reviewCount: (current.reviewCount || 0) + 1,
      lapseCount: (current.lapseCount || 0) + (rating === "again" ? 1 : 0),
      lastRating: rating
    },
    history: [...(entry.history || []), event].slice(-60)
  };
}
refs.ratingGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-rating]");
  if (!button || state.reviewBusy || !isPersonal()) return;
  const entry = state.entries.find((item) => item.id === state.currentReviewId);
  if (!entry) return;
  state.reviewBusy = true;
  refs.ratingGrid.querySelectorAll("button[data-rating]").forEach((ratingButton) => {
    ratingButton.disabled = true;
  });
  try {
    await updateEntry(schedule(entry, button.dataset.rating), { expectedUpdatedAt: entry.updatedAt });
    state.reviewQueue.shift();
    await refreshEntries();
    if (state.reviewQueue.length) {
      const next = state.entries.find((item) => item.id === state.reviewQueue[0].id);
      if (next) showReviewEntry(next);
    } else {
      refs.reviewDialog.close();
      showToast("本轮复习完成。");
    }
    scheduleAutoSync();
  } catch (error) {
    if (error instanceof EntryConflictError) {
      await refreshEntries();
      const latest = state.entries.find((item) => item.id === state.currentReviewId);
      if (latest) showReviewEntry(latest);
    }
    showToast(`复习记录保存失败：${error.message || "请稍后重试"}`);
  } finally {
    state.reviewBusy = false;
    refs.ratingGrid.querySelectorAll("button[data-rating]").forEach((ratingButton) => {
      ratingButton.disabled = false;
    });
  }
});

refs.exportButton.addEventListener("click", () => {
  if (!isPersonal()) return;
  const payload = JSON.stringify(buildSnapshot(state.entries), null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `wordbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
});
refs.importButton.addEventListener("click", () => refs.importFile.click());
refs.importFile.addEventListener("change", async () => {
  const file = refs.importFile.files?.[0];
  if (!file || !isPersonal()) return;
  try {
    const payload = JSON.parse(await file.text());
    const snapshot = parseSnapshot(payload, { preserveIds: false, includeReview: true });
    const rawEntries = Array.isArray(payload) ? payload : payload.entries;
    const count = await importEntries(rawEntries);
    invalidateOpenEditor();
    await refreshEntries();
    showToast(`已导入或更新 ${count} 个词条${snapshot.rejectedCount ? `，跳过 ${snapshot.rejectedCount} 个无效项` : ""}。`);
    scheduleAutoSync();
  } catch (error) {
    showToast(error.message || "导入失败。");
  } finally {
    refs.importFile.value = "";
  }
});

function syncTargetKey(config) {
  return config ? `${config.owner}/${config.repo}/${config.branch}/${config.path}` : "";
}
function fillSyncForm() {
  const config = state.syncConfig || {};
  refs.syncToken.value = "";
  refs.syncOwner.value = config.owner || "";
  refs.syncRepo.value = config.repo || "";
  refs.syncBranch.value = config.branch || "main";
  refs.syncPath.value = config.path || "vocab-sync/wordbook.json";
  refs.syncAuto.checked = Boolean(config.autoSync);
}
function renderSyncState(message = "") {
  const connected = isGitHubConnected();
  refs.syncPull.disabled = !connected || state.syncBusy;
  refs.syncPush.disabled = !connected || state.syncBusy;
  refs.syncDisconnect.disabled = !connected || state.syncBusy;
  refs.syncConnect.textContent = connected ? "更改连接" : "连接 GitHub";
  if (message) refs.syncStatus.textContent = message;
  else if (connected && state.syncConfig) refs.syncStatus.textContent = `已连接 ${state.syncConfig.owner}/${state.syncConfig.repo}；令牌只保留到关闭应用。`;
  else if (state.syncConfig) refs.syncStatus.textContent = `已记住同步位置 ${state.syncConfig.owner}/${state.syncConfig.repo}，但访问令牌需要重新输入。`;
  else refs.syncStatus.textContent = "尚未连接。访问令牌不会保存到浏览器或导出文件。";
}
refs.syncConnect.addEventListener("click", () => {
  fillSyncForm();
  refs.syncDialog.showModal();
});
refs.syncForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.syncBusy = true;
  renderSyncState("正在验证仓库权限…");
  try {
    connectGitHub(refs.syncToken.value);
    const candidate = validateSyncConfig({
      owner: refs.syncOwner.value,
      repo: refs.syncRepo.value,
      branch: refs.syncBranch.value,
      path: refs.syncPath.value,
      autoSync: refs.syncAuto.checked
    });
    const tested = await testGitHubConnection(candidate);
    const sameTarget = syncTargetKey(tested) === syncTargetKey(state.syncConfig);
    state.syncConfig = {
      ...tested,
      lastSha: sameTarget ? state.syncConfig?.lastSha || "" : "",
      lastSyncedAt: sameTarget ? state.syncConfig?.lastSyncedAt || "" : ""
    };
    await setMeta("githubSyncConfig", state.syncConfig);
    const remote = await readRemoteSnapshot(state.syncConfig);
    refs.syncDialog.close();
    renderSyncState(remote.exists
      ? `已验证私有仓库和分支读取。远端已有 ${remote.snapshot.entries.length} 个词条；首次使用请先“拉取”，避免覆盖。`
      : "已验证私有仓库和分支读取。远端尚无同步文件；首次推送时会验证 Contents 写权限并创建文件。"
    );
  } catch (error) {
    disconnectGitHub();
    renderSyncState(error.message || "GitHub 连接失败。");
  } finally {
    state.syncBusy = false;
    refs.syncToken.value = "";
    renderSyncState(refs.syncStatus.textContent);
  }
});

async function pushToGitHub({ automatic = false } = {}) {
  if (!isGitHubConnected() || !state.syncConfig) return;
  if (state.syncBusy) {
    if (state.syncDirty) armAutoSync(5_000);
    return;
  }
  window.clearTimeout(state.autoSyncTimer);
  state.autoSyncTimer = null;
  state.syncBusy = true;
  const syncAttempt = syncDirtyTracker.beginAttempt();
  state.syncDirty = false;
  let succeeded = false;
  let retryableFailure = false;
  renderSyncState(automatic ? "正在自动同步到 GitHub…" : "正在推送本地快照…");
  try {
    const localEntries = await getAllEntries();
    const result = await writeRemoteSnapshot(state.syncConfig, buildSnapshot(localEntries), state.syncConfig.lastSha || "");
    state.syncConfig = { ...state.syncConfig, lastSha: result.sha, lastSyncedAt: new Date().toISOString() };
    await setMeta("githubSyncConfig", state.syncConfig);
    succeeded = true;
    renderSyncState(`已同步 ${localEntries.length} 个词条到 GitHub。`);
  } catch (error) {
    retryableFailure = isRetryableSyncError(error);
    const message = error instanceof SyncConflictError
      ? `${error.message} 本地内容没有丢失。`
      : `GitHub 同步失败：${error.message || "未知错误"}`;
    renderSyncState(message);
    if (!automatic) showToast(message);
  } finally {
    state.syncDirty = syncDirtyTracker.finishAttempt(syncAttempt, { succeeded });
    state.syncBusy = false;
    renderSyncState(refs.syncStatus.textContent);
    if (state.syncDirty && (succeeded || retryableFailure)) armAutoSync(succeeded ? 30_000 : 60_000);
  }
}
async function pullFromGitHub() {
  if (!isGitHubConnected() || !state.syncConfig || state.syncBusy) return;
  window.clearTimeout(state.autoSyncTimer);
  state.autoSyncTimer = null;
  state.syncBusy = true;
  let replaced = false;
  renderSyncState("正在读取远端词库…");
  try {
    const remote = await readRemoteSnapshot(state.syncConfig);
    if (!remote.exists) throw new Error("远端尚无同步文件，请先推送本地词库。");
    if (!window.confirm(`远端包含 ${remote.snapshot.entries.length} 个词条。拉取会完整替换当前本地词库，是否继续？`)) {
      renderSyncState("已取消拉取，本地词库没有变化。");
      return;
    }
    await replaceEntries(remote.snapshot.entries);
    invalidateOpenEditor();
    syncDirtyTracker.clear();
    state.syncDirty = false;
    replaced = true;
    state.syncConfig = { ...state.syncConfig, lastSha: remote.sha, lastSyncedAt: new Date().toISOString() };
    await setMeta("githubSyncConfig", state.syncConfig);
    await refreshEntries({ keepSelection: false });
    renderSyncState(`已从 GitHub 拉取 ${remote.snapshot.entries.length} 个词条。`);
  } catch (error) {
    renderSyncState(`拉取失败：${error.message || "未知错误"}`);
  } finally {
    state.syncBusy = false;
    renderSyncState(refs.syncStatus.textContent);
    if (!replaced && state.syncDirty) armAutoSync();
  }
}
function armAutoSync(delay = 30_000) {
  window.clearTimeout(state.autoSyncTimer);
  if (localTestMode) return;
  if (!state.syncConfig?.autoSync || !isGitHubConnected()) return;
  state.autoSyncTimer = window.setTimeout(() => {
    state.autoSyncTimer = null;
    if (!state.syncDirty) return;
    if (state.syncBusy) {
      armAutoSync(5_000);
      return;
    }
    pushToGitHub({ automatic: true });
  }, delay);
}
function scheduleAutoSync() {
  syncDirtyTracker.markDirty();
  state.syncDirty = true;
  armAutoSync();
}
refs.syncPush.addEventListener("click", () => pushToGitHub());
refs.syncPull.addEventListener("click", pullFromGitHub);
refs.syncDisconnect.addEventListener("click", () => {
  disconnectGitHub();
  window.clearTimeout(state.autoSyncTimer);
  renderSyncState("已断开。同步位置仍保存在本机，但令牌已从内存清除。");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  refs.installButton.textContent = "安装到桌面";
});
window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  refs.installButton.textContent = "已安装";
  showToast("秘密单词屋已安装，可以从桌面或开始菜单打开。");
});
refs.installButton.addEventListener("click", async () => {
  if (window.matchMedia("(display-mode: standalone)").matches) {
    showToast("你正在使用已安装的秘密单词屋。");
    return;
  }
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    return;
  }
  refs.installDialog.showModal();
});
window.addEventListener("wordbook:storage-blocked", () => {
  showToast("词库升级被另一个标签页阻塞，请关闭其他秘密单词屋页面后重试。");
});
window.addEventListener("wordbook:storage-versionchange", () => {
  showToast("词库结构已在另一个标签页更新；本页会在下一次操作时重新连接。");
});

async function registerServiceWorker() {
  if (localTestMode) return;
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    refs.installButton.title = "离线组件暂时无法注册，但网页仍可使用。";
  }
}

async function init() {
  await loadPublicEntries();
  await setMode(state.mode, { updateUrl: false, keepSelection: false });
  await registerServiceWorker();
  if (window.matchMedia("(display-mode: standalone)").matches) refs.installButton.textContent = "已安装";
  if (location.hash === "#add" && isPersonal()) refs.wordInput.focus();
}

init();
