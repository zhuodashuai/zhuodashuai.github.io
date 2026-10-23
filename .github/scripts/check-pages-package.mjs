// Read-only post-Jekyll check. Never builds, deletes, uploads or deploys files.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const REVIEW_ONLY = 'tooling/dictionary/examples/queues/batch-0031.json';
// These D32 proof paths have never been published. Keep them in Git and CI,
// not in every Pages artifact. No previously served path is excluded here.
const D32_COHORTS = ['p001', 'p002', 'p002-child', 'ive-child', 'root', 'source9-01', 'yuk-child',
  'source9-02', 'source9-03', 'source9-04', 'role-01', 'role-02', 'role-03', 'role-04', 'role-05'];
export const UNPUBLISHED_D32_PATHS = Object.freeze(['tooling/dictionary/examples/queues/batch-0032.json',
  'tooling/dictionary/examples/queues/batch-0032-supplement.json',
  ...D32_COHORTS.flatMap(name => ['source', 'reviews'].map(kind => `tooling/dictionary/examples/${kind}/batch-0032-${name}.json`))]);
export const DEFAULT_EXCLUDES = ['Gemfile', 'Gemfile.lock', 'node_modules',
  'vendor/bundle', 'vendor/cache', 'vendor/gems', 'vendor/ruby', 'CNAME'];
export const LIMIT = 1073741824;
// The previous successful Pages build wrote these twelve generated resources.
export const GENERATED_PATHS = ['assets/css/style.css', 'tooling/dictionary/expanded-lookup.html',
  'tooling/tests/fixtures/semantic-test-cases.html', 'travel/west-2026/BUDGET.html',
  'travel/west-2026/PLAN.html', 'travel/west-2026/PRICE-COMPARISON.html',
  'vocab/data/THIRD_PARTY_NOTICES.html', 'tooling/index.html', 'tooling/dictionary/index.html',
  'vocab/data/reading-lists/never-let-me-go/index.html', 'vocab/tests/index.html', 'wordbook-api/index.html'];

export function isCopiedStatic(file) {
  // GitHub Pages/Jekyll ignores hidden and underscore-prefixed path segments.
  if (file.split('/').some(part => /^[._#]/u.test(part) || part.endsWith('~'))) return false;
  if (DEFAULT_EXCLUDES.some(p => file === p || file.startsWith(`${p}/`))) return false;
  if (file === REVIEW_ONLY || UNPUBLISHED_D32_PATHS.includes(file)) return false;
  // Pages preserves the raw Markdown files as well as generated HTML here.
  // Sass is generated rather than copied; this repository tracks none yet.
  return !/\.(?:scss|sass)$/iu.test(file);
}

export function inspectSite(directory) {
  let bytes = 0, files = 0, directories = 0;
  function walk(folder) {
    for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
      const location = path.join(folder, item.name);
      const stat = fs.lstatSync(location);
      assert(!stat.isSymbolicLink(), `Symlink in Pages output: ${location}`);
      if (stat.isDirectory()) { directories++; walk(location); }
      else { assert(stat.isFile(), `Non-regular Pages output: ${location}`); files++; bytes += stat.size; }
    }
  }
  walk(directory);
  assert(files > 0, 'Empty Pages build');
  assert(bytes < LIMIT, `Pages file bodies exceed 1 GiB: ${bytes}`);
  return { files, directories, bytes, byteLimit: LIMIT };
}

export function checkTar(file) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink(), 'Expected an actual regular tar file');
  assert(stat.size > 1024, 'Empty Pages archive');
  assert(stat.size < LIMIT, `Actual Pages tar exceeds 1 GiB: ${stat.size}`);
  return { bytes: stat.size, byteLimit: LIMIT, headroom: LIMIT - stat.size };
}

export function verifyStatic(directory, repo) {
  const listing = execFileSync('git', ['ls-tree', '-r', '-l', '-z', 'HEAD'],
    { cwd: repo, maxBuffer: 16 * 1024 * 1024 }).toString('utf8');
  let checked = 0;
  for (const line of listing.split('\0').filter(Boolean)) {
    const match = /^(\d+) blob ([a-f0-9]{40})\s+(\d+)\t([\s\S]+)$/u.exec(line);
    assert(match, `Unexpected Git tree row: ${line}`);
    const [, mode, blob, size, file] = match;
    if (!isCopiedStatic(file)) continue;
    assert(['100644', '100755'].includes(mode), `Non-regular tracked asset: ${file}`);
    const target = path.join(directory, ...file.split('/'));
    const bytes = fs.readFileSync(target);
    assert.equal(bytes.length, Number(size), `Published size changed: ${file}`);
    const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(hash, blob, `Published bytes changed: ${file}`);
    checked++;
  }
  assert(checked > 8000, `Incomplete static publication: ${checked}`);
  assert(!fs.existsSync(path.join(directory, REVIEW_ONLY)), 'Internal review queue was published');
  for (const file of UNPUBLISHED_D32_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New internal D32 proof was published: ${file}`);
  // README indexes and converted documentation remain published too.
  for (const file of [...GENERATED_PATHS, 'index.html', 'vocab/index.html', 'vocab/personal.html',
    'vocab/dictionary.html', 'vocab/guide.html']) {
    assert(fs.statSync(path.join(directory, file)).size > 0, `Missing generated/key page: ${file}`);
  }
  return { checkedStaticFiles: checked, unpublishedQueue: REVIEW_ONLY, unpublishedD32Paths: UNPUBLISHED_D32_PATHS.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.length >= 1 && args.length <= 2 && args.every(a => /^--(?:site|tar)=.+/u.test(a)), 'Use --site=DIR [--tar=FILE]');
  const site = args.find(a => a.startsWith('--site='))?.slice(7);
  const tar = args.find(a => a.startsWith('--tar='))?.slice(6);
  assert(site && args.filter(a => a.startsWith('--site=')).length === 1 && args.filter(a => a.startsWith('--tar=')).length <= 1);
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const directory = path.resolve(site);
  assert(directory !== repo, 'Site must be a separate build output');
  console.log(JSON.stringify({ site: inspectSite(directory), static: verifyStatic(directory, repo),
    tar: tar ? checkTar(path.resolve(tar)) : null, measuredBuild: true, deployed: false }));
}
