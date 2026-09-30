import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { filterEntriesByCollection } from "../js/collections.js";
import { contextualizeReadingEntry, parsePublicSnapshot, reconcileLexicalEntryForPublish } from "../js/wordbook-schema.js";
import { applyReviewRating, buildDueQueue } from "../js/study.js";

const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8")));
const load = async n => JSON.parse(await readFile(new URL(`../data/reading-lists/never-let-me-go/chapter-${n}.json`, import.meta.url), "utf8"));
const marked6 = ["huffiness", "luscious", "quandary", "hazy", "sleeve", "jerk somebody out of something", "hunch up", "ebb away"];
const provided7 = ["blur into each other", "a sort of glow", "electrify", "impersonation", "electrocute", "riotous", "flirt with", "mill around", "crouch", "spell something out", "mutter", "gutter", "rove over", "outburst", "rowdy", "crafty", "smuggle into", "contortion", "taunt", "nonchalantly", "perpetrator", "sombre", "pull oneself together", "be drowned out", "lose one's marbles", "splint", "impinge on"];

test("Chapter 6 preserves all eight photo markings and limits additions to eight", async () => {
  const source = await load(6);
  assert.equal(source.items.length, 16);
  assert.deepEqual(source.items.filter(i => i.tags.includes("划线词")).map(i => i.term), marked6);
  assert.equal(source.items.filter(i => i.tags.includes("精选补充")).length, 8);
  assert.equal(source.items.find(i => i.term === "hazy").originalInput, "haziest");
  assert.match(source.items.find(i => i.term === "luscious").usage, /不是说它可口/);
  assert.match(source.items.find(i => i.term === "sleeve").meaning, /唱片封套/);
});

test("Chapter 7 preserves all 27 requested items and adds only three", async () => {
  const source = await load(7);
  assert.equal(source.items.length, 30);
  assert.deepEqual(source.items.filter(i => i.tags.includes("精选补充")).map(i => i.term), ["in a new light", "the nuts and bolts", "play safe"]);
  assert.deepEqual(source.items.filter(i => !i.tags.includes("精选补充")).map(i => i.term).sort(), [...provided7].sort());
  assert.equal(source.items.filter(i => i.tags.includes("划线词")).length, 22);
  assert.equal(source.items.filter(i => i.tags.includes("用户补充")).length, 5);
  assert.match(source.items.find(i => i.term === "crafty").usage, /并没有完全接受/);
  assert.match(source.items.find(i => i.term === "perpetrator").usage, /不是指她真的完成/);
  assert.match(source.items.find(i => i.term === "electrocute").usage, /并没有人在课堂上真的触电/);
});

for (const [n, count, first, last] of [[6, 16, 61, 75], [7, 30, 76, 87]]) {
  test(`Chapter ${n} publishes every bilingual card in page order with its own context`, async () => {
    const source = await load(n);
    const cards = filterEntriesByCollection(snapshot.entries, "never-let-me-go", `chapter-${n}`);
    assert.equal(cards.length, count);
    assert.equal(new Set(cards.map(c => c.normalized)).size, count);
    assert.deepEqual(cards.map(c => c.term), source.items.map(i => i.term));
    let previousPage = first;
    for (let i = 0; i < count; i++) {
      const item = source.items[i];
      assert.ok(Number(item.page) >= previousPage && Number(item.page) <= last);
      previousPage = Number(item.page);
      assert.match(item.meaning, /^① /);
      assert.ok(item.partOfSpeech && item.definitionEn && item.exampleEn && item.exampleZh);
      const view = contextualizeReadingEntry(cards[i], "never-let-me-go", `chapter-${n}`);
      for (const key of ["term", "originalInput", "meaning", "usage", "partOfSpeech", "exampleEn", "exampleZh"]) {
        assert.equal(view[key], item[key], item.term + ": " + key);
      }
      assert.equal(view.sourceTitle, `Never Let Me Go — Chapter ${n}`);
      assert.equal(view.sourceDate, "p. " + item.page);
      assert.equal(view.definition, item.definitionEn);
      assert.doesNotThrow(() => reconcileLexicalEntryForPublish(view), item.term + ": publish quality gate");
    }
    const before = await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8");
    const result = await importReadingList({
      sourcePath: fileURLToPath(new URL(`../data/reading-lists/never-let-me-go/chapter-${n}.json`, import.meta.url)),
      checkOnly: true
    });
    assert.equal(result.changed, false, "reimport is idempotent");
    assert.equal(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8"), before);
  });
}

test("shared terms reuse original IDs and previous chapter contexts", () => {
  for (const [term, older, newer] of [["grind to a halt", 2, 6], ["rummage", 3, 6], ["rowdy", 4, 7]]) {
    const cards = snapshot.entries.filter(e => e.term === term);
    assert.equal(cards.length, 1);
    const card = cards[0];
    assert.ok(card.id.startsWith(`public-nlmg-c${older}-`));
    assert.ok(card.readingContexts.some(c => c.membership.endsWith(`:chapter-${older}`)));
    assert.ok(card.readingContexts.some(c => c.membership.endsWith(`:chapter-${newer}`)));
    const now = new Date("2026-09-27T20:00:00Z");
    const review = applyReviewRating(card.id, null, "easy", now);
    assert.equal(buildDueQueue([card], [review], now).length, 0);
    assert.equal(review.entryId, card.id);
  }
  assert.equal(new Set(snapshot.entries.map(e => e.id)).size, snapshot.entries.length);
  assert.equal(new Set(snapshot.entries.map(e => e.normalized)).size, snapshot.entries.length);
  for (const [n, count] of [29,38,28,51,18,16,30,18,8].entries()) {
    assert.equal(filterEntriesByCollection(snapshot.entries, "never-let-me-go", `chapter-${n+1}`).length, count);
  }
});

