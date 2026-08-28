import { REVIEW_INTERVALS } from "./data.js";
import {
  deleteEntry,
  ensureSeed,
  getAllEntries,
  getEntryByNormalized,
  importEntries,
  saveEntry
} from "./storage.js";
import { lookupTerm, normalizeInput, validateEnglishInput } from "./services.js";

const refs = {
  wordForm: document.querySelector("#word-form"),
  wordInput: document.querySelector("#word-input"),
  formHint: document.querySelector("#form-hint"),
  lookupPanel: document.querySelector("#lookup-panel"),
  closeLookup: document.querySelector("#close-lookup"),
  correctionBanner: document.querySelector("#correction-banner"),
  originalSpelling: document.querySelector("#original-spelling"),
  correctedSpelling: document.querySelector("#corrected-spelling"),
  keepOriginal: document.querySelector("#keep-original"),
  draftForm: document.querySelector("#draft-form"),
  draftTerm: document.querySelector("#draft-term"),
  draftPos: document.querySelector("#draft-pos"),
  draftPhonetic: document.querySelector("#draft-phonetic"),
  draftTags: document.querySelector("#draft-tags"),
  draftMeaning: document.querySelector("#draft-meaning"),
  draftDefinition: document.querySelector("#draft-definition"),
  draftExampleEn: document.querySelector("#draft-example-en"),
  draftExampleZh: document.querySelector("#draft-example-zh"),
  draftUsage: document.querySelector("#draft-usage"),
  lookupWarning: document.querySelector("#lookup-warning"),
  selectedCard: document.querySelector("#selected-card"),
  selectedKicker: document.querySelector("#selected-kicker"),
  selectedIndex: document.querySelector("#selected-index"),
  selectedType: document.querySelector("#selected-type"),
  selectedTerm: document.querySelector("#today-title"),
  selectedPhonetic: document.querySelector("#selected-phonetic"),
  selectedMeaning: document.querySelector("#selected-meaning"),
  selectedExampleEn: document.querySelector("#selected-example-en"),
  selectedExampleZh: document.querySelector("#selected-example-zh"),
  selectedUsage: document.querySelector("#selected-usage"),
  selectedTags: document.querySelector("#selected-tags"),
  soundButton: document.querySelector("#sound-button"),
  reviewSelected: document.querySelector("#review-selected"),
  deleteSelected: document.querySelector("#delete-selected"),
  entryCount: document.querySelector("#entry-count"),
  dueCount: document.querySelector("#due-count"),
  startReview: document.querySelector("#start-review"),
  filterGroup: document.querySelector("#filter-group"),
  librarySearch: document.querySelector("#library-search"),
  libraryList: document.querySelector("#library-list"),
  exportButton: document.querySelector("#export-button"),
  importButton: document.querySelector("#import-button"),
  importFile: document.querySelector("#import-file"),
  reviewDialog: document.querySelector("#review-dialog"),
  reviewTerm: document.querySelector("#review-term"),
  revealAnswer: document.querySelector("#reveal-answer"),
  reviewAnswer: document.querySelector("#review-answer"),
  reviewMeaning: document.querySelector("#review-meaning"),
  reviewExample: document.querySelector("#review-example"),
  ratingGrid: document.querySelector("#rating-grid"),
  toast: document.querySelector("#toast")
};

const state = {
  entries: [],
  selectedId: null,
  filter: "all",
  search: "",
  draft: null,
  reviewQueue: [],
  currentReviewId: null,
  reviewBusy: false,
  toastTimer: null
};

function isDue(entry) {
  return new Date(entry.review?.dueAt || 0).getTime() <= Date.now();
}

function entryStatus(entry) {
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
  }, 3200);
}

function formatCreated(value) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

function selectedEntry() {
  return state.entries.find((entry) => entry.id === state.selectedId) || state.entries[0] || null;
}

function renderSelected() {
  const entry = selectedEntry();
  refs.selectedCard.hidden = !entry;
  refs.reviewSelected.disabled = !entry;
  refs.deleteSelected.disabled = !entry;
  if (!entry) return;
  const index = state.entries.findIndex((item) => item.id === entry.id) + 1;
  refs.selectedKicker.textContent = entryStatus(entry).label.toUpperCase();
  refs.selectedIndex.textContent = String(index).padStart(2, "0");
  refs.selectedType.textContent = entry.partOfSpeech || entry.entryType || "word";
  refs.selectedTerm.textContent = entry.term;
  refs.selectedPhonetic.textContent = entry.phonetic || "暂无音标";
  refs.selectedMeaning.textContent = entry.meaning || "（请补充中文释义）";
  refs.selectedExampleEn.textContent = entry.exampleEn || "No example yet.";
  refs.selectedExampleZh.textContent = entry.exampleZh || "暂无例句翻译。";
  refs.selectedUsage.textContent = entry.usage || entry.definition || "可在下一次保存时补充用法提醒。";
  refs.soundButton.setAttribute("aria-label", `朗读 ${entry.term}`);
  refs.selectedTags.replaceChildren();
  for (const tag of entry.tags || []) {
    const span = document.createElement("span");
    span.textContent = tag;
    refs.selectedTags.append(span);
  }
}

function matchesFilter(entry) {
  const status = entryStatus(entry).key;
  if (state.filter === "new" && status !== "new") return false;
  if (state.filter === "due" && !isDue(entry)) return false;
  if (state.filter === "mastered" && status !== "mastered") return false;
  if (state.search) {
    const haystack = `${entry.term} ${entry.meaning || ""}`.toLowerCase();
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
    message.textContent = "这个筛选下还没有词条。";
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
      document.querySelector("#selected-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    status.textContent = isDue(entry) && statusInfo.key !== "new" ? "待复习" : statusInfo.label;

    const time = document.createElement("time");
    time.dateTime = entry.createdAt;
    time.textContent = formatCreated(entry.createdAt);
    article.append(button, status, time);
    refs.libraryList.append(article);
  });
}

async function refreshEntries({ keepSelection = true } = {}) {
  const previous = keepSelection ? state.selectedId : null;
  state.entries = await getAllEntries();
  state.selectedId = state.entries.some((entry) => entry.id === previous) ? previous : state.entries[0]?.id || null;
  refs.entryCount.textContent = String(state.entries.length);
  refs.dueCount.textContent = String(state.entries.filter(isDue).length);
  renderSelected();
  renderLibrary();
}

function fillDraft(draft) {
  state.draft = draft;
  refs.draftTerm.value = draft.term || "";
  refs.draftPos.value = draft.partOfSpeech || "";
  refs.draftPhonetic.value = draft.phonetic || "";
  refs.draftTags.value = (draft.tags || []).join("，");
  refs.draftMeaning.value = draft.meaning || "";
  refs.draftDefinition.value = draft.definition || "";
  refs.draftExampleEn.value = draft.exampleEn || "";
  refs.draftExampleZh.value = draft.exampleZh || "";
  refs.draftUsage.value = draft.usage || "";
  refs.lookupWarning.textContent = (draft.warnings || []).join(" ");

  const corrected = draft.correction?.status === "autocorrected" && draft.correction.original !== draft.correction.chosen;
  refs.correctionBanner.hidden = !corrected;
  if (corrected) {
    refs.originalSpelling.textContent = draft.correction.original;
    refs.correctedSpelling.textContent = draft.correction.chosen;
  }
  refs.lookupPanel.hidden = false;
  refs.lookupPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runLookup(value, options = {}) {
  const button = refs.wordForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "正在整理…";
  refs.formHint.textContent = "正在检查拼写并补充释义；只会发送当前输入的英文。";
  try {
    const draft = await lookupTerm(value, options);
    fillDraft(draft);
    refs.formHint.textContent = draft.correction?.status === "autocorrected"
      ? `已发现并更正：${draft.correction.original} → ${draft.correction.chosen}`
      : `“${draft.term}” 拼写检查完成。`;
  } catch (error) {
    refs.formHint.textContent = error.message || "暂时无法整理这个词，请稍后再试。";
  } finally {
    button.disabled = false;
    button.innerHTML = "自动整理 <span aria-hidden='true'>→</span>";
  }
}

refs.wordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runLookup(refs.wordInput.value);
});

refs.closeLookup.addEventListener("click", () => {
  refs.lookupPanel.hidden = true;
});

refs.keepOriginal.addEventListener("click", () => {
  const original = state.draft?.correction?.original;
  if (original) runLookup(original, { skipCorrection: true });
});

refs.draftForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const term = validateEnglishInput(refs.draftTerm.value);
    const normalized = normalizeInput(term);
    const existing = await getEntryByNormalized(normalized);
    const now = new Date().toISOString();
    const draft = state.draft || {};
    const entry = {
      ...draft,
      id: existing?.id || crypto.randomUUID(),
      rawInput: draft.rawInput || term,
      term,
      normalized,
      headword: draft.headword || term,
      entryType: term.includes(" ") ? "phrase" : "word",
      phonetic: refs.draftPhonetic.value.trim(),
      partOfSpeech: refs.draftPos.value.trim(),
      meaning: refs.draftMeaning.value.trim(),
      definition: refs.draftDefinition.value.trim(),
      exampleEn: refs.draftExampleEn.value.trim(),
      exampleZh: refs.draftExampleZh.value.trim(),
      usage: refs.draftUsage.value.trim(),
      tags: refs.draftTags.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      review: existing?.review || {
        level: 0,
        dueAt: now,
        reviewCount: 0,
        lapseCount: 0,
        lastRating: null
      },
      history: existing?.history || []
    };
    if (!entry.meaning) throw new Error("请至少填写中文释义。");
    await saveEntry(entry);
    state.selectedId = entry.id;
    await refreshEntries();
    refs.lookupPanel.hidden = true;
    refs.wordInput.value = "";
    refs.formHint.textContent = "已保存。继续输入下一个英文单词或短语。";
    showToast(existing ? `已更新 “${entry.term}”` : `已加入 “${entry.term}”`);
  } catch (error) {
    refs.lookupWarning.textContent = error.message || "保存失败，请检查词条内容。";
  }
});

refs.filterGroup.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  refs.filterGroup.querySelectorAll("button").forEach((item) => {
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
  utterance.rate = .82;
  speechSynthesis.speak(utterance);
});

refs.deleteSelected.addEventListener("click", async () => {
  const entry = selectedEntry();
  if (!entry) return;
  if (!window.confirm(`确定从词库中删除 “${entry.term}” 吗？`)) return;
  await deleteEntry(entry.id);
  state.selectedId = null;
  await refreshEntries({ keepSelection: false });
  showToast(`已删除 “${entry.term}”`);
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
  if (!button || state.reviewBusy) return;
  const entry = state.entries.find((item) => item.id === state.currentReviewId);
  if (!entry) return;
  state.reviewBusy = true;
  refs.ratingGrid.querySelectorAll("button[data-rating]").forEach((ratingButton) => {
    ratingButton.disabled = true;
  });
  try {
    await saveEntry(schedule(entry, button.dataset.rating));
    state.reviewQueue.shift();
    await refreshEntries();
    if (state.reviewQueue.length) {
      const next = state.entries.find((item) => item.id === state.reviewQueue[0].id);
      if (next) showReviewEntry(next);
    } else {
      refs.reviewDialog.close();
      showToast("本轮复习完成。");
    }
  } finally {
    state.reviewBusy = false;
    refs.ratingGrid.querySelectorAll("button[data-rating]").forEach((ratingButton) => {
      ratingButton.disabled = false;
    });
  }
});

refs.exportButton.addEventListener("click", () => {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: state.entries }, null, 2);
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
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const candidates = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(candidates)) throw new Error("备份格式不正确。");
    const count = await importEntries(candidates);
    await refreshEntries();
    showToast(`已导入或更新 ${count} 个词条。`);
  } catch (error) {
    showToast(error.message || "导入失败。");
  } finally {
    refs.importFile.value = "";
  }
});

async function init() {
  if (!("indexedDB" in window)) {
    refs.formHint.textContent = "当前浏览器不支持本地词库，请更换较新的浏览器。";
    return;
  }
  try {
    await ensureSeed();
    await refreshEntries({ keepSelection: false });
  } catch {
    refs.formHint.textContent = "无法打开本地词库；请检查浏览器的存储权限。";
  }
}

init();
