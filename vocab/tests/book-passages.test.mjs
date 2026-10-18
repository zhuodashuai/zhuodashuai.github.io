import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBookPassages, loadBookPassages, resetBookPassagesCache, sourcePassagesForEntry,
  selectBookPassages, readPassageFavorites, setPassageFavorite, exportPassageFavorites, importPassageFavorites
} from "../js/book-passages.js";
import { contextualizeReadingEntry } from "../js/wordbook-schema.js?v=77";

function passage(id = "nlg-1", chapterId = "chapter-1", options = {}) {
  return {
    id, bookId: "never-let-me-go", chapterId,
    text: "She shrugged, and then smiled.", translation: "她耸耸肩，然后笑了。", note: "本章的一个动作。",
    source: { title: "Never Let Me Go", edition: "2012 Vintage PDF", pdfPage: 12, printedPage: "" },
    featured: true, links: [{ entryId: "shared-shrug", membership: `collection:never-let-me-go:${chapterId}` }],
    ...options
  };
}

function payload(passages = [passage()]) {
  return { schemaVersion: 1, books: [{ id: "never-let-me-go", title: "Never Let Me Go", author: "Kazuo Ishiguro", editionNote: "以用户提供的 PDF 页序定位。" }], passages };
}

function memoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [["zhuo-vocab:book-passage-favorites:v1", initial]]);
  return { values, getItem(key) { return values.has(key) ? values.get(key) : null; }, setItem(key, value) { values.set(key, value); } };
}

function response(value = payload()) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }

test("strict source sidecar preserves original quotes and marks unknown printed pages honestly", () => {
  const data = parseBookPassages(payload());
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.passages[0].text, "She shrugged, and then smiled.");
  assert.equal(data.passages[0].source.printedPage, "");
  assert.equal(data.passages[0].source.pdfPage, 12);
  assert.equal(Object.isFrozen(data.passages[0].source), true);
  assert.equal(Object.isFrozen(data.passages[0].links), true);
  assert.equal(Object.isFrozen(data.books), true);
});

test("positive numeric printed page labels normalize to strings while explicit labels stay intact", () => {
  const value = payload(); value.passages[0].source.printedPage = 43;
  assert.equal(parseBookPassages(value).passages[0].source.printedPage, "43");
  value.passages[0].source.printedPage = "p. 43";
  assert.equal(parseBookPassages(value).passages[0].source.printedPage, "p. 43");
});

test("empty explicit translation and reading note are accepted instead of hallucinated", () => {
  const value = payload(); value.passages[0].translation = ""; value.passages[0].note = "";
  assert.equal(parseBookPassages(value).passages[0].translation, "");
});

test("missing, unknown, inherited and wrongly typed fields are rejected at every level", () => {
  const cases = [null, [], "{}", { ...payload(), schemaVersion: "1" }, { ...payload(), model: "external" }];
  const missing = payload(); delete missing.passages[0].translation; cases.push(missing);
  const missingSource = payload(); delete missingSource.passages[0].source.pdfPage; cases.push(missingSource);
  const unknownSource = payload(); unknownSource.passages[0].source.url = "https://outside.invalid/full.pdf"; cases.push(unknownSource);
  const unknownLink = payload(); unknownLink.passages[0].links[0].url = "https://outside.invalid"; cases.push(unknownLink);
  const inherited = Object.create(payload()); cases.push(inherited);
  const badBook = payload(); badBook.books[0].title = 42; cases.push(badBook);
  const notBoolean = payload(); notBoolean.passages[0].featured = "true"; cases.push(notBoolean);
  for (const value of cases) assert.throws(() => parseBookPassages(value));
});

test("duplicate book, passage and entry-membership IDs cannot silently shadow data", () => {
  const books = payload(); books.books.push({ ...books.books[0] });
  assert.throws(() => parseBookPassages(books), /重复/u);
  assert.throws(() => parseBookPassages(payload([passage(), passage()])), /重复/u);
  const links = payload(); links.passages[0].links.push({ ...links.passages[0].links[0] });
  assert.throws(() => parseBookPassages(links), /重复/u);
});

test("passages must belong to a known book and chapter 1 through 23", () => {
  for (const chapter of ["chapter-0", "chapter-24", "chapter-01", "Chapter 1", "chapter-1<script>"]) {
    assert.throws(() => parseBookPassages(payload([passage("safe-id", chapter)])), /章节/u);
  }
  const unknown = payload(); unknown.passages[0].bookId = "other-book";
  assert.throws(() => parseBookPassages(unknown), /书籍/u);
  assert.equal(parseBookPassages(payload([passage("safe-id", "chapter-23")])).passages.length, 1);
});

test("links cannot attach a sentence from a different book or chapter", () => {
  for (const membership of ["collection:never-let-me-go:chapter-2", "collection:other-book:chapter-1", "shared-shrug"]) {
    const value = payload(); value.passages[0].links[0].membership = membership;
    assert.throws(() => parseBookPassages(value), /章节/u);
  }
});

test("bounded payload arrays, text, source page and identifiers reject malformed data", () => {
  const bad = [];
  bad.push(payload(Array.from({ length: 2001 }, (_, index) => passage(`p-${index}`))));
  const books = payload(); books.books = Array.from({ length: 101 }, (_, index) => ({ ...books.books[0], id: `book-${index}` })); bad.push(books);
  for (const key of ["text", "translation", "note"]) { const value = payload(); value.passages[0][key] = "a".repeat(2001); bad.push(value); }
  for (const pdfPage of [0, -1, 1.5, "12", null, 10001]) { const value = payload(); value.passages[0].source.pdfPage = pdfPage; bad.push(value); }
  const links = payload(); links.passages[0].links = Array.from({ length: 101 }, (_, index) => ({ entryId: `entry-${index}`, membership: "collection:never-let-me-go:chapter-1" })); bad.push(links);
  const empty = payload(); empty.passages[0].text = "   "; bad.push(empty);
  const control = payload(); control.passages[0].text = "a\u0000b"; bad.push(control);
  const scriptId = payload(); scriptId.passages[0].id = "<script>"; bad.push(scriptId);
  const urlId = payload(); urlId.passages[0].links[0].entryId = "https://outside.invalid"; bad.push(urlId);
  for (const value of bad) assert.throws(() => parseBookPassages(value));
});

test("prototype-pollution keys are rejected, and plain quote text is never interpreted as markup", () => {
  const raw = JSON.parse(JSON.stringify(payload()).replace('"featured":true', '"featured":true,"__proto__":{"polluted":true}'));
  assert.throws(() => parseBookPassages(raw), /未知/u);
  const quote = '<img src=x onerror="alert(1)"> is literal quotation text.';
  const data = parseBookPassages(payload([passage("safe", "chapter-1", { text: quote })]));
  assert.equal(data.passages[0].text, quote);
  assert.equal({}.polluted, undefined);
});

test("source examples link by canonical ID and active first membership, never by spelling alone", () => {
  const data = parseBookPassages(payload([passage("first"), passage("second", "chapter-2")]));
  const shared = { id: "shared-shrug", term: "shrug", tags: ["collection:never-let-me-go:chapter-1", "collection:never-let-me-go:chapter-2"] };
  assert.deepEqual(sourcePassagesForEntry(data, shared).map((item) => item.id), ["first"]);
  const chapterTwo = contextualizeReadingEntry(shared, "never-let-me-go", "chapter-2");
  assert.deepEqual(sourcePassagesForEntry(data, chapterTwo).map((item) => item.id), ["second"]);
  assert.deepEqual(sourcePassagesForEntry(data, { ...shared, id: "different-shrug" }), []);
  assert.deepEqual(sourcePassagesForEntry(data, { ...shared, tags: ["collection:never-let-me-go:chapter-3", ...shared.tags] }), []);
  assert.deepEqual(sourcePassagesForEntry(data, { ...shared, tags: [] }), []);
});

test("a nonfeatured sentence remains a word example without leaking into featured reading", () => {
  const data = parseBookPassages(payload([passage("unfeatured", "chapter-1", { featured: false })]));
  const entry = { id: "shared-shrug", tags: ["collection:never-let-me-go:chapter-1"] };
  assert.equal(sourcePassagesForEntry(data, entry).length, 1);
  assert.equal(selectBookPassages(data).length, 0);
});

test("featured filters combine book, chapter, normalized search and local favorites", () => {
  const data = parseBookPassages(payload([passage("first"), passage("second", "chapter-2", { text: "A curious feeling.", translation: "一种好奇的感觉。" }), passage("hidden", "chapter-1", { featured: false })]));
  assert.deepEqual(selectBookPassages(data).map((item) => item.id), ["first", "second"]);
  assert.deepEqual(selectBookPassages(data, { bookId: "never-let-me-go", chapterId: "chapter-2" }).map((item) => item.id), ["second"]);
  assert.deepEqual(selectBookPassages(data, { query: "ＳＨＲＵＧＧＥＤ" }).map((item) => item.id), ["first"]);
  assert.deepEqual(selectBookPassages(data, { query: "好奇" }).map((item) => item.id), ["second"]);
  assert.equal(selectBookPassages(data, { query: "kazuo ishiguro" }).length, 2);
  assert.deepEqual(selectBookPassages(data, { favoritesOnly: true, favoriteIds: new Set(["first", "hidden"]) }).map((item) => item.id), ["first"]);
  assert.equal(selectBookPassages(data, { favoritesOnly: true }).length, 0);
  assert.equal(selectBookPassages(data, { bookId: "other" }).length, 0);
  assert.equal(selectBookPassages(data, { chapterId: "chapter-3" }).length, 0);
});

test("one cached first-party static download contains no cookies, term, private data or external URL", async () => {
  resetBookPassagesCache(); const requests = [];
  const fetchImpl = async (url, options) => { requests.push([url, options]); return response(); };
  const first = await loadBookPassages({ fetchImpl });
  const second = await loadBookPassages({ fetchImpl: () => { throw new Error("must not refetch"); } });
  assert.equal(first, second); assert.equal(requests.length, 1);
  assert.match(String(requests[0][0]), /\/vocab\/data\/book-passages\.json$/u);
  assert.doesNotMatch(String(requests[0][0]), /\?|api|pdf$|shrug/u);
  assert.equal(requests[0][1].credentials, "omit");
  assert.equal(requests[0][1].redirect, "error");
  assert.equal(requests[0][1].mode, "same-origin");
  resetBookPassagesCache();
});

test("HTTP or malformed body failures clear the cache for the very next retry", async () => {
  for (const fetchImpl of [async () => ({ ok: false, status: 503 }), async () => new Response("not json"), async () => response({ bad: true })]) {
    resetBookPassagesCache();
    await assert.rejects(loadBookPassages({ fetchImpl }));
    assert.equal((await loadBookPassages({ fetchImpl: async () => response() })).passages.length, 1);
  }
  resetBookPassagesCache();
});

test("a changed-origin response is rejected even from an embedded fetch implementation", async () => {
  resetBookPassagesCache();
  await assert.rejects(loadBookPassages({ fetchImpl: async () => ({ ok: true, url: "https://outside.invalid/book-passages.json", json: async () => payload() }) }), /本站/u);
  resetBookPassagesCache();
});

test("download timeout is bounded and a healthy retry works without resetting the cache", async () => {
  resetBookPassagesCache();
  await assert.rejects(loadBookPassages({ timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /超时/u);
  assert.equal((await loadBookPassages({ fetchImpl: async () => response() })).passages.length, 1);
  resetBookPassagesCache();
});

test("response headers alone never complete a hanging JSON body", async () => {
  resetBookPassagesCache();
  await assert.rejects(loadBookPassages({ timeoutMs: 5, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) }), /超时/u);
  assert.equal((await loadBookPassages({ fetchImpl: async () => response() })).books[0].id, "never-let-me-go");
  resetBookPassagesCache();
});

test("deadline cancels a hanging response stream rather than leaving its reader open", async () => {
  resetBookPassagesCache(); let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"schemaVersion":')); }, cancel() { cancelled = true; } });
  await assert.rejects(loadBookPassages({ timeoutMs: 5, fetchImpl: async () => new Response(stream) }), /超时/u);
  assert.equal(cancelled, true);
  assert.equal((await loadBookPassages({ fetchImpl: async () => response() })).schemaVersion, 1);
  resetBookPassagesCache();
});

test("oversized advertised and streamed bodies are rejected before parsing", async () => {
  resetBookPassagesCache(); let bodyRead = false;
  await assert.rejects(loadBookPassages({ fetchImpl: async () => ({ ok: true, headers: new Headers({ "content-length": "16000001" }), json: async () => { bodyRead = true; return payload(); } }) }), /过大/u);
  assert.equal(bodyRead, false);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(16_000_001)); }, cancel() { cancelled = true; } });
  await assert.rejects(loadBookPassages({ fetchImpl: async () => new Response(stream) }), /过大/u);
  assert.equal(cancelled, true);
  resetBookPassagesCache();
});

test("aborting one caller does not poison another caller's shared download", async () => {
  resetBookPassagesCache(); const controller = new AbortController(); let complete;
  const fetchImpl = () => new Promise((resolve) => { complete = resolve; });
  const first = loadBookPassages({ fetchImpl, signal: controller.signal });
  const second = loadBookPassages({ fetchImpl });
  controller.abort(); await assert.rejects(first, /停止/u);
  complete(response()); assert.equal((await second).passages.length, 1);
  resetBookPassagesCache();
});

test("an already-aborted caller performs no network work and reset permits a fresh shared request", async () => {
  resetBookPassagesCache(); const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(loadBookPassages({ signal: controller.signal, fetchImpl: async () => { calls++; return response(); } }), /停止/u);
  assert.equal(calls, 0);
  const waiting = loadBookPassages({ fetchImpl: () => new Promise(() => {}) });
  resetBookPassagesCache(); await assert.rejects(waiting, /停止/u);
  assert.equal((await loadBookPassages({ fetchImpl: async () => response() })).schemaVersion, 1);
  resetBookPassagesCache();
});

test("favorites add/remove idempotently in an isolated key without storing prose or identity", () => {
  const storage = memoryStorage(); storage.setItem("existing-learning-records", "untouched");
  assert.deepEqual([...readPassageFavorites(storage)], []);
  assert.deepEqual([...setPassageFavorite("nlg-1", true, storage)], ["nlg-1"]);
  assert.deepEqual([...setPassageFavorite("nlg-1", true, storage)], ["nlg-1"]);
  const saved = JSON.parse(storage.getItem("zhuo-vocab:book-passage-favorites:v1"));
  assert.deepEqual(saved, { schemaVersion: 1, ids: ["nlg-1"] });
  assert.equal(storage.getItem("existing-learning-records"), "untouched");
  assert.deepEqual([...setPassageFavorite("nlg-1", false, storage)], []);
});

test("favorites export/import contains IDs only, merges existing IDs and retains temporarily absent passages", () => {
  const first = memoryStorage(); setPassageFavorite("unknown-future-id", true, first);
  const exported = exportPassageFavorites(first);
  assert.deepEqual(JSON.parse(exported), { schemaVersion: 1, ids: ["unknown-future-id"] });
  const second = memoryStorage(); setPassageFavorite("existing-id", true, second);
  assert.deepEqual([...importPassageFavorites(exported, second)], ["existing-id", "unknown-future-id"]);
  assert.deepEqual([...importPassageFavorites(exported, second)], ["existing-id", "unknown-future-id"]);
});

test("malformed favorite backups cannot overwrite existing bookmarks", () => {
  const storage = memoryStorage(); setPassageFavorite("keep-me", true, storage);
  for (const value of ["not-json", { schemaVersion: 2, ids: [] }, { schemaVersion: 1, ids: ["same", "same"] }, { schemaVersion: 1, ids: ["<script>"] }, { schemaVersion: 1, ids: [], text: "private note" }, { schemaVersion: 1, ids: Array.from({ length: 2001 }, (_, index) => `id-${index}`) }]) {
    assert.throws(() => importPassageFavorites(value, storage));
    assert.deepEqual([...readPassageFavorites(storage)], ["keep-me"]);
  }
  assert.throws(() => importPassageFavorites("x".repeat(1_000_001), storage), /过大/u);
});

test("storage denial, quota errors and corrupted records surface instead of pretending to save", () => {
  assert.throws(() => readPassageFavorites(undefined), /保存/u);
  assert.throws(() => readPassageFavorites({ getItem() { throw new Error("denied"); }, setItem() {} }), /denied/u);
  const full = { getItem() { return null; }, setItem() { throw new Error("quota exceeded"); } };
  assert.throws(() => setPassageFavorite("nlg-1", true, full), /quota/u);
  assert.throws(() => importPassageFavorites({ schemaVersion: 1, ids: ["nlg-1"] }, full), /quota/u);
  assert.throws(() => readPassageFavorites(memoryStorage("broken-json")), /读取失败/u);
  assert.throws(() => readPassageFavorites(memoryStorage('{"schemaVersion":1,"ids":[],"unexpected":true}')), /未知/u);
});

test("favorite cap and flag validation apply to updates, not just backups", () => {
  const storage = memoryStorage(JSON.stringify({ schemaVersion: 1, ids: Array.from({ length: 2000 }, (_, index) => `id-${index}`) }));
  assert.throws(() => setPassageFavorite("new-id", true, storage), /2000/u);
  assert.equal(readPassageFavorites(storage).size, 2000);
  assert.throws(() => setPassageFavorite("id-1", "true", storage), /布尔/u);
  assert.throws(() => setPassageFavorite("https://outside.invalid/id", true, storage), /格式/u);
});
