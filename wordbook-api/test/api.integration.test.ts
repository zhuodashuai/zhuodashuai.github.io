import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { AppConfig } from "../src/config";
import { verifyOwnerAndRepository } from "../src/github";
import { encryptSecret, sha256Hex } from "../src/security";
import { entry, snapshot } from "./fixtures";

const testEnv = env as unknown as Env;
const SESSION_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SESSION_ID = "s".repeat(64);
const SESSION_COOKIE = `__Host-zhuo_session=${SESSION_ID}`;
const GITHUB_CONFIG: AppConfig = {
  PUBLIC_SITE_URL: "https://zhuodashuai.github.io/vocab/", GITHUB_OWNER: "zhuodashuai", GITHUB_OWNER_ID: 156042078,
  GITHUB_REPOSITORY: "zhuodashuai.github.io", GITHUB_REPOSITORY_ID: 1309360291, GITHUB_BRANCH: "main",
  GITHUB_WORDBOOK_PATH: "vocab/data/owner-wordbook.json", AI_PROVIDER: "openai"
};

function api(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(`https://admin.example${path}`, init), testEnv);
}

function encode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function asUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

async function seedSession(): Promise<string> {
  const hash = await sha256Hex(SESSION_ID);
  const stub = testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put(`session:${hash}`, {
      githubTokenCipher: await encryptSecret("github-test-token", SESSION_SECRET),
      githubTokenExpiresAt: Date.now() + 7_200_000,
      login: "zhuodashuai",
      userId: 156042078,
      avatarUrl: "https://avatars.githubusercontent.com/u/156042078?v=4",
      installationId: 99,
      repositoryId: 1309360291,
      csrfHashes: [],
      createdAt: Date.now(),
      absoluteExpiresAt: Date.now() + 3_600_000,
      lastSeenAt: Date.now(),
      encryptionKeyVersion: 1
    });
  });
  const response = await api("/api/v1/session", { headers: { Cookie: SESSION_COOKIE } });
  expect(response.status).toBe(200);
  return (await response.json() as { csrfToken: string }).csrfToken;
}

function ownerGitHubMock(initialSnapshot = snapshot([]), initialSha = "a".repeat(40)) {
  let remoteSnapshot = structuredClone(initialSnapshot);
  let remoteSha = initialSha;
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = asUrl(input);
    if (url.pathname === "/user") return Response.json({ login: "zhuodashuai", id: 156042078, avatar_url: "https://avatars.githubusercontent.com/u/156042078?v=4" });
    if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 99, account: { id: 156042078 }, permissions: { contents: "write" } }] });
    if (url.pathname === "/user/installations/99/repositories") return Response.json({ repositories: [{ id: 1309360291, full_name: "zhuodashuai/zhuodashuai.github.io" }] });
    if (url.pathname === "/repos/zhuodashuai/zhuodashuai.github.io") {
      return Response.json({
        id: 1309360291, full_name: "zhuodashuai/zhuodashuai.github.io", default_branch: "main", fork: false,
        archived: false, disabled: false, owner: { id: 156042078 }, permissions: { push: true }
      });
    }
    if (url.pathname === "/repos/zhuodashuai/zhuodashuai.github.io/contents/vocab/data/owner-wordbook.json" && (init.method || "GET") === "GET") {
      return Response.json({ type: "file", sha: remoteSha, html_url: "https://github.com/file", content: encode(JSON.stringify(remoteSnapshot)) });
    }
    if (url.pathname === "/repos/zhuodashuai/zhuodashuai.github.io/contents/vocab/data/owner-wordbook.json" && init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (body.sha !== remoteSha) return Response.json({ message: "sha does not match" }, { status: 409 });
      const binary = atob(body.content);
      remoteSnapshot = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
      remoteSha = "b".repeat(40);
      return Response.json({ content: { sha: remoteSha, html_url: "https://github.com/file" }, commit: { sha: "c".repeat(40) } });
    }
    throw new Error(`Unexpected mocked URL: ${url.href}`);
  });
  return { mock, state: () => ({ remoteSnapshot, remoteSha }) };
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await reset();
});

describe("worker API integration", () => {
  it("serves health and hardened static owner assets", async () => {
    const health = await api("/api/v1/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, ownerAuthConfigured: true, aiConfigured: true });
    const asset = await api("/owner.html");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("x-frame-options")).toBe("DENY");
    expect(asset.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(asset.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("fails closed for unauthenticated session and publish requests", async () => {
    const sessionResponse = await api("/api/v1/session");
    expect(await sessionResponse.json()).toEqual({ authenticated: false });
    const publishResponse = await api("/api/v1/owner/publish", {
      method: "POST",
      headers: { Origin: "https://admin.example", "Content-Type": "application/json", "Idempotency-Key": "mutation-unauth-01" },
      body: JSON.stringify({})
    });
    expect(publishResponse.status).toBe(401);
  });

  it.each([
    { id: 42, installationId: 99 },
    { id: 156042078, installationId: 0 }
  ])("durable session creation independently rejects an invalid fixed owner identity %#", async (identity) => {
    const stub = testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
    const response = await stub.fetch("https://owner.internal/session/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionHash: "x".repeat(64),
        githubToken: "github-test-token-000000000",
        githubTokenExpiresAt: Date.now() + 3_600_000,
        identity: {
          login: "zhuodashuai",
          id: identity.id,
          avatarUrl: "https://avatars.githubusercontent.com/u/156042078?v=4",
          installationId: identity.installationId
        }
      })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_internal_request" } });
  });

  it("starts OAuth with PKCE, one-time state and __Host cookie", async () => {
    const response = await api("/api/v1/auth/login", { headers: { "CF-Connecting-IP": "203.0.113.10" }, redirect: "manual" });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") || "");
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(response.headers.get("set-cookie")).toContain("__Host-zhuo_oauth=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("cleans more than 128 expired durable records in safe delete batches", async () => {
    const stub = testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
    const expiredAt = Date.now() - 10_000;
    await runInDurableObject(stub, async (_instance, state) => {
      const oauth = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
        `oauth:expired-${String(index).padStart(3, "0")}`, { verifier: "v".repeat(43), expiresAt: expiredAt, createdAt: expiredAt }
      ]));
      const sessions = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
        `session:expired-${String(index).padStart(3, "0")}`, { absoluteExpiresAt: expiredAt, githubTokenExpiresAt: expiredAt }
      ]));
      const mutations = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
        `mutation:expired-${String(index).padStart(3, "0")}`, { semanticHash: "0".repeat(64), status: "committed", createdAt: expiredAt, updatedAt: expiredAt, expiresAt: expiredAt }
      ]));
      await state.storage.put(oauth);
      await state.storage.put(sessions);
      await state.storage.put(mutations);
    });

    const response = await api("/api/v1/auth/login", { headers: { "CF-Connecting-IP": "203.0.113.90" }, redirect: "manual" });
    expect(response.status).toBe(302);
    await runInDurableObject(stub, async (_instance, state) => {
      const remaining = [
        ...await state.storage.list({ prefix: "oauth:expired-" }),
        ...await state.storage.list({ prefix: "session:expired-" }),
        ...await state.storage.list({ prefix: "mutation:expired-" })
      ];
      expect(remaining).toHaveLength(0);
    });
  });

  it("rejects a non-owner GitHub identity even if the token is otherwise valid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ login: "someone-else", id: 42, avatar_url: "" })));
    await expect(verifyOwnerAndRepository("token", GITHUB_CONFIG)).rejects.toMatchObject({ status: 403, code: "not_owner" });
  });

  it("distinguishes GitHub rate limits from permission failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { message: "API rate limit exceeded" },
      { status: 403, headers: { "X-RateLimit-Remaining": "0", "Retry-After": "37" } }
    )));
    await expect(verifyOwnerAndRepository("token", GITHUB_CONFIG)).rejects.toMatchObject({
      status: 429, code: "github_rate_limited", details: { retryAfter: 37 }
    });

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Resource not accessible by integration" }, { status: 403 })));
    await expect(verifyOwnerAndRepository("token", GITHUB_CONFIG)).rejects.toMatchObject({ status: 403, code: "github_forbidden" });

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Bad credentials" }, { status: 401 })));
    await expect(verifyOwnerAndRepository("token", GITHUB_CONFIG)).rejects.toMatchObject({ status: 401, code: "github_session_expired" });
  });

  it("finds the pinned installation and repository on later GitHub pages", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = asUrl(input);
      const page = Number(url.searchParams.get("page") || 1);
      if (url.pathname === "/user") return Response.json({ login: "zhuodashuai", id: 156042078, avatar_url: "" });
      if (url.pathname === "/user/installations") {
        if (page === 1) {
          return Response.json({ installations: Array.from({ length: 100 }, (_, index) => ({
            id: index + 1, account: { id: index + 1 }, permissions: { contents: "write" }
          })) });
        }
        return Response.json({ installations: [{ id: 999, account: { id: 156042078 }, permissions: { contents: "write" } }] });
      }
      if (url.pathname === "/user/installations/999/repositories") {
        if (page === 1) return Response.json({ repositories: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) });
        return Response.json({ repositories: [{ id: 1309360291 }] });
      }
      if (url.pathname === "/repos/zhuodashuai/zhuodashuai.github.io") {
        return Response.json({
          id: 1309360291, full_name: "zhuodashuai/zhuodashuai.github.io", default_branch: "main", fork: false,
          archived: false, disabled: false, owner: { id: 156042078 }, permissions: { push: true }
        });
      }
      throw new Error(`Unexpected mocked URL: ${url.href}`);
    });
    vi.stubGlobal("fetch", mock);
    await expect(verifyOwnerAndRepository("token", GITHUB_CONFIG)).resolves.toMatchObject({ installationId: 999 });
    expect(mock.mock.calls.some(([input]) => asUrl(input).pathname === "/user/installations" && asUrl(input).searchParams.get("page") === "2")).toBe(true);
    expect(mock.mock.calls.some(([input]) => asUrl(input).pathname.endsWith("/repositories") && asUrl(input).searchParams.get("page") === "2")).toBe(true);
  });

  it("grants session view only for the pinned owner and rotates a CSRF token", async () => {
    const csrf = await seedSession();
    expect(csrf).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const second = await api("/api/v1/session", { headers: { Cookie: SESSION_COOKIE } });
    expect(await second.json()).toMatchObject({ authenticated: true, user: { login: "zhuodashuai", id: 156042078 } });
  });

  it("publishes add mutations with GitHub SHA control and idempotent recovery", async () => {
    const csrf = await seedSession();
    const github = ownerGitHubMock();
    vi.stubGlobal("fetch", github.mock);
    const receive = entry({ id: "public-receive", term: "receive", normalized: "receive", standardForm: "receive", entryType: "word" });
    const mutationId = "mutation-api-add-0001";
    const body = { baseSha: "a".repeat(40), mutationId, mutation: { type: "add", entry: receive } };
    const headers = {
      Cookie: SESSION_COOKIE, Origin: "https://admin.example", "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json", "X-CSRF-Token": csrf, "Idempotency-Key": mutationId
    };
    const response = await api("/api/v1/owner/publish", { method: "POST", headers, body: JSON.stringify(body) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sha: "b".repeat(40), action: "added", recovered: false });
    expect(github.state().remoteSnapshot.entries).toHaveLength(1);
    const retry = await api("/api/v1/owner/publish", { method: "POST", headers, body: JSON.stringify(body) });
    expect(await retry.json()).toMatchObject({ action: "idempotent", recovered: true });
    const changedBody = { ...body, mutation: { type: "add", entry: { ...receive, meaning: "a different payload" } } };
    const reused = await api("/api/v1/owner/publish", { method: "POST", headers, body: JSON.stringify(changedBody) });
    expect(reused.status).toBe(409);
    expect(await reused.json()).toMatchObject({ error: { code: "idempotency_key_reused" } });
    const putCalls = github.mock.mock.calls.filter(([input, init]) => asUrl(input).pathname.includes("owner-wordbook.json") && init?.method === "PUT");
    expect(putCalls).toHaveLength(1);
  });

  it("fails closed repeatedly when a remote mutation ID has no durable semantic record", async () => {
    const csrf = await seedSession();
    const mutationId = "mutation-unverifiable-01";
    const github = ownerGitHubMock({ ...snapshot([]), lastMutationId: mutationId });
    vi.stubGlobal("fetch", github.mock);
    const receive = entry({ id: "public-receive", term: "receive", entryType: "word" });
    const body = { baseSha: "a".repeat(40), mutationId, mutation: { type: "add", entry: receive } };
    const headers = {
      Cookie: SESSION_COOKIE, Origin: "https://admin.example", "Content-Type": "application/json",
      "X-CSRF-Token": csrf, "Idempotency-Key": mutationId
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await api("/api/v1/owner/publish", { method: "POST", headers, body: JSON.stringify(body) });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "idempotency_unverifiable" } });
    }
  });

  it("returns a 409 snapshot instead of overwriting stale GitHub data", async () => {
    const csrf = await seedSession();
    const github = ownerGitHubMock(snapshot([entry()]), "d".repeat(40));
    vi.stubGlobal("fetch", github.mock);
    const mutationId = "mutation-stale-api-1";
    const response = await api("/api/v1/owner/publish", {
      method: "POST",
      headers: { Cookie: SESSION_COOKIE, Origin: "https://admin.example", "Content-Type": "application/json", "X-CSRF-Token": csrf, "Idempotency-Key": mutationId },
      body: JSON.stringify({ baseSha: "a".repeat(40), mutationId, mutation: { type: "delete", id: "public-jab-at", expectedUpdatedAt: "2026-08-28T00:00:00.000Z" } })
    });
    expect(response.status).toBe(409);
    const payload = await response.json() as { error: { code: string; details: { sha: string } } };
    expect(payload.error).toMatchObject({ code: "remote_conflict", details: { sha: "d".repeat(40) } });
  });

  it("requires same-origin JSON and valid CSRF for every write", async () => {
    const csrf = await seedSession();
    const crossSite = await api("/api/v1/owner/ai/organize", {
      method: "POST", headers: { Cookie: SESSION_COOKIE, Origin: "https://evil.example", "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ input: "receive" })
    });
    expect(crossSite.status).toBe(403);
    const missingCsrf = await api("/api/v1/owner/ai/organize", {
      method: "POST", headers: { Cookie: SESSION_COOKIE, Origin: "https://admin.example", "Content-Type": "application/json" }, body: JSON.stringify({ input: "receive" })
    });
    expect(missingCsrf.status).toBe(403);
  });
});
