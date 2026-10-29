import{test,expect}from'@playwright/test';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';
import{watchAnonymousStaticContext,assertClassroomTraffic}from'./browser-checks-classroom-0009.mjs';
import{freshPrecisionReport,verifyPrecisionViewport}from'./browser-checks-translation-precision-0014.mjs';
const bytes=await readFile(new URL('../../dictionary/examples/evidence/translation-precision-0015-fixture.json',import.meta.url));expect(createHash('sha256').update(bytes).digest('hex')).toBe('51ea649ad7e9c52419b32c27d25b67742b46b9b84ca6d56712fe6486d6ed4951');const fixture=JSON.parse(bytes);expect(fixture.rows).toHaveLength(2);expect(fixture.rows.map(r=>r.term)).toEqual(['vengeful','collude']);
test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});
for(const width of[390,1280])test('two Chinese-only corrections preserve native IDs, independent labels and private saved fields at '+width+'px',async({context},testInfo)=>{
 test.setTimeout(180000);const base='http://127.0.0.1:4194/',report=freshPrecisionReport();await watchAnonymousStaticContext(context,base,report,expect);
 try{await verifyPrecisionViewport({context,base,fixture,expect,report,width});expect(report.queries).toHaveLength(2);expect(report.native[0].checks).toHaveLength(2);expect(report.saved).toHaveLength(12);assertClassroomTraffic(expect,report);}
 finally{await testInfo.attach('two-precision-'+width+'.json',{body:Buffer.from(JSON.stringify(report,null,2)),contentType:'application/json'});}
});
