import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const vocabHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const ownerHtml = await readFile(new URL("../owner.html", import.meta.url), "utf8");
const guideHtml = await readFile(new URL("../guide.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const ownerAppSource = await readFile(new URL("../js/owner-app.js", import.meta.url), "utf8");
const publicAppSource = await readFile(new URL("../js/public-app.js", import.meta.url), "utf8");
const snapshotSource = await readFile(new URL("../js/public-snapshot.js", import.meta.url), "utf8");
const entryDetailSource = await readFile(new URL("../js/entry-detail.js", import.meta.url), "utf8");
const ownerApiSource = await readFile(new URL("../js/owner-api.js", import.meta.url), "utf8");
const runtimeConfigSource = await readFile(new URL("../js/runtime-config.js", import.meta.url), "utf8");
const workerConfigSource = await readFile(new URL("../../wordbook-api/wrangler.jsonc", import.meta.url), "utf8");
const profileHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8");

test("changed module APIs use one versioned browser graph before any service worker can update", async () => {
  const changed = new Set([
    "app-navigation.js", "app-navigation-entry.js",
    "dictionary-entry.js", "dictionary-offline-warm.js",
    "entry-sort.js", "personal-folders.js",
    "owner-public-library.js", "library-lookup-ui.js", "library-lookup-controller.js",
    "dictionary-examples-ui.js",
    "chinese-search.js", "chinese-related-common.js",
    "dictionary-suggestions.js", "core-pos-corrections.js", "dictionary-collection.js", "runtime-config.js", "public-app.js", "owner-app.js", "dictionary-app.js", "dictionary-examples.js", "dictionary-navigation.js", "personal-app.js", "personal-lookup-flow.js", "expanded-dictionary.js", "personal-api.js", "personal-storage.js", "personal-selection.js", "personal-study.js", "personal-dictionary.js", "member-dictionary-manifest.js", "book-passages.js", "book-passages-ui.js",
    "owner-api.js", "owner-storage.js", "entry-detail.js", "synonym-groups.js", "synonym-evidence.js",
    "wordbook-schema.js", "collections.js", "owner-backup.js", "sync-logic.js",
    "chapter-quiz.js", "quiz-storage.js", "chapter-quiz-ui.js", "public-snapshot.js", "learning-backup.js", "learning-backup-ui.js", "pwa.js", "synonym-view.js", "quick-notes-storage.js", "quick-notes-app.js"
  ]);
  const version = file => ["dictionary-entry.js", "expanded-dictionary.js", "dictionary-app.js", "library-lookup-controller.js", "library-lookup-ui.js", "public-app.js", "personal-app.js", "owner-app.js"].includes(file) ? 104 : ["dictionary-offline-warm.js"].includes(file) ? 102 : ["entry-sort.js", "personal-folders.js", "personal-api.js"].includes(file) ? 100 : ["owner-public-library.js"].includes(file) ? 99 : ["dictionary-collection.js"].includes(file) ? 98 : ["personal-dictionary.js", "personal-lookup-flow.js", "member-dictionary-manifest.js"].includes(file) ? 97 : ["dictionary-examples-ui.js", "dictionary-examples.js", "entry-detail.js"].includes(file) ? 96 : ["chinese-related-common.js", "chinese-search.js"].includes(file) ? 95 : ["dictionary-suggestions.js"].includes(file) ? 89 : ["core-pos-corrections.js"].includes(file) ? 88 : ["book-passages-ui.js","book-passages.js","chapter-quiz-ui.js","chapter-quiz.js","collections.js","learning-backup-ui.js","learning-backup.js","owner-api.js","owner-backup.js","owner-storage.js","personal-storage.js","personal-selection.js","public-snapshot.js","quiz-storage.js","sync-logic.js","synonym-groups.js","synonym-view.js","wordbook-schema.js"].includes(file) ? 82
    : ["public-app.js", "dictionary-navigation.js"].includes(file) ? 80
    : ["personal-storage.js", "personal-selection.js", "member-dictionary-manifest.js"].includes(file) ? 78 : 77;
  const currentVersion = file => ["expanded-dictionary.js", "dictionary-app.js", "library-lookup-controller.js", "library-lookup-ui.js", "personal-lookup-flow.js"].includes(file) ? 111
    : ["personal-app.js", "app-navigation.js", "app-navigation-entry.js"].includes(file) ? 107 : version(file);
  const files = await readdir(new URL("../js/", import.meta.url));
  for (const file of files.filter((name) => name.endsWith(".js"))) {
    const source = await readFile(new URL(`../js/${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/\bfrom\s+["'](\.\/[^"']+)["']/g)) {
      const target = match[1].slice(2).split("?")[0];
      // The archived v108 entry keeps its original compatible dependency;
      // only the two fresh ranking readers require the new atom export.
      if (file === "dictionary-app-v108.js" && target === "expanded-dictionary.js") {
        assert.equal(match[1], "./expanded-dictionary.js?v=104"); continue;
      }
      if (["expanded-dictionary.js", "chinese-ranking.js"].includes(file) && target === "chinese-search.js") {
        assert.equal(match[1], "./chinese-search.js?v=111"); continue;
      }
      if (changed.has(target)) assert.equal(match[1], `./${target}?v=${currentVersion(target)}`, `${file} must not import a fresh old HTTP-cache dependency`);
    }
  }
  for (const file of changed) {
    assert.ok(serviceWorker.includes(`"./js/${file}?v=${currentVersion(file)}"`), `${file}'s versioned browser URL must work offline`);
    assert.ok(serviceWorker.includes(`"./js/${file}"`), `${file}'s existing bare offline URL remains available`);
  }
});

test("inline lookup, folders and existing entry points share one coherent module graph", async () => {
  for (const resource of ["library-lookup.css", "js/library-lookup-ui.js", "js/library-lookup-controller.js"]) {
    const version = resource === "library-lookup.css" ? 99 : 111;
    assert.ok(serviceWorker.includes(`"./${resource}?v=${version}"`), `${resource} needs its current offline URL`);
    assert.ok(serviceWorker.includes(`"./${resource}"`), `${resource} needs its bare offline URL`);
    assert.ok((await readFile(new URL(`../${resource}`, import.meta.url))).length > 0, `${resource} must be a real shell resource`);
  }
  assert.match(vocabHtml, /href="library-lookup\.css\?v=99"/u);
  assert.match(vocabHtml, /src="js\/public-app-v108\.js"/u);
  assert.ok(serviceWorker.includes('"./js/owner-public-library.js?v=99"'));
  assert.ok(serviceWorker.includes('"./js/dictionary-app.js?v=104"'));
  // Existing entry points must not load a second version of a changed module.
  const dictionaryHtml = await readFile(new URL("../dictionary.html", import.meta.url), "utf8");
  const personalHtml = await readFile(new URL("../personal.html", import.meta.url), "utf8");
  const personalApp = await readFile(new URL("../js/personal-app-v108.js", import.meta.url), "utf8");
  assert.match(dictionaryHtml, /src="js\/dictionary-entry-v109\.js"/u);
  assert.match(personalHtml, /src="js\/personal-app-v108\.js"/u);
  assert.match(personalApp, /from "\.\/owner-public-library\.js\?v=99"/u);
  // The active import graph has one current URL (checked above); explicitly
  // retained cache aliases keep already-open/offline readers working too.
  for (const [name, versions] of [["owner-public-library", ["99"]], ["dictionary-app", ["111", "104", "103", "99"]], ["personal-app", ["107", "105", "104", "103", "100"]]]) {
    const urls = [...serviceWorker.matchAll(new RegExp(`"\\./js/${name}\\.js\\?v=(\\d+)"`, "gu"))];
    assert.deepEqual(urls.map(match => match[1]), versions, `${name} must have only its reviewed current and legacy cache URLs`);
  }
  const shell = serviceWorker.slice(serviceWorker.indexOf("const SHELL"), serviceWorker.indexOf('self.addEventListener("install"'));
  assert.doesNotMatch(shell, /\/api\/v1\//u, "authenticated or mutable API responses cannot enter the shell cache");
});

async function pngDimensions(path) {
  const bytes = await readFile(new URL(path, import.meta.url));
  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("PWA publishes separate any and safe maskable icons at declared sizes", async () => {
  const anyIcons = manifest.icons.filter((icon) => icon.purpose === "any");
  const maskableIcons = manifest.icons.filter((icon) => icon.purpose === "maskable");
  assert.equal(anyIcons.length, 2);
  assert.equal(maskableIcons.length, 2);
  for (const icon of manifest.icons) {
    const size = Number(icon.sizes.split("x")[0]);
    assert.deepEqual(await pngDimensions(`../${icon.src}`), { width: size, height: size });
  }
});

test("quality evidence is network-first with an offline fallback", () => {
  const reportRoute = serviceWorker.indexOf('url.pathname.endsWith("/quality/generated-report.json")');
  const reportNetworkFirst = serviceWorker.indexOf("event.respondWith(networkFirst(request));", reportRoute);
  const genericCacheFirst = serviceWorker.lastIndexOf("event.respondWith(cacheFirst(request, event))");
  assert.ok(reportRoute >= 0);
  assert.ok(reportNetworkFirst > reportRoute);
  assert.ok(genericCacheFirst > reportNetworkFirst);
  assert.match(serviceWorker, /const cached = await cache\.match\(request/);
  assert.match(serviceWorker, /return new Response\("Offline", \{ status: 503/);
});

test("book original examples are precached and refreshed online without touching private APIs", () => {
  assert.ok(serviceWorker.includes('"./data/book-passages.json"'));
  const route = serviceWorker.indexOf('url.pathname.endsWith("/data/book-passages.json")');
  const networkFirst = serviceWorker.indexOf("event.respondWith(networkFirst(request));", route);
  assert.ok(route >= 0 && networkFirst > route);
});

test("mutable script, style and manifest assets revalidate online before using the offline cache", () => {
  const mutableRoute = serviceWorker.indexOf('/\\.(?:js|css|webmanifest)$/i.test(url.pathname)');
  const mutableNetworkFirst = serviceWorker.indexOf("event.respondWith(networkFirst(request));", mutableRoute);
  const genericCacheFirst = serviceWorker.lastIndexOf("event.respondWith(cacheFirst(request, event))");
  assert.ok(mutableRoute >= 0, "mutable assets need an explicit route");
  assert.ok(mutableNetworkFirst > mutableRoute, "mutable assets must be network-first");
  assert.ok(genericCacheFirst > mutableNetworkFirst, "only immutable assets should reach cache-first");
});

test("the academic profile provides a discoverable route to the word cabinet", () => {
  assert.match(profileHtml, /href="vocab\/"[^>]*>卓的单词本/);
  assert.match(vocabHtml, /href="https:\/\/zhuodashuai\.github\.io\/"[^>]*>学术主页/);
  assert.match(profileHtml, /Owner-only GitHub publishing/);
  assert.doesNotMatch(profileHtml, /optional private GitHub backup/);
});

test("the PWA shell separates the public reader from the authenticated owner app", () => {
  assert.match(serviceWorker, /zhuo-wordbook-v100/);
  assert.match(serviceWorker, /\.\/owner\.html/);
  assert.match(serviceWorker, /\.\/guide\.html/);
  assert.match(serviceWorker, /\.\/styles\.css\?v=96/);
  assert.match(serviceWorker, /\.\/js\/public-app\.js\?v=101/);
  assert.match(serviceWorker, /\.\/js\/owner-app\.js\?v=97/);
  assert.match(serviceWorker, /\.\/js\/dictionary-suggestions\.js\?v=89/);
  assert.match(serviceWorker, /\/data\/dictionary-suggestions\/manifest\.json/);
  assert.match(serviceWorker, /\.\/js\/public-snapshot\.js/);
  assert.match(serviceWorker, /\.\/js\/learning-backup\.js/);
  assert.match(serviceWorker, /\.\/js\/learning-backup-ui\.js/);
  assert.match(serviceWorker, /\.\/js\/owner-backup\.js/);
  assert.match(serviceWorker, /\.\/js\/pronunciation\.js/);
  assert.match(serviceWorker, /\.\/js\/pronunciation-ui\.js/);
  assert.match(serviceWorker, /\.\/js\/chapter-quiz\.js/);
  assert.match(serviceWorker, /\.\/js\/quiz-storage\.js/);
  assert.match(serviceWorker, /\.\/js\/chapter-quiz-ui\.js/);
  assert.match(serviceWorker, /\.\/js\/synonym-groups\.js/);
  assert.match(serviceWorker, /\.\/js\/synonym-view\.js/);
  assert.match(serviceWorker, /\.\/js\/synonym-evidence\.js/);
  assert.match(serviceWorker, /\.\/js\/collections\.js/);
  assert.match(serviceWorker, /\.\/js\/study\.js/);
  assert.match(serviceWorker, /\.\/js\/review\.js/);
  assert.match(serviceWorker, /\.\/js\/core-dictionary\.js/);
  assert.match(serviceWorker, /\.\/js\/entry-detail\.js/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(vocabHtml, /src="js\/public-app-v108\.js"/);
  assert.match(vocabHtml, /href="styles\.css\?v=100"/);
  assert.match(ownerHtml, /src="js\/owner-app-v108\.js"/);
  assert.match(ownerHtml, /href="styles\.css\?v=96"/);
  assert.match(guideHtml, /href="styles\.css\?v=100"/);
  assert.match(vocabHtml, /id="owner-link"[^>]*>卓的公开词本/);
  assert.match(ownerHtml, /id="login-link"[^>]*>使用 GitHub 登录/);
  assert.match(ownerHtml, /id="auth-gate"[^>]*>[\s\S]*?只有你可以进入/);
  assert.match(ownerHtml, /id="owner-workspace" hidden inert/);
  // The cost disclosure now lives once, in the manual, and both pages link to it.
  assert.match(guideHtml, /Cloudflare Workers AI.*不需要第三方模型 API key/s);
  assert.match(guideHtml, /每个 UTC 日有 20 份站内服务额度/);
  assert.match(guideHtml, /暂停的同义词识别不会因打开管理页或发布词条而发起请求/);
  assert.match(guideHtml, /最多尝试三款/);
  assert.doesNotMatch(guideHtml + profileHtml + ownerAppSource, /Claude|Anthropic|anthropic/);
  assert.match(guideHtml, /这不是永久免费承诺/);
  assert.match(guideHtml, /额度用完不会切换收费引擎/);
  assert.match(ownerHtml, /href="guide\.html"/);
  assert.match(vocabHtml, /href="guide\.html"/);
  // Explanation belongs in the manual, not in the capture panel.
  assert.doesNotMatch(ownerHtml, /panel-detail|永久免费/);
  assert.match(ownerHtml, /id="capture-title">添加词条/);
  assert.match(ownerHtml, /id="capture-input"[^>]*aria-describedby="capture-key-hint"/);
  assert.match(ownerHtml, /<footer\b[^>]*>[\s\S]*?href="guide\.html">使用手册<\/a>/);
  assert.match(ownerHtml, /href="\.\/" aria-label="查看公开词库">公开词库<\/a>/);
  assert.match(ownerHtml, /id="retry-queue"[^>]*hidden/);
  assert.match(ownerHtml, /<details class="backup-panel">/);
  assert.doesNotMatch(ownerHtml, /只写英文，剩下的交给整理器|草稿与同步队列/);
  assert.match(ownerAppSource, /refs\.retryQueue\.hidden = !operations\.some/);
  assert.match(stylesSource, /\.editor-empty\s*\{[^}]*min-height:\s*150px/s);
  assert.match(serviceWorker, /\.\/guide\.html/);
  assert.match(stylesSource, /\.update-banner\s*\{[^}]*right:\s*1rem[^}]*bottom:\s*max\(1rem,\s*env\(safe-area-inset-bottom\)\)/s);
  assert.doesNotMatch(stylesSource, /\.update-banner\s*\{[^}]*top:\s*1rem/s);
  assert.match(stylesSource, /@media \(max-width:\s*900px\)\s*\{[^}]*\.editor-actions\s*\{[^}]*position:\s*static/s);
  assert.doesNotMatch(ownerHtml, /默认由服务端 OpenAI/);
  assert.doesNotMatch(ownerHtml, /type="password"|personal access token|PAT/i);
  assert.doesNotMatch(ownerApiSource, /localStorage|sessionStorage|Authorization:\s*`Bearer/);
  assert.match(publicAppSource, /fetchPublicSnapshot\(\{ candidates, snapshot: state\.snapshot, etag: state\.liveEtag \}\)/);
  assert.match(snapshotSource, /headers\["If-None-Match"\] = etag/);
  assert.match(snapshotSource, /response\.status === 304/);
  assert.match(runtimeConfigSource, /https:\/\/zhuo-wordbook-api\.zhuo-wordbook-api\.workers\.dev\//);
  assert.match(workerConfigSource, /"run_worker_first"\s*:\s*true/);
});

test("the numbered related-meaning manual table and its scoped stylesheet remain available offline", async () => {
  assert.ok(serviceWorker.includes('"./guide-related.css?v=95"'));
  assert.ok(serviceWorker.includes('"./guide-related.css"'));
  assert.match(guideHtml, /href="guide-related\.css\?v=95"/u);
  assert.match(guideHtml, /<details id="chinese-related-catalogue">/u);
  assert.equal((guideHtml.match(/data-related-number=/gu) || []).length, 60);
  assert.match(guideHtml, /<summary>中文近义词表（55–114）<\/summary>/u);
  assert.match(guideHtml, /<table[^>]*data-related-batch="003"/u);
  assert.match(guideHtml, /<table[^>]*data-related-batch="004"/u);
  const css = await readFile(new URL("../guide-related.css", import.meta.url), "utf8");
  assert.match(css, /table-layout:\s*fixed/u); assert.match(css, /overflow-wrap:\s*anywhere/u);
  assert.match(css, /body\[data-page="guide"\]/u);
});

test("paused synonyms stay hidden without removing stored fields or reference validation", () => {
  assert.match(ownerHtml, /id="synonyms-field" hidden/);
  assert.match(ownerHtml, /id="field-synonyms"/);
  assert.match(ownerAppSource, /const rawSynonyms = SYNONYM_FEATURE_ENABLED/);
  assert.match(ownerAppSource, /const synonyms = allowedSynonymsFor\(term, rawSynonyms\)/);
  assert.match(ownerAppSource, /organizeWithAi\(cleaned, state\.csrfToken, \{ allowedSynonyms \}\)/);
  assert.match(ownerAppSource, /setValue\("fieldSynonyms", entry\.synonyms\?\.join/);
  assert.match(entryDetailSource, /entry\.synonyms/);
  assert.match(entryDetailSource, /SYNONYM_FEATURE_ENABLED && entry\.synonyms\.length/);
  assert.match(ownerAppSource, /if \(!SYNONYM_FEATURE_ENABLED\) return false/);
  assert.match(publicAppSource, /SYNONYM_FEATURE_ENABLED/);
  assert.match(vocabHtml, /data-view="synonyms"[^>]*hidden/);
  assert.match(guideHtml, /同义词功能暂缓开放/);
  assert.match(vocabHtml, /搜索本章或词本已有的词/);
  assert.match(stylesSource, /\.word-card \.card-synonyms/);
});

test("owner lookup shows a safe local preview while the slower AI organizer runs", () => {
  assert.match(ownerAppSource, /import \{ lookupCoreEntry \} from "\.\/core-dictionary\.js\?v=77"/);
  assert.match(ownerAppSource, /lookupCoreEntry\(cleaned, \{ timeoutMs: 3_000 \}\)/);
  assert.match(ownerAppSource, /source: "本地 ECDICT"/);
  assert.match(ownerAppSource, /searchExpandedDictionary\(cleaned/);
  assert.match(ownerAppSource, /localPreviewSource/);
  assert.match(ownerAppSource, /候选不会自动发布/);
  assert.match(ownerAppSource, /window\.setInterval\(renderBusyProgress, 5_000\)/);
  assert.match(ownerAppSource, /window\.clearInterval\(elapsedTimer\)/);
  assert.match(ownerAppSource, /refs\.organizeButton\.disabled = disabled \|\| aiUnavailable \|\| !state\.snapshot/);
  assert.match(ownerAppSource, /await Promise\.all\(\[\s*refreshAiStatus\(\),\s*renderDrafts\(\),\s*loadRemote\(\)\.catch/s);
});

test("polysemous meaning formatting is wired into owner, public card, detail and copy views", () => {
  assert.match(ownerAppSource, /setMultilineText\(meaning, formatMeaningForDisplay\(entry\)\)/);
  assert.match(entryDetailSource, /renderMeaning\(refs\.dialogMeaning, entry\)/);
  assert.match(entryDetailSource, /const meaning = formatMeaningForDisplay\(entry\)/);
  assert.match(publicAppSource, /renderLearningPoints\(meaning, entry\)/);
  assert.match(publicAppSource, /const meaning = formatMeaningForDisplay\(entry\)/);
  assert.match(entryDetailSource, /entry\.partOfSpeech\s*\?\s*`词性：\$\{entry\.partOfSpeech\}`\s*:\s*""/);
  assert.match(entryDetailSource, /formatMeaningForDisplay\(entry\)/);
});

test("owner publication applies the browser Chinese-quality and structured-sense gate", () => {
  assert.match(ownerAppSource, /isPlausibleChineseMeaning\(entry\?\.meaning, entry\?\.term\)/);
  assert.match(ownerAppSource, /reconcileLexicalEntryForPublish\(entry, \{ allowLegacyWithoutSenses \}\)/);
  assert.match(ownerAppSource, /state\.currentDraft\.mode === "edit"/);
  assert.match(ownerAppSource, /isPlausibleChineseMeaning\(aiEntry\.meaning, aiEntry\.term\)/);
});

test("public and owner readers share the same accessible entry detail controller", () => {
  assert.match(entryDetailSource, /export function createEntryDetailController/);
  assert.match(publicAppSource, /import \{ createEntryDetailController \} from "\.\/entry-detail\.js\?v=96"/);
  assert.match(ownerAppSource, /import \{ createEntryDetailController \} from "\.\/entry-detail\.js\?v=96"/);
  assert.match(publicAppSource, /const entryDetail = createEntryDetailController\(\{/);
  assert.match(ownerAppSource, /const entryDetail = createEntryDetailController\(\{/);
  assert.match(vocabHtml, /<dialog class="entry-dialog" id="entry-dialog" aria-labelledby="dialog-term">/);
  assert.match(ownerHtml, /<dialog class="entry-dialog" id="entry-dialog" aria-labelledby="dialog-term">/);
  assert.match(ownerHtml, /aria-label="关闭词条详情"/);
  assert.match(ownerAppSource, /className = "owner-entry-term-button"/);
  assert.match(ownerAppSource, /term\.setAttribute\("aria-label", `查看 \$\{entry\.term\} 的完整词条`\)/);
  assert.match(stylesSource, /\.owner-entry-term-button\s*\{[^}]*min-width:\s*0[^}]*text-align:\s*left/s);
});

test("the public reader auto-applies app updates while the owner keeps the draft-safe manual gate", () => {
  assert.match(publicAppSource, /setupPwa\(\{[\s\S]*?autoApplyUpdate:\s*true[\s\S]*?\}\)/);
  assert.doesNotMatch(ownerAppSource, /autoApplyUpdate:\s*true/);
  assert.match(ownerAppSource, /beforeApplyUpdate:\s*flushPendingDraftSave/);
});
