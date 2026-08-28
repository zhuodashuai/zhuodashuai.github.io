import { normalizeKey, parseSnapshot, toPublicEntry } from "./schema.js?v=13";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
let sessionToken = "";
let ownerSessionToken = "";

export const OWNER_PUBLIC_CONFIG = Object.freeze({
  login: "zhuodashuai",
  userId: 156042078,
  owner: "zhuodashuai",
  repo: "zhuodashuai.github.io",
  repoId: 1309360291,
  branch: "main",
  path: "vocab/data/owner-wordbook.json"
});

export class SyncConflictError extends Error {
  constructor(message = "GitHub 上的词库已经变化，请先拉取远端版本。") {
    super(message);
    this.name = "SyncConflictError";
  }
}

export class OwnerConflictError extends SyncConflictError {
  constructor(message = "公开词库已在 GitHub 上发生变化，请刷新远端后重新操作。") {
    super(message);
    this.name = "OwnerConflictError";
  }
}

export function isRetryableSyncError(error) {
  if (error instanceof SyncConflictError) return false;
  if (error?.retryable === true) return true;
  const status = Number(error?.status);
  return [408, 425, 429].includes(status) || status >= 500;
}

function apiHeaders(token = sessionToken) {
  if (!token) throw new Error("请先输入 GitHub 访问令牌并连接。");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
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

export function connectOwnerGitHub(token) {
  const clean = String(token || "").trim();
  if (clean.length < 20) throw new Error("GitHub 访问令牌看起来不完整。");
  ownerSessionToken = clean;
}

export function disconnectOwnerGitHub() {
  ownerSessionToken = "";
}

export function isOwnerGitHubConnected() {
  return Boolean(ownerSessionToken);
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

function assertUniquePublicLookupKeys(entries) {
  const owners = new Map();
  for (const entry of entries) {
    const keys = new Set([normalizeKey(entry.normalized || entry.term)]);
    if (entry.correction?.status === "autocorrected") {
      keys.add(normalizeKey(entry.correction.original));
      keys.add(normalizeKey(entry.correction.chosen));
    }
    for (const key of keys) {
      if (!key) continue;
      const previousId = owners.get(key);
      if (previousId && previousId !== entry.id) {
        throw new Error(`公开词库的词条或纠错别名发生冲突：${key}`);
      }
      owners.set(key, entry.id);
    }
  }
}

async function githubRequest(url, options = {}, token = sessionToken) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { ...apiHeaders(token), ...(options.headers || {}) },
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
    error.payload = payload;
    error.retryable = isRetryableSyncError(error);
    throw error;
  }
  return payload;
}

async function readSnapshotWithToken(config, token, { includeReview }) {
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.branch)}`;
  try {
    const payload = await githubRequest(url, {}, token);
    if (payload?.type !== "file" || typeof payload.content !== "string") {
      throw new Error("远端路径不是可读取的 JSON 文件。");
    }
    const document = JSON.parse(decodeBase64(payload.content));
    if (!includeReview && Array.isArray(document?.entries)) {
      const ids = document.entries.map((entry) => typeof entry?.id === "string" ? entry.id.trim() : "");
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
        throw new Error("公开词库包含缺失或重复的词条编号，已拒绝进入站主管理。");
      }
    }
    const parsed = parseSnapshot(document, {
      preserveIds: true,
      includeReview,
      strict: true
    });
    if (!includeReview) assertUniquePublicLookupKeys(parsed.entries);
    return {
      exists: true,
      sha: payload.sha || "",
      htmlUrl: payload.html_url || "",
      snapshot: parsed,
      document
    };
  } catch (error) {
    if (error.status === 404) return { exists: false, sha: "", htmlUrl: "", snapshot: null };
    throw error;
  }
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
  return readSnapshotWithToken(config, sessionToken, { includeReview: true });
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

export async function authenticateOwnerGitHub() {
  if (!ownerSessionToken) throw new Error("请先输入 GitHub 访问令牌。");
  const config = validateSyncConfig(OWNER_PUBLIC_CONFIG);
  const user = await githubRequest(`${API_ROOT}/user`, {}, ownerSessionToken);
  if (String(user?.login || "").toLowerCase() !== OWNER_PUBLIC_CONFIG.login
    || Number(user?.id) !== OWNER_PUBLIC_CONFIG.userId) {
    throw new Error(`这个令牌属于 ${user?.login || "未知账号"}，不是卓同学的 GitHub 账号。`);
  }

  const repository = await githubRequest(
    `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
    {},
    ownerSessionToken
  );
  if (String(repository?.full_name || "").toLowerCase() !== `${config.owner}/${config.repo}`.toLowerCase()) {
    throw new Error("GitHub 返回的仓库身份不正确。");
  }
  if (Number(repository?.id) !== OWNER_PUBLIC_CONFIG.repoId
    || Number(repository?.owner?.id) !== OWNER_PUBLIC_CONFIG.userId
    || repository?.default_branch !== config.branch
    || repository?.fork === true) {
    throw new Error("GitHub 返回的仓库标识与站点发布目标不一致。");
  }
  if (repository?.archived || repository?.disabled) throw new Error("公开词库仓库当前不可写。");
  if (repository?.permissions?.push !== true) {
    throw new Error("令牌没有此仓库的 Contents 写权限。请只为 zhuodashuai.github.io 授予 Contents：Read and write。");
  }
  await githubRequest(
    `${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(config.branch)}`,
    {},
    ownerSessionToken
  );
  const remote = await readSnapshotWithToken(config, ownerSessionToken, { includeReview: false });
  if (!remote.exists) throw new Error("GitHub 上找不到公开词库文件，已停止以避免创建到错误位置。");
  return {
    login: user.login,
    avatarUrl: user.avatar_url || "",
    config,
    ...remote
  };
}

export async function readOwnerPublicSnapshot() {
  const config = validateSyncConfig(OWNER_PUBLIC_CONFIG);
  return readSnapshotWithToken(config, ownerSessionToken, { includeReview: false });
}

export async function writeOwnerPublicSnapshot(entries, expectedSha = "") {
  const config = validateSyncConfig(OWNER_PUBLIC_CONFIG);
  const current = await readSnapshotWithToken(config, ownerSessionToken, { includeReview: false });
  if (!current.exists) throw new OwnerConflictError("GitHub 上找不到公开词库文件，已停止发布。请检查仓库后重新登录。");
  if (!expectedSha || current.sha !== expectedSha) throw new OwnerConflictError();

  const publicEntries = entries.map((entry) => toPublicEntry(entry));
  if (new Set(publicEntries.map((entry) => entry.normalized)).size !== publicEntries.length) {
    throw new Error("公开词库中存在重复词条，已停止发布。");
  }
  if (new Set(publicEntries.map((entry) => entry.id)).size !== publicEntries.length) {
    throw new Error("公开词库中存在重复词条编号，已停止发布。");
  }
  assertUniquePublicLookupKeys(publicEntries);
  const updatedAt = new Date().toISOString();
  const publicSnapshot = {
    schemaVersion: 2,
    owner: {
      name: "Zhuodashuai",
      profileUrl: "https://zhuodashuai.github.io/"
    },
    updatedAt,
    entries: publicEntries
  };
  const parsedPublicSnapshot = parseSnapshot(publicSnapshot, {
    preserveIds: true,
    includeReview: false,
    strict: true
  });
  const serialized = `${JSON.stringify(publicSnapshot, null, 2)}\n`;
  if (new TextEncoder().encode(serialized).length > 900_000) {
    throw new Error("公开词库超过 900 KB，请先精简或拆分后再发布。");
  }

  const successfulResult = (payload, recovered = false) => ({
    sha: payload?.content?.sha || payload?.sha || "",
    commitSha: payload?.commit?.sha || "",
    htmlUrl: payload?.content?.html_url || payload?.htmlUrl || "",
    recovered,
    snapshot: parsedPublicSnapshot
  });
  try {
    const payload = await githubRequest(contentsUrl(config), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Update Zhuo's public word cabinet (${publicEntries.length} entries)`,
        content: encodeBase64(serialized),
        branch: config.branch,
        sha: current.sha
      })
    }, ownerSessionToken);
    if (!payload?.content?.sha) {
      const confirmed = await readSnapshotWithToken(config, ownerSessionToken, { includeReview: false });
      if (confirmed.exists && JSON.stringify(confirmed.document) === JSON.stringify(publicSnapshot)) {
        return successfulResult(confirmed, true);
      }
      throw new Error("GitHub 已接受请求，但没有返回可确认的文件 SHA。请刷新远端核对后再操作。");
    }
    return successfulResult(payload);
  } catch (error) {
    const details = JSON.stringify(error?.payload?.errors || []);
    if (error.status === 409 || (error.status === 422 && /sha|does not match|fast forward/i.test(`${error.message} ${details}`))) {
      throw new OwnerConflictError();
    }
    if (isRetryableSyncError(error)) {
      try {
        const recovered = await readSnapshotWithToken(config, ownerSessionToken, { includeReview: false });
        if (recovered.exists && JSON.stringify(recovered.document) === JSON.stringify(publicSnapshot)) {
          return successfulResult(recovered, true);
        }
        if (recovered.exists && recovered.sha !== current.sha) {
          throw new OwnerConflictError("发布结果无法自动确认，且远端已经变化。请刷新远端核对后再操作。");
        }
      } catch (recoveryError) {
        if (recoveryError instanceof OwnerConflictError) throw recoveryError;
      }
    }
    throw error;
  }
}
