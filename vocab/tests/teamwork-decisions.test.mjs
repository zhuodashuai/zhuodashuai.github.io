import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { contextualizeReadingEntry, entryLookupKeys, parsePublicSnapshot } from '../js/wordbook-schema.js';
import { buildCollectionCatalog, filterEntriesByCollection } from '../js/collections.js';
import { createChapterQuiz, validateQuizAttempt } from '../js/chapter-quiz.js';

const snapshot=parsePublicSnapshot(JSON.parse(await readFile(new URL('../data/owner-wordbook.json',import.meta.url))),{allowLegacy:false});
const byId=new Map(snapshot.entries.map(entry=>[entry.id,entry]));
const specs=[
  [5,'f1526f437a90b01db98c54980570515c95d33a116885ac256312ad6f8e3830ed',3,12,['stymie','animosity','self-aggrandizement','impeccable','procedural justice','acquiesce']],
  [6,'ac87472ab1f178e2506efd8c456bb8f07b75aa73bf0dde3a34e1409969f8d5e4',2,24,['insidious','pernicious','perfunctory','subscale','slavishly','confirmation bias','reference class forecasting']],
  [7,'56f8007fa04bc2d8cb34cf612c0fb52742a0e0ea3394ff6e6e60bef20ce58f3d',3,10,['entrained thinking','a priori','ferret out','ritual dissent','complicated context','complex context']]
];
for(const [number,sourceHash,minPage,maxPage,requiredTerms] of specs){
  const chapterId=`chapter-${number}`,membership=`collection:teamwork:${chapterId}`;
  const packet=JSON.parse(await readFile(new URL(`../data/reading-lists/teamwork/${chapterId}.json`,import.meta.url)));
  const cards=filterEntriesByCollection(snapshot.entries,'teamwork',chapterId).map(entry=>contextualizeReadingEntry(entry,'teamwork',chapterId));
  test(`Teamwork ${chapterId} retains difficult source vocabulary and complete contextual cards`,()=>{
    assert.equal(packet.sourcePdfSha256,sourceHash);
    assert.equal(packet.originalInputKind,'excerpt');
    assert.equal(cards.length,packet.expectedItemCount);
    assert.deepEqual(cards.map(card=>card.id),packet.items.map(item=>item.reuseExistingEntryId));
    assert.equal(new Set(cards.map(card=>card.id)).size,cards.length);
    const terms=new Set(packet.items.map(item=>item.term));
    for(const term of requiredTerms)assert.ok(terms.has(term),`${chapterId}: missing ${term}`);
    for(const term of ['at home','team','work','decision','manager'])assert.equal(terms.has(term),false,`${term}: elementary word`);
    for(const excluded of packet.curation.excludedItems){assert.ok(excluded.reason);assert.equal(terms.has(excluded.term),false);}
    let priorPage=0;
    for(const [index,item] of packet.items.entries()){
      const card=cards[index],canonical=byId.get(item.reuseExistingEntryId);
      assert.equal(item.order,index+1);
      assert.ok(item.pdfPage>=minPage&&item.pdfPage<=maxPage&&item.pdfPage>=priorPage);priorPage=item.pdfPage;
      assert.equal(Number(item.printedPage),item.pdfPage-(number===6?1:2));
      assert.ok(item.originalInput.split(/\s+/u).length<=8,'Source prose must not become a dictionary alias');
      assert.ok(canonical.tags.includes(membership));
      assert.equal(card.sourceUrl,packet.sourceUrl);assert.equal(card.sourceTitle,packet.sourceTitle);assert.equal(card.author,'');
      for(const key of ['meaning','usage','exampleEn','exampleZh','partOfSpeech','forms','collocations','confusedWith'])assert.deepEqual(card[key],item[key],`${item.term}: ${key}`);
      assert.equal(card.definition,item.definitionEn);
      assert.equal(card.senses[0].meaningZh,item.meaning);
      assert.deepEqual(card.senses[0].examples,[{en:item.exampleEn,zh:item.exampleZh}]);
      assert.match(card.meaning,/\p{Script=Han}/u);assert.match(card.exampleZh,/\p{Script=Han}/u);
      assert.doesNotMatch(`${card.meaning} ${card.usage} ${card.attributionNote}`,/AI复核|作者自查|Qianjun Zhuo|MGMT 2390/u);
      if(item.duplicateDecision.action==='new-card'){
        assert.equal(canonical.readingContexts[0].membership,membership);
        assert.deepEqual(entryLookupKeys(canonical),[canonical.normalized]);
      }
    }
    const catalogChapter=buildCollectionCatalog(snapshot.entries).find(book=>book.id==='teamwork').chapters.find(chapter=>chapter.id===chapterId);
    assert.equal(catalogChapter.title,packet.articleTitle);assert.equal(catalogChapter.count,cards.length);
  });
  test(`Teamwork ${chapterId} can quiz every retained word with source-scoped choices`,()=>{
    let seed=number;
    const quiz=createChapterQuiz(cards,{id:`teamwork-decisions-${number}`,bookId:'teamwork',chapterId,bookTitle:'Teamwork',chapterTitle:packet.articleTitle,now:'2026-11-03T12:00:00.000Z',random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
    validateQuizAttempt(quiz);
    assert.equal(quiz.questions.length,cards.length);assert.deepEqual(quiz.omitted,[]);
    const ids=new Set(cards.map(card=>card.id));
    for(const question of quiz.questions){assert.ok(ids.has(question.entryId));for(const option of question.options)assert.ok(ids.has(option.sourceEntryId));}
  });
}

test('adding articles preserves the first four Teamwork chapter sizes and unique canonical identities',()=>{
  const book=buildCollectionCatalog(snapshot.entries).find(book=>book.id==='teamwork');
  assert.deepEqual(book.chapters.slice(0,4).map(chapter=>chapter.count),[48,70,94,92]);
  assert.equal(new Set(snapshot.entries.map(entry=>entry.id)).size,snapshot.entries.length);
  assert.equal(new Set(snapshot.entries.map(entry=>entry.normalized)).size,snapshot.entries.length);
  const whole=filterEntriesByCollection(snapshot.entries,'teamwork');assert.equal(new Set(whole.map(entry=>entry.id)).size,whole.length);
});
