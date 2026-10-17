import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../../vocab/js/owner-app.js", import.meta.url), "utf8");
const start = source.indexOf("async function flushPendingDraftSave() {");
const end = source.indexOf("\nfunction scheduleDraftSave()", start);
assert.ok(start >= 0 && end > start, "exercise the actual owner-app save gate without loading the page startup");
const flushSource = source.slice(start, end);
const discardStart = source.indexOf("async function discardCurrentDraft() {");
const discardEnd = source.indexOf('\nrefs.discardDraft.addEventListener("click", discardCurrentDraft);', discardStart);
assert.ok(discardStart >= 0 && discardEnd > discardStart);
const discardSource = source.slice(discardStart, discardEnd);
const draft = (meaning = "尚未保存的修改", contentRevision = 1) => ({ id: "draft-one", value: { meaning }, localState: "local_saved", contentRevision });
const pending = (meaning, token = "edit-one") => ({ token, draft: draft(meaning) });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function harness(saveDraft) {
  const context = vm.createContext({
    state: { pendingSave: pending(), saveTimer: 1, draftSaveTask: null, currentDraft: draft("原有内容") },
    window: { clearTimeout() {} },
    refs: { draftState: {} },
    STATE_LABELS: { local_saved: "本地已保存" },
    renderDrafts: async () => {},
    saveDraft
  });
  vm.runInContext(flushSource, context);
  return { context, state: context.state, flush: () => vm.runInContext("flushPendingDraftSave()", context) };
}

test("a failed durable draft write stays pending and every later gate retries it", async () => {
  let attempts = 0;
  const { state, flush } = harness(async (candidate) => {
    attempts += 1;
    if (attempts < 3) throw new Error("Quota exhausted");
    return { ...candidate, contentRevision: 2 };
  });
  await assert.rejects(flush(), /Quota exhausted/);
  assert.equal(state.pendingSave.draft.value.meaning, "尚未保存的修改");
  assert.equal(state.draftSaveTask, null);
  await assert.rejects(flush(), /Quota exhausted/);
  assert.equal(state.pendingSave.draft.value.meaning, "尚未保存的修改");
  const saved = await flush();
  assert.equal(saved.value.meaning, "尚未保存的修改");
  assert.equal(attempts, 3);
  assert.equal(state.pendingSave, null);
  assert.equal(state.currentDraft.contentRevision, 2);
});

test("concurrent update/export gates await the in-flight write and newest edits in order", async () => {
  const firstWrite = deferred();
  const writes = [];
  const { state, flush } = harness(async (candidate) => {
    writes.push(structuredClone(candidate));
    if (writes.length === 1) await firstWrite.promise;
    return { ...candidate, contentRevision: candidate.contentRevision + 1 };
  });
  const firstGate = flush();
  let secondFinished = false;
  const secondGate = flush().then(() => { secondFinished = true; });
  state.pendingSave = pending("写入期间输入的更新", "edit-two");
  await Promise.resolve();
  assert.equal(secondFinished, false, "a second gate must not mistake an active write for no unsaved work");
  assert.equal(writes.length, 1, "do not start concurrent CAS writes with the same revision");
  firstWrite.resolve();
  await Promise.all([firstGate, secondGate]);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].value.meaning, "写入期间输入的更新");
  assert.equal(writes[1].contentRevision, 2, "newer edits use the revision committed by the first write");
  assert.equal(state.currentDraft.value.meaning, "写入期间输入的更新");
  assert.equal(state.currentDraft.contentRevision, 3);
  assert.equal(state.pendingSave, null);
});

test("failure during an active write preserves a newer pending edit rather than restoring a stale snapshot", async () => {
  const firstWrite = deferred();
  let attempts = 0;
  const { state, flush } = harness(async (candidate) => {
    attempts += 1;
    if (attempts === 1) await firstWrite.promise;
    return { ...candidate, contentRevision: candidate.contentRevision + 1 };
  });
  const gate = flush();
  state.pendingSave = pending("失败期间继续输入的内容", "edit-newer");
  firstWrite.reject(new Error("Storage unavailable"));
  await assert.rejects(gate, /Storage unavailable/);
  assert.equal(state.pendingSave.token, "edit-newer");
  assert.equal(state.pendingSave.draft.value.meaning, "失败期间继续输入的内容");
  await flush();
  assert.equal(state.currentDraft.value.meaning, "失败期间继续输入的内容");
  assert.equal(attempts, 2);
});

test("finishing a background write never pulls the editor back to a different draft", async () => {
  const write = deferred();
  const { state, context, flush } = harness(async (candidate) => {
    await write.promise;
    return { ...candidate, contentRevision: 2 };
  });
  const gate = flush();
  state.currentDraft = { ...draft("另一份草稿"), id: "draft-two" };
  context.refs.draftState.textContent = "另一份草稿的状态";
  write.resolve();
  await gate;
  assert.equal(state.currentDraft.id, "draft-two");
  assert.equal(state.currentDraft.value.meaning, "另一份草稿");
  assert.equal(context.refs.draftState.textContent, "另一份草稿的状态");
});

function discardHarness(saveDraft, removeDraft = async () => {}) {
  const setup = harness(saveDraft);
  const { context, state } = setup;
  Object.assign(state, { discardingDraftId: null, publishing: false, queueBusy: false, organizingToken: null, commitLockedDraftId: null, draftAiStatus: new Map() });
  context.window.confirm = () => true;
  Object.assign(context.refs, {
    ownerWorkspace: { inert: false }, entryForm: { hidden: false }, editorEmpty: { hidden: true },
    editorAiStatus: { hidden: false }, draftCompletionNotice: { hidden: false }, captureStatus: {}
  });
  context.deleteDraft = removeDraft;
  context.showEditorError = (message) => { context.errorMessage = message; };
  context.setStatus = (element, message) => { element.textContent = message; };
  context.scheduleImportedSynonymScans = () => {};
  vm.runInContext(discardSource, context);
  return { ...setup, discard: () => vm.runInContext("discardCurrentDraft()", context) };
}

test("confirmed deletion waits for an active save before removing the exact draft", async () => {
  const write = deferred();
  const events = [];
  const { state, context, flush, discard } = discardHarness(async (candidate) => {
    events.push("save-started");
    await write.promise;
    events.push("save-finished");
    return { ...candidate, contentRevision: 2 };
  }, async (id) => { events.push(`delete-${id}`); });
  const activeSave = flush();
  const deleting = discard();
  assert.equal(context.refs.ownerWorkspace.inert, true);
  assert.deepEqual(events, ["save-started"]);
  write.resolve();
  await Promise.all([activeSave, deleting]);
  assert.deepEqual(events, ["save-started", "save-finished", "delete-draft-one"]);
  assert.equal(state.currentDraft, null);
  assert.equal(state.pendingSave, null);
  assert.equal(context.refs.ownerWorkspace.inert, false);
  assert.equal(context.refs.entryForm.hidden, true);
  assert.equal(await flush(), null, "a late debounce/exit gate has nothing left to recreate");
});

test("failed saving blocks deletion without closing the editor and the same target can be retried", async () => {
  let saveAttempts = 0;
  const removed = [];
  const { state, context, discard } = discardHarness(async (candidate) => {
    if (++saveAttempts === 1) throw new Error("Storage unavailable");
    return { ...candidate, contentRevision: 2 };
  }, async (id) => { removed.push(id); });
  await discard();
  assert.deepEqual(removed, []);
  assert.match(context.errorMessage, /删除未完成.*Storage unavailable/);
  assert.equal(state.pendingSave.draft.value.meaning, "尚未保存的修改");
  assert.equal(state.currentDraft.id, "draft-one");
  assert.equal(context.refs.ownerWorkspace.inert, false);
  assert.equal(context.refs.entryForm.hidden, false);
  await discard();
  assert.deepEqual(removed, ["draft-one"]);
  assert.equal(state.currentDraft, null);
});

test("deletion refuses a draft involved in an active publication or AI commit", async () => {
  for (const flag of ["publishing", "queueBusy", "organizingToken", "commitLockedDraftId"]) {
    const { state, context, discard } = discardHarness(async () => assert.fail("must not save while the owner mutation is active"), async () => assert.fail("must not delete while the owner mutation is active"));
    state[flag] = true;
    context.window.confirm = () => assert.fail("do not ask to delete a currently changing draft");
    await discard();
    assert.match(context.errorMessage, /正在整理或发布/);
    assert.equal(state.currentDraft.id, "draft-one");
    assert.ok(state.pendingSave);
    assert.equal(context.refs.ownerWorkspace.inert, false);
  }
});

test("a target changed while waiting for a write is not deleted or hidden", async () => {
  const write = deferred();
  const { state, context, discard } = discardHarness(async (candidate) => {
    await write.promise;
    return { ...candidate, contentRevision: 2 };
  }, async () => assert.fail("a stale confirmation must not delete a newly selected draft"));
  const deleting = discard();
  state.currentDraft = { ...draft("另一份草稿"), id: "draft-two" };
  write.resolve();
  await deleting;
  assert.equal(state.currentDraft.id, "draft-two");
  assert.equal(context.refs.entryForm.hidden, false);
  assert.equal(context.refs.ownerWorkspace.inert, false);
  assert.match(context.errorMessage, /当前草稿已改变/);
});
