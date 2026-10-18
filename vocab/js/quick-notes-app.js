import { quickNotesStorage, QUICK_NOTES_LIMITS } from "./quick-notes-storage.js?v=75";
import { setupPwa } from "./pwa.js?v=75";

const refs = {
  text: document.querySelector("#quick-notes-text"),
  newPage: document.querySelector("#quick-notes-new"),
  saveStatus: document.querySelector("#quick-notes-save-status"),
  retry: document.querySelector("#quick-notes-retry"),
  error: document.querySelector("#quick-notes-error"),
  copy: document.querySelector("#quick-notes-copy"),
  exportText: document.querySelector("#quick-notes-export-text"),
  message: document.querySelector("#quick-notes-message"),
  pagesSummary: document.querySelector("#quick-notes-pages-summary"),
  list: document.querySelector("#quick-notes-list"),
  emptyList: document.querySelector("#quick-notes-empty-list"),
  exportBackup: document.querySelector("#quick-notes-export-backup"),
  importBackup: document.querySelector("#quick-notes-import-backup"),
  importFile: document.querySelector("#quick-notes-import-file")
};

refs.text.maxLength = QUICK_NOTES_LIMITS.maxTextLength;
let pages = [];
let current = null;
let editSequence = 0;
let dirty = false;
let ready = false;
let initializing = null;
let saving = null;
let actionBusy = false;
let lastError = null;

function showError(error, prefix = "未保存到本机，可先复制或导出保留。") {
  lastError = error instanceof Error ? error : new Error(String(error));
  refs.error.textContent = `${prefix} ${lastError.message}`;
  refs.error.hidden = false;
  refs.retry.hidden = false;
  refs.saveStatus.textContent = "尚未保存 · 文字仍留在当前页面";
  refs.saveStatus.dataset.state = "error";
}

function clearError() {
  lastError = null;
  refs.error.hidden = true;
  refs.error.textContent = "";
  refs.retry.hidden = true;
}

function showPending() {
  refs.saveStatus.textContent = ready ? "正在保存到本机…" : "正在准备本机保存，先继续写…";
  refs.saveStatus.dataset.state = "pending";
}

function showSaved() {
  refs.saveStatus.textContent = "已保存在本机";
  refs.saveStatus.dataset.state = "saved";
}

function replacePage(note) {
  pages = pages.filter(page => page.id !== note.id);
  pages.push(note);
  pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
}

function renderPages() {
  const otherPages = pages.filter(page => page.id !== current?.id);
  refs.pagesSummary.textContent = otherPages.length ? `旧页（${otherPages.length}）` : "旧页";
  refs.list.replaceChildren();
  refs.emptyList.hidden = otherPages.length > 0;
  for (const page of otherPages) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = actionBusy;
    button.dataset.noteId = page.id;
    const preview = document.createElement("span");
    preview.textContent = page.text.split(/\r?\n/).find(line => line.trim())?.trim().slice(0, 90) || "空白页";
    const timestamp = document.createElement("small");
    timestamp.textContent = new Date(page.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    button.append(preview, timestamp);
    button.addEventListener("click", () => void switchPage(page.id));
    item.append(button);
    refs.list.append(item);
  }
}

function setBusy(value) {
  actionBusy = value;
  refs.newPage.disabled = value;
  refs.exportBackup.disabled = value;
  refs.importBackup.disabled = value;
  for (const button of refs.list.querySelectorAll("button")) button.disabled = value;
}

// Every write snapshots the current text and revision. A late save may advance
// the revision (or move us to a conflict copy), never replace newer typing.
function savePending() {
  if (!ready || !current) return Promise.resolve();
  if (saving) return saving;
  if (!dirty) return Promise.resolve();
  saving = (async () => {
    while (dirty) {
      const sequence = editSequence;
      const text = refs.text.value;
      const result = await quickNotesStorage.saveQuickNote({ id: current.id, text, expectedRevision: current.revision });
      current = result.note;
      replacePage(current);
      if (result.conflictCopy) {
        refs.message.textContent = "另一标签页修改过原页，已另存副本；两份内容都保留。";
      }
      dirty = editSequence !== sequence;
      clearError();
      renderPages();
      if (!dirty) showSaved();
    }
  })().catch(error => {
    dirty = true;
    showError(error);
    throw error;
  }).finally(() => { saving = null; });
  return saving;
}

async function initialize() {
  if (initializing) return initializing;
  if (ready) return;
  initializing = (async () => {
    const loaded = await quickNotesStorage.listQuickNotes();
    pages = loaded;
    if (editSequence === 0 && loaded.length) {
      current = loaded[0];
      refs.text.value = current.text;
      dirty = false;
    } else {
      // Initialization must not overwrite text already entered while IDB opens.
      const sequence = editSequence;
      current = await quickNotesStorage.createQuickNote(refs.text.value);
      replacePage(current);
      dirty = editSequence !== sequence;
    }
    ready = true;
    clearError();
    renderPages();
    if (dirty) {
      showPending();
      await savePending();
    } else showSaved();
  })().catch(error => {
    showError(error);
    throw error;
  }).finally(() => { initializing = null; });
  return initializing;
}

async function flushCurrent() {
  if (!ready) await initialize();
  if (!ready || !current) throw lastError || new Error("本机保存尚未准备完成。");
  // Edits made during an in-flight write must be committed before navigation,
  // a backup or a PWA reload is allowed to continue.
  do { await savePending(); } while (dirty || saving);
}

async function switchPage(id) {
  if (actionBusy || id === current?.id) return;
  setBusy(true);
  try {
    await flushCurrent();
    refs.text.disabled = true;
    const note = await quickNotesStorage.getQuickNote(id);
    if (!note) throw new Error("找不到这份页面，当前文字没有被替换。");
    current = note;
    refs.text.value = note.text;
    dirty = false;
    editSequence += 1;
    replacePage(note);
    clearError();
    showSaved();
    renderPages();
  } catch (error) {
    if (dirty || !ready) showError(error);
    else {
      refs.error.textContent = `切换未完成：${error.message}`;
      refs.error.hidden = false;
    }
  } finally {
    refs.text.disabled = false;
    setBusy(false);
    refs.text.focus();
  }
}

refs.text.addEventListener("input", () => {
  editSequence += 1;
  dirty = true;
  refs.message.textContent = "";
  showPending();
  if (ready) void savePending().catch(() => {});
});

refs.newPage.addEventListener("click", async () => {
  if (actionBusy) return;
  setBusy(true);
  try {
    await flushCurrent();
    // Reuse a blank page so repeated taps cannot create empty-page clutter.
    if (refs.text.value === "") return;
    refs.text.disabled = true;
    const note = await quickNotesStorage.createQuickNote("");
    current = note;
    refs.text.value = "";
    editSequence += 1;
    dirty = false;
    replacePage(note);
    clearError();
    refs.message.textContent = "已新建空白页，上一页仍在旧页中。";
    showSaved();
    renderPages();
  } catch (error) {
    if (dirty || !ready) showError(error);
    else {
      refs.error.textContent = `新建未完成，当前页面保留。${error.message}`;
      refs.error.hidden = false;
    }
  } finally {
    refs.text.disabled = false;
    setBusy(false);
    refs.text.focus();
  }
});

refs.retry.addEventListener("click", () => {
  showPending();
  void flushCurrent().catch(() => {});
});

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function dateStamp() { return new Date().toISOString().slice(0, 10); }

// Copy/export intentionally do not await IDB: they also rescue text when local
// saving fails, and clipboard access keeps the user's click activation on iOS.
refs.copy.addEventListener("click", () => {
  const text = refs.text.value;
  if (!navigator.clipboard?.writeText) {
    refs.message.textContent = "此浏览器不支持一键复制，请长按文字全选复制，或导出 .txt。";
    refs.text.focus();
    refs.text.select();
    return;
  }
  try {
    void navigator.clipboard.writeText(text).then(() => {
      refs.message.textContent = "已复制本页文字，可粘贴给 ChatGPT 整理；没有自动发送。";
    }).catch(() => {
      refs.message.textContent = "复制未成功，请长按文字全选复制，或导出 .txt。";
      refs.text.focus();
      refs.text.select();
    });
  } catch {
    refs.message.textContent = "复制未成功，请长按文字全选复制，或导出 .txt。";
  }
});

refs.exportText.addEventListener("click", () => {
  try {
    download(new Blob([refs.text.value], { type: "text/plain;charset=utf-8" }), `卓的随手记-${dateStamp()}.txt`);
    refs.message.textContent = "已生成本页 .txt 文件，请确认浏览器的下载或分享结果。";
  } catch (error) {
    refs.message.textContent = `导出未完成，请先复制文字保留。${error.message}`;
  }
});

refs.exportBackup.addEventListener("click", async () => {
  if (actionBusy) return;
  setBusy(true);
  try {
    let backup;
    let sequence;
    do {
      await flushCurrent();
      sequence = editSequence;
      backup = await quickNotesStorage.exportQuickNotesBackup();
    } while (dirty || sequence !== editSequence);
    // Match the storage/import byte boundary exactly. Pretty-printing could
    // make an otherwise valid near-limit notebook impossible to back up.
    const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
    if (blob.size > QUICK_NOTES_LIMITS.maxBackupBytes) throw new Error("备份超过 10 MB，请先逐页导出 .txt 保留。");
    download(blob, `卓的随手记备份-${dateStamp()}.json`);
    refs.message.textContent = "已生成随手记备份，请确认浏览器的下载或分享结果。";
  } catch (error) {
    refs.error.textContent = `备份未导出，现有内容没有被修改。${error.message}`;
    refs.error.hidden = false;
  } finally { setBusy(false); }
});

refs.importBackup.addEventListener("click", () => { if (!actionBusy) refs.importFile.click(); });
refs.importFile.addEventListener("change", async () => {
  const file = refs.importFile.files?.[0];
  refs.importFile.value = "";
  if (!file || actionBusy) return;
  setBusy(true);
  try {
    if (file.size > QUICK_NOTES_LIMITS.maxBackupBytes) throw new Error("文件超过 10 MB，已拒绝读取。");
    await flushCurrent();
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > QUICK_NOTES_LIMITS.maxBackupBytes) throw new Error("文件超过 10 MB，已拒绝解析。");
    const result = await quickNotesStorage.importQuickNotesBackup(text);
    pages = await quickNotesStorage.listQuickNotes();
    renderPages();
    refs.message.textContent = `已补充 ${result.added} 页，跳过 ${result.unchanged} 页重复内容${result.conflictCopies ? `，另存 ${result.conflictCopies} 页不同版本` : ""}；原有内容未覆盖。`;
    if (!dirty && ready) clearError();
  } catch (error) {
    refs.error.textContent = `导入未完成，原有内容没有被覆盖。${error.message}`;
    refs.error.hidden = false;
  } finally { setBusy(false); }
});

quickNotesStorage.subscribe?.(event => {
  if (!event.external || !ready) return;
  const sequence = editSequence;
  const id = current?.id;
  const wasClean = !dirty && !saving;
  void quickNotesStorage.listQuickNotes().then(loaded => {
    pages = loaded;
    const latest = loaded.find(page => page.id === id);
    if (wasClean && !dirty && !saving && sequence === editSequence && current?.id === id && latest && latest.revision > current.revision) {
      current = latest;
      refs.text.value = latest.text;
      refs.message.textContent = "已读取另一标签页保存的本页内容。";
      showSaved();
    }
    renderPages();
  }).catch(() => {
    refs.message.textContent = "旧页列表暂时未刷新，当前输入不受影响。";
  });
});

window.addEventListener("beforeunload", event => {
  if (!dirty && !(editSequence > 0 && !ready) && !saving) return;
  event.preventDefault();
  event.returnValue = "";
});
window.addEventListener("pagehide", () => { void flushCurrent().catch(() => {}); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void flushCurrent().catch(() => {});
});

setupPwa({
  updateBanner: document.querySelector("#update-banner"),
  applyUpdateButton: document.querySelector("#apply-update"),
  beforeApplyUpdate: flushCurrent
});

void initialize().catch(() => {});
