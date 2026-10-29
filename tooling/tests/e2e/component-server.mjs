// A separate read-only public-asset server: no member fixture, account or writes.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('vocab'),mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:4192');
  if(url.pathname.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'});res.end('{}');return;}
  const target=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/dictionary.html':url.pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{const bytes=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);}
  catch{res.writeHead(404);res.end();}
}).listen(4192,'127.0.0.1',()=>console.log('Read-only component test server http://127.0.0.1:4192'));
