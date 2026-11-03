import assert from 'node:assert/strict';
import test from 'node:test';
import {collectionContextForEntry, MAIN_READING_HOME_TAG, preserveCollectionTags, visibleEntryTags} from '../js/collections.js';

test('a main-book learning-home marker survives editing while remaining absent from visible tags',()=>{
  const tags=['用户标签',MAIN_READING_HOME_TAG,'collection:teamwork:chapter-8'];
  assert.deepEqual(visibleEntryTags({tags}),['用户标签']);
  assert.deepEqual(preserveCollectionTags(tags,['新标签']),[MAIN_READING_HOME_TAG,'collection:teamwork:chapter-8','新标签']);
  const entry={tags,readingContexts:[],sourceWork:'原词典',sourceTitle:'原出处'};
  assert.equal(collectionContextForEntry(entry,'main','all'),null);
  assert.equal(collectionContextForEntry(entry,'all','all'),null);
  assert.equal(collectionContextForEntry(entry,'teamwork','chapter-8').chapterId,'chapter-8');
});
