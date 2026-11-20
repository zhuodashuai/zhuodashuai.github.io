import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Full UI123 snapshots authenticate before only the two entry URLs and
// three additive aliases are reversed. No previous shell hash is replaced.
const entries=new Map([
 ['index.html',{pins:[[14536,'34bdc856217bf62172fce8ed92f1cdd36cf7d49dc818e2e5215e613a3bcaf7df'],[14660,'e0ab1cfcc7f33de2a639e4eaed57f6171e80f59f89dcc314d5618ee0d091feb9']],current:'src="js/public-app-v113.js?v=123"',previous:'src="js/public-app-v113.js?v=122"'}],
 ['personal.html',{pins:[[24104,'f7861546e4eec8bbac26c0a9349a1258d11ec180951d7d242430448527832e44'],[24205,'81228a40126eab93e3235f29b94edb57c6d10348663cb932b4b645dd0af81aca']],current:'src="js/personal-app-v108.js?v=123"',previous:'src="js/personal-app-v108.js?v=119"'}],
]);
export const SEARCH_MATCH_CONTEXT_URLS=Object.freeze(['./js/public-app-v113.js?v=123','./js/personal-app-v108.js?v=123','./js/library-lookup-ui.js?v=123']);
const workerPins=[[23687,'59f7c306228eee43788e117e70eaa80e7e5137971cc3e0badfee5a88d17ebff1'],[24122,'b7d127981b218cc383d1167cd77e68d19d243e2cf00bb94ad42af52624beed2e']];
function authenticate(text,pins,label){const bytes=Buffer.from(text),sha=createHash('sha256').update(bytes).digest('hex');assert(pins.some(([length,digest])=>bytes.length===length&&sha===digest),label+': search-match context shell snapshot changed');}
export function restoreSearchMatchContextShell(file,text){
 const entry=entries.get(file);if(!entry)return text;authenticate(text,entry.pins,file);
 assert.equal(text.split(entry.current).length,2,'Exactly one UI123 entry URL');return text.replace(entry.current,entry.previous);
}
export function restoreSearchMatchContextShellIfCurrent(file,text){const entry=entries.get(file);return entry&&text.includes(entry.current)?restoreSearchMatchContextShell(file,text):text;}
export function restoreSearchMatchContextServiceWorkerShell(text){
 authenticate(text,workerPins,'sw.js');const eol=text.includes('\r\n')?'\r\n':'\n',anchor='const SHELL = ['+eol;
 const prefix=SEARCH_MATCH_CONTEXT_URLS.map(url=>'  '+JSON.stringify(url)+',').join(eol)+eol+eol;
 assert.equal(text.split(anchor+prefix).length,2,'Exactly one UI123 three-URL prefix');return text.replace(anchor+prefix,anchor);
}
export function restoreSearchMatchContextAssetIfCurrent(file,text){
 return file==='sw.js'&&SEARCH_MATCH_CONTEXT_URLS.some(url=>text.includes(JSON.stringify(url)))?restoreSearchMatchContextServiceWorkerShell(text):restoreSearchMatchContextShellIfCurrent(file,text);
}
