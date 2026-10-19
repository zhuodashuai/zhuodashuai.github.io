import { createHash } from "node:crypto";

const HASH = /^[a-f0-9]{64}$/u;
const HAN = /\p{Script=Han}/u;
const CONTROL = /\p{Cc}|\p{Cf}/u;
const BODY_CONTROL = /[^\P{Cc}\n\t]|\p{Cf}/u;
export const DICTIONARY_SUPPLEMENT_ID = "import-2026-10-19";
export const DICTIONARY_SUPPLEMENT_SOURCE = Object.freeze({
  name: "词表补充整理（逐条标注来源）",
  license: "Project editorial content; not MIT or source quotations",
  url: "https://zhuodashuai.github.io/vocab/dictionary-references.html"
});

function invalid(message) { throw new Error(`Invalid dictionary supplement: ${message}.`); }
function object(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some(field => !Object.hasOwn(value, field) || !("value" in Object.getOwnPropertyDescriptor(value, field)))) invalid(`${label} fields`);
}
function array(value, maximum, label, minimum = 0) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < minimum || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) invalid(label);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) invalid(label);
  }
}
function text(value, maximum, label, { multiline = false, chinese = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maximum
    || (multiline ? BODY_CONTROL : CONTROL).test(value)
    || typeof value.isWellFormed === "function" && !value.isWellFormed()
    || chinese && !HAN.test(value)) invalid(label);
  return value;
}
function lexical(value, label) {
  text(value, 200, label);
  const normalized = value.normalize("NFKC").replace(/[‘’‛ʼ]/gu, "'").replace(/[“”„‟]/gu, '"').replace(/\s+/gu, " ").trim();
  if (normalized !== value || HAN.test(value) || !/[A-Za-z\p{Script=Latin}\d]/u.test(value)
    || /[<>]|javascript\s*:/iu.test(value)) invalid(label);
  return value;
}
function httpsURL(value, label) {
  text(value, 2000, label);
  if (/\s/u.test(value)) invalid(label);
  let parsed;
  try { parsed = new URL(value); } catch { invalid(label); }
  if (!value.startsWith("https://") || parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname) invalid(label);
}

/** Validate without changing field order or text: the independent digest binds the actual reviewed JSON value. */
export function validateDictionarySupplement(pack) {
  object(pack, ["schemaVersion", "id", "workbookSha256", "inputRecordsSha256", "source", "entries"], "pack");
  if (pack.schemaVersion !== 1 || pack.id !== DICTIONARY_SUPPLEMENT_ID
    || typeof pack.workbookSha256 !== "string" || typeof pack.inputRecordsSha256 !== "string"
    || !HASH.test(pack.workbookSha256) || !HASH.test(pack.inputRecordsSha256)) invalid("identity or workbook digests");
  object(pack.source, ["name", "license", "url"], "source");
  for (const [field, expected] of Object.entries(DICTIONARY_SUPPLEMENT_SOURCE)) {
    if (pack.source[field] !== expected) invalid(`source ${field}; paraphrases must not be labelled MIT`);
  }
  array(pack.entries, 30_000, "entry count", 1);
  const terms = new Set();
  for (const entry of pack.entries) {
    object(entry, ["term", "partOfSpeech", "meaning", "forms", "domain", "references"], "entry");
    lexical(entry.term, "term");
    const key = entry.term.toLocaleLowerCase("en-US");
    if (terms.has(key)) invalid(`duplicate term ${entry.term}`);
    terms.add(key);
    text(entry.partOfSpeech, 200, "part of speech");
    text(entry.meaning, 2000, "Chinese meaning", { multiline: true, chinese: true });
    text(entry.domain, 200, "domain");
    array(entry.forms, 64, "forms");
    if (new Set(entry.forms).size !== entry.forms.length) invalid("forms");
    entry.forms.forEach(form => lexical(form, "form"));
    array(entry.references, 12, "references", 1);
    const references = new Set();
    for (const reference of entry.references) {
      object(reference, ["title", "url", "locator"], "reference");
      text(reference.title, 300, "reference title");
      httpsURL(reference.url, "reference URL");
      text(reference.locator, 500, "reference locator");
      const key = `${reference.url}\n${reference.locator}`;
      if (references.has(key)) invalid("duplicate reference");
      references.add(key);
    }
  }
  return pack;
}

export function dictionarySupplementIntegrity(pack) {
  validateDictionarySupplement(pack);
  return { schemaVersion: 1, id: pack.id, rows: pack.entries.length,
    semanticSha256: createHash("sha256").update(JSON.stringify(pack)).digest("hex") };
}

/** Never approve a new root during generation: approval is a separate tracked input. */
export function verifyDictionarySupplement(pack, integrity) {
  object(integrity, ["schemaVersion", "id", "rows", "semanticSha256"], "integrity");
  const expected = dictionarySupplementIntegrity(pack);
  if (Object.entries(expected).some(([key, value]) => integrity[key] !== value)) invalid("independent semantic root mismatch");
  return pack;
}

const escapeHTML = value => String(value).replace(/[&<>"']/gu, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

/** Public source metadata only; workbook files, private paths and source quotations are not copied. */
export function renderDictionarySupplementReferences(pack) {
  validateDictionarySupplement(pack);
  const cards = pack.entries.map((entry, index) => `      <article class="result-card" id="reference-${index + 1}" aria-labelledby="reference-title-${index + 1}">
        <div class="result-heading"><h2 id="reference-title-${index + 1}" lang="en">${escapeHTML(entry.term)}</h2><p class="part-of-speech">${escapeHTML(entry.partOfSpeech)}</p></div>
        <p class="hint">${escapeHTML(entry.domain)}</p>
        <p class="meaning">${escapeHTML(entry.meaning)}</p>
        <section class="result-provenance" aria-label="参考资料">
          <h3>参考资料</h3>
          <ul>${entry.references.map(reference => `
            <li><a href="${escapeHTML(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(reference.title)}</a><p class="source">${escapeHTML(reference.locator)}</p></li>`).join("")}
          </ul>
          <a href="dictionary.html#q=${escapeHTML(encodeURIComponent(entry.term))}">查看词条 ${escapeHTML(entry.term)}</a>
        </section>
      </article>`).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#183b32">
  <meta name="description" content="词表补充整理的参考资料，不是来源原句或全部词条的审校证明。">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <link rel="icon" href="assets/icon-192.png" type="image/png">
  <link rel="stylesheet" href="dictionary.css?v=86">
  <title>词表补充参考资料 · 卓的单词本</title>
</head>
<body>
  <a class="skip-link" href="#main">跳到参考资料</a>
  <header class="topbar">
    <a class="brand" href="./" aria-label="卓的单词本首页"><span class="brand-seal" aria-hidden="true">卓</span><span>卓的单词本</span></a>
    <nav aria-label="页面导航"><a href="./">公开词卡</a><a href="dictionary.html">中英词典</a><a href="https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/personal.html">我的词本</a></nav>
    <a class="owner-link" href="dictionary.html">返回查词</a>
  </header>
  <main id="main">
    <section class="search-panel" aria-labelledby="references-title">
      <div class="title-row"><h1 id="references-title">词表补充参考资料</h1><p class="source">${pack.entries.length} 条补充词条</p></div>
      <p>下列中文释义根据提供的词表另行整理，参考链接用于说明语境，不是论文或词典的原文引述，也不属于 MIT 词典释义。</p>
      <p class="hint">本页仅列出这些补充词条的参考资料，不是全部新增词条的专业审校证明。具体含义仍需结合使用领域和原文判断。</p>
    </section>
    <div class="results-layout" aria-label="补充词条与参考资料">
${cards}
    </div>
  </main>
  <footer><p>词条来源：${escapeHTML(pack.source.name)}。</p><p>${escapeHTML(pack.source.license)}</p></footer>
</body>
</html>
`;
}
