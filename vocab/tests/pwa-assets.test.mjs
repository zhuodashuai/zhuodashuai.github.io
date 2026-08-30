import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
const vocabHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const ownerHtml = await readFile(new URL("../owner.html", import.meta.url), "utf8");
const guideHtml = await readFile(new URL("../guide.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const ownerAppSource = await readFile(new URL("../js/owner-app.js", import.meta.url), "utf8");
const publicAppSource = await readFile(new URL("../js/public-app.js", import.meta.url), "utf8");
const entryDetailSource = await readFile(new URL("../js/entry-detail.js", import.meta.url), "utf8");
const ownerApiSource = await readFile(new URL("../js/owner-api.js", import.meta.url), "utf8");
const runtimeConfigSource = await readFile(new URL("../js/runtime-config.js", import.meta.url), "utf8");
const workerConfigSource = await readFile(new URL("../../wordbook-api/wrangler.jsonc", import.meta.url), "utf8");
const profileHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8");

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
  const genericCacheFirst = serviceWorker.lastIndexOf("event.respondWith(cacheFirst(request))");
  assert.ok(reportRoute >= 0);
  assert.ok(reportNetworkFirst > reportRoute);
  assert.ok(genericCacheFirst > reportNetworkFirst);
  assert.match(serviceWorker, /const cached = await cache\.match\(request/);
  assert.match(serviceWorker, /return new Response\("Offline", \{ status: 503/);
});

test("mutable script, style and manifest assets revalidate online before using the offline cache", () => {
  const mutableRoute = serviceWorker.indexOf('/\\.(?:js|css|webmanifest)$/i.test(url.pathname)');
  const mutableNetworkFirst = serviceWorker.indexOf("event.respondWith(networkFirst(request));", mutableRoute);
  const genericCacheFirst = serviceWorker.lastIndexOf("event.respondWith(cacheFirst(request))");
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
  assert.match(serviceWorker, /zhuo-wordbook-v53/);
  assert.match(serviceWorker, /\.\/owner\.html/);
  assert.match(serviceWorker, /\.\/guide\.html/);
  assert.match(serviceWorker, /\.\/styles\.css\?v=53/);
  assert.match(serviceWorker, /\.\/js\/public-app\.js\?v=53/);
  assert.match(serviceWorker, /\.\/js\/owner-app\.js\?v=53/);
  assert.match(serviceWorker, /\.\/js\/core-dictionary\.js/);
  assert.match(serviceWorker, /\.\/js\/entry-detail\.js/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(vocabHtml, /src="js\/public-app\.js\?v=53"/);
  assert.match(vocabHtml, /href="styles\.css\?v=53"/);
  assert.match(ownerHtml, /src="js\/owner-app\.js\?v=53"/);
  assert.match(ownerHtml, /href="styles\.css\?v=53"/);
  for (const source of [serviceWorker, vocabHtml, ownerHtml]) assert.doesNotMatch(source, /v4[5-9]|v5[01]/);
  assert.match(vocabHtml, /id="owner-link"[^>]*>所有者登录/);
  assert.match(ownerHtml, /id="login-link"[^>]*>使用 GitHub 登录/);
  assert.match(ownerHtml, /id="auth-gate"[^>]*>[\s\S]*?只有你可以进入/);
  assert.match(ownerHtml, /id="owner-workspace" hidden inert/);
  // The cost disclosure now lives once, in the manual, and both pages link to it.
  assert.match(guideHtml, /Cloudflare Workers AI.*不需要 OpenAI 或 Claude 的 API key/s);
  assert.match(guideHtml, /每个 UTC 日最多 20 次整理/);
  assert.match(guideHtml, /自动换第二款免费模型/);
  assert.match(guideHtml, /这不是永久免费承诺/);
  assert.match(guideHtml, /不会自动切换到可能收费的引擎/);
  assert.match(ownerHtml, /href="guide\.html"/);
  assert.match(vocabHtml, /href="guide\.html"/);
  // Explanation belongs in the manual, not in the capture panel.
  assert.doesNotMatch(ownerHtml, /panel-detail|永久免费/);
  assert.match(ownerHtml, /id="capture-title">添加词条/);
  assert.match(ownerHtml, /id="capture-input"[^>]*aria-describedby="capture-key-hint"/);
  assert.match(ownerHtml, /href="guide\.html" aria-label="使用手册">说明<\/a>/);
  assert.match(ownerHtml, /href="\.\/" aria-label="查看公开词库">词库<\/a>/);
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
  assert.match(publicAppSource, /headers\["If-None-Match"\] = state\.liveEtag/);
  assert.match(publicAppSource, /response\.status === 304/);
  assert.match(runtimeConfigSource, /https:\/\/zhuo-wordbook-api\.zhuo-wordbook-api\.workers\.dev\//);
  assert.match(workerConfigSource, /"run_worker_first"\s*:\s*true/);
});

test("synonyms remain one entered-word-only field throughout owner editing and public discovery", () => {
  assert.match(ownerHtml, /id="field-synonyms"[^>]*placeholder="发布后自动双向更新/);
  assert.match(ownerHtml, /同义词（仅限已收录词）/);
  assert.match(ownerAppSource, /const rawSynonyms = LEXICAL_ENTRY_TYPES\.has\([^?]+\)\s*\?\s*commaList\(value\("fieldSynonyms"\),\s*20\)\s*:\s*\[\]/);
  assert.match(ownerAppSource, /const synonyms = allowedSynonymsFor\(term, rawSynonyms\)/);
  assert.match(ownerAppSource, /organizeWithAi\(cleaned, state\.csrfToken, \{ allowedSynonyms \}\)/);
  assert.match(ownerAppSource, /setValue\("fieldSynonyms", entry\.synonyms\?\.join/);
  assert.match(entryDetailSource, /entry\.synonyms/);
  assert.match(entryDetailSource, /同义词：\$\{entry\.synonyms\.join/);
  assert.match(vocabHtml, /只搜这个单词本里已有的词/);
  assert.match(stylesSource, /\.word-card \.card-synonyms/);
});

test("owner lookup shows a safe local preview while the slower AI organizer runs", () => {
  assert.match(ownerAppSource, /import \{ lookupCoreEntry \} from "\.\/core-dictionary\.js"/);
  assert.match(ownerAppSource, /lookupCoreEntry\(cleaned\)/);
  assert.match(ownerAppSource, /本地 ECDICT 候选/);
  assert.match(ownerAppSource, /候选不会自动发布/);
  assert.match(ownerAppSource, /window\.setInterval\(renderBusyProgress, 5_000\)/);
  assert.match(ownerAppSource, /window\.clearInterval\(elapsedTimer\)/);
  assert.match(ownerAppSource, /refs\.organizeButton\.disabled = disabled \|\| aiUnavailable \|\| !state\.snapshot/);
  assert.match(ownerAppSource, /await Promise\.all\(\[\s*refreshAiStatus\(\),\s*renderDrafts\(\),\s*loadRemote\(\)\.catch/s);
});

test("polysemous meaning formatting is wired into owner, public card, detail and copy views", () => {
  assert.match(ownerAppSource, /setMultilineText\(meaning, formatMeaningForDisplay\(entry\)\)/);
  assert.match(entryDetailSource, /setMultilineText\(refs\.dialogMeaning, formatMeaningForDisplay\(entry\)/);
  assert.match(publicAppSource, /setMultilineText\(meaning, formatMeaningForDisplay\(entry\)/);
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
  assert.match(publicAppSource, /import \{ createEntryDetailController \} from "\.\/entry-detail\.js"/);
  assert.match(ownerAppSource, /import \{ createEntryDetailController \} from "\.\/entry-detail\.js"/);
  assert.match(publicAppSource, /const entryDetail = createEntryDetailController\(\)/);
  assert.match(ownerAppSource, /const entryDetail = createEntryDetailController\(\)/);
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
