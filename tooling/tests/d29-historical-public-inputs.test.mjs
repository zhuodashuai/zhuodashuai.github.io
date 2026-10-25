import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {D29_HISTORICAL_PUBLIC_INPUTS,D29_HISTORICAL_PUBLIC_COMMIT,
 readD29ProtectedReleaseInput,assertD29ProtectedBytes} from './d29-regression-fixture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
async function temporaryRoot(t){
 const directory=await fs.mkdtemp(path.join(tmpdir(),'d29-release-inputs-'));
 t.after(async()=>{
  const relative=path.relative(path.resolve(tmpdir()),path.resolve(directory));
  assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  await fs.rm(directory,{recursive:true,force:true});
 });
 return directory;
}

test('D29 reads three exact pre-Forsyte Git snapshots and retains every original transport predicate',async()=>{
 assert.equal(D29_HISTORICAL_PUBLIC_COMMIT,'fd742758b1d2b0937299063714fa42dd698a670a');
 assert.equal(Object.keys(D29_HISTORICAL_PUBLIC_INPUTS).length,3);
 for(const[file,pin]of Object.entries(D29_HISTORICAL_PUBLIC_INPUTS)){
  const raw=await readD29ProtectedReleaseInput(file);
  assert.equal(raw.length,pin.bytes);assert.equal(sha(raw),pin.sha256);
  assert.deepEqual(raw,await fs.readFile(path.join(root,pin.file)));
  assertD29ProtectedBytes(file,raw);
 }
 const core=await readD29ProtectedReleaseInput('vocab/data/ecdict-core.json');
 assert.deepEqual(core,await fs.readFile(path.join(root,'vocab/data/ecdict-core.json')));
 assertD29ProtectedBytes('vocab/data/ecdict-core.json',core);
});

test('D29 historical readers reject valid same-size JSON mutation and appended bytes before parsing',async t=>{
 const temporary=await temporaryRoot(t);
 for(const[file,pin]of Object.entries(D29_HISTORICAL_PUBLIC_INPUTS)){
  const original=await readD29ProtectedReleaseInput(file),target=path.join(temporary,pin.file);
  await fs.mkdir(path.dirname(target),{recursive:true});
  const changed=Buffer.from(original),index=changed.indexOf(Buffer.from('schemaVersion'));
  assert(index>=0);changed[index]='S'.charCodeAt(0);
  assert.equal(changed.length,original.length);assert.notEqual(sha(changed),sha(original));
  JSON.parse(changed); // It remains syntactically valid JSON of identical length.
  await fs.writeFile(target,changed);
  await assert.rejects(readD29ProtectedReleaseInput(file,{root:temporary}),/D29 historical source digest changed/u);
  await fs.writeFile(target,Buffer.concat([original,Buffer.from('\n')]));
  await assert.rejects(readD29ProtectedReleaseInput(file,{root:temporary}),/D29 historical source size changed/u);
  await fs.writeFile(target,original);
  assert.deepEqual(await readD29ProtectedReleaseInput(file,{root:temporary}),original);
 }
});

test('a missing D29 archive never falls back to a present live reading-library file',async t=>{
 const temporary=await temporaryRoot(t);
 for(const[file,pin]of Object.entries(D29_HISTORICAL_PUBLIC_INPUTS)){
  const live=path.join(temporary,file);
  await fs.mkdir(path.dirname(live),{recursive:true});
  await fs.writeFile(live,await readD29ProtectedReleaseInput(file));
  await assert.rejects(readD29ProtectedReleaseInput(file,{root:temporary}),
   error=>error.code==='ENOENT'&&error.path===path.join(temporary,pin.file));
 }
});

test('D29 reader does not accept unspecified paths or waive the immutable core boundary',async t=>{
 const temporary=await temporaryRoot(t);
 for(const file of ['../vocab/data/owner-wordbook.json','vocab/data/unspecified.json',D29_HISTORICAL_PUBLIC_INPUTS['vocab/data/owner-wordbook.json'].file])
  await assert.rejects(readD29ProtectedReleaseInput(file,{root:temporary}),/Unspecified protected file/u);
 const file='vocab/data/ecdict-core.json',raw=await readD29ProtectedReleaseInput(file),changed=Buffer.from(raw);
 changed[0]^=1;await fs.mkdir(path.join(temporary,'vocab/data'),{recursive:true});
 await fs.writeFile(path.join(temporary,file),changed);
 await assert.rejects(readD29ProtectedReleaseInput(file,{root:temporary}),/Protected bytes differ/u);
});
