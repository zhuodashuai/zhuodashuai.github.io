import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isCopiedStatic, inspectSite, checkTar, REVIEW_ONLY, UNPUBLISHED_D32_PATHS, UNPUBLISHED_NEXT_PATHS, UNPUBLISHED_D35_PATHS, UNPUBLISHED_FORSYTE_ARCHIVE_PATHS, UNPUBLISHED_D36_PATHS, DEFAULT_EXCLUDES, LIMIT } from '../../.github/scripts/check-pages-package.mjs';

test('Pages exclusions retain defaults and omit only specifically registered unpublished review files', () => {
  const text = fs.readFileSync(new URL('../../_config.yml', import.meta.url), 'utf8');
  const entries = text.split(/\r?\n/u).filter(line => /^  - /u.test(line)).map(line => line.slice(4).replace(/\/$/u, ''));
  assert.deepEqual(entries, [...DEFAULT_EXCLUDES, REVIEW_ONLY, ...UNPUBLISHED_D32_PATHS, ...UNPUBLISHED_NEXT_PATHS, ...UNPUBLISHED_D35_PATHS, ...UNPUBLISHED_FORSYTE_ARCHIVE_PATHS, ...UNPUBLISHED_D36_PATHS]);
  assert.deepEqual(text.split(/\r?\n/u).filter(line => /^[a-z]/u.test(line)), ['exclude:']);
  for (const file of ['vocab/data/dictionary-examples/old/examples-1.json', 'tooling/dictionary/examples/queues/batch-0030.json',
    'tooling/dictionary/examples/queues/batch-0031-provenance.json', 'tooling/dictionary/examples/source/batch-0031-p004.json',
    'tooling/dictionary/examples/source/batch-0033-example.json', 'vocab/data/dictionary-examples/delta-v4/example.bin', 'README.md']) assert(isCopiedStatic(file));
  assert.equal(UNPUBLISHED_D32_PATHS.length,32);
  assert.equal(UNPUBLISHED_NEXT_PATHS.length,72);
  assert.equal(new Set(UNPUBLISHED_NEXT_PATHS).size,72);
  assert.equal(UNPUBLISHED_D35_PATHS.length,51);
  assert.equal(new Set(UNPUBLISHED_D35_PATHS).size,51);
  const index=JSON.parse(fs.readFileSync(new URL('../../tooling/dictionary/examples/additive-index-v4.json',import.meta.url)));
  const release=index.releases.find(r=>r.id==='examples-0035');
  assert.deepEqual(UNPUBLISHED_D35_PATHS,[...release.sourceFiles.flatMap(f=>['source','reviews'].map(d=>'tooling/dictionary/examples/'+d+'/'+f)),'tooling/dictionary/examples/queues/batch-0035-admission-receipt.json']);
  assert(isCopiedStatic('tooling/dictionary/examples/source/batch-0035-future.json'));
  assert.deepEqual(UNPUBLISHED_FORSYTE_ARCHIVE_PATHS, [
    'tooling/dictionary/public-source/owner-wordbook-fd742758.json',
    'tooling/dictionary/public-source/member-dictionary-fd742758.json',
    'tooling/dictionary/public-source/book-passages-fd742758.json',
    'tooling/dictionary/public-source/gitattributes-fd742758.txt'
  ]);
  assert.equal(new Set(UNPUBLISHED_FORSYTE_ARCHIVE_PATHS).size,4);
  for (const file of UNPUBLISHED_FORSYTE_ARCHIVE_PATHS) assert(!isCopiedStatic(file));
  assert(isCopiedStatic('tooling/dictionary/public-source/future-source.json'));
  assert(isCopiedStatic('tooling/dictionary/public-source/owner-wordbook-future.json'));
  assert.equal(UNPUBLISHED_D36_PATHS.length, 55);
  assert.equal(new Set(UNPUBLISHED_D36_PATHS).size, 55);
  const d36 = index.releases.find(release => release.id === "examples-0036");
  assert.deepEqual(UNPUBLISHED_D36_PATHS, [...d36.sourceFiles.flatMap(file => ["source", "reviews"].map(dir => "tooling/dictionary/examples/" + dir + "/" + file)), "tooling/dictionary/examples/queues/batch-0036-admission-receipt.json"]);
  for (const file of UNPUBLISHED_D36_PATHS) assert(!isCopiedStatic(file));
  assert(isCopiedStatic("tooling/dictionary/examples/source/batch-0036-future.json"));
  for (const file of [REVIEW_ONLY, ...UNPUBLISHED_D32_PATHS, ...UNPUBLISHED_NEXT_PATHS, ...UNPUBLISHED_D35_PATHS, '_config.yml', '.github/workflows/wordbook-ci.yml', 'vocab/_headers', 'node_modules/file.js',
    'vendor/bundle/lib.rb', 'style.scss']) assert(!isCopiedStatic(file));
});

test('Pages measurement counts actual files and rejects empty and oversized output', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbook-pages-test-'));
  try {
    assert.throws(() => inspectSite(folder), /Empty/);
    fs.writeFileSync(path.join(folder, 'index.html'), 'hello');
    assert.equal(inspectSite(folder).bytes, 5);
    const archive = path.join(folder, 'actual.tar');
    fs.writeFileSync(archive, Buffer.alloc(10240));
    assert.equal(checkTar(archive).bytes, 10240);
    const fd = fs.openSync(archive, 'r+');
    try { fs.ftruncateSync(fd, LIMIT); } finally { fs.closeSync(fd); }
    assert.throws(() => checkTar(archive), /exceeds/);
    assert.throws(() => inspectSite(folder), /exceed/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test('Pages measurement rejects a symbolic link before packaging', { skip: process.platform === 'win32' }, () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbook-pages-symlink-test-'));
  try {
    fs.writeFileSync(path.join(folder, 'index.html'), 'hello');
    fs.symlinkSync('index.html', path.join(folder, 'link.html'));
    assert.throws(() => inspectSite(folder), /Symlink/);
    assert.throws(() => checkTar(path.join(folder, 'link.html')), /regular/);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
