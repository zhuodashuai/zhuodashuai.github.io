import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { MemberAuth, MEMBER_ACCOUNT_LIMIT } from "../src/member-auth";
import { PersonalWordbook, PERSONAL_LIMITS, type PersonalEntry } from "../src/personal-wordbook";
import { MEMBER_COOKIE, MEMBER_SESSION_SECONDS, MEMBER_REMEMBER_SESSION_SECONDS, memberAuthStub, memberSessionHash, type MemberEnv } from "../src/member-security";

const testEnv = env as unknown as Env;
const ORIGIN = "https://members.example";
const PREFIX = "/api/v1/member";
const PASSWORD = "a private long password 😀";
interface Login { user: { id: string; username: string }; csrfToken: string; expiresAt: number; recoveryCode: string; cookie: string }

function api(path: string, { method = "GET", body, auth, headers = {}, environment = testEnv, legacy = false }: {
  method?: string; body?: unknown; auth?: Login; headers?: Record<string, string>; environment?: Env; legacy?: boolean
} = {}) {
  return worker.fetch(new Request(`${ORIGIN}${path.startsWith("/api/") ? path : PREFIX + path}`, {
    method, headers: { ...(!legacy ? { "X-Wordbook-Fields": "partOfSpeech" } : {}), ...(method !== "GET" ? { Origin: ORIGIN, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" } : {}),
      ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  }), environment);
}
async function register(username = "alice_test", headers: Record<string, string> = {}): Promise<Login> {
  const response = await api("/register", { method: "POST", body: { username, password: PASSWORD }, headers });
  expect(response.status).toBe(200);
  const data = await response.json() as Login;
  return { ...data, cookie: response.headers.get("Set-Cookie")!.split(";", 1)[0] };
}
async function create(auth: Login, term = "by some fluke", mutationId = crypto.randomUUID()) {
  return api("/entries", { method: "POST", auth, body: { term, meaning: "由于某种偶然", note: "自己的阅读笔记", mutationId } });
}
function vault(auth: Login) { return testEnv.PERSONAL_WORDBOOK.get(testEnv.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`)); }
const errorCode = async (response: Response) => (await response.json() as { error: { code: string } }).error.code;

describe("private member API and tenant isolation", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await reset(); });

  it("remembers a member for an absolute 30 days only when explicitly selected, without sliding on reads", async () => {
    const response = await api("/register", { method: "POST", body: { username: "remember_member", password: PASSWORD, remember: true } });
    expect(response.status).toBe(200);
    const data = await response.json() as Login;
    const cookie = response.headers.get("set-cookie")!;
    const seconds = Number(cookie.match(/Max-Age=(\d+)/)![1]);
    expect(seconds).toBeGreaterThan(MEMBER_REMEMBER_SESSION_SECONDS - 10);
    expect(seconds).toBeLessThanOrEqual(MEMBER_REMEMBER_SESSION_SECONDS);
    expect(cookie).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(data.expiresAt - Date.now()).toBeGreaterThan((MEMBER_REMEMBER_SESSION_SECONDS - 10) * 1000);
    const auth = { ...data, cookie: cookie.split(";", 1)[0] };
    expect(await (await api("/session", { auth })).json()).toMatchObject({ authenticated: true, expiresAt: data.expiresAt });
    const shorter = await api("/login", { method: "POST", body: { username: data.user.username, password: PASSWORD, remember: false } });
    expect((await shorter.json() as Login).expiresAt - Date.now()).toBeLessThanOrEqual(MEMBER_SESSION_SECONDS * 1000);
    const logout = await api("/logout", { method: "POST", auth, body: {} });
    expect(logout.status).toBe(200);
    expect(await (await api("/session", { auth })).json()).toEqual({ authenticated: false });
  });

  it("rejects untyped remember choices before issuing member credentials", async () => {
    for (const remember of ["true", 1, null, {}, []]) {
      const response = await api("/register", { method: "POST", body: { username: "bad_remember", password: PASSWORD, remember } });
      expect(response.status).toBe(400); expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("registers a unique lowercase account and keeps raw session/password/recovery out of storage", async () => {
    const auth = await register("Alice_Test");
    expect(auth.user.username).toBe("alice_test");
    expect(auth.user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(auth.csrfToken).toHaveLength(43); expect(auth.recoveryCode).toHaveLength(43);
    const cookieValue = auth.cookie.split("=", 2)[1];
    const rows = await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => Object.fromEntries(await state.storage.list()));
    const serialized = JSON.stringify(rows);
    for (const secret of [cookieValue, PASSWORD, auth.recoveryCode, auth.csrfToken]) expect(serialized).not.toContain(secret);
    expect(serialized).toContain("scrypt-hmac-sha256");
    const duplicate = await api("/register", { method: "POST", body: { username: "ALICE_TEST", password: PASSWORD } });
    expect(duplicate.status).toBe(409); expect(await errorCode(duplicate)).toBe("username_unavailable");
    const session = await api("/session", { auth });
    expect(await session.json()).toMatchObject({ authenticated: true, user: auth.user, expiresAt: auth.expiresAt });
  });

  it("serializes simultaneous claims of the same username without creating two accounts", async () => {
    const replies = await Promise.all([api("/register", { method: "POST", body: { username: "racer", password: PASSWORD } }), api("/register", { method: "POST", body: { username: "RACER", password: PASSWORD } })]);
    expect(replies.map(r => r.status).sort()).toEqual([200, 409]);
    const count = await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => state.storage.get("account-count"));
    expect(count).toBe(1);
  });

  it("guards sign-up flag and transaction-backed account capacity while existing logins work", async () => {
    await register();
    const disabledEnv = { ...testEnv, MEMBER_SIGNUP_ENABLED: "false" } as unknown as Env;
    const disabled = await api("/register", { method: "POST", body: { username: "new_user", password: PASSWORD }, environment: disabledEnv });
    expect(disabled.status).toBe(503); expect(await errorCode(disabled)).toBe("member_signup_disabled");
    const login = await api("/login", { method: "POST", body: { username: "ALICE_TEST", password: PASSWORD }, environment: disabledEnv });
    expect(login.status).toBe(200);
    await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => { await state.storage.put("account-count", MEMBER_ACCOUNT_LIMIT); });
    const full = await api("/register", { method: "POST", body: { username: "capacity_test", password: PASSWORD } });
    expect(full.status).toBe(503); expect(await errorCode(full)).toBe("member_signup_limit");
  });

  it("cannot forge owner/tenant identities and never grants member cookies owner privileges", async () => {
    const auth = await register();
    for (const field of ["id", "userId", "role", "owner", "scope"]) {
      const forged = await api("/entries", { method: "POST", auth, body: { term: "hello", mutationId: crypto.randomUUID(), [field]: "zhuodashuai" } });
      expect(forged.status).toBe(400);
    }
    for (const path of ["/api/v1/owner/publish", "/api/v1/owner/ai/organize", "/api/v1/owner/synonyms"]) {
      const denied = await api(path, { method: "POST", auth, body: {} });
      expect(denied.status).toBe(401);
    }
    const ownerRead = await api("/api/v1/owner/wordbook", { auth });
    expect(ownerRead.status).toBe(401);
    const ownerCookie = await api("/entries", { headers: { Cookie: `__Host-zhuo_session=${"x".repeat(64)}` } });
    expect(ownerCookie.status).toBe(401);
  });

  it("isolates A and B even for identical terms, known IDs and mutation IDs", async () => {
    const a = await register("alice_test"), b = await register("bob_test");
    const idempotency = crypto.randomUUID();
    const savedA = await (await create(a, "hip", idempotency)).json() as { entry: { id: string; revision: number } };
    const savedB = await (await create(b, "hip", idempotency)).json() as { entry: { id: string; revision: number } };
    expect(savedA.entry.id).not.toBe(savedB.entry.id);
    const foreignEdit = await api(`/entries/${savedA.entry.id}`, { method: "PUT", auth: b, body: { revision: 1, term: "stolen", mutationId: crypto.randomUUID() } });
    expect(foreignEdit.status).toBe(404);
    const foreignDelete = await api(`/entries/${savedA.entry.id}`, { method: "DELETE", auth: b, body: { revision: 1, mutationId: crypto.randomUUID() } });
    expect(foreignDelete.status).toBe(404);
    const aList = await (await api("/entries", { auth: a })).json() as { entries: { id: string }[] };
    expect(aList.entries.map(e => e.id)).toEqual([savedA.entry.id]);
    const bList = await (await api("/entries", { auth: b })).json() as { entries: { id: string }[] };
    expect(bList.entries.map(e => e.id)).toEqual([savedB.entry.id]);
    const hash = await memberSessionHash(a.cookie.split("=", 2)[1]);
    const forgedInternal = await vault(b).fetch("https://member.internal/entries", { method: "POST", body: JSON.stringify({ userId: a.user.id, sessionHash: hash }) });
    expect(forgedInternal.status).toBe(403);
  });

  it("checks the expected identity on reads without letting its header select another tenant", async () => {
    const a = await register("alice_test"), b = await register("bob_test");
    await create(a, "alpha private word"); await create(b, "beta private word");
    const staleTab = await api("/entries", { auth: b, headers: { "X-Member-User": a.user.id } });
    expect(staleTab.status).toBe(401);
    expect(await errorCode(staleTab)).toBe("member_session_changed");
    expect(staleTab.headers.get("Set-Cookie")).toBeNull();
    const own = await api("/entries", { auth: a, headers: { "X-Member-User": a.user.id } });
    expect(own.status).toBe(200);
    expect((await own.json() as { entries: { term: string }[] }).entries.map(entry => entry.term)).toEqual(["alpha private word"]);
    for (const expected of ["", "zhuodashuai", crypto.randomUUID()]) {
      const forged = await api("/entries", { auth: a, headers: { "X-Member-User": expected } });
      expect(forged.status).toBe(401); expect(await errorCode(forged)).toBe("member_session_changed");
    }
    const forgedBody = await api("/entries", { method: "POST", auth: a, body: { term: "bad tenant", userId: b.user.id, mutationId: crypto.randomUUID() } });
    expect(forgedBody.status).toBe(400); expect(await errorCode(forgedBody)).toBe("invalid_fields");
    // The other account's actual session remains valid and sees only its rows.
    const actual = await api("/entries", { auth: b, headers: { "X-Member-User": b.user.id } });
    expect(actual.status).toBe(200);
    expect((await actual.json() as { entries: { term: string }[] }).entries.map(entry => entry.term)).toEqual(["beta private word"]);
  });

  it("enforces same-origin JSON and session-bound CSRF for every private write", async () => {
    const a = await register("alice_test"), b = await register("bob_test");
    const body = { term: "hello", mutationId: crypto.randomUUID() };
    const badHeaders: Record<string, string>[] = [{ Origin: "https://evil.example" }, { Origin: "null" }, { "Content-Type": "text/plain" }, { "Sec-Fetch-Site": "cross-site" }, { "X-CSRF-Token": "" }, { "X-CSRF-Token": b.csrfToken }];
    for (const headers of badHeaders) {
      const denied = await api("/entries", { method: "POST", auth: a, body, headers });
      expect([403, 415]).toContain(denied.status);
    }
    const guest = await api("/entries", { method: "POST", body }); expect(guest.status).toBe(401);
    const preflight = await api("/entries", { method: "OPTIONS", headers: { Origin: "https://zhuodashuai.github.io", "Access-Control-Request-Method": "POST" } });
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("stores HTML-looking notes as plain text and performs no GitHub or AI requests", async () => {
    const auth = await register();
    const outbound = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("No outbound provider allowed"); });
    const text = "<img src=x onerror=alert(1)> & <script>bad()</script>";
    const saved = await api("/entries", { method: "POST", auth, body: { term: "by some fluke", meaning: text, note: text, mutationId: crypto.randomUUID() } });
    expect(saved.status).toBe(200);
    const payload = await saved.json() as { entry: { meaning: string; note: string } };
    expect(payload.entry.meaning).toBe(text); expect(payload.entry.note).toBe(text);
    const entries = await api("/entries", { auth });
    expect(entries.headers.get("Cache-Control")).toBe("no-store");
    expect(entries.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(entries.headers.get("Content-Type")).toContain("application/json");
    expect(outbound).not.toHaveBeenCalled();
    expect((await entries.text())).toContain("<script>bad()</script>");
  });

  it("normalizes repeated inputs and preserves the first card instead of silently updating", async () => {
    const auth = await register();
    const first = await (await create(auth, "hip")).json() as { entry: { id: string } };
    for (const term of ["HIP", "ＨＩＰ", "“hip”", "hip,"]) {
      const response = await create(auth, term); expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "duplicate_entry", details: { existing: { id: first.entry.id, term: "hip" } } } });
    }
    expect((await (await api("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it("lets a new member save and reread exact 24/7 without admitting other numeric or unsafe terms", async () => {
    const auth = await register("numeric_reader");
    expect((await (await api("/entries", { auth })).json() as { entries: unknown[] }).entries).toEqual([]);
    const body = { term: "24/7", partOfSpeech: "adverb; adjective", meaning: "全天候；一天二十四小时、一周七天持续地", note: "词典中的数字表达", mutationId: crypto.randomUUID() };
    const saved = await api("/entries", { method: "POST", auth, body });
    expect(saved.status).toBe(200);
    const first = await saved.json() as { entry: PersonalEntry };
    expect(first.entry).toMatchObject({ term: "24/7", normalized: "24/7", meaning: body.meaning, partOfSpeech: body.partOfSpeech });
    const reread = await api("/entries", { auth });
    expect(await reread.json()).toMatchObject({ entries: [{ id: first.entry.id, term: "24/7", meaning: body.meaning }] });
    for (const term of ["24/7", " 24/7 ", "２４/７"]) {
      const duplicate = await api("/entries", { method: "POST", auth, body: { ...body, term, mutationId: crypto.randomUUID() } });
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({ error: { code: "duplicate_entry", details: { existing: { id: first.entry.id } } } });
    }
    const updated = await api(`/entries/${first.entry.id}`, { method: "PUT", auth,
      body: { ...body, revision: first.entry.revision, note: "仍然只有这一张卡", mutationId: crypto.randomUUID() } });
    expect(updated.status).toBe(200);
    for (const term of ["123", "24", "24 / 7", "24/7!", "24/7\u202e", "24/7\u0000", "24/7<script>bad()</script>", `${" ".repeat(201)}24/7`]) {
      const rejected = await api("/entries", { method: "POST", auth, body: { ...body, term, mutationId: crypto.randomUUID() } });
      expect(rejected.status, JSON.stringify(term)).toBe(400);
    }
    expect((await (await api("/entries", { auth })).json() as { entries: PersonalEntry[] }).entries).toHaveLength(1);
  });

  it("uses optimistic card versions and idempotency without resurrecting deleted entries", async () => {
    const auth = await register(), mutationId = crypto.randomUUID();
    const one = await (await create(auth, "agitated", mutationId)).json() as { entry: { id: string; revision: number }; revision: number };
    const replay = await (await create(auth, "agitated", mutationId)).json();
    expect(replay).toMatchObject({ entry: one.entry, action: "idempotent", revision: one.revision });
    const changedKey = await create(auth, "different", mutationId); expect(changedKey.status).toBe(409); expect(await errorCode(changedKey)).toBe("idempotency_key_reused");
    const update = { revision: 1, term: "agitated", meaning: "焦躁不安的", note: "新笔记", mutationId: crypto.randomUUID() };
    const changed = await api(`/entries/${one.entry.id}`, { method: "PUT", auth, body: update }); expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ entry: { revision: 2, meaning: "焦躁不安的" }, revision: 2 });
    const stale = await api(`/entries/${one.entry.id}`, { method: "PUT", auth, body: { ...update, meaning: "旧设备修改", mutationId: crypto.randomUUID() } });
    expect(stale.status).toBe(409); expect(await errorCode(stale)).toBe("revision_conflict");
    const deletion = { revision: 2, mutationId: crypto.randomUUID() };
    const removed = await api(`/entries/${one.entry.id}`, { method: "DELETE", auth, body: deletion }); expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ entry: null, action: "deleted", revision: 3 });
    expect(await (await api(`/entries/${one.entry.id}`, { method: "DELETE", auth, body: deletion })).json()).toMatchObject({ entry: null, action: "idempotent", revision: 3 });
    expect(await (await create(auth, "agitated", mutationId)).json()).toMatchObject({ entry: null, action: "idempotent", revision: 3 });
    expect((await (await api("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(0);
  });

  it("persists local-dictionary word classes, preserves them for old-client updates, and allows explicit clearing", async () => {
    const auth = await register();
    const saved = await api("/entries", { method: "POST", auth, body: { term: "delicious", partOfSpeech: "adjective", meaning: "美味的", note: "来自本地词典", mutationId: crypto.randomUUID() } });
    expect(saved.status).toBe(200);
    const first = (await saved.json() as { entry: PersonalEntry }).entry;
    expect(first.partOfSpeech).toBe("adjective");
    const legacyUpdate = await api(`/entries/${first.id}`, { method: "PUT", auth, body: { revision: 1, term: "delicious", meaning: "① 美味的", note: "旧设备只改备注", mutationId: crypto.randomUUID() } });
    expect(legacyUpdate.status).toBe(200);
    expect(await legacyUpdate.json()).toMatchObject({ entry: { partOfSpeech: "adjective", revision: 2, note: "旧设备只改备注" } });
    const clear = await api(`/entries/${first.id}`, { method: "PUT", auth, body: { revision: 2, term: "delicious", partOfSpeech: "", meaning: "① 美味的", mutationId: crypto.randomUUID() } });
    expect(clear.status).toBe(200); expect(await clear.json()).toMatchObject({ entry: { partOfSpeech: "", revision: 3 } });
    const oldClientAgain = await api(`/entries/${first.id}`, { method: "PUT", auth, body: { revision: 3, term: "delicious", meaning: "美味的", mutationId: crypto.randomUUID() } });
    expect(oldClientAgain.status).toBe(200);
    expect(await (await api("/entries", { auth })).json()).toMatchObject({ entries: [{ partOfSpeech: "", revision: 4 }] });
  });

  it("keeps old eight-field entries compatible and distinguishes word-class changes in mutation fingerprints", async () => {
    const auth = await register();
    const old = await create(auth, "hip");
    const legacy = (await old.json() as { entry: PersonalEntry }).entry;
    expect(Object.keys(legacy)).toHaveLength(8); expect(legacy).not.toHaveProperty("partOfSpeech");
    const oldUpdate = await api(`/entries/${legacy.id}`, { method: "PUT", auth, body: { revision: legacy.revision, term: "hip", meaning: "髋部", mutationId: crypto.randomUUID() } });
    expect((await oldUpdate.json() as { entry: unknown }).entry).not.toHaveProperty("partOfSpeech");

    const body = { term: "calm", partOfSpeech: "adjective", meaning: "平静的", mutationId: crypto.randomUUID() };
    const initial = await api("/entries", { method: "POST", auth, body }); expect(initial.status).toBe(200);
    const entry = (await initial.json() as { entry: PersonalEntry }).entry;
    expect((await api("/entries", { method: "POST", auth, body })).status).toBe(200);
    const changedCreate = await api("/entries", { method: "POST", auth, body: { ...body, partOfSpeech: "verb" } });
    expect(changedCreate.status).toBe(409); expect(await errorCode(changedCreate)).toBe("idempotency_key_reused");
    const edit = { term: "calm", partOfSpeech: "verb", meaning: "使平静", revision: 1, mutationId: crypto.randomUUID() };
    expect((await api(`/entries/${entry.id}`, { method: "PUT", auth, body: edit })).status).toBe(200);
    expect((await api(`/entries/${entry.id}`, { method: "PUT", auth, body: edit })).status).toBe(200);
    const changedUpdate = await api(`/entries/${entry.id}`, { method: "PUT", auth, body: { ...edit, partOfSpeech: "noun" } });
    expect(changedUpdate.status).toBe(409); expect(await errorCode(changedUpdate)).toBe("idempotency_key_reused");
    const omittedUpdate = await api(`/entries/${entry.id}`, { method: "PUT", auth, body: { term: "calm", meaning: edit.meaning, revision: edit.revision, mutationId: edit.mutationId } });
    expect(omittedUpdate.status).toBe(409);
    expect(await (await api("/entries", { auth })).json()).toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ id: entry.id, partOfSpeech: "verb", revision: 2 })]) });
  });

  it("validates word classes by Unicode code points and rejects malformed content without changing saved cards", async () => {
    const auth = await register();
    const saved = await api("/entries", { method: "POST", auth, body: { term: "safe", partOfSpeech: "🙂".repeat(200), mutationId: crypto.randomUUID() } });
    expect(saved.status).toBe(200);
    const first = (await saved.json() as { entry: PersonalEntry }).entry;
    for (const partOfSpeech of [null, 123, {}, ["noun"], "🙂".repeat(201), "noun\u202E", "noun\u0000"]) {
      const rejectedCreate = await api("/entries", { method: "POST", auth, body: { term: "invalid", partOfSpeech, mutationId: crypto.randomUUID() } });
      expect(rejectedCreate.status).toBe(400);
      const rejectedUpdate = await api(`/entries/${first.id}`, { method: "PUT", auth, body: { revision: 1, term: "safe", partOfSpeech, mutationId: crypto.randomUUID() } });
      expect(rejectedUpdate.status).toBe(400);
    }
    expect(await (await api("/entries", { auth })).json()).toMatchObject({ revision: 1, entries: [first] });
  });

  it("negotiates the new word-class DTO without breaking legacy read, create, update or mutation replay", async () => {
    const auth = await register();
    const body = { term: "calm", partOfSpeech: "adjective", meaning: "平静的", note: "自己的笔记", mutationId: crypto.randomUUID() };
    const first = await api("/entries", { method: "POST", auth, body, legacy: true }); expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store"); expect(first.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const projected = await first.json() as { entry: PersonalEntry; revision: number };
    expect(projected.entry).not.toHaveProperty("partOfSpeech"); expect(Object.keys(projected.entry)).toHaveLength(8);
    const modernReplay = await api("/entries", { method: "POST", auth, body }); expect(modernReplay.status).toBe(200);
    const full = await modernReplay.json() as { entry: PersonalEntry; revision: number };
    expect(full).toMatchObject({ entry: { id: projected.entry.id, partOfSpeech: "adjective" }, action: "idempotent", revision: projected.revision });
    const oldRead = await api("/entries", { auth, legacy: true }); expect(oldRead.status).toBe(200);
    expect(await oldRead.json()).toMatchObject({ entries: [projected.entry] });
    const edit = { term: "calm", meaning: "① 平静的", note: "老客户端只改笔记", revision: 1, mutationId: crypto.randomUUID() };
    const oldUpdate = await api(`/entries/${full.entry.id}`, { method: "PUT", auth, body: edit, legacy: true }); expect(oldUpdate.status).toBe(200);
    const oldEdited = await oldUpdate.json() as { entry: PersonalEntry };
    expect(oldEdited.entry).not.toHaveProperty("partOfSpeech"); expect(oldEdited.entry.note).toBe(edit.note);
    const newReplay = await api(`/entries/${full.entry.id}`, { method: "PUT", auth, body: edit }); expect(newReplay.status).toBe(200);
    expect(await newReplay.json()).toMatchObject({ entry: { partOfSpeech: "adjective", revision: 2, note: edit.note }, action: "idempotent" });
    expect(await (await api("/entries", { auth })).json()).toMatchObject({ entries: [{ partOfSpeech: "adjective", revision: 2 }] });
    const stored = await runInDurableObject(vault(auth), async (_instance, state) => state.storage.get<PersonalEntry>(`entry:${full.entry.id}`));
    expect(stored?.partOfSpeech).toBe("adjective");
    const oldPost = await create(auth, "old client card"); expect(oldPost.status).toBe(200);
    const oldPayload = { term: "old legacy card", meaning: "旧页新增", mutationId: crypto.randomUUID() };
    const legacyPost = await api("/entries", { method: "POST", auth, body: oldPayload, legacy: true }); expect(legacyPost.status).toBe(200);
    expect((await legacyPost.json() as { entry: PersonalEntry }).entry).not.toHaveProperty("partOfSpeech");
    expect(await (await api("/entries", { method: "POST", auth, body: oldPayload })).json()).toMatchObject({ action: "idempotent" });
  });

  it("projects private conflict DTOs but preserves auth cookies, errors, no-store and rate-limit headers for legacy clients", async () => {
    const registration = await api("/register", { method: "POST", body: { username: "legacy_reader", password: PASSWORD }, legacy: true });
    expect(registration.status).toBe(200); expect(registration.headers.get("Set-Cookie")).toContain(`${MEMBER_COOKIE}=`);
    expect(registration.headers.get("Cache-Control")).toBe("no-store"); expect(registration.headers.get("Content-Type")).toContain("application/json");
    const auth = { ...await registration.json() as Login, cookie: registration.headers.get("Set-Cookie")!.split(";", 1)[0] };
    const createBody = { term: "hip", partOfSpeech: "noun", meaning: "髋部", mutationId: crypto.randomUUID() };
    const saved = (await (await api("/entries", { method: "POST", auth, body: createBody })).json() as { entry: PersonalEntry }).entry;
    for (const legacy of [true, false]) {
      const duplicate = await api("/entries", { method: "POST", auth, legacy, body: { ...createBody, mutationId: crypto.randomUUID() } });
      expect(duplicate.status).toBe(409); expect(duplicate.headers.get("Cache-Control")).toBe("no-store");
      const existing = (await duplicate.json() as { error: { code: string; details: { existing: PersonalEntry } } }).error;
      expect(existing.code).toBe("duplicate_entry"); expect(existing.details.existing.id).toBe(saved.id);
      expect(Object.prototype.hasOwnProperty.call(existing.details.existing, "partOfSpeech")).toBe(!legacy);
      const conflict = await api(`/entries/${saved.id}`, { method: "PUT", auth, legacy, body: { term: "hip", revision: 99, mutationId: crypto.randomUUID() } });
      expect(conflict.status).toBe(409);
      const error = (await conflict.json() as { error: { code: string; details: { existing: PersonalEntry } } }).error;
      expect(error.code).toBe("revision_conflict"); expect(error.details.existing.meaning).toBe(saved.meaning);
      expect(Object.prototype.hasOwnProperty.call(error.details.existing, "partOfSpeech")).toBe(!legacy);
    }
    await runInDurableObject(vault(auth), async (_instance, state) => state.storage.put("write-rate", { count: 60, expiresAt: Date.now() + 60_000 }));
    const limited = await api("/entries", { method: "POST", auth, legacy: true, body: { term: "limited", mutationId: crypto.randomUUID() } });
    expect(limited.status).toBe(429); expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    const logout = await api("/logout", { method: "POST", auth, legacy: true, body: {} }); expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    const denied = await api("/entries", { auth, legacy: true }); expect(denied.status).toBe(401); expect(await errorCode(denied)).toBe("member_authentication_required");
  });

  it("persists records through re-created DO class instances", async () => {
    const auth = await register(); await create(auth);
    const sessionHash = await memberSessionHash(auth.cookie.split("=", 2)[1]);
    const result = await runInDurableObject(vault(auth), async (_instance, state) => {
      const recreated = new PersonalWordbook(state, testEnv);
      return recreated.fetch(new Request("https://member.internal/entries", { method: "POST", body: JSON.stringify({ userId: auth.user.id, sessionHash }) })).then(r => r.json());
    });
    expect(result).toMatchObject({ revision: 1, entries: [{ term: "by some fluke" }] });
    const session = await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => {
      const recreated = new MemberAuth(state, testEnv);
      return recreated.fetch(new Request("https://member.internal/session/assert", { method: "POST", body: JSON.stringify({ sessionHash }) })).then(r => r.json());
    });
    expect(session).toMatchObject({ authenticated: true, user: auth.user });
  });

  it("revokes logout server-side and never accepts a session token as CSRF or vice versa", async () => {
    const auth = await register();
    const tokenAsCsrf = await create({ ...auth, csrfToken: auth.cookie.split("=", 2)[1] }); expect(tokenAsCsrf.status).toBe(403);
    const logout = await api("/logout", { method: "POST", auth, body: {} }); expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await (await api("/session", { auth })).json()).toEqual({ authenticated: false });
    expect((await create(auth)).status).toBe(401);
  });

  it("resets with a one-use recovery code, rotates it, revokes every old session, and preserves cards", async () => {
    const auth = await register(); await create(auth);
    const second = await api("/login", { method: "POST", body: { username: auth.user.username, password: PASSWORD } });
    const another = { ...await second.json() as Login, cookie: second.headers.get("Set-Cookie")!.split(";", 1)[0] };
    const newPassword = "new private password 😀";
    const recovered = await api("/password/reset", { method: "POST", body: { username: auth.user.username, recoveryCode: auth.recoveryCode, newPassword } });
    expect(recovered.status).toBe(200);
    const recoveredData = await recovered.json() as { ok: boolean; recoveryCode: string };
    expect(recoveredData.ok).toBe(true); expect(recoveredData.recoveryCode).not.toBe(auth.recoveryCode);
    expect((await create(auth)).status).toBe(401); expect((await create(another)).status).toBe(401);
    const reused = await api("/password/reset", { method: "POST", body: { username: auth.user.username, recoveryCode: auth.recoveryCode, newPassword } }); expect(reused.status).toBe(401);
    const oldLogin = await api("/login", { method: "POST", body: { username: auth.user.username, password: PASSWORD } }); expect(oldLogin.status).toBe(401);
    const fresh = await api("/login", { method: "POST", body: { username: auth.user.username, password: newPassword } }); expect(fresh.status).toBe(200);
    const login = { ...await fresh.json() as Login, cookie: fresh.headers.get("Set-Cookie")!.split(";", 1)[0] };
    expect((await (await api("/entries", { auth: login })).json() as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it("rejects expired/forged tokens and limits logins before doing unlimited password work", async () => {
    const auth = await register();
    const sessionHash = await memberSessionHash(auth.cookie.split("=", 2)[1]);
    await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => {
      const record = await state.storage.get<Record<string, unknown>>(`session:${sessionHash}`);
      await state.storage.put(`session:${sessionHash}`, { ...record, expiresAt: Date.now() - 1 });
    });
    expect((await create(auth)).status).toBe(401);
    const forged = { ...auth, cookie: `${MEMBER_COOKIE}=${"a".repeat(64)}` };
    expect((await create(forged)).status).toBe(401);
    for (let attempt = 0; attempt < 10; attempt++) expect((await api("/login", { method: "POST", body: { username: "unknown_name", password: PASSWORD } })).status).toBe(401);
    const limited = await api("/login", { method: "POST", body: { username: "unknown_name", password: PASSWORD } });
    expect(limited.status).toBe(429); expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("enforces entry, byte, field, and mutation bounds without partial writes", async () => {
    const auth = await register();
    for (const body of [{ term: "a".repeat(201), mutationId: crypto.randomUUID() }, { term: "word", meaning: "字".repeat(2001), mutationId: crypto.randomUUID() }, { term: "word", note: "x".repeat(1001), mutationId: crypto.randomUUID() }, { term: "word", mutationId: "not-a-uuid" }, { term: "word", meaning: "bad\u202Eword", mutationId: crypto.randomUUID() }]) {
      expect((await api("/entries", { method: "POST", auth, body })).status).toBe(400);
    }
    await runInDurableObject(vault(auth), async (_instance, state) => { await state.storage.put("meta", { revision: 0, count: 1000, entryBytes: 0, ledgerBytes: 0, ledgerCount: 0 }); });
    const countLimit = await create(auth); expect(countLimit.status).toBe(413); expect(await errorCode(countLimit)).toBe("personal_entry_limit");
    await runInDurableObject(vault(auth), async (_instance, state) => { await state.storage.put("meta", { revision: 0, count: 0, entryBytes: PERSONAL_LIMITS.bytes, ledgerBytes: 0, ledgerCount: 0 }); });
    const byteLimit = await create(auth); expect(byteLimit.status).toBe(413); expect(await errorCode(byteLimit)).toBe("personal_storage_limit");
    expect((await (await api("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(0);
  });

  it("deletes only the current account, revokes sessions first, and leaves a non-resurrecting vault tombstone", async () => {
    const a = await register("alice_test"), b = await register("bob_test");
    await create(a, "private alpha"); await create(b, "private beta");
    const wrong = await api("/account", { method: "DELETE", auth: a, body: { password: "a wrong long password", confirmation: "DELETE" } }); expect(wrong.status).toBe(401);
    const noConfirm = await api("/account", { method: "DELETE", auth: a, body: { password: PASSWORD, confirmation: "delete" } }); expect(noConfirm.status).toBe(400);
    const removed = await api("/account", { method: "DELETE", auth: a, body: { password: PASSWORD, confirmation: "DELETE" } }); expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
    expect((await create(a)).status).toBe(401);
    expect((await api("/login", { method: "POST", body: { username: a.user.username, password: PASSWORD } })).status).toBe(401);
    expect((await (await api("/entries", { auth: b })).json() as { entries: { term: string }[] }).entries[0].term).toBe("private beta");
    const stored = await runInDurableObject(vault(a), async (_instance, state) => [...(await state.storage.list()).keys()]); expect(stored).toEqual(["deleted"]);
    const authRecords = await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => ({ count: await state.storage.get("account-count"), user: await state.storage.get(`user:${a.user.id}`), jobs: [...(await state.storage.list({ prefix: "deletion:" })).keys()] }));
    expect(authRecords).toEqual({ count: 1, user: { status: "deleted" }, jobs: [] });
    // A new registration can reuse a released username but never its old UID/vault.
    const replacement = await register("alice_test"); expect(replacement.user.id).not.toBe(a.user.id);
    expect((await (await api("/entries", { auth: replacement })).json() as { entries: unknown[] }).entries).toHaveLength(0);
  });

  it("keeps a durable deletion job after a vault outage and retries without resurrecting the account", async () => {
    const auth = await register(); await create(auth);
    const sessionHash = await memberSessionHash(auth.cookie.split("=", 2)[1]);
    const pending = await runInDurableObject(memberAuthStub(testEnv), async (instance, state) => {
      const control = instance as { env: MemberEnv; fetch(request: Request): Promise<Response> };
      const original = control.env;
      control.env = { ...original, PERSONAL_WORDBOOK: {
        idFromName: original.PERSONAL_WORDBOOK.idFromName.bind(original.PERSONAL_WORDBOOK),
        get: () => ({ fetch: async () => { throw new Error("simulated private vault outage"); } })
      } as unknown as DurableObjectNamespace };
      try {
        const result = await control.fetch(new Request("https://member.internal/account/delete", { method: "POST", body: JSON.stringify({ sessionHash, csrfToken: auth.csrfToken, password: PASSWORD, confirmation: "DELETE" }) }));
        return { status: result.status, body: await result.json(), jobs: (await state.storage.list({ prefix: "deletion:" })).size,
          account: await state.storage.get<{ status: string }>(`account:${auth.user.username}`), sessions: (await state.storage.list({ prefix: "session:" })).size };
      } finally { control.env = original; }
    });
    expect(pending).toMatchObject({ status: 202, body: { ok: true, deletionPending: true }, jobs: 1, account: { status: "deleting" }, sessions: 0 });
    expect((await create(auth)).status).toBe(401);
    expect((await api("/login", { method: "POST", body: { username: auth.user.username, password: PASSWORD } })).status).toBe(401);
    await runInDurableObject(memberAuthStub(testEnv), async (instance) => { await (instance as { alarm(): Promise<void> }).alarm(); });
    const cleaned = await runInDurableObject(vault(auth), async (_instance, state) => [...(await state.storage.list()).keys()]);
    expect(cleaned).toEqual(["deleted"]);
    const records = await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => ({ jobs: (await state.storage.list({ prefix: "deletion:" })).size, account: await state.storage.get(`account:${auth.user.username}`), count: await state.storage.get("account-count") }));
    expect(records).toEqual({ jobs: 0, account: undefined, count: 0 });
  });

  it("bounds successful and rejected writes without losing the existing cards", async () => {
    const auth = await register(); await create(auth, "existing word");
    await runInDurableObject(vault(auth), async (_instance, state) => { await state.storage.put("write-rate", { count: 60, expiresAt: Date.now() + 60_000 }); });
    const response = await create(auth, "another word"); expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect((await (await api("/entries", { auth })).json() as { entries: { term: string }[] }).entries.map(e => e.term)).toEqual(["existing word"]);
  });

  it("evicts the oldest bounded idempotency record and accounts for an expired reused key exactly once", async () => {
    const auth = await register();
    const existingMutation = crypto.randomUUID();
    const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
    await runInDurableObject(vault(auth), async (_instance, state) => {
      let bytes = 0;
      for (let index = 0; index < 512; index++) {
        const id = index === 511 ? existingMutation : crypto.randomUUID();
        const expiresAt = Date.now() + 60_000 + index;
        const key = `mutation:${id}`;
        const record = { fingerprint: "old", entryId: `member-${crypto.randomUUID()}`, action: "create", expiresAt };
        bytes += size(record);
        await state.storage.put({ [key]: record, [`mutation-expiry:${String(expiresAt).padStart(13, "0")}:${id}`]: { key } });
      }
      await state.storage.put("meta", { revision: 0, count: 0, entryBytes: 0, ledgerBytes: bytes, ledgerCount: 512 });
    });
    expect((await create(auth, "first new word")).status).toBe(200);
    const count = await runInDurableObject(vault(auth), async (_instance, state) => ({ meta: await state.storage.get<{ ledgerCount: number; ledgerBytes: number }>("meta"), records: [...(await state.storage.list({ prefix: "mutation:" })).values()] }));
    expect(count.records).toHaveLength(512); expect(count.meta?.ledgerCount).toBe(512);
    expect(count.meta?.ledgerBytes).toBe(count.records.reduce<number>((sum, row) => sum + size(row), 0));
    await runInDurableObject(vault(auth), async (_instance, state) => {
      const key = `mutation:${existingMutation}`;
      const old = await state.storage.get<{ expiresAt: number }>(key);
      await state.storage.delete(`mutation-expiry:${String(old!.expiresAt).padStart(13, "0")}:${existingMutation}`);
      const expired = { ...old, expiresAt: Date.now() - 1 };
      const meta = await state.storage.get<{ ledgerBytes: number }>("meta");
      await state.storage.put({ [key]: expired, [`mutation-expiry:${String(expired.expiresAt).padStart(13, "0")}:${existingMutation}`]: { key }, meta: { ...meta, ledgerBytes: meta!.ledgerBytes - size(old) + size(expired) } });
    });
    expect((await create(auth, "second new word", existingMutation)).status).toBe(200);
    const after = await runInDurableObject(vault(auth), async (_instance, state) => ({ meta: await state.storage.get<{ ledgerCount: number; ledgerBytes: number }>("meta"), records: [...(await state.storage.list({ prefix: "mutation:" })).values()] }));
    expect(after.records).toHaveLength(512); expect(after.meta?.ledgerCount).toBe(512);
    expect(after.meta?.ledgerBytes).toBe(after.records.reduce<number>((sum, row) => sum + size(row), 0));
  });

  it("accepts only one concurrent update based on the same card revision", async () => {
    const auth = await register();
    const first = await (await create(auth)).json() as { entry: { id: string } };
    const replies = await Promise.all(["first device", "second device"].map(note => api(`/entries/${first.entry.id}`, {
      method: "PUT", auth, body: { revision: 1, term: "by some fluke", note, mutationId: crypto.randomUUID() }
    })));
    expect(replies.map(reply => reply.status).sort()).toEqual([200, 409]);
    const list = await (await api("/entries", { auth })).json() as { revision: number; entries: { revision: number }[] };
    expect(list.revision).toBe(2); expect(list.entries[0].revision).toBe(2);
  });

  it("bounds active sessions to ten and evicts the oldest session on the next successful login", async () => {
    const original = await register();
    let latest: Login = original;
    for (let i = 0; i < 10; i++) {
      const response = await api("/login", { method: "POST", body: { username: original.user.username, password: PASSWORD } });
      expect(response.status).toBe(200);
      latest = { ...await response.json() as Login, cookie: response.headers.get("Set-Cookie")!.split(";", 1)[0] };
    }
    expect((await api("/entries", { auth: original })).status).toBe(401);
    expect((await api("/entries", { auth: latest })).status).toBe(200);
    const counts = await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => ({ sessions: (await state.storage.list({ prefix: "session:" })).size,
      indexes: (await state.storage.list({ prefix: `user-session:${original.user.id}:` })).size }));
    expect(counts).toEqual({ sessions: 10, indexes: 10 });
  });
});
