/** Record finite development queries without turning candidate heads into an
 * accuracy oracle. No providers, account mutations, or production requests. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const corpusFile=new URL('../dictionary/search-benchmarks/2026-11-20-development.json',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const inside=(parent,child)=>{const r=path.relative(parent,child);return r&&!path.isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+path.sep);};

export function validateDevelopmentCorpus(value){
  assert.equal(value.schemaVersion,1);assert.equal(value.id,'life-medical-development-2026-11-20');
  assert.equal(value.queries.length,62);const ids=new Set();
  for(const row of value.queries){
    assert.equal(typeof row.id,'string');assert(!ids.has(row.id));ids.add(row.id);
    assert(['en','zh'].includes(row.language));assert.equal(typeof row.query,'string');
    assert(row.query.trim()&&row.query.length<=200&&!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(row.query));
    assert(!Object.hasOwn(row,'expectedHeads'),'Exploratory candidates must not become accuracy expectations');
  }
  assert.equal(new Set(value.queries.map(row=>row.query)).size,60);
  return value;
}

export async function completeDevelopmentStream(search,item,options){
  const results=[],seen=new Set();let offset=0,pages=0,total=null;
  while(true){
    const page=await search(item.query,{...options,limit:50,offset});pages++;
    if(item.language==='zh'){
      assert(!['limited','basic'].includes(page.coverage)&&page.ranking==='global'&&page.relatedIntegrated===true);
      assert(Number.isSafeInteger(page.total)&&page.total>=0);
    }
    if(Number.isSafeInteger(page.total)){assert(total===null||total===page.total);total=page.total;}
    for(const row of page.results){assert(!seen.has(row.term),'Duplicate head across result pages');seen.add(row.term);results.push(row);}
    if(!page.hasMore)break;
    assert.equal(item.language,'zh');assert(Number.isSafeInteger(page.nextOffset)&&page.nextOffset>offset);
    assert(page.results.length>0&&page.nextOffset<page.total,'An unfinished page must advance within its advertised total');
    offset=page.nextOffset;
  }
  if(total!==null)assert.equal(results.length,total,'Advertised total must include the complete stream');
  return {results,pages,total};
}

export async function runDevelopmentAudit({checkout=root,output,useChineseQueryCache=false}={}){
  checkout=await fs.realpath(checkout);
  const bytes=await fs.readFile(corpusFile),corpus=validateDevelopmentCorpus(JSON.parse(bytes));
  const runnerBytes=await fs.readFile(fileURLToPath(import.meta.url));
  const gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:checkout}).toString().trim();
  const dirtyWorkingTree=Boolean(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{cwd:checkout}).toString().trim());
  const jsRoot=path.join(checkout,'vocab/js'),dataRoot=await fs.realpath(path.join(checkout,'vocab/data'));
  const moduleHashes={};for(const name of (await fs.readdir(jsRoot)).filter(n=>n.endsWith('.js')).sort())moduleHashes[name]=hash(await fs.readFile(path.join(jsRoot,name)));
  const manifestBytes=await fs.readFile(path.join(dataRoot,'expanded-dictionary/manifest.json'));
  const {searchExpandedDictionary}=await import(pathToFileURL(path.join(jsRoot,'expanded-dictionary.js')));
  const staticReads=[],fetchImpl=async(url,options)=>{
    const parsed=new URL(url);assert.equal(parsed.protocol,'file:');assert.equal(options?.credentials,'omit');
    const file=await fs.realpath(fileURLToPath(parsed));assert(inside(dataRoot,file));
    const body=await fs.readFile(file);staticReads.push({file:path.relative(checkout,file).replaceAll('\\','/'),bytes:body.length,sha256:hash(body)});
    return new Response(body);
  };
  const rows=[];
  for(const item of corpus.queries){
    const started=performance.now();let stream,error;
    try{stream=await completeDevelopmentStream(searchExpandedDictionary,item,{fetchImpl,useChineseQueryCache});}
    catch(failure){error={name:failure.name,code:failure.code||null,message:failure.message};}
    rows.push({...item,...stream,...(error?{error}:{}),searchMs:+(performance.now()-started).toFixed(2)});
  }
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:checkout}).toString().trim(),gitHead);
  for(const [name,expected]of Object.entries(moduleHashes))assert.equal(hash(await fs.readFile(path.join(jsRoot,name))),expected,'Runtime changed during audit');
  assert((await fs.readFile(path.join(dataRoot,'expanded-dictionary/manifest.json'))).equals(manifestBytes),'Manifest changed during audit');
  assert.equal(hash(await fs.readFile(corpusFile)),hash(bytes));assert.equal(hash(await fs.readFile(fileURLToPath(import.meta.url))),hash(runnerBytes));
  const report={schemaVersion:1,atUTC:new Date().toISOString(),gitHead,dirtyWorkingTree,corpusSha256:hash(bytes),runnerSha256:hash(runnerBytes),
    scope:corpus.scope+' All Chinese pages are required. Nonempty results do not establish correct meaning. Local sequential timings do not measure internet latency or competitor performance.',
    manifestSha256:hash(manifestBytes),moduleHashes,useChineseQueryCache,
    summary:{cases:rows.length,distinctQueries:new Set(rows.map(r=>r.query)).size,available:rows.filter(r=>r.results?.length).length,
      empty:rows.filter(r=>r.results?.length===0).map(r=>({id:r.id,query:r.query})),errors:rows.filter(r=>r.error).map(r=>({id:r.id,query:r.query,error:r.error})),
      resultPositions:rows.reduce((n,r)=>n+(r.results?.length||0),0),externalNetworkCalls:0,accountWrites:0},rows,staticReads};
  if(output){
    const destination=path.resolve(output),parent=await fs.realpath(path.dirname(destination));
    assert(parent!==checkout&&!inside(checkout,parent),'Output must be outside the audited checkout');
    try{await fs.lstat(destination);throw new Error('Output already exists; retain prior evidence');}catch(error){if(error.code!=='ENOENT')throw error;}
    await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),options={};
  while(args.length){const arg=args.shift();if(arg==='--checkout')options.checkout=args.shift();else if(arg==='--output')options.output=args.shift();else if(arg==='--cache')options.useChineseQueryCache=true;else throw new Error('Unknown argument: '+arg);}
  const report=await runDevelopmentAudit(options);console.log(JSON.stringify({gitHead:report.gitHead,dirtyWorkingTree:report.dirtyWorkingTree,...report.summary},null,2));
  if(report.summary.errors.length)process.exitCode=1;
}
