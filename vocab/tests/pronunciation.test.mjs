import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPronunciationController, normalizeAudioPreferences, selectEnglishVoice } from "../js/pronunciation.js";

const STORAGE_KEY = "zhuo-wordbook-pronunciation-v1";
const gb = { name: "British local", lang: "en-GB", localService: true, default: false };
const us = { name: "American local", lang: "en-US", localService: true, default: true };
const zh = { name: "Chinese local", lang: "zh-CN", localService: true, default: true };

class FakeTarget {
  listeners = new Map();
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, event = {}) {
    for (const fn of this.listeners.get(type) || []) fn({ type, ...event });
    this[`on${type}`]?.({ type, ...event });
  }
}

function fixture({ voices = [zh, us, gb], stored = null, offline = false, blockedStorage = false, supported = true } = {}) {
  const environment = new FakeTarget();
  const synthesis = new FakeTarget();
  const timers = new Map();
  const utterances = [];
  const values = new Map(stored === null ? [] : [[STORAGE_KEY, stored]]);
  let timerId = 0;
  let cancelCount = 0;
  let active = null;
  synthesis.getVoices = () => voices;
  synthesis.speak = utterance => { utterances.push(utterance); active = utterance; };
  synthesis.cancel = () => {
    cancelCount += 1;
    const old = active;
    active = null;
    old?.dispatch("error", { error: "canceled" });
  };
  synthesis.resume = () => {};
  class FakeUtterance extends FakeTarget { constructor(text) { super(); this.text = text; } }
  environment.document = Object.assign(new FakeTarget(), { hidden: false, visibilityState: "visible" });
  environment.navigator = { onLine: !offline };
  environment.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  environment.clearTimeout = id => timers.delete(id);
  environment.localStorage = {
    getItem(key) { if (blockedStorage) throw new Error("Storage disabled"); return values.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw new Error("Quota exceeded"); values.set(key, value); }
  };
  if (supported) {
    environment.speechSynthesis = synthesis;
    environment.SpeechSynthesisUtterance = FakeUtterance;
  }
  const controller = createPronunciationController({ environment, startTimeoutMs: 20, endTimeoutMs: 100 });
  return {
    environment, synthesis, controller, utterances, timers, values,
    get cancelCount() { return cancelCount; },
    setVoices(next) { voices = next; synthesis.dispatch("voiceschanged"); },
    fireDelay(delay) {
      for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); }
    }
  };
}

test("audio preferences use British English and normal speed by default", () => {
  assert.deepEqual(normalizeAudioPreferences(), { accent: "en-GB", rate: 1 });
  for (const value of [null, false, "bad", [], { accent: "zh-CN", rate: 20 }]) {
    assert.deepEqual(normalizeAudioPreferences(value), { accent: "en-GB", rate: 1 });
  }
  assert.deepEqual(normalizeAudioPreferences({ accent: "en-US", rate: 0.75 }), { accent: "en-US", rate: 0.75 });
});

test("voice selection honours exact accent before the system default", () => {
  assert.equal(selectEnglishVoice([zh, us, gb], "en-GB"), gb);
  assert.equal(selectEnglishVoice([gb, us], "en-US"), us);
});

test("local voice is preferred when several voices share an accent", () => {
  const remote = { ...gb, name: "British online", default: true, localService: false };
  assert.equal(selectEnglishVoice([remote, gb], "en-GB"), gb);
});

test("missing accent falls back only to an English voice", () => {
  assert.equal(selectEnglishVoice([zh, us], "en-GB"), us);
  assert.equal(selectEnglishVoice([zh], "en-GB"), null);
  assert.equal(selectEnglishVoice([], "en-GB"), null);
});

test("voice language matching accepts case and underscore variants without mutating the supplied list", () => {
  const variant = { ...gb, lang: "EN_gb" };
  const voices = [us, zh, variant];
  assert.equal(selectEnglishVoice(voices, "en-GB"), variant);
  assert.deepEqual(voices, [us, zh, variant]);
});

test("a British accent subtag remains preferred over an American default voice", () => {
  const britishVariant = { ...gb, lang: "en-GB-x-rp" };
  assert.equal(selectEnglishVoice([us, britishVariant], "en-GB"), britishVariant);
});

test("offline selection excludes network-only voices without inventing an installed voice", () => {
  const remote = { ...gb, localService: false };
  assert.equal(selectEnglishVoice([remote, us], "en-GB", { offline: true }), us);
  assert.equal(selectEnglishVoice([remote, zh], "en-GB", { offline: true }), null);
});

test("controller does not autoplay and emits idle default state", () => {
  const f = fixture();
  assert.equal(f.controller.getState().supported, true);
  assert.equal(f.controller.getState().status, "idle");
  assert.deepEqual(f.controller.getState().preferences, { accent: "en-GB", rate: 1 });
  assert.equal(f.utterances.length, 0);
  f.controller.destroy();
});

test("saved preferences are loaded and partial preference changes preserve the other setting", () => {
  const f = fixture({ stored: JSON.stringify({ accent: "en-US", rate: 0.75 }) });
  assert.deepEqual(f.controller.getState().preferences, { accent: "en-US", rate: 0.75 });
  f.controller.setPreferences({ accent: "en-GB" });
  assert.deepEqual(f.controller.getState().preferences, { accent: "en-GB", rate: 0.75 });
  assert.deepEqual(JSON.parse(f.values.get(STORAGE_KEY)), { accent: "en-GB", rate: 0.75 });
  assert.equal(f.controller.getState().preferenceSaved, true);
  f.controller.destroy();
});

test("corrupted saved JSON does not prevent pronunciation", () => {
  const f = fixture({ stored: "{broken" });
  assert.deepEqual(f.controller.getState().preferences, { accent: "en-GB", rate: 1 });
  f.controller.speak("tranquil");
  assert.equal(f.utterances[0].text, "tranquil");
  f.controller.destroy();
});

test("blocked storage keeps in-memory preferences and reports they were not saved", () => {
  const f = fixture({ blockedStorage: true });
  f.controller.setPreferences({ accent: "en-US", rate: 0.75 });
  assert.deepEqual(f.controller.getState().preferences, { accent: "en-US", rate: 0.75 });
  assert.equal(f.controller.getState().preferenceSaved, false);
  f.controller.speak("sycamore");
  assert.equal(f.utterances[0].lang, "en-US");
  assert.equal(f.utterances[0].rate, 0.75);
  f.controller.destroy();
});

test("speech starts synchronously in the user's gesture and keeps full phrases intact", () => {
  const f = fixture();
  f.controller.speak("take one's cue from", { key: "phrase-1" });
  assert.equal(f.utterances.length, 1, "do not defer speak() behind a timer or async voice request");
  assert.equal(f.utterances[0].text, "take one's cue from");
  assert.equal(f.utterances[0].voice, gb);
  assert.equal(f.utterances[0].lang, "en-GB");
  assert.equal(f.utterances[0].rate, 1);
  assert.equal(f.controller.getState().activeKey, "phrase-1");
  assert.equal(f.controller.getState().status, "loading");
  f.utterances[0].dispatch("start");
  assert.equal(f.controller.getState().status, "speaking");
  f.utterances[0].dispatch("end");
  assert.equal(f.controller.getState().status, "idle");
  f.controller.destroy();
});

test("clicking the active word toggles it off rather than enqueueing duplicate speech", () => {
  const f = fixture();
  f.controller.speak("tranquil", { key: "word-1" });
  const before = f.cancelCount;
  f.controller.speak("tranquil", { key: "word-1" });
  assert.equal(f.utterances.length, 1);
  assert.ok(f.cancelCount > before);
  assert.equal(f.controller.getState().status, "idle");
  f.controller.destroy();
});

test("switching words cancels the old utterance and ignores all late callbacks", () => {
  const f = fixture();
  f.controller.speak("tranquil", { key: "first" });
  const first = f.utterances[0];
  f.controller.speak("sycamore", { key: "second" });
  const second = f.utterances[1];
  second.dispatch("start");
  for (const type of ["start", "end", "error"]) first.dispatch(type, { error: "synthesis-failed" });
  assert.equal(f.controller.getState().activeKey, "second");
  assert.equal(f.controller.getState().status, "speaking");
  assert.equal(f.utterances.length, 2);
  second.dispatch("end");
  assert.equal(f.controller.getState().status, "idle");
  f.controller.destroy();
});

test("manual stop is not misreported as a pronunciation error", () => {
  const f = fixture();
  f.controller.speak("gouge");
  f.utterances[0].dispatch("start");
  f.controller.stop();
  f.utterances[0].dispatch("error", { error: "interrupted" });
  assert.equal(f.controller.getState().status, "idle");
  assert.equal(f.timers.size, 0);
  f.controller.destroy();
});

test("changing voice preferences stops the old voice before the next playback", () => {
  const f = fixture();
  f.controller.speak("tranquil");
  const previous = f.utterances[0];
  f.controller.setPreferences({ accent: "en-US", rate: 0.75 });
  assert.equal(f.controller.getState().status, "idle");
  previous.dispatch("error", { error: "synthesis-failed" });
  assert.equal(f.controller.getState().status, "idle");
  f.controller.speak("tranquil");
  assert.equal(f.utterances[1].voice, us);
  assert.equal(f.utterances[1].rate, 0.75);
  f.controller.destroy();
});

test("navigation away and hidden-page transitions stop speech without autoplay on return", () => {
  const f = fixture();
  f.controller.speak("tranquil");
  f.environment.dispatch("pagehide");
  assert.equal(f.controller.getState().status, "idle");
  f.controller.speak("gouge");
  f.environment.document.hidden = true;
  f.environment.document.dispatch("visibilitychange");
  assert.equal(f.controller.getState().status, "idle");
  f.environment.document.hidden = false;
  f.environment.document.dispatch("visibilitychange");
  assert.equal(f.utterances.length, 2);
  assert.equal(f.controller.getState().status, "idle");
  f.controller.destroy();
});

test("callers cannot mutate saved preferences by editing getState snapshots", () => {
  const f = fixture();
  const snapshot = f.controller.getState();
  snapshot.preferences.accent = "zh-CN";
  snapshot.status = "error";
  assert.equal(f.controller.getState().preferences.accent, "en-GB");
  assert.equal(f.controller.getState().status, "idle");
  f.controller.destroy();
});

test("unknown voices can use the requested language immediately, then use voices loaded later", () => {
  const f = fixture({ voices: [] });
  f.controller.speak("tranquil");
  assert.equal(f.utterances.length, 1);
  assert.equal(f.utterances[0].lang, "en-GB");
  f.controller.stop();
  f.setVoices([zh, us, gb]);
  f.controller.speak("gouge");
  assert.equal(f.utterances[1].voice, gb);
  f.controller.destroy();
});

test("known non-English voices produce a visible error instead of reading English as Chinese", () => {
  const f = fixture({ voices: [zh] });
  f.controller.speak("sycamore");
  assert.equal(f.utterances.length, 0);
  assert.equal(f.controller.getState().status, "error");
  assert.match(f.controller.getState().message, /英语|英文/);
  f.controller.destroy();
});

test("missing requested accent reports the actual fallback voice language", () => {
  const f = fixture({ voices: [zh, us] });
  f.controller.speak("sycamore");
  assert.equal(f.utterances[0].voice, us);
  assert.equal(f.controller.getState().voiceLang, "en-US");
  f.controller.destroy();
});

test("offline remote-only speech fails visibly instead of claiming cached audio is available", () => {
  const f = fixture({ voices: [{ ...gb, localService: false }], offline: true });
  f.controller.speak("tranquil");
  assert.equal(f.utterances.length, 0);
  assert.equal(f.controller.getState().status, "error");
  assert.match(f.controller.getState().message, /离线|本机|本地/);
  f.controller.destroy();
});

test("unsupported browsers remain safe and expose a readable explanation", () => {
  const f = fixture({ supported: false });
  assert.equal(f.controller.getState().supported, false);
  f.controller.speak("tranquil");
  assert.equal(f.controller.getState().status, "error");
  assert.match(f.controller.getState().message, /不支持|不可用/);
  assert.doesNotThrow(() => f.controller.stop());
  f.controller.destroy();
});

test("whitespace-only input never reaches the system speech queue", () => {
  const f = fixture();
  f.controller.speak(" \n\t ");
  assert.equal(f.utterances.length, 0);
  assert.notEqual(f.controller.getState().status, "speaking");
  f.controller.destroy();
});

test("synchronous synthesis exceptions produce a recoverable visible error", () => {
  const f = fixture();
  f.synthesis.speak = () => { throw new Error("No audio output"); };
  assert.doesNotThrow(() => f.controller.speak("tranquil"));
  assert.equal(f.controller.getState().status, "error");
  assert.ok(f.controller.getState().message.length > 0);
  assert.equal(f.timers.size, 0);
  f.controller.destroy();
});

for (const reason of ["not-allowed", "network", "synthesis-unavailable", "audio-hardware", "language-unavailable"]) {
  test(`system speech error '${reason}' is visible and allows a fresh retry`, () => {
    const f = fixture();
    f.controller.speak("tranquil");
    f.utterances[0].dispatch("error", { error: reason });
    assert.equal(f.controller.getState().status, "error");
    assert.ok(f.controller.getState().message.length > 0);
    assert.equal(f.timers.size, 0);
    f.controller.speak("tranquil");
    assert.equal(f.utterances.length, 2);
    assert.equal(f.controller.getState().status, "loading");
    f.controller.destroy();
  });
}

test("silent startup timeout stops stuck playback and shows an actionable failure", () => {
  const f = fixture();
  f.controller.speak("tranquil");
  f.fireDelay(20);
  assert.equal(f.controller.getState().status, "error");
  assert.ok(f.controller.getState().message.length > 0);
  assert.equal(f.timers.size, 0);
  f.controller.destroy();
});

test("a missing end callback is bounded by the playback watchdog", () => {
  const f = fixture();
  f.controller.speak("tranquil");
  f.utterances[0].dispatch("start");
  f.fireDelay(100);
  assert.equal(f.controller.getState().status, "error");
  assert.equal(f.timers.size, 0);
  f.controller.destroy();
});

test("subscribers can unsubscribe and destroy releases speech and timers", () => {
  const f = fixture();
  const observed = [];
  const unsubscribe = f.controller.subscribe(state => observed.push(state.status));
  f.controller.speak("tranquil");
  f.utterances[0].dispatch("start");
  assert.ok(observed.includes("speaking"));
  unsubscribe();
  const count = observed.length;
  f.controller.stop();
  assert.equal(observed.length, count);
  f.controller.speak("gouge");
  const before = f.cancelCount;
  f.controller.destroy();
  assert.ok(f.cancelCount > before);
  assert.equal(f.timers.size, 0);
});

test("pronunciation modules are part of the offline app shell without fetching external audio", async () => {
  const worker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /"\.\/js\/pronunciation\.js"/);
  assert.match(worker, /"\.\/js\/pronunciation-ui\.js"/);
  const implementation = await readFile(new URL("../js/pronunciation.js", import.meta.url), "utf8");
  assert.doesNotMatch(implementation, /\bfetch\s*\(|XMLHttpRequest|https?:\/\//);
});
