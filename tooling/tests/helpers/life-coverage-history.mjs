import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {validateReviewedSensePack,validateSourceCorrectionPolicy} from '../../scripts/build-reviewed-dictionary-senses.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const lifeDirectory=new URL('../../dictionary/everyday-expansions/2026-11-20-life-common-terms/',import.meta.url);
const lifeBytes=await readFile(new URL('source.json',lifeDirectory));
assert.equal(hash(lifeBytes),'0791607eadf16c95e6f66637b3788ed760cb8eff49c5f8af857bfdf064317a78');
const life=JSON.parse(lifeBytes),lifeReviewBytes=await readFile(new URL('review.json',lifeDirectory)),lifeReview=JSON.parse(lifeReviewBytes);
assert.equal(hash(lifeReviewBytes),'e1b95c5092c2064188af63fac4564583ac2d4d375184b5e4e2ec6df0cd5e5bba');
assert.equal(life.entries.length,9);assert.equal(lifeReview.sourceSha256,hash(life));assert.equal(lifeReview.sourceByteSha256,hash(lifeBytes));
assert.equal(lifeReview.independentOfAuthor,true);assert.notEqual(lifeReview.reviewer,life.author);assert.deepEqual(lifeReview.issues,[]);
assert.deepEqual(lifeReview.approvedTerms,life.entries.map(row=>row.term));
assert.deepEqual(lifeReview.reviewedRows.map(({term,rowSha256,languageDecision})=>({term,rowSha256,languageDecision})),
  life.entries.map(row=>({term:row.term,rowSha256:hash(row),languageDecision:'PASS'})));
const lifeBaselineBytes=await readFile(new URL('baseline.json',lifeDirectory)),lifeBaseline=JSON.parse(lifeBaselineBytes);
assert.equal(hash(lifeBaselineBytes),'ab66a604d811f6c4a6004f86e543fca6c90049285fa79085d8946d61579ddcb2');
assert.equal(lifeBaseline.priorSearch33Sha256,'11acd2e34039952990ebc43a5c676b4ae3a5b7060cbce7ba77e3e413941bc6aa');
assert.equal(lifeBaseline.ordinary1061Sha256,'bbc443a631802f77ccbb76bb1a0f495d4ea1c50f3c295bf509498e047a397ba0');
for(const[file,pin]of Object.entries(lifeBaseline.priorSourceAndReviewBytes)){
  assert.equal(hash(await readFile(new URL('../../../'+file,import.meta.url))),pin,file);
}

const medicalDirectory=new URL('../../dictionary/reviewed-senses/',import.meta.url);
const medicalRead=async file=>JSON.parse(await readFile(new URL(file,medicalDirectory)));
const medicalBytes=await readFile(new URL('source/batch-0018.json',medicalDirectory)),medical=JSON.parse(medicalBytes);
const medicalReviewBytes=await readFile(new URL('reviews/batch-0018.json',medicalDirectory)),medicalReview=JSON.parse(medicalReviewBytes);
assert.equal(hash(medicalBytes),'73cb80ab94162ca86a1a6b6918a5de39b69117f925df5f72e160080cc32efc96');
assert.equal(hash(medicalReviewBytes),'bda3a3cd68e559a681af29a7610445f45bf970f33655ee1cd7eeed8e4745c92f');
assert.deepEqual(medical.entries.map(row=>row.term),['anaphylactic','anaphylactoid','anaphylaxis']);
assert.equal(medicalReview.sourceSha256,hash(medical));assert.equal(medicalReview.sourceByteSha256,hash(medicalBytes));
assert.equal(medicalReview.independentOfAuthor,true);assert.notEqual(medicalReview.reviewer,medical.author);assert.deepEqual(medicalReview.issues,[]);
for(const[file,pin]of Object.entries(medicalReview.exactEvidence))assert.equal(hash(await readFile(new URL(file,medicalDirectory))),pin,file);
const medicalBaselineBytes=await readFile(new URL('source-corrections-0018-baseline.json',medicalDirectory)),medicalBaseline=JSON.parse(medicalBaselineBytes);
assert.equal(hash(medicalBaselineBytes),medicalReview.baseline.byteSha256);
assert.equal(medicalBaseline.historicalReviewedHeads.length,210);
assert.equal(medicalBaseline.historicalReviewedRowsSha256,'2e71b7adae4a1a0f94e24d23832f381df8a18ba19775679e6691030eee56b737');
assert.equal(medicalBaseline.historicalReviewedRowsSha256,lifeBaseline.reviewed210Sha256);
for(const[file,pin]of Object.entries(medicalBaseline.immutableFiles))assert.equal(hash(await readFile(new URL(file,medicalDirectory))),pin,file);
const before=await medicalRead('source-corrections-0018-canonical-before.json');
const manifestBytes=await readFile(new URL('../../../vocab/data/expanded-dictionary/manifest.json',import.meta.url)),manifest=JSON.parse(manifestBytes);
assert.equal(hash(manifestBytes),before.manifestByteSha256);
const records=new Map();
for(const proof of before.records){
  const descriptor=manifest.english.shards.find(row=>row.bucket===proof.shard.bucket);assert.deepEqual(descriptor,proof.shard);
  const shardBytes=await readFile(new URL('../../../vocab/data/expanded-dictionary/'+descriptor.file,import.meta.url));
  assert.equal(shardBytes.length,descriptor.bytes);assert.equal(hash(shardBytes),descriptor.sha256);
  const record=JSON.parse(shardBytes).records.find(row=>row.term===proof.term&&row.id===proof.record.id);
  assert.deepEqual(record,proof.record);assert.equal(hash(record),proof.canonicalSourceSha256);records.set(proof.term,record);
}
const policyFile='source-corrections-0018-accuracy-policy.json',policyBytes=await readFile(new URL(policyFile,medicalDirectory));
const legacy=await medicalRead('source-corrections-0018-legacy-examples.json');
const expectedMedical=validateReviewedSensePack(medical,medicalReview,records);
const projections=validateSourceCorrectionPolicy(JSON.parse(policyBytes),medical,medicalReview,records,manifest,hash(manifestBytes),legacy,
  new Map(legacy.entries.map(row=>[row.term,row.expectedEntry])),{file:policyFile,bytes:policyBytes});
assert.equal(projections.size,3);for(const row of expectedMedical)Object.assign(row,projections.get(row.term));
const orderedMedical=expectedMedical.toSorted((a,b)=>a.term.localeCompare(b.term,'en'));

// Only complete independently approved additions may cross this historical
// boundary. A missing addition, changed field, duplicate or changed old object
// fails; a term or a sourceCorrection flag alone never authorizes projection.
function project(rows,expected,oldCount,newCount,oldHash){
  const byTerm=new Map(expected.map(row=>[row.term,row])),removed=[];
  if(rows.length===oldCount){assert.equal(hash(rows),oldHash);return rows;}
  assert.equal(rows.length,newCount);
  const old=rows.filter(row=>{
    const approved=byTerm.get(row.term);if(!approved)return true;
    assert.deepEqual(row,approved,'Only the exact independently approved complete object may be projected out');removed.push(row);return false;
  });
  assert.deepEqual(removed,expected);assert.equal(old.length,oldCount);assert.equal(hash(old),oldHash);return old;
}

export const historicalSearch33=rows=>project(rows,life.entries,33,42,lifeBaseline.priorSearch33Sha256);
export const historicalOrdinary1061=rows=>project(rows.filter(row=>!row.reviewedCanonicalSense),life.entries,1061,1070,lifeBaseline.ordinary1061Sha256);
export const historicalSelected210=rows=>project(rows.filter(row=>row.reviewedCanonicalSense),orderedMedical,210,213,medicalBaseline.historicalReviewedRowsSha256);

export function exactLifeCommonTermRows(rows){
  historicalOrdinary1061(rows);
  const exact=rows.filter(row=>life.entries.some(expected=>expected.term===row.term));assert.deepEqual(exact,life.entries);return exact;
}
export function exactMedicalCorrectionRows(rows){
  historicalSelected210(rows);
  const exact=rows.filter(row=>orderedMedical.some(expected=>expected.term===row.term));assert.deepEqual(exact,orderedMedical);return exact;
}
export function historicalEveryday1271(rows){
  const ordinary=historicalOrdinary1061(rows),selected=historicalSelected210(rows);
  const additions=[...exactLifeCommonTermRows(rows),...exactMedicalCorrectionRows(rows)];assert.equal(additions.length,12);
  assert.equal(rows.length,1283);
  const old=rows.filter(row=>!additions.includes(row));assert.equal(old.length,1271);
  assert.deepEqual(old,[...ordinary,...selected]);return old;
}

export function historicalLifeCoverageAudit(audit,historicalAudit,rows){
  historicalEveryday1271(rows);
  const additions=[...exactLifeCommonTermRows(rows),...exactMedicalCorrectionRows(rows)];
  const pairs=additions.reduce((sum,row)=>sum+(row.exampleSenses?row.exampleSenses.reduce((count,sense)=>count+sense.examples.length,0):1),0);
  assert.equal(additions.length,12);assert.equal(pairs,12);
  assert.deepEqual(audit,{...historicalAudit,packagedRowsChecked:historicalAudit.packagedRowsChecked+additions.length,
    distinctPublicExampleContextsChecked:historicalAudit.distinctPublicExampleContextsChecked+pairs});
  return historicalAudit;
}
