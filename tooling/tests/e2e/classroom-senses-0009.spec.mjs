import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareClassroomFixture,freshClassroomReport,watchAnonymousStaticContext,verifyClassroomViewport,assertClassroomTraffic} from './browser-checks-classroom-0009.mjs';
const bytes=await readFile(new URL('../../dictionary/reviewed-senses/classroom-browser-fixture-0009.json',import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe('75167c39c7bdb26b914e028dadaf4a6cd359ccc5780b52e8d13133cd45a1eb3f');
const fixture=JSON.parse(bytes);expect(prepareClassroomFixture(fixture).queryCount).toBe(79);
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of [390,1280])test('sixteen classroom senses:79 first hits, zero fallback and complete saved-card preservation at '+width+'px',async({context},testInfo)=>{
 test.setTimeout(240000);const base='http://127.0.0.1:4187/',report=freshClassroomReport();
 await watchAnonymousStaticContext(context,base,report,expect);
 try{await verifyClassroomViewport({context,base,fixture,expect,report,width,modules:{personal:'js/personal-lookup-flow.js',hotDictionary:'js/personal-dictionary.js?v=97',expanded:'js/expanded-dictionary.js?v=104',examples:'js/dictionary-examples-current-v4.js',examplesUI:'js/dictionary-examples-ui-v108.js',additive:'js/dictionary-examples-additive.js',release:'js/dictionary-examples-release-v4.js'}});assertClassroomTraffic(expect,report);}
 finally{await testInfo.attach('classroom-'+width+'.json',{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});}
});
