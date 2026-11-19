import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Exact current reviewed shell snapshots, in Git LF and native Windows CRLF.
// First authenticate the complete new shell, then reverse only named changes
// before older historical tests apply their existing, unchanged byte pins.
const pins = new Map([
  ["index.html", [[14536, "18a6fdfc654b0e36e97d09023a0d7f31ba7ecab2285096cb2b118fcc2c37c6f2"], [14660, "ca5faddc5fd10289f5844337dfb302384026c5206d5be27ed8215341d9170399"]]],
  ["personal.html", [[23743, "ebf232b240da539b16d12827dd535835bc6e9189b868f8c21a97ddaf0eb57d3b"], [23843, "be92f1b861a4c59337476109af4082bb463437ab28c5d67be12a02b4a04a9784"]]],
  ["owner.html", [[12864, "4568a79b542496244ac40a40b183b6cafdab0d1e3b7213dec91a286e663ada43"], [12913, "042990c22e7104f2ecc44dd3b38c37ac733d132b2b15c2638ef2b11ad312f8b4"]]],
  ["dictionary.html", [[7911, "2bb0323c9c92096aabaff4efc9964d195c05f0fb0789cfa5d42f9ebadaa5c2ad"], [8011, "7cff2879131fc56971e02e43ea46be8a3d0bee097710502e86a6aa4e8faaea24"]]],
]);

function once(text, current, historical) {
  assert.equal(text.split(current).length, 2, `Exactly one reviewed shell change: ${current}`);
  return text.replace(current, historical);
}

export function restoreSearchExperienceShell(file, text) {
  const allowed = pins.get(file);
  if (!allowed) return text;
  const raw = Buffer.from(text), digest = createHash("sha256").update(raw).digest("hex");
  assert(allowed.some(([bytes, sha]) => bytes === raw.length && sha === digest), `${file}: current search-experience shell snapshot changed`);
  if (file === "index.html") {
    text = once(text, '<summary>筛选与设置</summary>', '<summary>筛选与发音</summary>');
    return once(text, 'src="js/public-app-v113.js?v=117"', 'src="js/public-app-v113.js?v=115"');
  }
  if (file === "personal.html") return once(text, 'src="js/personal-app-v108.js?v=114"', 'src="js/personal-app-v108.js"');
  if (file === "owner.html") return once(text, 'src="js/owner-app-v108.js?v=114"', 'src="js/owner-app-v108.js"');

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  text = once(text, 'href="dictionary.css?v=114"', 'href="dictionary.css?v=101"');
  text = once(text, 'src="js/dictionary-entry-v109.js?v=114"', 'src="js/dictionary-entry-v109.js"');
  text = once(text,
    '    <div class="title-row dictionary-page-heading"><h1 id="dictionary-title">中英词典</h1><p id="dictionary-count" aria-live="polite">正在读取词条数量…</p></div>' + eol
      + '    <section class="search-panel" id="dictionary-search-panel" aria-labelledby="dictionary-title">',
    '    <section class="search-panel" aria-labelledby="dictionary-title">' + eol
      + '      <div class="title-row"><h1 id="dictionary-title">中英词典</h1><p id="dictionary-count" aria-live="polite">正在读取词条数量…</p></div>');
  text = once(text,
    '          <div class="search-input-wrap"><input id="dictionary-query" type="search" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" placeholder="输入英文、短语或中文意思" aria-describedby="dictionary-hint"><button id="dictionary-clear" type="button" class="clear-query" aria-label="清空查询" hidden>×</button></div>',
    '          <input id="dictionary-query" type="search" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" placeholder="如：acquisitive / 监视" aria-describedby="dictionary-hint">');
  text = once(text, '<p id="dictionary-hint" class="hint">按 Enter 查词</p>', '<p id="dictionary-hint" class="hint">按 Enter 查询 · 免登录查词，收录需确认</p>');
  text = once(text, '      </form>' + eol + '    </section>' + eol + '    <section class="query-feedback" aria-label="查询提示">', '      </form>');
  text = once(text,
    '      <div id="dictionary-recovery" class="recovery-panel" hidden>' + eol
      + '        <p id="dictionary-component-title" class="hint" hidden>短语未命中，可单独查词（不代表整句翻译）：</p>' + eol
      + '        <div id="dictionary-components" class="recovery-components"></div>' + eol
      + '        <button id="dictionary-edit-query" type="button" class="quiet-button">修改查询</button>' + eol
      + '      </div>' + eol, "");
  text = once(text, '        <p id="dictionary-display-context" class="display-context" role="status" aria-live="polite" hidden></p>' + eol, "");
  return text;
}
