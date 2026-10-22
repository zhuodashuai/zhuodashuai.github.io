// One-time byte-preserving archive, never an approval or dictionary regeneration.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const version='474e8115824074012f7a918453f977f3a8d21c6ae25016c8a44a1fc8c2d264cc';
const expected='fb729e8f3334658e5f82df311390710dc3f05d278c125197e95de5ed1f96dd30';
const source=path.join(root,'vocab/data/expanded-dictionary/manifest.json');
const output=path.join(root,'tooling/dictionary/source-revisions/baseline-'+version+'.manifest.json');
const bytes=await fs.readFile(source),sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(sha(bytes),expected,'Archive must precede the actual source revision');
assert.equal(JSON.parse(bytes).version,version);
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,bytes,{flag:'wx'});
assert.deepEqual(await fs.readFile(output),bytes);
console.log(JSON.stringify({output,version,sha256:sha(bytes),bytes:bytes.length,sourceModified:false}));
