import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Authenticate complete saved-filter124 shells before reversing only their
// two entry URLs and four additive aliases into unchanged123 snapshots.
const entries=new Map([
 ['index.html',{pins:[[14536,'242cb7b8d6989e8e8aaf3e4a706969245de0188016511ac6aa6db03175832957'],[14660,'3ca5a1341fc88d0e35cf96edbb81fec96215ff7b53541bd00a8bb9f062c07b38']],current:'src="js/public-app-v113.js?v=124"',previous:'src="js/public-app-v113.js?v=123"'}],
 ['personal.html',{pins:[[24104,'919eb4571bfb4da20a25d53f0985db0ef5e14d43cf5833330d8b215250bcf2e6'],[24205,'52e65171348a3b1fc9aa0028dd91ba2e4d76cdfb75c55aabd4fffd0e11ae7acb']],current:'src="js/personal-app-v108.js?v=124"',previous:'src="js/personal-app-v108.js?v=123"'}],
]);
export const SAVED_CARD_SEARCH_URLS=Object.freeze(['./js/public-app-v113.js?v=124','./js/personal-app-v108.js?v=124','./js/owner-public-library.js?v=124','./js/saved-card-search.js?v=124']);
const workerPins=[[23837,'bd7231ef8df5df43e55fff5c7a6b90a37091bfdd48610760361346b623fd26c4'],[24277,'4ee854888e728b0e7569d9098cf2ccdde79b3d37c2d5999f9a5880c557c945bb']];
function authenticate(text,pins,label){const bytes=Buffer.from(text),sha=createHash('sha256').update(bytes).digest('hex');assert(pins.some(([length,digest])=>bytes.length===length&&sha===digest),label+': saved-card search shell snapshot changed');}
export function restoreSavedCardSearchShell(file,text){
 const entry=entries.get(file);if(!entry)return text;authenticate(text,entry.pins,file);
 assert.equal(text.split(entry.current).length,2,'Exactly one saved-filter124 entry URL');return text.replace(entry.current,entry.previous);
}
export function restoreSavedCardSearchServiceWorkerShell(text){
 authenticate(text,workerPins,'sw.js');const eol=text.includes('\r\n')?'\r\n':'\n',anchor='const SHELL = ['+eol;
 const prefix=SAVED_CARD_SEARCH_URLS.map(url=>'  '+JSON.stringify(url)+',').join(eol)+eol+eol;
 assert.equal(text.split(anchor+prefix).length,2,'Exactly one saved-filter124 four-URL prefix');return text.replace(anchor+prefix,anchor);
}
export function restoreSavedCardSearchAssetIfCurrent(file,text){
 const entry=entries.get(file);if(entry&&text.includes(entry.current))return restoreSavedCardSearchShell(file,text);
 return file==='sw.js'&&SAVED_CARD_SEARCH_URLS.some(url=>text.includes(JSON.stringify(url)))?restoreSavedCardSearchServiceWorkerShell(text):text;
}
