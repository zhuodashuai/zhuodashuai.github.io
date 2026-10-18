import { personalWordbookUrl } from "./runtime-config.js?v=77";
import { setupPwa } from "./pwa.js?v=77";
import { normalizeEnglish, normalizePublicSearchQuery } from "./wordbook-schema.js?v=77";
import { createPersonalApi } from "./personal-api.js?v=77";
import {
  createPersonalDraftStore, createPersonalExpiryTimer, createPersonalMutationTracker, createPersonalSessionScope,
  isPersonalDraftDirty, personalDraft, serializePersonalExport,
  validatePersonalEntry, validatePersonalInput, validatePersonalList,
  validatePersonalPassword, validatePersonalSession, validatePersonalUsername
} from "./personal-storage.js?v=78";
import { alreadySelectedSource, contextualizePersonalEntry, fetchPersonalPublicCatalog, filterPersonalEntries,
  personalCollectionCatalog, personalSourceContext, publicSelectionCatalog, publicSelectionEntries, selectionPayload } from "./personal-selection.js?v=78";
import { personalRecentHistory, personalStudyQueue, personalStudySummary, validatePersonalLearning, validatePersonalReview } from "./personal-study.js?v=77";
import { lookupPersonalDictionary, preloadPersonalDictionary } from "./personal-dictionary.js?v=78";

const $ = (id) => document.getElementById(id);
const api = createPersonalApi();
const drafts = createPersonalDraftStore();
const dictionaryDraftOrigins = new Map(); // Same-UID, memory-only automatic-fill provenance.
const mutations = createPersonalMutationTracker();
const scope = createPersonalSessionScope();
const expiryTimer = createPersonalExpiryTimer();
const LOCK_KEY = "zhuo-member-explicit-login-required"; // Nonsecret logout intent only.
const tabId = crypto.randomUUID();
const authParameter = new URLSearchParams(window.location.search).get("auth");
const requestedAuth = authParameter === "owner" ? "github-owner" : authParameter === "member" ? "member" : "auto";
let channel;
try { channel = new BroadcastChannel("zhuo-member-auth-v1"); } catch { /* Revalidation remains authoritative. */ }
let originReady = false;
let verificationTask = null;
let detailEntry = null;
let conflictEntry = null;
let dictionarySequence = 0;
let dictionaryController = null;
const state = {
  phase: "checking", authView: "login", authBusy: false, user: null, csrfToken: "", expiresAt: "",
  entries: [], revision: 0, entriesLoaded: false, listBusy: false, entryBusy: false,
  editor: null, recovery: null, authType: requestedAuth,
  collectionId: "all", chapterId: "all", reviews: [], learningRevision: 0, learningLoaded: false, learningBusy: false,
  publicSnapshot: null, sourceBusy: false, sourceBook: "all", sourceChapter: "all", selectedSources: new Set(), study: null,
  dictionaryBusy: false, dictionaryResult: null, dictionaryApplied: null
};
const RATING_LABELS = { again: "再来一次", hard: "有点难", good: "记得", easy: "很熟" };
const privateOptions = (signal, extra = {}) => ({ signal, authType: state.authType, ...extra });

function status(message, kind = "saved") {
  $("member-status").textContent = message;
  $("member-status").dataset.state = kind;
  $("member-status").dataset.tone = ["error", "locked"].includes(kind) ? "error" : kind === "saved" ? "success" : "neutral";
}

function lockMarker(value) {
  try {
    if (value === undefined) return sessionStorage.getItem(LOCK_KEY) === "1";
    if (value) sessionStorage.setItem(LOCK_KEY, "1");
    else sessionStorage.removeItem(LOCK_KEY);
    return Boolean(value);
  } catch {
    // If storage cannot remember logout intent, require explicit login on the
    // next load rather than risk restoring a cookie whose revocation failed.
    return true;
  }
}

function broadcast(type) {
  try { channel?.postMessage({ type, tabId }); } catch { /* No credentials or private content in messages. */ }
}

function clearPasswords() {
  for (const input of document.querySelectorAll('input[type="password"]')) input.value = "";
  $("reset-recovery-code").value = "";
}

function clearPrivateDom() {
  resetDictionary();
  $("member-dictionary-term").value = "";
  $("member-entry-list").replaceChildren();
  $("member-username").textContent = "";
  $("member-search").value = "";
  for (const id of ["member-term", "member-partOfSpeech", "member-meaning", "member-note"]) $(id).value = "";
  $("member-detail-term").textContent = "";
  $("member-detail-meaning").textContent = "";
  $("member-detail-note").textContent = "";
  $("member-recovery-code").textContent = "";
  $("member-recovery-ack").checked = false;
  $("member-conflict-message").textContent = "";
  $("member-conflict").hidden = true;
  $("member-source-panel").hidden = true;
  $("member-source-toggle").setAttribute("aria-expanded", "false");
  $("member-source-list").replaceChildren();
  $("member-source-search").value = "";
  $("member-learning-history-list").replaceChildren();
  for (const id of ["member-detail-pos", "member-detail-source", "member-detail-original", "member-detail-definition", "member-detail-usage", "member-detail-example",
    "member-study-term", "member-study-pos", "member-study-meaning", "member-study-usage", "member-study-example", "member-study-note", "member-study-source", "member-study-status"]) $(id).textContent = "";
  for (const id of ["member-detail-dialog", "delete-account-dialog", "member-study-dialog"]) if ($(id).open) $(id).close();
  detailEntry = null;
  conflictEntry = null;
  clearPasswords();
}

function clearSession({ discardDrafts = false } = {}) {
  expiryTimer.clear();
  scope.advance();
  state.user = null;
  state.csrfToken = "";
  state.expiresAt = "";
  state.entries = [];
  state.revision = 0;
  state.entriesLoaded = false;
  state.listBusy = false;
  state.entryBusy = false;
  state.authBusy = false;
  state.editor = null;
  state.recovery = null;
  state.reviews = [];
  state.learningRevision = 0;
  state.learningLoaded = false;
  state.learningBusy = false;
  state.study = null;
  state.dictionaryApplied = null;
  state.sourceBusy = false;
  state.selectedSources.clear();
  state.collectionId = "all";
  state.chapterId = "all";
  if (discardDrafts) { drafts.clear(); mutations.clear(); dictionaryDraftOrigins.clear(); }
  clearPrivateDom();
}

function lockSession(message, { discardDrafts = false, notify = false } = {}) {
  clearSession({ discardDrafts });
  lockMarker(true);
  state.phase = state.authType === "github-owner" ? "owner-gate" : "locked";
  state.authView = "login";
  renderChrome();
  status(message, "locked");
  if (notify) broadcast("locked");
}

function renderChrome() {
  const ready = state.phase === "ready" && Boolean(state.user);
  const auth = ["signed-out", "locked"].includes(state.phase);
  const recovery = state.phase === "recovery" && state.recovery && scope.current(state.recovery.token);
  $("member-loading").hidden = state.phase !== "checking";
  $("member-auth").hidden = !auth;
  $("member-workspace").hidden = !ready;
  $("member-recovery").hidden = !recovery;
  $("member-owner-gate").hidden = state.phase !== "owner-gate";
  $("member-owner-refresh").disabled = !originReady || state.phase !== "owner-gate" || state.authBusy;
  $("member-username").hidden = !ready;
  $("member-logout").hidden = !ready;
  $("member-logout").disabled = !ready;
  $("member-username").textContent = ready ? `@${state.user.username}` : "";
  $("member-auth-type").hidden = !ready;
  $("member-auth-type").textContent = state.authType === "github-owner" ? "GitHub 身份" : "普通账号";
  $("member-owner-account-note").hidden = state.authType !== "github-owner";
  $("member-delete-account").hidden = state.authType === "github-owner";
  for (const tab of document.querySelectorAll("[data-auth-view]")) {
    tab.disabled = !originReady || !auth || state.authBusy;
    tab.setAttribute("aria-pressed", String(tab.dataset.authView === state.authView));
  }
  for (const name of ["login", "register", "reset"]) {
    const form = $(`member-${name}-form`);
    form.hidden = name !== state.authView;
    form.querySelector("fieldset").disabled = !originReady || !auth || state.authBusy;
  }
  $("member-entry-form").querySelector("fieldset").disabled = !ready || state.entryBusy;
  const imported = Boolean(state.editor?.sourceContexts?.length);
  $("member-term").readOnly = imported;
  $("member-partOfSpeech").readOnly = imported;
  $("member-imported-hint").hidden = !imported;
  $("member-meaning").maxLength = imported ? 40000 : 4000;
  $("delete-account-form").querySelector("fieldset").disabled = !ready || state.entryBusy;
  for (const id of ["member-new", "member-cancel", "member-delete-account"]) $(id).disabled = !ready || state.entryBusy;
  $("member-refresh").disabled = !ready || state.entryBusy || state.listBusy;
  $("member-export").disabled = !ready || state.entryBusy || !state.entriesLoaded || !state.learningLoaded;
  $("member-save").disabled = !ready || state.entryBusy || !state.entriesLoaded
    || state.listBusy
    || !state.editor?.term.trim() || Boolean(state.editor?.id && !isPersonalDraftDirty(state.editor));
  $("member-save").textContent = state.entryBusy ? "正在保存…" : "保存到我的词本";
  $("member-editor-heading").textContent = state.editor?.id ? "编辑这个词" : "记下一个词";
  $("member-draft-status").textContent = isPersonalDraftDirty(state.editor)
    ? "当前页面有未上传的修改；关闭或刷新会丢失。"
    : state.editor?.id ? "正在编辑已保存的词条。" : "当前页面草稿；保存后同步到账号。";
  $("member-count").textContent = state.entriesLoaded ? `${state.entries.length} / 1000` : "尚未读取";
  $("member-entry-list").setAttribute("aria-busy", String(state.listBusy));
  $("member-recovery-code").textContent = recovery ? state.recovery.code : "";
  for (const id of ["member-recovery-copy", "member-recovery-download", "member-recovery-ack"]) $(id).disabled = !recovery;
  $("member-recovery-continue").disabled = !recovery || !$("member-recovery-ack").checked;
  $("member-source-toggle").disabled = !ready || state.entryBusy || state.sourceBusy;
  $("member-dictionary-term").disabled = !ready;
  $("member-dictionary-search").disabled = !ready || state.dictionaryBusy;
  $("member-dictionary-search").textContent = state.dictionaryBusy ? "正在查…" : "查词";
  $("member-dictionary-use").disabled = !ready || state.entryBusy || state.dictionaryBusy || !state.dictionaryResult || !state.entriesLoaded || state.listBusy;
  for (const id of ["member-source-book", "member-source-chapter", "member-source-search", "member-source-all", "member-source-clear"]) $(id).disabled = !ready || state.entryBusy || state.sourceBusy;
  $("member-source-add").disabled = !ready || !state.entriesLoaded || state.entryBusy || state.listBusy || state.sourceBusy || state.selectedSources.size === 0;
  $("member-source-selected-count").textContent = `已选 ${state.selectedSources.size} / 100`;
  $("member-source-list").setAttribute("aria-busy", String(state.sourceBusy));
  $("member-learning-refresh").disabled = !ready || state.learningBusy || state.entryBusy || Boolean(state.study?.busy || state.study?.pending);
  renderLearning();
  if (state.study) renderStudy();
}

class StaleResponse extends Error { constructor() { super("账号已改变，旧请求已忽略。"); this.stale = true; } }
async function request(operation) {
  const ticket = scope.request();
  try {
    const result = await operation(ticket.signal);
    if (!ticket.current()) throw new StaleResponse();
    return result;
  } catch (error) {
    if (!ticket.current()) throw new StaleResponse();
    throw error;
  } finally { ticket.release(); }
}

function sessionValue(value) {
  return validatePersonalSession(value);
}

function fillEditor(draft, { focus = false, restoreDictionaryOrigin = false } = {}) {
  const origin = restoreDictionaryOrigin && state.user ? dictionaryDraftOrigins.get(state.user.id) : null;
  state.dictionaryApplied = origin && normalizeEnglish(origin.term) === normalizeEnglish(draft.term) ? { ...origin } : null;
  if (state.user && !restoreDictionaryOrigin) dictionaryDraftOrigins.delete(state.user.id);
  state.editor = structuredClone(draft);
  for (const field of ["term", "partOfSpeech", "meaning", "note"]) $(`member-${field}`).value = draft[field];
  if (draft.sourceContexts?.length) $("member-partOfSpeech").value = personalSourceContext(draft, state.collectionId, state.chapterId)?.partOfSpeech || draft.partOfSpeech;
  if (state.user) drafts.write(state.user.id, state.editor);
  conflictEntry = null;
  $("member-conflict").hidden = true;
  renderChrome();
  if (focus) $("member-term").focus();
}

function captureDraft() {
  if (!state.user || !state.editor || state.phase !== "ready") return null;
  for (const field of ["term", "meaning", "note"]) state.editor[field] = $(`member-${field}`).value;
  if (!state.editor.sourceContexts?.length) state.editor.partOfSpeech = $("member-partOfSpeech").value;
  drafts.write(state.user.id, state.editor);
  return state.editor;
}

function adoptSession(result, { recoveryCode = "" } = {}) {
  const session = sessionValue(result);
  const authType = session.authType || "member";
  if (state.authType !== "auto" && state.authType !== authType) throw new Error("登录方式已改变，请明确选择账号后重试。");
  expiryTimer.clear();
  scope.advance(session.user.id);
  clearPrivateDom();
  state.user = { id: session.user.id, username: session.user.username };
  state.authType = authType;
  state.csrfToken = session.csrfToken;
  state.expiresAt = session.expiresAt;
  state.entries = [];
  state.entriesLoaded = false;
  state.listBusy = false;
  state.entryBusy = false;
  state.authBusy = false;
  drafts.retainOnly(session.user.id);
  for (const uid of dictionaryDraftOrigins.keys()) if (uid !== session.user.id) dictionaryDraftOrigins.delete(uid);
  mutations.retainOnly(session.user.id);
  lockMarker(false);
  state.phase = recoveryCode ? "recovery" : "ready";
  // Public static data only; never await this on the login/recovery path.
  // A failed warmup remains retryable on Enter and cannot hide the workspace.
  void preloadPersonalDictionary().catch(() => {});
  state.recovery = recoveryCode ? { code: recoveryCode, username: session.user.username, kind: "register", token: scope.capture() } : null;
  fillEditor(drafts.read(session.user.id) || personalDraft(), { restoreDictionaryOrigin: true });
  renderEntries();
  renderChrome();
  const token = scope.capture();
  const uid = session.user.id;
  expiryTimer.schedule({
    expiresAt: session.expiresAt,
    isCurrent: () => scope.current(token) && state.user?.id === uid,
    onExpire: () => {
      if (state.phase === "ready") captureDraft();
      lockSession("登录已到期，个人内容已隐藏。当前页面草稿仍保留，请用同一账号明确重新登录。");
    }
  });
}

function handleFailure(error, message = "操作未完成") {
  if (error?.stale) return;
  if (error.status === 401) {
    lockSession("登录已失效。当前页面的草稿仍保留；请用同一账号重新登录。");
    return;
  }
  const wait = error.status === 429 && error.retryAfter ? ` 请在 ${error.retryAfter} 秒后重试。` : "";
  status(`${message}：${error.message || "请稍后重试。"}${wait}`, "error");
}

async function loadEntries({ announce = true } = {}) {
  if (state.phase !== "ready" || !state.user || state.listBusy) return;
  const token = scope.capture();
  const expectedUserId = state.user.id;
  state.listBusy = true;
  renderChrome();
  if (announce) status("正在读取你的词本…", "loading");
  try {
    const result = validatePersonalList(await request((signal) => api.entries(privateOptions(signal, { expectedUserId }))));
    if (!scope.current(token)) return;
    // An older read can never roll back a mutation whose newer revision was
    // already confirmed in this account, even when a transport completes late.
    if (result.revision >= state.revision) {
      state.entries = result.entries;
      state.revision = result.revision;
    }
    state.entriesLoaded = true;
    renderEntries();
    await loadLearning({ announce: false });
    if (!scope.current(token) || state.phase !== "ready") return false;
    if (announce) status("已读取云端词本；当前编辑内容未被替换。", "saved");
    return true;
  } catch (error) { if (scope.current(token)) handleFailure(error, "读取失败，可点击刷新重试"); return false; }
  finally { if (scope.current(token)) { state.listBusy = false; renderChrome(); renderEntries(); } }
}

function selectOptions(element, options, selected) {
  element.replaceChildren(...options.map(({ id, title, count }) => {
    const option = document.createElement("option"); option.value = id;
    option.textContent = `${title}${count === undefined ? "" : ` · ${count}`}`;
    option.selected = id === selected;
    return option;
  }));
}

function resetDictionary() {
  dictionarySequence++;
  dictionaryController?.abort(); dictionaryController = null;
  state.dictionaryBusy = false; state.dictionaryResult = null;
  $("member-dictionary-result").hidden = true;
  for (const id of ["member-dictionary-word", "member-dictionary-pos", "member-dictionary-meaning", "member-dictionary-status"]) $(id).textContent = "";
}

async function queryDictionary(event) {
  event.preventDefault();
  if (state.phase !== "ready" || !state.user || state.dictionaryBusy) return;
  resetDictionary();
  const query = $("member-dictionary-term").value;
  const sequence = dictionarySequence;
  const token = scope.capture();
  const controller = new AbortController(); dictionaryController = controller;
  state.dictionaryBusy = true;
  $("member-dictionary-status").textContent = "正在查词…首次载入后可直接重复查询。";
  renderChrome();
  try {
    const result = await request(async signal => {
      const stop = () => controller.abort(); signal.addEventListener("abort", stop, { once: true });
      try { return await lookupPersonalDictionary(query, { signal: controller.signal }); }
      finally { signal.removeEventListener("abort", stop); }
    });
    if (!scope.current(token) || sequence !== dictionarySequence || query !== $("member-dictionary-term").value) return;
    state.dictionaryResult = result;
    if (!result) {
      $("member-dictionary-status").textContent = "本站词典与已发布词条中未找到可用释义。请核对拼写，也可先记下这个词，稍后补充；不会编造释义。";
      return;
    }
    $("member-dictionary-word").textContent = result.term;
    $("member-dictionary-pos").textContent = result.partOfSpeech || "词性未标注";
    $("member-dictionary-meaning").textContent = result.meaning;
    $("member-dictionary-result").hidden = false;
    const alreadySaved = state.entriesLoaded && state.entries.some(entry => entry.normalized === normalizeEnglish(result.term));
    $("member-dictionary-status").textContent = `来自${result.source || "本站词库"}${result.matchedForm ? ` · 已识别词形 ${result.matchedForm}` : ""}；${alreadySaved ? "已在你的词本中，不会重复添加" : "查询不会自动加入词本"}。具体含义请结合语境。`;
  } catch (error) {
    if (scope.current(token) && sequence === dictionarySequence && !error?.stale) $("member-dictionary-status").textContent = `${error.message} 没有调用在线翻译或 AI，可重试。`;
  } finally {
    if (scope.current(token) && sequence === dictionarySequence) { state.dictionaryBusy = false; dictionaryController = null; renderChrome(); }
  }
}

function useDictionaryResult() {
  const result = state.dictionaryResult;
  if (state.phase !== "ready" || !state.user || state.entryBusy || state.listBusy || !state.entriesLoaded || !result) return;
  const existing = state.entries.find(entry => entry.normalized === normalizeEnglish(result.term));
  if (existing) {
    $("member-dictionary-status").textContent = "这个词已经在你的词本中，不会重复添加或覆盖自己的释义和备注。";
    showEntry(contextualizePersonalEntry(existing, state.collectionId, state.chapterId));
    return;
  }
  captureDraft();
  if (!discardAllowed()) return;
  const draft = personalDraft();
  Object.assign(draft, { term: result.term, partOfSpeech: result.partOfSpeech, meaning: result.meaning });
  fillEditor(draft, { focus: true });
  state.dictionaryApplied = { ...result };
  dictionaryDraftOrigins.set(state.user.id, { ...result });
  status("词性和释义已填入草稿；点击保存后加入自己的词本。", "saved");
  $("member-entry-form").scrollIntoView({ block: "nearest", behavior: "auto" });
}

function renderPrivateScope() {
  const catalog = personalCollectionCatalog(state.entries);
  if (!catalog.some((book) => book.id === state.collectionId)) { state.collectionId = "all"; state.chapterId = "all"; }
  const book = catalog.find((item) => item.id === state.collectionId);
  if (!book.chapters.some((chapter) => chapter.id === state.chapterId)) state.chapterId = "all";
  selectOptions($("member-book"), catalog, state.collectionId);
  selectOptions($("member-chapter"), [{ id: "all", title: "全部章节" }, ...book.chapters], state.chapterId);
  $("member-chapter").disabled = book.chapters.length === 0;
}

async function loadLearning({ announce = true } = {}) {
  if (state.phase !== "ready" || !state.user || state.learningBusy || state.study?.busy) return false;
  const token = scope.capture();
  const expectedUserId = state.user.id;
  state.learningBusy = true;
  renderChrome();
  try {
    const result = validatePersonalLearning(await request((signal) => api.learning(privateOptions(signal, { expectedUserId }))));
    if (!scope.current(token)) return false;
    if (result.revision >= state.learningRevision) {
      state.reviews = result.reviews;
      state.learningRevision = result.revision;
    }
    state.learningLoaded = true;
    if (announce) status("已核对自己的云端学习记录。", "saved");
    return true;
  } catch (error) {
    if (!scope.current(token) || error?.stale) return false;
    state.learningLoaded = false; // Preserve the last verified records, but do not practise against stale revisions.
    if (error.status === 401) handleFailure(error);
    else if (announce) handleFailure(error, "学习记录读取失败，未重置已有记录");
    return false;
  } finally { if (scope.current(token)) { state.learningBusy = false; renderChrome(); } }
}

function currentStudyEntries() { return filterPersonalEntries(state.entries, state.collectionId, state.chapterId); }

function renderLearning() {
  const ready = state.phase === "ready" && state.user && state.entriesLoaded && state.learningLoaded && !state.learningBusy;
  const summary = ready ? personalStudySummary(currentStudyEntries(), state.reviews) : null;
  $("member-learning-summary").textContent = summary
    ? `新词 ${summary.newCount} · 待复习 ${summary.dueReviewCount} · 已学习 ${summary.reviewedCount}/${summary.totalEntries}${summary.omitted ? ` · ${summary.omitted} 项缺中文，暂不练习` : ""}`
    : state.learningBusy ? "正在读取云端学习记录…" : "学习记录尚未确认，暂不能开始；可点击刷新重试。";
  $("member-study-all").disabled = !ready || state.entryBusy || !summary?.totalEntries;
  $("member-review-due").disabled = !ready || state.entryBusy || !summary?.dueCount;
  $("member-review-due").title = "包含尚未学习的新词和已经到期的词";
  const history = state.phase === "ready" ? personalRecentHistory(state.entries, state.reviews) : [];
  $("member-learning-history-list").replaceChildren(...history.map((row) => {
    const item = document.createElement("li");
    item.textContent = `${row.term} · ${RATING_LABELS[row.rating]} · ${new Date(row.at).toLocaleString("zh-CN")}`;
    return item;
  }));
}

function sourceEntries({ search = true } = {}) {
  return publicSelectionEntries(state.publicSnapshot?.entries || [], state.sourceBook, state.sourceChapter, search ? $("member-source-search").value : "");
}

function renderSource() {
  if (!state.publicSnapshot || state.phase !== "ready") return;
  const catalog = publicSelectionCatalog(state.publicSnapshot.entries);
  selectOptions($("member-source-book"), [{ id: "all", title: "全部公开词本" }, ...catalog], state.sourceBook);
  const chapters = catalog.find((book) => book.id === state.sourceBook)?.chapters || [];
  if (!chapters.some((chapter) => chapter.id === state.sourceChapter)) state.sourceChapter = "all";
  selectOptions($("member-source-chapter"), [{ id: "all", title: "全书" }, ...chapters], state.sourceChapter);
  $("member-source-chapter").disabled = chapters.length === 0 || state.entryBusy || state.sourceBusy;
  const saved = new Set(state.entries.flatMap((entry) => (entry.sourceContexts || []).map((context) => context.key)));
  const rows = sourceEntries().map((entry) => {
    const row = document.createElement("label"); row.className = "source-option";
    const input = document.createElement("input"); input.type = "checkbox"; input.className = "source-select"; input.dataset.entryId = entry.id;
    const already = alreadySelectedSource(state.entries, entry, state.sourceBook, state.sourceChapter, saved);
    input.checked = state.selectedSources.has(entry.id);
    input.disabled = already || state.entryBusy || state.sourceBusy;
    input.setAttribute("aria-label", `${already ? "已收录" : "选择"} ${entry.term}`);
    input.addEventListener("change", () => {
      if (input.checked && state.selectedSources.size >= 100) { input.checked = false; $("member-source-status").textContent = "每批最多选择 100 条。"; return; }
      if (input.checked) state.selectedSources.add(entry.id); else state.selectedSources.delete(entry.id);
      renderChrome();
    });
    const content = document.createElement("span");
    const title = document.createElement("strong"); title.lang = "en"; title.textContent = entry.term;
    const meaning = document.createElement("span"); meaning.className = "source-meaning"; meaning.textContent = entry.meaning;
    const partOfSpeech = document.createElement("small"); partOfSpeech.className = "source-pos"; partOfSpeech.textContent = entry.partOfSpeech || "词性未标注";
    content.append(title, partOfSpeech, meaning);
    if (already) { const note = document.createElement("small"); note.textContent = "已收录此范围，不会重复添加"; content.append(note); }
    row.append(input, content);
    return row;
  });
  $("member-source-list").replaceChildren(...rows);
  renderChrome();
}

async function openSource() {
  if (state.phase !== "ready" || state.entryBusy || state.sourceBusy) return;
  $("member-source-panel").hidden = false;
  $("member-source-toggle").setAttribute("aria-expanded", "true");
  if (state.publicSnapshot) { renderSource(); return; }
  const token = scope.capture();
  state.sourceBusy = true; renderChrome();
  $("member-source-status").textContent = "正在读取公开词库…";
  try {
    const snapshot = await request((signal) => fetchPersonalPublicCatalog({ signal }));
    if (!scope.current(token)) return;
    state.publicSnapshot = snapshot;
    $("member-source-status").textContent = snapshot.readSource === "deployed-fallback"
      ? "实时服务暂不可用，已读取本站已部署的公开快照，可能不是最新。可继续选词；加入时服务器会再次核对。"
      : "选择词本、章节，再勾选需要学习的词。";
    renderSource();
  } catch (error) { if (scope.current(token) && !error?.stale) $("member-source-status").textContent = `${error.message} 点击“从公开词库选词”可重试。`; }
  finally { if (scope.current(token)) { state.sourceBusy = false; renderSource(); renderChrome(); } }
}

async function addSelections() {
  if (state.phase !== "ready" || !state.user || state.entryBusy || state.listBusy || !state.entriesLoaded) return;
  let payload;
  try { payload = selectionPayload([...state.selectedSources], state.sourceBook, state.sourceChapter); }
  catch (error) { $("member-source-status").textContent = error.message; return; }
  const uid = state.user.id;
  const token = scope.capture();
  const body = { ...payload, mutationId: mutations.idFor(uid, "selections", payload) };
  const csrf = state.csrfToken;
  state.entryBusy = true; renderChrome(); renderSource();
  status("正在把选中的词加入私人词本…", "loading");
  try {
    const result = await request((signal) => api.select(body, csrf, privateOptions(signal)));
    if (!scope.current(token)) return;
    if (!Array.isArray(result.entries) || !Number.isSafeInteger(result.revision) || result.revision < 0
      || ![result.added, result.reused, result.contextAdded].every((number) => Number.isSafeInteger(number) && number >= 0)) throw new Error("选词保存结果不完整，请保留勾选后重试。");
    const affected = result.entries.map(validatePersonalEntry);
    const byId = new Map(state.entries.map((entry) => [entry.id, entry]));
    for (const entry of affected) byId.set(entry.id, entry);
    state.entries = [...byId.values()];
    state.revision = Math.max(state.revision, result.revision);
    mutations.clear(uid, "selections");
    state.selectedSources.clear();
    await loadEntries({ announce: false });
    if (!scope.current(token)) return;
    renderEntries(); renderSource();
    const message = `已确认：新增 ${result.added} 条，复用 ${result.reused} 条，补充 ${result.contextAdded} 处来源。当前编辑未被替换。`;
    $("member-source-status").textContent = message;
    status(message, "saved");
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    $("member-source-status").textContent = "加入尚未确认；勾选仍保留，可用同一批词重试。";
    handleFailure(error, "选词保存未完成");
  } finally { if (scope.current(token)) { state.entryBusy = false; renderChrome(); renderSource(); renderEntries(); } }
}

function renderStudy() {
  const study = state.study;
  if (!study) return;
  const entry = study.queue[study.index];
  const completed = !entry;
  $("member-study-progress").textContent = completed ? "本次学习完成" : `${study.index + 1} / ${study.queue.length} · 已同步 ${study.completed}`;
  $("member-study-term").textContent = completed ? "收好了，慢慢记。" : entry.term;
  const context = entry?.selectedSourceContext;
  $("member-study-source").textContent = context ? [context.bookTitle, context.chapterTitle, context.page].filter(Boolean).join(" · ") : "";
  $("member-study-prompt").hidden = completed || study.revealed;
  $("member-study-reveal").hidden = completed || study.revealed;
  $("member-study-answer").hidden = !completed && !study.revealed;
  $("member-study-meaning").textContent = completed ? `本次已确认同步 ${study.completed} 条自评记录。下次到期时间由服务器安排。` : entry.meaning;
  $("member-study-pos").textContent = completed ? "" : context?.partOfSpeech || entry.partOfSpeech || "词性未标注";
  const detailed = state.authType === "github-owner";
  $("member-study-usage").hidden = !detailed;
  $("member-study-example").hidden = !detailed;
  $("member-study-usage").textContent = detailed ? context?.usage || "" : "";
  $("member-study-example").textContent = detailed && context ? [context.exampleEn, context.exampleZh].filter(Boolean).join("\n") : "";
  $("member-study-note").textContent = entry?.note || "";
  $("member-study-ratings").hidden = completed || !study.revealed;
  $("member-study-ratings").disabled = study.busy || state.learningBusy || !state.learningLoaded || Boolean(study.pending);
  $("member-study-close").disabled = study.busy;
  $("member-study-retry").hidden = !study.pending || study.busy || study.conflict;
  $("member-study-retry").disabled = state.learningBusy || !state.learningLoaded;
  $("member-study-retry").textContent = study.pending ? `重试这次自评：${RATING_LABELS[study.pending.rating]}` : "重试这次自评";
  $("member-study-sync").hidden = !study.conflict || study.busy;
  $("member-study-sync").disabled = state.learningBusy;
}

function closeStudy() {
  const study = state.study;
  if (study?.busy) {
    $("member-study-status").textContent = "正在同步这次自评，请等结果返回后再关闭。";
    return;
  }
  if (study?.pending && !window.confirm("这次自评尚未确认，服务器可能已经保存。关闭会离开当前题；下次请先刷新云端记录再继续。仍要关闭吗？")) return;
  $("member-study-dialog").close();
}

function startStudy(mode) {
  if (state.phase !== "ready" || !state.user || !state.learningLoaded || state.entryBusy) return;
  const queue = personalStudyQueue(currentStudyEntries(), state.reviews, { mode });
  if (!queue.length) { status("当前范围没有可学习的中文词条或到期词。", "saved"); return; }
  state.study = { queue, index: 0, completed: 0, revealed: false, busy: false, pending: null, conflict: false };
  $("member-study-status").textContent = "";
  renderStudy();
  if (!$("member-study-dialog").open) $("member-study-dialog").showModal();
}

async function rateStudy(rating) {
  const study = state.study;
  if (!study || !study.revealed || study.busy || state.learningBusy || !state.learningLoaded || state.phase !== "ready" || !state.user || !RATING_LABELS[rating]) return;
  const entry = study.queue[study.index];
  if (!entry) return;
  const token = scope.capture();
  const uid = state.user.id;
  if (!study.pending) {
    const previous = state.reviews.find((review) => review.entryId === entry.id);
    const payload = { rating, revision: previous?.revision || 0 };
    study.pending = { ...payload, mutationId: mutations.idFor(uid, `review:${entry.id}`, payload) };
  }
  study.busy = true;
  $("member-study-status").textContent = "正在同步这次自评…";
  $("member-study-status").dataset.state = "loading";
  renderChrome(); renderStudy();
  const csrf = state.csrfToken;
  try {
    const result = await request((signal) => api.review(entry.id, study.pending, csrf, privateOptions(signal)));
    if (!scope.current(token) || state.study !== study) return;
    const review = validatePersonalReview(result.review);
    if (!Number.isSafeInteger(result.revision) || result.revision < 0 || review.entryId !== entry.id || review.revision <= study.pending.revision) throw new Error("自评结果尚未确认，请重试同一次评分。");
    state.reviews = [...state.reviews.filter((value) => value.entryId !== entry.id), review];
    state.learningRevision = Math.max(state.learningRevision, result.revision);
    mutations.clear(uid, `review:${entry.id}`);
    study.pending = null;
    study.index += 1;
    study.completed += 1;
    study.revealed = false;
    study.conflict = false;
    $("member-study-status").textContent = "已同步到自己的账号。";
    $("member-study-status").dataset.state = "saved";
    renderLearning();
  } catch (error) {
    if (!scope.current(token) || state.study !== study || error?.stale) return;
    if (error.status === 401) { handleFailure(error); return; }
    study.conflict = error.status === 409;
    $("member-study-status").textContent = study.conflict
      ? "其他设备的学习记录已更新。本题没有前进，请先核对云端记录。"
      : `${error.message} 本题和这次选择仍保留，重试不会重复计数。`;
    $("member-study-status").dataset.state = "error";
  } finally { if (scope.current(token) && state.study === study) { study.busy = false; renderChrome(); renderStudy(); } }
}

async function reconcileStudy() {
  const study = state.study;
  if (!study || !study.conflict || study.busy) return;
  const token = scope.capture();
  const confirmed = await loadLearning();
  if (!scope.current(token) || state.study !== study || !confirmed) return;
  const entry = study.queue[study.index];
  if (entry) mutations.clear(state.user.id, `review:${entry.id}`);
  study.pending = null;
  study.conflict = false;
  $("member-study-status").textContent = "已核对云端。本题仍保留，请再次明确选择自评。";
  renderChrome(); renderStudy();
}

async function verifySession() {
  if (!originReady || state.authBusy || state.phase === "recovery") return;
  if (lockMarker()) {
    lockSession("此页已锁定，请重新登录后查看个人词本。");
    return;
  }
  if (verificationTask) return verificationTask;
  const previousUserId = state.user?.id || null;
  if (state.user) captureDraft();
  clearSession();
  state.phase = "checking";
  renderChrome();
  status("正在验证账号…", "loading");
  const task = (async () => {
    try {
      const result = await request((signal) => api.session(privateOptions(signal)));
      if (result.authenticated === false) {
        clearSession();
        state.phase = state.authType === "github-owner" ? "owner-gate" : "signed-out";
        renderChrome();
        status("登录后，你的词条会保存在自己的账号里。", "saved");
        return;
      }
      if (previousUserId && sessionValue(result).user.id !== previousUserId) {
        lockSession("当前浏览器的账号已改变。请明确重新登录后查看自己的词本；旧页面输入没有转给其他人。");
        return;
      }
      adoptSession(result);
      await loadEntries();
    } catch (error) {
      if (error?.stale) return;
      lockSession("暂时无法验证账号。为保护隐私，请重新登录；原有云端词条不会丢失。");
    }
  })();
  verificationTask = task;
  try { await task; } finally { if (verificationTask === task) verificationTask = null; }
}

function recoveryCode(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("服务器未返回有效恢复码，请重新登录核对账号。");
  return value;
}

async function authenticate(kind, event) {
  event.preventDefault();
  if (!originReady || state.authBusy || !["signed-out", "locked"].includes(state.phase)) return;
  let body;
  try {
    body = {
      username: validatePersonalUsername($(`${kind}-username`).value),
      password: validatePersonalPassword($(`${kind}-password`).value)
    };
  } catch (error) { status(error.message, "error"); return; }
  $(`${kind}-password`).value = "";
  state.authType = "member";
  scope.advance();
  const token = scope.capture();
  state.authBusy = true;
  renderChrome();
  status(kind === "register" ? "正在创建你的账号…" : "正在登录…", "loading");
  try {
    const result = await request((signal) => api[kind](body, { signal }));
    if (!scope.current(token)) return;
    const code = kind === "register" ? recoveryCode(result.recoveryCode) : "";
    adoptSession(result, { recoveryCode: code });
    broadcast("changed");
    if (code) status("账号已创建，请先保存恢复码。", "saved");
    else await loadEntries();
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    state.authBusy = false;
    state.phase = "signed-out";
    renderChrome();
    handleFailure(error, kind === "register" ? "注册尚未确认；若账号已创建，请尝试登录" : "登录失败");
  } finally {
    // Do not clear a newer form after an account change. The submitted password
    // was erased from its field before the request started.
    if (scope.current(token)) { state.authBusy = false; renderChrome(); }
    body = null;
  }
}

async function resetPassword(event) {
  event.preventDefault();
  if (!originReady || state.authBusy || !["signed-out", "locked"].includes(state.phase)) return;
  let body;
  try {
    body = { username: validatePersonalUsername($("reset-username").value), recoveryCode: $("reset-recovery-code").value.trim(), newPassword: validatePersonalPassword($("reset-password").value) };
    if (!body.recoveryCode || body.recoveryCode.length > 200) throw new Error("请填写保存的恢复码。");
  } catch (error) { status(error.message, "error"); return; }
  $("reset-password").value = "";
  $("reset-recovery-code").value = "";
  state.authType = "member";
  scope.advance();
  const token = scope.capture();
  state.authBusy = true;
  renderChrome();
  status("正在重设密码…", "loading");
  try {
    const result = await request((signal) => api.resetPassword(body, { signal }));
    if (!scope.current(token)) return;
    if (result.ok !== true) throw new Error("重设结果尚未确认，请重新登录核对。");
    const code = recoveryCode(result.recoveryCode);
    const username = body.username;
    clearSession();
    lockMarker(true);
    state.phase = "recovery";
    state.recovery = { code, username, kind: "reset", token: scope.capture() };
    renderChrome();
    broadcast("locked");
    status("密码已重设。请保存新恢复码，旧码已失效。", "saved");
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    state.authBusy = false;
    renderChrome();
    handleFailure(error, "密码重设未完成");
  } finally { if (scope.current(token)) { state.authBusy = false; renderChrome(); } body = null; }
}

function download(text, filename, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function acknowledgeRecovery() {
  const recovery = state.recovery;
  if (!recovery || !scope.current(recovery.token) || !$("member-recovery-ack").checked) return;
  const { kind, username } = recovery;
  state.recovery = null;
  $("member-recovery-code").textContent = "";
  $("member-recovery-ack").checked = false;
  if (kind === "register") {
    state.phase = "ready";
    renderChrome();
    await loadEntries();
  } else {
    state.phase = "locked";
    state.authView = "login";
    $("login-username").value = username;
    renderChrome();
    status("新恢复码已收好。请使用新密码登录。", "saved");
    $("login-password").focus();
  }
}

function discardAllowed() {
  return !(isPersonalDraftDirty(state.editor) || state.selectedSources.size || state.study?.pending)
    || window.confirm("当前有未保存的输入、勾选或尚未确认的自评，确定放弃当前页面的这些内容吗？");
}

function editEntry(entry) {
  if (state.phase !== "ready" || state.entryBusy || !discardAllowed()) return;
  fillEditor(personalDraft(entry), { focus: true });
  $("member-entry-form").scrollIntoView({ block: "nearest", behavior: "auto" });
}

function showEntry(entry) {
  if (state.phase !== "ready" || !state.user) return;
  detailEntry = entry;
  $("member-detail-term").textContent = entry.term;
  $("member-detail-meaning").textContent = entry.meaning || "中文释义尚待补充。";
  $("member-detail-note").textContent = entry.note;
  $("member-detail-note-section").hidden = !entry.note;
  const context = entry.selectedSourceContext || personalSourceContext(entry, state.collectionId, state.chapterId);
  $("member-detail-pos").textContent = context?.partOfSpeech || entry.partOfSpeech || "词性未标注";
  const detailed = state.authType === "github-owner";
  $("member-detail-source-section").hidden = !context;
  $("member-detail-source").textContent = context ? [context.bookTitle, context.chapterTitle, context.page].filter(Boolean).join(" · ") : "";
  for (const id of ["member-detail-original", "member-detail-definition", "member-detail-usage", "member-detail-example"]) $(id).hidden = !detailed;
  $("member-detail-original").textContent = detailed && context ? [context.originalInput ? `原文形式：${context.originalInput}` : "", context.phonetic].filter(Boolean).join(" · ") : "";
  $("member-detail-definition").textContent = detailed ? context?.definition || "" : "";
  $("member-detail-usage").textContent = detailed ? context?.usage || "" : "";
  $("member-detail-example").textContent = detailed && context ? [context.exampleEn, context.exampleZh].filter(Boolean).join("\n") : "";
  $("member-detail-edit").disabled = state.entryBusy;
  if (!$("member-detail-dialog").open) $("member-detail-dialog").showModal();
}

function renderEntries() {
  if (state.phase !== "ready") { $("member-entry-list").replaceChildren(); return; }
  const query = normalizePublicSearchQuery($("member-search").value);
  renderPrivateScope();
  const entries = filterPersonalEntries(state.entries, state.collectionId, state.chapterId).filter((entry) => !query || normalizePublicSearchQuery([entry.term, entry.meaning, entry.note].join(" ")).includes(query))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
  const rows = entries.map((entry) => {
    const row = document.createElement("article");
    row.className = "personal-entry";
    row.dataset.entryId = entry.id;
    const top = document.createElement("div"); top.className = "entry-topline";
    const term = document.createElement("button"); term.type = "button"; term.className = "entry-term"; term.lang = "en";
    term.textContent = entry.term; term.dataset.action = "view";
    term.setAttribute("aria-label", `查看 ${entry.term}`);
    term.addEventListener("click", () => showEntry(entry));
    const actions = document.createElement("div"); actions.className = "entry-actions";
    for (const [action, label] of [["edit", "编辑"], ["delete", "删除"]]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.dataset.action = action; button.disabled = state.entryBusy || (action === "delete" && (state.listBusy || state.learningBusy));
      if (action === "delete") button.className = "danger";
      button.addEventListener("click", () => action === "edit" ? editEntry(entry) : void deleteEntry(entry));
      actions.append(button);
    }
    top.append(term, actions);
    const meaning = document.createElement("p"); meaning.className = "entry-meaning";
    meaning.textContent = entry.meaning || "中文释义待补充";
    const partOfSpeech = document.createElement("p"); partOfSpeech.className = "entry-pos"; partOfSpeech.textContent = entry.selectedSourceContext?.partOfSpeech || entry.partOfSpeech || "词性未标注";
    row.append(top, partOfSpeech, meaning);
    if (entry.selectedSourceContext) { const source = document.createElement("p"); source.className = "entry-source"; source.textContent = [entry.selectedSourceContext.bookTitle, entry.selectedSourceContext.chapterTitle, entry.selectedSourceContext.page].filter(Boolean).join(" · "); row.append(source); }
    if (entry.note) { const note = document.createElement("p"); note.className = "entry-note"; note.textContent = entry.note; row.append(note); }
    return row;
  });
  $("member-entry-list").replaceChildren(...rows);
  $("member-empty").hidden = entries.length > 0 || !state.entriesLoaded;
  $("member-empty").textContent = query ? "没有匹配的词条。" : "这里还很安静。记下你的第一个词吧。";
  renderLearning();
}

function showConflict(error) {
  try { conflictEntry = validatePersonalEntry(error.details?.existing); } catch { conflictEntry = null; }
  $("member-conflict-message").textContent = error.code === "duplicate_entry"
    ? "这个词已在你的词本里，没有重复新增。当前输入仍保留，可先查看已保存的词条。"
    : "云端版本已改变，没有覆盖它。刷新列表不会替换当前输入；请先核对或复制输入，再重新编辑已保存版本。";
  $("member-conflict-open").hidden = !conflictEntry;
  $("member-conflict").hidden = false;
}

async function saveEntry(event) {
  event.preventDefault();
  if (state.phase !== "ready" || !state.user || state.entryBusy || state.listBusy || !state.entriesLoaded) return;
  const draft = captureDraft();
  let input;
  try { input = validatePersonalInput(draft, { imported: Boolean(draft.sourceContexts?.length) }); }
  catch (error) { status(error.message, "error"); return; }
  const uid = state.user.id;
  const token = scope.capture();
  const slot = draft.id ? `update:${draft.id}` : "create";
  if (draft.sourceContexts?.length && !draft.meaningEdited && draft.meaning === draft.baseline.meaning) {
    input.meaning = state.entries.find((entry) => entry.id === draft.id)?.meaning ?? input.meaning;
  }
  if (draft.sourceContexts?.length) {
    const original = state.entries.find((entry) => entry.id === draft.id);
    if (Object.prototype.hasOwnProperty.call(original || {}, "partOfSpeech")) input.partOfSpeech = original.partOfSpeech;
    else delete input.partOfSpeech;
  }
  const payload = { ...(draft.id ? { revision: draft.revision } : {}), ...input };
  const body = { ...payload, mutationId: mutations.idFor(uid, slot, payload) };
  const csrf = state.csrfToken;
  state.entryBusy = true;
  renderChrome(); renderEntries();
  status("正在保存到你的账号…", "loading");
  try {
    const result = await request((signal) => draft.id ? api.update(draft.id, body, csrf, privateOptions(signal)) : api.add(body, csrf, privateOptions(signal)));
    if (!scope.current(token)) return;
    const entry = validatePersonalEntry(result.entry);
    if (!Number.isSafeInteger(result.revision) || result.revision < 0) throw new Error("保存结果尚未完整确认，请保留当前输入后重试。");
    state.entries = [...state.entries.filter((value) => value.id !== entry.id), entry];
    state.revision = Math.max(state.revision, result.revision);
    mutations.clear(uid, slot);
    drafts.clear(uid);
    fillEditor(personalDraft());
    renderEntries();
    status("已保存到你的私人词本。", "saved");
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    if (error.status === 409 && ["duplicate_entry", "revision_conflict"].includes(error.code)) showConflict(error);
    handleFailure(error, "未确认保存；输入仍保留，可使用相同内容重试");
  } finally { if (scope.current(token)) { state.entryBusy = false; renderChrome(); renderEntries(); } }
}

async function deleteEntry(entry) {
  if (state.phase !== "ready" || !state.user || state.entryBusy || state.listBusy || state.learningBusy) return;
  if (!window.confirm(`从你的私人词本删除“${entry.term}”吗？此操作不会影响公开词库。`)) return;
  const uid = state.user.id;
  const token = scope.capture();
  const slot = `delete:${entry.id}`;
  const payload = { revision: entry.revision };
  const body = { ...payload, mutationId: mutations.idFor(uid, slot, payload) };
  const csrf = state.csrfToken;
  state.entryBusy = true; renderChrome(); renderEntries();
  status("正在删除这个词…", "loading");
  try {
    const result = await request((signal) => api.remove(entry.id, body, csrf, privateOptions(signal)));
    if (!scope.current(token)) return;
    if (!Number.isSafeInteger(result.revision) || result.revision < 0 || result.entry !== null) throw new Error("删除结果尚未完整确认，请刷新核对或重试。");
    mutations.clear(uid, slot);
    state.revision = Math.max(state.revision, result.revision);
    state.entries = state.entries.filter((value) => value.id !== entry.id);
    state.reviews = state.reviews.filter((review) => review.entryId !== entry.id);
    if (state.editor?.id === entry.id) fillEditor(personalDraft());
    if (detailEntry?.id === entry.id && $("member-detail-dialog").open) $("member-detail-dialog").close();
    status("词条已从你的私人词本删除。", "saved");
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    if (error.status === 409) showConflict(error);
    handleFailure(error, "删除尚未确认，可刷新核对或重试");
  } finally { if (scope.current(token)) { state.entryBusy = false; renderChrome(); renderEntries(); } }
}

async function logout() {
  if (state.phase !== "ready" || !state.user || !discardAllowed()) return;
  const csrf = state.csrfToken;
  lockSession("正在退出。个人内容已从此页隐藏…", { discardDrafts: true, notify: true });
  const token = scope.capture();
  // A late logout Set-Cookie must not race an immediate new login in this tab.
  state.authBusy = true;
  renderChrome();
  try {
    await request((signal) => api.logout(csrf, privateOptions(signal)));
    if (!scope.current(token)) return;
    state.phase = state.authType === "github-owner" ? "owner-gate" : "signed-out";
    renderChrome();
    status("已退出。下次需要重新登录。", "saved");
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    status("退出请求未完成，但此页已锁定。请明确重新登录后再查看个人词本。", "locked");
  } finally { if (scope.current(token)) { state.authBusy = false; renderChrome(); } }
}

async function deleteAccount(event) {
  event.preventDefault();
  if (state.phase !== "ready" || !state.user || state.entryBusy || state.authType !== "member") return;
  let body;
  try {
    body = { password: validatePersonalPassword($("delete-account-password").value), confirmation: $("delete-account-confirmation").value };
    if (body.confirmation !== "DELETE") throw new Error("请输入大写 DELETE，确认永久删除账号。");
  } catch (error) { status(error.message, "error"); return; }
  $("delete-account-password").value = "";
  const token = scope.capture();
  const csrf = state.csrfToken;
  state.entryBusy = true;
  renderChrome();
  try {
    const result = await request((signal) => api.deleteAccount(body, csrf, privateOptions(signal)));
    if (!scope.current(token)) return;
    if (result.ok !== true) throw new Error("账号删除结果尚未确认。");
    lockSession(result.deletionPending
      ? "账号已停用并退出，个人数据正在后台清理。公开词库没有改变。"
      : "账号和个人词条已删除。公开词库没有改变。", { discardDrafts: true, notify: true });
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    if (["network_error", "request_timeout"].includes(error.code)) {
      lockSession("删除结果尚未确认，此页已锁定。请重新登录核对；不会自动再次删除。", { discardDrafts: true, notify: true });
    } else handleFailure(error, "账号未删除");
  } finally { if (scope.current(token)) { state.entryBusy = false; renderChrome(); } body = null; }
}

for (const control of document.querySelectorAll("[data-auth-view]")) control.addEventListener("click", () => {
  if (!originReady || state.authBusy) return;
  clearPasswords();
  state.authView = control.dataset.authView;
  renderChrome();
  $(`${state.authView}-username`).focus();
});
$("member-login-form").addEventListener("submit", (event) => void authenticate("login", event));
$("member-register-form").addEventListener("submit", (event) => void authenticate("register", event));
$("member-reset-form").addEventListener("submit", (event) => void resetPassword(event));
$("member-entry-form").addEventListener("submit", (event) => void saveEntry(event));
$("member-entry-form").addEventListener("input", event => {
  if (event.target.id === "member-term" && state.dictionaryApplied && normalizeEnglish(event.target.value) !== normalizeEnglish(state.dictionaryApplied.term)) {
    if ($("member-meaning").value === state.dictionaryApplied.meaning) $("member-meaning").value = "";
    if ($("member-partOfSpeech").value === state.dictionaryApplied.partOfSpeech) $("member-partOfSpeech").value = "";
    state.dictionaryApplied = null;
    if (state.user) dictionaryDraftOrigins.delete(state.user.id);
    status("英文已改变，已清除之前自动填入的词性和释义，请重新查词或自行填写。", "loading");
  }
  captureDraft(); renderChrome();
});
$("member-dictionary-form").addEventListener("submit", event => void queryDictionary(event));
$("member-dictionary-term").addEventListener("input", () => { resetDictionary(); renderChrome(); });
$("member-dictionary-use").addEventListener("click", useDictionaryResult);
$("member-search").addEventListener("input", renderEntries);
$("member-book").addEventListener("change", () => { state.collectionId = $("member-book").value; state.chapterId = "all"; renderEntries(); });
$("member-chapter").addEventListener("change", () => { state.chapterId = $("member-chapter").value; renderEntries(); });
$("member-source-toggle").addEventListener("click", () => void openSource());
$("member-source-close").addEventListener("click", () => {
  $("member-source-panel").hidden = true;
  $("member-source-toggle").setAttribute("aria-expanded", "false");
  $("member-source-toggle").focus();
});
$("member-source-book").addEventListener("change", () => { state.sourceBook = $("member-source-book").value; state.sourceChapter = "all"; state.selectedSources.clear(); renderSource(); });
$("member-source-chapter").addEventListener("change", () => { state.sourceChapter = $("member-source-chapter").value; state.selectedSources.clear(); renderSource(); });
$("member-source-search").addEventListener("input", renderSource);
$("member-source-all").addEventListener("click", () => {
  const saved = new Set(state.entries.flatMap((entry) => (entry.sourceContexts || []).map((context) => context.key)));
  const choices = sourceEntries().filter((entry) => !alreadySelectedSource(state.entries, entry, state.sourceBook, state.sourceChapter, saved));
  if (choices.length > 100) { $("member-source-status").textContent = "当前结果超过 100 条，请切换章节或搜索缩小范围后分批选择。"; return; }
  state.selectedSources = new Set(choices.map((entry) => entry.id));
  renderSource();
});
$("member-source-clear").addEventListener("click", () => { state.selectedSources.clear(); renderSource(); });
$("member-source-add").addEventListener("click", () => void addSelections());
$("member-learning-refresh").addEventListener("click", () => void loadLearning());
$("member-study-all").addEventListener("click", () => startStudy("all"));
$("member-review-due").addEventListener("click", () => startStudy("due"));
$("member-study-reveal").addEventListener("click", () => { if (state.study) { state.study.revealed = true; renderStudy(); } });
for (const button of document.querySelectorAll("[data-member-rating]")) button.addEventListener("click", () => void rateStudy(button.dataset.memberRating));
$("member-study-retry").addEventListener("click", () => { if (state.study?.pending) void rateStudy(state.study.pending.rating); });
$("member-study-sync").addEventListener("click", () => void reconcileStudy());
$("member-study-close").addEventListener("click", closeStudy);
$("member-study-dialog").addEventListener("cancel", (event) => { event.preventDefault(); closeStudy(); });
$("member-study-dialog").addEventListener("close", () => {
  if ($("member-study-dialog").open) return;
  state.study = null;
  for (const id of ["member-study-term", "member-study-meaning", "member-study-usage", "member-study-example", "member-study-note", "member-study-source", "member-study-status"]) $(id).textContent = "";
  renderChrome();
});
$("member-owner-refresh").addEventListener("click", () => { lockMarker(false); state.authType = "github-owner"; state.phase = "checking"; void verifySession(); });
$("member-refresh").addEventListener("click", () => void loadEntries());
for (const id of ["member-new", "member-cancel"]) $(id).addEventListener("click", () => {
  if (state.phase === "ready" && !state.entryBusy && discardAllowed()) fillEditor(personalDraft(), { focus: true });
});
$("member-conflict-open").addEventListener("click", () => { if (conflictEntry) showEntry(conflictEntry); });
$("member-detail-close").addEventListener("click", () => $("member-detail-dialog").close());
$("member-detail-edit").addEventListener("click", () => {
  const entry = detailEntry;
  $("member-detail-dialog").close();
  if (entry) editEntry(entry);
});
$("member-export").addEventListener("click", () => {
  if (state.phase !== "ready" || !state.user || !state.entriesLoaded) return;
  try {
    download(`${serializePersonalExport(state.entries, state.user.username, new Date().toISOString(), state.reviews)}\n`, `my-wordbook-${state.user.username}-${new Date().toISOString().slice(0, 10)}.json`);
    status("已导出个人词条和云端学习记录。文件包含个人内容，请妥善保管。", "saved");
  } catch (error) { handleFailure(error, "导出失败"); }
});
$("member-logout").addEventListener("click", () => void logout());
$("member-recovery-ack").addEventListener("change", renderChrome);
$("member-recovery-continue").addEventListener("click", () => void acknowledgeRecovery());
$("member-recovery-copy").addEventListener("click", async () => {
  const recovery = state.recovery;
  if (!recovery || !scope.current(recovery.token)) return;
  try {
    await navigator.clipboard.writeText(recovery.code);
    if (state.recovery === recovery && scope.current(recovery.token)) status("恢复码已复制，请保存到密码管理器等安全位置。", "saved");
  } catch { if (state.recovery === recovery) status("复制失败，可选中恢复码手动复制。", "error"); }
});
$("member-recovery-download").addEventListener("click", () => {
  const recovery = state.recovery;
  if (!recovery || !scope.current(recovery.token)) return;
  download(`卓的单词本 · 个人账号恢复码\n用户名：${recovery.username}\n恢复码：${recovery.code}\n\n此文件可用于重设密码，请勿分享；重设密码后需保存新恢复码。\n`, `wordbook-recovery-${recovery.username}.txt`, "text/plain;charset=utf-8");
  status("恢复码已导出。请把文件保存在安全位置，不要公开分享。", "saved");
});
$("member-delete-account").addEventListener("click", () => {
  if (state.phase !== "ready" || state.entryBusy) return;
  $("delete-account-form").reset();
  $("delete-account-dialog").showModal();
  $("delete-account-password").focus();
});
$("delete-account-form").addEventListener("submit", (event) => void deleteAccount(event));
$("delete-account-cancel").addEventListener("click", () => $("delete-account-dialog").close());
$("delete-account-dialog").addEventListener("close", () => { if ($("delete-account-dialog").open) return; $("delete-account-password").value = ""; $("delete-account-confirmation").value = ""; });
window.addEventListener("beforeunload", (event) => {
  if (drafts.hasUnsaved() || state.recovery || state.entryBusy || state.study?.pending || state.selectedSources.size) { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("pagehide", () => {
  if (state.user) captureDraft();
  clearSession();
  state.phase = "checking";
  renderChrome();
});
window.addEventListener("pageshow", (event) => {
  if (originReady && event.persisted) void verifySession();
});
window.addEventListener("focus", () => {
  if (originReady && state.phase === "ready" && !state.entryBusy && !state.listBusy) void verifySession();
});
if (channel) channel.onmessage = (event) => {
  if (event.data?.tabId === tabId || !["changed", "locked"].includes(event.data?.type)) return;
  if (state.user) captureDraft();
  lockSession("另一页面的账号状态已改变，请重新登录确认。当前页面的未保存输入未转给其他账号。");
};

// The Pages copy must leave before any credentials can be entered. Never use
// query parameters, referrers, or user-supplied hosts as a redirect destination.
try {
  const target = new URL(personalWordbookUrl());
  if (requestedAuth === "github-owner") target.searchParams.set("auth", "owner");
  else if (requestedAuth === "member") target.searchParams.set("auth", "member");
  if (target.origin !== window.location.origin) window.location.replace(target.href);
  else {
    originReady = true;
    renderChrome();
    setupPwa({ updateBanner: $("update-banner"), applyUpdateButton: $("apply-update"), autoApplyUpdate: false, beforeApplyUpdate: async () => {
      if (state.recovery || state.entryBusy || drafts.hasUnsaved() || state.study?.pending || state.selectedSources.size) throw new Error("请先保存词条、勾选或恢复码，再更新应用。");
    } });
    void verifySession();
  }
} catch {
  status("暂时无法确认安全的登录地址。请从公开词库重新进入“我的词本”。", "error");
}
