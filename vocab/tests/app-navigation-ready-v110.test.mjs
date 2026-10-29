import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readyAppNavigation } from "../js/app-navigation-ready-v110.js";
import { restoreChineseSearchPaginationShell } from "../../tooling/tests/helpers/chinese-search-pagination-shell.mjs";

const selectors = [".app-header", ".app-footer", ".guide-footer-nav", "#member-github-owner-link", "#member-standard-login-link"];
const d42SourceLabel = '<p id="dictionary-example-source" class="source">原创例句 · 仅覆盖所列义项</p>';
const historicalSourceLabel = '<p class="source">原创例句 · AI 复核 · 仅覆盖所列义项</p>';
function restoreD42SourceLabel(html) {
  assert.equal(html.split(d42SourceLabel).length, 2, "Expected exactly the named D42 author-selfcheck source label");
  return html.replace(d42SourceLabel, historicalSourceLabel);
}
function fixture({ failOnRefresh = 0 } = {}) {
  const listeners = new Map(), attributes = selectors.map(() => new Set(["inert", "data-app-navigation-pending"]));
  const unrelated = new Set(["inert", "data-app-navigation-pending"]);
  let href = "./", refreshes = 0;
  const targets = attributes.map(set => ({ removeAttribute(name) {
    assert(listeners.has("click") && listeners.has("auxclick"), "capture must exist before unlocking");
    assert.equal(new URL(href).searchParams.get("chapter"), "chapter-1", "context must be refreshed before unlocking");
    set.delete(name);
  } }));
  const header = targets[0]; header.getBoundingClientRect = () => ({ height: 80 });
  const link = { getAttribute: () => href, setAttribute(_, value) {
    refreshes++; if (refreshes === failOnRefresh) throw new Error("refresh failed"); href = value;
  } };
  const window = { addEventListener() {}, removeEventListener() {} };
  const document = { readyState: "complete", defaultView: window,
    querySelector: () => header,
    querySelectorAll(selector) {
      if (!selector.includes("data-app-navigation-pending")) return [link];
      assert.deepEqual(selector.split(","), selectors.map(value => `${value}[data-app-navigation-pending]`));
      return targets.filter((_, index) => attributes[index].has("data-app-navigation-pending"));
    },
    documentElement: { style: { setProperty() {} } },
    addEventListener(name, listener, capture) { assert.equal(capture, true); assert(!listeners.has(name)); listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); } };
  const location = { href: "http://127.0.0.1:4187/guide.html#wb_book=never-let-me-go&wb_chapter=chapter-1&wb_view=cards&wb_sort=source&wb_site=local" };
  return { document, location, window, attributes, unrelated, listeners };
}

test("v110 unlocks all five known navigation target kinds only after capture and refresh; unrelated pending UI stays inert", () => {
  const f = fixture(), controller = readyAppNavigation(f);
  assert(f.attributes.every(set => set.size === 0));
  assert.deepEqual([...f.unrelated], ["inert", "data-app-navigation-pending"]);
  assert.equal(f.listeners.size, 2); assert.equal(readyAppNavigation(f), controller);
  controller.destroy(); assert.equal(f.listeners.size, 0);
});

test("v110 missing dependencies or failed explicit refresh keep every shell gate closed", () => {
  assert.equal(readyAppNavigation({ document: null, location: null }), null);
  for (const failOnRefresh of [1, 2]) {
    const f = fixture({ failOnRefresh });
    assert.throws(() => readyAppNavigation(f), /refresh failed/u);
    assert(f.attributes.every(set => set.has("inert") && set.has("data-app-navigation-pending")));
  }
});

// Exact pre-v110 working/Git transports observed at bdff7ecb. Undo only the
// named script, newly gated navigation containers and D42's exact source label,
// never normalize bytes or accept any other text changes.
const shells = [
  ["index.html", "topbar app-header", "site-footer app-footer", 2, [[14587,"19188c085728a6f201631b0d7b814b59167f285ec44d1989f94d880958e08936"],[14463,"6a2c651a5f45aaab73a160d546475d2b2908c615a8c03a1d17306ba6df83e408"]]],
  ["personal.html", null, "app-footer", 4, [[23602,"717f07dafbd2027e29cad93793ef997ae3f69f2be2d2797f5b2480d4bef00224"],[23504,"0e83f53241c6fed5a6722c4cf862ca22429dbf7dc287e5e6fd28f2295e798214"]]],
  ["dictionary.html", "topbar app-header", "app-footer", 2, [[7139,"262be3b5d0d7128e068adf7b2eb43db7a4d63e496eb7051410ba00825da12582"],[7047,"0ac5ea424863848904f8558431a0830306b01135c069ee8aef8485f2b0f03c85"]]],
  ["quick-notes.html", "topbar notes-topbar app-header", "site-footer app-footer", 2, [[4850,"546996b56ddfee5e041afeaa47c030f3e26458f4c452b9354982e8837276f77f"],[4797,"5132b399b2a7aeda7945099434b177bf8bc16f5dc853d4ba368d3f7b8691d5e5"]]],
  ["owner.html", "topbar app-header", "site-footer app-footer", 2, [[12840,"77537805c75d689b29b5a72e5349bf286e36f71005f457c06ce4dbd27b015d44"],[12791,"778f20766c293d36cfbf77c81c1d5e665c86e1a2224e72984c5acb341c8c3add"]]],
  ["guide.html", "topbar app-header", "site-footer app-footer", 3, [[222391,"6f29c5b18e63ae52a29a1170ff8b8c71ba21bf5387a00956be0802550f033a85"],[221628,"b1f281bc69f534fda11a5f17ca586e6693ccc265f11e87c6355dd2981219b3c8"]]]
];
for (const [file, header, footer, count, beforePins] of shells) {
  test(`v110 ${file} changes only the named navigation script and finite initial gates`, async () => {
    let html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    html = restoreChineseSearchPaginationShell(file, html);
    if (file === "dictionary.html") html = restoreD42SourceLabel(html);
    assert.equal((html.match(/inert data-app-navigation-pending/gu) || []).length, count);
    const from = 'src="js/app-navigation-ready-v110.js"'; assert.equal(html.split(from).length, 2);
    html = html.replace(from, file === "personal.html" ? 'src="js/app-navigation-ready-v109.js"' : 'src="js/app-navigation-entry.js?v=107"');
    const tags = [`<footer class="${footer}">`];
    if (header) tags.push(`<header class="${header}">`);
    if (file === "guide.html") tags.push('<nav class="guide-footer-nav" aria-label="继续浏览">');
    for (const tag of tags) {
      const gated = `${tag.slice(0, -1)} inert data-app-navigation-pending>`;
      assert.equal(html.split(gated).length, 2); html = html.replace(gated, tag);
    }
    const raw = Buffer.from(html), sha = createHash("sha256").update(raw).digest("hex");
    assert(beforePins.some(([bytes, hash]) => raw.length === bytes && sha === hash), `${file} has an unrelated byte change`);
  });
}

test("v110 historical source-label restoration rejects other labels and preserves unrelated bytes", () => {
  assert.throws(() => restoreD42SourceLabel(d42SourceLabel.replace("仅覆盖", "覆盖")));
  assert.throws(() => restoreD42SourceLabel(d42SourceLabel + d42SourceLabel));
  assert.equal(restoreD42SourceLabel(d42SourceLabel + "\n<!-- unrelated -->"), historicalSourceLabel + "\n<!-- unrelated -->");
});

test("historical pagination restoration rejects altered, duplicated or moved controls and keeps unrelated bytes", async () => {
  const buttons = [
    ["dictionary.html", '          <button id="dictionary-more" type="button" class="quiet-button choice-more" aria-controls="dictionary-choices" hidden>查看更多</button>'],
    ["personal.html", '        <button type="button" id="member-dictionary-more" hidden disabled>查看更多</button>']
  ];
  for (const [file, button] of buttons) {
    const current = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const eol = current.includes("\r\n") ? "\r\n" : "\n";
    assert.throws(() => restoreChineseSearchPaginationShell(file, current.replace(button, button.replace("查看更多", "更多"))));
    assert.throws(() => restoreChineseSearchPaginationShell(file, current + eol + button));
    assert.throws(() => restoreChineseSearchPaginationShell(file, current.replace(button + eol, "") + eol + button));
    const unrelated = eol + "<!-- unrelated mutation -->";
    assert.equal(restoreChineseSearchPaginationShell(file, current + unrelated), restoreChineseSearchPaginationShell(file, current) + unrelated);
    const otherTransport = current.replace(/\r?\n/gu, eol === "\n" ? "\r\n" : "\n");
    assert.equal(restoreChineseSearchPaginationShell(file, otherTransport),
      restoreChineseSearchPaginationShell(file, current).replace(/\r?\n/gu, eol === "\n" ? "\r\n" : "\n"));
  }
  const untouched = '<div id="unrelated">unchanged</div>\n';
  assert.equal(restoreChineseSearchPaginationShell("index.html", untouched), untouched);
});
