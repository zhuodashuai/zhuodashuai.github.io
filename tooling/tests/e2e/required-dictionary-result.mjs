// Test orchestration only. English exact/form queries keep their first-hit
// contract. A reviewed Chinese alias can name several valid English words;
// require the requested card to be reachable in the actual complete UI stream.
export async function queryRequiredDictionaryResult(page, query, term, expect, { requireFirst = false } = {}) {
  await page.locator('#dictionary-query').fill(query);
  await page.locator('#dictionary-query').press('Enter');
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('q'))).toBe(query);
  await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase', 'ready', { timeout: 20000 });
  const firstTerm = await page.locator('#dictionary-term').textContent();
  const chinese = /\p{Script=Han}/u.test(query);
  let candidateClicked = false;
  if (!chinese || requireFirst) await expect(page.locator('#dictionary-term'), 'First hit for ' + query).toHaveText(term);
  else if (firstTerm !== term) {
    const choices = page.locator('#dictionary-choices button[data-dictionary-term]');
    const wanted = () => choices.filter({ has: page.locator('strong', { hasText: new RegExp('^' + term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') + '$', 'u') }) });
    await page.locator('#dictionary-choice-disclosure').evaluate(node => { node.open = true; });
    while (!await wanted().count() && await page.locator('#dictionary-more').isVisible()) {
      const previous = await choices.count();
      await page.locator('#dictionary-more').click();
      await expect(page.locator('#dictionary-more')).toBeEnabled();
      expect(await choices.count(), 'A complete result page must make forward progress').toBeGreaterThan(previous);
    }
    await expect(wanted(), 'Required reviewed head is present in the actual Chinese result stream: ' + query).toHaveCount(1);
    await wanted().click(); candidateClicked = true;
  }
  await expect(page.locator('#dictionary-term'), 'Selected exact head for ' + query).toHaveText(term);
  return { firstTerm, firstHit: firstTerm === term, candidateClicked, chinese };
}
