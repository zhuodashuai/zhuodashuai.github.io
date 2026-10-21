import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { personalWordbookUrl, OWNER_ADMIN_URL } from "../js/runtime-config.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("private login always uses the fixed auth origin, never an arbitrary copied Pages host", () => {
  const canonical = new URL("personal.html", OWNER_ADMIN_URL).href;
  for (const href of ["https://zhuodashuai.github.io/vocab/?book=x", "https://untrusted.example/personal.html", "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/owner.html"]) {
    assert.equal(personalWordbookUrl({ href }), canonical);
  }
  assert.equal(personalWordbookUrl({ href: "http://127.0.0.1:4187/vocab/" }), "http://127.0.0.1:4187/personal.html");
  assert.equal(personalWordbookUrl({ href: "http://localhost:4187/" }), "http://localhost:4187/personal.html");
});

test("ordinary accounts are discoverable without replacing the public reader or owner entrance", async () => {
  const html = await source("../index.html");
  const app = await source("../js/public-app.js");
  const guide = await source("../guide.html");
  assert.match(html, /id="personal-link"[^>]*>我的词本<\/a>/);
  assert.match(html, /id="owner-link"[^>]*>卓的公开词本<\/a>/);
  assert.match(html, /id="owner-link"[^>]*href="https:\/\/zhuo-wordbook-api\.zhuo-wordbook-api\.workers\.dev\/\?auth=owner#library-lookup"/u);
  assert.match(html, /id="dictionary-link"[^>]*href="#library-lookup"[^>]*>查词<\/a>/u);
  assert.match(app, /if \(personalLink\) personalLink.href = personalWordbookUrl\(\)/);
  assert.match(guide, /id="personal-accounts"/);
  assert.match(guide, /恢复码/);
  assert.match(guide, /旧记录不会自动归给新注册账号/);
});

test("member storage migration is additive and keeps the owner's existing Durable Object", async () => {
  for (const path of ["../../wordbook-api/wrangler.jsonc", "../../wordbook-api/wrangler.test.jsonc"]) {
    const config = await source(path);
    assert.match(config, /"compatibility_flags"\s*:\s*\["nodejs_compat"\]/);
    assert.match(config, /"MEMBER_SIGNUP_ENABLED"\s*:\s*"true"/);
    assert.match(config, /"name"\s*:\s*"OWNER_CONTROL"/);
    assert.match(config, /"tag"\s*:\s*"v1"/);
    assert.match(config, /"tag"\s*:\s*"v2-member-wordbooks"/);
    assert.match(config, /"new_sqlite_classes"\s*:\s*\["MemberAuth",\s*"PersonalWordbook"\]/);
  }
});

test("personal shell is precached but private API bypasses all service-worker caching", async () => {
  const sw = await source("../sw.js");
  for (const item of ["personal.html", "personal.css?v=100", "js/personal-app.js?v=100", "js/personal-folders.js?v=100", "js/entry-sort.js?v=100", "js/personal-lookup-flow.js?v=97", "js/dictionary-navigation.js?v=80", "js/personal-api.js?v=100", "js/personal-storage.js?v=82", "js/personal-selection.js?v=82", "js/personal-study.js?v=77", "js/personal-dictionary.js?v=97", "js/expanded-dictionary.js?v=97", "js/core-pos-corrections.js?v=88", "js/member-dictionary-manifest.js?v=97", "js/core-dictionary.js?v=77", "js/runtime-config.js?v=77"]) {
    assert.ok(sw.includes(`"./${item}"`), `${item} missing from shell`);
  }
  assert.ok(sw.includes('/\\/personal(?:\\.html)?\\/?$/.test(url.pathname) ? "./personal.html"'));
  const start = sw.indexOf('if (url.pathname.startsWith("/api/"))');
  assert.ok(start > 0);
  const boundary = sw.slice(start, sw.indexOf('if (request.mode === "navigate")', start));
  assert.match(boundary, /event.respondWith\(fetch\(request\)\);\s*return;/);
  assert.doesNotMatch(boundary, /cache|networkFirst/i);
  assert.doesNotMatch(sw.slice(0, sw.indexOf('self.addEventListener("install"')), /\/api\/v1\/member/);
});

test("basic member dictionary never imports a provider pipeline or an owner AI client", async () => {
  const app = await source("../js/personal-app.js");
  const dictionary = await source("../js/personal-dictionary.js");
  const flow = await source("../js/personal-lookup-flow.js");
  const core = await source("../js/core-dictionary.js");
  const html = await source("../personal.html");
  assert.match(app, /import \{ lookupPersonalDictionary, preloadPersonalDictionary, searchPersonalDictionaryChinese \} from "\.\/personal-dictionary\.js\?v=97"/);
  assert.match(app, /import \{ lookupPersonalDictionaryFast \} from "\.\/personal-lookup-flow\.js\?v=97"/);
  assert.match(dictionary, /member-dictionary-manifest/);
  assert.doesNotMatch(app + dictionary + flow, /from ["'][^"']*(?:services|owner-api|workflow)\.js|organizeWithAi|freedictionaryapi|mymemory|languagetool|api\.openai|api\.anthropic/iu);
  assert.match(core, /new URL\("\.\.\/data\/ecdict-core\.json", import\.meta\.url\)/);
  assert.match(html, /id="member-dictionary-form"/);
  assert.match(html, /不调用在线翻译或 AI/);
  assert.match(html, /connect-src 'self'/);
});

test("existing owner authentication has a private learning entrance without another registration", async () => {
  const owner = await source("../owner.html");
  const guide = await source("../guide.html");
  assert.match(owner, /id="owner-personal-link" href="personal\.html\?auth=owner">查词并公开收录<\/a>/);
  assert.match(guide, /不需要另注册/);
  assert.match(guide, /学习全部/);
  assert.match(guide, /复习到期/);
});
