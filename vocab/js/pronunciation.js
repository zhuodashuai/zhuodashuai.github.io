export const AUDIO_PREFERENCES_KEY = "zhuo-wordbook-pronunciation-v1";

export function normalizeAudioPreferences(value) {
  return { accent: value?.accent === "en-US" ? "en-US" : "en-GB", rate: Number(value?.rate) === 0.75 ? 0.75 : 1 };
}

function language(value) { return String(value || "").replaceAll("_", "-").toLowerCase(); }

export function selectEnglishVoice(voices, accent, { offline = false } = {}) {
  const target = language(accent);
  return [...voices].filter((voice) => /^en(?:-|$)/u.test(language(voice.lang)) && (!offline || voice.localService === true))
    .map((voice, index) => ({ voice, index, score: (language(voice.lang) === target ? 100 : language(voice.lang).startsWith(target + "-") ? 90 : 0)
      + (voice.localService ? 10 : 0) + (voice.default ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.voice || null;
}

export function createPronunciationController({ environment = globalThis.window, startTimeoutMs = 8000, endTimeoutMs = 60000 } = {}) {
  const env = environment;
  const speech = env?.speechSynthesis;
  const Speech = env?.SpeechSynthesisUtterance;
  const supported = Boolean(speech && typeof speech.speak === "function" && typeof speech.cancel === "function" && typeof Speech === "function");
  let preferences = normalizeAudioPreferences();
  let preferenceSaved = true;
  try { preferences = normalizeAudioPreferences(JSON.parse(env?.localStorage?.getItem(AUDIO_PREFERENCES_KEY) || "null")); }
  catch { preferenceSaved = false; }
  let state = { supported, preferences, preferenceSaved, status: supported ? "idle" : "error", activeKey: "", text: "", voiceLang: "",
    message: supported ? "" : "此浏览器暂不支持朗读，请用 Safari、Chrome 或 Edge 打开。" };
  let active = null;
  let generation = 0;
  let timer = null;
  let voices = [];
  let destroyed = false;
  const listeners = new Set();
  const getState = () => ({ ...state, preferences: { ...preferences } });
  const emit = () => { for (const listener of listeners) listener(getState()); };
  const clearTimer = () => { if (timer !== null) env?.clearTimeout(timer); timer = null; };
  const readVoices = () => {
    try { voices = Array.from(speech?.getVoices?.() || []); } catch { voices = []; }
  };
  readVoices();
  speech?.addEventListener?.("voiceschanged", readVoices);

  function cancelCurrent() {
    generation += 1; // Invalidate callbacks before cancel() emits interrupted/canceled.
    clearTimer();
    const hadActive = Boolean(active);
    active = null;
    if (hadActive) { try { speech.cancel(); } catch { /* The visible state is still stopped. */ } }
  }

  function stop() {
    cancelCurrent();
    state = { ...state, status: supported ? "idle" : "error", activeKey: "", text: "", voiceLang: "",
      message: supported ? "" : state.message };
    emit();
  }

  function fail(message) {
    cancelCurrent();
    state = { ...state, status: "error", activeKey: "", message };
    emit();
    return false;
  }

  function speak(rawText, { key = rawText } = {}) {
    if (destroyed) return false;
    if (!supported) return fail("此浏览器暂不支持朗读，请用 Safari、Chrome 或 Edge 打开。");
    const text = String(rawText || "").replace(/\s+/gu, " ").trim();
    if (!text || text.length > 500) return fail("没有可朗读的词条，或文本太长。请重新打开词卡。");
    key = String(key);
    if (active?.key === key) { stop(); return false; }
    cancelCurrent();
    readVoices();
    const offline = env?.navigator?.onLine === false;
    const voice = selectEnglishVoice(voices, preferences.accent, { offline });
    if (voices.length && !voice) return fail(offline
      ? "当前没有可离线使用的英文语音，请联网后重试，或在设备中下载英文语音。"
      : "设备没有可用的英文语音，请在系统设置中添加英文语音后重试。");
    const voiceLang = voice?.lang || preferences.accent;
    const fallback = voice && language(voice.lang) !== language(preferences.accent) && !language(voice.lang).startsWith(language(preferences.accent) + "-")
      ? ` · 所选口音不可用，改用 ${voice.lang} 英语语音` : "";
    const remote = voice?.localService === false ? " · 在线语音" : "";
    const token = generation;
    try {
      const utterance = new Speech(text);
      utterance.lang = voiceLang;
      utterance.rate = preferences.rate;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      // Retain the utterance until it ends; some engines otherwise lose callbacks.
      active = { key, utterance };
      const isCurrent = () => !destroyed && token === generation && active?.utterance === utterance;
      utterance.onstart = () => {
        if (!isCurrent()) return;
        clearTimer();
        state = { ...state, status: "speaking", message: `正在朗读“${text}”${fallback}${remote}` };
        timer = env.setTimeout(() => { if (isCurrent()) fail("朗读未正常结束，请再次点击重试。"); }, endTimeoutMs);
        emit();
      };
      utterance.onend = () => {
        if (!isCurrent()) return;
        clearTimer();
        active = null;
        state = { ...state, status: "idle", activeKey: "", message: `已朗读“${text}”${fallback}${remote}` };
        emit();
      };
      utterance.onerror = (event) => {
        if (!isCurrent()) return;
        if (["canceled", "interrupted"].includes(event.error)) { stop(); return; }
        const messages = {
          "not-allowed": "浏览器未允许播放，请再次点喇叭；若仍无声，请检查设备音量和浏览器设置。",
          "network": "语音服务连接失败，请联网重试，或在设备中下载英文语音。",
          "language-unavailable": "当前英文语音不可用，请换一个口音，或在系统设置中添加英文语音。",
          "voice-unavailable": "当前语音不可用，请换一个口音，或在系统设置中添加英文语音。",
          "audio-hardware": "没有可用的声音输出，请检查扬声器或耳机。"
        };
        fail(messages[event.error] || "朗读失败，请检查设备英文语音和音量，然后再次点击重试。");
      };
      state = { ...state, status: "loading", activeKey: key, text, voiceLang,
        message: `准备朗读“${text}”${fallback}${remote}` };
      timer = env.setTimeout(() => { if (isCurrent()) fail("朗读没有启动，请检查设备音量及英文语音，再点击重试。"); }, startTimeoutMs);
      emit();
      // Never await voiceschanged/network here: iOS requires the user's click gesture.
      speech.speak(utterance);
      return true;
    } catch {
      return fail("朗读无法启动，请检查设备英文语音，然后再次点击重试。");
    }
  }

  function setPreferences(value) {
    preferences = normalizeAudioPreferences({ ...preferences, ...value });
    try {
      if (!env?.localStorage) throw new Error("Storage unavailable");
      env.localStorage.setItem(AUDIO_PREFERENCES_KEY, JSON.stringify(preferences));
      preferenceSaved = true;
    } catch { preferenceSaved = false; }
    stop();
    state = { ...state, preferences, preferenceSaved,
      message: supported ? (preferenceSaved ? "" : "设置仅对本次打开有效，浏览器未允许保存偏好。") : state.message };
    emit();
  }

  const onHidden = () => { if (env?.document?.hidden && active) stop(); };
  env?.addEventListener?.("pagehide", stop);
  env?.document?.addEventListener?.("visibilitychange", onHidden);
  return {
    getState, speak, stop, setPreferences,
    subscribe(listener) { listeners.add(listener); listener(getState()); return () => listeners.delete(listener); },
    destroy() {
      stop(); destroyed = true; listeners.clear();
      speech?.removeEventListener?.("voiceschanged", readVoices);
      env?.removeEventListener?.("pagehide", stop);
      env?.document?.removeEventListener?.("visibilitychange", onHidden);
    }
  };
}
