import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseBookPassages, sourcePassagesForEntry, selectBookPassages } from "../js/book-passages.js";
import { contextualizeReadingEntry, parsePublicSnapshot } from "../js/wordbook-schema.js";

const dataText = await readFile(new URL("../data/book-passages.json", import.meta.url), "utf8");
const data = parseBookPassages(JSON.parse(dataText));
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL("../data/owner-wordbook.json", import.meta.url), "utf8")));
const forsyteSource = JSON.parse(await readFile(new URL("../data/reading-lists/the-forsyte-saga/chapter-1.json", import.meta.url), "utf8"));

test("all existing novel chapter memberships have their own source example without changing their stored examples", () => {
  let contexts = 0;
  for (const entry of snapshot.entries) for (const context of entry.readingContexts) {
    if (!context.membership.startsWith("collection:never-let-me-go:")) continue;
    contexts += 1;
    const chapter = context.membership.split(":")[2];
    const contextual = contextualizeReadingEntry(entry, "never-let-me-go", chapter);
    const source = sourcePassagesForEntry(data, contextual);
    assert.equal(source.length, 1, `${entry.term} ${chapter}`);
    assert.equal(source[0].chapterId, chapter);
    assert.ok(source[0].links.some(link => link.entryId === entry.id && link.membership === context.membership));
    assert.equal(contextual.exampleEn, context.exampleEn);
    assert.equal(contextual.exampleZh, context.exampleZh);
  }
  assert.equal(contexts, 653);
});

test("every linked excerpt belongs to a real current word and chapter, with no duplicated link", () => {
  const links = new Set();
  for (const passage of data.passages) for (const link of passage.links) {
    const entry = snapshot.entries.find(item => item.id === link.entryId);
    assert.ok(entry, link.entryId);
    assert.ok(entry.readingContexts.some(context => context.membership === link.membership));
    const key = `${link.entryId}\n${link.membership}`;
    assert.ok(!links.has(key), `duplicate ${key}`);
    links.add(key);
  }
  assert.equal([...links].filter(key => key.includes("\ncollection:never-let-me-go:")).length, 653);
  assert.equal([...links].filter(key => key.includes("\ncollection:the-forsyte-saga:")).length, forsyteSource.expectedItemCount);
  assert.equal(links.size, 653 + forsyteSource.expectedItemCount);
});

test("featured reading stays small and chapter-specific rather than generating more vocabulary", () => {
  assert.equal(data.passages.filter(passage => passage.featured).length, 25);
  const forsyteReading = selectBookPassages(data, { bookId: "the-forsyte-saga", chapterId: "chapter-1" });
  assert.equal(forsyteReading.length, 2);
  assert.ok(forsyteReading.some(passage => /At Home/u.test(passage.note) && passage.links.length === 0), "the chapter title stays a reading note rather than a basic vocabulary card");
  for (let chapter = 1; chapter <= 23; chapter += 1) {
    const selected = selectBookPassages(data, { bookId: "never-let-me-go", chapterId: `chapter-${chapter}` });
    assert.equal(selected.length, 1);
    assert.ok(selected[0].translation && selected[0].note);
    assert.ok(selected[0].text.length < 600);
    assert.equal(selected[0].source.printedPage, "", "do not pretend PDF pages equal another edition's paper pages");
  }
  assert.doesNotMatch(dataText, /G:\\|G:\/mingw|\.pdf"|original_bytes|reflowText|SESSION_SECRET/u);
});

function forTerm(term, chapter) {
  const entry = snapshot.entries.find(entry => entry.term === term);
  assert.ok(entry, term);
  return sourcePassagesForEntry(data, contextualizeReadingEntry(entry, "never-let-me-go", `chapter-${chapter}`))[0].text;
}

test("same-looking words keep the intended chapter sense, not the first occurrence", () => {
  assert.match(forTerm("crop", 4), /use your crop on him/);
  assert.match(forTerm("take off", 9), /the craze really took off/);
  assert.doesNotMatch(forTerm("take off", 9), /headphones/);
  assert.match(forTerm("shudder", 3), /shudder/i);
  assert.match(forTerm("light-hearted", 3), /Mr\. Roger included/);
  assert.match(forTerm("light-hearted", 3), /^She immediately/);
  assert.match(forTerm("bumper crop", 4), /bringing a thrilled cheer\.$/);
  assert.match(forTerm("luscious", 6), /^Then at one point/);
});

test("source fragments retain actual wording instead of inventing a complete sentence", () => {
  assert.match(forTerm("There's nothing wrong with it.", 2), /^Nothing wrong with it, she said/);
  assert.doesNotMatch(forTerm("There's nothing wrong with it.", 2), /There's nothing wrong/);
  assert.match(forTerm("negligible", 9), /Negligible\. That might have been it\./);
});
