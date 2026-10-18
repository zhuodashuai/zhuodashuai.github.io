import { env } from "cloudflare:workers";
import { reset, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMemberRequest } from "../src/member-api";
import { PRIVATE_OWNER_ID, memberAuthStub } from "../src/member-security";
import { nextPersonalReview } from "../src/personal-learning";
import { scheduleReview } from "../../vocab/js/review.js";
import { encryptSecret, sha256Hex } from "../src/security";
import { type PersonalEntry } from "../src/personal-wordbook";
import { entry, snapshot } from "./fixtures";

const testEnv = env as unknown as Env;
const ORIGIN = "https://private.example";
const PASSWORD = "a long private password 😀";
const OWNER_RAW = "o".repeat(64);
const BOOK = "never-let-me-go";
type Auth = { user: { id: string; username: string }; cookie: string; csrfToken: string; authType?: string };
function context(number: number, meaning: string) {
  return { membership: `collection:${BOOK}:chapter-${number}`, order: 1, page: number === 3 ? "35" : "155",
    originalInput: number === 3 ? "rummaging" : "rummaging through the music cassettes", entryType: "word" as const,
    partOfSpeech: "verb", meaning, definition: `Definition for chapter ${number}`, usage: `Chapter ${number} local context`,
    register: "neutral", collocations: [], confusedWith: [], forms: [], exampleEn: `She searched the bag in example ${number}.`,
    exampleZh: `第${number}章自拟学习例句。`, sourceTitle: `Never Let Me Go — Chapter ${number}`, sourceWork: "Never Let Me Go", sourceDate: "", attributionNote: "自拟例句" };
}
function publicBook() {
  return snapshot([
    entry({ id: "public-rummage", term: "rummage", entryType: "word", partOfSpeech: "verb", meaning: "原始翻找释义", phonetic: "/ˈrʌmɪdʒ/",
      sourceTitle: "Never Let Me Go — Chapter 3", sourceWork: "Never Let Me Go", tags: [`collection:${BOOK}:chapter-3`, `collection:${BOOK}:chapter-14`],
      readingContexts: [context(3, "① 第三章：在包里翻找。"), context(14, "① 第十四章：翻找音乐磁带。")]}),
    entry({ id: "public-second", term: "loiter", entryType: "word", partOfSpeech: "verb", meaning: "徘徊不走", sourceWork: "Never Let Me Go",
      tags: [`collection:${BOOK}:chapter-3`], readingContexts: [{ ...context(3, "① 徘徊；逗留。"), originalInput: "loitered" }] }),
    entry({ id: "public-main", term: "jab at", tags: [], sourceTitle: "主词本来源", sourceDate: "2026-10-17" })
  ]);
}
async function request(path: string, { method = "GET", body, auth, headers = {}, resolver = async () => publicBook(), legacy = false }: {
  method?: string; body?: unknown; auth?: Auth; headers?: Record<string, string>; resolver?: () => Promise<unknown>; legacy?: boolean
} = {}) {
  return (await handleMemberRequest(new Request(`${ORIGIN}/api/v1/member${path}`, { method,
    headers: { ...(!legacy ? { "X-Wordbook-Fields": "partOfSpeech" } : {}), ...(method !== "GET" ? { Origin: ORIGIN, "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" } : {}),
      ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken, ...(auth.authType ? { "X-Wordbook-Auth": auth.authType } : {}) } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), testEnv, { readPublicSnapshot: resolver }))!;
}
async function register(username = "reader_alpha"): Promise<Auth> {
  const response = await request("/register", { method: "POST", body: { username, password: PASSWORD } }); expect(response.status).toBe(200);
  return { ...await response.json() as Auth, cookie: response.headers.get("Set-Cookie")!.split(";", 1)[0] };
}
async function owner(): Promise<Auth> {
  const hash = await sha256Hex(OWNER_RAW);
  const stub = testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put(`session:${hash}`, { githubTokenCipher: await encryptSecret("github-test-token-value", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      githubTokenExpiresAt: Date.now() + 7_200_000, login: "zhuodashuai", userId: 156042078, avatarUrl: "", installationId: 99, repositoryId: 1309360291,
      csrfHashes: [], createdAt: Date.now(), absoluteExpiresAt: Date.now() + 3_600_000, lastSeenAt: Date.now(), encryptionKeyVersion: 1 });
  });
  const cookie = `__Host-zhuo_session=${OWNER_RAW}`;
  const response = await request("/session", { headers: { Cookie: cookie, "X-Wordbook-Auth": "github-owner" } });
  expect(response.status).toBe(200);
  return { ...await response.json() as Auth, cookie };
}
const selectionBody = (chapterId = "chapter-3", mutationId = crypto.randomUUID(), entryIds = ["public-rummage"]) => ({ entryIds, collectionId: BOOK, chapterId, mutationId });
async function select(auth: Auth, chapter = "chapter-3", mutationId = crypto.randomUUID(), ids = ["public-rummage"]) {
  return request("/selections", { method: "POST", auth, body: selectionBody(chapter, mutationId, ids) });
}
async function grade(auth: Auth, id: string, revision = 0, rating = "good", mutationId = crypto.randomUUID()) {
  return request(`/reviews/${id}`, { method: "POST", auth, body: { rating, revision, mutationId } });
}
const privateVault = (auth: Auth) => testEnv.PERSONAL_WORDBOOK.get(testEnv.PERSONAL_WORDBOOK.idFromName(`user:${auth.user.id}`));

describe("private public-source selection and cloud review", () => {
  beforeEach(async () => { vi.restoreAllMocks(); await reset(); });

  it("copies trusted chapter-local context and never accepts client-supplied source text", async () => {
    const auth = await register();
    const response = await select(auth); expect(response.status).toBe(200);
    const result = await response.json() as { revision: number; added: number; entries: PersonalEntry[] };
    expect(result).toMatchObject({ revision: 1, added: 1, reused: 0, contextAdded: 1 });
    expect(result.entries[0]).toMatchObject({ term: "rummage", partOfSpeech: "verb", meaning: "① 第三章：在包里翻找。", meaningEdited: false,
      sourceContexts: [{ key: "public-rummage:never-let-me-go:chapter-3", page: "35", originalInput: "rummaging", definition: "Definition for chapter 3", phonetic: "/ˈrʌmɪdʒ/" }] });
    const forged = await request("/selections", { method: "POST", auth, body: { ...selectionBody(), meaning: "伪造的来源", sourceContexts: [] } });
    expect(forged.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("resolves each source snapshot once and fails closed on resolver failure", async () => {
    const auth = await register();
    const resolver = vi.fn(async () => publicBook());
    expect((await request("/selections", { method: "POST", auth, body: selectionBody(), resolver })).status).toBe(200);
    expect(resolver).toHaveBeenCalledTimes(1);
    const unavailable = await request("/selections", { method: "POST", auth, body: selectionBody("chapter-3", crypto.randomUUID(), ["public-second"]), resolver: async () => { throw new Error("private provider diagnostic"); } });
    expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain("diagnostic");
    expect((await (await request("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it("selects all book memberships, or only main cards without confusing dates with pages", async () => {
    const auth = await register();
    const all = await select(auth, "all"); expect(all.status).toBe(200);
    expect(await all.json()).toMatchObject({ added: 1, contextAdded: 2, entries: [{ sourceContexts: [{ chapterId: "chapter-3", meaning: "① 第三章：在包里翻找。" }, { chapterId: "chapter-14", meaning: "① 第十四章：翻找音乐磁带。" }] }] });
    const main = await request("/selections", { method: "POST", auth, body: { entryIds: ["public-main"], collectionId: "main", chapterId: "all", mutationId: crypto.randomUUID() } });
    expect(main.status).toBe(200);
    expect(await main.json()).toMatchObject({ entries: [{ sourceContexts: [{ key: "public-main:main:all", collectionId: "main", chapterId: "all", page: "" }] }] });
  });

  it("merges source chapters without replacing private edits, notes, IDs or cloud progress", async () => {
    const auth = await register();
    const first = await (await select(auth)).json() as { entries: PersonalEntry[] };
    const old = first.entries[0];
    const update = await request(`/entries/${old.id}`, { method: "PUT", auth, body: { revision: old.revision, term: old.term, meaning: "自己的中文理解", note: "私人批注", mutationId: crypto.randomUUID() } });
    expect(update.status).toBe(200);
    const studied = await (await grade(auth, old.id)).json();
    const second = await (await select(auth, "chapter-14")).json() as { entries: PersonalEntry[] };
    expect(second).toMatchObject({ added: 0, reused: 1, contextAdded: 1, entries: [{ id: old.id, meaning: "自己的中文理解", note: "私人批注", meaningEdited: true }] });
    expect(second.entries[0].sourceContexts).toHaveLength(2);
    expect(await (await request("/learning", { auth })).json()).toMatchObject({ reviews: [(studied as { review: unknown }).review] });
    const locked = await request(`/entries/${old.id}`, { method: "PUT", auth, body: { revision: second.entries[0].revision, term: "some other word", meaning: "新的词", mutationId: crypto.randomUUID() } });
    expect(locked.status).toBe(400); expect(await locked.json()).toMatchObject({ error: { code: "source_term_locked" } });
  });

  it("preserves edited Chinese, notes, provenance and cloud history on a no-op reselection and its replays", async () => {
    const auth = await register();
    const originalMutation = crypto.randomUUID();
    const imported = await select(auth, "chapter-3", originalMutation); expect(imported.status).toBe(200);
    const original = (await imported.json() as { entries: PersonalEntry[] }).entries[0];
    const reviewed = await grade(auth, original.id); expect(reviewed.status).toBe(200);
    const learningBefore = await (await request("/learning", { auth })).json();

    // Match the live workflow: a shared card already contains two independently
    // selected chapter contexts before its personal Chinese and note are edited.
    const additional = await select(auth, "chapter-14"); expect(additional.status).toBe(200);
    const merged = (await additional.json() as { entries: PersonalEntry[] }).entries[0];
    const meaning = "① 我的私人释义；不覆盖其他章节原文。";
    const note = "我的私人批注\n保留第二行与原文语境。";
    const update = await request(`/entries/${original.id}`, { method: "PUT", auth, body: {
      revision: merged.revision, term: merged.term, meaning, note, mutationId: crypto.randomUUID()
    } });
    expect(update.status).toBe(200);
    const edited = await update.json() as { revision: number; entry: PersonalEntry };
    expect(edited.entry).toMatchObject({ id: original.id, revision: merged.revision + 1, meaning, note, meaningEdited: true });
    expect(edited.entry.sourceContexts).toEqual(merged.sourceContexts);
    expect(edited.entry.sourceContexts).toHaveLength(2);
    const saved = await (await request("/entries", { auth })).json();
    expect(saved).toMatchObject({ revision: edited.revision, entries: [edited.entry] });

    const noOpMutation = crypto.randomUUID();
    const noOp = await select(auth, "chapter-3", noOpMutation); expect(noOp.status).toBe(200);
    expect(await noOp.json()).toEqual({ revision: edited.revision, added: 0, reused: 1, contextAdded: 0, entries: [edited.entry] });
    expect(await (await request("/entries", { auth })).json()).toEqual(saved);
    expect(await (await request("/learning", { auth })).json()).toEqual(learningBefore);

    // Both a retry of this no-op and a delayed retry of the original import
    // acknowledge the current private card, never restore its old source text.
    for (const mutation of [noOpMutation, originalMutation]) {
      const replay = await select(auth, "chapter-3", mutation); expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual({ revision: edited.revision, added: 0, reused: 0, contextAdded: 0, entries: [edited.entry] });
      expect(await (await request("/entries", { auth })).json()).toEqual(saved);
      expect(await (await request("/learning", { auth })).json()).toEqual(learningBefore);
    }
    const changedReplay = await select(auth, "chapter-14", noOpMutation);
    expect(changedReplay.status).toBe(409);
    expect(await changedReplay.json()).toMatchObject({ error: { code: "idempotency_key_reused" } });
    expect(await (await request("/entries", { auth })).json()).toEqual(saved);
    expect(await (await request("/learning", { auth })).json()).toEqual(learningBefore);
  });

  it("reuses a manual normalized card, preserves its meaning/note, and can fill a blank manual meaning", async () => {
    const auth = await register();
    const create = await request("/entries", { method: "POST", auth, body: { term: "RUMMAGE", meaning: "原先自己的解释", note: "保留笔记", mutationId: crypto.randomUUID() } });
    const original = await create.json() as { entry: PersonalEntry };
    const selected = await (await select(auth)).json();
    expect(selected).toMatchObject({ added: 0, reused: 1, entries: [{ id: original.entry.id, term: "RUMMAGE", meaning: "原先自己的解释", note: "保留笔记", meaningEdited: true }] });
    await request("/entries", { method: "POST", auth, body: { term: "loiter", mutationId: crypto.randomUUID() } });
    const blank = await (await select(auth, "chapter-3", crypto.randomUUID(), ["public-second"])).json();
    expect(blank).toMatchObject({ entries: [{ meaning: "① 徘徊；逗留。", meaningEdited: false }] });
  });

  it("preserves a deliberately cleared imported meaning on later chapter selection", async () => {
    const auth = await register();
    const { entries } = await (await select(auth)).json() as { entries: PersonalEntry[] };
    await request(`/entries/${entries[0].id}`, { method: "PUT", auth, body: { revision: 1, term: "rummage", meaning: "", mutationId: crypto.randomUUID() } });
    expect(await (await select(auth, "chapter-14")).json()).toMatchObject({ entries: [{ meaning: "", meaningEdited: true }] });
  });

  it("preserves private dictionary word classes and deliberate clearing while adding public chapter contexts", async () => {
    const auth = await register();
    const response = await request("/entries", { method: "POST", auth, body: { term: "rummage", partOfSpeech: "noun / verb", meaning: "翻找", mutationId: crypto.randomUUID() } });
    expect(response.status).toBe(200);
    const original = (await response.json() as { entry: PersonalEntry }).entry;
    const reviewed = await grade(auth, original.id); expect(reviewed.status).toBe(200);
    const progress = await (await request("/learning", { auth })).json();
    const selected = await select(auth); expect(selected.status).toBe(200);
    const imported = (await selected.json() as { entries: PersonalEntry[] }).entries[0];
    expect(imported).toMatchObject({ id: original.id, partOfSpeech: "noun / verb", sourceContexts: [{ partOfSpeech: "verb" }] });
    const cleared = await request(`/entries/${original.id}`, { method: "PUT", auth, body: { revision: imported.revision, term: "rummage", partOfSpeech: "", meaning: "翻找", mutationId: crypto.randomUUID() } });
    expect(cleared.status).toBe(200);
    const second = await select(auth, "chapter-14"); expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ entries: [{ id: original.id, partOfSpeech: "", sourceContexts: [{ partOfSpeech: "verb" }, { partOfSpeech: "verb" }] }] });
    expect(await (await request("/learning", { auth })).json()).toEqual(progress);
  });

  it("keeps legacy selection/reselection DTOs readable without stripping source POS, cloud learning or stored modern fields", async () => {
    const auth = await register();
    const originalBody = selectionBody();
    const first = await request("/selections", { method: "POST", auth, body: originalBody, legacy: true }); expect(first.status).toBe(200);
    const legacy = await first.json() as { entries: PersonalEntry[]; revision: number };
    expect(legacy.entries[0]).not.toHaveProperty("partOfSpeech");
    expect(legacy.entries[0].sourceContexts?.[0].partOfSpeech).toBe("verb");
    const id = legacy.entries[0].id;
    const modernReplay = await request("/selections", { method: "POST", auth, body: originalBody }); expect(modernReplay.status).toBe(200);
    expect(await modernReplay.json()).toMatchObject({ revision: legacy.revision, added: 0, contextAdded: 0, entries: [{ id, partOfSpeech: "verb" }] });
    const gradeResult = await grade(auth, id); expect(gradeResult.status).toBe(200);
    const learning = await (await request("/learning", { auth })).json();
    expect(await (await request("/learning", { auth, legacy: true })).json()).toEqual(learning);
    const noOpBody = selectionBody();
    const noOp = await request("/selections", { method: "POST", auth, body: noOpBody, legacy: true }); expect(noOp.status).toBe(200);
    const noOpData = await noOp.json() as { entries: PersonalEntry[]; revision: number };
    expect(noOpData.revision).toBe(legacy.revision); expect(noOpData.entries[0]).not.toHaveProperty("partOfSpeech");
    expect(noOpData.entries[0].sourceContexts?.[0].partOfSpeech).toBe("verb");
    const conflict = await request(`/reviews/${id}`, { method: "POST", auth, legacy: true, body: { rating: "hard", revision: 0, mutationId: crypto.randomUUID() } });
    expect(conflict.status).toBe(409);
    const oldLearningConflict = await conflict.json() as { error: { details: { existing: unknown } } };
    expect(oldLearningConflict.error.details.existing).toEqual((learning as { reviews: unknown[] }).reviews[0]);
    expect(await (await request("/entries", { auth })).json()).toMatchObject({ entries: [{ id, partOfSpeech: "verb", sourceContexts: [{ partOfSpeech: "verb" }] }] });
  });

  it("is idempotent without count/revision inflation and binds mutation IDs to selection semantics", async () => {
    const auth = await register(), mutationId = crypto.randomUUID();
    const first = await (await select(auth, "chapter-3", mutationId)).json() as { entries: PersonalEntry[]; revision: number };
    const replay = await (await select(auth, "chapter-3", mutationId)).json();
    expect(replay).toMatchObject({ revision: first.revision, added: 0, reused: 0, contextAdded: 0, entries: [{ id: first.entries[0].id, revision: 1 }] });
    expect(await (await select(auth)).json()).toMatchObject({ revision: first.revision, added: 0, reused: 1, contextAdded: 0 });
    const changed = await select(auth, "chapter-14", mutationId); expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ error: { code: "idempotency_key_reused" } });
  });

  it("rejects a wrong scope, missing IDs and oversized batches atomically", async () => {
    const auth = await register();
    for (const body of [selectionBody("chapter-3", crypto.randomUUID(), ["public-rummage", "missing"]), selectionBody("chapter-14", crypto.randomUUID(), ["public-rummage", "public-second"]), { ...selectionBody(), entryIds: Array(101).fill("public-rummage") }, { ...selectionBody(), collectionId: "main" }]) {
      expect((await request("/selections", { method: "POST", auth, body })).status).toBe(400);
    }
    expect((await (await request("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(0);
    await runInDurableObject(privateVault(auth), async (_instance, state) => { await state.storage.put("meta", { revision: 0, count: 999, entryBytes: 0, ledgerBytes: 0, ledgerCount: 0 }); });
    const full = await select(auth, "chapter-3", crypto.randomUUID(), ["public-rummage", "public-second"]); expect(full.status).toBe(413);
    const keys = await runInDurableObject(privateVault(auth), async (_instance, state) => [...(await state.storage.list({ prefix: "entry:" })).keys()]); expect(keys).toEqual([]);
  });

  it("isolates selection and review records between registered users", async () => {
    const a = await register("reader_alpha"), b = await register("reader_beta");
    const first = await (await select(a)).json() as { entries: PersonalEntry[] };
    const second = await (await select(b)).json() as { entries: PersonalEntry[] };
    expect(first.entries[0].id).not.toBe(second.entries[0].id);
    expect((await grade(b, first.entries[0].id)).status).toBe(404);
    expect((await grade(a, first.entries[0].id)).status).toBe(200);
    expect(await (await request("/learning", { auth: b })).json()).toEqual({ revision: 0, reviews: [] });
    const stale = await request("/learning", { auth: b, headers: { "X-Member-User": a.user.id } }); expect(stale.status).toBe(401);
  });

  it("uses shared scheduling, server time, optimistic versions and replay-safe counts", async () => {
    const auth = await register();
    const card = (await (await select(auth)).json() as { entries: PersonalEntry[] }).entries[0];
    const mutationId = crypto.randomUUID(), before = Date.now();
    const graded = await grade(auth, card.id, 0, "good", mutationId); expect(graded.status).toBe(200);
    const first = await graded.json() as { review: ReturnType<typeof nextPersonalReview>; revision: number };
    expect(first.review).toMatchObject({ schemaVersion: 1, revision: 1, entryId: card.id, level: 1, reviewCount: 1, lapseCount: 0, lastRating: "good" });
    expect(Date.parse(first.review.updatedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(first.review.dueAt) - Date.parse(first.review.updatedAt)).toBe(3 * 86400_000);
    const again = await grade(auth, card.id, 0, "good", mutationId);
    expect(await again.json()).toEqual({ revision: first.revision, review: first.review, action: "idempotent" });
    const stale = await grade(auth, card.id, 0, "easy"); expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "revision_conflict", details: { existing: { revision: 1 }, revision: 1 } } });
    const injected = await request(`/reviews/${card.id}`, { method: "POST", auth, body: { rating: "easy", revision: 1, mutationId: crypto.randomUUID(), dueAt: "2099-01-01" } }); expect(injected.status).toBe(400);
  });

  it("schedules every rating/level identically to the existing pure review implementation", () => {
    for (let level = 0; level <= 7; level++) for (const rating of ["again", "hard", "good", "easy"]) {
      const previous = { schemaVersion: 1 as const, entryId: "test", revision: 7, level, dueAt: "2026-01-01T00:00:00.000Z", reviewCount: 12,
        lapseCount: 2, lastRating: "good", history: [], updatedAt: "2026-01-01T00:00:00.000Z" };
      const now = new Date("2026-10-17T12:00:00.000Z");
      expect(nextPersonalReview("test", previous, rating, now)).toEqual({ ...scheduleReview(previous, rating, now), revision: 8 });
    }
  });

  it("caps history at 100 and persists reviews across account reads, while deletion removes them atomically", async () => {
    const auth = await register();
    const card = (await (await select(auth)).json() as { entries: PersonalEntry[] }).entries[0];
    const previous = nextPersonalReview(card.id, undefined, "good", new Date("2026-01-01T00:00:00.000Z"));
    previous.history = Array.from({ length: 100 }, () => ({ at: previous.updatedAt, rating: "good", fromLevel: 0, toLevel: 1 }));
    await runInDurableObject(privateVault(auth), async (_instance, state) => {
      await state.storage.put(`review:${card.id}`, previous);
      await state.storage.put("learning-meta", { revision: 1, reviewBytes: new TextEncoder().encode(JSON.stringify(previous)).length, ledgerBytes: 0, ledgerCount: 0 });
    });
    const graded = await (await grade(auth, card.id, 1, "again")).json() as { review: ReturnType<typeof nextPersonalReview> };
    expect(graded.review.history).toHaveLength(100); expect(graded.review.history.at(-1)?.rating).toBe("again");
    expect(await (await request("/learning", { auth })).json()).toMatchObject({ revision: 2, reviews: [graded.review] });
    expect((await request(`/entries/${card.id}`, { method: "DELETE", auth, body: { revision: card.revision, mutationId: crypto.randomUUID() } })).status).toBe(200);
    expect(await (await request("/learning", { auth })).json()).toEqual({ revision: 3, reviews: [] });
    expect((await grade(auth, card.id)).status).toBe(404);
  });

  it("keeps learning quota separate from cards and fails safely without deleting existing history", async () => {
    const auth = await register();
    const card = (await (await select(auth)).json() as { entries: PersonalEntry[] }).entries[0];
    await runInDurableObject(privateVault(auth), async (_instance, state) => { await state.storage.put("learning-meta", { revision: 0, reviewBytes: 2 * 1024 * 1024, ledgerBytes: 0, ledgerCount: 0 }); });
    const full = await grade(auth, card.id); expect(full.status).toBe(413);
    expect((await (await request("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(1);
    expect(await (await request("/learning", { auth })).json()).toEqual({ revision: 0, reviews: [] });
  });

  it("bridges only the fixed GitHub owner to a stable private account without ordinary registration", async () => {
    const auth = await owner(); expect(auth).toMatchObject({ user: { id: PRIVATE_OWNER_ID, username: "zhuodashuai" }, authType: "github-owner" });
    const selected = await select(auth); expect(selected.status).toBe(200);
    const card = (await selected.json() as { entries: PersonalEntry[] }).entries[0];
    expect((await grade(auth, card.id)).status).toBe(200);
    const accounts = await runInDurableObject(memberAuthStub(testEnv), async (_instance, state) => [...(await state.storage.list({ prefix: "account:" })).keys()]); expect(accounts).toEqual([]);
    const deletion = await request("/account", { method: "DELETE", auth, body: { password: PASSWORD, confirmation: "DELETE" } }); expect(deletion.status).toBe(403);
    expect((await request("/register", { method: "POST", auth, body: { username: "another_name", password: PASSWORD } })).status).toBe(403);
    expect((await request("/password/reset", { method: "POST", auth, body: { username: "zhuodashuai", newPassword: PASSWORD, recoveryCode: "x".repeat(43) } })).status).toBe(403);
    expect(await (await request("/learning", { auth })).json()).toMatchObject({ reviews: [{ entryId: card.id, reviewCount: 1 }] });
  });

  it("never silently switches explicit auth modes and auto prefers a member cookie", async () => {
    const github = await owner(), member = await register();
    const both = `${member.cookie}; ${github.cookie}`;
    const auto = await request("/session", { headers: { Cookie: both } }); expect(await auto.json()).toMatchObject({ user: member.user, authType: "member" });
    const explicitOwner = await request("/session", { headers: { Cookie: both, "X-Wordbook-Auth": "github-owner" } }); expect(await explicitOwner.json()).toMatchObject({ user: github.user, authType: "github-owner" });
    const absentMember = await request("/session", { headers: { Cookie: github.cookie, "X-Wordbook-Auth": "member" } }); expect(await absentMember.json()).toEqual({ authenticated: false });
    expect(absentMember.headers.get("Set-Cookie")).toContain("__Host-zhuo_member");
    const absentOwner = await request("/session", { headers: { Cookie: member.cookie, "X-Wordbook-Auth": "github-owner" } }); expect(await absentOwner.json()).toEqual({ authenticated: false });
    expect(absentOwner.headers.get("Set-Cookie")).toContain("__Host-zhuo_session");
    const switched = await request("/learning", { auth: { ...github, cookie: both, authType: undefined }, headers: { "X-Member-User": PRIVATE_OWNER_ID } }); expect(switched.status).toBe(401);
  });

  it("owner read assertion returns no token, does not rotate CSRF, and rejects a forged owner identity", async () => {
    const auth = await owner(), hash = await sha256Hex(OWNER_RAW);
    const stub = testEnv.OWNER_CONTROL.get(testEnv.OWNER_CONTROL.idFromName("owner:zhuodashuai"));
    const before = await runInDurableObject(stub, async (_instance, state) => state.storage.get<{ csrfHashes: string[] }>(`session:${hash}`));
    const response = await stub.fetch("https://owner.internal/session/read-assert", { method: "POST", body: JSON.stringify({ sessionHash: hash }) });
    const view = await response.json(); expect(view).toMatchObject({ authenticated: true, user: { id: 156042078, login: "zhuodashuai" } });
    expect(Object.keys(view as object).sort()).toEqual(["authenticated", "expiresAt", "user"]);
    const after = await runInDurableObject(stub, async (_instance, state) => state.storage.get<{ csrfHashes: string[] }>(`session:${hash}`)); expect(after?.csrfHashes).toEqual(before?.csrfHashes);
    await runInDurableObject(stub, async (_instance, state) => { const stored = await state.storage.get<Record<string, unknown>>(`session:${hash}`); await state.storage.put(`session:${hash}`, { ...stored, userId: 99 }); });
    expect((await request("/entries", { auth })).status).toBe(401);
  });

  it("owner logout revokes only the GitHub owner cookie/session, not an ordinary account", async () => {
    const github = await owner(), member = await register();
    const outbound = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const logout = await request("/logout", { method: "POST", auth: { ...github, cookie: `${member.cookie}; ${github.cookie}` }, body: {} });
    expect(logout.status).toBe(200); expect(logout.headers.get("Set-Cookie")).toContain("__Host-zhuo_session=;");
    expect(logout.headers.get("Set-Cookie")).not.toContain("__Host-zhuo_member");
    expect(await (await request("/session", { headers: { Cookie: github.cookie, "X-Wordbook-Auth": "github-owner" } })).json()).toEqual({ authenticated: false });
    expect(await (await request("/session", { headers: { Cookie: member.cookie, "X-Wordbook-Auth": "member" } })).json()).toMatchObject({ authenticated: true, user: member.user });
    expect(outbound).toHaveBeenCalledTimes(1);
  });

  it("preserves a 20,000-code-point imported-card meaning during later note edits and rejects oversized requests", async () => {
    const auth = await register();
    const card = (await (await select(auth)).json() as { entries: PersonalEntry[] }).entries[0];
    const meaning = "中".repeat(20_000);
    const first = await request(`/entries/${card.id}`, { method: "PUT", auth, body: { revision: 1, term: card.term, meaning, note: "第一条笔记", mutationId: crypto.randomUUID() } });
    expect(first.status).toBe(200); expect(await first.json()).toMatchObject({ entry: { revision: 2, meaning, meaningEdited: true } });
    const second = await request(`/entries/${card.id}`, { method: "PUT", auth, body: { revision: 2, term: card.term, meaning, note: "只改自己的笔记", mutationId: crypto.randomUUID() } });
    expect(second.status).toBe(200);
    const updated = (await second.json() as { entry: PersonalEntry }).entry;
    expect(updated.meaning).toHaveLength(20_000); expect(updated.note).toBe("只改自己的笔记"); expect(updated.sourceContexts).toEqual(card.sourceContexts);
    const over = await request(`/entries/${card.id}`, { method: "PUT", auth, body: { revision: 3, term: card.term, meaning: "中".repeat(50_000), note: "不应覆盖", mutationId: crypto.randomUUID() } });
    expect(over.status).toBe(413);
    const current = (await (await request("/entries", { auth })).json() as { entries: PersonalEntry[] }).entries[0];
    expect(current).toEqual(updated);
    const tooLongLogically = await request(`/entries/${card.id}`, { method: "PUT", auth, body: { revision: 3, term: card.term, meaning: "中".repeat(20_001), mutationId: crypto.randomUUID() } });
    expect(tooLongLogically.status).toBe(400);
  });

  it("does not truncate source contexts just to fit the private card limit", async () => {
    const auth = await register();
    const large = publicBook();
    large.entries[0].tags = Array.from({ length: 30 }, (_, i) => `collection:${BOOK}:chapter-${i + 1}`);
    large.entries[0].readingContexts = Array.from({ length: 30 }, (_, i) => ({ ...context(i + 1, "中".repeat(4000)), definition: "e".repeat(4000), usage: "u".repeat(4000) }));
    const response = await request("/selections", { method: "POST", auth, body: selectionBody("all"), resolver: async () => large });
    expect(response.status).toBe(413); expect(await response.json()).toMatchObject({ error: { code: "selection_entry_too_large" } });
    expect((await (await request("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(0);
  });

  it("binds review mutation IDs across private operations and allows only one concurrent first review", async () => {
    const auth = await register(), selectionId = crypto.randomUUID();
    const card = (await (await select(auth, "chapter-3", selectionId)).json() as { entries: PersonalEntry[] }).entries[0];
    const collision = await grade(auth, card.id, 0, "good", selectionId); expect(collision.status).toBe(409);
    const reviewId = crypto.randomUUID();
    const responses = await Promise.all([grade(auth, card.id, 0, "good", reviewId), grade(auth, card.id, 0, "hard")]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const progress = await (await request("/learning", { auth })).json() as { reviews: { reviewCount: number; revision: number }[] };
    expect(progress.reviews[0]).toMatchObject({ reviewCount: 1, revision: 1 });
    if (responses[0].status === 200) {
      const saved = await request("/entries", { method: "POST", auth, body: { term: "another word", mutationId: reviewId } }); expect(saved.status).toBe(409);
    }
  });

  it("keeps each book's own title/context and refuses chapter attribution when its context is missing", async () => {
    const auth = await register();
    const books = publicBook();
    books.entries[0].tags.push("collection:another-book:chapter-1");
    books.entries[0].readingContexts.push({ ...context(1, "另一本书的独立意思"), membership: "collection:another-book:chapter-1", sourceWork: "Another Book", sourceTitle: "Another Book — Chapter 1", page: "9" });
    const copied = await request("/selections", { method: "POST", auth, body: { entryIds: ["public-rummage"], collectionId: "all", chapterId: "all", mutationId: crypto.randomUUID() }, resolver: async () => books });
    expect(copied.status).toBe(200);
    const result = await copied.json() as { entries: PersonalEntry[] };
    expect(result.entries[0].sourceContexts?.find(context => context.collectionId === "another-book")).toMatchObject({ bookTitle: "Another Book", meaning: "另一本书的独立意思", page: "9" });
    const broken = publicBook(); broken.entries[1].readingContexts = [];
    const missing = await request("/selections", { method: "POST", auth, body: selectionBody("chapter-3", crypto.randomUUID(), ["public-second"]), resolver: async () => broken });
    expect(missing.status).toBe(503); expect(await missing.json()).toMatchObject({ error: { code: "source_context_unavailable" } });
    expect((await (await request("/entries", { auth })).json() as { entries: unknown[] }).entries).toHaveLength(1);
  });
});
