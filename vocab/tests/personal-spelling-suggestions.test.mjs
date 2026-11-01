import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalSpellingSuggestions } from "../js/personal-lookup-flow.js";
const deferred = () => { let resolve; return { promise: new Promise(value => { resolve = value; }), resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("personal suggestions are an independent sidecar and preserve the exact input until explicit selection", async () => {
  const late = deferred(), seen = []; let options;
  const sidecar = createPersonalSpellingSuggestions({ suggest: (_input, value) => { options = value; return late.promise; }, onChange: value => seen.push(value) });
  const pending = sidecar.show("heppy");
  assert.equal(sidecar.getState().phase, "loading"); assert.equal(sidecar.getState().query, "heppy");
  await tick(); assert.equal(options.limit, 5); assert.equal(options.timeoutMs, 3000); assert.ok(options.signal instanceof AbortSignal);
  const source = [{ term: "happy", meaning: "An injected definition must never become a candidate card" }, { term: "HAPPY" },
    { term: "hippy" }, { term: "hoppy" }, { term: "peppy" }, { term: "hempy" }, { term: "too-many" }, { term: "<script>" }];
  const before = structuredClone(source); late.resolve(source); assert.equal(await pending, true);
  assert.equal(sidecar.getState().query, "heppy");
  assert.deepEqual(sidecar.getState().suggestions, [{ term: "happy" }, { term: "hippy" }, { term: "hoppy" }, { term: "peppy" }, { term: "hempy" }]);
  assert.deepEqual(source, before); assert.equal(seen.some(value => value.phase === "loading"), true);
});

test("fullwidth English reaches spelling suggestions without rewriting the original query or its current-scope check", async () => {
  const query = "ＨＥＰＰＹ", calls = [];
  const sidecar = createPersonalSpellingSuggestions({ suggest: async input => {
    calls.push(input); return [{ term: "happy" }];
  } });
  const task = sidecar.show(query, { isCurrent: () => query === "ＨＥＰＰＹ" });
  assert.equal(sidecar.getState().phase, "loading"); assert.equal(sidecar.getState().query, query);
  assert.equal(await task, true); assert.deepEqual(calls, [query]);
  assert.deepEqual(sidecar.getState(), { phase: "ready", query, suggestions: [{ term: "happy" }] });
});

test("editing or a repeated query promptly cancels an abort-ignoring old suggestion task without stale paint", async () => {
  for (const repeat of [false, true]) {
    const old = deferred(); let oldSignal, calls = 0;
    const sidecar = createPersonalSpellingSuggestions({ suggest: (_input, { signal }) => {
      if (++calls === 1) { oldSignal = signal; return old.promise; } return [{ term: "apple" }];
    } });
    const first = sidecar.show("heppy"); await tick();
    if (repeat) await sidecar.show("applle"); else sidecar.clear();
    assert.equal(await first, false); assert.equal(oldSignal.aborted, true);
    const snapshot = structuredClone(sidecar.getState()); old.resolve([{ term: "happy" }]); await tick();
    assert.deepEqual(sidecar.getState(), snapshot);
    assert.equal(snapshot.phase, repeat ? "ready" : "idle");
  }
});

test("a changed account or session token prevents late candidates even if the field text stays identical", async () => {
  const late = deferred(); let current = true;
  const sidecar = createPersonalSpellingSuggestions({ suggest: () => late.promise });
  const task = sidecar.show("heppy", { isCurrent: () => current }); await tick(); current = false;
  late.resolve([{ term: "happy" }]); assert.equal(await task, false); assert.deepEqual(sidecar.getState().suggestions, []);
  sidecar.clear(); assert.equal(sidecar.getState().phase, "idle");
});

test("a failed or hung spelling sidecar ends with a bounded safe message and no exception text or definition", async () => {
  for (const suggest of [async () => { throw Error("private internal exception"); }, () => new Promise(() => {})]) {
    const sidecar = createPersonalSpellingSuggestions({ suggest, timeoutMs: 10 });
    const started = Date.now(); assert.equal(await sidecar.show("heppy"), false); assert.ok(Date.now() - started < 500);
    assert.deepEqual(sidecar.getState(), { phase: "error", query: "heppy", suggestions: [] });
  }
});

test("Chinese and invalid inputs never start optional English suggestion work", async () => {
  let calls = 0;
  const sidecar = createPersonalSpellingSuggestions({ suggest: async () => { calls++; return []; } });
  for (const input of [null, undefined, {}, "开心", "USB充电头", "heppy\u202e", "x".repeat(201)]) assert.equal(await sidecar.show(input), false);
  assert.equal(calls, 0); assert.equal(sidecar.getState().phase, "idle");
});
