import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { watchAnonymousStaticContext, assertClassroomTraffic } from './browser-checks-classroom-0009.mjs';
import { freshPrecisionReport, verifyPrecisionViewport } from './browser-checks-translation-precision-0014.mjs';

const bytes = await readFile(new URL('../../dictionary/examples/evidence/native-precision-0017-fixture.json', import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe('e522f78192612209cac38ebdc6c911695bd3d12c24c007d4440a11471a35779a');
const nativeFixture = JSON.parse(bytes);
expect(nativeFixture.rows.map(row => row.term)).toEqual(['fainthearted', 'naysay', 'defalcate', 'facilitation']);
// Pin the existing readable canonical primary independently of the replacement
// example's narrower selected label. These corrections do not change lookup.
const primary = {
  fainthearted: { partOfSpeech: 'adjective', meaning: '① adj. 懦弱的, 无精神的, 胆小的' },
  naysay: { partOfSpeech: 'noun · verb', meaning: '① n. 拒绝, 否认\n② vt. 拒绝, 否认' },
  defalcate: { partOfSpeech: 'verb', meaning: '① vi. 盗用公款, 侵吞公款\n   [经] 侵吞, 盗用, 贪污' },
  facilitation: { partOfSpeech: 'noun', meaning: '① [医] 容易化, 助长, 接通[作用]' }
};
// Paragraph nodes have no newline in their combined DOM text. Retain every
// character here, then separately assert the exact paragraph boundaries below.
const fixture = { rows: nativeFixture.rows.map(row => ({ ...row,
  expectedPrimary: { ...primary[row.term], meaning: primary[row.term].meaning.replaceAll('\n', '') }
})) };

test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });
for (const width of [390, 1280]) {
  test(`four native precision replacements preserve canonical dictionary cards, exact pairs and private saved fields at ${width}px`, async ({ context, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    const base = new URL('./', baseURL).href, report = freshPrecisionReport();
    await watchAnonymousStaticContext(context, base, report, expect);
    try {
      // Real literal first hits, complete EN/ZH and selected POS/meaning labels;
      // immutable originals, edited-DTO/cross-head negatives, and six saved
      // contexts per head are checked by the existing unchanged browser helper.
      await verifyPrecisionViewport({ context, base, fixture, expect, report, width });
      expect(report.queries).toHaveLength(4);
      expect(report.native).toHaveLength(1);
      expect(report.native[0].checks).toHaveLength(4);
      expect(report.saved).toHaveLength(24);
      expect(report.queries.every(query => query.firstHit && !query.candidateClicked)).toBe(true);
      const page = await context.newPage();
      try {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(new URL('dictionary.html', base).href, { waitUntil: 'domcontentloaded' });
        for (const row of nativeFixture.rows) {
          await page.locator('#dictionary-query').fill(row.term);
          await page.locator('#dictionary-query').press('Enter');
          await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase', 'ready', { timeout: 20_000 });
          await expect(page.locator('#dictionary-term')).toHaveText(row.term);
          await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(primary[row.term].meaning.split('\n'));
          await expect(page.locator('#dictionary-example-content p[lang=en]')).toHaveText([row.approvedPair.en]);
          await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText([row.approvedPair.zh]);
          await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
          await testInfo.attach(`${row.term}-${width}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
        }
      } finally { await page.close(); }
      assertClassroomTraffic(expect, report);
    } finally {
      await testInfo.attach(`native-precision-0017-${width}.json`, {
        body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json'
      });
    }
  });
}
