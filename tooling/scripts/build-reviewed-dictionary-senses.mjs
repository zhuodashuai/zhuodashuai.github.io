import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadExampleBuild, validateExampleReview } from './build-dictionary-examples.mjs';
import { parseCorrectionSourceManifest } from './build-dictionary-example-corrections.mjs';
import { EVERYDAY_LOOKUP_ENTRIES } from '../../vocab/js/everyday-lookup-data.js';
import { DICTIONARY_EXAMPLE_CORRECTIONS } from '../../vocab/js/dictionary-example-corrections-data.js';
import { personalDictionaryResult } from '../../vocab/js/personal-dictionary.js';
import {createReviewedExistingPairAdmission,canReuseReviewedExistingPair,projectReviewedExistingPairRows} from './build-reviewed-existing-pairs.mjs';
import {createAdditiveExamplesLoader} from '../../vocab/js/dictionary-examples-additive.js';
import {dictionaryExamplesRelease} from '../../vocab/js/dictionary-examples-release-v4.js';
import {applyExampleCorrections} from '../../vocab/js/dictionary-example-corrections.js';

const ROOT = resolve(import.meta.dirname, '../..');
const HASH = /^[a-f0-9]{64}$/u;
const NAME = /^batch-\d{4}\.json$/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const hash = value => createHash('sha256').update(value).digest('hex');
export const reviewedSensePackHash = pack => hash(JSON.stringify(pack));
const sentenceKey = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
const json = async file => JSON.parse(await readFile(file, 'utf8'));
// These are the exact heads shipped before retained-alternative policy existed.
// Never derive this boundary from the growing current compiled module.
const PRE_RETENTION_HEADS = new Set(['CD-ROM','ISS','NOE','baggie','bin liner','casualness','communitarian','geordie','hominy','hoodie','hugger','hyena','impulsively','judgmental','legalistic','meritocracy','multitalented','oap','permissiveness','rabbinical','remediate','restructuring','shakeout','sixths','snowboarder','springer','tenuously',"that's",'tum','unrated','untypical']);
export const PRE_RETENTION_HEADS_SHA256 = '9391e01faab39b741e33eb760f05667f0bd354425f0f14281fb06a4e4f78c8c3';
// The older broad Chinese compatibility switch is pinned to its one already
// shipped compatible head. New heads require exact independently read policy.
const LEGACY_CHINESE_RETENTION_HEADS = new Set(['bin liner']);

function text(value, max, han = false) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max
    && !CONTROL.test(value) && (!han || /\p{Script=Han}/u.test(value));
}

function exactObject(value, keys, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const own = Reflect.ownKeys(value);
  return keys.every(key => Object.hasOwn(value, key))
    && own.every(key => typeof key === 'string' && [...keys, ...optional].includes(key)
    && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

function exactArray(value, nonempty = true) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || nonempty && !value.length) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === value.length + 1 && keys.every(key => key === 'length'
    || typeof key === 'string' && /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < value.length
      && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}

/** Snapshot compiler evidence through data descriptors only. A caller's
 * toJSON/accessor facade cannot authenticate one policy then consume another. */
function reviewedDataSnapshot(value) {
  let nodes=0;
  const copy=(input,depth)=>{
    if(++nodes>20000||depth>25)throw Error('Invalid reviewed data snapshot');
    if(input===null||typeof input==='boolean'||typeof input==='number'&&Number.isFinite(input))return input;
    if(typeof input==='string'&&input.length<=20000)return input;
    if(!input||typeof input!=='object')throw Error('Invalid reviewed data snapshot');
    if(Array.isArray(input)){
      if(!exactArray(input,false)||input.length>10000)throw Error('Invalid reviewed data array');
      return Array.from({length:input.length},(_,index)=>copy(Object.getOwnPropertyDescriptor(input,String(index)).value,depth+1));
    }
    if(![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Invalid reviewed data prototype');
    const output={};for(const key of Reflect.ownKeys(input)){
      const d=Object.getOwnPropertyDescriptor(input,key);
      if(typeof key!=='string'||['toJSON','__proto__'].includes(key)||!d?.enumerable||!Object.hasOwn(d,'value'))throw Error('Invalid reviewed data property');
      output[key]=copy(d.value,depth+1);
    }return output;
  };return copy(value,0);
}

export function legacyChineseRetentionHeads(index) {
  const values = Object.hasOwn(index, 'retainLegacyChineseHeads') ? index.retainLegacyChineseHeads : [];
  if (!exactArray(values, false) || new Set(values).size !== values.length
    || values.some(term => !LEGACY_CHINESE_RETENTION_HEADS.has(term))) {
    throw Error('New Chinese sense retention requires an exact retained-alternative policy');
  }
  return new Set(values);
}

/** Policy names exact old raw fields; display formatting is the same pure
 * licensed-source formatter used by expanded-dictionary's readable() path. */
export function retainedCanonicalDisplay(canonical, selected, descriptor) {
  let formatted = selected;
  if (['mit','core','pos-reviewed','grammar-reviewed','pos-notation-reviewed'].includes(selected.source)
    && !/^\s*(?:[①-⑳]|\d+[.、])/u.test(selected.meaning)) {
    const result = personalDictionaryResult({ word: canonical.term,
      partOfSpeech: selected.partOfSpeech, meaning: selected.meaning });
    if (result) formatted = { ...selected, partOfSpeech: result.partOfSpeech || selected.partOfSpeech,
      meaning: result.meaning.length <= 2000 ? result.meaning : selected.meaning };
  }
  return { partOfSpeech: formatted.partOfSpeech, meaning: formatted.meaning,
    source: descriptor.name, license: descriptor.license, url: descriptor.url };
}

/** This validates a separate reader's finite policy, not the linguistic
 * truth of the old gloss. Only already-approved new source rows are eligible. */
export function validateRetainedCanonicalAlternatives(policy, selections, canonicalRecords, descriptors) {
  if (!exactObject(policy, ['schemaVersion','entries']) || policy.schemaVersion !== 1
    || !exactArray(policy.entries, false) || !(selections instanceof Map)
    || !(canonicalRecords instanceof Map) || !descriptors || typeof descriptors !== 'object') {
    throw Error('Invalid exact retained-alternative policy');
  }
  const retained = new Map();
  const keys = ['term','canonicalSourceSha256','selectedRowSha256','author','reviewer','independentOfAuthor','alternatives','reason','references'];
  for (const entry of policy.entries) {
    if (!exactObject(entry, keys, ['usageNote']) || !text(entry.term, 200) || retained.has(entry.term)
      || PRE_RETENTION_HEADS.has(entry.term) || !HASH.test(entry.canonicalSourceSha256 || '')
      || !HASH.test(entry.selectedRowSha256 || '') || !/^AI\/[a-z0-9_-]{1,100}$/u.test(entry.author || '')
      || !/^AI\/[a-z0-9_-]{1,100}$/u.test(entry.reviewer || '') || entry.reviewer === entry.author
      || entry.independentOfAuthor !== true || !text(entry.reason, 2000)
      || !exactArray(entry.alternatives) || entry.alternatives.length > 20
      || !exactArray(entry.references) || new Set(entry.references).size !== entry.references.length
      || entry.references.some(url => !text(url, 2000) || (() => { try { return new URL(url).protocol !== 'https:'; } catch { return true; } })())
      || Object.hasOwn(entry, 'usageNote') && !text(entry.usageNote, 400, true)) {
      throw Error('Missing independent exact retained-alternative approval');
    }
    const selected = selections.get(entry.term), canonical = canonicalRecords.get(entry.term);
    if (!selected || selected.author !== entry.author || !canonical || canonical.term !== entry.term
      || selected.row?.term !== entry.term || selected.row.canonicalId !== canonical.id
      || hash(JSON.stringify(canonical)) !== entry.canonicalSourceSha256
      || selected.row.canonicalSourceSha256 !== entry.canonicalSourceSha256
      || hash(JSON.stringify(selected.row)) !== entry.selectedRowSha256) {
      throw Error(`Retained alternative lacks exact approved source identity: ${entry.term}`);
    }
    const variants = [canonical, ...(canonical.variants || [])], seen = new Set(), alternatives = [];
    for (const old of entry.alternatives) {
      if (!exactObject(old, ['partOfSpeech','meaning','source']) || !text(old.partOfSpeech, 80)
        || !text(old.meaning, 2000) || !text(old.source, 100)
        || !Object.hasOwn(descriptors, old.source)
        || !variants.some(item => item.partOfSpeech === old.partOfSpeech
          && item.meaning === old.meaning && item.source === old.source)) {
        throw Error(`Retained alternative must be a complete unchanged canonical tuple: ${entry.term}`);
      }
      const key = JSON.stringify([old.partOfSpeech, old.meaning, old.source]);
      if (seen.has(key)) throw Error(`Repeated retained canonical alternative: ${entry.term}`);
      seen.add(key);
      const descriptor = descriptors[old.source];
      if (!text(descriptor?.name, 200) || !text(descriptor?.license, 2000)
        || !text(descriptor?.url, 2000) || (() => { try { return new URL(descriptor.url).protocol !== 'https:'; } catch { return true; } })()) {
        throw Error(`Retained alternative has no pinned source descriptor: ${entry.term}`);
      }
      alternatives.push({ ...retainedCanonicalDisplay(canonical, old, descriptor),
        ...(Object.hasOwn(entry, 'usageNote') ? { usageNote: entry.usageNote } : {}) });
    }
    retained.set(entry.term, alternatives);
  }
  return retained;
}

export async function readRetainedAlternativesPolicy(index, directory) {
  if (!Object.hasOwn(index, 'retainedAlternativesPolicy')) return undefined;
  if (typeof index.retainedAlternativesPolicy !== 'string' || !/^[a-z0-9-]+\.json$/u.test(index.retainedAlternativesPolicy)) {
    throw Error('Invalid retained-alternative policy path');
  }
  return json(join(directory, index.retainedAlternativesPolicy));
}

export function renderReviewedSenseModule(rows) {
  return '// Generated independent selected-sense supplements; original canonical records and IDs remain unchanged.\n'
    + 'const freeze = value => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };\n'
    + 'export const REVIEWED_SENSE_ENTRIES = Object.freeze([\n' + rows.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]'
    + '.map(row => Object.freeze({ ...row, chineseAliases: Object.freeze(row.chineseAliases), englishForms: Object.freeze(row.englishForms), references: Object.freeze(row.references), ...(row.retainedCanonicalAlternatives ? { retainedCanonicalAlternatives: Object.freeze(row.retainedCanonicalAlternatives.map(alternative => Object.freeze({ ...alternative }))) } : {}), ...Object.fromEntries(["exampleSenses","exampleContexts","formProjections","sourceCorrection","legacyExampleBinding"].filter(key => Object.hasOwn(row,key)).map(key => [key,freeze(row[key])])) })));\n';
}

/** Optional, independently reviewed per-sense examples. No POS split, form or
 * saved-card identity is inferred from the English head or a text fragment. */
export function validateReviewedExampleSenses(row, canonical) {
  const has = key => Object.hasOwn(row,key);
  if (!has('exampleSenses') && !has('exampleContexts') && !has('formProjections')) return {};
  const fail = () => { throw Error('Invalid exact reviewed example/context projection: '+row.term); };
  if (!exactArray(row.exampleSenses) || row.exampleSenses.length>20 || !exactArray(row.exampleContexts)) fail();
  const lines=row.meaning.split('\n'), ids=new Map(),englishPairs=new Set(),chinesePairs=new Set();
  if(lines.length!==row.exampleSenses.length)fail();
  for(const [index,sense] of row.exampleSenses.entries()) {
    if(!exactObject(sense,['id','partOfSpeech','meaningZh','examples'])
      || sense.id!==`reviewed-source-correction:${row.term}:${index+1}` || ids.has(sense.id)
      || !text(sense.partOfSpeech,80) || !row.partOfSpeech.split(' · ').includes(sense.partOfSpeech)
      || sense.meaningZh!==lines[index] || !exactArray(sense.examples) || sense.examples.length>10)fail();
    for(const pair of sense.examples){if(!exactObject(pair,['en','zh']) || !text(pair.en,1200)
      || !/[A-Za-z]/u.test(pair.en) || !text(pair.zh,1200,true)
      ||englishPairs.has(sentenceKey(pair.en))||chinesePairs.has(sentenceKey(pair.zh)))fail();
      englishPairs.add(sentenceKey(pair.en));chinesePairs.add(sentenceKey(pair.zh));}
    ids.set(sense.id,sense);
  }
  if(row.en!==row.exampleSenses[0].examples[0].en || row.zh!==row.exampleSenses[0].examples[0].zh)fail();
  const contexts=new Set();
  for(const context of row.exampleContexts) {
    if(!exactObject(context,['partOfSpeech','meaning','senseIds']) || !text(context.partOfSpeech,80)
      || !text(context.meaning,2000,true) || !exactArray(context.senseIds)
      || new Set(context.senseIds).size!==context.senseIds.length || context.senseIds.some(id=>!ids.has(id)))fail();
    const key=JSON.stringify([context.partOfSpeech,context.meaning]);if(contexts.has(key))fail();contexts.add(key);
    const selected=context.senseIds.map(id=>ids.get(id));
    if(context.meaning!==selected.map(s=>s.meaningZh).join('\n')
      || context.partOfSpeech!==[...new Set(selected.map(s=>s.partOfSpeech))].join(' · '))fail();
  }
  if(!row.exampleContexts.some(c=>c.partOfSpeech===row.partOfSpeech&&c.meaning===row.meaning
    && JSON.stringify(c.senseIds)===JSON.stringify([...ids.keys()])))fail();
  if(has('formProjections')) {
    if(!exactArray(row.formProjections)||row.formProjections.length>10)fail();const forms=new Set();
    for(const projection of row.formProjections) {
      if(!exactObject(projection,['form','partOfSpeech','meaning','exampleSenseIds']) || !text(projection.form,200)
        || forms.has(projection.form) || !canonical.forms?.includes(projection.form) || row.englishForms.includes(projection.form)
        || !exactArray(projection.exampleSenseIds) || !row.exampleContexts.some(c=>c.partOfSpeech===projection.partOfSpeech
          &&c.meaning===projection.meaning&&JSON.stringify(c.senseIds)===JSON.stringify(projection.exampleSenseIds)))fail();
      const senses=projection.exampleSenseIds.map(id=>ids.get(id));
      if(!senses.length||senses.some(s=>!s||s.partOfSpeech!==projection.partOfSpeech))fail();forms.add(projection.form);
    }
  }
  return {exampleSenses:structuredClone(row.exampleSenses),exampleContexts:structuredClone(row.exampleContexts),
    ...(has('formProjections')?{formProjections:structuredClone(row.formProjections)}:{})};
}

/** Finite correction authority binds complete immutable raw tuples. It never
 * grants a new head-wide/source-wide exclusion or rewrites attributed text. */
export function validateSourceCorrectionPolicy(policy,pack,review,records,manifest,manifestSha256,legacy,originals,evidence) {
  const fail=()=>{throw Error('Invalid independently reviewed exact source-correction policy');};
  let approvedBytes;
  try{
    if(!exactObject(evidence,['file','bytes'])||!Buffer.isBuffer(evidence.bytes))fail();
    approvedBytes=Buffer.from(evidence.bytes);
    policy=reviewedDataSnapshot(policy);pack=reviewedDataSnapshot(pack);review=reviewedDataSnapshot(review);legacy=reviewedDataSnapshot(legacy);
  }catch{fail();}
  if(!/^[a-z0-9-]+\.json$/u.test(evidence.file||'')
    || review?.exactEvidence?.[evidence.file]!==hash(approvedBytes)
    || JSON.stringify(JSON.parse(approvedBytes.toString('utf8')))!==JSON.stringify(policy)
    || review.schemaVersion!==1 || review.sourceSha256!==reviewedSensePackHash(pack)
    || review.independentOfAuthor!==true || review.reviewer===pack.author
    || !Array.isArray(review.approvedTerms)||review.approvedTerms.length!==pack.entries.length
    || pack.entries.some(row=>!review.approvedTerms.includes(row.term))
    || policy?.schemaVersion!==1 || policy.author!==pack.author || policy.sourceObjectSha256!==reviewedSensePackHash(pack)
    || policy.manifestVersion!==manifest.version || policy.manifestByteSha256!==manifestSha256
    || !exactArray(policy.entries) || policy.entries.length!==pack.entries.length
    || legacy?.schemaVersion!==1 || legacy.author!==pack.author || !exactArray(legacy.entries))fail();
  const output=new Map();
  for(const entry of policy.entries) {
    const row=pack.entries.find(r=>r.term===entry.term),record=records.get(entry.term);
    if(!row || !record || output.has(entry.term) || entry.canonicalId!==record.id
      || entry.canonicalSourceSha256!==hash(JSON.stringify(record)) || row.canonicalSourceSha256!==entry.canonicalSourceSha256
      || entry.selectedRowSha256!==hash(JSON.stringify(row)) || !/^AI\/[a-z0-9_-]{1,100}$/u.test(entry.reviewer||'')
      || entry.reviewer===pack.author || entry.reviewer!==review.reviewer || entry.independentOfAuthor!==true
      || !exactArray(entry.excludedWholeRawAlternatives) || !exactArray(entry.retainedRawAlternatives,false)
      || entry.retainedRawAlternatives.length || !text(entry.reason,2000))fail();
    const seen=new Set(),rejected=[];
    for(const old of entry.excludedWholeRawAlternatives) {
      const tuple=old?.tuple,variants=[record,...(record.variants||[])];
      if(!exactObject(tuple,['partOfSpeech','meaning','source']) || !variants.some(v=>['partOfSpeech','meaning','source'].every(k=>v[k]===tuple[k]))
        || old.tupleSha256!==hash(JSON.stringify(tuple)) || seen.has(old.tupleSha256)
        || JSON.stringify(old.sourceDescriptor)!==JSON.stringify(manifest.sources[tuple.source])
        || old.sourceDescriptorSha256!==hash(JSON.stringify(old.sourceDescriptor)))fail();
      seen.add(old.tupleSha256);rejected.push({...tuple,display:retainedCanonicalDisplay(record,tuple,old.sourceDescriptor)});
    }
    const previous=legacy.entries.find(e=>e.term===entry.term),expected=originals.get(entry.term);
    const contexts=[record,...(record.variants||[])].map(tuple=>({term:entry.term,
      ...Object.fromEntries(Object.entries(retainedCanonicalDisplay(record,tuple,manifest.sources[tuple.source])).filter(([k])=>['partOfSpeech','meaning'].includes(k)))}));
    const unique=[...new Map(contexts.map(c=>[JSON.stringify(c),c])).values()];
    if(!previous || previous.canonicalId!==record.id || previous.canonicalSourceSha256!==entry.canonicalSourceSha256
      || JSON.stringify(previous.sourcePins)!==JSON.stringify(dictionaryExamplesRelease.source)
      || JSON.stringify(previous.contexts)!==JSON.stringify(unique) || !expected
      || previous.expectedEntrySha256!==hash(JSON.stringify(expected)) || JSON.stringify(previous.expectedEntry)!==JSON.stringify(expected))fail();
    output.set(entry.term,{sourceCorrection:{dictionaryVersion:manifest.version,manifestSha256,canonicalId:record.id,
      canonicalSourceSha256:entry.canonicalSourceSha256,rejected},legacyExampleBinding:{sourcePins:previous.sourcePins,
      contexts:previous.contexts,expectedEntryJSON:JSON.stringify(expected)}});
  }
  return output;
}

// This already shipped approval is a historical boundary, not an editable
// default for the next correction cohort. Additional policies have separate
// source packs, evidence files, reviewers and disjoint corrected heads.
const ORIGINAL_SOURCE_CORRECTION = Object.freeze({
  policy:'source-corrections-0017-accuracy-policy.json',
  legacyExamples:'source-corrections-0017-legacy-examples.json',
  source:'batch-0017.json',review:'batch-0017.json',
  policySha256:'31de8ac2249a5e6d1a8d05f9f4f4bf3f95815001302b53538fb40a7c63d1580b',
  legacySha256:'6ff634eec90d7fe9bc0aaa9d3557d97691704ce0c10056ddc2586765ff4a6082',
  sourceSha256:'fc994f62c92a4653714bc9ecbab2d7633f970751e56aec67c5a23b9ac877a2f4',
  reviewSha256:'e7f27b33003950c8637c8f364821d526aef5ea9a5bad848dd54252ad2b3357ba',
});

export function sourceCorrectionRegistrations(index) {
  index=reviewedDataSnapshot(index);
  const original=ORIGINAL_SOURCE_CORRECTION;
  if(index.sourceCorrectionPolicy!==original.policy
    ||index.sourceCorrectionLegacyExamples!==original.legacyExamples)throw Error('Original source correction registration changed');
  const extra=Object.hasOwn(index,'additionalSourceCorrectionPolicies')?index.additionalSourceCorrectionPolicies:[];
  if(!exactArray(extra,false)||extra.length>20)throw Error('Invalid additional source correction registrations');
  const registrations=[{policy:original.policy,legacyExamples:original.legacyExamples}];
  const files=new Set([original.policy,original.legacyExamples]);
  for(const entry of extra){
    if(!exactObject(entry,['policy','legacyExamples'])
      ||![entry.policy,entry.legacyExamples].every(file=>/^[a-z0-9-]+\.json$/u.test(file||''))
      ||entry.policy===entry.legacyExamples||files.has(entry.policy)||files.has(entry.legacyExamples))throw Error('Overlapping source correction evidence files');
    files.add(entry.policy);files.add(entry.legacyExamples);registrations.push({...entry});
  }
  return registrations;
}

export function assertHistoricalSourceCorrectionIdentity(registration,selected,evidence) {
  const original=ORIGINAL_SOURCE_CORRECTION;
  if(registration.policy!==original.policy){
    if(selected.sourceFile===original.source)throw Error('An additional policy cannot reauthorize the original source correction pack');
    return;
  }
  const names=['policyBytes','sourceBytes','reviewBytes','legacyBytes'];
  if(selected.sourceFile!==original.source||selected.reviewFile!==original.review
    ||registration.legacyExamples!==original.legacyExamples||!exactObject(evidence,names)
    ||names.some(name=>!Buffer.isBuffer(evidence[name]))
    ||hash(evidence.policyBytes)!==original.policySha256||hash(evidence.sourceBytes)!==original.sourceSha256
    ||hash(evidence.reviewBytes)!==original.reviewSha256||hash(evidence.legacyBytes)!==original.legacySha256)throw Error('Original source correction approval changed');
}

/** Composition only; every input map must first pass its separate signed
 * actual-byte policy validator. An overlap never replaces an earlier result. */
export function mergeSourceCorrectionSets(sets) {
  if(!Array.isArray(sets)||!sets.length)throw Error('Missing validated source correction sets');
  const combined=new Map();
  for(const set of sets){
    if(!(set instanceof Map)||!set.size)throw Error('Invalid validated source correction set');
    for(const [term,projection]of set){
      if(typeof term!=='string'||combined.has(term))throw Error('Overlapping source correction head');
      combined.set(term,projection);
    }
  }
  return combined;
}

/** These are explicitly authored supplementary senses, not claims that a
 * frozen third-party record already contained a modern meaning or correct POS. */
export function validateReviewedSensePack(pack, review, canonicalRecords, existingSentences = new Map(), retainedChineseHeads = new Set(), existingPairAdmission) {
  if (pack && Object.hasOwn(pack, 'exampleSource') && pack.exampleSource !== '原创学习例句') {
    throw Error('Invalid selected-sense learner example source');
  }
  if (!(retainedChineseHeads instanceof Set)
    || [...retainedChineseHeads].some(term => !LEGACY_CHINESE_RETENTION_HEADS.has(term))) {
    throw Error('New Chinese sense retention requires an exact retained-alternative policy');
  }
  if (!pack || pack.schemaVersion !== 1 || !/^AI\/[a-z0-9_-]{1,100}$/u.test(pack.author)
    || !Array.isArray(pack.entries) || !pack.entries.length
    || !review || review.schemaVersion !== 1 || review.sourceSha256 !== reviewedSensePackHash(pack)
    || review.independentOfAuthor !== true || !/^AI\/[a-z0-9_-]{1,100}$/u.test(review.reviewer)
    || review.reviewer === pack.author || !Array.isArray(review.approvedTerms) || !Array.isArray(review.issues)
    || !(canonicalRecords instanceof Map)) throw Error('Missing independent selected-sense approval');
  const approved = new Set(review.approvedTerms), seen = new Set(), output = [];
  if (approved.size !== review.approvedTerms.length) throw Error('Repeated selected-sense approval');
  for (const row of pack.entries) {
    const canonical = canonicalRecords.get(row.term);
    if (!text(row.term, 200) || seen.has(row.term) || /[<>]|\p{Script=Han}/u.test(row.term)
      || !canonical || row.canonicalId !== canonical.id || !Number.isSafeInteger(row.canonicalId)
      || !HASH.test(row.canonicalSourceSha256 || '') || row.canonicalSourceSha256 !== hash(JSON.stringify(canonical))
      || !text(row.partOfSpeech, 80) || !/^[a-z ()·/.-]+$/u.test(row.partOfSpeech)
      || !text(row.meaning, 2000, true) || !row.meaning.startsWith('①')
      || !text(row.en, 1200) || !/[A-Za-z]/u.test(row.en) || !text(row.zh, 1200, true)
      || !Array.isArray(row.chineseAliases) || row.chineseAliases.length > 20
      || new Set(row.chineseAliases).size !== row.chineseAliases.length
      || row.chineseAliases.some(alias => !text(alias, 50, true))
      || !Array.isArray(row.englishForms) || row.englishForms.length > 30
      || new Set(row.englishForms).size !== row.englishForms.length
      || row.englishForms.some(form => !text(form, 200) || /[<>]|\p{Script=Han}/u.test(form))
      || !Array.isArray(row.references) || !row.references.length || row.references.some(url => {
        try { return new URL(url).protocol !== 'https:'; } catch { return true; }
      })) throw Error(`Invalid selected-sense row: ${row.term}`);
    seen.add(row.term);
    if (!approved.has(row.term)) continue;
    if (review.issues.some(issue => issue.term === row.term && issue.blocking === true && !issue.resolution?.trim())) {
      throw Error(`Unresolved selected-sense issue: ${row.term}`);
    }
    const extended=validateReviewedExampleSenses(row,canonical);
    const owner = existingSentences.get(sentenceKey(row.en));
    if (owner && !canReuseReviewedExistingPair(existingPairAdmission,pack,review,row,owner)) throw Error(`Duplicate selected-sense English example: ${row.term} / ${owner}`);
    existingSentences.set(sentenceKey(row.en), row.term);
    for(const sense of extended.exampleSenses||[])for(const pair of sense.examples) {
      if(pair.en===row.en&&pair.zh===row.zh)continue;
      if(existingSentences.has(sentenceKey(pair.en)))throw Error('Duplicate selected-sense English example: '+row.term);
      existingSentences.set(sentenceKey(pair.en),row.term);
    }
    output.push({ term: row.term, partOfSpeech: row.partOfSpeech, meaning: row.meaning,
      chineseAliases: [...row.chineseAliases], englishForms: [...row.englishForms], en: row.en, zh: row.zh,
      references: [...row.references], dictionarySource: '卓式词典·义项补充',
      exampleSource: pack.exampleSource ?? '原创例句·AI复核（精选义项）', exampleReviewer: review.reviewer,
      reviewedCanonicalSense: true, retainLegacyChinese: retainedChineseHeads.has(row.term), canonicalId: row.canonicalId, canonicalSourceSha256: row.canonicalSourceSha256,...extended });
  }
  if ([...approved].some(term => !seen.has(term))) throw Error('Approval names an absent selected-sense row');
  return output;
}

export async function loadReviewedSenseBuild() {
  const base = join(ROOT, 'tooling/dictionary');
  const index = await json(join(base, 'reviewed-senses/index.json'));
  if (index.schemaVersion !== 1 || !Array.isArray(index.batches) || !index.batches.length) throw Error('Invalid reviewed-sense index');
  const retainedChineseHeads = legacyChineseRetentionHeads(index);
  const manifestBytes=await readFile(join(ROOT, 'vocab/data/expanded-dictionary/manifest.json'));
  const manifest = parseCorrectionSourceManifest(manifestBytes);
  const records = new Map();
  for (const descriptor of manifest.english.shards) {
    const bytes = await readFile(join(ROOT, 'vocab/data/expanded-dictionary', descriptor.file));
    if (bytes.length !== descriptor.bytes || hash(bytes) !== descriptor.sha256) throw Error('Canonical source changed');
    for (const row of JSON.parse(bytes).records) {
      if (records.has(row.term) && JSON.stringify(records.get(row.term)) !== JSON.stringify(row)) throw Error('Conflicting canonical identity');
      records.set(row.term, row);
    }
  }
  const additive = await json(join(base, 'examples/additive-index-v4.json'));
  const additionalAuthored = [];
  for (const release of additive.releases) for (const file of release.sourceFiles) {
    const pack = await json(join(base, 'examples/source', file)), review = await json(join(base, 'examples/reviews', file));
    additionalAuthored.push(...validateExampleReview(pack, review));
  }
  const full = await loadExampleBuild({ additionalAuthored });
  const sentences = new Map(),chineseSentences=new Map();
  for (const entry of full.entries) for (const sense of entry.senses) for (const pair of sense.examples) {
    sentences.set(sentenceKey(pair.en), entry.term);chineseSentences.set(sentenceKey(pair.zh),entry.term);
  }
  for (const row of [...EVERYDAY_LOOKUP_ENTRIES.filter(item => item.reviewedCanonicalSense !== true), ...DICTIONARY_EXAMPLE_CORRECTIONS]) {
    sentences.set(sentenceKey(row.en), row.term);chineseSentences.set(sentenceKey(row.zh),row.term);
  }
  const rows = [], seen = new Set(), approvedSelections = new Map(),packs=new Map();
  for (const batch of index.batches) {
    if (!NAME.test(batch.source) || !NAME.test(batch.review)) throw Error('Invalid selected-sense source path');
    const pack = await json(join(base, 'reviewed-senses/source', batch.source));
    const review = await json(join(base, 'reviewed-senses/reviews', batch.review));
    packs.set(batch.source,{pack,review,sourceFile:batch.source,reviewFile:batch.review});
    const existingPairAdmission=Object.hasOwn(batch,'existingPairBindings')
      ?await createReviewedExistingPairAdmission(pack,review,{sourceFile:batch.source,reviewFile:batch.review,bindingFile:batch.existingPairBindings})
      :undefined;
    for(const row of pack.entries)if(row.exampleSenses)for(const sense of row.exampleSenses)for(const pair of sense.examples) {
      if(chineseSentences.has(sentenceKey(pair.zh)))throw Error('Duplicate selected-sense Chinese example: '+row.term);
    }
    const validated=validateReviewedSensePack(pack, review, records, sentences, retainedChineseHeads,existingPairAdmission);
    const compiled=existingPairAdmission?projectReviewedExistingPairRows(existingPairAdmission,pack,review,validated):validated;
    for (const row of compiled) {
      if (seen.has(row.term)) throw Error('Repeated reviewed canonical head');
      approvedSelections.set(row.term, { author: pack.author, row: pack.entries.find(item => item.term === row.term) });
      seen.add(row.term); rows.push(row);
      for(const sense of row.exampleSenses||[{examples:[{en:row.en,zh:row.zh}]}])for(const pair of sense.examples)chineseSentences.set(sentenceKey(pair.zh),row.term);
    }
  }
  if ([...retainedChineseHeads].some(term => !seen.has(term))) throw Error('Legacy Chinese retention requires an approved literal head');
  const policy = await readRetainedAlternativesPolicy(index, join(base, 'reviewed-senses'));
  if (policy !== undefined) {
    // A declared policy is mandatory. Missing, malformed or stale data must not
    // silently delete previously retained meanings on a later build.
    const retained = validateRetainedCanonicalAlternatives(policy, approvedSelections, records, manifest.sources);
    for (const row of rows) if (retained.has(row.term)) {
      row.retainedCanonicalAlternatives = retained.get(row.term); row.retainLegacyChinese = true;
    }
  }
  const correctionSets=[],correctionSourceFiles=new Set();
  for(const registration of sourceCorrectionRegistrations(index)) {
    const policyBytes=await readFile(join(base,'reviewed-senses',registration.policy)),policy=JSON.parse(policyBytes);
    const selected=packs.get(policy.sourceFile);if(!selected)throw Error('Source correction policy has no approved source pack');
    if(correctionSourceFiles.has(policy.sourceFile))throw Error('Overlapping source correction source pack');
    correctionSourceFiles.add(policy.sourceFile);
    const originalEvidence=registration.policy===ORIGINAL_SOURCE_CORRECTION.policy?{
      policyBytes,sourceBytes:await readFile(join(base,'reviewed-senses/source',selected.sourceFile)),
      reviewBytes:await readFile(join(base,'reviewed-senses/reviews',selected.reviewFile)),
      legacyBytes:await readFile(join(base,'reviewed-senses',registration.legacyExamples)),
    }:undefined;
    assertHistoricalSourceCorrectionIdentity(registration,selected,originalEvidence);
    for(const [file,pin]of Object.entries(selected.review.exactEvidence||{})) {
      if(!/^[a-z0-9-]+\.json$/u.test(file)||!HASH.test(pin)
        ||hash(await readFile(join(base,'reviewed-senses',file)))!==pin)throw Error('Source correction evidence changed after independent review');
    }
    const legacy=await json(join(base,'reviewed-senses',registration.legacyExamples)),originals=new Map();
    const loader=createAdditiveExamplesLoader(dictionaryExamplesRelease,{fetchImpl:async input=>{
      const url=new URL(input),file=fileURLToPath(url),assets=join(ROOT,'vocab')+(process.platform==='win32'?'\\':'/');
      if(url.protocol!=='file:'||!file.startsWith(assets))throw Error('Source correction evidence must remain local');
      return new Response(await readFile(file));
    }});
    try{for(const row of selected.pack.entries)originals.set(row.term,await applyExampleCorrections(row.term,await loader.load(row.term,{lookupQuery:row.term})));}
    finally{loader.close();}
    const corrections=validateSourceCorrectionPolicy(policy,selected.pack,selected.review,records,manifest,hash(manifestBytes),legacy,originals,
      {file:registration.policy,bytes:policyBytes});
    correctionSets.push(corrections);
  }
  const corrections=mergeSourceCorrectionSets(correctionSets);
  for(const row of rows)if(corrections.has(row.term))Object.assign(row,corrections.get(row.term));
  rows.sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : 0);
  // One JSON object per line keeps this mutable module readable without
  // duplicating indentation throughout every Pages/offline release.
  const source = renderReviewedSenseModule(rows);
  return { rows, source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await loadReviewedSenseBuild(), file = join(ROOT, 'vocab/js/reviewed-senses-data.js');
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== result.source) throw Error('Stale independently reviewed selected senses');
  } else await writeFile(file, result.source);
  console.log(JSON.stringify({ reviewedHeads: result.rows.length, canonicalSourceModified: false }));
}
