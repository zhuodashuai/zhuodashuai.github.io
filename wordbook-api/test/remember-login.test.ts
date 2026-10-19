import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";
import worker from "../src/index";
import { REMEMBER_SESSION_TTL_SECONDS, SESSION_TTL_SECONDS } from "../src/config";
import { exchangeOAuthCode, refreshOAuthToken } from "../src/github";
import { decryptSecret, encryptSecret, sha256Hex } from "../src/security";
import { snapshot } from "./fixtures";

const testEnv = env as unknown as Env;
const SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const RAW = "s".repeat(64), COOKIE = `__Host-zhuo_session=${RAW}`;
const ACCESS = "old-access-token-for-mocked-github", REFRESH = "old-refresh-token-for-mocked-github";
const NEXT_ACCESS = "new-access-token-for-mocked-github", NEXT_REFRESH = "new-refresh-token-for-mocked-github";
const owner = () => testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
const call = (path: string, body: Record<string, unknown>) => owner().fetch(`https://internal${path}`, { method: "POST", body: JSON.stringify(body) });
const api = (path = "/api/v1/session", headers: Record<string, string> = {}) => worker.fetch(new Request(`https://admin.example${path}`, { headers: { Cookie: COOKIE, ...headers } }), testEnv);
const record = async () => runInDurableObject(owner(), async (_instance, state) => state.storage.get<Record<string, unknown>>(`session:${await sha256Hex(RAW)}`));
const identity = { login: "zhuodashuai", id: 156042078, avatarUrl: "", installationId: 99 };
const pair = () => ({ access_token: NEXT_ACCESS, expires_in: 28800, refresh_token: NEXT_REFRESH, refresh_token_expires_in: 15897600 });

function githubMock(refresh: () => Promise<Response> = async () => Response.json(pair())) {
  let refreshCalls = 0;
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/login/oauth/access_token") {
      const body = JSON.parse(String(init.body));
      if (body.grant_type === "refresh_token") { refreshCalls++; expect(body.refresh_token).toBe(REFRESH); return refresh(); }
      return Response.json({ access_token: ACCESS, expires_in: 28800, refresh_token: REFRESH, refresh_token_expires_in: 15897600 });
    }
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    if (url.pathname === "/user") return Response.json({ login: "zhuodashuai", id: 156042078, avatar_url: "" });
    if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 99, account: { id: 156042078 }, permissions: { contents: "write" } }] });
    if (url.pathname === "/user/installations/99/repositories") return Response.json({ repositories: [{ id: 1309360291 }] });
    if (url.pathname === "/repos/zhuodashuai/zhuodashuai.github.io") return Response.json({ id: 1309360291, owner: { id: 156042078 }, full_name: "zhuodashuai/zhuodashuai.github.io", default_branch: "main", permissions: { push: true } });
    if (url.pathname.endsWith("/contents/vocab/data/owner-wordbook.json")) {
      const bytes = new TextEncoder().encode(JSON.stringify(snapshot([])));
      return Response.json({ type: "file", sha: "a".repeat(40), content: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")) });
    }
    throw new Error(`Unexpected mocked path: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", mock);
  return { mock, refreshCalls: () => refreshCalls };
}

async function seed({ remember = true, refresh = true, accessExpired = false } = {}) {
  const response = await call("/session/create", { sessionHash: await sha256Hex(RAW), githubToken: ACCESS,
    githubTokenExpiresAt: Date.now() + 28800_000, identity, remember,
    ...(refresh ? { githubRefreshToken: REFRESH, githubRefreshExpiresAt: Date.now() + 15897600_000 } : {}) });
  expect(response.status).toBe(200);
  if (accessExpired) await runInDurableObject(owner(), async (_instance, state) => {
    const key = `session:${await sha256Hex(RAW)}`;
    const stored = await state.storage.get<Record<string, unknown>>(key);
    await state.storage.put(key, { ...stored, githubTokenExpiresAt: Date.now() - 1000 });
  });
  return response.json() as Promise<{ expiresAt: number }>;
}

beforeEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await reset(); });

it("preserves refresh metadata and never extends a provider access-token expiry", async () => {
  githubMock();
  const token = await exchangeOAuthCode({ clientId: "test-client-id", clientSecret: "test-client-secret", code: "test-code", verifier: "v".repeat(43), callbackUrl: "https://admin.example/api/v1/auth/callback" });
  expect(token.refreshToken).toBe(REFRESH);
  expect(token.refreshExpiresAt! - Date.now()).toBeGreaterThan(30 * 86400_000);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: ACCESS, expires_in: 2 })));
  const short = await exchangeOAuthCode({ clientId: "test-client-id", clientSecret: "test-client-secret", code: "test-code", verifier: "v".repeat(43), callbackUrl: "https://admin.example/api/v1/auth/callback" });
  expect(short.expiresAt - Date.now()).toBeLessThanOrEqual(2000);
});

it("binds the remember choice to one-use OAuth state and sends only an opaque 30-day cookie", async () => {
  githubMock();
  const login = await api("/api/v1/auth/login?remember=1");
  expect(new URL(login.headers.get("location")!).searchParams.get("scope")).toBe("offline_access");
  const state = new URL(login.headers.get("location")!).searchParams.get("state")!;
  const oauthCookie = login.headers.get("set-cookie")!.split(";", 1)[0];
  const callback = await api(`/api/v1/auth/callback?code=test-code&state=${state}&remember=0`, { Cookie: oauthCookie });
  expect(callback.headers.get("location")).toBe("/owner.html?login=ok");
  const cookie = callback.headers.get("set-cookie")!;
  expect(cookie).toMatch(/__Host-zhuo_session=[A-Za-z0-9_-]{64};/);
  const seconds = Number(cookie.match(/Max-Age=(\d+)/)![1]);
  expect(seconds).toBeGreaterThan(REMEMBER_SESSION_TTL_SECONDS - 10);
  expect(seconds).toBeLessThanOrEqual(REMEMBER_SESSION_TTL_SECONDS);
  expect(cookie).toContain("HttpOnly; Secure; SameSite=Lax");
  for (const secret of [ACCESS, REFRESH]) expect(cookie).not.toContain(secret);
  const rows = await runInDurableObject(owner(), async (_instance, storage) => Array.from((await storage.storage.list<Record<string, unknown>>({ prefix: "session:" })).values()));
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain(REFRESH);
  expect(await decryptSecret(rows[0].githubRefreshTokenCipher as string, SECRET)).toBe(REFRESH);
});

it("keeps unchecked, legacy and no-refresh sessions short, and bounds long sessions by refresh expiry", async () => {
  for (const choice of [{ remember: false, refresh: true }, { remember: true, refresh: false }]) {
    const session = await seed(choice);
    expect(session.expiresAt - Date.now()).toBeLessThanOrEqual(SESSION_TTL_SECONDS * 1000);
    expect((await record())?.githubRefreshTokenCipher).toBeUndefined();
  }
  const cap = Date.now() + 2 * 86400_000;
  const response = await call("/session/create", { sessionHash: await sha256Hex(RAW), githubToken: ACCESS, githubTokenExpiresAt: Date.now() + 28800_000,
    identity, remember: true, githubRefreshToken: REFRESH, githubRefreshExpiresAt: cap });
  expect((await response.json() as { expiresAt: number }).expiresAt).toBe(cap);
});

it("refreshes once across concurrent requests and retains all newly issued CSRF tokens", async () => {
  const mock = githubMock();
  await seed({ accessExpired: true });
  const views = await Promise.all([api(), api(), api()].map(async task => { const response = await task; expect(response.status).toBe(200); return response.json() as Promise<{ authenticated: boolean; csrfToken: string }>; }));
  expect(mock.refreshCalls()).toBe(1);
  expect(views.every(view => view.authenticated)).toBe(true);
  for (const view of views) {
    const asserted = await call("/session/assert", { sessionHash: await sha256Hex(RAW), csrfToken: view.csrfToken });
    expect(asserted.status).toBe(200);
  }
  const stored = (await record())!;
  expect(await decryptSecret(stored.githubTokenCipher as string, SECRET)).toBe(NEXT_ACCESS);
  expect(await decryptSecret(stored.githubRefreshTokenCipher as string, SECRET)).toBe(NEXT_REFRESH);
});

it("refreshes the owner's private-book bridge before returning its full absolute expiry", async () => {
  const mock = githubMock(); const session = await seed({ accessExpired: true });
  const response = await api("/api/v1/member/session", { "X-Wordbook-Auth": "github-owner" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ authenticated: true, authType: "github-owner", expiresAt: session.expiresAt,
    user: { id: "15604207-8000-4000-8000-000000000001", username: "zhuodashuai" } });
  expect(mock.refreshCalls()).toBe(1);
});

it("drops invalid refresh tokens but preserves cookies and sessions for transient refresh failures", async () => {
  for (const status of [403, 429, 503]) {
    githubMock(async () => Response.json({ message: "temporarily unavailable" }, { status }));
    await seed({ accessExpired: true });
    const response = await api();
    expect(response.status).toBe(503); expect(response.headers.get("set-cookie")).toBeNull();
    expect(await record()).toBeDefined();
  }
  githubMock(async () => Response.json({ error: "bad_refresh_token" }, { status: 400 }));
  const response = await api();
  expect(await response.json()).toEqual({ authenticated: false });
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await record()).toBeUndefined();
});

it("keeps a rotated pair after a transient verification outage, then rechecks the pinned identity", async () => {
  const { mock } = githubMock(); await seed({ accessExpired: true });
  const normal = mock.getMockImplementation()!;
  let outage = true;
  mock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/user" && outage) return Response.json({}, { status: 503 });
    return normal(input, init);
  });
  expect((await api()).status).toBe(503);
  expect(await decryptSecret((await record())!.githubRefreshTokenCipher as string, SECRET)).toBe(NEXT_REFRESH);
  outage = false;
  expect(await (await api()).json()).toMatchObject({ authenticated: true });
});

it("revokes locally after provider failures, and concurrent logout cannot resurrect a refreshed session", async () => {
  githubMock(); await seed();
  const view = await (await api()).json() as { csrfToken: string };
  await runInDurableObject(owner(), async (_instance, state) => {
    const key = `session:${await sha256Hex(RAW)}`;
    await state.storage.put(key, { ...await state.storage.get<Record<string, unknown>>(key), githubTokenExpiresAt: Date.now() - 1000 });
  });
  githubMock(async () => Response.json({}, { status: 503 }));
  expect((await api()).status).toBe(503);
  const logout = await call("/session/delete", { sessionHash: await sha256Hex(RAW), csrfToken: view.csrfToken });
  expect(logout.status).toBe(200); expect(await record()).toBeUndefined();
  githubMock(); await seed();
  const another = await (await api()).json() as { csrfToken: string };
  await runInDurableObject(owner(), async (_instance, state) => {
    const key = `session:${await sha256Hex(RAW)}`;
    await state.storage.put(key, { ...await state.storage.get<Record<string, unknown>>(key), githubTokenExpiresAt: Date.now() - 1000 });
  });
  const [read, deleted] = await Promise.all([api(), call("/session/delete", { sessionHash: await sha256Hex(RAW), csrfToken: another.csrfToken })]);
  expect(read.status).toBe(200); expect(deleted.status).toBe(200);
  expect(await record()).toBeUndefined();
});

it("rejects changed owner or repository authorization after refresh", async () => {
  const { mock } = githubMock(); await seed({ accessExpired: true });
  const normal = mock.getMockImplementation()!;
  mock.mockImplementation(async (input, init) => new URL(String(input)).pathname === "/user"
    ? Response.json({ login: "someone-else", id: 42 }) : normal(input, init));
  expect(await (await api()).json()).toEqual({ authenticated: false });
  expect(await record()).toBeUndefined();
});

it("classifies rate-limited OAuth refresh as retryable without exposing provider errors or tokens", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "temporarily_unavailable", error_description: REFRESH }, { status: 403, headers: { "Retry-After": "60" } })));
  await expect(refreshOAuthToken("client-id", "client-secret", REFRESH)).rejects.toMatchObject({ status: 503, code: "oauth_refresh_unavailable", details: undefined });
});

it("consumes the remembered OAuth transaction atomically under concurrent callbacks", async () => {
  const stateHash = "a".repeat(64);
  expect((await call("/oauth/create", { stateHash, verifier: "v".repeat(43), expiresAt: Date.now() + 60_000, remember: true })).status).toBe(200);
  const responses = await Promise.all([call("/oauth/consume", { stateHash }), call("/oauth/consume", { stateHash })]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 401]);
  const success = responses.find(response => response.ok)!;
  expect(await success.json()).toMatchObject({ remember: true });
});

it("cleanup waits for token rotation and re-reads rather than deleting a refreshed session", async () => {
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  githubMock(async () => { started(); await gate; return Response.json(pair()); });
  await seed({ accessExpired: true });
  const reading = api();
  await entered;
  const cleaning = call("/oauth/create", { stateHash: "b".repeat(64), verifier: "v".repeat(43), expiresAt: Date.now() + 60_000, remember: false });
  release();
  expect((await reading).status).toBe(200);
  expect((await cleaning).status).toBe(200);
  expect(await decryptSecret((await record())!.githubRefreshTokenCipher as string, SECRET)).toBe(NEXT_REFRESH);
});
