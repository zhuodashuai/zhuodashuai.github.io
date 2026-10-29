export async function verifyFriendlyExampleSources({ context, base, fixture, expect, report, width }) {
  const page = await context.newPage();
  page.on("pageerror", error => report.errors.push(error.message));
  try {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(new URL("dictionary.html", base).href, { waitUntil: "domcontentloaded" });
    for (const row of fixture.rows) {
      await page.locator("#dictionary-query").fill(row.term);
      await page.locator("#dictionary-query").press("Enter");
      await expect(page.locator("#dictionary-status")).toHaveAttribute("data-phase", "ready", { timeout: 20000 });
      await expect(page.locator("#dictionary-term")).toHaveText(row.term);
      await expect(page.locator("#dictionary-example-panel")).toBeVisible({ timeout: 20000 });
      await expect(page.locator("#dictionary-example-source")).toHaveText("原创学习例句");
      await expect(page.locator("#dictionary-source")).toHaveText(`来源：${row.expectedPrimary.source} · ${row.expectedPrimary.license}`);
      report.labels.push({ term: row.term, width, text: await page.locator("#dictionary-example-source").textContent(), canonicalSourceUnchanged: true });
    }
    const native = await page.evaluate(async rows => {
      const [{ createAdditiveExamplesLoader }, { dictionaryExamplesRelease }, current] = await Promise.all([
        import(new URL("js/dictionary-examples-additive.js", document.baseURI)),
        import(new URL("js/dictionary-examples-release-v4.js", document.baseURI)),
        import(new URL("js/dictionary-examples-current-v4.js", document.baseURI))
      ]);
      const reader = createAdditiveExamplesLoader(dictionaryExamplesRelease);
      try {
        const checks = [];
        for (const row of rows) {
          const original = await reader.load(row.term, { lookupQuery: row.term });
          const before = JSON.stringify(original);
          const corrected = await current.loadDictionaryExamples(row.term);
          if (before !== JSON.stringify(row.originalDTO) || JSON.stringify(original) !== before
            || JSON.stringify(corrected) !== JSON.stringify(row.expectedCorrectedDTO)) throw Error("Source metadata changed: " + row.term);
          checks.push({ term: row.term, originalDTOExact: true, correctedDTOExact: true,
            originalSources: original.senses.map(s => s.source), correctedSources: corrected.senses.map(s => s.source),
            reviewers: corrected.senses.map(s => s.reviewer) });
        }
        return checks;
      } finally { reader.close(); current.resetDictionaryExamplesCacheForTests(); }
    }, fixture.rows);
    expect(native).toHaveLength(fixture.rows.length); report.native.push(...native);
    const saved = await page.evaluate(async rows => {
      const currentUI = await import(new URL("js/dictionary-examples-ui-v108.js", document.baseURI));
      const retainedUI = await import(new URL("js/dictionary-examples-ui.js", document.baseURI));
      const checks = [];
      for (const [variant, module] of [["v108", currentUI], ["retained", retainedUI]]) for (const row of rows) {
        const root = document.createElement("div"), anchor = document.createElement("div"); root.append(anchor); document.body.append(root);
        const originalTexts = ["Keep my personal English sentence.", "保留我的个人译文。", "Keep my original book passage."];
        const nodes = originalTexts.map(text => { const p = document.createElement("p"); p.textContent = text; root.append(p); return p; });
        const card = { term: row.term, partOfSpeech: row.approvedPair.partOfSpeech, meaning: row.approvedPair.meaningZh,
          example: originalTexts[0], exampleZh: originalTexts[1], bookPassage: originalTexts[2],
          study: { box: 4, correct: 7, incorrect: 2 }, note: "Keep my private note." };
        const before = JSON.stringify(card), section = module.createDictionaryExamplesSection({ root: document, after: anchor });
        try {
          await section.show(card);
          checks.push({ variant, term: row.term, visible: !section.section.hidden,
            sourceText: section.section.querySelector(".dictionary-learning-source")?.textContent,
            sourceMetadataAndSavedCardUnchanged: JSON.stringify(card) === before,
            originalPersonalAndBookTextUnchanged: JSON.stringify(nodes.map(n => n.textContent)) === JSON.stringify(originalTexts),
            selectedLabels: [...section.section.querySelectorAll("h4")].map(n => n.textContent),
            en: [...section.section.querySelectorAll('p[lang="en"]')].map(n => n.textContent),
            zh: [...section.section.querySelectorAll('p[lang="zh-CN"]')].map(n => n.textContent),
            noOverflow: document.documentElement.scrollWidth <= innerWidth + 1 && section.section.scrollWidth <= section.section.clientWidth + 1 });
        } finally { section.clear(); root.remove(); }
      }
      return checks;
    }, fixture.rows);
    expect(saved).toHaveLength(fixture.rows.length * 2);
    for (const check of saved) {
      const row = fixture.rows.find(r => r.term === check.term);
      // The retained renderer intentionally reads its original v96 catalogue;
      // this presentation change must not migrate that loader or its pairs.
      const expected = check.variant === "retained" ? row.originalDTO : row.expectedCorrectedDTO;
      expect(check.visible && check.sourceMetadataAndSavedCardUnchanged && check.originalPersonalAndBookTextUnchanged && check.noOverflow).toBe(true);
      expect(check.sourceText).toBe("原创学习例句");
      expect(check.selectedLabels).toEqual(expected.senses.map(s => s.partOfSpeech + " · " + s.meaningZh));
      expect(check.en).toEqual(expected.senses.flatMap(s => s.examples.map(p => p.en)));
      expect(check.zh).toEqual(expected.senses.flatMap(s => s.examples.map(p => p.zh)));
    }
    report.saved.push(...saved);
    expect(await context.cookies(base)).toEqual([]);
  } finally { await page.close(); }
}
