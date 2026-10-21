import { expect } from "@playwright/test";
import { formatMeaningForDisplay } from "../../../vocab/js/wordbook-schema.js";

// Assert the actual full card, not merely a matching URL or list-row heading.
export async function expectFullPublicEntry(page, entry) {
  await expect(page.locator("#entry-dialog")).toBeVisible();
  await expect(page.locator("#dialog-term")).toHaveText(entry.term);
  await expect(page.locator("#dialog-phonetic")).toHaveText([entry.phonetic, entry.partOfSpeech].filter(Boolean).join(" · "));
  await expect(page.locator("#dialog-meaning")).toHaveText(formatMeaningForDisplay(entry), { useInnerText: true });
  for (const [section, field, value] of [
    ["definition", "definition", entry.definition],
    ["example", "example-en", entry.exampleEn],
    ["example", "example-zh", entry.exampleZh]
  ]) {
    if (value) {
      await expect(page.locator(`#dialog-${section}-section`)).toBeVisible();
      await expect(page.locator(`#dialog-${field}`)).toHaveText(value);
    } else await expect(page.locator(`#dialog-${field}`)).toHaveText("");
  }
  if (entry.senses.length > 1) {
    await expect(page.locator("#dialog-extra article.detail-sense")).toHaveCount(entry.senses.length);
    await expect(page.locator("#dialog-extra .sense-part-of-speech")).toHaveText(entry.senses.map(sense => sense.partOfSpeech).filter(Boolean));
    await expect(page.locator("#dialog-extra .sense-meaning-zh p")).toHaveText(entry.senses.map(sense => sense.meaningZh).filter(Boolean));
    await expect(page.locator("#dialog-extra .sense-definition-en p")).toHaveText(entry.senses.map(sense => sense.definitionEn).filter(Boolean));
    await expect(page.locator("#dialog-extra .sense-example-en p")).toHaveText(entry.senses.flatMap(sense => sense.examples.map(pair => pair.en).filter(Boolean)));
    await expect(page.locator("#dialog-extra .sense-example-zh p")).toHaveText(entry.senses.flatMap(sense => sense.examples.map(pair => pair.zh).filter(Boolean)));
  }
  const sources = page.locator("#dialog-source-list a");
  await expect(sources).toHaveCount(entry.sources.length);
  for (const [index, source] of entry.sources.entries()) {
    await expect(sources.nth(index)).toHaveAttribute("href", source.url);
    await expect(sources.nth(index)).toHaveText(`${source.title || new URL(source.url).hostname} · ${source.kind}`);
  }
  if (entry.sourceUrl) await expect(page.locator("#dialog-source-link")).toHaveAttribute("href", entry.sourceUrl);
}
