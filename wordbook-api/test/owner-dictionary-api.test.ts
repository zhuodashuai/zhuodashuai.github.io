import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, expect, it, vi } from "vitest";
import worker from "../src/index";
import { encryptSecret, sha256Hex } from "../src/security";
import { entry, snapshot } from "./fixtures";
import type { PublicSnapshot } from "../src/schema";

const testEnv = env as unknown as Env;
const raw = "d".repeat(64), cookie = `__Host-zhuo_session=${raw}`;
const secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const origin = "https://admin.example";
const route = "/api/v1/owner/dictionary-collection";
const id = () => crypto.randomUUID();
const api = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`${origin}${path}`, init), testEnv);
const encode = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));
const decode = (value: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), x => x.charCodeAt(0))));

async function session() {
  const hash = await sha256Hex(raw);
  const stub = testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put(`session:${hash}`, {
      githubTokenCipher: await encryptSecret("github-dictionary-test-token", secret),
      githubTokenExpiresAt: Date.now() + 7_200_000, absoluteExpiresAt: Date.now() + 3_600_000,
      login: "zhuodashuai", userId: 156042078, installationId: 99, repositoryId: 1309360291,
      avatarUrl: "", csrfHashes: [], createdAt: Date.now(), lastSeenAt: Date.now(), encryptionKeyVersion: 1
    });
  });
  const response = await api("/api/v1/session", { headers: { Cookie: cookie } });
  return (await response.json() as { csrfToken: string }).csrfToken;
}

function github(initial: PublicSnapshot = snapshot([]), loseFirstResponse = false) {
  let current = structuredClone(initial), sha = "a".repeat(40), writes = 0;
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "api.github.com") throw Error(`Unexpected provider: ${url.hostname}`);
    if (url.pathname === "/user") return Response.json({ login: "zhuodashuai", id: 156042078 });
    if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 99, account: { id: 156042078 }, permissions: { contents: "write" } }] });
    if (url.pathname === "/user/installations/99/repositories") return Response.json({ repositories: [{ id: 1309360291 }] });
    if (url.pathname === "/repos/zhuodashuai/zhuodashuai.github.io") return Response.json({ id: 1309360291, full_name: "zhuodashuai/zhuodashuai.github.io", default_branch: "main", fork: false, archived: false, disabled: false, owner: { id: 156042078 }, permissions: { push: true } });
    if (url.pathname.endsWith("/contents/vocab/data/owner-wordbook.json")) {
      if (init.method === "PUT") {
        const body = JSON.parse(String(init.body));
        if (body.sha !== sha) return Response.json({ message: "Conflict" }, { status: 409 });
        current = decode(body.content); writes++; sha = String(writes + 10).padStart(40, "b");
        if (loseFirstResponse && writes === 1) throw Error("Lost response after a committed write");
        return Response.json({ content: { sha, html_url: "https://github.com/test" }, commit: { sha: "c".repeat(40) } });
      }
      return Response.json({ type: "file", sha, content: encode(current), html_url: "https://github.com/test" });
    }
    throw Error(`Unexpected GitHub path: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", mock);
  return { mock, state: () => ({ current, writes, sha }) };
}

function collect(term: string, csrf: string, mutationId = id(), extra = {}) {
  return api(route, { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-CSRF-Token": csrf, "Idempotency-Key": mutationId }, body: JSON.stringify({ term, mutationId, ...extra }) });
}

beforeEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await reset(); });

it("requires owner cookie, same origin and CSRF before resolving or publishing a word", async () => {
  const mock = github(), mutationId = id();
  const anonymous = await api(route, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": mutationId }, body: JSON.stringify({ term: "abacus", mutationId }) });
  expect(anonymous.status).toBe(401);
  const csrf = await session();
  expect((await collect("abacus", "invalid")).status).toBe(403);
  expect((await api(route, { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.example", "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: "{}" })).status).toBe(403);
  expect(mock.state().writes).toBe(0);
});

it("only trusts the shipped exact dictionary term, retains source, and never invents enrichment", async () => {
  const csrf = await session(), remote = github();
  expect((await collect("abacus", csrf, id(), { meaning: "wrong" })).status).toBe(400);
  expect((await collect("zzqnonexistentword123", csrf)).status).toBe(422);
  const result = await collect("abacus", csrf);
  expect(result.status).toBe(200);
  const body = await result.json() as { entry: { term: string; meaning: string; sourceTitle: string; sourceUrl: string; organizationMethod: string; definition: string; exampleEn: string; senses: unknown[] }; added: boolean };
  expect(body.added).toBe(true); expect(body.entry.term).toBe("abacus");
  expect(body.entry.meaning).toMatch(/算盘/u); expect(body.entry.organizationMethod).toBe("local-dictionary");
  expect(body.entry.sourceTitle).toMatch(/ECDICT/); expect(body.entry.sourceUrl).toBe("https://github.com/skywind3000/ECDICT");
  expect(body.entry.definition).toBe(""); expect(body.entry.exampleEn).toBe(""); expect(body.entry.senses).toEqual([]);
  expect(remote.state().writes).toBe(1); expect(remote.state().current.entries).toHaveLength(1);
  expect(remote.mock.mock.calls.every(([input]) => String(input).includes("api.github.com"))).toBe(true);
});

it("concurrent repeated lookups serialize into one canonical card; existing content is not overwritten", async () => {
  const csrf = await session(), remote = github();
  const results = await Promise.all([collect("abacus", csrf), collect("abacus", csrf)]);
  expect(results.map(x => x.status)).toEqual([200, 200]);
  expect((await Promise.all(results.map(x => x.json()))).map(x => (x as { added: boolean }).added).sort()).toEqual([false, true]);
  expect(remote.state().writes).toBe(1); expect(remote.state().current.entries).toHaveLength(1);
  const previous = structuredClone(remote.state().current.entries[0]);
  expect((await collect("ABACUS", csrf)).status).toBe(200);
  expect(remote.state().current.entries[0]).toEqual(previous);
});

it("existing curated public entries take precedence and require no dictionary replacement", async () => {
  const csrf = await session(), original = entry({ term: "hip", id: "public-hip", meaning: "保留我核对过的髋部释义" });
  const remote = github(snapshot([original]));
  const response = await collect("hip", csrf);
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ added: false, entry: original });
  expect(remote.state().writes).toBe(0);
});

it("a lost publish response can be retried with the same id without duplicate cards", async () => {
  const csrf = await session(), remote = github(snapshot([]), true), mutationId = id();
  const first = await collect("abacus", csrf, mutationId);
  expect([200, 502]).toContain(first.status);
  expect((await collect("abacus", csrf, mutationId)).status).toBe(200);
  expect(remote.state().writes).toBe(1); expect(remote.state().current.entries).toHaveLength(1);
  expect((await collect("football", csrf, mutationId)).status).toBe(409);
});
