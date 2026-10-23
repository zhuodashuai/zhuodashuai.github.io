// Navigation carries public display scope and a finite public-site marker,
// never a private draft, identity, arbitrary return URL or command.
const FIELDS = ["book", "chapter", "view", "sort"];
const VIEWS = new Set(["cards", "passages", "synonyms"]);
// Keep this finite list aligned with entry-sort.js, including public source order.
const SORTS = new Set(["newest", "oldest", "az", "za", "source"]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ROUTES = new Set(["", "index.html", "personal.html", "dictionary.html", "quick-notes.html", "owner.html", "guide.html"]);
const CLEAN_ROUTES = new Map(["personal", "dictionary", "quick-notes", "owner", "guide"].map(route => [route, `${route}.html`]));
const MAX_URL = 8192;
const PUBLIC_ROOTS = { pages: "https://zhuodashuai.github.io/vocab/", worker: "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/" };

function loopback(url) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url?.hostname);
}

function parseUrl(value, base) {
  if (typeof value !== "string" || !value || value.length > MAX_URL
    || value !== value.trim() || /[\\\u0000-\u0020\u007f]/u.test(value) || value.startsWith("//")) return null;
  try {
    const url = new URL(value, base);
    if (url.username || url.password) return null;
    return url;
  } catch { return null; }
}

function appRoute(url) {
  if (!url) return null;
  const local = loopback(url);
  if (local ? !["http:", "https:"].includes(url.protocol) : url.protocol !== "https:") return null;
  let prefix;
  if (url.hostname === "zhuodashuai.github.io" && !url.port) prefix = "/vocab/";
  else if (url.hostname === "zhuo-wordbook-api.zhuo-wordbook-api.workers.dev" && !url.port) prefix = "/";
  else if (local) prefix = "/";
  else return null;
  if (!url.pathname.startsWith(prefix)) return null;
  const route = url.pathname.slice(prefix.length);
  // Cloudflare's root-mounted static HTML canonicalizes .html to clean paths.
  // This is a logical classification only: never change the actual target path.
  if (prefix === "/" && CLEAN_ROUTES.has(route)) return CLEAN_ROUTES.get(route);
  return ROUTES.has(route) ? route : null;
}

function validValue(field, value) {
  if (typeof value !== "string") return false;
  if (field === "view") return VIEWS.has(value);
  if (field === "sort") return SORTS.has(value);
  return value.length <= 100 && SLUG.test(value);
}

function readFields(parameters, prefix) {
  const context = {};
  for (const field of FIELDS) {
    const values = parameters.getAll(`${prefix}${field}`);
    // Ambiguous duplicated fields are not a return instruction.
    if (values.length === 1 && validValue(field, values[0])) context[field] = values[0];
  }
  // A chapter is meaningful only within a named public book.
  if (!context.book || context.book === "all" || context.book === "main") delete context.chapter;
  return context;
}

function hashParameters(hash) {
  return new URLSearchParams(hash.replace(/^#/u, ""));
}

function contextForNavigation(source, retainedContext) {
  const context = readPublicNavigationContext(source.href);
  if (Object.keys(context).length || ["", "index.html"].includes(appRoute(source))) return context;
  // An app may replace its own q/lookup fragment after an explicit new query.
  // Retain only scope previously read by this document, never private search.
  // An explicit but invalid wb_ fragment does not fall back to old scope.
  if ([...hashParameters(source.hash).keys()].some(key => key.startsWith("wb_"))
    || appRoute(source) === "dictionary.html" && [...source.searchParams.keys()].some(key => key.startsWith("wb_"))) return context;
  const parameters = new URLSearchParams();
  for (const field of FIELDS) if (validValue(field, retainedContext?.[field])) parameters.set(field, retainedContext[field]);
  return readFields(parameters, "");
}

function needsContextChange(target, context, restorePublicSearch = false, dictionary = false, site = "") {
  return Boolean(site) || Object.keys(context).length > 0
    || [...hashParameters(target.hash).keys()].some(key => key.startsWith("wb_"))
    || dictionary && [...target.searchParams.keys()].some(key => key.startsWith("wb_"))
    || restorePublicSearch && (FIELDS.some(field => target.searchParams.has(field))
      || [...target.searchParams.keys()].some(key => key.startsWith("wb_")));
}

/** Public pages read live search; other shells read wb_ fragments (dictionary: wb_ query). */
export function readPublicNavigationContext(locationHref) {
  const url = parseUrl(locationHref);
  const route = appRoute(url);
  if (route === null) return {};
  // Dictionary lookup owns/replaces its q fragment. Public scope alone uses
  // namespaced query fields there so explicit new lookups and reloads retain it.
  if (route === "dictionary.html" && [...url.searchParams.keys()].some(key => key.startsWith("wb_"))) {
    return readFields(url.searchParams, "wb_");
  }
  return route === "" || route === "index.html"
    ? readFields(url.searchParams, "")
    : readFields(hashParameters(url.hash), "wb_");
}

/** Finite original PUBLIC site only; never a return URL or a private identity. */
export function readPublicNavigationSite(locationHref) {
  const url = parseUrl(locationHref);
  const route = appRoute(url);
  if (route === null) return "";
  if (route === "" || route === "index.html") {
    if (loopback(url)) return "local";
    return url.origin === new URL(PUBLIC_ROOTS.pages).origin ? "pages" : "worker";
  }
  const parameters = route === "dictionary.html" && [...url.searchParams.keys()].some(key => key.startsWith("wb_"))
    ? url.searchParams : hashParameters(url.hash);
  const values = parameters.getAll("wb_site");
  if (values.length !== 1) return "";
  return values[0] === "pages" || values[0] === "worker" || values[0] === "local" && loopback(url) ? values[0] : "";
}

function siteForTarget(site, target) {
  return site === "pages" || site === "worker" || site === "local" && loopback(target) ? site : "";
}

function mergeContext(target, context, site = "") {
  // Named document anchors (especially inline public lookup) must stay anchors.
  if (target.hash && !target.hash.includes("=")) return false;
  const parameters = hashParameters(target.hash);
  for (const key of [...parameters.keys()]) if (key.startsWith("wb_")) parameters.delete(key);
  for (const field of FIELDS) {
    if (validValue(field, context[field])) parameters.set(`wb_${field}`, context[field]);
  }
  if (siteForTarget(site, target)) parameters.set("wb_site", site);
  target.hash = parameters.toString();
  return true;
}

/**
 * Preserve an already chosen safe target, including its auth origin/search and
 * existing lookup/q fragment. Only wb_ fields are copied from the source.
 * This is also the Pages -> fixed Worker personal redirect helper.
 */
export function copyPublicNavigationContext(sourceHref, targetHref) {
  const source = parseUrl(sourceHref);
  const target = parseUrl(targetHref, source?.href);
  if (appRoute(source) === null || appRoute(target) === null) return targetHref;
  const context = readPublicNavigationContext(sourceHref);
  const site = readPublicNavigationSite(sourceHref);
  if (!needsContextChange(target, context, false, false, site) || !mergeContext(target, context, site)) return targetHref;
  return target.href;
}

/** Ordinary safe app links; a public return reconstructs only its public search. */
export function navigationHref(targetHref, sourceHref, retainedContext = null) {
  const source = parseUrl(sourceHref);
  let target = parseUrl(targetHref, source?.href);
  const route = appRoute(target);
  if (appRoute(source) === null || route === null) return targetHref;
  const context = contextForNavigation(source, retainedContext);
  const dictionary = route === "dictionary.html";
  const publicReturn = route === "" || route === "index.html";
  const site = readPublicNavigationSite(sourceHref);
  if (!needsContextChange(target, context, publicReturn, dictionary, site)) return targetHref;
  if (!mergeContext(target, dictionary || publicReturn ? {} : context, dictionary || publicReturn ? "" : site)) return targetHref;
  if (dictionary) {
    for (const key of [...target.searchParams.keys()]) if (key.startsWith("wb_")) target.searchParams.delete(key);
    for (const field of FIELDS) if (validValue(field, context[field])) target.searchParams.set(`wb_${field}`, context[field]);
    if (siteForTarget(site, target)) target.searchParams.set("wb_site", site);
  }
  if (publicReturn) {
    const root = PUBLIC_ROOTS[site] || (site === "local" && loopback(source) ? `${source.origin}/` : "");
    if (root) {
      const restored = new URL(root);
      restored.search = target.search;
      restored.hash = target.hash;
      target = restored;
    }
    for (const key of [...target.searchParams.keys()]) if (key.startsWith("wb_")) target.searchParams.delete(key);
    for (const field of FIELDS) {
      target.searchParams.delete(field);
      if (validValue(field, context[field])) target.searchParams.set(field, context[field]);
    }
  }
  return target.href;
}
