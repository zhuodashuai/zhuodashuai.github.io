import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { contextualizeReadingEntry, entryLookupKeys, parsePublicSnapshot } from '../js/wordbook-schema.js';
import { buildCollectionCatalog, filterEntriesByCollection } from '../js/collections.js';
import { createChapterQuiz, validateQuizAttempt } from '../js/chapter-quiz.js';
import { scheduleReview } from '../js/review.js';
import { buildDueQueue } from '../js/study.js';

const packet = JSON.parse(await readFile(new URL('../data/reading-lists/teamwork/chapter-4.json', import.meta.url)));
const snapshot = parsePublicSnapshot(JSON.parse(await readFile(new URL('../data/owner-wordbook.json', import.meta.url))), { allowLegacy: false });
const membership = 'collection:teamwork:chapter-4';
const byId = new Map(snapshot.entries.map(row => [row.id, row]));
const cards = filterEntriesByCollection(snapshot.entries, 'teamwork', 'chapter-4')
  .map(entry => contextualizeReadingEntry(entry, 'teamwork', 'chapter-4'));

test('the fourth Teamwork article exposes exactly its 92 source-ordered, contextual learning cards', () => {
  assert.equal(packet.sourcePdfSha256, 'd9f95bfe64491bd7816064a11d4f2ed69962aac4310e5d0b0717e2962f704dee');
  assert.equal(packet.articleTitle, 'The Secrets of Great Teamwork');
  assert.equal(packet.authors, 'Martine Haas; Mark Mortensen');
  assert.equal(packet.expectedItemCount, 92);
  assert.equal(packet.curation.originalItemCount, packet.items.length + packet.curation.excludedItems.length);
  assert.equal(cards.length, 92);
  assert.deepEqual(cards.map(row => row.id), packet.items.map(item => item.reuseExistingEntryId));
  assert.equal(new Set(cards.map(row => row.id)).size, cards.length);
  for (const [index, item] of packet.items.entries()) {
    assert.equal(item.order, index + 1);
    const canonical = byId.get(item.reuseExistingEntryId), card = cards[index];
    assert.ok(canonical.tags.includes(membership));
    const context = canonical.readingContexts.find(row => row.membership === membership);
    assert.equal(context.order, item.order);
    assert.equal(context.page, `PDF p. ${item.pdfPage} · print p. ${item.printedPage}`);
    assert.ok(item.pdfPage >= 3 && item.pdfPage <= 8);
    for (const view of [context, card]) {
      for (const field of ['originalInput', 'entryType', 'partOfSpeech', 'meaning', 'usage', 'exampleEn', 'exampleZh', 'forms', 'collocations', 'confusedWith']) {
        assert.deepEqual(view[field], item[field], `${item.term}: ${field}`);
      }
      assert.equal(view.definition, item.definitionEn);
      assert.equal(view.sourceTitle, packet.sourceTitle);
      assert.equal(view.sourceWork, 'Teamwork');
      assert.match(view.attributionNote, /Martine Haas; Mark Mortensen/u);
      assert.match(view.attributionNote, /例句为自拟/u);
      assert.doesNotMatch([view.meaning, view.usage, view.attributionNote].join(' '), /AI复核|作者自查/u);
    }
    assert.equal(card.sourceUrl, packet.sourceUrl);
    assert.equal(card.author, '');
    assert.equal(card.senses[0].meaningZh, item.meaning);
    assert.deepEqual(card.senses[0].examples, [{ en: item.exampleEn, zh: item.exampleZh }]);
  }
  const chapter = buildCollectionCatalog(snapshot.entries).find(book => book.id === 'teamwork').chapters.find(row => row.id === 'chapter-4');
  assert.equal(chapter.title, packet.articleTitle);
  assert.equal(chapter.count, 92);
});

test('explicit reuse keeps existing identities and source contexts while new excerpts never become spelling aliases', () => {
  const reused = packet.items.filter(item => item.duplicateDecision.action === 'reuse-same-sense');
  const fresh = packet.items.filter(item => item.duplicateDecision.action === 'new-card');
  assert.equal(reused.length, 12); assert.equal(fresh.length, 80);
  for (const item of reused) {
    const entry = byId.get(item.reuseExistingEntryId);
    assert.ok(entry.readingContexts.some(row => row.membership !== membership));
    const before = structuredClone(entry);
    const other = entry.readingContexts.find(row => row.membership !== membership);
    const [collection, chapter] = other.membership.slice('collection:'.length).split(':');
    const oldView = contextualizeReadingEntry(entry, collection, chapter);
    assert.equal(oldView.meaning, other.meaning);
    assert.equal(oldView.exampleEn, other.exampleEn);
    assert.deepEqual(entry, before);
  }
  for (const item of fresh) {
    const entry = byId.get(item.reuseExistingEntryId);
    assert.equal(entry.correction.status, 'exact');
    assert.equal(entry.correction.original, item.term);
    assert.deepEqual(entryLookupKeys(entry), [entry.normalized]);
    assert.deepEqual(entry.readingContexts.map(row => row.membership), [membership]);
  }
  const whole = filterEntriesByCollection(snapshot.entries, 'teamwork');
  assert.equal(new Set(whole.map(row => row.id)).size, whole.length);
});

test('difficulty curation excludes obvious basics and keeps difficult words and source-specific familiar senses', () => {
  const terms = new Set(packet.items.map(row => row.term));
  for (const head of ['drudgery', 'requisite', 'repartition', 'homogeneous', 'seminal', 'pan', 'prime for',
    'strapped', 'temperature check', 'structured unstructured time', 'light-touch monitoring']) assert.ok(terms.has(head), head);
  for (const excluded of packet.curation.excludedItems) {
    assert.ok(excluded.reason);
    assert.equal(terms.has(excluded.term), false);
  }
  assert.ok(packet.curation.excludedItems.some(row => row.term === 'at home'));
  const item = term => packet.items.find(row => row.term === term);
  assert.match(item('pan').meaning, /摄像/u);
  assert.match(item('prime for').meaning, /准备/u);
  assert.match(item('fluid').meaning, /成员/u);
  assert.match(item('ownership').usage, /整个模块/u);
  assert.match(item('temperature check').meaning, /团队/u);
  assert.match(item('enabling conditions').usage, /strong structure.*supportive context/u);
});

test('the new chapter shares saved progress and produces a complete source-scoped quiz without mutating cards', () => {
  const before = JSON.stringify(cards), now = new Date('2026-10-31T12:00:00Z');
  let seed = 4;
  const quiz = createChapterQuiz(cards, { id: 'teamwork-secrets-regression', bookId: 'teamwork', chapterId: 'chapter-4',
    bookTitle: 'Teamwork', chapterTitle: packet.articleTitle, now: now.toISOString(),
    random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
  validateQuizAttempt(quiz);
  assert.equal(quiz.questions.length, 92); assert.deepEqual(quiz.omitted, []);
  const ids = new Set(cards.map(row => row.id));
  for (const question of quiz.questions) {
    assert.ok(ids.has(question.entryId));
    for (const option of question.options) assert.ok(ids.has(option.sourceEntryId));
  }
  const shared = packet.items.find(item => item.duplicateDecision.action === 'reuse-same-sense');
  const review = scheduleReview({ entryId: shared.reuseExistingEntryId }, 'good', now);
  for (const scope of [cards, filterEntriesByCollection(snapshot.entries, 'teamwork')]) {
    assert.equal(buildDueQueue(scope, [review], now).some(row => row.entry.id === shared.reuseExistingEntryId), false);
  }
  assert.equal(JSON.stringify(cards), before);
});
