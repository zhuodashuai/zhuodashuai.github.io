// Finite historical checkout-byte compatibility, not a content/review waiver.
// No input normalization: only the individually registered whole raw tuples pass.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const BASE='fef7a42862f64819f31bd3a678745344c5ca93cd';
const TABLE_SHA='71b03002821d9a0e90643c009838942a890835e0198b634e5962899f1a1e1c8b';
const BINDINGS_SHA='09507d195879e616087c59e99e426997d310bbef1fb7af3564e6af3eec8974be';
const scopes=new WeakMap();
export function parseD30ApprovedTransportTable(raw,originalPins){
 assert(Buffer.isBuffer(raw));assert.equal(raw.length,87150);assert.equal(sha(raw),TABLE_SHA,'Unregistered historical pack transport table');
 assert.equal(sha(JSON.stringify(originalPins)),BINDINGS_SHA,'Original1086 frozen bindings changed');
 assert.equal(originalPins.length,1086);const table=JSON.parse(raw);assert.equal(table.baselineCommit,BASE);assert.equal(table.totalCompared,1086);assert.equal(table.unchanged,954);assert.equal(table.changed,132);assert.equal(table.rows.length,132);
 const originals=new Map(),changed=new Map();
 for(const b of originalPins){assert(['source','reviews'].includes(b.kind));assert(/^batch-[0-9]{4}-[a-z0-9-]+\.json$/u.test(b.name));const file='tooling/dictionary/examples/'+b.kind+'/'+b.name;assert(!originals.has(file));originals.set(file,{bytes:b.bytes,sha256:b.sha256});}
 for(const row of table.rows){assert(!changed.has(row.file));assert.deepEqual(row.working,originals.get(row.file));assert.equal(row.file,'tooling/dictionary/examples/'+row.kind+'/'+row.name);assert.equal(row.git.commit,BASE);assert.match(row.git.blob,/^[a-f0-9]{40}$/u);assert.match(row.git.sha256,/^[a-f0-9]{64}$/u);assert.match(row.wholeJsonSha256,/^[a-f0-9]{64}$/u);assert.equal(row.working.bytes-row.git.bytes,row.removedCrBytes);assert(row.removedCrBytes>0);changed.set(row.file,row);}
 const scope=Object.freeze({originalFiles:1086,filesWithTwoExactTransports:132,filesWithOneExactTransport:954,registeredWholeRawTuples:1218,baselineCommit:BASE,tableSha256:TABLE_SHA});
 scopes.set(scope,{originals,changed});return scope;
}
export async function loadD30ApprovedTransports(originalPins){
 const raw=await fs.readFile(new URL('../dictionary/examples/archives/d30-approved-pack-transports-0001.json',import.meta.url));
 return parseD30ApprovedTransportTable(raw,originalPins);
}
export function assertD30OldApprovedBytes(file,raw,scope){
 const state=scopes.get(scope);assert(state,'An unregistered transport scope cannot validate old packs');assert(Buffer.isBuffer(raw));
 const original=state.originals.get(file);assert(original,'Unknown historical approved pack '+file);
 const actual={bytes:raw.length,sha256:sha(raw)},row=state.changed.get(file);
 if(actual.bytes===original.bytes&&actual.sha256===original.sha256)return'frozen-working';
 assert(row,'Historical pack bytes differ '+file);
 assert.deepEqual(actual,{bytes:row.git.bytes,sha256:row.git.sha256},'Only the registered complete Git-LF transport is allowed '+file);
 assert.equal(sha(JSON.stringify(JSON.parse(raw))),row.wholeJsonSha256);return'baseline-git-lf';
}
