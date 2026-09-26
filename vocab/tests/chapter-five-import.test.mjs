import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { importReadingList } from "../../tooling/scripts/import-reading-list.mjs";
import { buildCollectionCatalog, collectionContextForEntry, filterEntriesByCollection } from "../js/collections.js";
import { applyReviewRating, buildDueQueue, buildStudySummary } from "../js/study.js";
import { entrySynonymFingerprint } from "../js/synonym-evidence.js";
import { contextualizeReadingEntry, entryLookupKeys, meaningItemsForDisplay, normalizeEnglish, parsePublicSnapshot, publicEntryMatchesQuery, reconcileLexicalEntryForPublish } from "../js/wordbook-schema.js";

const sourceUrl = new URL("../data/reading-lists/never-let-me-go/chapter-5.json", import.meta.url);
const snapshotUrl = new URL("../data/owner-wordbook.json", import.meta.url);
const collectionId = "never-let-me-go";
const chapterId = "chapter-5";
const membership = "collection:never-let-me-go:chapter-5";
const timestamp = "2026-09-26T18:00:00.000Z";
const reusedTerms = ["daft", "eaves", "out of the blue", "pavilion"];

// Independent transcription of the supplied 159-row Markdown table:
// [page, headword, text form, English meaning, Chinese meaning, usage notes].
// The photographs were separately reviewed before import. They correct
// "alluded darkly" to "allude darkly" and complete "tuck oneself" with "in".
// Keep this fixture portable: the user's G: drive is not a test dependency.
const expectedRows = [
  ["49","carry on","carried on","continue","继续下去","指 secret guard 活动持续；carry on doing sth"],
  ["49","a matter of","a matter of two or three weeks","only a particular amount or period","不过两三周的事","强调时间短，不是“问题”"],
  ["49","shrink","had shrunk in her memory","become smaller or seem less substantial","在记忆中缩短、淡化","shrink-shrank-shrunk；此处指对持续时间的回忆"],
  ["49","going on","seven, going on eight","approaching a particular age","七岁，快八岁","固定年龄表达"],
  ["49","expel","expelled","force someone to leave a group","逐出、赶出团体","expel sb from a group；不是这里被学校开除"],
  ["49","pressed flowers","pressed flowers","flowers dried by flattening them","压干的花、压花","pressed 指压平制成标本"],
  ["49","come to mind","comes to mind","enter one's thoughts","浮现在脑海中","sth comes to mind"],
  ["49","plot","the plot to kidnap","a secret plan to do something harmful","阴谋、密谋","plot to do sth；此处不是小说情节"],
  ["49","kidnap / abduction","kidnap; abduction","take someone away by force","绑架／绑架行为","kidnap sb；abduct 是与 abduction 对应的动词"],
  ["49","the brains behind","the brains behind it","the person who plans and directs something","背后的策划者","brains 此处指智囊或主谋"],
  ["49","come into it","the woods would come into it","be involved in a situation","与此事有关、牵涉其中","不是单纯“走进去”"],
  ["49","fringe","a dark fringe of trees","a narrow outer strip or edge","一带暗色的树林边缘","fringe 在此不是刘海"],
  ["49","cast a shadow over","cast a shadow over","darken something, literally or emotionally","给……蒙上阴影","此处有实际景象与心理恐惧的双重意味"],
  ["50","loom","looming","appear large or threatening","隐约耸现，令人感到压迫","蓝线标记；loom in the distance"],
  ["50","have a row","had a big row","have an argument","大吵一架","row 这里读 /raʊ/，不是“一排” /rəʊ/"],
  ["50","run off","run off beyond","leave suddenly or run away","跑走、逃离","run off beyond the boundaries"],
  ["50","chop off","chopped off","cut off with a sharp blow","砍掉","chop sth off；照片中是孩子们转述的故事"],
  ["50","rumour","Another rumour","an unverified story passed between people","传闻、谣言","英式拼法；美式 rumor"],
  ["50","plead","pleading to be let back in","ask very urgently or emotionally","恳求让自己回去","plead with sb to do sth；plead to be allowed in"],
  ["50","pine","pining to be let back in","long for something with sadness","苦苦盼望、思念","蓝线标记；pine for sb/sth；这里不是松树"],
  ["50","ghastly","the ghastly truth","extremely unpleasant or frightening","可怕的、骇人的","ghastly truth；不是 ghostly 的同义拼写"],
  ["50","play on one's imagination","played on our imaginations","strongly affect what someone imagines","不断刺激想象，使人胡思乱想","此处是树林引发恐惧"],
  ["50","rustle","rustling the branches","make a soft dry sound through movement","使树枝沙沙作响","wind rustling the branches"],
  ["50","haul","hauling her out of bed","pull someone with force","用力把她拖下床","haul sb out of sth"],
  ["50","window pane","window pane","a sheet of glass in a window","窗玻璃","pane 与 pain 同音"],
  ["50","screw one's eyes shut","kept her eyes screwed shut","close one's eyes very tightly","紧紧闭眼","screwed shut 描述紧闭的状态"],
  ["50","twist one's arm","twisted her arms","turn or bend an arm forcibly","扭她的胳膊","本处是实际动作；在别处也可比喻强迫说服"],
  ["51","outline","the distant outline","the outer shape of something","远处的轮廓","此处不是文章大纲"],
  ["51","defiant","a defiant surge of courage","showing resistance or refusal to give in","不服气的、带有反抗意味的","defiant 修饰 surge of courage"],
  ["51","surge","a defiant surge of courage","a sudden strong increase in a feeling","突然涌起的一股勇气","a surge of emotion"],
  ["51","chance remark","a chance remark","a casual or accidental comment","偶然的一句话","chance 在此作形容词，不是机会"],
  ["51","when it comes down to it","When it came down to it","when the practical reality is considered","说到底、真要付诸行动时","用于从想象转向实际情况"],
  ["51","revolve around","revolved around gathering","have something as the main focus","围绕……展开","revolve around doing sth"],
  ["51","keep at bay","keep any immediate danger at bay","prevent something from approaching or causing trouble","使危险暂时无法逼近","keep danger at bay"],
  ["51","conspirator","the conspirators","someone involved in a secret harmful plan","共谋者、密谋参与者","conspiracy 是名词“阴谋”"],
  ["51","confer furtively","confer furtively","talk together secretly to avoid notice","偷偷商议、鬼鬼祟祟地交谈","蓝线标记；confer with sb；furtively 修饰交谈方式"],
  ["51","recede","receding figure","move farther away","身影渐行渐远","receding 是分词，修饰 figure"],
  ["51","be in on","to be in on the plot","know about or participate in a secret plan","知情并参与密谋","be in on sth"],
  ["51","sworn enemy","sworn enemies","a firmly declared enemy","死敌、公开认定的敌人","sworn 在此强调坚定的敌对关系"],
  ["51","precarious","precarious","unstable and liable to fail","不稳固的、摇摇欲坠的","蓝线标记；形容幻想赖以成立的基础"],
  ["51","confrontation","any confrontation","a direct hostile encounter or challenge","当面对质、冲突","avoid confrontation"],
  ["51","plotter","a plotter","someone making a secret harmful plan","密谋者","与 plot 的“阴谋”义对应"],
  ["52","to no good purpose","alarmed to no good purpose","without any useful result","徒劳地、没有实际益处地","不是 for a good purpose 的肯定意思"],
  ["52","outgrow","naturally outgrown it","become too mature for an activity or interest","长大后不再热衷于","outgrow-outgrew-outgrown"],
  ["52","authority","enormous authority","the power to influence or direct others","很大的权威、支配力","此处指 Ruth 在团体中的影响力"],
  ["52","reveal","yet to reveal","make previously hidden information known","透露、揭示","be yet to do sth：尚未做某事"],
  ["52","justify","justify almost any decision","give an acceptable reason for something","为决定提供理由、使其显得合理","justify doing sth；不是 justify to do"],
  ["52","on behalf of","on behalf of the group","as a representative of someone","代表这个团体","辨别代表谁作决定"],
  ["52","allude","allude darkly","refer to something indirectly","隐约提及、暗示","allude to sth；darkly 带神秘或不祥的意味"],
  ["52","preserve","preserving the fantasy","keep something alive or unchanged","维持这种幻想","preserve a fantasy"],
  ["52","something of a","something of a chess expert","to some degree, or notably, a particular kind of person","算得上一个象棋高手","不是“某专家的一件东西”"],
  ["52","dim","Amazingly dim","not intelligent or perceptive","迟钝的、笨的","英式口语；这里不是灯光暗"],
  ["52","engross","engrossed myself","absorb someone's attention completely","使全神贯注、完全投入","engross oneself in sth；be engrossed in sth"],
  ["52","ornate","ornate pieces","elaborately decorated","装饰繁复的","这里形容棋子"],
  ["52","count on","counting on Ruth's help","rely on someone or something","指望、依靠","count on sb to do sth"],
  ["52","corner","cornered her","put someone in a situation they cannot easily avoid","堵住她，使她无法再推脱","此处是动词，不是角落"],
  ["53","variant","a vague variant on draughts","a version differing from an original","某种变体、变种","a variant on/of sth"],
  ["53","draughts","draughts","a board game in which pieces jump over opposing pieces","西洋跳棋","英式用词；美式 checkers；不是中国跳棋"],
  ["53","distinguishing feature","The distinguishing feature","a quality that sets something apart","区别性特征","distinguish A from B"],
  ["53","knight","the knight","the chess piece that moves in an L shape","国际象棋中的马","这里不是骑士人物"],
  ["53","go along with","went along with her","accept or cooperate with someone's suggestion","暂且顺着她、配合她","此处不是一起步行"],
  ["53","claim","claimed it wouldn't count","state something as true, without necessarily proving it","声称、坚持说","claim that...；不自动表示说法是真的"],
  ["53","count","it wouldn't count","be valid or accepted","算数、有效","此处不是数数"],
  ["53","storm off","storming off","leave angrily","气冲冲地走开","storm 作动词表达带怒气的动作"],
  ["53","statement enough","statement enough for her","a sufficiently clear expression of one's feelings","足以让她明白自己的态度","动作也可以成为一种 statement"],
  ["53","patch","a strong patch of sun","a small area differing from its surroundings","一块阳光、一片光斑","不是补丁的本义"],
  ["53","without a second thought","without a second thought","without pausing to reconsider","不假思索地","区别 have second thoughts：重新考虑、动摇"],
  ["53","it hit someone","it suddenly hit me","someone suddenly understood something","突然意识到","it hit me that..."],
  ["53","split second","the split second","an extremely brief moment","一刹那","in a split second"],
  ["53","puddle","a puddle","a small shallow pool of water on the ground","地上的小水洼","step into a puddle"],
  ["53","hardly ... before","She'd hardly finished her sentence before","one event followed almost immediately after another","她话音未落就……","had hardly done ... before ..."],
  ["54","snub","this snub","a deliberate act of ignoring or rejecting someone","冷落、怠慢","指刚才的排斥行为"],
  ["54","intently","intently","with close attention","专注地、目不转睛地","gaze intently"],
  ["54","acute","acute embarrassment","very intense or severe","强烈的、尖锐的","这里是强烈尴尬，不是医学上的急性"],
  ["54","humiliation","our recent humiliations","an experience of shame or loss of dignity","受辱、丢脸的经历","humiliate sb；feel humiliated"],
  ["54","stare something in the face","staring our rejection in the face","confront something unpleasant directly","直面被排斥的事实","比喻用法，不是 rejection 真有一张脸"],
  ["54","as it were","as it were","so to speak; marking a figurative expression","可以说、姑且这样说","提示前面的说法带比喻性质"],
  ["54","sheer","the sheer force","used to emphasize how great something is","十足的、强烈到惊人的","强调 force 的程度"],
  ["54","overtake","overtook me","suddenly overwhelm someone","情绪突然攫住、压倒自己","这里不是交通中的超车"],
  ["54","daft","so daft","silly or foolish","愚蠢的、傻的","英式非正式用语"],
  ["55","back down","back down easily","stop defending a position in an argument","退让、服软","back down from a position"],
  ["55","made-up","made-up things","invented rather than true","编造的","made-up story；不是化好妆的"],
  ["55","how come","How come","why or how something happened","怎么会、为什么","通常后接陈述语序：How come you know?"],
  ["55","irritated","hugely irritated","annoyed","很恼火、不耐烦","be irritated with sb / by sth"],
  ["55","turn something over","turning all of this over","consider something repeatedly in the mind","反复思考、琢磨","这里不是翻转实体物品"],
  ["55","hostile","hostile to Moira B.","unfriendly or antagonistic","怀有敌意的","hostile to/towards sb"],
  ["55","ally","a natural ally","someone on the same side","盟友、同一阵营的人","此处因相似经历本可站在一起"],
  ["55","loyalty","the sort of loyalty","faithful support for someone","忠诚、忠心","loyalty to sb"],
  ["55","inspire","inspired in me","cause someone to feel something","在某人心中激起","inspire loyalty in sb"],
  ["55","bring up","brought it up","mention a topic","提起某事","bring sth up；此处不是养育"],
  ["55","fade away","had faded away","gradually disappear","逐渐消失、淡去","活动或想法逐渐淡出"],
  ["56","steam up","steamed up the windows","cover a surface with condensation","使窗户蒙上水汽","steam up the windows"],
  ["56","stuffy","really stuffy","unpleasantly warm with too little fresh air","闷热、不通风的","stuffy room；此处不是思想古板"],
  ["56","exaggerate","exaggerating","describe something as greater than it really was","夸大、夸张","叙述者对自己记忆的限定"],
  ["56","perch","perched","sit on a narrow edge or high place","坐在边缘、栖坐","perch on sth"],
  ["56","squeeze up","squeezing up","move closer together to make room","挤紧一些以腾出位置","这里不是把物体挤压出汁"],
  ["56","tan","a deep tan colour","a yellowish-brown colour","深黄褐色","这里是颜色，不是晒黑的动作"],
  ["56","pom-pom","a furry pom-pom","a small decorative ball of soft material","绒球","pencil case 拉链上的装饰"],
  ["56","admiringly","staring admiringly","with approval or appreciation","羡慕地、赞赏地","admire → admiring → admiringly"],
  ["56","deliberately","very deliberately","intentionally and carefully","刻意地、郑重而有意地","说话方式是经过控制的"],
  ["56","knowing smile","a knowing smile","a smile suggesting secret knowledge","意味深长的笑、心照不宣的笑","不是简单的“知道的微笑”"],
  ["56","innocuous","an innocuous sort of response","apparently harmless or unlikely to upset anyone","看似无害、无关紧要的","innocuous remark / response"],
  ["56","chilly","hot and chilly","unpleasantly cold","发冷的","这里描写情绪触发的身体感受"],
  ["56","build up","building up for weeks","develop or increase gradually","几周来逐步积累","这里指此前暗示的积累"],
  ["56-57","stage whisper","stage-whisper style; a stage whisper","an exaggerated whisper audible to others","故作神秘、别人也能听见的耳语","区别真正不让旁人听见的小声说话"],
  ["57","mark of favour","some little mark of favour","a sign of special approval or kindness","受到特殊照顾的迹象","favour 英式拼写；不是分数"],
  ["57","draw up beside","drawn up beside her","come close beside someone","靠到她身旁","这里不是起草文件"],
  ["57","explicitly / imply","explicitly claimed; implied","directly stated / indirectly suggested","明确地声称／暗示","explicit 与 implied 的对比是此段理解重点"],
  ["57","favouritism","show favouritism","unfair preference for one person over others","偏爱、偏袒","show favouritism towards sb"],
  ["57","affection","displays of affection","warm feelings of fondness","关爱、喜爱","display affection；区别偏袒 favouritism"],
  ["57","within certain parameters","within certain parameters","within defined limits","在一定界限内","parameters 此处是行为范围，不是统计参数"],
  ["57","bite one's lip","biting my lip","bite one's lip, often to hold back words or emotion","咬住嘴唇，忍住情绪或话语","此处含压抑不满的意味"],
  ["57","brace oneself","brace myself","prepare for something difficult or unpleasant","做好心理准备","brace oneself for sth"],
  ["57","out of the blue","straight out of the blue","completely unexpectedly","猝不及防、毫无预兆地","不是来自蓝色的地方"],
  ["57","beyond the bounds","beyond the bounds","outside accepted or imaginable limits","超出可接受或可想象的范围","本处指送礼这件事超出她的预想"],
  ["57","see it coming","hadn't seen it coming","anticipate an event","事先料到","常见 I didn't see that coming"],
  ["57","flurry","the emotional flurry","a brief burst of activity or feeling","一阵情绪波动","emotional flurry"],
  ["57","disguise","disguise my anger","hide or change the appearance of something","掩饰怒气","make no attempt to disguise：毫不掩饰"],
  ["57","glare","glaring at her","look angrily and fixedly at someone","怒视、瞪着","glare at sb；不同于 glance 一瞥"],
  ["57","brood over","brooded over things","think unhappily about something for a long time","反复烦恼、耿耿于怀","brood over/on sth"],
  ["57","for hours on end","for hours on end","for many hours without stopping","连续好几个小时","on end 强调持续不停"],
  ["58","clown around","clowning around","behave in a silly playful way","耍宝、嬉闹","不一定指职业小丑"],
  ["58","in a trance","in a bit of a trance","in a state of reduced awareness of surroundings","恍恍惚惚、出神","此处不是医学诊断"],
  ["58","drift off","drift off in the middle of conversations","gradually lose attention","谈话中走神","此处偏注意力飘走，不必理解为睡着"],
  ["58","get away with","get away with it","avoid consequences for something wrong","做错事却蒙混过关","get away with doing sth"],
  ["58","constructive","anything constructive","useful and directed toward a practical result","有实际作用的、建设性的","这里是实际采取行动，而不只是幻想"],
  ["58","expose","expose her","reveal someone's deception","揭穿她","expose a lie / deception"],
  ["58","make up","made it up","invent a story or claim","编造","与 p.55 的 made-up 对应"],
  ["58","hazy","a hazy fantasy","unclear or not sharply defined","模糊的、朦胧的","hazy memory / idea"],
  ["58","dressing-down","a complete dressing-down","a severe scolding","狠狠的一顿训斥","give sb a dressing-down；不是脱衣服"],
  ["58","gorgeous","a gorgeous item","very attractive","十分漂亮的","此处形容文具盒"],
  ["58","go unnoticed","wouldn't have gone unnoticed","escape being noticed","没有被人注意到","否定式：不可能没人注意到"],
  ["58","knock around","knocked around Hailsham","be present or circulate somewhere informally","早就在学校里出现、流转过","此处不是敲打"],
  ["58","run the risk","ran the risk","expose oneself to the possibility of something bad","冒……的风险","run the risk of doing sth"],
  ["58","reserve","reserved it","arrange for something to be kept for later purchase","预留、预订","reserve an item"],
  ["58","register","registers","an official written record or list","登记簿、购买记录册","不是注册动作，也不是收银机"],
  ["58","obtainable","easily obtainable","able to be obtained","能够取得的","obtain → obtainable"],
  ["58","browse through","browse through the pages","look through something casually","翻阅、浏览","browse through a book"],
  ["58","refine","refining it","improve something by making small changes","逐步完善、细化","refine a plan"],
  ["59","bluff","bluff","pretend to know more or have a stronger position than one does","虚张声势、假装掌握证据","这里是假装已查阅记录；不必真的查完"],
  ["59","eaves","under the eaves","the lower roof edges projecting beyond a wall","屋檐","通常用复数 eaves"],
  ["59","drizzle","fog and drizzle","light rain with very small drops","毛毛雨","drizzle 也可作动词"],
  ["59","pavilion","the pavilion","a building associated with a sports ground or garden","运动场旁的亭楼或活动建筑","不强行理解成中式亭子"],
  ["59","tuck oneself in","tucked ourselves in","fit oneself snugly into a sheltered space","缩到、躲到遮蔽处","此处是躲到屋檐下"],
  ["59","ease","the rain didn't ease","become less intense","雨势减弱","ease 此处是不及物动词"],
  ["59","come straight out with","come straight out with it","say something directly","直截了当地说出来","come out with sth"],
  ["59","race on","Ruth's mind ... had raced on","move quickly ahead in thought","脑子迅速转动，推想到后面的意思","指迅速想明白 Kathy 在暗示什么"],
  ["59","unfold","unfolding at that moment","develop or happen gradually","在眼前展开、发生","a situation unfolds"],
  ["59","at a loss for words","at a complete loss for words","unable to think what to say","完全说不出话、不知如何回应","be at a loss for words"],
  ["60","on the verge of","on the verge of tears","very close to a particular state or action","眼看就要哭出来","on the verge of doing sth"],
  ["60","utterly","utterly baffling","completely","完全地、彻底地","utterly 加强后面形容词的程度"],
  ["60","baffling","utterly baffling","very difficult to understand","令人困惑、难以理解的","baffling 令人困惑；baffled 感到困惑"],
  ["60","so what if","So what if","used to suggest that something does not matter much","即使……又怎样呢","反问，降低所述行为的严重性"],
  ["60","fib","fibbed","tell a relatively small or minor lie","撒个小谎","fib 通常比 lie 语气轻；此处也反映叙述者的态度"],
  ["60","bend the rules","bending the rules","allow a small exception to a rule","通融、稍微放宽规矩","不同于完全推翻规则"],
  ["60","spontaneous","A spontaneous hug","done naturally without prior planning","自发的、自然流露的","spontaneous affection"],
  ["60","take ... a step further","take one of these harmless daydreams a step further","develop an idea beyond its previous stage","把某种想法再推进一步","这里将想象进一步表现出来"],
  ["60","pathetic","something pathetic","sadly inadequate or ineffective","可怜而无力的、不成样子的","这里指补救的话很无力，不是单纯“可悲的人”"],
  ["60","hang in the air","hung stupidly in the air","remain without response or resolution","话尴尬地悬在那里，无人接应","比喻一句话说出后没有得到回应"],
];

const normalizedPage = (page) => String(page).replace(/–/gu, "-");
const loadSource = async () => JSON.parse(await readFile(sourceUrl, "utf8"));
const chapterEntries = (entries, number) => filterEntriesByCollection(entries, collectionId, "chapter-" + number);

function withoutImportMetadata(entry) {
  const { tags, readingContexts, revision, updatedAt, synonymScan, ...core } = entry;
  return core;
}

async function withFreshImport(run) {
  const current = JSON.parse(await readFile(snapshotUrl, "utf8"));
  // Reconstruct the pre-Chapter-5 membership boundary even after publication.
  // Shared cards retain their old identity/content, not a synthetic new card.
  const prior = {
    ...current,
    entries: current.entries
      .filter((entry) => !entry.id.startsWith("public-nlmg-c5-"))
      .map((entry) => ({
        ...entry,
        tags: entry.tags.filter((tag) => tag !== membership),
        readingContexts: entry.readingContexts.filter((context) => context.membership !== membership)
      }))
  };
  const directory = await mkdtemp(join(tmpdir(), "wordbook-chapter-five-"));
  const snapshotPath = join(directory, "owner-wordbook.json");
  try {
    await writeFile(snapshotPath, JSON.stringify(prior), "utf8");
    const result = await importReadingList({
      sourcePath: fileURLToPath(sourceUrl), snapshotPath, timestamp
    });
    await run({ prior, result, snapshotPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Chapter 5 preserves all 159 approved rows, original forms and pp. 49-60 reading order", async () => {
  const source = await loadSource();
  assert.equal(source.expectedItemCount, 159);
  assert.equal(source.items.length, 159);
  assert.equal(expectedRows.length, 159);
  assert.deepEqual(source.collection, { id: collectionId, title: "Never Let Me Go" });
  assert.deepEqual(source.chapter, { id: chapterId, title: "Chapter 5", number: 5 });
  assert.equal(source.sourceTitle, "Never Let Me Go — Chapter 5");
  assert.equal(new Set(source.items.map((item) => normalizeEnglish(item.term))).size, 159);
  assert.deepEqual(source.items.map((item) => item.order), Array.from({ length: 159 }, (_, index) => index + 1));
  assert.deepEqual(
    source.items.map((item) => [normalizedPage(item.page), item.term, item.originalInput]),
    expectedRows.map((row) => row.slice(0, 3))
  );

  for (const [index, item] of source.items.entries()) {
    const [, term, , definition, meaning, notes] = expectedRows[index];
    // Composite cards need two matched definitions; these two other rows have
    // reviewed sense corrections rather than a verbatim copy of the handoff.
    if (term === "kidnap / abduction") {
      assert.match(item.definitionEn, /kidnap[\s\S]*abduction/iu);
    } else if (term === "explicitly / imply") {
      assert.match(item.definitionEn, /direct[\s\S]*indirect/iu);
    } else if (term === "bend the rules") {
      assert.equal(item.definitionEn, "depart from a rule or apply it less strictly");
    } else {
      assert.equal(item.definitionEn, definition, term + ": preserve supplied English meaning");
    }
    assert.match(item.meaning, /^①\s*\S/u, term + ": numbered Chinese meaning");
    const reviewedMeaning = {
      "be in on": "对密谋知情；参与其中",
      "bend the rules": "变通、不严格遵守规矩；适度放宽规则"
    }[term] || meaning;
    for (const point of reviewedMeaning.split("／")) {
      assert.ok(item.meaning.includes(point), term + ": retain Chinese source meaning " + point);
    }
    assert.ok(item.usage.includes(notes), term + ": retain supplied usage notes");
    assert.match(item.usage, /第五章语境/u, term);
    assert.ok(item.usage.split(/\r?\n/u).filter((line) => line.trim()).length >= 2, term + ": readable usage lines");
    assert.ok(item.partOfSpeech.trim(), term + ": part of speech");
    assert.ok(item.exampleEn.trim() && item.exampleZh.trim(), term + ": bilingual practice example");
    const [start, end = start] = normalizedPage(item.page).split("-").map(Number);
    assert.ok(start >= 49 && end <= 60 && end >= start, term + ": within this chapter");
  }
  assert.equal(normalizedPage(source.items.find((item) => item.term === "stage whisper").page), "56-57");
  assert.deepEqual(
    source.items.filter((item) => item.reuseExistingSameSense).map((item) => item.term).sort(),
    reusedTerms
  );
});

test("Chapter 5 composite rows remain single cards and preserve both meaning points", async () => {
  const source = await loadSource();
  for (const [term, aliases] of [
    ["kidnap / abduction", ["kidnap", "abduction", "abduct"]],
    ["explicitly / imply", ["explicitly", "imply"]]
  ]) {
    const item = source.items.find((candidate) => candidate.term === term);
    assert.ok(item, term);
    assert.equal(meaningItemsForDisplay(item).length, 2, term + ": both Chinese points remain visible");
    assert.match(item.meaning, /②\s*\S/u);
    for (const alias of aliases) {
      assert.equal(source.items.some((candidate) => normalizeEnglish(candidate.term) === alias), false,
        term + ": no extra standalone card for " + alias);
    }
  }
  assert.equal(source.items.find((item) => item.term === "allude").originalInput, "allude darkly");
  const tuck = source.items.find((item) => item.term === "tuck oneself in");
  assert.equal(tuck.originalInput, "tucked ourselves in");
  assert.match(tuck.usage, /tuck oneself/u);
  assert.equal(source.items.some((item) => item.term === "tuck oneself"), false);
  const row = source.items.find((item) => item.term === "have a row");
  assert.match(row.usage, /raʊ/u, "argument reading must not become the pronunciation of a line");
  assert.match(row.usage, /rəʊ/u, "retain the source's pronunciation contrast");
});

test("Chapter 5 adds 155 cards, reuses four identities, and preserves Chapters 1-4 and the main wordbook", async () => {
  await withFreshImport(async ({ prior, result }) => {
    assert.equal(result.changed, true);
    assert.equal(result.chapterEntries.length, 159);
    assert.equal(result.totalChapterEntries, 159);
    assert.equal(result.snapshot.entries.length, prior.entries.length + 155);
    assert.equal(new Set(result.snapshot.entries.map((entry) => entry.normalized)).size, result.snapshot.entries.length);

    const beforeById = new Map(prior.entries.map((entry) => [entry.id, entry]));
    const afterById = new Map(result.snapshot.entries.map((entry) => [entry.id, entry]));
    const shared = result.chapterEntries.filter((entry) => beforeById.has(entry.id));
    assert.deepEqual(shared.map((entry) => entry.term).sort(), reusedTerms);
    for (const before of prior.entries) {
      const after = afterById.get(before.id);
      assert.ok(after, before.term + ": old identity must survive");
      if (!reusedTerms.includes(before.term)) {
        assert.deepEqual(after, before, before.term + ": unrelated card must remain unchanged");
        continue;
      }
      assert.deepEqual(withoutImportMetadata(after), withoutImportMetadata(before), before.term + ": preserve primary lexical content");
      assert.deepEqual(
        after.readingContexts.filter((context) => context.membership !== membership),
        before.readingContexts,
        before.term + ": preserve all original chapter contexts"
      );
      assert.ok(before.tags.every((tag) => after.tags.includes(tag)), before.term + ": old tags survive");
      assert.equal(after.readingContexts.filter((context) => context.membership === membership).length, 1);
      assert.equal(after.revision, before.revision + 1);
    }

    for (const [index, expectedCount] of [29, 38, 28, 51].entries()) {
      const number = index + 1;
      const oldEntries = chapterEntries(prior.entries, number);
      const preservedEntries = chapterEntries(result.snapshot.entries, number);
      assert.equal(preservedEntries.length, expectedCount);
      assert.deepEqual(preservedEntries.map((entry) => entry.id), oldEntries.map((entry) => entry.id));
      for (const before of oldEntries) {
        const previousView = contextualizeReadingEntry(before, collectionId, "chapter-" + number);
        const currentView = contextualizeReadingEntry(afterById.get(before.id), collectionId, "chapter-" + number);
        assert.deepEqual(withoutImportMetadata(currentView), withoutImportMetadata(previousView));
      }
    }
    assert.deepEqual(
      filterEntriesByCollection(result.snapshot.entries, "main"),
      filterEntriesByCollection(prior.entries, "main")
    );

    const newEntries = result.chapterEntries.filter((entry) => !beforeById.has(entry.id));
    assert.equal(newEntries.length, 155);
    for (const entry of newEntries) {
      assert.match(entry.id, /^public-nlmg-c5-/u);
      assert.equal(entry.synonymScan.status, "pending", entry.term);
      assert.equal(entry.synonymScan.reason, "import_pending", entry.term);
      assert.equal(entry.synonymScan.sourceFingerprint, entrySynonymFingerprint(entry), entry.term);
      assert.deepEqual(entry.synonymScan.matches, [], entry.term);
      assert.deepEqual(entry.synonyms, [], entry.term + ": do not invent synonym evidence");
    }
  });
});

test("every Chapter 5 reading view projects its own source, page, meanings and examples", async () => {
  await withFreshImport(async ({ result }) => {
    const byNormalized = new Map(result.chapterEntries.map((entry) => [entry.normalized, entry]));
    for (const item of result.source.items) {
      const entry = byNormalized.get(normalizeEnglish(item.term));
      const view = contextualizeReadingEntry(entry, collectionId, chapterId);
      assert.equal(entry.readingContexts.find((context) => context.membership === membership).order, item.order);
      assert.equal(view.id, entry.id, item.term + ": reading view must retain review identity");
      for (const field of ["originalInput", "entryType", "partOfSpeech", "meaning", "usage", "exampleEn", "exampleZh"]) {
        assert.equal(view[field], item[field], item.term + ": " + field);
      }
      assert.equal(view.definition, item.definitionEn, item.term);
      assert.equal(view.sourceTitle, "Never Let Me Go — Chapter 5");
      assert.equal(view.sourceDate, "p. " + item.page);
      assert.equal(collectionContextForEntry(view, collectionId, chapterId).page, "p. " + item.page);
      assert.deepEqual(view.forms, item.forms);
      assert.ok(publicEntryMatchesQuery(view, item.originalInput), item.term + ": source form remains searchable");
      if (item.senses) {
        assert.deepEqual(view.senses, item.senses, item.term + ": preserve each complete chapter sense");
        assert.notEqual(view.senses, entry.readingContexts.find((context) => context.membership === membership).senses,
          "editing a projected sense must not mutate the stored chapter context");
      } else {
        assert.equal(view.senses[0].meaningZh, item.meaning);
        assert.equal(view.senses[0].usageNotes, item.usage);
        assert.deepEqual(view.senses[0].examples, [{ en: item.exampleEn, zh: item.exampleZh }]);
      }
    }
    for (const [leftTerm, rightTerm] of [["defiant", "surge"], ["utterly", "baffling"]]) {
      const left = byNormalized.get(leftTerm);
      const right = byNormalized.get(rightTerm);
      assert.notEqual(left.id, right.id, "different headwords keep separate cards");
      assert.equal(left.originalInput, right.originalInput, "both cards retain the same verified source fragment");
      const rightKeys = new Set(entryLookupKeys(right));
      assert.deepEqual(entryLookupKeys(left).filter((key) => rightKeys.has(key)), [],
        "shared source fragments are searchable context, not headword aliases");
    }

    const book = buildCollectionCatalog(result.snapshot.entries).find((item) => item.id === collectionId);
    assert.deepEqual(book.chapters.map(({ id, count }) => [id, count]), [
      ["chapter-1", 29], ["chapter-2", 38], ["chapter-3", 28], ["chapter-4", 51], ["chapter-5", 159]
    ]);
  });
});

test("Chapter 5 review queue uses all 159 cards and shared review histories without leaking other chapters", async () => {
  await withFreshImport(async ({ result }) => {
    const now = new Date(timestamp);
    const views = chapterEntries(result.snapshot.entries, 5)
      .map((entry) => contextualizeReadingEntry(entry, collectionId, chapterId));
    assert.deepEqual(views.map((entry) => entry.term), result.source.items.map((item) => item.term),
      "reused early-chapter IDs must not move Chapter 5 cards out of source reading order");
    assert.equal(buildDueQueue(views, [], now).length, 159);
    assert.deepEqual(buildStudySummary(views, [], now), {
      totalEntries: 159, dueCount: 159, newCount: 159,
      dueReviewCount: 0, scheduledCount: 0, reviewedCount: 0
    });

    const shared = views.find((entry) => entry.term === "daft");
    const otherChapter = result.snapshot.entries.find((entry) => entry.term === "agitated");
    assert.ok(shared.id.startsWith("public-nlmg-c1-"));
    const savedReview = applyReviewRating(shared.id, null, "good", now);
    const unrelatedReview = applyReviewRating(otherChapter.id, null, "again", new Date("2026-09-25T18:00:00.000Z"));
    const queue = buildDueQueue(views, [savedReview, unrelatedReview], now);
    assert.equal(queue.length, 158);
    assert.equal(queue.some(({ entry }) => entry.id === shared.id || entry.id === otherChapter.id), false);
    assert.deepEqual(buildStudySummary(views, [savedReview, unrelatedReview], now), {
      totalEntries: 159, dueCount: 158, newCount: 158,
      dueReviewCount: 0, scheduledCount: 1, reviewedCount: 1
    });
    const later = buildDueQueue(views, [savedReview], new Date(savedReview.dueAt));
    const reviewedCard = later.find(({ entry }) => entry.id === shared.id);
    assert.equal(reviewedCard.status, "review");
    assert.deepEqual(reviewedCard.reviewState, savedReview);
    assert.equal(reviewedCard.entry.sourceDate, "p. 54");
  });
});

test("Chapter 5 repeated import is byte-stable and check mode leaves the published snapshot unchanged", async () => {
  await withFreshImport(async ({ result, snapshotPath }) => {
    const written = await readFile(snapshotPath, "utf8");
    const repeated = await importReadingList({
      sourcePath: fileURLToPath(sourceUrl), snapshotPath,
      timestamp: "2026-09-27T18:00:00.000Z"
    });
    assert.equal(repeated.changed, false);
    assert.equal(repeated.totalChapterEntries, 159);
    assert.deepEqual(repeated.snapshot, result.snapshot);
    assert.equal(await readFile(snapshotPath, "utf8"), written);
  });

  const before = await readFile(snapshotUrl, "utf8");
  const canonical = await importReadingList({
    sourcePath: fileURLToPath(sourceUrl), timestamp, checkOnly: true
  });
  assert.equal(canonical.changed, false, "the checked-in Chapter 5 import must already be current");
  assert.equal(canonical.totalChapterEntries, 159);
  assert.deepEqual(canonical.snapshot, JSON.parse(before));
  assert.equal(await readFile(snapshotUrl, "utf8"), before);
});

test("all 159 Chapter 5 canonical and reading cards pass the unchanged lexical publish gate", async () => {
  const snapshot = parsePublicSnapshot(JSON.parse(await readFile(snapshotUrl, "utf8")), { allowLegacy: false });
  const cards = chapterEntries(snapshot.entries, 5);
  assert.equal(cards.length, 159);
  const failures = [];
  for (const card of cards) {
    for (const [label, view] of [
      ["canonical", card],
      ["Chapter 5", contextualizeReadingEntry(card, collectionId, chapterId)]
    ]) {
      const before = structuredClone(view);
      try {
        const publishable = reconcileLexicalEntryForPublish(view);
        assert.equal(publishable.senses.length, view.senses.length);
        assert.deepEqual(view, before, "publish validation must not mutate the displayed card");
      } catch (error) {
        failures.push(card.term + " (" + label + "): " + error.message);
      }
    }
  }
  assert.deepEqual(failures, []);

  for (const [term, positions] of [
    ["kidnap / abduction", ["verb", "noun"]],
    ["explicitly / imply", ["adverb", "verb"]]
  ]) {
    const card = cards.find((entry) => entry.term === term);
    const context = card.readingContexts.find((item) => item.membership === membership);
    assert.deepEqual(card.senses.map((sense) => sense.partOfSpeech), positions);
    assert.deepEqual(context.senses, card.senses);
    const projected = contextualizeReadingEntry(card, collectionId, chapterId);
    assert.deepEqual(projected.senses, context.senses);
    assert.equal(meaningItemsForDisplay(projected).length, 2);
    for (const sense of projected.senses) {
      assert.ok(sense.definitionEn.trim());
      assert.ok(sense.examples.length && sense.examples.every(({ en, zh }) => en.trim() && zh.trim()));
    }
    const incomplete = { ...projected, senses: [projected.senses[0]] };
    assert.throws(() => reconcileLexicalEntryForPublish(incomplete), /单义项/u,
      "two numbered meanings cannot bypass the requirement for two complete senses");
  }
});
