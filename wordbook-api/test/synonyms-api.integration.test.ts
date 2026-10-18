import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { AppConfig } from "../src/config";
import type { PublicEntry, PublicSnapshot } from "../src/schema";
import { encryptSecret, sha256Hex } from "../src/security";
import { entry, snapshot } from "./fixtures";
import published from "../../vocab/data/owner-wordbook.json";
import { SYNONYM_FEATURE_ENABLED, candidateSynonymFingerprint, entrySynonymFingerprint } from "../../vocab/js/synonym-evidence.js";

const testEnv = env as unknown as Env;
const SESSION_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SESSION_ID = "n".repeat(64);
const COOKIE = `__Host-zhuo_session=${SESSION_ID}`;
const initialSha = "a".repeat(40);
const protocol = { clientProtocol: "v38", queueProtocol: "v38" };
const stub = () => testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
const api = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://admin.example/api/v1${path}`, init), testEnv);
const headers = (csrf: string) => ({ Cookie: COOKIE, Origin: "https://admin.example", "Content-Type": "application/json", "X-CSRF-Token": csrf });

async function session() {
  const hash = await sha256Hex(SESSION_ID);
  await runInDurableObject(stub(), async (instance, state) => {
    (instance as unknown as { config: AppConfig }).config.AI = undefined;
    await state.storage.put(`session:${hash}`, {
      githubTokenCipher: await encryptSecret("github-test-token", SESSION_SECRET), githubTokenExpiresAt: Date.now() + 7_200_000,
      login: "zhuodashuai", userId: 156042078, avatarUrl: "https://avatars.githubusercontent.com/u/156042078?v=4",
      installationId: 99, repositoryId: 1309360291, csrfHashes: [], createdAt: Date.now(),
      absoluteExpiresAt: Date.now() + 3_600_000, lastSeenAt: Date.now(), encryptionKeyVersion: 1
    });
  });
  const response = await api("/session", { headers: { Cookie: COOKIE } });
  expect(response.status).toBe(200);
  return (await response.json() as { csrfToken: string }).csrfToken;
}

async function injectAi(run: ReturnType<typeof vi.fn>) {
  await runInDurableObject(stub(), async (instance) => {
    (instance as unknown as { config: AppConfig }).config.AI = { run } as unknown as Ai;
  });
}

function encode(value: unknown) {
  let binary = "";
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function githubMock(initial: PublicSnapshot = snapshot([])) {
  let current = structuredClone(initial);
  let sha = initialSha;
  let writes = 0;
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname === "/user") return Response.json({ login: "zhuodashuai", id: 156042078, avatar_url: "" });
    if (url.pathname === "/user/installations") return Response.json({ installations: [{ id: 99, account: { id: 156042078 }, permissions: { contents: "write" } }] });
    if (url.pathname === "/user/installations/99/repositories") return Response.json({ repositories: [{ id: 1309360291, full_name: "zhuodashuai/zhuodashuai.github.io" }] });
    if (url.pathname === "/repos/zhuodashuai/zhuodashuai.github.io") return Response.json({ id: 1309360291, full_name: "zhuodashuai/zhuodashuai.github.io", default_branch: "main", fork: false, archived: false, disabled: false, owner: { id: 156042078 }, permissions: { push: true } });
    if (url.pathname.endsWith("/contents/vocab/data/owner-wordbook.json")) {
      if (init.method === "PUT") {
        const body = JSON.parse(String(init.body));
        if (body.sha !== sha) return Response.json({ message: "sha does not match" }, { status: 409 });
        current = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.content), (character) => character.charCodeAt(0))));
        writes += 1;
        sha = writes.toString(16).padStart(40, "0");
        return Response.json({ content: { sha, html_url: "https://github.com/file" }, commit: { sha: "c".repeat(40) } });
      }
      return Response.json({ type: "file", sha, html_url: "https://github.com/file", content: encode(current) });
    }
    throw new Error(`Unexpected request: ${url.href}`);
  });
  vi.stubGlobal("fetch", mock);
  return { mock, state: () => ({ snapshot: current, sha, writes }) };
}

function food(term: string) {
  return entry({ id: `word-${term}`, term, entryType: "word", partOfSpeech: "adjective", meaning: "美味的；很好吃的", definition: "Having a very pleasant taste.",
    forms: [], collocations: [], confusedWith: [], usage: "Used for food.", exampleEn: `This soup is ${term}.`, exampleZh: "这碗汤很好喝。" });
}

function historicalScan(source: PublicEntry, target: PublicEntry, status: "pending" | "complete" = "complete") {
  return {
    version: 1 as const, status, sourceFingerprint: entrySynonymFingerprint(source), candidatesFingerprint: candidateSynonymFingerprint([target]),
    checkedAt: "2026-09-26T12:00:00.000Z", candidateCount: 1,
    matches: status === "complete" ? [{ targetId: target.id, targetFingerprint: entrySynonymFingerprint(target), note: "原有历史记录，暂不展示。" }] : [],
    reason: "历史记录保留"
  };
}

function publish(csrf: string, mutation: unknown, mutationId: string, baseSha = initialSha) {
  return api("/owner/publish", { method: "POST", headers: { ...headers(csrf), "Idempotency-Key": mutationId }, body: JSON.stringify({ ...protocol, baseSha, mutationId, mutation }) });
}

function recognize(csrf: string, entryId: string) {
  return api("/owner/synonyms", { method: "POST", headers: headers(csrf), body: JSON.stringify({ entryId }) });
}

async function nonSessionStorage() {
  return runInDurableObject(stub(), async (_instance, state) => [...await state.storage.list()].filter(([key]) => !key.startsWith("session:")));
}

beforeEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await reset(); });

describe("paused synonym feature at the canonical API boundary", () => {
  it("shares an explicit disabled policy with the frontend", () => {
    expect(SYNONYM_FEATURE_ENABLED).toBe(false);
  });

  it("publishes a new manual word without model calls or invented scan metadata", async () => {
    const csrf = await session();
    const delicious = food("delicious");
    const github = githubMock(snapshot([delicious]));
    const run = vi.fn(async () => ({ matches: [{ targetId: delicious.id, note: "不构成同义关系。" }] }));
    await injectAi(run);
    const response = await publish(csrf, { type: "add", entry: food("yummy") }, "synonym-paused-add-0001");
    expect(response.status).toBe(200);
    const result = await response.json() as { entry: PublicEntry };
    expect(result.entry.term).toBe("yummy");
    expect(result.entry.meaning).toContain("美味");
    expect(Object.hasOwn(result.entry, "synonymScan")).toBe(false);
    expect(github.state().snapshot.entries.find((item) => item.id === delicious.id)).toEqual(delicious);
    expect(github.state().snapshot.entries).toHaveLength(2);
    expect(github.state().writes).toBe(1);
    expect(run).not.toHaveBeenCalled();
    const retry = await publish(csrf, { type: "add", entry: food("yummy") }, "synonym-paused-add-0001");
    expect(await retry.json()).toMatchObject({ action: "idempotent" });
    expect(github.state().writes).toBe(1);
  });

  it("manual publication remains available without any AI binding", async () => {
    const csrf = await session();
    const github = githubMock(snapshot([food("delicious")]));
    const response = await publish(csrf, { type: "add", entry: food("yummy") }, "synonym-paused-no-binding");
    expect(response.status).toBe(200);
    expect(Object.hasOwn((await response.json() as { entry: PublicEntry }).entry, "synonymScan")).toBe(false);
    expect(github.state().writes).toBe(1);
  });

  it.each(["complete", "pending"] as const)("preserves canonical %s metadata exactly when its word is edited", async (status) => {
    const csrf = await session();
    const delicious = food("delicious");
    const source = food("yummy");
    source.synonymScan = historicalScan(source, delicious, status);
    const github = githubMock(snapshot([delicious, source]));
    const run = vi.fn(); await injectAi(run);
    const changed = { ...source, meaning: "令人愉快的", definition: "Pleasant in a non-food setting.", senses: source.senses.map((sense) => ({ ...sense, meaningZh: "令人愉快的", definitionEn: "Pleasant in a non-food setting." })) };
    // An older client may omit metadata. The server preserves canonical history.
    delete changed.synonymScan;
    const response = await publish(csrf, { type: "update", entry: changed, expectedUpdatedAt: source.updatedAt }, `synonym-paused-edit-${status}`);
    expect(response.status).toBe(200);
    const result = await response.json() as { entry: PublicEntry };
    expect(result.entry.meaning).toContain("令人愉快");
    expect(result.entry.synonymScan).toEqual(source.synonymScan);
    expect(github.state().snapshot.entries.find((item) => item.id === delicious.id)).toEqual(delicious);
    expect(github.state().writes).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("strips forged scan evidence from a new word rather than presenting it as reviewed", async () => {
    const csrf = await session();
    const delicious = food("delicious"); const source = food("yummy");
    source.synonymScan = historicalScan(source, delicious);
    const github = githubMock(snapshot([delicious]));
    const run = vi.fn(); await injectAi(run);
    const response = await publish(csrf, { type: "add", entry: source }, "synonym-paused-client-spoof");
    expect(response.status).toBe(200);
    const saved = (await response.json() as { entry: PublicEntry }).entry;
    expect(Object.hasOwn(saved, "synonymScan")).toBe(false);
    expect(github.state().writes).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("a forged edited scan cannot replace the canonical historical record", async () => {
    const csrf = await session();
    const delicious = food("delicious"); const source = food("yummy");
    source.synonymScan = historicalScan(source, delicious);
    const github = githubMock(snapshot([delicious, source]));
    const changed = { ...source, usage: "An owner-edited note.", synonymScan: { ...source.synonymScan, reason: "forged", matches: [] } };
    const response = await publish(csrf, { type: "update", entry: changed, expectedUpdatedAt: source.updatedAt }, "synonym-paused-edit-spoof");
    expect(response.status).toBe(200);
    expect((await response.json() as { entry: PublicEntry }).entry.synonymScan).toEqual(source.synonymScan);
    expect(github.state().writes).toBe(1);
  });

  it("explicit scan returns a paused error without model, quota, cache or GitHub mutation", async () => {
    const csrf = await session();
    const original = structuredClone(published) as PublicSnapshot;
    const github = githubMock(original);
    const run = vi.fn(); await injectAi(run);
    await runInDurableObject(stub(), async (_instance, state) => {
      await state.storage.put("synonym-batch:preserved-history", { matches: [], expiresAt: Date.now() + 60_000 });
    });
    const before = await nonSessionStorage();
    const response = await recognize(csrf, "public-nlmg-c1-pavilion");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "synonym_feature_paused", message: "同义词功能暂时停用，已有单词和学习记录不受影响。" } });
    expect(await nonSessionStorage()).toEqual(before);
    expect(github.state()).toEqual({ snapshot: original, sha: initialSha, writes: 0 });
    expect(github.mock).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("paused scans also do not fetch or mutate when the entry ID is unknown", async () => {
    const csrf = await session(); const github = githubMock(snapshot([]));
    const response = await recognize(csrf, "unknown-entry");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "synonym_feature_paused" } });
    expect(github.mock).not.toHaveBeenCalled();
    expect(github.state().writes).toBe(0);
  });

  it("requires the owner session, same origin and valid CSRF before disclosing pause state", async () => {
    const csrf = await session(); const github = githubMock(snapshot([food("yummy")]));
    const run = vi.fn(); await injectAi(run);
    for (const requestHeaders of [
      { Origin: "https://admin.example", "Content-Type": "application/json", "X-CSRF-Token": csrf },
      { ...headers(csrf), Origin: "https://evil.example" },
      { ...headers(csrf), "X-CSRF-Token": "invalid-csrf-token-value" }
    ]) {
      const response = await api("/owner/synonyms", { method: "POST", headers: requestHeaders, body: JSON.stringify({ entryId: "word-yummy" }) });
      expect([401, 403]).toContain(response.status);
      expect(await response.json()).not.toMatchObject({ error: { code: "synonym_feature_paused" } });
    }
    expect(run).not.toHaveBeenCalled(); expect(github.mock).not.toHaveBeenCalled();
  });

  it("paused explicit requests do not consume the publish rate-limit bucket", async () => {
    const csrf = await session(); const github = githubMock(snapshot([]));
    for (let index = 0; index < 11; index++) {
      const response = await recognize(csrf, "word-yummy");
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "synonym_feature_paused" } });
    }
    const stored = await nonSessionStorage();
    expect(stored.filter(([key]) => key.startsWith("rate:publish:") || key.startsWith("rate:ai-daily:"))).toEqual([]);
    expect(github.mock).not.toHaveBeenCalled();
  });

  it("deleting a word remains available without triggering optional recognition", async () => {
    const csrf = await session(); const source = food("yummy");
    const github = githubMock(snapshot([food("delicious"), source]));
    const run = vi.fn(); await injectAi(run);
    const response = await publish(csrf, { type: "delete", id: source.id, expectedUpdatedAt: source.updatedAt }, "synonym-paused-delete");
    expect(response.status).toBe(200);
    expect(github.state().snapshot.entries).toHaveLength(1);
    expect(github.state().writes).toBe(1); expect(run).not.toHaveBeenCalled();
  });

  it("publishing a word does not debit the AI daily quota while paused", async () => {
    const csrf = await session(); const github = githubMock(snapshot([food("delicious")]));
    const run = vi.fn(); await injectAi(run);
    const before = (await nonSessionStorage()).filter(([key]) => key.startsWith("rate:ai-daily:") || key.startsWith("synonym-batch:"));
    const response = await publish(csrf, { type: "add", entry: food("yummy") }, "synonym-paused-budget");
    expect(response.status).toBe(200);
    const after = (await nonSessionStorage()).filter(([key]) => key.startsWith("rate:ai-daily:") || key.startsWith("synonym-batch:"));
    expect(after).toEqual(before);
    expect(github.state().writes).toBe(1); expect(run).not.toHaveBeenCalled();
  });
});
