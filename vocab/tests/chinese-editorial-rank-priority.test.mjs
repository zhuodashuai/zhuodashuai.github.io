import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';

const lexicalFields = ['term','partOfSpeech','meaning','source','license','url','alternatives'];
const lexical = row => Object.fromEntries(lexicalFields.map(key => [key,row[key]]));

test('equal-strength Chinese translations prefer the existing editorial projection without dropping original alternatives', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(new URL(url).protocol, 'file:');
    assert.equal(options.credentials, 'omit');
    requests.push(String(url));
    return new Response(await readFile(url));
  };
  for (const [query, preferred, retained] of [
    ['剖腹产','caesarean section','caesarian'],
    ['决定因素','determinant','payoff'],
    ['止痛药','painkiller','killer'],
  ]) {
    const first = await searchExpandedDictionary(query, {fetchImpl,limit:1});
    assert.equal(first.ranking, 'global');
    assert.equal(first.results[0].term, preferred, query);
    const rows = [];
    let page = first;
    do {
      rows.push(...page.results);
      if (!page.hasMore) break;
      assert.equal(page.nextOffset, rows.length);
      page = await searchExpandedDictionary(query, {fetchImpl,limit:1,offset:page.nextOffset});
      assert.equal(page.ranking, 'global');
    } while (true);
    assert.equal(rows.length, first.total);
    assert.equal(new Set(rows.map(row => row.term)).size, first.total);
    assert.ok(rows.some(row => row.term === retained), query + ' keeps the original candidate');
    for (const term of [preferred,retained]) {
      const literal = await searchExpandedDictionary(term, {fetchImpl});
      assert.deepEqual(lexical(rows.find(row => row.term === term)),lexical(literal.results[0]),term);
    }
    assert.deepEqual(await searchExpandedDictionary(query,{fetchImpl,limit:1}),first);
  }
  const compound = await searchExpandedDictionary('吸尘器',{fetchImpl,limit:100});
  assert.equal(compound.results[0].term,'vacuum');
  assert.ok(compound.results.some(row => row.term === 'robot vacuum cleaner'));
  assert.equal((await searchExpandedDictionary('获得',{fetchImpl})).results[0].term,'get');
  assert.equal((await searchExpandedDictionary('赢得',{fetchImpl})).results[0].term,'win');
  assert.equal(requests.filter(url => url.endsWith('.bin')).length,1);
});
