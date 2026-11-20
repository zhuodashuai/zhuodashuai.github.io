import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// The only added DOM is one exact spelling panel line. Authenticate each full
// current document before restoring the complete prior118 personal shell.
export const MEMBER_SPELLING_PANEL_LINE="        <div id=\"member-dictionary-suggestion-panel\" class=\"dictionary-choices\" aria-label=\"拼写建议\" aria-busy=\"false\" hidden><p id=\"member-dictionary-suggestion-status\" class=\"field-note\" role=\"status\" aria-live=\"polite\" aria-atomic=\"true\"></p><div id=\"member-dictionary-suggestions\" class=\"button-row\" role=\"group\" aria-label=\"拼写建议\"></div></div>";
export const MEMBER_SPELLING_URLS=Object.freeze(['./js/personal-app-v108.js?v=119','./js/personal-spelling.js?v=119']);
const personalPins=[[24104,"570855c8a67c77391d7ff59c439aee4e8d57407e0a99f7bcca9e4e93c24a5383"],[24205,"f11864830f286712471f67fd1bdce91f20c624f4d85fab0342fc22f63ff2f16f"]];
const workerPins=[[23433,"43dbe5388571ed956aa4e20d56676f4b30269fb339a9c27c8f9cbff0f162dcb9"],[23859,"c3b1978334516a430501eb5fa35e5f0d0a9205e907e116ade708b977c1bee332"]];
function authenticate(text,pins,label){
 const bytes=Buffer.from(text),sha=createHash('sha256').update(bytes).digest('hex');
 assert(pins.some(([length,digest])=>length===bytes.length&&digest===sha),label+': member-spelling shell snapshot changed');
}
export function restoreMemberSpellingShell(file,text){
 if(file!=='personal.html')return text;
 authenticate(text,personalPins,file);const eol=text.includes('\r\n')?'\r\n':'\n';
 assert.equal(text.split(MEMBER_SPELLING_PANEL_LINE+eol).length,2,'One exact optional spelling panel');
 assert.equal(text.split('src="js/personal-app-v108.js?v=119"').length,2,'One exact current119 entry');
 return text.replace(MEMBER_SPELLING_PANEL_LINE+eol,'').replace('src="js/personal-app-v108.js?v=119"','src="js/personal-app-v108.js?v=118"');
}
export function restoreMemberSpellingShellIfCurrent(file,text){
 return file==='personal.html'&&text.includes('src="js/personal-app-v108.js?v=119"')?restoreMemberSpellingShell(file,text):text;
}
export function restoreMemberSpellingServiceWorkerShell(text){
 authenticate(text,workerPins,'sw.js');const eol=text.includes('\r\n')?'\r\n':'\n',anchor='const SHELL = ['+eol;
 const prefix=MEMBER_SPELLING_URLS.map(url=>'  '+JSON.stringify(url)+',').join(eol)+eol+eol;
 assert.equal(text.split(anchor+prefix).length,2,'One exact new two-URL prefix');return text.replace(anchor+prefix,anchor);
}
export function restoreMemberSpellingServiceWorkerShellIfCurrent(text){
 return MEMBER_SPELLING_URLS.some(url=>text.includes(JSON.stringify(url)))?restoreMemberSpellingServiceWorkerShell(text):text;
}
