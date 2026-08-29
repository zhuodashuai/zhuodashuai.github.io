import { organizeEntry, organizeExactDictionaryFallback } from "./ai";
import {
  aiProviderConfigured,
  aiProviderOrder,
  AI_DAILY_REQUEST_LIMIT,
  effectiveAiProvider,
  OAUTH_STATE_TTL_SECONDS,
  readConfig,
  requireOwnerSecrets,
  SESSION_TTL_SECONDS,
  type AiProvider
} from "./config";
import {
  createAuthorizationUrl,
  exchangeOAuthCode,
  readRemoteWordbook,
  revokeOAuthToken,
  verifyOwnerAndRepository
} from "./github";
import { PublishRequestSchema, validateAllowedSynonyms, validateEnglishInput, validateSnapshot } from "./schema";
import {
  ApiError,
  assertSameOriginWrite,
  clearOauthStateCookie,
  clearSessionCookie,
  jsonResponse,
  oauthStateCookie,
  parseCookies,
  randomToken,
  readJsonBody,
  redirectResponse,
  sessionCookie,
  sha256Base64Url,
  sha256Hex,
  signedCookieValue,
  verifySignedCookie
} from "./security";

export { OwnerControl } from "./owner-control";

const API_PREFIX = "/api/v1";
const OAUTH_COOKIE = "__Host-zhuo_oauth";
const SESSION_COOKIE = "__Host-zhuo_session";

function requestId(request: Request): string {
  return request.headers.get("cf-ray") || crypto.randomUUID();
}

function controlStub(env: Env): DurableObjectStub {
  return env.OWNER_CONTROL.get(env.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
}

async function controlCall(env: Env, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await controlStub(env).fetch(`https://owner.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  let payload: Record<string, unknown> = {};
  try { payload = await response.json() as Record<string, unknown>; } catch { /* handled below */ }
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    throw new ApiError(response.status, String(error.code || "owner_control_error"), String(error.message || "管理服务暂时不可用。"), error.details);
  }
  return payload;
}

function sessionValue(request: Request): string {
  const value = parseCookies(request).get(SESSION_COOKIE) || "";
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(value)) throw new ApiError(401, "authentication_required", "请先以卓本人身份登录。");
  return value;
}

async function sessionContext(request: Request): Promise<{ raw: string; hash: string }> {
  const raw = sessionValue(request);
  return { raw, hash: await sha256Hex(raw) };
}

function csrfValue(request: Request): string {
  const value = request.headers.get("x-csrf-token") || "";
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(value)) throw new ApiError(403, "csrf_failed", "页面验证已失效，请刷新后重试。");
  return value;
}

async function rateByIp(request: Request, env: Env, kind: "auth" | "callback"): Promise<void> {
  const address = request.headers.get("cf-connecting-ip") || "local-development";
  await controlCall(env, "/rate", { subject: await sha256Hex(address), kind });
}

function callbackUrl(request: Request): string {
  const callback = new URL(`${API_PREFIX}/auth/callback`, request.url);
  // OAuth cookies are deliberately Secure.  Keep the registered callback on
  // HTTPS even if an upstream proxy ever supplies an HTTP request URL.
  callback.protocol = "https:";
  return callback.href;
}

function redirectToHttps(request: Request): Response | null {
  const target = new URL(request.url);
  if (target.protocol !== "http:") return null;
  target.protocol = "https:";
  return new Response(null, {
    status: 308,
    headers: {
      Location: target.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function login(request: Request, env: Env): Promise<Response> {
  const config = readConfig(env);
  const secrets = requireOwnerSecrets(config);
  await rateByIp(request, env, "auth");
  const state = randomToken(32);
  const verifier = randomToken(64);
  const challenge = await sha256Base64Url(verifier);
  await controlCall(env, "/oauth/create", {
    stateHash: await sha256Hex(state),
    verifier,
    expiresAt: Date.now() + OAUTH_STATE_TTL_SECONDS * 1000
  });
  const authorization = createAuthorizationUrl(secrets.GITHUB_APP_CLIENT_ID, callbackUrl(request), state, challenge);
  return redirectResponse(authorization, {
    "Set-Cookie": oauthStateCookie(await signedCookieValue(state, secrets.SESSION_SECRET), OAUTH_STATE_TTL_SECONDS)
  });
}

async function callback(request: Request, env: Env): Promise<Response> {
  const config = readConfig(env);
  const secrets = requireOwnerSecrets(config);
  await rateByIp(request, env, "callback");
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const oauthCookie = parseCookies(request).get(OAUTH_COOKIE) || "";
  let issuedToken = "";
  try {
    if (!/^[A-Za-z0-9_-]{40,200}$/.test(state) || !/^[A-Za-z0-9_-]{8,500}$/.test(code)
      || !await verifySignedCookie(oauthCookie, state, secrets.SESSION_SECRET)) {
      throw new ApiError(401, "oauth_state_invalid", "GitHub 登录验证不匹配，请重新开始。");
    }
    const transaction = await controlCall(env, "/oauth/consume", { stateHash: await sha256Hex(state) });
    const verifier = typeof transaction.verifier === "string" ? transaction.verifier : "";
    const token = await exchangeOAuthCode({
      clientId: secrets.GITHUB_APP_CLIENT_ID,
      clientSecret: secrets.GITHUB_APP_CLIENT_SECRET,
      code,
      verifier,
      callbackUrl: callbackUrl(request)
    });
    issuedToken = token.accessToken;
    const identity = await verifyOwnerAndRepository(token.accessToken, config);
    await readRemoteWordbook(token.accessToken, config);
    const rawSession = randomToken(48);
    const created = await controlCall(env, "/session/create", {
      sessionHash: await sha256Hex(rawSession),
      githubToken: token.accessToken,
      githubTokenExpiresAt: token.expiresAt,
      identity
    });
    const expiresAt = Number(created.expiresAt);
    const ttl = Number.isFinite(expiresAt)
      ? Math.max(1, Math.min(SESSION_TTL_SECONDS, Math.floor((expiresAt - Date.now()) / 1000)))
      : SESSION_TTL_SECONDS;
    const response = redirectResponse("/owner.html?login=ok", {
      "Set-Cookie": sessionCookie(rawSession, ttl)
    });
    response.headers.append("Set-Cookie", clearOauthStateCookie());
    return response;
  } catch (error) {
    if (issuedToken) await revokeOAuthToken(secrets.GITHUB_APP_CLIENT_ID, secrets.GITHUB_APP_CLIENT_SECRET, issuedToken);
    const codeValue = error instanceof ApiError ? error.code : "oauth_failed";
    const response = redirectResponse(`/owner.html?login=error&reason=${encodeURIComponent(codeValue)}`);
    response.headers.append("Set-Cookie", clearOauthStateCookie());
    return response;
  }
}

async function sessionInfo(request: Request, env: Env): Promise<Response> {
  try {
    const session = await sessionContext(request);
    return jsonResponse(await controlCall(env, "/session/view", { sessionHash: session.hash }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return jsonResponse({ authenticated: false }, 200, { "Set-Cookie": clearSessionCookie() });
    }
    throw error;
  }
}

async function logout(request: Request, env: Env): Promise<Response> {
  assertSameOriginWrite(request);
  const session = await sessionContext(request);
  const csrfToken = csrfValue(request);
  await readJsonBody(request, 1024);
  await controlCall(env, "/session/delete", { sessionHash: session.hash, csrfToken });
  return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

async function ownerSnapshot(request: Request, env: Env): Promise<Response> {
  const session = await sessionContext(request);
  return jsonResponse(await controlCall(env, "/owner/snapshot", { sessionHash: session.hash }));
}

function publicReadHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": new URL(env.PUBLIC_SITE_URL).origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept",
    "Cross-Origin-Resource-Policy": "cross-origin",
    Vary: "Origin"
  };
}

async function publicSnapshot(request: Request, env: Env): Promise<Response> {
  const headers = publicReadHeaders(env);
  let ownerConfirmed: ReturnType<typeof validateSnapshot> | null = null;
  let deployed: ReturnType<typeof validateSnapshot> | null = null;
  try {
    const current = await controlCall(env, "/public/snapshot", {});
    ownerConfirmed = validateSnapshot(current.snapshot);
  } catch {
    // The Durable Object is an acceleration layer; the deployed snapshot below
    // remains available when it has not been seeded or is temporarily down.
  }
  try {
    const assetUrl = new URL("/data/owner-wordbook.json", request.url);
    const asset = await env.ASSETS.fetch(new Request(assetUrl, { headers: { Accept: "application/json" } }));
    if (asset.ok) deployed = validateSnapshot(await asset.json());
  } catch {
    // A newer owner-confirmed snapshot can still serve public reads if the
    // static asset binding is unavailable.
  }
  if (!ownerConfirmed && !deployed) throw new ApiError(503, "public_snapshot_unavailable", "公开词库暂时不可读取。");

  // A repository deployment can contain editorial corrections that are newer
  // than the last Owner session which seeded the Durable Object. Conversely,
  // an Owner publish after deployment is newer than the bundled asset. Compare
  // their validated export times instead of blindly preferring either cache.
  const useDeployed = Boolean(deployed && (!ownerConfirmed
    || Date.parse(deployed.exportedAt) > Date.parse(ownerConfirmed.exportedAt)));
  const snapshot = useDeployed ? deployed! : ownerConfirmed!;
  const source = useDeployed ? "deployed-newer" : "owner-confirmed";
  const etag = `"${snapshot.revisionId}"`;
  const responseHeaders = {
    ...headers,
    ETag: etag,
    "Cache-Control": "no-cache",
    "X-Wordbook-Source": source
  };
  if (request.headers.get("If-None-Match")?.split(",").map((value) => value.trim()).includes(etag)) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }
  return jsonResponse(snapshot, 200, responseHeaders);
}

async function organize(request: Request, env: Env): Promise<Response> {
  assertSameOriginWrite(request);
  const config = readConfig(env);
  const session = await sessionContext(request);
  const csrfToken = csrfValue(request);
  await controlCall(env, "/session/assert", { sessionHash: session.hash, csrfToken });
  const body = await readJsonBody(request, 8 * 1024);
  const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const rawInput = bodyRecord.input;
  const input = validateEnglishInput(rawInput);
  const allowedSynonyms = validateAllowedSynonyms(bodyRecord.allowedSynonyms);
  try {
    await controlCall(env, "/rate", { subject: session.hash, kind: "ai" });
  } catch (error) {
    if (error instanceof ApiError && error.code === "rate_limited") {
      const dictionaryFallback = await organizeExactDictionaryFallback(input, config);
      if (dictionaryFallback) {
        dictionaryFallback.warnings.unshift("本分钟的 AI 请求过于频繁；本次没有调用 AI，已改用本地词典精确匹配。");
        return jsonResponse(dictionaryFallback);
      }
    }
    throw error;
  }
  // This account-wide guard is deliberately independent of browser sessions.
  // Its UTC-day bucket aligns with Cloudflare's documented daily reset.
  try {
    await controlCall(env, "/rate", { subject: "zhuo-owner-account", kind: "ai-daily" });
  } catch (error) {
    if (error instanceof ApiError && error.code === "free_ai_daily_limit") {
      const dictionaryFallback = await organizeExactDictionaryFallback(input, config);
      if (dictionaryFallback) {
        dictionaryFallback.warnings.unshift("今日免费 AI 整理次数已达到上限；本次没有调用 AI，已改用本地词典精确匹配。");
        return jsonResponse(dictionaryFallback);
      }
    }
    throw error;
  }
  return jsonResponse(await organizeEntry(input, config, allowedSynonyms));
}

async function publish(request: Request, env: Env): Promise<Response> {
  assertSameOriginWrite(request);
  const session = await sessionContext(request);
  const csrfToken = csrfValue(request);
  const raw = await readJsonBody(request, 1_100_000);
  const parsed = PublishRequestSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "invalid_publish_request", "发布内容没有通过严格校验。", parsed.error.issues);
  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (idempotencyKey !== parsed.data.mutationId) {
    throw new ApiError(400, "idempotency_mismatch", "Idempotency-Key 必须与 mutationId 一致。");
  }
  const payload = await controlCall(env, "/owner/publish", {
    sessionHash: session.hash,
    csrfToken,
    publishRequest: parsed.data
  });
  return jsonResponse(payload);
}

function apiErrorResponse(error: unknown, request: Request): Response {
  const safe = error instanceof ApiError
    ? error
    : new ApiError(500, "internal_error", "服务暂时无法完成请求，请稍后重试。");
  const headers: HeadersInit = {};
  if (safe.status === 429 && safe.details && typeof safe.details === "object") {
    const retryAfter = Number((safe.details as Record<string, unknown>).retryAfter);
    if (Number.isFinite(retryAfter)) headers["Retry-After"] = String(Math.max(1, Math.ceil(retryAfter)));
  }
  return jsonResponse({
    error: {
      code: safe.code,
      message: safe.message,
      requestId: requestId(request),
      ...([400, 409].includes(safe.status) && safe.details !== undefined ? { details: safe.details } : {})
    }
  }, safe.status, headers);
}

async function routeApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === `${API_PREFIX}/health` && request.method === "GET") {
    const config = readConfig(env);
    const fallback = config.AI_FALLBACK_PROVIDER;
    const paidFallbackEnabled = config.ALLOW_PAID_AI_FALLBACK === "true"
      && (fallback === "openai" || fallback === "anthropic");
    const effectiveProvider = effectiveAiProvider(config);
    const allowedProviders = aiProviderOrder(config);
    const providerModel = (provider: AiProvider | null) => provider === "cloudflare"
      ? config.CLOUDFLARE_AI_MODEL || "@cf/zai-org/glm-4.7-flash"
      : provider === "openai"
        ? config.OPENAI_MODEL || null
        : provider === "anthropic"
          ? config.ANTHROPIC_MODEL || null
          : null;
    return jsonResponse({
      ok: true,
      version: "2.3.0",
      ownerAuthConfigured: Boolean(config.GITHUB_APP_CLIENT_ID && config.GITHUB_APP_CLIENT_SECRET && config.SESSION_SECRET),
      aiProvider: config.AI_PROVIDER,
      aiEffectiveProvider: effectiveProvider,
      aiModel: providerModel(effectiveProvider),
      aiRetryModel: effectiveProvider === "cloudflare"
        ? config.CLOUDFLARE_AI_RETRY_MODEL || "@cf/google/gemma-4-26b-a4b-it"
        : null,
      aiAccessMode: effectiveProvider === "cloudflare"
        ? "cloudflare-account-quota"
        : effectiveProvider ? "provider-api-billing" : "unavailable",
      aiFreeRetryConfigured: effectiveProvider === "cloudflare" && Boolean(config.AI),
      aiFallbackProvider: fallback && allowedProviders.includes(fallback) ? fallback : null,
      paidFallbackEnabled,
      aiConfigured: Boolean(effectiveProvider),
      aiPrimaryConfigured: aiProviderConfigured(config.AI_PROVIDER, config),
      aiFallbackConfigured: Boolean(fallback && allowedProviders.includes(fallback) && aiProviderConfigured(fallback, config)),
      aiDailyRequestLimit: AI_DAILY_REQUEST_LIMIT
    });
  }
  if (path === `${API_PREFIX}/public/wordbook` && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: publicReadHeaders(env) });
  }
  if (path === `${API_PREFIX}/public/wordbook` && request.method === "GET") return publicSnapshot(request, env);
  if (path === `${API_PREFIX}/auth/login` && request.method === "GET") return login(request, env);
  if (path === `${API_PREFIX}/auth/callback` && request.method === "GET") return callback(request, env);
  if (path === `${API_PREFIX}/session` && request.method === "GET") return sessionInfo(request, env);
  if (path === `${API_PREFIX}/auth/logout` && request.method === "POST") return logout(request, env);
  if (path === `${API_PREFIX}/owner/wordbook` && request.method === "GET") return ownerSnapshot(request, env);
  if (path === `${API_PREFIX}/owner/ai/organize` && request.method === "POST") return organize(request, env);
  if (path === `${API_PREFIX}/owner/publish` && request.method === "POST") return publish(request, env);
  throw new ApiError(404, "api_not_found", "管理接口不存在。");
}

function secureHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  const currentReferrerPolicy = (headers.get("Referrer-Policy") || "").trim().toLowerCase();
  if (!["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"].includes(currentReferrerPolicy)) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  const publicWordbook = new URL(request.url).pathname === `${API_PREFIX}/public/wordbook`;
  headers.set("Cross-Origin-Resource-Policy", publicWordbook ? "cross-origin" : "same-origin");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://github.com; frame-ancestors 'none'; upgrade-insecure-requests");
  if (new URL(request.url).protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const httpsRedirect = redirectToHttps(request);
    if (httpsRedirect) return httpsRedirect;
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith("/api/")) return secureHeaders(await routeApi(request, env), request);
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      if (headers.get("content-type")?.includes("text/html")) headers.set("Cache-Control", "no-cache, must-revalidate");
      else if (/\.(?:js|css|webmanifest)$/i.test(path)) headers.set("Cache-Control", "no-cache");
      return secureHeaders(new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers }), request);
    } catch (error) {
      if (path.startsWith("/api/")) return secureHeaders(apiErrorResponse(error, request), request);
      return secureHeaders(new Response("Not found", { status: 404 }), request);
    }
  }
};
