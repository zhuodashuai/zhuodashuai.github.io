// Intended repo test; uses transformation only to reconstruct already pinned
// test bodies, never to relax the acceptance function's byte boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseD30ApprovedTransportTable,loadD30ApprovedTransports,assertD30OldApprovedBytes} from './d30-approved-pack-transports.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const queue=JSON.parse(await fs.readFile(new URL('../dictionary/examples/queues/batch-0030.json',import.meta.url)));
const pins=queue.completeFrozenCandidate.beforeApprovedPrefix.rawSourceAndReviewPins;
const raw=await fs.readFile(new URL('../dictionary/examples/archives/d30-approved-pack-transports-0001.json',import.meta.url)),table=JSON.parse(raw),scope=await loadD30ApprovedTransports(pins);
test('D30 binds exactly1086 frozen old files and132 independently derived alternate Git transports',()=>{assert.equal(scope.originalFiles,1086);assert.equal(scope.filesWithTwoExactTransports,132);assert.equal(scope.filesWithOneExactTransport,954);assert.equal(scope.registeredWholeRawTuples,1218);});
test('every registered old working/Git pair has identical whole JSON and both exact bytes pass',async()=>{
 for(const row of table.rows){const current=await fs.readFile(new URL('../../'+row.file,import.meta.url));const isWorking=sha(current)===row.working.sha256;const working=isWorking?current:Buffer.from(current.toString('utf8').replace(/\n/gu,'\r\n')),git=isWorking?Buffer.from(current.toString('utf8').replace(/\r\n/gu,'\n')):current;assert.deepEqual({bytes:working.length,sha256:sha(working)},row.working);assert.deepEqual({bytes:git.length,sha256:sha(git)},{bytes:row.git.bytes,sha256:row.git.sha256});assert.deepEqual(JSON.parse(working),JSON.parse(git));assert.equal(sha(JSON.stringify(JSON.parse(git))),row.wholeJsonSha256);assert.equal(assertD30OldApprovedBytes(row.file,working,scope),'frozen-working');assert.equal(assertD30OldApprovedBytes(row.file,git,scope),'baseline-git-lf');}
});
test('each of132 registered files still rejects unknown, altered and extra-newline bytes',async()=>{
 for(const row of table.rows){const b=await fs.readFile(new URL('../../'+row.file,import.meta.url)),bad=Buffer.from(b);bad[0]^=1;for(const wrong of [bad,Buffer.concat([b,Buffer.from('\n')]),Buffer.concat([Buffer.from(' '),b])])assert.throws(()=>assertD30OldApprovedBytes(row.file,wrong,scope));}
});
test('transport registration cannot be replaced by rehashed changed tables, wrong original bindings or forged scopes',()=>{
 const changed=Buffer.from(raw);changed[0]^=1;assert.throws(()=>parseD30ApprovedTransportTable(changed,pins));
 const altered=structuredClone(table);altered.rows[0].git.sha256='0'.repeat(64);assert.throws(()=>parseD30ApprovedTransportTable(Buffer.from(JSON.stringify(altered,null,2)+'\n'),pins));
 const wrong=structuredClone(pins);wrong[0].sha256='0'.repeat(64);assert.throws(()=>parseD30ApprovedTransportTable(raw,wrong));assert.throws(()=>assertD30OldApprovedBytes(table.rows[0].file,Buffer.alloc(0),{}));assert.throws(()=>assertD30OldApprovedBytes('tooling/dictionary/examples/source/unknown.json',Buffer.alloc(0),scope));
});
