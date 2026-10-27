import test from 'node:test';
import assert from 'node:assert/strict';
import { d25ExpectedCurrentDisplay, D25_DAILY_DISPLAY_COMPATIBILITY, D25_TARGET_SOURCE_EVOLUTIONS } from './d25-regression-fixture-v2.mjs';
import { EVERYDAY_LOOKUP_ENTRIES } from '../../vocab/js/everyday-lookup-data.js';

test('D25 permits only one exact registered daily display while keeping raw target-source evolution empty', () => {
  assert.deepEqual(Object.keys(D25_DAILY_DISPLAY_COMPATIBILITY), ['to be honest']);
  assert.deepEqual(D25_TARGET_SOURCE_EVOLUTIONS, []);
  const row = EVERYDAY_LOOKUP_ENTRIES.find(r => r.term === 'to be honest');
  const frozen = { term: 'to be honest', meaning: 'historical source' };
  const expected = D25_DAILY_DISPLAY_COMPATIBILITY['to be honest'].display;
  assert.equal(d25ExpectedCurrentDisplay({term:row.term}, frozen, [row]), expected);
  for (const changed of [{...row,meaning:'猜测的新义'}, {...row,partOfSpeech:'adjective'},
    {...row,en:'A different sentence.'}, {...row,chineseAliases:[...row.chineseAliases,'诚实的人']}]) {
    assert.throws(() => d25ExpectedCurrentDisplay({term:row.term}, frozen, [changed]), /Unreviewed/u);
  }
  assert.throws(() => d25ExpectedCurrentDisplay({term:row.term}, frozen, []), /unique/u);
  assert.throws(() => d25ExpectedCurrentDisplay({term:row.term}, frozen, [row,row]), /unique/u);
  // An unrelated new local entry is never blanket-authorized by this fixture.
  const other = {term:'unknown override',meaning:'new local content'};
  assert.equal(d25ExpectedCurrentDisplay(other, frozen, [other]), frozen);
});
