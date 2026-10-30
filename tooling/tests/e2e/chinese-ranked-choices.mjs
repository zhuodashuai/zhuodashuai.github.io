import { expect } from '@playwright/test';

// Reviewed groups are required subsets of a complete source-ranked stream.
// Traverse the real UI pages instead of assuming a closed head whitelist.
export async function ensureChineseChoices(page, expected, { personal = false, complete = false } = {}) {
  const choices = page.locator(personal ? '#member-dictionary-choices button[data-dictionary-term]' : '#dictionary-choices button[data-dictionary-term]');
  const more = page.locator(personal ? '#member-dictionary-more' : '#dictionary-more');
  for (let index = 0; index < 100; index++) {
    const terms = await choices.evaluateAll(nodes => nodes.map(node => node.dataset.dictionaryTerm));
    expect(new Set(terms).size).toBe(terms.length);
    if (!complete && expected.every(term => terms.includes(term))) return terms;
    if (!personal) await page.locator('#dictionary-choice-disclosure').evaluate(node => { node.open = true; });
    if (!await more.isVisible()) {
      for (const head of expected) expect(terms).toContain(head);
      return terms;
    }
    await more.click(); await expect.poll(() => choices.count()).toBeGreaterThan(terms.length);
  }
  throw Error('Complete Chinese pagination did not terminate');
}

export async function rankedSearchResultInPage(page, input, head) {
  return page.evaluate(async ({ input, head }) => {
    const module = await import('/js/expanded-dictionary.js'); let offset = 0;
    for (let index = 0; index < 1000; index++) {
      const next = await module.searchExpandedDictionary(input, { offset, limit: 50 });
      const found = next.results.find(row => row.term === head); if (found) return found;
      if (!next.hasMore) return null;
      if (!(next.nextOffset > offset)) throw Error('Pagination did not advance');
      offset = next.nextOffset;
    }
    throw Error('Complete Chinese pagination did not terminate');
  }, { input, head });
}
