import { personalWordbookUrl } from "./runtime-config.js?v=73";
import { setupPwa } from "./pwa.js?v=73";
import { normalizePublicSearchQuery } from "./wordbook-schema.js?v=73";
import { createPersonalApi } from "./personal-api.js?v=73";
import {
  createPersonalDraftStore, createPersonalExpiryTimer, createPersonalMutationTracker, createPersonalSessionScope,
  isPersonalDraftDirty, personalDraft, serializePersonalExport,
  validatePersonalEntry, validatePersonalInput, validatePersonalList,
  validatePersonalPassword, validatePersonalSession, validatePersonalUsername
} from "./personal-storage.js?v=73";

const $ = (id) => document.getElementById(id);
const api = createPersonalApi();
const drafts = createPersonalDraftStore();
const mutations = createPersonalMutationTracker();
const scope = createPersonalSessionScope();
const expiryTimer = createPersonalExpiryTimer();
const LOCK_KEY = "zhuo-member-explicit-login-required"; // Nonsecret logout intent only.
const tabId = crypto.randomUUID();
let channel;
try { channel = new BroadcastChannel("zhuo-member-auth-v1"); } catch { /* Revalidation remains authoritative. */ }
let originReady = false;
let verificationTask = null;
let detailEntry = null;
let conflictEntry = null;
const state = {
  phase: "checking", authView: "login", authBusy: false, user: null, csrfToken: "", expiresAt: "",
  entries: [], revision: 0, entriesLoaded: false, listBusy: false, entryBusy: false,
  editor: null, recovery: null
};

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
  $("member-entry-list").replaceChildren();
  $("member-username").textContent = "";
  $("member-search").value = "";
  for (const id of ["member-term", "member-meaning", "member-note"]) $(id).value = "";
  $("member-detail-term").textContent = "";
  $("member-detail-meaning").textContent = "";
  $("member-detail-note").textContent = "";
  $("member-recovery-code").textContent = "";
  $("member-recovery-ack").checked = false;
  $("member-conflict-message").textContent = "";
  $("member-conflict").hidden = true;
  for (const id of ["member-detail-dialog", "delete-account-dialog"]) if ($(id).open) $(id).close();
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
  if (discardDrafts) { drafts.clear(); mutations.clear(); }
  clearPrivateDom();
}

function lockSession(message, { discardDrafts = false, notify = false } = {}) {
  clearSession({ discardDrafts });
  lockMarker(true);
  state.phase = "locked";
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
  $("member-username").hidden = !ready;
  $("member-logout").hidden = !ready;
  $("member-logout").disabled = !ready;
  $("member-username").textContent = ready ? `@${state.user.username}` : "";
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
  $("delete-account-form").querySelector("fieldset").disabled = !ready || state.entryBusy;
  for (const id of ["member-new", "member-cancel", "member-delete-account"]) $(id).disabled = !ready || state.entryBusy;
  $("member-refresh").disabled = !ready || state.entryBusy || state.listBusy;
  $("member-export").disabled = !ready || state.entryBusy || !state.entriesLoaded;
  $("member-save").disabled = !ready || state.entryBusy || !state.entriesLoaded
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

function fillEditor(draft, { focus = false } = {}) {
  state.editor = structuredClone(draft);
  for (const field of ["term", "meaning", "note"]) $(`member-${field}`).value = draft[field];
  if (state.user) drafts.write(state.user.id, state.editor);
  conflictEntry = null;
  $("member-conflict").hidden = true;
  renderChrome();
  if (focus) $("member-term").focus();
}

function captureDraft() {
  if (!state.user || !state.editor || state.phase !== "ready") return null;
  for (const field of ["term", "meaning", "note"]) state.editor[field] = $(`member-${field}`).value;
  drafts.write(state.user.id, state.editor);
  return state.editor;
}

function adoptSession(result, { recoveryCode = "" } = {}) {
  const session = sessionValue(result);
  expiryTimer.clear();
  scope.advance(session.user.id);
  clearPrivateDom();
  state.user = { id: session.user.id, username: session.user.username };
  state.csrfToken = session.csrfToken;
  state.expiresAt = session.expiresAt;
  state.entries = [];
  state.entriesLoaded = false;
  state.listBusy = false;
  state.entryBusy = false;
  state.authBusy = false;
  drafts.retainOnly(session.user.id);
  mutations.retainOnly(session.user.id);
  lockMarker(false);
  state.phase = recoveryCode ? "recovery" : "ready";
  state.recovery = recoveryCode ? { code: recoveryCode, username: session.user.username, kind: "register", token: scope.capture() } : null;
  fillEditor(drafts.read(session.user.id) || personalDraft());
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
    const result = validatePersonalList(await request((signal) => api.entries({ signal, expectedUserId })));
    if (!scope.current(token)) return;
    state.entries = result.entries;
    state.revision = result.revision;
    state.entriesLoaded = true;
    renderEntries();
    if (announce) status("已读取云端词本；当前编辑内容未被替换。", "saved");
  } catch (error) { if (scope.current(token)) handleFailure(error, "读取失败，可点击刷新重试"); }
  finally { if (scope.current(token)) { state.listBusy = false; renderChrome(); } }
}

async function verifySession() {
  if (!originReady || state.authBusy || state.phase === "recovery") return;
  if (lockMarker()) {
    lockSession("此页已锁定，请重新登录后查看个人词本。");
    return;
  }
  if (verificationTask) return verificationTask;
  if (state.user) captureDraft();
  clearSession();
  state.phase = "checking";
  renderChrome();
  status("正在验证账号…", "loading");
  const task = (async () => {
    try {
      const result = await request((signal) => api.session({ signal }));
      if (result.authenticated === false) {
        clearSession();
        state.phase = "signed-out";
        renderChrome();
        status("登录后，你的词条会保存在自己的账号里。", "saved");
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
  return !isPersonalDraftDirty(state.editor) || window.confirm("当前有尚未保存的输入，确定放弃这些修改吗？");
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
  $("member-detail-edit").disabled = state.entryBusy;
  if (!$("member-detail-dialog").open) $("member-detail-dialog").showModal();
}

function renderEntries() {
  if (state.phase !== "ready") { $("member-entry-list").replaceChildren(); return; }
  const query = normalizePublicSearchQuery($("member-search").value);
  const entries = state.entries.filter((entry) => !query || normalizePublicSearchQuery([entry.term, entry.meaning, entry.note].join(" ")).includes(query))
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
      button.dataset.action = action; button.disabled = state.entryBusy;
      if (action === "delete") button.className = "danger";
      button.addEventListener("click", () => action === "edit" ? editEntry(entry) : void deleteEntry(entry));
      actions.append(button);
    }
    top.append(term, actions);
    const meaning = document.createElement("p"); meaning.className = "entry-meaning";
    meaning.textContent = entry.meaning || "中文释义待补充";
    row.append(top, meaning);
    if (entry.note) { const note = document.createElement("p"); note.className = "entry-note"; note.textContent = entry.note; row.append(note); }
    return row;
  });
  $("member-entry-list").replaceChildren(...rows);
  $("member-empty").hidden = entries.length > 0 || !state.entriesLoaded;
  $("member-empty").textContent = query ? "没有匹配的词条。" : "这里还很安静。记下你的第一个词吧。";
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
  if (state.phase !== "ready" || !state.user || state.entryBusy || !state.entriesLoaded) return;
  const draft = captureDraft();
  let input;
  try { input = validatePersonalInput(draft); }
  catch (error) { status(error.message, "error"); return; }
  const uid = state.user.id;
  const token = scope.capture();
  const slot = draft.id ? `update:${draft.id}` : "create";
  const payload = { ...(draft.id ? { revision: draft.revision } : {}), ...input };
  const body = { ...payload, mutationId: mutations.idFor(uid, slot, payload) };
  const csrf = state.csrfToken;
  state.entryBusy = true;
  renderChrome(); renderEntries();
  status("正在保存到你的账号…", "loading");
  try {
    const result = await request((signal) => draft.id ? api.update(draft.id, body, csrf, { signal }) : api.add(body, csrf, { signal }));
    if (!scope.current(token)) return;
    const entry = validatePersonalEntry(result.entry);
    state.entries = [...state.entries.filter((value) => value.id !== entry.id), entry];
    if (Number.isSafeInteger(result.revision)) state.revision = result.revision;
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
  if (state.phase !== "ready" || !state.user || state.entryBusy) return;
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
    await request((signal) => api.remove(entry.id, body, csrf, { signal }));
    if (!scope.current(token)) return;
    mutations.clear(uid, slot);
    state.entries = state.entries.filter((value) => value.id !== entry.id);
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
    await request((signal) => api.logout(csrf, { signal }));
    if (!scope.current(token)) return;
    state.phase = "signed-out";
    renderChrome();
    status("已退出。下次需要重新登录。", "saved");
  } catch (error) {
    if (!scope.current(token) || error?.stale) return;
    status("退出请求未完成，但此页已锁定。请明确重新登录后再查看个人词本。", "locked");
  } finally { if (scope.current(token)) { state.authBusy = false; renderChrome(); } }
}

async function deleteAccount(event) {
  event.preventDefault();
  if (state.phase !== "ready" || !state.user || state.entryBusy) return;
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
    const result = await request((signal) => api.deleteAccount(body, csrf, { signal }));
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
$("member-entry-form").addEventListener("input", () => { captureDraft(); renderChrome(); });
$("member-search").addEventListener("input", renderEntries);
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
    download(`${serializePersonalExport(state.entries, state.user.username)}\n`, `my-wordbook-${state.user.username}-${new Date().toISOString().slice(0, 10)}.json`);
    status("已导出已保存词条。文件包含个人内容，请妥善保管。", "saved");
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
$("delete-account-dialog").addEventListener("close", () => { $("delete-account-password").value = ""; $("delete-account-confirmation").value = ""; });
window.addEventListener("beforeunload", (event) => {
  if (drafts.hasUnsaved() || state.recovery || state.entryBusy) { event.preventDefault(); event.returnValue = ""; }
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
  if (target.origin !== window.location.origin) window.location.replace(target.href);
  else {
    originReady = true;
    renderChrome();
    setupPwa({ updateBanner: $("update-banner"), applyUpdateButton: $("apply-update"), autoApplyUpdate: false, beforeApplyUpdate: async () => {
      if (state.recovery || state.entryBusy || drafts.hasUnsaved()) throw new Error("请先保存词条或恢复码，再更新应用。");
    } });
    void verifySession();
  }
} catch {
  status("暂时无法确认安全的登录地址。请从公开词库重新进入“我的词本”。", "error");
}
