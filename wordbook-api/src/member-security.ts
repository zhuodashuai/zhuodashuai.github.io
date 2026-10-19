import { scrypt } from "node:crypto";
import { ApiError, base64UrlDecode, base64UrlEncode, jsonResponse, randomToken, sha256Hex } from "./security";
import { REMEMBER_SESSION_TTL_SECONDS } from "./config";

export interface MemberEnv {
  MEMBER_AUTH: DurableObjectNamespace;
  PERSONAL_WORDBOOK: DurableObjectNamespace;
  MEMBER_SIGNUP_ENABLED?: string;
  SESSION_SECRET?: string;
  OWNER_CONTROL?: DurableObjectNamespace;
}

export type MemberAuthType = "member" | "github-owner";
export const PRIVATE_OWNER_ID = "15604207-8000-4000-8000-000000000001";

export interface MemberIdentity { id: string; username: string }
export interface MemberSessionView {
  authenticated: true;
  user: MemberIdentity;
  csrfToken: string;
  expiresAt: number;
  authType?: MemberAuthType;
}

export const MEMBER_COOKIE = "__Host-zhuo_member";
export const MEMBER_SESSION_SECONDS = 7 * 24 * 60 * 60;
export const MEMBER_REMEMBER_SESSION_SECONDS = REMEMBER_SESSION_TTL_SECONDS;

export function memberRemember(value: unknown): boolean {
  if (value !== undefined && typeof value !== "boolean") throw new ApiError(400, "invalid_fields", "记住登录的选项不正确。");
  return value === true;
}
export const MEMBER_BODY_BYTES = 16 * 1024;
export const MEMBER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FORBIDDEN_TEXT = /[^\P{Cc}\n\t]|\p{Cf}/u;
const encoder = new TextEncoder();

export function memberCookie(value: string, seconds = MEMBER_SESSION_SECONDS): string {
  return `${MEMBER_COOKIE}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Strict`;
}
export function clearMemberCookie(): string { return memberCookie("", 0); }

/** Bound streaming bytes before concatenation; Content-Length is not trusted. */
export async function readMemberJson(request: Request, maximum = MEMBER_BODY_BYTES): Promise<Record<string, unknown>> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    throw new ApiError(413, "payload_too_large", "请求内容超过安全大小限制。");
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maximum) {
          await reader.cancel().catch(() => {});
          throw new ApiError(413, "payload_too_large", "请求内容超过安全大小限制。");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, "invalid_json", "请求不是有效的 JSON 对象。"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ApiError(400, "invalid_json", "请求必须是 JSON 对象。");
  return parsed as Record<string, unknown>;
}

export function memberFields(body: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(body, key))
    || Object.keys(body).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new ApiError(400, "invalid_fields", "请求字段不正确，不接受身份、权限或额外字段。");
  }
}

export function memberUsername(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(value)) {
    throw new ApiError(400, "invalid_username", "用户名为 3–24 位英文字母、数字或下划线，须以英文字母开头。");
  }
  const result = value.toLowerCase();
  if (["owner", "admin", "administrator", "zhuodashuai", "zhuo", "root", "support", "system"].includes(result)) {
    throw new ApiError(400, "reserved_username", "这个用户名为系统保留，请选择其他名称。");
  }
  return result;
}

export function memberPassword(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || [...value].length < 15 || [...value].length > 128
    || /[\u0000-\u001f\u007f]/u.test(value)
    || [...value].some((character) => { const point = character.codePointAt(0)!; return point >= 0xd800 && point <= 0xdfff; })) {
    throw new ApiError(400, "invalid_password", "密码需为 15–128 个字符，可使用空格和 Unicode；不会自动去除空格。");
  }
  return value;
}

export function memberText(value: unknown, maximum: number, field: string): string {
  if (typeof value !== "string" || [...value].length > maximum || FORBIDDEN_TEXT.test(value)) {
    throw new ApiError(400, "invalid_entry", `${field}超过限制，或包含不支持的控制字符。`);
  }
  return value;
}

export function equalMemberSecret(a: string, b: string): boolean {
  const left = encoder.encode(a), right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left[i] ^ right[i];
  return different === 0;
}

export interface MemberPasswordHash {
  version: 1;
  algorithm: "scrypt-hmac-sha256";
  N: 16384;
  r: 8;
  p: 5;
  salt: string;
  hash: string;
}

export const MEMBER_SCRYPT = Object.freeze({ N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 });

function memberPepper(env: MemberEnv): string {
  if (!env.SESSION_SECRET || !/^[A-Za-z0-9_-]{43,200}$/.test(env.SESSION_SECRET)) {
    throw new ApiError(503, "member_auth_unavailable", "个人账号认证暂未配置，请稍后重试。");
  }
  return env.SESSION_SECRET;
}

async function passwordDigest(password: string, salt: string, env: MemberEnv): Promise<string> {
  const material = await new Promise<Uint8Array>((resolve, reject) => {
    scrypt(password, base64UrlDecode(salt), 32, MEMBER_SCRYPT, (error, derived) => {
      if (error) reject(new ApiError(503, "password_hash_unavailable", "密码验证暂不可用，请稍后重试。"));
      else resolve(new Uint8Array(derived));
    });
  });
  try {
    const key = await crypto.subtle.importKey("raw", encoder.encode(memberPepper(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const prefix = encoder.encode("zhuo-member-password-v1\0");
    const input = new Uint8Array(prefix.length + material.length);
    input.set(prefix); input.set(material, prefix.length);
    return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, input)));
  } finally { material.fill(0); }
}

export async function hashMemberPassword(password: string, env: MemberEnv): Promise<MemberPasswordHash> {
  memberPepper(env);
  const salt = randomToken(16);
  return { version: 1, algorithm: "scrypt-hmac-sha256", N: 16384, r: 8, p: 5, salt, hash: await passwordDigest(password, salt, env) };
}

export async function verifyMemberPassword(password: string, record: MemberPasswordHash, env: MemberEnv): Promise<boolean> {
  if (record.version !== 1 || record.algorithm !== "scrypt-hmac-sha256" || record.N !== 16384 || record.r !== 8 || record.p !== 5
    || !/^[A-Za-z0-9_-]{22}$/.test(record.salt) || !/^[A-Za-z0-9_-]{43}$/.test(record.hash)) {
    throw new ApiError(503, "password_hash_unavailable", "密码记录暂不可验证，请稍后重试。");
  }
  return equalMemberSecret(await passwordDigest(password, record.salt, env), record.hash);
}

export function memberAuthStub(env: MemberEnv): DurableObjectStub {
  return env.MEMBER_AUTH.get(env.MEMBER_AUTH.idFromName("member-auth:v1"));
}

export async function memberInternalCall(stub: DurableObjectStub, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await stub.fetch(`https://member.internal${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = result.error as Record<string, unknown> | undefined;
    throw new ApiError(response.status, String(error?.code || "member_unavailable"), String(error?.message || "个人词库暂不可用。"), error?.details);
  }
  return result;
}

export function privateOwnerStub(env: MemberEnv): DurableObjectStub {
  if (!env.OWNER_CONTROL) throw new ApiError(503, "owner_auth_unavailable", "GitHub 所有者登录暂不可用。");
  return env.OWNER_CONTROL.get(env.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
}

export function verifyPrivateOwner(view: Record<string, unknown>): MemberIdentity {
  const user = view.user as { id?: unknown; login?: unknown } | undefined;
  if (view.authenticated !== true || user?.id !== 156042078 || user.login !== "zhuodashuai") {
    throw new ApiError(401, "member_authentication_required", "请先使用卓本人的 GitHub 账号登录。");
  }
  return { id: PRIVATE_OWNER_ID, username: "zhuodashuai" };
}

export async function assertPrivateSession(env: MemberEnv, authType: unknown, sessionHash: string, csrfToken?: string): Promise<{ user: MemberIdentity; expiresAt: number }> {
  if (authType !== undefined && authType !== "member" && authType !== "github-owner") throw new ApiError(401, "member_authentication_required", "登录类型不正确。");
  if (authType === "github-owner") {
    const view = await memberInternalCall(privateOwnerStub(env), csrfToken === undefined ? "/session/read-assert" : "/session/assert", {
      sessionHash, ...(csrfToken !== undefined ? { csrfToken } : {})
    });
    return { user: verifyPrivateOwner(view), expiresAt: Number(view.expiresAt || 0) };
  }
  const view = await memberInternalCall(memberAuthStub(env), "/session/assert", { sessionHash, ...(csrfToken !== undefined ? { csrfToken } : {}) });
  const user = view.user as MemberIdentity | undefined;
  if (!user || !MEMBER_UUID.test(user.id) || user.id === PRIVATE_OWNER_ID || typeof user.username !== "string") throw new ApiError(401, "member_authentication_required", "请重新登录自己的账号。");
  return { user, expiresAt: Number(view.expiresAt) };
}

export function memberError(error: unknown): Response {
  const safe = error instanceof ApiError ? error : new ApiError(500, "member_internal_error", "个人词库暂时无法完成请求，请稍后重试。");
  const details = safe.details && typeof safe.details === "object" ? safe.details as Record<string, unknown> : undefined;
  const retryAfter = safe.status === 429 ? Number(details?.retryAfter || 60) : 0;
  return jsonResponse({ error: { code: safe.code, message: safe.message,
    ...([400, 409, 429].includes(safe.status) && details ? { details } : {}) } }, safe.status,
  retryAfter ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfter))) } : {});
}

export async function memberSessionHash(raw: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{64}$/.test(raw)) throw new ApiError(401, "member_authentication_required", "请先登录自己的账号。");
  return sha256Hex(raw);
}
