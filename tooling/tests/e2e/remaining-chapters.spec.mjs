import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { contextualizeReadingEntry, formatMeaningForDisplay, normalizeEnglish } from "../../../vocab/js/wordbook-schema.js";
import { filterEntriesByCollection, splitChineseMeaningPoints } from "../../../vocab/js/collections.js";

const bookId = "never-let-me-go";
const chapters = Array.from({ length: 11 }, (_, index) => index + 13);
const snapshot = JSON.parse(await readFile(new URL("../../../vocab/data/owner-wordbook.json", import.meta.url), "utf8"));
const sources = new Map(await Promise.all(chapters.map(async chapter => [chapter,
  JSON.parse(await readFile(new URL(`../../../vocab/data/reading-lists/${bookId}/chapter-${chapter}.json`, import.meta.url), "utf8"))
])));

const canonicalFor = (chapter, term) => snapshot.entries.find(entry => entry.normalized === normalizeEnglish(term)
  && entry.tags.includes(`collection:${bookId}:chapter-${chapter}`));
const viewsFor = chapter => filterEntriesByCollection(snapshot.entries, bookId, `chapter-${chapter}`)
  .map(entry => contextualizeReadingEntry(entry, bookId, `chapter-${chapter}`));
const runId = info => `remaining-${createHash("sha256").update(info.testId).digest("hex").slice(0, 21)}`;
const chapterUrl = (chapter, info) => `/?book=${bookId}&chapter=chapter-${chapter}&e2e=1&testRun=${runId(info)}`;

async function reviewStates(page) {
  return page.evaluate(async () => (await import("/js/owner-storage.js?v=76")).listReviewStates());
}

async function attempts(page, chapter) {
  return page.evaluate(async scope => (await import("/js/quiz-storage.js?v=76")).quizStorage.listAttempts(scope), {
    bookId, chapterId: `chapter-${chapter}`
  });
}

// Verify application playback wiring without invoking a real OS voice or
// making claims about iPhone speakers, voice-pack availability or voice quality.
async function installSpeechStub(page) {
  await page.addInitScript(() => {
    const state = { calls: [], active: null };
    const dispatch = (utterance, name, detail = {}) => {
      if (!utterance) return;
      const event = new Event(name);
      Object.assign(event, detail);
      utterance.dispatchEvent(event);
      utterance[`on${name}`]?.(event);
    };
    const speech = new EventTarget();
    speech.getVoices = () => [{ name: "Test British English", lang: "en-GB", localService: true, default: true, voiceURI: "remaining-gb" }];
    speech.resume = () => {};
    speech.cancel = () => {
      const previous = state.active;
      state.active = null;
      dispatch(previous, "error", { error: "canceled" });
    };
    speech.speak = utterance => {
      state.active = utterance;
      state.calls.push({ text: utterance.text, lang: utterance.lang });
      queueMicrotask(() => { if (state.active === utterance) dispatch(utterance, "start"); });
    };
    class Utterance extends EventTarget {
      constructor(text) { super(); this.text = text; }
    }
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: speech });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
    window.__remainingAudio = state;
  });
}

test.beforeEach(async ({ context, page }, info) => {
  await context.addCookies([{ name: "e2e_run", value: runId(info), url: "http://127.0.0.1:4187", sameSite: "Lax" }]);
  page.on("pageerror", error => { throw new Error(`Unhandled remaining-chapter error: ${error.message}`); });
  await installSpeechStub(page);
});

function expectedLearningPoints(item) {
  // Unlike the older chapter fixture, these lists may have more than one
  // numbered meaning. Exercise all actual source points, not just “①”.
  return [
    ...splitChineseMeaningPoints(formatMeaningForDisplay({ meaning: item.meaning, senses: item.senses || [] })),
    item.usage
  ];
}

async function expectChapter(page, chapter) {
  await expect(page.getByRole("heading", { name: `Never Let Me Go · Chapter ${chapter}`, exact: true })).toBeVisible();
  await expect(page.locator("#entry-count")).toHaveText(String(sources.get(chapter).expectedItemCount));
  await expect(page.locator("#chapter-select")).toHaveValue(`chapter-${chapter}`);
}

for (const chapter of chapters) {
  test(`Chapter ${chapter}: all reviewed cards, complete phrase audio, saved quiz and active recall survive reopening`, async ({ page }, info) => {
    // Each test checks an entire source chapter (roughly 20–30 cards), not one
    // sampled word. Bound only these comprehensive flows, not unrelated tests.
    test.setTimeout(120_000);
    const source = sources.get(chapter);
    const mobile = chapter === 20 || chapter === 23;
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(chapterUrl(chapter, info));
    await expectChapter(page, chapter);
    const catalogValues = await page.locator("#chapter-select option").evaluateAll(options => options.map(option => option.value));
    expect(catalogValues).toEqual(["all", ...Array.from({ length: 23 }, (_, index) => `chapter-${index + 1}`)]);
    await expect(page.locator("#entry-grid .word-card h3")).toHaveText(source.items.map(item => item.term));
    expect(await reviewStates(page)).toEqual([]);

    for (const item of source.items) {
      const canonical = canonicalFor(chapter, item.term);
      expect(canonical, `${item.term}: a canonical source identity exists`).toBeDefined();
      const expectedPhonetic = item.reuseExistingSameSense ? canonical.phonetic : (item.phonetic || canonical.phonetic);
      const points = expectedLearningPoints(item);
      const card = page.locator("#entry-grid .word-card").filter({ has: page.getByRole("heading", { name: item.term, exact: true }) });
      await expect(card.locator(".card-meaning li")).toHaveText(points);
      await expect(card.locator(".card-kicker")).toContainText(item.partOfSpeech);
      const cardSpeaker = card.locator("button[data-audio-text]");
      await expect(cardSpeaker).toHaveAccessibleName(`朗读 ${item.term}`);
      await expect(cardSpeaker).toHaveAttribute("data-audio-text", item.term);
      await card.getByRole("button", { name: `查看 ${item.term} 的完整词条`, exact: true }).click();
      const dialog = page.locator("#entry-dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("#dialog-term")).toHaveText(item.term);
      await expect(dialog.locator("#dialog-phonetic")).toHaveText([expectedPhonetic, item.partOfSpeech].filter(Boolean).join(" · "));
      await expect(dialog.locator("#dialog-meaning li")).toHaveText(points);
      if (item.originalInput !== item.term) await expect(dialog.locator(".detail-original-form p")).toHaveText(item.originalInput);
      else await expect(dialog.locator(".detail-original-form")).toHaveCount(0);
      await expect(dialog.locator("#dialog-definition")).toHaveText(item.definitionEn);
      await expect(dialog.locator("#dialog-example-en")).toHaveText(item.exampleEn);
      await expect(dialog.locator("#dialog-example-zh")).toHaveText(item.exampleZh);
      await expect(dialog.locator("#dialog-source-status")).toContainText(source.sourceTitle);
      await expect(dialog.locator("#dialog-source-status")).toContainText(`p. ${item.page}`);
      await expect(dialog.locator("#dialog-source-status")).toContainText(source.attributionNote);
      await expect(dialog.locator("#dialog-speak")).toHaveAccessibleName(`朗读 ${item.term}`);
      await expect(dialog.locator("#dialog-speak")).toHaveAttribute("data-audio-text", item.term);
      await dialog.locator("#dialog-speak").click();
      await expect.poll(() => page.evaluate(() => window.__remainingAudio.calls.at(-1)?.text)).toBe(item.term);
      await dialog.getByRole("button", { name: "关闭词条详情" }).click();
    }
    expect(await page.evaluate(() => window.__remainingAudio.calls.map(call => call.text))).toEqual(source.items.map(item => item.term));
    expect(await reviewStates(page)).toEqual([], "browsing and audio cannot create learning scores");
    await page.locator("#library-search").fill(source.items[0].originalInput);
    await expect(page.locator("#entry-grid .word-card h3")).toContainText([source.items[0].term]);
    await page.locator("#library-search").fill("");

    // Quiz writes belong to their own database and do not schedule a review.
    await page.locator("#chapter-quiz-button").click();
    await page.locator("#quiz-start").click();
    await expect(page.locator("#quiz-options > button")).toHaveCount(4);
    const initial = (await attempts(page, chapter))[0];
    expect(initial.questions).toHaveLength(source.expectedItemCount);
    expect(initial.omitted).toEqual([]);
    expect(new Set(initial.questions.map(question => question.entryId))).toEqual(new Set(viewsFor(chapter).map(entry => entry.id)));
    for (const question of initial.questions) {
      expect(question.options).toHaveLength(4);
      expect(new Set(question.options.map(option => option.meaning)).size).toBe(4);
      expect(question.options.filter(option => option.id === question.correctOptionId)).toHaveLength(1);
      expect(question.options.every(option => /\p{Script=Han}/u.test(option.meaning))).toBe(true);
    }
    await expect(page.locator("#quiz-term")).toHaveText(initial.questions[0].term);
    await page.locator(`#quiz-options > button[data-option-id="${initial.questions[0].correctOptionId}"]`).click();
    await expect(page.locator("#quiz-next")).toBeEnabled();
    const answered = (await attempts(page, chapter))[0];
    expect(answered.answers).toHaveLength(1);
    expect(answered.answers[0].correct).toBe(true);
    await page.locator("#quiz-close").click();
    await page.reload();
    await expectChapter(page, chapter);
    await page.locator("#chapter-quiz-button").click();
    await page.locator("#quiz-resume").click();
    await expect(page.locator("#quiz-term")).toHaveText(initial.questions[1].term);
    expect((await attempts(page, chapter))[0]).toEqual(answered);
    expect(await reviewStates(page)).toEqual([]);
    await page.locator("#quiz-close").click();

    // Genuine active recall: meanings and grading remain hidden until reveal.
    await page.locator("#study-button").click();
    const dialog = page.locator("#entry-dialog");
    await expect(dialog.locator("#dialog-term")).toHaveText(source.items[0].term);
    await expect(dialog.locator("#dialog-meaning")).toBeHidden();
    await expect(dialog.getByRole("button", { name: "很熟", exact: true })).toBeDisabled();
    await dialog.locator("#recall-reveal").click();
    await expect(dialog.locator("#dialog-meaning li")).toHaveText(expectedLearningPoints(source.items[0]));
    await dialog.getByRole("button", { name: "很熟", exact: true }).click();
    await expect(dialog.locator("#dialog-term")).toHaveText(source.items[1].term);
    await expect(dialog.locator("#dialog-meaning")).toBeHidden();
    const reviews = await reviewStates(page);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ entryId: canonicalFor(chapter, source.items[0].term).id, reviewCount: 1, lastRating: "easy" });
    await dialog.getByRole("button", { name: "关闭词条详情" }).click();
    await page.reload();
    await expectChapter(page, chapter);
    await expect(page.locator("#due-count")).toHaveText(String(source.expectedItemCount - 1));
    expect(await reviewStates(page)).toEqual(reviews);
    expect((await attempts(page, chapter))[0]).toEqual(answered, "learning cannot rewrite the frozen quiz");
    if (mobile) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      if (chapter === 23) await expect(page.locator("#chapter-next")).toBeDisabled();
      else await expect(page.locator("#chapter-next")).toBeEnabled();
    }
  });
}

test("an actively recalled shared card keeps the same saved history in its earlier and later chapter", async ({ page }, info) => {
  const chapter = 14;
  const shared = canonicalFor(chapter, "rummage");
  expect(shared).toBeDefined();
  const earlier = shared.readingContexts.find(context => /:chapter-(?:[1-9]|1[0-2])$/u.test(context.membership));
  expect(earlier).toBeDefined();
  const earlierChapter = Number(earlier.membership.match(/chapter-(\d+)$/u)[1]);
  const cards = viewsFor(chapter);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(chapterUrl(chapter, info));
  await expectChapter(page, chapter);
  // Only fixture progress is seeded, in this run's isolated local database.
  // All other cards are scheduled so the actual recall UI reaches this shared
  // identity without grading unrelated cards or changing the study algorithm.
  await page.evaluate(async ids => {
    const { putReviewState } = await import("/js/owner-storage.js?v=76");
    const { applyReviewRating } = await import("/js/study.js");
    for (const id of ids) await putReviewState(applyReviewRating(id, null, "easy"), { expected: null });
  }, cards.filter(entry => entry.id !== shared.id).map(entry => entry.id));
  await page.reload();
  await expectChapter(page, chapter);
  await expect(page.locator("#due-count")).toHaveText("1");
  await page.locator("#study-button").click();
  await expect(page.locator("#dialog-term")).toHaveText(shared.term);
  await expect(page.locator("#dialog-meaning")).toBeHidden();
  await page.locator("#recall-reveal").click();
  await page.locator('#dialog-review-actions button[data-rating="easy"]').click();
  await expect(page.locator("#due-count")).toHaveText("0");
  const laterHistory = await reviewStates(page);
  const retained = laterHistory.find(state => state.entryId === shared.id);
  expect(retained).toMatchObject({ reviewCount: 1, lastRating: "easy" });
  await page.goto(chapterUrl(earlierChapter, info));
  await expect(page.locator("#library-heading")).toHaveText(`Never Let Me Go · Chapter ${earlierChapter}`);
  const earlierCount = filterEntriesByCollection(snapshot.entries, bookId, `chapter-${earlierChapter}`).length;
  const sharedReviewedHere = filterEntriesByCollection(snapshot.entries, bookId, `chapter-${earlierChapter}`)
    .filter(entry => laterHistory.some(state => state.entryId === entry.id)).length;
  await expect(page.locator("#due-count")).toHaveText(String(earlierCount - sharedReviewedHere));
  await page.getByRole("button", { name: `查看 ${shared.term} 的完整词条`, exact: true }).click();
  await expect(page.locator("#dialog-source-status")).toContainText(`Never Let Me Go — Chapter ${earlierChapter}`);
  await expect(page.locator("#dialog-review-status")).toContainText("已复习 1 次");
  expect(await reviewStates(page)).toEqual(laterHistory);
  await page.locator("#entry-dialog").getByRole("button", { name: "关闭词条详情" }).click();
  await page.goto(chapterUrl(chapter, info));
  await expectChapter(page, chapter);
  await expect(page.locator("#due-count")).toHaveText("0");
  expect(await reviewStates(page)).toEqual(laterHistory);
});
