import {restoreSearchRelease125ModuleIfCurrent} from './search-release-125-modules.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Complete125 shell authentication precedes the exact124 compatibility chain.
// This bridge says nothing about the separately regenerated engine/data binding.
const entries=new Map([
 ['index.html',{pins:[[14536,'745f027c7ae12af45d3e8c3e9b05fc0701b15d19673007dfe81a6b036ff07577'],[14660,'c1f8908a9d0a47672722ce15fe31a194d59fb2db5178900c7c2c861c6acef234']],current:'src="js/public-app-v113.js?v=125"',previous:'src="js/public-app-v113.js?v=124"'}],
 ['personal.html',{pins:[[24104,'ffb2595190cd7feaacdd69b52b4dcf6650c0fbdf319672a68ad7cf02172a731b'],[24205,'52e4257fe845c8c026d62bfeb8f07ea2659d45562fce98a201f7690484adad0a']],current:'src="js/personal-app-v108.js?v=125"',previous:'src="js/personal-app-v108.js?v=124"'}],
 ['owner.html',{pins:[[12864,'3784b894e132b75499a1118bc15f1b72c4dc1518a95b0cfa69a70cd3cccd7fcf'],[12913,'bb1648c9ddbcc9f98ccbbf352fee4c7147fd37cd5f49fff650860082baeaac6e']],current:'src="js/owner-app-v108.js?v=125"',previous:'src="js/owner-app-v108.js?v=122"'}],
 ['dictionary.html',{pins:[[7911,'634cc635a41171d0cd2bb47ad9dac8f5098daf3443ce8a7a4ece6b9b2619058f'],[8011,'ff3e962d7edd3a3b4a540e65e4fd607f538bd34161f45a0253d222827ea92766']],current:'src="js/dictionary-entry-v109.js?v=125"',previous:'src="js/dictionary-entry-v109.js?v=118"'}]
]);
export const SEARCH_RELEASE_125_URLS=Object.freeze([
 './js/public-app-v113.js?v=125','./js/personal-app-v108.js?v=125','./js/owner-app-v108.js?v=125','./js/dictionary-entry-v109.js?v=125',
 './js/dictionary-app-v109.js?v=125','./js/dictionary-app.js?v=125','./js/library-lookup-controller.js?v=125','./js/library-lookup-ui.js?v=125',
 './js/personal-lookup-flow.js?v=125','./js/dictionary-suggestions.js?v=125','./js/expanded-dictionary.js?v=125',
 './js/everyday-lookup.js?v=125','./js/everyday-lookup-data.js?v=125','./js/reviewed-senses-data.js?v=125','./js/search-experience-data.js?v=125',
 './js/dictionary-examples-current-v4.js?v=125','./js/dictionary-examples-ui-v108.js?v=125','./js/entry-detail-v113.js?v=125','./js/entry-detail-v108.js?v=125',
 './js/selected-common-sense.js?v=125','./js/selected-legacy-examples.js?v=125','./js/selected-legacy-examples-data.js?v=125',
 './js/reviewed-canonical-forms.js?v=125','./js/english-laundry-phrase-evidence.js?v=125','./js/chinese-query-cache.js?v=125','./js/chinese-query-cache-release.js?v=125'
]);
const workerPins=[[24904,'b9e08685a186484f09ad2da2780bd9d10667d38ecc6c096a00d21912e430f018'],[25371,'ec4bfb1c64448fbe3fd1c5957276b1418d6f4d02243b888d5698a5a711372aee']];
function authenticate(text,pins,label){const bytes=Buffer.from(text),hash=createHash('sha256').update(bytes).digest('hex');assert(pins.some(([length,sha])=>bytes.length===length&&hash===sha),label+': release125 shell snapshot changed');}
export function restoreSearchRelease125Shell(file,text){const entry=entries.get(file);if(!entry)return text;authenticate(text,entry.pins,file);assert.equal(text.split(entry.current).length,2,'Exactly one125 entry URL');return text.replace(entry.current,entry.previous);}
export function restoreSearchRelease125ServiceWorkerShell(text){authenticate(text,workerPins,'sw.js');const eol=text.includes('\r\n')?'\r\n':'\n',anchor='const SHELL = ['+eol,prefix=SEARCH_RELEASE_125_URLS.map(url=>'  '+JSON.stringify(url)+',').join(eol)+eol+eol;assert.equal(text.split(anchor+prefix).length,2,'Exactly one26-URL125 prefix');return text.replace(anchor+prefix,anchor);}
export function restoreSearchRelease125AssetIfCurrent(file,text){text=restoreSearchRelease125ModuleIfCurrent(file,text);const entry=entries.get(file);if(entry&&text.includes(entry.current))return restoreSearchRelease125Shell(file,text);return file==='sw.js'&&SEARCH_RELEASE_125_URLS.some(url=>text.includes(JSON.stringify(url)))?restoreSearchRelease125ServiceWorkerShell(text):text;}
