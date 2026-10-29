import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileCanonicalExampleComponents,renderCanonicalExampleComponents} from '../scripts/build-canonical-example-components.mjs';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {CANONICAL_EXAMPLE_COMPONENTS as table} from '../../vocab/js/canonical-example-components-data.js';
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'tooling/dictionary/example-components'),inputs={};
for(const [key,file]of [['source','source.json'],['languageReview','language-review.json'],['bindings','bindings.json'],['admission','admission.json']])inputs[key]=JSON.parse(await fs.readFile(path.join(dir,file)));
const deps={pins:dictionaryExamplesRelease.source,readPublicAsset:rel=>fs.readFile(path.join(root,'vocab/data',rel)),loadOriginalEntry:async term=>structuredClone(inputs.bindings.rows.find(r=>r.term===term).originalDTO)};
const h=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('exact eight-role builder preserves all original fields and selected labels',async()=>{
  const before=JSON.stringify(inputs),actual=await compileCanonicalExampleComponents(inputs,deps);assert.deepEqual(actual,table);assert.equal(JSON.stringify(inputs),before);
  for(const row of actual.rows){assert.equal(row.wholeRawSourceApproved,false);assert.equal(row.componentPair.meaningZh,inputs.source.entries.find(p=>p.term===row.term).meaningZh);assert.equal(row.expectedOriginalEntrySha256,h(row.expectedOriginalEntry));}
  assert.equal(await fs.readFile(path.join(root,'vocab/js/canonical-example-components-data.js'),'utf8'),renderCanonicalExampleComponents(actual));
});
for(const [name,change]of [
  ['new unapproved sentence',i=>i.source.entries[0].en='A different unreviewed sentence.'],
  ['wrong source identity',i=>i.bindings.rows[0].canonicalId++],
  ['changed complete source',i=>i.bindings.rows[0].exactCanonicalRecord.seed.rank++],
  ['extra whole-source approval',i=>i.admission.rows[0].wholeRawSourceApproved=true],
  ['broader accepted card',i=>i.admission.rows[0].canonicalContexts.push({term:'respectable',partOfSpeech:'adjective',meaning:'随意编辑的含义'})],
  ['new selected label',i=>i.admission.rows[0].componentContexts[0].meaning='另一含义'],
  ['dropped old sense',i=>i.bindings.rows.find(r=>r.term==='burden').originalDTO.senses.pop()],
  ['absent language approval',i=>i.languageReview.approvedTerms.pop()],
  ['ninth scope head',i=>i.source.entries.push({...i.source.entries[0],term:'well-adjusted'})]
])test(`builder rejects ${name}`,async()=>{const candidate=structuredClone(inputs);change(candidate);await assert.rejects(compileCanonicalExampleComponents(candidate,deps));});
test('duplicate English and Chinese inventories each block a component',async()=>{
  const p=inputs.source.entries[0];
  for(const reservedPairs of [[{en:p.en.toUpperCase(),zh:'另一个译文'}],[{en:'A separate example.',zh:p.zh}]])await assert.rejects(compileCanonicalExampleComponents(inputs,{...deps,reservedPairs}),/Duplicate/);
});
