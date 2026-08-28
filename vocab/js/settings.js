import { getMeta, setMeta } from "./storage.js?v=13";

export const SETTINGS_SCHEMA_VERSION = 1;
export const SETTINGS_META_KEY = "wordbookSettings";
export const SAVE_MODES = Object.freeze({
  AUTO: "auto",
  REVIEW: "review"
});

const ALLOWED_SAVE_MODES = new Set(Object.values(SAVE_MODES));

export function parseSettings(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("收词设置格式不正确。");
  }
  const schemaVersion = Number(value.schemaVersion ?? 1);
  if (schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    throw new Error(`不支持的收词设置版本：${value.schemaVersion ?? "未知"}。`);
  }
  if (!ALLOWED_SAVE_MODES.has(value.saveMode)) {
    throw new Error("请选择自动加入或确认后加入。");
  }
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    saveMode: value.saveMode
  };
}

export function inspectSettings(value) {
  try {
    return { settings: parseSettings(value), invalid: false, error: "" };
  } catch (error) {
    return {
      settings: null,
      invalid: true,
      error: error?.message || "入库设置无法读取。"
    };
  }
}

export async function getSettings() {
  return parseSettings(await getMeta(SETTINGS_META_KEY));
}

export async function getSettingsState() {
  return inspectSettings(await getMeta(SETTINGS_META_KEY));
}

export async function saveSettings(value) {
  const candidate = typeof value === "string" ? { saveMode: value } : value;
  const settings = parseSettings({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    ...candidate
  });
  await setMeta(SETTINGS_META_KEY, settings);
  return settings;
}
