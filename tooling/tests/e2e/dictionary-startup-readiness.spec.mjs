import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { dictionaryExampleBucket } from '../../../vocab/js/dictionary-examples.js';

const pack = JSON.parse(await readFile(new URL('../../dictionary/examples/source/batch-0018-p009.json', import.meta.url), 'utf8'));
const tajik = pack.entries.find(row => row.term === 'Tajik');
const manifest = JSON.parse(await readFile(new URL('../../../vocab/data/expanded-dictionary/manifest.json', import.meta.url), 'utf8'));
const descriptor = manifest.english.shards[dictionaryExampleBucket('tajik') % 128];
const shard = JSON.parse(await readFile(new URL(`../../../vocab/data/expanded-dictionary/${descriptor.file}`, import.meta.url), 'utf8'));
const source = shard.records.find(row => row.term === 'Tajik');
expect(tajik).toBeTruthy(); expect(source).toBeTruthy();
test.use({ serviceWorkers: 'block' });

test('early Enter before the actual entry module mounts preserves input without a native form reload', async ({ page }) => {
  const documents = [], errors = [], writes = [];
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
  });
  page.on('pageerror', error => errors.push(error.message));
  let release, observed;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = new Promise(resolve => { observed = resolve; });
  await page.route('**/js/dictionary-entry-v109.js', async route => {
    observed(); await gate; await route.continue();
  });
  try {
    await page.goto('/dictionary.html', { waitUntil: 'commit' });
    await seen;
    const query = page.locator('#dictionary-query'), submit = page.locator('#dictionary-submit');
    await expect(query).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveText('准备中…');
    await query.fill('Tajik');
    await query.press('Enter');
    // Allow the native default action and two paints, without releasing the module.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(query).toHaveValue('Tajik');
    await expect(page).toHaveURL('http://127.0.0.1:4187/dictionary.html');
    expect(documents).toEqual(['http://127.0.0.1:4187/dictionary.html']);
    await expect(submit).toBeDisabled();
    release();
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveText('查词');
    await expect(query).toHaveValue('Tajik');
    await query.press('Enter');
    await expect(page.locator('#dictionary-term')).toHaveText('Tajik');
    await expect(page.locator('#dictionary-meaning')).toHaveText(`① ${source.meaning}`);
    await expect(page.locator('#dictionary-example-content summary')).toHaveText(`1. ${tajik.partOfSpeech} · ${tajik.meaningZh}`);
    await expect(page.locator('#dictionary-example-content p[lang="en"]')).toHaveText(tajik.en);
    await expect(page.locator('#dictionary-example-content p[lang="zh-CN"]')).toHaveText(tajik.zh);
    await expect(page).toHaveURL('http://127.0.0.1:4187/dictionary.html#q=Tajik');
    expect(documents).toHaveLength(1);
    expect(errors).toEqual([]); expect(writes).toEqual([]);
  } finally { release(); }
});
