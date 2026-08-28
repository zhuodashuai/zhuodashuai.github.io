import { getHealth, getOwnerWordbook, getSession, logout, organizeWithAi, ownerLoginUrl, OwnerApiError, publishMutation } from "./owner-api.js";
import {
  claimNextOperation,
  completeOperation,
  deleteDraft,
  enqueuePublish,
  getDraft,
  getPublicCache,
  getQuarantineCount,
  importDrafts,
  listDrafts,
  listOutbox,
  markOperation,
  putPublicCache,
  reconcileCommittedOperations,
  requireReviewForStoredOperations,
  saveDraft,
  subscribeStorageChanges
} from "./owner-storage.js";
import { ENTRY_TYPES, createBlankEntry, findDuplicate, needsAiCompletion, normalizeEnglish, parsePublicSnapshot, safeHttpsUrl, validateEnglishInput, validatePublicEntry } from "./wordbook-schema.js";
import { classifySyncFailure, mergeAiCandidate, nextRetryAt, rebaseOperation } from "./sync-logic.js";
import { setupPwa } from "./pwa.js";

const ids = [
  "auth-gate", "auth-message", "login-link", "owner-workspace", "logout-button", "network-chip", "owner-avatar",
  "owner-identity-text", "sync-dot", "sync-label", "sync-detail", "capture-form", "capture-input", "organize-button",
  "manual-button", "ai-service-status", "capture-status", "draft-list", "retry-queue", "export-backup", "import-backup", "import-file",
  "editor-empty", "entry-form", "editor-kicker", "editor-title", "draft-state", "draft-completion-notice", "draft-completion-message",
  "complete-draft", "correction-card", "correction-original",
  "correction-suggestion", "accept-suggestion", "keep-original", "manual-correction", "field-original-input", "field-term",
  "field-standard-form", "field-entry-type", "field-part-of-speech", "field-phonetic", "field-meaning", "field-definition",
  "field-example-en", "field-example-zh", "field-usage", "field-register", "field-collocations", "field-confused",
  "field-forms", "field-tags", "sense-list", "attribution-fieldset", "field-author", "field-source-title",
  "field-source-work", "field-source-date", "field-attribution-status", "field-source-url", "field-attribution-note",
  "source-candidates", "editor-error", "save-local", "publish-button", "discard-draft", "refresh-remote", "owner-entry-count",
  "owner-search", "owner-entry-list", "conflict-dialog", "conflict-message", "conflict-fields", "conflict-use-merged",
  "conflict-use-remote", "conflict-close", "reorganize-current", "install-button", "update-banner", "apply-update"
];
const refs = Object.fromEntries(ids.map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));
const state = {
  session: null,
  csrfToken: "",
  remoteSha: "",
  snapshot: null,
  currentDraft: null,
  saveTimer: null,
  pendingSave: null,
  queueBusy: false,
  queueWakeTimer: null,
  authChecking: false,
  tabId: crypto.randomUUID(),
  conflict: null,
  ownerSearch: "",
  ownerInputHandled: false,
  organizingToken: null,
  phoneticEditRevisions: new Map()
};
const OWNER_INPUT_LIMIT = 240;
const PENDING_OWNER_INPUT_KEY = "zhuo-wordbook:pending-owner-input";
const LEXICAL_ENTRY_TYPES = new Set(["word", "phrase", "phrasal-verb", "idiom", "collocation"]);
const STATE_LABELS = {
  local_saved: "本地已保存", queued: "等待同步", pending: "等待同步", syncing: "正在同步", retry_wait: "同步失败，将安全重试",
  awaiting_auth: "等待重新登录", review_required: "等待卓本人复核", conflict: "同步冲突", failed: "同步失败", published: "已发布", cancelled: "已取消"
};

function setStatus(element, message) { element.textContent = message || ""; }
function commaList(value) { return String(value || "").split(/[,，;；\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 30); }
function value(id) { return refs[id].value.trim(); }
function setValue(id, candidate) { refs[id].value = candidate || ""; }
function isoNow() { return new Date().toISOString(); }

function setOrganizingControlsDisabled(disabled) {
  refs.organizeButton.disabled = disabled;
  refs.manualButton.disabled = disabled;
  refs.reorganizeCurrent.disabled = disabled;
  refs.completeDraft.disabled = disabled;
}

function beginOrganizing() {
  if (state.organizingToken) {
    setStatus(refs.captureStatus, "已有一项 AI 整理正在进行；没有重复提交，也不会重复建立草稿。");
    return null;
  }
  const token = crypto.randomUUID();
  state.organizingToken = token;
  setOrganizingControlsDisabled(true);
  return token;
}

function finishOrganizing(token) {
  // A delayed/stale finally must never unlock controls owned by a newer run.
  if (state.organizingToken !== token) return;
  state.organizingToken = null;
  setOrganizingControlsDisabled(false);
}

async function withOrganizingLock(task) {
  const token = beginOrganizing();
  if (!token) return false;
  try {
    await task();
    return true;
  } finally {
    finishOrganizing(token);
  }
}

function hasUsablePronunciation(value) {
  const pronunciations = String(value || "").normalize("NFKC").match(/\/([^/\r\n]+)\/|\[([^\]\r\n]+)\]/gu) || [];
  return pronunciations.some((segment) => /[A-Za-z\u0250-\u02AF]/u.test(segment));
}

function draftCompletionGaps(entry) {
  const gaps = [];
  if (!String(entry?.meaning || "").trim()) gaps.push("中文释义");
  if (!String(entry?.definition || "").trim()) gaps.push("英文释义");
  if (entry?.entryType === "word" && !hasUsablePronunciation(entry.phonetic)) gaps.push("IPA 音标");
  if (LEXICAL_ENTRY_TYPES.has(entry?.entryType) && !String(entry?.partOfSpeech || "").trim()) gaps.push("词性");
  if (LEXICAL_ENTRY_TYPES.has(entry?.entryType)
    && entry?.tags?.includes("待复核")
    && !(entry?.senses || []).length) gaps.push("可靠对齐的分义项");
  return gaps;
}

function renderDraftCompletionNotice(entry) {
  const gaps = draftCompletionGaps(entry);
  refs.draftCompletionNotice.hidden = gaps.length === 0;
  setStatus(refs.draftCompletionMessage, gaps.length
    ? `仍缺少：${gaps.join("、")}。草稿没有损坏，也没有自动发布；可以一键只补空白字段。`
    : "");
}

function editorNeedsAiCompletion(entry) {
  if (needsAiCompletion(entry)) return true;
  if (entry?.entryType !== "word") return false;
  // Older AI drafts may be otherwise complete but still lack an IPA. Judge the
  // duplicate itself rather than whichever draft happens to be open in the DOM.
  return !hasUsablePronunciation(entry.phonetic);
}

function hasVerifiedOwnerUi() {
  return state.session?.login === "zhuodashuai" && Number(state.session?.id) === 156042078 && Boolean(state.csrfToken);
}

function requireVerifiedOwnerUi() {
  if (hasVerifiedOwnerUi()) return;
  throw new OwnerApiError("当前没有通过验证的卓本人会话；管理功能保持锁定。", {
    status: 401,
    code: "authentication_required"
  });
}

function ownerInputRecordFromUrl() {
  const params = new URLSearchParams(location.search);
  if (!params.has("input")) return null;
  const input = params.get("input") || "";
  try {
    if (input.length > OWNER_INPUT_LIMIT) throw new Error(`管理链接中的英文输入不能超过 ${OWNER_INPUT_LIMIT} 个字符。`);
    return { input: validateEnglishInput(input), error: "" };
  } catch (error) {
    return { input: "", error: error.message || "管理链接中的英文输入无效。" };
  }
}

function rememberOwnerInputForLogin() {
  const record = ownerInputRecordFromUrl();
  if (!record) {
    try { sessionStorage.removeItem(PENDING_OWNER_INPUT_KEY); } catch { /* optional handoff storage */ }
    return;
  }
  try { sessionStorage.setItem(PENDING_OWNER_INPUT_KEY, JSON.stringify(record)); } catch { /* OAuth can continue without storage. */ }
}

function pendingOwnerInputRecord() {
  try {
    const raw = sessionStorage.getItem(PENDING_OWNER_INPUT_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (record?.error) return { input: "", error: String(record.error).slice(0, 300) };
    const input = String(record?.input || "");
    if (input.length > OWNER_INPUT_LIMIT) throw new Error(`管理链接中的英文输入不能超过 ${OWNER_INPUT_LIMIT} 个字符。`);
    return { input: validateEnglishInput(input), error: "" };
  } catch (error) {
    return { input: "", error: error.message || "管理链接中的英文输入无效。" };
  }
}

function clearOwnerInputHandoff() {
  try { sessionStorage.removeItem(PENDING_OWNER_INPUT_KEY); } catch { /* optional handoff storage */ }
  const url = new URL(location.href);
  if (!url.searchParams.has("input")) return;
  url.searchParams.delete("input");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function consumeOwnerInputAfterAuthentication() {
  if (state.ownerInputHandled || !hasVerifiedOwnerUi()) return;
  const record = ownerInputRecordFromUrl() || pendingOwnerInputRecord();
  state.ownerInputHandled = true;
  clearOwnerInputHandoff();
  if (!record) return;
  if (record.error) {
    setStatus(refs.captureStatus, `${record.error} 未建立草稿，也没有调用 AI。`);
    return;
  }
  refs.captureInput.value = record.input;
  setStatus(refs.captureStatus, `已从公开页带入“${record.input}”。请点击“AI 自动整理”；尚未调用 AI，也没有建立或发布草稿。`);
  window.setTimeout(() => {
    refs.captureInput.focus({ preventScroll: true });
    refs.captureInput.scrollIntoView({ block: "center" });
  }, 0);
}

function setNetworkState() {
  refs.networkChip.textContent = navigator.onLine ? "在线" : "离线 · 草稿仍可保存";
  refs.networkChip.classList.toggle("offline", !navigator.onLine);
}

function setSyncState(kind, label, detail = "") {
  refs.syncDot.parentElement.classList.toggle("synced", kind === "synced");
  refs.syncDot.parentElement.classList.toggle("error", kind === "error");
  setStatus(refs.syncLabel, label);
  setStatus(refs.syncDetail, detail);
}

async function refreshAiStatus() {
  try {
    const health = await getHealth();
    const activeProvider = health.aiEffectiveProvider || null;
    const dailyLimit = Number(health.aiDailyRequestLimit) || 20;
    if (activeProvider === "cloudflare") {
      setStatus(refs.aiServiceStatus, health.paidFallbackEnabled
        ? `当前实际使用 Cloudflare Workers AI；本站每天最多 ${dailyLimit} 次整理，但还显式启用了可能收费的备用引擎，请留意配置。`
        : `已接通两款 Cloudflare 免费方案可用模型；本站按 UTC 日最多 ${dailyLimit} 次整理。不需要 OpenAI / Claude key，也不会自动切换到付费引擎。最终是否产生 Cloudflare 超额费用仍取决于账户套餐及同账户其他用量。`);
      return;
    }
    if (activeProvider === "openai" || activeProvider === "anthropic") {
      const fallbackNote = activeProvider !== health.aiProvider ? "备用" : "";
      setStatus(refs.aiServiceStatus, `当前实际启用${fallbackNote}${activeProvider === "openai" ? " OpenAI" : " Claude"}，调用可能产生 API 费用。`);
      return;
    }
    setStatus(refs.aiServiceStatus, "AI 当前未接通；手动草稿功能仍可正常使用。");
  } catch {
    setStatus(refs.aiServiceStatus, "暂时无法读取 AI 接通状态；草稿仍会先保存在本机。");
  }
}

function showEditorError(message = "") {
  refs.editorError.hidden = !message;
  setStatus(refs.editorError, message);
}

function createDraft(entry, { mode = "create", baseEntry = null } = {}) {
  return {
    id: crypto.randomUUID(),
    scope: "owner-public",
    mode,
    entryId: entry.id,
    value: structuredClone(entry),
    base: {
      entry: baseEntry ? structuredClone(baseEntry) : null,
      entryUpdatedAt: baseEntry?.updatedAt || null,
      remoteSha: state.remoteSha || null
    },
    localState: "local_saved",
    createdAt: isoNow(),
    updatedAt: isoNow(),
    publishedAt: null,
    lastOperationId: null
  };
}

function renderCorrection(entry) {
  const suggested = entry.correction?.status === "suggested" && entry.correction.suggestion;
  refs.correctionCard.hidden = !suggested;
  setStatus(refs.correctionOriginal, entry.correction?.original || entry.originalInput);
  setStatus(refs.correctionSuggestion, entry.correction?.suggestion || "");
}

function renderSenses(entry) {
  const fragments = (entry.senses || []).map((sense, index) => {
    const section = document.createElement("section");
    section.className = "sense-item";
    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${sense.partOfSpeech || "义项"}`;
    const meaning = document.createElement("p");
    meaning.textContent = [sense.meaningZh, sense.definitionEn].filter(Boolean).join(" · ");
    section.append(title, meaning);
    for (const example of sense.examples || []) {
      const english = document.createElement("p");
      english.className = "sense-example";
      english.lang = "en";
      english.textContent = example.en;
      const chinese = document.createElement("p");
      chinese.className = "sense-example-zh";
      chinese.textContent = example.zh;
      section.append(english, chinese);
    }
    const notes = [sense.usageNotes, sense.register ? `Register: ${sense.register}` : ""].filter(Boolean).join(" · ");
    if (notes) {
      const note = document.createElement("small");
      note.className = "sense-note";
      note.textContent = notes;
      section.append(note);
    }
    return section;
  });
  if (!fragments.length) {
    const empty = document.createElement("p");
    empty.textContent = "当前没有分义项；基础释义仍可正常保存。";
    fragments.push(empty);
  }
  refs.senseList.replaceChildren(...fragments);
}

function renderSources(entry) {
  const candidates = (entry.sources || []).filter((source) => source.url);
  refs.sourceCandidates.replaceChildren(...candidates.map((source) => {
    const wrapper = document.createElement("div");
    wrapper.className = "source-candidate";
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.title || new URL(source.url).hostname} · ${source.kind}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "采用为候选来源";
    button.addEventListener("click", () => {
      refs.fieldSourceUrl.value = source.url;
      refs.fieldSourceTitle.value = source.title || "";
      refs.fieldAttributionStatus.value = "candidate";
      scheduleDraftSave();
    });
    wrapper.append(link, document.createTextNode(" "), button);
    return wrapper;
  }));
}

function fillEditor(draft, { focus = true } = {}) {
  state.currentDraft = structuredClone(draft);
  const entry = state.currentDraft.value;
  refs.editorEmpty.hidden = true;
  refs.entryForm.hidden = false;
  refs.editorKicker.textContent = draft.mode === "edit" ? "Editing published entry" : "Recoverable local draft";
  refs.editorTitle.textContent = draft.mode === "edit" ? `编辑 “${entry.term}”` : `整理 “${entry.term || entry.originalInput}”`;
  refs.draftState.textContent = STATE_LABELS[draft.localState] || draft.localState;
  setValue("fieldOriginalInput", entry.originalInput);
  setValue("fieldTerm", entry.term);
  setValue("fieldStandardForm", entry.standardForm);
  refs.fieldEntryType.value = entry.entryType;
  setValue("fieldPartOfSpeech", entry.partOfSpeech);
  setValue("fieldPhonetic", entry.phonetic);
  setValue("fieldMeaning", entry.meaning);
  setValue("fieldDefinition", entry.definition);
  setValue("fieldExampleEn", entry.exampleEn);
  setValue("fieldExampleZh", entry.exampleZh);
  setValue("fieldUsage", entry.usage);
  setValue("fieldRegister", entry.register);
  setValue("fieldCollocations", entry.collocations?.join("，"));
  setValue("fieldConfused", entry.confusedWith?.join("，"));
  setValue("fieldForms", entry.forms?.join("，"));
  setValue("fieldTags", entry.tags?.join("，"));
  setValue("fieldAuthor", entry.author);
  setValue("fieldSourceTitle", entry.sourceTitle);
  setValue("fieldSourceWork", entry.sourceWork);
  setValue("fieldSourceDate", entry.sourceDate);
  refs.fieldAttributionStatus.value = entry.attributionStatus;
  setValue("fieldSourceUrl", entry.sourceUrl);
  setValue("fieldAttributionNote", entry.attributionNote);
  refs.attributionFieldset.hidden = !["quote", "proverb"].includes(entry.entryType);
  renderCorrection(entry);
  renderSenses(entry);
  renderSources(entry);
  renderDraftCompletionNotice(entry);
  showEditorError();
  renderDrafts();
  if (focus) window.setTimeout(() => refs.editorTitle.focus({ preventScroll: true }), 0);
}

function collectEntry({ strict = false } = {}) {
  if (!state.currentDraft) throw new Error("没有打开的草稿。");
  const previous = state.currentDraft.value;
  const term = value("fieldTerm");
  const entry = {
    ...structuredClone(previous),
    originalInput: value("fieldOriginalInput"),
    term,
    normalized: normalizeEnglish(term),
    standardForm: value("fieldStandardForm") || term,
    entryType: refs.fieldEntryType.value,
    phonetic: value("fieldPhonetic"),
    partOfSpeech: value("fieldPartOfSpeech"),
    meaning: value("fieldMeaning"),
    definition: value("fieldDefinition"),
    collocations: commaList(value("fieldCollocations")),
    exampleEn: value("fieldExampleEn"),
    exampleZh: value("fieldExampleZh"),
    usage: value("fieldUsage"),
    register: value("fieldRegister"),
    confusedWith: commaList(value("fieldConfused")),
    forms: commaList(value("fieldForms")),
    tags: commaList(value("fieldTags")),
    author: value("fieldAuthor"),
    sourceTitle: value("fieldSourceTitle"),
    sourceWork: value("fieldSourceWork"),
    sourceDate: value("fieldSourceDate"),
    sourceUrl: value("fieldSourceUrl"),
    attributionStatus: refs.fieldAttributionStatus.value,
    attributionNote: value("fieldAttributionNote"),
    updatedAt: isoNow()
  };
  if (entry.correction?.status === "exact" && normalizeEnglish(entry.originalInput) !== normalizeEnglish(term)) {
    entry.correction = { ...entry.correction, status: "kept", chosen: term, source: "manual-edit" };
  }
  if (!strict) return entry;
  validateEnglishInput(term);
  if (!entry.meaning) throw new Error("公开词条发布前必须确认准确的中文释义。");
  if (LEXICAL_ENTRY_TYPES.has(entry.entryType) && entry.tags.includes("待复核") && !entry.senses.length) {
    throw new Error("这仍是中英文义项尚未可靠对齐的本地词典候选。请重新用 AI 补全；若你已人工核对，可从标签中移除“待复核”后再发布。");
  }
  if (entry.correction?.status === "suggested") throw new Error("请先选择“使用建议”“保留原文”或手动修改，不能静默采用拼写建议。");
  if (["quote", "proverb"].includes(entry.entryType) && entry.attributionStatus === "candidate"
    && !entry.sourceUrl && !(entry.sources || []).some((source) => source.kind === "candidate" && source.url)) {
    throw new Error("候选出处必须有可复查链接；否则请选择“出处未核验”并留空作者。");
  }
  if (["quote", "proverb"].includes(entry.entryType) && entry.attributionStatus === "unverified") {
    entry.author = "";
    entry.sourceTitle = "";
    entry.sourceWork = "";
    entry.sourceDate = "";
    entry.sourceUrl = "";
    entry.attributionNote ||= "出处未核验；未找到可复查的一手或权威来源。";
  }
  if (entry.sourceUrl) entry.sourceUrl = safeHttpsUrl(entry.sourceUrl);
  return validatePublicEntry(entry);
}

async function persistCurrentDraft({ announce = false } = {}) {
  requireVerifiedOwnerUi();
  if (!state.currentDraft) return null;
  window.clearTimeout(state.saveTimer);
  state.saveTimer = null;
  state.pendingSave = null;
  const snapshot = {
    ...structuredClone(state.currentDraft),
    value: collectEntry(),
    localState: state.currentDraft.localState === "conflict" ? "conflict" : "local_saved"
  };
  state.currentDraft = await saveDraft(snapshot);
  refs.draftState.textContent = STATE_LABELS[state.currentDraft.localState];
  if (announce) setStatus(refs.captureStatus, "草稿已可靠保存在当前设备。 ");
  await renderDrafts();
  return state.currentDraft;
}

async function flushPendingDraftSave() {
  const pending = state.pendingSave;
  if (!pending) return null;
  state.pendingSave = null;
  window.clearTimeout(state.saveTimer);
  state.saveTimer = null;
  const saved = await saveDraft(pending.draft);
  if (state.currentDraft?.id === saved.id) {
    if (!state.pendingSave) state.currentDraft = saved;
    else {
      state.currentDraft.contentRevision = saved.contentRevision;
      if (state.pendingSave.draft.id === saved.id) state.pendingSave.draft.contentRevision = saved.contentRevision;
    }
    refs.draftState.textContent = STATE_LABELS[state.currentDraft.localState] || state.currentDraft.localState;
  }
  await renderDrafts();
  return saved;
}

function scheduleDraftSave() {
  if (!state.currentDraft) return;
  refs.draftState.textContent = "正在保存…";
  const draft = {
    ...structuredClone(state.currentDraft),
    value: collectEntry(),
    localState: state.currentDraft.localState === "conflict" ? "conflict" : "local_saved"
  };
  const token = crypto.randomUUID();
  state.pendingSave = { token, draft };
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => {
    if (state.pendingSave?.token !== token) return;
    flushPendingDraftSave().catch((error) => showEditorError(`本地保存失败：${error.message}`));
  }, 400);
}

async function renderDrafts() {
  const [drafts, operations] = await Promise.all([listDrafts(), listOutbox({ includeCompleted: true })]);
  const operationById = new Map(operations.map((operation) => [operation.operationId, operation]));
  const items = drafts.map((draft) => {
    const operation = draft.lastOperationId ? operationById.get(draft.lastOperationId) : null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "draft-item";
    button.setAttribute("aria-current", String(state.currentDraft?.id === draft.id));
    const term = document.createElement("strong");
    term.textContent = draft.value?.term || draft.value?.originalInput || "未命名草稿";
    const updated = document.createElement("small");
    updated.textContent = `更新于 ${new Date(draft.updatedAt).toLocaleString("zh-CN")}`;
    const status = document.createElement("span");
    status.className = "state";
    status.textContent = STATE_LABELS[operation?.status || draft.localState] || operation?.status || draft.localState;
    button.append(term, updated, status);
    button.addEventListener("click", async () => {
      await flushPendingDraftSave();
      let selected = await getDraft(draft.id) || draft;
      if (operation?.status === "review_required") {
        await markOperation(operation.operationId, "cancelled", { lastError: null });
        selected = await saveDraft({ ...selected, localState: "local_saved", lastOperationId: null });
        setStatus(refs.captureStatus, "这是一份从旧页面恢复的发布任务。旧任务已取消；请由卓本人逐项复核后重新点击发布。 ");
      }
      fillEditor(selected);
    });
    return button;
  });
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "rail-note";
    empty.textContent = "还没有草稿。输入一条英文后，它会先在这里落盘。";
    items.push(empty);
  }
  refs.draftList.replaceChildren(...items);
}

function renderOwnerEntries() {
  const entries = state.snapshot?.entries || [];
  const query = state.ownerSearch.toLocaleLowerCase("zh-CN").trim();
  const shown = entries.filter((entry) => !query || [entry.term, entry.meaning, entry.tags.join(" ")].join(" ").toLocaleLowerCase("zh-CN").includes(query));
  refs.ownerEntryCount.textContent = String(entries.length);
  refs.ownerEntryList.replaceChildren(...shown.map((entry) => {
    const row = document.createElement("article");
    row.className = "owner-entry-row";
    const term = document.createElement("strong");
    term.lang = "en";
    term.textContent = entry.term;
    const meaning = document.createElement("p");
    meaning.textContent = entry.meaning;
    const actions = document.createElement("div");
    actions.className = "button-row";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "编辑";
    edit.addEventListener("click", async () => {
      await flushPendingDraftSave();
      const existingDrafts = await listDrafts();
      const existing = existingDrafts.find((draft) => draft.mode === "edit" && draft.entryId === entry.id && draft.localState !== "published");
      if (existing) fillEditor(existing);
      else {
        const draft = await saveDraft(createDraft(entry, { mode: "edit", baseEntry: entry }));
        fillEditor(draft);
      }
      document.getElementById("editor-shell").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => queueDelete(entry));
    actions.append(edit, remove);
    row.append(term, meaning, actions);
    return row;
  }));
}

async function loadRemote({ quiet = false } = {}) {
  if (!quiet) setSyncState("loading", "正在读取 GitHub", "不会覆盖本地草稿");
  try {
    const remote = await getOwnerWordbook();
    state.snapshot = parsePublicSnapshot(remote.snapshot);
    state.remoteSha = String(remote.sha || "");
    await putPublicCache(state.snapshot, state.remoteSha, "authenticated-owner-api");
    setSyncState("synced", "已连接 GitHub", `${state.snapshot.entries.length} 个公开词条 · SHA ${state.remoteSha.slice(0, 7)}`);
    renderOwnerEntries();
    return remote;
  } catch (error) {
    try {
      const cache = await getPublicCache();
      if (cache?.snapshot) {
        state.snapshot = parsePublicSnapshot(cache.snapshot);
        state.remoteSha = cache.sha || "";
        renderOwnerEntries();
      }
    } catch { /* no valid cache */ }
    setSyncState("error", "远端读取失败", error.message || "本地草稿不受影响");
    throw error;
  }
}

async function organizeDraftWithAi(draft, cleaned, { fillMissingOnly = false } = {}) {
  const aiBaseline = structuredClone(draft.value);
  fillEditor(draft);
  const phoneticRevisionAtRequest = state.phoneticEditRevisions.get(draft.id) || 0;
  let commitWindowLocked = false;
  if (!state.session) {
    setStatus(refs.captureStatus, "当前离线且无法验证会话；空白草稿已保存，联网并重新验证后再使用 AI。 ");
    return;
  }
  setStatus(refs.captureStatus, "AI 正在整理；如果服务失败，当前草稿仍然保留。 ");
  try {
    const result = await organizeWithAi(cleaned, state.csrfToken);
    if (state.currentDraft?.id !== draft.id) return;
    const warnings = Array.isArray(result.warnings) ? result.warnings.map(String) : [];
    const claimsCuratedPhonetic = warnings.some((warning) => /音标.*(?:校订|词典).*锁定/u.test(warning));
    const responsePhonetic = typeof result.entry?.phonetic === "string" ? result.entry.phonetic.normalize("NFKC") : "";
    const pronunciations = responsePhonetic.match(/\/([^/\r\n]+)\/|\[([^\]\r\n]+)\]/gu) || [];
    const hasPlausiblePhonetic = pronunciations.some((segment) => /[A-Za-z\u0250-\u02AF]/u.test(segment));
    if (claimsCuratedPhonetic && !hasPlausiblePhonetic) {
      throw new OwnerApiError("AI 响应自相矛盾：服务声称已锁定音标，但没有返回有效 IPA。当前草稿没有被 AI 覆盖，请稍后重试。", {
        status: 502,
        code: "ai_response_contract"
      });
    }
    // From this point until the merged draft has been committed, no editor
    // event may race the IndexedDB flush/get/save sequence. Edits made while
    // the provider was running have already raised their field revisions and
    // will be flushed below; the short commit window is then atomic from the
    // owner's point of view.
    refs.entryForm.inert = true;
    refs.entryForm.setAttribute("aria-busy", "true");
    commitWindowLocked = true;
    await flushPendingDraftSave();
    const latestDraft = await getDraft(draft.id);
    if (!latestDraft || state.currentDraft?.id !== draft.id) return;
    const aiEntry = validatePublicEntry(result.entry);
    const currentEntry = latestDraft.value;
    const storedDictionaryCandidate = latestDraft.base?.dictionaryCandidate;
    const dictionaryCandidateBaseline = storedDictionaryCandidate
      || (aiBaseline.tags?.includes("待复核") && !(aiBaseline.senses || []).length ? aiBaseline : null);
    const mergeResult = mergeAiCandidate(aiBaseline, currentEntry, aiEntry, { fillMissingOnly });
    const mergedEntry = mergeResult.merged;
    let preservedManualChanges = mergeResult.preservedManualChanges;
    const completingUnreviewedDictionary = Boolean(dictionaryCandidateBaseline)
      && result.reviewRequired !== true
      && aiEntry.senses.length > 0;
    if (completingUnreviewedDictionary) {
      // The raw dictionary columns were deliberately retained only so Chinese
      // was not blank; they were not declared aligned. Once a validated AI
      // result arrives, replace each untouched candidate field while preserving
      // anything Zhu edited during or before this request.
      const candidateFields = [
        "phonetic", "partOfSpeech", "meaning", "definition", "collocations",
        "exampleEn", "exampleZh", "usage", "register", "confusedWith", "forms",
        "tags", "sources", "attributionNote"
      ];
      for (const field of candidateFields) {
        if (JSON.stringify(currentEntry[field]) === JSON.stringify(dictionaryCandidateBaseline[field])) {
          mergedEntry[field] = structuredClone(aiEntry[field]);
        }
      }
    }
    if (result.reviewRequired !== true && aiEntry.senses.length) {
      mergedEntry.tags = mergedEntry.tags.filter((tag) => !["待复核", "ECDICT 原始释义"].includes(tag));
    }
    const phoneticTouchedDuringRequest = (state.phoneticEditRevisions.get(draft.id) || 0) !== phoneticRevisionAtRequest;
    if (phoneticTouchedDuringRequest) {
      // This final override runs after every dictionary/AI merge so even an
      // empty value the owner deliberately restored is not mistaken for an
      // untouched legacy blank.
      mergedEntry.phonetic = currentEntry.phonetic;
      preservedManualChanges = true;
    } else if (hasPlausiblePhonetic && !hasUsablePronunciation(mergedEntry.phonetic)) {
      // An unchanged legacy blank must accept the validated response IPA even
      // if older draft metadata made the generic merge treat it as different.
      mergedEntry.phonetic = responsePhonetic;
    }
    mergedEntry.originalInput = currentEntry.originalInput;
    mergedEntry.createdAt = currentEntry.createdAt;
    mergedEntry.updatedAt = isoNow();
    const nextBase = structuredClone(latestDraft.base || { entry: null, entryUpdatedAt: null, remoteSha: null });
    if (result.reviewRequired === true && !nextBase.dictionaryCandidate) {
      nextBase.dictionaryCandidate = structuredClone(mergedEntry);
    } else if (completingUnreviewedDictionary) {
      delete nextBase.dictionaryCandidate;
    }
    draft = {
      ...latestDraft,
      base: nextBase,
      entryId: latestDraft.entryId,
      value: mergedEntry,
      updatedAt: isoNow()
    };
    state.currentDraft = await saveDraft(draft);
    fillEditor(state.currentDraft);
    const providerName = result.provider === "cloudflare" ? "Cloudflare Workers AI（账户额度）" : result.provider === "anthropic" ? "Claude" : result.provider === "openai" ? "OpenAI" : result.provider === "local-dictionary" ? "本地 ECDICT 词典" : "AI";
    setStatus(refs.captureStatus, [
      ...warnings,
      preservedManualChanges
        ? `${providerName} 返回期间的人工修改已保留，其余空白字段已补充。`
        : `${providerName} 候选已写入草稿，请核对后再发布。`
    ].join(" "));
  } catch (error) {
    const message = error.message || "AI 暂时不可用";
    setStatus(refs.captureStatus, /草稿/.test(message) ? message : `${message} 空白草稿仍可手动填写。`);
  } finally {
    if (commitWindowLocked) {
      refs.entryForm.inert = false;
      refs.entryForm.removeAttribute("aria-busy");
    }
  }
}

async function openNewDraft(input, { ai = false } = {}) {
  requireVerifiedOwnerUi();
  await flushPendingDraftSave();
  const cleaned = validateEnglishInput(input);
  const blank = createBlankEntry(cleaned);
  const localDrafts = await listDrafts();
  const duplicate = state.snapshot ? findDuplicate(state.snapshot.entries, blank) : null;
  if (duplicate) {
    const existing = localDrafts.find((candidate) => candidate.mode === "edit"
      && candidate.entryId === duplicate.id && candidate.localState !== "published");
    const draft = existing || await saveDraft(createDraft(duplicate, { mode: "edit", baseEntry: duplicate }));
    fillEditor(draft);
    if (ai && editorNeedsAiCompletion(draft.value)) {
      setStatus(refs.captureStatus, `已找到“${cleaned}”的未完成编辑草稿，正在只补空白字段；不会新增第二条公开词条。`);
      await organizeDraftWithAi(draft, cleaned, { fillMissingOnly: true });
      return;
    }
    setStatus(refs.captureStatus, existing
      ? `“${cleaned}”的公开词条已存在；已打开现有编辑草稿，不会新增第二条公开记录。`
      : `“${cleaned}”的公开词条已存在；已建立编辑草稿，不会新增第二条公开记录。`);
    return;
  }
  const localDuplicate = localDrafts.find((candidate) => findDuplicate([candidate.value], blank));
  if (localDuplicate) {
    fillEditor(localDuplicate);
    if (ai && editorNeedsAiCompletion(localDuplicate.value)) {
      setStatus(refs.captureStatus, `已找到“${cleaned}”的未完成草稿，正在只补空白字段；不会新增第二条草稿。`);
      await organizeDraftWithAi(localDuplicate, cleaned, { fillMissingOnly: true });
      return;
    }
    setStatus(refs.captureStatus, `“${cleaned}” 已有本地草稿，没有重复创建，也没有重复消耗 AI 额度；如需刷新内容，请点击“重新用 AI 整理”。`);
    return;
  }
  const draft = await saveDraft(createDraft(blank));
  fillEditor(draft);
  setStatus(refs.captureStatus, "空白草稿已先保存在本机。 ");
  if (ai) await organizeDraftWithAi(draft, cleaned);
}

async function queueCurrentPublish() {
  requireVerifiedOwnerUi();
  window.clearTimeout(state.saveTimer);
  state.saveTimer = null;
  state.pendingSave = null;
  showEditorError();
  const entry = collectEntry({ strict: true });
  if (!/^[0-9a-f]{40}$/i.test(state.remoteSha)) throw new Error("还没有可信的 GitHub 文件 SHA；请先联网刷新一次远端，再建立离线发布队列。");
  const duplicate = findDuplicate(state.snapshot?.entries || [], entry, state.currentDraft.mode === "edit" ? entry.id : "");
  if (duplicate) throw new Error(`“${entry.term}” 与已发布的 “${duplicate.term}” 重复，请编辑现有词条进行合并。`);
  state.currentDraft.value = entry;
  const mutationId = crypto.randomUUID();
  const request = {
    baseSha: state.remoteSha,
    mutationId,
    mutation: state.currentDraft.mode === "edit"
      ? { type: "update", entry, expectedUpdatedAt: state.currentDraft.base.entryUpdatedAt }
      : { type: "add", entry }
  };
  const queued = await enqueuePublish(state.currentDraft, request);
  state.currentDraft = queued.draft;
  fillEditor(state.currentDraft, { focus: false });
  await drainQueue();
}

async function queueDelete(entry) {
  requireVerifiedOwnerUi();
  if (!window.confirm(`确定要从公开词库撤下 “${entry.term}” 吗？远端变化时删除会停止，不会覆盖。`)) return;
  const draft = await saveDraft(createDraft(entry, { mode: "edit", baseEntry: entry }));
  await enqueuePublish(draft, {
    baseSha: state.remoteSha,
    mutationId: crypto.randomUUID(),
    mutation: { type: "delete", id: entry.id, expectedUpdatedAt: entry.updatedAt }
  });
  await renderDrafts();
  await drainQueue();
}

function errorRecord(error) {
  return { code: error.code || "request_failed", message: error.message || "同步失败", httpStatus: Number(error.status || 0), retryable: classifySyncFailure(error).retryable };
}

async function handleConflict(operation, error, tabId) {
  const details = error.details && typeof error.details === "object" ? error.details : {};
  if (!details.snapshot || !details.sha) {
    await markOperation(operation.operationId, "conflict", { lastError: errorRecord(error) }, { leaseOwner: tabId });
    return;
  }
  const remoteSnapshot = parsePublicSnapshot(details.snapshot);
  const result = rebaseOperation(operation, remoteSnapshot, details.sha);
  state.snapshot = remoteSnapshot;
  state.remoteSha = details.sha;
  await putPublicCache(remoteSnapshot, details.sha, "conflict-response");
  renderOwnerEntries();
  if (result.status === "idempotent") {
    await completeOperation(operation.operationId, { tabId, sha: details.sha, snapshot: remoteSnapshot });
    return;
  }
  if (result.status === "rebased") {
    await markOperation(operation.operationId, "pending", {
      request: result.request,
      idempotencyKey: result.request.mutationId,
      baseRemoteSha: details.sha,
      baseEntry: result.remote,
      desiredEntry: result.request.mutation.entry || null,
      nextAttemptAt: isoNow(),
      lastError: null
    }, { leaseOwner: tabId });
    return;
  }
  await markOperation(operation.operationId, "conflict", {
    lastError: errorRecord(error),
    conflict: { remoteSha: details.sha, remote: result.remote, conflicts: result.conflicts, merged: result.request.mutation.entry || null }
  }, { leaseOwner: tabId });
  state.conflict = { operation, result, remoteSnapshot, remoteSha: details.sha };
  showConflict();
}

async function drainQueue() {
  if (state.queueBusy || !state.session || !navigator.onLine) return;
  state.queueBusy = true;
  refs.retryQueue.disabled = true;
  try {
    while (navigator.onLine) {
      const operation = await claimNextOperation({ tabId: state.tabId });
      if (!operation) break;
      setSyncState("loading", "正在同步", operation.desiredEntry?.term || operation.entryId || "公开词库");
      try {
        const result = await publishMutation(operation.request, state.csrfToken);
        const snapshot = parsePublicSnapshot(result.snapshot, { allowLegacy: false });
        const completion = await completeOperation(operation.operationId, { tabId: state.tabId, sha: result.sha, snapshot });
        state.snapshot = snapshot;
        state.remoteSha = result.sha;
        if (state.currentDraft?.id === operation.draftId) {
          state.currentDraft = await getDraft(operation.draftId);
          fillEditor(state.currentDraft, { focus: false });
        }
        setSyncState(
          "synced",
          completion.superseded ? "较早版本已发布；当前修改仍在本地" : "已发布",
          completion.superseded ? "请检查当前草稿并再次显式发布" : `${result.action || "更新"} · SHA ${String(result.sha).slice(0, 7)}`
        );
        renderOwnerEntries();
      } catch (error) {
        if (error.status === 409) {
          await handleConflict(operation, error, state.tabId);
          continue;
        }
        const classification = classifySyncFailure(error);
        if (classification.state === "retry_wait" && operation.attemptCount <= 8) {
          const retryAt = nextRetryAt(operation.attemptCount, error.retryAfter);
          await markOperation(operation.operationId, "retry_wait", {
            nextAttemptAt: retryAt,
            lastError: errorRecord(error)
          }, { leaseOwner: state.tabId });
          scheduleQueueWake(retryAt);
        } else {
          await markOperation(operation.operationId, classification.state, { lastError: errorRecord(error) }, { leaseOwner: state.tabId });
        }
        setSyncState("error", STATE_LABELS[classification.state], error.message);
        if (classification.state === "awaiting_auth") await verifySession({ forceGate: true });
        break;
      }
    }
  } finally {
    state.queueBusy = false;
    refs.retryQueue.disabled = false;
    await renderDrafts();
  }
}

function scheduleQueueWake(when) {
  window.clearTimeout(state.queueWakeTimer);
  const delay = Math.max(0, Math.min(60 * 60 * 1000, new Date(when).getTime() - Date.now()));
  state.queueWakeTimer = window.setTimeout(() => drainQueue(), delay + 50);
}

function showConflict() {
  if (!state.conflict) return;
  const conflicts = state.conflict.result.conflicts || [];
  refs.conflictMessage.textContent = "GitHub 的内容已经变化。系统已保留本地草稿，并自动合并了只有一侧变化的字段；下列字段需要卓亲自检查。";
  refs.conflictFields.replaceChildren(...conflicts.map((conflict) => {
    const item = document.createElement("li");
    item.textContent = `字段 ${conflict.path}：本地与远端都发生了不同修改。`;
    return item;
  }));
  refs.conflictUseMerged.hidden = !state.conflict.result.request.mutation.entry;
  refs.conflictUseRemote.hidden = !state.conflict.result.remote;
  refs.conflictDialog.showModal();
}

async function resolveConflict(choice) {
  const conflict = state.conflict;
  if (!conflict) return;
  const current = await getDraft(conflict.operation.draftId);
  await markOperation(conflict.operation.operationId, "cancelled", { lastError: null });
  if (current) {
    const selected = choice === "remote" ? conflict.result.remote : conflict.result.request.mutation.entry;
    const updated = await saveDraft({
      ...current,
      value: selected,
      entryId: selected.id,
      mode: "edit",
      base: { entry: conflict.result.remote, entryUpdatedAt: conflict.result.remote?.updatedAt || null, remoteSha: conflict.remoteSha },
      localState: "local_saved",
      lastOperationId: null
    });
    fillEditor(updated);
    showEditorError(choice === "remote" ? "已改用远端版本；请检查后再编辑。" : "已把非冲突字段合并，并暂时保留本地冲突值；请逐项检查后重新发布。 ");
  }
  state.conflict = null;
  refs.conflictDialog.close();
}

async function verifySession({ forceGate = false } = {}) {
  if (state.authChecking) return;
  state.authChecking = true;
  const previouslyVerifiedSession = state.session;
  const previousCsrfToken = state.csrfToken;
  try {
    const session = await getSession();
    if (!session.authenticated || session.user?.login !== "zhuodashuai" || Number(session.user?.id) !== 156042078) {
      throw new OwnerApiError("当前没有通过验证的卓本人会话。", { status: 401, code: "authentication_required" });
    }
    state.session = session.user;
    state.csrfToken = session.csrfToken;
    refs.ownerAvatar.src = session.user.avatarUrl || "assets/icon-192.png";
    refs.ownerAvatar.alt = `GitHub 用户 @${session.user.login} 的头像`;
    refs.ownerIdentityText.textContent = `已验证 GitHub @${session.user.login}（ID ${session.user.id}）。浏览器没有收到 GitHub token。`;
    refs.authGate.hidden = true;
    refs.ownerWorkspace.hidden = false;
    refs.ownerWorkspace.inert = false;
    refs.logoutButton.hidden = false;
    setOrganizingControlsDisabled(Boolean(state.organizingToken));
    await refreshAiStatus();
    await renderDrafts();
    await loadRemote().catch(() => {});
    const quarantineCount = await getQuarantineCount();
    if (quarantineCount) setStatus(refs.captureStatus, `有 ${quarantineCount} 条旧版本地数据因格式问题进入隔离区，没有被丢弃或发布。`);
  } catch (error) {
    const networkUnavailable = !navigator.onLine || error?.code === "network_error";
    const verifiedPageContinuity = networkUnavailable && previouslyVerifiedSession && previousCsrfToken;
    if (verifiedPageContinuity) {
      state.session = previouslyVerifiedSession;
      state.csrfToken = previousCsrfToken;
      refs.ownerIdentityText.textContent = `本页面此前已验证 GitHub @${previouslyVerifiedSession.login}；当前离线，只保存本地草稿，恢复网络后会再次验证再同步。`;
      refs.organizeButton.disabled = true;
      setSyncState("error", "离线 · 本页身份已验证", "发布任务只排队，联网后必须再次通过服务端会话验证");
      return;
    }
    state.session = null;
    state.csrfToken = "";
    refs.ownerWorkspace.hidden = true;
    refs.ownerWorkspace.inert = true;
    refs.logoutButton.hidden = true;
    refs.authGate.hidden = false;
    const onGitHubPages = location.hostname === "zhuodashuai.github.io";
    refs.loginLink.hidden = onGitHubPages;
    refs.loginLink.href = ownerLoginUrl();
    refs.authMessage.textContent = onGitHubPages
      ? "这里是 GitHub Pages 的公开只读副本。为避免把写入令牌放进前端，管理功能只在同源 serverless 管理地址开放；完成一次性部署后，公开页的“所有者登录”会跳转过去。"
      : (networkUnavailable
        ? "当前离线且本页面没有经过服务端身份验证，因此管理区保持锁定。联网并登录为卓本人后，本机草稿仍会保留。"
        : (forceGate ? "登录已失效。草稿与等待同步任务仍保存在本机，请重新登录。" : (error.message || "尚未登录。")));
  } finally {
    state.authChecking = false;
  }
}

refs.captureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await withOrganizingLock(() => openNewDraft(refs.captureInput.value, { ai: true }));
  } catch (error) {
    setStatus(refs.captureStatus, error.message);
  }
});
refs.manualButton.addEventListener("click", async () => {
  try {
    await withOrganizingLock(() => openNewDraft(refs.captureInput.value, { ai: false }));
  } catch (error) {
    setStatus(refs.captureStatus, error.message);
  }
});
refs.entryForm.addEventListener("input", (event) => {
  if (event.target === refs.fieldPhonetic && state.currentDraft?.id) {
    const draftId = state.currentDraft.id;
    state.phoneticEditRevisions.set(draftId, (state.phoneticEditRevisions.get(draftId) || 0) + 1);
  }
  renderDraftCompletionNotice(collectEntry());
  scheduleDraftSave();
});
refs.fieldEntryType.addEventListener("change", () => {
  refs.attributionFieldset.hidden = !["quote", "proverb"].includes(refs.fieldEntryType.value);
  scheduleDraftSave();
});
refs.acceptSuggestion.addEventListener("click", () => {
  const correction = state.currentDraft.value.correction;
  refs.fieldTerm.value = correction.suggestion;
  refs.fieldStandardForm.value = correction.suggestion;
  state.currentDraft.value.correction = { ...correction, status: "accepted", chosen: correction.suggestion };
  renderCorrection(state.currentDraft.value);
  scheduleDraftSave();
});
refs.keepOriginal.addEventListener("click", () => {
  const correction = state.currentDraft.value.correction;
  refs.fieldTerm.value = correction.original;
  state.currentDraft.value.correction = { ...correction, status: "kept", chosen: correction.original };
  renderCorrection(state.currentDraft.value);
  scheduleDraftSave();
});
refs.manualCorrection.addEventListener("click", () => {
  const correction = state.currentDraft.value.correction;
  state.currentDraft.value.correction = { ...correction, status: "kept", chosen: refs.fieldTerm.value, source: "manual" };
  refs.correctionCard.hidden = true;
  refs.fieldTerm.focus();
  scheduleDraftSave();
});
refs.saveLocal.addEventListener("click", () => persistCurrentDraft({ announce: true }).catch((error) => showEditorError(error.message)));
async function organizeCurrentDraft({ fillMissingOnly = false } = {}) {
  await withOrganizingLock(async () => {
    try {
      requireVerifiedOwnerUi();
      await flushPendingDraftSave();
      const draft = state.currentDraft && await getDraft(state.currentDraft.id);
      if (!draft) throw new Error("请先打开一份草稿。");
      await organizeDraftWithAi(draft, validateEnglishInput(draft.value.originalInput || draft.value.term), { fillMissingOnly });
    } catch (error) {
      setStatus(refs.captureStatus, error.message || "AI 暂时无法重新整理当前草稿。");
    }
  });
}
refs.reorganizeCurrent.addEventListener("click", () => organizeCurrentDraft());
refs.completeDraft.addEventListener("click", () => organizeCurrentDraft({ fillMissingOnly: true }));
refs.entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  refs.publishButton.disabled = true;
  try { await queueCurrentPublish(); } catch (error) { showEditorError(error.message || "发布失败"); } finally { refs.publishButton.disabled = false; }
});
refs.discardDraft.addEventListener("click", async () => {
  if (!state.currentDraft || !window.confirm("删除这份本地草稿吗？已发布的 GitHub 词条不会因此删除。")) return;
  await deleteDraft(state.currentDraft.id);
  state.currentDraft = null;
  refs.entryForm.hidden = true;
  refs.editorEmpty.hidden = false;
  refs.draftCompletionNotice.hidden = true;
  await renderDrafts();
});
refs.refreshRemote.addEventListener("click", () => loadRemote().catch(() => {}));
refs.retryQueue.addEventListener("click", async () => {
  const operations = await listOutbox();
  for (const operation of operations) {
    if (operation.status === "review_required") continue;
    if (operation.status === "awaiting_auth" || operation.status === "retry_wait"
      || (operation.status === "failed" && operation.lastError?.retryable)) {
      await markOperation(operation.operationId, "pending", { nextAttemptAt: isoNow(), lastError: null });
    }
  }
  await drainQueue();
});
refs.ownerSearch.addEventListener("input", () => { state.ownerSearch = refs.ownerSearch.value; renderOwnerEntries(); });
refs.loginLink.addEventListener("click", rememberOwnerInputForLogin);
refs.logoutButton.addEventListener("click", async () => {
  await flushPendingDraftSave().catch(() => {});
  try { await logout(state.csrfToken); } catch { /* local gate still closes */ }
  state.session = null;
  state.csrfToken = "";
  await verifySession({ forceGate: true });
});
refs.conflictUseMerged.addEventListener("click", () => resolveConflict("merged"));
refs.conflictUseRemote.addEventListener("click", () => resolveConflict("remote"));
refs.conflictClose.addEventListener("click", () => refs.conflictDialog.close());

refs.exportBackup.addEventListener("click", async () => {
  try { requireVerifiedOwnerUi(); } catch (error) { setStatus(refs.captureStatus, error.message); return; }
  const drafts = await listDrafts();
  const backup = { backupVersion: 1, exportedAt: isoNow(), owner: "zhuodashuai", drafts, publicSnapshot: state.snapshot };
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zhuo-wordbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});
refs.importBackup.addEventListener("click", () => {
  try { requireVerifiedOwnerUi(); refs.importFile.click(); } catch (error) { setStatus(refs.captureStatus, error.message); }
});
refs.importFile.addEventListener("change", async () => {
  try { requireVerifiedOwnerUi(); } catch (error) { setStatus(refs.captureStatus, error.message); return; }
  const file = refs.importFile.files?.[0];
  refs.importFile.value = "";
  if (!file) return;
  try {
    if (file.size > 1_500_000) throw new Error("备份文件超过 1.5 MB，已拒绝读取。");
    const documentValue = JSON.parse(await file.text());
    if (!documentValue || documentValue.backupVersion !== 1 || documentValue.owner !== "zhuodashuai" || !Array.isArray(documentValue.drafts)) throw new Error("备份文件格式不正确。");
    if (documentValue.publicSnapshot) parsePublicSnapshot(documentValue.publicSnapshot);
    if (documentValue.drafts.length > 1000) throw new Error("备份中的草稿数量过多。");
    const safeDrafts = documentValue.drafts.map((draft) => {
      if (!draft || typeof draft !== "object" || Array.isArray(draft) || !draft.value || typeof draft.value !== "object" || Array.isArray(draft.value)) {
        throw new Error("备份包含格式不正确的草稿。");
      }
      const draftSourceUrl = typeof draft.value.sourceUrl === "string" ? draft.value.sourceUrl.slice(0, 2000) : "";
      const value = validatePublicEntry({ ...draft.value, sourceUrl: "" });
      return {
        ...draft,
        id: crypto.randomUUID(),
        value: { ...value, sourceUrl: draftSourceUrl },
        localState: "local_saved",
        lastOperationId: null
      };
    });
    await importDrafts(safeDrafts);
    await renderDrafts();
    setStatus(refs.captureStatus, `已安全导入 ${documentValue.drafts.length} 份草稿；没有自动发布任何内容。`);
  } catch (error) {
    setStatus(refs.captureStatus, `导入失败：${error.message}`);
  }
});

for (const type of ENTRY_TYPES) {
  const option = document.createElement("option");
  option.value = type;
  option.textContent = type;
  refs.fieldEntryType.append(option);
}
setNetworkState();
window.addEventListener("online", () => {
  setNetworkState();
  if (!state.session) verifySession({ forceGate: true });
  else drainQueue();
});
window.addEventListener("offline", setNetworkState);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPendingDraftSave().catch(() => {});
});
window.addEventListener("pageshow", (event) => { if (event.persisted) verifySession({ forceGate: true }); });
window.addEventListener("wordbook:storage-blocked", () => setStatus(refs.captureStatus, "另一个旧页面阻止数据库升级；请关闭其他词库页面后刷新。"));
window.addEventListener("wordbook:storage-upgrade-needed", () => setStatus(refs.captureStatus, "词库存储已在另一个页面升级，请刷新当前页面。"));
subscribeStorageChanges(() => { renderDrafts(); });
setupPwa({
  installButton: refs.installButton,
  updateBanner: refs.updateBanner,
  applyUpdateButton: refs.applyUpdate,
  beforeApplyUpdate: flushPendingDraftSave
});
async function initializeOwnerApp() {
  await verifySession();
  if (!hasVerifiedOwnerUi()) return;
  const recovered = await requireReviewForStoredOperations();
  if (recovered.length) await renderDrafts();
  const reconciled = state.session && state.snapshot && /^[0-9a-f]{40}$/i.test(state.remoteSha)
    ? await reconcileCommittedOperations(state.snapshot, state.remoteSha)
    : [];
  if (reconciled.length) await renderDrafts();
  const remaining = Math.max(0, recovered.length - reconciled.length);
  if (remaining && state.session) {
    setStatus(refs.captureStatus, `已从 GitHub 核对完成 ${reconciled.length} 个响应中断任务；另有 ${remaining} 个遗留发布任务不会自动发布，请打开对应草稿，由卓本人复核后重新发布。`);
  } else if (reconciled.length) {
    setStatus(refs.captureStatus, `已从 GitHub 核对并恢复 ${reconciled.length} 个发布成功但响应中断的任务，没有重复提交。`);
  }
  consumeOwnerInputAfterAuthentication();
}

initializeOwnerApp().catch((error) => {
  refs.ownerWorkspace.hidden = true;
  refs.authGate.hidden = false;
  refs.authMessage.textContent = `管理端初始化失败：${error.message || "未知错误"}。没有执行任何发布。`;
});
