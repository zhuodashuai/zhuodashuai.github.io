import test from 'node:test';
import assert from 'node:assert/strict';
import {dictionaryExampleMeaningLabel as label} from '../js/dictionary-app.js';
import {dictionaryExampleMeaningLabel as standaloneLabel} from '../js/dictionary-app-v109.js';
import {REVIEWED_SENSE_ENTRIES} from '../js/reviewed-senses-data.js';
import {expectedExampleHeadingMeaning} from '../../tooling/tests/e2e/expected-example-heading.mjs';

for(const [name,format]of [['inline',label],['standalone',standaloneLabel],['independent test reference',expectedExampleHeadingMeaning]]){
  test(name+' example headings hide one structural source ordinal without changing source meaning',()=>{
    for(const [raw,expected]of [
      ['① 令人不安的。','令人不安的。'],['②（名词，美式用法）殡仪馆。','（名词，美式用法）殡仪馆。'],
      ['3. 第三个义项','第三个义项'],['12、 第十二项','第十二项'],[' ① 首项\n② 其他项','首项\n② 其他项'],
      ['① ① 保留正文里的标记','① 保留正文里的标记'],['⑳ 第二十项','第二十项'],['99. 末项','末项'],['99、 末项','末项']
    ]){assert.equal(format(raw),expected);}
    for(const raw of ['停尸房','3.14是圆周率的近似值','24/7服务','2026. 年度信息','  保留原有空白','-1.5的数值','99.9的数值','100. 保留三位数','0. 保留零号','㉑ 保留范围外标记'])assert.equal(format(raw),raw);
  });
  test(name+' real corrected sense headings retain all exact POS/source/example data',()=>{
    for(const term of ['disconcerting','disastrous','mortuary']){
      const row=REVIEWED_SENSE_ENTRIES.find(row=>row.term===term);assert(row?.exampleSenses?.length);
      const before=JSON.stringify(row);
      row.exampleSenses.forEach((sense,index)=>{
        assert.match(sense.meaningZh,/^[①-⑳]/u);
        const summary=`${index+1}. ${sense.partOfSpeech} · ${format(sense.meaningZh)}`;
        assert(!/^[0-9]+\.\s+[^·]+·\s*[①-⑳]/u.test(summary));
        assert.equal(format(sense.meaningZh),sense.meaningZh.slice(1).trimStart());
      });
      assert.equal(JSON.stringify(row),before,'The complete immutable row/POS/source/example bytes remain identical');
    }
  });
}
