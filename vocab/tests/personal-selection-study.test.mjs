import assert from "node:assert/strict";
import test from "node:test";
import { createBlankEntry } from "../js/wordbook-schema.js";
import { scheduleReview } from "../js/review.js";
import { createPersonalApi } from "../js/personal-api.js";
import { personalDraft, serializePersonalExport, validatePersonalEntry, validatePersonalInput, validatePersonalSession, validatePersonalSourceContext } from "../js/personal-storage.js";
import { alreadySelectedSource, contextualizePersonalEntry, fetchPersonalPublicCatalog, filterPersonalEntries, personalCollectionCatalog, publicSelectionEntries, selectionPayload } from "../js/personal-selection.js";
import { personalRecentHistory, personalStudyQueue, personalStudySummary, validatePersonalLearning, validatePersonalReview } from "../js/personal-study.js";

const UID = "11111111-1111-4111-8111-111111111111";
const OTHER_UID = "22222222-2222-4222-8222-222222222222";
const OWNER_UID = "15604207-8000-4000-8000-000000000001";
const WHEN = "2026-10-17T12:00:00.000Z";
const BOOK = "never-let-me-go";
const privateWord = (overrides = {}) => ({ id: `member-${UID}`, revision: 1, term: "tuck", normalized: "tuck", meaning: "① 塞入", note: "我的笔记", createdAt: WHEN, updatedAt: WHEN, ...overrides });
const context = (chapter = "chapter-1", meaning = "① 隐藏在屋檐下", overrides = {}) => ({
  key: `public-tuck:${BOOK}:${chapter}`, entryId: "public-tuck", term: "tuck", collectionId: BOOK, chapterId: chapter,
  bookTitle: "Never Let Me Go", chapterTitle: chapter.replace("chapter-", "Chapter "), sourceTitle: `Never Let Me Go — ${chapter}`,
  page: "10", originalInput: "tucked", meaning, definition: "To put in a sheltered position.", exampleEn: "The cabin was tucked behind a hill.",
  exampleZh: "小屋藏在山后。", partOfSpeech: "verb", phonetic: "/tʌk/", usage: "本章的语境说明。", ...overrides
});
const publicWord = () => ({
  ...createBlankEntry("tuck"), id: "public-tuck", meaning: "① 塞入", sourceWork: "Never Let Me Go",
  tags: [`collection:${BOOK}:chapter-1`, `collection:${BOOK}:chapter-2`],
  readingContexts: [1, 2].map((number) => ({
    membership: `collection:${BOOK}:chapter-${number}`, page: `${number * 10}`, originalInput: number === 1 ? "tucked" : "tucking",
    entryType: "word", partOfSpeech: "verb", meaning: number === 1 ? "① 隐藏在屋檐下" : "① 把衣角掖好", definition: `Chapter ${number} meaning.`,
    usage: `第${number}章语境，不包括后文。`, register: "general", collocations: [], confusedWith: [], forms: [],
    exampleEn: "An original example.", exampleZh: "一个自编例句。", sourceTitle: `Never Let Me Go — Chapter ${number}`,
    sourceWork: "Never Let Me Go", sourceDate: `${number * 10}`, attributionNote: "依章节整理。"
  }))
});
const review = (entryId = `member-${UID}`, rating = "good", now = WHEN) => ({ ...scheduleReview({ entryId }, rating, new Date(now)), revision: 1 });

test("public picker sends no credentials or membership headers and preserves contextual meanings", async () => {
  const entry = publicWord();
  let received;
  const result = await fetchPersonalPublicCatalog({ fetchImpl: async (url, options) => {
    received = { url, options };
    return new Response(JSON.stringify({ schemaVersion: 3, exportedAt: WHEN, revisionId: "public-test", lastMutationId: "", entries: [entry] }));
  } });
  assert.equal(received.url, "/api/v1/public/wordbook");
  assert.equal(received.options.credentials, "omit");
  assert.equal(received.options.headers["X-Wordbook-Auth"], undefined);
  assert.equal(publicSelectionEntries(result.entries, BOOK, "chapter-1")[0].meaning, "① 隐藏在屋檐下");
  assert.equal(publicSelectionEntries(result.entries, BOOK, "chapter-2")[0].originalInput, "tucking");
});

test("public catalog timeouts and account-scope cancellation also bound a stalled response body", async () => {
  await assert.rejects(fetchPersonalPublicCatalog({ timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /读取已停止/);
  let transportSignal;
  await assert.rejects(fetchPersonalPublicCatalog({ timeoutMs: 5, fetchImpl: async (_url, options) => {
    transportSignal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  } }), /读取已停止/);
  assert.equal(transportSignal.aborted, true);
  const controller = new AbortController();
  const pending = fetchPersonalPublicCatalog({ signal: controller.signal, fetchImpl: () => new Promise(() => {}) });
  controller.abort();
  await assert.rejects(pending, /读取已停止/);
  await assert.rejects(fetchPersonalPublicCatalog({ signal: controller.signal, fetchImpl: () => { throw new Error("must not start"); } }), /读取已停止/);
});

test("public picker falls back to a validated public asset when the live service returns1102/5xx", async () => {
  const calls = [];
  const result = await fetchPersonalPublicCatalog({ fetchImpl: async (url, options) => {
    calls.push([String(url), options]);
    return String(url).startsWith("/api/") ? new Response("Worker exceeded resource limits", { status: 500 })
      : new Response(JSON.stringify({ schemaVersion: 3, exportedAt: WHEN, revisionId: "deployed-test", lastMutationId: "", entries: [publicWord()] }));
  } });
  assert.equal(result.readSource, "deployed-fallback");
  assert.equal(result.entries[0].term, "tuck");
  assert.equal(calls.length, 2);
  assert.match(calls[1][0], /\/data\/owner-wordbook\.json$/u);
  assert.ok(calls.every(([, options]) => options.credentials === "omit"));
});

test("a hanging live body has a short deadline before the picker tries the deployed public snapshot", async () => {
  let firstSignal;
  const result = await fetchPersonalPublicCatalog({ apiTimeoutMs: 5, timeoutMs: 1000, fetchImpl: async (url, options) => {
    if (String(url).startsWith("/api/")) { firstSignal = options.signal; return { ok: true, json: () => new Promise(() => {}) }; }
    return new Response(JSON.stringify({ schemaVersion: 3, exportedAt: WHEN, revisionId: "fallback-test", lastMutationId: "", entries: [] }));
  } });
  assert.equal(firstSignal.aborted, true);
  assert.equal(result.readSource, "deployed-fallback");
});

test("public fallback is validated and account cancellation cannot start a fallback request", async () => {
  await assert.rejects(fetchPersonalPublicCatalog({ fetchImpl: async () => new Response('{"not":"a snapshot"}') }));
  let calls = 0;
  const controller = new AbortController();
  const pending = fetchPersonalPublicCatalog({ signal: controller.signal, apiTimeoutMs: 100, fetchImpl: async () => { calls++; return new Promise(() => {}); } });
  controller.abort();
  await assert.rejects(pending, /读取已停止/);
  assert.equal(calls, 1);
});

test("selection payloads contain only IDs and explicit scope, never copied meanings or user identities", () => {
  assert.deepEqual(selectionPayload(["public-b", "public-a"], BOOK, "chapter-2"), { entryIds: ["public-a", "public-b"], collectionId: BOOK, chapterId: "chapter-2" });
  for (const args of [[[], BOOK, "all"], [Array(101).fill("public-a"), BOOK, "all"], [["public-a", "public-a"], BOOK, "all"], [["<script>"], BOOK, "all"], [["public-a"], "all", "chapter-1"]]) assert.throws(() => selectionPayload(...args));
});

test("an already selected word is not duplicated, while another chapter can add its own context", () => {
  const source = publicWord();
  const first = privateWord({ sourceContexts: [context()], meaningEdited: false });
  assert.equal(alreadySelectedSource([first], source, BOOK, "chapter-1"), true);
  assert.equal(alreadySelectedSource([first], source, BOOK, "chapter-2"), false);
  assert.equal(alreadySelectedSource([first], source, BOOK, "all"), false);
  const both = { ...first, sourceContexts: [context(), context("chapter-2", "① 掖好")] };
  assert.equal(alreadySelectedSource([both], source, BOOK, "all"), true);
});

test("chapter filtering uses contextual Chinese until the user explicitly customizes their meaning", () => {
  const entry = privateWord({ sourceContexts: [context(), context("chapter-2", "① 掖好")], meaningEdited: false });
  assert.equal(contextualizePersonalEntry(entry, BOOK, "chapter-1").meaning, "① 隐藏在屋檐下");
  assert.equal(contextualizePersonalEntry(entry, BOOK, "chapter-2").meaning, "① 掖好");
  assert.equal(contextualizePersonalEntry({ ...entry, meaningEdited: true, meaning: "我自己的中文" }, BOOK, "chapter-2").meaning, "我自己的中文");
  assert.equal(filterPersonalEntries([entry], BOOK, "chapter-3").length, 0);
  assert.equal(filterPersonalEntries([entry, privateWord({ id: `member-${OTHER_UID}`, term: "hip", normalized: "hip" })], "manual").length, 1);
  const catalog = personalCollectionCatalog([entry]);
  assert.equal(catalog.find((book) => book.id === BOOK).count, 1);
  assert.deepEqual(catalog.find((book) => book.id === BOOK).chapters.map((chapter) => chapter.count), [1, 1]);
});

test("imported entries and drafts accept bounded complete source contexts while old eight-field entries stay unchanged", () => {
  assert.deepEqual(validatePersonalEntry(privateWord()), privateWord());
  const imported = privateWord({ sourceContexts: [context()], meaningEdited: false, meaning: "字".repeat(20000) });
  assert.deepEqual(validatePersonalEntry(imported), imported);
  assert.equal(personalDraft(imported).sourceContexts[0].partOfSpeech, "verb");
  assert.equal(personalDraft(imported).partOfSpeech, "verb");
  assert.equal(personalDraft({ ...imported, partOfSpeech: "" }).partOfSpeech, "");
  assert.equal(personalDraft({ ...imported, selectedSourceContext: { partOfSpeech: "noun" } }).partOfSpeech, "noun");
  assert.equal(personalDraft({ ...imported, partOfSpeech: "noun / verb" }).partOfSpeech, "noun / verb");
  assert.equal(validatePersonalInput(imported, { imported: true }).meaning.length, 20000);
  assert.throws(() => validatePersonalInput(imported));
  assert.throws(() => validatePersonalEntry({ ...imported, sourceContexts: [context(), context()] }));
  assert.throws(() => validatePersonalSourceContext({ ...context(), authorToken: "reject" }));
  assert.throws(() => validatePersonalSourceContext({ ...context(), key: "different-key" }));
  assert.throws(() => validatePersonalEntry({ ...imported, meaningEdited: "false" }));
  const oversized = { ...imported, sourceContexts: [context("chapter-1", "字".repeat(20000)), context("chapter-2", "字".repeat(20000))] };
  assert.throws(() => validatePersonalEntry(oversized));
});

test("owner session bridge requires the exact verified owner identity and keeps its auth type", () => {
  const value = { authenticated: true, user: { id: OWNER_UID, username: "zhuodashuai" }, authType: "github-owner", csrfToken: "a".repeat(43), expiresAt: 2000 };
  assert.equal(validatePersonalSession(value, 1000).authType, "github-owner");
  assert.throws(() => validatePersonalSession({ ...value, user: { id: UID, username: "zhuodashuai" } }, 1000));
  assert.throws(() => validatePersonalSession({ ...value, user: { id: OWNER_UID, username: "another_user" } }, 1000));
  assert.throws(() => validatePersonalSession({ ...value, authType: "auto" }, 1000));
});

test("adopted auth mode and expected identity are transported for selections and cloud learning without fallback", async () => {
  const seen = [];
  const api = createPersonalApi({ fetchImpl: async (url, options) => { seen.push({ url, options }); return new Response(JSON.stringify({ ok: true })); } });
  const options = { authType: "github-owner", expectedUserId: OWNER_UID };
  await api.session({ authType: "github-owner" });
  await api.learning(options);
  await api.entries(options);
  await api.select({ ...selectionPayload(["public-tuck"], BOOK, "chapter-1"), mutationId: UID }, "csrf", options);
  await api.review(`member-${UID}`, { rating: "good", revision: 0, mutationId: OTHER_UID }, "csrf", options);
  for (const call of seen) assert.equal(call.options.headers["X-Wordbook-Auth"], "github-owner");
  assert.equal(seen[1].options.headers["X-Member-User"], OWNER_UID);
  assert.equal(seen[2].options.headers["X-Member-User"], OWNER_UID);
  assert.ok(seen[3].url.endsWith("/selections"));
  assert.ok(seen[4].url.endsWith(`/reviews/member-${UID}`));
  await api.login({ username: "student", password: "a long test password" }, { authType: "github-owner" });
  assert.equal(seen.at(-1).options.headers["X-Wordbook-Auth"], "member");
  await assert.rejects(api.entries({ authType: "unexpected" }), (error) => error.code === "invalid_auth_type");
});

test("cloud reviews are strictly validated, immutable, revisioned and bounded", () => {
  const value = review();
  assert.deepEqual(validatePersonalReview(value), value);
  const list = validatePersonalLearning({ revision: 1, reviews: [value] });
  list.reviews[0].history[0].rating = "again";
  assert.equal(value.history[0].rating, "good");
  for (const bad of [{ ...value, revision: 0 }, { ...value, lastRating: "again" }, { ...value, history: [] }, { ...value, password: "no" }, { ...value, level: 8 }]) assert.throws(() => validatePersonalReview(bad));
  assert.throws(() => validatePersonalLearning({ revision: 1, reviews: [value, value] }));
});

test("due practise includes both new words and due reviews, but excludes future and missing-Chinese words", () => {
  const newWord = privateWord();
  const dueWord = privateWord({ id: `member-${OTHER_UID}`, term: "hip", normalized: "hip", meaning: "髋部" });
  const laterWord = privateWord({ id: "member-33333333-3333-4333-8333-333333333333", term: "later", normalized: "later" });
  const missing = privateWord({ id: "member-44444444-4444-4444-8444-444444444444", term: "blank", normalized: "blank", meaning: "" });
  const entries = [newWord, dueWord, laterWord, missing];
  const reviews = [review(dueWord.id, "again", "2026-10-16T12:00:00.000Z"), review(laterWord.id)];
  const due = personalStudyQueue(entries, reviews, { mode: "due", now: new Date(WHEN), random: () => 0 });
  assert.deepEqual(new Set(due.map((entry) => entry.id)), new Set([newWord.id, dueWord.id]));
  const all = personalStudyQueue(entries, reviews, { mode: "all", random: () => 0 });
  assert.equal(all.length, 3);
  entries[0].meaning = "后来改动";
  assert.notEqual(all.find((entry) => entry.id === newWord.id).meaning, "后来改动");
  const summary = personalStudySummary(entries, reviews, new Date(WHEN));
  assert.equal(summary.omitted, 1); assert.equal(summary.dueCount, 2); assert.equal(summary.newCount, 1);
});

test("recent history and v2 exports contain only own saved entries and validated learning; legacy exports remain v1", () => {
  const entry = privateWord();
  const learning = review();
  assert.equal(personalRecentHistory([entry], [learning])[0].term, "tuck");
  assert.equal(personalRecentHistory([], [learning]).length, 0);
  assert.equal(JSON.parse(serializePersonalExport([entry], "student", WHEN)).version, 1);
  const exported = JSON.parse(serializePersonalExport([entry], "student", WHEN, [learning]));
  assert.equal(exported.version, 2); assert.deepEqual(exported.reviews, [learning]);
  assert.throws(() => serializePersonalExport([entry], "student", WHEN, [review(`member-${OTHER_UID}`)]));
  assert.equal(/password|csrfToken|recoveryCode/.test(JSON.stringify(exported)), false);
});
