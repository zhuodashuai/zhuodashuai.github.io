import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { learningExampleSourceLabel } from "../js/example-source-label.js";
import { createDictionaryExamplesSection as currentSection } from "../js/dictionary-examples-ui-v108.js";
import { createDictionaryExamplesSection as retainedSection } from "../js/dictionary-examples-ui.js";

const legacy = ["原创例句·AI复核（精选义项）", "原创例句·作者自查（精选义项）"];
const book = "Never Let Me Go · Kazuo Ishiguro · Chapter 1";

test("only the two exact legacy workflow labels receive the learner-facing display name", () => {
  for (const source of legacy) assert.equal(learningExampleSourceLabel(source), "原创学习例句");
  for (const source of [book, "ECDICT", "Oxford Learner’s Dictionaries", "原创学习例句",
    `${legacy[0]} · Chapter 1`, ` ${legacy[0]}`, `${legacy[1]} `, "AI复核资料库"])
    assert.equal(learningExampleSourceLabel(source), source);
});

class Element {
  children = []; dataset = {}; hidden = false; textContent = "";
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener() {}
}

test("both saved-card renderers deduplicate friendly labels without altering source evidence or publisher labels", async () => {
  for (const createSection of [currentSection, retainedSection]) {
    const entry = { term: "sample", senses: [...legacy, book].map((source, i) => ({
      id: `sample-${i}`, partOfSpeech: "noun", meaningZh: "样本",
      source, reviewer: `AI/reader-${i}`, examples: [{ en: "Keep the sample in its box.", zh: "把样本放在盒子里。" }]
    })) };
    const before = JSON.stringify(entry), card = { term: "sample", meaning: "我的个人义项", note: "保留原笔记" };
    const cardBefore = JSON.stringify(card);
    const view = createSection({ root: { createElement: () => new Element() }, loadModule: async () => ({
      createDictionaryExamplesController: ({ onChange }) => ({ clear() {}, show: async () => {
        onChange({ phase: "ready", message: "", entry }); return true;
      } })
    }) });
    await view.show(card);
    const sourceNode = view.section.children.find(node => node.className === "dictionary-learning-source");
    assert.equal(sourceNode.textContent, `原创学习例句；${book}`);
    assert.equal(JSON.stringify(entry), before);
    assert.equal(JSON.stringify(card), cardBefore);
  }
});

test("the active dictionary and both card entrypoints use the small offline-available presentation helper", async () => {
  for (const file of ["dictionary-app-v109.js", "dictionary-examples-ui-v108.js", "dictionary-examples-ui.js"]) {
    const source = await readFile(new URL(`../js/${file}`, import.meta.url), "utf8");
    assert(source.includes('from "./example-source-label.js"'));
    assert(source.includes("learningExampleSourceLabel(sense.source)"));
  }
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert(sw.includes('"./js/example-source-label.js"'));
  assert(sw.includes('const CACHE_NAME = "zhuo-wordbook-v100"'));
});
