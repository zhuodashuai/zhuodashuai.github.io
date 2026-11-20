import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fingerprintChineseQueryEngine} from '../../tooling/scripts/build-chinese-query-cache.mjs';
import {CHINESE_QUERY_CACHE_RELEASE as release} from '../js/chinese-query-cache-release.js';

for(const ending of ['LF','CRLF'])test(`an actual Git checkout with Windows autocrlf and ${ending} attributes preserves the bound engine bytes`,async t=>{
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const options={root,sourceManifestSha256:release.sourceManifestSha256,selectionSources:release.selectionSources};
  const current=await fingerprintChineseQueryEngine(options);
  assert.equal(current.markerValue,current.engineBinding);assert.equal(current.engineBinding,release.engineBinding);
  const files=[...Object.keys(current.sourceFiles),'vocab/js/chinese-query-cache-release.js'].sort();
  const attributes=await readFile(path.join(root,'vocab/js/.gitattributes'),'utf8');
  const rules=attributes.split(/\r?\n/u).filter(line=>line&&!line.startsWith('#'));
  assert.deepEqual(rules,files.map(file=>file.slice('vocab/js/'.length)+' text eol=lf'));
  assert.equal(files.length,25,'Only the current24 engine modules and their release descriptor change policy');
  const temporary=await mkdtemp(path.join(tmpdir(),'wordbook-eol-'));
  t.after(async()=>{
    const resolved=await realpath(temporary),parent=await realpath(tmpdir());
    assert.equal(path.dirname(resolved),parent);assert(path.basename(resolved).startsWith('wordbook-eol-'));
    await rm(resolved,{recursive:true,force:true});
  });
  await mkdir(path.join(temporary,'vocab/js'),{recursive:true});
  const lfAttributes=attributes.replaceAll('\r\n','\n');
  await writeFile(path.join(temporary,'vocab/js/.gitattributes'),ending==='LF'?lfAttributes:lfAttributes.replaceAll('\n','\r\n'));
  for(const file of files)await writeFile(path.join(temporary,file),await readFile(path.join(root,file)));
  const git=args=>execFileSync('git',args,{cwd:temporary,stdio:'pipe'});
  git(['init','--quiet']);
  git(['-c','core.autocrlf=true','add','--','vocab/js/.gitattributes',...files]);
  const checkout=path.join(temporary,'checkout');await mkdir(checkout);
  git(['-c','core.autocrlf=true','checkout-index','--prefix='+checkout.replaceAll('\\','/')+'/','--',...files]);
  for(const file of files)assert((await readFile(path.join(checkout,file))).equals(await readFile(path.join(root,file))),file+' changed in the fresh checkout');
  const exported=await fingerprintChineseQueryEngine({...options,root:checkout});
  assert.deepEqual(exported,current,'Fresh Windows checkouts must keep the compiled cache binding valid');
});
