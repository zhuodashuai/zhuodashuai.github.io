import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';
import {httpTransportFixture,observedCatalogueWire,repositoryRoot,GEO_PAIR} from '../helpers/dictionary-examples-http-transport-fixture.mjs';

test.describe.configure({mode:'serial'});
test.use({serviceWorkers:'block'});
let server,origin,fixture,mode='valid',observed=[];
const modules=new Map();
test.beforeAll(async()=>{
  fixture=await httpTransportFixture();
  for(const file of ['dictionary-examples-additive.js','dictionary-examples-additive-codec.js','dictionary-examples.js'])modules.set('/vocab/js/'+file,await readFile(join(repositoryRoot,'vocab/js',file)));
  server=createServer((request,response)=>{
    observed.push({method:request.method,url:request.url});
    if(request.method!=='GET'){response.writeHead(405);response.end();return;}
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/'){response.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});response.end('<!doctype html><meta charset="utf-8"><title>Native HTTP transport regression</title>');return;}
    if(modules.has(pathname)){response.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});response.end(modules.get(pathname));return;}
    const key=pathname.startsWith('/vocab/')?pathname.slice('/vocab/'.length):'';
    if(!fixture.files.has(key)){response.writeHead(404);response.end();return;}
    let raw=fixture.files.get(key);const catalogue=key===fixture.cataloguePath;
    if(catalogue&&mode==='oversize')raw=Buffer.concat([raw,Buffer.from(' ')]);
    if(catalogue&&mode==='corrupt'){raw=Buffer.from(raw);raw[15]^=1;}
    const wire=catalogue&&mode==='valid'?observedCatalogueWire(raw):gzipSync(raw,{level:0});
    response.writeHead(200,{'content-type':'application/octet-stream','content-encoding':'gzip','content-length':String(wire.length),'cache-control':'no-store'});response.end(wire);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{await new Promise(resolve=>server?.close(resolve));});
async function loadInBrowser(page){
  await page.goto(origin+'/');
  return page.evaluate(async release=>{const {createAdditiveExamplesLoader}=await import('/vocab/js/dictionary-examples-additive.js');const reader=createAdditiveExamplesLoader(release);try{const row=await reader.load('geo',{lookupQuery:'geo'});const sense=row.senses[0],pair=sense.examples[0];return {ok:true,cells:[row.term,sense.partOfSpeech,sense.meaningZh,pair.en,pair.zh]};}catch(e){return {ok:false,code:e.code,message:e.message};}finally{reader.close();}},fixture.release);
}
test('native Chrome Fetch decodes real 1688-byte HTTP gzip to the exact1660-byte artifact and returns geo',async({page})=>{
  mode='valid';observed=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let catalogue;page.on('response',r=>{if(new URL(r.url()).pathname==='/vocab/'+fixture.cataloguePath)catalogue=r;});
  const result=await loadInBrowser(page);expect(result).toEqual({ok:true,cells:GEO_PAIR});
  expect(catalogue.status()).toBe(200);expect(catalogue.headers()['content-encoding']).toBe('gzip');expect(catalogue.headers()['content-length']).toBe('1688');
  // Read the decoded body through native Fetch, not Chrome DevTools' response
  // retention buffer: after the loader closes, CDP may already evict that body.
  // This is a second real HTTP GET, with no route, fetch override or fixture cache.
  const decoded=await page.evaluate(async path=>{const response=await fetch(path,{cache:'no-store'});return {status:response.status,encoding:response.headers.get('content-encoding'),wireLength:response.headers.get('content-length'),bytes:[...new Uint8Array(await response.arrayBuffer())]};},'/vocab/'+fixture.cataloguePath);
  expect(decoded.status).toBe(200);expect(decoded.encoding).toBe('gzip');expect(decoded.wireLength).toBe('1688');
  const bytes=Buffer.from(decoded.bytes);expect(bytes.length).toBe(1660);expect(bytes.equals(fixture.catalogueBytes)).toBe(true);
  expect(observed.filter(r=>r.url==='/vocab/'+fixture.cataloguePath)).toHaveLength(2);
  expect(observed.some(r=>r.url==='/vocab/'+fixture.deltaPath)).toBe(true);expect(observed.every(r=>r.method==='GET')).toBe(true);expect(errors).toEqual([]);
});
test('native HTTP gzip cannot conceal a delivered artifact larger than its exact cap',async({page})=>{
  mode='oversize';observed=[];expect(await loadInBrowser(page)).toMatchObject({ok:false,code:'invalid_dictionary_examples_additive'});
  expect(observed.some(r=>r.url==='/vocab/'+fixture.deltaPath)).toBe(false);expect(observed.every(r=>r.method==='GET')).toBe(true);
});
test('native HTTP gzip cannot conceal same-length artifact SHA corruption',async({page})=>{
  mode='corrupt';observed=[];expect(await loadInBrowser(page)).toMatchObject({ok:false,code:'invalid_dictionary_examples_additive'});
  expect(observed.some(r=>r.url==='/vocab/'+fixture.deltaPath)).toBe(false);expect(observed.every(r=>r.method==='GET')).toBe(true);
});
