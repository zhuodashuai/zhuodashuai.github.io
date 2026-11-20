import test from 'node:test';
import assert from 'node:assert/strict';
import {EVERYDAY_LOOKUP_ENTRIES} from '../../vocab/js/everyday-lookup-data.js';
import {SEARCH_EXPERIENCE_ENTRIES} from '../../vocab/js/search-experience-data.js';
import {historicalCommonSearch42,historicalCommonEveryday1283} from './helpers/common-followup-history.mjs';
import {historicalSearch20,historicalOrdinary1048,historicalSelected207,exactSourceCorrectionRows} from './helpers/search-common-terms-history.mjs';
import {historicalSearch33,historicalOrdinary1061,historicalSelected210,historicalEveryday1271,
  exactLifeCommonTermRows,exactMedicalCorrectionRows,historicalLifeCoverageAudit} from './helpers/life-coverage-history.mjs';

test('complete signed life9 and medical3 additions preserve every historical count/hash boundary',()=>{
  assert.equal(historicalCommonSearch42(SEARCH_EXPERIENCE_ENTRIES).length,42);assert.equal(historicalSearch33(SEARCH_EXPERIENCE_ENTRIES).length,33);
  assert.equal(historicalSearch20(SEARCH_EXPERIENCE_ENTRIES).length,20);
  assert.equal(historicalCommonEveryday1283(EVERYDAY_LOOKUP_ENTRIES).length,1283);assert.equal(historicalEveryday1271(EVERYDAY_LOOKUP_ENTRIES).length,1271);
  assert.equal(historicalOrdinary1061(EVERYDAY_LOOKUP_ENTRIES).length,1061);assert.equal(historicalOrdinary1048(EVERYDAY_LOOKUP_ENTRIES).length,1048);
  assert.equal(historicalSelected210(EVERYDAY_LOOKUP_ENTRIES).length,210);assert.equal(historicalSelected207(EVERYDAY_LOOKUP_ENTRIES).length,207);
  assert.equal(exactLifeCommonTermRows(EVERYDAY_LOOKUP_ENTRIES).length,9);assert.equal(exactMedicalCorrectionRows(EVERYDAY_LOOKUP_ENTRIES).length,3);
  assert.deepEqual(exactSourceCorrectionRows(EVERYDAY_LOOKUP_ENTRIES).map(row=>row.term),['disastrous','disconcerting','mortuary']);
});

test('no changed field on any new life object authorizes a historical projection',()=>{
  for(const addition of exactLifeCommonTermRows(EVERYDAY_LOOKUP_ENTRIES))for(const field of Object.keys(addition)){
    const rows=structuredClone(EVERYDAY_LOOKUP_ENTRIES),row=rows.find(row=>row.term===addition.term);delete row[field];
    assert.throws(()=>historicalOrdinary1061(rows),addition.term+': '+field);
    const search=structuredClone(SEARCH_EXPERIENCE_ENTRIES),searchRow=search.find(row=>row.term===addition.term);delete searchRow[field];
    assert.throws(()=>historicalSearch33(search),addition.term+': '+field);
  }
});

test('the complete compiled medical object, including policy and legacy binding, is required rather than its head/flag',()=>{
  for(const addition of exactMedicalCorrectionRows(EVERYDAY_LOOKUP_ENTRIES))for(const field of Object.keys(addition)){
    const rows=structuredClone(EVERYDAY_LOOKUP_ENTRIES),row=rows.find(row=>row.term===addition.term);delete row[field];
    assert.throws(()=>historicalSelected210(rows),addition.term+': '+field);
  }
  for(const addition of exactMedicalCorrectionRows(EVERYDAY_LOOKUP_ENTRIES)){
    const rows=structuredClone(EVERYDAY_LOOKUP_ENTRIES),row=rows.find(row=>row.term===addition.term);
    row.sourceCorrection.rejected[0].display.meaning+=' changed';assert.throws(()=>historicalSelected210(rows));
  }
});

test('missing, duplicate or extra additions and changed original objects cannot pass count-only projection',()=>{
  for(const addition of [...exactLifeCommonTermRows(EVERYDAY_LOOKUP_ENTRIES),...exactMedicalCorrectionRows(EVERYDAY_LOOKUP_ENTRIES)]){
    const missing=EVERYDAY_LOOKUP_ENTRIES.filter(row=>row!==addition);assert.throws(()=>historicalEveryday1271(missing),addition.term);
    assert.throws(()=>historicalEveryday1271([...EVERYDAY_LOOKUP_ENTRIES,addition]),addition.term);
    const impostor=EVERYDAY_LOOKUP_ENTRIES.map(row=>row===addition?{...row,term:'unapproved replacement'}:row);
    assert.throws(()=>historicalEveryday1271(impostor),addition.term);
  }
  const originalChanged=structuredClone(EVERYDAY_LOOKUP_ENTRIES);originalChanged[0].meaning+=' changed';
  assert.throws(()=>historicalEveryday1271(originalChanged));
  const selectedChanged=structuredClone(EVERYDAY_LOOKUP_ENTRIES);selectedChanged.find(row=>row.term==='allergy').meaning+=' changed';
  assert.throws(()=>historicalEveryday1271(selectedChanged));
});

test('audit projection admits only the exact twelve source-bound additions and twelve original pairs',()=>{
  const old={packagedRowsChecked:1258,distinctPublicExampleContextsChecked:106071,immutable:'must stay exact'};
  const current={...old,packagedRowsChecked:1270,distinctPublicExampleContextsChecked:106083};
  assert.deepEqual(historicalLifeCoverageAudit(current,old,EVERYDAY_LOOKUP_ENTRIES),old);
  for(const changed of[{...current,packagedRowsChecked:1271},{...current,distinctPublicExampleContextsChecked:106084},{...current,immutable:'changed'}]){
    assert.throws(()=>historicalLifeCoverageAudit(changed,old,EVERYDAY_LOOKUP_ENTRIES));
  }
  assert.throws(()=>historicalLifeCoverageAudit(current,old,EVERYDAY_LOOKUP_ENTRIES.slice(1)));
});
