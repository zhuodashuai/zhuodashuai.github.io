import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rejectsReviewedDictionaryForm} from '../js/dictionary-form-evidence.js';
import {searchExpandedDictionary} from '../js/expanded-dictionary.js';
import {preloadExpandedDictionary} from '../js/expanded-dictionary.js';
import {suggestDictionaryTerms} from '../js/dictionary-suggestions.js';
import {automaticDictionaryCollection} from '../js/dictionary-collection.js';
import {lookupPersonalDictionary} from '../js/personal-dictionary.js';
const evidence=JSON.parse(await readFile(new URL('../../tooling/dictionary/search-benchmarks/comming-source-evidence.json',import.meta.url)));
const local=async url=>new Response(await readFile(url));
const fields=['term','partOfSpeech','meaning','source','license','url','alternatives'];
const lexical=row=>Object.fromEntries(fields.map(key=>[key,row[key]]));

test('the rejected form binds the complete authenticated raw record and preserves all other interpretations',async()=>{
  const bytes=await readFile(new URL('../data/expanded-dictionary/'+evidence.source.descriptor.file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.source.actualSha256);
  assert.equal(bytes.length,evidence.source.bytes);
  assert.deepEqual(JSON.parse(bytes).records.find(row=>row.id===3775454),evidence.record);
  assert(rejectsReviewedDictionaryForm(evidence.record,evidence.manifestVersion,'comming'));
  for(const form of ['COM','com','coms','coming','comes','come'])assert(!rejectsReviewedDictionaryForm(evidence.record,evidence.manifestVersion,form));
  for(const changed of [{id:3775455},{term:'com'},{partOfSpeech:'verb'},{forms:['comming']},{source:'mit'},{meaning:'另一条释义'}]){
    assert(!rejectsReviewedDictionaryForm({...evidence.record,...changed},evidence.manifestVersion,'comming'));
  }
  assert(!rejectsReviewedDictionaryForm(evidence.record,'a'.repeat(64),'comming'));
});

test('a wrong coming spelling cannot resolve or auto-collect technical COM; explicit correction remains available',async()=>{
  const options={fetchImpl:local},found=await searchExpandedDictionary('comming',options);
  assert.deepEqual(found.results,[]);assert.equal(automaticDictionaryCollection('comming',found),false);
  assert.deepEqual((await searchExpandedDictionary('comming!',options)).results,[]);
  const manifest=await preloadExpandedDictionary(options);
  const suggestions=await suggestDictionaryTerms('comming',{...options,dictionaryVersion:manifest.version});
  assert(suggestions.some(row=>row.term==='coming'));
  // The real compact member source does not supply a stale technical fallback.
  assert.equal(await lookupPersonalDictionary('comming',options),null);
});

test('literal COM and its separately declared plural retain complete lexical/source fields',async()=>{
  const literal=(await searchExpandedDictionary('COM',{fetchImpl:local})).results[0];
  assert.equal(literal.term,'COM');assert.equal(literal.partOfSpeech,'noun');assert.match(literal.meaning,/计算机输出/u);
  const plural=(await searchExpandedDictionary('coms',{fetchImpl:local})).results[0];
  assert.deepEqual(lexical(plural),lexical(literal));assert.equal(plural.matchedForm,'coms');
  assert.equal((await searchExpandedDictionary('coming',{fetchImpl:local})).results[0].term,'coming');
  assert.equal((await searchExpandedDictionary('come',{fetchImpl:local})).results[0].term,'come');
});
