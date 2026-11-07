/** Count source surfaces without creating cards or treating chapter membership as token frequency. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT=resolve(import.meta.dirname,'../..');
const OUTPUT=resolve(ROOT,'vocab/data/reading-lists/teamwork/frequency.json');
const sha=value=>createHash('sha256').update(value).digest('hex');
export const TEAMWORK_FREQUENCY_SOURCES=Object.freeze([
  {number:1,sha256:'51cd8503189a916ab95453461dd50307ea2f5d6373176816fbb91b2c4dfdb42b',pdfPages:[2,3,4,5]},
  {number:2,sha256:'43cef9a120f7b8e91f2e91b429d87cbb453ad4e03ec49a89aa6be69cadce4adc',pdfPages:[3,4,5,6,7]},
  {number:3,sha256:'3fea33b877c94c6ba43f29043bb4d2aa837fc1add7a2175c88d161182ae6e5cc',pdfPages:[2,4,5,6,7,8,9]},
  {number:4,sha256:'d9f95bfe64491bd7816064a11d4f2ed69962aac4310e5d0b0717e2962f704dee',pdfPages:[3,4,5,6,7,8]},
  {number:5,sha256:'f1526f437a90b01db98c54980570515c95d33a116885ac256312ad6f8e3830ed',pdfPages:[5,6,7,8,9,10,11,12]},
  {number:6,sha256:'ac87472ab1f178e2506efd8c456bb8f07b75aa73bf0dde3a34e1409969f8d5e4',pdfPages:Array.from({length:23},(_,i)=>i+2)},
  {number:7,sha256:'56f8007fa04bc2d8cb34cf612c0fb52742a0e0ea3394ff6e6e60bef20ce58f3d',pdfPages:[3,4,5,6,7,8,9,10]},
  {number:8,sha256:'cf9857c258e1b1a620c1984fa830f4703e6cb20a0fe32eec4a08a4480991fef3',pdfPages:[2,3,4,5,6,7,8,9,10,11,12,13]},
  {number:9,sha256:'f36436cc0c96fed2a9d2d55b7297f88f56974ab233b9e9f806cb8ec127d728dc',pdfPages:[5,6,7,8,9,10,11,12]},
  {number:10,sha256:'1197ea2eef41350b5571be3f2cdd8c6a3740171ce191d5b2a07d043a29623e68',pdfPages:[2,4,5,6,7,8,9,10,11]},
  {number:11,sha256:'36ae1ed967b441df67a2cb6f6333f75aada81da01be617285b5d6905dd18d6b1',pdfPages:[2,3,4,5,6,7]},
  {number:12,sha256:'b414e003ef647c0b5f83dbb1183bbecb0571bc8220e63c5c1835fc1aa0ea7cda',pdfPages:[3,4,5,6,7,8,9,10,11]},
  {number:13,sha256:'e69f6b078a461b14104b826ef9ba3718433c8c12d812f16b6805b3c562fe51b9',pdfPages:[2,3,4,5,6,7,8,9]}
]);

function cleanNewArticlePage(value, number, pdfPage) {
  // The source PDFs break after some punctuation dashes. Preserve those word
  // boundaries before the shared normalizer joins words broken by hyphens.
  value = value.replace(/([–—])[ \t]*\r?\n/gu, '$1 ');
  if (number === 8 || number === 12) value = value.replace(/\bproj[ \t]+ect(s)?\b/gu, 'project$1');
  if (number === 8) {
    if (pdfPage === 3) value = value.replace(/^[\s\S]*?(?=It was a Thursday afternoon)/u, '');
    return value.replace(/BY ETHAN BERNSTEIN,[\s\S]*?MICHAEL LEE/u, '')
      .replace(/^THE BIG IDEA(?:[ \t]+BEYOND THE HOLACRACY HYPE)?[ \t]*$/gmu, '');
  }
  if (number === 9) {
    if (pdfPage === 5) {
      value = value.replace(/^e’re all familiarwith/u, 'We’re all familiar with')
        .replace(/by Rob Cross and\s+Laurence Prusak/u, '').replace(/^W[ \t]*$/mu, '');
    } else {
      value = value.replace(/^The People Who Make\s+Organizations Go\s*[–—-]\s*or Stop[ \t]*$/gmu, '');
    }
    if (pdfPage === 6) value = value.replace(/\bInformation brokerskeep\b/u, 'Information brokers keep');
    if (pdfPage === 10) value = value.split('Executives typically')[0];
    return value.split(/Reprint r0206g/iu)[0];
  }
  if (number === 10) {
    if (pdfPage === 2) value = value.replace(/Tiziana Casciaro[\s\S]*?(?=How to create more)/u, '');
    if (pdfPage === 5) value = value.split('THE CHALLENGE')[0];
    if (pdfPage === 8) value = value.split('ABOUT THE ART')[0];
    if (pdfPage === 11) value = value.split('HBR Reprint R1903J')[0];
    return value.replace(/^(?:START HERE|LEADERSHIP|May–June 2019(?:[ \t]+\d+)?)[ \t]*$/gmu, '');
  }
  if (number === 11) {
    if (pdfPage === 6) value = value.split('For greater depth, see X-Teams')[0];
    if (pdfPage === 7) value = value.split('Deborah Ancona is the Seley')[0];
    return value.replace(/Turn Y our T eams/u, 'Turn Your Teams')
      .replace(/^By Deborah Ancona and Henrik Bresman[ \t]*$/mu, '')
      .replace(/^Pep Boatella[ \t]*$/mu, '')
      .replace(/^CollaborationTEAMWORK\s+REINVENTED[ \t]*$/gmu, '')
      .replace(/\bidentifed\b/gu, 'identified').replace(/\bdifcult(ies)?\b/gu, 'difficult$1')
      .replace(/\bbriefy\b/gu, 'briefly').replace(/\bfrst\b/gu, 'first')
      .replace(/\bconfict\b/gu, 'conflict').replace(/\bstaf\b/gu, 'staff')
      .replace(/\bofsite\b/gu, 'offsite').replace(/\bEfective\b/gu, 'Effective');
  }
  if (number === 12) {
    if (pdfPage === 3) value = value.replace(/^[\s\S]*?(?=embracing agile)/u, '')
      .replace(/^BY DARRELL K\. RIGBY,.*$/mu, '').replace(/^\s*a\s*\n\s*(?=gile innovation)/mu, 'a')
      .replace(/^TODD ST\. JOHN[ \t]*$/mu, '');
    if (pdfPage === 9) value = value.split(/FURTHER\s+RESOURCES/u)[0];
    return value.replace(/^THE BIG IDEA[ \t]+EMBRACING AGILE.*$/gmu, '')
      .replace(/\bdefinition of [“"]done,[ \t]*[”"]/u, 'definition of done,');
  }
  if (number === 13) {
    if (pdfPage === 9) value = value.split('This article was originally published online')[0];
    return value.replace(/by\s+Randall\s+S\.\s+Peterson,[\s\S]*?Stephen\s+L\.\s+Jones/u, '')
      .replace(/^(?:Published on HBR\.org|Achim Sass,).*$/gmu, '')
      .replace(/^HBR\s*\/\s*Digital Article.*$/gmu, '');
  }
  return value;
}

/** Keep headings/tables and one article title, but not running matter, bios or a duplicate summary. */
export function articlePageContent(text,number,pdfPage){
  let value=String(text).normalize('NFKC').split('This document is authorized for use by')[0];
  if(number===1&&pdfPage===5)value=value.split(/Bret Sanner is an assistant professor/u)[0];
  if(number===4&&pdfPage===3)value=value.replace(/^Martine Haas is an[\s\S]*?at INSEAD\.\s*/u,'');
  if(number===2&&pdfPage===7)value=value.replace(/Rob Cross is a professor[\s\S]*?Give and Take and Originals\./u,'');
  if(number===3&&pdfPage===9)value=value.replace(/MARK MORTENSEN\s+is an associate professor[\s\S]*?professional services firms\./u,'');
  if(number===5&&pdfPage===6)value=value.split(/Kathleen M\. Eisenhardt\s+is professor/u)[0];
  if(number===7&&pdfPage===4)value=value.split(/David J\. Snowden\s+\(/u)[0];
  if(number===6&&pdfPage===24)value=value.split('A version of this article appeared')[0];
  if(number===6&&pdfPage===4)value=value.replace(/Nudge: Improving Decisions[\s\S]*?(?=The Challenge of Avoiding Bias)/u,'');
  if(number===7&&pdfPage===10)value=value.split('Reprint R0711C')[0];
  if(number>=8)value=cleanNewArticlePage(value,number,pdfPage);
  value=value
    .replace(/PLEASE NOTE THAT GRAY AREAS[\s\S]*?AS ORIGINALLY PUBLISHED\./u,'')
    .replace(/^.*(?:SLOANREVIEW\.MIT\.EDU|MIT SLOAN MANAGEMENT REVIEW|REDESIGNING WORK:\s*TEAMS).*$/gmu,'')
    .replace(/^.*(?:FOR ARTICLE REPRINTS CALL|COPYRIGHT ©|Copyright ©|SPOTLIGHT ON|HBR\s*\/\s*Magazine Article).*$/gmu,'')
    .replace(/^.*(?:Harvard Business Review|HARVARD BUSINESS REVIEW|harvard business review).*$/gmu,'')
    .replace(/^FEATURE THE OVERCOMMITTED ORGANIZATION.*$/gmu,'')
    .replace(/^From the Magazine.*$/gmu,'')
    .replace(/^andresr\/Getty Images.*$/gmu,'')
    .replace(/^BY (?:ROB CROSS|MARK MORTENSEN|MARTINE HAAS|BRET SANNER).*$/gmu,'')
    .replace(/by Kathleen M\. Eisenhardt[\s\S]*?L\.J\. Bourgeois III/u,'')
    .replace(/by David J\. Snowden and Mary E\. Boone/u,'')
    .replace(/by\s+Daniel\s+Kahneman,[\s\S]*?Olivier\s+Sibony/u,'')
    .replace(/^ILLUSTRATION BY.*$/gmu,'')
    .replace(/HBR Reprint R\w+/gu,'')
    .replace(/^\s*Reprint \w+\s*$/gmu,'');
  // The extracted running title is separate from its page number in these reprints.
  if(number===5&&pdfPage!==5)value=value.replace(/How Management Teams Can Have a Good Fight/gu,'');
  if(number===7&&pdfPage!==3)value=value.replace(/A Leader[’']s Framework for Decision Making/gu,'');
  if(number===2&&pdfPage===4)value=value.replace(/\bC\s*\n\s*(?=ollaboration\b)/u,'C');
  return value;
}

export function normalizeFrequencyText(text){
  return String(text).normalize('NFKC')
    .replace(/[‘’]/gu,"'")
    .replace(/[‐‑‒–—]/gu,'-')
    .replace(/(?<=\p{L})[ \t]*\u00ad\s*(?=\p{L})/gu,'')
    .replace(/(?<=\p{L})[ \t]*-[ \t]*\r?\n\s*(?=\p{L})/gu,'')
    .replace(/\u00ad/gu,'')
    .replace(/\beffic\s+acy\b/giu,'efficacy')
    .replace(/\s+/gu,' ').trim().toLowerCase();
}

function safeSurface(value,entry){
  if(typeof value!=='string')return false;
  const surface=normalizeFrequencyText(value);
  if(!surface||surface.length>150||!/^[\p{L}\p{N}]/u.test(surface)||!/^[\p{L}\p{M}\p{N}' -]+$/u.test(surface))return false;
  const words=surface.split(/\s+/u).length,headWords=normalizeFrequencyText(entry.term).split(/\s+/u).length;
  // A whole prose excerpt is not a surface form of a single vocabulary head.
  if(words>Math.max(headWords+3,4)||words>9)return false;
  if(entry.entryType==='word'&&headWords===1&&words>1){
    return surface.replaceAll(' ','').replaceAll('-','')===normalizeFrequencyText(entry.term).replaceAll('-','');
  }
  return true;
}

export function frequencySurfaces(entry,packets=[]){
  const values=[entry.term,entry.standardForm,...(entry.forms||[])];
  for(const context of entry.readingContexts||[]){
    if(!context.membership?.startsWith('collection:teamwork:'))continue;
    values.push(context.originalInput,...(context.forms||[]));
  }
  for(const packet of packets)for(const item of packet.items||[]){
    if(item.reuseExistingEntryId===entry.id)values.push(item.term,item.originalInput,...(item.forms||[]));
  }
  return [...new Set(values.filter(value=>safeSurface(value,entry)).map(normalizeFrequencyText))];
}

const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
function surfacePattern(surface){
  return surface.split(/([ -]+)/u).map((part,index)=>{
    if(index%2)return part.includes('-')?'[ -]*':'[ -]+';
    if(part==="one's")return "(?:one's|my|your|his|her|its|our|their)";
    return escape(part);
  }).join('');
}

// Source-reviewed grammatical variants of the same expression, not synonyms.
const EXTRA_PATTERNS=Object.freeze({
  'lead astray': ['lead you astray','leads us astray'],
  'collaborative overload':['collaboration overload'],
  'bring something to bear on':['bringing lessons from one project to bear on others'],
  'exempt someone from':['exempting members of those teams from'],
  'pit against':['pitting two subsets of the informal network against each other'],
  'stray from':['stray too far from'],
  'waterfall development':['“waterfall” development'],
  'burndown chart':['“burndown” charts']
});

export function teamworkFrequencyInputFingerprint({snapshot,packets}){
  const sourcePacketHashes=[...packets].sort((a,b)=>a.chapter.number-b.chapter.number)
    .map(packet=>({chapterId:packet.chapter.id,sha256:sha(JSON.stringify(packet))}));
  const cards=snapshot.entries.filter(e=>e.tags.some(tag=>tag.startsWith('collection:teamwork:')))
    .map(entry=>({id:entry.id,term:entry.term,standardForm:entry.standardForm,entryType:entry.entryType,forms:entry.forms||[],
      readingInputs:(entry.readingContexts||[]).filter(context=>context.membership?.startsWith('collection:teamwork:'))
        .map(context=>({membership:context.membership,originalInput:context.originalInput,forms:context.forms||[]})),
      surfaces:frequencySurfaces(entry,packets).sort()}))
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return {fingerprint:`tf1:${sha(JSON.stringify({sourcePacketHashes,cards}))}`,cardCount:cards.length,sourcePacketHashes};
}

/** This checks input bindings, not a fresh recount of absent licensed PDFs. */
export function assertTeamworkFrequencyCurrent({snapshot,packets,frequency}){
  assert.equal(frequency?.schemaVersion,1,'Unsupported Teamwork frequency schema');
  assert.equal(frequency.collectionId,'teamwork');assert.equal(frequency.metric,'source-occurrences');
  const current=teamworkFrequencyInputFingerprint({snapshot,packets});
  assert.deepEqual(frequency.inputs,current,'Teamwork frequency inputs changed; recount the reviewed source PDFs.');
  assert.deepEqual(frequency.sourceArticles.map(a=>a.chapterId),[...packets].sort((a,b)=>a.chapter.number-b.chapter.number).map(p=>p.chapter.id),'Frequency source article list is stale.');
  const ids=snapshot.entries.filter(e=>e.tags.some(tag=>tag.startsWith('collection:teamwork:'))).map(e=>e.id).sort();
  assert.deepEqual(Object.keys(frequency.entries).sort(),ids,'Frequency canonical card list is stale.');
  for(const row of Object.values(frequency.entries)){
    assert(Number.isSafeInteger(row.totalOccurrences)&&row.totalOccurrences>=0);
    assert.equal(row.articleCount,row.articles.length);
    assert.equal(row.totalOccurrences,row.articles.reduce((n,a)=>n+a.count,0));
    assert.equal(new Set(row.articles.map(a=>a.chapterId)).size,row.articles.length);
    for(const article of row.articles){
      assert(Number.isSafeInteger(article.count)&&article.count>0);
      assert.equal(article.count,article.pages.reduce((n,p)=>n+p.count,0));
      assert.equal(new Set(article.pages.map(p=>p.pdfPage)).size,article.pages.length);
      assert(article.pages.every(p=>Number.isSafeInteger(p.pdfPage)&&p.pdfPage>0&&Number.isSafeInteger(p.count)&&p.count>0));
    }
  }
  return current;
}

/** Each overlapping surface match counts once for this head, even if several aliases recognize it. */
export function countSurfaceOccurrences(text,surfaces,{term=''}={}){
  const normalized=normalizeFrequencyText(text),spans=[];
  const patterns=[...surfaces.map(surface=>surfacePattern(normalizeFrequencyText(surface))),...(EXTRA_PATTERNS[term]||[])];
  for(const pattern of new Set(patterns)){
    const expression=new RegExp(`(?<![\\p{L}\\p{N}'])${pattern}(?![\\p{L}\\p{N}'])`,'gu');
    for(const match of normalized.matchAll(expression))spans.push({start:match.index,end:match.index+match[0].length,form:match[0]});
  }
  spans.sort((a,b)=>a.start-b.start||b.end-a.end);
  const unique=[];
  for(const span of spans){
    const prior=unique.at(-1);
    if(prior&&span.start<prior.end){prior.end=Math.max(prior.end,span.end);continue;}
    unique.push({...span});
  }
  return {text:normalized,count:unique.length,spans:unique};
}

export function buildTeamworkFrequency({snapshot,packets,extractions}){
  assert.deepEqual([...packets].sort((a,b)=>a.chapter.number-b.chapter.number).map(p=>p.chapter.number),TEAMWORK_FREQUENCY_SOURCES.map(s=>s.number),'Article source manifest changed; review pages/hash boundaries before recounting.');
  const articles=TEAMWORK_FREQUENCY_SOURCES.map(spec=>{
    const chapterId=`chapter-${spec.number}`,packet=packets.find(p=>p.chapter.id===chapterId),input=extractions.find(e=>e.chapterId===chapterId);
    assert(packet&&input,`${chapterId}: supply its packet and extracted PDF pages`);
    assert.equal(input.sha256,spec.sha256,`${chapterId}: PDF SHA-256 differs from the reviewed source`);
    const pieces=[],positions=[];let length=0;
    for(const pdfPage of spec.pdfPages){
      const page=input.pages.find(p=>p.pdfPage===pdfPage);assert(page,`${chapterId}: missing PDF page ${pdfPage}`);
      const text=normalizeFrequencyText(articlePageContent(page.text,spec.number,pdfPage));
      positions.push({pdfPage,start:length,end:length+text.length});pieces.push(text);length+=text.length+1;
    }
    const text=pieces.join(' ');
    return {...spec,chapterId,articleTitle:packet.articleTitle,text,positions,bodyTextSha256:sha(text)};
  });
  const entries={};
  for(const entry of snapshot.entries.filter(e=>e.tags.some(tag=>tag.startsWith('collection:teamwork:')))){
    const surfaces=frequencySurfaces(entry,packets),matches=[];
    for(const article of articles){
      const result=countSurfaceOccurrences(article.text,surfaces,{term:entry.term});
      if(!result.count)continue;
      const pageCounts=new Map();
      for(const span of result.spans){
        const page=article.positions.find(p=>span.start>=p.start&&span.start<=p.end);
        assert(page,`${entry.term}: source offset could not be assigned to a page`);
        pageCounts.set(page.pdfPage,(pageCounts.get(page.pdfPage)||0)+1);
      }
      matches.push({chapterId:article.chapterId,articleTitle:article.articleTitle,count:result.count,pages:[...pageCounts].map(([pdfPage,count])=>({pdfPage,count}))});
    }
    entries[entry.id]={term:entry.term,totalOccurrences:matches.reduce((n,a)=>n+a.count,0),articleCount:matches.length,articles:matches};
  }
  const zeroMatches=Object.entries(entries).filter(([,entry])=>!entry.totalOccurrences).map(([id,entry])=>{
    assert(['spar','polarize'].includes(entry.term),`${entry.term}: review this zero-count source case explicitly before publishing`);
    return {id,term:entry.term,recordedSource:{chapterId:'chapter-5',pdfPage:3},reason:'该词收录于另附摘要；本统计排除重复摘要，正文未匹配该规范词或已核对词形。'};
  });
  return {schemaVersion:1,collectionId:'teamwork',metric:'source-occurrences',inputs:teamworkFrequencyInputFingerprint({snapshot,packets}),
    scope:`已提供的 ${articles.length} 篇文章的正文、表格、侧栏及一次性的文章标题与导语；不含重复封面、页眉页脚、授权水印、作者简介、参考文献、广告及 Good Fight 的另附摘要。`,
    methodology:{
      unit:'按规范词和已收录、核对的词形及短语表面形式计数；不区分同形词义。',
      normalization:'NFKC 合字、换行断词、空白、连字符排版和大小写统一；不添加同义词。',
      duplicateMatches:'同一词条的多种词形匹配到重叠位置时仅计一次。',
      pageAssignment:'跨页短语计入首词所在 PDF 页。',
      reviewedExpressionVariants:[
        {term:'lead astray',surface:'lead you astray',chapterId:'chapter-6',pdfPage:2},
        {term:'lead astray',surface:'leads us astray',chapterId:'chapter-6',pdfPage:18},
        {term:'collaborative overload',surface:'collaboration overload',chapterId:'chapter-2',pdfPage:7},
        {term:'bring something to bear on',surface:'bringing lessons from one project to bear on others',chapterId:'chapter-3',pdfPage:5},
        {term:'exempt someone from',surface:'exempting members of those teams from',chapterId:'chapter-3',pdfPage:9},
        {term:'pit against',surface:'pitting two subsets of the informal network against each other',chapterId:'chapter-9',pdfPage:8},
        {term:'stray from',surface:'stray too far from',chapterId:'chapter-10',pdfPage:8},
        {term:'waterfall development',surface:'“waterfall” development',chapterId:'chapter-12',pdfPage:7},
        {term:'burndown chart',surface:'“burndown” charts',chapterId:'chapter-12',pdfPage:9}
      ],
      limits:'统计限于已提供的文章及可识别的已核对词形；零次表示未在此计数范围匹配，不能据此推断其他资料中没有出现。'
    },zeroMatches,
    sourceArticles:articles.map(({chapterId,articleTitle,sha256,pdfPages,bodyTextSha256})=>({chapterId,articleTitle,sha256,pdfPages,bodyTextSha256})),entries};
}

async function main(args){
  const options=new Map();let check=false;
  for(const arg of args){if(arg==='--check'){check=true;continue;}const match=arg.match(/^--(source-pages-dir|output)=(.+)$/u);assert(match&&!options.has(match[1]),`Unknown or duplicate option: ${arg}`);options.set(match[1],match[2]);}
  const snapshot=JSON.parse(await readFile(resolve(ROOT,'vocab/data/owner-wordbook.json')));
  const packetDirectory=resolve(ROOT,'vocab/data/reading-lists/teamwork');
  const names=(await readdir(packetDirectory)).filter(name=>/^chapter-\d+\.json$/u.test(name));
  const packets=await Promise.all(names.map(name=>readFile(resolve(packetDirectory,name)).then(JSON.parse)));
  const output=resolve(options.get('output')||OUTPUT);
  if(check&&!options.has('source-pages-dir')){
    const frequency=JSON.parse(await readFile(output));assertTeamworkFrequencyCurrent({snapshot,packets,frequency});
    console.log(JSON.stringify({mode:'check-input-bindings',entries:Object.keys(frequency.entries).length,verified:'Canonical head/form and source-packet fingerprints; licensed PDF contents were not recounted.'},null,2));return;
  }
  assert(options.has('source-pages-dir'),'Supply --source-pages-dir=/path/to/extracted/pages with chapter-N-pages.json for every listed source. Input PDFs stay outside Git. --check without it only validates input bindings.');
  const directory=resolve(options.get('source-pages-dir'));
  const extractions=await Promise.all(TEAMWORK_FREQUENCY_SOURCES.map(({number})=>readFile(resolve(directory,`chapter-${number}-pages.json`)).then(JSON.parse)));
  const result=buildTeamworkFrequency({snapshot,packets,extractions}),serialized=JSON.stringify(result,null,2)+'\n';
  if(check)assert.equal((await readFile(output,'utf8')).replace(/\r\n/gu,'\n'),serialized,'Frequency sidecar is stale. Rebuild from the reviewed PDF extractions.');
  else await writeFile(output,serialized);
  const rows=Object.values(result.entries);
  console.log(JSON.stringify({mode:check?'check':'write',entries:rows.length,totalMatchedOccurrences:rows.reduce((n,row)=>n+row.totalOccurrences,0),repeatedHeads:rows.filter(row=>row.totalOccurrences>1).length,multipleArticleHeads:rows.filter(row=>row.articleCount>1).length,zeroHeads:rows.filter(row=>!row.totalOccurrences).map(row=>row.term),bytes:Buffer.byteLength(serialized)},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
