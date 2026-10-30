import { personalWordbookUrl } from "./runtime-config.js?v=77";
import { copyPublicNavigationContext } from "./app-navigation.js?v=107";
import { setupPwa } from "./pwa.js?v=77";
import { normalizeEnglish, normalizePublicSearchQuery } from "./wordbook-schema.js?v=82";
import { createPersonalApi } from "./personal-api.js?v=100";
import {
  createPersonalDraftStore, createPersonalExpiryTimer, createPersonalMutationTracker, createPersonalSessionScope,
  isPersonalDraftDirty, personalDraft, serializePersonalExport,
  validatePersonalEntry, validatePersonalInput, validatePersonalList,
  validatePersonalPassword, validatePersonalSession, validatePersonalUsername
} from "./personal-storage.js?v=82";
import { alreadySelectedSource, contextualizePersonalEntry, fetchPersonalPublicCatalog, filterPersonalEntries,
  personalCollectionCatalog, personalSourceContext, publicSelectionCatalog, publicSelectionEntries, selectionPayload } from "./personal-selection.js?v=82";
import { personalRecentHistory, personalStudyQueue, personalStudySummary, validatePersonalLearning, validatePersonalReview } from "./personal-study.js?v=77";
import { lookupPersonalDictionary, preloadPersonalDictionary, searchPersonalDictionaryChinese } from "./personal-dictionary.js?v=97";
import { lookupPersonalDictionaryFast } from "./personal-lookup-flow.js?v=112";
import { mergePersonalDictionaryPage } from "./personal-lookup-flow.js?v=112";
import { automaticDictionaryCollection, createDictionaryCollectionQueue } from "./dictionary-collection.js?v=98";
import { searchExpandedDictionary, searchRelatedChineseDictionary } from "./expanded-dictionary.js?v=112";
import { matchesChineseSearchEntry } from "./chinese-search.js?v=95";
import { createDictionaryPrefill, dictionaryQueryFromHash } from "./dictionary-navigation.js?v=80";
import { createDictionaryExamplesSection } from "./dictionary-examples-ui-v108.js";
import { ownerPublicEntries, publicEntryUrl, reconcileOwnerPublicConfirmations } from "./owner-public-library.js?v=99";
import { normalizeEntrySort, sortWordbookEntries } from "./entry-sort.js?v=100";
import { createPersonalFolderMutation, filterPersonalFolderEntries, serializePersonalFolderExport,
  validatePersonalFolderName, validatePersonalFolderResult, validatePersonalFolders } from "./personal-folders.js?v=100";

const $ = (id) => document.getElementById(id);
const api = createPersonalApi();
const drafts = createPersonalDraftStore();
const dictionaryDraftOrigins = new Map(); // Same-UID, memory-only automatic-fill provenance.
const mutations = createPersonalMutationTracker();
const scope = createPersonalSessionScope();
const expiryTimer = createPersonalExpiryTimer();
const folderMutation = createPersonalFolderMutation();
const LOCK_KEY = "zhuo-member-explicit-login-required"; // Nonsecret logout intent only.
const tabId = crypto.randomUUID();
const authParameter = new URLSearchParams(window.location.search).get("auth");
const requestedAuth = authParameter === "owner" ? "github-owner" : authParameter === "member" ? "member" : "auto";
const takeDictionaryPrefill = createDictionaryPrefill(window.location.hash);
const initialLookup = dictionaryQueryFromHash(window.location.hash);
if (initialLookup) {
  for (const id of ["member-github-owner-link", "member-standard-login-link"]) {
    const link = document.getElementById(id);
    const url = new URL(link.href);
    url.hash = new URLSearchParams({ lookup: initialLookup }).toString();
    link.href = url.href;
  }
}
let channel;
try { channel = new BroadcastChannel("zhuo-member-auth-v1"); } catch { /* Revalidation remains authoritative. */ }
let originReady = false;
let verificationTask = null;
let verificationRecheckQueued = false;
let onlineVerificationTimer = null;
let pendingVerificationUserId = null;
let detailEntry = null;
let conflictEntry = null;
let dictionarySequence = 0;
let dictionaryController = null;
let dictionaryRelatedController = null;
let ownerPublicUserId = null;
let ownerPublicConfirmations = [];
let privateToolsUserId = null;
const detailLearningExamples = createDictionaryExamplesSection({ before: $("member-detail-edit") });
const state = {
  phase: "checking", authView: "login", authBusy: false, user: null, csrfToken: "", expiresAt: "",
  entries: [], revision: 0, entriesLoaded: false, listBusy: false, entryBusy: false,
  editor: null, recovery: null, authType: requestedAuth,
  collectionId: "all", chapterId: "all", reviews: [], learningRevision: 0, learningLoaded: false, learningBusy: false,
  publicSnapshot: null, sourceBusy: false, sourceBook: "all", sourceChapter: "all", selectedSources: new Set(), study: null,
  dictionaryBusy: false, dictionaryResult: null, dictionaryApplied: null, dictionaryCoverage: "full", dictionaryCollectionPhase: "idle",
  dictionaryResults: [], dictionaryQuery: "", dictionaryNextOffset: null, dictionaryHasMore: false, dictionaryMoreBusy: false, dictionaryRelatedIntegrated: false,
  ownerPublicBusy: false, ownerPublicLoaded: false, ownerPublicError: "", ownerPublicLimit: 20,
  folders: [], foldersRevision: 0, foldersLoaded: false, foldersFresh: false, foldersBusy: false, folderWriteBusy: false,
  folderId: "all", folderMessage: "", folderEditor: null,
  entrySort: normalizeEntrySort(new URLSearchParams(window.location.search).get("sort") === "source" ? null : new URLSearchParams(window.location.search).get("sort")),
  lastArchivedFolderId: null, dictionaryPrivateReceipt: null
};
const dictionaryCollector = createDictionaryCollectionQueue({
  collect: (body, { signal, csrfToken }) => api.collectDictionary(body, csrfToken, { signal }),
  onChange(value) {
    if (value.authenticationRequired) { lockSession("公开收录需要重新确认卓的 GitHub 登录；未确认的词保留在此页，登录后可重试。"); return; }
    if (state.phase === "ready" && state.authType === "github-owner" && value.phase === "saved" && value.entry) {
      ownerPublicConfirmations = [{ entry: value.entry, added: value.added },
        ...ownerPublicConfirmations.filter(item => item.entry.id !== value.entry.id)];
      renderOwnerPublic();
    }
    if (state.phase === "ready" && state.authType === "github-owner" && state.dictionaryResult
      && normalizeEnglish(value.term || "") === normalizeEnglish(state.dictionaryResult.term)) {
      state.dictionaryCollectionPhase = value.phase;
      $("member-dictionary-collection-status").hidden = false;
      $("member-dictionary-collection-status").textContent = value.message;
      $("member-dictionary-public-link").hidden = value.phase !== "saved";
      if (value.phase === "saved" && value.entry) $("member-dictionary-public-link").href = publicEntryUrl(value.entry.id);
    }
    renderChrome();
  }
});
const RATING_LABELS = { again: "再来一次", hard: "有点难", good: "记得", easy: "很熟" };
const privateOptions = (signal, extra = {}) => ({ signal, authType: state.authType, ...extra });

function status(message, kind = "saved") {
  $("member-status").textContent = message;
  $("member-status").dataset.state = kind;
  $("member-status").dataset.tone = ["error", "locked"].includes(kind) ? "error" : kind === "saved" ? "success" : "neutral";
}

function clearFolders() {
  folderMutation.clear();
  Object.assign(state, { folders: [], foldersRevision: 0, foldersLoaded: false, foldersFresh: false, foldersBusy: false,
    folderWriteBusy: false, folderId: "all", folderMessage: "", folderEditor: null, lastArchivedFolderId: null });
  for (const id of ["member-folders-status", "member-detail-folders"]) $(id).textContent = "";
  for (const id of ["member-folder-filter", "member-dictionary-folder", "member-entry-folder", "member-source-folder", "member-detail-folder"]) $(id).replaceChildren();
  $("member-folder-name").value = "";
  if ($("member-folder-dialog").open) $("member-folder-dialog").close();
}

function renderFolders() {
  const ready = state.phase === "ready" && Boolean(state.user);
  const pending = folderMutation.snapshot(state.user?.id);
  const available = ready && state.foldersLoaded;
  const writable = available && !state.folderWriteBusy && !state.entryBusy && !pending;
  const custom = state.folders.map(folder => ({ id: folder.id, title: folder.name }));
  if (state.foldersLoaded && state.folderId !== "all" && state.folderId !== "unfiled" && !state.folders.some(folder => folder.id === state.folderId)) state.folderId = "all";
  selectOptions($("member-folder-filter"), [{ id: "all", title: "全部词条" }, { id: "unfiled", title: "未分类" }, ...custom], state.folderId);
  $("member-folder-filter").disabled = !available;
  $("member-sort").value = state.entrySort;
  $("member-sort").disabled = !ready;
  for (const id of ["member-dictionary-folder", "member-entry-folder", "member-source-folder"]) {
    const selected = $(id).value;
    selectOptions($(id), [{ id: "unfiled", title: "未分类 / 不另归类" }, ...custom], custom.some(folder => folder.id === selected) ? selected : "unfiled");
    $(id).disabled = !ready || state.entryBusy || state.folderWriteBusy || Boolean(pending);
  }
  $("member-folder-new").disabled = !writable || state.folders.length >= 50;
  $("member-dictionary-folder-new").disabled = !writable || state.folders.length >= 50;
  $("member-dictionary-folder-new").hidden = !state.dictionaryResult;
  for (const id of ["member-folder-rename", "member-folder-delete"]) $(id).disabled = !writable || !state.folders.some(folder => folder.id === state.folderId);
  $("member-folders-refresh").disabled = !ready || state.foldersBusy || state.folderWriteBusy;
  $("member-folders-status").textContent = state.folderMessage || (state.foldersBusy ? "正在读取收藏夹…" : "");
  $("member-folder-retry").hidden = !pending;
  $("member-folder-dismiss").hidden = !pending;
  $("member-folder-retry").disabled = !ready || state.folderWriteBusy || state.entryBusy;
  $("member-folder-dismiss").disabled = !ready || state.folderWriteBusy;
  $("member-folder-retry").textContent = pending?.afterSave ? "只重试这次归类" : "重试这次分类操作";
  $("member-folder-save").disabled = !ready || state.folderWriteBusy || Boolean(state.folderEditor?.needsReopen);
  $("member-folder-save").textContent = pending ? "重试同一操作" : "保存分类";
  $("member-folder-name").readOnly = Boolean(pending);
  $("member-folder-name-hint").textContent = $("member-folder-dialog").open && state.folderMessage ? state.folderMessage : "最多40个字符，仅自己可见。";
  $("member-dictionary-save").disabled = !ready || !state.entriesLoaded || state.listBusy || state.entryBusy
    || state.dictionaryBusy || !state.dictionaryResult || state.folderWriteBusy || Boolean(pending);
  $("member-source-folder-label").hidden = $("member-source-panel").hidden;
  const recentFolder = state.folders.find(folder => folder.id === state.lastArchivedFolderId);
  $("member-folder-locate").hidden = !ready || !recentFolder || recentFolder.id === state.folderId;
  $("member-folder-locate").textContent = recentFolder ? `查看“${recentFolder.name}”` : "查看刚归类的词";
  const detailSelection = $("member-detail-folder").value;
  selectOptions($("member-detail-folder"), custom.length ? custom : [{ id: "", title: "先新建收藏夹" }],
    custom.some(folder => folder.id === detailSelection) ? detailSelection : custom.some(folder => folder.id === state.folderId) ? state.folderId : custom[0]?.id || "");
  $("member-detail-folder").disabled = !writable || !custom.length;
  const target = state.folders.find(folder => folder.id === $("member-detail-folder").value);
  const included = target?.entryIds.includes(detailEntry?.id);
  $("member-detail-folder-add").disabled = !writable || !detailEntry || !target || included;
  $("member-detail-folder-remove").disabled = !writable || !detailEntry || !target || !included;
  $("member-detail-folders").textContent = detailEntry && available
    ? state.folders.filter(folder => folder.entryIds.includes(detailEntry.id)).map(folder => folder.name).join(" · ") || "未分类"
    : ready ? "分类尚未读取，可稍后刷新。" : "";
}

async function loadFolders({ clearMessage = true } = {}) {
  if (state.phase !== "ready" || !state.user || state.foldersBusy || state.folderWriteBusy) return false;
  const token = scope.capture(), uid = state.user.id;
  const initiallyLoaded = state.foldersLoaded;
  state.foldersBusy = true; state.foldersFresh = false; renderFolders();
  try {
    const result = validatePersonalFolders(await request(signal => api.folders(privateOptions(signal, { expectedUserId: uid }))));
    if (!scope.current(token)) return false;
    if (result.revision >= state.foldersRevision) { state.folders = result.folders; state.foldersRevision = result.revision; }
    state.foldersLoaded = true;
    state.foldersFresh = true;
    if (clearMessage && !folderMutation.hasPending()) state.folderMessage = "";
    if (!initiallyLoaded) selectFolder(state.folderId);
    renderFolders(); renderEntries(); return true;
  } catch (error) {
    if (scope.current(token) && !error?.stale) {
      if (error.status === 401) handleFailure(error);
      else state.folderMessage = "收藏夹暂时未读取，查词和保存仍可使用。点击“刷新分类”重试。";
    }
    return false;
  } finally { if (scope.current(token)) { state.foldersBusy = false; renderFolders(); } }
}

async function executeFolderMutation() {
  const operation = folderMutation.snapshot(state.user?.id);
  if (!operation || state.phase !== "ready" || !state.user || state.folderWriteBusy) return false;
  const token = scope.capture(), csrf = state.csrfToken;
  let reload = false;
  state.folderWriteBusy = true; state.folderMessage = operation.afterSave ? `${operation.label}已保存，正在确认归类…` : "正在保存分类…";
  renderChrome();
  try {
    const result = validatePersonalFolderResult(await request(signal => {
      const options = { signal, authType: operation.authType, expectedUserId: operation.userId };
      if (operation.kind === "create") return api.createFolder(operation.body, csrf, options);
      if (operation.kind === "rename") return api.renameFolder(operation.folderId, operation.body, csrf, options);
      if (operation.kind === "delete") return api.removeFolder(operation.folderId, operation.body, csrf, options);
      return api.folderEntries(operation.folderId, operation.body, csrf, options);
    }), operation.folderId);
    if (!scope.current(token)) return false;
    const expectedAction = operation.kind === "create" ? "created" : operation.kind === "delete" ? "deleted" : "updated";
    if (![expectedAction, "idempotent"].includes(result.action)) throw new Error("分类操作返回的状态不一致。");
    // A newer complete snapshot wins over an older mutation response. Replays
    // return today's folder, not a historical membership list to resurrect.
    if (result.revision >= state.foldersRevision) {
      state.folders = state.folders.filter(folder => folder.id !== (result.folder?.id || operation.folderId));
      if (result.folder) state.folders.push(result.folder);
      state.foldersRevision = result.revision;
    }
    folderMutation.clear();
    const current = state.folders.find(folder => folder.id === (result.folder?.id || operation.folderId));
    const confirmed = operation.kind === "delete" ? !current : operation.kind === "entries"
      ? Boolean(current && operation.body.entryIds.every(id => current.entryIds.includes(id) === (operation.body.mode === "add")))
      : Boolean(current && current.name === operation.body.name);
    state.folderMessage = operation.afterSave
      ? confirmed ? `${operation.label}已保存，已存入“${current?.name || "收藏夹"}”。` : `${operation.label}已保存；云端最新分类已改变，未确认目标归类。请核对后重新选择。`
      : !confirmed ? "云端最新分类已改变，本次操作未确认。已读取最新状态，请核对后重新操作。"
        : operation.kind === "delete" ? "分类已删除，词条和复习记录仍保留。" : "收藏夹已同步。";
    if (operation.kind === "create" && current && confirmed) selectFolder(current.id);
    if (operation.kind === "entries" && operation.body.mode === "add" && confirmed) state.lastArchivedFolderId = operation.folderId;
    if (operation.afterSave) updateDictionaryPrivateReceipt(operation.body.entryIds || [], state.folderMessage);
    if ($("member-folder-dialog").open) $("member-folder-dialog").close();
    renderEntries(); renderFolders();
    return confirmed;
  } catch (error) {
    if (!scope.current(token) || error?.stale) return false;
    if (error.status === 401) { handleFailure(error); return false; }
    // Definitive conflicts need a fresh, explicit user decision, not a silent
    // rewrite of the old revision/body under its existing mutation ID.
    const definitive = error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
    if (definitive) { folderMutation.clear(); reload = true; }
    state.folderMessage = `${operation.afterSave ? `${operation.label}已保存，但归类` : "分类操作"}未确认。${definitive
      ? `${error.message || "云端版本已改变"} 请刷新分类，核对后重新操作。`
      : "可显式重试同一操作；不会重新创建词条。"}`;
    if (error.code === "revision_conflict" && state.folderEditor?.id) {
      state.folderEditor.needsReopen = true;
      state.folderMessage += " 当前名称输入仍保留；请关闭窗口，核对最新分类后重新选择改名。";
    }
    if (operation.afterSave) status(state.folderMessage, "error");
    if (operation.afterSave) updateDictionaryPrivateReceipt(operation.body.entryIds || [], state.folderMessage);
    return false;
  } finally { if (scope.current(token)) { state.folderWriteBusy = false; renderChrome(); renderEntries(); if (reload) void loadFolders({ clearMessage: false }); } }
}

async function changeFolder(kind, folder, body, { afterSave = false, label = "词条" } = {}) {
  if (state.phase !== "ready" || !state.user || state.folderWriteBusy) return false;
  try {
    folderMutation.begin({ userId: state.user.id, authType: state.authType, kind, folderId: folder?.id || null, afterSave, label, body });
    return await executeFolderMutation();
  } catch (error) { state.folderMessage = error.message; renderFolders(); return false; }
}

async function archiveSavedEntries(entryIds, folderId, label) {
  if (folderId === "unfiled") return true; // Never erase an existing word's other memberships.
  if (folderMutation.hasPending()) {
    state.folderMessage = `${label}已保存；另一次分类操作尚未确认，本次尚未归类。请先核对原操作，再从词卡归类。`;
    status(state.folderMessage, "error"); updateDictionaryPrivateReceipt(entryIds, state.folderMessage); renderFolders(); return false;
  }
  const folder = state.folders.find(value => value.id === folderId);
  if (!folder) { state.folderMessage = `${label}已保存；目标收藏夹已不存在，未归类。请刷新后重新选择。`; status(state.folderMessage, "error"); renderFolders(); return false; }
  return changeFolder("entries", folder, { entryIds: [...new Set(entryIds)], mode: "add", revision: folder.revision }, { afterSave: true, label });
}

function openFolderEditor(rename = false) {
  if (state.phase !== "ready" || !state.foldersLoaded || state.folderWriteBusy || folderMutation.hasPending()) return;
  const folder = rename ? state.folders.find(value => value.id === state.folderId) : null;
  if (rename && !folder) return;
  state.folderEditor = folder ? { id: folder.id, revision: folder.revision } : { id: null };
  $("member-folder-title").textContent = rename ? "重命名收藏夹" : "新建收藏夹";
  $("member-folder-name").value = folder?.name || "";
  state.folderMessage = "";
  $("member-folder-dialog").showModal(); renderFolders(); $("member-folder-name").focus();
}

async function saveFolder(event) {
  event.preventDefault();
  if (folderMutation.hasPending()) { await executeFolderMutation(); return; }
  if (!state.folderEditor || state.phase !== "ready") return;
  let name;
  try { name = validatePersonalFolderName($("member-folder-name").value); }
  catch (error) { state.folderMessage = error.message; renderFolders(); return; }
  const editor = state.folderEditor;
  await changeFolder(editor.id ? "rename" : "create", editor.id ? editor : null,
    { name, ...(editor.id ? { revision: editor.revision } : {}) });
}

async function deleteFolder() {
  const folder = state.folders.find(value => value.id === state.folderId);
  if (!folder || state.folderWriteBusy || folderMutation.hasPending() || state.phase !== "ready") return;
  if (!window.confirm(`删除收藏夹“${folder.name}”吗？只删除分类，所有词条和复习记录都会保留。`)) return;
  await changeFolder("delete", folder, { revision: folder.revision });
}

function selectFolder(folderId) {
  state.folderId = folderId;
  renderFolders();
  const target = state.folders.some(folder => folder.id === folderId) ? folderId : "unfiled";
  for (const id of ["member-dictionary-folder", "member-entry-folder", "member-source-folder"]) $(id).value = target;
  renderEntries(); renderFolders();
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
  clearFolders();
  detailLearningExamples.clear();
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
  // A query change must not abort a write. An account check must: retain its
  // unconfirmed operation key for explicit retry by the same verified UID.
  if (discardDrafts) dictionaryCollector.clear();
  else dictionaryCollector.pause();
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
  if (discardDrafts) { drafts.clear(); mutations.clear(); dictionaryDraftOrigins.clear(); dictionaryCollector.clear(); }
  state.ownerPublicBusy = false;
  if (discardDrafts) { ownerPublicUserId = null; ownerPublicConfirmations = []; privateToolsUserId = null; }
  $("member-owner-public-recent").replaceChildren();
  $("member-owner-public-list").replaceChildren();
  clearPrivateDom();
}

function lockSession(message, { discardDrafts = false, notify = false } = {}) {
  cancelOnlineVerification();
  verificationRecheckQueued = false;
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
  $("member-session-retry").hidden = state.phase !== "verification-unavailable";
  $("member-session-retry").disabled = !originReady || state.authBusy;
  $("member-remember-login").disabled = !originReady || !auth || state.authBusy;
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
  $("member-export").disabled = !ready || state.entryBusy || !state.entriesLoaded || !state.learningLoaded || state.learningBusy;
  $("member-save").disabled = !ready || state.entryBusy || !state.entriesLoaded
    || state.listBusy
    || !state.editor?.term.trim() || Boolean(state.editor?.id && !isPersonalDraftDirty(state.editor));
  $("member-save").textContent = state.entryBusy ? "正在保存…" : "保存到我的词本";
  // Learning now settles independently of the entry list. Refresh existing
  // action controls on both edges of that load without rebuilding focused rows.
  for (const button of $("member-entry-list").querySelectorAll("button[data-action]")) {
    if (["edit", "delete"].includes(button.dataset.action)) button.disabled = !ready || state.entryBusy
      || button.dataset.action === "delete" && (state.listBusy || state.learningBusy);
  }
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
  const pendingLookup = takeDictionaryPrefill(ready, $("member-dictionary-term").value);
  if (pendingLookup) $("member-dictionary-term").value = pendingLookup;
  $("member-dictionary-search").disabled = !ready || state.dictionaryBusy;
  $("member-dictionary-search").textContent = state.dictionaryBusy ? "正在查…" : state.authType === "github-owner" ? "查词并收录" : "查词";
  $("member-dictionary-full").disabled = !ready || state.dictionaryBusy;
  $("member-dictionary-full").hidden = !["basic", "limited"].includes(state.dictionaryCoverage);
  $("member-dictionary-full").textContent = state.dictionaryCoverage === "limited" ? "重试完整检索" : "搜索完整词典";
  // A previously cached HTML shell can briefly precede its new module graph.
  const moreButton = $("member-dictionary-more");
  if (moreButton) {
    moreButton.hidden = !state.dictionaryHasMore || !Number.isSafeInteger(state.dictionaryNextOffset);
    moreButton.disabled = !ready || state.dictionaryBusy || state.dictionaryMoreBusy;
    moreButton.textContent = state.dictionaryMoreBusy ? "正在加载…" : "查看更多";
  }
  const publicCollection = state.authType === "github-owner";
  const ownerReady = ready && publicCollection;
  document.body.classList.toggle("owner-workspace", ownerReady);
  $("member-owner-public-panel").hidden = !ownerReady;
  $("member-private-tools").querySelector("summary").textContent = ownerReady ? "原有私人记录（不公开）" : "私人学习与手动记录";
  $("member-heading").textContent = publicCollection ? "卓的公开词本" : "我的词本";
  $("member-heading-note").textContent = publicCollection ? "查词后直接公开收录，刚加的词就在下方。" : "记下英文，也留下自己的理解。";
  $("member-workspace").setAttribute("aria-label", ownerReady ? "卓的查词与公开词本" : "私人单词本");
  $("member-privacy-badge").textContent = publicCollection ? "查词公开收录 · 学习记录私有" : "仅自己可见";
  $("member-privacy-note").textContent = publicCollection
    ? "查词公开收录；私人词条与学习记录不会自动公开。"
    : "个人词条与学习记录默认私有，不进入公开 GitHub。普通账号请妥善保存恢复码。";
  $("member-dictionary-note").textContent = publicCollection
    ? "按 Enter 查词并公开收录；多个结果时，点选要收录的词。"
    : "按 Enter 查询，选择收藏夹直接存入；也可先填入草稿再修改。不调用在线翻译或 AI。";
  $("member-dictionary-use").disabled = !ready || state.dictionaryBusy || !state.dictionaryResult
    || (publicCollection ? ["queued", "saving", "saved"].includes(state.dictionaryCollectionPhase) : state.entryBusy || !state.entriesLoaded || state.listBusy);
  $("member-dictionary-use").textContent = publicCollection
    ? state.dictionaryCollectionPhase === "queued" ? "已排队收录" : state.dictionaryCollectionPhase === "saving" ? "正在公开收录…" : state.dictionaryCollectionPhase === "saved" ? "已在公开词库" : state.dictionaryCollectionPhase === "error" ? "重试公开收录" : "收录到卓的公开词库"
    : "填入新词草稿";
  $("member-dictionary-use").hidden = publicCollection && state.dictionaryCollectionPhase === "saved";
  renderDictionaryQueue();
  $("member-owner-public-refresh").disabled = !ownerReady || state.ownerPublicBusy;
  for (const id of ["member-source-book", "member-source-chapter", "member-source-search", "member-source-all", "member-source-clear"]) $(id).disabled = !ready || state.entryBusy || state.sourceBusy;
  $("member-source-add").disabled = !ready || !state.entriesLoaded || state.entryBusy || state.listBusy || state.sourceBusy || state.selectedSources.size === 0;
  $("member-source-selected-count").textContent = `已选 ${state.selectedSources.size} / 100`;
  $("member-source-list").setAttribute("aria-busy", String(state.sourceBusy));
  $("member-learning-refresh").disabled = !ready || state.learningBusy || state.entryBusy || Boolean(state.study?.busy || state.study?.pending);
  renderLearning();
  if (state.study) renderStudy();
  renderFolders();
  const receipt = state.dictionaryPrivateReceipt;
  $("member-dictionary-private-open").disabled = !ready || !receipt || !state.entries.some(entry => entry.id === receipt.entryId && entry.normalized === receipt.normalized);
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
  cancelOnlineVerification();
  pendingVerificationUserId = null;
  const authType = session.authType || "member";
  if (state.authType !== "auto" && state.authType !== authType) throw new Error("登录方式已改变，请明确选择账号后重试。");
  if (authType !== "github-owner" || dictionaryCollector.snapshot().userId !== session.user.id) dictionaryCollector.clear();
  expiryTimer.clear();
  scope.advance(session.user.id);
  clearPrivateDom();
  state.user = { id: session.user.id, username: session.user.username };
  state.authType = authType;
  if (ownerPublicUserId !== session.user.id || authType !== "github-owner") {
    ownerPublicUserId = authType === "github-owner" ? session.user.id : null;
    ownerPublicConfirmations = [];
    state.ownerPublicLoaded = false;
    state.ownerPublicError = "";
    $("member-owner-public-search").value = "";
    state.ownerPublicLimit = 20;
  }
  if (privateToolsUserId !== session.user.id) {
    $("member-private-tools").open = authType !== "github-owner";
    privateToolsUserId = session.user.id;
  }
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
  renderOwnerPublic();
  if (authType === "github-owner") void loadOwnerPublic();
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
    // An independently authenticated learning read must not block adding words.
    // Study/ratings/export retain their own learningLoaded/learningBusy guards.
    state.listBusy = false;
    void loadLearning({ announce: false });
    void loadFolders();
    renderChrome();
    if (!scope.current(token) || state.phase !== "ready") return false;
    if (announce) status(state.authType === "github-owner" ? "" : "已读取云端词本；当前编辑内容未被替换。", "saved");
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
  clearDictionaryPrivateReceipt();
  state.dictionaryCollectionPhase = "idle";
  $("member-dictionary-collection-status").hidden = true;
  $("member-dictionary-collection-status").textContent = "";
  $("member-dictionary-public-link").hidden = true;
  dictionarySequence++;
  dictionaryController?.abort(); dictionaryController = null;
  dictionaryRelatedController?.abort(); dictionaryRelatedController = null;
  state.dictionaryBusy = false; state.dictionaryResult = null;
  state.dictionaryCoverage = "full";
  state.dictionaryResults = []; state.dictionaryQuery = ""; state.dictionaryNextOffset = null;
  state.dictionaryHasMore = false; state.dictionaryMoreBusy = false; state.dictionaryRelatedIntegrated = false;
  const moreStatus = $("member-dictionary-more-status");
  if (moreStatus) moreStatus.textContent = "";
  $("member-dictionary-result").hidden = true;
  $("member-dictionary-choices").replaceChildren();
  $("member-dictionary-choices").hidden = true;
  $("member-dictionary-alternatives").replaceChildren();
  for (const id of ["member-dictionary-word", "member-dictionary-pos", "member-dictionary-meaning", "member-dictionary-status"]) $(id).textContent = "";
}

function showDictionaryResult(result) {
  clearDictionaryPrivateReceipt();
  state.dictionaryCollectionPhase = "idle";
  $("member-dictionary-collection-status").hidden = true;
  $("member-dictionary-public-link").hidden = true;
  state.dictionaryResult = result;
  $("member-dictionary-word").textContent = result.term;
  $("member-dictionary-pos").textContent = result.partOfSpeech || "词性未标注";
  $("member-dictionary-meaning").textContent = result.meaning;
  $("member-dictionary-result").hidden = false;
  const queued = dictionaryCollector.snapshot().items.find(item => item.phase !== "saved" && normalizeEnglish(item.term) === normalizeEnglish(result.term));
  if (state.authType === "github-owner" && queued) {
    state.dictionaryCollectionPhase = queued.phase;
    $("member-dictionary-collection-status").hidden = false;
    $("member-dictionary-collection-status").textContent = queued.message;
    $("member-dictionary-public-link").hidden = queued.phase !== "saved";
    const saved = ownerPublicConfirmations.find(item => normalizeEnglish(item.entry.term) === normalizeEnglish(result.term));
    if (queued.phase === "saved" && saved) $("member-dictionary-public-link").href = publicEntryUrl(saved.entry.id);
  }
  const alreadySaved = state.entriesLoaded && state.entries.some(entry => entry.normalized === normalizeEnglish(result.term));
  const destination = state.authType === "github-owner" ? "公开收录后可在下方词本找到" : alreadySaved ? "已在你的词本中，不会重复添加" : "查询不会自动加入词本";
  $("member-dictionary-status").textContent = `${result.matchType === "related" ? `近义关联：${result.matchedChinese} · ` : ""}${result.matchedSense ? `本次匹配：${result.matchedPartOfSpeech} · ${result.matchedSense}（限此义项） · ` : ""}${state.dictionaryCoverage === "basic" && result.matchType !== "related" ? "基础词库结果（非完整搜索）；还可点击“搜索完整词典”查更多词。" : state.dictionaryCoverage === "limited" ? "当前仅显示部分匹配，完整检索索引尚未更新，请刷新后重试。" : ""}来自${result.source || "本站词库"}${result.license === "MIT" ? " · MIT" : ""}${result.matchedForm ? ` · 已识别词形 ${result.matchedForm}` : ""}；${destination}。${result.warning || "具体含义请结合语境。"}`;
  const alternatives = $("member-dictionary-alternatives");
  alternatives.replaceChildren();
  for (const variant of result.alternatives || []) {
    const details = document.createElement("details");
    const title = document.createElement("summary"); title.textContent = variant.source || "其他来源释义";
    const text = document.createElement("p"); text.className = "multiline"; text.textContent = `${variant.partOfSpeech || ""}\n${variant.meaning}`;
    const use = document.createElement("button"); use.type = "button"; use.textContent = "选择此释义";
    // Public collection deliberately revalidates the canonical server record;
    // it must not pretend a displayed alternative will be the published gloss.
    use.hidden = state.authType === "github-owner";
    use.addEventListener("click", () => {
      if (state.phase !== "ready" || !state.user || state.dictionaryBusy) return;
      showDictionaryResult({ ...variant, term: result.term,
        ...(result.matchType === "related" && matchesChineseSearchEntry(result.term, variant.meaning, result.matchedChinese)
          ? { matchType: "related", matchedChinese: result.matchedChinese } : {}) }); renderChrome();
    });
    details.append(title, text, use); alternatives.append(details);
  }
}

function showDictionaryChoices(results, hasMore) {
  const choices = $("member-dictionary-choices");
  const focused = choices.contains(document.activeElement) ? document.activeElement.dataset.dictionaryTerm : null;
  const previousScroll = choices.scrollTop;
  state.dictionaryResults = results;
  choices.replaceChildren(); choices.hidden = results.length < 2 && !hasMore;
  if (choices.hidden) return;
  const caption = document.createElement("p"); caption.className = "field-note";
  const relatedCount = results.filter(result => result.matchType === "related").length;
  caption.textContent = state.dictionaryCoverage === "basic" ? `基础词库先显示 ${results.length - relatedCount} 项${relatedCount ? `，另有 ${relatedCount} 项近义关联` : ""}，完整词典还可能有其他匹配。点选英文查看释义。`
    : hasMore ? `已显示 ${results.length} 项，可点击“查看更多”。点选英文查看释义。` : `找到 ${results.length} 项，点选英文查看释义。`;
  if (relatedCount && state.dictionaryCoverage !== "basic") caption.textContent += ` 其中 ${relatedCount} 项为近义关联，按实际词义选择。`;
  if (state.authType === "github-owner") caption.textContent = caption.textContent.replace("点选英文查看释义。", "点选英文即公开收录。");
  choices.append(caption);
  for (const result of results) {
    const button = document.createElement("button"); button.type = "button"; button.className = "dictionary-choice";
    button.dataset.dictionaryTerm = result.term;
    if (state.authType === "github-owner") button.setAttribute("aria-label", `公开收录 ${result.term}`);
    const term = document.createElement("strong"); term.lang = "en"; term.textContent = result.term;
    const preview = document.createElement("span"); preview.textContent = `${result.partOfSpeech || ""} · ${result.meaning.replace(/\s+/gu, " ").slice(0, 110)}`;
    button.append(term, preview);
    if (result.matchType === "related") {
      button.dataset.dictionaryMatch = "related";
      const relation = document.createElement("span"); relation.className = "dictionary-related-note";
      relation.textContent = `近义关联：${result.matchedChinese}`; button.append(relation);
    }
    button.addEventListener("click", () => {
      if (state.phase !== "ready" || !state.user || state.dictionaryBusy) return;
      showDictionaryResult(result);
      if (state.authType === "github-owner") void collectDictionaryResult();
      renderChrome();
    });
    choices.append(button);
  }
  choices.scrollTop = previousScroll;
  if (focused) [...choices.querySelectorAll("button[data-dictionary-term]")].find(button => button.dataset.dictionaryTerm === focused)?.focus({ preventScroll: true });
}

function startDictionaryRelations(query, direct, { token, sequence }) {
  if (direct.relatedIntegrated === true) return;
  if (!/\p{Script=Han}/u.test(query)) return;
  const controller = new AbortController(); dictionaryRelatedController = controller;
  const current = () => !controller.signal.aborted && scope.current(token) && sequence === dictionarySequence
    && state.phase === "ready" && state.user && query === $("member-dictionary-term").value;
  // Related meanings are optional public reads. They never hold the main
  // search/save controls busy, replace a selected card, or trigger collection.
  void Promise.resolve().then(() => {
    if (!current()) return null;
    return searchRelatedChineseDictionary(query, { signal: controller.signal, limit: 8, timeoutMs: 5000 });
  }).then(response => {
    if (!response || !current()) return;
    const results = [...state.dictionaryResults], seen = new Set(results.map(result => normalizeEnglish(result.term)));
    for (const result of response.results) {
      const key = normalizeEnglish(result.term);
      if (seen.has(key)) continue;
      seen.add(key); results.push(result);
    }
    if (results.length === state.dictionaryResults.length) return;
    showDictionaryChoices(results, state.dictionaryHasMore);
    if (!state.dictionaryResult) showDictionaryResult(results[0]);
    renderChrome();
  }).catch(() => { /* Optional failure leaves every direct result usable. */ })
    .finally(() => { if (dictionaryRelatedController === controller) dictionaryRelatedController = null; });
}

async function queryDictionary(event, { full = false } = {}) {
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
      try {
        return await lookupPersonalDictionaryFast(query, { signal: controller.signal, full, preferCompleteChinese: true,
          hotLookup: lookupPersonalDictionary, hotReverse: searchPersonalDictionaryChinese, fullSearch: searchExpandedDictionary });
      }
      finally { signal.removeEventListener("abort", stop); }
    });
    if (!scope.current(token) || sequence !== dictionarySequence || query !== $("member-dictionary-term").value) return;
    state.dictionaryCoverage = result.coverage || "full";
    state.dictionaryRelatedIntegrated = result.relatedIntegrated === true;
    state.dictionaryQuery = query;
    state.dictionaryNextOffset = Number.isSafeInteger(result.nextOffset) ? result.nextOffset : null;
    state.dictionaryHasMore = Boolean(!["limited", "basic"].includes(result.coverage) && result.hasMore && state.dictionaryNextOffset !== null);
    state.dictionaryResults = result.results;
    const results = result.results;
    if (!state.dictionaryRelatedIntegrated) startDictionaryRelations(query, result, { token, sequence });
    if (!results.length) {
      $("member-dictionary-status").textContent = result.hasMore
        ? "相关候选较多，暂未定位到匹配项；请输入更具体的中文释义再查。"
        : "本站词典与已发布词条中未找到可用释义。请核对拼写，也可先记下这个词，稍后补充；不会编造释义。";
      return;
    }
    showDictionaryChoices(results, state.dictionaryHasMore);
    showDictionaryResult(results[0]);
    if (state.authType === "github-owner" && automaticDictionaryCollection(query, result)) void collectDictionaryResult();
  } catch (error) {
    if (scope.current(token) && sequence === dictionarySequence && !error?.stale) $("member-dictionary-status").textContent = `${error.message} 没有调用在线翻译或 AI，可重试。`;
  } finally {
    if (scope.current(token) && sequence === dictionarySequence) { state.dictionaryBusy = false; dictionaryController = null; renderChrome(); }
  }
}

async function moreDictionaryResults(event) {
  event.preventDefault();
  if (state.phase !== "ready" || !state.user || state.dictionaryBusy || state.dictionaryMoreBusy
    || !state.dictionaryHasMore || !Number.isSafeInteger(state.dictionaryNextOffset)) return;
  const query = state.dictionaryQuery, sequence = dictionarySequence, token = scope.capture();
  if (query !== $("member-dictionary-term").value) return;
  const controller = new AbortController(); dictionaryController = controller;
  state.dictionaryMoreBusy = true; $("member-dictionary-more-status").textContent = ""; renderChrome();
  try {
    const page = await searchExpandedDictionary(query, { signal: controller.signal, limit: 20, offset: state.dictionaryNextOffset });
    if (!scope.current(token) || sequence !== dictionarySequence || controller.signal.aborted
      || query !== $("member-dictionary-term").value || state.phase !== "ready") return;
    if (["limited", "basic"].includes(page.coverage)) {
      state.dictionaryCoverage = page.coverage; state.dictionaryNextOffset = null; state.dictionaryHasMore = false;
      $("member-dictionary-more-status").textContent = page.coverage === "basic"
        ? "完整中文检索暂不可用，请重试查询；已显示的词条仍可查看。"
        : "完整检索索引尚未更新，请刷新后重试；已显示的词条仍可查看。";
      return;
    }
    const results = mergePersonalDictionaryPage(state.dictionaryResults, page, { relatedIntegrated: state.dictionaryRelatedIntegrated });
    state.dictionaryRelatedIntegrated ||= page.relatedIntegrated === true;
    const next = Number.isSafeInteger(page.nextOffset) && page.nextOffset > state.dictionaryNextOffset ? page.nextOffset : null;
    state.dictionaryNextOffset = next; state.dictionaryHasMore = Boolean(page.hasMore && next !== null);
    showDictionaryChoices(results, state.dictionaryHasMore);
    $("member-dictionary-more-status").textContent = `已显示 ${results.length} 项${results.some(row => row.matchType === "related") ? "（含近义关联）" : ""}。`;
  } catch (error) {
    if (scope.current(token) && sequence === dictionarySequence && !controller.signal.aborted) {
      $("member-dictionary-more-status").textContent = "暂时无法加载更多，已有结果仍可查看。请点击“查看更多”重试。";
    }
  } finally {
    if (scope.current(token) && sequence === dictionarySequence) { state.dictionaryMoreBusy = false; dictionaryController = null; renderChrome(); }
  }
}

function useDictionaryResult() {
  const result = state.dictionaryResult;
  if (state.authType === "github-owner") {
    const retainedFailure = result && dictionaryCollector.snapshot().items.some(item => item.phase === "error"
      && normalizeEnglish(item.term) === normalizeEnglish(result.term));
    if (state.dictionaryCollectionPhase === "error" && retainedFailure) retryDictionaryQueue();
    else void collectDictionaryResult();
    return;
  }
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

function clearDictionaryPrivateReceipt() {
  state.dictionaryPrivateReceipt = null;
  $("member-dictionary-private-status").textContent = "";
  $("member-dictionary-private-status").hidden = true;
  $("member-dictionary-private-open").hidden = true;
}

function updateDictionaryPrivateReceipt(entryIds, message) {
  const normalized = normalizeEnglish(state.dictionaryResult?.term || "");
  const entry = state.entries.find(value => entryIds.includes(value.id) && value.normalized === normalized);
  if (state.phase !== "ready" || !state.user || !entry) return;
  state.dictionaryPrivateReceipt = { entryId: entry.id, normalized };
  $("member-dictionary-private-status").textContent = message;
  $("member-dictionary-private-status").hidden = false;
  $("member-dictionary-private-open").hidden = false;
}

async function saveDictionaryToFolder() {
  const result = state.dictionaryResult;
  if (state.phase !== "ready" || !state.user || !result || state.entryBusy || state.listBusy || !state.entriesLoaded
    || state.folderWriteBusy || folderMutation.hasPending()) return;
  const uid = state.user.id, token = scope.capture(), csrf = state.csrfToken;
  const folderId = $("member-dictionary-folder").value || "unfiled";
  const label = `“${result.term}”`;
  let entry = state.entries.find(value => value.normalized === normalizeEnglish(result.term));
  state.entryBusy = true; renderChrome();
  try {
    if (!entry) {
      const payload = validatePersonalInput({ term: result.term, partOfSpeech: result.partOfSpeech || "", meaning: result.meaning, note: "" });
      const slot = `dictionary-private:${normalizeEnglish(result.term)}`;
      const body = { ...payload, mutationId: mutations.idFor(uid, slot, payload) };
      let saved;
      try { saved = await request(signal => api.add(body, csrf, privateOptions(signal, { expectedUserId: uid }))); }
      catch (error) {
        if (error.code !== "duplicate_entry" || error.status !== 409) throw error;
        // Concurrent saves reuse the existing ID, meaning, note and study state.
        saved = { entry: error.details?.existing, revision: state.revision };
      }
      if (!scope.current(token)) return;
      entry = validatePersonalEntry(saved.entry);
      if (entry.normalized !== normalizeEnglish(result.term)) throw new Error("保存结果与查询的词条不一致，请刷新核对。");
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error("词条保存结果尚未完整确认。");
      state.entries = [...state.entries.filter(value => value.id !== entry.id), entry];
      state.revision = Math.max(state.revision, saved.revision);
      mutations.clear(uid, slot);
      renderEntries();
    }
    updateDictionaryPrivateReceipt([entry.id], `${label}已保存到私人词本${folderId === "unfiled" ? "；未更改其他分类。" : "，正在确认归类…"}`);
    const confirmed = await archiveSavedEntries([entry.id], folderId, label);
    if (!scope.current(token)) return;
    if (confirmed) {
      const message = folderId === "unfiled" ? `${label}已在私人词本中；未更改其他分类。` : `${label}已存入“${state.folders.find(folder => folder.id === folderId)?.name || "所选收藏夹"}”。`;
      status(`${message}未覆盖已有释义或备注。`, "saved"); updateDictionaryPrivateReceipt([entry.id], message);
    }
  } catch (error) {
    if (scope.current(token) && !error?.stale) handleFailure(error, "未确认保存到私人词本，可用相同内容重试");
  } finally { if (scope.current(token)) { state.entryBusy = false; renderChrome(); renderEntries(); } }
}

async function collectDictionaryResult() {
  const result = state.dictionaryResult;
  if (state.phase !== "ready" || !state.user || state.authType !== "github-owner" || !result
    || ["queued", "saving", "saved"].includes(state.dictionaryCollectionPhase)) return;
  const token = scope.capture(), userId = state.user.id;
  await dictionaryCollector.enqueue(result.term, { userId, csrfToken: state.csrfToken,
    isCurrent: () => scope.current(token) && state.phase === "ready" && state.authType === "github-owner"
      && state.user?.id === userId });
}

function renderDictionaryQueue() {
  const queue = dictionaryCollector.snapshot();
  const visible = state.phase === "ready" && state.authType === "github-owner" && queue.userId === state.user?.id
    && (queue.pendingCount > 0 || queue.failedCount > 0);
  $("member-collection-queue").hidden = !visible;
  if (!visible) { $("member-collection-queue-summary").textContent = ""; $("member-collection-queue-list").replaceChildren(); return; }
  $("member-collection-queue-summary").textContent = `公开收录：${queue.pendingCount} 项处理中${queue.failedCount ? `，${queue.failedCount} 项待重试` : ""}。可继续查词；请等确认完成再关闭此页。`;
  $("member-collection-queue-list").replaceChildren(...queue.items.filter(item => item.phase !== "saved").map(item => {
    const row = document.createElement("li"); row.textContent = `${item.term} — ${item.message}`; return row;
  }));
  $("member-collection-queue-retry").hidden = queue.failedCount === 0;
  $("member-collection-queue-retry").disabled = queue.pendingCount > 0;
}

function retryDictionaryQueue() {
  if (state.phase !== "ready" || !state.user || state.authType !== "github-owner") return;
  const token = scope.capture(), userId = state.user.id;
  void dictionaryCollector.retry({ userId, csrfToken: state.csrfToken,
    isCurrent: () => scope.current(token) && state.phase === "ready" && state.authType === "github-owner" && state.user?.id === userId });
}

function renderOwnerPublic() {
  if (state.phase !== "ready" || state.authType !== "github-owner" || !state.user) return;
  const entries = ownerPublicEntries(state.publicSnapshot, ownerPublicConfirmations, $("member-owner-public-search").value);
  const allEntries = ownerPublicEntries(state.publicSnapshot, ownerPublicConfirmations);
  const currentIds = new Set(allEntries.map(entry => entry.id));
  const recent = ownerPublicConfirmations.filter(item => currentIds.has(item.entry.id)).slice(0, 5).map(({ entry, added }) => {
    const link = document.createElement("a"); link.className = "owner-public-receipt";
    link.href = publicEntryUrl(entry.id);
    const term = document.createElement("strong"); term.lang = "en"; term.textContent = entry.term;
    const confirmation = document.createElement("span"); confirmation.textContent = added ? "已公开收录 · 查看词卡 →" : "已在公开词本 · 查看词卡 →";
    link.append(term, confirmation); return link;
  });
  $("member-owner-public-recent").replaceChildren(...recent);
  $("member-owner-public-recent").hidden = recent.length === 0;
  $("member-owner-public-list").replaceChildren(...entries.slice(0, state.ownerPublicLimit).map(entry => {
    const button = document.createElement("button"); button.type = "button"; button.className = "owner-public-row";
    button.dataset.ownerPublicEntry = entry.id;
    const term = document.createElement("strong"); term.lang = "en"; term.textContent = entry.term;
    const meaning = document.createElement("span"); meaning.textContent = [entry.partOfSpeech, entry.meaning].filter(Boolean).join("\n");
    button.setAttribute("aria-label", `查看 ${entry.term} 的公开词卡`);
    button.append(term, meaning);
    button.addEventListener("click", () => { window.location.href = publicEntryUrl(entry.id); });
    return button;
  }));
  $("member-owner-public-list").setAttribute("aria-busy", String(state.ownerPublicBusy));
  const total = allEntries.length;
  $("member-owner-public-status").textContent = state.ownerPublicError || (state.ownerPublicBusy && !state.ownerPublicLoaded
    ? "正在读取公开词本…" : `${total} 个公开词条 · 最近收录在前${$("member-owner-public-search").value.trim() ? ` · 匹配 ${entries.length} 项` : ""}${state.publicSnapshot?.readSource === "deployed-fallback" ? " · 备用快照，可能略有延迟" : ""}${!entries.length && !state.ownerPublicBusy ? " · 暂无匹配词条" : ""}`);
  $("member-owner-public-more").hidden = entries.length <= state.ownerPublicLimit;
}

async function loadOwnerPublic() {
  if (state.phase !== "ready" || state.authType !== "github-owner" || !state.user || state.ownerPublicBusy) return;
  const token = scope.capture();
  state.ownerPublicBusy = true; state.ownerPublicError = "";
  renderChrome(); renderOwnerPublic();
  try {
    const snapshot = await request(signal => fetchPersonalPublicCatalog({ signal }));
    if (!scope.current(token)) return;
    if (!state.publicSnapshot || Date.parse(snapshot.exportedAt) >= Date.parse(state.publicSnapshot.exportedAt)) {
      state.publicSnapshot = snapshot;
      ownerPublicConfirmations = reconcileOwnerPublicConfirmations(snapshot, ownerPublicConfirmations);
    }
    state.ownerPublicLoaded = true;
  } catch (error) {
    if (scope.current(token) && !error?.stale) state.ownerPublicError = "公开词本暂未刷新；已确认收录的词仍在上方，可重试。";
  } finally {
    if (scope.current(token)) { state.ownerPublicBusy = false; renderChrome(); renderOwnerPublic(); }
  }
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

function currentStudyEntries() { return filterPersonalFolderEntries(filterPersonalEntries(state.entries, state.collectionId, state.chapterId), state.folders, state.folderId); }

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
  const folderId = $("member-source-folder").value || "unfiled";
  const body = { ...payload, mutationId: mutations.idFor(uid, "selections", payload) };
  const csrf = state.csrfToken;
  state.entryBusy = true; renderChrome(); renderSource();
  status("正在把选中的词加入私人词本…", "loading");
  try {
    const result = await request((signal) => api.select(body, csrf, privateOptions(signal, { expectedUserId: uid })));
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
    const archived = await archiveSavedEntries(affected.map(entry => entry.id), folderId, "选中的词条");
    if (!scope.current(token)) return;
    $("member-source-status").textContent = archived ? message : `${message} ${state.folderMessage}`;
    status(archived ? message : state.folderMessage, archived ? "saved" : "error");
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
  if (state.phase !== "ready" || !state.user || !state.learningLoaded || state.learningBusy || !state.entriesLoaded || state.listBusy || state.entryBusy) return;
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

function cancelOnlineVerification() {
  if (onlineVerificationTimer !== null) clearTimeout(onlineVerificationTimer);
  onlineVerificationTimer = null;
}

async function verifySession({ recheckIfPending = false } = {}) {
  if (!originReady || state.authBusy || state.phase === "recovery") return;
  if (lockMarker()) {
    lockSession("此页已锁定，请重新登录后查看个人词本。");
    return;
  }
  if (verificationTask) {
    // An online event or explicit retry may arrive before the failed check's
    // finally block. Coalesce those requests into one check after it settles.
    if (recheckIfPending) verificationRecheckQueued = true;
    return verificationTask;
  }
  verificationRecheckQueued = false;
  const previousUserId = state.user?.id || pendingVerificationUserId;
  const pendingFolderOperation = folderMutation.snapshot(state.user?.id);
  const previousFolderId = state.folderId;
  pendingVerificationUserId = previousUserId;
  if (state.user) captureDraft();
  clearSession();
  state.phase = "checking";
  const verificationToken = scope.capture();
  renderChrome();
  status("正在验证账号…", "loading");
  const task = (async () => {
    try {
      const result = await request((signal) => api.session(privateOptions(signal)));
      if (result.authenticated === false) {
        pendingVerificationUserId = null;
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
      if (!scope.current(verificationToken)) return;
      adoptSession(result);
      // A focus check clears all private UI first. Only this still-current,
      // same-identity verification may restore the uncertain tracker, never
      // replay a write or restore old folder rows/messages.
      if (pendingFolderOperation && state.phase === "ready" && state.user?.id === pendingFolderOperation.userId
        && state.authType === pendingFolderOperation.authType) folderMutation.restore(pendingFolderOperation);
      if (state.user?.id === previousUserId) state.folderId = previousFolderId;
      await loadEntries();
    } catch (error) {
      if (error?.stale) return;
      if (error.status === 401) lockSession("登录已失效，请重新登录；原有云端词条不会丢失。");
      else {
        // A network outage hides private data but does not turn a valid
        // persistent cookie into an explicit logout or demand a password.
        clearSession();
        state.phase = "verification-unavailable";
        renderChrome();
        status("暂时无法验证账号，个人内容已隐藏。连接恢复后可重新确认登录；云端词条不会丢失。", "error");
      }
    }
  })();
  verificationTask = task;
  try { await task; } finally {
    if (verificationTask === task) {
      verificationTask = null;
      const recheck = verificationRecheckQueued;
      verificationRecheckQueued = false;
      // Consume the intent before starting a new request. A persistent outage
      // cannot retry itself, and logout/account changes remain authoritative.
      if (recheck && originReady && navigator.onLine && state.phase === "verification-unavailable"
        && !state.authBusy && !state.recovery && !lockMarker()) void verifySession();
    }
  }
}

function recoveryCode(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("服务器未返回有效恢复码，请重新登录核对账号。");
  return value;
}

async function authenticate(kind, event) {
  event.preventDefault();
  if (!originReady || state.authBusy || !["signed-out", "locked"].includes(state.phase)) return;
  cancelOnlineVerification();
  let body;
  try {
    body = {
      username: validatePersonalUsername($(`${kind}-username`).value),
      password: validatePersonalPassword($(`${kind}-password`).value),
      remember: $("member-remember-login").checked
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
  cancelOnlineVerification();
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
  void detailLearningExamples.show(entry);
  $("member-detail-edit").disabled = state.entryBusy;
  renderFolders();
  if (!$("member-detail-dialog").open) $("member-detail-dialog").showModal();
}

function renderEntries() {
  if (state.phase !== "ready") { $("member-entry-list").replaceChildren(); return; }
  const query = normalizePublicSearchQuery($("member-search").value);
  renderPrivateScope();
  const entries = sortWordbookEntries(filterPersonalFolderEntries(filterPersonalEntries(state.entries, state.collectionId, state.chapterId), state.folders, state.folderId)
    .filter((entry) => !query || normalizePublicSearchQuery([entry.term, entry.meaning, entry.note].join(" ")).includes(query)), state.entrySort);
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
  $("member-empty").textContent = query ? "没有匹配的词条。" : state.folderId !== "all" ? "这个分类暂无词条。" : "这里还很安静。记下你的第一个词吧。";
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
  const folderId = $("member-entry-folder").value || "unfiled";
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
    const result = await request((signal) => draft.id ? api.update(draft.id, body, csrf, privateOptions(signal, { expectedUserId: uid })) : api.add(body, csrf, privateOptions(signal, { expectedUserId: uid })));
    if (!scope.current(token)) return;
    const entry = validatePersonalEntry(result.entry);
    if (!Number.isSafeInteger(result.revision) || result.revision < 0) throw new Error("保存结果尚未完整确认，请保留当前输入后重试。");
    state.entries = [...state.entries.filter((value) => value.id !== entry.id), entry];
    state.revision = Math.max(state.revision, result.revision);
    mutations.clear(uid, slot);
    drafts.clear(uid);
    fillEditor(personalDraft());
    renderEntries();
    const archived = await archiveSavedEntries([entry.id], folderId, `“${entry.term}”`);
    if (scope.current(token) && archived) status("已保存到你的私人词本。", "saved");
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
    void loadFolders();
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
  if (dictionaryCollector.hasUnsettled() && !window.confirm("还有公开收录尚未确认。建议先等待完成或重试；现在退出会中止此页的收录队列。确定退出吗？")) return;
  if (folderMutation.hasPending() && !window.confirm("还有收藏夹操作未确认。已保存的词不会丢失；退出会清除此页的重试信息，稍后请刷新核对分类。确定退出吗？")) return;
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
  cancelOnlineVerification();
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
$("member-session-retry").addEventListener("click", () => {
  cancelOnlineVerification();
  void verifySession({ recheckIfPending: true });
});
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
$("member-dictionary-full").addEventListener("click", event => void queryDictionary(event, { full: true }));
$("member-dictionary-more")?.addEventListener("click", event => void moreDictionaryResults(event));
$("member-dictionary-term").addEventListener("input", () => { resetDictionary(); renderChrome(); });
$("member-dictionary-use").addEventListener("click", useDictionaryResult);
$("member-dictionary-save").addEventListener("click", () => void saveDictionaryToFolder());
$("member-dictionary-folder-new").addEventListener("click", () => openFolderEditor());
$("member-dictionary-private-open").addEventListener("click", () => {
  const receipt = state.dictionaryPrivateReceipt;
  if (state.phase !== "ready" || !state.user || !receipt || normalizeEnglish(state.dictionaryResult?.term || "") !== receipt.normalized) return;
  const entry = state.entries.find(value => value.id === receipt.entryId && value.normalized === receipt.normalized);
  if (entry) showEntry(contextualizePersonalEntry(entry, state.collectionId, state.chapterId));
});
$("member-collection-queue-retry").addEventListener("click", retryDictionaryQueue);
$("member-owner-public-search").addEventListener("input", () => { state.ownerPublicLimit = 20; renderOwnerPublic(); });
$("member-owner-public-refresh").addEventListener("click", () => void loadOwnerPublic());
$("member-owner-public-more").addEventListener("click", () => { state.ownerPublicLimit += 20; renderOwnerPublic(); });
$("member-search").addEventListener("input", renderEntries);
$("member-folder-filter").addEventListener("change", () => selectFolder($("member-folder-filter").value));
$("member-sort").addEventListener("change", () => {
  state.entrySort = normalizeEntrySort($("member-sort").value);
  const url = new URL(window.location.href);
  if (state.entrySort === "newest") url.searchParams.delete("sort"); else url.searchParams.set("sort", state.entrySort);
  history.replaceState(history.state, "", url); renderEntries();
});
$("member-folders-refresh").addEventListener("click", () => void loadFolders());
$("member-folder-new").addEventListener("click", () => openFolderEditor());
$("member-folder-rename").addEventListener("click", () => openFolderEditor(true));
$("member-folder-delete").addEventListener("click", () => void deleteFolder());
$("member-folder-locate").addEventListener("click", () => {
  if (!state.folders.some(folder => folder.id === state.lastArchivedFolderId)) return;
  $("member-private-tools").open = true; selectFolder(state.lastArchivedFolderId);
  $("member-entry-list").scrollIntoView({ block: "nearest", behavior: "auto" });
});
$("member-folder-form").addEventListener("submit", event => void saveFolder(event));
$("member-folder-cancel").addEventListener("click", () => $("member-folder-dialog").close());
$("member-folder-retry").addEventListener("click", () => void executeFolderMutation());
$("member-folder-dismiss").addEventListener("click", () => {
  if (state.folderWriteBusy || !folderMutation.hasPending()) return;
  if (!window.confirm("停止重试这次分类操作？服务器可能已经完成，请稍后刷新核对；已保存的词不受影响。")) return;
  folderMutation.clear(); state.folderMessage = "本次分类未确认，请刷新核对。已保存的词仍保留。"; renderFolders();
});
$("member-detail-folder").addEventListener("change", renderFolders);
for (const mode of ["add", "remove"]) $(`member-detail-folder-${mode}`).addEventListener("click", () => {
  const folder = state.folders.find(value => value.id === $("member-detail-folder").value);
  if (state.phase !== "ready" || !detailEntry || !folder || state.entryBusy || state.folderWriteBusy || folderMutation.hasPending()) return;
  void changeFolder("entries", folder, { entryIds: [detailEntry.id], mode, revision: folder.revision });
});
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
$("member-owner-refresh").addEventListener("click", () => { cancelOnlineVerification(); lockMarker(false); state.authType = "github-owner"; state.phase = "checking"; void verifySession({ recheckIfPending: true }); });
$("member-refresh").addEventListener("click", () => void loadEntries());
for (const id of ["member-new", "member-cancel"]) $(id).addEventListener("click", () => {
  if (state.phase === "ready" && !state.entryBusy && discardAllowed()) fillEditor(personalDraft(), { focus: true });
});
$("member-conflict-open").addEventListener("click", () => { if (conflictEntry) showEntry(conflictEntry); });
$("member-detail-close").addEventListener("click", () => { detailLearningExamples.clear(); $("member-detail-dialog").close(); });
$("member-detail-dialog").addEventListener("cancel", () => detailLearningExamples.clear());
$("member-detail-dialog").addEventListener("close", () => {
  if ($("member-detail-dialog").open) return;
  detailLearningExamples.clear(); detailEntry = null;
});
$("member-detail-edit").addEventListener("click", () => {
  const entry = detailEntry;
  detailLearningExamples.clear();
  $("member-detail-dialog").close();
  if (entry) editEntry(entry);
});
$("member-export").addEventListener("click", () => {
  if (state.phase !== "ready" || !state.user || !state.entriesLoaded || !state.learningLoaded || state.learningBusy) return;
  try {
    const backup = serializePersonalExport(state.entries, state.user.username, new Date().toISOString(), state.reviews);
    const foldersConfirmed = state.foldersFresh && !state.folderWriteBusy && !folderMutation.hasPending();
    const withFolders = state.foldersLoaded ? JSON.stringify({ ...JSON.parse(serializePersonalFolderExport(backup, state.folders, state.foldersRevision)), foldersStatus: foldersConfirmed ? "confirmed" : "stale" }, null, 2)
      : JSON.stringify({ ...JSON.parse(backup), folders: null, foldersRevision: null, foldersStatus: "unavailable" }, null, 2);
    download(`${withFolders}\n`, `my-wordbook-${state.user.username}-${new Date().toISOString().slice(0, 10)}.json`);
    status(state.foldersLoaded ? foldersConfirmed ? "已导出个人词条、收藏夹和云端学习记录。文件包含个人内容，请妥善保管。"
      : "已导出词条、学习记录与上次确认的分类快照；收藏夹尚未重新确认，备份已标记 stale。"
      : "已导出词条和学习记录；分类未确认，本次未包含收藏夹。请刷新分类后重新导出完整备份。", state.foldersLoaded && foldersConfirmed ? "saved" : "error");
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
  if (drafts.hasUnsaved() || state.recovery || state.entryBusy || state.folderWriteBusy || folderMutation.hasPending() || state.study?.pending || state.selectedSources.size || dictionaryCollector.hasUnsettled()) { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("pagehide", () => {
  cancelOnlineVerification();
  if (state.user) captureDraft();
  clearSession();
  state.phase = "checking";
  renderChrome();
});
window.addEventListener("pageshow", (event) => {
  if (originReady && event.persisted) void verifySession();
});
window.addEventListener("focus", () => {
  if (originReady && ["ready", "verification-unavailable"].includes(state.phase) && !state.entryBusy && !state.listBusy && !state.folderWriteBusy) void verifySession();
});
window.addEventListener("online", () => {
  if (!originReady || onlineVerificationTimer !== null || state.authBusy || state.recovery || lockMarker()
    || !(verificationTask || ["checking", "verification-unavailable"].includes(state.phase))) return;
  // The page can emit online before its controlling service worker's
  // transport is restored. Coalesce that event batch into one settled check.
  onlineVerificationTimer = setTimeout(() => {
    onlineVerificationTimer = null;
    if (originReady && navigator.onLine && !state.authBusy && !state.recovery && !lockMarker()
      && (verificationTask || ["checking", "verification-unavailable"].includes(state.phase))) {
      void verifySession({ recheckIfPending: true });
    }
  }, 300);
});
window.addEventListener("offline", () => {
  cancelOnlineVerification();
  verificationRecheckQueued = false;
});
if (channel) channel.onmessage = (event) => {
  if (event.data?.tabId === tabId || !["changed", "locked"].includes(event.data?.type)) return;
  if (state.user) captureDraft();
  lockSession("另一页面的账号状态已改变，请重新登录确认。当前页面的未保存输入未转给其他账号。");
};

// The Pages copy must leave before any credentials can be entered. Never use
// query parameters, referrers, or user-supplied hosts as a redirect destination.
try {
  let target = new URL(personalWordbookUrl());
  const lookup = dictionaryQueryFromHash(window.location.hash);
  if (lookup) target.hash = new URLSearchParams({ lookup }).toString();
  target = new URL(copyPublicNavigationContext(window.location.href, target.href));
  if (requestedAuth === "github-owner") target.searchParams.set("auth", "owner");
  else if (requestedAuth === "member") target.searchParams.set("auth", "member");
  if (target.origin !== window.location.origin) window.location.replace(target.href);
  else {
    originReady = true;
    renderChrome();
    setupPwa({ updateBanner: $("update-banner"), applyUpdateButton: $("apply-update"), autoApplyUpdate: false, beforeApplyUpdate: async () => {
      if (state.recovery || state.entryBusy || state.folderWriteBusy || folderMutation.hasPending() || drafts.hasUnsaved() || state.study?.pending || state.selectedSources.size || dictionaryCollector.hasUnsettled()) throw new Error("请先保存词条、勾选或恢复码，并确认分类和收录队列完成，再更新应用。");
    } });
    void verifySession();
  }
} catch {
  status("暂时无法确认安全的登录地址。请从公开词库重新进入“我的词本”。", "error");
}
