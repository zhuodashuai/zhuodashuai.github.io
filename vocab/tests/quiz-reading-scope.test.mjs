import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {quizAttemptMatchesScope} from '../js/chapter-quiz-ui.js';
import {createChapterQuiz, validateQuizAttempt} from '../js/chapter-quiz.js';
import {filterEntriesByCollection} from '../js/collections.js';
import {filterLearningEntries} from '../js/reading-card-policy.js';
import {contextualizeReadingEntry} from '../js/wordbook-schema.js';

test('historical questions or distractors outside the current reading scope cannot resume',()=>{
  const record={questions:[{entryId:'kept',options:[{sourceEntryId:'kept'},{sourceEntryId:'hidden'}]}]};
  const before=structuredClone(record);
  assert.equal(quizAttemptMatchesScope(record,[{id:'kept'}]),false);
  assert.equal(quizAttemptMatchesScope(record,[{id:'hidden'}]),false);
  assert.equal(quizAttemptMatchesScope(record,[{id:'kept'},{id:'hidden'}]),true);
  assert.deepEqual(record,before,'Saved attempts, questions and scores must not be rewritten');
});

test('real Teamwork quizzes exclude repeated cards while all saved raw-source quiz records remain valid',async()=>{
  const snapshot=JSON.parse(await readFile(new URL('../data/owner-wordbook.json',import.meta.url)));
  for(const [chapter,count] of [[5,92],[6,74],[7,76]]){
    const chapterId=`chapter-${chapter}`;
    const raw=filterEntriesByCollection(snapshot.entries,'teamwork',chapterId).map(entry=>contextualizeReadingEntry(entry,'teamwork',chapterId));
    const visible=filterLearningEntries(snapshot.entries,'teamwork',chapterId).map(entry=>contextualizeReadingEntry(entry,'teamwork',chapterId));
    const options={id:`scope-${chapter}`,bookId:'teamwork',chapterId,now:'2026-11-03T12:00:00.000Z'};
    const historical=createChapterQuiz(raw,options),saved=structuredClone(historical);
    assert.equal(quizAttemptMatchesScope(historical,visible),false);
    const current=createChapterQuiz(visible,options);
    validateQuizAttempt(current);assert.equal(current.questions.length,count);
    assert.equal(quizAttemptMatchesScope(current,visible),true);
    assert.equal(quizAttemptMatchesScope(historical,raw),true,'Showing repeated cards restores the old scope');
    assert.deepEqual(historical,saved);
    validateQuizAttempt(historical);
  }
});
