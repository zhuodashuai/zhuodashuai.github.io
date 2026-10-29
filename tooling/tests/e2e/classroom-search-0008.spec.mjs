import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepareClassroomFixture,freshClassroomReport,watchAnonymousStaticContext,verifyClassroomViewport,assertClassroomTraffic} from './browser-checks-classroom-0008.mjs';
const bytes=await readFile(new URL('../../dictionary/reviewed-senses/classroom-browser-fixture-0008.json',import.meta.url));
expect(createHash('sha256').update(bytes).digest('hex')).toBe('bba60be030925a0d3be5d1ac8f5d2546027beb9783be3aace486fac67b16a10e');
const fixture=JSON.parse(bytes);expect(prepareClassroomFixture(fixture).queryCount).toBe(39);
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of [390,1280])test('twelve classroom heads: 39 first hits, native sources and preserved saved cards at '+width+'px',async({context},testInfo)=>{
 test.setTimeout(180000);const base='http://127.0.0.1:4187/',report=freshClassroomReport();
 await watchAnonymousStaticContext(context,base,report,expect);
 try{await verifyClassroomViewport({context,base,fixture,expect,report,width,modules:{personal:'js/personal-lookup-flow.js',hotDictionary:'js/personal-dictionary.js?v=97',expanded:'js/expanded-dictionary.js?v=104',examples:'js/dictionary-examples-current-v4.js',examplesUI:'js/dictionary-examples-ui-v108.js',additive:'js/dictionary-examples-additive.js',release:'js/dictionary-examples-release-v4.js'}});assertClassroomTraffic(expect,report);}
 finally{await testInfo.attach('classroom-'+width+'.json',{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});}
});
