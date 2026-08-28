export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(padded);
}

export function randomToken(size = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(size)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Base64Url(value: string): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function deriveKey(secret: string, purpose: string, algorithm: "AES-GCM" | "HMAC"): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  const derivedAlgorithm = algorithm === "AES-GCM"
    ? { name: "AES-GCM", length: 256 }
    : { name: "HMAC", hash: "SHA-256", length: 256 };
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("zhuo-wordbook-owner-v2"),
      info: encoder.encode(purpose)
    },
    material,
    derivedAlgorithm,
    false,
    algorithm === "AES-GCM" ? ["encrypt", "decrypt"] : ["sign", "verify"]
  );
}

export async function encryptSecret(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, "github-token-encryption", "AES-GCM");
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value)));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv);
  packed.set(cipher, iv.length);
  return base64UrlEncode(packed);
}

export async function decryptSecret(value: string, secret: string): Promise<string> {
  try {
    const packed = base64UrlDecode(value);
    if (packed.length < 29) throw new Error("ciphertext too short");
    const key = await deriveKey(secret, "github-token-encryption", "AES-GCM");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, key, packed.slice(12));
    return decoder.decode(plain);
  } catch {
    throw new ApiError(401, "invalid_session", "登录会话无效，请重新登录。");
  }
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await deriveKey(secret, "oauth-cookie-signing", "HMAC");
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let different = 0;
  for (let index = 0; index < a.length; index += 1) different |= a[index] ^ b[index];
  return different === 0;
}

export async function signedCookieValue(value: string, secret: string): Promise<string> {
  return `${value}.${await hmac(value, secret)}`;
}

export async function verifySignedCookie(signed: string, expected: string, secret: string): Promise<boolean> {
  const separator = signed.lastIndexOf(".");
  if (separator <= 0) return false;
  const value = signed.slice(0, separator);
  const signature = signed.slice(separator + 1);
  if (!constantTimeEqual(value, expected)) return false;
  return constantTimeEqual(signature, await hmac(value, secret));
}

export function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const segment of (request.headers.get("cookie") || "").split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (key) cookies.set(key, value);
  }
  return cookies;
}

export function oauthStateCookie(value: string, maxAge: number): string {
  return `__Host-zhuo_oauth=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearOauthStateCookie(): string {
  return "__Host-zhuo_oauth=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

export function sessionCookie(value: string, maxAge: number): string {
  return `__Host-zhuo_session=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return "__Host-zhuo_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

export function assertSameOriginWrite(request: Request): string {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin") || "";
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== expected || (fetchSite && !["same-origin", "none"].includes(fetchSite))) {
    throw new ApiError(403, "origin_forbidden", "这个请求不是来自卓的同源管理页面。");
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "json_required", "管理接口只接收 application/json。");
  }
  return origin;
}

export function assertCsrf(request: Request, expected: string): void {
  const token = request.headers.get("x-csrf-token") || "";
  if (!token || !constantTimeEqual(token, expected)) {
    throw new ApiError(403, "csrf_failed", "页面验证已失效，请刷新后重试。");
  }
}

export function jsonResponse(payload: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "payload_too_large", "请求内容过大。");
  }
  const text = await request.text();
  if (encoder.encode(text).byteLength > maxBytes) throw new ApiError(413, "payload_too_large", "请求内容过大。");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "请求不是有效的 JSON。");
  }
}

export function redirectResponse(url: string, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Location", url);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(null, { status: 302, headers: responseHeaders });
}
