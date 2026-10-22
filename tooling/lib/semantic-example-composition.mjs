// Pure mechanical projection only: a conditional language opinion is NOT an
// actual-source reentry receipt, example admission or publication permission.
import assert from 'node:assert/strict';
import {verifySemanticRevisionBundle,SEMANTIC_SOURCE_REVISION_ID} from './dictionary-semantic-revisions.mjs';
import {exampleSourceHash,validateExampleReview} from '../scripts/build-dictionary-examples.mjs';

export function composeSemanticExampleSource(proofStrings){
  const verified=verifySemanticRevisionBundle(SEMANTIC_SOURCE_REVISION_ID,proofStrings);
  const entries=verified.entries.map(({pair})=>{
    const[term,partOfSpeech,meaningZh,en,zh]=pair;
    return{term,partOfSpeech,meaningZh,en,zh};
  });
  const source={schemaVersion:1,batchId:'examples-0024-p001',authorship:'independent-composition',entries};
  const review={schemaVersion:1,sourceSha256:exampleSourceHash(source),reviewer:'AI/examples24_reviewer_c',
    independentOfAuthor:true,approvedTerms:entries.map(row=>row.term),issues:[],
    reviewMethod:'Exact mechanical mapping of Root five-cell pairs and C independent conditional whole-source/pair opinions. No new language decision. Actual materialized-source reentry, admission and publication require their own separate checks; this pure mapping grants none.'};
  assert.equal(validateExampleReview(source,review).length,5);
  return{source,review};
}
