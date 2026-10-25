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
// Only these 72 fresh D33/D34 proof paths are omitted; old served URLs stay.
export const UNPUBLISHED_NEXT_PATHS = Object.freeze([
  "tooling/dictionary/examples/source/batch-0033-role-01.json",
  "tooling/dictionary/examples/reviews/batch-0033-role-01.json",
  "tooling/dictionary/examples/source/batch-0033-source9-01.json",
  "tooling/dictionary/examples/reviews/batch-0033-source9-01.json",
  "tooling/dictionary/examples/source/batch-0033-source9-01-children.json",
  "tooling/dictionary/examples/reviews/batch-0033-source9-01-children.json",
  "tooling/dictionary/examples/source/batch-0033-prepare-root02.json",
  "tooling/dictionary/examples/reviews/batch-0033-prepare-root02.json",
  "tooling/dictionary/examples/source/batch-0033-role-02.json",
  "tooling/dictionary/examples/reviews/batch-0033-role-02.json",
  "tooling/dictionary/examples/source/batch-0033-role-02-label-children.json",
  "tooling/dictionary/examples/reviews/batch-0033-role-02-label-children.json",
  "tooling/dictionary/examples/source/batch-0033-root-01.json",
  "tooling/dictionary/examples/reviews/batch-0033-root-01.json",
  "tooling/dictionary/examples/source/batch-0033-root-01-reentry.json",
  "tooling/dictionary/examples/reviews/batch-0033-root-01-reentry.json",
  "tooling/dictionary/examples/source/batch-0033-charley-child.json",
  "tooling/dictionary/examples/reviews/batch-0033-charley-child.json",
  "tooling/dictionary/examples/source/batch-0033-alberta-child.json",
  "tooling/dictionary/examples/reviews/batch-0033-alberta-child.json",
  "tooling/dictionary/examples/source/batch-0033-source9-02.json",
  "tooling/dictionary/examples/reviews/batch-0033-source9-02.json",
  "tooling/dictionary/examples/source/batch-0033-role-03.json",
  "tooling/dictionary/examples/reviews/batch-0033-role-03.json",
  "tooling/dictionary/examples/source/batch-0033-source9-03.json",
  "tooling/dictionary/examples/reviews/batch-0033-source9-03.json",
  "tooling/dictionary/examples/source/batch-0033-source9-04.json",
  "tooling/dictionary/examples/reviews/batch-0033-source9-04.json",
  "tooling/dictionary/examples/source/batch-0033-source9-04-children.json",
  "tooling/dictionary/examples/reviews/batch-0033-source9-04-children.json",
  "tooling/dictionary/examples/source/batch-0033-role-04.json",
  "tooling/dictionary/examples/reviews/batch-0033-role-04.json",
  "tooling/dictionary/examples/source/batch-0033-root-second-reentries.json",
  "tooling/dictionary/examples/reviews/batch-0033-root-second-reentries.json",
  "tooling/dictionary/examples/queues/batch-0033-admission-receipt.json",
  "tooling/dictionary/examples/source/batch-0034-source9-01.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-01.json",
  "tooling/dictionary/examples/source/batch-0034-source9-01-translation-children.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-01-translation-children.json",
  "tooling/dictionary/examples/source/batch-0034-source9-01-annotations.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-01-annotations.json",
  "tooling/dictionary/examples/source/batch-0034-source9-02.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-02.json",
  "tooling/dictionary/examples/source/batch-0034-source9-02-annotations.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-02-annotations.json",
  "tooling/dictionary/examples/source/batch-0034-source9-03.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-03.json",
  "tooling/dictionary/examples/source/batch-0034-source9-03-annotations.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-03-annotations.json",
  "tooling/dictionary/examples/source/batch-0034-source9-04.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-04.json",
  "tooling/dictionary/examples/source/batch-0034-source9-04-annotations.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-04-annotations.json",
  "tooling/dictionary/examples/source/batch-0034-source9-04-translation-child.json",
  "tooling/dictionary/examples/reviews/batch-0034-source9-04-translation-child.json",
  "tooling/dictionary/examples/source/batch-0034-role-01.json",
  "tooling/dictionary/examples/reviews/batch-0034-role-01.json",
  "tooling/dictionary/examples/source/batch-0034-role-02.json",
  "tooling/dictionary/examples/reviews/batch-0034-role-02.json",
  "tooling/dictionary/examples/source/batch-0034-role-stinker-child.json",
  "tooling/dictionary/examples/reviews/batch-0034-role-stinker-child.json",
  "tooling/dictionary/examples/source/batch-0034-role-03.json",
  "tooling/dictionary/examples/reviews/batch-0034-role-03.json",
  "tooling/dictionary/examples/source/batch-0034-role-04.json",
  "tooling/dictionary/examples/reviews/batch-0034-role-04.json",
  "tooling/dictionary/examples/source/batch-0034-root-01.json",
  "tooling/dictionary/examples/reviews/batch-0034-root-01.json",
  "tooling/dictionary/examples/source/batch-0034-root-01-translation-children.json",
  "tooling/dictionary/examples/reviews/batch-0034-root-01-translation-children.json",
  "tooling/dictionary/examples/source/batch-0034-prepare-root02.json",
  "tooling/dictionary/examples/reviews/batch-0034-prepare-root02.json",
  "tooling/dictionary/examples/queues/batch-0034-admission-receipt.json"
]);
// Exact new D35 author/reviewer provenance paths: retained in Git/CI, never
// previously served. No broad folder exclusion and no old URL removal.
export const UNPUBLISHED_D35_PATHS = Object.freeze([
  "tooling/dictionary/examples/source/batch-0035-g-4ce3447c8860.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-4ce3447c8860.json",
  "tooling/dictionary/examples/source/batch-0035-g-2b551c377f5b.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-2b551c377f5b.json",
  "tooling/dictionary/examples/source/batch-0035-g-fa55990f9ef2.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-fa55990f9ef2.json",
  "tooling/dictionary/examples/source/batch-0035-g-0533a5af8936.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-0533a5af8936.json",
  "tooling/dictionary/examples/source/batch-0035-g-7f48d441d817.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-7f48d441d817.json",
  "tooling/dictionary/examples/source/batch-0035-g-55aa424de92d.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-55aa424de92d.json",
  "tooling/dictionary/examples/source/batch-0035-g-f2b399ee5e83.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-f2b399ee5e83.json",
  "tooling/dictionary/examples/source/batch-0035-g-d7176bbcf6ef.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-d7176bbcf6ef.json",
  "tooling/dictionary/examples/source/batch-0035-g-8eb36bde185c.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-8eb36bde185c.json",
  "tooling/dictionary/examples/source/batch-0035-g-00d30f7058db.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-00d30f7058db.json",
  "tooling/dictionary/examples/source/batch-0035-g-e1c448aea25b.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-e1c448aea25b.json",
  "tooling/dictionary/examples/source/batch-0035-g-c62ab98e1f78.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-c62ab98e1f78.json",
  "tooling/dictionary/examples/source/batch-0035-g-244bc5281a65.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-244bc5281a65.json",
  "tooling/dictionary/examples/source/batch-0035-g-30e38eaca613.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-30e38eaca613.json",
  "tooling/dictionary/examples/source/batch-0035-g-ecbd83d9ffe2.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-ecbd83d9ffe2.json",
  "tooling/dictionary/examples/source/batch-0035-g-05d6a5c16478.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-05d6a5c16478.json",
  "tooling/dictionary/examples/source/batch-0035-g-6163d83d8100.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-6163d83d8100.json",
  "tooling/dictionary/examples/source/batch-0035-g-33ce30595e6b.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-33ce30595e6b.json",
  "tooling/dictionary/examples/source/batch-0035-g-91138cd596b2.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-91138cd596b2.json",
  "tooling/dictionary/examples/source/batch-0035-g-c72d020e93bd.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-c72d020e93bd.json",
  "tooling/dictionary/examples/source/batch-0035-g-a4ec1ab77cfc.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-a4ec1ab77cfc.json",
  "tooling/dictionary/examples/source/batch-0035-g-c9268209cbf6.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-c9268209cbf6.json",
  "tooling/dictionary/examples/source/batch-0035-g-18b4bcf1bafa.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-18b4bcf1bafa.json",
  "tooling/dictionary/examples/source/batch-0035-g-bc6772007347.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-bc6772007347.json",
  "tooling/dictionary/examples/source/batch-0035-g-52fdefb5616c.json",
  "tooling/dictionary/examples/reviews/batch-0035-g-52fdefb5616c.json",
  "tooling/dictionary/examples/queues/batch-0035-admission-receipt.json",
]);
// These four newly introduced source/test archives are used only by Node/CI.
// Keep every older published tooling URL and every unknown future path intact.
export const UNPUBLISHED_FORSYTE_ARCHIVE_PATHS = Object.freeze([
  'tooling/dictionary/public-source/owner-wordbook-fd742758.json',
  'tooling/dictionary/public-source/member-dictionary-fd742758.json',
  'tooling/dictionary/public-source/book-passages-fd742758.json',
  'tooling/dictionary/public-source/gitattributes-fd742758.txt'
]);
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
  if (file === REVIEW_ONLY || UNPUBLISHED_D32_PATHS.includes(file) || UNPUBLISHED_NEXT_PATHS.includes(file) || UNPUBLISHED_D35_PATHS.includes(file) || UNPUBLISHED_FORSYTE_ARCHIVE_PATHS.includes(file)) return false;
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
  for (const file of UNPUBLISHED_NEXT_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New internal proof was published: ${file}`);
  for (const file of UNPUBLISHED_D35_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New D35 internal proof was published: ${file}`);
  for (const file of UNPUBLISHED_FORSYTE_ARCHIVE_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New Forsyte build/test archive was published: ${file}`);
  // README indexes and converted documentation remain published too.
  for (const file of [...GENERATED_PATHS, 'index.html', 'vocab/index.html', 'vocab/personal.html',
    'vocab/dictionary.html', 'vocab/guide.html']) {
    assert(fs.statSync(path.join(directory, file)).size > 0, `Missing generated/key page: ${file}`);
  }
  return { checkedStaticFiles: checked, unpublishedQueue: REVIEW_ONLY, unpublishedD32Paths: UNPUBLISHED_D32_PATHS.length, unpublishedNextPaths: UNPUBLISHED_NEXT_PATHS.length, unpublishedD35Paths: UNPUBLISHED_D35_PATHS.length, unpublishedForsyteArchivePaths: UNPUBLISHED_FORSYTE_ARCHIVE_PATHS.length };
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
