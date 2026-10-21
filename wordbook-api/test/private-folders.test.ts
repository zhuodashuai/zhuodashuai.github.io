import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMemberRequest } from "../src/member-api";
import { PersonalWordbook, type PersonalEntry } from "../src/personal-wordbook";
import { FOLDER_LIMITS, type PrivateFolder } from "../src/private-folders";
import { PRIVATE_OWNER_ID, memberSessionHash } from "../src/member-security";
import { encryptSecret, sha256Hex } from "../src/security";
import { entry, snapshot } from "./fixtures";

const testEnv = env as unknown as Env;
const ORIGIN = "https://private.example";
const PASSWORD = "a long private password 😀";
type Auth = { user: { id: string; username: string }; cookie: string; csrfToken: string; authType?: string };
type FolderResult = { folder: PrivateFolder; revision: number; action: string };
const uuid = () => crypto.randomUUID();
const vault = (auth: Auth) => testEnv.PERSONAL_WORDBOOK.get(testEnv.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

async function api(path: string, { method = "GET", body, auth, headers = {}, legacy = false }: {
  method?: string; body?: unknown; auth?: Auth; headers?: Record<string, string>; legacy?: boolean
} = {}) {
  return (await handleMemberRequest(new Request(`${ORIGIN}/api/v1/member${path}`, { method,
    headers: { ...(!legacy ? { "X-Wordbook-Fields": "partOfSpeech" } : {}),
      ...(method !== "GET" ? { Origin: ORIGIN, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" } : {}),
      ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken, "X-Member-User": auth.user.id,
        ...(auth.authType ? { "X-Wordbook-Auth": auth.authType } : {}) } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), testEnv,
  { readPublicSnapshot: async () => snapshot([entry()]) }))!;
}
async function register(username = "folder_reader"): Promise<Auth> {
  const response = await api("/register", { method: "POST", body: { username, password: PASSWORD } });
  expect(response.status).toBe(200);
  return { ...await response.json() as Auth, cookie: response.headers.get("Set-Cookie")!.split(";", 1)[0] };
}
async function createEntry(auth: Auth, term = "calm", mutationId = uuid()) {
  const response = await api("/entries", { method: "POST", auth, body: { term, partOfSpeech: "adjective", meaning: "平静的", note: "旧笔记", mutationId } });
  expect(response.status).toBe(200);
  return (await response.json() as { entry: PersonalEntry }).entry;
}
async function createFolder(auth: Auth, name = "Reading", mutationId = uuid()): Promise<FolderResult> {
  const response = await api("/folders", { method: "POST", auth, body: { name, mutationId } });
  expect(response.status).toBe(200);
  return response.json() as Promise<FolderResult>;
}
async function membership(auth: Auth, folder: PrivateFolder, entryIds: string[], mode = "add", mutationId = uuid()) {
  return api(`/folders/${folder.id}/entries`, { method: "POST", auth, body: { entryIds, mode, revision: folder.revision, mutationId } });
}
const folders = async (auth: Auth) => (await (await api("/folders", { auth })).json()) as { revision: number; folders: PrivateFolder[] };
const code = async (response: Response) => (await response.json() as { error: { code: string } }).error.code;

describe("tenant-local private folders without entry or learning schema changes", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await reset(); });

  it("starts empty, persists the exact folder DTO, and never grants caching or CORS", async () => {
    const auth = await register();
    expect(await folders(auth)).toEqual({ revision: 0, folders: [] });
    const created = await createFolder(auth, "  Ｒｅａｄｉｎｇ  ");
    expect(created).toMatchObject({ revision: 1, action: "created", folder: { name: "Reading", entryIds: [], revision: 1 } });
    expect(created.folder.id).toMatch(/^folder-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Object.keys(created.folder).sort()).toEqual(["createdAt", "entryIds", "id", "name", "revision", "updatedAt"]);
    const response = await api("/folders", { auth });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(await response.json()).toEqual({ revision: 1, folders: [created.folder] });
    const sessionHash = await memberSessionHash(auth.cookie.split("=", 2)[1]);
    const recreated = await runInDurableObject(vault(auth), async (_instance, state) => {
      return new PersonalWordbook(state, testEnv).fetch(new Request("https://member.internal/folders", {
        method: "POST", body: JSON.stringify({ userId: auth.user.id, sessionHash })
      })).then(r => r.json());
    });
    expect(recreated).toEqual({ revision: 1, folders: [created.folder] });
  });

  it("rejects NFKC/trim/case duplicates on create and rename while allowing case-only rename of the same folder", async () => {
    const auth = await register(); const first = await createFolder(auth);
    for (const name of ["reading", " Ｒｅａｄｉｎｇ ", "Reading"]) {
      const duplicate = await api("/folders", { method: "POST", auth, body: { name, mutationId: uuid() } });
      expect(duplicate.status).toBe(409); expect(await code(duplicate)).toBe("duplicate_folder");
    }
    const second = await createFolder(auth, "Exam");
    const duplicate = await api(`/folders/${second.folder.id}`, { method: "PUT", auth, body: { name: "reading", revision: 1, mutationId: uuid() } });
    expect(duplicate.status).toBe(409);
    const renamed = await api(`/folders/${first.folder.id}`, { method: "PUT", auth, body: { name: "READING", revision: 1, mutationId: uuid() } });
    expect(renamed.status).toBe(200); expect(await renamed.json()).toMatchObject({ folder: { name: "READING", revision: 2 }, revision: 3 });
    expect((await folders(auth)).folders).toHaveLength(2);
  });

  it("bounds names by normalized Unicode code points and rejects controls, invalid Unicode and extra identity fields", async () => {
    const auth = await register();
    expect((await createFolder(auth, "🙂".repeat(40))).folder.name).toHaveLength(80);
    for (const name of ["", "  ", "🙂".repeat(41), "㍿".repeat(11), "line\nbreak", "tab\tname", "bad\u202e", "bad\u0000", "bad\ud800", null, 17, {}]) {
      const response = await api("/folders", { method: "POST", auth, body: { name, mutationId: uuid() } });
      expect(response.status, JSON.stringify(name)).toBe(400);
    }
    for (const field of ["userId", "owner", "entryIds", "createdAt", "revision", "id"]) {
      const response = await api("/folders", { method: "POST", auth, body: { name: "Safe", mutationId: uuid(), [field]: "forged" } });
      expect(response.status).toBe(400); expect(await code(response)).toBe("invalid_fields");
    }
    expect((await folders(auth)).folders).toHaveLength(1);
  });

  it("requires session-bound CSRF and same-origin JSON for create, rename, delete and membership writes", async () => {
    const a = await register(), b = await register("folder_other");
    const { folder } = await createFolder(a); const entry = await createEntry(a);
    const operations = [
      { path: "/folders", method: "POST", body: { name: "Unsafe", mutationId: uuid() } },
      { path: `/folders/${folder.id}`, method: "PUT", body: { name: "Unsafe", revision: 1, mutationId: uuid() } },
      { path: `/folders/${folder.id}`, method: "DELETE", body: { revision: 1, mutationId: uuid() } },
      { path: `/folders/${folder.id}/entries`, method: "POST", body: { entryIds: [entry.id], mode: "add", revision: 1, mutationId: uuid() } }
    ];
    const badHeaders: Record<string, string>[] = [{ Origin: "https://evil.example" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" },
      { "Content-Type": "text/plain" }, { "X-CSRF-Token": "" }, { "X-CSRF-Token": b.csrfToken }];
    for (const operation of operations) {
      for (const headers of badHeaders) {
        expect([403, 415]).toContain((await api(operation.path, { ...operation, auth: a, headers })).status);
      }
      expect((await api(operation.path, operation)).status).toBe(401);
    }
    expect((await api("/folders")).status).toBe(401);
    const preflight = await api("/folders", { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await folders(a)).folders).toEqual([folder]);
  });

  it("checks expected UID on reads and every write without letting it select a tenant", async () => {
    const a = await register(), b = await register("folder_other"); const { folder } = await createFolder(a);
    const entry = await createEntry(a);
    const operations = [
      { path: "/folders", method: "GET" },
      { path: "/folders", method: "POST", body: { name: "Private", mutationId: uuid() } },
      { path: `/folders/${folder.id}`, method: "PUT", body: { name: "Changed", revision: 1, mutationId: uuid() } },
      { path: `/folders/${folder.id}`, method: "DELETE", body: { revision: 1, mutationId: uuid() } },
      { path: `/folders/${folder.id}/entries`, method: "POST", body: { entryIds: [entry.id], mode: "add", revision: 1, mutationId: uuid() } }
    ];
    for (const operation of operations) {
      const response = await api(operation.path, { ...operation, auth: a, headers: { "X-Member-User": b.user.id } });
      expect(response.status).toBe(401); expect(await code(response)).toBe("member_session_changed");
    }
    expect((await folders(a)).folders).toEqual([folder]); expect(await folders(b)).toEqual({ revision: 0, folders: [] });
  });

  it("isolates known foreign folder/entry IDs, scopes mutation IDs to each tenant, and rolls back mixed batches", async () => {
    const a = await register(), b = await register("folder_other"); const mutationId = uuid();
    const fa = await createFolder(a, "Same", mutationId), fb = await createFolder(b, "Same", mutationId);
    const ea = await createEntry(a), eb = await createEntry(b);
    expect(fa.folder.id).not.toBe(fb.folder.id);
    for (const method of ["PUT", "DELETE"]) {
      const response = await api(`/folders/${fa.folder.id}`, { method, auth: b,
        body: { revision: 1, mutationId: uuid(), ...(method === "PUT" ? { name: "stolen" } : {}) } });
      expect(response.status).toBe(404); expect(await response.json()).not.toHaveProperty("error.details");
    }
    const foreignFolder = await membership(b, fa.folder, [eb.id]); expect(foreignFolder.status).toBe(404);
    for (const mode of ["add", "remove"]) {
      const response = await membership(b, fb.folder, [eb.id, ea.id], mode);
      expect(response.status).toBe(404); expect(await code(response)).toBe("entry_missing");
    }
    expect((await folders(b)).folders[0]).toEqual(fb.folder);
    const sessionHash = await memberSessionHash(a.cookie.split("=", 2)[1]);
    const forged = await vault(b).fetch("https://member.internal/folders", { method: "POST", body: JSON.stringify({ userId: a.user.id, sessionHash }) });
    expect(forged.status).toBe(403);
    const mismatched = await vault(b).fetch("https://member.internal/folders", { method: "POST", body: JSON.stringify({ userId: b.user.id, sessionHash }) });
    expect(mismatched.status).toBe(403);
  });

  it("shares one entry and learning record across multiple folders without changing either DTO or revision", async () => {
    const auth = await register(); const entry = await createEntry(auth); const first = await createFolder(auth), second = await createFolder(auth, "Exam");
    expect((await api(`/reviews/${entry.id}`, { method: "POST", auth, body: { rating: "good", revision: 0, mutationId: uuid() } })).status).toBe(200);
    const beforeEntries = await (await api("/entries", { auth })).json(); const beforeLearning = await (await api("/learning", { auth })).json();
    for (const folder of [first.folder, second.folder]) expect((await membership(auth, folder, [entry.id])).status).toBe(200);
    const list = await folders(auth); expect(list.folders.map(f => f.entryIds)).toEqual([[entry.id], [entry.id]]);
    expect(await (await api("/entries", { auth })).json()).toEqual(beforeEntries);
    expect(await (await api("/learning", { auth })).json()).toEqual(beforeLearning);
    expect(Object.keys(entry)).not.toContain("folderId"); expect(Object.keys(entry)).not.toContain("folderIds");
  });

  it("removes only membership and deletes only classification, retaining words and review progress", async () => {
    const auth = await register(); const entry = await createEntry(auth); const initial = await createFolder(auth);
    expect((await api(`/reviews/${entry.id}`, { method: "POST", auth, body: { rating: "good", revision: 0, mutationId: uuid() } })).status).toBe(200);
    const beforeEntries = await (await api("/entries", { auth })).json(); const beforeLearning = await (await api("/learning", { auth })).json();
    const added = await (await membership(auth, initial.folder, [entry.id])).json() as FolderResult;
    const removed = await (await membership(auth, added.folder, [entry.id], "remove")).json() as FolderResult;
    expect(removed.folder.entryIds).toEqual([]);
    const readded = await (await membership(auth, removed.folder, [entry.id])).json() as FolderResult;
    const deletion = { revision: readded.folder.revision, mutationId: uuid() };
    const response = await api(`/folders/${readded.folder.id}`, { method: "DELETE", auth, body: deletion });
    expect(await response.json()).toEqual({ folder: null, revision: 5, action: "deleted" });
    expect(await (await api(`/folders/${readded.folder.id}`, { method: "DELETE", auth, body: deletion })).json()).toEqual({ folder: null, revision: 5, action: "idempotent" });
    expect(await (await api("/entries", { auth })).json()).toEqual(beforeEntries);
    expect(await (await api("/learning", { auth })).json()).toEqual(beforeLearning);
    expect((await createFolder(auth, "reading")).folder.id).not.toBe(initial.folder.id);
  });

  it("uses folder revisions rather than global revisions and reports conflicts without overwriting", async () => {
    const auth = await register(); const { folder } = await createFolder(auth); await createFolder(auth, "Other");
    const body = { name: "Revised", revision: 1, mutationId: uuid() };
    const response = await api(`/folders/${folder.id}`, { method: "PUT", auth, body });
    expect(response.status).toBe(200); const updated = await response.json() as FolderResult;
    expect(updated).toMatchObject({ revision: 3, folder: { revision: 2, name: "Revised" } });
    const stale = await api(`/folders/${folder.id}`, { method: "PUT", auth, body: { ...body, name: "Stale", mutationId: uuid() } });
    expect(stale.status).toBe(409); expect(await stale.json()).toMatchObject({ error: { code: "revision_conflict", details: { existing: updated.folder, revision: 3 } } });
    const del = await api(`/folders/${folder.id}`, { method: "DELETE", auth, body: { revision: 1, mutationId: uuid() } }); expect(del.status).toBe(409);
    expect((await folders(auth)).folders.find(f => f.id === folder.id)).toEqual(updated.folder);
  });

  it("serializes concurrent rename, duplicate-name claims and membership revision conflicts", async () => {
    const auth = await register(); const initial = await createFolder(auth); const entry = await createEntry(auth);
    const renames = await Promise.all(["First", "Second"].map(name => api(`/folders/${initial.folder.id}`, { method: "PUT", auth, body: { name, revision: 1, mutationId: uuid() } })));
    expect(renames.map(r => r.status).sort()).toEqual([200, 409]);
    const claims = await Promise.all(["New Folder", "ＮＥＷ ＦＯＬＤＥＲ"].map(name => api("/folders", { method: "POST", auth, body: { name, mutationId: uuid() } })));
    expect(claims.map(r => r.status).sort()).toEqual([200, 409]);
    const current = (await folders(auth)).folders.find(f => f.id === initial.folder.id)!;
    const changes = await Promise.all([membership(auth, current, [entry.id]), membership(auth, current, [entry.id])]);
    expect(changes.map(r => r.status).sort()).toEqual([200, 409]);
  });

  it("replays current state without resurrecting deleted folders or removed/deleted members", async () => {
    const auth = await register(); const entry = await createEntry(auth); const createId = uuid(); const initial = await createFolder(auth, "Reading", createId);
    const addId = uuid(); const added = await (await membership(auth, initial.folder, [entry.id], "add", addId)).json() as FolderResult;
    const removed = await (await membership(auth, added.folder, [entry.id], "remove")).json() as FolderResult;
    expect(await (await membership(auth, initial.folder, [entry.id], "add", addId)).json()).toEqual({ folder: removed.folder, revision: 3, action: "idempotent" });
    const deletion = await api(`/folders/${removed.folder.id}`, { method: "DELETE", auth, body: { revision: removed.folder.revision, mutationId: uuid() } }); expect(deletion.status).toBe(200);
    expect(await (await api("/folders", { method: "POST", auth, body: { name: "Reading", mutationId: createId } })).json()).toEqual({ folder: null, revision: 4, action: "idempotent" });
    expect(await (await membership(auth, initial.folder, [entry.id], "add", addId)).json()).toEqual({ folder: null, revision: 4, action: "idempotent" });
    const reused = await api("/folders", { method: "POST", auth, body: { name: "Other", mutationId: createId } });
    expect(reused.status).toBe(409); expect(await code(reused)).toBe("idempotency_key_reused");
    expect((await folders(auth)).folders).toEqual([]);
  });

  it("cleans all memberships atomically on entry deletion and rejects stale membership revisions", async () => {
    const auth = await register(); const entry = await createEntry(auth); const a = await createFolder(auth), b = await createFolder(auth, "Exam");
    const id = uuid(); const aa = await (await membership(auth, a.folder, [entry.id], "add", id)).json() as FolderResult;
    const bb = await (await membership(auth, b.folder, [entry.id])).json() as FolderResult;
    const before = await folders(auth);
    const deletion = { revision: entry.revision, mutationId: uuid() };
    expect((await api(`/entries/${entry.id}`, { method: "DELETE", auth, body: deletion })).status).toBe(200);
    const after = await folders(auth);
    expect(after.revision).toBe(before.revision + 1);
    for (const f of after.folders) { expect(f.entryIds).toEqual([]); expect(f.revision).toBe(3); }
    const stale = await membership(auth, aa.folder, [entry.id]); expect(stale.status).toBe(409);
    const replay = await membership(auth, a.folder, [entry.id], "add", id);
    expect(await replay.json()).toMatchObject({ folder: { entryIds: [], revision: 3 }, action: "idempotent" });
    const missing = await membership(auth, after.folders.find(f => f.id === bb.folder.id)!, [entry.id]); expect(missing.status).toBe(404);
    expect((await api(`/entries/${entry.id}`, { method: "DELETE", auth, body: deletion })).status).toBe(200);
    expect(await folders(auth)).toEqual(after);
    const stored = await runInDurableObject(vault(auth), async (_instance, state) => ({ meta: await state.storage.get<{ folderBytes: number }>("folders-meta"), rows: [...(await state.storage.list({ prefix: "folder:" })).values()] }));
    expect(stored.meta?.folderBytes).toBe(stored.rows.reduce<number>((sum, row) => sum + bytes(row), 0));
  });

  it("rejects active cross-type mutation ID reuse in both directions including public selection", async () => {
    const auth = await register(); const folderId = uuid(); const initial = await createFolder(auth, "Reading", folderId);
    const entryId = uuid(); const entry = await createEntry(auth, "calm", entryId); const reviewId = uuid();
    expect((await api(`/reviews/${entry.id}`, { method: "POST", auth, body: { rating: "good", revision: 0, mutationId: reviewId } })).status).toBe(200);
    for (const mutationId of [entryId, reviewId]) {
      const response = await api("/folders", { method: "POST", auth, body: { name: "Other", mutationId } });
      expect(response.status).toBe(409); expect(await code(response)).toBe("idempotency_key_reused");
    }
    const responses = [
      await api("/entries", { method: "POST", auth, body: { term: "new word", mutationId: folderId } }),
      await api(`/entries/${entry.id}`, { method: "PUT", auth, body: { term: "calm", revision: 1, mutationId: folderId } }),
      await api(`/entries/${entry.id}`, { method: "DELETE", auth, body: { revision: 1, mutationId: folderId } }),
      await api(`/reviews/${entry.id}`, { method: "POST", auth, body: { rating: "good", revision: 1, mutationId: folderId } }),
      await api("/selections", { method: "POST", auth, body: { entryIds: ["public-jab-at"], collectionId: "main", chapterId: "all", mutationId: folderId } }),
      await api(`/folders/${initial.folder.id}`, { method: "PUT", auth, body: { name: "Changed", revision: 1, mutationId: folderId } })
    ];
    for (const response of responses) { expect(response.status).toBe(409); expect(await code(response)).toBe("idempotency_key_reused"); }
    expect((await folders(auth)).folders).toEqual([initial.folder]);
  });

  it("strictly validates UUID paths, positive revisions, mutation IDs and bounded unique membership arrays", async () => {
    const auth = await register(); const { folder } = await createFolder(auth); const entry = await createEntry(auth);
    for (const id of ["bad", `folder-${uuid().toUpperCase()}`, `member-${uuid()}`, `${folder.id}/extra`, `${folder.id}/entries/extra`]) {
      const response = await api(`/folders/${id}`, { method: "PUT", auth, body: { name: "Bad", revision: 1, mutationId: uuid() } }); expect([400, 404]).toContain(response.status);
    }
    for (const revision of [0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
      expect((await api(`/folders/${folder.id}`, { method: "DELETE", auth, body: { revision, mutationId: uuid() } })).status).toBe(400);
    }
    for (const mutationId of ["invalid", uuid().toUpperCase(), null, 7]) {
      expect((await api("/folders", { method: "POST", auth, body: { name: "Bad", mutationId } })).status).toBe(400);
    }
    for (const entryIds of [[], [entry.id, entry.id], ["public-jab-at"], [`member-${uuid().toUpperCase()}`], null, Array.from({ length: 101 }, () => `member-${uuid()}`)]) {
      expect((await api(`/folders/${folder.id}/entries`, { method: "POST", auth, body: { revision: 1, mutationId: uuid(), mode: "add", entryIds } })).status).toBe(400);
    }
    expect((await membership(auth, folder, [entry.id], "replace")).status).toBe(400);
    expect((await membership(auth, folder, [`member-${uuid()}`])).status).toBe(404);
    const large = await api("/folders", { method: "POST", auth, body: { name: "x".repeat(17000), mutationId: uuid() } }); expect(large.status).toBe(413);
    expect((await folders(auth)).folders).toEqual([folder]);
  });

  it("accepts exactly 100 existing IDs in a batch, storing sets without duplicating entries", async () => {
    const auth = await register(); const { folder } = await createFolder(auth);
    const ids = Array.from({ length: 100 }, () => `member-${uuid()}`);
    await runInDurableObject(vault(auth), async (_instance, state) => { for (const id of ids) await state.storage.put(`entry:${id}`, { id }); });
    const body = { entryIds: ids, mode: "add", revision: 1, mutationId: uuid() };
    const response = await api(`/folders/${folder.id}/entries`, { method: "POST", auth, body }); expect(response.status).toBe(200);
    const added = await response.json() as FolderResult; expect(added.folder.entryIds).toEqual([...ids].sort());
    const reversedReplay = await api(`/folders/${folder.id}/entries`, { method: "POST", auth, body: { ...body, entryIds: [...ids].reverse() } });
    expect(await reversedReplay.json()).toMatchObject({ folder: added.folder, action: "idempotent" });
    const again = await (await membership(auth, added.folder, ids)).json() as FolderResult;
    expect(again.folder.entryIds).toHaveLength(100);
  });

  it("enforces folder capacity and independent byte limits without changing old entries or learning", async () => {
    const auth = await register(); const entry = await createEntry(auth); const { folder } = await createFolder(auth);
    const entriesBefore = await (await api("/entries", { auth })).json();
    await runInDurableObject(vault(auth), async (_instance, state) => {
      const meta = await state.storage.get<Record<string, unknown>>("folders-meta"); await state.storage.put("folders-meta", { ...meta, count: FOLDER_LIMITS.folders });
    });
    const full = await api("/folders", { method: "POST", auth, body: { name: "Too many", mutationId: uuid() } });
    expect(full.status).toBe(413); expect(await code(full)).toBe("personal_folder_limit");
    await runInDurableObject(vault(auth), async (_instance, state) => {
      const meta = await state.storage.get<Record<string, unknown>>("folders-meta"); await state.storage.put("folders-meta", { ...meta, count: 1, folderBytes: FOLDER_LIMITS.bytes });
    });
    const oversized = await membership(auth, folder, [entry.id]); expect(oversized.status).toBe(413); expect(await code(oversized)).toBe("personal_folder_storage_limit");
    expect((await folders(auth)).folders).toEqual([folder]);
    expect(await (await api("/entries", { auth })).json()).toEqual(entriesBefore);
    expect(await (await api("/learning", { auth })).json()).toEqual({ revision: 0, reviews: [] });
  });

  it("allows exactly fifty real folders, including concurrent-safe capacity enforcement", async () => {
    const auth = await register();
    for (let i = 0; i < 49; i++) await createFolder(auth, `Folder ${i}`);
    const last = await Promise.all(["Final A", "Final B"].map(name => api("/folders", { method: "POST", auth, body: { name, mutationId: uuid() } })));
    expect(last.map(r => r.status).sort()).toEqual([200, 413]);
    expect(await code(last.find(r => r.status === 413)!)).toBe("personal_folder_limit");
    const saved = await folders(auth); expect(saved.folders).toHaveLength(50); expect(saved.revision).toBe(50);
  });

  it("rejects membership beyond one thousand without partially changing the folder", async () => {
    const auth = await register(); const actual = await createEntry(auth); const { folder } = await createFolder(auth);
    const full = { ...folder, entryIds: Array.from({ length: 1000 }, () => `member-${uuid()}`).sort() };
    await runInDurableObject(vault(auth), async (_instance, state) => {
      const meta = await state.storage.get<Record<string, unknown>>("folders-meta");
      await state.storage.put({ [`folder:${full.id}`]: full, "folders-meta": { ...meta, folderBytes: bytes(full) } });
    });
    const response = await membership(auth, full, [actual.id]);
    expect(response.status).toBe(413); expect(await code(response)).toBe("folder_entry_limit");
    expect((await folders(auth)).folders[0]).toEqual(full);
  });

  it("lets expired cross-type IDs lapse but prevents any live counterpart from being replayed across types", async () => {
    const auth = await register(); const oldEntryMutation = uuid(); await createEntry(auth, "calm", oldEntryMutation);
    const created = await createFolder(auth); const expiredFolderId = uuid();
    await runInDurableObject(vault(auth), async (_instance, state) => {
      const key = `mutation:${oldEntryMutation}`; const old = await state.storage.get<{ expiresAt: number }>(key);
      await state.storage.delete(`mutation-expiry:${String(old!.expiresAt).padStart(13, "0")}:${oldEntryMutation}`);
      const record = { ...old, expiresAt: Date.now() - 1 }; const meta = await state.storage.get<{ ledgerBytes: number }>("meta");
      await state.storage.put({ [key]: record, [`mutation-expiry:${String(record.expiresAt).padStart(13, "0")}:${oldEntryMutation}`]: { key }, meta: { ...meta, ledgerBytes: meta!.ledgerBytes - bytes(old) + bytes(record) } });
      // A stale folder record cannot block an independent new entry operation.
      await state.storage.put(`folder-mutation:${expiredFolderId}`, { fingerprint: "expired", folderId: created.folder.id, expiresAt: Date.now() - 1 });
    });
    await createFolder(auth, "After old entry key", oldEntryMutation);
    const entryReplay = await api("/entries", { method: "POST", auth, body: { term: "calm", partOfSpeech: "adjective", meaning: "平静的", note: "旧笔记", mutationId: oldEntryMutation } });
    expect(entryReplay.status).toBe(409); expect(await code(entryReplay)).toBe("idempotency_key_reused");
    await createEntry(auth, "fresh", expiredFolderId);
    const folderReplay = await api("/folders", { method: "POST", auth, body: { name: "Other", mutationId: expiredFolderId } });
    expect(folderReplay.status).toBe(409); expect(await code(folderReplay)).toBe("idempotency_key_reused");
  });

  it("enforces write throttling without altering folders or saved vocabulary", async () => {
    const auth = await register(); const initial = await createFolder(auth); await createEntry(auth);
    const before = await folders(auth);
    await runInDurableObject(vault(auth), async (_instance, state) => state.storage.put("write-rate", { count: 60, expiresAt: Date.now() + 60000 }));
    const limited = await api(`/folders/${initial.folder.id}`, { method: "DELETE", auth, body: { revision: 1, mutationId: uuid() } });
    expect(limited.status).toBe(429); expect(await code(limited)).toBe("member_rate_limited");
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await folders(auth)).toEqual(before);
    expect((await (await api("/entries", { auth })).json() as { entries: PersonalEntry[] }).entries).toHaveLength(1);
  });

  it("bounds and expires only the folder ledger, accounting an expired reused key exactly once", async () => {
    const auth = await register(); const entry = await createEntry(auth); const reused = uuid(); const oldIds: string[] = [];
    const entryMeta = await runInDurableObject(vault(auth), async (_instance, state) => {
      let ledgerBytes = 0;
      for (let i = 0; i < FOLDER_LIMITS.ledger; i++) {
        const id = i === FOLDER_LIMITS.ledger - 1 ? reused : uuid(); oldIds.push(id);
        const expiresAt = Date.now() + 60000 + i; const key = `folder-mutation:${id}`;
        const record = { fingerprint: "old", folderId: `folder-${uuid()}`, expiresAt }; ledgerBytes += bytes(record);
        await state.storage.put({ [key]: record, [`folder-expiry:${String(expiresAt).padStart(13, "0")}:${id}`]: { key } });
      }
      await state.storage.put("folders-meta", { revision: 0, count: 0, folderBytes: 0, ledgerBytes, ledgerCount: FOLDER_LIMITS.ledger });
      return state.storage.get("meta");
    });
    await createFolder(auth);
    let stored = await runInDurableObject(vault(auth), async (_instance, state) => ({ meta: await state.storage.get<{ ledgerBytes: number; ledgerCount: number }>("folders-meta"), records: [...(await state.storage.list({ prefix: "folder-mutation:" })).values()], expired: await state.storage.get(`folder-mutation:${oldIds[0]}`) }));
    expect(stored.records).toHaveLength(128); expect(stored.expired).toBeUndefined();
    expect(stored.meta?.ledgerBytes).toBe(stored.records.reduce<number>((sum, row) => sum + bytes(row), 0));
    await runInDurableObject(vault(auth), async (_instance, state) => {
      const key = `folder-mutation:${reused}`; const previous = await state.storage.get<{ expiresAt: number }>(key);
      await state.storage.delete(`folder-expiry:${String(previous!.expiresAt).padStart(13, "0")}:${reused}`);
      const expired = { ...previous, expiresAt: Date.now() - 1 }; const meta = await state.storage.get<{ ledgerBytes: number }>("folders-meta");
      await state.storage.put({ [key]: expired, [`folder-expiry:${String(expired.expiresAt).padStart(13, "0")}:${reused}`]: { key }, "folders-meta": { ...meta, ledgerBytes: meta!.ledgerBytes - bytes(previous) + bytes(expired) } });
    });
    await createFolder(auth, "After expiry", reused);
    stored = await runInDurableObject(vault(auth), async (_instance, state) => ({ meta: await state.storage.get<{ ledgerBytes: number; ledgerCount: number }>("folders-meta"), records: [...(await state.storage.list({ prefix: "folder-mutation:" })).values()], expired: undefined }));
    expect(stored.records).toHaveLength(128); expect(stored.meta?.ledgerCount).toBe(128);
    expect(stored.meta?.ledgerBytes).toBe(stored.records.reduce<number>((sum, row) => sum + bytes(row), 0));
    expect(await runInDurableObject(vault(auth), async (_instance, state) => state.storage.get("meta"))).toEqual(entryMeta);
    expect((await api(`/reviews/${entry.id}`, { method: "POST", auth, body: { rating: "good", revision: 0, mutationId: reused } })).status).toBe(409);
  });

  it("does not resurrect membership when a formerly valid add operation expires after entry deletion", async () => {
    const auth = await register(); const entry = await createEntry(auth); const initial = await createFolder(auth); const mutationId = uuid();
    expect((await membership(auth, initial.folder, [entry.id], "add", mutationId)).status).toBe(200);
    expect((await api(`/entries/${entry.id}`, { method: "DELETE", auth, body: { revision: 1, mutationId: uuid() } })).status).toBe(200);
    await runInDurableObject(vault(auth), async (_instance, state) => {
      const key = `folder-mutation:${mutationId}`; const old = await state.storage.get<{ expiresAt: number }>(key);
      await state.storage.delete(`folder-expiry:${String(old!.expiresAt).padStart(13, "0")}:${mutationId}`);
      const record = { ...old, expiresAt: Date.now() - 1 }; const meta = await state.storage.get<{ ledgerBytes: number }>("folders-meta");
      await state.storage.put({ [key]: record, [`folder-expiry:${String(record.expiresAt).padStart(13, "0")}:${mutationId}`]: { key }, "folders-meta": { ...meta, ledgerBytes: meta!.ledgerBytes - bytes(old) + bytes(record) } });
    });
    expect((await membership(auth, initial.folder, [entry.id], "add", mutationId)).status).toBe(409);
    const current = (await folders(auth)).folders[0]; expect(current.entryIds).toEqual([]);
    expect((await membership(auth, current, [entry.id], "add", mutationId)).status).toBe(404);
    expect((await folders(auth)).folders[0]).toEqual(current);
  });

  it("preserves folder membership across old-client entry edits without adding folder fields to entries", async () => {
    const auth = await register(); const entry = await createEntry(auth); const initial = await createFolder(auth);
    expect((await membership(auth, initial.folder, [entry.id])).status).toBe(200);
    const before = await folders(auth);
    const response = await api(`/entries/${entry.id}`, { method: "PUT", auth, legacy: true, body: { term: "calm", meaning: "新版释义", note: "旧客户编辑", revision: 1, mutationId: uuid() } });
    expect(response.status).toBe(200); const edited = (await response.json() as { entry: PersonalEntry }).entry;
    expect(edited).not.toHaveProperty("folderId"); expect(edited).not.toHaveProperty("folderIds"); expect(edited).not.toHaveProperty("partOfSpeech");
    expect(await folders(auth)).toEqual(before);
    const stored = (await (await api("/entries", { auth })).json() as { entries: PersonalEntry[] }).entries[0];
    expect(stored).toMatchObject({ id: entry.id, partOfSpeech: "adjective", revision: 2, note: "旧客户编辑" });
    expect(stored).not.toHaveProperty("folderIds");
  });

  it("deletes all folder prefixes with an account while preserving another tenant and leaving only the tombstone", async () => {
    const a = await register(), b = await register("folder_other"); const initial = await createFolder(a); const entry = await createEntry(a);
    expect((await membership(a, initial.folder, [entry.id])).status).toBe(200); const other = await createFolder(b, "Private beta");
    const response = await api("/account", { method: "DELETE", auth: a, body: { password: PASSWORD, confirmation: "DELETE" } });
    expect(response.status).toBe(200);
    expect(await runInDurableObject(vault(a), async (_instance, state) => [...(await state.storage.list()).keys()])).toEqual(["deleted"]);
    expect((await api("/folders", { auth: a })).status).toBe(401);
    expect((await api("/folders", { method: "POST", auth: a, body: { name: "Resurrect", mutationId: uuid() } })).status).toBe(401);
    expect((await folders(b)).folders).toEqual([other.folder]);
  });

  it("keeps the GitHub owner's folders in the fixed private tenant without touching public or member folders", async () => {
    const member = await register(); const ownRaw = "o".repeat(64); const hash = await sha256Hex(ownRaw);
    const ownerStub = testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
    await runInDurableObject(ownerStub, async (_instance, state) => state.storage.put(`session:${hash}`, {
      githubTokenCipher: await encryptSecret("github-test-token-value", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      githubTokenExpiresAt: Date.now() + 7200000, login: "zhuodashuai", userId: 156042078, avatarUrl: "", installationId: 99, repositoryId: 1309360291,
      csrfHashes: [], createdAt: Date.now(), absoluteExpiresAt: Date.now() + 3600000, lastSeenAt: Date.now(), encryptionKeyVersion: 1
    }));
    const cookie = `__Host-zhuo_session=${ownRaw}`;
    const view = await api("/session", { headers: { Cookie: cookie, "X-Wordbook-Auth": "github-owner" } }); expect(view.status).toBe(200);
    const owner = { ...await view.json() as Auth, cookie }; expect(owner.user.id).toBe(PRIVATE_OWNER_ID);
    const result = await createFolder(owner, "Owner private"); const ownEntry = await createEntry(owner);
    expect((await membership(owner, result.folder, [ownEntry.id])).status).toBe(200);
    expect((await folders(member)).folders).toEqual([]);
    const publicFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("external provider must not be called"));
    expect((await api("/folders", { auth: owner })).status).toBe(200);
    expect(publicFetch).not.toHaveBeenCalled();
  });
});
