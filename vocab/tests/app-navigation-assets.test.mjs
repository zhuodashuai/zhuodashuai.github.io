import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const names = ["index.html", "personal.html", "dictionary.html", "quick-notes.html", "owner.html"];
const labels = ["公开词本", "查词", "随手记", "我的词本"];

test("all five static shells expose the same primary navigation and a quiet manual footer", async () => {
  for (const file of names) {
    const html = await read(file);
    const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/u)?.[0];
    assert.ok(header, file);
    const nav = header.match(/<nav\b[^>]*class="[^"]*\bapp-primary-nav\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];
    assert.ok(nav, file);
    const texts = [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gu)].map(match => match[1].replace(/<[^>]*>/gu, "").trim());
    assert.deepEqual(texts, labels, file);
    assert.equal((html.match(/aria-current="page"/gu) || []).length, 1, file);
    assert.doesNotMatch(header, /使用手册|安装应用|学术主页/u, file);
    assert.match(html, /<footer\b[^>]*>[\s\S]*?href="guide\.html">使用手册<\/a>/u, file);
    assert.match(html, /href="app-navigation\.css\?v=101"/u, file);
  }
});

test("navigation preserves runtime IDs, the fixed auth origin, and existing notes origins", async () => {
  for (const [file, ids] of [
    ["index.html", ["dictionary-link", "personal-link", "owner-link", "install-button"]],
    ["dictionary.html", ["dictionary-personal-link", "dictionary-owner-link", "dictionary-add"]],
    ["personal.html", ["member-auth-type", "member-username", "member-logout", "member-github-owner-link", "member-standard-login-link"]],
    ["owner.html", ["network-chip", "owner-personal-link", "install-button", "logout-button", "login-link"]]
  ]) {
    const html = await read(file);
    for (const id of ids) assert.equal((html.match(new RegExp(`id="${id}"`, "gu")) || []).length, 1, `${file} ${id}`);
  }
  assert.match(await read("index.html"), /id="dictionary-link" href="#library-lookup"/u);
  for (const file of names) {
    const html = await read(file);
    assert.match(html, /href="https:\/\/zhuo-wordbook-api\.zhuo-wordbook-api\.workers\.dev\/personal\.html"[^>]*>我的词本<\/a>/u, file);
  }
  assert.match(await read("index.html"), /href="quick-notes\.html"[^>]*>随手记<\/a>/u);
  assert.match(await read("owner.html"), /href="https:\/\/zhuodashuai\.github\.io\/vocab\/quick-notes\.html"[^>]*>随手记<\/a>/u);
});
