import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {D31_LF_RULES,D31_BUILD,assertD31MetadataTransition} from './d31-regression-fixture.mjs';
import {D31_PRIOR_ATTRIBUTES_TRANSPORTS,D32_ATTRIBUTES_SUFFIX_LINES,restoreD31HistoricalAttributes} from './d31-metadata-attributes-bridge.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const before=await fs.readFile(new URL('../dictionary/examples/archives/d30-release-metadata.attributes.txt',import.meta.url));
assert.equal(before.length,2265);
assert.equal(createHash('sha256').update(before).digest('hex'),'7d9b11fe80096e448e9f98d2f157b0875f3bb63b15f0d1396dc8f799324c9f35');
const windowsBefore=Buffer.from(before.toString('utf8').replace(/\n/gu,'\r\n'));
const suffix=eol=>Buffer.from(D32_ATTRIBUTES_SUFFIX_LINES.join(eol)+eol);
const d31=eol=>Buffer.from(D31_LF_RULES.join(eol)+eol);
const layouts=[Buffer.concat([before,d31('\n')]),Buffer.concat([windowsBefore,d31('\n')]),Buffer.concat([windowsBefore,d31('\r\n')])];
const common=await fs.readFile(new URL('../dictionary/chinese-related-common-examples.json',import.meta.url));

test('D31 bridge independently pins all three exact original transports',()=>{
 for(let i=0;i<layouts.length;i++){
  const raw=layouts[i],pin=D31_PRIOR_ATTRIBUTES_TRANSPORTS[i];
  assert.equal(raw.length,pin.bytes);assert.equal(createHash('sha256').update(raw).digest('hex'),pin.sha256);
  assert.deepEqual(restoreD31HistoricalAttributes(raw),raw);
  assert.equal(assertD31MetadataTransition(raw,common,D31_BUILD).appendedRuleCount,3);
 }
});

for(let i=0;i<layouts.length;i++)test('D31 bridge accepts only registered D32 extension layout '+i,()=>{
 const prior=layouts[i],extended=Buffer.concat([prior,suffix(D31_PRIOR_ATTRIBUTES_TRANSPORTS[i].suffixEol)]);
 assert.deepEqual(restoreD31HistoricalAttributes(extended),prior);
 assert.equal(assertD31MetadataTransition(restoreD31HistoricalAttributes(extended),common,D31_BUILD).appendedRuleCount,3);
 assert.throws(()=>assertD31MetadataTransition(extended,common,D31_BUILD),'Original strict predicate must still reject the extension itself');
});

test('D31 bridge rejects every unregistered prefix/suffix EOL cross combination',()=>{
 for(const[i,eol]of[[0,'\r\n'],[1,'\r\n'],[2,'\n']])assert.throws(()=>restoreD31HistoricalAttributes(Buffer.concat([layouts[i],suffix(eol)])));
});

test('D31 bridge rejects unknown, missing, duplicated and reordered extension lines',()=>{
 const lines=D32_ATTRIBUTES_SUFFIX_LINES;
 const bad=[
  [...lines,'# unrelated'],lines.slice(0,-1),[...lines,lines[7]],
  [lines[0],lines[1],lines[3],lines[2],...lines.slice(4)],
  [...lines.slice(0,4),lines[5],lines[4],...lines.slice(6)],
  lines.map((x,i)=>i===7?'tooling/dictionary/examples/*.json text eol=lf':x),
  lines.map((x,i)=>i===2?x.replace('-text','binary'):x)
 ];
 for(const v of bad)assert.throws(()=>restoreD31HistoricalAttributes(Buffer.concat([layouts[0],Buffer.from(v.join('\n')+'\n')])));
 assert.throws(()=>restoreD31HistoricalAttributes(Buffer.concat([layouts[0],suffix('\n'),Buffer.from('\n')])));
 assert.throws(()=>restoreD31HistoricalAttributes(Buffer.concat([layouts[0],Buffer.from(suffix('\n').toString().replace('*.bin -text\n','*.bin -text\r\n'))])));
});

test('D31 bridge rejects old prefix mutation, truncation and binary rules before D31',()=>{
 const p=layouts[0],good=suffix('\n'),bad=[
  Buffer.from(p.toString().replace('batch-0028-*.json','batch-0027-*.json')),
  p.subarray(0,p.length-1),Buffer.concat([p,Buffer.from('# extra old prefix\n')]),
  Buffer.from(p.toString().replace('vocab/data/expanded-dictionary/** text eol=lf','vocab/data/expanded-dictionary/** -text'))
 ];
 for(const b of bad)assert.throws(()=>restoreD31HistoricalAttributes(Buffer.concat([b,good])));
 const d31Start=p.length-d31('\n').length;
 assert.throws(()=>restoreD31HistoricalAttributes(Buffer.concat([p.subarray(0,d31Start),good,p.subarray(d31Start)])));
});

test('D31 bridge cannot waive Common pointer or unrelated content validation',()=>{
 const restored=restoreD31HistoricalAttributes(Buffer.concat([layouts[0],suffix('\n')]));
 for(const bad of[
  Buffer.from(common.toString().replace(D31_BUILD.version,'0'.repeat(64))),
  Buffer.from(common.toString().replace('"reviewedAt": "2026-10-20"','"reviewedAt": "2026-10-21"'))
 ])assert.throws(()=>assertD31MetadataTransition(restored,bad,D31_BUILD));
});

test('D31 bridge handles raw buffers only and returns an independent historical copy',()=>{
 for(const bad of['',new Uint8Array(layouts[0]),null,undefined])assert.throws(()=>restoreD31HistoricalAttributes(bad));
 const input=Buffer.concat([layouts[0],suffix('\n')]),original=Buffer.from(input),restored=restoreD31HistoricalAttributes(input);
 restored[0]^=1;assert.deepEqual(input,original);
});

test('Shipped D32 attributes are an exact bounded extension, not a rewritten D31 prefix',async()=>{
 const raw=await fs.readFile(new URL('../../.gitattributes',import.meta.url)),restored=restoreD31HistoricalAttributes(raw);
 assert.notDeepEqual(raw,restored);assert.equal(assertD31MetadataTransition(restored,common,D31_BUILD).appendedRuleCount,3);
 const wanted=[
  'vocab/data/dictionary-examples/catalogue-v4/'+'a'.repeat(64)+'.bin',
  'vocab/data/dictionary-examples/delta-v4/'+'b'.repeat(64)+'.bin',
  'tooling/dictionary/examples/source/batch-0032-test.json',
  'tooling/dictionary/examples/reviews/batch-0032-test.json',
  'tooling/dictionary/examples/queues/batch-0032-test.json',
  'tooling/dictionary/examples/additive-index-v4.json'
 ];
 const actual=execFileSync('git',['check-attr','text','eol','--',...wanted],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/u);
 assert.deepEqual(actual,wanted.flatMap((f,i)=>[f+': text: '+(i<2?'unset':'set'),f+': eol: lf']));
});
