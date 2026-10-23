import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeEntrySort } from "../js/entry-sort.js";
import { copyPublicNavigationContext, navigationHref, readPublicNavigationContext, readPublicNavigationSite } from "../js/app-navigation.js";
import { setupAppNavigation } from "../js/app-navigation-entry.js";

const pages = "https://zhuodashuai.github.io/vocab/";
const worker = "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/";
const context = { book: "never-let-me-go", chapter: "chapter-2", view: "passages", sort: "source" };
const publicHref = `${pages}?${new URLSearchParams(context)}`;
const carried = "wb_book=never-let-me-go&wb_chapter=chapter-2&wb_view=passages&wb_sort=source";

test("public search is authoritative over stale fragment and unrelated/private inputs", () => {
  assert.deepEqual(readPublicNavigationContext(`${publicHref}&auth=owner&query=secret&entry=private#wb_book=old&lookup=secret`), context);
  assert.deepEqual(readPublicNavigationContext(`${pages}?book=main&chapter=chapter-2&view=cards&sort=newest`), { book: "main", view: "cards", sort: "newest" });
});

test("nonpublic shells read wb_ fragment only, not their own private search", () => {
  for (const route of ["personal.html", "owner.html", "dictionary.html", "guide.html", "quick-notes.html"]) {
    assert.deepEqual(readPublicNavigationContext(`${worker}${route}?book=private&chapter=secret&view=cards&sort=az#${carried}&auth=owner&q=secret`), context);
    assert.deepEqual(readPublicNavigationContext(`${worker}${route}?book=private&chapter=secret&sort=az`), {});
  }
});

test("exact Worker clean HTML routes retain context without changing the target pathname", () => {
  for (const route of ["personal", "dictionary", "quick-notes", "owner", "guide"]) {
    assert.deepEqual(readPublicNavigationContext(`${worker}${route}#${carried}`), context);
    const target = new URL(navigationHref(`${worker}${route}?auth=member#q=existing`, publicHref));
    assert.equal(target.pathname, `/${route}`);
    assert.equal(target.searchParams.get("auth"), "member");
    assert.equal(new URLSearchParams(target.hash.slice(1)).get("q"), "existing");
    assert.deepEqual(readPublicNavigationContext(target.href), context);
    assert.deepEqual(readPublicNavigationContext(`${worker}api/v1/${route}#${carried}`), {});
    assert.deepEqual(readPublicNavigationContext(`${pages}${route}#${carried}`), {});
  }
  assert.equal(new URL(navigationHref(pages, `${worker}personal#${carried}`)).search, `?${new URLSearchParams(context)}`);
});

test("all and only actual entry-sort values and three public view values survive", () => {
  for (const sort of ["newest", "oldest", "az", "za", "source"]) {
    assert.equal(normalizeEntrySort(sort), sort);
    assert.equal(readPublicNavigationContext(`${pages}?sort=${sort}`).sort, sort);
  }
  for (const view of ["cards", "passages", "synonyms"]) assert.deepEqual(readPublicNavigationContext(`${pages}?view=${view}`), { view });
  for (const value of ["NEWEST", "private", "constructor", "__proto__", "name", "source ", "../../x"]) {
    assert.deepEqual(readPublicNavigationContext(`${pages}?sort=${encodeURIComponent(value)}&view=${encodeURIComponent(value)}`), {});
  }
});

test("dictionary-only namespaced query survives q replacement/reload and excludes private search", () => {
  for (const route of [`${pages}dictionary.html`, `${worker}dictionary`]) {
    const target = new URL(navigationHref(`${route}#q=old+query`, publicHref));
    assert.equal(target.hash, "#q=old+query");
    assert.deepEqual(Object.fromEntries(target.searchParams), { ...Object.fromEntries(Object.entries(context).map(([key, value]) => [`wb_${key}`, value])), wb_site: "pages" });
    target.searchParams.set("book", "private"); target.searchParams.set("auth", "owner"); target.searchParams.set("entry", "private");
    target.hash = "q=new-query";
    assert.deepEqual(readPublicNavigationContext(target.href), context);
    const returned = new URL(navigationHref(pages, target.href));
    assert.deepEqual(Object.fromEntries(returned.searchParams), context);
    assert.equal(returned.hash.includes("new-query"), false);
    const privateTarget = new URL(navigationHref(`${worker}personal.html`, target.href));
    assert.equal(privateTarget.search, "");
    assert.equal(privateTarget.hash, `#${carried}&wb_site=pages`);
    assert.deepEqual(readPublicNavigationContext(`${route}?wb_book=../invalid#${carried}`), {});
  }
  assert.deepEqual(readPublicNavigationContext(`${worker}personal?${carried}`), {});
  assert.deepEqual(readPublicNavigationContext(`${pages}quick-notes.html?${carried}`), {});
});

test("slugs are bounded ASCII public IDs, duplicates and invalid fields fail closed", () => {
  for (const book of ["../private", "x/y", "x\\y", "UPPER", "two words", "a--b", "-x", "x-", "x".repeat(101), "中文", "x\u0000y"]) {
    assert.deepEqual(readPublicNavigationContext(`${pages}?book=${encodeURIComponent(book)}&chapter=chapter-2`), {});
  }
  assert.deepEqual(readPublicNavigationContext(`${pages}?book=a&book=b&chapter=chapter-1&sort=az&sort=za`), {});
  assert.deepEqual(readPublicNavigationContext(`${pages}?chapter=chapter-2`), {});
  assert.deepEqual(readPublicNavigationContext(`${worker}personal.html#wb_book=a&wb_book=b&wb_chapter=chapter-1`), {});
  assert.deepEqual(readPublicNavigationContext(`${pages}?book=${"x".repeat(100)}`), { book: "x".repeat(100) });
});

test("no source q/lookup/auth/entry or arbitrary namespace field is transferred", () => {
  const href = navigationHref(`${worker}personal.html`, `${publicHref}&auth=owner&query=secret&entry=private#q=secret&lookup=secret&wb_auth=secret&wb_destination=evil`);
  const target = new URL(href);
  assert.equal(target.origin, new URL(worker).origin);
  assert.equal(target.search, "");
  assert.deepEqual([...target.hash.slice(1).split("&")], `${carried}&wb_site=pages`.split("&"));
});

test("fixed auth/notes origins, auth mode and existing destination lookup/q are preserved", () => {
  const target = new URL(copyPublicNavigationContext(`${pages}personal.html#${carried}&lookup=not-copied`, `${worker}personal.html?auth=owner#lookup=use+the+existing+draft&q=existing&wb_auth=bad`));
  assert.equal(target.origin, new URL(worker).origin);
  assert.equal(target.pathname, "/personal.html");
  assert.equal(target.search, "?auth=owner");
  assert.equal(new URLSearchParams(target.hash.slice(1)).get("lookup"), "use the existing draft");
  assert.equal(new URLSearchParams(target.hash.slice(1)).get("q"), "existing");
  assert.equal(new URLSearchParams(target.hash.slice(1)).has("wb_auth"), false);
  assert.deepEqual(readPublicNavigationContext(target.href), context);
  const notes = new URL(navigationHref(`${pages}quick-notes.html`, `${worker}personal.html#${carried}`));
  assert.equal(notes.origin, new URL(pages).origin);
  assert.equal(notes.pathname, "/vocab/quick-notes.html");
});

test("public return restores only its four known search fields without copying personal search", () => {
  const source = `${worker}personal.html?auth=owner&entry=secret&query=draft#${carried}&lookup=secret`;
  const target = new URL(navigationHref(`${pages}?book=old&chapter=old&view=cards&sort=az`, source));
  assert.deepEqual(Object.fromEntries(target.searchParams), context);
  assert.deepEqual(readPublicNavigationContext(target.href), context);
  assert.equal(target.hash, "");
  assert.equal(new URLSearchParams(target.hash.slice(1)).get("lookup"), null);
  assert.equal(copyPublicNavigationContext(source, `${worker}personal.html?auth=member`).includes("?auth=member#"), true);
});

test("empty current public scope removes stale context instead of using previous hash", () => {
  const target = new URL(navigationHref(`${worker}personal.html#${carried}`, `${pages}#${carried}`));
  assert.equal(target.hash, "#wb_site=pages");
  assert.deepEqual(readPublicNavigationContext(navigationHref(`${pages}?book=old&sort=az#${carried}`, `${worker}personal.html`)), {});
});

test("no-context links retain exact relative fallback and existing q URL spelling", () => {
  for (const target of ["guide.html", "./", "dictionary.html#q=Tajik", "personal.html?auth=member", "quick-notes.html"]) {
    assert.equal(navigationHref(target, `${pages}dictionary.html#q=Tajik`), target);
    assert.equal(copyPublicNavigationContext(`${pages}personal.html#lookup=river`, target), target);
  }
});

test("document-only retained public scope survives a new q fragment without copying that query", () => {
  const target = new URL(navigationHref("./", `${worker}dictionary#q=new+private+query`, context));
  assert.deepEqual(Object.fromEntries(target.searchParams), context);
  assert.equal(new URLSearchParams(target.hash.slice(1)).has("q"), false);
  assert.deepEqual(readPublicNavigationContext(navigationHref("personal.html", `${pages}?sort=az`, context)), { sort: "az" });
  assert.deepEqual(readPublicNavigationContext(navigationHref("personal.html", `${pages}`, context)), {});
  assert.deepEqual(readPublicNavigationContext(navigationHref("personal.html", `${worker}dictionary#wb_book=../bad&q=new`, context)), {});
  assert.deepEqual(readPublicNavigationContext(navigationHref("personal.html", `${worker}dictionary#q=new`, { ...context, query: "secret", auth: "owner" })), context);
});

test("named anchors, especially public inline lookup, remain exact in-page links", () => {
  for (const target of ["#library-lookup", "#main", "guide.html#g-audio"]) {
    assert.equal(navigationHref(target, publicHref), target);
    assert.equal(copyPublicNavigationContext(publicHref, target), target);
  }
});

test("malicious protocols, credentials, foreign hosts, routes and malformed sources are untouched", () => {
  const targets = ["javascript:alert(1)", "data:text/html,hello", "//evil.test/personal.html", "https://evil.test/personal.html",
    "https://zhuodashuai.github.io.evil.test/vocab/", "https://user:pass@zhuodashuai.github.io/vocab/", "https://zhuodashuai.github.io/",
    "https://zhuodashuai.github.io/vocab/private.html", "https://zhuodashuai.github.io:444/vocab/", "http://zhuodashuai.github.io/vocab/",
    " personal.html", "personal.html\n", "personal\\.html", "file:///personal.html", "https://[", "x".repeat(8193)];
  for (const target of targets) {
    assert.equal(navigationHref(target, publicHref), target);
    assert.equal(copyPublicNavigationContext(publicHref, target), target);
  }
  for (const source of ["https://evil.test/?book=a", "javascript:alert(1)", "https://user:pass@localhost/?book=a", "", null]) {
    assert.deepEqual(readPublicNavigationContext(source), {});
    assert.equal(navigationHref("personal.html", source), "personal.html");
  }
});

test("loopback test routes are supported, unrelated localhost routes are not", () => {
  assert.deepEqual(readPublicNavigationContext("http://127.0.0.1:4187/?book=a&chapter=chapter-1"), { book: "a", chapter: "chapter-1" });
  assert.equal(new URL(navigationHref("personal.html", "http://localhost:4187/?book=a")).hash, "#wb_book=a&wb_site=local");
  assert.deepEqual(readPublicNavigationContext("http://localhost:4187/private/?book=a"), {});
});

test("bootstrap is independent, idempotent, activation reads live search and never changes history/storage", () => {
  const listeners = new Map();
  const styles = new Map();
  const location = { href: publicHref };
  let href = "personal.html";
  const link = { getAttribute: () => href, setAttribute: (_, value) => { href = value; }, matches: () => true };
  const window = { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const document = { defaultView: window, querySelectorAll: () => [link], querySelector: () => ({ getBoundingClientRect: () => ({ height: 100.2 }) }),
    documentElement: { style: { setProperty: (key, value) => styles.set(key, value) } },
    addEventListener(name, fn, capture) { assert.equal(capture, true); listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const controller = setupAppNavigation({ document, location });
  assert.equal(setupAppNavigation({ document, location }), controller);
  assert.equal(new URL(href).hash, `#${carried}&wb_site=pages`);
  assert.equal(styles.get("--app-header-clearance"), "113px");
  location.href = `${pages}?book=another-book&chapter=chapter-9&sort=za`;
  listeners.get("click")({ target: { closest: () => link } });
  assert.deepEqual(readPublicNavigationContext(href), { book: "another-book", chapter: "chapter-9", sort: "za" });
  listeners.get("auxclick")({ target: { closest: () => link } });
  controller.destroy();
  assert.equal(listeners.size, 0);
  assert.equal(setupAppNavigation({ document: null, location }), null);
});

test("header ResizeObserver is optional, measured and disconnected without missing-header side effects", () => {
  let observed = null, disconnected = false, measured = 0;
  const header = { getBoundingClientRect: () => ({ height: 80 }) };
  const window = { ResizeObserver: class { constructor(callback) { this.callback = callback; } observe(target) { observed = target; this.callback(); } disconnect() { disconnected = true; } },
    addEventListener() {}, removeEventListener() {} };
  const document = { defaultView: window, querySelectorAll: () => [], querySelector: () => header,
    documentElement: { style: { setProperty: (key, value) => { assert.equal(key, "--app-header-clearance"); assert.equal(value, "92px"); measured++; } } },
    addEventListener() {}, removeEventListener() {} };
  setupAppNavigation({ document, location: { href: pages } }).destroy();
  assert.equal(observed, header); assert.equal(disconnected, true); assert.ok(measured >= 1);
  document.querySelector = () => null;
  setupAppNavigation({ document, location: { href: pages } }).destroy();
});

test("interactive startup installs capture immediately, then refreshes the same controller after app assignments", () => {
  const documentListeners = new Map(), windowListeners = new Map();
  let href = "./";
  const link = { getAttribute: () => href, setAttribute: (_, value) => { href = value; }, matches: () => true };
  const window = { addEventListener: (name, callback) => windowListeners.set(name, callback), removeEventListener: name => windowListeners.delete(name) };
  const document = { readyState: "interactive", defaultView: window, querySelector: () => null, querySelectorAll: () => [link],
    addEventListener(name, callback, options) {
      if (name === "DOMContentLoaded") assert.deepEqual(options, { once: true });
      else assert.equal(options, true);
      documentListeners.set(name, callback);
    }, removeEventListener: name => documentListeners.delete(name) };
  const controller = setupAppNavigation({ document, location: { href: `${worker}personal.html#${carried}` } });
  assert.equal(setupAppNavigation({ document, location: { href: pages } }), controller);
  assert.equal(documentListeners.has("click"), true);
  assert.equal(documentListeners.has("auxclick"), true);
  assert.deepEqual(Object.fromEntries(new URL(href).searchParams), context);
  // Initial application link assignment does not require another installation.
  href = "./";
  documentListeners.get("DOMContentLoaded")();
  assert.deepEqual(Object.fromEntries(new URL(href).searchParams), context);
  href = "./";
  windowListeners.get("load")();
  assert.deepEqual(Object.fromEntries(new URL(href).searchParams), context);
  controller.destroy();
  assert.equal(documentListeners.size, 0); assert.equal(windowListeners.size, 0);
});

test("public site is actual origin even with empty display scope and spoofed site inputs", () => {
  assert.equal(readPublicNavigationSite(`${pages}?wb_site=worker&site=worker#wb_site=worker`), "pages");
  assert.equal(readPublicNavigationSite(`${worker}?wb_site=pages#wb_site=pages`), "worker");
  assert.equal(readPublicNavigationSite("http://127.0.0.1:4187/?wb_site=pages"), "local");
  const transit = new URL(navigationHref(`${worker}personal.html`, pages));
  assert.equal(transit.hash, "#wb_site=pages");
  assert.deepEqual(readPublicNavigationContext(transit.href), {});
  const returned = new URL(navigationHref("./", transit.href));
  assert.equal(returned.href, pages);
});

test("Pages public -> fixed Worker personal/auth -> Pages preserves original public records origin", () => {
  const transit = new URL(navigationHref(`${worker}personal.html?auth=owner#lookup=existing`, publicHref));
  assert.equal(transit.origin, new URL(worker).origin);
  assert.equal(transit.search, "?auth=owner");
  assert.equal(readPublicNavigationSite(transit.href), "pages");
  assert.equal(new URLSearchParams(transit.hash.slice(1)).get("lookup"), "existing");
  const mode = copyPublicNavigationContext(transit.href, `${worker}personal.html?auth=member#lookup=existing`);
  assert.equal(new URL(mode).origin, new URL(worker).origin);
  assert.equal(readPublicNavigationSite(mode), "pages");
  const redirected = copyPublicNavigationContext(`${pages}personal.html#${carried}&wb_site=pages`, `${worker}personal.html?auth=member#lookup=existing`);
  assert.equal(new URL(redirected).origin, new URL(worker).origin);
  assert.equal(readPublicNavigationSite(redirected), "pages");
  const returned = new URL(navigationHref("./", mode));
  assert.equal(returned.origin, new URL(pages).origin);
  assert.equal(returned.pathname, "/vocab/");
  assert.deepEqual(Object.fromEntries(returned.searchParams), context);
  assert.equal(returned.hash, "");
});

test("Worker public -> fixed Pages notes/guide/dictionary -> Worker preserves public records origin", () => {
  for (const route of ["quick-notes.html", "guide.html", "dictionary.html#q=existing"]) {
    const transit = new URL(navigationHref(`${pages}${route}`, `${worker}?${new URLSearchParams(context)}`));
    assert.equal(transit.origin, new URL(pages).origin);
    assert.equal(readPublicNavigationSite(transit.href), "worker");
    if (route.startsWith("dictionary")) {
      assert.equal(transit.hash, "#q=existing");
      transit.hash = "q=new-query";
      assert.equal(readPublicNavigationSite(transit.href), "worker");
    }
    const returned = new URL(navigationHref("./", transit.href));
    assert.equal(returned.origin, new URL(worker).origin);
    assert.equal(returned.pathname, "/");
    assert.deepEqual(Object.fromEntries(returned.searchParams), context);
    assert.equal(returned.hash, "");
  }
});

test("invalid, duplicate, foreign and production-local site tokens cannot choose a return origin", () => {
  for (const token of ["evil", "https://evil.test/", "//evil.test/", "PAGES", "pages ", "constructor", "__proto__", "local", ""]) {
    const source = `${worker}personal.html#${carried}&wb_site=${encodeURIComponent(token)}`;
    assert.equal(readPublicNavigationSite(source), "");
    assert.equal(new URL(navigationHref("./", source)).origin, new URL(worker).origin);
    assert.equal(new URL(navigationHref("./", source, { ...context, site: "pages", wb_site: "pages" })).origin, new URL(worker).origin);
  }
  for (const suffix of ["wb_site=pages&wb_site=pages", "wb_site=pages&wb_site=worker"]) {
    assert.equal(readPublicNavigationSite(`${worker}personal.html#${suffix}`), "");
    assert.equal(readPublicNavigationSite(`${pages}dictionary.html?${suffix}#wb_site=worker`), "");
  }
  assert.equal(readPublicNavigationSite("https://evil.test/personal.html#wb_site=pages"), "");
  assert.equal(readPublicNavigationSite(`${worker}api/v1/member/entries#wb_site=pages`), "");
  assert.equal(new URL(navigationHref(`${pages}?wb_site=worker&wb_auth=private`, `${worker}personal.html`)).href, pages);
});

test("local site is usable only on current loopback; marker never supplies a host or copies storage", () => {
  const source = `http://127.0.0.1:4187/personal#${carried}&wb_site=local`;
  assert.equal(readPublicNavigationSite(source), "local");
  const returned = new URL(navigationHref(pages, source));
  assert.equal(returned.origin, "http://127.0.0.1:4187");
  assert.deepEqual(Object.fromEntries(returned.searchParams), context);
  assert.equal(returned.hash, "");
  const notes = new URL(navigationHref(`${pages}quick-notes.html`, "http://127.0.0.1:4187/"));
  assert.equal(notes.origin, new URL(pages).origin);
  assert.equal(new URLSearchParams(notes.hash.slice(1)).has("wb_site"), false);
  const fixedAuth = new URL(copyPublicNavigationContext(source, `${worker}personal.html?auth=owner`));
  assert.equal(fixedAuth.origin, new URL(worker).origin);
  assert.equal(new URLSearchParams(fixedAuth.hash.slice(1)).has("wb_site"), false);
});
