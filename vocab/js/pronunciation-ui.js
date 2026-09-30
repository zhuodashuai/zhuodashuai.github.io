import { createPronunciationController } from "./pronunciation.js";

const readers = new WeakMap();

function speakerIcon(root) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = root.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = root.createElementNS(ns, "path");
  path.setAttribute("d", "M11 5 6 9H3v6h3l5 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14");
  svg.append(path);
  return svg;
}

export function setupPronunciationUI(root = document) {
  if (readers.has(root)) return readers.get(root);
  const controller = createPronunciationController({ environment: root.defaultView });
  function refresh() {
    const state = controller.getState();
    for (const button of root.querySelectorAll("button[data-audio-text]")) {
      const active = Boolean(state.activeKey) && button.dataset.audioKey === state.activeKey;
      button.disabled = !state.supported || !button.dataset.audioText;
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", `${active ? "停止朗读" : "朗读"} ${button.dataset.audioText}`);
      button.title = !state.supported ? "此浏览器不支持朗读" : active ? "再次点击停止" : "朗读词条";
      button.classList.toggle("is-speaking", active);
    }
    for (const select of root.querySelectorAll("[data-audio-accent]")) select.value = state.preferences.accent;
    for (const select of root.querySelectorAll("[data-audio-rate]")) select.value = String(state.preferences.rate);
    for (const status of root.querySelectorAll("[data-audio-status]")) {
      status.hidden = !state.message;
      status.textContent = state.message;
      status.classList.toggle("is-error", state.status === "error");
    }
  }
  const decorate = (button, text, key = text) => {
    button.type = "button";
    button.classList.add("pronunciation-button");
    button.dataset.audioText = text || "";
    button.dataset.audioKey = key || text || "";
    button.replaceChildren(speakerIcon(root));
    const state = controller.getState();
    button.disabled = !state.supported || !text;
    button.setAttribute("aria-label", `朗读 ${text || "词条"}`);
    button.setAttribute("aria-pressed", "false");
    button.title = state.supported ? "朗读词条" : "此浏览器不支持朗读";
    return button;
  };
  function button(text, key = text) { return decorate(root.createElement("button"), text, key); }
  function settings(id) {
    const wrapper = root.createElement("div");
    wrapper.className = "pronunciation-settings";
    const details = root.createElement("details");
    details.id = id;
    const summary = root.createElement("summary");
    summary.textContent = "发音设置";
    const controls = root.createElement("div");
    controls.className = "pronunciation-options";
    for (const [kind, title, options] of [
      ["accent", "口音", [["en-GB", "英式优先"], ["en-US", "美式优先"]]],
      ["rate", "语速", [["1", "正常"], ["0.75", "慢速 0.75×"]]]
    ]) {
      const label = root.createElement("label");
      label.textContent = title;
      const select = root.createElement("select");
      select.dataset[kind === "accent" ? "audioAccent" : "audioRate"] = "";
      select.setAttribute("aria-label", `发音${title}`);
      for (const [value, text] of options) {
        const option = root.createElement("option");
        option.value = value; option.textContent = text; select.append(option);
      }
      label.append(select); controls.append(label);
    }
    const help = root.createElement("a");
    help.href = "guide.html#g-audio";
    help.textContent = "系统合成语音 · 使用说明";
    controls.append(help);
    details.append(summary, controls);
    const status = root.createElement("p");
    status.dataset.audioStatus = "";
    status.className = "pronunciation-status";
    status.setAttribute("role", "status");
    status.hidden = true;
    wrapper.append(details, status);
    return wrapper;
  }
  // Delegation avoids accumulating listeners when the public snapshot re-renders.
  root.addEventListener("click", (event) => {
    const target = event.target.closest?.("button[data-audio-text]");
    if (!target || target.disabled) return;
    event.preventDefault(); event.stopPropagation();
    controller.speak(target.dataset.audioText, { key: target.dataset.audioKey });
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-audio-accent]")) controller.setPreferences({ accent: event.target.value });
    if (event.target.matches("[data-audio-rate]")) controller.setPreferences({ rate: Number(event.target.value) });
  });
  controller.subscribe(refresh);
  const ui = { controller, refresh, button, decorate, settings, stop: () => controller.stop() };
  readers.set(root, ui);
  return ui;
}
