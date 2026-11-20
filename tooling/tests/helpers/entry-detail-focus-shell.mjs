import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Authenticate whole UI122 shells before undoing only the two entry URLs
// and four additive offline aliases. Every prior life-coverage pin stays exact.
const entries=new Map([
 ['index.html',{pins:[[14536,'4667c7a6ade5b802ba9a859048ce3d0d44458770d2a5db4fdca7b7eb69981763'],[14660,'46583f08fcd26a3c3440b4d3e6bb79aac6c35a1e8d63318270a272957bcd58db']],current:'src="js/public-app-v113.js?v=122"',previous:'src="js/public-app-v113.js?v=121"'}],
 ['owner.html',{pins:[[12864,'c026a48086f0873cb55b7b2bc20abe9d15d0d9e03052402723d5f16428508605'],[12913,'db4135c124ce9fdb451e505070f606fc2ec7d4ef6d6a648fa29c0f3684eca419']],current:'src="js/owner-app-v108.js?v=122"',previous:'src="js/owner-app-v108.js?v=118"'}],
]);
export const ENTRY_DETAIL_FOCUS_URLS=Object.freeze([
 './js/public-app-v113.js?v=122','./js/owner-app-v108.js?v=122',
 './js/entry-detail-v113.js?v=122','./js/entry-detail-v108.js?v=122',
]);
const workerPins=[[23502,'370cd974c4144ad9f415a94e754510c716bc3b09b464ebae10ee7ae56fddcb89'],[23930,'9e4bb9109dda7f949b689d46bed4fd9ba56e928829591e1fc6443eed594e7b53']];
function authenticate(text,pins,label){
 const bytes=Buffer.from(text),sha=createHash('sha256').update(bytes).digest('hex');
 assert(pins.some(([length,digest])=>bytes.length===length&&sha===digest),label+': entry-detail focus shell snapshot changed');
}
export function restoreEntryDetailFocusShell(file,text){
 const entry=entries.get(file);if(!entry)return text;
 authenticate(text,entry.pins,file);assert.equal(text.split(entry.current).length,2,'Exactly one reviewed UI122 entry URL');
 return text.replace(entry.current,entry.previous);
}
export function restoreEntryDetailFocusShellIfCurrent(file,text){
 const entry=entries.get(file);return entry&&text.includes(entry.current)?restoreEntryDetailFocusShell(file,text):text;
}
export function restoreEntryDetailFocusServiceWorkerShell(text){
 authenticate(text,workerPins,'sw.js');
 const eol=text.includes('\r\n')?'\r\n':'\n',anchor='const SHELL = ['+eol;
 const prefix=ENTRY_DETAIL_FOCUS_URLS.map(url=>'  '+JSON.stringify(url)+',').join(eol)+eol+eol;
 assert.equal(text.split(anchor+prefix).length,2,'Exactly one additive four-URL UI122 prefix');
 return text.replace(anchor+prefix,anchor);
}
export function restoreEntryDetailFocusServiceWorkerShellIfCurrent(text){
 return ENTRY_DETAIL_FOCUS_URLS.some(url=>text.includes(JSON.stringify(url)))?restoreEntryDetailFocusServiceWorkerShell(text):text;
}
