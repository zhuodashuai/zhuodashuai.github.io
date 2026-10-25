import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {loadOriginalCatalogue} from '../lib/original-dictionary-catalogue.mjs';
import {verifyDictionaryPos} from '../lib/dictionary-pos.mjs';
import {verifyDictionarySupplement} from '../lib/dictionary-supplement.mjs';
import {verifyDictionarySourceRevisions} from '../lib/dictionary-source-revisions.mjs';
import {verifyDictionaryPosNotationRevisions} from '../lib/dictionary-pos-notation-revisions.mjs';
import {readHistoricalDictionaryNamespace,SOURCE_LINEAGE_NOTATION_BASE_VERSION,
  assertExactPosNotationNamespace} from '../lib/dictionary-source-lineage.mjs';
import {recoverPinnedExpandedSeedArchive,expandedSeedIntegrity,buildExpandedDictionary,
  validateExpandedBuild} from '../scripts/build-expanded-dictionary.mjs';
import {buildDictionarySuggestions} from '../scripts/build-dictionary-suggestions.mjs';
import {searchExpandedDictionary} from '../../vocab/js/expanded-dictionary.js';
import {loadExpandedPublicSource} from '../lib/expanded-public-source.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const revision=async name=>{
  const base='tooling/dictionary/source-revisions/'+name;
  return Promise.all(['.json','.integrity.json','.review.json'].map(suffix=>json(base+suffix)));
};
const [pack,integrity,review]=await revision('finite-pos-notation-0001');
const verified=verifyDictionaryPosNotationRevisions(pack,integrity,review);
const historical=await readHistoricalDictionaryNamespace(SOURCE_LINEAGE_NOTATION_BASE_VERSION);
const seedIntegrity=await json('tooling/dictionary/expanded-source-integrity.json');
const prepared=await recoverPinnedExpandedSeedArchive({root,integrity:seedIntegrity});
const catalogue=await loadOriginalCatalogue();
const inputs={prepared,corePayload:await json('vocab/data/ecdict-core.json'),
  publicPayload:await loadExpandedPublicSource({root}),originalPack:catalogue.pack,
  supplementPack:verifyDictionarySupplement(await json('tooling/dictionary/supplements/import-2026-10-19.json'),
    await json('tooling/dictionary/supplements/integrity.json')),
  posPack:verifyDictionaryPos(await json('tooling/dictionary/pos/pos-completion-2026-10-19.json'),
    await json('tooling/dictionary/pos/integrity.json')),
  sourceRevisionPack:verifyDictionarySourceRevisions(...await revision('finite-grammar-0001'))};
const build=buildExpandedDictionary({...inputs,posNotationRevisionPack:verified});
const proposed={manifest:build.manifest,records:new Map(build.records.map(row=>[row.term,row])),
  keys:new Map(build.manifest.english.shards.flatMap(d=>JSON.parse(build.files.get(d.file)).keys)),
  tokens:new Map(build.manifest.chinese.shards.flatMap(d=>JSON.parse(build.files.get(d.file)).postings))};
const englishShards=new Map(build.manifest.english.shards.map(d=>[d.file,build.files.get(d.file)]));

test('actual complete production inputs reconstruct exact three-marker transition without any generated writes',()=>{
  assert.equal(build.manifest.version,'5c82c9c5641e3ba478f1dc68378901e9612dc23372c6efafb6f985558ce8c432');
  const proof=assertExactPosNotationNamespace(historical,proposed,verified);
  assert.deepEqual(proof.changedTerms,['headdress','longingly','moonless']);assert.equal(proof.unchangedRecords,102606);
  assert.equal(proof.englishReferencesUnchanged,true);assert.equal(proof.chinesePostingsUnchanged,true);
  assert.equal(validateExpandedBuild(build).canonicalRecords,102609);
  assert.deepEqual(expandedSeedIntegrity(prepared),seedIntegrity);
  assert.equal(build.report.mitRows,102325);
  assert.equal(build.report.sourceRevisions.applied,4);assert.equal(build.report.posNotationRevisions.applied,3);
  assert.equal(build.report.posReview.applied,build.report.posReview.finalPosReviewed+4);
  assert.equal(build.report.posReview.subsequentlyRevised,4);
  assert.deepEqual(build.manifest.sources['pos-notation-reviewed'],verified.source);
  for(const entry of pack.entries){
    assert.deepEqual(historical.records.get(entry.term),entry.before);
    assert.deepEqual(proposed.records.get(entry.term),entry.after);
    assert(!Object.hasOwn(proposed.records.get(entry.term),'variants'),'wrong historical labels must not become active senses');
  }
});

test('new optional builder input requires the genuine branded exact-source approval, never raw pack or copied metadata',()=>{
  for(const forged of [pack,{},structuredClone(verified),{...verified}])
    assert.throws(()=>buildExpandedDictionary({...inputs,posNotationRevisionPack:forged}),/unverified pack/u);
});

test('suggestions preserve all canonical heads and the legitimate plural while rejecting forged new-source attribution',()=>{
  const suggestions=buildDictionarySuggestions({manifest:build.manifest,shards:englishShards});
  for(const entry of pack.entries)assert(suggestions.rows.some(([term])=>term===entry.term));
  assert(proposed.keys.get('headdresses').some(ref=>ref.id===2636670&&ref.kind==='form'));
  for(const stale of ['ares','dids','hads','beens'])assert.equal(proposed.keys.get(stale),undefined);
  for(const mutate of [
    source=>{source.name='ECDICT';},source=>{source.license='MIT';},source=>{source.url='https://example.com';},
    source=>{source.sha256='0'.repeat(64);},source=>{source.extra=true;},source=>{delete source.sha256;}
  ]){
    const manifest=structuredClone(build.manifest);mutate(manifest.sources['pos-notation-reviewed']);
    assert.throws(()=>buildDictionarySuggestions({manifest,shards:englishShards}),/notation revision provenance/u);
  }
});

test('actual browser lookup formatter exposes corrected POS, numbered gloss and separate honest source without stale alternatives',async()=>{
  const fetchImpl=async url=>{
    const suffix=new URL(url).pathname.split('/expanded-dictionary/')[1];
    if(suffix==='manifest.json')return new Response(JSON.stringify(build.manifest));
    return build.files.has(suffix)?new Response(build.files.get(suffix)):new Response('',{status:404});
  };
  for(const entry of pack.entries){
    const result=await searchExpandedDictionary(entry.term,{fetchImpl});
    assert.equal(result.results.length,1);const value=result.results[0];
    assert.equal(value.term,entry.term);assert.equal(value.partOfSpeech,entry.after.partOfSpeech);
    assert.match(value.meaning,/^[①1]/u);assert.equal(value.source,verified.source.name);
    assert.equal(value.license,verified.source.license);assert.equal(value.url,verified.source.url);
    assert.equal(value.alternatives,undefined);
  }
  const plural=await searchExpandedDictionary('headdresses',{fetchImpl});
  assert.equal(plural.results[0].term,'headdress');assert.equal(plural.results[0].partOfSpeech,'noun');
});

test('source notice stays static and descriptive, with the shared primary navigation and manual only in footer',async()=>{
  const html=await readFile(path.join(root,'vocab/dictionary-pos-notation-revisions.html'),'utf8');
  assert.match(html,/script-src 'none'/u);assert.doesNotMatch(html,/<script\b/iu);
  for(const term of ['headdress','longingly','moonless'])assert(html.includes(term));
  assert.match(html,/MIT/u);assert.match(html,/Princeton WordNet 3\.1/u);
  const header=html.match(/<header\b[\s\S]*?<\/header>/u)?.[0];assert(header);
  for(const label of ['公开词本','查词','随手记','我的词本'])assert(header.includes(label));
  assert(!header.includes('使用手册'));assert.match(html,/<footer\b[\s\S]*?使用手册/u);
});
