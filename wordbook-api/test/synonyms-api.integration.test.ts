import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { AppConfig } from "../src/config";
import type { PublicEntry, PublicSnapshot } from "../src/schema";
import { encryptSecret, sha256Hex } from "../src/security";
import { entry, snapshot } from "./fixtures";
import published from "../../vocab/data/owner-wordbook.json";
import { candidateSynonymFingerprint, entrySynonymFingerprint } from "../../vocab/js/synonym-evidence.js";

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
    // Inject the Workers binding at the same object boundary production uses.
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

function githubMock(initial: PublicSnapshot = snapshot([]), rejectWrites = false) {
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
        if (rejectWrites || body.sha !== sha) return Response.json({ message: "sha does not match" }, { status: 409 });
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

function publish(csrf: string, mutation: unknown, mutationId: string, baseSha = initialSha) {
  return api("/owner/publish", { method: "POST", headers: { ...headers(csrf), "Idempotency-Key": mutationId }, body: JSON.stringify({ ...protocol, baseSha, mutationId, mutation }) });
}

function recognize(csrf: string, entryId: string) {
  return api("/owner/synonyms", { method: "POST", headers: headers(csrf), body: JSON.stringify({ entryId }) });
}

beforeEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await reset(); });

describe("automatic synonym recognition at the canonical API boundary", () => {
  it("recognizes a manually added word against existing real senses and keeps original vocabulary intact", async () => {
    const csrf = await session();
    const delicious = food("delicious");
    const yummy = food("yummy");
    const github = githubMock(snapshot([delicious]));
    const run = vi.fn(async () => ({ response: { matches: [{ targetId: delicious.id, note: "都表示食物好吃；yummy 更口语。" }] } }));
    await injectAi(run);
    const response = await publish(csrf, { type: "add", entry: yummy }, "synonym-manual-add-0001");
    expect(response.status).toBe(200);
    const result = await response.json() as { entry: PublicEntry };
    expect(run).toHaveBeenCalledOnce();
    const request = run.mock.calls[0] as unknown as [string, { messages: Array<{ content: string }> }];
    const evidence = JSON.parse(request[1].messages[1].content);
    const senseMeaning = (sense: PublicEntry["senses"][number]) => ({ partOfSpeech: sense.partOfSpeech, meaningZh: sense.meaningZh, definitionEn: sense.definitionEn });
    expect(evidence.source).toMatchObject({ id: yummy.id, meaning: result.entry.meaning, senses: result.entry.senses.map(senseMeaning) });
    expect(evidence.candidates).toEqual([expect.objectContaining({ id: delicious.id, meaning: delicious.meaning })]);
    expect(evidence.candidates[0].senses).toMatchObject(delicious.senses.map(senseMeaning));
    expect(result.entry.synonymScan).toMatchObject({ status: "complete", candidateCount: 1, matches: [{ targetId: delicious.id }] });
    expect(result.entry.synonyms).toEqual([]);
    expect(github.state().snapshot.entries.find((item) => item.id === delicious.id)).toEqual(delicious);
    expect(github.state().snapshot.entries).toHaveLength(2);
    expect(result.entry.meaning).toContain("美味的");
    expect(result.entry.id).toBe(yummy.id);
    const retry = await publish(csrf, { type: "add", entry: yummy }, "synonym-manual-add-0001");
    expect(await retry.json()).toMatchObject({ action: "idempotent" });
    expect(run).toHaveBeenCalledOnce();
    expect(github.state().writes).toBe(1);
  });

  it("saves manual vocabulary with an explicit pending state when the AI binding is unavailable", async () => {
    const csrf = await session();
    const github = githubMock(snapshot([food("delicious")]));
    const response = await publish(csrf, { type: "add", entry: food("yummy") }, "synonym-no-binding-0001");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entry: { synonymScan: { status: "pending", matches: [] } } });
    expect(github.state().snapshot.entries).toHaveLength(2);
  });

  it("rechecks manually edited meanings instead of retaining the previous automatic relation", async () => {
    const csrf = await session();
    const delicious = food("delicious");
    const source = food("yummy");
    const github = githubMock(snapshot([delicious]));
    const run = vi.fn()
      .mockResolvedValueOnce({ response: { matches: [{ targetId: delicious.id, note: "都表示食物美味；yummy 更口语。" }] } })
      .mockResolvedValueOnce({ response: { matches: [] } });
    await injectAi(run);
    expect((await publish(csrf, { type: "add", entry: source }, "synonym-edit-add-0001")).status).toBe(200);
    const saved = github.state().snapshot.entries.find((item) => item.id === source.id)!;
    const changed = { ...saved, meaning: "令人愉快的", definition: "Pleasant in a non-food setting.",
      senses: saved.senses.map((sense) => ({ ...sense, meaningZh: "令人愉快的", definitionEn: "Pleasant in a non-food setting." })) };
    const response = await publish(csrf, { type: "update", entry: changed, expectedUpdatedAt: saved.updatedAt }, "synonym-edit-update-0001", github.state().sha);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entry: { id: source.id, synonymScan: { status: "complete", matches: [] } } });
    expect(run).toHaveBeenCalledTimes(2);
    expect(github.state().snapshot.entries.find((item) => item.id === delicious.id)).toEqual(delicious);
    expect(github.state().snapshot.entries).toHaveLength(2);
  });

  it("keeps publication fail-open when model metadata exceeds the persisted schema limits", async () => {
    const csrf = await session();
    const delicious = food("delicious");
    const github = githubMock(snapshot([delicious]));
    const run = vi.fn(async () => ({ response: { matches: [{ targetId: delicious.id, note: "义".repeat(501) }] } }));
    await injectAi(run);
    const response = await publish(csrf, { type: "add", entry: food("yummy") }, "synonym-invalid-meta-0001");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entry: { synonymScan: { status: "pending", matches: [] } } });
    expect(github.state().writes).toBe(1);
  });

  it("never trusts forged client scan evidence and reuses only the canonical complete scan", async () => {
    const csrf = await session();
    const delicious = food("delicious");
    const source = food("yummy");
    const forged = { version: 1 as const, status: "complete" as const, sourceFingerprint: entrySynonymFingerprint(source), candidatesFingerprint: candidateSynonymFingerprint([delicious]), checkedAt: "2026-09-26T12:00:00.000Z", candidateCount: 1, matches: [{ targetId: delicious.id, targetFingerprint: entrySynonymFingerprint(delicious), note: "伪造关系" }], reason: "" };
    const github = githubMock(snapshot([delicious]));
    const run = vi.fn(async () => ({ response: { matches: [] } }));
    await injectAi(run);
    const response = await publish(csrf, { type: "add", entry: { ...source, synonymScan: forged } }, "synonym-client-spoof-0001");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entry: { synonymScan: { status: "complete", matches: [] } } });
    expect(run).toHaveBeenCalledOnce();
    const retry = await recognize(csrf, source.id);
    expect(await retry.json()).toMatchObject({ action: "idempotent", synonymScan: { status: "complete", matches: [] } });
    expect(run).toHaveBeenCalledOnce();
    expect(github.state().writes).toBe(1);
  });

  it("retries a pending existing entry without changing its lexical body or any other published entry", async () => {
    const csrf = await session();
    const original = structuredClone(published) as PublicSnapshot;
    const source = original.entries[0];
    const github = githubMock(original);
    const run = vi.fn(async () => ({ response: { matches: [] } }));
    await injectAi(run);
    const response = await recognize(csrf, source.id);
    expect(response.status).toBe(200);
    const updated = github.state().snapshot;
    expect(updated.entries).toHaveLength(151);
    expect(updated.entries.filter((item) => item.id !== source.id)).toEqual(original.entries.filter((item) => item.id !== source.id));
    const changed = updated.entries.find((item) => item.id === source.id)!;
    const { synonymScan: _scan, revision: _revision, updatedAt: _updatedAt, ...body } = changed;
    const { synonymScan: _oldScan, revision: _oldRevision, updatedAt: _oldUpdatedAt, ...oldBody } = source;
    expect(body).toEqual(oldBody);
    expect(changed.synonymScan).toMatchObject({ status: "complete", matches: [] });
    expect(run.mock.calls.length).toBeGreaterThan(1);
    expect(github.state().writes).toBe(1);
  });

  it("deletes an entry without starting recognition and rejects later scans of the deleted id", async () => {
    const csrf = await session();
    const source = food("yummy");
    const github = githubMock(snapshot([food("delicious"), source]));
    const run = vi.fn(async () => ({ response: { matches: [] } }));
    await injectAi(run);
    const response = await publish(csrf, { type: "delete", id: source.id, expectedUpdatedAt: source.updatedAt }, "synonym-delete-0001");
    expect(response.status).toBe(200);
    expect(run).not.toHaveBeenCalled();
    expect(github.state().snapshot.entries).toHaveLength(1);
    const retry = await recognize(csrf, source.id);
    expect(retry.status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it("requires the owner session, same origin and valid CSRF before scanning", async () => {
    const csrf = await session();
    const github = githubMock(snapshot([food("yummy")]));
    const run = vi.fn(async () => ({ response: { matches: [] } }));
    await injectAi(run);
    for (const requestHeaders of [
      { Origin: "https://admin.example", "Content-Type": "application/json", "X-CSRF-Token": csrf },
      { ...headers(csrf), Origin: "https://evil.example" },
      { ...headers(csrf), "X-CSRF-Token": "invalid-csrf-token-value" }
    ]) {
      const response = await api("/owner/synonyms", { method: "POST", headers: requestHeaders, body: JSON.stringify({ entryId: "word-yummy" }) });
      expect([401, 403]).toContain(response.status);
    }
    expect(run).not.toHaveBeenCalled();
    expect(github.mock).not.toHaveBeenCalled();
  });

  it("does not overwrite a concurrent canonical edit when the scan result is ready", async () => {
    const csrf = await session();
    const original = snapshot([food("delicious"), food("yummy")]);
    const github = githubMock(original, true);
    const run = vi.fn(async () => ({ response: { matches: [] } }));
    await injectAi(run);
    const response = await recognize(csrf, "word-yummy");
    expect(response.status).toBe(409);
    expect(github.state().snapshot).toEqual(original);
    expect(github.state().writes).toBe(0);
  });

  it("charges scans to the existing daily budget and still publishes after the budget is exhausted", async () => {
    const csrf = await session();
    const github = githubMock(snapshot([food("delicious")]));
    const run = vi.fn(async () => ({ response: { matches: [] } }));
    await injectAi(run);
    for (let index = 0; index < 20; index += 1) {
      const response = await stub().fetch("https://owner.internal/rate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "zhuo-owner-account", kind: "ai-daily" }) });
      expect(response.status).toBe(200);
    }
    const response = await publish(csrf, { type: "add", entry: food("yummy") }, "synonym-budget-0001");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entry: { synonymScan: { status: "pending", matches: [] } } });
    expect(run).not.toHaveBeenCalled();
    expect(github.state().writes).toBe(1);
  });
});
