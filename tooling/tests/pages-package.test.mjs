import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isCopiedStatic, inspectSite, checkTar, REVIEW_ONLY, UNPUBLISHED_D32_PATHS, UNPUBLISHED_NEXT_PATHS, DEFAULT_EXCLUDES, LIMIT } from '../../.github/scripts/check-pages-package.mjs';

test('Pages exclusions retain defaults and omit only specifically registered unpublished review files', () => {
  const text = fs.readFileSync(new URL('../../_config.yml', import.meta.url), 'utf8');
  const entries = text.split(/\r?\n/u).filter(line => /^  - /u.test(line)).map(line => line.slice(4).replace(/\/$/u, ''));
  assert.deepEqual(entries, [...DEFAULT_EXCLUDES, REVIEW_ONLY, ...UNPUBLISHED_D32_PATHS, ...UNPUBLISHED_NEXT_PATHS]);
  assert.deepEqual(text.split(/\r?\n/u).filter(line => /^[a-z]/u.test(line)), ['exclude:']);
  for (const file of ['vocab/data/dictionary-examples/old/examples-1.json', 'tooling/dictionary/examples/queues/batch-0030.json',
    'tooling/dictionary/examples/queues/batch-0031-provenance.json', 'tooling/dictionary/examples/source/batch-0031-p004.json',
    'tooling/dictionary/examples/source/batch-0033-example.json', 'vocab/data/dictionary-examples/delta-v4/example.bin', 'README.md']) assert(isCopiedStatic(file));
  assert.equal(UNPUBLISHED_D32_PATHS.length,32);
  assert.equal(UNPUBLISHED_NEXT_PATHS.length,72);
  assert.equal(new Set(UNPUBLISHED_NEXT_PATHS).size,72);
  for (const file of [REVIEW_ONLY, ...UNPUBLISHED_D32_PATHS, ...UNPUBLISHED_NEXT_PATHS, '_config.yml', '.github/workflows/wordbook-ci.yml', 'vocab/_headers', 'node_modules/file.js',
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
