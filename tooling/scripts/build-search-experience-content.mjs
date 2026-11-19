import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT=resolve(import.meta.dirname,'../..');
export const SEARCH_CONTENT_DIRECTORY=join(ROOT,'tooling/dictionary/everyday-expansions/2026-11-19-search-experience');
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const key=text=>text.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
const control=/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

export async function loadSearchExperienceContent(){
  const bytes=await readFile(join(SEARCH_CONTENT_DIRECTORY,'source.json'));
  const source=JSON.parse(bytes),review=await read(join(SEARCH_CONTENT_DIRECTORY,'review.json'));
  assert.equal(source.schemaVersion,1);assert.equal(review.schemaVersion,1);
  assert.equal(review.sourceSha256,hash(source));assert.equal(review.sourceByteSha256,hash(bytes));
  assert.equal(review.independentOfAuthor,true);assert.notEqual(review.reviewer,source.author);
  assert.deepEqual(review.issues,[]);assert.equal(source.entries.length,16);
  assert.deepEqual(review.approvedTerms,source.entries.map(row=>row.term));
  const terms=new Set(),sentences=new Set();
  for(const row of source.entries){
    const decision=review.reviewedRows.find(item=>item.term===row.term);
    assert.equal(decision?.rowSha256,hash(row),'Missing exact independent approval: '+row.term);
    assert.equal(row.exampleReviewer,review.reviewer);assert.equal(row.exampleSource,'原创学习例句');
    assert(/^[a-z]+(?:[ -][a-z]+)*$/u.test(row.term));assert(!terms.has(key(row.term)));terms.add(key(row.term));
    assert(/^[a-z -]+$/u.test(row.partOfSpeech));assert(row.meaning.startsWith('①'));assert(row.meaning.length<=2000);
    assert(/\p{Script=Han}/u.test(row.meaning)&&/\p{Script=Han}/u.test(row.zh));assert(/[A-Za-z]/u.test(row.en));
    assert(!control.test(row.en)&&!control.test(row.zh));assert(!sentences.has(key(row.en)));sentences.add(key(row.en));
    for(const field of ['englishForms','chineseAliases','references'])assert.equal(new Set(row[field]).size,row[field].length);
    assert(row.references.length&&row.references.every(value=>new URL(value).protocol==='https:'));
    assert(row.chineseAliases.length&&row.chineseAliases.every(value=>/\p{Script=Han}/u.test(value)&&!control.test(value)));
    assert(row.englishForms.every(value=>!control.test(value)&&!/[<>\p{Script=Han}]/u.test(value)));
  }
  const manifest=await read(join(ROOT,'vocab/data/expanded-dictionary/manifest.json'));
  for(const descriptor of manifest.english.shards){
    const bytes=await readFile(join(ROOT,'vocab/data/expanded-dictionary',descriptor.file));
    assert.equal(bytes.length,descriptor.bytes);assert.equal(hash(bytes),descriptor.sha256);
    for(const row of JSON.parse(bytes).records)assert(!terms.has(key(row.term)),'Duplicate canonical head: '+row.term);
  }
  const module='// Original scoped search additions; exact independent decisions live in tooling/dictionary/everyday-expansions/2026-11-19-search-experience.\n'
    +'export const SEARCH_EXPERIENCE_ENTRIES = Object.freeze([\n'+source.entries.map(row=>'  '+JSON.stringify(row)+',').join('\n')+'\n].map(Object.freeze));\n';
  return {entries:source.entries,module};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=await loadSearchExperienceContent(),target=join(ROOT,'vocab/js/search-experience-data.js');
  if(process.argv.includes('--check'))assert.equal(await readFile(target,'utf8'),result.module,'Stale search additions');
  else await writeFile(target,result.module);
  console.log(JSON.stringify({newWholeHeads:result.entries.length,canonicalSourceModified:false}));
}
