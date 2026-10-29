import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { EVERYDAY_LOOKUP_ENTRIES } from '../../../vocab/js/everyday-lookup-data.js';
import { freshIntentReport, verifyIntentViewport } from './browser-checks-everyday-intents-0011.mjs';
import { watchAnonymousStaticContext, assertClassroomTraffic } from './browser-checks-classroom-0009.mjs';
const fixture = JSON.parse(await readFile(new URL('../../dictionary/everyday-expansions/2026-10-29-intents/source-bound-fixture.json', import.meta.url)));
const ordinaryRows = EVERYDAY_LOOKUP_ENTRIES.filter(r => !r.reviewedCanonicalSense);
test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });
for (const width of [390, 1280]) test('ten everyday intents preserve old source tuples, examples and saved fields at ' + width + 'px', async ({ context }, info) => {
  test.setTimeout(240000); const base = 'http://127.0.0.1:4187/', report = freshIntentReport();
  await watchAnonymousStaticContext(context, base, report, expect);
  try { await verifyIntentViewport({ context, base, fixture, ordinaryRows, expect, report, width }); assertClassroomTraffic(expect, report); }
  finally { await info.attach('intents-' + width + '.json', { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' }); }
});
