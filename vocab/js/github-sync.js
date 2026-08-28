import { parseSnapshot } from "./schema.js";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
let sessionToken = "";

export class SyncConflictError extends Error {
  constructor(message = "GitHub 上的词库已经变化，请先拉取远端版本。") {
    super(message);
    this.name = "SyncConflictError";
  }
}

export function isRetryableSyncError(error) {
  if (error instanceof SyncConflictError) return false;
  if (error?.retryable === true) return true;
  const status = Number(error?.status);
  return [408, 425, 429].includes(status) || status >= 500;
}

function apiHeaders() {
  if (!sessionToken) throw new Error("请先输入 GitHub 访问令牌并连接。");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${sessionToken}`,
    "X-GitHub-Api-Version": API_VERSION
  };
}

function safePath(value) {
  const path = String(value || "").trim().replace(/^\/+/, "");
  if (!path || path.length > 500 || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("同步文件路径不正确。");
  }
  if (!path.toLowerCase().endsWith(".json")) throw new Error("同步文件必须使用 .json 后缀。");
  return path;
}

export function validateSyncConfig(candidate) {
  const owner = String(candidate?.owner || "").trim();
  const repo = String(candidate?.repo || "").trim();
  const branch = String(candidate?.branch || "main").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) throw new Error("GitHub 用户名格式不正确。");
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) throw new Error("GitHub 仓库名格式不正确。");
  if (!branch || branch.length > 255 || /[\s~^:?*\[\\]/.test(branch)) throw new Error("GitHub 分支名格式不正确。");
  return {
    owner,
    repo,
    branch,
    path: safePath(candidate?.path || "vocab-sync/wordbook.json"),
    autoSync: Boolean(candidate?.autoSync),
    lastSha: typeof candidate?.lastSha === "string" ? candidate.lastSha : "",
    lastSyncedAt: typeof candidate?.lastSyncedAt === "string" ? candidate.lastSyncedAt : ""
  };
}

export function connectGitHub(token) {
  const clean = String(token || "").trim();
  if (clean.length < 20) throw new Error("GitHub 访问令牌看起来不完整。");
  sessionToken = clean;
}

export function disconnectGitHub() {
  sessionToken = "";
}

export function isGitHubConnected() {
  return Boolean(sessionToken);
}

function decodeBase64(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function contentsUrl(config) {
  const path = config.path.split("/").map(encodeURIComponent).join("/");
  return `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${path}`;
}

async function githubRequest(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...apiHeaders(), ...(options.headers || {}) },
      cache: "no-store"
    });
  } catch (error) {
    if (error && typeof error === "object") error.retryable = true;
    throw error;
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Some GitHub failures do not include a JSON body.
  }
  if (!response.ok) {
    const error = new Error(payload?.message || `GitHub 请求失败（${response.status}）。`);
    error.status = response.status;
    error.retryable = isRetryableSyncError(error);
    throw error;
  }
  return payload;
}

export async function testGitHubConnection(candidate) {
  const config = validateSyncConfig(candidate);
  const repository = await githubRequest(`${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`);
  if (repository?.private !== true) {
    throw new Error("为保护个人词库，只允许连接专用私有仓库。");
  }
  await githubRequest(`${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(config.branch)}`);
  return config;
}

export async function readRemoteSnapshot(candidate) {
  const config = validateSyncConfig(candidate);
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`;
  try {
    const payload = await githubRequest(url);
    if (payload?.type !== "file" || typeof payload.content !== "string") {
      throw new Error("远端路径不是可读取的 JSON 文件。");
    }
    const parsed = parseSnapshot(JSON.parse(decodeBase64(payload.content)), { preserveIds: true, includeReview: true, strict: true });
    return {
      exists: true,
      sha: payload.sha || "",
      htmlUrl: payload.html_url || "",
      snapshot: parsed
    };
  } catch (error) {
    if (error.status === 404) return { exists: false, sha: "", htmlUrl: "", snapshot: null };
    throw error;
  }
}

export async function writeRemoteSnapshot(candidate, snapshot, expectedSha = "") {
  const config = validateSyncConfig(candidate);
  const current = await readRemoteSnapshot(config);
  if (current.exists && !expectedSha) {
    throw new SyncConflictError("远端已经有词库。为防止覆盖，请先拉取一次。");
  }
  if (current.sha !== expectedSha) throw new SyncConflictError();

  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (new TextEncoder().encode(serialized).length > 900_000) {
    throw new Error("同步快照超过 900 KB，请先拆分词库或仅使用导出备份。");
  }
  const body = {
    message: `Sync Zhuo's secret word cabinet (${snapshot.entries?.length || 0} entries)`,
    content: encodeBase64(serialized),
    branch: config.branch
  };
  if (current.sha) body.sha = current.sha;

  try {
    const payload = await githubRequest(contentsUrl(config), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return {
      sha: payload?.content?.sha || "",
      commitSha: payload?.commit?.sha || "",
      htmlUrl: payload?.content?.html_url || ""
    };
  } catch (error) {
    if (error.status === 409 || error.status === 422) throw new SyncConflictError();
    throw error;
  }
}
