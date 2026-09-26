import type { AppConfig } from "./config";
import { GITHUB_API_VERSION, OWNER_LOGIN, OWNER_REPOSITORY_ID, OWNER_USER_ID } from "./config";
import { ApiError } from "./security";
import { validateSnapshot, type PublicSnapshot } from "./schema";

const API_ROOT = "https://api.github.com";
const OAUTH_ROOT = "https://github.com/login/oauth";
const MAX_GITHUB_PAGES = 10;
const GITHUB_PAGE_SIZE = 100;
export const MAX_SNAPSHOT_BYTES = 5_000_000;
export const MAX_GITHUB_JSON_BYTES = 7_000_000;

function oversizedSnapshot(): ApiError {
  return new ApiError(413, "snapshot_too_large", "公开词库超过 5 MB，请先导出备份并拆分数据。");
}

async function boundedResponseBytes(response: Response, limit: number): Promise<Uint8Array> {
  const tooLarge = () => limit === MAX_SNAPSHOT_BYTES
    ? oversizedSnapshot()
    : new ApiError(502, "github_response_too_large", "GitHub 返回的内容超过安全读取上限，操作已停止。");
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export interface GitHubIdentity {
  login: string;
  id: number;
  avatarUrl: string;
  installationId: number;
}

export interface GitHubToken {
  accessToken: string;
  expiresAt: number;
}

export interface RemoteWordbook {
  sha: string;
  htmlUrl: string;
  snapshot: PublicSnapshot;
}

function headers(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "zhuo-wordbook-worker/2.0",
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const bytes = await boundedResponseBytes(response, MAX_GITHUB_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function githubRetryAfter(response: Response): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000));
  }
  const resetAt = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(resetAt) && resetAt > 0) return Math.max(1, Math.ceil(resetAt - Date.now() / 1000));
  return 60;
}

async function githubResponse(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...headers(token), ...(init.headers || {}) },
      signal: init.signal || AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new ApiError(502, "github_unreachable", "暂时无法连接 GitHub。", String(error));
  }
  if (!response.ok) {
    const payload = await parseJson(response);
    const status = response.status;
    const message = typeof payload.message === "string" ? payload.message : `GitHub returned ${status}`;
    if (status === 401) throw new ApiError(401, "github_session_expired", "GitHub 登录已失效，请重新登录。", message);
    const rateLimited = status === 429 || (status === 403 && (
      response.headers.get("x-ratelimit-remaining") === "0"
      || response.headers.has("retry-after")
      || /(?:secondary |api )?rate limit|abuse detection/i.test(message)
    ));
    if (rateLimited) {
      throw new ApiError(429, "github_rate_limited", "GitHub 请求频率受限，请稍后安全重试。", {
        retryAfter: githubRetryAfter(response),
        message
      });
    }
    if (status === 403) throw new ApiError(403, "github_forbidden", "GitHub 拒绝了当前账号或 App 的权限请求。", message);
    if (status === 404) throw new ApiError(404, "github_not_found", "GitHub 上找不到固定的公开词库文件。", message);
    if ([409, 422].includes(status)) throw new ApiError(409, "github_conflict", "GitHub 远端已变化，发布没有覆盖远端内容。", payload);
    if (status >= 500) throw new ApiError(503, "github_retry_later", "GitHub 暂时无法完成请求，请稍后安全重试。", message);
    throw new ApiError(502, "github_error", "GitHub 请求失败。", message);
  }
  return response;
}

async function githubJson(url: string, token: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  return parseJson(await githubResponse(url, token, init));
}

export function createAuthorizationUrl(clientId: string, callbackUrl: string, state: string, codeChallenge: string): string {
  const url = new URL(`${OAUTH_ROOT}/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("login", OWNER_LOGIN);
  url.searchParams.set("prompt", "select_account");
  return url.href;
}

export async function exchangeOAuthCode(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  callbackUrl: string;
}): Promise<GitHubToken> {
  let response: Response;
  try {
    response = await fetch(`${OAUTH_ROOT}/access_token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "zhuo-wordbook-worker/2.0"
      },
      body: JSON.stringify({
        client_id: args.clientId,
        client_secret: args.clientSecret,
        code: args.code,
        redirect_uri: args.callbackUrl,
        code_verifier: args.verifier
      }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new ApiError(502, "oauth_unreachable", "暂时无法连接 GitHub 完成登录。", String(error));
  }
  const payload = await parseJson(response);
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new ApiError(401, "oauth_exchange_failed", "GitHub 登录没有完成，请重新开始。", payload.error_description || payload.error);
  }
  const expiresIn = Number(payload.expires_in);
  const boundedTtl = Number.isFinite(expiresIn) ? Math.min(Math.max(expiresIn, 300), 8 * 60 * 60) : 8 * 60 * 60;
  return { accessToken: payload.access_token, expiresAt: Date.now() + boundedTtl * 1000 };
}

export async function verifyOwnerAndRepository(token: string, config: AppConfig): Promise<GitHubIdentity> {
  const user = await githubJson(`${API_ROOT}/user`, token);
  const identity: GitHubIdentity = {
    login: String(user.login || ""),
    id: Number(user.id),
    avatarUrl: String(user.avatar_url || ""),
    installationId: 0
  };
  if (identity.login !== OWNER_LOGIN || identity.id !== OWNER_USER_ID) {
    throw new ApiError(403, "not_owner", `GitHub 账号 @${identity.login || "unknown"} 不是卓本人，管理权限未授予。`);
  }

  const installations: unknown[] = [];
  for (let page = 1; page <= MAX_GITHUB_PAGES; page += 1) {
    const installationPage = await githubJson(`${API_ROOT}/user/installations?per_page=${GITHUB_PAGE_SIZE}&page=${page}`, token);
    const pageItems = Array.isArray(installationPage.installations) ? installationPage.installations : [];
    installations.push(...pageItems);
    if (pageItems.length < GITHUB_PAGE_SIZE) break;
  }
  for (const rawInstallation of installations) {
    if (!rawInstallation || typeof rawInstallation !== "object") continue;
    const installation = rawInstallation as Record<string, unknown>;
    const account = installation.account && typeof installation.account === "object"
      ? installation.account as Record<string, unknown>
      : {};
    const permissions = installation.permissions && typeof installation.permissions === "object"
      ? installation.permissions as Record<string, unknown>
      : {};
    if (Number(account.id) !== OWNER_USER_ID || permissions.contents !== "write") continue;
    const installationId = Number(installation.id);
    if (!Number.isInteger(installationId) || installationId <= 0) continue;
    for (let page = 1; page <= MAX_GITHUB_PAGES; page += 1) {
      const repositoryPage = await githubJson(
        `${API_ROOT}/user/installations/${installationId}/repositories?per_page=${GITHUB_PAGE_SIZE}&page=${page}`,
        token
      );
      const repositories = Array.isArray(repositoryPage.repositories) ? repositoryPage.repositories : [];
      if (repositories.some((repository) => repository && typeof repository === "object" && Number((repository as Record<string, unknown>).id) === OWNER_REPOSITORY_ID)) {
        identity.installationId = installationId;
        break;
      }
      if (repositories.length < GITHUB_PAGE_SIZE) break;
    }
    if (identity.installationId) break;
  }
  if (!identity.installationId) {
    throw new ApiError(403, "installation_not_authorized", "GitHub App 没有安装到固定仓库，或缺少 Contents: write 权限。");
  }

  const repository = await githubJson(
    `${API_ROOT}/repos/${encodeURIComponent(config.GITHUB_OWNER)}/${encodeURIComponent(config.GITHUB_REPOSITORY)}`,
    token
  );
  const owner = repository.owner && typeof repository.owner === "object"
    ? repository.owner as Record<string, unknown>
    : {};
  const permissions = repository.permissions && typeof repository.permissions === "object"
    ? repository.permissions as Record<string, unknown>
    : {};
  if (Number(repository.id) !== OWNER_REPOSITORY_ID
    || Number(owner.id) !== OWNER_USER_ID
    || String(repository.full_name || "") !== `${config.GITHUB_OWNER}/${config.GITHUB_REPOSITORY}`
    || String(repository.default_branch || "") !== config.GITHUB_BRANCH
    || repository.fork === true
    || repository.archived === true
    || repository.disabled === true
    || permissions.push !== true) {
    throw new ApiError(403, "repository_not_authorized", "GitHub App 尚未获得固定仓库的 Contents 写权限。只允许授权 zhuodashuai.github.io。", {
      repositoryId: repository.id,
      canPush: permissions.push === true
    });
  }
  return identity;
}

export async function revokeOAuthToken(clientId: string, clientSecret: string, token: string): Promise<void> {
  try {
    await fetch(`${API_ROOT}/applications/${encodeURIComponent(clientId)}/token`, {
      method: "DELETE",
      headers: {
        ...headers(),
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    // Session deletion is authoritative; revocation is best-effort.
  }
}

function contentsUrl(config: AppConfig): string {
  const path = config.GITHUB_WORDBOOK_PATH.split("/").map(encodeURIComponent).join("/");
  return `${API_ROOT}/repos/${encodeURIComponent(config.GITHUB_OWNER)}/${encodeURIComponent(config.GITHUB_REPOSITORY)}/contents/${path}`;
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, "");
  if (clean.length > Math.ceil(MAX_SNAPSHOT_BYTES / 3) * 4) throw oversizedSnapshot();
  const binary = atob(clean);
  if (binary.length > MAX_SNAPSHOT_BYTES) throw oversizedSnapshot();
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + bytes.byteLength);
  blob.set(header);
  blob.set(bytes, header.byteLength);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-1", blob))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function readRemoteWordbook(token: string, config: AppConfig): Promise<RemoteWordbook> {
  const url = `${contentsUrl(config)}?ref=${encodeURIComponent(config.GITHUB_BRANCH)}`;
  const payload = await githubJson(url, token, { headers: { Accept: "application/vnd.github.object+json" } });
  if (payload.type !== "file" || typeof payload.content !== "string" || typeof payload.sha !== "string") {
    throw new ApiError(502, "invalid_github_file", "GitHub 返回的公开词库不是可读取文件。");
  }
  if (typeof payload.size === "number" && payload.size > MAX_SNAPSHOT_BYTES) throw oversizedSnapshot();
  let document: unknown;
  try {
    let bytes: Uint8Array;
    if (payload.encoding === "none" && payload.content === "") {
      // GitHub omits base64 content above 1 MB. Read the same fixed repository
      // path as raw bytes, then bind those bytes to the metadata SHA used by CAS.
      const response = await githubResponse(url, token, { headers: { Accept: "application/vnd.github.raw+json" } });
      bytes = await boundedResponseBytes(response, MAX_SNAPSHOT_BYTES);
      if (await gitBlobSha(bytes) !== payload.sha) {
        throw new ApiError(409, "github_conflict", "GitHub 远端在读取期间已变化，请刷新后安全重试。");
      }
    } else if (payload.encoding === undefined || payload.encoding === "base64") {
      bytes = decodeBase64(payload.content);
    } else {
      throw new ApiError(502, "invalid_github_file", "GitHub 返回了不支持的文件编码，操作已停止。");
    }
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(409, "invalid_remote_snapshot", "GitHub 上的公开词库 JSON 已损坏，发布已停止。");
  }
  return {
    sha: payload.sha,
    htmlUrl: typeof payload.html_url === "string" ? payload.html_url : "",
    snapshot: validateSnapshot(document)
  };
}

export async function writeRemoteWordbook(args: {
  token: string;
  config: AppConfig;
  expectedSha: string;
  snapshot: PublicSnapshot;
  message: string;
}): Promise<{ sha: string; commitSha: string; htmlUrl: string }> {
  const serialized = `${JSON.stringify(args.snapshot, null, 2)}\n`;
  if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) throw oversizedSnapshot();
  const payload = await githubJson(contentsUrl(args.config), args.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message.slice(0, 200),
      content: encodeBase64(serialized),
      branch: args.config.GITHUB_BRANCH,
      sha: args.expectedSha
    })
  });
  const content = payload.content && typeof payload.content === "object" ? payload.content as Record<string, unknown> : {};
  const commit = payload.commit && typeof payload.commit === "object" ? payload.commit as Record<string, unknown> : {};
  if (typeof content.sha !== "string") {
    throw new ApiError(502, "publish_unconfirmed", "GitHub 接受了请求，但没有返回文件 SHA；请刷新远端核对后再操作。");
  }
  return {
    sha: content.sha,
    commitSha: typeof commit.sha === "string" ? commit.sha : "",
    htmlUrl: typeof content.html_url === "string" ? content.html_url : ""
  };
}
