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
export const UNPUBLISHED_D36_PATHS = Object.freeze([
  "tooling/dictionary/examples/source/batch-0036-g-43e1cded971d.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-43e1cded971d.json",
  "tooling/dictionary/examples/source/batch-0036-g-0c086b1569a0.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-0c086b1569a0.json",
  "tooling/dictionary/examples/source/batch-0036-g-f86437e16314.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-f86437e16314.json",
  "tooling/dictionary/examples/source/batch-0036-g-620849f50e3b.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-620849f50e3b.json",
  "tooling/dictionary/examples/source/batch-0036-g-0bdf225ffa8f.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-0bdf225ffa8f.json",
  "tooling/dictionary/examples/source/batch-0036-g-6988c7e5e447.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-6988c7e5e447.json",
  "tooling/dictionary/examples/source/batch-0036-g-754ecaa4d4a1.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-754ecaa4d4a1.json",
  "tooling/dictionary/examples/source/batch-0036-g-6bfac72b4b5e.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-6bfac72b4b5e.json",
  "tooling/dictionary/examples/source/batch-0036-g-709c1d680b03.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-709c1d680b03.json",
  "tooling/dictionary/examples/source/batch-0036-g-bb535645c8de.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-bb535645c8de.json",
  "tooling/dictionary/examples/source/batch-0036-g-d728f0933bd8.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-d728f0933bd8.json",
  "tooling/dictionary/examples/source/batch-0036-g-f1a612e117d9.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-f1a612e117d9.json",
  "tooling/dictionary/examples/source/batch-0036-g-cff6ff224298.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-cff6ff224298.json",
  "tooling/dictionary/examples/source/batch-0036-g-aa9776b2c2e2.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-aa9776b2c2e2.json",
  "tooling/dictionary/examples/source/batch-0036-g-dd3d1401e4e9.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-dd3d1401e4e9.json",
  "tooling/dictionary/examples/source/batch-0036-g-5fc3466e0405.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-5fc3466e0405.json",
  "tooling/dictionary/examples/source/batch-0036-g-dc15c0755087.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-dc15c0755087.json",
  "tooling/dictionary/examples/source/batch-0036-g-964c96a84b1c.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-964c96a84b1c.json",
  "tooling/dictionary/examples/source/batch-0036-g-4125fade4fd2.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-4125fade4fd2.json",
  "tooling/dictionary/examples/source/batch-0036-g-954261769bc2.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-954261769bc2.json",
  "tooling/dictionary/examples/source/batch-0036-g-41648ca85ec3.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-41648ca85ec3.json",
  "tooling/dictionary/examples/source/batch-0036-g-f06e74efb79d.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-f06e74efb79d.json",
  "tooling/dictionary/examples/source/batch-0036-g-e1033e35c3b7.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-e1033e35c3b7.json",
  "tooling/dictionary/examples/source/batch-0036-g-e19724963c56.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-e19724963c56.json",
  "tooling/dictionary/examples/source/batch-0036-g-c6093db07b22.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-c6093db07b22.json",
  "tooling/dictionary/examples/source/batch-0036-g-b6ad5be42ee2.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-b6ad5be42ee2.json",
  "tooling/dictionary/examples/source/batch-0036-g-df39468d9f95.json",
  "tooling/dictionary/examples/reviews/batch-0036-g-df39468d9f95.json",
  "tooling/dictionary/examples/queues/batch-0036-admission-receipt.json"
]);
export const UNPUBLISHED_D41_PATHS = Object.freeze([
  "tooling/dictionary/examples/source/batch-0041-r-01fd5ec90cfd.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-01fd5ec90cfd.json",
  "tooling/dictionary/examples/source/batch-0041-r-6ced65da2564.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-6ced65da2564.json",
  "tooling/dictionary/examples/source/batch-0041-r-efc8f105a1ee.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-efc8f105a1ee.json",
  "tooling/dictionary/examples/source/batch-0041-r-16380d56eda0.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-16380d56eda0.json",
  "tooling/dictionary/examples/source/batch-0041-r-8639b7e3e894.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-8639b7e3e894.json",
  "tooling/dictionary/examples/source/batch-0041-r-5968c193abe6.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-5968c193abe6.json",
  "tooling/dictionary/examples/source/batch-0041-r-93a8636ebeae.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-93a8636ebeae.json",
  "tooling/dictionary/examples/source/batch-0041-r-87aa20d3322b.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-87aa20d3322b.json",
  "tooling/dictionary/examples/source/batch-0041-r-6ca6c47249b8.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-6ca6c47249b8.json",
  "tooling/dictionary/examples/source/batch-0041-r-b6e0c6ec447c.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-b6e0c6ec447c.json",
  "tooling/dictionary/examples/source/batch-0041-r-c462d41c3f32.json",
  "tooling/dictionary/examples/reviews/batch-0041-r-c462d41c3f32.json",
  "tooling/dictionary/examples/queues/batch-0041-admission-receipt.json"
]);
export const UNPUBLISHED_D42_D43_PATHS = Object.freeze([
  "tooling/dictionary/examples/source/batch-0042-s-0972627ebdc9.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-0972627ebdc9.json",
  "tooling/dictionary/examples/source/batch-0042-s-18100ac42187.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-18100ac42187.json",
  "tooling/dictionary/examples/source/batch-0042-s-064028557b94.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-064028557b94.json",
  "tooling/dictionary/examples/source/batch-0042-s-4af49750f3d9.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-4af49750f3d9.json",
  "tooling/dictionary/examples/source/batch-0042-s-fe389970650f.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-fe389970650f.json",
  "tooling/dictionary/examples/source/batch-0042-s-2ffc0132fbb5.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-2ffc0132fbb5.json",
  "tooling/dictionary/examples/source/batch-0042-s-31c1b114b943.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-31c1b114b943.json",
  "tooling/dictionary/examples/source/batch-0042-s-33e4fc63a6ad.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-33e4fc63a6ad.json",
  "tooling/dictionary/examples/source/batch-0042-s-92178edb527c.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-92178edb527c.json",
  "tooling/dictionary/examples/source/batch-0042-s-e4d6661aac0b.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-e4d6661aac0b.json",
  "tooling/dictionary/examples/source/batch-0042-s-28a13617e9cb.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-28a13617e9cb.json",
  "tooling/dictionary/examples/source/batch-0042-s-3c4e63d9bbae.json",
  "tooling/dictionary/examples/reviews/batch-0042-s-3c4e63d9bbae.json",
  "tooling/dictionary/examples/queues/batch-0042-admission-receipt.json",
  "tooling/dictionary/examples/source/batch-0043-s-670f9ebd3694.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-670f9ebd3694.json",
  "tooling/dictionary/examples/source/batch-0043-s-a2d147f54d67.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-a2d147f54d67.json",
  "tooling/dictionary/examples/source/batch-0043-s-3cfb96b8a220.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-3cfb96b8a220.json",
  "tooling/dictionary/examples/source/batch-0043-s-6b9a13278920.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-6b9a13278920.json",
  "tooling/dictionary/examples/source/batch-0043-s-0e29812144ed.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-0e29812144ed.json",
  "tooling/dictionary/examples/source/batch-0043-s-4d035b2cd8fe.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-4d035b2cd8fe.json",
  "tooling/dictionary/examples/source/batch-0043-s-48cfa89d542f.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-48cfa89d542f.json",
  "tooling/dictionary/examples/source/batch-0043-s-03414281a009.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-03414281a009.json",
  "tooling/dictionary/examples/source/batch-0043-s-95c9c02b0072.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-95c9c02b0072.json",
  "tooling/dictionary/examples/source/batch-0043-s-f741c62be45c.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-f741c62be45c.json",
  "tooling/dictionary/examples/source/batch-0043-s-3ae0c85e4bb4.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-3ae0c85e4bb4.json",
  "tooling/dictionary/examples/source/batch-0043-s-9ed6fb2c5b64.json",
  "tooling/dictionary/examples/reviews/batch-0043-s-9ed6fb2c5b64.json",
  "tooling/dictionary/examples/queues/batch-0043-admission-receipt.json"
]);
// New offline quality evidence is retained in Git/CI. These exact 14 paths
// have never been served; no old static URL or runtime dictionary is removed.
export const UNPUBLISHED_QUALITY_NEXT_PATHS = Object.freeze([
  "tooling/dictionary/examples/corrections/cross-review-evidence-0002.json",
  "tooling/dictionary/examples/corrections/reviews/quality-0002.json",
  "tooling/dictionary/examples/corrections/reviews/quality-next-001.json",
  "tooling/dictionary/examples/corrections/reviews/quality-next-002.json",
  "tooling/dictionary/examples/corrections/reviews/quality-next-003.json",
  "tooling/dictionary/examples/corrections/source/quality-0002.json",
  "tooling/dictionary/examples/corrections/source/quality-next-001.json",
  "tooling/dictionary/examples/corrections/source/quality-next-002.json",
  "tooling/dictionary/examples/corrections/source/quality-next-003.json",
  "tooling/dictionary/examples/independent-audits/cross-review-0042-next-001.json",
  "tooling/dictionary/examples/independent-audits/cross-review-0042-next-002.json",
  "tooling/dictionary/examples/independent-audits/cross-review-0042-next-003.json",
  "tooling/dictionary/reviewed-senses/reviews/batch-0002.json",
  "tooling/dictionary/reviewed-senses/source/batch-0002.json"
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
  if (file === REVIEW_ONLY || UNPUBLISHED_D32_PATHS.includes(file) || UNPUBLISHED_NEXT_PATHS.includes(file) || UNPUBLISHED_D35_PATHS.includes(file) || UNPUBLISHED_FORSYTE_ARCHIVE_PATHS.includes(file) || UNPUBLISHED_D36_PATHS.includes(file) || UNPUBLISHED_D41_PATHS.includes(file) || UNPUBLISHED_D42_D43_PATHS.includes(file) || UNPUBLISHED_QUALITY_NEXT_PATHS.includes(file)) return false;
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
  for (const file of UNPUBLISHED_D36_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New D36 internal proof was published: ${file}`);
  for (const file of UNPUBLISHED_D41_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New D41 internal proof was published: ${file}`);
  // README indexes and converted documentation remain published too.
  for (const file of [...GENERATED_PATHS, 'index.html', 'vocab/index.html', 'vocab/personal.html',
    'vocab/dictionary.html', 'vocab/guide.html']) {
    assert(fs.statSync(path.join(directory, file)).size > 0, `Missing generated/key page: ${file}`);
  }
  for (const file of UNPUBLISHED_D42_D43_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New internal example proof was published: ${file}`);
  for (const file of UNPUBLISHED_QUALITY_NEXT_PATHS) assert(!fs.existsSync(path.join(directory, file)), `New quality proof was published: ${file}`);
  return { checkedStaticFiles: checked, unpublishedQueue: REVIEW_ONLY, unpublishedD32Paths: UNPUBLISHED_D32_PATHS.length, unpublishedNextPaths: UNPUBLISHED_NEXT_PATHS.length, unpublishedD35Paths: UNPUBLISHED_D35_PATHS.length, unpublishedForsyteArchivePaths: UNPUBLISHED_FORSYTE_ARCHIVE_PATHS.length, unpublishedD36Paths: UNPUBLISHED_D36_PATHS.length, unpublishedD41Paths: UNPUBLISHED_D41_PATHS.length, unpublishedD42D43Paths: UNPUBLISHED_D42_D43_PATHS.length, unpublishedQualityNextPaths: UNPUBLISHED_QUALITY_NEXT_PATHS.length };
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
