import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  createPersonalDraftStore, createPersonalExpiryTimer, createPersonalMutationTracker, createPersonalSessionScope,
  isPersonalDraftDirty, personalDraft, serializePersonalExport, validatePersonalEntry,
  validatePersonalInput, validatePersonalList, validatePersonalPassword,
  validatePersonalSession, validatePersonalUsername
} from "../js/personal-storage.js";

const UID_A = "11111111-1111-4111-8111-111111111111";
const UID_B = "22222222-2222-4222-8222-222222222222";
const WHEN = "2026-10-17T12:00:00.000Z";
const word = (overrides = {}) => ({ id: `member-${UID_A}`, revision: 1, term: "hip", normalized: "hip", meaning: "① 髋部\n② 时髦的", note: "只属于我", createdAt: WHEN, updatedAt: WHEN, ...overrides });

test("usernames start with ASCII letters and passwords count Unicode code points without trimming", () => {
  assert.equal(validatePersonalUsername("Student_12"), "student_12");
  for (const bad of ["12student", "_student", "st", "student-name", "a".repeat(25), " 用户名 "]) assert.throws(() => validatePersonalUsername(bad));
  const password = ` ${"🙂".repeat(13)} `;
  assert.equal([...password].length, 15);
  assert.equal(validatePersonalPassword(password), password);
  assert.equal(validatePersonalPassword("密".repeat(128)), "密".repeat(128));
  for (const bad of ["x".repeat(14), "🙂".repeat(129), `valid long password\n`]) assert.throws(() => validatePersonalPassword(bad));
});

test("sessions match actual backend numeric expiry, UUIDv4 and 43-character CSRF contract", () => {
  const session = { authenticated: true, user: { id: UID_A, username: "student" }, csrfToken: "a".repeat(43), expiresAt: 2000 };
  assert.deepEqual(validatePersonalSession(session, 1000), session);
  for (const bad of [
    { ...session, expiresAt: "1970-01-01T00:00:02.000Z" }, { ...session, expiresAt: 1000 },
    { ...session, csrfToken: "a".repeat(42) }, { ...session, csrfToken: `${"a".repeat(42)}!` },
    { ...session, user: { id: "old-owner-id", username: "student" } },
    { ...session, user: { id: UID_A, username: "1student" } }
  ]) assert.throws(() => validatePersonalSession(bad, 1000));
});

test("manual personal entries permit blank meanings and preserve numbered lines and notes", () => {
  assert.deepEqual(validatePersonalEntry(word()), word());
  assert.equal(validatePersonalEntry(word({ meaning: "" })).meaning, "");
  assert.deepEqual(validatePersonalInput({ term: " by some fluke ", meaning: " 侥幸\n碰巧 ", note: " 听到的表达 " }), { term: "by some fluke", meaning: " 侥幸\n碰巧 ", note: " 听到的表达 " });
  assert.equal(validatePersonalInput({ term: "ＨＩＰ", meaning: "🙂".repeat(2000), note: "" }).term, "HIP");
  assert.throws(() => validatePersonalInput({ term: "hip", meaning: "含有\u202e隐藏方向符", note: "" }));
  for (const bad of [
    word({ normalized: "wrong" }), word({ id: "member-bad-id" }), word({ password: "not an entry field" }),
    word({ revision: 0 }), word({ term: "x".repeat(201), normalized: "x".repeat(201) }),
    word({ meaning: "字".repeat(2001) }), word({ note: "字".repeat(1001) }),
    word({ updatedAt: "2026-10-16T12:00:00.000Z" })
  ]) assert.throws(() => validatePersonalEntry(bad));
});

test("private lists reject repeated IDs, normalized aliases and oversized responses", () => {
  assert.equal(validatePersonalList({ revision: 2, entries: [word()] }).entries.length, 1);
  assert.throws(() => validatePersonalList({ revision: 2, entries: [word(), word()] }), /重复/);
  assert.throws(() => validatePersonalList({ revision: 2, entries: [word(), word({ id: `member-${UID_B}` })] }), /重复/);
  assert.throws(() => validatePersonalList({ revision: 2, entries: Array(1001).fill(word()) }));
});

test("memory-only drafts are UID-isolated, cloned, and reject credential fields", () => {
  const store = createPersonalDraftStore();
  const draft = personalDraft();
  draft.term = "by some fluke";
  draft.meaning = "侥幸";
  assert.equal(isPersonalDraftDirty(draft), true);
  store.write(UID_A, draft);
  assert.equal(store.hasUnsaved(), true);
  draft.term = "changed outside";
  assert.equal(store.read(UID_A).term, "by some fluke");
  assert.equal(store.read(UID_B), null);
  const read = store.read(UID_A); read.meaning = "changed outside";
  assert.equal(store.read(UID_A).meaning, "侥幸");
  assert.throws(() => store.write(UID_A, { ...personalDraft(), password: "secret" }));
  assert.throws(() => store.write(UID_A, { ...personalDraft(), csrfToken: "secret" }));
  const unfinished = { ...personalDraft(), meaning: "字".repeat(2001), note: "暂时粘贴的\u202e无效内容" };
  store.write(UID_A, unfinished);
  assert.equal(store.read(UID_A).meaning.length, 2001);
  assert.throws(() => validatePersonalInput(store.read(UID_A)), "invalid unfinished input must not cross the network boundary");
  store.retainOnly(UID_B);
  assert.equal(store.read(UID_A), null);
  store.write(UID_B, personalDraft(word()));
  assert.equal(isPersonalDraftDirty(store.read(UID_B)), false);
  store.clear();
  assert.equal(store.hasUnsaved(), false);
  assert.equal(store.read(UID_B), null);
});

test("uncertain retry IDs remain stable only for the same account, operation and exact payload", () => {
  let next = 0;
  const tracker = createPersonalMutationTracker({ newId: () => `operation-${++next}` });
  const payload = { term: "hip", meaning: "髋部", note: "" };
  const first = tracker.idFor(UID_A, "create", payload);
  assert.equal(tracker.idFor(UID_A, "create", structuredClone(payload)), first);
  assert.notEqual(tracker.idFor(UID_B, "create", payload), first);
  assert.notEqual(tracker.idFor(UID_A, "update:word", payload), first);
  assert.notEqual(tracker.idFor(UID_A, "create", { ...payload, meaning: "时髦的" }), first);
  tracker.clear(UID_A, "create");
  assert.notEqual(tracker.idFor(UID_A, "create", payload), first);
  tracker.retainOnly(UID_B);
  assert.notEqual(tracker.idFor(UID_A, "create", payload), first);
});

test("account changes, logout and same-account revalidation invalidate every old response", () => {
  const scope = createPersonalSessionScope();
  scope.advance(UID_A);
  const a = scope.capture();
  const request = scope.request();
  assert.equal(request.current(), true);
  scope.advance(UID_B);
  assert.equal(request.signal.aborted, true);
  assert.equal(request.current(), false);
  assert.equal(scope.current(a), false);
  const b = scope.capture();
  scope.advance(UID_B);
  assert.equal(scope.current(b), false);
  const pending = scope.request();
  scope.advance();
  assert.equal(pending.current(), false);
  assert.equal(pending.signal.aborted, true);
});

function fakeTimers() {
  let clock = 1000;
  let next = 0;
  const timers = new Map();
  const options = {
    now: () => clock,
    setTimer: (callback, delay) => { const id = ++next; timers.set(id, { callback, delay }); return id; },
    clearTimer: (id) => timers.delete(id)
  };
  return { options, timers, advance: (value) => { clock = value; }, fire: () => {
    const [id, timer] = [...timers][0]; timers.delete(id); timer.callback();
  } };
}

test("wall-clock expiry locks exactly at the deadline without focus or network activity", () => {
  const fake = fakeTimers();
  let locks = 0;
  const timer = createPersonalExpiryTimer(fake.options);
  timer.schedule({ expiresAt: 2000, isCurrent: () => true, onExpire: () => { locks += 1; } });
  assert.equal([...fake.timers.values()][0].delay, 1000);
  fake.advance(1999); fake.fire();
  assert.equal(locks, 0);
  assert.equal([...fake.timers.values()][0].delay, 1);
  fake.advance(2000); fake.fire();
  assert.equal(locks, 1);
  assert.equal(fake.timers.size, 0);
});

test("expiry checks are generation/UID scoped and clear cancels even an already queued callback", () => {
  const fake = fakeTimers();
  const scope = createPersonalSessionScope();
  scope.advance(UID_A);
  const token = scope.capture();
  let locks = 0;
  const timer = createPersonalExpiryTimer(fake.options);
  timer.schedule({ expiresAt: 2000, isCurrent: () => scope.current(token), onExpire: () => { locks += 1; } });
  const oldCallback = [...fake.timers.values()][0].callback;
  timer.clear();
  assert.equal(fake.timers.size, 0);
  fake.advance(2001); oldCallback();
  assert.equal(locks, 0);
  fake.advance(1000);
  timer.schedule({ expiresAt: 2000, isCurrent: () => scope.current(token), onExpire: () => { locks += 1; } });
  scope.advance(UID_B);
  fake.advance(2001); fake.fire();
  assert.equal(locks, 0, "user A's timer must not lock user B");
});

test("long expiry timers are chunked and recheck the wall clock before locking", () => {
  const fake = fakeTimers();
  let locks = 0;
  const timer = createPersonalExpiryTimer({ ...fake.options, maximumDelay: 500 });
  timer.schedule({ expiresAt: 2200, isCurrent: () => true, onExpire: () => { locks += 1; } });
  assert.equal([...fake.timers.values()][0].delay, 500);
  fake.advance(1500); fake.fire();
  assert.equal([...fake.timers.values()][0].delay, 500);
  fake.advance(2000); fake.fire();
  assert.equal([...fake.timers.values()][0].delay, 200);
  fake.advance(2400); fake.fire();
  assert.equal(locks, 1);
});

test("private JSON exports contain only validated words and no session or recovery metadata", () => {
  const text = serializePersonalExport([word()], "student", WHEN);
  const value = JSON.parse(text);
  assert.equal(value.format, "zhuo-private-wordbook");
  assert.deepEqual(value.entries, [word()]);
  assert.equal(/password|csrfToken|recoveryCode|rawSession/.test(text), false);
  assert.throws(() => serializePersonalExport([word({ csrfToken: "not allowed" })], "student", WHEN));
});

test("private form shells are disabled without JavaScript and credentials cannot become GET query strings", async () => {
  const html = await readFile(new URL("../personal.html", import.meta.url), "utf8");
  for (const id of ["member-login-form", "member-register-form", "member-reset-form", "member-entry-form", "delete-account-form"]) {
    const form = html.match(new RegExp(`<form id="${id}"[^>]*>[\\s\\S]*?<\\/form>`))?.[0];
    assert.ok(form, id);
    assert.match(form, /method="post"/);
    assert.match(form, /<fieldset disabled>/);
  }
  const source = await readFile(new URL("../js/personal-app.js", import.meta.url), "utf8");
  const storage = await readFile(new URL("../js/personal-storage.js", import.meta.url), "utf8");
  assert.doesNotMatch(source + storage, /localStorage\.|indexedDB\.|caches\./);
  assert.match(source, /window\.location\.replace\(target\.href\)/);
  assert.match(source, /sessionStorage\.setItem\(LOCK_KEY, "1"\)/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)|owner\/publish|ai\/organize/);
});
