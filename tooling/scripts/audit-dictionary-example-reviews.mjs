import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exampleSourceHash, validateExampleSourceIndex } from './build-dictionary-examples.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const VERDICTS = new Set(['approved', 'needs-fix', 'unverified']);
const HASH = /^[a-f0-9]{64}$/u;
const NAME = /^cross-review-\d{4}-[a-z0-9-]+\.json$/u;
export const examplePairDigest = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');

/** A second reader's decisions attach to exact pairs; they never relabel or
 * replace published examples, and a partial audit never approves a whole pack. */
export function validateIndependentPairAudit(pack, audit, { canonicalRecords } = {}) {
  if (!audit || audit.schemaVersion !== 1 || audit.sourceSha256 !== exampleSourceHash(pack)
    || audit.independentOfAuthor !== true || !/^AI\/[a-z0-9_-]{1,100}$/u.test(audit.reviewer)
    || !pack.author || audit.reviewer === pack.author || !Array.isArray(audit.entries) || !audit.entries.length
    || !(canonicalRecords instanceof Map)) {
    throw Error('Invalid or stale independent pair audit');
  }
  const originals = new Map(pack.entries.map(row => [row.term, row])), seen = new Set();
  const result = [];
  for (const decision of audit.entries) {
    const row = originals.get(decision.term);
    const canonical = canonicalRecords.get(decision.term);
    if (!row || seen.has(decision.term) || !HASH.test(decision.pairDigest || '')
      || decision.pairDigest !== examplePairDigest(row) || !VERDICTS.has(decision.verdict)
      || !canonical || !Number.isSafeInteger(decision.canonicalId) || decision.canonicalId !== canonical.id
      || decision.canonicalSourceSha256 !== examplePairDigest(canonical)
      || typeof decision.notes !== 'string' || !decision.notes.trim()
      || !Array.isArray(decision.references) || decision.references.some(url => {
        try { return new URL(url).protocol !== 'https:'; } catch { return true; }
      })) throw Error(`Invalid or stale decision: ${decision.term}`);
    seen.add(decision.term);
    result.push({ ...decision, sourceFile: audit.sourceFile, reviewer: audit.reviewer });
  }
  return result;
}

export function summarizePairAudits(decisions) {
  const byPair = new Map();
  for (const row of decisions) {
    const key = JSON.stringify([row.sourceFile, row.term, row.pairDigest]);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(row);
  }
  const counts = { auditedPairs: byPair.size, approved: 0, needsFix: 0, unverified: 0 };
  for (const rows of byPair.values()) {
    // A later duplicated approval must not conceal an unresolved objection.
    if (rows.some(row => row.verdict === 'needs-fix')) counts.needsFix++;
    else if (rows.some(row => row.verdict === 'unverified')) counts.unverified++;
    else counts.approved++;
  }
  return counts;
}

export async function loadIndependentPairAudits({ root = ROOT } = {}) {
  const base = join(root, 'tooling/dictionary/examples');
  const active = new Set(validateExampleSourceIndex(JSON.parse(await readFile(join(base, 'index.json'), 'utf8'))));
  const additive = JSON.parse(await readFile(join(base, 'additive-index-v4.json'), 'utf8'));
  for (const file of validateExampleSourceIndex({ schemaVersion: 1, sourceFiles: additive.releases.flatMap(release => release.sourceFiles) })) active.add(file);
  const index = JSON.parse(await readFile(join(base, 'independent-audits/index.json'), 'utf8'));
  if (index.schemaVersion !== 1 || !Array.isArray(index.auditFiles)
    || new Set(index.auditFiles).size !== index.auditFiles.length || index.auditFiles.some(file => !NAME.test(file))) {
    throw Error('Invalid independent audit index');
  }
  const decisions = [];
  const sourceDirectory = join(root, 'vocab/data/expanded-dictionary');
  const manifest = JSON.parse(await readFile(join(sourceDirectory, 'manifest.json'), 'utf8'));
  const canonicalRecords = new Map();
  for (const descriptor of manifest.english.shards) {
    if (!HASH.test(descriptor.sha256) || descriptor.file !== `${manifest.version}/en-${String(descriptor.bucket).padStart(3, '0')}.json`) {
      throw Error('Invalid canonical source reference');
    }
    const bytes = await readFile(join(sourceDirectory, descriptor.file));
    if (bytes.length !== descriptor.bytes || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) {
      throw Error('Canonical source bytes changed');
    }
    for (const record of JSON.parse(bytes).records) canonicalRecords.set(record.term, record);
  }
  for (const file of index.auditFiles) {
    const audit = JSON.parse(await readFile(join(base, 'independent-audits', file), 'utf8'));
    if (!active.has(audit.sourceFile)) throw Error('Audit does not name an active authored source');
    const pack = JSON.parse(await readFile(join(base, 'source', audit.sourceFile), 'utf8'));
    decisions.push(...validateIndependentPairAudit(pack, audit, { canonicalRecords }));
  }
  return { auditFiles: index.auditFiles.length, counts: summarizePairAudits(decisions), decisions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { auditFiles, counts } = await loadIndependentPairAudits();
  console.log(JSON.stringify({ auditFiles, ...counts,
    scope: 'Exact independently read pairs only; source metadata and full coverage counts do not prove semantic correctness.' }));
}
