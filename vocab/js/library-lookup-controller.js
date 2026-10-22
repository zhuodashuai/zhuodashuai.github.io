import { createDictionaryController } from "./dictionary-app.js?v=104";
import { automaticDictionaryCollection, createDictionaryCollectionQueue } from "./dictionary-collection.js?v=98";
import { validatePersonalSession, createPersonalExpiryTimer } from "./personal-storage.js?v=82";

// Lookup remains public/read-only unless a fixed-origin, explicit owner session
// is independently verified. Reading never grants write authority.
export function createLibraryLookupController({ ownerRequested = false, ownerOrigin = false,
  readSession, collect, signOut, search, suggest, relatedSearch, onChange = () => {}, onCollected = () => {},
  now = () => Date.now(), expiryTimer = createPersonalExpiryTimer() } = {}) {
  let session = null, epoch = 0, sequence = 0, verification = null, verificationAbort = null;
  let authPhase = "visitor", authMessage = "", receipts = [], disposed = false;
  let lookup = { phase: "idle", input: "", results: [], selectedIndex: 0, suggestions: [] };
  let collection = { term: "", phase: "idle", message: "" };
  const authorized = () => !disposed && ownerRequested && ownerOrigin && authPhase === "ready"
    && session?.authType === "github-owner" && session.expiresAt > now();
  function getState() {
    const queue = collector.snapshot();
    return { lookup, authPhase, authMessage, owner: authorized(), receipts: receipts.slice(),
      pendingCount: queue.pendingCount, failedCount: queue.failedCount, collection: { ...collection } };
  }
  function publish() { if (!disposed) onChange(getState()); }
  const dictionary = createDictionaryController({ search, suggest, relatedSearch,
    onChange(value) { lookup = value; publish(); } });
  const collector = createDictionaryCollectionQueue({ collect,
    onChange(value) {
      collection = { term: value.term, phase: value.phase, message: value.message };
      if (value.authenticationRequired) { lock("登录已失效，请重新登录；未确认的收录可重试。"); return; }
      if (value.phase === "saved" && value.entry && authorized()) {
        receipts = [{ entry: value.entry, added: value.added }, ...receipts.filter(item => item.entry.id !== value.entry.id)].slice(0, 5);
        onCollected(value.entry, { added: value.added });
      }
      publish();
    }
  });
  function lock(message = "请重新确认卓的 GitHub 登录。") {
    epoch++; verificationAbort?.abort(); verificationAbort = null; verification = null;
    session = null; authPhase = "locked"; authMessage = message; expiryTimer.clear();
    collector.pause(); publish();
  }
  async function verifyOwner() {
    if (disposed || !ownerRequested || !ownerOrigin) return false;
    if (verification) return verification;
    if (authorized() && collector.snapshot().pendingCount) return true;
    const current = ++epoch, abort = new AbortController(); verificationAbort = abort;
    session = null; authPhase = "checking"; authMessage = "正在确认登录…";
    expiryTimer.clear(); collector.pause(); publish();
    const task = (async () => {
      try {
        const payload = await Promise.resolve().then(() => readSession({ signal: abort.signal }));
        if (disposed || current !== epoch || abort.signal.aborted) return false;
        if (payload?.authenticated === false) {
          authPhase = "anonymous"; authMessage = "登录卓的 GitHub 后，查到的词会直接公开收录。"; publish(); return false;
        }
        const verified = validatePersonalSession(payload, now());
        if (verified.authType !== "github-owner") throw new Error("Not an owner session");
        session = verified; authPhase = "ready"; authMessage = "卓 · 查词自动公开收录";
        expiryTimer.schedule({ expiresAt: verified.expiresAt,
          isCurrent: () => current === epoch && session === verified && !disposed,
          onExpire: () => lock("登录已到期，请重新登录；查词仍可使用。") });
        publish(); return true;
      } catch (error) {
        if (disposed || current !== epoch || abort.signal.aborted) return false;
        authPhase = error?.status === 401 || /登录结果|owner session/u.test(error?.message || "") ? "locked" : "unavailable";
        authMessage = "暂未确认卓的登录；可以查词，尚未公开收录。"; publish(); return false;
      } finally {
        if (current === epoch) { verification = null; verificationAbort = null; }
      }
    })();
    verification = task;
    return task;
  }
  async function collectResult(result, current) {
    if (authPhase === "checking" && verification) await verification;
    if (disposed || current !== sequence || !authorized()) return false;
    const verified = session, authority = epoch;
    return collector.enqueue(result.term, { userId: verified.user.id, csrfToken: verified.csrfToken,
      isCurrent: () => authorized() && authority === epoch && session === verified });
  }
  function change(input) { sequence++; dictionary.change(input); }
  async function submit(input = lookup.input) {
    if (lookup.phase === "loading" && input === lookup.input) return false;
    const current = ++sequence;
    const success = await dictionary.submit(input);
    if (!success || current !== sequence || disposed) return false;
    const result = dictionary.getState();
    if (automaticDictionaryCollection(input, result)) void collectResult(result.results[0], current);
    return true;
  }
  function select(index) {
    if (!dictionary.select(index)) return false;
    const result = dictionary.getState().results[index];
    void collectResult(result, sequence); return true;
  }
  function chooseSuggestion(index) {
    const term = dictionary.getState().suggestions[index]?.term;
    if (!term) return Promise.resolve(false);
    change(term); return submit(term);
  }
  function cancel() { sequence++; dictionary.cancel(); }
  function retry() {
    if (!authorized()) return Promise.resolve(false);
    const verified = session, authority = epoch;
    return collector.retry({ userId: verified.user.id, csrfToken: verified.csrfToken,
      isCurrent: () => authorized() && session === verified && authority === epoch });
  }
  function dispose() {
    disposed = true; sequence++; epoch++; verificationAbort?.abort(); session = null;
    expiryTimer.clear(); dictionary.cancel(); collector.clear(); receipts = [];
  }
  async function logout() {
    const verified = session;
    if (!authorized() || collector.snapshot().pendingCount) return false;
    lock("已退出公开收录；查词仍可使用。");
    try { await signOut({ csrfToken: verified.csrfToken }); return true; }
    catch { authMessage = "本页已停止公开收录；服务器退出尚未确认，请重新登录核对。"; publish(); return false; }
  }
  return { change, submit, select, chooseSuggestion, cancel, verifyOwner, retry, lock, dispose, logout,
    hasUnsettled: () => collector.hasUnsettled(), getState };
}
