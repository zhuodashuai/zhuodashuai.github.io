import { createLibraryLookupController } from "./library-lookup-controller.js?v=104";
import { createPersonalApi } from "./personal-api.js?v=100";
import { personalWordbookUrl } from "./runtime-config.js?v=77";
import { ownerLibraryLink } from "./owner-public-library.js?v=99";
import { dictionaryMeaningLines, dictionaryChoiceDescription } from "./dictionary-app.js?v=104";
import { searchRelatedChineseDictionary } from "./expanded-dictionary.js?v=104";

export function mountLibraryLookup({ document, window, onCollected, onOpenEntry, resolveEntry } = {}) {
  const get = id => document.getElementById(id);
  const input = get("lookup-input"), api = createPersonalApi();
  const ownerRequested = new URL(window.location.href).searchParams.get("auth") === "owner";
  const ownerOrigin = new URL(personalWordbookUrl(window.location)).origin === window.location.origin;
  const ownerLogin = get("lookup-owner-login");
  const logoutButton = document.createElement("button"); logoutButton.id = "lookup-logout";
  logoutButton.type = "button"; logoutButton.textContent = "退出"; logoutButton.hidden = true;
  ownerLogin.after(logoutButton);
  const lockKey = "zhuo-member-explicit-login-required";
  let lockedInMemory = false, storageUnavailable = false;
  const explicitlyLocked = () => {
    if (lockedInMemory) return true;
    try { return window.sessionStorage.getItem(lockKey) === "1"; }
    catch { storageUnavailable = true; return true; }
  };
  ownerLogin.href = ownerOrigin && ownerRequested
    ? "/api/v1/auth/login?remember=1&view=library" : ownerLibraryLink(window.location);
  let previousResults = null, previousSuggestions = null, composing = false;
  function button(label, key, index) {
    const control = document.createElement("button"); control.type = "button";
    control.textContent = label; control.dataset[key] = String(index); return control;
  }
  function render(value) {
    const { lookup, owner, collection } = value;
    const section = get("library-lookup");
    section.dataset.phase = lookup.phase; section.dataset.auth = value.authPhase; section.dataset.owner = String(owner);
    section.dataset.suggestionPhase = lookup.suggestionPhase || "idle";
    const receipts = value.receipts.map(item => ({ ...item,
      entry: resolveEntry ? resolveEntry(item.entry.id) : item.entry })).filter(item => item.entry);
    get("lookup-auth").textContent = value.authMessage || "查词无需登录";
    ownerLogin.hidden = owner;
    logoutButton.hidden = !owner; logoutButton.disabled = value.pendingCount > 0;
    ownerLogin.textContent = ownerOrigin && ownerRequested ? "卓 · GitHub 登录" : "卓 · 登录并收录";
    get("lookup-note").textContent = owner ? "按 Enter 查词并公开收录；中文或纠错候选请点选。" : "本站词典直接查询；只有卓本人登录后才会公开收录。";
    get("lookup-submit").textContent = owner ? "查词并收录" : "查词";
    get("lookup-submit").disabled = lookup.phase === "loading";
    get("lookup-cancel").hidden = lookup.phase !== "loading" && lookup.suggestionPhase !== "loading";
    const selected = lookup.results[lookup.selectedIndex];
    const same = collection.term && selected?.term === collection.term;
    get("lookup-status").textContent = same && collection.message ? collection.message : lookup.message || "";
    if (!selected && lookup.phase === "empty") {
      if (lookup.suggestionPhase === "loading") get("lookup-status").textContent += " 正在查找相近拼写…";
      if (lookup.suggestionPhase === "error") get("lookup-status").textContent += " 拼写建议暂不可用，按 Enter 可重试。";
    }
    if (value.pendingCount > 1) get("lookup-status").textContent += ` · ${value.pendingCount} 项正在收录`;
    get("lookup-retry").hidden = !owner || !value.failedCount;
    get("lookup-result").hidden = !selected;
    if (selected) {
      get("lookup-term").textContent = selected.term;
      get("lookup-pos").textContent = selected.partOfSpeech || "";
      get("lookup-meaning").replaceChildren(...dictionaryMeaningLines(selected.meaning).map(line => {
        const paragraph = document.createElement("p"); paragraph.textContent = line; return paragraph;
      }));
      get("lookup-source").textContent = [selected.source, selected.license].filter(Boolean).join(" · ");
    }
    const saved = receipts.some(item => item.entry.term === selected?.term);
    get("lookup-collect").hidden = !owner || !selected || saved || value.pendingCount > 0;
    get("lookup-collect").textContent = "收录这个词";
    if (previousResults !== lookup.results || previousSuggestions !== lookup.suggestions) {
      previousResults = lookup.results; previousSuggestions = lookup.suggestions;
      const choices = get("lookup-choices"), scrollTop = choices.scrollTop;
      const focusedChoice = choices.contains(document.activeElement) ? document.activeElement.dataset.lookupChoice : undefined;
      choices.replaceChildren();
      if (lookup.results.length > 1 || selected?.matchedForm || selected?.matchType === "related") {
        const note = document.createElement("p"); note.textContent = owner ? "点选要收录的词：" : "选择词条查看："; choices.append(note);
        lookup.results.forEach((row, index) => choices.append(button(`${row.term} · ${dictionaryChoiceDescription(row)}`, "lookupChoice", index)));
      }
      lookup.suggestions.forEach((row, index) => choices.append(button(`你是否想查 ${row.term}？`, "lookupSuggestion", index)));
      choices.hidden = !choices.childElementCount;
      choices.scrollTop = scrollTop;
      if (focusedChoice !== undefined) choices.querySelector(`[data-lookup-choice="${Number(focusedChoice)}"]`)?.focus({ preventScroll: true });
    }
    get("lookup-receipts").replaceChildren(...receipts.map(({ entry, added }) => {
      const control = button("", "lookupEntry", entry.id);
      control.dataset.entryId = entry.id; control.dataset.entryAction = "lookup-receipt";
      const term = document.createElement("strong"), note = document.createElement("span");
      term.textContent = entry.term; note.textContent = added ? "已公开收录 · 查看词卡" : "已在公开词本 · 查看词卡";
      control.append(term, note); return control;
    }));
  }
  const controller = createLibraryLookupController({ ownerRequested, ownerOrigin,
    readSession: options => api.session({ ...options, authType: "github-owner" }),
    collect: (body, { csrfToken, signal }) => api.collectDictionary(body, csrfToken, { signal }),
    signOut: ({ csrfToken }) => api.logout(csrfToken, { authType: "github-owner" }),
    relatedSearch: searchRelatedChineseDictionary, onChange: render, onCollected });
  render(controller.getState());
  get("lookup-form").addEventListener("submit", event => {
    event.preventDefault(); if (!composing && !get("lookup-submit").disabled) void controller.submit(input.value);
  });
  // Composition Enter selects an IME candidate, not a public write command.
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("keydown", event => { if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
  input.addEventListener("input", () => controller.change(input.value));
  get("lookup-cancel").addEventListener("click", () => controller.cancel());
  get("lookup-retry").addEventListener("click", () => void controller.retry());
  get("lookup-collect").addEventListener("click", () => controller.select(controller.getState().lookup.selectedIndex));
  get("lookup-choices").addEventListener("click", event => {
    const choice = event.target.closest("button[data-lookup-choice]"), suggestion = event.target.closest("button[data-lookup-suggestion]");
    if (choice) controller.select(Number(choice.dataset.lookupChoice));
    if (suggestion) {
      const index = Number(suggestion.dataset.lookupSuggestion);
      input.value = controller.getState().lookup.suggestions[index]?.term || input.value;
      void controller.chooseSuggestion(index);
    }
  });
  get("lookup-receipts").addEventListener("click", event => {
    const control = event.target.closest("button[data-lookup-entry]");
    const receipt = controller.getState().receipts.find(item => item.entry.id === control?.dataset.lookupEntry);
    const current = receipt && (resolveEntry ? resolveEntry(receipt.entry.id) : receipt.entry);
    if (current) onOpenEntry?.(current, control);
  });
  const revalidate = () => { if (!explicitlyLocked() && document.visibilityState !== "hidden" && navigator.onLine !== false) void controller.verifyOwner(); };
  window.addEventListener("focus", revalidate);
  window.addEventListener("online", revalidate);
  let channel;
  try {
    channel = new window.BroadcastChannel("zhuo-member-auth-v1");
    channel.onmessage = event => {
      if (["changed", "locked"].includes(event.data?.type)) {
        lockedInMemory = true;
        try { window.sessionStorage.setItem(lockKey, "1"); } catch { /* In-memory and read-error locks still apply. */ }
        controller.lock("另一页面的账号状态已改变，请重新登录确认。");
      }
    };
  } catch { /* Session and API checks remain authoritative. */ }
  ownerLogin.addEventListener("click", () => {
    lockedInMemory = false;
    try { window.sessionStorage.removeItem(lockKey); } catch { /* Explicit login navigation remains available. */ }
  });
  logoutButton.addEventListener("click", async () => {
    if (logoutButton.disabled) return;
    lockedInMemory = true;
    try { window.sessionStorage.setItem(lockKey, "1"); } catch { /* The in-memory latch remains authoritative in this page. */ }
    try { channel?.postMessage({ type: "locked" }); } catch { /* Backend checks remain authoritative across unavailable channels. */ }
    await controller.logout();
  });
  window.addEventListener("pagehide", () => { controller.lock(); controller.cancel(); });
  window.addEventListener("pageshow", event => { if (event.persisted) revalidate(); });
  window.addEventListener("beforeunload", event => {
    if (controller.hasUnsettled()) { event.preventDefault(); event.returnValue = ""; }
  });
  if (explicitlyLocked()) controller.lock(storageUnavailable
    ? "浏览器存储不可用，已暂停自动收录；开启站点存储后再登录。查词仍可使用。"
    : "已退出公开收录；可以继续查词。");
  else void controller.verifyOwner();
  return { ...controller, refreshReceipts: () => render(controller.getState()) };
}
