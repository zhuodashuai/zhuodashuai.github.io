import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CANONICAL_EXAMPLE_REPAIRS as table} from '../../vocab/js/canonical-example-repairs-data.js';
import {loadDictionaryExamples,resetDictionaryExamplesCacheForTests} from '../../vocab/js/dictionary-examples-current-v4.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=async relative=>JSON.parse(await readFile(new URL('../dictionary/examples/canonical-repairs/'+relative,import.meta.url),'utf8'));
const source=await read('source/canonical-quality-0004.json');
const review=await read('reviews/canonical-quality-0004.json');
const proof=await read('canonical-quality-0004-provenance.json');

test('batch0004 admits only29 independently approved pairs under unchanged canonical identities',()=>{
  assert.equal(hash(source),'9605e1e318fe3dbfd5819e37d421f01b1358b6aba7f525e1c86f90bc2f3121b5');
  assert.equal(hash(review),'308b53a91597300e99416eedf00d34cafeec97db6049ea84a12691d9d0735ac4');
  assert.equal(review.sourceSha256,hash(source));assert.equal(review.independentOfAuthor,true);assert.notEqual(source.author,review.reviewer);assert.deepEqual(review.issues,[]);
  assert.equal(source.entries.length,29);assert.equal(review.decisions.length,29);
  assert(table.rows.length>=51);assert(table.rows.reduce((n,row)=>n+1+(row.additionalExamples?.length??0),0)>=52);
  const boundHeads=new Set([...proof.beforeRows.map(r=>r.term),...source.entries.map(r=>r.term)]);assert.equal(boundHeads.size,51);assert.equal(hash(table.rows.filter(r=>boundHeads.has(r.term))),proof.compiledRowsSha256);
  for(const row of source.entries){
    const decision=review.decisions.find(d=>d.term===row.term);assert.equal(decision?.decision,'approve-canonical-example-repair');assert.equal(decision.rowSha256,hash(row));
    const compiled=table.rows.find(r=>r.term===row.term);assert(compiled,row.term);
    for(const key of ['canonicalId','canonicalSourceSha256','exactCanonicalRecord','canonicalSourceDescriptor','expectedOriginalEntry','expectedOriginalEntrySha256','acceptedDisplayContexts','replacementPair'])assert.deepEqual(compiled[key],row[key],row.term+'/'+key);
    assert.equal(row.replacementPair.partOfSpeech,row.exactCanonicalRecord.partOfSpeech);assert.equal(row.replacementPair.meaningZh,row.exactCanonicalRecord.meaning);
    assert.notEqual(compiled.senseId,row.expectedOriginalEntry.senses[0].id);
  }
});

test('all22 previous compiled rows and23 previous pairs survive the additive batch byte-for-byte',()=>{
  assert.equal(proof.baselineHead,'2b090b6d23a9789720a6cdbb4f4c4559e60348b6');assert.equal(proof.beforeRows.length,22);
  assert.equal(proof.newHeads,29);assert.equal(proof.newPairs,29);assert.equal(proof.combinedHeads,51);assert.equal(proof.combinedPairs,52);
  assert.equal(hash(source),proof.sourceSha256);assert.equal(hash(review),proof.reviewSha256);
  const previous=proof.beforeRows.map(old=>{const row=table.rows.find(r=>r.term===old.term);assert.equal(hash(row),old.sha256,old.term);return row;});
  assert.equal(previous.reduce((n,row)=>n+1+(row.additionalExamples?.length??0),0),23);
});

test('new source-matched examples never leak into cards saved with another POS or meaning',async()=>{
  const fetchImpl=async url=>new Response(await readFile(new URL(url)));
  for(const row of source.entries){
    for(const identity of row.acceptedDisplayContexts){
      const saved={...identity,example:'Keep my sentence.',bookPassage:'Keep the book sentence.',study:{box:4}};
      const before=structuredClone(saved);const result=await loadDictionaryExamples(row.term,{fetchImpl,savedEntry:saved});assert(result,row.term);
      assert.deepEqual(result.senses[0].examples,[{en:row.replacementPair.en,zh:row.replacementPair.zh}]);assert.deepEqual(saved,before);
    }
    const old=row.expectedOriginalEntry.senses[0];
    for(const identity of [{partOfSpeech:old.partOfSpeech,meaning:old.meaningZh},{partOfSpeech:row.exactCanonicalRecord.partOfSpeech,meaning:'This is a different saved sense.'}]){
      const saved={term:row.term,...identity,example:'Existing sentence.',study:{box:3}};const before=structuredClone(saved);let requests=0;
      assert.equal(await loadDictionaryExamples(row.term,{savedEntry:saved,fetchImpl:async()=>{requests++;throw Error('Mismatched identity must stop before fetching');}}),null,row.term);
      assert.equal(requests,0);assert.deepEqual(saved,before);
    }
  }
  resetDictionaryExamplesCacheForTests();
});
