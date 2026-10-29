// ROOT INTEGRATION DRAFT: copy beside browser-checks-seven.mjs under tests/e2e,
// save the independently generated fixture at the path below, and replace the
// byte-SHA placeholder with its exact SHA256. This intentionally fails closed
// before a test/context runs until the fixture bytes have been sealed.
// This spec declares exactly two viewport tests; it never starts a server or
// launches a browser itself. The runner/root owns those lifecycle operations.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prepareSevenHeadFixture, freshSevenHeadReport, watchAnonymousStaticContext,
  verifySevenHeadViewport, assertSevenHeadTraffic } from './browser-checks-seven.mjs';

const FIXTURE_SHA256 = '0ffa826822d8c19cb1142e7839abb90f8a18ef22644e6347c3bc08c09c72921a';
const fixtureBytes = await readFile(new URL('../../dictionary/reviewed-senses/seven-head-browser-fixture-0007.json', import.meta.url));
expect(FIXTURE_SHA256, 'Root must seal the independently generated fixture').toMatch(/^[a-f0-9]{64}$/u);
expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(FIXTURE_SHA256);
const fixture = JSON.parse(fixtureBytes), prepared = prepareSevenHeadFixture(fixture);
expect(prepared.queryCount).toBe(45);

test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });
for (const width of [390, 1280]) test(`exact seven heads: all 45 queries, native flows and saved-context separation at ${width}px`, async ({ context }, testInfo) => {
  test.setTimeout(180000);
  const base = 'http://127.0.0.1:4187/', report = freshSevenHeadReport();
  await watchAnonymousStaticContext(context, base, report, expect);
  try {
    await verifySevenHeadViewport({ context, base, fixture, expect, report, width, modules: {
      personal: 'js/personal-lookup-flow.js', hotDictionary: 'js/personal-dictionary.js?v=97',
      expanded: 'js/expanded-dictionary.js?v=104', examples: 'js/dictionary-examples-current-v4.js',
      examplesUI: 'js/dictionary-examples-ui-v108.js', additive: 'js/dictionary-examples-additive.js', release: 'js/dictionary-examples-release-v4.js',
    } });
    assertSevenHeadTraffic(expect, report);
  } finally {
    await testInfo.attach(`seven-heads-${width}.json`, { body: Buffer.from(JSON.stringify({ fixtureSha256: FIXTURE_SHA256, ...report }, null, 2)), contentType: 'application/json' });
  }
});
