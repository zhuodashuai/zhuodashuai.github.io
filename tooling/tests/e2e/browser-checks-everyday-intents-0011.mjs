export function intentRows(fixture, ordinaryRows) {
  return [...fixture.selectedSource.entries, ...fixture.ordinaryAdded,
    ...fixture.aliasProjection.map(p => ordinaryRows.find(r => r.term === p.term))]
    .map(row => ({ ...row, expectedSource: fixture.selectedSource.entries.some(r => r.term === row.term)
      ? '卓式词典·义项补充' : '卓的日常词组', queries: [...new Set([row.term, ...row.englishForms,
      ...row.chineseAliases, ...(fixture.aliasProjection.find(p => p.term === row.term)?.aliases ?? [])])] }));
}

export function freshIntentReport() {
  return { queries: [], native: [], saved: [], writes: [], external: [], api: [], providers: [],
    auth: [], nonStatic: [], queryLeaks: [], errors: [], requestCount: 0 };
}

export async function verifyIntentViewport({ context, base, fixture, ordinaryRows, expect, report, width }) {
  const rows = intentRows(fixture, ordinaryRows), page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(new URL('dictionary.html', base).href, { waitUntil: 'domcontentloaded' });
    for (const row of rows) for (const query of row.queries) {
      await page.locator('#dictionary-query').fill(query);
      await page.locator('#dictionary-query').press('Enter');
      await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('q'))).toBe(query);
      await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase', 'ready', { timeout: 20000 });
      await expect(page.locator('#dictionary-term')).toHaveText(row.term);
      await expect(page.locator('#dictionary-pos')).toHaveText(row.partOfSpeech);
      await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.meaning.split('\n'));
      await expect(page.locator('#dictionary-source')).toHaveText('来源：' + row.expectedSource + ' · Original composition');
      await expect(page.locator('#dictionary-source a')).toHaveAttribute('href', 'https://zhuodashuai.github.io/vocab/');
      await expect(page.locator('#dictionary-example-panel')).toBeVisible({ timeout: 20000 });
      const detail = page.locator('#dictionary-example-content details');
      await expect(detail).toHaveCount(1, { timeout: 20000 });
      await expect(detail.locator('summary')).toHaveText('1. ' + row.partOfSpeech + ' · ' + row.meaning);
      if (!await detail.evaluate(n => n.open)) await detail.locator('summary').click();
      await expect(detail.locator('p[lang=en]')).toHaveText(row.en);
      await expect(detail.locator('p[lang="zh-CN"]')).toHaveText(row.zh);
      await expect(page.locator('#dictionary-example-source')).toHaveText('原创学习例句');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      report.queries.push({ width, query, term: row.term, firstHit: true, candidateClicked: false,
        partOfSpeech: row.partOfSpeech, meaning: row.meaning, en: row.en, zh: row.zh });
    }
    const native = await page.evaluate(async ({ rows, bindings }) => {
      const [personal, examples, additive, release] = await Promise.all([
        import(new URL('js/personal-lookup-flow.js', document.baseURI)),
        import(new URL('js/dictionary-examples-current-v4.js', document.baseURI)),
        import(new URL('js/dictionary-examples-additive.js', document.baseURI)),
        import(new URL('js/dictionary-examples-release-v4.js', document.baseURI)),
      ]);
      const reads = [], checks = [], originals = [];
      let fallbackCalls = 0;
      const forbidden = () => { fallbackCalls++; throw Error('A local everyday intent reached fallback'); };
      const fetchImpl = async (input, options = {}) => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, document.baseURI);
        if (url.origin !== location.origin || !['GET', 'HEAD'].includes(options.method || 'GET')
          || /(?:^|\/)(?:api|private|auth)(?:\/|$)/u.test(url.pathname)) throw Error('Nonstatic intent read');
        reads.push(url.href); return fetch(url, { ...options, credentials: 'omit' });
      };
      const reader = additive.createAdditiveExamplesLoader(release.dictionaryExamplesRelease, { fetchImpl });
      try {
        for (const row of rows) for (const query of row.queries) {
          const result = await personal.lookupPersonalDictionaryFast(query,
            { hotLookup: forbidden, hotReverse: forbidden, fullSearch: forbidden });
          const first = result.results[0];
          for (const k of ['term', 'partOfSpeech', 'meaning']) if (first?.[k] !== row[k]) throw Error('Native intent identity: ' + query);
          if (first.source !== row.expectedSource || first.license !== 'Original composition'
            || first.url !== 'https://zhuodashuai.github.io/vocab/') throw Error('Native intent provenance: ' + query);
          const card = { ...first, example: 'My original English.', exampleZh: '我的个人原译文。',
            bookPassage: 'My original book passage.', study: { box: 4, correct: 7 } };
          const before = JSON.stringify(card), dto = await examples.loadDictionaryExamples(row.term, { savedEntry: card, fetchImpl });
          if (dto.senses.length !== 1 || dto.senses[0].partOfSpeech !== row.partOfSpeech
            || dto.senses[0].meaningZh !== row.meaning || JSON.stringify(dto.senses[0].examples) !== JSON.stringify([{ en: row.en, zh: row.zh }])
            || JSON.stringify(card) !== before) throw Error('Native pair or saved fields changed: ' + query);
          checks.push({ query, term: row.term, pair: dto.senses[0].examples[0], savedUnchanged: true });
        }
        for (const row of bindings) {
          const dto = await reader.load(row.term, { lookupQuery: row.term });
          if (JSON.stringify(dto) !== JSON.stringify(row.completeOriginalDTO)) throw Error('Old immutable DTO changed: ' + row.term);
          originals.push({ term: row.term, dto });
        }
      } finally { reader.close(); examples.resetDictionaryExamplesCacheForTests(); }
      return { checks, originals, reads, fallbackCalls };
    }, { rows, bindings: fixture.canonicalBindings });
    expect(native.checks).toHaveLength(rows.reduce((n, r) => n + r.queries.length, 0));
    expect(native.fallbackCalls).toBe(0); expect(native.originals).toHaveLength(5);
    report.native.push(native);
    const saved = await page.evaluate(async ({ rows, bindings }) => {
      const { createDictionaryExamplesSection } = await import(new URL('js/dictionary-examples-ui-v108.js', document.baseURI));
      const checks = [];
      for (const row of rows) {
        const binding = bindings.find(r => r.term === row.term), oldPairs = binding?.completeOriginalDTO.senses.flatMap(s => s.examples) ?? [];
        const negative = binding ? [...binding.canonicalContexts,
          ...binding.completeOriginalDTO.senses.map(s => ({ partOfSpeech: s.partOfSpeech, meaning: s.meaningZh })),
          { partOfSpeech: 'interjection', meaning: row.meaning },
          { partOfSpeech: row.partOfSpeech, meaning: 'An unrelated saved meaning.' }] : [];
        const contexts = [{ eligible: true, partOfSpeech: row.partOfSpeech, meaning: row.meaning },
          ...new Map(negative.map(c => [JSON.stringify([c.partOfSpeech, c.meaning]), { ...c, eligible: false }])).values()];
        for (const identity of contexts) for (const shape of ['string', 'nested']) {
          const root = document.createElement('div'), anchor = document.createElement('div'); root.append(anchor); document.body.append(root);
          const originalText = ['My original English.', '我的个人原译文。', 'My original book passage.'];
          const nodes = originalText.map(t => { const p = document.createElement('p'); p.textContent = t; root.append(p); return p; });
          const card = { term: row.term, partOfSpeech: identity.partOfSpeech,
            meaning: shape === 'nested' ? { zh: identity.meaning } : identity.meaning,
            example: originalText[0], exampleZh: originalText[1], bookPassage: originalText[2],
            note: 'My old note.', study: { box: 4, correct: 7 }, progress: { streak: 3 },
            review: { dueAt: '2026-11-01T12:00:00.000Z' } };
          const before = JSON.stringify(card), section = createDictionaryExamplesSection({ root: document, after: anchor });
          try {
            await section.show(card);
            const ens = [...section.section.querySelectorAll('p[lang=en]')].map(n => n.textContent),
              zhs = [...section.section.querySelectorAll('p[lang="zh-CN"]')].map(n => n.textContent);
            checks.push({ term: row.term, shape, eligible: identity.eligible, identity,
              hidden: section.section.hidden, sourceDisplay: section.section.querySelector('.dictionary-learning-source').textContent,
              savedUnchanged: JSON.stringify(card) === before,
              manualUnchanged: JSON.stringify(nodes.map(n => n.textContent)) === JSON.stringify(originalText),
              labels: [...section.section.querySelectorAll('h4')].map(n => n.textContent),
              pairs: ens.map((en, i) => ({ en, zh: zhs[i] })),
              newPairAbsent: !ens.includes(row.en) && !zhs.includes(row.zh),
              onlyOldPairs: ens.every((en, i) => oldPairs.some(p => p.en === en && p.zh === zhs[i])),
              noOverflow: document.documentElement.scrollWidth <= innerWidth + 1 && section.section.scrollWidth <= section.section.clientWidth + 1 });
          } finally { section.clear(); root.remove(); }
        }
      }
      return checks;
    }, { rows, bindings: fixture.canonicalBindings });
    for (const check of saved) {
      expect(check.savedUnchanged && check.manualUnchanged && check.noOverflow).toBe(true);
      if (check.eligible) { const row = rows.find(r => r.term === check.term); expect(check.hidden).toBe(false);
        expect(check.sourceDisplay).toBe('原创学习例句'); expect(check.labels).toEqual([row.partOfSpeech + ' · ' + row.meaning]);
        expect(check.pairs).toEqual([{ en: row.en, zh: row.zh }]);
      } else {
        expect(check.newPairAbsent && check.onlyOldPairs).toBe(true);
        const binding = fixture.canonicalBindings.find(r => r.term === check.term);
        if (binding.canonicalContexts.some(c => c.partOfSpeech === check.identity.partOfSpeech && c.meaning === check.identity.meaning)) {
          expect(check.hidden).toBe(false);
          expect(check.labels).toEqual(binding.completeOriginalDTO.senses.map(s => s.partOfSpeech + ' · ' + s.meaningZh));
          expect(check.pairs).toEqual(binding.completeOriginalDTO.senses.flatMap(s => s.examples));
        }
      }
    }
    report.saved.push(...saved); expect(await context.cookies(base)).toEqual([]);
  } finally { await page.close(); }
}
